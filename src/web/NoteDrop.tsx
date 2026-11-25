import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import styles from "./NoteDrop.module.css";
import { carriesFiles, isTyping, noteContent } from "./noteInput";
import type { Notes } from "./useNotes";

/**
 * Paste and drop anywhere on the card back. A paste into a text field stays
 * there; anywhere else it becomes a note. `dragged` counts the files that
 * hover, 0 when none do; a browser keeps their names until the drop.
 */
export function useNoteTarget(notes: Notes) {
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

/** The cover that says where `dragged` files will land. */
export function NoteDrop({ dragged }: { dragged: number }) {
  if (dragged === 0) return null;
  return (
    <div className={styles.drop} aria-hidden>
      <div className={styles.box}>
        <span className={styles.title}>Suelta para añadir a Notas</span>
        <span className={styles.hint}>
          {dragged === 1
            ? "Se guarda como nota nueva"
            : `${dragged} archivos · cada uno se guarda como nota nueva`}
        </span>
      </div>
    </div>
  );
}
