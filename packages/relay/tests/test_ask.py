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
import hashlib
import importlib.util
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
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
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


@contextlib.contextmanager
def daemon(arms_dir, extra_env=None):
    port = _free_port()
    env = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    env.pop("ANTHROPIC_API_KEY", None)
    env.update(RELAY_ARMS_DIR=str(arms_dir), RELAY_JUDGE_BACKEND="stub")
    env.update(extra_env or {})
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
        else:
            raise RuntimeError("daemon did not become healthy in time")
        yield port
    finally:
        proc.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            proc.wait(timeout=5)
        if proc.poll() is None:
            proc.kill()


def _arm(tmp_path, failing=True, legacy=False):
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
    if not legacy:
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
    """Wait notes use the shared chain append contract and remain independently verifiable."""
    arms, work = _arm(tmp_path)
    with daemon(arms) as port:
        for n in range(3):
            _ask(port, f"q{n}")
    r = subprocess.run([sys.executable, str(ROOT / "benchmark" / "verify_ledger.py"),
                        str(arms / "tok" / "ledger.jsonl")], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def _set_check(arms, cmd):
    path = arms / "tok" / "sprint.json"
    sprint = json.loads(path.read_text())
    sprint["work_packages"][0]["checklist"][0]["cmd"] = cmd
    path.write_text(json.dumps(sprint))


@pytest.mark.parametrize("counter", ["0", "3"])
def test_position_survives_insertion_and_end_counter(tmp_path, counter):
    arms, work = _arm(tmp_path)
    arm = arms / "tok"
    sprint = json.loads((arm / "sprint.json").read_text())
    sprint["work_packages"].insert(0, {"id": "inserted", "checklist": [
        {"id": "inserted-pass", "cmd": "true"}]})
    (arm / "sprint.json").write_text(json.dumps(sprint))
    (arm / "counter").write_text(counter)
    (arm / "state").write_text("active")
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 200, body
    assert body["wp"] == "wp1" and body["failing"] == ["c1"], body
    assert (arm / "counter").read_text() == counter
    assert (arm / "position").read_text() == "wp1"


@pytest.mark.parametrize("exact", [True, False])
def test_position_exact_id_precedes_macro_suffix(tmp_path, exact):
    arms, work = _arm(tmp_path)
    arm = arms / "tok"
    packages = [{"id": "wp1", "checklist": [{"id": "suffix-pass", "cmd": "true"}]}]
    if exact:
        packages.append({"id": "macro.wp1", "checklist": [{"id": "exact-fail", "cmd": "false"}]})
    (arm / "sprint.json").write_text(json.dumps({"work_packages": packages}))
    (arm / "position").write_text("macro.wp1")
    with daemon(arms) as port:
        status, body = _ask(port)
    if exact:
        assert status == 200 and body["wp"] == "macro.wp1", body
        assert body["failing"] == ["exact-fail"], body
    else:
        assert status == 409 and "passing" in body["error"], body


@pytest.mark.parametrize("source, valid", [("state", True), ("meta", True), ("state", False)])
def test_position_base_ref_uses_actual_wp_id(tmp_path, source, valid):
    arms, work = _arm(tmp_path)
    arm = arms / "tok"
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT,
                          capture_output=True, text=True, check=True).stdout.strip()
    (arm / "meta.json").write_text(json.dumps({
        "workdir": str(ROOT), "base_ref": head if source == "meta" or not valid else "bad-meta-ref"}))
    (arm / "position").write_text("macro.wp/key")
    (arm / "sprint.json").write_text(json.dumps({"work_packages": [
        {"id": "wp/key", "checklist": [{"id": "wrong-suffix", "cmd": "false"}]},
        {"id": "macro.wp/key", "checklist": [{"id": "diff-check", "judge": "fixture",
                                              "blocking": True, "diff": True}]}]}))
    (arm / "base_ref").write_text("wrong-cli-ref")
    if source == "state":
        (arm / "base_macro.wp_key").write_text(head if valid else "bad-state-ref")
    with daemon(arms, {"RELAY_JUDGE_STUB": "pass"}) as port:
        status, body = _ask(port)
    if valid:
        assert status == 409 and "passing" in body["error"], body
    else:
        assert status == 200 and body["failing"] == ["diff-check"], body
    assert (arm / "base_ref").read_text() == "wrong-cli-ref"


def _named_check(arm, workdir, position, base_ref=""):
    env = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    env.pop("ANTHROPIC_API_KEY", None)
    env.update(RELAY_JUDGE_BACKEND="stub", RELAY_JUDGE_STUB="pass")
    proc = subprocess.run([str(ROOT / "bin" / "relay-gate"), "check",
                           "--sprint", str(arm / "sprint.json"), "--workdir", str(workdir),
                           "--state", str(arm), "--position", position, "--base-ref", base_ref],
                          capture_output=True, text=True, env=env)
    assert proc.stdout, proc.stderr
    return proc.returncode, json.loads(proc.stdout)


@pytest.mark.parametrize("position, wp_id, sibling", [
    pytest.param("target\n", "target\n", "target", id="trailing-lf"),
    pytest.param("target\r", "target\r", "target\n", id="raw-cr"),
    pytest.param("target\r\n", "target\r\n", "target", id="raw-crlf"),
    pytest.param("tar\r\nget\n", "tar\r\nget\n", "tar\nget", id="interior-crlf"),
    pytest.param("macro.target\n", "macro.target\n", "target\n", id="exact-before-suffix"),
    pytest.param("scope.target\n", "target\n", "scope.target", id="raw-suffix-before-legacy-exact"),
    pytest.param("scope.target\r\n", "target\r\n", "target", id="raw-crlf-suffix"),
    pytest.param(" \ttarget \t\n", " \ttarget \t\n", "target", id="edge-whitespace"),
    pytest.param("\n", "\n", "target", id="lf-only-id"),
])
@pytest.mark.parametrize("counter", ["0", "2"], ids=["stale", "end"])
def test_position_raw_identity_matches_named_cli(tmp_path, position, wp_id, sibling, counter):
    arms, work = _arm(tmp_path)
    arm = arms / "tok"
    (arm / "sprint.json").write_text(json.dumps({"work_packages": [
        {"id": sibling, "checklist": [{"id": "sibling-pass", "cmd": "true"}]},
        {"id": wp_id, "macro": "macro\r\n", "checklist": [{"id": "raw-fail", "cmd": "false"}]}]}))
    persisted = position.encode("utf-8")
    (arm / "position").write_bytes(persisted)
    (arm / "counter").write_text(counter)
    (arm / "state").write_text("active")
    code, passing = _named_check(arm, work, sibling)
    assert code == 0 and passing["wp"] == sibling and passing["failing"] == [], passing
    code, checked = _named_check(arm, work, position)
    assert code == 1, checked
    assert checked == {"outcome": "check", "i": 1, "wp": wp_id, "macro": "macro\r\n",
                       "failing": ["raw-fail"]}, checked
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 200 and body["outcome"] == "waiting", body
    assert body["wp"] == checked["wp"] and body["failing"] == checked["failing"], body
    notes = _events(arms, "ask")
    assert len(notes) == 1 and notes[0]["wp"] == wp_id and notes[0]["failing"] == "raw-fail", notes
    assert notes[0]["ticket"] == body["ticket"] and notes[0]["h"], notes
    assert (arm / "position").read_bytes() == persisted
    assert (arm / "counter").read_text() == counter


@pytest.mark.parametrize("position, wp_id, sibling", [
    pytest.param("target\n", "target", "other", id="legacy-exact"),
    pytest.param("scope.target\n", "target", "other", id="legacy-suffix"),
    pytest.param("target\n\n", "target", "other", id="legacy-multiple-lf"),
    pytest.param("macro.target\n", "macro.target", "target", id="legacy-exact-before-suffix"),
    pytest.param("scope.target\r\n\n", "target\r", "target", id="legacy-keeps-cr"),
])
def test_position_legacy_lf_fallback_only_after_raw_miss(tmp_path, position, wp_id, sibling):
    arms, work = _arm(tmp_path)
    arm = arms / "tok"
    (arm / "sprint.json").write_text(json.dumps({"work_packages": [
        {"id": sibling, "checklist": [{"id": "sibling-pass", "cmd": "true"}]},
        {"id": wp_id, "checklist": [{"id": "legacy-fail", "cmd": "false"}]}]}))
    persisted = position.encode("utf-8")
    (arm / "position").write_bytes(persisted)
    (arm / "counter").write_text("2")
    code, unresolved = _named_check(arm, work, position)
    assert code == 2 and unresolved == {"outcome": "error", "error": "unknown-position",
                                        "position": position}, unresolved
    code, checked = _named_check(arm, work, position.rstrip("\n"))
    assert code == 1 and checked["wp"] == wp_id and checked["failing"] == ["legacy-fail"], checked
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 200 and body["wp"] == checked["wp"] and body["failing"] == checked["failing"], body
    notes = _events(arms, "ask")
    assert len(notes) == 1 and notes[0]["wp"] == wp_id and notes[0]["failing"] == "legacy-fail", notes
    assert (arm / "position").read_bytes() == persisted
    assert (arm / "counter").read_text() == "2"


@pytest.mark.parametrize("position, wp_id, safe_key", [
    pytest.param("macro.tár/get\r\n", "macro.tár/get\r\n", "macro.t__r_get__", id="exact-base"),
    pytest.param("scope.tár/get\r\n", "tár/get\r\n", "t__r_get__", id="suffix-base"),
])
def test_position_raw_baseline_uses_selected_actual_wp(tmp_path, position, wp_id, safe_key):
    arms, work = _arm(tmp_path)
    arm = arms / "tok"
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT,
                          capture_output=True, text=True, check=True).stdout.strip()
    (arm / "meta.json").write_text(json.dumps({"workdir": str(ROOT), "base_ref": "bad-meta-ref"}))
    (arm / "sprint.json").write_text(json.dumps({"work_packages": [
        {"id": wp_id.rstrip("\r\n"), "checklist": [{"id": "sibling-pass", "cmd": "true"}]},
        {"id": wp_id, "checklist": [{"id": "raw-fail", "cmd": "false"},
                                    {"id": "baseline-diff", "judge": "fixture", "blocking": True,
                                     "diff": True, "paths": ["SPEC.md"]}]}]}))
    (arm / "position").write_bytes(position.encode("utf-8"))
    (arm / "counter").write_text("2")
    (arm / "base_ref").write_text("wrong-cli-ref")
    (arm / ("base_" + safe_key)).write_text(head)
    code, checked = _named_check(arm, ROOT, position, head)
    assert code == 1 and checked["wp"] == wp_id and checked["failing"] == ["raw-fail"], checked
    with daemon(arms, {"RELAY_JUDGE_STUB": "pass"}) as port:
        status, body = _ask(port)
    assert status == 200 and body["wp"] == checked["wp"] and body["failing"] == checked["failing"], body
    notes = _events(arms, "ask")
    assert len(notes) == 1 and notes[0]["wp"] == wp_id and notes[0]["failing"] == "raw-fail", notes
    assert (arm / "position").read_bytes() == position.encode("utf-8")
    assert (arm / "counter").read_text() == "2"
    assert (arm / "base_ref").read_text() == "wrong-cli-ref"
    assert (arm / ("base_" + safe_key)).read_text() == head


@pytest.mark.parametrize("persisted", [b"target\0", b"target\xff", b"target\r\n", b" target "])
def test_position_malformed_raw_data_is_500_not_false_passing(tmp_path, persisted):
    arms, work = _arm(tmp_path, failing=False)
    arm = arms / "tok"
    sprint = json.loads((arm / "sprint.json").read_text())
    sprint["work_packages"][0]["id"] = "target"
    (arm / "sprint.json").write_text(json.dumps(sprint))
    (arm / "position").write_bytes(persisted)
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 500 and body.get("detail"), body
    assert not (arm / "ask_total").exists()
    assert _events(arms) == []


@pytest.mark.parametrize("wp_id", [None, 17, "target\0"])
def test_position_nonstring_or_nul_plan_id_is_server_error(tmp_path, wp_id):
    arms, work = _arm(tmp_path, failing=False)
    arm = arms / "tok"
    sprint = json.loads((arm / "sprint.json").read_text())
    sprint["work_packages"][0]["id"] = wp_id
    (arm / "sprint.json").write_text(json.dumps(sprint))
    (arm / "position").write_bytes(b"target")
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 500 and body.get("detail"), body
    assert not (arm / "ask_total").exists()
    assert _events(arms) == []


def test_busy_check_is_503_with_diagnostics(tmp_path):
    arms, work = _arm(tmp_path, legacy=True)
    arm = arms / "tok"
    (arm / ".run.lock").mkdir()
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 503 and body["exit"] == 3, body
    assert "another evaluation holds" in body["detail"], body
    assert not (arm / "ask_total").exists()


@contextlib.contextmanager
def _invalid_transport_daemon(arms, monkeypatch, result):
    """Use real HTTP, replacing only the invalid CLI transport response under test."""
    spec = importlib.util.spec_from_file_location("ask_transport_daemon", DAEMON)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ARMS_DIR = str(arms)
    real_run = subprocess.run

    def run(args, **kwargs):
        if args[:2] == [str(ROOT / "bin" / "relay-gate"), "check"]:
            code, stdout, stderr = result
            return subprocess.CompletedProcess(args, code, stdout, stderr)
        return real_run(args, **kwargs)

    monkeypatch.setattr(module.subprocess, "run", run)
    server = module.make_server("127.0.0.1", 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.mark.parametrize("code, out, status", [
    (3, '{"outcome":"check","i":0,"wp":"wp1","failing":[]}', 503),
    (0, "", 500),
    (1, "not JSON", 500),
    (0, "[]", 500),
    (0, "{}", 500),
    (0, '{"outcome":"complete","i":2}', 500),
    (2, '{"outcome":"error","error":"unknown position"}', 500),
    (7, '{"outcome":"check","i":0,"wp":"wp1","failing":[]}', 500),
    (0, '{"outcome":"check","i":0,"wp":"wp1"}', 500),
    (0, '{"outcome":"check","i":0,"wp":"wp1","failing":"c1"}', 500),
    (0, '{"outcome":"check","i":0,"wp":"wp1","failing":["c1"]}', 500),
    (1, '{"outcome":"check","i":0,"wp":"wp1","failing":[]}', 500),
    (1, '{"outcome":"check","i":1,"wp":"wp2","failing":["c2"]}', 500),
])
def test_invalid_check_transport_never_reports_passing(tmp_path, monkeypatch, code, out, status):
    arms, work = _arm(tmp_path, legacy=True)
    with _invalid_transport_daemon(arms, monkeypatch, (code, out, "transport cause")) as port:
        actual, body = _ask(port)
    assert actual == status, body
    assert body["exit"] == code and "transport cause" in body["detail"], body
    if out:
        assert out in body["detail"], body
    assert not (arms / "tok" / "ask_total").exists()


@pytest.mark.parametrize("file, value", [
    ("meta.json", "not JSON"),
    ("meta.json", "[]"),
    ("meta.json", "{}"),
    ("meta.json", '{"workdir":17}'),
    ("meta.json", '{"workdir":"/relay-test-nonexistent-workdir"}'),
    ("sprint.json", "not JSON"),
    ("sprint.json", "[]"),
    ("sprint.json", '{"work_packages":{}}'),
    ("sprint.json", '{"work_packages":[]}'),
    ("sprint.json", '{"work_packages":[{"id":null}]}'),
    ("sprint.json", '{"work_packages":[{"id":"wp1","macro":[]}]}'),
    ("sprint.json", '{"work_packages":[{"id":"wp1","checklist":{}}]}'),
    ("sprint.json", '{"work_packages":[{"id":"wp1","checklist":[{"id":"c1","cmd":17}]}]}'),
    ("sprint.json", '{"work_packages":[{"id":"wp1","checklist":[{"id":"c1","judge":"x","blocking":"true"}]}]}'),
    ("sprint.json", '{"work_packages":[{"id":"wp1","checklist":[{"id":"c1","judge":"x","context":{}}]}]}'),
    ("position", ""),
    ("position", "removed-wp"),
    ("counter", "not-an-index"),
    ("counter", "2"),
])
def test_invalid_arm_inputs_are_server_errors(tmp_path, file, value):
    arms, work = _arm(tmp_path, legacy=file == "counter")
    arm = arms / "tok"
    (arm / file).write_text(value)
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 500 and body.get("detail"), body
    assert not (arm / "ask_total").exists()


def test_concurrent_same_ticket_uses_realpath_lock_and_parks_without_lost_pokes(tmp_path):
    arms, work = _arm(tmp_path, legacy=True)
    arm = arms / "tok"
    (arms / "alias").symlink_to(arm, target_is_directory=True)
    _set_check(arms, "sleep 0.2; test -f f1")
    barrier = threading.Barrier(4)
    with daemon(arms) as port:
        def ask(n):
            barrier.wait(timeout=5)
            return _ask(port, token="tok" if n % 2 else "alias")

        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(ask, range(4)))
    assert sorted(status for status, _ in results) == [200, 200, 200, 423], results
    waiting = [body for status, body in results if status == 200]
    assert sorted(body["poke"] for body in waiting) == [1, 2, 3], results
    tickets = {body["ticket"] for _, body in results}
    assert len(tickets) == 1, results
    assert (arm / "asks" / tickets.pop()).read_text() == "3"
    assert (arm / "ask_total").read_text() == "3"
    assert (arm / "state").read_text() == "awaiting-human"
    assert len(_events(arms, "ask")) == 3 and len(_events(arms, "ask-parked")) == 1
    verify = subprocess.run([sys.executable, str(ROOT / "benchmark" / "verify_ledger.py"),
                             str(arm / "ledger.jsonl")], capture_output=True, text=True)
    assert verify.returncode == 0, verify.stdout + verify.stderr


def test_answer_serializes_with_ask_before_ticket_creation(tmp_path):
    arms, work = _arm(tmp_path, legacy=True)
    _set_check(arms, "touch check-started; sleep 0.3; false")
    question = "provision now"
    ticket = hashlib.sha256(question.encode()).hexdigest()[:12]
    with daemon(arms) as port, ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(_ask, port, question)
        deadline = time.monotonic() + 5
        while not (work / "check-started").exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert (work / "check-started").exists(), "real checklist did not begin"
        status, body = _request(port, "POST", "/answer",
                                {"token": "tok", "ticket": ticket, "answer": "ready"})
        asked_status, asked = pending.result(timeout=10)
        delivered_status, delivered = _ask(port, question)
    assert asked_status == 200 and asked["outcome"] == "waiting", asked
    assert status == 200 and body["outcome"] == "recorded", body
    assert delivered_status == 200 and delivered["answer"] == "ready", delivered
    assert (arms / "tok" / "ask_total").read_text() == "1"


@pytest.mark.parametrize("kind", ["waiting", "cap", "fourth", "answered", "refused"])
def test_note_failure_is_route_error_before_state_or_counter_changes(tmp_path, kind):
    arms, work = _arm(tmp_path, legacy=True)
    arm = arms / "tok"
    question = "provision"
    ticket = hashlib.sha256(question.encode()).hexdigest()[:12]
    with daemon(arms) as port:
        if kind in ("fourth", "answered", "refused", "cap"):
            rounds = 3 if kind == "fourth" else 1
            for _ in range(rounds):
                assert _ask(port, question)[0] == 200
        if kind in ("answered", "refused"):
            assert _request(port, "POST", "/answer", {"token": "tok", "ticket": ticket,
                            "answer": "no" if kind == "refused" else "ready"})[0] == 200
        if kind == "cap":
            (arm / "ask_cap").write_text("1")
        before_total = (arm / "ask_total").read_text() if (arm / "ask_total").exists() else None
        before_poke = (arm / "asks" / ticket).read_text() if (arm / "asks" / ticket).exists() else None
        ledger = arm / "ledger.jsonl"
        if ledger.exists():
            ledger.unlink()
        ledger.mkdir()  # Real append failure, not a fabricated note result.
        status, body = _ask(port, question)
    assert status == 500 and body["error"] == "note error", body
    assert body["exit"] != 0 and "append failed" in body["detail"], body
    assert ((arm / "ask_total").read_text() if (arm / "ask_total").exists() else None) == before_total
    assert ((arm / "asks" / ticket).read_text() if (arm / "asks" / ticket).exists() else None) == before_poke
    assert not (arm / "state").exists()
    assert not (arm / "ask_breach_ts").exists()


def test_answer_unknown_valid_ticket_is_404_without_orphan_write(tmp_path):
    arms, work = _arm(tmp_path, legacy=True)
    with daemon(arms) as port:
        status, body = _request(port, "POST", "/answer",
                                {"token": "tok", "ticket": "0123456789ab", "answer": "ready"})
    assert status == 404 and "ticket" in body["error"], body
    assert not (arms / "tok" / "answers").exists()


@pytest.mark.parametrize("route, field, value", [
    ("ask", "token", []), ("ask", "token", 1), ("ask", "token", ""),
    ("ask", "question", []), ("ask", "question", {}), ("ask", "question", 1),
    ("ask", "question", "  "),
    ("answer", "token", []), ("answer", "ticket", 123456789012),
    ("answer", "ticket", []), ("answer", "answer", None),
    ("answer", "answer", {}), ("answer", "answer", 1), ("answer", "answer", "  "),
])
def test_wait_payload_field_types_are_structured_400(tmp_path, route, field, value):
    arms, work = _arm(tmp_path, legacy=True)
    payload = {"token": "tok", "question": "provision", "ticket": "0123456789ab", "answer": "ready"}
    payload[field] = value
    with daemon(arms) as port:
        status, body = _request(port, "POST", "/" + route, payload)
        assert _request(port, "GET", "/healthz")[0] == 200
    assert status == 400 and body.get("error"), body


def test_legacy_answer_delivery_is_repeatable_without_charging_pokes(tmp_path):
    arms, work = _arm(tmp_path, legacy=True)
    with daemon(arms) as port:
        status, first = _ask(port)
        assert status == 200 and first["outcome"] == "waiting", first
        status, body = _request(port, "POST", "/answer", {
            "token": "tok", "ticket": first["ticket"], "answer": "ready"})
        assert status == 200 and body["outcome"] == "recorded", body
        for _ in range(2):
            status, body = _ask(port)
            assert status == 200 and body["outcome"] == "answered" and body["answer"] == "ready", body
    arm = arms / "tok"
    assert (arm / "ask_total").read_text() == "1"
    assert (arm / "asks" / first["ticket"]).read_text() == "1"
    assert len(_events(arms, "ask-answered")) == 2


def test_legacy_refusal_parks_once_and_stays_parked(tmp_path):
    arms, work = _arm(tmp_path, legacy=True)
    with daemon(arms) as port:
        status, first = _ask(port)
        assert status == 200, first
        status, body = _request(port, "POST", "/answer", {
            "token": "tok", "ticket": first["ticket"], "answer": "no"})
        assert status == 200, body
        for _ in range(2):
            status, body = _ask(port)
            assert status == 423 and body["outcome"] == "parked", body
    assert (arms / "tok" / "ask_total").read_text() == "1"
    assert len(_events(arms, "ask-parked")) == 1


def test_legacy_passing_check_refuses_without_creating_ticket(tmp_path):
    arms, work = _arm(tmp_path, failing=False, legacy=True)
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 409 and "passing" in body["error"], body
    assert not (arms / "tok" / "asks").exists()


@pytest.mark.parametrize("decision, deadline, expected", [
    (None, 900, 200), ("continue", 0, 200), ("stop", 900, 423),
    ("park", 900, 423), (None, 0, 423),
])
def test_legacy_cap_and_caller_driven_deadline_stay_stable(tmp_path, decision, deadline, expected):
    arms, work = _arm(tmp_path, legacy=True)
    arm = arms / "tok"
    (arm / "ask_cap").write_text("1")
    (arm / "ask_deadline").write_text(str(deadline))
    if decision is not None:
        (arm / "orchestrator.json").write_text(json.dumps({"decision": decision}))
    with daemon(arms) as port:
        assert _ask(port, "q1")[0] == 200
        status, body = _ask(port, "q2")
        assert status == expected, body
        if expected == 200:
            assert body["cap_breached"] is True, body
            assert _ask(port, "q3")[0] == 200
    breaches = _events(arms, "ask-cap-breach")
    assert len(breaches) == 1 and breaches[0]["failing"] == "c1", breaches
    assert "q2" not in json.dumps(breaches), breaches
    assert (arm / "ask_total").read_text() == ("3" if expected == 200 else "2")


def test_legacy_deadline_is_checked_on_next_ask(tmp_path):
    arms, work = _arm(tmp_path, legacy=True)
    arm = arms / "tok"
    (arm / "ask_cap").write_text("1")
    with daemon(arms) as port:
        assert _ask(port, "q1")[0] == 200
        assert _ask(port, "q2")[0] == 200
        (arm / "ask_breach_ts").write_text("0")
        assert not (arm / "state").exists(), "deadline is caller-driven, not a background timer"
        status, body = _ask(port, "q3")
    assert status == 423 and "did not answer in time" in body["reason"], body


@pytest.mark.parametrize("state", ["complete", "awaiting-human", "escalated"])
def test_parked_and_complete_arms_do_not_run_check(tmp_path, state):
    arms, work = _arm(tmp_path)
    (arms / "tok" / "state").write_text(state)
    (arms / "tok" / "meta.json").write_text("malformed")
    with daemon(arms) as port:
        status, body = _ask(port)
    assert status == 423 and state in body["reason"], body
