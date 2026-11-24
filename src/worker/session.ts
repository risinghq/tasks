import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { safeEqualText } from "./crypto";
import { connect } from "./db/client";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, sessionCookieValue, signatureOf } from "./session-cookie";
import type { Workspace } from "../shared/model";
import { findUser, type User } from "./users";
import { membership } from "./workspaces";

export type AppEnv = { Bindings: Env; Variables: { user: User; workspace: Workspace } };

type AppContext = Context<AppEnv>;

/** Signs the browser in as a user at their current session version. */
export async function startSession(c: AppContext, userId: string, version: number): Promise<void> {
  setCookie(c, SESSION_COOKIE, await sessionCookieValue(c.env.SESSION_SECRET, userId, version), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function endSession(c: AppContext): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
}

/**
 * The user the cookie signs in, or undefined. The cookie carries the user id
 * and a session version. A session version different from the stored one
 * is signed out.
 */
export async function sessionUser(c: AppContext): Promise<User | undefined> {
  const value = getCookie(c, SESSION_COOKIE);
  if (!value) return undefined;
  const [userId, version, expires, signature] = value.split(".");
  if (!userId || !version || !expires || !signature || Number(expires) < Date.now() / 1000) {
    return undefined;
  }
  const expected = await signatureOf(c.env.SESSION_SECRET, userId, Number(version), Number(expires));
  if (!safeEqualText(signature, expected)) return undefined;
  const user = await findUser(connect(c.env), userId);
  if (!user || user.sessionVersion !== Number(version)) return undefined;
  return user;
}

/** Reads the user row once and leaves it in `c.get("user")`. API calls get 401. Page loads go to the login page. */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const user = await sessionUser(c);
  if (user) {
    c.set("user", user);
    return next();
  }
  if (c.req.path.startsWith("/api/")) return c.json({ error: "unauthorized" }, 401);
  return c.redirect("/login");
});

/**
 * Used after `requireSession`. Picks the workspace from the `X-Workspace`
 * header, or the user's personal one, and leaves it in `c.get("workspace")`.
 * A workspace the user does not belong to gets 403, the same as a missing one.
 */
export const requireWorkspace = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  const workspace = await membership(connect(c.env), c.req.header("X-Workspace") || user.id, user.id);
  if (!workspace) return c.json({ error: "forbidden" }, 403);
  c.set("workspace", workspace);
  return next();
});

/** Used after `requireWorkspace`. */
export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("workspace").role !== "owner") return c.json({ error: "forbidden" }, 403);
  return next();
});
