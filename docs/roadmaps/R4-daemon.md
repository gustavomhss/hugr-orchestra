# Roadmap R4 — Daemon / HTTP gate service over the model-agnostic CLI

**Owns (disjoint):** `bin/relay-daemon.py`, `tests/test_daemon.py`, `docs/daemon.md`. Nothing else.
**Frozen contract:** wraps the SAME gate evaluation `bin/relay-gate eval` exposes (sprint + workdir +
state → JSON outcome `advance|complete|gate-fail|escalate` + exit code). The daemon adds a long-running
HTTP surface so a remote / non-Claude harness drives Relay over the network — the OEM surface. It must
NOT reimplement gate logic: shell out to `bin/relay-gate eval` (or import its core) so there is ONE gate.

`bin/relay-daemon.py` — pure stdlib (`http.server`, no Flask). Endpoints:
- `POST /gate/eval` — body `{sprint_path|sprint, workdir, state_dir}` → runs one gate step via
  `bin/relay-gate eval`, returns its JSON outcome + the outcome in the HTTP status (200 advance/complete,
  409 gate-fail, 423 escalate). Stateless per request (state lives in `state_dir` on disk, as today).
- `GET /healthz` → `{"status":"ok","gate":"relay-gate"}`.
Bind to `127.0.0.1:$RELAY_DAEMON_PORT` (default 8787); host/port configurable. Refuse to start if
`bin/relay-gate` is not found. No auth in v0 — document that it is localhost-only and auth/TLS is the
next increment (do NOT fake security).

**Tests:** start the real daemon on an ephemeral port in a thread/subprocess, drive a tiny 2-WP sprint
over HTTP with `urllib`: assert gate-fail (409) when unsatisfied, advance (200) when satisfied, complete
at the end, `/healthz`. Assert it produces the SAME ledger `bin/relay-gate` would (one gate, no drift).
Tmp-isolated; tear the server down cleanly.
