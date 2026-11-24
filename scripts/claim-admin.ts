import { parseArgs } from "node:util";
import { claimAdminSql } from "../src/worker/db/first-admin";
import { executeSql } from "./d1";

const USAGE = "Usage: bun run claim-admin -- --email <google email> --name <name> [--remote]";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    remote: { type: "boolean", default: false },
  },
});

if (!values.email?.includes("@") || !values.name?.trim()) {
  console.error(USAGE);
  process.exit(2);
}

const claimed = executeSql(claimAdminSql({ email: values.email, name: values.name.trim() }), {
  remote: values.remote,
  state: process.env.TASKS_STATE,
});
if (claimed === 0) {
  console.error("The first admin is already claimed. Nothing changed.");
  process.exit(1);
}
console.log(
  `Claimed the first admin as ${values.email.trim().toLowerCase()} (${values.remote ? "remote" : "local"}).`,
);
