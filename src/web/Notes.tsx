import { Ellipsis, LoaderCircle, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type DragEvent, type ClipboardEvent } from "react";
import { dayHeading, limaDate } from "../shared/dates";
import { NOTE_TEXT_MAX, type Note } from "../shared/model";
import { carriesFiles, isTyping, noteContent } from "./noteInput";
import styles from "./Notes.module.css";
import { useAutosize } from "./useAutosize";
import { useEscape } from "./useEscape";
import type { Notes as NotesState } from "./useNotes";

/** Types the browser shows as a picture; the file route serves these inline. */
const PICTURES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

const LINK = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;

/** A touch screen has no hover and no drop, so the copy and the note actions change. */
const touch = () => matchMedia("(pointer: coarse)").matches;

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

const clockFormat = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });
const fullFormat = new Intl.DateTimeFormat("es", { dateStyle: "full", timeStyle: "short" });

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** "PDF" for "contrato.pdf"; a name without a short extension gets a generic badge. */
function extension(name: string): string {
  const match = /\.([a-z0-9]{1,4})$/i.exec(name);
  return match ? match[1]!.toUpperCase() : "ARCH";
}

function Attachment({ file }: { file: NonNullable<Note["file"]> }) {
  if (PICTURES.has(file.type)) {
    return (
      <div className={styles.picture}>
        <a className={styles.crop} href={file.url} target="_blank" rel="noopener" aria-label={file.name}>
          <img src={file.url} alt={file.name} loading="lazy" />
        </a>
        <span className={styles.caption}>
          {file.name} · {size(file.size)}
        </span>
      </div>
    );
  }
  return (
    <a className={styles.file} href={file.url} target="_blank" rel="noopener">
      <span className={styles.ext} aria-hidden>
        {extension(file.name)}
      </span>
      <span className={styles.fileText}>
        <span className={styles.fileName}>{file.name}</span>
        <span className={styles.fileSize}>{size(file.size)}</span>
      </span>
    </a>
  );
}

/** A note's text in place. Guardar or Ctrl+Enter saves; Cancelar or Escape restores. */
function EditText(props: { note: Note; onSave: (text: string) => Promise<boolean>; onDone: () => void }) {
  const [draft, setDraft] = useState(props.note.text);
  const field = useAutosize();

  useEffect(() => {
    const element = field.current;
    element?.focus();
    element?.setSelectionRange(element.value.length, element.value.length);
  }, [field]);

  useEscape(props.onDone);

  const save = async () => {
    const text = draft.trim();
    if (text === props.note.text || (!text && !props.note.file)) return props.onDone();
    if (await props.onSave(text)) props.onDone();
  };

  return (
    <div className={styles.editing}>
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
            void save();
          }
        }}
      />
      <div className={styles.editActions}>
        <button type="button" className={styles.save} onClick={() => void save()}>
          Guardar
        </button>
        <button type="button" className={styles.cancel} onClick={props.onDone}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Entry({ note, notes }: { note: Note; notes: NotesState }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [actionsShown, setActionsShown] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const date = new Date(note.createdAt * 1000);
  return (
    <li className={styles.entry} data-note-id={note.id} data-editing={editing}>
      <div className={styles.entryHead}>
        <span className={styles.avatar} aria-hidden>
          {note.author?.name[0] ?? "?"}
        </span>
        <span className={styles.author}>{note.author?.name ?? "Alguien"}</span>
        <time className={styles.time} dateTime={date.toISOString()} title={fullFormat.format(date)}>
          {clockFormat.format(date)}
        </time>
        <span className={styles.spacer} />
        {!editing && (
          <>
            <span className={styles.actions} data-shown={actionsShown || confirming}>
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  setActionsShown(false);
                  setEditing(true);
                }}
              >
                {note.text || !note.file ? "Editar" : "Añadir texto"}
              </button>
              <button
                type="button"
                className={styles.action}
                data-danger={confirming}
                onClick={() => (confirming ? void notes.remove(note) : setConfirming(true))}
              >
                {confirming ? "¿Eliminar?" : "Eliminar"}
              </button>
            </span>
            <button
              type="button"
              className={styles.more}
              aria-label="Acciones de la nota"
              aria-expanded={actionsShown}
              onClick={() => setActionsShown((shown) => !shown)}
            >
              <Ellipsis size={16} aria-hidden />
            </button>
          </>
        )}
      </div>
      <div className={styles.entryBody}>
        {editing ? (
          <EditText
            note={note}
            onSave={(text) => notes.update(note, text)}
            onDone={() => setEditing(false)}
          />
        ) : (
          note.text && (
            <p className={styles.text}>
              <Linked text={note.text} />
            </p>
          )
        )}
        {note.file && <Attachment file={note.file} />}
      </div>
    </li>
  );
}

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
              <Entry key={note.id} note={note} notes={notes} />
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

/**
 * Paste and drop anywhere on the card back. A paste into a text field stays
 * there; anywhere else it becomes a note. `dragged` counts the files that
 * hover, 0 when none do; a browser keeps their names until the drop.
 */
export function useNoteTarget(notes: NotesState) {
  const [dragged, setDragged] = useState(0);
  const depth = useRef(0);

  const leave = () => {
    depth.current = 0;
    setDragged(0);
  };

  return {
    dragged,
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
        const files = [...event.dataTransfer.items].filter((item) => item.kind === "file").length;
        setDragged(Math.max(files, 1));
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
