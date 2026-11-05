---
name: work-chapters-maintenance
description: Who owns the work and operations chapters of the Orchestra app (Agents editor dialog and roster, Schedule device and server sources and slot claims, Local pipelines cicd runner, KPI home dashboard, Lean dashboard, Dock page, Home folder start) in packages/app-shell/src/orchestra/chapters, the invariants that must not regress, and how to change and test them. Use when editing agents-dialog.tsx, agents-roster.ts, schedule-*.ts, cicd-data.ts, cicd-runner.ts, kpis-data.ts, lean-controller.ts, home-start.tsx, or when a scheduled run fires twice, a pipeline log vanishes after reload, a KPI tile shows a wrong number, or a Lean toggle shows stale data.
---

# Work and operations chapters

Related: `agent-screen-maintenance` (agent page, `agents-detail.tsx`), `agent-avatars-maintenance` (portraits), `conveyor-maintenance` (Actions chapter that hosts Local pipelines), `maestro-maintenance` (Maestro seat), `docs/guides/agents.md`, `docs/guides/agent-screen.md`. Integrations, mcp, providers, skills, plugins, workspaces, shortcuts and env chapters are another skill. Chapters register in `packages/app-shell/src/orchestra/chapter-route.tsx`; all code below is under `packages/app-shell/src/orchestra/chapters` unless noted.

## Ownership

| Piece | Owner file(s) | Rule |
|---|---|---|
| Agents chapter page | `agents.tsx` | Owns the agents query (`staleTime: Infinity`) and per-agent detail query; saves and restores go through `sdk().orchestra.agents.getFile/updateFile`, then refetch. Route `/orchestra/agents/<id>`. |
| Agents pure model | `agents-roster.ts` | All rules without UI: name validation (regex plus Windows reserved names), `agentDraft`, `agentFileInput`, `removeInput`, `restoreInput`, `isMaestro`, `errorStatus`, `errorKind`. Also imported by `components/settings-v2/view/capabilities-section.tsx` and `schedule-server.ts`. |
| Agent editor dialog | `agents-dialog.tsx` | Native `<dialog>`, phases loading/edit/confirm. Maestro is locked (mode disabled, no Remove). |
| Agents screens | `agents-view.tsx`, `agents-detail.tsx`, `agents.css` | Roster, portrait, permissions, stats, detail. Owned by `agent-screen-maintenance` and `agent-avatars-maintenance`; do not duplicate. |
| Schedule page | `schedule.tsx`, `schedule.css` | `SchedulePage` picks the server source first and falls back to the device source via `onUnsupported`. Editor dialog is native `<dialog>`. |
| Schedule slot math | `schedule-model.ts` | Pure: `plan`, `recordRun`, `skipRun`, `following`, `previous`, `slotIDs`, `readTasks`. |
| Device source | `schedule-device.ts` | Old servers: tasks live in the persisted profile store and run from the open page (`TICK` 15s, `TIMEOUT` 60s). Every run is a `maestro` session. |
| Tab claims | `schedule-claims.ts` | Web Lock plus localStorage claim per slot (`CLAIM_TTL` 120s, key prefix `orchestra.schedule.claim.`). |
| Server source | `schedule-server.ts` | Server owns and runs tasks; the page lists, edits, starts, polls, and moves device tasks once. Answers 404/405/501, or a non-JSON 200, mean unsupported. |
| Agent-made schedules | `schedule-agents-model.ts`, `schedule-agents-api.ts` | Operator model (pause, resume, run, remove with idempotency keys) and its client. Not imported by any view yet; only its test uses the model. |
| Local pipelines | `cicd.tsx`, `cicd-dialogs.tsx`, `cicd.css` | Mounted by `actions.tsx` (`view === "local"`), not by the `cicd` route key (that key points at the Actions chapter). |
| Pipeline data | `cicd-data.ts` | Workflow inventory, shell script builder, strict stored-pipeline decode, plain log and tail. |
| Pipeline runner | `cicd-runner.ts` | One store per profile (`profilePipelines`); runs on a server PTY, outlives the page, reattaches after reload. |
| KPI home | `kpis.tsx`, `kpis-data.ts`, `kpis-home.tsx`, `kpis.css` | `OrchestraHome` (kpis-home) gates on the selected profile and renders `KpiDashboard`; data parsing and math live in `kpis-data.ts`. |
| Home folder step | `home-start.tsx` | First run with no project: pick a folder, trust it through `server.trust.approve`, then add it. |
| Lean dashboard | `lean.tsx` (page), `lean-controller.ts`, `lean-api.ts`, `lean-view.tsx`, `lean-detail.tsx`, `lean-format.ts`, `lean-view-contract.ts`, `lean.css` | Transport (`lean-api`) and requests (`lean-controller`) never reach the view; the view takes `LeanViewProps` only. |
| Dock page | `dock.tsx`, `dock.css` | Another view of the window's MCP Dock; reuses `appDockController` and `AppsPanel`. See `app-dock-browser-maintenance`. |
| Thin pages | `hooks.tsx`, `workflows.tsx`, `actions.tsx` | `hooks` and `workflows` only render `RelayChapter` (`relay-usage`); `actions.tsx` routes the Actions views (`conveyor-maintenance`). |
| Home helpers | `pages/home-session-open.ts`, `pages/error-description.ts` (under `packages/app-shell/src`) | `shouldOpenSessionInBackground` (modifier-click rule) and `errorDescriptionKey` (local-server-startup text, used by `pages/error.tsx`). |

## Invariants

- Maestro cannot be hidden, demoted or removed from the editor; `agentFileInput` never sends a disabled or demoted Maestro file even if config says so.
- Agent write errors map by kind (`agent_file_case`, `outside`, `unparseable`, `protected`); the dialog stays open on failure and cannot be dismissed while saving. `removed` is captured before the write because the refetch can rewrite the agent.
- A scheduled slot is served by one tab: claim first, re-plan after the claim, settle `done` or `failed`. Only the scheduler marks a slot failed; a failed Run now releases it.
- Run IDs are deterministic per task and slot (`slotIDs`), so retries and second tabs adopt the first attempt's session and prompt. An unprompted session is removed, except a forced run that kept its IDs.
- Daily and weekly slots are rebuilt from `minute` (local time of day), never by adding 24h, so DST does not drift later slots. One-off or weekly slots more than a day late are skipped, never caught up.
- Server edits send `next`, `cadence` and `timezone` only when timing changed (Core re-anchors on any of them). Creating with the device task's ID makes the move to the server retry-safe.
- Pipelines run in a POSIX shell (`posixShell`), one `eval` per step with `set -e`; the shell blocks on one input line (start gate) so no output exists before the page attaches. A failure inside a pipe stops the run, or the shell is flagged by `PIPEFAIL_WARNING`.
- Only the final plain log is persisted, tail-limited by `LOG_LIMIT`. A run record written by another tab wins. A PTY stays recorded until its DELETE is confirmed (404 counts).
- KPI responses are validated by `parseActivity`/`parseGit` before any tile uses them; malformed input fails closed. Git windows use the server's local days; `localEnd` is only the fallback. Only `complete` reads stay cached. `usageCsv` writes numbers as is and prefixes `'` to text starting with `= + - @ tab CR`.
- Lean: responses must carry the selected directory (`pathKey`) or fail with `LeanResponseError`; history must match its item id. Writes are per item and a profile-wide `pending` set; the last accepted response wins by sequence number; after the last pending write a fresh GET reconciles. `unavailable` clears all data.
- Native `<dialog>` modals handle Escape themselves (`on:keydown`) because a Kobalte layer behind them can take Escape and cancel the close.

## Traps

- `cicd` in `chapter-route.tsx` loads the Actions chapter; `cicd.tsx` is its Local view. Editing `chapter-route.tsx` will not change the pipelines page.
- `schedule-agents-*` look live but nothing renders them; `SCHEDULE_COPY` already has their copy keys. Wire a view before assuming users see it.
- `shouldOpenSessionInBackground` has only its test as caller today; do not assume Home uses it.
- The schedule dialog is a signal, not a store, because a store merges a new dialog into the open one. A replaced dialog still fires its close event; only the current one may clear state.
- `datetime-local` shows minutes only; an untouched input must keep the original instant or saving shifts the slot.
- The server list alone would hide tasks still on the device; `status` stays `loading` until they moved or failed. A failed move is retried on every poll.
- `localStorage` can throw (blocked site data); claims then hold for one page only. Desktop storage fires no `storage` events.
- Reading a pending resource inside a chapter suspends the shell's Suspense and blanks the page or holds the route change (comment in `cicd.tsx`); show an explicit loading row instead.
- KPI `Period` "all" has no previous window and starts at the first commit day; `compact` never shows `1000k` (promotes to the next unit).
- Lean `LeanAPIError("unsupported")` produces an empty message on purpose: the empty state already says Lean is unavailable.

## Testing

Tests run only on CI: `bun run test:ci app <files>` from the repo root (`app` is the alias of `packages/app-shell`).

- `agents-roster.test.ts`: roster rules and the editor model (names, drafts, file input, remove and restore, error kinds).
- `schedule-model.test.ts`: slot math, DST, deterministic IDs, saved-task reading.
- `schedule-claims.test.ts`: single-tab claim, TTL, failed slot, lock behaviour.
- `schedule-agents-model.test.ts`: agent schedule rows, idempotency keys, confirmation, dispose.
- `cicd-data.test.ts`: workflow inventory, pipeline script per shell, log helpers, strict decode.
- `kpis-data.test.ts`: summaries, git windows, display helpers, response checks, CSV.
- `lean-api.test.ts`: the Location-scoped route against a real HTTP fixture.
- `pages/home-session-open.test.ts`, `pages/error-description.test.ts`: the two helpers.
- No test: `agents-dialog.tsx`, `schedule-device.ts`, `schedule-server.ts`, `cicd-runner.ts`, `cicd.tsx`, `cicd-dialogs.tsx`, `kpis.tsx`, `kpis-home.tsx`, `lean-controller.ts`, `lean-view.tsx`, `lean-detail.tsx`, `lean-format.ts`, `dock.tsx`, `home-start.tsx`. Cover new logic in the pure files above.

## Changing it

- Copy lives in `i18n/orchestra-chapters/{agents,schedule,cicd,dock,home,hooks,workflows}.ts` as `*_COPY` with a `*_COPY_BR` of the same keys (typed to match); Lean copy is `i18n/lean/en.ts` and `i18n/lean/br.ts` (`lean.` keys). Update EN and pt-BR together.
- `orchestra/palette/generate.ts` (`PALETTE_SOURCES`) lists the chapter stylesheets it recolors (kpis, agents, cicd, dock, schedule here; `lean.css` is not in it). Check it when adding or renaming a chapter CSS file.
- A user-facing change updates `docs/guides/agents.md` for agents; the other chapters here have no guide yet.
- Server shapes come from `@orchestra/client`; after a Protocol or Server `HttpApi` change run `bun run generate` in `packages/client`.
- Run `bun run check:guards --base origin/dev` before calling a change done.
