#!/usr/bin/env python3
"""
relay-daemon — a long-running HTTP gate service over the model-agnostic CLI (Relay Roadmap R4).

`bin/relay-gate eval` is the vendor-neutral gate surface: a remote / non-Claude harness drives one gate
step (sprint + workdir + state → JSON outcome + exit code). That CLI is one-shot per process, fine for a
shell loop on the same box. This daemon adds the OTHER half of "model-agnostic": a long-running HTTP
surface so a remote harness (a CI runner, a non-Claude agent, an OEM integration) can drive Relay over
the network. It is the OEM surface.

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

Concurrency contract: the daemon is multi-threaded, but the gate's hash-chain append is NOT lock-safe on
its own (it reads tail -1 for prev/seq, then appends). Two requests against the SAME state_dir that
interleave would corrupt the chain and manufacture a false TAMPERED verdict. So we serialize gate
evaluations PER state_dir (keyed on the realpath): distinct state_dirs run in parallel; one state_dir is
strictly serialized.

Security (v0): binds to 127.0.0.1 only and has NO authentication. It is localhost-only by design. Do NOT
expose this port to an untrusted network — anyone who can reach it can run gate evaluations (which execute
the sprint's checklist `cmd`s). Auth / TLS / a real authorization model is the next increment and is
deliberately NOT faked here.

Usage:
  relay-daemon.py [--host 127.0.0.1] [--port 8787]
  RELAY_DAEMON_PORT=9000 relay-daemon.py        # env-configurable port (CLI flag wins)
"""
import argparse
import contextlib
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BIN = os.path.dirname(os.path.abspath(__file__))

HERE = os.path.dirname(os.path.abspath(__file__))
GATE = os.path.join(HERE, "relay-gate")

# Per-state_dir serialization. The gate's chain append is not internally locked, so two threaded requests
# against the SAME state_dir would interleave prev/seq reads and corrupt the ledger (a false TAMPERED).
# We hand out one lock per realpath(state_dir): distinct state_dirs run in parallel, one is serialized.
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
    proc = subprocess.run(
        [GATE, "eval", "--sprint", sprint_path, "--workdir", workdir, "--state", state_dir],
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
    if not token or "/" in token or ".." in token:
        return None
    d = os.path.join(ARMS_DIR, token)
    return d if os.path.isfile(os.path.join(d, "sprint.json")) else None


def _read_int(path, default):
    try:
        return int(open(path).read().strip())
    except (OSError, ValueError):
        return default


def _note(arm, body):
    """Append one entry to the arm's chain, through the shared core rather than a second encoding.

    List values are joined: the chain's existing failure fields (`fails`, `reg`) are strings, and a
    ledger that encodes the same idea two ways is a ledger nobody can grep. The HTTP response keeps
    the list, because that side is an API.
    """
    body = {k: (", ".join(v) if isinstance(v, list) else v) for k, v in body.items()}
    subprocess.run([os.path.join(BIN, "relay-note"), os.path.join(arm, "ledger.jsonl"),
                    os.path.join(arm, "sprint.json"), json.dumps(body, separators=(",", ":"))],
                   capture_output=True, text=True)


def _park(arm, token, reason, facts):
    """`awaiting-human` is a state a person's action leaves (R8). The runner is released; the arm is
    not finished, and only $ARM/release with a reason moves it."""
    with open(os.path.join(arm, "state"), "w") as fh:
        fh.write("awaiting-human")
    _note(arm, {"ts": int(time.time()), "arm": token, "event": "ask-parked",
                "reason": reason, **facts})
    return 423, {"outcome": "parked", "reason": reason, **facts}


def _checklist_failing(arm):
    """-> (failing_ids, wp) or None when the gate is satisfied. The SERVER runs it."""
    meta = json.load(open(os.path.join(arm, "meta.json")))
    r = subprocess.run([os.path.join(BIN, "relay-gate"), "check",
                        "--sprint", os.path.join(arm, "sprint.json"),
                        "--workdir", meta.get("workdir", "."), "--state", arm],
                       capture_output=True, text=True)
    try:
        out = json.loads(r.stdout or "{}")
    except json.JSONDecodeError:
        return None
    return (out.get("failing") or [], out.get("wp")) if out.get("failing") else None


def handle_ask(payload):
    if not isinstance(payload, dict):
        return 400, {"error": "body must be a JSON object"}
    token, question = payload.get("token"), (payload.get("question") or "").strip()
    arm = _arm_dir(token)
    if arm is None:
        return 404, {"error": "unknown arm"}
    if not question:
        return 400, {"error": "a question is required"}

    state = ""
    with contextlib.suppress(OSError):
        state = open(os.path.join(arm, "state")).read().strip()
    if state in ("complete", "awaiting-human", "escalated"):
        return 423, {"outcome": "parked", "reason": f"the arm is {state}"}

    failing = _checklist_failing(arm)
    if failing is None:
        return 409, {"error": "the checklist for this state is passing — nothing is blocking you. "
                              "Finish the state."}
    fail_ids, wp = failing

    ticket = hashlib.sha256(question.encode()).hexdigest()[:12]
    tdir = os.path.join(arm, "asks")
    os.makedirs(tdir, exist_ok=True)
    poke = _read_int(os.path.join(tdir, ticket), 0) + 1
    facts = {"wp": wp, "failing": fail_ids, "ticket": ticket}

    # An answer already waiting is the cheapest outcome, and "no" is an answer: waiting out the
    # remaining rounds after a decision has been made spends wall clock on nothing.
    apath = os.path.join(arm, "answers", ticket + ".json")
    if os.path.isfile(apath):
        answer = (json.load(open(apath)).get("answer") or "").strip()
        if answer.lower() in REFUSALS:
            return _park(arm, token, "the orchestrator declined this request", facts)
        _note(arm, {"ts": int(time.time()), "arm": token, "event": "ask-answered", **facts})
        return 200, {"outcome": "answered", "answer": answer, "poke": poke, **facts}

    if poke > ASK_ROUNDS:
        return _park(arm, token, f"{ASK_ROUNDS} pokes with no answer", {**facts, "pokes": poke - 1})

    # The total cap. Passive: notify and keep serving.
    total = _read_int(os.path.join(arm, "ask_total"), 0) + 1
    with open(os.path.join(arm, "ask_total"), "w") as fh:
        fh.write(str(total))
    cap = _read_int(os.path.join(arm, "ask_cap"), ASK_CAP)
    breached = total > cap
    if breached:
        bpath = os.path.join(arm, "ask_breach_ts")
        if not os.path.exists(bpath):
            with open(bpath, "w") as fh:
                fh.write(str(int(time.time())))
            # FACTS, never the agent's prose. The agent's text reaching the orchestrator is a
            # social-engineering channel, so what crosses is counts, elapsed time, and which control
            # is still failing.
            _note(arm, {"ts": int(time.time()), "arm": token, "event": "ask-cap-breach",
                        "asks": total, "cap": cap, "wp": wp, "failing": fail_ids})
        decision = ""
        opath = os.path.join(arm, "orchestrator.json")
        if os.path.isfile(opath):
            with contextlib.suppress(ValueError, OSError):
                decision = (json.load(open(opath)).get("decision") or "").strip().lower()
        if decision in ("stop", "park"):
            return _park(arm, token, "the orchestrator stopped this arm after a cap breach", facts)
        if decision != "continue":
            waited = int(time.time()) - _read_int(bpath, int(time.time()))
            if waited >= _read_int(os.path.join(arm, "ask_deadline"), ASK_DEADLINE):
                return _park(arm, token,
                             "the cap was breached and the orchestrator did not answer in time", facts)

    with open(os.path.join(tdir, ticket), "w") as fh:
        fh.write(str(poke))
    _note(arm, {"ts": int(time.time()), "arm": token, "event": "ask", "poke": poke, **facts})
    return 200, {"outcome": "waiting", "poke": poke, "rounds": ASK_ROUNDS,
                 "cap_breached": breached, **facts}


def handle_answer(payload):
    """The orchestrator's side. Deliberately not authenticated — see the security note above; this
    daemon is localhost-only and answering is no more privileged than driving a gate."""
    if not isinstance(payload, dict):
        return 400, {"error": "body must be a JSON object"}
    arm = _arm_dir(payload.get("token"))
    if arm is None:
        return 404, {"error": "unknown arm"}
    ticket = payload.get("ticket")
    if not ticket or not re.fullmatch(r"[0-9a-f]{12}", str(ticket)):
        return 400, {"error": "a valid ticket is required"}
    os.makedirs(os.path.join(arm, "answers"), exist_ok=True)
    with open(os.path.join(arm, "answers", ticket + ".json"), "w") as fh:
        json.dump({"answer": payload.get("answer", "")}, fh)
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
        except json.JSONDecodeError:
            self._send(400, {"error": "request body is not valid JSON"})
            return
        route = {"/gate/eval": handle_eval, "/ask": handle_ask, "/answer": handle_answer}[self.path]
        status, body = route(payload)
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
                    help="bind host (default 127.0.0.1, localhost-only — see security note)")
    ap.add_argument("--port", type=int,
                    default=int(os.environ.get("RELAY_DAEMON_PORT", "8787")),
                    help="bind port (default $RELAY_DAEMON_PORT or 8787)")
    a = ap.parse_args()

    httpd = make_server(a.host, a.port)
    host, port = httpd.server_address
    sys.stderr.write(f"relay-daemon: listening on http://{host}:{port}  (gate={GATE})\n")
    sys.stderr.write("relay-daemon: localhost-only, NO auth in v0 — do not expose to an untrusted network\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
