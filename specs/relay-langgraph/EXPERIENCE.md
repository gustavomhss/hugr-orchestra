# Relay for LangGraph — experience design

Status: draft v2 (2026-10-18), aligned with the reviewed [PLAN.md](PLAN.md). Not built. Names marked `(tbd)` are placeholders.

## Promise

> Add verifiable gates to any LangGraph agent in one line. Watch it live in Orchestra. Prove afterwards that nothing was faked.

Two doors, one product:

- **Code door (primary).** A Python library that drops into an existing graph. Most LangGraph users write code, not canvases, so this door must stand on its own, without the desktop app.
- **Canvas door.** Draw a workflow in the Relay editor and export a runnable LangGraph project that already carries its gates.

Both doors land in the same place: runs show up live in the Relay **Executions** screen, with the signed ledger and `relay verify`.

## Why this is wanted (evidence)

- LangGraph has no node hooks for raw `StateGraph`; the forum answer is "wire hook nodes by hand" ([forum](https://forum.langchain.com/t/how-to-use-langchain-v1-x-middleware-in-langgraph/2058)).
- Resume after `interrupt()` is the top source of pain: subgraphs restart, nodes re-run side effects, hosted vs local behave differently ([#4796](https://github.com/langchain-ai/langgraph/issues/4796), [forum](https://forum.langchain.com/t/does-langgraph-support-using-hitl-within-subgraphs/2839)).
- The LangChain human-in-the-loop UIs (Agent Inbox, Open Agent Platform) are archived.
- Studio setup breaks on Safari/Brave/Chrome local-network rules ([troubleshooting](https://docs.langchain.com/langsmith/troubleshooting-studio)); self-hosting the Agent Server needs an enterprise key.
- CrewAI's most-discussed issues ask for exactly this: pre-tool authorization ([#4877](https://github.com/crewAIInc/crewAI/issues/4877)) and protection against retries repeating side effects ([#5802](https://github.com/crewAIInc/crewAI/issues/5802)).

Nobody offers gates that are framework-native, vendor-neutral, and auditable after the fact.

## The first two minutes (golden path, code door)

```bash
uv add orchestra-relay          # (tbd) package name
```

```python
from orchestra_relay import gated

graph = gated(builder, {"write_code": "pytest -q"}, dev=True).compile()
```

```bash
python agent.py
```

What the user sees in the terminal, with no account, key, config file or server:

```
relay  write_code   check pytest -q ........ FAIL  (attempt 1/3)  → retrying
relay  write_code   check pytest -q ........ PASS  (attempt 2/3)
relay  ledger       5 entries · chain intact · 9f2c…e41a
relay  open run  →   orchestra://relay/run/r_7Kx2   (or http://localhost:4317/run/r_7Kx2)
```

The aha moment comes in three beats, in this order:

1. **The gate catches a real failure** and the graph retries on its own (you write no edges; `gated()` rewires them).
2. **The ledger hash grows** in the terminal: evidence is being kept, not claimed.
3. **One command proves tamper-evidence:** `relay demo tamper` flips one byte, `relay verify` points at the broken entry, expected vs actual hash, and which step it belonged to.

If Orchestra is running, the link opens the run in the Executions screen. If not, the library serves a single-page local viewer, so the code door never depends on the app.

## Entry points (ride slots that already exist)

Every successful LangGraph integration (Langfuse, OpenInference, guardrails-ai, NeMo) rides an existing slot, reads config from env vars, and leaves graph topology alone. Ship four, each one line. The MVP ships the first two; middleware and the callback come later:

| Where the user is | One line | Slot used |
| --- | --- | --- |
| Whole graph (primary) | `graph = gated(builder, {"write_code": "pytest -q"}).compile(...)` | Inserts check and approval nodes after the gated node and rewires its static out-edges through them, with a bounded retry edge |
| Single node with no static out-edges | `builder.add_node("x", gate(fn, check="pytest -q"))` | LangGraph runs static edges even when a node returns `Command(goto=...)`, so `gate()` refuses a node that has them and points to `gated()` |
| `create_agent` agents | `create_agent(..., middleware=[RelayGate(on_tools={"deploy": "approve"})])` | LangChain v1 middleware (`wrap_tool_call`, `jump_to`), same shape as `HumanInTheLoopMiddleware` |
| Passive audit only | `config={"callbacks": [RelayLedger()]}` | `BaseCallbackHandler`; observes, never blocks |

Gate kinds, same vocabulary as Relay controls:

- `check="cmd"` — shell command; exit code decides; always blocking.
- `judge="rule in plain language"` — LLM judge; advisory unless `blocking=True`.
- `approve=True` — human approval via `interrupt()` in its own inserted node; the approval is recorded in the ledger.

CrewAI later reuses the same core: `Task(guardrail=relay.guardrail("pytest -q"))` plus a `BaseEventListener` for the ledger.

## Human approval that does not hurt

This is where LangGraph users get hurt most, so it is the place to be better, not equal:

- **Idempotent across resume.** Approval sits in its own node, so on resume LangGraph restarts only that node, never the user's function. Every ledger entry carries a `thread_id/node/attempt/kind` key; on resume the gate replays a recorded decision instead of asking again, re-running the check, or appending twice.
- **Works without a checkpointer in dev.** With `gated(..., dev=True)` and no checkpointer, the library compiles with an in-memory one and says so once, instead of failing with LangGraph's error.
- **Approve from anywhere.** The pause shows up as an approval card in Orchestra (state diff, check output, Approve / Reject with note). Without the app, the terminal prompts `approve? [y/N/note]`. Both write the same ledger entry, marked with its source. Only an app approval is matched against Orchestra's own record of who approved; a terminal approval shows as self-reported.

## Canvas door (export)

1. In the Relay editor, the head gets **Export → LangGraph project**.
2. Orchestra writes a folder: `graph.py`, `langgraph.json`, `pyproject.toml` (pinned versions), `README.md` with the two commands to run it.
3. Mapping (today's workflow graph is linear):
   - `relay.startTrigger` → entry + initial state (`relayBrief`, retry budget).
   - `execute` / `review` → stub agent node the user fills in (a Maestro Session with tools has no LangGraph equivalent), followed by its checks.
   - `gate` step → check-only node with its instructions and checklist.
   - `inject` → state-update node; the digest of injected text/file goes in the ledger.
   - `human` → `interrupt()`. Relay's own runner does not support this kind today; LangGraph does, so export makes it work for the first time.
   - Phases → node-name prefixes (subgraphs later).
4. The toast offers **Run it**: Orchestra launches `langgraph dev` through the existing PTY path (the CI/CD chapter already does this) and the run appears in Executions.

With its stub nodes, the exported project passes `relay verify` on its first run. If it does not, that is a bug. Only `cmd` checks export as blocking; `judge` checks export as advisory.

## Orchestra side: what lights up

Today the Executions tab is always empty: the client calls `/api/relay/run*`, the server has no such routes, and the tab hides itself on 404. The Run button is disabled (`maestroOnly`). This feature fills that gap:

- **Runs ingest.** Implement the `/api/relay/run*` routes the client already expects (`runs.ts`, `receipt.tsx`) as read-only views over `<project>/.relay/runs/`, which the library writes. External runs are labelled as such; they never become Maestro executions.
- **Live updates.** Add a Relay event on the existing `/api/event` SSE stream so runs update live instead of the 10 s poll.
- **Discovery.** Orchestra probes port 2024 and reads `langgraph.json` in open workspaces, then shows the graphs it found with one action: "Add gates". This is the Inngest pattern: it finds you, you do not register.

## External check route (owner decision)

`POST /api/relay/document/:id/check` returns 403 `maestro-execution-required` on purpose (`modules/relay/SPEC.md` §7). External gates need their checks run somewhere:

- **Option A — checks run in the library process (recommended for MVP).** The Python library runs `cmd` checks itself and signs ledger entries locally; Orchestra only ingests runs and verifies. No new execution door in Orchestra.
- **Option B — Orchestra runs the checks.** A new authenticated route for external runtimes. Stronger trust (the agent cannot fake its own check) but opens an execution surface that is closed today.

A keeps the 403 rule intact and makes the code door work without the app. B can come later as "verified mode".

**Decided 2026-10-18: Option A.** See [PLAN.md](PLAN.md).

## Errors that teach

Every error names the user's code, why, and the fix. Examples:

```
relay: gate on node "write_code" needs a way to pause for approval.
       This graph was compiled without a checkpointer.
       Fix: builder.compile(checkpointer=InMemorySaver())   # dev
            or let relay add one: gated(builder, ..., dev=True)
```

```
relay verify: ledger broken at entry 7 (node "deploy", attempt 1)
       expected 9f2c…e41a
       found    1b07…c3d9
       Entries 7–12 can no longer be trusted. Entries 1–6 are intact.
```

## Anti-patterns we refuse

- No account, API key, or config file before the first PASS/FAIL.
- No separate server to start for the code door.
- No silent no-op: if the gate cannot run, the node fails loudly.
- No snippet in docs that is not executed in CI.
- No crypto jargon in errors; say which step and what changed.

## MVP scope

In:

- Python library: `gate()`, `gated()`, `RelayLedger`; `check`, `judge`, `approve`; idempotent approval; local ledger (same format as Relay's chain) and `relay verify` / `relay demo tamper`.
- Local single-page viewer for runs without the app.
- Orchestra: `/api/relay/run*` routes for external runs, Relay SSE event, approval card.
- Export → LangGraph project for linear workflows.

Later:

- `create_agent` middleware, CrewAI guardrail + listener.
- Discovery of running graphs, "Add gates" codemod.
- Verified mode (Option B), engine seat (graph governed from Orchestra), A2A.

## Success measures

- Time from `uv add` to first PASS/FAIL in the terminal: under 2 minutes on a fresh machine.
- Lines changed in an existing graph: one.
- Exported project: runs and passes `relay verify` with no edits.
- Approval resume: zero duplicate check runs, prompts or ledger entries across resume, and the user's function never re-runs for an approval.

## Open decisions for the owner

1. Package name and whether it is published to PyPI (needs the owner's account).
2. ~~Option A vs B for where checks run.~~ Decided: A.
3. Whether the approval card lives in the session cockpit, the Relay chapter, or both (visual work goes to the visual session).
