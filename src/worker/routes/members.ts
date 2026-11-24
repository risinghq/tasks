import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { addMemberSchema, updateMemberSchema } from "../../shared/schemas";
import { connect } from "../db/client";
import { requireOwner, type AppEnv } from "../session";
import { findOrCreateUser } from "../users";
import { addMember, findMember, listMembers, removeMember, setRole } from "../workspaces";

/** Routes behind `/api/members`. Everyone in the workspace reads; owners change. */
export const members = new Hono<AppEnv>();

members.get("/", async (c) => c.json(await listMembers(connect(c.env), c.get("workspace").id)));

/** Lets the Google account with this email into the workspace. The name defaults to the part before the @. */
members.post("/", requireOwner, zValidator("json", addMemberSchema), async (c) => {
  const { email, name, role } = c.req.valid("json");
  const db = connect(c.env);
  const user = await findOrCreateUser(db, { email, name: name ?? email.split("@")[0]! });
  if (!(await addMember(db, c.get("workspace").id, user.id, role))) {
    return c.json({ error: "that email is already in this workspace" }, 409);
  }
  return c.json((await findMember(db, c.get("workspace").id, user.id))!, 201);
});

members.patch("/:id", requireOwner, zValidator("json", updateMemberSchema), async (c) => {
  const db = connect(c.env);
  const workspaceId = c.get("workspace").id;
  const id = c.req.param("id");
  if (!(await findMember(db, workspaceId, id))) return c.json({ error: "not found" }, 404);
  if (!(await setRole(db, workspaceId, id, c.req.valid("json").role))) {
    return c.json({ error: "there must be another owner" }, 409);
  }
  return c.json((await findMember(db, workspaceId, id))!);
});

/** An owner removes anyone; a member removes themselves. The last owner stays. */
members.delete("/:id", async (c) => {
  const db = connect(c.env);
  const workspaceId = c.get("workspace").id;
  const id = c.req.param("id");
  if (c.get("workspace").role !== "owner" && id !== c.get("user").id) {
    return c.json({ error: "forbidden" }, 403);
  }
  if (!(await findMember(db, workspaceId, id))) return c.json({ error: "not found" }, 404);
  if (!(await removeMember(db, workspaceId, id)))
    return c.json({ error: "there must be another owner" }, 409);
  return c.body(null, 204);
});
