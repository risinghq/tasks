import type {
  ApiToken,
  Board,
  Card,
  DoneWeek,
  IssuedToken,
  Label,
  ListId,
  Me,
  Member,
  Note,
  ReportLink,
  Workspace,
  WorkspaceRole,
} from "../shared/model";
import type { CreateLabel, CreateReportLink, UpdateCard, UpdateLabel } from "../shared/schemas";
import { chooseWorkspace, storedWorkspace } from "./workspace";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** `body` is sent as JSON, or as multipart when it is form data: the browser then sets the boundary. */
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const workspace = storedWorkspace();
  if (workspace) headers["X-Workspace"] = workspace;
  const init: RequestInit = { method, headers };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  if (res.status === 401) {
    location.assign("/login");
    throw new Error("Sesión vencida");
  }
  if (res.status === 403 && workspace) {
    // The user left or lost that workspace. Fall back to the personal one.
    chooseWorkspace(null);
    location.reload();
    throw new ApiError("Sin acceso al espacio", 403);
  }
  if (!res.ok) throw new ApiError(`${method} ${path}: ${res.status}`, res.status);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export type Placement = { list: ListId; doneDate?: string };

export const api = {
  board: () => request<Board>("/api/board"),
  doneWeek: (week: string) => request<DoneWeek>(`/api/done?week=${week}`),
  card: (id: string) => request<Card>(`/api/cards/${id}`),
  create: (card: { id: string; title: string; list: ListId }) => request<Card>("/api/cards", "POST", card),
  update: (id: string, patch: UpdateCard) => request<Card>(`/api/cards/${id}`, "PATCH", patch),
  move: (id: string, placement: Placement, index: number) =>
    request<Card>(`/api/cards/${id}/move`, "POST", { ...placement, index }),
  remove: (id: string) => request<void>(`/api/cards/${id}`, "DELETE"),
  notes: (cardId: string) => request<Note[]>(`/api/cards/${cardId}/notes`),
  addNote: (cardId: string, text: string) => request<Note>(`/api/cards/${cardId}/notes`, "POST", { text }),
  uploadNote: (cardId: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<Note>(`/api/cards/${cardId}/notes/files`, "POST", form);
  },
  updateNote: (id: string, text: string) => request<Note>(`/api/notes/${id}`, "PATCH", { text }),
  removeNote: (id: string) => request<void>(`/api/notes/${id}`, "DELETE"),
  createLabel: (label: CreateLabel) => request<Label>("/api/labels", "POST", label),
  updateLabel: (id: string, patch: UpdateLabel) => request<Label>(`/api/labels/${id}`, "PATCH", patch),
  removeLabel: (id: string) => request<void>(`/api/labels/${id}`, "DELETE"),
  me: () => request<Me>("/api/me"),
  rename: (name: string) => request<Me>("/api/me", "PATCH", { name }),
  createWorkspace: (name: string) => request<Workspace>("/api/workspaces", "POST", { name }),
  workspace: () => request<Workspace>("/api/workspace"),
  renameWorkspace: (name: string) => request<Workspace>("/api/workspace", "PATCH", { name }),
  deleteWorkspace: () => request<void>("/api/workspace", "DELETE"),
  reportLinks: () => request<ReportLink[]>("/api/report-links"),
  createReportLink: (scope: CreateReportLink) => request<ReportLink>("/api/report-links", "POST", scope),
  regenerateReportLink: (id: string) => request<ReportLink>(`/api/report-links/${id}/token`, "POST"),
  deleteReportLink: (id: string) => request<void>(`/api/report-links/${id}`, "DELETE"),
  tokens: () => request<ApiToken[]>("/api/tokens"),
  createToken: (name: string) => request<IssuedToken>("/api/tokens", "POST", { name }),
  revokeToken: (id: string) => request<void>(`/api/tokens/${id}`, "DELETE"),
  members: () => request<Member[]>("/api/members"),
  addMember: (member: { email: string; role: WorkspaceRole }) =>
    request<Member>("/api/members", "POST", member),
  updateMember: (id: string, role: WorkspaceRole) => request<Member>(`/api/members/${id}`, "PATCH", { role }),
  removeMember: (id: string) => request<void>(`/api/members/${id}`, "DELETE"),
};

/** Sends a delete that the browser finishes even after the page is gone. */
export function removeOnExit(id: string): void {
  const workspace = storedWorkspace();
  void fetch(`/api/cards/${id}`, {
    method: "DELETE",
    keepalive: true,
    headers: workspace ? { "X-Workspace": workspace } : {},
  });
}
