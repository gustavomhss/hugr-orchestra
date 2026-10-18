"""Exercise the real CLI judge and sampling against controlled subprocess replies."""
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
JUDGE = ROOT / "benchmark" / "judge.py"


@pytest.fixture()
def judge(monkeypatch):
    for name in os.environ:
        if name.startswith("RELAY_"):
            monkeypatch.delenv(name)
    monkeypatch.setenv("RELAY_JUDGE_MODEL", "test-model")
    monkeypatch.setenv("RELAY_JUDGE_MAX_CTX", "1000")
    monkeypatch.setenv("RELAY_JUDGE_VOTES", "3")
    spec = importlib.util.spec_from_file_location("judge_cli_test", JUDGE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def big(tmp_path):
    artifact = tmp_path / "big.diff"
    artifact.write_text("x" * 5000)
    return artifact


def _fake_cli(monkeypatch, replies):
    calls = []

    def run(args, **kwargs):
        reply = replies[min(len(calls), len(replies) - 1)]
        calls.append((args, kwargs))
        if isinstance(reply, Exception):
            raise reply
        return subprocess.CompletedProcess(args, **reply)

    monkeypatch.setattr(subprocess, "run", run)
    return calls


def _reply(text="VERDICT: PASS", returncode=0, stderr=""):
    return {"returncode": returncode, "stdout": text, "stderr": stderr}


def test_empty_reply_with_truncated_context_aborts_before_later_passes(judge, monkeypatch, big):
    calls = _fake_cli(monkeypatch, [_reply(""), _reply(), _reply()])
    verdict, reason, tag = judge.judge_cli("criterion", [big])
    assert verdict == "fail"
    assert tag == "cli:test-model(no-verdict)(truncated:big.diff)"
    assert "no VERDICT line" in reason
    assert len(calls) == 1
    args, kwargs = calls[0]
    assert args[0:2] == ["claude", "-p"]
    assert "criterion" in args[2] and "[TRUNCATED at 1000 characters" in args[2]
    assert args[3:] == ["--model", "test-model", "--append-system-prompt", judge.SYSTEM]
    assert kwargs == {"capture_output": True, "text": True, "timeout": 300}


@pytest.mark.parametrize("error,reason_fragment", [
    (_reply("VERDICT: PASS", returncode=7, stderr="auth unavailable"), "cli exit 7: auth unavailable"),
    (subprocess.TimeoutExpired("claude", 300), "cli error:"),
    (FileNotFoundError("fake CLI missing"), "fake CLI missing"),
])
def test_cli_transport_errors_abort_and_preserve_model_and_truncation(
        judge, monkeypatch, big, error, reason_fragment):
    calls = _fake_cli(monkeypatch, [error, _reply(), _reply()])
    verdict, reason, tag = judge.judge_cli("criterion", [big])
    assert verdict == "fail"
    assert tag == "cli-error:test-model(truncated:big.diff)"
    assert reason_fragment in reason
    assert len(calls) == 1


def test_unavailable_second_sample_discards_earlier_vote(judge, monkeypatch, big):
    calls = _fake_cli(monkeypatch, [_reply(), _reply("still thinking"), _reply()])
    verdict, reason, tag = judge.judge_cli("criterion", [big])
    assert verdict == "fail"
    assert tag == "cli:test-model(no-verdict)(truncated:big.diff)"
    assert "no VERDICT line" in reason
    assert len(calls) == 2


@pytest.mark.parametrize("line", [
    "VERDICT: FAIL (previous PASS was incorrect)",
    "VERDICT: PASS or FAIL",
    "VERDICT: NOTPASS",
    "VERDICT: UNKNOWN",
    "Result: VERDICT: PASS",
    "VERDICT: PASS\nVERDICT: FAIL (previous PASS was incorrect)",
])
def test_ambiguous_prose_is_unavailable_not_a_vote(judge, monkeypatch, line):
    calls = _fake_cli(monkeypatch, [_reply(line), _reply(), _reply()])
    verdict, reason, tag = judge.judge_cli("criterion", [])
    assert verdict == "fail"
    assert tag == "cli:test-model(no-verdict)"
    assert "no VERDICT line" in reason
    assert len(calls) == 1


@pytest.mark.parametrize("verdict", ["pass", "fail"])
def test_exact_prose_verdict_normalizes_case_and_outer_whitespace(judge, monkeypatch, verdict):
    judge.VOTES = 1
    calls = _fake_cli(monkeypatch, [_reply(f"Explanation mentions PASS.\n \tVeRdIcT: {verdict}\t \n")])
    got, _, tag = judge.judge_cli("criterion", [])
    assert got == verdict
    assert tag == "cli:test-model"
    assert len(calls) == 1


@pytest.mark.parametrize("votes,expected,passes", [
    (["PASS", "FAIL", "PASS"], "pass", 2),
    (["FAIL", "PASS", "FAIL"], "fail", 1),
    (["PASS", "FAIL"], "fail", 1),
])
def test_valid_votes_keep_majority_tie_rule_model_tally_and_truncation(
        judge, monkeypatch, big, votes, expected, passes):
    judge.VOTES = len(votes)
    calls = _fake_cli(monkeypatch, [_reply(f"VERDICT: {vote}") for vote in votes])
    verdict, reason, tag = judge.judge_cli("criterion", [big])
    assert verdict == expected
    assert tag == f"cli:test-model(votes:{passes}/{len(votes)})(truncated:big.diff)"
    assert reason == f"{passes}/{len(votes)} passed · VERDICT: {expected.upper()}"
    assert len(calls) == len(votes)


def test_truncated_filename_is_metadata_not_an_unavailability_marker(judge, monkeypatch, tmp_path):
    artifact = tmp_path / "big(no-verdict).diff"
    artifact.write_text("x" * 5000)
    calls = _fake_cli(monkeypatch, [_reply(), _reply("VERDICT: FAIL"), _reply()])
    verdict, reason, tag = judge.judge_cli("criterion", [artifact])
    assert verdict == "pass"
    assert tag == "cli:test-model(votes:2/3)(truncated:big(no-verdict).diff)"
    assert reason.startswith("2/3 passed")
    assert len(calls) == 3


_MARKER_MODELS = [
    "alias(truncated:shadow)",
    "alias(no-verdict)",
    "alias(extra)",
    "alias(truncated:shadow(no-verdict))",
    "alias(no-verdict)(truncated:shadow)",
    "alias(api-error)(cli-error)(votes:0/3)",
]


@pytest.mark.parametrize("model", _MARKER_MODELS)
def test_model_alias_markers_preserve_valid_votes_and_exact_identity(judge, monkeypatch, tmp_path, model):
    judge.MODEL = model
    artifact = tmp_path / "large(no-verdict)(truncated:shadow(votes:9)).diff"
    artifact.write_text("x" * 5000)
    calls = _fake_cli(monkeypatch, [_reply()] * 3)
    verdict, reason, tag = judge.judge_cli("criterion", [artifact])
    assert verdict == "pass"
    assert tag == f"cli:{model}(votes:3/3)(truncated:{artifact.name})"
    assert reason.startswith("3/3 passed")
    assert len(calls) == 3
    assert all(args[4] == model for args, _ in calls)


@pytest.mark.parametrize("model", _MARKER_MODELS)
def test_model_alias_markers_cannot_hide_empty_reply_unavailability(judge, monkeypatch, tmp_path, model):
    judge.MODEL = model
    artifact = tmp_path / "large(no-verdict)(truncated:shadow(votes:9)).diff"
    artifact.write_text("x" * 5000)
    calls = _fake_cli(monkeypatch, [_reply(""), _reply(), _reply()])
    verdict, reason, tag = judge.judge_cli("criterion", [artifact])
    assert verdict == "fail"
    assert tag == f"cli:{model}(no-verdict)(truncated:{artifact.name})"
    assert "no VERDICT line" in reason
    assert len(calls) == 1


@pytest.mark.parametrize("replies,verdict,available,calls_expected", [
    ([_reply()] * 3, "pass", True, 3),
    ([_reply(), _reply("VERDICT: FAIL")], "fail", True, 2),
    ([_reply(""), _reply(), _reply()], "fail", False, 1),
    ([_reply(returncode=7), _reply(), _reply()], "fail", False, 1),
])
def test_cli_json_availability_comes_from_ballot_state(
        judge, monkeypatch, big, capsys, replies, verdict, available, calls_expected):
    judge.MODEL = "alias(no-verdict)(truncated:shadow)"
    judge.VOTES = len(replies)
    monkeypatch.setenv("RELAY_JUDGE_BACKEND", "cli")
    monkeypatch.setattr(sys, "argv", [str(JUDGE), "--criterion", "criterion", "--file", str(big)])
    calls = _fake_cli(monkeypatch, replies)
    assert judge.main() == 0
    result = json.loads(capsys.readouterr().out)
    assert result["verdict"] == verdict
    assert result["available"] is available
    assert len(calls) == calls_expected
