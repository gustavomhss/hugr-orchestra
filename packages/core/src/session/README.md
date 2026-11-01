# Core Session domain

## Purpose and ownership

- V2 Session core: the `packages/core/src/session.ts` facade, `packages/core/src/session/input.ts` (admission and retry identity), the projector, `packages/core/src/session/execution` (the process-global coordinator, `local.ts`) and `packages/core/src/session/runner` (the Location-scoped runner, exported as `@orchestra/core/session/runner`).

## File map

Orientation only; the rules are in AGENTS.md and the `session-core-maintenance` and `session-store-maintenance` skills. Re-list the directory before relying on this.

Admission, execution and the runner:

- `input.ts`: `session_input` admission, retry identity, lifecycle conflicts.
- `execution.ts` (service) and `execution/local.ts` (process-local coordinator); `run-coordinator.ts` is the generic per-key run coordinator it uses.
- `runner/index.ts` (service contract), `runner/llm.ts` (the Location-scoped runner), `runner/model.ts` (model reference, pricing, cost), `runner/to-llm-message.ts` (projected history to provider messages), `runner/publish-llm-event.ts`, `runner/step-tools.ts`, `runner/max-steps.ts`, `runner/turn-transition.ts`, `runner/title.ts`, `runner/mentions.ts`, `runner/direct-commands.ts`.
- `runner/execution-host.ts` and `runner/hosted-call.ts`: the `ExecutionHost` seam for an agent whose `engine` names one (today `claude-code`).

State and projection:

- `schema.ts`, `event.ts`, `message.ts`, `prompt.ts`: re-exports of the Schema package types (`@orchestra/schema/session-*`, `prompt`). Edit the types there.
- `sql.ts`: Drizzle tables `session`, `message`, `part`, `todo`, `session_message`, `session_input`, `session_context_epoch`.
- `store.ts` (Session store service), `projector.ts` (events to rows), `info.ts` (row to `Session.Info`), `history.ts` (visible history selection, latest compaction), `message-updater.ts` (message and tool-result updates, upstream settlement receipt).
- `context-epoch.ts`: persists the System Context baseline and snapshot per Session; the algebra is in `../system-context` (see `system-context-maintenance`).
- `compaction.ts`, `revert.ts`, `lifecycle.ts` (rename, remove, default title), `archive.ts`, `todo.ts`, `subagent-models.ts`, `error.ts`.

Meetings:

- `meeting.ts` with `meeting.sql.ts`, `meeting-briefing.ts`, `meeting-consolidation.ts` (and `.txt` prompt), `meeting-context.ts`, `meeting-handoff.ts`, `meeting-memory.ts` with `meeting-memory.sql.ts`, `meeting-verdict.ts`.

Other readers and importers:

- `activity.ts` (home dashboard activity), `lean-project.ts` and `lean-profile-preferences.ts` (Lean dashboard inputs), `legacy-import.ts` and `legacy-transcript.ts` (read-only decode of pre-V2 `message` and `part` rows; nothing writes that shape).

## Tests

Run through `bun run test:ci core <files>`. In `packages/core/test`: `session-*.test.ts` (admission and prompt, projector, history, store permissions, run coordinator, compaction, archive, rename and remove, legacy import, todo, subagent models, `session-runner*.test.ts` for the runner and its execution-host cases), `prompt-context*.test.ts`, and `test/session/` for the meeting tests and `upstream-logical-resume.test.ts`. The runner harness is `session-runner-harness.ts`, which is not a test.

## Public entry points and consumers

- Consumers: `packages/server` and `apps/cli`; other packages import the package entries, not these files.

## Dependencies and boundaries

- Follow AGENTS.md, "V2 Session Core": durable admission before an advisory wake, one `llm.stream` call per provider turn, no `SessionPrompt.loop` bridge, steer versus queue delivery. Read it there; it is not copied here.

## Assets, schemas and generated files

- None.

## Persistence, identity and lifetime

- `session_input` rows and events are durable user data.

## Commands

- `bun run test:ci core test/session` from the repository root runs the Session tests (`test/session-*.test.ts` and `test/session/`).
- `bun typecheck` in `packages/core`.

## Contracts and verification limits

- Path-pinned: `packages/core/src/session.ts`, `packages/core/src/session/runner/model.ts`, `packages/core/src/session/runner/llm.ts`, `packages/core/src/session/execution/local.ts`.
