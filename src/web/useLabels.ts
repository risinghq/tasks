import { useState } from "react";
import type { Label } from "../shared/model";
import type { CreateLabel, UpdateLabel } from "../shared/schemas";
import { api, ApiError } from "./api";

/** A saved label, or the message that says why it was not. */
export type LabelResult = { label: Label } | { error: string };

const byName = (labels: Label[]) => labels.toSorted((a, b) => a.name.localeCompare(b.name, "es"));

function labelError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return "Ya existe una etiqueta con ese nombre.";
  console.error(error);
  return "No se pudo guardar la etiqueta.";
}

/**
 * The workspace's labels, sorted by name. Labels are written at once rather
 * than queued: a card edit that names a new label must find it on the server.
 * The label picker sits in a modal that hides the toasts, so each call answers
 * with the message to show.
 */
export function useLabels(onRemoved: (id: string) => void) {
  const [labels, setLabels] = useState<Label[]>([]);

  return {
    labels,
    load: (loaded: Label[]) => setLabels(byName(loaded)),

    async createLabel(input: Omit<CreateLabel, "id">): Promise<LabelResult> {
      try {
        const label = await api.createLabel({ id: crypto.randomUUID(), ...input });
        setLabels((current) => byName([...current, label]));
        return { label };
      } catch (error) {
        return { error: labelError(error) };
      }
    },

    async updateLabel(id: string, patch: UpdateLabel): Promise<LabelResult> {
      try {
        const label = await api.updateLabel(id, patch);
        setLabels((current) => byName(current.map((known) => (known.id === id ? label : known))));
        return { label };
      } catch (error) {
        return { error: labelError(error) };
      }
    },

    /** The server clears the label from its cards; `onRemoved` does the same on screen. */
    async removeLabel(id: string): Promise<{ error: string } | null> {
      try {
        await api.removeLabel(id);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) return { error: labelError(error) };
      }
      setLabels((current) => current.filter((label) => label.id !== id));
      onRemoved(id);
      return null;
    },
  };
}
