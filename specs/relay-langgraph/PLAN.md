# Relay for LangGraph — MVP implementation plan

Status: v3 (2026-10-18), the leanest version. Companion to [EXPERIENCE.md](EXPERIENCE.md). v2 was reviewed adversarially; v3 keeps every fix that still applies and cuts everything the selling point does not need.

Owner decision: **Option A** — checks run inside the Python library; Orchestra only reads and verifies.

## What the MVP proves

One line on an existing LangGraph graph gives gates that retry on failure, a human approval that never asks twice, and a hash-chained ledger that `relay verify` checks. Orchestra shows those runs in the Executions screen that already exists.

## Cut from v2 (later, if ever)

- App approval card, decision write route, principal record, Origin check. Approval is terminal or `interrupt()` only, and the run is labelled self-reported.
- Folder watcher and the new SSE event. The app already polls runs every 10 s.
- Canvas export to LangGraph.
- Deployed LangGraph servers. Local scripts and `langgraph dev` only.
- `gate()` single-node form, middleware, callback-only ledger, CrewAI.
- Keyed (HMAC) ledgers. Plain SHA-256 only.
- Local viewer, `prune`, `runs` commands.

## Three pieces of work

### 1. Contract (in flight, branch `relay-contract`)

`packages/schema/src/relay-external.ts`:

- `runIDFromThread` and the run ID rule `^[A-Za-z0-9_-]{1,64}$`.
- The ledger event bodies, each with an idempotency key `thread_id/node/attempt/kind`.
- `runFromLedger`, which rebuilds the app's `RelayRun` from the ledger alone.

It also adds three valid goldens and one byte-flip mutant in `modules/relay/test/golden/external/`, plus one bun test.

### 2. Python library (`modules/relay/lib/orchestra_relay/`, tests in `modules/relay/tests/`)

- `gated(builder, {"node": "cmd" | {check, judge, approve, retries}}, dev=False)`:
  - Inserts a check node, and an approval node when asked, after each gated node.
  - Rewires the gated node's static out-edges through them, with a bounded retry edge back.
  - Keeps the user's function untouched.
  - `dev=True` compiles with `InMemorySaver` when no checkpointer is set.
- Ledger writer in the chain format:
  - body + `gen`, `prev`, `seq`, `mac`, then `h` as the last member
  - `json.dumps(..., separators=(",", ":"), allow_nan=False, ensure_ascii=False)`
  - append under the same mkdir `.chain.lock`
  - skip any entry whose idempotency key is already in the ledger
  - end with `sprint-complete` or `escalate`
- Runs go to `<project>/.relay/runs/<runID>/ledger.jsonl`. `.relay/` is added to `.gitignore` once, with a notice.
- Checks:
  - `cmd` runs a subprocess; the exit code decides.
  - `judge` is advisory and records "no model configured" when there is none.
  - `approve` uses `interrupt()` in its own node and replays a recorded decision on resume.
- CLI:
  - `relay verify [run]` uses the existing oracle `modules/relay/benchmark/verify_ledger.py`.
  - `relay demo tamper` copies a run, flips one byte and shows the verify failure.
- Terminal output as in EXPERIENCE.md.
- `requirements-dev.txt` gets a pinned `langgraph`.

Done when, all through the pytest lane:

- A gated failing check retries and then passes.
- A static out-edge never runs on unchecked output.
- Resuming an approval does not re-run the user's function, the check, or any ledger append.
- Sync and async nodes, and nodes that take `config`, both work.
- `relay verify` accepts its own ledgers and rejects the tamper demo.
- The quickstart example runs.
- The library writes one ledger into `modules/relay/test/golden/external/python/`, committed, for piece 3 to verify in TS.

### 3. Orchestra read side (`packages/protocol`, `packages/server`, `packages/core`, small `packages/app-shell` change)

- `GET /api/relay/run`, `/run/:id`, `/run/:id/audit`, `/run/:id/ledger?after=`. These are the routes `runs.ts` already calls, served from `<location>/.relay/runs/` and rebuilt with `runFromLedger`.
- Audit uses `verify.ts`. It never reports PASS for an external run, only "chain intact, self-reported" or "broken at entry N".
- Path safety: run ID pattern, `lstat`, real-path containment inside the location, no symlinks.
- Regenerate the client with `bun run generate`.
- App:
  - An "external" badge on runs whose `documentID` starts with `external:`.
  - Hide "open canvas" for those runs.
  - Visual polish goes to the visual session.

Done when:

- A bun test serves the committed Python ledger and the contract goldens through the routes, with the expected snapshot and audit wording.
- Traversal, symlink and bad-ID requests are refused.

## Order

1. Contract lands.
2. Python library and Orchestra read side run **in parallel**, in separate worktrees and branches (`relay-python`, `relay-read`). They touch disjoint files.
3. Piece 3 needs the Python ledger fixture. Until piece 2 commits it, it tests against the contract goldens, then adds the Python fixture as one extra case.

Two agents in total after the contract:

- The Python agent needs LangGraph judgment.
- The read-side agent is plumbing over existing patterns.

## Gates

- Tests only through `bun run test:ci`; typecheck only through `typecheck.yml`. Nothing heavy on this Mac.
- Each PR goes into `relay-langgraph`. The full suite runs once, on the final PR into `dev` (`epic` label).
- The lead verifies each PR before merging:
  - the file list
  - one mutation probe
  - the CI result

## Honest limits (for the docs)

- The check runs in the agent's own process. The ledger shows what that process recorded and that nothing changed afterwards. It does not show an independent party ran the check.
- Plain SHA-256 catches edits by anyone who does not recompute the chain. A process that controls the folder can rewrite it whole. Approvals are self-reported in the MVP.
- Install is from git until the package is on PyPI (owner account).
