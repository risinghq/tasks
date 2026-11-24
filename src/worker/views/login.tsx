/** @jsxImportSource hono/jsx */
import { Document } from "./layout";
import css from "./login.css?raw";

export function LoginPage(props: { error?: string }) {
  return (
    <Document title="Tareas" css={css}>
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
