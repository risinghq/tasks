import type { Card } from "../shared/model";
import { go, useLocation } from "./useLocation";

/**
 * `label` is a label id, `NO_LABEL` for cards without one, or empty for any.
 * `assignee` is a member id, `NO_ASSIGNEE` for unassigned cards, or empty for any.
 */
export type Filter = { q: string; label: string; assignee: string; requester: string };

export const NO_LABEL = "none";
export const NO_ASSIGNEE = "none";

const PARAMS = { q: "q", label: "etiqueta", assignee: "responsable", requester: "solicitante" } as const;

const EMPTY: Filter = { q: "", label: "", assignee: "", requester: "" };

export function useFilter() {
  const url = useLocation();
  const filter: Filter = {
    q: url.searchParams.get(PARAMS.q) ?? "",
    label: url.searchParams.get(PARAMS.label) ?? "",
    assignee: url.searchParams.get(PARAMS.assignee) ?? "",
    requester: url.searchParams.get(PARAMS.requester) ?? "",
  };

  function set(next: Filter) {
    const params = new URLSearchParams(url.search);
    for (const key of Object.keys(PARAMS) as (keyof Filter)[]) {
      if (next[key]) params.set(PARAMS[key], next[key]);
      else params.delete(PARAMS[key]);
    }
    const query = params.toString();
    go(url.pathname + (query ? `?${query}` : ""));
  }

  return {
    filter,
    active: criteria(filter) > 0,
    set,
    clear: () => set(EMPTY),
  };
}

/** How many of the filter's fields narrow the board. */
export function criteria(filter: Filter): number {
  return Object.values(filter).filter(Boolean).length;
}

export function matches(card: Card, filter: Filter): boolean {
  const text = filter.q.trim().toLowerCase();
  if (text && !`${card.title}\n${card.description}`.toLowerCase().includes(text)) return false;
  if (filter.label === NO_LABEL ? card.labelId !== null : filter.label && card.labelId !== filter.label)
    return false;
  if (
    filter.assignee === NO_ASSIGNEE
      ? card.assigneeId !== null
      : filter.assignee && card.assigneeId !== filter.assignee
  )
    return false;
  if (filter.requester && card.requester !== filter.requester) return false;
  return true;
}
