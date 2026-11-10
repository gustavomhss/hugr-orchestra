# Board J1 — isolated, seeded preview

Status: implementation supplied by Astra; local typecheck, guards, HTTP startup and visual acceptance are pending the lead and owner. This document records no executed PASS.

This recipe runs the real Board service, SQLite migrations, authenticated HTTP handlers and shared web shell. It is repository tooling, not a new product mode. It does not start the desktop wrapper or register ProductHost/Claude execution adapters. No model prompt, GitHub repository, PR or execution attempt is created by the seed.

## Prerequisites

Use this branch's worktree and installed workspace dependencies. The commands below target the lead's macOS/POSIX shell; they do not claim Windows launch coverage.

The lead reported rebuilding desktop with `bun run build` and staging Omni. The recipe uses that checkout's `apps/desktop/resources/omni/hugr_omni.node` and `hugr-omni-supervisor`. If these are not present, stop and supply the actual paired addon/supervisor paths in the two variables below. Do not switch off Omni to make the preview start.

## 1. Start the seed and backend

From the repository root, in terminal A:

```sh
J1_REPO="$PWD"
J1_BUN="$(command -v bun)"
J1_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/orchestra-board-j1-XXXXXX")"
J1_ADDON="$J1_REPO/apps/desktop/resources/omni/hugr_omni.node"
J1_SUPERVISOR="$J1_REPO/apps/desktop/resources/omni/hugr-omni-supervisor"

(
  set -eu
  test -f "$J1_ADDON"
  test -x "$J1_SUPERVISOR"
  cd "$J1_ROOT"
  exec env -i \
    PATH="$PATH" \
    HUGR_OMNI_ADDON="$J1_ADDON" \
    HUGR_OMNI_SUPERVISOR="$J1_SUPERVISOR" \
    "$J1_BUN" "$J1_REPO/packages/server/script/board-j1.ts" \
    --root "$J1_ROOT" --port 4096 --web-port 3000
)
```

Both ports are explicit. The backend attempts one bind; Vite uses `strictPort`. If a port is occupied, choose another pair and a new root; do not stop another application to free it. The script refuses a nonempty root, so a failed or completed run is retained rather than reset in place.

`env -i` and the empty working directory apply before Bun starts, avoiding inherited provider keys and the checkout's startup `.env`. The script selects a persistent database, credential key file, logical home, XDG directories and temporary directory inside this run's root before importing Core. It disables credential inheritance and model-catalog fetching. The backend's default Location is the scratch `work` directory.

The seed writes through `Board.Service`, then starts `createRoutes({ password })` with a random per-run password and no ProductHost contributions. It checks the real HTTP endpoints before printing ready:

- a Board read without authentication is refused with HTTP 401;
- authenticated snapshot/issue/execution reads decode against the existing schemas;
- the issue reference, question IDs/statuses, section counts and long branch match the seed's expected readback;
- Executions has no host attempts, and absent token/model-cost meters remain null.

Only after these checks does it print:

```text
J1 SEED READY — real API readback matched; human acceptance remains pending.
```

This message certifies only the script's runtime readback when the lead actually observes it. It is not a visual or CI verdict.

## 2. Start the real frontend

In terminal B, run the exact `sh '<run-root>/frontend.sh'` command printed by terminal A.

That generated launcher starts the workspace's Vite executable directly from the scratch directory, with a clean environment. Its generated config imports `apps/web/vite.config.ts`, uses the real `apps/web` entry, points `envDir` and the Vite cache into scratch, and binds only `127.0.0.1` at the selected frontend port. It does not add an alternative Board component or mocked HTTP responses.

Open the printed `/orchestra/board?auth_token=...` URL in a **new private browser session or fresh browser profile**. Existing browser storage can select a previously saved server instead of this run. The token authenticates only this isolated backend; the normal web entry consumes it and removes it from the address bar.

The same URL is saved locally in `<run-root>/browser-url.txt` with mode 0600. The public verification record is `<run-root>/seed-receipt.json`; it contains the actual generated IDs and data path, without the password/token. Do not publish the launch URL as evidence.

No provider connection or repository folder is required to open the Board chapter. Select the project named **J1 — avaliação visual sintética** and the visual issue identified in the seed receipt (UXV-2 in a successful fresh run).

## 3. What is deliberately populated

The seed creates a fresh project and two issues through the real domain service. The main issue contains:

- a description explicitly labelled synthetic;
- three pending steps;
- two open questions, each with options, consequences, recommendation and a reason;
- six synthetic comments, including a long one to expose excerpt/expansion and existing pagination;
- a Markdown context attachment and a dependency on the control issue;
- a long unbroken branch string with no associated PR.

IDs, issue numbers, question IDs, activity IDs and timestamps come from the service. The default domain actor for planning writes and the owner actor for comments/attachments are not evidence that an agent ran or a person authored those entries: all these writes are the seed, explicitly labelled synthetic. The branch string is visual input, not a claim that a Git branch exists.

Proof and Executions retain the service's real absence states. No session, model identity, execution attempt, spend, token count, PR, checks or commits are manufactured to fill the screen.

## 4. Owner judgment

Inspect the same populated issue in dark and light themes, in a wide window and a narrow window. Open both the peek and full issue view. Judge:

1. Overview section spacing, hierarchy and the properties rail.
2. The long branch in Git trail and properties, without horizontal displacement of the issue.
3. Conversation excerpts, expansion and pagination, without a nested wall of notes.
4. Overview / Conversation / Executions / History navigation, including the legitimate no-attempts state and the actual seed activity reasons.
5. Needs-you with the two open questions; draft visibility across views and between the issue and inbox.

The owner can enter and submit synthetic replies in this isolated database. These writes use the real HTTP API. They are inspection actions, not proof already performed by the script.

**Coverage limits:** the branch uses `Trail.none`; `Trail.ok` with PR/check/commit facts is not populated. Host-attempt receipts and execution metrics are not populated. The desktop wrapper, installed profile and ProductHost adapters are outside this preview. The owner decides whether another visual scenario is needed before accepting J1; the script cannot certify that acceptance.

J1 human acceptance remains required before the RAG cockpit, as recorded in `astra-j1-receipt.md:61–62`. RAG foundation work already authorized keeps its separate gates.

## 5. Lead verification and stop

Before running the preview:

```sh
cd packages/server
bun typecheck
```

From the repository root:

```sh
bun run check:guards --base origin/dev
bun run test:ci server test/board-http.test.ts --os both
```

These are requested checks, not reported results. Gate criteria: clean package typecheck, no guard errors, successful focused Board HTTP CI, then the observed `J1 SEED READY` readback and a usable browser Board. A failure goes back to Astra with the first exception and stack; do not invent a local implementation fix or claim visual acceptance from a backend-only ready line.

Stop the two dedicated foreground processes with Ctrl+C in their own terminals. The scratch root is retained for inspection; the script never deletes or resets an existing database. A new invocation uses a new empty root. Do not restart or terminate the owner's installed application.

Return: commit used, the three gate results, the seed receipt, any first runtime exception, and the owner's dark/light/narrow/wide disposition. Only the owner can provide the human J1 verdict.

## Source basis at a917a60b74df61cb361899a260eb527740aacc86

- Service writes, real defaults and no-PR branch: `packages/core/src/board/board.ts:94–110,212–213,837–931,1244–1313`.
- Real database migrations: `packages/core/src/database/database.ts:29–51`.
- Home/XDG selection and key isolation: `packages/core/src/global.ts:10–42`; `packages/core/src/credential/cipher.ts:57–73`.
- Real routes and optional host contributions: `packages/server/src/routes.ts:50–101,112–139`.
- Base account service without Claude engine: `packages/core/src/claude-code-account.ts:28–39`.
- Existing HTTP binding composition: `apps/cli/src/commands/handlers/serve.ts:122–129`.
- Omni staging and runtime lookup: `apps/desktop/scripts/stage-omni.ts:13–30`; `packages/core/src/omni.ts:62–104`.
- Browser server selection and auth token: `apps/web/src/entry.tsx:93–110,145–164`.
- Server-wide Board route: `packages/app-shell/src/orchestra/chapter-route.tsx:39–43,88–99`.
