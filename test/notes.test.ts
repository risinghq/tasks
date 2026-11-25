import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { NOTE_FILE_MAX, type Note } from "../src/shared/model";
import { admin, joined, member, send } from "./helpers";

const png = (name = "captura.png") =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], name, { type: "image/png" });

async function keysUnder(prefix: string): Promise<string[]> {
  return (await env.FILES.list({ prefix })).objects.map((object) => object.key);
}

describe("notes", () => {
  it("keeps a card's notes in the order they came, with their author", async () => {
    const me = await admin();
    const card = await me.add("Contrato", "en_curso");
    await me.addNote(card.id, "Llamó Rosa: Av. Larco 123, piso 4");
    await me.addNote(card.id, "Confirmar el jueves");
    const notes = await me.notes(card.id);
    expect(notes.map((note) => note.text)).toEqual([
      "Llamó Rosa: Av. Larco 123, piso 4",
      "Confirmar el jueves",
    ]);
    expect(notes[0]!.author?.name).toBe("Ana Prueba");
    expect(notes[0]!.file).toBeNull();
  });

  it("counts a card's notes on the board", async () => {
    const me = await admin();
    const card = await me.add("Contrato", "en_curso");
    expect(card.noteCount).toBe(0);
    await me.addNote(card.id, "uno");
    await me.addNote(card.id, "dos");
    expect((await me.board()).cards.find((c) => c.id === card.id)!.noteCount).toBe(2);
  });

  it("edits and deletes a note", async () => {
    const me = await admin();
    const card = await me.add("Contrato", "en_curso");
    const note = await me.addNote(card.id, "borrador");
    expect((await me.call<Note>(`/api/notes/${note.id}`, "PATCH", { text: "final" })).text).toBe("final");
    expect(await me.status(`/api/notes/${note.id}`, "PATCH", { text: "" })).toBe(400);
    expect(await me.status(`/api/notes/${note.id}`, "DELETE")).toBe(204);
    expect(await me.notes(card.id)).toEqual([]);
    expect(await me.status(`/api/notes/${note.id}`, "DELETE")).toBe(404);
  });

  it("refuses an empty note", async () => {
    const me = await admin();
    const card = await me.add("Contrato", "en_curso");
    expect(await me.status(`/api/cards/${card.id}/notes`, "POST", { text: "   " })).toBe(400);
  });

  it("keeps notes inside their workspace", async () => {
    const me = await admin();
    const other = await member();
    const card = await me.add("Contrato", "en_curso");
    const note = await me.addNote(card.id, "privado");
    expect(await other.status(`/api/cards/${card.id}/notes`)).toBe(404);
    expect(await other.status(`/api/cards/${card.id}/notes`, "POST", { text: "x" })).toBe(404);
    expect(await other.status(`/api/notes/${note.id}`, "PATCH", { text: "x" })).toBe(404);
    expect(await other.status(`/api/notes/${note.id}`, "DELETE")).toBe(404);
  });

  it("lets every member of the workspace add notes", async () => {
    const owner = await admin();
    const card = await owner.add("Contrato", "en_curso");
    const teammate = await joined(owner);
    const note = await teammate.addNote(card.id, "Pasé por la oficina");
    expect(note.author?.name).toBe("Beto Prueba");
    expect((await owner.notes(card.id)).map((n) => n.text)).toEqual(["Pasé por la oficina"]);
  });
});

describe("note files", () => {
  it("stores an upload and serves it to members only", async () => {
    const owner = await admin();
    const card = await owner.add("Contrato", "en_curso");
    const res = await owner.upload(card.id, png(), "La dirección");
    expect(res.status).toBe(201);
    const note = (await res.json()) as Note;
    expect(note.text).toBe("La dirección");
    expect(note.file).toEqual({
      name: "captura.png",
      type: "image/png",
      size: 7,
      url: `/api/files/${note.id}`,
    });

    const served = await send(note.file!.url, { cookie: owner.cookie });
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(served.headers.get("Content-Disposition")).toBe("inline; filename*=UTF-8''captura.png");
    expect(served.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
    );

    // A teammate reads it without naming the workspace: an <img> sends no header.
    const teammate = await joined(owner);
    expect((await send(note.file!.url, { cookie: teammate.cookie })).status).toBe(200);

    const stranger = await member({ email: "carla@example.com", name: "Carla" });
    expect((await send(note.file!.url, { cookie: stranger.cookie })).status).toBe(404);
    expect((await send(note.file!.url)).status).toBe(401);
  });

  it("downloads a type that could run script instead of showing it", async () => {
    const me = await admin();
    const card = await me.add("Contrato", "en_curso");
    const page = new File(["<script>alert(1)</script>"], "x.html", { type: "text/html" });
    const note = (await (await me.upload(card.id, page)).json()) as Note;
    const served = await send(note.file!.url, { cookie: me.cookie });
    expect(served.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(served.headers.get("Content-Disposition")).toBe("attachment; filename*=UTF-8''x.html");
    expect(served.headers.get("Content-Security-Policy")).toBe("sandbox");
  });

  it("refuses a file over the limit and an upload with no file", async () => {
    const me = await admin();
    const card = await me.add("Contrato", "en_curso");
    const big = new File([new Uint8Array(NOTE_FILE_MAX + 1)], "grande.bin");
    expect((await me.upload(card.id, big)).status).toBe(413);
    const empty = await send(`/api/cards/${card.id}/notes/files`, {
      method: "POST",
      multipart: new FormData(),
      cookie: me.cookie,
    });
    expect(empty.status).toBe(400);
  });

  it("keeps the text of a file note editable down to empty", async () => {
    const me = await admin();
    const card = await me.add("Contrato", "en_curso");
    const note = (await (await me.upload(card.id, png(), "pie")).json()) as Note;
    expect((await me.call<Note>(`/api/notes/${note.id}`, "PATCH", { text: "" })).text).toBe("");
  });

  it("deletes the file with its note, its card and its workspace", async () => {
    const me = await admin();
    const workspace = await me.createWorkspace("Cliente");
    const there = me.in(workspace.id);
    const [a, b, c] = await Promise.all([
      there.add("Uno", "en_curso"),
      there.add("Dos", "en_curso"),
      there.add("Tres", "en_curso"),
    ]);
    const noteA = (await (await there.upload(a.id, png())).json()) as Note;
    await there.upload(b.id, png());
    await there.upload(c.id, png());
    expect(await keysUnder(`${workspace.id}/`)).toHaveLength(3);

    await there.call(`/api/notes/${noteA.id}`, "DELETE");
    expect(await keysUnder(`${workspace.id}/${a.id}/`)).toEqual([]);

    await there.call(`/api/cards/${b.id}`, "DELETE");
    expect(await keysUnder(`${workspace.id}/${b.id}/`)).toEqual([]);
    expect(await keysUnder(`${workspace.id}/`)).toHaveLength(1);

    await there.call("/api/workspace", "DELETE");
    expect(await keysUnder(`${workspace.id}/`)).toEqual([]);
  });
});

describe("the report", () => {
  it("never shows a note", async () => {
    const me = await admin();
    const card = await me.add("Contrato", "en_curso");
    await me.addNote(card.id, "Av. Larco 123, solo para mí");
    const page = await (await send(`/r/${await me.wholeReportToken()}`)).text();
    expect(page).toContain("Contrato");
    expect(page).not.toContain("Larco");
  });
});
