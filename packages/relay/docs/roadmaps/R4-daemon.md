# R4 — Historical Completed Scope: HTTP Gate Service

Audience: agents. Status: historical.

Current authority: [SPEC.md](../../SPEC.md). Procedures: [operational skills](../skills/).
This card records a completed local scope, not an instruction to deploy a service.

## Delivered scope

[bin/relay-daemon.py](../../bin/relay-daemon.py) wraps
[bin/relay-gate eval](../../bin/relay-gate), rather than duplicating checklist logic.
Disk `state_dir` persists across requests; evaluation is serialized per real path.

| Endpoint | Bounded contract |
|---|---|
| `POST /gate/eval` | Sprint path or inline sprint, workdir and state dir; 200 advance/complete, 409 gate-fail, 423 escalate; 400 request errors, 500 gate errors |
| `GET /healthz` | Service health and gate name, not campaign success |

Timestamp-dependent ledger bytes need not match a direct CLI run; the intended contract is
equivalent gate semantics. Original ownership: daemon,
[tests/test_daemon.py](../../tests/test_daemon.py), daemon docs.

## Later additions and limits

`POST /ask` and `/answer` now provide the metered wait channel with checklist precondition,
stable tickets and parking/cap/deadline rules. The service defaults to `127.0.0.1:8787`
(port environment/CLI configurable), but accepts configurable `--host`; loopback is not forced.
Authentication, TLS and actor authorization remain unimplemented. It drives the CLI's counter
state, not every production arm-hook feature, and does not supply a packaged multi-language SDK.

Test references record verification intent, not a current suite result or test count.
