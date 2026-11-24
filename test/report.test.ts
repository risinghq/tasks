import { describe, expect, it } from "vitest";
import { admin, member, send, setNow } from "./helpers";

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
  return { me, token: reportToken };
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

  it("names the workspace and the week, with a button that copies the link", async () => {
    const { token } = await seeded();
    const html = await (await report(token)).text();

    expect(html).toContain(">P<");
    expect(html).toContain(">Personal<");
    expect(html).toContain("Informe semanal");
    expect(html).toContain("Copiar enlace");
    expect(html).toContain(`tasks.test/r/${token}`);
    expect(html).toContain("Semana 42 · 12 – 18 oct 2026");
  });

  it("sums the week's totals and what passes to the next one", async () => {
    const { token } = await seeded();
    const html = await (await report(token)).text();

    expect(html).toContain("3 tareas hechas esta semana.");
    expect(html).toMatch(/num accent">3</);
    expect(html).toMatch(/num">1</);
    expect(html).toMatch(/num">2</);
    expect(html).toContain("Hechas");
    expect(html).toContain("En curso");
    expect(html).toContain("Pasan a la próxima semana");
  });

  it("groups finished and in-progress cards under their label", async () => {
    const { token } = await seeded();
    const html = await (await report(token)).text();

    expect(html).toContain("Desarrollo");
    expect(html).toContain("Cursos");
    expect(html).toContain("Sin etiqueta");
    expect(html.indexOf(">Cursos<")).toBeLessThan(html.indexOf(">Desarrollo<"));
    expect(html.indexOf(">Desarrollo<")).toBeLessThan(html.indexOf(">Sin etiqueta<"));
    expect(html).toContain("1 hecha · 1 en curso");
    expect(html).toMatch(/Cursos[^]*1 hecha/);

    expect(html).toContain("Publicar la API");
    expect(html).toContain("Ayer");
    expect(html).toContain("Hoy");
    expect(html).toContain("Trabajo en marcha");
    expect(html).toContain("En curso");
    expect(html).toContain("Luis");
    expect(html).toContain("1 de 3");
    expect(html).not.toContain("Tarea de la semana pasada");
    expect(html).not.toContain("Todavía pendiente");
  });

  it("lists the cards that pass to the next week with their list", async () => {
    const { token } = await seeded();
    const html = await (await report(token)).text();

    expect(html).toContain("Pasa a la próxima semana");
    const carry = html.slice(html.indexOf("Pasa a la próxima semana"));
    expect(carry).toContain("Planeado para la semana");
    expect(carry).toContain("Esta semana");
    expect(carry).toContain("Trabajo en marcha");
    expect(carry).not.toContain("Todavía pendiente");
  });

  it("shows the current state only on the current week", async () => {
    const { token } = await seeded();
    const previous = await (await report(token, "?semana=2026-W41")).text();

    expect(previous).toContain("5 – 11 oct 2026");
    expect(previous).toContain("1 tarea hecha esa semana.");
    expect(previous).toContain("Tarea de la semana pasada");
    expect(previous).not.toContain("Trabajo en marcha");
    expect(previous).not.toContain("Pasan a la próxima semana");
    expect(previous).not.toContain("Pasa a la próxima semana");
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

describe("report token", () => {
  it("is long, random and stable until regenerated", async () => {
    const { me, token } = await seeded();
    expect(token.length).toBeGreaterThanOrEqual(43); // 256 bits in base64url
    expect((await me.workspaceSettings()).reportToken).toBe(token);
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
