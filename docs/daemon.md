# relay-daemon — HTTP gate service (Roadmap R4)

`bin/relay-gate eval` is Relay's model-agnostic gate surface: a one-shot CLI that evaluates a single gate
step (sprint + workdir + state → JSON outcome + exit code) with zero knowledge of Claude Code or any
specific harness. That is enough for a shell loop on the same machine.

`bin/relay-daemon.py` adds the other half of "model-agnostic": a **long-running HTTP surface** so a remote
or non-Claude harness (a CI runner, a LangGraph/AutoGen loop, an OEM integration) can drive Relay over the
network. This is the OEM surface.

There is exactly **one gate**. The daemon does NOT reimplement gate logic — every `/gate/eval` request
shells out to `bin/relay-gate eval` and relays its JSON, mapping the gate's exit code onto the HTTP
status. The ledger it produces is **semantically identical** to what `relay-gate` would have produced
directly: the same events, verdicts, `seq`, and chain structure. (The `ts` field is wall-clock seconds and
is part of the hashed body, so `ts` and the ts-dependent hashes naturally differ per run — the bytes are
not identical, only the semantics are.) Regression test:
`tests/test_daemon.py::test_daemon_ledger_matches_cli`.

## Run it

```sh
bin/relay-daemon.py                       # 127.0.0.1:8787
bin/relay-daemon.py --port 9000           # explicit port
RELAY_DAEMON_PORT=9000 bin/relay-daemon.py  # env-configurable (the --port flag wins if both are set)
```

It binds to `127.0.0.1` by default; `--host` and `--port` are configurable. It refuses to start if it
cannot find `bin/relay-gate` next to itself.

## Endpoints

### `POST /gate/eval`

Runs one gate step. Request body (JSON):

| field         | required        | meaning                                                        |
| ------------- | --------------- | -------------------------------------------------------------- |
| `workdir`     | yes             | the directory the checklist `cmd`s run against                 |
| `state_dir`   | yes             | where counter / retry state and `ledger.jsonl` live (on disk)  |
| `sprint_path` | one of these    | path to a `sprint.json` file                                   |
| `sprint`      | one of these    | the sprint as inline JSON (written to a temp file for the call) |

Provide **exactly one** of `sprint_path` / `sprint`.

The response body is `relay-gate`'s JSON outcome, verbatim. The HTTP status carries the disposition:

| outcome     | HTTP status | meaning                                                |
| ----------- | ----------- | ------------------------------------------------------ |
| `advance`   | `200`       | gate passed; counter advanced to the next work package |
| `complete`  | `200`       | sprint done                                            |
| `gate-fail` | `409`       | failing controls; retry budget not yet exhausted       |
| `escalate`  | `423`       | retry budget spent; surface to a human                 |
| —           | `400`       | bad request (missing/conflicting fields, invalid JSON) |
| —           | `500`       | the gate itself errored (its stderr is returned)       |

On a `500`, the body is `{"error":"gate error","detail":<the gate's stderr>,"exit":<gate exit code>}`.
This covers every case where `relay-gate` exits non-zero with no JSON outcome on stdout (a missing or
invalid `workdir`, a non-object/non-JSON sprint, an internal gate error). The gate's stderr is surfaced
verbatim in `detail` so a remote operator is not left debugging a bare `500 {}`.

The service is **stateless per request**: all state lives in `state_dir` on disk, exactly as the CLI does
today. Pass the same `state_dir` across calls to advance a sprint; the hash-chain ledger lands at
`<state_dir>/ledger.jsonl` and can be audited afterwards with `relay verify`.

**Concurrency.** The daemon is multi-threaded but the gate's hash-chain append is not internally locked,
so the daemon serializes gate evaluations **per `state_dir`** (keyed on its realpath). Distinct
`state_dir`s evaluate in parallel; requests sharing one `state_dir` are strictly serialized, so concurrent
callers can never interleave the chain and manufacture a false `TAMPERED` verdict.

Example:

```sh
curl -s -X POST http://127.0.0.1:8787/gate/eval \
  -d '{"sprint_path":"sprint.json","workdir":"/path/to/work","state_dir":"/path/to/state"}'
# 409 {"outcome":"gate-fail","i":0,"wp":"wp1","failing":["C1"],"reason":"..."}
# ...satisfy the controls, call again...
# 200 {"outcome":"advance","i":0,"wp":"wp1","next":"wp2"}
```

### `GET /healthz`

```json
{"status": "ok", "gate": "relay-gate"}
```

## Security (v0)

The daemon binds to `127.0.0.1` only and has **no authentication**. It is **localhost-only by design**.
Evaluating a gate executes the sprint's checklist `cmd`s, so anyone who can reach the port can run those
commands — do not expose it to an untrusted network.

Authentication, TLS, and a real authorization model are the **next increment** and are deliberately not
faked here. There is no token check, no transport encryption, and no allowlist in v0; adding a placeholder
would create a false sense of security.

One concrete reason the port **must** stay localhost-only: error bodies still distinguish *some* failure
modes (e.g. a non-existent vs. an existing-but-non-sprint `sprint_path`), and the daemon accepts arbitrary
absolute `workdir` / `state_dir` / `sprint_path` paths with no confinement, so an unauthenticated caller
could probe for the presence of host paths. (The daemon shells out with an argv list — no `shell=True` —
so there is no daemon-layer injection; the only code execution is the gate's by-design `eval` of the
sprint's checklist `cmd`s.) When auth is added, the next increment will also `realpath`-confine those paths
to an allowlist and normalize existence/parse failures to a single response so the surface stops leaking
path existence.


---

## The wait channel — `/ask` and `/answer`

A block costs a model turn; a wait costs only wall clock, so waiting is strictly cheaper. An agent
that needs a credential provisioned should not burn turns re-failing a gate it cannot pass.

```
POST /ask     {"token": "...", "question": "provision the deploy token"}
              -> 200 {"outcome":"waiting","ticket":"a1b2c3d4e5f6","poke":1,"failing":["c1"]}
              -> 200 {"outcome":"answered","answer":"provisioned, retry now"}
              -> 409 the checklist for this state is passing — nothing is blocking you
              -> 423 {"outcome":"parked", ...}
POST /answer  {"token": "...", "ticket": "a1b2c3d4e5f6", "answer": "provisioned, retry now"}
```

**This channel is where the design nearly broke its own invariant.** Everything else rests on
*stopping is the trigger*, and a tool call that never stops leaves the enforcement layer blind for
its entire duration: no fire, no round, no no-progress detection, nothing metered. Three consequences
follow, and none of them is optional.

### The meter is here, not in the hook

The hook runs when an agent stops, and a waiting agent has not stopped. So the meter has to live on
the far side of the boundary, in the thing the agent is actually calling.

### It refuses unless the gate is currently failing

The daemon runs the checklist itself — `relay-gate check`, which grades nothing, advances nothing and
records nothing, because a precondition test is not a verdict. Writing one here would put a second
evaluation of the same state on the chain, from a path that never decides anything.

It is a conditioned channel, not a rest button, and the condition is established from the controls
rather than from the agent's account of being stuck — the same rule the `RELAY-BLOCKED:` marker
follows.

### One ticket, three pokes

The ticket is derived from the question, so re-asking the same thing reuses it. A fresh id per poke
would provision N times, which is the failure this exists to avoid. Three pokes; the fourth round
parks. An answer of `no` parks immediately — waiting out the remaining rounds after a decision has
been made spends wall clock on nothing.

### The cap is passive, and it has a deadline

On breach the daemon notifies the orchestrator and **keeps serving**. Continue means continue; stop,
or silence past the window, means park.

Passive *without* a deadline would be decorative: a dead orchestrator would then mean no cap at all.

The notification carries **facts, never the agent's prose** — counts, elapsed time, and which control
is still failing. The agent's text reaching the orchestrator is a social-engineering channel.

| file under `$ARM/` | meaning |
|---|---|
| `ask_cap` | total asks before the orchestrator is notified (default 8) |
| `ask_deadline` | seconds of silence after a breach before the arm parks (default 900) |
| `orchestrator.json` | `{"decision": "continue" \| "stop"}` |
| `answers/<ticket>.json` | `{"answer": "..."}` |

### Writing to the chain

Every ask, answer, breach and park is an entry on the arm's hash chain, appended through `bin/relay-note`
— the same `relay_chain_append` the hook uses, rather than a second encoding in Python that would
drift.

Single-writer is load-bearing: `relay_chain_append` computes `prev`/`seq` from the file tail with no
lock. The daemon does not break that, and the reason is structural rather than defensive — it writes
only while the agent is waiting inside a tool call, which is exactly when the hook cannot be firing.
`relay-note` also takes a `mkdir` lock as insurance for the cases that argument does not cover, such
as a stray second agent on the same token. (`mkdir`, not `flock`, which is absent on macOS.)
