import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN, admin, clientFor, cookieOf, idOf, member, MEMBER, send, setNow, signIn } from "./helpers";

const b64url = (value: unknown) => btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_");

type Claims = Partial<Record<"aud" | "iss" | "exp" | "email" | "email_verified", unknown>>;

/** Makes Google's token endpoint answer with an ID token carrying these claims. */
function googleSays(claims: Claims, status = 200) {
  const full = {
    aud: env.GOOGLE_CLIENT_ID,
    iss: "https://accounts.google.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: ADMIN.email,
    email_verified: true,
    ...claims,
  };
  const fetched = vi.fn(
    async (_url: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify({ id_token: `x.${b64url(full)}.y` }), { status }),
  );
  vi.stubGlobal("fetch", fetched);
  return fetched;
}

/** Starts the Google handshake and returns the redirect and the cookie the browser keeps. */
async function startGoogle() {
  const res = await send("/auth/google");
  const location = new URL(res.headers.get("Location")!);
  return { res, location, state: location.searchParams.get("state")!, cookie: cookieOf(res) };
}

/** Finishes the handshake the way Google's redirect back does. */
async function callback(start: Awaited<ReturnType<typeof startGoogle>>, query: Record<string, string> = {}) {
  const params = new URLSearchParams({ code: "codigo", state: start.state, ...query });
  return send(`/auth/google/callback?${params}`, { cookie: start.cookie });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("access", () => {
  it("rejects API calls without a session", async () => {
    expect((await send("/api/board")).status).toBe(401);
    expect(
      (await send("/api/cards", { method: "POST", json: { title: "x", list: "pendiente" } })).status,
    ).toBe(401);
  });

  it("sends page loads to the login page", async () => {
    const res = await send("/");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });

  it("offers Google on the login page and nothing else", async () => {
    const html = await (await send("/login")).text();
    expect(html).toContain('href="/auth/google"');
    expect(html).not.toContain('name="password"');
  });

  it("sends a signed-in user from the login page to the board", async () => {
    const me = await admin();
    const res = await send("/login", { cookie: me.cookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("rejects a forged or tampered cookie", async () => {
    const me = await admin();
    const [name, value] = me.cookie.split("=") as [string, string];
    const [userId, version, expires, signature] = value.split(".") as [string, string, string, string];
    const farFuture = String(Number(expires) + 10_000_000);

    expect(
      (await send("/api/board", { cookie: `${name}=${userId}.${version}.${farFuture}.${signature}` })).status,
    ).toBe(401);
    expect(
      (
        await send("/api/board", {
          cookie: `${name}=${userId}.${Number(version) + 1}.${expires}.${signature}`,
        })
      ).status,
    ).toBe(401);
    expect(
      (await send("/api/board", { cookie: `${name}=${userId}.${version}.${expires}.AAAA` })).status,
    ).toBe(401);
  });

  it("signs out", async () => {
    const me = await admin();
    const res = await send("/logout", { method: "POST", cookie: me.cookie });
    expect(res.headers.get("Set-Cookie")).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});

describe("signing in with Google", () => {
  it("sends the browser to Google with state and a PKCE challenge, and keeps the handshake in a cookie", async () => {
    const { res, location, state } = await startGoogle();
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("client_id")).toBe(env.GOOGLE_CLIENT_ID);
    expect(location.searchParams.get("redirect_uri")).toBe("https://tasks.test/auth/google/callback");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    const cookie = res.headers.getSetCookie()[0]!;
    expect(cookie).toContain(`tasks_google=${state}.`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\/auth/);
  });

  it("signs in the account that has the email, in any case, and sends the verifier to Google", async () => {
    const me = await admin();
    const fetched = googleSays({ email: ADMIN.email.toUpperCase() });
    const start = await startGoogle();
    const res = await callback(start);

    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/");
    const session = res.headers.getSetCookie().find((c) => c.startsWith("tasks_session="))!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Secure/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(await clientFor(session.split(";")[0]!).settings()).toMatchObject({ email: ADMIN.email });
    expect(await me.status("/api/board")).toBe(200);

    const sent = new URLSearchParams(fetched.mock.calls[0]![1]!.body as URLSearchParams);
    expect(sent.get("code")).toBe("codigo");
    expect(sent.get("code_verifier")).toBe(start.cookie.split(".")[1]);
    expect(sent.get("client_secret")).toBe(env.GOOGLE_CLIENT_SECRET);
  });

  it("refuses a Google account nobody added, and says which", async () => {
    await admin();
    googleSays({ email: "intruso@example.com" });
    const res = await callback(await startGoogle());
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("intruso@example.com");
    expect(res.headers.getSetCookie().some((c) => c.startsWith("tasks_session="))).toBe(false);
  });

  it("keeps the first admin out until it is claimed", async () => {
    googleSays({ email: "" });
    expect((await callback(await startGoogle())).status).toBe(403);
  });

  it("refuses a disabled account", async () => {
    const me = await admin();
    await member(me);
    await me.call(`/api/members/${await idOf(me, MEMBER.email)}`, "PATCH", { disabled: true });
    googleSays({ email: MEMBER.email });
    const res = await callback(await startGoogle());
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("tasks_session="))).toBe(false);
  });

  it.each([
    ["an unverified email", { email_verified: false }],
    ["another client's token", { aud: "otro-cliente" }],
    ["another issuer", { iss: "https://evil.example" }],
    ["an expired token", { exp: 1 }],
  ])("refuses %s", async (_name, claims) => {
    await admin();
    googleSays(claims);
    const res = await callback(await startGoogle());
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("tasks_session="))).toBe(false);
  });

  it("refuses when Google rejects the code", async () => {
    await admin();
    googleSays({}, 400);
    expect((await callback(await startGoogle())).status).toBe(401);
  });

  it("refuses a callback with the wrong state, no code or no handshake cookie", async () => {
    await admin();
    const fetched = googleSays({});
    const start = await startGoogle();
    expect((await callback(start, { state: "otro" })).status).toBe(400);
    expect((await send(`/auth/google/callback?code=c&state=${start.state}`)).status).toBe(400);
    expect((await send(`/auth/google/callback?state=${start.state}`, { cookie: start.cookie })).status).toBe(
      400,
    );
    expect(fetched).not.toHaveBeenCalled();
  });
});

describe("sessions follow the user row", () => {
  it("signs out a disabled user at once, and back in when enabled", async () => {
    const me = await admin();
    const beto = await member(me);
    const id = await idOf(me, MEMBER.email);

    await me.call(`/api/members/${id}`, "PATCH", { disabled: true });
    expect(await beto.status("/api/board")).toBe(401);

    await me.call(`/api/members/${id}`, "PATCH", { disabled: false });
    expect(await beto.status("/api/board")).toBe(200);
  });

  it("signs out a cookie whose session version is stale", async () => {
    const me = await admin();
    const beto = await member(me);
    await env.DB.prepare("UPDATE users SET session_version = session_version + 1 WHERE email = ?")
      .bind(MEMBER.email)
      .run();
    expect(await beto.status("/api/board")).toBe(401);
    expect(await clientFor(await signIn(await idOf(me, MEMBER.email), 1)).status("/api/board")).toBe(200);
  });

  it("rejects an expired cookie", async () => {
    setNow("2026-10-16T17:00:00Z");
    const me = await admin();
    setNow("2026-11-16T17:00:00Z"); // 31 days later
    expect(await me.status("/api/board")).toBe(401);
  });
});

describe("own account", () => {
  it("renames the user", async () => {
    const me = await admin();
    expect(await me.call("/api/settings", "PATCH", { name: "Ana Nueva" })).toMatchObject({
      name: "Ana Nueva",
    });
    expect((await me.settings()).name).toBe("Ana Nueva");
  });
});

describe("members", () => {
  it("lists everyone to an admin", async () => {
    const me = await admin();
    await member(me);
    expect((await me.members()).map((m) => [m.email, m.role, m.disabled])).toEqual([
      [ADMIN.email, "admin", false],
      [MEMBER.email, "member", false],
    ]);
  });

  it("adds a member by email with a board of their own", async () => {
    const me = await admin();
    await me.add("Solo de Ana", "en_curso");
    const added = await me.addMember("  Beto@Example.com ", "member");
    expect(added).toMatchObject({ email: "beto@example.com", name: "beto", role: "member", disabled: false });

    const beto = clientFor(await signIn(added.id));
    expect(await beto.board()).toMatchObject({ cards: [], labels: [] });
    expect(await beto.settings()).toMatchObject({ email: "beto@example.com", role: "member" });
  });

  it("gives the role the admin chose", async () => {
    const me = await admin();
    const other = clientFor(await signIn((await me.addMember("jefe@example.com", "admin")).id));
    expect((await other.settings()).role).toBe("admin");
    expect(await other.status("/api/members")).toBe(200);
  });

  it("refuses an email that already has an account", async () => {
    const me = await admin();
    expect(
      await me.status("/api/members", "POST", { email: ADMIN.email.toUpperCase(), role: "member" }),
    ).toBe(409);
    expect(await me.members()).toHaveLength(1);
  });

  it("refuses a bad email", async () => {
    const me = await admin();
    expect(await me.status("/api/members", "POST", { email: "no-es-un-correo", role: "member" })).toBe(400);
  });

  it("keeps a member out of every Miembros route", async () => {
    const me = await admin();
    const beto = await member(me);
    const id = await idOf(me, ADMIN.email);

    expect(await beto.status("/api/members")).toBe(403);
    expect(await beto.status("/api/members", "POST", { email: "otro@example.com", role: "member" })).toBe(
      403,
    );
    expect(await beto.status(`/api/members/${id}`, "PATCH", { disabled: true })).toBe(403);
    expect((await me.settings()).role).toBe("admin");
    expect(await me.members()).toHaveLength(2);
  });

  it("changes a member's role", async () => {
    const me = await admin();
    const beto = await member(me);
    const id = await idOf(me, MEMBER.email);
    await me.call(`/api/members/${id}`, "PATCH", { role: "admin" });
    expect(await beto.status("/api/members")).toBe(200);
    await me.call(`/api/members/${id}`, "PATCH", { role: "member" });
    expect(await beto.status("/api/members")).toBe(403);
  });

  it("does not let an admin disable or demote themselves", async () => {
    const me = await admin();
    const id = await idOf(me, ADMIN.email);
    expect(await me.status(`/api/members/${id}`, "PATCH", { disabled: true })).toBe(400);
    expect(await me.status(`/api/members/${id}`, "PATCH", { role: "member" })).toBe(400);
    expect(await me.status("/api/board")).toBe(200);
  });

  it("keeps an admin when two admins remove each other at once", async () => {
    const me = await admin();
    const added = await me.addMember("jefe@example.com", "admin");
    const other = clientFor(await signIn(added.id));
    const myId = await idOf(me, ADMIN.email);

    const results = await Promise.all([
      me.status(`/api/members/${added.id}`, "PATCH", { disabled: true }),
      other.status(`/api/members/${myId}`, "PATCH", { disabled: true }),
    ]);
    // The one that lands second is refused: by the guard, or because its admin is already disabled.
    expect(results.filter((status) => status === 200)).toHaveLength(1);
    expect(results.filter((status) => status === 409 || status === 401)).toHaveLength(1);
    const admins = (await env.DB.prepare(
      "SELECT count(*) AS n FROM users WHERE role = 'admin' AND disabled = 0",
    ).first<{ n: number }>())!;
    expect(admins.n).toBe(1);
  });

  it("answers 404 for a member that does not exist", async () => {
    const me = await admin();
    expect(await me.status("/api/members/nope", "PATCH", { disabled: true })).toBe(404);
  });
});
