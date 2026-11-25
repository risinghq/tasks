import { Check, Ellipsis, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { LIST_TITLES, TITLE_MAX, type Card } from "../shared/model";
import type { Fields } from "./boardState";
import { CardProperties } from "./CardProperties";
import { Checklist } from "./Checklist";
import { useModal } from "./Dialog";
import { Description } from "./Description";
import { NoteDrop, useNoteTarget } from "./NoteDrop";
import { Notes } from "./Notes";
import { useNotes, type NoteActions } from "./useNotes";
import { Sheet } from "./Sheet";
import styles from "./CardBack.module.css";
import type { Container } from "./groups";
import { useAutosize } from "./useAutosize";
import { useEscape } from "./useEscape";

/** The card's title: a borderless textarea. Enter or blur saves, Escape restores the old text. */
function Title({ card, onSave }: { card: Card; onSave: (title: string) => void }) {
  const [text, setText] = useState(card.title);
  const [focused, setFocused] = useState(false);
  const field = useAutosize();
  const restored = useRef(false);

  // A focused but unedited title lets Escape close the card.
  useEscape(
    () => {
      restored.current = true;
      setText(card.title);
      field.current?.blur();
    },
    focused && text !== card.title,
  );

  // The title can change from outside, for example from quick edit.
  const [seen, setSeen] = useState(card.title);
  if (seen !== card.title) {
    setSeen(card.title);
    setText(card.title);
  }

  return (
    <textarea
      ref={field}
      className={styles.title}
      rows={1}
      maxLength={TITLE_MAX}
      value={text}
      aria-label="Título de la tarjeta"
      onFocus={() => setFocused(true)}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        setFocused(false);
        if (restored.current) {
          restored.current = false;
          return;
        }
        const next = text.trim();
        if (next && next !== card.title) onSave(next);
        else setText(card.title);
      }}
    />
  );
}

/** The done circle of the back: a 26px ring inside a 40px target. */
function DoneCircle({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={styles.done}
      aria-label={done ? "Mover a En curso" : "Marcar como hecha"}
      onClick={onToggle}
    >
      <span className={styles.doneCircle} data-done={done}>
        <Check size={14} strokeWidth={2} aria-hidden />
      </span>
    </button>
  );
}

/** The ··· menu: copy the card link, and delete behind a confirmation. */
function MoreMenu(props: { anchor: HTMLElement; cardId: string; onDelete: () => void; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/c/${props.cardId}`);
    } catch {
      // The clipboard can refuse; the menu just closes.
    }
    setCopied(true);
    setTimeout(props.onClose, 700);
  };

  return (
    <Sheet anchor={props.anchor} label="Más acciones" align="right" onClose={props.onClose}>
      {confirming ? (
        <div className={styles.confirm} role="alertdialog" aria-label="Eliminar tarjeta">
          <p>¿Eliminar esta tarjeta?</p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.destroy}
              autoFocus
              onClick={() => {
                props.onDelete();
                props.onClose();
              }}
            >
              Sí, eliminar
            </button>
            <button type="button" className={styles.menuCancel} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.menu} role="menu" aria-label="Más acciones">
          <button type="button" role="menuitem" className={styles.menuItem} data-autofocus onClick={copy}>
            {copied ? "Copiado" : "Copiar enlace a la tarjeta"}
          </button>
          <div className={styles.menuLine} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            data-danger
            onClick={() => setConfirming(true)}
          >
            Eliminar tarjeta…
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** Whether `target` has scrolled out of `root`, so the bar can carry the title. */
function useScrolledPast(
  root: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!root.current || !target.current) return;
    const observer = new IntersectionObserver(([entry]) => setPast(!entry!.isIntersecting), {
      root: root.current,
    });
    observer.observe(target.current);
    return () => observer.disconnect();
  }, [root, target]);
  return past;
}

export function CardBack(props: {
  card: Card;
  today: string;
  workspace: string;
  requesters: string[];
  actions: CardActions & { remove: () => void; toggleDone: () => void };
  noteActions: NoteActions;
  /** Opened to take a note: the note box gets the focus. */
  focusNotes: boolean;
  onClose: () => void;
}) {
  const { card, actions } = props;
  const notes = useNotes(card.id, props.noteActions);
  const target = useNoteTarget(notes);
  const modal = useModal();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [checklistShown, setChecklistShown] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const titleRow = useRef<HTMLDivElement>(null);
  const titleHidden = useScrolledPast(body, titleRow);
  const { edit } = actions;

  return (
    <dialog
      {...modal.props}
      className={styles.dialog}
      data-elevation="modal"
      aria-label="Tarjeta"
      onClose={props.onClose}
      {...target.props}
    >
      <NoteDrop dragged={target.dragged} />
      <header className={styles.bar} data-scrolled={titleHidden}>
        <span className={styles.context}>
          {titleHidden && <span className={styles.barTitle}>{card.title}</span>}
          <span className={styles.barPlace}>
            {titleHidden && " · "}
            {props.workspace} · {LIST_TITLES[card.list]}
          </span>
        </span>
        <button
          type="button"
          className={styles.icon}
          aria-label="Más acciones"
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          data-open={menu !== null}
          onClick={(event) => {
            // The updater can run after dispatch, when currentTarget is already null.
            const button = event.currentTarget;
            setMenu((open) => (open ? null : button));
          }}
        >
          <Ellipsis size={16} aria-hidden />
        </button>
        <button type="button" className={styles.close} aria-label="Cerrar" onClick={modal.close}>
          <X size={16} strokeWidth={1.6} aria-hidden />
        </button>
      </header>

      <div className={styles.body} ref={body}>
        <div className={styles.titleRow} ref={titleRow}>
          <DoneCircle done={card.list === "hecho"} onToggle={actions.toggleDone} />
          <Title card={card} onSave={(title) => edit({ title })} />
        </div>

        <CardProperties
          card={card}
          today={props.today}
          requesters={props.requesters}
          edit={edit}
          move={actions.move}
        />

        <Description value={card.description} onSave={(description) => edit({ description })} />
        {card.checklist.length > 0 || checklistShown ? (
          <Checklist
            startOpen={card.checklist.length === 0}
            items={card.checklist}
            onSave={(checklist) => edit({ checklist })}
          />
        ) : (
          <button type="button" className={styles.addChecklist} onClick={() => setChecklistShown(true)}>
            <Plus size={16} aria-hidden /> Añadir checklist
          </button>
        )}
        <Notes notes={notes} focus={props.focusNotes} today={props.today} />
      </div>

      {menu && (
        <MoreMenu
          anchor={menu}
          cardId={card.id}
          onDelete={() => {
            actions.remove();
            modal.close();
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </dialog>
  );
}

export type CardActions = {
  edit: (fields: Fields) => void;
  move: (to: Container) => void;
};
