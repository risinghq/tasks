# Architecture

One Worker serves the JSON API, the report page and the React app.

```text
src/shared   model, schemas and date rules used by both sides
src/worker   Hono app, D1 queries, auth
src/web      React app: board, dialogs, drag and drop
src/import   Trello export to cards
scripts      import-trello, prepare-dev, dev-account, log
drizzle      generated migrations
test         tests that drive the Worker over HTTP
e2e          Playwright tests that drive the app in Chromium
```

## Requests

`src/worker/index.ts` mounts, in this order:

1. `/` for a signed-out visitor (the landing page, `views/landing.tsx`),
   `/login`, `/auth/google`, `/auth/google/callback` and `/logout`
   (`routes/auth.tsx`), public. A signed-in visitor at `/` falls through to the
   React app.
2. `/api/v1/*` (`routes/v1.ts`), the JSON API for scripts. It takes a bearer
   token and no cookie. See API tokens.
3. `/api/*` (`routes/api.ts`), the JSON API. It checks the session itself and
   picks the workspace (see Workspaces). `/api/members` (`routes/members.ts`)
   lists and edits the workspace's members, and changing them needs the owner
   role. `/api/tokens` (`routes/tokens.ts`) manages the user's API tokens.
   `/api/report-links` (`routes/report-links.ts`) lists the shared report links,
   and creating, regenerating or deleting one needs the owner role.
4. `/r/<token>` (`routes/report.tsx`), public.
5. `/assets/*`, `/fonts/*` and `/favicon.svg`, public static files.
6. Everything else needs the session and returns the React app, including a
   card's own page, `/c/<id>`.

Without a session, a page request redirects to `/login` and an API request gets
401 (`session.ts`).

## Users and workspaces

Each person has a row in `users`: id, email (unique, always lowercase), name and
session version. Sign-up is open to any Google account with a verified email.
There are no global admins.

Cards, labels, API tokens and report links belong to a workspace (`workspaces`),
not to a user. `workspace_members` joins users to workspaces with the role
`owner` or `member`. An owner renames or deletes the workspace, manages members
and the report links. A member works on the cards and labels.

A user's personal workspace has the user's own id and the name "Personal".
Signing up for the first time creates both rows in one batch
(`createPersonalWorkspace`). A person who wants to keep company A apart from
company B makes one workspace for each (`POST /api/workspaces`) and is its
owner.

A request names its workspace in the `X-Workspace` header. Without it, the
request uses the user's personal workspace. `requireWorkspace` answers 403 for a
workspace the user does not belong to, the same as for one that does not exist.
The web app keeps its choice in `localStorage` (`src/web/workspace.ts`) and
sends it on every call. A member sees someone else's personal workspace under
its owner's name.

The migration `0005_workspaces.sql` gives every existing user a personal
workspace and moves their cards, labels, tokens and report token into it. The
fixed id `00000000-0000-4000-8000-000000000001` stays the first admin's id, so
their data and API tokens keep working.

## Shared state

A user can have two tabs open, and owners change other people's membership. D1
runs each statement, and each batch, as one unit. Every rule below rests on one
statement or one batch, never on a read followed by a write.

### Card position

A card's group is its list, plus the done date in Hecho. Positions are distinct
and ordered inside a group of one workspace. Gaps are allowed, so only the order
means anything. All writes are in `src/worker/cards.ts`.
`cardsOf(db, workspaceId)` returns the only functions that read or write cards,
and each one adds the workspace to its statements, so a route cannot query
without one.

| Write                          | What runs                                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create                         | One INSERT that computes `max(position) + 1` inside the statement. The client may choose the card's id. See Card id.                                                                                        |
| Move, or reorder with an index | One batch: the card's fields with a slot computed in SQL (half a step before the card now at the index, or after the last), then a renumber 1..n of the destination group, then of the group the card left. |
| Edit without a move            | One UPDATE of the edited fields. Positions stay.                                                                                                                                                            |
| Delete                         | One DELETE. The group keeps a gap and its order.                                                                                                                                                            |
| Trello import                  | One INSERT per card at `max(position) + 1` of its group.                                                                                                                                                    |

Two tabs moving into one group both succeed. The second batch runs after the
first and renumbers everything, so positions stay distinct. A request carries
the index its tab computed from the cards it holds, so the later request can
land one slot off from what its tab showed. A tab fetches the board once, when
it loads, so it shows the real order after the next load.

### Card id

`cards.id` is the primary key of the whole table, so an id belongs to one
workspace. A create inserts with `ON CONFLICT DO NOTHING`. When nothing was
inserted, the card with that id is read for the same workspace. A repeat in its
workspace returns the stored card. An id that another workspace's card has
gets 409.

Read, edit, move and delete look the card up by id and user. A card of another
user answers 404, the same as a card that does not exist.

### Lists

The lists are Pendiente (everything not planned for this week), Esta semana, En
curso and Hecho. Hecho holds one group per day. The `list` column holds
`pendiente`, `esta_semana`, `en_curso` or `hecho`.

### Done date

The date exists exactly when the list is Hecho. The `cards` table enforces it
with the CHECK constraint `done_date_iff_hecho`.

| Move                                                 | Done date                                 |
| ---------------------------------------------------- | ----------------------------------------- |
| Created in Hecho, or moved into it with no date      | Today in Lima                             |
| Into Hecho with a date, or a date edited in the card | The given date, never in the future (400) |
| To another day inside Hecho                          | That day                                  |
| Out of Hecho                                         | Cleared                                   |

The placement comes from the card as read at the start of the request. When two
tabs change one card, the later write wins. A move writes list and date
together, so a write never breaks the CHECK constraint.

### Labels

A label belongs to one workspace and has a name and a color. The name is unique
per workspace. The color is one of `green`, `yellow`, `orange`, `red`, `purple`
and `blue`, stored by name. `labelStyle` in `src/shared/model.ts` gives each its
background and text.

A card has one label or none, in `cards.label_id`. A card with no label shows no
stripe. Deleting a label sets `label_id` to null on its cards, in the same
statement (`ON DELETE SET NULL`). A card can only take a label of its own user
(400 otherwise). A name that the user already has gets 409.

### Assignee

A card has one responsible member or none, in `cards.assignee_id`. Only a member
of the card's workspace can be assigned (400 otherwise). Removing a member
clears their cards in the same batch, and deleting the user clears them through
`ON DELETE SET NULL`. The web app hides Responsable on the card back, the card
and the filter while the workspace has one member, since nobody else can take
the card.

### Session

The session is a signed cookie. The server stores no sessions, only the user.

The cookie `tasks_session` is `<userId>.<version>.<expires>.<signature>`. The
signature is an HMAC under `SESSION_SECRET` of the first three parts. The cookie
is HttpOnly, Secure and SameSite=Lax.

| State      | Entered by                                                                                     | Left by                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Signed out | No cookie, a bad signature, a past expiry, a disabled user or a version that no longer matches | A Google sign-in whose verified email belongs to an enabled user                                                     |
| Signed in  | The cookie carries the user's id, the user's current session version and an expiry in 30 days  | Expiry, `POST /logout` in that browser, the user being disabled, a bumped session version, or a new `SESSION_SECRET` |

`requireSession` reads the user row once per request and leaves it for the
route. A disabled user or an old version is signed out on the next request.
Logging out in one browser does not end a session in another. Bumping
`session_version` does. Replacing `SESSION_SECRET` ends every session.

### Google sign-in

`GET /auth/google` makes a random `state` and a PKCE verifier, keeps them in the
cookie `tasks_google` (`state.verifier`, path `/auth`, 10 minutes, HttpOnly,
Secure, SameSite=Lax) and redirects to Google with the S256 challenge of the
verifier. The scope is `openid email`.

`GET /auth/google/callback` compares the returned `state` with the cookie (400
on a mismatch or a missing code), then `google.ts` trades the code, the client
secret and the verifier at Google's token endpoint. The ID token comes straight
from Google over TLS, so its signature is not checked. Its audience, issuer,
expiry and `email_verified` are. A failure is 401. `findOrCreateUser` then looks
the email up in `users` and creates the user and their personal workspace when
there is none. `startSession` sets the cookie and the browser goes to `/`.

Google proves who the person is. Membership decides what they see: an owner adds
someone by email, and the person gets the shared workspace in their menu the
next time they sign in.

`login-limit.ts` counts failures by a key. A bad bearer token uses it under the
key `bearer:<address>`, with the address from `CF-Connecting-IP`. See API
tokens.

### API tokens

A user makes tokens in Ajustes (`/api/tokens`, session only). A token is
`tasks_` and 32 random bytes in base64url. The table `api_tokens` holds its
SHA-256, a name, the creation time and the last use, never the token. The token
is in the response that creates it and nowhere else. Revoking deletes the row. A
row belongs to one user and one workspace, and a token reads and writes only
that workspace. Removing the member or deleting the workspace deletes the token.

`/api/v1` runs `requireToken` (`api-tokens.ts`) and nothing from `session.ts`,
so the cookie is not read there and a request without a bearer gets 401. The
other routes never read `Authorization`, so a token cannot reach them, and
cannot make tokens. A bearer request needs no CSRF step because the browser does
not send it by itself.

`requireToken` runs one UPDATE that sets `last_used_at` on the row whose hash
matches, then reads the owner and the workspace as `requireSession` and
`requireWorkspace` do. A token that matches nothing counts one attempt under the
`bearer:<address>` key. The sixth in a window is 429 with `Retry-After`. A token
that matches does not touch the limit table, so a valid token still works from a
locked address.

`POST /api/v1/cards` resolves the label name to one of the workspace's labels
(`routes/v1.ts`, 400 when there is none) and calls `cardsOf(...).create`, the
same function the board uses. A Hecho card takes `date`, validated as a Done
date, or today. `GET /api/v1/cards` reads through the same `cardsOf` functions
as the board: open cards, and the Hecho cards of `semana`.

### Members

Any member reads the list (`GET /api/members`). Adding, changing a role and
removing someone else need the owner role.

An owner adds a member with an email and a role (`POST /api/members`). An email
with no account gets a user and a personal workspace, so the person finds the
shared workspace the first time they sign in. The name defaults to the part
before the `@`. An email already in this workspace is 409, decided by the
primary key of `workspace_members`, not by a prior read.

A member can remove themselves. An owner can remove or demote anyone. A change
that would leave no other owner is 409; the guard is part of the same statement,
so two owners cannot remove each other together. Removing a member deletes their
API tokens and report link for that workspace and unassigns their cards.

### Report links

A freelancer works for several clients and each client must see only its own
work; a company reads what each employee did. A report link therefore has one
audience. `report_links` holds one row per shared link: `workspace_id`, a
`token` of 32 random bytes (unique), a nullable `label_id`, a nullable
`member_id`, and `created_at`. A check allows at most one of the two scopes:

- Neither: the whole workspace. Each workspace has exactly one (a partial unique
  index), created on demand by the first list, and it cannot be deleted (409).
- `label_id`: the cards with that label, for one client. A label carries at most
  one link, and deleting the label deletes it.
- `member_id`: the cards assigned to that member, for one employee. A member
  carries at most one link per workspace. Removing the member deletes it.

`GET /api/report-links` lists the whole link first, then the scoped ones. `POST`
takes exactly one of `labelId` or `memberId` (400 for none or both, 409 for a
scope that already has a link). `POST /api/report-links/<id>/token` replaces the
token in one UPDATE, so the old link dies at once, and `DELETE` removes a scoped
link. Every change needs the owner role. The web app shows the links in the
Compartir informe dialog (`ShareDialog.tsx`).

| State   | Entered by                           | Left by                       |
| ------- | ------------------------------------ | ----------------------------- |
| Current | The link's creation, or a regenerate | The next regenerate or delete |

Anyone with a token reads that link's report: its scope and its cards, never
another workspace's. A label link shows only that label's cards. A personal
workspace reports under its owner's name. A member link reports under the
member's name. Two tabs regenerating together leave one token in the row, the
later write, and the other tab shows a link that no longer works until it
reopens the dialog.

The report sends `X-Robots-Tag: noindex, nofollow` and
`Cache-Control: no-store`.

## Dates

`src/shared/dates.ts` owns the time zone. Dates are `YYYY-MM-DD` strings in
America/Lima. A week runs Monday to Sunday and is named `YYYY-Www` (ISO week).

## Board in the browser

### Card state

`src/web/useBoard.ts` is the only owner of the cards. Components read the cards
it returns and call its actions: `add`, `edit`, `move`, `remove`, `open` and
`loadOlder`. They keep no copy.

The hook holds `base`, the cards as the server holds them, and `pending`, the
changes the user made that the server has not confirmed. The screen shows `base`
with every pending change applied (`boardState.ts`). A change shows at once, and
the board is never fetched again after a write.

- Writes go out one at a time, in the order made.
- A write that succeeds folds into `base`. The card the server returns replaces
  the local one, so its position and done date come from the server.
- A write that fails is dropped from `pending`, which puts the card back. A
  toast reads "No se pudo guardar. Reintentar", and Reintentar queues the same
  change again.
- A move names the card it goes before. The index in the request is computed
  from `base` when the write is sent, so earlier writes, deleted cards and the
  filter do not shift it.
- A new card gets its id in the browser (`crypto.randomUUID`), so it can be
  edited, and opened, before the server answers. `open` looks for a card in the
  cards on screen (`base` plus `pending`) and reads from `/api` only a card that
  is not there.
- A delete is held in `pending` for 6 seconds behind the toast "Tarjeta
  eliminada. Deshacer". Deshacer drops it. When the toast closes, the request is
  queued. If the page hides first, the held deletes go out as `fetch` with
  `keepalive`. A delete that gets 404 counts as done.

Labels do not go through this queue. A label is created, renamed, recolored or
deleted with one request, and the label popover shows the error of a failed
request, because the card back hides toasts.

The completion circle on a card (`Board.tsx`) is a move. Outside Hecho it goes
before the first card of today's group, so the card lands on top. In Hecho it
goes to the end of En curso.

### Drag and drop

`src/web/groups.ts` names every drop target: `pendiente`, `esta_semana`,
`en_curso` and `hecho:<date>`. Each day in Hecho also has a `:header` target,
open or collapsed, so a card dropped on a day header joins that day. An empty
list or group is a target too.

`useCardDrag.ts` starts a drag after the pointer moves 5px, so a click still
opens the card. While a card is lifted, a local copy of the cards shows the gray
placeholder in the slot the card would take. A drop hands the final place to
`useBoard.move` and discards the copy in the same render, so the card stays
where the placeholder was. Escape cancels the drag. The keyboard sensor lifts a
card with Space, moves it with the arrows and drops it with Space.

### URL and local state

| State                      | Kept in                                                 |
| -------------------------- | ------------------------------------------------------- |
| The open card              | The path `/c/<id>` (`useCardRoute.ts`)                  |
| The filter                 | The query `q`, `etiqueta`, `responsable`, `solicitante` |
| Open or closed day         | localStorage, `tasks.hecho-open`                        |
| Stripes as names or stripe | localStorage, `tasks.labels-expanded`                   |
| Theme: Claro or Oscuro     | localStorage, `tasks.theme`                             |
| Composer drafts            | Memory, until the page reloads                          |

`etiqueta` holds a label id, or `none` for cards without a label. `responsable`
holds a member id, or `none` for unassigned cards.

Opening a card pushes `/c/<id>`, so the back button closes it. A page loaded on
`/c/<id>` fetches the card with `GET /api/cards/<id>` when the loaded weeks do
not hold it. When the server has no such card, the board shows the toast "No se
encontró la tarjeta." and the URL returns to `/`.

### Layers and keys

`useEscape.ts` keeps a stack of open layers (popover, dialog, composer, title
field). Escape closes the last one opened. Modal dialogs use the native
`<dialog>`, which traps focus, so a popover opened from the card back renders
inside it. `Board.tsx` handles the letter shortcuts that the `?` dialog lists.
They do nothing while the focus is in a text field or a modal is open.

### Layout

The header holds the board title and Filtrar on the left, and Compartir informe
and one user menu on the right, named with the person's name. The menu
(`UserMenu.tsx`) offers Ajustes, Tema, Atajos de teclado and Salir. Under 768px
Compartir informe moves into the workspace switcher.

From 768px the four lists sit side by side and shrink together, up to 17rem
each, so the board never scrolls sideways. Each list has its count in the header
and one composer at its foot. A list with no cards shows one line that names its
next action, or "Sin coincidencias" while a filter is on.

Under 768px a tab bar names the four lists and `Board.tsx` shows the one chosen,
starting on En curso. The other lists are `display: none`, so on a narrow screen
a card changes list through Mover on the card back. The chosen tab lives in
memory only.

### Look

`src/web/styles/tokens.css` is the one file with colors, sizes, radii, shadows,
motion and the font. Components read role names and write none of those values.
`docs/design.md` has the rules.

The server pages (login and the report) import the same file with `?raw`
(`views/layout.tsx`) and inline it, so they match the app. They follow the
system theme and read no stored choice.

The app follows the system theme. `UserMenu.tsx` offers Sistema, Claro and
Oscuro. A choice in `tasks.theme` sets `data-theme` on `<html>`. An inline
script in `index.html` sets it before first paint, so a pinned dark page never
shows a light frame. Sistema removes the key and the attribute.

Inter is served from `public/fonts/` through `/fonts/*`, preloaded, and no page
requests a font from another origin.

### Motion

Hover backgrounds, popovers and the day groups animate for 120 to 250ms
(`--duration-fast`, `--duration` and `--duration-slow`) with `--ease-out`. A day
group collapses by animating `grid-template-rows`. Hover styles apply only where
the device hovers with a fine pointer, and a pressed button scales to 0.97.
`styles/global.css` turns every animation and transition off under
`prefers-reduced-motion: reduce`. The report page has no animation.
