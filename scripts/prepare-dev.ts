import { copyFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { claimAdminSql } from "../src/worker/db/first-admin";
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

// The migration leaves the first admin without an email. Local development
// uses a fixed account, claimed once; the tests sign in as it with a forged cookie.
const claimed = executeSql(claimAdminSql(DEV_ACCOUNT), { remote: false, state });
if (claimed > 0) console.log(`Claimed the local admin ${DEV_ACCOUNT.email}.`);
