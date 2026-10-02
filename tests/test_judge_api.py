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
    replies = None      # or a list, consumed one per request — used to model a flapping judge
    seen = {}           # last request body
    calls = 0
    status = 200

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        _Handler.seen = json.loads(self.rfile.read(n) or b"{}")
        if _Handler.replies:
            reply = _Handler.replies[min(_Handler.calls, len(_Handler.replies) - 1)]
        else:
            reply = _Handler.reply
        _Handler.calls += 1
        body = json.dumps(reply).encode()
        self.send_response(_Handler.status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):  # keep pytest output clean
        pass


@pytest.fixture()
def endpoint():
    _Handler.reply = {}
    _Handler.replies = None
    _Handler.seen = {}
    _Handler.calls = 0
    _Handler.status = 200
    srv = HTTPServer(("127.0.0.1", 0), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()
    srv.server_close()


def _judge(endpoint, criterion="crit", files=(), **env):
    e = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    e.pop("ANTHROPIC_API_KEY", None)
    e.update({"RELAY_JUDGE_BACKEND": "api", "RELAY_JUDGE_BASE_URL": endpoint,
              "RELAY_JUDGE_API_KEY": "local", "RELAY_JUDGE_MODEL": "test-model"})
    e.update({k: str(v) for k, v in env.items()})
    args = [sys.executable, str(JUDGE), "--criterion", criterion]
    for f in files:
        args += ["--file", str(f)]
    p = subprocess.run(args, capture_output=True, text=True, env=e, timeout=10)
    assert p.returncode == 0, p.stdout + p.stderr
    assert not p.stderr, p.stderr
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


def test_a_cut_artifact_is_announced_to_the_model_and_to_the_ledger(endpoint, tmp_path):
    """Silent truncation is the third way a FAIL came from transport rather than from the artifact.

    Measured on the `spec-decompose` live run: a 24k-character diff met a 16k cap, the judge was shown
    two thirds of the change it was asked about, and it failed a review for claims the visible part
    did not support. The artifact was right.

    So a cut is announced twice — in the prompt, so the model can say the evidence is incomplete, and
    in the backend tag, so a verdict on a partial artifact is never read as a verdict on the artifact.
    """
    big = tmp_path / "big.diff"
    big.write_text("x" * 5000)
    _Handler.reply = _tool_reply("pass")
    r = _judge(endpoint, files=[big], RELAY_JUDGE_MAX_CTX=1000)
    assert r["backend"] == "llm:test-model(truncated:big.diff)"
    sent = "".join(b.get("text", "") for b in [{"text": _Handler.seen["messages"][0]["content"]}])
    assert "[TRUNCATED at 1000 characters" in sent
    assert "big.diff was NOT shown to you" in sent

    r = _judge(endpoint, files=[big], RELAY_JUDGE_MAX_CTX=100000)
    assert r["backend"] == "llm:test-model", "an artifact that fits must not be tagged"


def test_truncation_is_recorded_even_when_the_model_answers_in_prose(endpoint, tmp_path):
    big = tmp_path / "big.diff"
    big.write_text("y" * 5000)
    _Handler.reply = {"content": [{"type": "text", "text": "VERDICT: FAIL"}]}
    assert _judge(endpoint, files=[big], RELAY_JUDGE_MAX_CTX=1000)["backend"] == \
        "llm:test-model(truncated:big.diff)"


def test_the_default_context_cap_is_generous(endpoint, tmp_path):
    """16000 characters is under one page of a real diff. The measured failure was a conservative cap,
    not an extravagant one."""
    from importlib.machinery import SourceFileLoader
    from importlib.util import module_from_spec, spec_from_loader
    ldr = SourceFileLoader("judgemod", str(JUDGE))
    mod = module_from_spec(spec_from_loader("judgemod", ldr))
    ldr.exec_module(mod)
    assert mod.MAX_CTX >= 100000


# ---------- sampling a noisy control ------------------------------------------------------------
# Measured on a live run: the same model, the same criterion and the same artifact returned pass and
# fail on repeat. A control that flips on identical input is not fit to block a chain on one draw —
# and the answer is to SAMPLE it, not to weaken the criterion or to demote the control to advisory.


def test_a_flapping_judge_is_decided_by_majority(endpoint):
    _Handler.replies = [_tool_reply("pass"), _tool_reply("fail"), _tool_reply("pass")]
    r = _judge(endpoint, RELAY_JUDGE_VOTES=3)
    assert r["verdict"] == "pass"
    assert r["backend"] == "llm:test-model(votes:2/3)"
    assert r["reason"].startswith("2/3 passed")
    assert _Handler.calls == 3


def test_the_minority_does_not_win(endpoint):
    _Handler.replies = [_tool_reply("fail"), _tool_reply("pass"), _tool_reply("fail")]
    r = _judge(endpoint, RELAY_JUDGE_VOTES=3)
    assert r["verdict"] == "fail" and r["backend"] == "llm:test-model(votes:1/3)"


def test_a_tie_fails(endpoint):
    """An unproven control is a failed control — the same rule the rest of the gate applies."""
    _Handler.replies = [_tool_reply("pass"), _tool_reply("fail")]
    r = _judge(endpoint, RELAY_JUDGE_VOTES=2)
    assert r["verdict"] == "fail" and r["backend"] == "llm:test-model(votes:1/2)"


def test_the_tally_reaches_the_ledger(endpoint):
    """A unanimous call and a 2-1 call are different facts about the same verdict, and the ledger is
    the only place that can still tell them apart later."""
    _Handler.replies = [_tool_reply("pass")] * 3
    assert _judge(endpoint, RELAY_JUDGE_VOTES=3)["backend"] == "llm:test-model(votes:3/3)"


def test_a_transport_failure_is_not_a_vote(endpoint):
    """A flaky network must never outvote the artifact. One api-error aborts the ballot and is
    reported as itself — the same separation the (no-verdict) and (truncated:) tags make."""
    _Handler.replies = [_tool_reply("pass"), {"content": []}, _tool_reply("pass")]
    r = _judge(endpoint, RELAY_JUDGE_VOTES=3)
    assert r["backend"].endswith("(no-verdict)") and r["verdict"] == "fail"


def test_one_vote_is_the_default_and_costs_one_call(endpoint):
    """Sampling is opt-in: three calls per control is a real cost, and a profile that does not need it
    should not pay it."""
    _Handler.replies = [_tool_reply("pass")]
    r = _judge(endpoint)
    assert r["backend"] == "llm:test-model" and "votes" not in r["backend"]
    assert _Handler.calls == 1


def test_empty_reply_with_truncated_context_aborts_before_later_passes(endpoint, tmp_path):
    big = tmp_path / "big.diff"
    big.write_text("x" * 5000)
    _Handler.replies = [{"content": [], "stop_reason": "max_tokens"},
                        _tool_reply("pass"), _tool_reply("pass")]
    r = _judge(endpoint, files=[big], RELAY_JUDGE_MAX_CTX=1000, RELAY_JUDGE_VOTES=3)
    assert r["verdict"] == "fail"
    assert r["backend"] == "llm:test-model(no-verdict)(truncated:big.diff)"
    assert "no VERDICT line" in r["reason"]
    assert _Handler.calls == 1


@pytest.mark.parametrize("filename", ["big.diff", "big(no-verdict).diff"])
def test_valid_majority_keeps_model_tally_and_truncation(endpoint, tmp_path, filename):
    big = tmp_path / filename
    big.write_text("x" * 5000)
    _Handler.replies = [_tool_reply("pass", "first accepted judgment"),
                        _tool_reply("fail"), _tool_reply("pass")]
    r = _judge(endpoint, files=[big], RELAY_JUDGE_MAX_CTX=1000, RELAY_JUDGE_VOTES=3)
    assert r["verdict"] == "pass"
    assert r["backend"] == f"llm:test-model(votes:2/3)(truncated:{filename})"
    assert r["reason"] == "2/3 passed · first accepted judgment"
    assert _Handler.calls == 3


@pytest.mark.parametrize("line", [
    "VERDICT: FAIL (previous PASS was incorrect)",
    "VERDICT: PASS or FAIL",
    "VERDICT: NOTPASS",
    "VERDICT: UNKNOWN",
    "Result: VERDICT: PASS",
    "VERDICT: PASS\nVERDICT: FAIL (previous PASS was incorrect)",
])
def test_ambiguous_prose_is_unavailable_not_a_vote(endpoint, line):
    _Handler.replies = [{"content": [{"type": "text", "text": line}]},
                        _tool_reply("pass"), _tool_reply("pass")]
    r = _judge(endpoint, RELAY_JUDGE_VOTES=3)
    assert r["verdict"] == "fail"
    assert r["backend"] == "llm:test-model(no-verdict)"
    assert _Handler.calls == 1


@pytest.mark.parametrize("verdict", ["pass", "fail"])
def test_exact_prose_verdict_accepts_only_case_and_outer_whitespace_normalization(endpoint, verdict):
    _Handler.reply = {"content": [{"type": "text", "text":
                                   f"Explanation mentions PASS.\n \tVeRdIcT: {verdict}\t \n"}]}
    r = _judge(endpoint)
    assert r["verdict"] == verdict
    assert r["backend"] == "llm:test-model"
    assert _Handler.calls == 1


@pytest.mark.parametrize("verdict,prose", [("pass", "FAIL"), ("fail", "PASS")])
def test_forced_tool_verdict_takes_priority_over_conflicting_prose(endpoint, verdict, prose):
    _Handler.reply = _tool_reply(verdict, "tool judgment")
    _Handler.reply["content"].insert(0, {"type": "text", "text": f"VERDICT: {prose}"})
    r = _judge(endpoint)
    assert r == {"verdict": verdict, "reason": "tool judgment", "backend": "llm:test-model",
                 "available": True}


@pytest.mark.parametrize("tool_input", [
    ["pass"], "pass", 1, None, {},
    {"verdict": ["pass"], "reason": "bad verdict type"},
    {"verdict": "pass", "reason": ["bad reason type"]},
    {"verdict": "pass"},
])
def test_malformed_tool_input_returns_error_json_and_aborts_votes(endpoint, tmp_path, tool_input):
    big = tmp_path / "big.diff"
    big.write_text("x" * 5000)
    _Handler.replies = [{"content": [
        {"type": "text", "text": "VERDICT: PASS"},
        {"type": "tool_use", "name": "submit_verdict", "input": tool_input},
    ]}, _tool_reply("pass"), _tool_reply("pass")]
    r = _judge(endpoint, files=[big], RELAY_JUDGE_MAX_CTX=1000, RELAY_JUDGE_VOTES=3)
    assert r["verdict"] == "fail"
    assert r["backend"] == "api-error:test-model(truncated:big.diff)"
    assert "api error:" in r["reason"]
    assert _Handler.calls == 1


@pytest.mark.parametrize("reply", [
    None, [], {"content": None}, {"content": {}}, {"content": [None]},
    {"content": [{"type": "text", "text": None}]},
])
def test_malformed_response_returns_error_json_and_aborts_votes(endpoint, reply):
    _Handler.replies = [reply, _tool_reply("pass"), _tool_reply("pass")]
    r = _judge(endpoint, RELAY_JUDGE_VOTES=3)
    assert r["verdict"] == "fail"
    assert r["backend"] == "api-error:test-model"
    assert "api error:" in r["reason"]
    assert _Handler.calls == 1


def test_http_error_preserves_transport_model_and_truncation(endpoint, tmp_path):
    big = tmp_path / "big.diff"
    big.write_text("x" * 5000)
    _Handler.status = 503
    _Handler.replies = [_tool_reply("pass")] * 3
    r = _judge(endpoint, files=[big], RELAY_JUDGE_MAX_CTX=1000, RELAY_JUDGE_VOTES=3)
    assert r["verdict"] == "fail"
    assert r["backend"] == "api-error:test-model(truncated:big.diff)"
    assert "HTTP Error 503" in r["reason"]
    assert _Handler.calls == 1


_MARKER_MODELS = [
    "alias(truncated:shadow)",
    "alias(no-verdict)",
    "alias(extra)",
    "alias(truncated:shadow(no-verdict))",
    "alias(no-verdict)(truncated:shadow)",
    "alias(api-error)(cli-error)(votes:0/3)",
]


@pytest.mark.parametrize("model", _MARKER_MODELS)
@pytest.mark.parametrize("prose", [False, True], ids=["tool", "prose"])
def test_model_alias_markers_preserve_valid_votes_and_exact_identity(endpoint, tmp_path, model, prose):
    artifact = tmp_path / "large(no-verdict)(truncated:shadow(votes:9)).diff"
    artifact.write_text("x" * 5000)
    reply = ({"content": [{"type": "text", "text": "VERDICT: PASS"}]} if prose
             else _tool_reply("pass"))
    _Handler.replies = [reply] * 3
    r = _judge(endpoint, files=[artifact], RELAY_JUDGE_MODEL=model,
               RELAY_JUDGE_MAX_CTX=1000, RELAY_JUDGE_VOTES=3)
    assert r["verdict"] == "pass"
    assert r["available"] is True
    assert r["backend"] == f"llm:{model}(votes:3/3)(truncated:{artifact.name})"
    assert r["reason"].startswith("3/3 passed")
    assert _Handler.calls == 3
    assert _Handler.seen["model"] == model


@pytest.mark.parametrize("model", _MARKER_MODELS)
def test_model_alias_markers_cannot_hide_empty_reply_unavailability(endpoint, tmp_path, model):
    artifact = tmp_path / "large(no-verdict)(truncated:shadow(votes:9)).diff"
    artifact.write_text("x" * 5000)
    _Handler.replies = [{"content": [], "stop_reason": "max_tokens"},
                        _tool_reply("pass"), _tool_reply("pass")]
    r = _judge(endpoint, files=[artifact], RELAY_JUDGE_MODEL=model,
               RELAY_JUDGE_MAX_CTX=1000, RELAY_JUDGE_VOTES=3)
    assert r["verdict"] == "fail"
    assert r["available"] is False
    assert r["backend"] == f"llm:{model}(no-verdict)(truncated:{artifact.name})"
    assert "no VERDICT line" in r["reason"]
    assert _Handler.calls == 1
