export const LISTS = ["pendiente", "esta_semana", "en_curso", "hecho"] as const;
export type ListId = (typeof LISTS)[number];

export const LIST_TITLES: Record<ListId, string> = {
  pendiente: "Pendiente",
  esta_semana: "Esta semana",
  en_curso: "En curso",
  hecho: "Hecho",
};

/** Trello's six label colors. The database stores the name, never the values. */
export const LABEL_COLORS = ["green", "yellow", "orange", "red", "purple", "blue"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
  green: "Verde",
  yellow: "Amarillo",
  orange: "Naranja",
  red: "Rojo",
  purple: "Morado",
  blue: "Azul",
};

/** Returns the fill and text tokens for a label. */
export function labelStyle(color: LabelColor): { background: string; color: string } {
  return { background: `var(--label-${color}-bg)`, color: `var(--label-${color}-text)` };
}

export const TITLE_MAX = 200;
export const CHECKLIST_MAX = 100;
export const CHECKLIST_TEXT_MAX = 200;

/** An owner manages the workspace and its members. A member works on the board. */
export const WORKSPACE_ROLES = ["owner", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const ROLE_TITLES: Record<WorkspaceRole, string> = {
  owner: "Propietario",
  member: "Miembro",
};

export const WORKSPACE_NAME_MAX = 60;

export type Label = { id: string; name: string; color: LabelColor };

export type ChecklistItem = { text: string; done: boolean };

export type Card = {
  id: string;
  title: string;
  description: string;
  /** The card's label, or null. A card without a label shows no stripe. */
  labelId: string | null;
  requester: string | null;
  checklist: ChecklistItem[];
  list: ListId;
  position: number;
  /** Lima date, `YYYY-MM-DD`. Set exactly when the card is in Hecho. */
  doneDate: string | null;
};

export type Board = {
  today: string;
  week: string;
  cards: Card[];
  labels: Label[];
  olderWeek: string | null;
  requesters: string[];
};

export type DoneWeek = {
  week: string;
  cards: Card[];
  olderWeek: string | null;
};

/** A workspace as its member sees it. */
export type Workspace = { id: string; name: string; role: WorkspaceRole };

/** The signed-in user and every workspace they belong to, oldest first. The first is their default. */
export type Me = { id: string; name: string; email: string; workspaces: Workspace[] };

/** What Ajustes shows about the current workspace. */
export type WorkspaceSettings = Workspace & { reportToken: string };

export type Member = { id: string; name: string; email: string; role: WorkspaceRole };

/** A personal API token as Ajustes lists it. Times are unix seconds. */
export type ApiToken = { id: string; name: string; createdAt: number; lastUsedAt: number | null };

/** The one response that carries the secret. It is never stored or shown again. */
export type IssuedToken = ApiToken & { token: string };

/** A card as a script reads it: the label by name. */
export type ApiCard = Card & { label: string | null };
