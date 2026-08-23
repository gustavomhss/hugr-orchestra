"""The judge's API path, against a fake Messages endpoint — measured, not assumed.

Every agent run in the campaign before this one stubbed the judge (`RELAY_JUDGE_STUB=pass`), so the
API path had exactly one test: it fails safe with no key. Pointing it at a local gateway to grade a
real review surfaced three defects in a row, and each one produced a FAIL that was indistinguishable
from a judgment about the artifact:

  1. the endpoint streamed by default, so the body parsed as "no verdict";
  2. a reasoning model spent the entire 512-token budget thinking and returned an EMPTY content list
     with stop_reason `max_tokens` — no verdict, no tool call, nothing;
  3. asking for a trailing `VERDICT: PASS` line produced it sometimes and not others for the SAME
     artifact and criterion, so the control's verdict moved with the model's mood.

The fixes are a forced tool call for the verdict, a generous `max_tokens` (a cap, not a spend), an
explicit `stream: false`, and — the part that matters for an audit — a `(no-verdict)` tag so a judge
that never answered can never be read as a judge that disagreed.
"""
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
JUDGE = ROOT / "benchmark" / "judge.py"


class _Handler(BaseHTTPRequestHandler):
    reply = {}          # set per test
    seen = {}           # last request body

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        _Handler.seen = json.loads(self.rfile.read(n) or b"{}")
        body = json.dumps(_Handler.reply).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):  # keep pytest output clean
        pass


@pytest.fixture()
def endpoint():
    srv = HTTPServer(("127.0.0.1", 0), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


def _judge(endpoint, criterion="crit", files=(), **env):
    e = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    e.pop("ANTHROPIC_API_KEY", None)
    e.update({"RELAY_JUDGE_BACKEND": "api", "RELAY_JUDGE_BASE_URL": endpoint,
              "RELAY_JUDGE_API_KEY": "local", "RELAY_JUDGE_MODEL": "test-model"})
    e.update({k: str(v) for k, v in env.items()})
    args = [sys.executable, str(JUDGE), "--criterion", criterion]
    for f in files:
        args += ["--file", str(f)]
    p = subprocess.run(args, capture_output=True, text=True, env=e)
    return json.loads(p.stdout)


def _tool_reply(verdict, reason="because"):
    return {"content": [{"type": "tool_use", "name": "submit_verdict",
                         "input": {"verdict": verdict, "reason": reason}}]}


def test_verdict_comes_from_the_forced_tool_call(endpoint):
    _Handler.reply = _tool_reply("pass", "the artifact satisfies it")
    r = _judge(endpoint)
    assert r["verdict"] == "pass"
    assert r["backend"] == "llm:test-model"
    assert r["reason"] == "the artifact satisfies it"


def test_the_request_forces_the_tool_and_does_not_stream(endpoint):
    """Both were real failures: a streamed body parses as no-verdict, and an unforced tool is a
    suggestion. Assert the wire format rather than trusting the reply we control."""
    _Handler.reply = _tool_reply("fail")
    _judge(endpoint)
    sent = _Handler.seen
    assert sent["stream"] is False
    assert sent["tool_choice"] == {"type": "tool", "name": "submit_verdict"}
    assert [t["name"] for t in sent["tools"]] == ["submit_verdict"]
    schema = sent["tools"][0]["input_schema"]["properties"]["verdict"]
    assert schema["enum"] == ["pass", "fail"]


def test_a_tool_call_with_a_bogus_verdict_does_not_pass(endpoint):
    _Handler.reply = {"content": [{"type": "tool_use", "name": "submit_verdict",
                                   "input": {"verdict": "maybe", "reason": "unsure"}}]}
    assert _judge(endpoint)["verdict"] == "fail"


def test_prose_verdict_still_works_where_tool_choice_is_ignored(endpoint):
    _Handler.reply = {"content": [{"type": "text", "text": "looks fine\nVERDICT: PASS"}]}
    r = _judge(endpoint)
    assert r["verdict"] == "pass" and r["backend"] == "llm:test-model"


def test_a_judge_that_never_answered_is_tagged_no_verdict(endpoint):
    """The one that matters for the ledger. This FAILS the control — an unproven control is a failed
    control — but it must never be recorded as a judgment about the artifact."""
    _Handler.reply = {"content": [{"type": "text", "text": "I was still thinking about it"}]}
    r = _judge(endpoint)
    assert r["verdict"] == "fail"
    assert r["backend"] == "llm:test-model(no-verdict)"
    assert "no VERDICT line" in r["reason"]


def test_an_empty_reply_is_no_verdict_not_a_judgment(endpoint):
    """Reproduced live: stop_reason `max_tokens` with an empty content list."""
    _Handler.reply = {"content": [], "stop_reason": "max_tokens"}
    r = _judge(endpoint)
    assert r["verdict"] == "fail" and r["backend"].endswith("(no-verdict)")


def test_the_backend_tag_names_the_model_that_graded(endpoint):
    """`judge:llm` on a ledger says an LLM said so. Which LLM is the first thing a reader asks, and
    the ledger is the only place that can still answer it a year later."""
    _Handler.reply = _tool_reply("pass")
    assert _judge(endpoint, RELAY_JUDGE_MODEL="some-other-model")["backend"] == "llm:some-other-model"


def test_max_tokens_is_generous_by_default_and_overridable(endpoint):
    _Handler.reply = _tool_reply("pass")
    _judge(endpoint)
    assert _Handler.seen["max_tokens"] >= 4096
    _judge(endpoint, RELAY_JUDGE_MAX_TOKENS=123)
    assert _Handler.seen["max_tokens"] == 123


def test_base_url_is_honoured_and_absent_key_still_fails_safe_on_anthropic():
    """No base URL and no key must stay a conservative failure — the pre-existing contract."""
    e = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    e.pop("ANTHROPIC_API_KEY", None)
    e["RELAY_JUDGE_BACKEND"] = "api"
    p = subprocess.run([sys.executable, str(JUDGE), "--criterion", "x"],
                       capture_output=True, text=True, env=e)
    r = json.loads(p.stdout)
    assert r["verdict"] == "fail" and "error" in r["backend"]
