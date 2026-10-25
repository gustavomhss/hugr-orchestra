---
name: platform-cli
description: Operate Vercel, Netlify, Railway, Sentry, Grafana, or Prisma Postgres from the agent through each platform's official CLI. Use when the user asks to inspect, deploy, debug, or query one of these platforms and no hosted MCP connection exists for it.
---

# Platform CLI

## When to use

These six platforms only offer OAuth for their hosted MCP, which Orchestra does not support yet. Until it does,
drive each platform through its official CLI. The CLI owns its login; Orchestra never handles the credential.
Platforms with an API-key MCP connection (Cloudflare, Supabase, Neon, Linear, Stripe, Globalping) use
`service_find` / `service_describe` / `service_call` instead of this skill.

## Rules

1. Check the CLI first with `command -v <cli>`. If missing, give the user the install command; run it only after they agree.
2. Check login first with the platform's whoami/status command. If logged out, ask the user to run the login command
   themselves in their terminal (browser OAuth). Do not run interactive login from `bash`.
3. Never ask for, paste, print, or write tokens. If the user prefers a token, they export the env var in their own shell
   before starting the session. Never pass a token as a command-line flag, put it in a file, or echo it.
4. Treat secret values (env vars, connection strings, DSNs) as sensitive. List names, not values, unless the user asks.
5. Use `bash` for short commands that exit. Use `process_control` (start, then log, wait, stop) for anything that
   streams or runs long: log tails, dev servers, deploys, watch modes. Always stop what you started.
6. Prefer JSON output (`--json`, `-o json`) and parse it; do not scrape tables.
7. Anything marked **CONFIRM** changes production, deletes data, or cannot be undone cheaply. State the exact
   command and target (project, environment, team) and wait for an explicit yes before running it.
8. Confirm the target before any write: linked project/team/org/stack. Wrong-scope writes are the main failure mode.

## Vercel (`vercel`)

- Install: `npm i -g vercel` (or `pnpm i -g vercel`, `bun add -g vercel`). Check: `vercel --version`.
- Login (user): `vercel login`. Token alternative: user exports `VERCEL_TOKEN` in their shell. Check: `vercel whoami`.
- Scope: `vercel switch <team>` or `--scope <team>`; link a directory once with `vercel link`.

Read:
- `vercel whoami`, `vercel project ls`, `vercel project inspect <project>`
- `vercel list --prod` or `vercel list --status ERROR,READY` (recent deployments; add `-m githubCommitSha=<sha>` to find by commit)
- `vercel inspect <deployment-url-or-id>`; add `--logs` for the build log
- `vercel logs --level error --since 1h --json` (request logs, JSON Lines; filters: `--environment production`, `--status-code 5xx`, `--query <text>`, `--deployment <id>`)
- `vercel env ls` (names and targets only)
- `vercel alerts`, `vercel domains ls`, `vercel dns ls <domain>`
- Generic JSON from the REST API: `vercel api /v2/user` (see `vercel api --help` for method and body flags)

Long-running (`process_control`): `vercel logs --follow` (live runtime logs, ends after about 5 minutes), `vercel dev --port 3000`.

Safe writes: `vercel deploy` (preview deployment), `vercel env add <NAME> preview` (value via stdin from the user, never inline),
`vercel pull --environment=preview` (writes `.vercel/` files locally), `vercel redeploy <deployment>` for a preview.

CONFIRM first: `vercel deploy --prod`, `vercel promote <deployment>`, `vercel rollback [deployment]`,
`vercel remove <deployment-or-project>`, `vercel env rm|update <NAME> production`, `vercel domains rm`, `vercel dns rm`,
`vercel alias set|rm`, `vercel cache purge`, `vercel firewall ...`, `vercel buy ...` (spends money).

## Netlify (`netlify`)

- Install: `npm install -g netlify-cli` (Node 18.14+). Check: `netlify --version`.
- Login (user): `netlify login` (browser). Token alternative: user exports `NETLIFY_AUTH_TOKEN` (personal access token) in their shell.
- Target a site: `netlify link` in the project directory (writes `.netlify/state.json`) or set `NETLIFY_SITE_ID`.

Read:
- `netlify status` (login and linked site; add `--json`)
- `netlify sites:list --json`
- `netlify env:list --json` (add `--context production` or `--scope functions`; secret values are hidden)
- `netlify api listSiteDeploys --data '{"site_id":"<id>"}'` (any API operation by id; `netlify api --list` shows them all)
- `netlify api getSite --data '{"site_id":"<id>"}'`
- `netlify logs` and `netlify help logs` for function and deploy log options (flags vary by version; read the help first)
- `netlify build` (local build, no deploy)

Long-running (`process_control`): `netlify dev`; any `netlify logs` mode that streams.

Safe writes: `netlify deploy` (draft deploy to a unique URL; `--alias=<name>` for a stable draft subdomain),
`netlify env:set <KEY> --context deploy-preview` for non-secret values only; for secrets ask the user to run `netlify env:set <KEY> <value> --secret` in their own terminal so the value never passes through you.

CONFIRM first: `netlify deploy --prod`, `netlify env:set|unset ... --context production`, `netlify env:import`,
`netlify api deleteSite|deleteDeploy|restoreSiteDeploy ...`.

## Railway (`railway`)

- Install: `brew install railway` or `npm i -g @railway/cli`. Check: `railway --version`.
- Login (user): `railway login` (browser) or `railway login --browserless` over SSH. Token alternatives, set by the user in
  their shell: `RAILWAY_API_TOKEN` (account or workspace) or `RAILWAY_TOKEN` (one project environment). Check: `railway whoami`.
- Target: `railway link` (project), `railway service` (service), `railway environment` (switch, interactive).

Read (`--json` is a global flag):
- `railway whoami`, `railway status --json`
- `railway logs -n 100` (last lines, exits); `railway logs --build -n 100` for build logs
- `railway variable list --json` (values are secrets; report names unless asked)
- `railway environment` and `railway service` to see current targets

Long-running (`process_control`): `railway logs` with no `-n` streams; `railway up` streams build and deploy output
(prefer `railway up --detach` and poll `railway status --json`).

Safe writes: `railway variable set KEY=value` in a non-production environment for non-secret values only (secrets: the user runs it in their own terminal), `railway environment new <name>`,
`railway up --detach` to a non-production environment.

CONFIRM first: `railway up` or `railway redeploy` against a production environment, `railway down` (removes the latest deployment),
`railway variable set|delete` in production, `railway environment delete <name>`, `railway deploy --template ...` (creates billable services).
Run `railway --help` if a subcommand name differs on the installed version.

## Sentry (`sentry`)

- Install: `brew install getsentry/tools/sentry` or `npm install -g sentry`
  (Node 20+). Check: `sentry --version`. Note: the older `sentry-cli` is for releases and source maps, not triage.
- Login (user): `sentry auth` (browser device flow); check with `sentry auth status`. Token alternative: user exports
  `SENTRY_AUTH_TOKEN` in their shell. Self-hosted: user sets `SENTRY_HOST=https://sentry.example.com` (login needs `--url`).
- Defaults: `SENTRY_ORG`, `SENTRY_PROJECT` (or `org/project`). Targets use slugs, never numeric ids; `sentry project list <org>/` lists slugs.

Read (all support `--json` and `--fields a,b`):
- `sentry org list --json`, `sentry project list <org>/ --json`
- `sentry issue list <org>/<project> -q "is:unresolved" -s freq -n 20 --json` (sort: `recommended|date|new|freq|user`; `-t 7d` for period)
- `sentry issue view <issue> --json` (ids: `FRONT-ABC`, `<org>/<project>#ID`, `@latest`, `@most_frequent`)
- `sentry issue events <issue> --full -n 5 --json` (stack traces)
- `sentry issue explain <issue>` (AI root-cause analysis), then `sentry issue plan <issue>` (fix steps)
- `sentry release --help`, `sentry log --help` for releases and logs (read help first; syntax differs by version)
- `sentry api --help` for raw API calls that have no dedicated command

Long-running (`process_control`): log tailing if `sentry log --help` shows a follow mode.

Safe writes: `sentry issue resolve <issue> --in <release>` and `sentry issue archive <issue> --until 7d` are reversible
(`sentry issue unresolve <issue>`), but still name the issue ids to the user before changing them in bulk.

CONFIRM first: `sentry issue merge <issues> --into <parent>` (hard to undo), bulk resolve or archive, `sentry api` with
DELETE or PUT, deleting projects, releases, alerts, or monitors.

## Grafana (`gcx`)

- Install: `brew install grafana/grafana/gcx`,
  or `go install github.com/grafana/gcx/cmd/gcx@latest`. Check: `gcx --version`.
- Needs the stack URL. Grafana Cloud: `https://<stack>.grafana.net`. Self-hosted: the user's own URL (ask for it; never guess).
- Login (user): `gcx login <name> --server https://<stack>.grafana.net` (browser OAuth for Cloud). Self-hosted or
  token: user runs `gcx login <name> --server <url> --token` in their own terminal, or exports `GRAFANA_SERVER` and
  `GRAFANA_TOKEN` (service account token); `GRAFANA_CLOUD_TOKEN` is only for Cloud product APIs. Check: `gcx config check`.

Read (add `-o json`; `-o yaml` also works):
- `gcx datasources list -o json`
- `gcx dashboards list -o json`, `gcx dashboards search "<text>" -o json`
- `gcx alert rules list -o json`
- `gcx metrics query '<PromQL>' --since 1h -o json` (example: `rate(http_requests_total[5m])`)
- `gcx logs query '<LogQL>' --since 1h -o json` (example: `{app="nginx"} |= "error"`)
- `gcx --help` and `gcx <group> --help` for traces, SLOs, incidents, and Cloud products

Long-running (`process_control`): `gcx dashboards snapshot <name> --timeout 3m` if rendering is slow.

Safe writes: none by default. Treat all writes as changes to shared dashboards and alerting; show the diff or resource first.

CONFIRM first: any `gcx` command that creates, updates, pushes, or deletes dashboards, alert rules, SLOs, or
datasources, and anything that silences or mutes alerts.

## Prisma Postgres (`prisma`)

- Install: use the project's own CLI: `npx prisma ...` (or `bunx prisma`, `pnpm dlx prisma`). Global: `npm i -g prisma`. Check: `npx prisma version`.
- Login for platform management (user): `npx prisma platform auth login` (browser); check `npx prisma platform auth show`.
  Data commands (`migrate`, `db`) use the `DATABASE_URL` in the project's env or config; never print it.
- Create a throwaway database without an account: `npx create-db@latest` (temporary; tell the user it expires).

Read (non-destructive):
- `npx prisma version --json`
- `npx prisma validate`
- `npx prisma migrate status` (exit code 1 means drift or pending migrations)
- `npx prisma db pull --print` (prints the introspected schema without overwriting `schema.prisma`)
- `npx prisma generate` (rewrites generated client only)
- `npx prisma dev ls` (local Prisma Postgres instances)
- `npx prisma platform --help` for workspaces, projects, environments, and API keys (Early Access)

Long-running (`process_control`): `npx prisma studio -p 5555` (local data browser), `npx prisma dev --name <name>`
(local Prisma Postgres server), `npx prisma generate --watch`.

Safe writes: `npx prisma migrate dev --name <name>` against a local or dev database only (confirm the datasource first),
`npx prisma migrate dev --create-only` to write the migration file without applying it.

CONFIRM first, and verify the database is not production: `npx prisma migrate deploy` (applies pending migrations to the
target database), `npx prisma db push` (any form; `--accept-data-loss` and `--force-reset` can destroy data),
`npx prisma db execute --file <sql>` or `--stdin` (arbitrary SQL), `npx prisma migrate reset` (drops and recreates the
database), `npx prisma dev rm`, `npx prisma platform project|environment|apikey delete`.
Prisma blocks `migrate reset --force` when it detects an AI agent. Never set
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` yourself; only the user may do so after reading the consequence.

## Failure handling

- `command not found`: tell the user the install command; do not install silently.
- Auth or 401/403 error: the user logs in again or switches scope (team, org, workspace, stack); do not retry in a loop.
- Wrong project or team: run the link or whoami command, report what it targets, and ask before continuing.
- A flag is rejected: run `<cli> <command> --help` once, then adapt. CLIs change faster than this page.
