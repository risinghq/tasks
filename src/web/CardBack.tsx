import { Check, ChevronDown, Ellipsis, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { dayHeading } from "../shared/dates";
import { LIST_TITLES, TITLE_MAX, type Card } from "../shared/model";
import type { Fields } from "./boardState";
import { Checklist } from "./Checklist";
import { LabelDot } from "./CardView";
import { useModal } from "./Dialog";
import { Description } from "./Description";
import { LabelPicker } from "./LabelPicker";
import { Notes, useNoteTarget } from "./Notes";
import { useNotes, type NoteActions } from "./useNotes";
import { AssigneePicker, DatePicker, ListPicker, RequesterPicker } from "./Pickers";
import { Sheet } from "./Sheet";
import styles from "./CardBack.module.css";
import type { Container } from "./groups";
import { useUi } from "./ui";
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

type PickerKind = "lista" | "etiqueta" | "responsable" | "solicitante" | "fecha";

const PICKER_LABEL: Record<PickerKind, string> = {
  lista: "Lista",
  etiqueta: "Etiqueta",
  responsable: "Responsable",
  solicitante: "Solicitante",
  fecha: "Fecha de término",
};

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
  const { labels, members } = useUi();
  const chosen = labels.find((known) => known.id === card.labelId);
  const assignee = members.find((member) => member.id === card.assigneeId);
  const modal = useModal();
  const [picker, setPicker] = useState<{ kind: PickerKind; anchor: HTMLElement } | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [checklistShown, setChecklistShown] = useState(false);

  const toggle = (kind: PickerKind) => (event: { currentTarget: HTMLElement }) => {
    const anchor = event.currentTarget;
    setPicker((open) => (open?.kind === kind ? null : { kind, anchor }));
  };

  const edit = (fields: Fields) => actions.edit(fields);
  const move = (to: Container) => actions.move(to);

  return (
    <dialog
      {...modal.props}
      className={styles.dialog}
      data-elevation="modal"
      aria-label="Tarjeta"
      onClose={props.onClose}
      {...target.props}
    >
      {target.over && (
        <div className={styles.drop} aria-hidden>
          Suelta para añadir a Notas
        </div>
      )}
      <header className={styles.bar}>
        <span className={styles.context}>
          {props.workspace} · {LIST_TITLES[card.list]}
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

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <DoneCircle done={card.list === "hecho"} onToggle={actions.toggleDone} />
          <Title card={card} onSave={(title) => edit({ title })} />
        </div>

        <div className={styles.grid}>
          <span className={styles.prop} id="prop-lista">
            Lista
          </span>
          <button
            type="button"
            className={styles.value}
            aria-labelledby="prop-lista"
            aria-haspopup="dialog"
            onClick={toggle("lista")}
          >
            <span className={styles.valueText}>{LIST_TITLES[card.list]}</span>
            <ChevronDown size={14} className={styles.chevron} aria-hidden />
          </button>
          <span className={styles.prop} id="prop-etiqueta">
            Etiqueta
          </span>
          <button
            type="button"
            className={styles.value}
            aria-labelledby="prop-etiqueta"
            aria-haspopup="dialog"
            data-empty={!chosen}
            onClick={toggle("etiqueta")}
          >
            {chosen ? (
              <span className={styles.valueText}>
                <LabelDot color={chosen.color} />
                {chosen.name}
              </span>
            ) : (
              <span className={styles.valueText}>Añadir etiqueta</span>
            )}
          </button>
          {members.length > 1 && (
            <>
              <span className={styles.prop} id="prop-responsable">
                Responsable
              </span>
              <button
                type="button"
                className={styles.value}
                aria-labelledby="prop-responsable"
                aria-haspopup="dialog"
                data-empty={!assignee}
                onClick={toggle("responsable")}
              >
                {assignee && (
                  <span className={styles.avatar} aria-hidden>
                    {assignee.name[0]}
                  </span>
                )}
                <span className={styles.valueText}>{assignee?.name ?? "Asignar"}</span>
              </button>
            </>
          )}
          <span className={styles.prop} id="prop-solicitante">
            Solicitante
          </span>
          <button
            type="button"
            className={styles.value}
            aria-labelledby="prop-solicitante"
            aria-haspopup="dialog"
            data-empty={!card.requester}
            onClick={toggle("solicitante")}
          >
            {card.requester && (
              <span className={styles.avatar} aria-hidden>
                {card.requester[0]}
              </span>
            )}
            <span className={styles.valueText}>{card.requester ?? "Añadir"}</span>
          </button>
          <span className={styles.prop} id="prop-fecha">
            Fecha
          </span>
          <button
            type="button"
            className={styles.value}
            aria-labelledby="prop-fecha"
            aria-haspopup="dialog"
            data-empty={!card.doneDate}
            onClick={toggle("fecha")}
          >
            <span className={styles.valueText}>
              {card.doneDate ? dayHeading(card.doneDate, props.today) : "Añadir fecha"}
            </span>
          </button>
        </div>

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
        <Notes notes={notes} focus={props.focusNotes} />
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

      {picker && (
        <Sheet anchor={picker.anchor} label={PICKER_LABEL[picker.kind]} onClose={() => setPicker(null)}>
          <div className={styles.pickerSheet}>
            {picker.kind === "lista" && (
              <ListPicker
                value={card.list}
                onPick={(list) => {
                  move({ list, doneDate: list === "hecho" ? props.today : null });
                  setPicker(null);
                }}
              />
            )}
            {picker.kind === "etiqueta" && (
              <LabelPicker
                value={card.labelId}
                onPick={(labelId) => {
                  if (labelId !== card.labelId) edit({ labelId });
                  setPicker(null);
                }}
              />
            )}
            {picker.kind === "responsable" && (
              <AssigneePicker
                value={card.assigneeId}
                members={members}
                onPick={(assigneeId) => {
                  if (assigneeId !== card.assigneeId) edit({ assigneeId });
                  setPicker(null);
                }}
              />
            )}
            {picker.kind === "solicitante" && (
              <RequesterPicker
                value={card.requester}
                suggestions={props.requesters}
                onSave={(requester) => {
                  if (requester !== card.requester) edit({ requester });
                  setPicker(null);
                }}
              />
            )}
            {picker.kind === "fecha" && (
              <DatePicker
                value={card.doneDate}
                today={props.today}
                onSave={(date) => {
                  if (date !== card.doneDate) move({ list: "hecho", doneDate: date });
                  setPicker(null);
                }}
              />
            )}
          </div>
        </Sheet>
      )}
    </dialog>
  );
}

export type CardActions = {
  edit: (fields: Fields) => void;
  move: (to: Container) => void;
};
