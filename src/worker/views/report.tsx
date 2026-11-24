/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { addWeeks, dayHeading, weekRangeLabel } from "../../shared/dates";
import { labelStyle, LIST_TITLES, type Card, type Label } from "../../shared/model";
import { Document } from "./layout";
import css from "./report.css?raw";

export type ReportData = {
  token: string;
  week: string;
  currentWeek: string;
  workspaceName: string;
  today: string;
  /** The page address the copy button shows, without the scheme. */
  url: string;
  days: { date: string; cards: Card[] }[];
  /** Every card outside Hecho, or null when the week shown is not the current one. */
  open: Card[] | null;
  labels: Label[];
};

const NO_LABEL_DOT = "var(--border-control)";

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const weekNumber = (week: string): number => Number(week.split("-W")[1]);

/** "Hoy", "Ayer" or the weekday and date, for a row's status. */
function dayStatus(doneDate: string, today: string): string {
  const first = dayHeading(doneDate, today).split(",")[0]!;
  return first.charAt(0).toUpperCase() + first.slice(1);
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

function ReportRow(props: { card: Card; done?: boolean; today: string }) {
  const { card, today } = props;
  const done = props.done === true;
  const total = card.checklist.length;
  const checked = card.checklist.filter((item) => item.done).length;
  const showChecklist = !done && total > 0;
  return (
    <div class="row">
      <span class={done ? "mark done" : "mark"} aria-hidden="true">
        {done && CHECK}
      </span>
      <span class="row-main">
        <span class="row-title">{card.title}</span>
        {(card.requester || showChecklist) && (
          <span class="row-meta">
            {card.requester && (
              <span class="req">
                <span class="avatar" aria-hidden="true">
                  {card.requester.charAt(0).toUpperCase()}
                </span>
                {card.requester}
              </span>
            )}
            {showChecklist && (
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
      <span class="row-status">{done ? dayStatus(card.doneDate ?? "", today) : "En curso"}</span>
    </div>
  );
}

export function ReportPage(props: ReportData) {
  const { token, week, currentWeek, labels } = props;
  const href = (target: string) => `/r/${token}?semana=${target}`;
  const finished = props.days.flatMap((day) => day.cards);
  const isCurrent = props.open !== null;
  const inProgress = (props.open ?? []).filter((card) => card.list === "en_curso");
  const carry = (props.open ?? []).filter((card) => card.list !== "pendiente");
  const labelOf = (card: Card) => labels.find((label) => label.id === card.labelId);

  const stats = [
    { n: finished.length, label: "Hechas", accent: true },
    ...(isCurrent
      ? [
          { n: inProgress.length, label: "En curso", accent: false },
          { n: carry.length, label: "Pasan a la próxima semana", accent: false },
        ]
      : []),
  ];

  const groups = [
    ...labels.map((label) => ({
      id: label.id as string | null,
      name: label.name,
      color: labelStyle(label.color).background,
    })),
    { id: null, name: "Sin etiqueta", color: NO_LABEL_DOT },
  ]
    .map((group) => {
      const done = finished.filter((card) => card.labelId === group.id);
      const curso = inProgress.filter((card) => card.labelId === group.id);
      const summary = [
        done.length ? plural(done.length, "hecha", "hechas") : "",
        curso.length ? `${curso.length} en curso` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return { ...group, done, curso, summary };
    })
    .filter((group) => group.done.length + group.curso.length > 0);

  return (
    <Document title={`Informe ${weekRangeLabel(week)}`} css={css}>
      <header class="top">
        <span class="mono" aria-hidden="true">
          {props.workspaceName.charAt(0).toUpperCase()}
        </span>
        <span class="ws">{props.workspaceName}</span>
        <span class="kind">Informe semanal</span>
        <span class="fill" />
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
        <p class="lead">
          Semana {weekNumber(week)} · {weekRangeLabel(week)}
        </p>
        <h1>
          {plural(finished.length, "tarea hecha", "tareas hechas")} {isCurrent ? "esta" : "esa"} semana.
        </h1>
        <div class="stats" data-elevation="raised">
          {stats.map((stat) => (
            <div class="stat" key={stat.label}>
              <span class={stat.accent ? "num accent" : "num"}>{stat.n}</span>
              <span class="stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
        <div class="groups">
          {groups.map((group, index) => (
            <section
              class="group"
              data-elevation="raised"
              aria-labelledby={`group-${index}`}
              key={group.name}
            >
              <div class="group-head">
                <span class="dot" style={{ background: group.color }} aria-hidden="true" />
                <h2 class="group-name" id={`group-${index}`}>
                  {group.name}
                </h2>
                <span class="group-sum">{group.summary}</span>
              </div>
              {group.done.map((card) => (
                <ReportRow card={card} done today={props.today} key={card.id} />
              ))}
              {group.curso.map((card) => (
                <ReportRow card={card} today={props.today} key={card.id} />
              ))}
            </section>
          ))}
        </div>
        {isCurrent && carry.length > 0 && (
          <section class="carry" aria-labelledby="carry-title">
            <h2 class="carry-title" id="carry-title">
              Pasa a la próxima semana
            </h2>
            <div class="carry-list">
              {carry.map((card) => {
                const label = labelOf(card);
                return (
                  <div class="crow" key={card.id}>
                    <span
                      class="cdot"
                      style={{ background: label ? labelStyle(label.color).background : NO_LABEL_DOT }}
                      aria-hidden="true"
                    />
                    <span class="ctitle">{card.title}</span>
                    <span class="clist">{LIST_TITLES[card.list]}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <footer class="foot">
          <nav>
            <a href={href(addWeeks(week, -1))}>← Semana {weekNumber(addWeeks(week, -1))}</a>
            {week < currentWeek && (
              <a href={href(addWeeks(week, 1))}>Semana {weekNumber(addWeeks(week, 1))} →</a>
            )}
          </nav>
          <span class="note">Solo lectura{isCurrent ? " · se actualiza hasta el domingo" : ""}</span>
        </footer>
      </main>
      {COPY_SCRIPT}
    </Document>
  );
}
