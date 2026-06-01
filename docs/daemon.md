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
