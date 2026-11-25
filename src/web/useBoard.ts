import { useEffect, useMemo, useRef, useState } from "react";
import { NOTE_FILE_MAX, NOTE_TEXT_MAX, type Card, type Label, type Note, type Person } from "../shared/model";
import type { CreateLabel, UpdateLabel } from "../shared/schemas";
import { api, ApiError, removeOnExit } from "./api";
import { project, serverIndex, settled, type Fields, type Op, type Pending } from "./boardState";
import type { Container } from "./groups";

export type Toast = {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
};

type State = {
  loaded: boolean;
  loadError: boolean;
  today: string;
  requesters: string[];
  members: Person[];
  labels: Label[];
  olderWeek: string | null;
  /** The cards as the server holds them, once every write before the pending ones has settled. */
  base: Card[];
  pending: Pending[];
  toasts: Toast[];
};

const empty: State = {
  loaded: false,
  loadError: false,
  today: "",
  requesters: [],
  members: [],
  labels: [],
  olderWeek: null,
  base: [],
  pending: [],
  toasts: [],
};

const byName = (labels: Label[]) => labels.toSorted((a, b) => a.name.localeCompare(b.name, "es"));

/** A saved label, or the message that says why it was not. */
export type LabelResult = { label: Label } | { error: string };

function labelError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return "Ya existe una etiqueta con ese nombre.";
  console.error(error);
  return "No se pudo guardar la etiqueta.";
}

/** A saved note, or the message that says why it was not. */
export type NoteResult = { note: Note } | { error: string };

const tooLarge = (file: File) => `${file.name} pasa de ${NOTE_FILE_MAX / 1024 / 1024} MB.`;

function noteError(error: unknown, content?: string | File): string {
  if (error instanceof ApiError && error.status === 413 && content instanceof File) return tooLarge(content);
  if (error instanceof ApiError && error.status === 404) return "La tarjeta ya no existe.";
  console.error(error);
  return content instanceof File ? `No se pudo subir ${content.name}.` : "No se pudo guardar la nota.";
}

const UNDO_MS = 6000;
const NOTICE_MS = 4000;

/**
 * The one owner of the board. Every action changes what the screen shows at
 * once, then writes in the background, one write at a time in the order made.
 * A write that fails is taken back and offered again in a toast.
 */
export function useBoard() {
  const [state, setState] = useState<State>(empty);
  const live = useRef(state);
  const keys = useRef(0);
  const pumping = useRef(false);
  const timers = useRef(new Map<number, number>());
  const closers = useRef(new Map<number, () => void>());

  const watchers = useRef(new Set<() => void>());

  const change = (next: (s: State) => State) => {
    live.current = next(live.current);
    setState(live.current);
    for (const watch of watchers.current) watch();
  };

  /** Resolves once the server holds the card: its create, if any, has settled or failed. */
  function created(id: string): Promise<void> {
    return new Promise((resolve) => {
      const watch = () => {
        if (live.current.pending.some((p) => p.op.kind === "create" && p.op.card.id === id)) return;
        watchers.current.delete(watch);
        resolve();
      };
      watchers.current.add(watch);
      watch();
    });
  }

  /** A note's add or delete changes the count the card face shows; no write carries it. */
  function countNotes(id: string, delta: number) {
    change((s) => ({
      ...s,
      base: s.base.map((card) =>
        card.id === id ? { ...card, noteCount: Math.max(0, card.noteCount + delta) } : card,
      ),
    }));
  }

  useEffect(() => {
    api.board().then(
      (board) =>
        change((s) => ({
          ...s,
          loaded: true,
          today: board.today,
          requesters: board.requesters,
          members: board.members,
          labels: board.labels,
          olderWeek: board.olderWeek,
          base: board.cards,
        })),
      () => change((s) => ({ ...s, loadError: true })),
    );
  }, []);

  useEffect(() => {
    // The page may close while a delete waits for its undo to expire.
    const flush = () => {
      for (const { op, phase } of live.current.pending) {
        if (op.kind === "remove" && phase !== "sending") removeOnExit(op.id);
      }
    };
    addEventListener("pagehide", flush);
    return () => removeEventListener("pagehide", flush);
  }, []);

  function closeToast(id: number, by: "timer" | "user" | "action") {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const onClose = closers.current.get(id);
    closers.current.delete(id);
    change((s) => ({ ...s, toasts: s.toasts.filter((item) => item.id !== id) }));
    if (by !== "action") onClose?.();
  }

  function toast(
    text: string,
    options: { action?: Toast["action"]; ms?: number; onClose?: () => void } = {},
  ) {
    const id = ++keys.current;
    change((s) => ({ ...s, toasts: [...s.toasts, { id, text, action: options.action }] }));
    if (options.onClose) closers.current.set(id, options.onClose);
    if (options.ms)
      timers.current.set(
        id,
        window.setTimeout(() => closeToast(id, "timer"), options.ms),
      );
    return id;
  }

  async function pump() {
    if (pumping.current) return;
    pumping.current = true;
    try {
      for (let next = firstQueued(); next; next = firstQueued()) {
        await send(next);
      }
    } finally {
      pumping.current = false;
    }
  }

  const firstQueued = () => live.current.pending.find((p) => p.phase === "queued");

  async function send(entry: Pending) {
    setPhase(entry.key, "sending");
    try {
      const answer = await write(entry.op, live.current.base);
      change((s) => ({
        ...s,
        base: settled(s.base, entry.op, answer),
        pending: s.pending.filter((p) => p.key !== entry.key),
      }));
    } catch (error) {
      console.error(error);
      change((s) => ({ ...s, pending: s.pending.filter((p) => p.key !== entry.key) }));
      toast("No se pudo guardar.", { action: { label: "Reintentar", run: () => enqueue(entry.op) } });
    }
  }

  function setPhase(key: number, phase: Pending["phase"]) {
    change((s) => ({ ...s, pending: s.pending.map((p) => (p.key === key ? { ...p, phase } : p)) }));
  }

  function enqueue(op: Op, phase: Pending["phase"] = "queued"): number {
    const key = ++keys.current;
    change((s) => ({ ...s, pending: [...s.pending, { key, op, phase }] }));
    void pump();
    return key;
  }

  const view = useMemo(() => project(state.base, state.pending), [state.base, state.pending]);
  const requesters = useMemo(
    () => [
      ...new Set([
        ...state.requesters,
        ...view.all.flatMap((card) => (card.requester ? [card.requester] : [])),
      ]),
    ],
    [state.requesters, view.all],
  );

  return {
    ready: state.loaded,
    loadError: state.loadError,
    today: state.today,
    requesters,
    members: state.members,
    labels: state.labels,
    cards: view.visible,
    olderWeek: state.olderWeek,
    toasts: state.toasts,
    closeToast: (id: number) => closeToast(id, "user"),
    notify: (text: string, action?: Toast["action"]) => toast(text, { ms: NOTICE_MS, action }),

    add(title: string, to: Container): string {
      const card: Card = {
        id: crypto.randomUUID(),
        title,
        description: "",
        labelId: null,
        assigneeId: null,
        requester: null,
        checklist: [],
        list: to.list,
        position: 0,
        doneDate: to.list === "hecho" ? to.doneDate : null,
        noteCount: 0,
      };
      enqueue({ kind: "create", card });
      return card.id;
    },

    edit(id: string, fields: Fields) {
      enqueue({ kind: "edit", id, fields });
    },

    move(id: string, to: Container, beforeId: string | null) {
      enqueue({ kind: "move", id, to, beforeId });
    },

    /**
     * Labels are written at once rather than queued: a card edit that names a
     * new label must find it on the server. The label picker sits in a modal
     * that hides the toasts, so each call answers with the message to show.
     */
    async createLabel(input: Omit<CreateLabel, "id">): Promise<LabelResult> {
      try {
        const label = await api.createLabel({ id: crypto.randomUUID(), ...input });
        change((s) => ({ ...s, labels: byName([...s.labels, label]) }));
        return { label };
      } catch (error) {
        return { error: labelError(error) };
      }
    },

    async updateLabel(id: string, patch: UpdateLabel): Promise<LabelResult> {
      try {
        const label = await api.updateLabel(id, patch);
        change((s) => ({ ...s, labels: byName(s.labels.map((known) => (known.id === id ? label : known))) }));
        return { label };
      } catch (error) {
        return { error: labelError(error) };
      }
    },

    /** The server clears the label from its cards. The screen does the same. */
    async removeLabel(id: string): Promise<{ error: string } | null> {
      try {
        await api.removeLabel(id);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) return { error: labelError(error) };
      }
      const clear = (card: Card): Card => (card.labelId === id ? { ...card, labelId: null } : card);
      change((s) => ({
        ...s,
        labels: s.labels.filter((label) => label.id !== id),
        base: s.base.map(clear),
        pending: s.pending.map((p) =>
          p.op.kind === "edit" && p.op.fields.labelId === id
            ? { ...p, op: { ...p.op, fields: { ...p.op.fields, labelId: null } } }
            : p,
        ),
      }));
      return null;
    },

    remove(id: string) {
      const key = enqueue({ kind: "remove", id }, "held");
      const release = () => {
        setPhase(key, "queued");
        void pump();
      };
      const toastId = toast("Tarjeta eliminada.", {
        ms: UNDO_MS,
        onClose: release,
        action: {
          label: "Deshacer",
          run: () => {
            change((s) => ({ ...s, pending: s.pending.filter((p) => p.key !== key) }));
            closeToast(toastId, "action");
          },
        },
      });
    },

    /**
     * Adds text or a file to the card's notes, once the card exists on the
     * server. Notes are written at once, not queued: a note is not undone.
     */
    async addNote(cardId: string, input: string | File): Promise<NoteResult> {
      // Pasted text too long for a note is kept whole, as a text file.
      const content =
        typeof input === "string" && input.length > NOTE_TEXT_MAX
          ? new File([input], "texto.txt", { type: "text/plain" })
          : input;
      if (content instanceof File && content.size > NOTE_FILE_MAX) return { error: tooLarge(content) };
      await created(cardId);
      try {
        const note =
          typeof content === "string"
            ? await api.addNote(cardId, content)
            : await api.uploadNote(cardId, content);
        countNotes(cardId, 1);
        return { note };
      } catch (error) {
        return { error: noteError(error, content) };
      }
    },

    /** The card's notes, oldest first, or null when they could not be read. */
    async notes(cardId: string): Promise<Note[] | null> {
      await created(cardId);
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
      countNotes(note.cardId, -1);
      return null;
    },

    /**
     * Whether the card exists. A card on screen, including one whose create has
     * not been answered yet, is known. Any other is read from the server and
     * added to the board.
     */
    async open(id: string): Promise<boolean> {
      const { base, pending } = live.current;
      if (project(base, pending).all.some((card) => card.id === id)) return true;
      try {
        const card = await api.card(id);
        change((s) => ({ ...s, base: [...s.base, card] }));
        return true;
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) console.error(error);
        return false;
      }
    },

    async loadOlder() {
      const week = live.current.olderWeek;
      if (!week) return;
      try {
        const done = await api.doneWeek(week);
        change((s) => ({
          ...s,
          olderWeek: done.olderWeek,
          base: [...s.base, ...done.cards.filter((card) => !s.base.some((known) => known.id === card.id))],
        }));
      } catch {
        toast("No se pudieron cargar las semanas anteriores.", { ms: NOTICE_MS });
      }
    },
  };
}

async function write(op: Op, base: Card[]): Promise<Card | undefined> {
  switch (op.kind) {
    case "create":
      return api.create({ id: op.card.id, title: op.card.title, list: op.card.list });
    case "edit":
      return api.update(op.id, op.fields);
    case "move":
      return api.move(
        op.id,
        {
          list: op.to.list,
          doneDate: op.to.list === "hecho" ? (op.to.doneDate ?? undefined) : undefined,
        },
        serverIndex(base, op),
      );
    case "remove":
      // A 404 means the card is already gone, which is what the delete wanted.
      await api.remove(op.id).catch((error: unknown) => {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      });
      return undefined;
  }
}
