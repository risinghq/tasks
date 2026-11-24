/** @jsxImportSource hono/jsx */
import { addWeeks, dayHeading, weekRangeLabel } from "../../shared/dates";
import { labelStyle, type Card, type Label } from "../../shared/model";
import { Document } from "./layout";
import css from "./report.css?raw";

const NO_LABEL_BORDER = "var(--border-control)";

function ReportCard(props: { card: Card; label: Label | undefined }) {
  const { card, label } = props;
  const meta = [label?.name, card.requester].filter(Boolean).join(" · ");
  return (
    <article style={{ borderColor: label ? labelStyle(label.color).background : NO_LABEL_BORDER }}>
      <h3>{card.title}</h3>
      {meta && <p class="meta">{meta}</p>}
      {card.description && <p class="description">{card.description}</p>}
    </article>
  );
}

export type ReportData = {
  token: string;
  week: string;
  currentWeek: string;
  workspaceName: string;
  today: string;
  days: { date: string; cards: Card[] }[];
  active: Card[] | null;
  labels: Label[];
};

/** Labels with finished cards, by name, then the cards without one. */
function countsByLabel(finished: Card[], labels: Label[]) {
  const counts = labels
    .map((label) => ({
      key: label.id,
      name: label.name,
      swatch: labelStyle(label.color).background,
      count: finished.filter((card) => card.labelId === label.id).length,
    }))
    .filter((entry) => entry.count > 0);
  const unlabeled = finished.filter((card) => card.labelId === null).length;
  if (unlabeled > 0)
    counts.push({ key: "none", name: "Sin etiqueta", swatch: NO_LABEL_BORDER, count: unlabeled });
  return counts;
}

export function ReportPage(props: ReportData) {
  const { token, week, currentWeek, days, labels } = props;
  const href = (target: string) => `/r/${token}?semana=${target}`;
  const finished = days.flatMap((day) => day.cards);
  const labelOf = (card: Card) => labels.find((label) => label.id === card.labelId);

  return (
    <Document title={`Informe ${weekRangeLabel(week)}`} css={css}>
      <main>
        <header>
          <h1>{weekRangeLabel(week)}</h1>
          <p class="owner">{props.workspaceName}</p>
          <ul class="counts">
            {countsByLabel(finished, labels).map((entry) => (
              <li key={entry.key}>
                <span class="swatch" style={{ background: entry.swatch }} />
                {entry.name} {entry.count}
              </li>
            ))}
          </ul>
        </header>
        <nav>
          <a href={href(addWeeks(week, -1))}>← Semana anterior</a>
          {week < currentWeek && <a href={href(addWeeks(week, 1))}>Semana siguiente →</a>}
        </nav>
        {days.length === 0 && <p class="empty">Sin tareas terminadas esta semana.</p>}
        {days.map((day) => (
          <section key={day.date}>
            <h2>{dayHeading(day.date, props.today)}</h2>
            {day.cards.map((card) => (
              <ReportCard key={card.id} card={card} label={labelOf(card)} />
            ))}
          </section>
        ))}
        {props.active && (
          <section>
            <h2>En curso</h2>
            {props.active.length === 0 && <p class="empty">Nada en curso.</p>}
            {props.active.map((card) => (
              <ReportCard key={card.id} card={card} label={labelOf(card)} />
            ))}
          </section>
        )}
      </main>
    </Document>
  );
}
