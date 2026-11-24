const KEY = "tasks.workspace";

/** The workspace this browser works in. Without one, the server uses the user's personal workspace. */
export const storedWorkspace = (): string | null => localStorage.getItem(KEY);

export function chooseWorkspace(id: string | null): void {
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
}
