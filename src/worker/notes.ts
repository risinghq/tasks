import { and, asc, eq, sql } from "drizzle-orm";
import type { Note } from "../shared/model";
import type { Db } from "./db/client";
import { cards, notes, users } from "./db/schema";

/** A note's stored file, as the file route needs it. */
export type StoredFile = { cardId: string; name: string; type: string };

/** The text is empty and the note holds no file, so nothing would be left. */
export class EmptyNote extends Error {}

type NewNote = {
  id: string;
  cardId: string;
  authorId: string;
  text: string;
  file?: { name: string; type: string; size: number };
};

const noteColumns = {
  id: notes.id,
  cardId: notes.cardId,
  authorId: notes.authorId,
  authorName: users.name,
  createdAt: notes.createdAt,
  text: notes.text,
  fileName: notes.fileName,
  fileType: notes.fileType,
  fileSize: notes.fileSize,
};

type NoteRow = {
  id: string;
  cardId: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: number;
  text: string;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
};

export const fileUrl = (noteId: string): string => `/api/files/${noteId}`;

function noteOf(row: NoteRow): Note {
  return {
    id: row.id,
    cardId: row.cardId,
    author: row.authorId ? { id: row.authorId, name: row.authorName ?? "" } : null,
    createdAt: row.createdAt,
    text: row.text,
    file:
      row.fileName === null
        ? null
        : { name: row.fileName, type: row.fileType ?? "", size: row.fileSize ?? 0, url: fileUrl(row.id) },
  };
}

/**
 * Every read and write of notes, for one workspace. A note belongs to the
 * workspace of its card, so every statement joins the card and names the
 * workspace.
 */
export function notesOf(db: Db, workspaceId: string) {
  const inWorkspace = eq(cards.workspaceId, workspaceId);

  const get = async (id: string): Promise<Note | undefined> => {
    const row = await db
      .select(noteColumns)
      .from(notes)
      .innerJoin(cards, eq(cards.id, notes.cardId))
      .leftJoin(users, eq(users.id, notes.authorId))
      .where(and(eq(notes.id, id), inWorkspace))
      .get();
    return row && noteOf(row);
  };

  return {
    get,

    /** The card's notes, oldest first, the way a log reads. */
    async ofCard(cardId: string): Promise<Note[]> {
      const rows = await db
        .select(noteColumns)
        .from(notes)
        .innerJoin(cards, eq(cards.id, notes.cardId))
        .leftJoin(users, eq(users.id, notes.authorId))
        .where(and(eq(notes.cardId, cardId), inWorkspace))
        // Notes made in the same second keep the order they were inserted in.
        .orderBy(asc(notes.createdAt), asc(sql`notes.rowid`));
      return rows.map(noteOf);
    },

    /** The caller checks that the card is in the workspace. */
    async create(input: NewNote): Promise<Note> {
      await db.insert(notes).values({
        id: input.id,
        cardId: input.cardId,
        authorId: input.authorId,
        createdAt: Math.floor(Date.now() / 1000),
        text: input.text,
        fileName: input.file?.name,
        fileType: input.file?.type,
        fileSize: input.file?.size,
      });
      return (await get(input.id))!;
    },

    async update(note: Note, text: string): Promise<Note> {
      if (!text && !note.file) throw new EmptyNote();
      await db.update(notes).set({ text }).where(eq(notes.id, note.id));
      return { ...note, text };
    },

    async delete(note: Note): Promise<void> {
      await db.delete(notes).where(eq(notes.id, note.id));
    },
  };
}

/**
 * The file of a note in any workspace, with the workspace it belongs to. The
 * file route checks membership itself, since an `<img>` cannot send the
 * workspace header.
 */
export async function noteFile(
  db: Db,
  noteId: string,
): Promise<(StoredFile & { workspaceId: string }) | undefined> {
  const row = await db
    .select({
      cardId: notes.cardId,
      workspaceId: cards.workspaceId,
      name: notes.fileName,
      type: notes.fileType,
    })
    .from(notes)
    .innerJoin(cards, eq(cards.id, notes.cardId))
    .where(eq(notes.id, noteId))
    .get();
  if (!row?.name) return undefined;
  return { cardId: row.cardId, workspaceId: row.workspaceId, name: row.name, type: row.type ?? "" };
}
