import { env, exports } from "cloudflare:workers";
import { vi } from "vitest";
import type {
  ApiToken,
  Board,
  Card,
  IssuedToken,
  Label,
  LabelColor,
  Me,
  Member,
  ReportLink,
  Workspace,
  WorkspaceRole,
} from "../src/shared/model";
import { SESSION_COOKIE, sessionCookieValue } from "../src/worker/session-cookie";

type Init = {
  method?: string;
  json?: unknown;
  cookie?: string;
  bearer?: string;
  workspace?: string;
  /** The client address Cloudflare reports. */
  address?: string;
  form?: Record<string, string>;
  raw?: { body: string; type: string };
};

export function send(path: string, init: Init = {}): Promise<Response> {
  const headers = new Headers();
  if (init.cookie) headers.set("Cookie", init.cookie);
  if (init.bearer) headers.set("Authorization", `Bearer ${init.bearer}`);
  if (init.workspace) headers.set("X-Workspace", init.workspace);
  if (init.address) headers.set("CF-Connecting-IP", init.address);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  if (init.raw) headers.set("Content-Type", init.raw.type);
  const body = init.raw
    ? init.raw.body
    : init.form
      ? new URLSearchParams(init.form)
      : init.json !== undefined
        ? JSON.stringify(init.json)
        : undefined;
  return exports.default.fetch(
    new Request(`https://tasks.test${path}`, {
      method: init.method ?? "GET",
      headers,
      body,
      redirect: "manual",
    }),
  );
}

/** Freezes the clock. Instants are UTC, so Lima is five hours behind. */
export function setNow(iso: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

export const ADMIN = { email: "ana@example.com", name: "Ana Prueba" };
export const MEMBER = { email: "beto@example.com", name: "Beto Prueba" };

export const cookieOf = (res: Response): string => res.headers.getSetCookie()[0]!.split(";")[0]!;

/** The session cookie of a user, forged with the test secret. The Google callback is tested on its own. */
export async function signIn(userId: string, version = 0): Promise<string> {
  return `${SESSION_COOKIE}=${await sessionCookieValue(env.SESSION_SECRET, userId, version)}`;
}

/** A signed-in user. Every call carries their cookie, and the workspace when one is given. */
export function clientFor(cookie: string, workspace?: string) {
  const call = async <T>(path: string, method = "GET", json?: unknown): Promise<T> => {
    const res = await send(path, { method, json, cookie, workspace });
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  };
  return {
    cookie,
    workspace,
    call,
    /** The status of a call, for the ones that must fail. */
    status: async (path: string, method = "GET", json?: unknown) =>
      (await send(path, { method, json, cookie, workspace })).status,
    /** The same user, working in another workspace. */
    in: (id: string) => clientFor(cookie, id),
    board: () => call<Board>("/api/board"),
    add: (title: string, list: Card["list"]) => call<Card>("/api/cards", "POST", { title, list }),
    move: (id: string, move: { list: Card["list"]; index?: number; doneDate?: string }) =>
      call<Card>(`/api/cards/${id}/move`, "POST", { index: 0, ...move }),
    edit: (id: string, patch: Record<string, unknown>) => call<Card>(`/api/cards/${id}`, "PATCH", patch),
    addLabel: (name: string, color: LabelColor = "green") =>
      call<Label>("/api/labels", "POST", { name, color }),
    me: () => call<Me>("/api/me"),
    reportLinks: () => call<ReportLink[]>("/api/report-links"),
    /** The token of the whole-workspace link, which `GET /api/report-links` lists first. */
    wholeReportToken: async () => (await call<ReportLink[]>("/api/report-links"))[0]!.token,
    createWorkspace: (name: string) => call<Workspace>("/api/workspaces", "POST", { name }),
    tokens: () => call<ApiToken[]>("/api/tokens"),
    makeToken: (name: string) => call<IssuedToken>("/api/tokens", "POST", { name }),
    members: () => call<Member[]>("/api/members"),
    addMember: (email: string, role: WorkspaceRole = "member", name?: string) =>
      call<Member>("/api/members", "POST", { email, role, name }),
  };
}

export type Client = ReturnType<typeof clientFor>;

/** Makes the account a first Google sign-in makes (the user and their personal workspace) and signs in. */
export async function signUp(person: { email: string; name: string }): Promise<Client> {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)").bind(
      id,
      person.email,
      person.name,
    ),
    env.DB.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, 'Personal', unixepoch())").bind(
      id,
    ),
    env.DB.prepare("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')").bind(
      id,
      id,
    ),
  ]);
  return clientFor(await signIn(id));
}

export const admin = (): Promise<Client> => signUp(ADMIN);

/** A second, unrelated account with their own personal board. */
export const member = (who = MEMBER): Promise<Client> => signUp(who);

/** A person the owner added to their workspace, signed in and working in it. */
export async function joined(owner: Client, role: WorkspaceRole = "member", who = MEMBER): Promise<Client> {
  const added = await owner.addMember(who.email, role, who.name);
  const workspace = owner.workspace ?? (await owner.me()).id;
  return clientFor(await signIn(added.id), workspace);
}

export async function idOf(adder: Client, email: string): Promise<string> {
  return (await adder.members()).find((m) => m.email === email)!.id;
}
