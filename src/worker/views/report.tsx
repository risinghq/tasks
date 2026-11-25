/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { addWeeks, dayHeading, weekRangeLabel } from "../../shared/dates";
import { labelStyle, type Card, type Label } from "../../shared/model";
import { Document } from "./layout";
import css from "./report.css?raw";

export type ReportData = {
  token: string;
  week: string;
  currentWeek: string;
  /** What the link shows: the label's, the member's or the workspace's name. */
  scopeName: string;
  /** The line under the title: whose report it is. */
  subtitle: string;
  /** Each row names its label, except on a label link where they all share one. */
  showLabels: boolean;
  today: string;
  /** The page address the copy button shows, without the scheme. */
  url: string;
  days: { date: string; cards: Card[] }[];
  /** Every card outside Hecho, or null when the week shown is not the current one. */
  open: Card[] | null;
  labels: Label[];
};

const weekNumber = (week: string): number => Number(week.split("-W")[1]);

/** "Hoy", "Ayer" or the weekday and date, heading a done group. */
function dayName(date: string, today: string): string {
  const heading = dayHeading(date, today);
  return heading.charAt(0).toUpperCase() + heading.slice(1);
}

/** The first non-empty line of a description, for the muted line under a title. */
function firstLine(description: string): string | undefined {
  return description
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
}

const CHECK = raw(
  '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.2 5.8l2.2 2.2 4.4-5"/></svg>',
);
const LINK_ICON = raw(
  '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.8 9.2a2.6 2.6 0 003.7 0l2.2-2.2a2.6 2.6 0 00-3.7-3.7l-.9.9M9.2 6.8a2.6 2.6 0 00-3.7 0L3.3 9a2.6 2.6 0 003.7 3.7l.9-.9"/></svg>',
);

const COPY_SCRIPT = raw(`<script>
(function () {
  var button = document.getElementById("copiar");
  var label = button.querySelector(".copy-label");
  var timer;
  function feedback() {
    label.textContent = "Copiado";
    clearTimeout(timer);
    timer = setTimeout(function () {
      label.textContent = "Copiar enlace";
    }, 1600);
  }
  button.addEventListener("click", function () {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(location.href).then(feedback, feedback);
      return;
    }
    var area = document.createElement("textarea");
    area.value = location.href;
    area.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (e) {}
    area.remove();
    feedback();
  });
})();
</script>`);

function LabelTag(props: { label: Label | undefined }) {
  if (!props.label) return null;
  return (
    <span class="tag">
      <span
        class="tag-dot"
        style={{ background: labelStyle(props.label.color).background }}
        aria-hidden="true"
      />
      <span class="tag-name">{props.label.name}</span>
    </span>
  );
}

function ReportRow(props: {
  card: Card;
  kind: "done" | "open" | "next";
  today: string;
  labels: Label[];
  showLabels: boolean;
}) {
  const { card, kind, labels } = props;
  const total = card.checklist.length;
  const checked = card.checklist.filter((item) => item.done).length;
  const summary = kind === "done" ? firstLine(card.description) : undefined;
  const label = labels.find((l) => l.id === card.labelId);
  return (
    <div class="row">
      <span class={kind === "done" ? "mark done" : "mark"} aria-hidden="true">
        {kind === "done" && CHECK}
      </span>
      <span class="row-main">
        <span class="row-head">
          <span class="row-title">{card.title}</span>
          {props.showLabels && <LabelTag label={label} />}
        </span>
        {summary && <span class="row-desc">{summary}</span>}
        {(card.requester || (kind === "open" && total > 0)) && (
          <span class="row-meta">
            {card.requester && (
              <span class="req">
                <span class="avatar" aria-hidden="true">
                  {card.requester.charAt(0).toUpperCase()}
                </span>
                <span class="req-name">{card.requester}</span>
              </span>
            )}
            {kind === "open" && total > 0 && (
              <span class="prog">
                <span class="bar" aria-hidden="true">
                  <span style={{ width: `${(checked / total) * 100}%` }} />
                </span>
                {checked} de {total}
              </span>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

export function ReportPage(props: ReportData) {
  const { token, week, currentWeek, labels } = props;
  const href = (target: string) => `/r/${token}?semana=${target}`;
  const isCurrent = props.open !== null;
  const inProgress = (props.open ?? []).filter((card) => card.list === "en_curso");
  const next = (props.open ?? []).filter((card) => card.list === "esta_semana");
  const rowProps = { today: props.today, labels, showLabels: props.showLabels };

  return (
    <Document title={`${props.scopeName} · Informe ${weekRangeLabel(week)}`} css={css}>
      <header class="top">
        <div class="copy-wrap">
          <button id="copiar" class="copy" type="button" data-elevation="raised">
            {LINK_ICON}
            <span class="copy-label" role="status">
              Copiar enlace
            </span>
          </button>
          <span class="tip" aria-hidden="true">
            {props.url}
          </span>
        </div>
      </header>
      <main class="column">
        <h1 class="scope">{props.scopeName}</h1>
        <p class="sub">{props.subtitle}</p>
        <div class="week-bar">
          <p class="week">
            Semana {weekNumber(week)} · {weekRangeLabel(week)}
          </p>
          <nav class="week-nav" aria-label="Semanas">
            <a href={href(addWeeks(week, -1))}>← Semana {weekNumber(addWeeks(week, -1))}</a>
            {week < currentWeek && (
              <a href={href(addWeeks(week, 1))}>Semana {weekNumber(addWeeks(week, 1))} →</a>
            )}
          </nav>
        </div>
        <section class="sec" aria-labelledby="hecho">
          <h2 class="sec-name" id="hecho">
            Hecho
          </h2>
          {props.days.length === 0 && <p class="empty">Nada hecho esta semana.</p>}
          {props.days.map((day) => (
            <div class="day" key={day.date}>
              <h3 class="day-name">{dayName(day.date, props.today)}</h3>
              {day.cards.map((card) => (
                <ReportRow card={card} kind="done" {...rowProps} key={card.id} />
              ))}
            </div>
          ))}
        </section>
        {inProgress.length > 0 && (
          <section class="sec" aria-labelledby="en-curso">
            <h2 class="sec-name" id="en-curso">
              En curso
            </h2>
            {inProgress.map((card) => (
              <ReportRow card={card} kind="open" {...rowProps} key={card.id} />
            ))}
          </section>
        )}
        {isCurrent && next.length > 0 && (
          <section class="sec" aria-labelledby="siguiente">
            <h2 class="sec-name" id="siguiente">
              Siguiente
            </h2>
            {next.map((card) => (
              <ReportRow card={card} kind="next" {...rowProps} key={card.id} />
            ))}
          </section>
        )}
        <footer class="foot">
          <span class="note">Solo lectura{isCurrent ? " · se actualiza hasta el domingo" : ""}</span>
        </footer>
      </main>
      {COPY_SCRIPT}
    </Document>
  );
}
