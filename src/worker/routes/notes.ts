import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { NOTE_FILE_MAX, NOTE_TEXT_MAX } from "../../shared/model";
import { createNoteSchema, updateNoteSchema } from "../../shared/schemas";
import { cardsOf } from "../cards";
import { connect } from "../db/client";
import { deleteFile, fileKey, putFile, serveFile } from "../files";
import { EmptyNote, noteFile, notesOf } from "../notes";
import type { AppEnv } from "../session";
import { membership } from "../workspaces";

/** A card's log, behind `/api`. Every member of the workspace reads and writes it. */
export const noteRoutes = new Hono<AppEnv>();

noteRoutes.get("/cards/:id/notes", async (c) => {
  const db = connect(c.env);
  const workspaceId = c.get("workspace").id;
  const card = await cardsOf(db, workspaceId).get(c.req.param("id"));
  if (!card) return c.json({ error: "not found" }, 404);
  return c.json(await notesOf(db, workspaceId).ofCard(card.id));
});

noteRoutes.post("/cards/:id/notes", zValidator("json", createNoteSchema), async (c) => {
  const db = connect(c.env);
  const workspaceId = c.get("workspace").id;
  const card = await cardsOf(db, workspaceId).get(c.req.param("id"));
  if (!card) return c.json({ error: "not found" }, 404);
  const note = await notesOf(db, workspaceId).create({
    id: crypto.randomUUID(),
    cardId: card.id,
    authorId: c.get("user").id,
    text: c.req.valid("json").text,
  });
  return c.json(note, 201);
});

/** Shortens a client's file name to something a header and a list can hold. */
function cleanName(name: string): string {
  // oxlint-disable-next-line no-control-regex
  const clean = name.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim();
  return clean.slice(-200) || "archivo";
}

/** A multipart upload: `file`, and an optional `text` that goes with it. */
noteRoutes.post(
  "/cards/:id/notes/files",
  bodyLimit({
    maxSize: NOTE_FILE_MAX + NOTE_TEXT_MAX * 4 + 64 * 1024,
    onError: (c) => c.json({ error: "file too large" }, 413),
  }),
  async (c) => {
    const db = connect(c.env);
    const workspaceId = c.get("workspace").id;
    const card = await cardsOf(db, workspaceId).get(c.req.param("id"));
    if (!card) return c.json({ error: "not found" }, 404);
    const form = await c.req.formData();
    const file = form.get("file");
    const text = form.get("text") ?? "";
    if (!(file instanceof File) || file.size === 0) return c.json({ error: "file is required" }, 400);
    if (file.size > NOTE_FILE_MAX) return c.json({ error: "file too large" }, 413);
    if (typeof text !== "string" || text.length > NOTE_TEXT_MAX)
      return c.json({ error: "text too long" }, 400);

    const id = crypto.randomUUID();
    const key = fileKey(workspaceId, card.id, id);
    await putFile(c.env.FILES, key, file);
    try {
      const note = await notesOf(db, workspaceId).create({
        id,
        cardId: card.id,
        authorId: c.get("user").id,
        text: text.trim(),
        file: { name: cleanName(file.name), type: file.type, size: file.size },
      });
      return c.json(note, 201);
    } catch (error) {
      // The card went away between the check and the insert.
      await deleteFile(c.env.FILES, key);
      throw error;
    }
  },
);

noteRoutes.patch("/notes/:id", zValidator("json", updateNoteSchema), async (c) => {
  const db = connect(c.env);
  const notes = notesOf(db, c.get("workspace").id);
  const note = await notes.get(c.req.param("id"));
  if (!note) return c.json({ error: "not found" }, 404);
  try {
    return c.json(await notes.update(note, c.req.valid("json").text));
  } catch (error) {
    if (error instanceof EmptyNote) return c.json({ error: "a note without a file needs text" }, 400);
    throw error;
  }
});

noteRoutes.delete("/notes/:id", async (c) => {
  const db = connect(c.env);
  const workspaceId = c.get("workspace").id;
  const notes = notesOf(db, workspaceId);
  const note = await notes.get(c.req.param("id"));
  if (!note) return c.json({ error: "not found" }, 404);
  await notes.delete(note);
  if (note.file) await deleteFile(c.env.FILES, fileKey(workspaceId, note.cardId, note.id));
  return c.body(null, 204);
});

/**
 * A note's file, behind `/api/files`. It is mounted before the workspace
 * check: an `<img>` cannot send the workspace header, so the route finds the
 * workspace from the note and checks membership itself. Anyone else gets 404.
 */
export const fileRoutes = new Hono<AppEnv>();

fileRoutes.get("/:noteId", async (c) => {
  const db = connect(c.env);
  const stored = await noteFile(db, c.req.param("noteId"));
  if (!stored || !(await membership(db, stored.workspaceId, c.get("user").id))) {
    return c.json({ error: "not found" }, 404);
  }
  const key = fileKey(stored.workspaceId, stored.cardId, c.req.param("noteId"));
  const response = await serveFile(c.env.FILES, key, stored);
  return response ?? c.json({ error: "not found" }, 404);
});
