import { useLayoutEffect, useRef, useState } from "react";
import { TITLE_MAX, type Card } from "../shared/model";
import { CardFace } from "./CardView";
import { CardPopover, type CardActions, type PopoverKind } from "./CardPopover";
import { fitsBeside, placeBeside } from "./placeBeside";
import styles from "./QuickEdit.module.css";
import { useAutosize } from "./useAutosize";
import { useEscape } from "./useEscape";

const MENU_WIDTH = 216;

const BUTTONS: { kind: PopoverKind; label: string }[] = [
  { kind: "label", label: "Etiqueta" },
  { kind: "requester", label: "Solicitante" },
  { kind: "date", label: "Fecha" },
  { kind: "move", label: "Mover" },
];

/**
 * Edits a card's title where it sits on the board, with the rest of the board
 * dimmed and the card's actions in one menu beside it, or under it when the
 * screen is narrow.
 */
export function QuickEdit(props: {
  card: Card;
  /** Where the card is on the screen. */
  rect: DOMRect;
  today: string;
  requesters: string[];
  actions: CardActions;
  onOpenCard: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { card, rect, actions } = props;
  const [title, setTitle] = useState(card.title);
  const [popover, setPopover] = useState<{ kind: PopoverKind; anchor: HTMLElement } | null>(null);
  const field = useAutosize();
  const editor = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [menuPlace, setMenuPlace] = useState<{ left: number; top: number; width: number } | null>(null);
  useEscape(props.onClose);

  useLayoutEffect(() => {
    if (!editor.current || !menu.current) return;
    const viewport = { width: innerWidth, height: innerHeight };
    // Under the card, the menu takes the card's width so it reads as part of it.
    const width = fitsBeside(rect, MENU_WIDTH, viewport.width) ? MENU_WIDTH : rect.width;
    const size = { width, height: menu.current.offsetHeight };
    const below = editor.current.getBoundingClientRect().bottom;
    setMenuPlace({ ...placeBeside(rect, below, size, viewport), width });
  }, [rect]);

  function save() {
    const next = title.trim();
    if (next && next !== card.title) actions.edit({ title: next });
    props.onClose();
  }

  const toggle = (kind: PopoverKind, anchor: HTMLElement) =>
    setPopover((open) => (open?.kind === kind ? null : { kind, anchor }));

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) save();
      }}
    >
      <div ref={editor} className={styles.card} style={{ left: rect.left, top: rect.top, width: rect.width }}>
        <CardFace
          card={card}
          title={
            <textarea
              ref={field}
              className={styles.field}
              rows={1}
              maxLength={TITLE_MAX}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              value={title}
              aria-label="Título de la tarjeta"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  save();
                }
              }}
            />
          }
        />
        <div className={styles.buttons}>
          <button type="button" className={styles.save} onClick={save}>
            Guardar
          </button>
          <button type="button" className={styles.cancel} onClick={props.onClose}>
            Cancelar
          </button>
        </div>
      </div>

      <div
        ref={menu}
        className={styles.menu}
        data-elevation="overlay"
        style={{ width: MENU_WIDTH, ...menuPlace, visibility: menuPlace ? "visible" : "hidden" }}
      >
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            save();
            props.onOpenCard();
          }}
        >
          Abrir tarjeta
        </button>
        {BUTTONS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            className={styles.action}
            aria-expanded={popover?.kind === kind}
            onClick={(event) => toggle(kind, event.currentTarget)}
          >
            {label}
          </button>
        ))}
        <hr className={styles.divider} />
        <button type="button" className={styles.action} data-danger onClick={props.onDelete}>
          Eliminar
        </button>
      </div>

      {popover && (
        <CardPopover
          kind={popover.kind}
          anchor={popover.anchor}
          card={card}
          today={props.today}
          requesters={props.requesters}
          actions={{
            edit: actions.edit,
            move: (to) => {
              actions.move(to);
              props.onClose();
            },
          }}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
