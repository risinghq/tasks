/** @jsxImportSource hono/jsx */
import { Fragment } from "hono/jsx";
import { raw } from "hono/html";
import { Document, type Share } from "./layout";
import css from "./landing.css?raw";

const MANIFESTO =
  "Tu semana no cabe en una sola empresa. Tareas reúne lo personal y lo de cada trabajo en un mismo tablero, separado por espacios y ordenado por semanas. Lo que termines se cuenta solo.";

const LIGHT_WORDS = `
(function () {
  var words = document.querySelectorAll(".manifesto span");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { document.documentElement.className = "nojs"; return; }
  function update() {
    var box = document.querySelector(".manifesto").getBoundingClientRect();
    var progress = (innerHeight * 0.85 - box.top) / (box.height + innerHeight * 0.4);
    var lit = Math.max(0, Math.min(1, progress)) * words.length;
    words.forEach(function (w, i) { w.classList.toggle("lit", i < lit); });
  }
  addEventListener("scroll", update, { passive: true });
  update();
})();
`;

const LISTS: [string, string[]][] = [
  ["Pendiente", ["Renovar dominio"]],
  ["Esta semana", ["Cotización", "Informe mensual"]],
  ["En curso", ["Rediseño web"]],
  ["Hecho", ["Factura de octubre"]],
];

const POINTS: [string, string][] = [
  ["Espacios", "Personal, Empresa A, Empresa B. Cada uno con su tablero, sus etiquetas y sus miembros."],
  ["Cuatro listas", "Pendiente, Esta semana, En curso y Hecho. Arrastra una tarjeta para avanzarla."],
  ["Informe semanal", "Un enlace por cliente o persona, con lo hecho cada día. Cada uno ve solo lo suyo."],
];

export function LandingPage(props: { share: Share }) {
  return (
    <Document
      title="Tareas: tu semana en un solo tablero"
      css={css}
      description="Un tablero semanal para repartir el trabajo de cada cliente, con un informe que cada uno recibe con su propio enlace."
      indexable
      share={props.share}
    >
      <main>
        <div class="top">
          <span>Tareas</span>
        </div>
        <h1>Toda tu semana, en un solo tablero.</h1>
        <p class="lead">
          Lo personal y cada empresa, separados por espacios. Cuatro listas y un informe semanal que se
          comparte con un enlace.
        </p>
        <a class="google" data-elevation="raised" href="/auth/google">
          Continuar con Google
        </a>
        <div class="mini" data-elevation="raised" aria-hidden="true">
          {LISTS.map(([title, cards]) => (
            <div key={title}>
              <h2>{title}</h2>
              {cards.map((card) => (
                <p key={card} data-elevation="raised">
                  {card}
                </p>
              ))}
            </div>
          ))}
        </div>
        <p class="manifesto">
          {MANIFESTO.split(" ").map((word) => (
            <Fragment key={word}>
              <span>{word}</span>{" "}
            </Fragment>
          ))}
        </p>
        <div class="points">
          {POINTS.map(([title, text]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{text}</p>
            </section>
          ))}
        </div>
        <div class="end">
          <a class="google" data-elevation="raised" href="/auth/google">
            Continuar con Google
          </a>
        </div>
      </main>
      <script>{raw(LIGHT_WORDS)}</script>
    </Document>
  );
}
