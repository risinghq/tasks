import { useEffect, useRef } from "react";
import { isTyping } from "./noteInput";

export type Hover = { card: string | null; composer: string | null };

type Handlers = {
  composer: (list: string) => void;
  quickEdit: (cardId: string) => void;
  note: (cardId: string) => void;
  paste: (cardId: string, data: DataTransfer | null) => void;
  filter: () => void;
  clearFilter: () => void;
  help: () => void;
};

/**
 * Single-key shortcuts and paste. Each acts on the card or list under the
 * pointer, else on the focused card. `blocked` turns them off while a dialog
 * or popover is open.
 */
export function useShortcuts(blocked: boolean, handlers: Handlers) {
  const hover = useRef<Hover>({ card: null, composer: null });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || blocked) return;
      const focused = document.activeElement?.closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
      const card = hover.current.card ?? focused ?? null;
      const actions: Record<string, () => void> = {
        n: () => handlers.composer(hover.current.composer ?? "en_curso"),
        e: () => card && handlers.quickEdit(card),
        a: () => card && handlers.note(card),
        f: handlers.filter,
        x: handlers.clearFilter,
        "?": handlers.help,
      };
      const act = actions[event.key];
      if (!act) return;
      // The key must not reach the field that the action focuses.
      event.preventDefault();
      act();
    }
    // A paste outside a field goes to the card under the pointer, else the focused one.
    function onPaste(event: ClipboardEvent) {
      if (isTyping(event.target) || blocked) return;
      const focused = document.activeElement?.closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
      const card = hover.current.card ?? focused;
      if (!card) return;
      event.preventDefault();
      handlers.paste(card, event.clipboardData);
    }
    addEventListener("keydown", onKeyDown);
    addEventListener("paste", onPaste);
    return () => {
      removeEventListener("keydown", onKeyDown);
      removeEventListener("paste", onPaste);
    };
  });

  /** Tracks what the pointer is over. Spread onto the page element. */
  return {
    onMouseOver(event: React.MouseEvent) {
      const target = event.target as HTMLElement;
      hover.current = {
        card: target.closest<HTMLElement>("[data-card-id]")?.dataset.cardId ?? null,
        composer: target.closest<HTMLElement>("[data-composer]")?.dataset.composer ?? null,
      };
    },
    onMouseLeave() {
      hover.current = { card: null, composer: null };
    },
  };
}
