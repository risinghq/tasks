import { and, asc, eq, sql } from "drizzle-orm";
import type { Member, Role } from "../shared/model";
import { randomToken } from "./crypto";
import { isUniqueViolation, type Db } from "./db/client";
import { users } from "./db/schema";

/** The user row a request works with. Read once per request, by `session.ts`. */
export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  sessionVersion: number;
  disabled: boolean;
};

const sessionColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  sessionVersion: users.sessionVersion,
  disabled: users.disabled,
};

type Row = Omit<User, "email"> & { email: string | null };

/** An account with no email has not been claimed and cannot sign in. */
function usable(row: Row | undefined): User | undefined {
  if (!row?.email) return undefined;
  return { ...row, email: row.email };
}

export async function findUser(db: Db, id: string): Promise<User | undefined> {
  return usable(await db.select(sessionColumns).from(users).where(eq(users.id, id)).get());
}

export async function findUserByEmail(db: Db, email: string): Promise<User | undefined> {
  return usable(await db.select(sessionColumns).from(users).where(eq(users.email, email)).get());
}

export async function renameUser(db: Db, id: string, name: string): Promise<void> {
  await db.update(users).set({ name }).where(eq(users.id, id));
}

/** Adds a member who signs in with the Google account that has `email`. Returns undefined when the email already has an account. */
export async function addMember(
  db: Db,
  member: { email: string; name: string; role: Role },
): Promise<Member | undefined> {
  const id = crypto.randomUUID();
  try {
    await db.insert(users).values({ id, ...member });
  } catch (error) {
    if (isUniqueViolation(error)) return undefined;
    throw error;
  }
  return findMember(db, id);
}

export async function reportTokenOf(db: Db, userId: string): Promise<string> {
  const row = await db.select({ token: users.reportToken }).from(users).where(eq(users.id, userId)).get();
  return row!.token;
}

/** Replaces the token with one UPDATE. The previous link stops working at once. */
export async function regenerateReportToken(db: Db, userId: string): Promise<string> {
  const row = await db
    .update(users)
    .set({ reportToken: randomToken() })
    .where(eq(users.id, userId))
    .returning({ token: users.reportToken })
    .get();
  return row!.token;
}

/** The user whose report a token opens. A disabled user's report stays readable by whoever holds the link. */
export async function userByReportToken(
  db: Db,
  token: string,
): Promise<{ id: string; name: string } | undefined> {
  return db.select({ id: users.id, name: users.name }).from(users).where(eq(users.reportToken, token)).get();
}

export async function listMembers(db: Db): Promise<Member[]> {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      disabled: users.disabled,
    })
    .from(users)
    .orderBy(asc(users.name), asc(users.id));
}

export async function findMember(db: Db, id: string): Promise<Member | undefined> {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      disabled: users.disabled,
    })
    .from(users)
    .where(eq(users.id, id))
    .get();
}

/**
 * Changes a member's role or disabled flag. A demotion or a disable applies
 * only while another enabled admin exists, checked in the same statement, so
 * two admins removing each other at once cannot leave the site without one.
 * Returns false when nothing changed.
 */
export async function updateMember(
  db: Db,
  id: string,
  patch: { role?: Role; disabled?: boolean },
): Promise<boolean> {
  if (patch.role === undefined && patch.disabled === undefined) return true;
  const losesAccess = patch.role === "member" || patch.disabled === true;
  const otherAdmin = sql`exists (
    select 1 from users other where other.id <> ${id} and other.role = 'admin' and other.disabled = 0
  )`;
  const changed = await db
    .update(users)
    .set(patch)
    .where(and(eq(users.id, id), losesAccess ? otherAdmin : undefined))
    .returning({ id: users.id });
  return changed.length > 0;
}
