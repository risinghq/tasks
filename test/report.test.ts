import { describe, expect, it } from "vitest";
import type { ReportLink } from "../src/shared/model";
import { admin, idOf, joined, MEMBER, member, send, setNow } from "./helpers";

const FRIDAY = "2026-10-16T17:00:00Z";

async function seeded() {
  setNow(FRIDAY);
  const me = await admin();
  const development = await me.addLabel("Desarrollo", "green");
  const courses = await me.addLabel("Cursos", "purple");
  const shipped = await me.add("Publicar la API", "hecho");
  await me.edit(shipped.id, {
    labelId: development.id,
    requester: "Augusto",
    description: "Primera línea\nSegunda línea",
    doneDate: "2026-10-15",
  });
  const course = await me.add("Curso de SQL", "hecho");
  await me.edit(course.id, { labelId: courses.id });
  await me.add("Sin etiqueta alguna", "hecho");
  const lastWeek = await me.add("Tarea de la semana pasada", "hecho");
  await me.edit(lastWeek.id, { doneDate: "2026-10-09" });
  const marcha = await me.add("Trabajo en marcha", "en_curso");
  await me.edit(marcha.id, {
    labelId: development.id,
    requester: "Luis",
    checklist: [
      { text: "Paso uno", done: true },
      { text: "Paso dos", done: false },
      { text: "Paso tres", done: false },
    ],
  });
  await me.add("Todavía pendiente", "pendiente");
  await me.add("Planeado para la semana", "esta_semana");
  return { me, development, token: await me.wholeReportToken() };
}

const report = (token: string, query = "") => send(`/r/${token}${query}`);

describe("weekly report", () => {
  it("opens without a session and tells crawlers to stay away", async () => {
    const { token } = await seeded();
    const res = await report(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain('name="robots" content="noindex');
  });

  it("names the owner, the week and a button that copies the link", async () => {
    const { token } = await seeded();
    const html = await (await report(token)).text();

    expect(html).toContain(">Ana Prueba<");
    expect(html).toContain("Informe semanal de Ana Prueba");
    expect(html).toContain("Copiar enlace");
    expect(html).toContain(`tasks.test/r/${token}`);
    expect(html).toContain("Semana 42 · 12 – 18 oct 2026");
    expect(html).toContain("← Semana 41");
  });

  it("unfurls as the report card, under the link without its week", async () => {
    const { token } = await seeded();
    const html = await (await report(token)).text();

    expect(html).toContain(`property="og:url" content="https://tasks.test/r/${token}"`);
    expect(html).toContain('property="og:image" content="https://tasks.test/og/report.png"');
    expect(html).toContain('property="og:description" content="Informe semanal de Ana Prueba:');
  });

  it("shows what was done, grouped by day, newest first", async () => {
    const { token } = await seeded();
    const html = await (await report(token)).text();

    expect(html).toContain(">Hecho<");
    expect(html).toContain(">Ayer, jueves 15 oct<");
    expect(html).toContain(">Hoy, viernes 16 oct<");
    expect(html.indexOf(">Hoy,")).toBeLessThan(html.indexOf(">Ayer,"));
    expect(html).toContain("Publicar la API");
    expect(html).toContain("Primera línea");
    expect(html).not.toContain("Segunda línea");
    expect(html).toContain("Desarrollo");
    expect(html).toContain("Cursos");
    expect(html).not.toContain("Tarea de la semana pasada");
    expect(html).not.toContain("tareas hechas esta semana");
    expect(html).not.toContain('class="stats"');
  });

  it("shows what is in progress with its checklist and what is next", async () => {
    const { token } = await seeded();
    const html = await (await report(token)).text();

    expect(html).toContain(">En curso<");
    expect(html).toContain("Trabajo en marcha");
    expect(html).toContain("Luis");
    expect(html).toContain("1 de 3");
    expect(html).toContain(">Siguiente<");
    expect(html).toContain("Planeado para la semana");
    expect(html).not.toContain("Todavía pendiente");
  });

  it("says so in one line when the week has nothing done", async () => {
    const { token } = await seeded();
    const html = await (await report(token, "?semana=2026-W40")).text();
    expect(html).toContain("Nada hecho esta semana.");
    expect(html).not.toContain("Trabajo en marcha");
    expect(html).not.toContain(">Siguiente<");
  });

  it("shows the current state only on the current week", async () => {
    const { token } = await seeded();
    const previous = await (await report(token, "?semana=2026-W41")).text();

    expect(previous).toContain("5 – 11 oct 2026");
    expect(previous).toContain("Tarea de la semana pasada");
    expect(previous).not.toContain("Trabajo en marcha");
    expect(previous).not.toContain(">Siguiente<");
  });

  it("links to the previous and next week", async () => {
    const { token } = await seeded();
    const current = await (await report(token)).text();
    expect(current).toContain(`/r/${token}?semana=2026-W41`);
    expect(current).not.toContain(`?semana=2026-W43`);

    const previous = await (await report(token, "?semana=2026-W41")).text();
    expect(previous).toContain(`/r/${token}?semana=2026-W42`);
    expect(previous).toContain(`/r/${token}?semana=2026-W40`);
  });

  it("falls back to the current week on a bad week", async () => {
    const { token } = await seeded();
    const html = await (await report(token, "?semana=basura")).text();
    expect(html).toContain("12 – 18 oct 2026");
  });

  it("answers 404 for an unknown token", async () => {
    await seeded();
    const res = await report("not-the-token");
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("shows each workspace only its own cards", async () => {
    const { token } = await seeded();
    const beto = await member();
    await beto.add("Tarea de Beto", "en_curso");
    const done = await beto.add("Terminada por Beto", "hecho");
    await beto.edit(done.id, { description: "solo de Beto" });

    const mine = await (await report(token)).text();
    expect(mine).not.toContain("Beto");

    const theirs = await (await report(await beto.wholeReportToken())).text();
    expect(theirs).toContain("Terminada por Beto");
    expect(theirs).toContain("Tarea de Beto");
    expect(theirs).not.toContain("Publicar la API");
    expect(theirs).not.toContain("Desarrollo");
  });
});

describe("a label link", () => {
  it("shows only its label's cards and does not repeat the label", async () => {
    const { me, development } = await seeded();
    const link = await me.call<ReportLink>("/api/report-links", "POST", { labelId: development.id });
    const html = await (await report(link.token)).text();

    expect(html).toContain(">Desarrollo</h1>");
    expect(html).toContain("Publicar la API");
    expect(html).toContain("Trabajo en marcha");
    expect(html).not.toContain("Curso de SQL");
    expect(html).not.toContain("Sin etiqueta alguna");
    expect(html).not.toContain("Cursos");
    expect(html).not.toContain("tag-name");
  });

  it("stops working when the link or the label is deleted", async () => {
    const { me, development } = await seeded();
    const link = await me.call<ReportLink>("/api/report-links", "POST", { labelId: development.id });
    expect((await report(link.token)).status).toBe(200);
    await me.call(`/api/report-links/${link.id}`, "DELETE");
    expect((await report(link.token)).status).toBe(404);

    const again = await me.call<ReportLink>("/api/report-links", "POST", { labelId: development.id });
    expect((await report(again.token)).status).toBe(200);
    await me.call(`/api/labels/${development.id}`, "DELETE");
    expect((await report(again.token)).status).toBe(404);
  });
});

describe("a member link", () => {
  it("shows only the cards assigned to that member, under their name", async () => {
    const { me } = await seeded();
    const beto = await joined(me);
    const betoId = await idOf(me, MEMBER.email);
    const theirs = await beto.add("Lo que hizo Beto", "hecho");
    await me.edit(theirs.id, { assigneeId: betoId });
    const link = await me.call<ReportLink>("/api/report-links", "POST", { memberId: betoId });
    expect(link.member).toEqual({ id: betoId, name: MEMBER.name });

    const html = await (await report(link.token)).text();
    expect(html).toContain(">Beto Prueba</h1>");
    expect(html).toContain("Informe semanal · Ana Prueba");
    expect(html).toContain("Lo que hizo Beto");
    expect(html).not.toContain("Publicar la API");
    expect(html).not.toContain("Trabajo en marcha");
  });

  it("stops working when the member leaves, and their cards lose the assignee", async () => {
    const { me } = await seeded();
    await joined(me);
    const betoId = await idOf(me, MEMBER.email);
    const card = await me.add("Asignada a Beto", "en_curso");
    await me.edit(card.id, { assigneeId: betoId });
    const link = await me.call<ReportLink>("/api/report-links", "POST", { memberId: betoId });

    await me.call(`/api/members/${betoId}`, "DELETE");
    expect((await report(link.token)).status).toBe(404);
    expect((await me.board()).cards.find((c) => c.id === card.id)?.assigneeId).toBeNull();
  });

  it("answers 404 for someone outside the workspace", async () => {
    const { me } = await seeded();
    const stranger = await member();
    const strangerId = (await stranger.me()).id;
    expect(await me.status("/api/report-links", "POST", { memberId: strangerId })).toBe(404);
  });
});

describe("assignee", () => {
  it("lists the members on the board and accepts only one of them", async () => {
    const { me } = await seeded();
    await joined(me);
    const betoId = await idOf(me, MEMBER.email);
    const board = await me.board();
    expect(board.members.map((m) => m.name)).toEqual(["Ana Prueba", "Beto Prueba"]);

    const card = await me.add("Para Beto", "pendiente");
    expect((await me.edit(card.id, { assigneeId: betoId })).assigneeId).toBe(betoId);
    expect((await me.edit(card.id, { assigneeId: null })).assigneeId).toBeNull();

    const stranger = await member({ email: "carla@example.com", name: "Carla Prueba" });
    const strangerId = (await stranger.me()).id;
    expect(await me.status(`/api/cards/${card.id}`, "PATCH", { assigneeId: strangerId })).toBe(400);
  });
});

describe("report links", () => {
  it("lists the whole-workspace link first, then each scoped link", async () => {
    const { me, development, token } = await seeded();
    await joined(me);
    const betoId = await idOf(me, MEMBER.email);
    const byLabel = await me.call<ReportLink>("/api/report-links", "POST", { labelId: development.id });
    const byMember = await me.call<ReportLink>("/api/report-links", "POST", { memberId: betoId });

    const links = await me.reportLinks();
    expect(links[0]).toMatchObject({ token, label: null, member: null });
    const byId = new Map(links.map((l) => [l.id, l]));
    expect(links).toHaveLength(3);
    expect(byId.get(byLabel.id)?.label?.name).toBe("Desarrollo");
    expect(byId.get(byMember.id)?.member?.name).toBe("Beto Prueba");
  });

  it("keeps one whole-workspace link, even when two tabs list at once", async () => {
    const { me } = await seeded();
    await Promise.all([me.reportLinks(), me.reportLinks()]);
    const wholes = (await me.reportLinks()).filter((l) => !l.label && !l.member);
    expect(wholes).toHaveLength(1);
  });

  it("refuses to delete the whole-workspace link", async () => {
    const { me } = await seeded();
    const [whole] = await me.reportLinks();
    expect(await me.status(`/api/report-links/${whole!.id}`, "DELETE")).toBe(409);
    expect((await report(whole!.token)).status).toBe(200);
  });

  it("asks for exactly one scope", async () => {
    const { me, development } = await seeded();
    const betoId = (await me.me()).id;
    expect(await me.status("/api/report-links", "POST", {})).toBe(400);
    expect(await me.status("/api/report-links", "POST", { labelId: development.id, memberId: betoId })).toBe(
      400,
    );
  });

  it("allows only one link per label", async () => {
    const { me, development } = await seeded();
    await me.call("/api/report-links", "POST", { labelId: development.id });
    expect(await me.status("/api/report-links", "POST", { labelId: development.id })).toBe(409);
  });

  it("answers 404 for a label of another workspace", async () => {
    const { me } = await seeded();
    const beto = await member();
    const foreign = await beto.addLabel("De Beto");
    expect(await me.status("/api/report-links", "POST", { labelId: foreign.id })).toBe(404);
  });

  it("regenerates a link's token", async () => {
    const { me, development } = await seeded();
    const link = await me.call<ReportLink>("/api/report-links", "POST", { labelId: development.id });
    const fresh = await me.call<ReportLink>(`/api/report-links/${link.id}/token`, "POST");
    expect(fresh.id).toBe(link.id);
    expect(fresh.token).not.toBe(link.token);
    expect((await report(link.token)).status).toBe(404);
    expect((await report(fresh.token)).status).toBe(200);
  });

  it("answers 404 for links of another workspace", async () => {
    const { me } = await seeded();
    const beto = await member();
    const [foreign] = await beto.reportLinks();
    expect(await me.status(`/api/report-links/${foreign!.id}/token`, "POST")).toBe(404);
    expect(await me.status(`/api/report-links/${foreign!.id}`, "DELETE")).toBe(404);
  });

  it("lets every member list, and only an owner create, regenerate or delete", async () => {
    const { me, development } = await seeded();
    const beto = await joined(me);
    expect((await beto.reportLinks()).length).toBeGreaterThan(0);
    expect(await beto.status("/api/report-links", "POST", { labelId: development.id })).toBe(403);

    const link = await me.call<ReportLink>("/api/report-links", "POST", { labelId: development.id });
    expect(await beto.status(`/api/report-links/${link.id}/token`, "POST")).toBe(403);
    expect(await beto.status(`/api/report-links/${link.id}`, "DELETE")).toBe(403);
  });

  it("needs a session", async () => {
    await seeded();
    expect((await send("/api/report-links")).status).toBe(401);
    expect((await send("/api/report-links", { method: "POST", json: {} })).status).toBe(401);
  });
});

describe("the whole-workspace token", () => {
  it("is long and stable until regenerated", async () => {
    const { me, token } = await seeded();
    expect(token.length).toBeGreaterThanOrEqual(43); // 256 bits in base64url
    expect(await me.wholeReportToken()).toBe(token);
  });

  it("keeps exactly one working link when two tabs regenerate at once", async () => {
    const { me, token } = await seeded();
    const [whole] = await me.reportLinks();
    const regenerate = () => me.call<ReportLink>(`/api/report-links/${whole!.id}/token`, "POST");
    const tokens = (await Promise.all([regenerate(), regenerate()])).map((l) => l.token);
    const statuses = await Promise.all([token, ...tokens].map(async (t) => (await report(t)).status));
    expect(statuses.toSorted()).toEqual([200, 404, 404]);
    expect(tokens).toContain(await me.wholeReportToken());
  });
});
