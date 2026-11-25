import { Ellipsis } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { NOTE_TEXT_MAX, type Note } from "../shared/model";
import styles from "./NoteEntry.module.css";
import { useAutosize } from "./useAutosize";
import { useEscape } from "./useEscape";
import type { Notes } from "./useNotes";

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

/** One note: its author and time, its text or attachment, and Editar and Eliminar. */
export function NoteEntry({ note, notes }: { note: Note; notes: Notes }) {
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
      <div className={styles.head}>
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
      <div className={styles.body}>
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
