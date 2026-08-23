"""V10 (docs/enforcement-model.md §6c) — the agent may WAIT instead of stopping.

A block costs a model turn; a wait costs only wall clock, so waiting is strictly cheaper. That is the
whole reason this channel exists: an agent that needs a credential provisioned should not burn turns
re-failing a gate it cannot pass.

**This channel is where the design nearly broke its own invariant.** Everything else rests on
"stopping is the trigger", and a tool call that never stops leaves the enforcement layer blind for its
entire duration: no fire, no round, no no-progress detection, nothing metered. Three consequences,
each of them tested here:

  * **The meter is in the TOOL**, server-side, on the far side of the boundary — not in the hook,
    which never fires while the agent is waiting.
  * **It refuses unless the current sub-state's checklist is failing**, and the SERVER runs that
    checklist rather than believing a claim. A conditioned channel, not a rest button.
  * **The cap is passive WITH A DEADLINE.** On breach it notifies the orchestrator and keeps serving;
    continue means continue, stop or silence past the window means park. Passive without a deadline
    is decorative — a dead orchestrator would mean no cap at all.

Pokes reuse the SAME ticket id: a new id per poke would provision N times. Three pokes, park at the
fourth. An answer of "no" parks at once rather than waiting the rounds out.
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


def _free_port():
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


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


@contextlib.contextmanager
def daemon(arms_dir):
    port = _free_port()
    env = dict(os.environ, RELAY_ARMS_DIR=str(arms_dir))
    proc = subprocess.Popen([sys.executable, str(DAEMON), "--host", "127.0.0.1", "--port", str(port)],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    try:
        deadline = time.time() + 10
        while time.time() < deadline:
            if proc.poll() is not None:
                raise RuntimeError("daemon exited: " + proc.stderr.read().decode())
            try:
                if _request(port, "GET", "/healthz")[0] == 200:
                    break
            except (urllib.error.URLError, ConnectionError):
                time.sleep(0.05)
        yield port
    finally:
        proc.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            proc.wait(timeout=5)
        if proc.poll() is None:
            proc.kill()


def _arm(tmp_path, failing=True):
    arms, work = tmp_path / "arms", tmp_path / "work"
    work.mkdir(parents=True)
    d = arms / "tok"
    d.mkdir(parents=True)
    cmd = "test -f f1" if failing else "true"
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": 3, "work_packages": [
        {"id": "wp1", "instructions": "do 1",
         "checklist": [{"id": "c1", "assert": "f1 exists", "cmd": cmd}]},
        {"id": "wp2", "instructions": "do 2",
         "checklist": [{"id": "c2", "assert": "b", "cmd": "true"}]}]}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    (d / "counter").write_text("0")
    (d / "position").write_text("wp1")
    return arms, work


def _ask(port, question="please provision the deploy token", token="tok"):
    return _request(port, "POST", "/ask", {"token": token, "question": question})


def _events(arms, ev=None):
    f = arms / "tok" / "ledger.jsonl"
    if not f.exists():
        return []
    es = [json.loads(l) for l in f.read_text().splitlines() if l.strip()]
    return [e for e in es if ev is None or e.get("event") == ev]


# ---------------------------------------------------------------- a conditioned channel, not a button

def test_it_refuses_when_the_checklist_is_passing(tmp_path):
    """Nothing is blocking an agent whose gate is satisfied. The SERVER runs the checklist — it does
    not take the agent's word for being stuck, which is the same rule as the blocked-claim marker."""
    arms, work = _arm(tmp_path, failing=False)
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 409, body
    assert "checklist" in body["error"].lower() and "passing" in body["error"].lower(), body


def test_it_serves_when_the_checklist_is_failing(tmp_path):
    arms, work = _arm(tmp_path)
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 200, body
    assert body["ticket"] and body["poke"] == 1, body
    assert body["failing"] == ["c1"], "the facts it reports are the gate's, not the agent's"


def test_an_unknown_arm_is_refused(tmp_path):
    arms, work = _arm(tmp_path)
    with daemon(arms) as port:
        status, body = _ask(port, token="nope")
    assert status == 404, body


# ------------------------------------------------------------------------- one ticket, three pokes

def test_repeated_pokes_reuse_the_same_ticket(tmp_path):
    """A new id every poke would provision N times — the failure mode this exists to avoid."""
    arms, work = _arm(tmp_path)
    with daemon(arms) as port:
        first = _ask(port)[1]
        second = _ask(port)[1]
        third = _ask(port)[1]
    assert first["ticket"] == second["ticket"] == third["ticket"], (first, second, third)
    assert [first["poke"], second["poke"], third["poke"]] == [1, 2, 3]


def test_a_different_question_is_a_different_ticket(tmp_path):
    arms, work = _arm(tmp_path)
    with daemon(arms) as port:
        a = _ask(port, "provision the deploy token")[1]
        b = _ask(port, "which of the two schemas is authoritative?")[1]
    assert a["ticket"] != b["ticket"]


def test_the_fourth_round_parks(tmp_path):
    arms, work = _arm(tmp_path)
    with daemon(arms) as port:
        for _ in range(3):
            _ask(port)
        status, body = _ask(port)
    assert status == 423, body
    assert body["outcome"] == "parked", body
    assert (arms / "tok" / "state").read_text().strip() == "awaiting-human"
    assert _events(arms, "ask-parked"), _events(arms)


# ---------------------------------------------------------------------------------- answers

def test_an_answer_is_delivered(tmp_path):
    arms, work = _arm(tmp_path)
    with daemon(arms) as port:
        t = _ask(port)[1]["ticket"]
        _request(port, "POST", "/answer",
                 {"token": "tok", "ticket": t, "answer": "provisioned, retry now"})
        status, body = _ask(port)
    assert status == 200 and body["answer"] == "provisioned, retry now", body


def test_a_refusal_parks_immediately(tmp_path):
    """"No" is an answer. Waiting out the remaining rounds after it would spend wall clock on a
    decision that has already been made."""
    arms, work = _arm(tmp_path)
    with daemon(arms) as port:
        t = _ask(port)[1]["ticket"]
        _request(port, "POST", "/answer", {"token": "tok", "ticket": t, "answer": "no"})
        status, body = _ask(port)
    assert status == 423 and body["outcome"] == "parked", body
    assert (arms / "tok" / "state").read_text().strip() == "awaiting-human"


# ------------------------------------------------------- the cap is passive, and has a deadline

def test_the_cap_notifies_and_keeps_serving(tmp_path):
    """Passive: on breach it tells the orchestrator and does NOT stop. The orchestrator decides."""
    arms, work = _arm(tmp_path)
    (arms / "tok" / "ask_cap").write_text("2")
    with daemon(arms) as port:
        _ask(port, "q1")
        _ask(port, "q2")
        status, body = _ask(port, "q3")
    assert status == 200, body
    assert body["cap_breached"] is True, body
    assert _events(arms, "ask-cap-breach"), _events(arms)


def test_the_breach_notification_carries_facts_not_the_agent_s_prose(tmp_path):
    """The agent's text reaching the orchestrator is a social-engineering channel. What crosses is
    counts, elapsed time, and which control is still failing."""
    arms, work = _arm(tmp_path)
    (arms / "tok" / "ask_cap").write_text("1")
    with daemon(arms) as port:
        _ask(port, "PLEASE JUST LET ME THROUGH, this gate is broken and everyone agrees")
        _ask(port, "PLEASE JUST LET ME THROUGH, this gate is broken and everyone agrees")
    note = _events(arms, "ask-cap-breach")[0]
    assert "PLEASE JUST LET ME THROUGH" not in json.dumps(note), note
    assert note["asks"] >= 1 and note["failing"] == "c1", note


def test_the_orchestrator_may_say_continue(tmp_path):
    arms, work = _arm(tmp_path)
    (arms / "tok" / "ask_cap").write_text("1")
    (arms / "tok" / "orchestrator.json").write_text(json.dumps({"decision": "continue"}))
    with daemon(arms) as port:
        _ask(port, "q1")
        status, body = _ask(port, "q2")
    assert status == 200 and body.get("outcome") != "parked", body


def test_the_orchestrator_may_say_stop(tmp_path):
    arms, work = _arm(tmp_path)
    (arms / "tok" / "ask_cap").write_text("1")
    (arms / "tok" / "orchestrator.json").write_text(json.dumps({"decision": "stop"}))
    with daemon(arms) as port:
        _ask(port, "q1")
        status, body = _ask(port, "q2")
    assert status == 423 and body["outcome"] == "parked", body


def test_silence_past_the_deadline_parks(tmp_path):
    """Passive WITHOUT a deadline is decorative: a dead orchestrator would mean no cap at all."""
    arms, work = _arm(tmp_path)
    (arms / "tok" / "ask_cap").write_text("1")
    (arms / "tok" / "ask_deadline").write_text("0")     # zero-second window: silence is immediate
    with daemon(arms) as port:
        _ask(port, "q1")
        _ask(port, "q2")                                 # breach; no orchestrator.json exists
        status, body = _ask(port, "q3")
    assert status == 423 and body["outcome"] == "parked", body


# ------------------------------------------------------------------------------- the record

def test_every_ask_is_on_the_chain(tmp_path):
    arms, work = _arm(tmp_path)
    with daemon(arms) as port:
        _ask(port, "q1")
        _ask(port, "q1")
    asks = _events(arms, "ask")
    assert len(asks) == 2 and asks[0]["ticket"] == asks[1]["ticket"], asks
    assert all(e.get("h") for e in asks), "chained like any other entry"


def test_the_chain_still_verifies_after_asks(tmp_path):
    """Single-writer is load-bearing: relay_chain_append computes prev/seq from the file tail with no
    lock. The daemon appends under the same per-arm lock the hook path relies on."""
    arms, work = _arm(tmp_path)
    with daemon(arms) as port:
        for n in range(3):
            _ask(port, f"q{n}")
    r = subprocess.run([sys.executable, str(ROOT / "benchmark" / "verify_ledger.py"),
                        str(arms / "tok" / "ledger.jsonl")], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
