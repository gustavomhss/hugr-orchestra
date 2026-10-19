# orchestra-relay

Verifiable gates for LangGraph graphs, in one line. A gated node gets an optional human approval before it runs, a check after it, a bounded retry, and a hash-chained ledger that `relay verify` checks.

## Install

From git until the package is on PyPI:

```bash
pip install "git+https://github.com/gustavomhss/hugr-orchestra#subdirectory=modules/relay/lib/orchestra_relay"
```

## Quickstart

```python
from orchestra_relay import gated

graph = gated(builder, {"write_code": "pytest -q"}, dev=True).compile()
graph.invoke(state, {"configurable": {"thread_id": "my-run"}})
```

```
relay  write_code   check pytest -q ............ FAIL  (attempt 1/3)  → retrying
relay  write_code   check pytest -q ............ PASS  (attempt 2/3)
relay  ledger       8 entries · chain intact · 9f2c…e41a
relay  verify  →    relay verify .relay/runs/my-run
```

A runnable version is in [examples/quickstart.py](examples/quickstart.py).

A gate is a command string, or a dict:

```python
gated(builder, {"deploy": {"check": "make smoke", "judge": "the change is safe", "approve": True, "retries": 3}})
```

- `check`: a shell command run from the project root; exit code 0 passes. A failure retries the node until `retries` (default 3) attempts are used, then the run escalates and ends.
- `judge`: recorded as advisory. Real model judging comes in a later version.
- `approve`: pauses with LangGraph's `interrupt()` before the node runs, so a rejected step never happens; retries after a failed check do not ask again. Resume with `graph.invoke(Command(resume="approve"), config)` or `Command(resume={"decision": "reject", "note": "..."})`. A decision already on the ledger is replayed, never asked again.

Your node functions are never wrapped. Their static out-edges are moved behind the check node, and with `approve` their static in-edges go through the approval node first. A gated node with conditional out-edges, `Command` destinations or a join edge is refused with an error, and so is an approval-gated node reached through a conditional edge.

Runs are written to `<project>/.relay/runs/<thread_id>/ledger.jsonl`, where the project is the nearest folder with `.git`; a run is named after that folder unless you pass `compile(name=...)`. A failing check prints its last output lines. `.relay/` is added to `.gitignore` once.

```bash
relay verify [run_dir]        # or: python -m orchestra_relay verify
relay demo tamper [run_dir]   # flips one byte in a copy and shows verify catch it
```

## Honest limits

- The check runs in the agent's own process. The ledger shows what that process recorded and that nothing changed afterwards. It does not show an independent party ran the check.
- Plain SHA-256 catches edits by anyone who does not recompute the chain. A process that controls the folder can rewrite it whole. Approvals are self-reported in the MVP.
- Install is from git until the package is on PyPI.
- `gated()` rewires the graph through LangGraph builder internals (`edges`, `branches`), so `langgraph` is pinned below 2.
- Gated nodes with conditional edges or `Command` destinations are refused, not supported.
- One run per `thread_id`: invoking the same thread again after it finished does not write a new end entry.
