/** @jsxImportSource hono/jsx */
import { Document } from "./layout";

const LOGIN_CSS = `
body { display: grid; place-items: center; }
main { width: min(22.5rem, 100% - var(--space-8)); padding: var(--space-6);
  background: var(--overlay); border-radius: var(--radius-lg); }
h1 { margin-bottom: var(--space-4); font-size: var(--text-lg); line-height: var(--leading-tight); font-weight: var(--weight-strong); }
.google { display: grid; place-items: center; height: var(--field); border-radius: var(--radius-md);
  background: var(--accent); color: var(--text-on-solid); font-size: var(--text-base);
  font-weight: var(--weight-strong); text-decoration: none;
  transition: background-color var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out); }
.google:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) { .google:hover { background: var(--accent-hover); } }
.google:active { transform: scale(0.97); }
.error { margin-bottom: var(--space-4); color: var(--text-danger); font-weight: var(--weight-strong); }
`;

export function LoginPage(props: { error?: string }) {
  return (
    <Document title="Tareas" css={LOGIN_CSS}>
      <main data-elevation="overlay">
        <h1>Tareas</h1>
        {props.error && (
          <p class="error" role="alert">
            {props.error}
          </p>
        )}
        <a class="google" href="/auth/google">
          Continuar con Google
        </a>
      </main>
    </Document>
  );
}
