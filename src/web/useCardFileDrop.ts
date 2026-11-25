import { useState, type DragEvent } from "react";
import { carriesFiles } from "./noteInput";

const cardUnder = (target: EventTarget | null): string | null =>
  (target instanceof Element && target.closest<HTMLElement>("[data-card-id]")?.dataset.cardId) || null;

/**
 * Files dropped on a card on the board become its notes. `over` names the card
 * the files hover. Spread `props` onto the page element.
 */
export function useCardFileDrop(onDrop: (cardId: string, files: File[]) => void) {
  const [over, setOver] = useState<string | null>(null);

  return {
    over,
    props: {
      onDragOver(event: DragEvent) {
        if (!carriesFiles(event.dataTransfer)) return;
        // Files let go anywhere else would make the browser leave the board to show them.
        event.preventDefault();
        const card = cardUnder(event.target);
        event.dataTransfer.dropEffect = card ? "copy" : "none";
        setOver(card);
      },
      onDragLeave(event: DragEvent) {
        if (event.relatedTarget === null) setOver(null);
      },
      onDrop(event: DragEvent) {
        if (!carriesFiles(event.dataTransfer)) return;
        event.preventDefault();
        setOver(null);
        const card = cardUnder(event.target);
        const files = [...event.dataTransfer.files];
        if (card && files.length) onDrop(card, files);
      },
    },
  };
}
