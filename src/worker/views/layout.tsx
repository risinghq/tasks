/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import tokens from "../../web/styles/tokens.css?raw";
import base from "./base.css?raw";

// These pages use the app's tokens and follow the system theme. They do not
// read a stored choice.
export function Document(props: {
  title: string;
  css: string;
  children: unknown;
  description?: string;
  /** Public pages let search engines in. The login and report pages do not. */
  indexable?: boolean;
}) {
  return (
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {!props.indexable && <meta name="robots" content="noindex, nofollow" />}
        {props.description && <meta name="description" content={props.description} />}
        <meta name="color-scheme" content="light dark" />
        <link
          rel="preload"
          href="/fonts/inter-latin.woff2"
          as="font"
          type="font/woff2"
          crossorigin="anonymous"
        />
        <title>{props.title}</title>
        <style>{raw(tokens + base + props.css)}</style>
      </head>
      <body>{props.children}</body>
    </html>
  );
}
