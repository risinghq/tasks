import { NOTE_FILE_MAX, NOTE_TEXT_MAX, type Note } from "../shared/model";
import { api, ApiError } from "./api";

/** A saved note, or the message that says why it was not. */
export type NoteResult = { note: Note } | { error: string };

const tooLarge = (file: File) => `${file.name} pasa de ${NOTE_FILE_MAX / 1024 / 1024} MB.`;

function noteError(error: unknown, content?: string | File): string {
  if (error instanceof ApiError && error.status === 413 && content instanceof File) return tooLarge(content);
  if (error instanceof ApiError && error.status === 404) return "La tarjeta ya no existe.";
  console.error(error);
  return content instanceof File ? `No se pudo subir ${content.name}.` : "No se pudo guardar la nota.";
}

/** What the note writes need from the board's card queue. */
export type NoteBoard = {
  /** Resolves once the server holds the card. */
  created(cardId: string): Promise<void>;
  /** Moves the note count the card face shows; no write carries it. */
  countNotes(cardId: string, delta: number): void;
};

/** Notes are written at once, not queued: a note is not undone. */
export function noteWrites(board: NoteBoard) {
  return {
    /** Adds text or a file to the card's notes, once the card exists on the server. */
    async addNote(cardId: string, input: string | File): Promise<NoteResult> {
      // Pasted text too long for a note is kept whole, as a text file.
      const content =
        typeof input === "string" && input.length > NOTE_TEXT_MAX
          ? new File([input], "texto.txt", { type: "text/plain" })
          : input;
      if (content instanceof File && content.size > NOTE_FILE_MAX) return { error: tooLarge(content) };
      await board.created(cardId);
      try {
        const note =
          typeof content === "string"
            ? await api.addNote(cardId, content)
            : await api.uploadNote(cardId, content);
        board.countNotes(cardId, 1);
        return { note };
      } catch (error) {
        return { error: noteError(error, content) };
      }
    },

    /** The card's notes, oldest first, or null when they could not be read. */
    async notes(cardId: string): Promise<Note[] | null> {
      await board.created(cardId);
      try {
        return await api.notes(cardId);
      } catch (error) {
        console.error(error);
        return null;
      }
    },

    async updateNote(note: Note, text: string): Promise<NoteResult> {
      try {
        return { note: await api.updateNote(note.id, text) };
      } catch (error) {
        return { error: noteError(error) };
      }
    },

    async removeNote(note: Note): Promise<{ error: string } | null> {
      try {
        await api.removeNote(note.id);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) return { error: noteError(error) };
      }
      board.countNotes(note.cardId, -1);
      return null;
    },
  };
}
