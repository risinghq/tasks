import { randomToken, sha256 } from "./crypto";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const CALLBACK_PATH = "/auth/google/callback";

/** What the browser keeps between the redirect to Google and the callback. */
export type Handshake = { state: string; verifier: string };

export const newHandshake = (): Handshake => ({ state: randomToken(16), verifier: randomToken() });

/** The Google sign-in page for this handshake. The code challenge is the PKCE S256 of the verifier. */
export async function authorizeUrl(clientId: string, origin: string, handshake: Handshake): Promise<string> {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: origin + CALLBACK_PATH,
    response_type: "code",
    scope: "openid email",
    state: handshake.state,
    code_challenge: await sha256(handshake.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export type GoogleIdentity = { email: string };

const claimsOf = (idToken: string): Record<string, unknown> | undefined => {
  try {
    const body = idToken.split(".")[1] ?? "";
    return JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/")));
  } catch {
    return undefined;
  }
};

/**
 * Trades the authorization code for the person's verified email, or undefined.
 * The ID token comes straight from Google's token endpoint over TLS, so it is
 * read without checking its signature; the audience, issuer, expiry and
 * `email_verified` are still checked.
 */
export async function identify(
  env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">,
  origin: string,
  code: string,
  verifier: string,
): Promise<GoogleIdentity | undefined> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: origin + CALLBACK_PATH,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) return undefined;
  const { id_token } = (await res.json()) as { id_token?: string };
  const claims = id_token ? claimsOf(id_token) : undefined;
  if (!claims) return undefined;
  const { aud, iss, exp, email, email_verified } = claims;
  const valid =
    aud === env.GOOGLE_CLIENT_ID &&
    typeof iss === "string" &&
    ISSUERS.includes(iss) &&
    typeof exp === "number" &&
    exp > Date.now() / 1000 &&
    (email_verified === true || email_verified === "true") &&
    typeof email === "string";
  return valid ? { email: email.trim().toLowerCase() } : undefined;
}
