# HTTP gate service

Audience: agents. Status: current.

Procedure: [relay-integration skill](skills/relay-integration/SKILL.md).
Sources: [daemon](../bin/relay-daemon.py), [portable CLI](../bin/relay-gate), [shared core](../lib/relay-gate.sh).
Evidence: [daemon tests](../tests/test_daemon.py), [wait-channel tests](../tests/test_ask.py).

## Gate request contract

`POST /gate/eval` accepts a JSON object with `workdir`, `state_dir`, and exactly one of `sprint_path`
or inline `sprint`. Supplied path fields must be nonempty, NUL-free strings. Paths refer to the daemon
host; use absolute paths. Each request invokes `relay-gate eval` with an argv list. This exposes CLI
evaluation (current checklist and DoD, then earlier deterministic checks), not the full arm FSM.

| Result | HTTP | Body |
|---|---|---|
| Advance / complete | 200 | CLI outcome object |
| Gate failure | 409 | `outcome:gate-fail`, failing controls |
| Retry exhaustion | 423 | `outcome:escalate`, failing controls |
| Bad request | 400 | Validation error |
| Hard error or busy gate without usable outcome JSON | 500 | `error:gate error`, `detail`, CLI `exit` |

Busy CLI exit 3 is a 500 error response, not 409 or an advance. Outcome mapping takes precedence over
exit mapping when a usable outcome exists. `/healthz` returns `{"status":"ok","gate":"relay-gate"}`;
it does not execute a checklist or establish control success.

State persists in `state_dir`: counter, retries, ledger. The daemon serializes `/gate/eval` requests
by state realpath; distinct states may run concurrently. CLI `.run.lock` protects CLI evaluation/check,
and shared `.chain.lock` protects each ledger append. Locks do not deduplicate repeated requests.

Inline sprint is written to a temporary file deleted after that request. Retain the original sprint
yourself and use `relay verify <ledger> --sprint <retained-sprint>` for oracle recheck.
CLI and HTTP share gate semantics; timestamps and their dependent hashes differ between runs.

CLI outcomes preserve decoded `wp`, `next`, and emitted `macro` strings; ledger entries preserve
`wp` and emitted `macro`. Tabs, CR, and trailing LF are retained. The selected WP ID/macro and, for
nonterminal `eval`, the required next WP ID are validated before commands or ledger writes. `check`
needs only the selected identity; these checks are not complete sprint validation.

## Arm wait-channel contract

`POST /ask` takes `token` and `question`; `POST /answer` takes `token`, a 12-lowercase-hex `ticket`, and
`answer`. Required fields are nonempty, NUL-free strings, stripped at their ends. Wrong field types,
invalid tokens/tickets, and nonobject bodies return 400. Tokens follow `[A-Za-z0-9_.-]+`, exclude `.`
and any `..`. These routes use arms under `RELAY_ARMS_DIR` (default `~/.relay/arms`). Unknown arms return
404; an answer for a syntactically valid ticket with no stored ask returns 404 without creating an orphan answer.

- Read persisted `position` as UTF-8 without newline translation, retaining literal CR/LF. Match the
  raw whole WP ID first, then its suffix after the first dot. Only after both raw candidates fail,
  remove trailing LF for legacy files and retry whole-ID then first-dot-suffix resolution; CR and
  other whitespace remain identity data. Pass the successful raw or normalized string through check's
  `--position`. Named checks override stale or past-end compatibility counters. Only an arm without
  `position` uses the legacy counter; an active arm with no current WP returns 500.
- The ARM hook also reads raw position through `jq -Rs` and lossless JSON-string decoding, tries raw
  whole-ID/suffix before LF-only legacy fallback, and writes supported identities without adding LF.
  Driver-specific migration/state rules remain separate: an existing empty daemon position is invalid,
  while ARM can migrate an empty position from its compatibility counter. This is not a guarantee that
  every payload, base-ref, or other state-field path is lossless.
- Daemon WP IDs must be nonempty NUL-free strings; whitespace is identity data, and IDs must be unique.
  A supplied daemon WP `macro` must be a NUL-free string; explicit null is rejected. CLI/ARM accept
  absent/null optional macros as empty. These driver-specific validations are not a common full schema.
- For diff checks, resolve `base_<safe-actual-wp-id>` first, otherwise `meta.base_ref`. Sanitize the resolved
  WP ID, not a guessed suffix. Pass `--base-ref` explicitly when arm position/base metadata or a diff
  requires it; an explicit empty value means unavailable and prevents fallback to unrelated CLI `base_ref`.
- The precheck runs only the selected checklist: no DoD, earlier regressions, retry charge, advancement,
  or grading-ledger writes. It still executes command/judge side effects and takes the CLI run lock.
- A valid passing `check` is refused with 409. `complete`, `awaiting-human`, or `escalated` arm state returns
  423 before checking. CLI busy exit 3 returns 503 (`check busy`); other process, malformed/inconsistent
  check-output, and arm-data errors return 500. Process-error bodies retain `detail` and `exit`.
- Same question reuses its hash-derived ticket. Three unanswered pokes are served; the fourth parks.
- `/answer` stores an answer for an existing ticket; delivery records `ask-answered`. Refusals `no`, `n`,
  `stop`, `denied`, `refused`, `reject`, and `rejected` park on delivery. Stored answers remain repeatable
  while the precondition still fails, without charging new pokes or ask totals.
- Total ask cap defaults to 8. Breach records facts and keeps serving; `orchestrator.json` can say `continue` or `stop`/`park`.
- Silence at or beyond `ask_deadline` (default 900 seconds) parks when an ask evaluates the deadline; no background timer.
- Park writes `awaiting-human`; it does not pass or advance the gate. Attributed `release` resumes through the arm hook.

Complete ask/answer operations share the daemon's in-process lock registry, keyed by arm realpath;
symlink aliases share that lock. This does not serialize other daemon processes or whole arm-hook
transactions. CLI run locks and ledger append locks have narrower scopes.

Wait-channel notes are required writes through `relay-note`. Append errors return 500 (`note error`)
with diagnostics, before consuming the corresponding poke/total or writing parked state. `/answer`
storage itself adds no ledger note; its later delivery does. Earlier notes or created directories may
remain after a later failure, and filesystem writes after a successful note can fail: this is not a
rollback-capable transaction across ledger and state.

## Trust boundary

The service defaults to `127.0.0.1:8787`; `--host` is configurable and `--port` overrides `RELAY_DAEMON_PORT`.
It has no authentication, TLS, or path confinement. Reachable callers can select host paths and execute sprint
commands as the service user. Use this surface only for trusted local command execution. An argv-based daemon
invocation does not sandbox the gate's intentional Bash `eval`.
