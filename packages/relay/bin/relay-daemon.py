#!/usr/bin/env python3
"""
relay-daemon — a long-running HTTP gate service over the model-agnostic CLI (Relay Roadmap R4).

`bin/relay-gate eval` is the vendor-neutral gate surface: a remote / non-Claude harness drives one gate
step (sprint + workdir + state → JSON outcome + exit code). That CLI is one-shot per process, fine for a
shell loop on the same box. This daemon adds the OTHER half of "model-agnostic": a long-running HTTP
surface so a remote harness (a CI runner, a non-Claude agent, an OEM integration) can drive Relay over
the network. It remains a standalone/regression tool, not Orchestra's installed authoring transport.

Historical docs/reviews source hashes identify the bytes reviewed at the recorded revision, not this
unpinned harness after portability repairs. Keep those review records and pinned oracle sources intact.

There is exactly ONE gate. This daemon does NOT reimplement gate logic: every /gate/eval request shells
out to `bin/relay-gate eval` and faithfully relays its JSON + maps its exit code onto the HTTP status, so
the ledger it produces is semantically identical to what `relay-gate` would have produced directly: the
same events, verdicts, seq, and chain structure (no drift). The `ts` field and the ts-dependent hashes
naturally differ per run, so the bytes are NOT identical — only the semantics are.

Endpoints:
  POST /gate/eval   body {"sprint_path"|"sprint", "workdir", "state_dir"} →
                    runs one gate step, returns relay-gate's JSON outcome. HTTP status carries the
                    disposition: 200 advance/complete, 409 gate-fail, 423 escalate (400 on bad request,
                    500 if the gate itself errors).
  GET  /healthz     → {"status":"ok","gate":"relay-gate"}.

State is stateless per request — it lives in `state_dir` on disk, exactly as the CLI does today. Pass the
same state_dir across calls to advance a sprint; the ledger lands at <state_dir>/ledger.jsonl as usual.

Concurrency contract: the daemon serializes gate evaluations per realpath(state_dir), and complete
ask/answer operations per realpath(arm), using the same in-process lock registry. CLI run locks and
shared-core chain append locks are separate cross-process mechanisms. The daemon lock does not
serialize arm-hook state writes from another process.

Security (v0): defaults to 127.0.0.1; --host can bind other addresses. It has NO authentication,
TLS, or authorization. Use only on a trusted local boundary: anyone who can reach it can run gate
evaluations (which execute the sprint's checklist `cmd`s) and submit answers.

Usage:
  relay-daemon.py [--host 127.0.0.1] [--port 8787]
  RELAY_DAEMON_PORT=9000 relay-daemon.py        # env-configurable port (CLI flag wins)
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BIN = os.path.dirname(os.path.abspath(__file__))

HERE = os.path.dirname(os.path.abspath(__file__))
GATE = os.path.join(HERE, "relay-gate")

# Whole-request serialization, distinct from the CLI run lock and the shared chain append lock.
# One lock per realpath also makes aliases of an arm share ask/answer counters and ticket writes.
_STATE_LOCKS = {}
_STATE_LOCKS_GUARD = threading.Lock()


def _state_lock(state_dir):
    key = os.path.realpath(state_dir)
    with _STATE_LOCKS_GUARD:
        lock = _STATE_LOCKS.get(key)
        if lock is None:
            lock = _STATE_LOCKS[key] = threading.Lock()
        return lock

# relay-gate's exit code → HTTP status. The CLI documents: 0 advance/complete, 1 gate-fail, 2 escalate.
# We key off the JSON outcome (the contract) and fall back to the exit code so the two never disagree.
OUTCOME_STATUS = {"advance": 200, "complete": 200, "gate-fail": 409, "escalate": 423}
EXIT_STATUS = {0: 200, 1: 409, 2: 423}


def run_gate(sprint_path, workdir, state_dir):
    """Shell out to the ONE gate. Returns (http_status, body_dict)."""
    # Windows ignores Bash shebangs and searches System32 before PATH for bare executable names.
    # Resolve PATH explicitly so Git Bash wins over the unrelated System32 WSL launcher.
    bash = shutil.which("bash")
    if bash is None:
        raise FileNotFoundError("Bash is required to run relay-gate")
    # Git Bash ships sha256sum, not shasum. Adapt only the pinned core's SHA-256 invocation;
    # unsupported algorithms and missing hash tools fail rather than produce an empty digest.
    bootstrap = r'''
if ! command -v shasum >/dev/null 2>&1; then
  command -v sha256sum >/dev/null 2>&1 || { printf '%s\n' 'relay-daemon: SHA-256 tool unavailable' >&2; exit 127; }
  shasum() {
    [ "$#" -ge 2 ] && [ "$1" = '-a' ] && [ "$2" = '256' ] || return 2
    shift 2
    sha256sum -- "$@"
  }
  export -f shasum
fi
exec bash "$@"
'''
    proc = subprocess.run(
        [bash, "-c", bootstrap, "relay-daemon", GATE, "eval", "--sprint", sprint_path, "--workdir", workdir, "--state", state_dir],
        capture_output=True, text=True)
    out = proc.stdout.strip()
    try:
        body = json.loads(out) if out else None
    except json.JSONDecodeError:
        body = None
    if not isinstance(body, dict) or "outcome" not in body:
        # relay-gate produced no usable JSON outcome (empty stdout on a hard error: missing/invalid
        # workdir → exit 1; non-object sprint → jq parse error, exit 5; or any non-JSON / non-outcome
        # output). This is a gate ERROR, not a gate disposition — surface its stderr verbatim as a 500
        # rather than masking it as a retriable 409. Folding the empty-stdout case in here is the fix for
        # the bug where `body = {} if not out` silently produced 409 {} (or a bare 500 {}) with the
        # diagnostics dropped.
        return 500, {"error": "gate error", "detail": (proc.stderr or out).strip(),
                     "exit": proc.returncode}
    status = OUTCOME_STATUS.get(body.get("outcome")) or EXIT_STATUS.get(proc.returncode, 500)
    return status, body


def handle_eval(payload):
    """Validate the request body, materialize the sprint, and evaluate. Returns (status, body_dict)."""
    if not isinstance(payload, dict):
        return 400, {"error": "body must be a JSON object"}
    workdir = payload.get("workdir")
    state_dir = payload.get("state_dir")
    sprint_path = payload.get("sprint_path")
    sprint = payload.get("sprint")
    if not workdir or not state_dir:
        return 400, {"error": "missing 'workdir' or 'state_dir'"}
    for name in ("workdir", "state_dir", "sprint_path"):
        if name in payload and (not isinstance(payload[name], str) or
                                not payload[name].strip() or "\0" in payload[name]):
            return 400, {"error": f"'{name}' must be a nonempty path string"}
    if not sprint_path and sprint is None:
        return 400, {"error": "provide 'sprint_path' (a file) or 'sprint' (inline sprint JSON)"}
    if sprint_path and sprint is not None:
        return 400, {"error": "provide exactly one of 'sprint_path' or 'sprint', not both"}

    tmp = None
    if sprint_path is not None:
        if not os.path.isfile(sprint_path):
            # Do NOT echo the caller-supplied path back: that turns the response into a filesystem
            # existence oracle the local CLI never exposed over the network. Keep the message generic.
            return 400, {"error": "sprint_path not found"}
        path = sprint_path
    else:
        # Inline sprint: relay-gate takes a path, so write the JSON to a temp file for this one call.
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", prefix="relay-sprint-",
                                          delete=False)
        json.dump(sprint, tmp)
        tmp.close()
        path = tmp.name
    try:
        # Serialize per state_dir so concurrent requests can't interleave the hash-chain append.
        with _state_lock(state_dir):
            return run_gate(path, workdir, state_dir)
    finally:
        if tmp is not None:
            os.unlink(tmp.name)


# ---- The wait channel (V10 — docs/enforcement-model.md §6c) --------------------------------------
# A block costs a model turn; a wait costs only wall clock, so waiting is strictly cheaper. But a
# tool call that never stops leaves the enforcement layer blind for its whole duration — no fire, no
# round, no no-progress detection. Everything below follows from that:
#
#   * The METER IS HERE, server-side, on the far side of the boundary. The hook cannot meter a wait,
#     because the hook only runs when an agent stops and a waiting agent has not stopped.
#   * It REFUSES unless the current sub-state's checklist is failing, established by running that
#     checklist (`relay-gate check`, which grades nothing and records nothing) rather than by
#     believing the agent. A conditioned channel, not a rest button.
#   * The cap is PASSIVE WITH A DEADLINE. On breach it notifies the orchestrator and keeps serving:
#     continue means continue, stop or silence past the window means park. Passive without a deadline
#     is decorative, because a dead orchestrator would then mean no cap at all.
ARMS_DIR = os.environ.get("RELAY_ARMS_DIR") or os.path.expanduser("~/.relay/arms")
ASK_ROUNDS = 3          # pokes on one ticket before it parks; the fourth round is the park
ASK_CAP = 8             # total asks on one arm before the orchestrator is notified (passive)
ASK_DEADLINE = 900      # seconds of orchestrator silence after a breach before the arm parks
REFUSALS = {"no", "n", "stop", "denied", "refused", "reject", "rejected"}


def _arm_dir(token):
    if (not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+", token) or
            token == "." or ".." in token):
        return None
    d = os.path.join(ARMS_DIR, token)
    return d if os.path.isfile(os.path.join(d, "sprint.json")) else None


def _read_int(path, default):
    try:
        with open(path) as fh:
            return int(fh.read().strip())
    except (OSError, ValueError):
        return default


class RouteError(Exception):
    """A failed server-side precondition or required write, with diagnostics for the caller."""

    def __init__(self, status, error, detail=None, exit=None):
        super().__init__(detail or error)
        self.status = status
        self.body = {"error": error}
        if detail is not None:
            self.body["detail"] = detail
        if exit is not None:
            self.body["exit"] = exit


def _process_error(error, proc, reason, status=500):
    # Retain both streams: malformed stdout and stderr may carry different useful causes.
    detail = "\n".join(part for part in (reason, proc.stderr.strip(), proc.stdout.strip()) if part)
    return RouteError(status, error, detail, proc.returncode)


def _read_text(path):
    with open(path) as fh:
        return fh.read()


def _write_text(path, value):
    with open(path, "w") as fh:
        fh.write(str(value))


def _read_json(path):
    with open(path) as fh:
        try:
            return json.load(fh)
        except ValueError as exc:
            raise RouteError(500, "arm data error", f"{path}: {exc}") from exc


def _nonempty_string(value):
    return isinstance(value, str) and bool(value.strip()) and "\0" not in value


def _identity_string(value):
    return isinstance(value, str) and bool(value) and "\0" not in value


def _position_id(position, ids):
    if position in ids:
        return position
    _, dot, suffix = position.partition(".")
    return suffix if dot and suffix in ids else None


def _required_string(payload, name):
    value = payload.get(name)
    if not _nonempty_string(value):
        raise RouteError(400, f"'{name}' must be a nonempty string")
    return value.strip()


def _stored_count(path, default=0):
    """Missing legacy counters have a default; unreadable or malformed existing counters do not."""
    try:
        value = _read_text(path).strip()
    except FileNotFoundError:
        if not os.path.lexists(path):
            return default
        raise
    if not re.fullmatch(r"[0-9]+", value):
        raise RouteError(500, "arm data error", f"invalid counter: {path}")
    return int(value)


def _note(arm, body):
    """Append one entry to the arm's chain, through the shared core rather than a second encoding.

    List values are joined: the chain's existing failure fields (`fails`, `reg`) are strings, and a
    ledger that encodes the same idea two ways is a ledger nobody can grep. The HTTP response keeps
    the list, because that side is an API.
    """
    body = {k: (", ".join(v) if isinstance(v, list) else v) for k, v in body.items()}
    try:
        proc = subprocess.run([os.path.join(BIN, "relay-note"), os.path.join(arm, "ledger.jsonl"),
                               os.path.join(arm, "sprint.json"), json.dumps(body, separators=(",", ":"))],
                              capture_output=True, text=True)
    except OSError as exc:
        raise RouteError(500, "note error", str(exc)) from exc
    if proc.returncode != 0:
        raise _process_error("note error", proc, "required wait-channel note append failed")


def _park(arm, token, reason, facts):
    """`awaiting-human` is a state a person's action leaves (R8). The runner is released; the arm is
    not finished, and only $ARM/release with a reason moves it."""
    _note(arm, {"ts": int(time.time()), "arm": token, "event": "ask-parked",
                "reason": reason, **facts})
    _write_text(os.path.join(arm, "state"), "awaiting-human")
    return 423, {"outcome": "parked", "reason": reason, **facts}


def _checklist_failing(arm):
    """Return failures, or None only for a valid passing check. Infrastructure errors raise."""
    meta = _read_json(os.path.join(arm, "meta.json"))
    if not isinstance(meta, dict) or not _nonempty_string(meta.get("workdir")):
        raise RouteError(500, "arm data error", "meta.workdir must be a nonempty path string")
    workdir = meta["workdir"]
    if not os.path.isdir(workdir):
        raise RouteError(500, "arm data error", f"workdir not found: {workdir}")
    sprint = _read_json(os.path.join(arm, "sprint.json"))
    packages = sprint.get("work_packages") if isinstance(sprint, dict) else None
    if not isinstance(packages, list) or not packages:
        raise RouteError(500, "arm data error", "work_packages must be a nonempty array")
    ids = []
    for wp in packages:
        if not isinstance(wp, dict) or not _identity_string(wp.get("id")):
            raise RouteError(500, "arm data error", "work package id must be a nonempty string")
        if "macro" in wp and (not isinstance(wp["macro"], str) or "\0" in wp["macro"]):
            raise RouteError(500, "arm data error", "work package macro must be a string")
        ids.append(wp["id"])
    if len(set(ids)) != len(ids):
        raise RouteError(500, "arm data error", "duplicate work package ids")

    args = [os.path.join(BIN, "relay-gate"), "check",
            "--sprint", os.path.join(arm, "sprint.json"), "--workdir", workdir, "--state", arm]
    position_path = os.path.join(arm, "position")
    if os.path.lexists(position_path):
        with open(position_path, encoding="utf-8", newline="") as fh:
            position = fh.read()
        if not _identity_string(position):
            raise RouteError(500, "arm data error", "position must be a nonempty WP id")
        # Preserve raw CR/LF identity. Only a raw exact/suffix miss permits legacy LF cleanup.
        resolved = _position_id(position, ids)
        if resolved is None:
            legacy_position = position.rstrip("\n")
            resolved = _position_id(legacy_position, ids)
            if resolved is not None:
                position = legacy_position
        if resolved is None:
            raise RouteError(500, "arm data error", f"position not found in plan: {position}")
        i = ids.index(resolved)
        args.extend(["--position", position])
    else:
        i = _stored_count(os.path.join(arm, "counter"))
        if i >= len(packages):
            raise RouteError(500, "arm data error", "active arm counter has no current work package")
    wp_id = ids[i]
    checklist = packages[i].get("checklist", [])
    if not isinstance(checklist, list):
        raise RouteError(500, "arm data error", f"checklist must be an array: {wp_id}")
    for item in checklist:
        if not isinstance(item, dict) or not _nonempty_string(item.get("id")):
            raise RouteError(500, "arm data error", f"checklist item id must be a string: {wp_id}")
        for field in ("cmd", "judge"):
            if field in item and not isinstance(item[field], str):
                raise RouteError(500, "arm data error", f"checklist {field} must be a string: {wp_id}")
        if not item.get("cmd") and not _nonempty_string(item.get("judge")):
            raise RouteError(500, "arm data error", f"checklist item has no cmd or judge: {item['id']}")
        for field in ("blocking", "diff"):
            if field in item and not isinstance(item[field], bool):
                raise RouteError(500, "arm data error", f"checklist {field} must be boolean: {wp_id}")
        for field in ("context", "paths"):
            if field not in item:
                continue
            paths = item[field]
            if field == "context" and isinstance(paths, str):
                paths = [paths]
            if not isinstance(paths, list) or not all(_nonempty_string(p) for p in paths):
                raise RouteError(500, "arm data error", f"invalid checklist {field}: {wp_id}")

    # Sanitize the actual WP id, not a guessed position suffix. Match the ARM's byte-wise tr key.
    safe_id = re.sub(rb"[^A-Za-z0-9._-]", b"_", wp_id.encode()).decode("ascii")
    base_path = os.path.join(arm, "base_" + safe_id)
    base_ref = (_read_text(base_path).rstrip("\n") if os.path.lexists(base_path)
                else meta.get("base_ref", ""))
    if not isinstance(base_ref, str) or "\0" in base_ref:
        raise RouteError(500, "arm data error", "base_ref must be a string")
    # Explicit empty base also prevents an unrelated CLI state/base_ref from being used.
    if (os.path.lexists(position_path) or os.path.lexists(base_path) or "base_ref" in meta or
            any(item.get("diff") for item in checklist)):
        args.extend(["--base-ref", base_ref])
    try:
        r = subprocess.run(args, capture_output=True, text=True)
    except OSError as exc:
        raise RouteError(500, "check error", str(exc)) from exc
    if r.returncode == 3:
        raise _process_error("check busy", r, "check precondition is busy", status=503)
    if r.returncode not in (0, 1):
        raise _process_error("check error", r, "unexpected check process exit")
    try:
        out = json.loads(r.stdout)
    except ValueError as exc:
        raise _process_error("check error", r, f"invalid check JSON: {exc}") from exc
    if not isinstance(out, dict) or out.get("outcome") != "check":
        raise _process_error("check error", r, "missing or unexpected check outcome")
    failures = out.get("failing")
    control_ids = {item["id"] for item in checklist}
    if (not isinstance(failures, list) or not all(_nonempty_string(f) and f in control_ids for f in failures) or
            type(out.get("i")) is not int or out["i"] != i or out.get("wp") != wp_id or
            r.returncode != int(bool(failures))):
        raise _process_error("check error", r, "invalid or inconsistent check fields")
    return (failures, wp_id) if failures else None


def _wait_request(payload, operation):
    try:
        if not isinstance(payload, dict):
            raise RouteError(400, "body must be a JSON object")
        token = _required_string(payload, "token")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", token) or token == "." or ".." in token:
            raise RouteError(400, "a valid token is required")
        arm = _arm_dir(token)
        if arm is None:
            raise RouteError(404, "unknown arm")
        # Acquire once around the whole operation. Helpers must not acquire this non-reentrant lock.
        with _state_lock(arm):
            return operation(arm, token, payload)
    except RouteError as exc:
        return exc.status, exc.body
    except (OSError, ValueError) as exc:
        return 500, {"error": "arm data error", "detail": str(exc)}


def handle_ask(payload):
    return _wait_request(payload, _ask_locked)


def _ask_locked(arm, token, payload):
    question = _required_string(payload, "question")

    state = ""
    state_path = os.path.join(arm, "state")
    if os.path.lexists(state_path):
        state = _read_text(state_path).strip()
    if state in ("complete", "awaiting-human", "escalated"):
        return 423, {"outcome": "parked", "reason": f"the arm is {state}"}
    if state not in ("", "active"):
        raise RouteError(500, "arm data error", f"unknown arm state: {state}")

    failing = _checklist_failing(arm)
    if failing is None:
        return 409, {"error": "the checklist for this state is passing — nothing is blocking you. "
                              "Finish the state."}
    fail_ids, wp = failing

    ticket = hashlib.sha256(question.encode()).hexdigest()[:12]
    tdir = os.path.join(arm, "asks")
    os.makedirs(tdir, exist_ok=True)
    poke = _stored_count(os.path.join(tdir, ticket)) + 1
    facts = {"wp": wp, "failing": fail_ids, "ticket": ticket}

    # An answer already waiting is the cheapest outcome, and "no" is an answer: waiting out the
    # remaining rounds after a decision has been made spends wall clock on nothing.
    apath = os.path.join(arm, "answers", ticket + ".json")
    if os.path.lexists(apath):
        stored = _read_json(apath)
        if not isinstance(stored, dict) or not _nonempty_string(stored.get("answer")):
            raise RouteError(500, "arm data error", f"invalid stored answer: {ticket}")
        answer = stored["answer"].strip()
        if answer.lower() in REFUSALS:
            return _park(arm, token, "the orchestrator declined this request", facts)
        _note(arm, {"ts": int(time.time()), "arm": token, "event": "ask-answered", **facts})
        return 200, {"outcome": "answered", "answer": answer, "poke": poke, **facts}

    if poke > ASK_ROUNDS:
        return _park(arm, token, f"{ASK_ROUNDS} pokes with no answer", {**facts, "pokes": poke - 1})

    # The total cap. Passive: notify and keep serving.
    total = _stored_count(os.path.join(arm, "ask_total")) + 1
    cap = _read_int(os.path.join(arm, "ask_cap"), ASK_CAP)
    breached = total > cap
    new_breach = False
    park_reason = None
    if breached:
        bpath = os.path.join(arm, "ask_breach_ts")
        new_breach = not os.path.lexists(bpath)
        breach_ts = int(time.time()) if new_breach else _stored_count(bpath)
        if new_breach:
            # FACTS, never the agent's prose. The agent's text reaching the orchestrator is a
            # social-engineering channel, so what crosses is counts, elapsed time, and which control
            # is still failing.
            _note(arm, {"ts": int(time.time()), "arm": token, "event": "ask-cap-breach",
                        "asks": total, "cap": cap, "wp": wp, "failing": fail_ids})
        decision = ""
        opath = os.path.join(arm, "orchestrator.json")
        if os.path.lexists(opath):
            orchestrator = _read_json(opath)
            if not isinstance(orchestrator, dict) or not isinstance(orchestrator.get("decision"), str):
                raise RouteError(500, "arm data error", "orchestrator.decision must be a string")
            decision = orchestrator["decision"].strip().lower()
        if decision in ("stop", "park"):
            park_reason = "the orchestrator stopped this arm after a cap breach"
        elif decision != "continue":
            waited = int(time.time()) - breach_ts
            if waited >= _read_int(os.path.join(arm, "ask_deadline"), ASK_DEADLINE):
                park_reason = "the cap was breached and the orchestrator did not answer in time"

    # Required notes precede state/counter writes: a failed append must not consume a successful poke.
    if park_reason:
        result = _park(arm, token, park_reason, facts)
    else:
        _note(arm, {"ts": int(time.time()), "arm": token, "event": "ask", "poke": poke, **facts})
    _write_text(os.path.join(arm, "ask_total"), total)
    if new_breach:
        _write_text(bpath, breach_ts)
    if park_reason:
        return result
    _write_text(os.path.join(tdir, ticket), poke)
    return 200, {"outcome": "waiting", "poke": poke, "rounds": ASK_ROUNDS,
                 "cap_breached": breached, **facts}


def handle_answer(payload):
    """The orchestrator's side, under the same unauthenticated trusted-local boundary."""
    return _wait_request(payload, _answer_locked)


def _answer_locked(arm, token, payload):
    ticket = _required_string(payload, "ticket")
    answer = _required_string(payload, "answer")
    if not re.fullmatch(r"[0-9a-f]{12}", ticket):
        raise RouteError(400, "a valid ticket is required")
    tpath = os.path.join(arm, "asks", ticket)
    if not os.path.isfile(tpath):
        raise RouteError(404, "unknown ticket")
    if _stored_count(tpath) < 1:
        raise RouteError(500, "arm data error", f"invalid stored ticket: {ticket}")
    os.makedirs(os.path.join(arm, "answers"), exist_ok=True)
    with open(os.path.join(arm, "answers", ticket + ".json"), "w") as fh:
        json.dump({"answer": answer}, fh)
    return 200, {"outcome": "recorded", "ticket": ticket}


class Handler(BaseHTTPRequestHandler):
    server_version = "relay-daemon/0"

    def _send(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/healthz":
            self._send(200, {"status": "ok", "gate": "relay-gate"})
        else:
            self._send(404, {"error": "not found", "path": self.path})

    def do_POST(self):
        if self.path not in ("/gate/eval", "/ask", "/answer"):
            self._send(404, {"error": "not found", "path": self.path})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send(400, {"error": "invalid Content-Length"})
            return
        if length < 0:
            self._send(400, {"error": "invalid Content-Length"})
            return
        raw = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(raw) if raw else {}
        except (ValueError, UnicodeDecodeError):
            self._send(400, {"error": "request body is not valid JSON"})
            return
        route = {"/gate/eval": handle_eval, "/ask": handle_ask, "/answer": handle_answer}[self.path]
        try:
            status, body = route(payload)
        except (OSError, ValueError) as exc:
            status, body = 500, {"error": "route error", "detail": str(exc)}
        self._send(status, body)

    def log_message(self, fmt, *args):
        # One line per request to stderr (BaseHTTPRequestHandler default goes to stderr; keep it terse).
        sys.stderr.write("relay-daemon: %s - %s\n" % (self.address_string(), fmt % args))


def make_server(host, port):
    if not os.path.isfile(GATE):
        raise SystemExit(f"relay-daemon: cannot find the gate at {GATE} — refusing to start")
    return ThreadingHTTPServer((host, port), Handler)


def main():
    ap = argparse.ArgumentParser(description="HTTP gate service over the model-agnostic relay-gate CLI.")
    ap.add_argument("--host", default="127.0.0.1",
                    help="bind host (default 127.0.0.1; trusted local use only — no auth)")
    ap.add_argument("--port", type=int,
                    default=int(os.environ.get("RELAY_DAEMON_PORT", "8787")),
                    help="bind port (default $RELAY_DAEMON_PORT or 8787)")
    a = ap.parse_args()

    httpd = make_server(a.host, a.port)
    host, port = httpd.server_address
    sys.stderr.write(f"relay-daemon: listening on http://{host}:{port}  (gate={GATE})\n")
    sys.stderr.write("relay-daemon: trusted local use only, NO auth in v0 — do not expose to an untrusted network\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
