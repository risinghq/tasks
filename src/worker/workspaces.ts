import { and, asc, eq, sql } from "drizzle-orm";
import type { Member, Workspace, WorkspaceRole } from "../shared/model";
import { nowSeconds } from "./clock";
import { batch, isUniqueViolation, type Db } from "./db/client";
import { cards, users, workspaceMembers, workspaces } from "./db/schema";

/**
 * Creates a user and their personal workspace in one transaction. The personal
 * workspace has the user's own id, so a default board needs no lookup, and the
 * user's name, so a member's menu and a report tell two people's boards apart.
 */
export async function createPersonalWorkspace(
  db: Db,
  person: { id: string; email: string; name: string },
): Promise<void> {
  await batch(db, [
    db.insert(users).values(person),
    db.insert(workspaces).values({ id: person.id, name: person.name, createdAt: nowSeconds() }),
    db.insert(workspaceMembers).values({ workspaceId: person.id, userId: person.id, role: "owner" }),
  ]);
}

/** Every workspace the user belongs to, with its open-card count. Their personal one comes first. */
export function workspacesOf(db: Db, userId: string): Promise<(Workspace & { openCount: number })[]> {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: workspaceMembers.role,
      openCount: sql<number>`(select count(*) from ${cards} where ${cards.workspaceId} = ${workspaces.id} and ${cards.list} <> 'hecho')`,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(sql`${workspaces.id} <> ${userId}`, asc(workspaces.createdAt), asc(workspaces.name));
}

/** The workspace if the user belongs to it. */
export function membership(db: Db, workspaceId: string, userId: string): Promise<Workspace | undefined> {
  return db
    .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .get();
}

/** Makes a workspace the user owns. */
export async function createWorkspace(db: Db, userId: string, name: string): Promise<Workspace> {
  const id = crypto.randomUUID();
  await batch(db, [
    db.insert(workspaces).values({ id, name, createdAt: nowSeconds() }),
    db.insert(workspaceMembers).values({ workspaceId: id, userId, role: "owner" }),
  ]);
  return { id, name, role: "owner" };
}

export async function renameWorkspace(db: Db, id: string, name: string): Promise<void> {
  await db.update(workspaces).set({ name }).where(eq(workspaces.id, id));
}

/** Deletes the workspace with its cards, labels, members and tokens. */
export async function deleteWorkspace(db: Db, id: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, id));
}

const memberColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: workspaceMembers.role,
};

export function listMembers(db: Db, workspaceId: string): Promise<Member[]> {
  return db
    .select(memberColumns)
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(users.name), asc(users.id));
}

export function findMember(db: Db, workspaceId: string, userId: string): Promise<Member | undefined> {
  return db
    .select(memberColumns)
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .get();
}

/** Adds the user to the workspace. Returns false when they already belong to it. */
export async function addMember(
  db: Db,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<boolean> {
  try {
    await db.insert(workspaceMembers).values({ workspaceId, userId, role });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/**
 * True when another owner exists, as a SQL condition on the same statement.
 * Two owners demoting or removing each other at once cannot leave a workspace
 * without one.
 */
const otherOwner = (workspaceId: string, userId: string) =>
  sql`exists (
    select 1 from workspace_members other
    where other.workspace_id = ${workspaceId} and other.user_id <> ${userId} and other.role = 'owner'
  )`;

/** Changes a member's role. Returns false when that would leave no owner. */
export async function setRole(
  db: Db,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<boolean> {
  const changed = await db
    .update(workspaceMembers)
    .set({ role })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        role === "owner" ? undefined : otherOwner(workspaceId, userId),
      ),
    )
    .returning({ userId: workspaceMembers.userId });
  return changed.length > 0;
}

/**
 * Removes a member with their tokens, their report link and their assignments
 * in this workspace. Returns false when that would leave no owner.
 */
export async function removeMember(db: Db, workspaceId: string, userId: string): Promise<boolean> {
  const removed = await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        otherOwner(workspaceId, userId),
      ),
    )
    .returning({ userId: workspaceMembers.userId });
  if (removed.length === 0) return false;
  await batch(db, [
    sql`delete from api_tokens where workspace_id = ${workspaceId} and user_id = ${userId}`,
    sql`delete from report_links where workspace_id = ${workspaceId} and member_id = ${userId}`,
    sql`update cards set assignee_id = null where workspace_id = ${workspaceId} and assignee_id = ${userId}`,
  ]);
  return true;
}
