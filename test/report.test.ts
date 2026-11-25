import { describe, expect, it } from "vitest";
import type { ReportLink } from "../src/shared/model";
import { admin, joined, member, send, setNow } from "./helpers";

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
  const { reportToken } = await me.workspaceSettings();
  return { me, development, token: reportToken };
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

    const theirs = await (await report((await beto.workspaceSettings()).reportToken)).text();
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

describe("report links", () => {
  it("lists each link with its scope", async () => {
    const { me, development } = await seeded();
    const whole = await me.call<ReportLink>("/api/report-links", "POST", {});
    const scoped = await me.call<ReportLink>("/api/report-links", "POST", { labelId: development.id });

    const links = await me.call<ReportLink[]>("/api/report-links");
    const byId = new Map(links.map((l) => [l.id, l]));
    expect(byId.get(whole.id)?.label).toBeNull();
    expect(byId.get(whole.id)?.token).toBe(whole.token);
    expect(byId.get(scoped.id)?.label?.name).toBe("Desarrollo");
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
    const links = await beto.call<ReportLink[]>("/api/report-links");
    expect(await beto.call<ReportLink>("/api/report-links", "POST", {})).toBeTruthy();
    const foreign = links[0] ?? (await beto.call<ReportLink[]>("/api/report-links"))[0]!;
    expect(await me.status(`/api/report-links/${foreign.id}/token`, "POST")).toBe(404);
    expect(await me.status(`/api/report-links/${foreign.id}`, "DELETE")).toBe(404);
  });

  it("needs the owner role to create, regenerate or delete", async () => {
    const { me, development } = await seeded();
    const beto = await joined(me);
    expect((await beto.call<ReportLink[]>("/api/report-links")).length).toBeGreaterThan(0);
    expect(await beto.status("/api/report-links", "POST", { labelId: development.id })).toBe(403);
    expect(await beto.status("/api/report-links", "POST", {})).toBe(403);

    const link = await me.call<ReportLink>("/api/report-links", "POST", {});
    expect(await beto.status(`/api/report-links/${link.id}/token`, "POST")).toBe(403);
    expect(await beto.status(`/api/report-links/${link.id}`, "DELETE")).toBe(403);
  });

  it("needs a session", async () => {
    await seeded();
    expect((await send("/api/report-links")).status).toBe(401);
    expect((await send("/api/report-links", { method: "POST", json: {} })).status).toBe(401);
  });
});

describe("report token", () => {
  it("is long, random and stable until regenerated", async () => {
    const { me, token } = await seeded();
    expect(token.length).toBeGreaterThanOrEqual(43); // 256 bits in base64url
    expect((await me.workspaceSettings()).reportToken).toBe(token);
    const links = await me.call<ReportLink[]>("/api/report-links");
    expect(links.filter((l) => l.label === null).map((l) => l.token)).toContain(token);
  });

  it("regenerating kills the old link and opens the new one", async () => {
    const { me, token } = await seeded();
    const fresh = await me.call<{ reportToken: string }>("/api/workspace/report-token", "POST");
    expect(fresh.reportToken).not.toBe(token);
    expect((await report(token)).status).toBe(404);
    expect((await report(fresh.reportToken)).status).toBe(200);
    expect((await me.workspaceSettings()).reportToken).toBe(fresh.reportToken);
  });

  it("keeps exactly one working link when two tabs regenerate at once", async () => {
    const { me } = await seeded();
    const regenerate = () => me.call<{ reportToken: string }>("/api/workspace/report-token", "POST");
    const tokens = (await Promise.all([regenerate(), regenerate()])).map((s) => s.reportToken);
    const statuses = await Promise.all(tokens.map(async (t) => (await report(t)).status));
    expect(statuses.toSorted()).toEqual([200, 404]);
    expect(tokens).toContain((await me.workspaceSettings()).reportToken);
  });

  it("needs a session to read or regenerate", async () => {
    await seeded();
    expect((await send("/api/workspace")).status).toBe(401);
    expect((await send("/api/workspace/report-token", { method: "POST" })).status).toBe(401);
  });
});
