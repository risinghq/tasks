import { copyFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { executeSql } from "./d1";
import { DEV_ACCOUNT } from "./dev-account";

if (!existsSync(".dev.vars")) {
  copyFileSync(".dev.vars.example", ".dev.vars");
  console.log("Created .dev.vars from .dev.vars.example.");
}

const state = process.env.TASKS_STATE ?? ".wrangler/state";
const migrate = spawnSync(
  "bunx",
  ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", state],
  { stdio: "inherit" },
);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

// Local development uses a fixed account with its personal workspace, made once;
// the tests sign in as it with a forged cookie.
const { id, email, name } = DEV_ACCOUNT;
const made = executeSql(
  `INSERT INTO users (id, email, name) VALUES ('${id}', '${email}', '${name}') ON CONFLICT DO NOTHING RETURNING id;` +
    ` INSERT INTO workspaces (id, name, created_at) VALUES ('${id}', 'Personal', unixepoch()) ON CONFLICT DO NOTHING;` +
    ` INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('${id}', '${id}', 'owner') ON CONFLICT DO NOTHING;`,
  { remote: false, state },
);
if (made > 0) console.log(`Made the local account ${email}.`);
