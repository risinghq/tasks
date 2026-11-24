import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { addMemberSchema, updateMemberSchema } from "../../shared/schemas";
import { connect } from "../db/client";
import { requireAdmin, type AppEnv } from "../session";
import { addMember, findMember, listMembers, updateMember } from "../users";

/** Admin-only routes behind `/api/members`. */
export const members = new Hono<AppEnv>();

members.use(requireAdmin);

members.get("/", async (c) => c.json(await listMembers(connect(c.env))));

/** Lets the Google account with this email sign in. The name defaults to the part before the @. */
members.post("/", zValidator("json", addMemberSchema), async (c) => {
  const { email, name, role } = c.req.valid("json");
  const added = await addMember(connect(c.env), { email, name: name ?? email.split("@")[0]!, role });
  if (!added) return c.json({ error: "that email already has an account" }, 409);
  return c.json(added, 201);
});

members.patch("/:id", zValidator("json", updateMemberSchema), async (c) => {
  const db = connect(c.env);
  const id = c.req.param("id");
  const patch = c.req.valid("json");
  const member = await findMember(db, id);
  if (!member) return c.json({ error: "not found" }, 404);
  if (id === c.get("user").id && (patch.role === "member" || patch.disabled === true)) {
    return c.json({ error: "an admin cannot disable or demote themselves" }, 400);
  }
  if (!(await updateMember(db, id, patch))) {
    return c.json({ error: "there must be another admin" }, 409);
  }
  return c.json((await findMember(db, id))!);
});
