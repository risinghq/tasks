import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN,
  admin,
  clientFor,
  cookieOf,
  idOf,
  joined,
  member,
  MEMBER,
  send,
  setNow,
  signIn,
} from "./helpers";

const b64url = (value: unknown) => btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_");

type Claims = Partial<Record<"aud" | "iss" | "exp" | "email" | "email_verified" | "name", unknown>>;

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

const sessionOf = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("tasks_session="));

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

  it("shows a signed-out visitor the landing page, with Google and no noindex", async () => {
    const res = await send("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('href="/auth/google"');
    expect(html).not.toContain("noindex");
  });

  it("gives the landing page a share card with an absolute image", async () => {
    const html = await (await send("/")).text();
    expect(html).toMatch(/property="og:image" content="https?:\/\/[^"]+\/og\/home\.png"/);
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("sends other page loads to the login page", async () => {
    const res = await send("/cards/abc");
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
    const session = sessionOf(res)!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Secure/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(await clientFor(session.split(";")[0]!).me()).toMatchObject({ email: ADMIN.email });
    expect(await me.status("/api/board")).toBe(200);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM users").first("n")).toBe(1);

    const sent = new URLSearchParams(fetched.mock.calls[0]![1]!.body as URLSearchParams);
    expect(sent.get("code")).toBe("codigo");
    expect(sent.get("code_verifier")).toBe(start.cookie.split(".")[1]);
    expect(sent.get("client_secret")).toBe(env.GOOGLE_CLIENT_SECRET);
  });

  it("makes an account with a personal workspace for an email nobody added", async () => {
    googleSays({ email: "Nueva@Example.com", name: "Nueva Persona" });
    const res = await callback(await startGoogle());
    expect(res.status).toBe(303);

    const me = clientFor(sessionOf(res)!.split(";")[0]!);
    const profile = await me.me();
    expect(profile).toMatchObject({ email: "nueva@example.com", name: "Nueva Persona" });
    expect(profile.workspaces).toEqual([{ id: profile.id, name: "Personal", role: "owner", openCount: 0 }]);
    expect(await me.board()).toMatchObject({ cards: [], labels: [] });
  });

  it("names the account after the email when Google sends no name", async () => {
    googleSays({ email: "sin.nombre@example.com" });
    const res = await callback(await startGoogle());
    expect((await clientFor(sessionOf(res)!.split(";")[0]!).me()).name).toBe("sin.nombre");
  });

  it("makes one account when two first sign-ins race", async () => {
    googleSays({ email: "carrera@example.com" });
    const [a, b] = await Promise.all([startGoogle(), startGoogle()]);
    const results = await Promise.all([callback(a), callback(b)]);
    expect(results.map((res) => res.status)).toEqual([303, 303]);
    const count = await env.DB.prepare(
      "SELECT count(*) AS n FROM users WHERE email = 'carrera@example.com'",
    ).first("n");
    expect(count).toBe(1);
  });

  it.each([
    ["an unverified email", { email_verified: false }],
    ["another client's token", { aud: "otro-cliente" }],
    ["another issuer", { iss: "https://evil.example" }],
    ["an expired token", { exp: 1 }],
  ])("refuses %s, and makes no account", async (_name, claims) => {
    googleSays(claims);
    const res = await callback(await startGoogle());
    expect(res.status).toBe(401);
    expect(sessionOf(res)).toBeUndefined();
    expect(await env.DB.prepare("SELECT count(*) AS n FROM users").first("n")).toBe(0);
  });

  it("refuses when Google rejects the code", async () => {
    googleSays({}, 400);
    expect((await callback(await startGoogle())).status).toBe(401);
  });

  it("refuses a callback with the wrong state, no code or no handshake cookie", async () => {
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
  it("signs out a cookie whose session version is stale", async () => {
    const beto = await member();
    await env.DB.prepare("UPDATE users SET session_version = session_version + 1 WHERE email = ?")
      .bind(MEMBER.email)
      .run();
    expect(await beto.status("/api/board")).toBe(401);
    const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(MEMBER.email)
      .first<{ id: string }>();
    const id = row!.id;
    expect(await clientFor(await signIn(id, 1)).status("/api/board")).toBe(200);
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
    expect(await me.call("/api/me", "PATCH", { name: "Ana Nueva" })).toMatchObject({ name: "Ana Nueva" });
    expect((await me.me()).name).toBe("Ana Nueva");
  });
});

describe("workspaces", () => {
  it("starts with the personal one, and makes more that the user owns", async () => {
    const me = await admin();
    const company = await me.createWorkspace("Empresa A");
    expect(company).toMatchObject({ name: "Empresa A", role: "owner" });
    const names = (await me.me()).workspaces.map((w) => w.name);
    expect(names).toEqual(["Personal", "Empresa A"]);
  });

  it("keeps each workspace's cards, labels and report apart", async () => {
    const me = await admin();
    const company = (await me.createWorkspace("Empresa A")).id;
    await me.add("Personal", "en_curso");
    await me.in(company).add("De la empresa", "en_curso");
    await me.in(company).addLabel("Cliente");

    expect((await me.board()).cards.map((c) => c.title)).toEqual(["Personal"]);
    expect((await me.board()).labels).toEqual([]);
    expect((await me.in(company).board()).cards.map((c) => c.title)).toEqual(["De la empresa"]);
    const tokens = [await me.wholeReportToken(), await me.in(company).wholeReportToken()];
    expect(new Set(tokens).size).toBe(2);
  });

  it("refuses a workspace the user does not belong to", async () => {
    const ana = await admin();
    const beto = await member();
    const secret = (await ana.createWorkspace("Privada")).id;
    expect(await beto.in(secret).status("/api/board")).toBe(403);
    expect(await beto.in(secret).status("/api/cards", "POST", { title: "x", list: "pendiente" })).toBe(403);
    expect(await beto.in("no-existe").status("/api/board")).toBe(403);
  });

  it("renames a workspace and deletes it with its cards", async () => {
    const me = await admin();
    const company = me.in((await me.createWorkspace("Empresa A")).id);
    await company.add("Se va", "pendiente");
    expect(await company.call("/api/workspace", "PATCH", { name: "Empresa B" })).toMatchObject({
      name: "Empresa B",
    });
    expect(await company.status("/api/workspace", "DELETE")).toBe(204);
    expect(await company.status("/api/board")).toBe(403);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM cards").first("n")).toBe(0);
    expect((await me.me()).workspaces.map((w) => w.name)).toEqual(["Personal"]);
  });

  it("does not delete the personal workspace", async () => {
    const me = await admin();
    expect(await me.status("/api/workspace", "DELETE")).toBe(409);
    expect(await me.status("/api/board")).toBe(200);
  });

  it("refuses an empty or very long name", async () => {
    const me = await admin();
    expect(await me.status("/api/workspaces", "POST", { name: "   " })).toBe(400);
    expect(await me.status("/api/workspaces", "POST", { name: "x".repeat(61) })).toBe(400);
  });
});

describe("members", () => {
  it("lists everyone in the workspace to everyone in it", async () => {
    const me = await admin();
    const beto = await joined(me);
    for (const who of [me, beto]) {
      expect((await who.members()).map((m) => [m.email, m.role])).toEqual([
        [ADMIN.email, "owner"],
        [MEMBER.email, "member"],
      ]);
    }
  });

  it("adds a person by email, who then sees the shared board and keeps their own", async () => {
    const me = await admin();
    await me.add("Compartida", "en_curso");
    const added = await me.addMember("  Beto@Example.com ", "member");
    expect(added).toMatchObject({ email: "beto@example.com", name: "beto", role: "member" });

    const beto = clientFor(await signIn(added.id));
    expect(await beto.board()).toMatchObject({ cards: [], labels: [] });
    expect((await beto.in((await me.me()).id).board()).cards.map((c) => c.title)).toEqual(["Compartida"]);
    // Ana's personal board shows under her name, so the two are told apart.
    expect((await beto.me()).workspaces.map((w) => w.name)).toEqual(["Personal", ADMIN.name]);
  });

  it("lets a person who was added sign in with Google and find the workspace", async () => {
    const me = await admin();
    await me.addMember(MEMBER.email, "member");
    googleSays({ email: MEMBER.email, name: MEMBER.name });
    const res = await callback(await startGoogle());
    const profile = await clientFor(sessionOf(res)!.split(";")[0]!).me();
    expect(profile.workspaces).toHaveLength(2);
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM users WHERE email = ?").bind(MEMBER.email).first("n"),
    ).toBe(1);
  });

  it("gives the role the owner chose", async () => {
    const me = await admin();
    const other = await joined(me, "owner", { email: "jefe@example.com", name: "Jefe" });
    expect(await other.status("/api/members", "POST", { email: "otro@example.com", role: "member" })).toBe(
      201,
    );
  });

  it("refuses an email already in the workspace", async () => {
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

  it("keeps a member from changing the workspace", async () => {
    const me = await admin();
    const beto = await joined(me);
    const id = await idOf(me, ADMIN.email);

    expect(await beto.status("/api/members", "POST", { email: "otro@example.com", role: "member" })).toBe(
      403,
    );
    expect(await beto.status(`/api/members/${id}`, "PATCH", { role: "member" })).toBe(403);
    expect(await beto.status(`/api/members/${id}`, "DELETE")).toBe(403);
    expect(await beto.status("/api/workspace", "PATCH", { name: "Mía" })).toBe(403);
    expect(await beto.status("/api/workspace", "DELETE")).toBe(403);
    expect(await me.members()).toHaveLength(2);
  });

  it("changes a member's role", async () => {
    const me = await admin();
    const beto = await joined(me);
    const id = await idOf(me, MEMBER.email);
    await me.call(`/api/members/${id}`, "PATCH", { role: "owner" });
    expect(await beto.status("/api/workspace", "PATCH", { name: "Equipo" })).toBe(200);
    await me.call(`/api/members/${id}`, "PATCH", { role: "member" });
    expect(await beto.status("/api/workspace", "PATCH", { name: "Otro" })).toBe(403);
  });

  it("does not demote or remove the last owner", async () => {
    const me = await admin();
    const id = await idOf(me, ADMIN.email);
    expect(await me.status(`/api/members/${id}`, "PATCH", { role: "member" })).toBe(409);
    expect(await me.status(`/api/members/${id}`, "DELETE")).toBe(409);
    expect(await me.status("/api/board")).toBe(200);
  });

  it("lets a member leave, and takes their tokens for that workspace", async () => {
    const me = await admin();
    const beto = await joined(me);
    const { id: tokenId } = await beto.makeToken("beto");
    const id = await idOf(me, MEMBER.email);
    expect(await beto.status(`/api/members/${id}`, "DELETE")).toBe(204);
    expect(await beto.status("/api/board")).toBe(403);
    expect(await me.members()).toHaveLength(1);
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM api_tokens WHERE id = ?").bind(tokenId).first("n"),
    ).toBe(0);
  });

  it("keeps an owner when two owners remove each other at once", async () => {
    const me = await admin();
    const other = await joined(me, "owner", { email: "jefe@example.com", name: "Jefe" });
    const myId = await idOf(me, ADMIN.email);
    const otherId = await idOf(me, "jefe@example.com");

    const results = await Promise.all([
      me.status(`/api/members/${otherId}`, "DELETE"),
      other.status(`/api/members/${myId}`, "DELETE"),
    ]);
    // The one that lands second is refused: by the guard, or because its owner is already gone.
    expect(results.filter((status) => status === 204)).toHaveLength(1);
    expect(results.filter((status) => status === 409 || status === 403)).toHaveLength(1);
    const owners = await env.DB.prepare(
      "SELECT count(*) AS n FROM workspace_members WHERE workspace_id = ? AND role = 'owner'",
    )
      .bind((await me.me()).id)
      .first("n");
    expect(owners).toBe(1);
  });

  it("answers 404 for a member that does not exist", async () => {
    const me = await admin();
    expect(await me.status("/api/members/nope", "PATCH", { role: "member" })).toBe(404);
    expect(await me.status("/api/members/nope", "DELETE")).toBe(404);
  });
});
