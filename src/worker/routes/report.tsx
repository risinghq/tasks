/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { limaDate, parseWeek, weekDays, weekOf } from "../../shared/dates";
import { cardsOf } from "../cards";
import { connect } from "../db/client";
import { labelsOf } from "../labels";
import { reportLinkByToken, workspaceForReport } from "../report-links";
import { findUser } from "../users";
import { shareOf } from "../views/layout";
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
  const link = await reportLinkByToken(db, c.req.param("token"));
  if (!link) return c.text("No encontrado", 404);
  const workspace = await workspaceForReport(db, link.workspaceId);
  if (!workspace) return c.text("No encontrado", 404);

  const cards = cardsOf(db, link.workspaceId, {
    labelId: link.labelId ?? undefined,
    memberId: link.memberId ?? undefined,
  });
  const labels = await labelsOf(db, link.workspaceId).list();
  const label = labels.find((l) => l.id === link.labelId);
  const member = link.memberId ? await findUser(db, link.memberId) : undefined;

  const today = limaDate(new Date());
  const currentWeek = weekOf(today);
  const week = parseWeek(c.req.query("semana")) ?? currentWeek;

  const done = await cards.doneInWeek(week);
  const days = weekDays(week)
    .toReversed()
    .map((date) => ({ date, cards: done.filter((card) => card.doneDate === date) }))
    .filter((day) => day.cards.length > 0);
  const open = week === currentWeek ? await cards.pendingAndActive() : null;
  const url = new URL(c.req.url);

  return c.html(
    <ReportPage
      token={c.req.param("token")}
      week={week}
      currentWeek={currentWeek}
      scopeName={label?.name ?? member?.name ?? workspace.name}
      subtitle={member ? `Informe semanal · ${workspace.name}` : `Informe semanal de ${workspace.ownerName}`}
      showLabels={!link.labelId}
      today={today}
      url={url.host + url.pathname + url.search}
      share={shareOf(url, "report")}
      days={days}
      open={open}
      labels={labels}
    />,
  );
});
