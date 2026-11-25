import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { limaDate, parseWeek, weekOf } from "../../shared/dates";
import type { Board, DoneWeek, Me, Workspace } from "../../shared/model";
import {
  createCardSchema,
  createLabelSchema,
  createWorkspaceSchema,
  moveCardSchema,
  updateCardSchema,
  updateLabelSchema,
  updateMeSchema,
  updateWorkspaceSchema,
} from "../../shared/schemas";
import { cardsOf } from "../cards";
import { connect } from "../db/client";
import { cardPrefix, deletePrefix, workspacePrefix } from "../files";
import { labelsOf } from "../labels";
import { requireOwner, requireSession, requireWorkspace, type AppEnv } from "../session";
import { findUser, renameUser } from "../users";
import { createWorkspace, deleteWorkspace, listMembers, renameWorkspace, workspacesOf } from "../workspaces";
import { members } from "./members";
import { fileRoutes, noteRoutes } from "./notes";
import { reportLinkRoutes } from "./report-links";
import { tokens } from "./tokens";

export const api = new Hono<AppEnv>();

api.use(requireSession);

const meOf = async (c: {
  env: Env;
  get(key: "user"): { id: string; name: string; email: string };
}): Promise<Me> => {
  const { id, name, email } = c.get("user");
  return { id, name, email, workspaces: await workspacesOf(connect(c.env), id) };
};

api.get("/me", async (c) => c.json(await meOf(c)));

api.patch("/me", zValidator("json", updateMeSchema), async (c) => {
  await renameUser(connect(c.env), c.get("user").id, c.req.valid("json").name);
  const user = (await findUser(connect(c.env), c.get("user").id))!;
  c.set("user", user);
  return c.json(await meOf(c));
});

api.post("/workspaces", zValidator("json", createWorkspaceSchema), async (c) => {
  const workspace = await createWorkspace(connect(c.env), c.get("user").id, c.req.valid("json").name);
  return c.json(workspace, 201);
});

api.route("/files", fileRoutes);

// Everything below acts on one workspace: the `X-Workspace` header, or the user's personal one.
api.use(requireWorkspace);
api.route("/", noteRoutes);
api.route("/members", members);
api.route("/tokens", tokens);
api.route("/report-links", reportLinkRoutes);

const today = () => limaDate(new Date());

api.get("/board", async (c) => {
  const db = connect(c.env);
  const workspaceId = c.get("workspace").id;
  const cards = cardsOf(db, workspaceId);
  const week = weekOf(today());
  const [open, done, labels, olderWeek, requesters, people] = await Promise.all([
    cards.pendingAndActive(),
    cards.doneInWeek(week),
    labelsOf(db, workspaceId).list(),
    cards.olderWeekWithCards(week),
    cards.requesterSuggestions(),
    listMembers(db, workspaceId),
  ]);
  const board: Board = {
    today: today(),
    week,
    cards: [...open, ...done],
    labels,
    olderWeek,
    requesters,
    members: people.map(({ id, name }) => ({ id, name })),
  };
  return c.json(board);
});

api.get("/done", async (c) => {
  const week = parseWeek(c.req.query("week"));
  if (!week) return c.json({ error: "week must look like 2026-W42" }, 400);
  const cards = cardsOf(connect(c.env), c.get("workspace").id);
  const [done, olderWeek] = await Promise.all([cards.doneInWeek(week), cards.olderWeekWithCards(week)]);
  const result: DoneWeek = { week, cards: done, olderWeek };
  return c.json(result);
});

api.post("/cards", zValidator("json", createCardSchema), async (c) => {
  const card = await cardsOf(connect(c.env), c.get("workspace").id).create(c.req.valid("json"), today());
  return c.json(card, 201);
});

api.get("/cards/:id", async (c) => {
  const card = await cardsOf(connect(c.env), c.get("workspace").id).get(c.req.param("id"));
  return card ? c.json(card) : c.json({ error: "not found" }, 404);
});

api.patch("/cards/:id", zValidator("json", updateCardSchema), async (c) => {
  const cards = cardsOf(connect(c.env), c.get("workspace").id);
  const card = await cards.get(c.req.param("id"));
  if (!card) return c.json({ error: "not found" }, 404);
  return c.json(await cards.update(card, c.req.valid("json"), today()));
});

api.post("/cards/:id/move", zValidator("json", moveCardSchema), async (c) => {
  const cards = cardsOf(connect(c.env), c.get("workspace").id);
  const card = await cards.get(c.req.param("id"));
  if (!card) return c.json({ error: "not found" }, 404);
  const { index, ...placement } = c.req.valid("json");
  return c.json(await cards.update(card, placement, today(), index));
});

api.delete("/cards/:id", async (c) => {
  const workspaceId = c.get("workspace").id;
  const deleted = await cardsOf(connect(c.env), workspaceId).delete(c.req.param("id"));
  if (!deleted) return c.json({ error: "not found" }, 404);
  await deletePrefix(c.env.FILES, cardPrefix(workspaceId, c.req.param("id")));
  return c.body(null, 204);
});

api.post("/labels", zValidator("json", createLabelSchema), async (c) => {
  const label = await labelsOf(connect(c.env), c.get("workspace").id).create(c.req.valid("json"));
  return c.json(label, 201);
});

api.patch("/labels/:id", zValidator("json", updateLabelSchema), async (c) => {
  const label = await labelsOf(connect(c.env), c.get("workspace").id).update(
    c.req.param("id"),
    c.req.valid("json"),
  );
  return label ? c.json(label) : c.json({ error: "not found" }, 404);
});

api.delete("/labels/:id", async (c) => {
  const deleted = await labelsOf(connect(c.env), c.get("workspace").id).delete(c.req.param("id"));
  return deleted ? c.body(null, 204) : c.json({ error: "not found" }, 404);
});

const workspaceOf = (workspace: Workspace): Workspace => {
  const { id, name, role } = workspace;
  return { id, name, role };
};

api.get("/workspace", (c) => c.json(workspaceOf(c.get("workspace"))));

api.patch("/workspace", requireOwner, zValidator("json", updateWorkspaceSchema), async (c) => {
  const { name } = c.req.valid("json");
  await renameWorkspace(connect(c.env), c.get("workspace").id, name);
  return c.json(workspaceOf({ ...c.get("workspace"), name }));
});

/** A personal workspace is a user's own id. It stays, so every user keeps a default board. */
api.delete("/workspace", requireOwner, async (c) => {
  const db = connect(c.env);
  const { id } = c.get("workspace");
  if (await findUser(db, id)) return c.json({ error: "a personal workspace cannot be deleted" }, 409);
  await deleteWorkspace(db, id);
  await deletePrefix(c.env.FILES, workspacePrefix(id));
  return c.body(null, 204);
});
