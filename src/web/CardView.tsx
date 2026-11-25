import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Check, Pencil } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { labelStyle, type Card } from "../shared/model";
import styles from "./CardView.module.css";
import { useUi } from "./ui";

/**
 * The card's completion control: a circle that shows on hover, or the green
 * check of a card in Hecho. Without `onToggle` it is only a picture.
 */
export function Completion({
  done,
  size,
  onToggle,
}: {
  done: boolean;
  size: "card" | "back";
  onToggle?: () => void;
}) {
  const icon = done ? <Check size={size === "card" ? 10 : 24} strokeWidth={3} aria-hidden /> : null;
  if (!onToggle) {
    return done ? (
      <span className={styles.complete} data-done data-size={size}>
        {icon}
      </span>
    ) : null;
  }
  return (
    <button
      type="button"
      className={styles.complete}
      data-done={done}
      data-size={size}
      aria-label={done ? "Mover a En curso" : "Marcar como hecha"}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {icon}
    </button>
  );
}

/** A label as the board shows it: a colored dot and its name. */
export function LabelDot({ color }: { color: Parameters<typeof labelStyle>[0] }) {
  return <span className={styles.dot} style={{ background: labelStyle(color).background }} />;
}

/** The card as it looks on the board. `title` replaces the title text, for quick
 * edit. `onToggleDone` adds the completion circle. */
export function CardFace({
  card,
  title,
  lifted,
  onToggleDone,
}: {
  card: Card;
  title?: ReactNode;
  lifted?: boolean;
  onToggleDone?: () => void;
}) {
  const { labels, members } = useUi();
  const label = labels.find((known) => known.id === card.labelId);
  const assignee = members.length > 1 ? members.find((member) => member.id === card.assigneeId) : undefined;
  const total = card.checklist.length;
  const checked = card.checklist.filter((item) => item.done).length;
  const hasDescription = card.description.trim() !== "";
  const hasMeta = label || card.requester || total > 0 || hasDescription || assignee;
  const done = card.list === "hecho";

  return (
    <div className={styles.face} data-lifted={lifted} data-elevation={lifted ? "overlay" : "raised"}>
      <div className={styles.titleRow} data-done={done}>
        <Completion done={done} size="card" onToggle={onToggleDone} />
        <div className={styles.title} data-done={done}>
          {title ?? card.title}
        </div>
      </div>
      {hasMeta && (
        <div className={styles.meta}>
          {label && (
            <span className={styles.metaItem} data-label={label.id}>
              <LabelDot color={label.color} />
              {label.name}
            </span>
          )}
          {card.requester && (
            <span className={styles.metaItem} data-strong>
              <span className={styles.avatar} aria-hidden>
                {card.requester[0]}
              </span>
              {card.requester}
            </span>
          )}
          {total > 0 && (
            <span className={styles.metaItem} data-complete={checked === total}>
              <span
                className={styles.ring}
                style={{ "--p": `${(checked / total) * 100}%` } as CSSProperties}
                aria-hidden
              />
              {checked}/{total}
            </span>
          )}
          {hasDescription && (
            <span className={styles.metaItem} data-faint>
              <AlignLeft size={14} aria-label="Tiene descripción" />
            </span>
          )}
          {assignee && (
            <span
              className={styles.assignee}
              title={`Responsable: ${assignee.name}`}
              role="img"
              aria-label={`Responsable: ${assignee.name}`}
            >
              {assignee.name[0]}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function SortableCard({ card }: { card: Card }) {
  const ui = useUi();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={styles.sortable}
      data-card-id={card.id}
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      role="group"
      aria-label={card.title}
      {...listeners}
      onClick={() => ui.openCard(card.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !isDragging && event.target === event.currentTarget) {
          // The card back focuses its close button. The key press must not reach it.
          event.preventDefault();
          ui.openCard(card.id);
        } else listeners?.onKeyDown?.(event);
      }}
    >
      <CardFace card={card} onToggleDone={() => ui.toggleDone(card.id)} />
      <button
        type="button"
        className={styles.edit}
        aria-label="Editar tarjeta"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          ui.quickEdit(card.id);
        }}
      >
        <Pencil size={16} aria-hidden />
      </button>
    </div>
  );
}
