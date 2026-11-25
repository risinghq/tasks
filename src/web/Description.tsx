import { useRef, useState } from "react";
import styles from "./Description.module.css";
import { useAutosize } from "./useAutosize";
import { useEscape } from "./useEscape";

/**
 * The card's description. The text is the edit target: focus it to type, blur
 * or Ctrl+Enter saves, Escape restores.
 */
export function Description(props: { value: string; onSave: (description: string) => void }) {
  const [draft, setDraft] = useState(props.value);
  const [focused, setFocused] = useState(false);
  const field = useAutosize();
  const restored = useRef(false);

  useEscape(
    () => {
      restored.current = true;
      setDraft(props.value);
      field.current?.blur();
    },
    focused && draft !== props.value,
  );

  const [seen, setSeen] = useState(props.value);
  if (seen !== props.value) {
    setSeen(props.value);
    setDraft(props.value);
  }

  return (
    <div className={styles.section}>
      <span className={styles.label}>Descripción</span>
      <textarea
        ref={field}
        className={styles.field}
        rows={1}
        maxLength={10_000}
        value={draft}
        aria-label="Descripción"
        placeholder="Añade una descripción…"
        onFocus={() => setFocused(true)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
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
          if (draft !== props.value) props.onSave(draft);
        }}
      />
    </div>
  );
}
