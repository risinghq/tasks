import { FileText, LoaderCircle, Paperclip, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type DragEvent, type ClipboardEvent } from "react";
import { NOTE_TEXT_MAX, type Note } from "../shared/model";
import { carriesFiles, isTyping, noteContent } from "./noteInput";
import styles from "./Notes.module.css";
import { useAutosize } from "./useAutosize";
import { useEscape } from "./useEscape";
import type { Notes as NotesState } from "./useNotes";

/** Types the browser shows as a picture; the file route serves these inline. */
const PICTURES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

const LINK = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;

/** The text with its web addresses as links. */
function Linked({ text }: { text: string }) {
  const parts = text.split(LINK);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const dayFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });
const clockFormat = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });
const fullFormat = new Intl.DateTimeFormat("es", { dateStyle: "full", timeStyle: "short" });

/** "14:32" today, "3 nov, 14:32" before. */
function when(createdAt: number): string {
  const date = new Date(createdAt * 1000);
  const today = new Date().toDateString() === date.toDateString();
  return today ? clockFormat.format(date) : `${dayFormat.format(date)}, ${clockFormat.format(date)}`;
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Attachment({ file }: { file: NonNullable<Note["file"]> }) {
  if (PICTURES.has(file.type)) {
    return (
      <a className={styles.picture} href={file.url} target="_blank" rel="noopener" aria-label={file.name}>
        <img src={file.url} alt={file.name} loading="lazy" />
      </a>
    );
  }
  return (
    <a className={styles.file} href={file.url} target="_blank" rel="noopener">
      <FileText size={16} aria-hidden />
      <span className={styles.fileName}>{file.name}</span>
      <span className={styles.fileSize}>{size(file.size)}</span>
    </a>
  );
}

/** A note's text in place. Blur or Ctrl+Enter saves, Escape restores. */
function EditText(props: { note: Note; onSave: (text: string) => Promise<boolean>; onDone: () => void }) {
  const [draft, setDraft] = useState(props.note.text);
  const field = useAutosize();
  const restored = useRef(false);

  useEffect(() => {
    const element = field.current;
    element?.focus();
    element?.setSelectionRange(element.value.length, element.value.length);
  }, [field]);

  useEscape(() => {
    restored.current = true;
    props.onDone();
  });

  const save = async () => {
    if (restored.current) return;
    const text = draft.trim();
    if (text === props.note.text || (!text && !props.note.file)) return props.onDone();
    if (await props.onSave(text)) props.onDone();
  };

  return (
    <textarea
      ref={field}
      className={styles.edit}
      rows={1}
      maxLength={NOTE_TEXT_MAX}
      value={draft}
      aria-label="Texto de la nota"
      placeholder={props.note.file ? "Añade un texto al archivo…" : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={() => void save()}
    />
  );
}

function Entry({ note, notes }: { note: Note; notes: NotesState }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const date = new Date(note.createdAt * 1000);
  return (
    <li className={styles.entry} data-note-id={note.id}>
      <div className={styles.entryHead}>
        <span className={styles.avatar} aria-hidden>
          {note.author?.name[0] ?? "?"}
        </span>
        <span className={styles.author}>{note.author?.name ?? "Alguien"}</span>
        <time className={styles.time} dateTime={date.toISOString()} title={fullFormat.format(date)}>
          {when(note.createdAt)}
        </time>
        <span className={styles.spacer} />
        {!editing && (
          <button type="button" className={styles.action} onClick={() => setEditing(true)}>
            {note.text || !note.file ? "Editar" : "Añadir texto"}
          </button>
        )}
        <button
          type="button"
          className={styles.action}
          data-danger={confirming}
          onClick={() => (confirming ? void notes.remove(note) : setConfirming(true))}
        >
          {confirming ? "¿Eliminar?" : "Eliminar"}
        </button>
      </div>
      {editing ? (
        <EditText note={note} onSave={(text) => notes.update(note, text)} onDone={() => setEditing(false)} />
      ) : (
        note.text && (
          <p className={styles.text}>
            <Linked text={note.text} />
          </p>
        )
      )}
      {note.file && <Attachment file={note.file} />}
    </li>
  );
}

/**
 * The card's log: a box that takes text, pasted pictures and files, then the
 * notes, newest first. Enter saves the box; Shift+Enter starts a new line.
 */
export function Notes({ notes, focus }: { notes: NotesState; focus: boolean }) {
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
  return (
    <section className={styles.section} aria-labelledby="notes-title">
      <div className={styles.header}>
        <span className={styles.label} id="notes-title">
          Notas
        </span>
        {count > 0 && <span className={styles.count}>{count}</span>}
        <span className={styles.spacer} />
        <button type="button" className={styles.attach} onClick={() => picker.current?.click()}>
          <Paperclip size={14} aria-hidden /> Adjuntar
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

      <textarea
        ref={field}
        className={styles.capture}
        rows={1}
        maxLength={NOTE_TEXT_MAX}
        value={draft}
        aria-label="Nueva nota"
        // The card back's dialog focuses this when it opens.
        data-autofocus={focus || undefined}
        placeholder="Anota algo, pega una imagen o suelta un archivo…"
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

      {(notes.uploads.length > 0 || count > 0) && (
        <ol className={styles.entries}>
          {notes.uploads.map((upload) => (
            <li key={upload.key} className={styles.uploading}>
              <LoaderCircle size={16} className={styles.spin} aria-hidden />
              Subiendo {upload.name}…
            </li>
          ))}
          {notes.notes?.toReversed().map((note) => (
            <Entry key={note.id} note={note} notes={notes} />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Paste and drop anywhere on the card back. A paste into a text field stays
 * there; anywhere else it becomes a note. `over` is true while files hover.
 */
export function useNoteTarget(notes: NotesState) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const leave = () => {
    depth.current = 0;
    setOver(false);
  };

  return {
    over,
    props: {
      onPaste(event: ClipboardEvent) {
        if (isTyping(event.target)) return;
        const contents = noteContent(event.clipboardData);
        if (!contents.length) return;
        event.preventDefault();
        void notes.add(contents);
      },
      onDragEnter(event: DragEvent) {
        if (!carriesFiles(event.dataTransfer)) return;
        depth.current += 1;
        setOver(true);
      },
      onDragLeave(event: DragEvent) {
        if (!carriesFiles(event.dataTransfer)) return;
        depth.current -= 1;
        if (depth.current <= 0) leave();
      },
      onDragOver(event: DragEvent) {
        if (!carriesFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      },
      onDrop(event: DragEvent) {
        if (!carriesFiles(event.dataTransfer)) return;
        event.preventDefault();
        leave();
        const files = [...event.dataTransfer.files];
        if (files.length) void notes.add(files);
      },
    },
  };
}
