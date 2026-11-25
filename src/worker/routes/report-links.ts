import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createReportLinkSchema } from "../../shared/schemas";
import { connect } from "../db/client";
import { reportLinksOf } from "../report-links";
import { requireOwner, type AppEnv } from "../session";

/** Shared read-only links to the weekly report, behind `/api/report-links`. Every member lists; owners change them. */
export const reportLinkRoutes = new Hono<AppEnv>();

reportLinkRoutes.get("/", async (c) =>
  c.json(await reportLinksOf(connect(c.env), c.get("workspace").id).list()),
);

reportLinkRoutes.post("/", requireOwner, zValidator("json", createReportLinkSchema), async (c) => {
  const link = await reportLinksOf(connect(c.env), c.get("workspace").id).create(c.req.valid("json"));
  return link ? c.json(link, 201) : c.json({ error: "not found" }, 404);
});

reportLinkRoutes.post("/:id/token", requireOwner, async (c) => {
  const link = await reportLinksOf(connect(c.env), c.get("workspace").id).regenerate(c.req.param("id"));
  return link ? c.json(link) : c.json({ error: "not found" }, 404);
});

reportLinkRoutes.delete("/:id", requireOwner, async (c) => {
  const deleted = await reportLinksOf(connect(c.env), c.get("workspace").id).delete(c.req.param("id"));
  return deleted ? c.body(null, 204) : c.json({ error: "not found" }, 404);
});
