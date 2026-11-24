import { eq } from "drizzle-orm";
import { isUniqueViolation, type Db } from "./db/client";
import { users } from "./db/schema";
import { createPersonalWorkspace } from "./workspaces";

/** The user row a request works with. Read once per request, by `session.ts`. */
export type User = { id: string; email: string; name: string; sessionVersion: number };

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  sessionVersion: users.sessionVersion,
};

export const findUser = (db: Db, id: string): Promise<User | undefined> =>
  db.select(userColumns).from(users).where(eq(users.id, id)).get();

export const findUserByEmail = (db: Db, email: string): Promise<User | undefined> =>
  db.select(userColumns).from(users).where(eq(users.email, email)).get();

export async function renameUser(db: Db, id: string, name: string): Promise<void> {
  await db.update(users).set({ name }).where(eq(users.id, id));
}

/**
 * The user with this email, made with a personal workspace when none exists.
 * Both the first Google sign-in and a workspace owner adding an unknown email
 * come here. Two requests that race for one email end with the same user.
 */
export async function findOrCreateUser(db: Db, person: { email: string; name: string }): Promise<User> {
  const existing = await findUserByEmail(db, person.email);
  if (existing) return existing;
  try {
    await createPersonalWorkspace(db, { id: crypto.randomUUID(), ...person });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return (await findUserByEmail(db, person.email))!;
}
