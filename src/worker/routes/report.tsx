/** @jsxImportSource hono/jsx */
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { limaDate, parseWeek, weekDays, weekOf } from "../../shared/dates";
import { cardsOf } from "../cards";
import { connect } from "../db/client";
import { workspaces } from "../db/schema";
import { labelsOf } from "../labels";
import { workspaceByReportToken } from "../workspaces";
import { ReportPage } from "../views/report";

export const report = new Hono<{ Bindings: Env }>();

report.use(async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
});

report.get("/:token", async (c) => {
  const db = connect(c.env);
  const workspace = await workspaceByReportToken(db, c.req.param("token"));
  if (!workspace) return c.text("No encontrado", 404);
  const cards = cardsOf(db, workspace.id);

  const today = limaDate(new Date());
  const currentWeek = weekOf(today);
  const week = parseWeek(c.req.query("semana")) ?? currentWeek;

  const done = await cards.doneInWeek(week);
  const days = weekDays(week)
    .map((date) => ({ date, cards: done.filter((card) => card.doneDate === date) }))
    .filter((day) => day.cards.length > 0);
  const open = week === currentWeek ? await cards.pendingAndActive() : null;
  // workspaceByReportToken names a personal workspace after its owner; the
  // report header shows the workspace's own name.
  const name =
    (await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspace.id)).get())
      ?.name ?? workspace.name;
  const url = new URL(c.req.url);

  return c.html(
    <ReportPage
      token={c.req.param("token")}
      week={week}
      currentWeek={currentWeek}
      workspaceName={name}
      today={today}
      url={url.host + url.pathname + url.search}
      days={days}
      open={open}
      labels={await labelsOf(db, workspace.id).list()}
    />,
  );
});
