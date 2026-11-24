import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Sheet.module.css";
import { useEscape } from "./useEscape";

const MARGIN = 8;

/** Arrow keys move focus through the items of a menu or list inside a sheet. */
export function sheetKeys(event: KeyboardEvent) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      "[role^='menuitem'], [role='option'], [role='radio']",
    ),
  ];
  if (items.length === 0) return;
  event.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  items[(at + step + items.length) % items.length]?.focus();
}

/**
 * A panel that is a bottom sheet under a scrim on narrow screens and a popover
 * under `anchor` on wide ones. Escape or a press outside closes it; focus goes
 * in on open and back to the trigger on close.
 */
export function Sheet(props: {
  anchor: HTMLElement;
  label: string;
  /** The side the desktop popover aligns to. */
  align?: "left" | "right";
  role?: "dialog" | "menu";
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEscape(props.onClose);

  useLayoutEffect(() => {
    const el = panel.current!;
    const anchor = props.anchor.getBoundingClientRect();
    const width = el.offsetWidth;
    const left =
      props.align === "right"
        ? anchor.right - width
        : Math.min(Math.max(MARGIN, anchor.left), innerWidth - width - MARGIN);
    el.style.left = `${left}px`;
    el.style.top = `${anchor.bottom + 6}px`;
    const target = el.querySelector<HTMLElement>("[data-autofocus]") ?? el;
    target.focus();
    return () => props.anchor.focus();
    // The anchor and its position are fixed for the life of the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className={styles.scrim} onPointerDown={props.onClose} />
      <div
        ref={panel}
        className={styles.panel}
        role={props.role ?? "dialog"}
        aria-label={props.label}
        data-elevation="overlay"
        tabIndex={-1}
        onKeyDown={sheetKeys}
      >
        <div className={styles.grabber} aria-hidden />
        {props.children}
      </div>
    </>
  );
}
