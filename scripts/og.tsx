/** @jsxImportSource react */
// Renders the Open Graph cards into public/og before the build. The layout
// follows the rising.sh cards: copy on the left, a framed page bleeding off the
// right edge.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { ReactElement } from "react";
import satori from "satori";

const size = { width: 1200, height: 630 };
const output = path.join(import.meta.dirname, "..", "public", "og");
const fontFiles = path.join(import.meta.dirname, "..", "node_modules", "@fontsource", "inter", "files");

// Satori inlines styles and lays out with flexbox only, so the card repeats the
// app's token values. It reads WOFF but not variable fonts, hence the static
// Fontsource files instead of public/fonts.
const ink = "#0f1729";
const muted = "#5b6474";
const accent = "#1868db";
const fill = "#eef2f8";
const line = "#e3e7ee";
const labelColors = { blue: "#3b82f6", green: "#22a06b", orange: "#e2740d" };

/** A card in the frame: a label dot before the tag, or a check when it is done. */
type Row = { title: string; tag: string; label?: keyof typeof labelColors; done?: boolean };

type Card = {
  file: string;
  eyebrow: string;
  title: string;
  description: string;
  url: string;
  frame: { address: string; heading: string; subheading: string; rows: Row[] };
};

const cards: Card[] = [
  {
    file: "home",
    eyebrow: "Tablero semanal",
    title: "Tu semana en un solo tablero",
    description: "Reparte el trabajo de cada cliente y envía a cada uno solo lo suyo.",
    url: "tasks.rising.sh",
    frame: {
      address: "tasks.rising.sh",
      heading: "Esta semana",
      subheading: "Tres clientes, un tablero",
      rows: [
        { title: "Revisar contrato con proveedor", tag: "Empresa A", label: "blue" },
        { title: "Enviar facturas de noviembre", tag: "Estudio Norte", label: "green" },
        { title: "Corregir el formulario de alta", tag: "Tienda Sur", label: "orange" },
        { title: "Preparar presupuesto 2027", tag: "Empresa A", label: "blue" },
      ],
    },
  },
  {
    file: "report",
    eyebrow: "Informe semanal",
    title: "Lo que se hizo esta semana",
    description: "Lo hecho cada día, lo que sigue en curso y lo que viene después.",
    url: "tasks.rising.sh",
    frame: {
      address: "tasks.rising.sh/r/…",
      heading: "Empresa A",
      subheading: "Hecho esta semana",
      rows: [
        { title: "Revisar contrato con proveedor", tag: "Lun", done: true },
        { title: "Llamada con contabilidad", tag: "Mar", done: true },
        { title: "Preparar presupuesto 2027", tag: "Mié", done: true },
        { title: "Actualizar la web de precios", tag: "Jue", done: true },
      ],
    },
  },
];

/** The favicon's three bars, as the app's mark. */
function Mark({ size: side }: { size: number }) {
  return (
    <svg width={side} height={side} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill={accent} />
      <rect x="7" y="8" width="5" height="16" rx="1.5" fill="#fff" />
      <rect x="14" y="8" width="5" height="11" rx="1.5" fill="#fff" opacity="0.85" />
      <rect x="21" y="8" width="5" height="7" rx="1.5" fill="#fff" opacity="0.7" />
    </svg>
  );
}

function Lockup({ size: text }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: text, lineHeight: 1 }}>
      <Mark size={Math.round(text * 1.15)} />
      <span
        style={{
          marginLeft: Math.round(text * 0.35),
          fontWeight: 600,
          letterSpacing: -0.02 * text,
          color: ink,
        }}
      >
        Tareas
      </span>
    </div>
  );
}

function titleStyle(title: string) {
  const words = title.split(/\s+/).length;
  if (words <= 4) return { fontSize: 64, letterSpacing: -2.2 };
  if (words <= 8) return { fontSize: 56, letterSpacing: -1.8 };
  return { fontSize: 44, letterSpacing: -1.2 };
}

function FrameRow({ row }: { row: Row }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "13px 0",
        borderTop: `1px solid ${line}`,
        fontSize: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          marginRight: 12,
          borderRadius: 8,
          background: row.done ? accent : "#fff",
          border: row.done ? "none" : `1.5px solid ${muted}`,
        }}
      >
        {row.done && (
          <svg width={10} height={10} viewBox="0 0 24 24">
            <path d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" />
          </svg>
        )}
      </div>
      <span style={{ flexGrow: 1, color: ink }}>{row.title}</span>
      <span style={{ display: "flex", alignItems: "center", marginLeft: 16, color: muted, fontSize: 14 }}>
        {row.label && (
          <span
            style={{
              width: 8,
              height: 8,
              marginRight: 6,
              borderRadius: 4,
              background: labelColors[row.label],
            }}
          />
        )}
        {row.tag}
      </span>
    </div>
  );
}

function Frame({ frame }: { frame: Card["frame"] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        left: 48,
        top: 64,
        width: 600,
        height: 640,
        background: "#fff",
        border: `1px solid ${line}`,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 44,
          padding: "0 20px",
          borderBottom: `1px solid ${line}`,
          fontSize: 15,
          color: muted,
        }}
      >
        {frame.address}
      </div>
      {/* The frame runs past the card's edge; the wider right padding keeps the rows inside. */}
      <div style={{ display: "flex", flexDirection: "column", padding: "28px 136px 28px 32px" }}>
        <Lockup size={15} />
        <div style={{ marginTop: 36, fontSize: 30, fontWeight: 600, letterSpacing: -0.8, color: ink }}>
          {frame.heading}
        </div>
        <div style={{ marginTop: 6, fontSize: 15, color: muted }}>{frame.subheading}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
          {frame.rows.map((row) => (
            <FrameRow key={row.title} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ogCard(card: Card): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        width: size.width,
        height: size.height,
        overflow: "hidden",
        background: "#fff",
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flexShrink: 0,
          // Satori adds padding outside the width: 640 wide in all.
          width: 528,
          padding: "64px 48px 64px 64px",
        }}
      >
        <Lockup size={32} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              marginBottom: 20,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: 1.3,
              textTransform: "uppercase",
              color: accent,
            }}
          >
            {card.eyebrow}
          </div>
          <div style={{ lineHeight: 1.05, fontWeight: 600, color: ink, ...titleStyle(card.title) }}>
            {card.title}
          </div>
          <div style={{ marginTop: 24, fontSize: 22, lineHeight: 1.36, color: muted }}>
            {card.description}
          </div>
        </div>
        <div style={{ fontSize: 20, color: muted }}>{card.url}</div>
      </div>
      <div style={{ display: "flex", position: "relative", flexShrink: 0, width: 560, background: fill }}>
        <Frame frame={card.frame} />
      </div>
    </div>
  );
}

async function loadFonts() {
  const faces = [400, 500, 600] as const;
  const subsets = ["latin", "latin-ext"];
  return Promise.all(
    subsets.flatMap((subset) =>
      faces.map(async (weight) => ({
        name: "Inter",
        weight,
        style: "normal" as const,
        data: await readFile(path.join(fontFiles, `inter-${subset}-${weight}-normal.woff`)),
      })),
    ),
  );
}

const fonts = await loadFonts();
await mkdir(output, { recursive: true });
for (const card of cards) {
  const svg = await satori(ogCard(card), { ...size, fonts });
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: size.width },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  await writeFile(path.join(output, `${card.file}.png`), png);
}
console.log(`og: ${cards.map((card) => `public/og/${card.file}.png`).join(", ")}`);
