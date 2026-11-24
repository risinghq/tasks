import { and, desc, eq, sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { ApiToken, IssuedToken, Workspace } from "../shared/model";
import { randomToken, sha256 } from "./crypto";
import { connect, type Db } from "./db/client";
import { apiTokens } from "./db/schema";
import { nowSeconds } from "./clock";
import { countAttempt } from "./login-limit";
import type { AppEnv } from "./session";
import { findUser, type User } from "./users";
import { membership } from "./workspaces";

/** Makes a token recognizable in a leaked file or a secret scanner. */
const PREFIX = "tasks_";

const tokenColumns = {
  id: apiTokens.id,
  name: apiTokens.name,
  createdAt: apiTokens.createdAt,
  lastUsedAt: apiTokens.lastUsedAt,
};

/** Makes a token that acts for the user in one workspace. The returned secret is the only copy. */
export async function issueToken(
  db: Db,
  userId: string,
  workspaceId: string,
  name: string,
): Promise<IssuedToken> {
  const token = PREFIX + randomToken();
  const row = await db
    .insert(apiTokens)
    .values({
      id: crypto.randomUUID(),
      userId,
      workspaceId,
      name,
      tokenHash: await sha256(token),
      createdAt: nowSeconds(),
    })
    .returning(tokenColumns)
    .get();
  return { ...row, token };
}

export function listTokens(db: Db, userId: string, workspaceId: string): Promise<ApiToken[]> {
  return db
    .select(tokenColumns)
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), eq(apiTokens.workspaceId, workspaceId)))
    .orderBy(desc(apiTokens.createdAt), apiTokens.id);
}

/** Deletes one of the user's tokens for this workspace. Returns false when they have none with that id. */
export async function revokeToken(db: Db, userId: string, workspaceId: string, id: string): Promise<boolean> {
  const revoked = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId), eq(apiTokens.workspaceId, workspaceId)))
    .returning({ id: apiTokens.id });
  return revoked.length > 0;
}

/**
 * The user and workspace a token acts for, or undefined. A token whose user
 * no longer belongs to its workspace matches nothing. A match stamps the
 * token's last use.
 */
async function ownerOfToken(
  db: Db,
  token: string,
): Promise<{ user: User; workspace: Workspace } | undefined> {
  const used = await db
    .update(apiTokens)
    .set({ lastUsedAt: nowSeconds() })
    .where(
      and(
        eq(apiTokens.tokenHash, await sha256(token)),
        sql`exists (
          select 1 from workspace_members
          where workspace_members.user_id = ${apiTokens.userId}
            and workspace_members.workspace_id = ${apiTokens.workspaceId}
        )`,
      ),
    )
    .returning({ userId: apiTokens.userId, workspaceId: apiTokens.workspaceId })
    .get();
  if (!used) return undefined;
  const [user, workspace] = await Promise.all([
    findUser(db, used.userId),
    membership(db, used.workspaceId, used.userId),
  ]);
  return user && workspace ? { user, workspace } : undefined;
}

const bearerOf = (header: string | undefined): string | undefined => header?.match(/^Bearer +(\S+)$/i)?.[1];

/**
 * Signs a request in with `Authorization: Bearer <token>` and leaves the owner
 * in `c.get("user")` and the token's workspace in `c.get("workspace")`. The
 * cookie is not read, so a request without a bearer is a 401. Only a presented
 * token that matches nothing counts as a bad attempt: the sixth from one
 * address in 15 minutes is a 429, as at sign-in.
 */
export const requireToken = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerOf(c.req.header("Authorization"));
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const db = connect(c.env);
  const owner = await ownerOfToken(db, token);
  if (owner) {
    c.set("user", owner.user);
    c.set("workspace", owner.workspace);
    return next();
  }
  const address = c.req.header("CF-Connecting-IP") ?? "unknown";
  const lockedUntil = await countAttempt(db, `bearer:${address}`);
  if (lockedUntil === null) return c.json({ error: "unauthorized" }, 401);
  c.header("Retry-After", String(Math.max(1, lockedUntil - nowSeconds())));
  return c.json({ error: "too many attempts" }, 429);
});
