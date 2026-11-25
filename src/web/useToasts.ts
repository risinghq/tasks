import { useRef, useState } from "react";

export type Toast = {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
};

export type ToastOptions = { action?: Toast["action"]; ms?: number; onClose?: () => void };

/**
 * The board's toasts. A toast with `ms` closes itself; `onClose` runs when it
 * closes by timer or by the user, not when its action ran.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const keys = useRef(0);
  const timers = useRef(new Map<number, number>());
  const closers = useRef(new Map<number, () => void>());

  function close(id: number, by: "timer" | "user" | "action") {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const onClose = closers.current.get(id);
    closers.current.delete(id);
    setToasts((current) => current.filter((item) => item.id !== id));
    if (by !== "action") onClose?.();
  }

  function show(text: string, options: ToastOptions = {}): number {
    const id = ++keys.current;
    setToasts((current) => [...current, { id, text, action: options.action }]);
    if (options.onClose) closers.current.set(id, options.onClose);
    if (options.ms)
      timers.current.set(
        id,
        window.setTimeout(() => close(id, "timer"), options.ms),
      );
    return id;
  }

  return { toasts, show, close };
}
