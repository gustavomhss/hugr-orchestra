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
import json
import os
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

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
        if self.path != "/gate/eval":
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
        status, body = handle_eval(payload)
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
