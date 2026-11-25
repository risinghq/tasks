import { LoaderCircle, X } from "lucide-react";
import { useRef, useState } from "react";
import { dayHeading, limaDate } from "../shared/dates";
import { NOTE_TEXT_MAX, type Note } from "../shared/model";
import { NoteEntry } from "./NoteEntry";
import styles from "./Notes.module.css";
import { useAutosize } from "./useAutosize";
import { useEscape } from "./useEscape";
import type { Notes as NotesState } from "./useNotes";

/** A touch screen has no hover and no drop, so the copy changes. */
const touch = () => matchMedia("(pointer: coarse)").matches;

/** The notes, newest first, under a heading for each day. */
function byDay(notes: Note[], today: string): { day: string; notes: Note[] }[] {
  const days: { day: string; notes: Note[] }[] = [];
  for (const note of notes.toReversed()) {
    const day = dayHeading(limaDate(new Date(note.createdAt * 1000)), today);
    if (days.at(-1)?.day === day) days.at(-1)!.notes.push(note);
    else days.push({ day, notes: [note] });
  }
  return days;
}

/**
 * The card's log: a box that takes text, pasted pictures and files, then the
 * notes by day, newest first. Enter saves the box; Shift+Enter starts a new line.
 */
export function Notes({ notes, focus, today }: { notes: NotesState; focus: boolean; today: string }) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const field = useAutosize();
  const picker = useRef<HTMLInputElement>(null);

  useEscape(() => setDraft(""), focused && draft !== "");

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (!(await notes.add([text]))) setDraft(text);
  };

  const count = notes.notes?.length ?? 0;
  const onTouch = touch();
  return (
    <section className={styles.section} aria-labelledby="notes-title">
      <div className={styles.header}>
        <span className={styles.label} id="notes-title">
          Notas
        </span>
        {count > 0 && <span className={styles.count}>{count}</span>}
      </div>

      <div className={styles.composer}>
        <textarea
          ref={field}
          className={styles.capture}
          rows={1}
          maxLength={NOTE_TEXT_MAX}
          value={draft}
          aria-label="Nueva nota"
          // The card back's dialog focuses this when it opens.
          data-autofocus={focus || undefined}
          placeholder={
            onTouch ? "Anota algo o pega una imagen…" : "Anota algo, pega una imagen o suelta un archivo…"
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => {
            // Text lands in the box to be edited first; files are added at once.
            const files = [...event.clipboardData.files];
            if (!files.length) return;
            event.preventDefault();
            void notes.add(files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button type="button" className={styles.attach} onClick={() => picker.current?.click()}>
          Adjuntar
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            if (files.length) void notes.add(files);
          }}
        />
      </div>

      {notes.error && (
        <p className={styles.error} role="alert">
          {notes.error}
          <button
            type="button"
            className={styles.dismiss}
            aria-label="Cerrar aviso"
            onClick={notes.dismissError}
          >
            <X size={14} aria-hidden />
          </button>
        </p>
      )}
      {notes.failed && <p className={styles.error}>No se pudieron cargar las notas.</p>}

      {notes.notes && count === 0 && notes.uploads.length === 0 && (
        <p className={styles.empty}>
          Guarda aquí lo que llegue sobre esta tarjeta: una llamada, una dirección, una captura, un PDF.{" "}
          {onTouch
            ? "Pega una imagen o usa Adjuntar."
            : "Pega con Ctrl+V o suelta un archivo en cualquier parte de la tarjeta."}
        </p>
      )}

      {notes.uploads.length > 0 && (
        <ul className={styles.uploads}>
          {notes.uploads.map((upload) => (
            <li key={upload.key} className={styles.uploading}>
              <LoaderCircle size={16} className={styles.spin} aria-hidden />
              Subiendo {upload.name}…
            </li>
          ))}
        </ul>
      )}

      {byDay(notes.notes ?? [], today).map((group) => (
        <div key={group.day} className={styles.day}>
          <h3 className={styles.dayLabel}>{group.day}</h3>
          <ol className={styles.entries}>
            {group.notes.map((note) => (
              <NoteEntry key={note.id} note={note} notes={notes} />
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
