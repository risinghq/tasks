# tasks

A work log for a small team. Each person keeps a Trello-style board of their
own, with four lists (Pendiente, Esta semana, En curso, Hecho) where finished
cards fall into one lane per day, and shares a read-only weekly report as a
link. The interface is in Spanish. It runs as one Cloudflare Worker with a D1
database and an R2 bucket for the files attached to notes.

## Run it

Needs [Bun](https://bun.sh). `mise.toml` pins the version.

```sh
bun install
bun run dev
```

`bun run dev` creates `.dev.vars` from `.dev.vars.example` on the first run,
applies the migrations to the local D1 database and serves the app at
<http://localhost:5173>. The local account is `dev@tasks.test`. Signing in with
Google needs a Google client in `.dev.vars` (see [Secrets](#secrets)); the tests
sign in with a cookie signed by `SESSION_SECRET` instead.

## Use it

- Drag cards between lists and inside a list. With the keyboard, focus a card,
  press Space to lift it, the arrow keys to move it and Space to drop it. Escape
  cancels a drag. Enter opens the card.
- Every change shows at once and saves in the background. If a save fails, the
  card goes back and a notice offers to retry.
- "Añade una tarjeta" at the foot of a list opens a composer. Enter adds the
  card and keeps the composer open for the next one. The composer in Hecho adds
  to today.
- Every card shows a circle left of the title. Hovering a card shows an edit
  button in its corner. The circle moves the card to the top of today in Hecho.
  In Hecho, the filled check moves it back to En curso.
- The edit button, or `e` while hovering the card, edits the title in place and
  lists the card's actions beside it: to its right, else to its left, else under
  it on a narrow screen.
- A click opens the card. Each field in it saves on its own. The list button in
  its header moves the card. Its address is `/c/<id>`, and the browser's back
  button closes it.
- Delete shows "Tarjeta eliminada. Deshacer" for 6 seconds. The card is deleted
  when the notice closes.
- A card has one label or none. The Etiqueta button in the card opens a list of
  your labels. Pick one, pick "Sin etiqueta", create a label with a name and one
  of six colors, or rename, recolor or delete one. Deleting a label clears it
  from its cards. A card without a label shows no stripe.
- "Filtrar" hides the cards that do not match a text, a label or a requester.
  The filter is in the address, so a reload keeps it.
- A click on a label stripe turns every stripe into a pill with the label's
  name, and back.
- Notas, in the card back, is the card's log: a phone call, an address, a
  screenshot, a PDF. Type and press Enter, paste a picture, drop files anywhere
  on the card back or pick them with Adjuntar. Each note keeps its author and
  time, and can be edited or deleted. On the board, Ctrl+V pastes over the card
  under the pointer and files dropped on a card land in its notes. A file is at
  most 25 MB. Notes never show in a report.
- Shortcuts, when the focus is not in a text field: `n` opens the composer of
  the list under the pointer, `e` edits a card, `a` opens a card to take a note,
  `f` opens the filter, `x` clears it and `?` shows the list of shortcuts.
- A card dropped into Hecho gets today's date in America/Lima. Dropped on a day
  header, it gets that day. Moving it out clears the date. The card changes the
  date for work finished earlier.
- Hecho shows the days of the current week. "Semanas anteriores" loads earlier
  weeks one at a time.
- Your name at the top right opens a menu with Ajustes, Tema, Atajos de teclado
  and Salir. Tema is Sistema, Claro or Oscuro; Sistema follows the device.
- On a screen narrower than 768px the lists become tabs, starting on En curso.
  Mover in a card changes its list there.
- Compartir informe, in the header or the workspace switcher, lists the report
  links. Each link shows one audience: the whole workspace, one label (a
  freelancer gives each client the label link for that client), or one member (a
  company reads each employee's cards). Owners create, regenerate and delete
  links. Regenerating invalidates the old link.
- In a workspace with more than one member, a card takes a Responsable, shown on
  the card, and the filter narrows the board by Responsable.
- The report is at `/r/<token>` and shows what was done by day, what is in
  progress and what is next. `?semana=2026-W42` picks another week.

### Add cards from a script

Ajustes has a Tokens de acceso section. Type a name, press "Crear token" and
copy the token. It is shown once and cannot be read again. The list shows each
token's name, creation date and last use. "Revocar" stops a token at once.
Disabling the member stops all their tokens until "Activar".

A script sends the token as `Authorization: Bearer <token>`. Only `/api/v1`
accepts it, and `/api/v1` accepts nothing else. Everything is JSON.

```sh
export TASKS_URL=https://tasks.<subdomain>.workers.dev
export TASKS_TOKEN=tasks_...
bun run log -- "Informe de enero" --list hecho --label cicat
```

The script posts one card and prints its list, id and title. `--list` is
`pendiente`, `esta_semana`, `en_curso` or `hecho`. `--label`, `--notes`,
`--requester` and `--date` are optional. Without a title and a list it prints
the usage and exits with 2.

| Request                                   | Does                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `POST /api/v1/cards`                      | Creates a card at the end of its list on your board. Answers 201.       |
| `GET /api/v1/cards?list=&semana=2026-W42` | Lists open cards and the Hecho cards of one week (this one by default). |

`POST` takes `title` and `list`, and optionally `label` (the name of one of your
labels, any case), `notes`, `requester` and `date`. `date` is a Lima date, only
for `hecho`, never in the future, and defaults to today. An unknown field, list
or label answers 400. `GET` narrows by `list` as well. Both answer with cards
that carry `label` by name next to `labelId`.

From the sixth wrong token from one address within 15 minutes, `/api/v1` answers
that address 429 with `Retry-After` for 15 minutes. A valid token still works.

### Members

Anyone with a Google account signs up and gets a personal workspace. The user
menu lists their workspaces. "Espacio nuevo" makes another, for a company or a
project, with its own board, labels, members, tokens and report links.

Owners see a Miembros section in Ajustes.

- "Añadir" takes the email of a Google account and a role. That person finds the
  workspace in their menu when they sign in. tasks sends no email, so tell them
  yourself.
- A member can leave with "Salir del espacio". An owner can remove or demote
  anyone but the last owner.

## Secrets

| Name                   | Meaning                                   |
| ---------------------- | ----------------------------------------- |
| `SESSION_SECRET`       | Key that signs the session cookie.        |
| `GOOGLE_CLIENT_ID`     | Client ID of the Google OAuth web client. |
| `GOOGLE_CLIENT_SECRET` | Client secret of the same Google client.  |

Generate a signing key with `openssl rand -base64 48`. The Google client is a
Web application client whose authorized redirect URI is
`https://<host>/auth/google/callback` (add
`http://localhost:5173/auth/google/callback` for local use). API tokens need no
secret: the database holds their SHA-256 hash.

## Migrate

Migrations are SQL files in `drizzle/`. After a change to
`src/worker/db/schema.ts`, generate the next one, then apply it:

```sh
bun run db:generate
bun run db:migrate:local
bun run db:migrate:remote
```

## Import from Trello

```sh
bun run import:trello export.json                 # print the SQL
bun run import:trello export.json --apply local   # write it to the local D1
bun run import:trello export.json --apply remote  # write it to the deployed D1
```

Name the target with `--email <email>` (that account's personal workspace, which
must exist) or `--workspace <id>`. Give one of them.

| Trello list     | tasks       |
| --------------- | ----------- |
| Trabajando, Hoy | En curso    |
| Esta semana     | Esta semana |
| Pendiente       | Pendiente   |
| Completado      | Hecho       |

A Hecho card gets the Lima date of the last move into Completado, or of its
creation when it was created there. A card takes its first named Trello label as
its label, matched by name on the person's labels and created when missing. A
card without a named label stays without one. Trello colors outside the six map
to the nearest. Within each Trello list, cards keep their `pos` order. En curso
takes Trabajando first, then Hoy. Imported cards go after the cards already on
the board. Importing the same file twice adds nothing.

## Deploy

A push to `master` checks, migrates the D1 database and deploys the Worker from
GitHub Actions. The secret, the two variables, the token's permissions, the
rollback bookmark and the first-time setup are in
[docs/deploy.md](docs/deploy.md).

## Develop

```sh
bun run check      # format, lint, types, Worker tests and browser tests
bun run test       # the Worker tests alone
bun run test:e2e   # the browser tests alone
bun run shots      # screenshots of the main screens into shots/, not part of check
```

The browser tests need Chromium (`bunx playwright install chromium`). They build
the app and serve it with `vite preview` on a port and a D1 state of their own,
which they delete first.

The code map and the rules the code keeps are in
[docs/architecture.md](docs/architecture.md). The color, type, space and motion
rules are in [docs/design.md](docs/design.md).
