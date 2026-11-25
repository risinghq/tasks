/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { Fragment } from "hono/jsx";
import tokens from "../../web/styles/tokens.css?raw";
import base from "./base.css?raw";

/** The page's absolute address and its card. scripts/og.tsx renders the cards
 * into /og at build time. */
export type Share = { url: string; image: string };

/** The share tags for a page at `url`, with the card `/og/<card>.png` beside it. */
export function shareOf(url: URL, card: "home" | "report"): Share {
  return { url: url.origin + url.pathname, image: `${url.origin}/og/${card}.png` };
}

// These pages use the app's tokens and follow the system theme. They do not
// read a stored choice.
export function Document(props: {
  title: string;
  css: string;
  children: unknown;
  description?: string;
  /** Public pages let search engines in. The login and report pages do not. */
  indexable?: boolean;
  /** How a pasted link unfurls in chats and social sites. */
  share?: Share;
}) {
  const share = props.share;
  return (
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {!props.indexable && <meta name="robots" content="noindex, nofollow" />}
        {props.description && <meta name="description" content={props.description} />}
        <meta name="color-scheme" content="light dark" />
        {share && (
          <Fragment>
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="Tareas" />
            <meta property="og:url" content={share.url} />
            <meta property="og:title" content={props.title} />
            {props.description && <meta property="og:description" content={props.description} />}
            <meta property="og:image" content={share.image} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:locale" content="es_ES" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={props.title} />
            {props.description && <meta name="twitter:description" content={props.description} />}
            <meta name="twitter:image" content={share.image} />
          </Fragment>
        )}
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
