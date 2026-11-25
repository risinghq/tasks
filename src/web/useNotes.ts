import { useEffect, useRef, useState } from "react";
import type { Note } from "../shared/model";
import type { NoteResult } from "./useBoard";

export type NoteActions = {
  list: (cardId: string) => Promise<Note[] | null>;
  add: (cardId: string, content: string | File) => Promise<NoteResult>;
  update: (note: Note, text: string) => Promise<NoteResult>;
  remove: (note: Note) => Promise<{ error: string } | null>;
};

/** A file on its way up, shown in the log until the server answers. */
export type Upload = { key: number; name: string };

/**
 * One card's notes as the card back shows them. The card back sits in a modal
 * that hides the board's toasts, so a failure lands in `error`.
 */
export function useNotes(cardId: string, actions: NoteActions) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef(0);

  useEffect(() => {
    let current = true;
    void actions.list(cardId).then((loaded) => {
      if (!current) return;
      if (loaded) setNotes(loaded);
      else setFailed(true);
    });
    return () => {
      current = false;
    };
    // The actions change every render; only the card decides what to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const replace = (note: Note) =>
    setNotes((all) => all && all.map((known) => (known.id === note.id ? note : known)));

  async function addOne(content: string | File) {
    const key = ++keys.current;
    if (content instanceof File) setUploads((all) => [...all, { key, name: content.name }]);
    const result = await actions.add(cardId, content);
    setUploads((all) => all.filter((upload) => upload.key !== key));
    if ("error" in result) setError(result.error);
    else setNotes((all) => [...(all ?? []), result.note]);
    return !("error" in result);
  }

  return {
    notes,
    failed,
    uploads,
    error,
    dismissError: () => setError(null),

    /** Adds each piece at once. Answers whether all of them were saved. */
    async add(contents: (string | File)[]): Promise<boolean> {
      setError(null);
      const saved = await Promise.all(contents.map(addOne));
      return saved.every(Boolean);
    },

    async update(note: Note, text: string): Promise<boolean> {
      setError(null);
      const result = await actions.update(note, text);
      if ("error" in result) {
        setError(result.error);
        return false;
      }
      replace(result.note);
      return true;
    },

    async remove(note: Note) {
      setError(null);
      const failure = await actions.remove(note);
      if (failure) setError(failure.error);
      else setNotes((all) => all && all.filter((known) => known.id !== note.id));
    },
  };
}

export type Notes = ReturnType<typeof useNotes>;
