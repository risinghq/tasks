import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.MIGRATIONS);
});

/** Every test starts from an empty database. Accounts are made by signing up. */
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T17:00:00Z"));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM api_tokens"),
    env.DB.prepare("DELETE FROM report_links"),
    env.DB.prepare("DELETE FROM cards"),
    env.DB.prepare("DELETE FROM labels"),
    env.DB.prepare("DELETE FROM login_attempts"),
    env.DB.prepare("DELETE FROM workspace_members"),
    env.DB.prepare("DELETE FROM workspaces"),
    env.DB.prepare("DELETE FROM users"),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});
