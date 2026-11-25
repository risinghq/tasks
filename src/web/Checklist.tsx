import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { CHECKLIST_MAX, CHECKLIST_TEXT_MAX, type ChecklistItem } from "../shared/model";
import styles from "./Checklist.module.css";
import { useEscape } from "./useEscape";

/** The "Añadir un elemento" composer. It stays open after Enter, ready for the next item. */
function ItemComposer({ onAdd, startOpen }: { onAdd: (text: string) => void; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [draft, setDraft] = useState("");
  useEscape(() => setOpen(false), open);

  if (!open) {
    return (
      <button type="button" className={styles.add} onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden /> Añadir un elemento
      </button>
    );
  }

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  };

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        className={styles.field}
        autoFocus
        rows={2}
        maxLength={CHECKLIST_TEXT_MAX}
        value={draft}
        aria-label="Nuevo elemento"
        placeholder="Añadir un elemento"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary}>
          Añadir
        </button>
        <button type="button" className={styles.cancel} aria-label="Cerrar" onClick={() => setOpen(false)}>
          <X size={16} aria-hidden />
        </button>
      </div>
    </form>
  );
}

export function Checklist(props: {
  items: ChecklistItem[];
  /** Opens the item composer at once, for a checklist the user just asked for. */
  startOpen: boolean;
  onSave: (items: ChecklistItem[]) => void;
}) {
  const { items } = props;
  const [hideDone, setHideDone] = useState(false);
  const done = items.filter((item) => item.done).length;
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  const change = (index: number, patch: Partial<ChecklistItem>) =>
    props.onSave(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <span className={styles.label}>Checklist</span>
        <span className={styles.count}>
          {done} de {items.length}
        </span>
        <span className={styles.spacer} />
        {done > 0 && (
          <button type="button" className={styles.toggle} onClick={() => setHideDone(!hideDone)}>
            {hideDone ? "Mostrar marcados" : "Ocultar marcados"}
          </button>
        )}
      </div>

      <div
        className={styles.bar}
        role="progressbar"
        aria-label="Progreso del checklist"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.fill} style={{ transform: `scaleX(${percent / 100})` }} />
      </div>

      <div className={styles.items}>
        {items.map((item, index) =>
          hideDone && item.done ? null : (
            <button
              key={index}
              type="button"
              role="checkbox"
              aria-checked={item.done}
              className={styles.item}
              onClick={() => change(index, { done: !item.done })}
            >
              <span className={styles.box} data-done={item.done} aria-hidden>
                <Check size={12} strokeWidth={2} />
              </span>
              <span className={styles.itemText} data-done={item.done}>
                {item.text}
              </span>
            </button>
          ),
        )}
      </div>

      {items.length < CHECKLIST_MAX && (
        <ItemComposer
          startOpen={props.startOpen}
          onAdd={(text) => props.onSave([...items, { text, done: false }])}
        />
      )}
    </section>
  );
}
