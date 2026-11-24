/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { safeEqualText } from "../crypto";
import { connect } from "../db/client";
import { authorizeUrl, CALLBACK_PATH, identify, newHandshake } from "../google";
import { endSession, sessionUser, startSession, type AppEnv } from "../session";
import { findOrCreateUser } from "../users";
import { LandingPage } from "../views/landing";
import { LoginPage } from "../views/login";

export const auth = new Hono<AppEnv>();

const HANDSHAKE_COOKIE = "tasks_google";
const HANDSHAKE_SECONDS = 10 * 60;

const handshakeCookie = { httpOnly: true, secure: true, sameSite: "Lax", path: "/auth" } as const;

/** Signed-in visitors fall through to the board. */
auth.get("/", async (c, next) => {
  if (await sessionUser(c)) return next();
  return c.html(<LandingPage />);
});

auth.get("/login", async (c) => {
  if (await sessionUser(c)) return c.redirect("/");
  return c.html(<LoginPage />);
});

auth.get("/auth/google", async (c) => {
  const handshake = newHandshake();
  setCookie(c, HANDSHAKE_COOKIE, `${handshake.state}.${handshake.verifier}`, {
    ...handshakeCookie,
    maxAge: HANDSHAKE_SECONDS,
  });
  return c.redirect(await authorizeUrl(c.env.GOOGLE_CLIENT_ID, new URL(c.req.url).origin, handshake));
});

auth.get(CALLBACK_PATH, async (c) => {
  const [state = "", verifier = ""] = (getCookie(c, HANDSHAKE_COOKIE) ?? "").split(".");
  deleteCookie(c, HANDSHAKE_COOKIE, handshakeCookie);

  const code = c.req.query("code");
  if (!code || !state || !safeEqualText(state, c.req.query("state") ?? "")) {
    return c.html(<LoginPage error="No se pudo entrar con Google. Inténtalo de nuevo." />, 400);
  }

  const identity = await identify(c.env, new URL(c.req.url).origin, code, verifier);
  if (!identity) return c.html(<LoginPage error="Google no confirmó tu correo. Inténtalo de nuevo." />, 401);

  const user = await findOrCreateUser(connect(c.env), identity);

  await startSession(c, user.id, user.sessionVersion);
  return c.redirect("/", 303);
});

auth.post("/logout", (c) => {
  endSession(c);
  return c.redirect("/login", 303);
});
