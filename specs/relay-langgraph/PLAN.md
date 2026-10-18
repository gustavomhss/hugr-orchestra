# Relay for LangGraph — MVP implementation plan

Status: draft v2 (2026-10-18), revised after a cold adversarial review (verdict FIX-FIRST; all blockers addressed below). Companion to [EXPERIENCE.md](EXPERIENCE.md).

Owner decision: **Option A** — checks run inside the Python library in the user's process; Orchestra ingests and verifies. Defaults chosen for the review's open questions are listed under [Decisions](#decisions-taken-for-the-mvp); the owner can override any of them.

## Architecture

```
user's agent.py (LangGraph, local)                 Orchestra
  └─ gated(builder, {...})                           ├─ server: GET /api/relay/external-run*   (read, rebuild from ledger, verify)
       ├─ inserted gate + approval nodes             ├─ server: POST .../decision  (Origin-checked, principal recorded in Orchestra data dir)
       ├─ runs cmd / judge checks                    ├─ watcher → relay.external.* event on /api/event
       ├─ appends ledger (Relay chain format)        └─ app: Executions + receipt (exist), approval card
       └─ writes <project>/.relay/runs/<thread_id>/
```

The run folder carries runs out. Approvals made in the app are additionally recorded in Orchestra's own data directory with the approving principal, so the app can tell an app-approved decision from one the agent wrote itself. The existing 403 on `POST /api/relay/document/:id/check` stays.

## Decisions taken for the MVP

1. **Approvals:** both terminal and app approvals are allowed. App approvals are recorded server-side with the principal (`packages/server/src/principal.ts`); the receipt shows "approved in Orchestra by `<user>`" only when the ledger decision matches that record, and "self-reported" otherwise.
2. **Scope:** local scripts and `langgraph dev` only. Deployed or hosted LangGraph servers are out of the MVP: their run folders live in a container Orchestra cannot read.
3. **Package location:** inside `modules/relay` (`modules/relay/lib/orchestra_relay/`, tests in `modules/relay/tests/`), so the existing pytest lane runs it. No new CI lane.
4. **Where runs show:** the Workflows chapter Executions screen, badged "external". The visual treatment goes to the visual session.

## Contract (frozen first)

Run identity: **one run per LangGraph `thread_id`**. A resume is a new invoke on the same thread and appends to the same run.

`<project>/.relay/runs/<runID>/` where `runID` matches `^[A-Za-z0-9_-]{1,64}$` (derived from `thread_id`; any other characters are hashed).

- `ledger.jsonl` — the source of truth. Must pass `modules/relay/src/ledger/verify.ts` as written, which hashes the bytes on disk and never reserializes. The writer's obligations:
  - every body has a nonempty string `event`
  - `seq` starts at 0; `prev` starts at `GENESIS`
  - `h` is the final member
  - no duplicate keys, no `NaN`/`Infinity` (`json.dumps(..., allow_nan=False)`)
  - append under the same mkdir `.chain.lock` protocol as `chain.ts` (parallel nodes on one thread append concurrently)
  - finish with a terminal event the verifier knows: `sprint-complete` on success, `escalate` on failure or park (`verify.ts` `TERMINAL`)
  - plain SHA-256 only in the MVP. The server has no user key and can only refuse keyed chains, so keyed ledgers wait for a key-sharing design.
- Event bodies: `run.start`, `step.start`, `check.result`, `approval.request`, `approval.decision`, `step.end`, then `sprint-complete` or `escalate`. Each carries an idempotency key `thread_id/node/attempt/kind`. The writer scans the ledger for that key before appending and skips duplicates, so a resume never double-appends.
- `run.json` — convenience snapshot only, written atomically (temp + rename). **The server never trusts it:** the displayed `RelayRun` is rebuilt from the ledger.
- `decisions/<approvalSeq>.json` — written by the terminal prompt or by the server route. Consumed once, then recorded as `approval.decision` with `source: "terminal" | "orchestra"`.

Schema in `packages/schema` next to `relay-authoring`. Goldens in `modules/relay/test/golden/external/`: valid ledgers, mutants (byte flip, CRLF, forked chain, duplicate key, NaN, missing terminal), and a fake "shipped in a cloned repo" ledger.

## Python library

- `gated(builder, {"node": gate_spec, ...})` is the primary one-liner. Before compile it inserts, after each gated node, a **check node** and, where `approve=True`, a separate **approval node**, and rewires that node's static out-edges through them. Retry is a conditional edge back to the gated node, bounded by the retry budget.
- `gate(fn, ...)` exists for nodes **without static out-edges** only. `gated()` and `gate()` refuse, with an Elm-style error naming the edge, a node that would let a static edge run on unchecked output (LangGraph runs static edges even when a node returns `Command(goto=...)`).
- Approval lives in its own node, so on resume LangGraph restarts only that node, not the user's function. The node replays a decision already in the ledger instead of asking again.
- Wrapping keeps the user's signature (`functools.wraps`) so `config` / `runtime` / `store` injection still works; sync and async nodes are both supported. `thread_id` comes from the `config` argument, not context variables (context variables break for async on Python < 3.11). Compiled subgraphs as gated nodes are out of the MVP and refused with a clear error.
- When no checkpointer is configured, `gated(..., dev=True)` compiles with `InMemorySaver` and says so once.
- Judge: uses the model already configured in env; with none, `judge` gates record `advisory: no model configured`. Documented as different from Relay's own judge.
- Writes `.relay/` into the project's `.gitignore` on first run (with a printed notice); ledgers can hold check output.
- Zero runtime dependencies beyond `langgraph`. The verifier reuses the existing Python oracle `modules/relay/benchmark/verify_ledger.py` rather than a new one.
- CLI: `relay verify`, `relay demo tamper`, `relay runs`, `relay view` (stdlib single-page viewer), `relay prune --older-than` (retention).

## Orchestra side

- **Routes** (new group, not reusing Maestro's run routes):
  - `GET /api/relay/external-run`, `/:id`, `/:id/audit`, `/:id/ledger?after=` (paged)
  - `POST /api/relay/external-run/:id/decision`
  - Every route validates `runID` against the pattern, resolves the run folder with `lstat` and real-path containment inside the location's project, and refuses symlinks for the run folder and `decisions/`. The POST route checks `Origin` like `packages/server/src/handlers/pty.ts`, writes only the decision file, records the principal under `<data>/relay/<projectID>/external/`, and runs nothing.
- **Audit wording:** external audits never show PASS. They show "chain intact, self-reported" (or "broken at entry N"), plus "approved in Orchestra by `<user>`" per decision when it matches the server record. A ledger shipped inside a cloned repo therefore cannot display as verified.
- **App client:** extend `runs.ts` with the external routes. External `documentID` is `external:<graph>`; the receipt hides "open canvas" for those.
- **Events:** a new `relay.external.updated` event declared in `packages/schema`, client regenerated. It does not reuse `relay.run.*` / `relay.gate.*`, which belong to Maestro's durable runs. `source.ts` refreshes on it; the awaiting count includes external runs with a pending approval.
- **Watcher:** one per open location, capped, released when the location closes; debounced. Windows paths covered by the same `lstat`/containment code.

## Export (Relay document → LangGraph project)

- Reuse the existing `relay.document.export` route (`packages/protocol/src/groups/relay-document.ts`) with a `format=langgraph` variant rather than a new route.
- Workflows are linear. Mapping:
  - `startTrigger` → entry and initial state
  - `execute` / `review` → **stub agent node** (a function the user fills in; Maestro Sessions with tools have no LangGraph equivalent) followed by its gate
  - `gate` step → a check-only node with its instructions and checklist
  - `inject` → state-update node; the digest goes in the ledger
  - `human` → approval node
  - phases → comments and node-name prefixes (subgraphs are out of the MVP)
- Only `cmd` checks export. `judge` checks export as advisory with a comment; checks that use Maestro admission env (`base_ref`, `repo_root`, `wp_dir`) export with those as documented env vars the user sets.
- The export writes files only. "Run it" launches through the existing PTY route (`cicd-runner.ts` path), which already goes through the sanctioned spawn surface; no new spawn site and no change to `script/spawn-allowlist.json`.

## Work packages and waves

| WP | What | Files |
| --- | --- | --- |
| 0 | Contract: schema, event bodies, idempotency keys, run ID rule, goldens | `packages/schema`, `modules/relay/test/golden/external` |
| 1 | Python ledger writer + use of the existing oracle verifier | `modules/relay/lib/orchestra_relay/ledger.py` |
| 2 | Python `gated()` / `gate()`, check + approval nodes, idempotency, dev checkpointer, terminal output, gitignore | `modules/relay/lib/orchestra_relay/` |
| 3 | Python CLI (`verify`, `demo tamper`, `runs`, `view`, `prune`) | `modules/relay/lib/orchestra_relay/cli.py` |
| 4 | Protocol: external-run group, decision route, `relay.external.updated` event, export `format=langgraph`; regenerate client | `packages/protocol`, `packages/schema`, `packages/client` (generated) |
| 5 | Server + core: read routes rebuilding from ledger, audit wording, decision route, watcher | `packages/server`, `packages/core` |
| 6 | App: external runs in Executions, approval card wiring, event refresh (visual parts → visual session) | `packages/app-shell/src/orchestra/relay/` |
| 7 | Export generator | `packages/core` (generator only) |
| 8 | Quickstart and examples | `modules/relay/lib/orchestra_relay/examples`, docs |

Waves (disjoint files within each wave):

1. WP0.
2. WP1 and WP4 (Python vs protocol; protocol and client generation serialized in WP4 alone).
3. WP2, WP3, WP5 and WP7 (Python package vs server/core vs export generator; WP5 and WP7 touch different files in `packages/core`).
4. WP6, then WP8.

## Gates per WP

Tests run only through `bun run test:ci`; nothing heavy on this Mac. Typecheck via the `typecheck.yml` dispatch. Full suite once at the end of the epic.

- **Cross-language checks without a mixed lane:** the pytest lane has no Bun and the Bun lane has no `langgraph`, so parity goes through committed fixtures. The Python tests write ledgers into `modules/relay/test/golden/external/python/`, and a Bun test verifies those files with `verify.ts`. The Bun side writes goldens that a pytest test verifies with `verify_ledger.py`. A fixture drift check fails if the committed Python output no longer matches what the Python writer produces.
- **WP1:** both verifiers accept the valid goldens and reject every mutant, including the cloned-repo ledger's wording rule.
- **WP2:** resume tests show zero repeated ledger appends, zero repeated prompts, and the user's function body not re-run on approval resume; a gated node with a static out-edge is refused by `gate()` and rewired by `gated()`; sync and async nodes, and nodes taking `config`/`runtime`.
- **WP5:** path traversal, symlink, bad run ID and missing Origin are each refused with a test; external audits never return a PASS status.
- **WP7:** an exported project with stub nodes runs its first run and the resulting ledger passes `verify.ts` (verified through committed fixtures).
- **WP8:** every quickstart snippet runs in the pytest lane. The "under 2 minutes" target is measured once by hand on a clean machine and reported as a measurement, not gated.

## Before WP0

- Confirm the pytest lane in `.github/workflows/test-ci.yml` can install `langgraph` from `modules/relay/requirements-dev.txt` (network and pip available); add `uv` only if the docs use it.
- Confirm `check:godfile` budgets for the generator (WP7) and the server group (WP5).

## Honest limits (to state in user docs)

- The check runs in the agent's own process. The ledger shows what that process recorded and that nothing changed afterwards. It does not show that an independent party ran the check; that is a later verified mode.
- Plain SHA-256 detects edits by anyone who does not recompute the chain. A process that controls the folder can rewrite the whole chain. Only decisions matched against Orchestra's server-side record are attributable to a person.
- A git install clones the whole repository until the package is on PyPI (owner account needed), which slows first install.
