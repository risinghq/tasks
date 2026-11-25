import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { exit } from "./exit";
import styles from "./Popover.module.css";
import { useEscape } from "./useEscape";

const MARGIN = 8;

type Place = { left: number; top: number; origin: string };

/** A small panel under `anchor`. Escape, the close button or a click elsewhere closes it. */
export function Popover(props: {
  title: string;
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const dismiss = () => exit(ref.current, props.onClose);
  useEscape(dismiss);

  useLayoutEffect(() => {
    const anchor = props.anchor.getBoundingClientRect();
    const height = ref.current?.offsetHeight ?? 0;
    const width = ref.current?.offsetWidth ?? 0;
    const left = Math.min(Math.max(MARGIN, anchor.left), innerWidth - width - MARGIN);
    const below = anchor.bottom + 4;
    const fitsBelow = below + height <= innerHeight - MARGIN;
    const top = fitsBelow ? below : Math.max(MARGIN, anchor.top - height - 4);
    // The panel grows out of the anchor, on whichever side of it the panel sits.
    const originX = Math.min(Math.max(0, anchor.left + anchor.width / 2 - left), width);
    setPlace({ left, top, origin: `${originX}px ${fitsBelow ? "top" : "bottom"}` });
  }, [props.anchor]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !props.anchor.contains(target)) dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  return (
    <div
      ref={ref}
      className={styles.popover}
      data-elevation="overlay"
      role="dialog"
      aria-label={props.title}
      style={{
        left: place?.left,
        top: place?.top,
        transformOrigin: place?.origin,
        visibility: place ? "visible" : "hidden",
      }}
    >
      <header className={styles.header}>
        <h3 className={styles.title}>{props.title}</h3>
        <button type="button" className={styles.close} aria-label="Cerrar" onClick={dismiss}>
          <X size={16} aria-hidden />
        </button>
      </header>
      {props.children}
    </div>
  );
}
