"""Regression for the HTTP gate daemon (bin/relay-daemon.py, Roadmap R4).

Starts the REAL daemon on an ephemeral port in a subprocess, drives a tiny 2-WP sprint over HTTP with
urllib, and asserts the disposition→status mapping (gate-fail 409, advance 200, complete 200, escalate
423) plus /healthz. The key invariant: the daemon produces the SAME ledger `bin/relay-gate` would for the
identical sequence of calls — one gate, no drift. All state is isolated under tmp_path; the server is torn
down cleanly.
"""
import contextlib
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
DAEMON = ROOT / "bin" / "relay-daemon.py"
GATE = ROOT / "bin" / "relay-gate"


def _free_port():
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextlib.contextmanager
def running_daemon(port):
    proc = subprocess.Popen([sys.executable, str(DAEMON), "--host", "127.0.0.1", "--port", str(port)],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        _wait_healthy(port, proc)
        yield proc
    finally:
        proc.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            proc.wait(timeout=5)
        if proc.poll() is None:
            proc.kill()


def _wait_healthy(port, proc, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError("daemon exited early: " + proc.stderr.read().decode())
        try:
            status, body = _get(port, "/healthz")
            if status == 200:
                return
        except (urllib.error.URLError, ConnectionError):
            time.sleep(0.05)
    raise RuntimeError("daemon did not become healthy in time")


def _request(port, method, path, body=None):
    url = f"http://127.0.0.1:{port}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def _get(port, path):
    return _request(port, "GET", path)


def _post(port, path, body):
    return _request(port, "POST", path, body)


def _sprint(work, budget=3):
    return {
        "brief": "t", "retry_budget": budget,
        "work_packages": [
            {"id": "wp1", "instructions": "a",
             "checklist": [{"id": "C1", "assert": "f1", "cmd": f"test -f {work}/f1"}]},
            {"id": "wp2", "instructions": "b",
             "checklist": [{"id": "C2", "assert": "f2", "cmd": f"test -f {work}/f2"}]},
        ],
    }


def test_healthz(tmp_path):
    port = _free_port()
    with running_daemon(port):
        status, body = _get(port, "/healthz")
        assert status == 200
        assert body == {"status": "ok", "gate": "relay-gate"}


def test_full_sprint_disposition_mapping(tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    state = tmp_path / "state"
    sprint = _sprint(work)
    port = _free_port()
    with running_daemon(port):
        def ev():
            return _post(port, "/gate/eval",
                         {"sprint": sprint, "workdir": str(work), "state_dir": str(state)})

        # WP1 unsatisfied → gate-fail → 409
        status, body = ev()
        assert status == 409 and body["outcome"] == "gate-fail"
        assert body["failing"] == ["C1"]

        # satisfy WP1 → advance → 200
        (work / "f1").write_text("x")
        status, body = ev()
        assert status == 200 and body["outcome"] == "advance" and body["next"] == "wp2"

        # WP2 unsatisfied → gate-fail → 409
        status, body = ev()
        assert status == 409 and body["outcome"] == "gate-fail"

        # satisfy WP2 → complete → 200
        (work / "f2").write_text("x")
        status, body = ev()
        assert status == 200 and body["outcome"] == "complete"


def test_escalate_maps_to_423(tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    state = tmp_path / "state"
    sprint = _sprint(work, budget=1)  # 1 retry then escalate; f1 never planted
    port = _free_port()
    with running_daemon(port):
        def ev():
            return _post(port, "/gate/eval",
                         {"sprint": sprint, "workdir": str(work), "state_dir": str(state)})

        assert ev()[0] == 409          # first fail, consumes the 1 retry
        status, body = ev()            # budget spent → escalate
        assert status == 423 and body["outcome"] == "escalate"


def test_sprint_path_form(tmp_path):
    """The body may pass a sprint by path instead of inline; same result."""
    work = tmp_path / "work"
    work.mkdir()
    (work / "f1").write_text("x")
    state = tmp_path / "state"
    sprint_file = tmp_path / "sprint.json"
    sprint_file.write_text(json.dumps(_sprint(work)))
    port = _free_port()
    with running_daemon(port):
        status, body = _post(port, "/gate/eval",
                             {"sprint_path": str(sprint_file),
                              "workdir": str(work), "state_dir": str(state)})
        assert status == 200 and body["outcome"] == "advance"


def test_bad_requests(tmp_path):
    port = _free_port()
    with running_daemon(port):
        # missing workdir/state_dir
        assert _post(port, "/gate/eval", {"sprint": {}})[0] == 400
        # neither sprint nor sprint_path
        assert _post(port, "/gate/eval",
                     {"workdir": "/x", "state_dir": "/y"})[0] == 400
        # both sprint and sprint_path
        assert _post(port, "/gate/eval",
                     {"sprint": {}, "sprint_path": "/p", "workdir": "/x", "state_dir": "/y"})[0] == 400
        # unknown route
        assert _get(port, "/nope")[0] == 404


def test_missing_workdir_is_500_with_gate_stderr(tmp_path):
    """A gate HARD error (relay-gate exits 1, empty stdout, message on stderr) must surface as 500 with
    the gate's stderr in `detail` — NOT be masked as a retriable 409 gate-fail with an empty body."""
    state = tmp_path / "state"
    sprint = _sprint(tmp_path / "work")
    bad_workdir = str(tmp_path / "does_not_exist_xyz")
    port = _free_port()
    with running_daemon(port):
        status, body = _post(port, "/gate/eval",
                             {"sprint": sprint, "workdir": bad_workdir, "state_dir": str(state)})
        assert status == 500, f"expected 500 for a gate hard error, got {status} {body}"
        assert body.get("error") == "gate error"
        assert body.get("exit") == 1
        # the gate prints "relay-gate: workdir not found: ..." to stderr — it must reach the client
        assert "workdir not found" in body.get("detail", ""), body


def test_non_object_inline_sprint_is_500_with_detail(tmp_path):
    """A non-object sprint makes relay-gate's jq error (exit 5, empty stdout). The daemon must still
    return 500 WITH the gate's stderr in `detail`, not a bare 500 {} that drops all diagnostics."""
    work = tmp_path / "work"
    work.mkdir()
    state = tmp_path / "state"
    port = _free_port()
    with running_daemon(port):
        # inline sprint that is a JSON string, not an object → jq parse/type error in the gate
        status, body = _post(port, "/gate/eval",
                             {"sprint": "not a sprint object",
                              "workdir": str(work), "state_dir": str(state)})
        assert status == 500, f"expected 500, got {status} {body}"
        assert body.get("error") == "gate error"
        assert body.get("detail", "").strip(), f"detail must carry the gate's stderr, got {body!r}"


def test_missing_sprint_path_does_not_echo_path(tmp_path):
    """A non-existent sprint_path is a 400, but the response must NOT echo the caller-supplied path
    (it would turn the response into a filesystem existence oracle)."""
    secret = str(tmp_path / "secret_probe_path.json")
    port = _free_port()
    with running_daemon(port):
        status, body = _post(port, "/gate/eval",
                             {"sprint_path": secret, "workdir": str(tmp_path),
                              "state_dir": str(tmp_path / "state")})
        assert status == 400
        assert "secret_probe_path" not in json.dumps(body), body


def test_malformed_content_length_yields_400(tmp_path):
    """A non-integer Content-Length must yield a 400 response, not crash the request handler thread
    (which would drop the connection with no HTTP response at all)."""
    port = _free_port()
    with running_daemon(port):
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
            s.connect(("127.0.0.1", port))
            s.sendall(b"POST /gate/eval HTTP/1.1\r\nHost: x\r\n"
                      b"Content-Length: abc\r\nConnection: close\r\n\r\n")
            resp = b""
            while True:
                chunk = s.recv(4096)
                if not chunk:
                    break
                resp += chunk
        assert resp, "handler dropped the connection with no response (thread crashed)"
        first_line = resp.split(b"\r\n", 1)[0]
        assert b"400" in first_line, first_line
        # the daemon must still be alive and serving after the malformed request
        assert _get(port, "/healthz")[0] == 200


def test_concurrent_same_state_dir_ledger_stays_valid(tmp_path):
    """Many concurrent requests against the SAME state_dir must not interleave the hash chain. The
    resulting ledger must still verify (no self-inflicted false TAMPERED)."""
    import threading

    work = tmp_path / "work"
    work.mkdir()
    state = tmp_path / "state"
    sprint_file = tmp_path / "sprint.json"
    # a checklist that always fails so every call appends gate-fail events to the chain
    sprint = {
        "brief": "t", "retry_budget": 100,
        "work_packages": [
            {"id": "wp1", "instructions": "a",
             "checklist": [{"id": "C1", "assert": "f1", "cmd": "false"}]},
        ],
    }
    sprint_file.write_text(json.dumps(sprint))
    port = _free_port()
    with running_daemon(port):
        done = []

        def fire():
            # Retry only transient connection resets (listen-backlog under a thundering herd); these are
            # not what this test is about. The invariant under test is that the appends that DO land never
            # interleave the chain — so every fire must ultimately succeed before we verify.
            for _ in range(20):
                try:
                    _post(port, "/gate/eval",
                          {"sprint_path": str(sprint_file),
                           "workdir": str(work), "state_dir": str(state)})
                    done.append(True)
                    return
                except (urllib.error.URLError, ConnectionError):
                    time.sleep(0.05)

        threads = [threading.Thread(target=fire) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert len(done) == 20, f"only {len(done)}/20 requests completed"

    ledger = state / "ledger.jsonl"
    assert ledger.exists()
    verify = ROOT / "benchmark" / "verify_ledger.py"
    proc = subprocess.run([sys.executable, str(verify), str(ledger)],
                          capture_output=True, text=True)
    assert proc.returncode == 0, (
        f"ledger failed to verify after concurrent appends:\n{proc.stdout}\n{proc.stderr}")
    assert "TAMPERED" not in (proc.stdout + proc.stderr), proc.stdout + proc.stderr


def _run_gate_cli(sprint_file, work, state):
    return subprocess.run([str(GATE), "eval", "--sprint", str(sprint_file),
                           "--workdir", str(work), "--state", str(state)],
                          capture_output=True, text=True)


def _normalize_ledger(path):
    """Ledger lines minus volatile fields (ts, and the chained hashes that depend on ts).

    `oracle` is dropped for the same reason: it is sha256 of the control's `cmd`, and this test's
    commands embed their own workdir (`test -f {work}/f1`), so the daemon run and the CLI run have
    genuinely different command text. Its PRESENCE is asserted separately by _assert_oracles_present
    so a driver that stopped recording the oracle is still caught here.
    """
    out = []
    for ln in Path(path).read_text().splitlines():
        if not ln.strip():
            continue
        e = json.loads(ln)
        for k in ("ts", "prev", "h", "oracle"):
            e.pop(k, None)
        out.append(e)
    return out


def _assert_oracles_present(path):
    """Every checklist-item entry must carry a full sha256 oracle (R5 — docs/control-plane.md §5)."""
    for ln in Path(path).read_text().splitlines():
        if not ln.strip():
            continue
        e = json.loads(ln)
        if e.get("event") == "checklist-item":
            assert len(e.get("oracle", "")) == 64, f"checklist-item without an oracle: {e}"


def test_daemon_ledger_matches_cli(tmp_path):
    """Same sequence of calls via the daemon and via the CLI ⇒ the same ledger (one gate, no drift)."""
    sprint_file = tmp_path / "sprint.json"

    # --- via the daemon ---
    d_work = tmp_path / "d_work"
    d_work.mkdir()
    d_state = tmp_path / "d_state"
    sprint_file.write_text(json.dumps(_sprint(d_work)))
    port = _free_port()
    with running_daemon(port):
        def ev():
            return _post(port, "/gate/eval",
                         {"sprint_path": str(sprint_file),
                          "workdir": str(d_work), "state_dir": str(d_state)})
        ev()                                  # fail wp1
        (d_work / "f1").write_text("x"); ev() # advance
        ev()                                  # fail wp2
        (d_work / "f2").write_text("x"); ev() # complete

    # --- via the CLI, identical sequence ---
    c_work = tmp_path / "c_work"
    c_work.mkdir()
    c_state = tmp_path / "c_state"
    sprint_file.write_text(json.dumps(_sprint(c_work)))
    _run_gate_cli(sprint_file, c_work, c_state)
    (c_work / "f1").write_text("x"); _run_gate_cli(sprint_file, c_work, c_state)
    _run_gate_cli(sprint_file, c_work, c_state)
    (c_work / "f2").write_text("x"); _run_gate_cli(sprint_file, c_work, c_state)

    _assert_oracles_present(d_state / "ledger.jsonl")
    _assert_oracles_present(c_state / "ledger.jsonl")
    d_led = _normalize_ledger(d_state / "ledger.jsonl")
    c_led = _normalize_ledger(c_state / "ledger.jsonl")
    # The `fails`/`reg` strings embed the workdir-derived nothing; events + verdicts must match exactly.
    assert d_led == c_led, f"daemon ledger drifted from CLI ledger\n{d_led}\n!=\n{c_led}"
