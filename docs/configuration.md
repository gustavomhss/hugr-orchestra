Audience: agents. Status: current.

# Configuration and integration reference

Use [SPEC.md](../SPEC.md) for the current contract and
[relay-integration](../.opencode/skills/relay-integration/SKILL.md) for the operational guide.
Use [maintenance](../.opencode/skills/relay-maintenance/SKILL.md) for repository checks.
Run examples from the Relay repository root; child-process cwd is explicit where needed.

## 1. Dependencies

| Dependency | Required for |
|---|---|
| Bash, `jq`, standard Unix utilities, `shasum` | Hook/CLI evaluation, JSON handling, hashes, persisted state. |
| `python3` | Judge, audit, spec tools, profile compiler, and Python project checks; third-party dependencies are listed below. |
| Git | Computed diffs and ARM state-entry base refs; the integration example clones committed source. |
| OpenSSL | HMAC ledger writing and random-token generation in the example. |
| `pytest` | Repository tests and pytest-based sprint controls. |
| PyYAML | `bin/relay-profile.py` and skill-frontmatter parsing in `bin/check-docs.py`; profile tests can skip when it is absent. |
| markdown-it-py | Markdown parsing in `bin/check-docs.py`. |
| `bin/relay-profile.py` | The shipped YAML-to-sprint compiler; regenerate derived profile JSON with this tool. |
| Authenticated `claude` CLI | Claude hook sessions and the judge's `cli` backend. API/stub judging does not require it. |

Install development dependencies from [requirements-dev.txt](../requirements-dev.txt) in the Python
environment running the documentation checks. It declares pytest, PyYAML, and markdown-it-py ranges;
the documentation guard and profile compiler are not standard-library-only tools.

Install any additional compiler or project tool actually invoked by the selected `cmd` controls.
The core does not provision dependencies or apply a per-command timeout to `cmd` evaluation.
[`benchmark/run_arm.sh`](../benchmark/run_arm.sh) uses `timeout` around the outer Claude process,
not around each gate command. The judge API's `urlopen(..., timeout=60)` and CLI subprocess's
`timeout=300` apply only to judge transport/process calls, not deterministic controls. Add an
explicit timeout to a command when its contract requires one.

## 2. Choose the event and isolate state

| Runner | Registration | Binding |
|---|---|---|
| Task-spawned subagent | `SubagentStop` -> `bin/relay-arm-hook.sh` | Put one `RELAY-ARM:<token>` marker in each subagent opening prompt; leave global `RELAY_ARM_TOKEN` unset. |
| Direct `claude -p` runner | `Stop` -> `bin/relay-arm-hook.sh` | Set `RELAY_ARM_TOKEN` for that process, or use its single-token transcript. |
| Benchmark single runner | `Stop` -> `benchmark/relay_hook.sh` | Set `RELAY_RUN_DIR` and `RELAY_SPRINT`; no ARM token. |
| Non-Claude driver | Call `bin/relay-gate eval` | Allocate a separate state directory and handle JSON plus exit code. |

Register before starting the session. Do not assume changing settings removes a hook from an already
running harness. Commands must resolve independently of the agent's cwd; derive the Relay path from
the checked-out repository rather than copying a machine-specific path.

An ARM needs `<arms>/<token>/sprint.json` and `meta.json`; there is no in-repository `relay-arm` MCP
writer required for this file contract. Set `meta.workdir` to an existing directory and initial
`meta.base_ref` to the pre-work Git commit. Use a unique token, isolated state, and one runner per arm.
An invalid workdir can fall back to `.`; a missing token/sprint can let the runner stop ungated.

ARM acquires `<arm>/.run.lock` before agent-ID binding, release consumption, state updates, and usage
attribution. A busy fire exits `3`, writes diagnostics only to stderr, and changes no arm state or
ledger. Exit cleanup removes its owned run lock and temporary round buffer. The shared `.chain.lock`
serializes ledger appends separately; neither lock authenticates the runner or release writer.

## 3. Minimal isolated ARM recipe

This example uses the shipped `pytest-green` template against a focused repository test file. It
creates a fresh clone, ARM state, and hook settings without modifying the source checkout. The clone
contains committed files only. Use the integration skill for project-specific sprint selection.

```bash
export RELAY_REPO="$PWD"
export RELAY_RUNTIME="$(mktemp -d "${TMPDIR:-/tmp}/relay-agent.XXXXXX")"
export RELAY_WORKDIR="$RELAY_RUNTIME/work"
export RELAY_ARMS_DIR="$RELAY_RUNTIME/arms"
export RELAY_CORPUS_DIR="$RELAY_RUNTIME/corpus"
export RELAY_ARM_TOKEN="$(openssl rand -hex 12)"
export CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0
git clone --local "$RELAY_REPO" "$RELAY_WORKDIR"
mkdir -p "$RELAY_ARMS_DIR/$RELAY_ARM_TOKEN"
python3 bin/relay-spec.py instantiate pytest-green \
  --param tests=tests/test_arm_binding.py \
  -o "$RELAY_ARMS_DIR/$RELAY_ARM_TOKEN/sprint.json"
```

Prepare the first context, metadata, and registration before launch:

```bash
python3 - <<'PY'
import json, os, shlex, subprocess
from pathlib import Path

repo = Path(os.environ["RELAY_REPO"])
runtime = Path(os.environ["RELAY_RUNTIME"])
work = Path(os.environ["RELAY_WORKDIR"])
token = os.environ["RELAY_ARM_TOKEN"]
arm = Path(os.environ["RELAY_ARMS_DIR"]) / token
sprint = json.loads((arm / "sprint.json").read_text())
protocol = "Work only in the assigned workdir. Do not weaken, skip, or edit the target tests."
sprint["macros"] = [{"id": "verify", "instructions": protocol}]
for wp in sprint["work_packages"]:
    wp["macro"] = "verify"
    wp["self_check"] = ["Which implementation changes address the test failures?"]
(arm / "sprint.json").write_text(json.dumps(sprint, indent=2) + "\n")
base = subprocess.check_output(["git", "-C", str(work), "rev-parse", "HEAD"], text=True).strip()
(arm / "meta.json").write_text(json.dumps({"workdir": str(work), "base_ref": base, "token": token}) + "\n")
(arm / "macro_verify").touch()
first = sprint["work_packages"][0]
prompt = "\n\n".join([
    "RELAY-ARM:" + token,
    sprint["brief"],
    "Map: " + " -> ".join(w["title"] for w in sprint["work_packages"]),
    protocol,
    first["instructions"],
    "Before finishing:\n" + "\n".join("- " + q for q in first["self_check"]),
    "When the current WP is done, stop so Relay can evaluate it. Follow any next-WP block.",
])
(runtime / "prompt.txt").write_text(prompt + "\n")
command = "bash " + shlex.quote(str(repo / "bin" / "relay-arm-hook.sh"))
settings = {"hooks": {"Stop": [{"matcher": "", "hooks": [{"type": "command", "command": command}]}]}}
settings_dir = work / ".claude"
settings_dir.mkdir(exist_ok=True)
(settings_dir / "settings.json").write_text(json.dumps(settings, indent=2) + "\n")
PY
python3 bin/relay-spec.py lint "$RELAY_ARMS_DIR/$RELAY_ARM_TOKEN/sprint.json" --json
```

For the direct runner, launch from the isolated workdir through an explicit child cwd:

```bash
python3 - <<'PY'
import os, subprocess
from pathlib import Path
prompt = (Path(os.environ["RELAY_RUNTIME"]) / "prompt.txt").read_text()
raise SystemExit(subprocess.run(
    ["claude", "-p", prompt, "--permission-mode", "acceptEdits"],
    cwd=os.environ["RELAY_WORKDIR"], env=os.environ.copy(),
).returncode)
PY
python3 bin/relay problems "$RELAY_ARMS_DIR/$RELAY_ARM_TOKEN" --json
python3 bin/relay verify "$RELAY_ARMS_DIR/$RELAY_ARM_TOKEN" --json
```

Runner exit `0` does not imply chain completion: hooks also exit `0` on escalation and binding
refusal. Inspect `state`, stderr/logs, and the audit result. Preserve `RELAY_RUNTIME` until evidence
review is complete.

For subagent dispatch, register the same command under `SubagentStop` in the spawning session,
allocate one arm per subagent, and pass each generated opening prompt to its owner. Unset the global
`RELAY_ARM_TOKEN` override before starting that parent session; otherwise every child uses the same
token regardless of its transcript marker. Keep the block-cap environment on the parent process.
Do not register the direct-runner `Stop` adapter as a substitute for subagent stops.

## 4. Environment reference

| Variable | Consumer and default |
|---|---|
| `RELAY_ARMS_DIR` | ARM root; `$HOME/.relay/arms`. |
| `RELAY_ARM_TOKEN` | ARM explicit override; unset for transcript-bound multi-agent dispatch. |
| `RELAY_CORPUS_DIR` | ARM terminal archive root; `$HOME/.relay/corpus`. |
| `RELAY_JUDGE` | ARM/CLI judge script override; defaults to `benchmark/judge.py`. Benchmark hook uses its fixed adjacent script. |
| `RELAY_COMPACT_AFTER` | ARM checkpoint-text threshold on advancement; default `6`. It adds a hint, not actual context compaction. |
| `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` | Harness setting inspected once by ARM; absent/invalid reads as `8` for warning logic, `0` requests no cap. |
| `RELAY_LEDGER_KEY` | Shared append/verifier key; nonempty selects HMAC-SHA256, otherwise SHA-256. |
| `RELAY_RUN_DIR`, `RELAY_SPRINT` | Required benchmark workdir/plan. Its state lives in `<run>/.relay-state`. |
| `RELAY_GATE` | Benchmark only; default `on`, literal `off` bypasses controls. |
| `RELAY_SPECS_DIR` | Spec catalog override for `relay-spec.py`. |

### Judge settings

| Variable | Contract |
|---|---|
| `RELAY_JUDGE_BACKEND` | Choose `stub`, `api`, or `cli`. Without override, API only if `ANTHROPIC_API_KEY` is present, otherwise stub. |
| `RELAY_JUDGE_MODEL` | Judge model, default `claude-sonnet-4-6`; not the runner model. |
| `RELAY_JUDGE_BASE_URL` | Optional Messages-compatible base URL; API appends `/v1/messages`. |
| `RELAY_JUDGE_API_KEY`, `ANTHROPIC_API_KEY` | API credential in that precedence order. A custom base can use no key; default Anthropic endpoint cannot. |
| `RELAY_JUDGE_MAX_CTX` | API/CLI per-file character cap, default `120000`. Cuts are announced/tagged. |
| `RELAY_JUDGE_MAX_TOKENS` | API reply cap, default `8192`; CLI invocation does not use this value. |
| `RELAY_JUDGE_VOTES` | API/CLI samples, default `1`, minimum `1`; strict majority passes, ties fail. |
| `RELAY_JUDGE_STUB` | Stub-only forced `pass`/`fail`; otherwise every supplied file needs `RELAY_JUDGE_OK`. |

Set numeric judge settings to valid integers. Invalid values can fail before the script emits JSON.
The shared core records nonzero judge exits or malformed/missing responses as `fail` with an
unavailable backend tag; `blocking:true` blocks them. A valid response must be exactly one JSON
object with `verdict: pass|fail`; the core does not require the shipped judge's added boolean `available`.
API/CLI voting uses typed sample state: unavailable samples abort with `fail` and `available:false`;
answered pass/fail ballots have `available:true`. Backend/model/truncation labels are metadata, never
parsed back into state. Calibration requires process exit 0, one object, pass/fail verdict, string
reason, NUL-free string backend, and literal `available:true`; invalid/unavailable results are excluded
from TP/TN/FP/FN and agreement. Stub availability does not establish semantic quality.
Prose fallback accepts the last line starting
with `VERDICT:` only when it is exactly `VERDICT: PASS` or `VERDICT: FAIL` after case and outer
whitespace normalization. A malformed last declaration does not fall back to an earlier pass.
Read [gates](gates.md) for exact voting and failure limits.

Checklist commands and IDs preserve tabs, interior LF, and trailing LF through compact JSON records
and exact string decoding. ARM/CLI checklist regression and CLI/benchmark `dod[].cmd` readers execute
each complete decoded shell program rather than separate physical lines. Checklist oracle hashes
cover the full decoded `cmd`, or `judge` plus raw space-joined `paths`, including trailing LF;
unchanged LF-bearing controls do not diverge merely because of extraction. NUL is unsupported in
shell strings. External scripts remain useful for complex controls, but single-line commands are
not a transport requirement. A multiline program passes according to its overall Bash exit status;
use explicit status propagation when every constituent command must succeed.

## 5. Integrity, release, and diagnostics

Use the same HMAC key for writing and verification; keep it outside published trace artifacts.
HMAC's producer-resistant guarantee requires the key and trusted writer to be inaccessible to the
producer. Same-user environment variables, editable plans/commands, and writable ARM state do not
create a security boundary. Neither hash mode proves the latest tail is present without an external
head anchor.

Required ARM/CLI/benchmark verdict and disposition appends are fatal and precede their corresponding
transition/retry/release publication. Earlier command effects or appended records can remain after a
later error; this ordering provides no atomicity, rollback, or fsync guarantee. ARM ancillary events
and terminal archives remain best-effort; see the ARM skill for the event boundary.

Operators MUST give a real who/why reason in `<arm>/release`. The engine removes CR, maps LF to ASCII
spaces, and trims leading/trailing ASCII spaces. It also rejects reasons containing no non-whitespace
character, including tabs-only and CRLF/space/tab-only input; a rejected file is retained. An accepted
release resolves raw whole WP ID first, then raw first-dot suffix; only a raw miss permits legacy
trailing-LF cleanup and retrying those lookups. CR remains identity data.
Required `human-release` append succeeds before reason consumption or cleanup. Cleanup clears the
resolved ID's sanitized `retry_`, `round_`, `repeat_`, and `blocked_` files, legacy `retry_<index>`,
and `reg_retry`, preserving unrelated WP keys. Set `active`, restore the compatibility `counter`
to that WP's current array index, and recheck. A failure charges the restored budget normally;
release does not waive controls or authenticate a human. A lost position leaves the reason unconsumed.
See the [ARM skill](../.opencode/skills/relay-arm-hook/SKILL.md) for state repair operations.

`relay verify` reports recorded checklist verdicts and chain integrity; it does not rerun controls
or certify current artifacts. With a reachable sprint or explicit `--sprint`, it compares named
control IDs in both directions and recorded oracle hashes. Added/unrecorded, removed, or changed
controls produce `SPRINT-DIVERGED`; an unusable requested/reachable sprint produces `SPRINT-INVALID`,
not a skipped comparison. Legacy graded events without oracle hashes produce `ORACLE-UNVERIFIED`
when comparison is requested. An intact chain with unusable audit fields produces `RECORD-INVALID`.
These are exit `2` results. A bare ledger without a sprint has `oracle_recheck.status=not-run` and
explicit recorded-controls-only scope, even when its result is `PASS`.

| Symptom | Inspect |
|---|---|
| Hook never blocks | Event registration, inherited environment, own transcript path/marker, token directory, `agent_id` refusal, stderr. |
| Checks run in the wrong directory | `meta.workdir` exists; the ARM fallback is `.`, not payload `cwd`. |
| Runner stops mid-chain | `state`, `relay.log`, ledger `escalate`/plan defects, harness block cap, and unexpected tool errors. |
| Diff unavailable | Initial `meta.base_ref` or CLI `<state>/base_ref`, valid commit, Git workdir. |
| Judge fails or disappears | Backend/model/credentials, file context, truncation tags, numeric settings, script stderr when run directly. |
| ARM/CLI busy (`3`) | `<arm-or-state>/.run.lock`; establish whether an evaluation is alive before removing a stale lock. |
| Audit cannot certify | Chain integrity, terminal event, deterministic controls, oracle drift, invalid record/sprint, and `oracle_recheck` status/scope. |

Use [relay-gate-cli](../.opencode/skills/relay-gate-cli/SKILL.md) for outcome handling and
[relay-audit](../.opencode/skills/relay-audit/SKILL.md) for evidence review.
