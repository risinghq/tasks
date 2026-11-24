import { useEffect, useRef } from "react";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

export type Hover = { card: string | null; composer: string | null };

type Handlers = {
  composer: (list: string) => void;
  quickEdit: (cardId: string) => void;
  filter: () => void;
  clearFilter: () => void;
  help: () => void;
};

/**
 * Single-key shortcuts. A key acts on the card or list under the pointer, else on
 * the focused card. `blocked` turns them off while a dialog or popover is open.
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
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
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
