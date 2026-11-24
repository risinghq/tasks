import { sign } from "./crypto";

export const SESSION_COOKIE = "tasks_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const signatureOf = (secret: string, userId: string, version: number, expires: number) =>
  sign(secret, `session.${userId}.${version}.${expires}`);

/** The cookie value that signs a browser in as a user at a session version. Tests and the end-to-end fixtures use it too. */
export async function sessionCookieValue(
  secret: string,
  userId: string,
  version: number,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const expires = now + SESSION_MAX_AGE_SECONDS;
  return `${userId}.${version}.${expires}.${await signatureOf(secret, userId, version, expires)}`;
}
