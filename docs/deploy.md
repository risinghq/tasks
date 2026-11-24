# Deploy

You need a Cloudflare account. The free plan is enough.

## Release

A push to `master` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). It runs
`bun run check`, applies the pending D1 migrations to the remote database, then
deploys the Worker. A failed check or migration stops the run before the next
step. Two pushes never deploy at once, and a running deploy is never cancelled.

Set this once, in the repository's Settings, under Secrets and variables, then
Actions:

| Kind     | Name                    | Value                                        |
| -------- | ----------------------- | -------------------------------------------- |
| Secret   | `CLOUDFLARE_API_TOKEN`  | An account API token, described below.       |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | The account id, on the Workers & Pages page. |
| Variable | `D1_DATABASE_ID`        | The `database_id` that `d1 create` printed.  |

Create the token on the Account API tokens page of the Cloudflare dashboard:
Create Token, then a custom token. Give it two permissions, both on the account:
Workers Scripts Edit and D1 Edit. Limit the resources to your account.

`wrangler.jsonc` keeps the placeholder `REPLACE_WITH_DATABASE_ID`. The workflow
runs [`scripts/set-database-id.ts`](../scripts/set-database-id.ts) to put
`D1_DATABASE_ID` in its own checkout. It fails when the variable is empty.

Before the migration, the step "Print the rollback bookmark" writes the output
of `wrangler d1 time-travel info` to the log. Its bookmark is the database as it
was before the release. Restore the database with it. Redeploy the earlier
commit to roll the Worker back:

```sh
bunx wrangler d1 time-travel restore tasks --bookmark=<bookmark>
```

## First-time setup

Run these steps by hand once, before the first push to `master` can deploy.

1. Sign in with Wrangler. It opens a browser to authorize your account:

   ```sh
   bunx wrangler login
   ```

2. Create the database. Set the `database_id` it prints as the `D1_DATABASE_ID`
   variable. To run the next step from your machine, also put it in
   `wrangler.jsonc` and do not commit that change:

   ```sh
   bunx wrangler d1 create tasks
   ```

3. Apply the migrations and deploy. The first deploy on an account asks you to
   register the workers.dev `<subdomain>`, which the workflow cannot answer:

   ```sh
   bun run db:migrate:remote
   bun run deploy
   ```

4. Set the secrets. Each command asks for the value (see
   [Secrets](../README.md#secrets)). Make a Web application client in Google
   Cloud first, with `https://<host>/auth/google/callback` as its redirect URI:

   ```sh
   bunx wrangler secret put SESSION_SECRET
   bunx wrangler secret put GOOGLE_CLIENT_ID
   bunx wrangler secret put GOOGLE_CLIENT_SECRET
   ```

`workers_dev` is on, so the Worker answers at
`https://tasks.<subdomain>.workers.dev`. Wrangler prints the address after the
deploy. Sign up there with Google. Each person gets a personal workspace, and
owners add others from Ajustes. That address is the `TASKS_URL` of the script.

Deploying over a database that already holds cards keeps them, and the report
link, in the personal workspace of the user with id
`00000000-0000-4000-8000-000000000001`. Run steps 3 and 4. Before the first
deploy of the workspace migration (`0005`), note the D1 time-travel bookmark the
CI prints, so a bad migration can be undone.
