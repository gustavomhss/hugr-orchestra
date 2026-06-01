# Per-agent checklist chains (Relay "arms")

A **Relay arm** binds an *ordered chain of checklists* to a single spawned subagent. An orchestrator
(e.g. TechLead) fanning out 15+ async agents — different models, different worktrees — gives each its
own arm; Relay's `SubagentStop` hook then holds each agent at each gate until it passes, reveals the
next, and only lets it finish when the whole chain is green. Every verdict lands on a per-arm
tamper-evident ledger (the same hash chain as the benchmark — see [SPEC §7](../SPEC.md)).

This is the mechanized form of "pre-decide the Definition of Done, then verify, never trust the
self-report": the checklist is authored *before* the agent runs and enforced *outside* its control.

## The two pieces

| Piece | Where | Role |
|---|---|---|
| `relay-arm` MCP tool | `techlead/mcp/src/tools/relay-arm.ts` | the orchestrator calls it once per agent to **write** an arm and get a paste-in token |
| `relay-arm-hook.sh` | `relay/bin/relay-arm-hook.sh` | the `SubagentStop` hook that **reads** the arm and gates the agent |

They share a contract: the tool writes `$RELAY_ARMS_DIR/<token>/sprint.json` (one work-package per
gate) + `meta.json` (the `workdir` gate commands run in); the hook reads exactly that.

## Binding: why a token, not the cwd

Subagents spawned via the Task tool **inherit the parent session's cwd**, so cwd cannot tell 15
concurrent agents apart. Their **transcripts are unique**, though. So `relay-arm` returns a token and
the orchestrator pastes `RELAY-ARM:<token>` into that subagent's prompt; the hook recovers the token
from the `transcript_path` in the `SubagentStop` payload. Per-arm state (counter, retries, ledger) is
keyed by token, so async / multi-model / multi-worktree fan-out has zero cross-talk. An agent whose
transcript carries no `RELAY-ARM:` marker (or an unknown token) is left completely untouched.

## Register the hook (once)

In the session that spawns the agents (the orchestrator's `.claude/settings.json`):

```json
{
  "hooks": {
    "SubagentStop": [
      { "matcher": "", "hooks": [
        { "type": "command", "command": "/abs/path/to/relay/bin/relay-arm-hook.sh" }
      ] }
    ]
  }
}
```

Set `RELAY_ARMS_DIR` to the **same** path the MCP tool writes to (default `~/.relay/arms` on both
sides). For an unforgeable ledger, set `RELAY_LEDGER_KEY` (keyed HMAC mode — see
[configuration.md](configuration.md)); otherwise the ledger is plain SHA-256 (tamper-evident).

## Usage (orchestrator flow)

```
1. relay-arm({ label, workdir, chain: [gate1, gate2, ...] })   ->  { token, promptHeader, gates }
2. spawn the subagent with `promptHeader` (RELAY-ARM:<token>) pasted verbatim into its prompt
3. the agent works; on each stop the hook runs the current gate against `workdir`:
     all controls pass -> reveal the next gate   |   something fails -> re-block with what's missing
4. chain complete -> the agent is allowed to finish; the arm's ledger.jsonl is the audit trace
```

### A gate's checklist item

```jsonc
{ "id": "LGPD-1", "assert": "no raw PII reaches the logs",
  "cmd": "rm -f app.log; python3 svc.py >/dev/null 2>&1; ! grep -q '@' app.log" }   // deterministic: blocks on fail
{ "id": "REFLECT", "judge": "Did the agent address every point of the brief?",       // semantic: advisory…
  "context": ["SUMMARY.md"], "blocking": true }                                       // …unless blocking:true
```

Deterministic items (`cmd`, exit 0 = pass) are the real oracle and block advancement. Semantic items
(`judge`) are run by the non-independent LLM judge, logged as `judge:<backend>(non-independent)`, and
**never silently block** unless `blocking: true` — honest by construction.

### Example: a 3-gate chain for one agent

```
chain = [
  { id: "g1-reflect", checklist: [ { id:"REFLECT", judge:"Is this complete & correct per the brief?", blocking:true } ] },
  { id: "g2-tests",   checklist: [ { id:"TESTS",   cmd:"python3 -m pytest -q" } ] },
  { id: "g3-lgpd",    checklist: [ { id:"LGPD-1",  cmd:"! grep -rq '@' logs/" } ] },
]
```

The agent must reflect, then pass tests, then clear the LGPD check — in that order — before it can
stop. The chain is as long as you make it; each link is one stop-gated checklist.

## Auditing an arm

The per-arm `ledger.jsonl` is the same hash chain the rest of Relay uses, so it verifies offline:

```
python3 benchmark/verify_ledger.py ~/.relay/arms/<token>/ledger.jsonl    # exit 0 = intact
```
