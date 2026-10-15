"""Calibration consumes typed judge availability across the real subprocess boundary."""
import importlib.util
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CALIBRATION = ROOT / "benchmark" / "calibrate_judge.py"


def _payload(verdict="pass", backend="llm:test-model", **overrides):
    body = {"verdict": verdict, "reason": "because", "backend": backend, "available": True}
    body.update(overrides)
    return json.dumps(body)


@pytest.fixture()
def calibration(monkeypatch, capsys):
    spec = importlib.util.spec_from_file_location("judge_calibration_test", CALIBRATION)
    module = importlib.util.module_from_spec(spec)
    calls = []

    def safe_import_run(args, **kwargs):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, _payload(), "")

    # A broken import guard must fail without launching real model calls.
    with monkeypatch.context() as patch:
        patch.setattr(subprocess, "run", safe_import_run)
        spec.loader.exec_module(module)
    module.import_calls = calls
    capsys.readouterr()
    return module


def _case(calibration, monkeypatch, review="review", diff="diff", expected="fail"):
    monkeypatch.setattr(calibration, "CASES", [("controlled", "evidence", str(review), str(diff), expected)])


def test_import_does_not_execute_calibration(calibration):
    assert calibration.import_calls == []


@pytest.mark.parametrize("stdout,exitcode", [
    pytest.param(json.dumps({"verdict": "pass", "reason": "legacy", "backend": "llm:test"}),
                 0, id="missing-availability"),
    pytest.param(_payload("fail", available=False), 0, id="false-availability-fail"),
    pytest.param(_payload("pass", available=False), 0, id="false-availability-pass"),
    pytest.param(_payload(available=1), 0, id="numeric-availability"),
    pytest.param(_payload(available="true"), 0, id="string-availability"),
    pytest.param(_payload(available=None), 0, id="null-availability"),
    pytest.param(_payload(backend="cli:test\0hidden"), 0, id="nul-backend"),
    pytest.param(_payload(backend=[]), 0, id="nonstring-backend"),
    pytest.param(json.dumps({"verdict": "pass", "reason": "missing", "available": True}),
                 0, id="missing-backend"),
    pytest.param(_payload(verdict="maybe"), 0, id="invalid-verdict"),
    pytest.param(_payload(verdict=True), 0, id="nonstring-verdict"),
    pytest.param(_payload(reason=[]), 0, id="nonstring-reason"),
    pytest.param(json.dumps({"verdict": "pass", "backend": "llm:test", "available": True}),
                 0, id="missing-reason"),
    pytest.param("[]", 0, id="array-json"),
    pytest.param("null", 0, id="null-json"),
    pytest.param('"pass"', 0, id="string-json"),
    pytest.param("not json", 0, id="malformed-json"),
    pytest.param(_payload() + "\n" + _payload(), 0, id="multiple-json-objects"),
    pytest.param(_payload(), 7, id="nonzero-pass-json"),
    pytest.param(_payload("fail"), 7, id="nonzero-fail-json"),
    pytest.param("", 7, id="nonzero-empty"),
])
def test_invalid_measurements_never_enter_confusion_matrix(
        calibration, monkeypatch, capsys, stdout, exitcode):
    monkeypatch.setattr(subprocess, "run", lambda args, **kwargs:
                        subprocess.CompletedProcess(args, exitcode, stdout, "controlled stderr"))
    _case(calibration, monkeypatch)
    calibration.main()
    report = capsys.readouterr().out
    assert "INVALID (transport, excluded)=1/1" in report
    assert "TP=0 TN=0 FP=0 FN=0" in report
    assert "agreement=unavailable (no valid judgments)" in report


def test_process_launch_failure_is_an_invalid_measurement(calibration, monkeypatch, capsys):
    def unavailable(*args, **kwargs):
        raise OSError("controlled launch failure")

    monkeypatch.setattr(subprocess, "run", unavailable)
    _case(calibration, monkeypatch)
    calibration.main()
    report = capsys.readouterr().out
    assert "INVALID (transport, excluded)=1/1" in report
    assert "TP=0 TN=0 FP=0 FN=0" in report


def test_valid_marker_aliases_enter_all_confusion_matrix_cells(calibration, monkeypatch, capsys):
    cases = [("TP", "pass", "pass", "llm:alias(no-verdict)"),
             ("TN", "fail", "fail", "llm:api-error"),
             ("FP", "fail", "pass", "cli:alias(truncated:shadow)"),
             ("FN", "pass", "fail", "cli:alias(no-verdict)(api-error)")]
    monkeypatch.setattr(calibration, "CASES", [
        (label, "evidence", "review", "diff", expected) for label, expected, _, _ in cases])
    replies = iter(_payload(verdict, backend) for _, _, verdict, backend in cases)
    monkeypatch.setattr(subprocess, "run", lambda args, **kwargs:
                        subprocess.CompletedProcess(args, 0, next(replies), ""))
    calibration.main()
    report = capsys.readouterr().out
    assert "INVALID (transport, excluded)=0/4" in report
    assert "TP=1 TN=1 FP=1 FN=1  agreement=2/4 of graded" in report


@pytest.fixture()
def isolated_judge_env(monkeypatch):
    for name in list(os.environ):
        if name.startswith("RELAY_") or name == "ANTHROPIC_API_KEY":
            monkeypatch.delenv(name)
    monkeypatch.setenv("RELAY_JUDGE_MAX_CTX", "1000")
    monkeypatch.setenv("RELAY_JUDGE_VOTES", "3")


@pytest.fixture()
def endpoint():
    state = {"replies": [], "calls": [], "status": 200}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers["content-length"])))
            reply = state["replies"][min(len(state["calls"]), len(state["replies"]) - 1)]
            state["calls"].append(request)
            body = json.dumps(reply).encode()
            self.send_response(state["status"])
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", state
    finally:
        server.shutdown()
        server.server_close()


def _observe_judge_process(monkeypatch):
    actual_run = subprocess.run
    observed = []

    def run(*args, **kwargs):
        process = actual_run(*args, **kwargs, timeout=10)
        observed.append(process)
        return process

    monkeypatch.setattr(subprocess, "run", run)
    return observed


def _assert_wire_measurement(observed, report, verdict, available, expected):
    assert len(observed) == 1
    assert observed[0].returncode == 0, observed[0].stderr
    payload = json.loads(observed[0].stdout)
    assert payload["verdict"] == verdict
    assert payload["available"] is available
    if available:
        assert "INVALID (transport, excluded)=0/1" in report
        assert ("TP=1 TN=0 FP=0 FN=0" if expected == "pass" else
                "TP=0 TN=1 FP=0 FN=0") in report
    else:
        assert "INVALID (transport, excluded)=1/1" in report
        assert "TP=0 TN=0 FP=0 FN=0" in report
    return payload


_MODELS = ["alias(no-verdict)", "api-error", "alias(truncated:shadow(no-verdict))"]


@pytest.mark.parametrize("model", _MODELS)
@pytest.mark.parametrize("reply_kind", ["pass", "fail", "empty", "error"])
def test_api_subprocess_availability_reaches_calibration(
        calibration, monkeypatch, capsys, tmp_path, isolated_judge_env, endpoint, model, reply_kind):
    url, state = endpoint
    artifact = tmp_path / "large(no-verdict)(truncated:shadow).diff"
    artifact.write_text("x" * 5000)
    monkeypatch.setenv("RELAY_JUDGE_BACKEND", "api")
    monkeypatch.setenv("RELAY_JUDGE_BASE_URL", url)
    monkeypatch.setenv("RELAY_JUDGE_API_KEY", "controlled-local")
    monkeypatch.setenv("RELAY_JUDGE_MODEL", model)
    tool = lambda verdict: {"content": [{"type": "tool_use", "name": "submit_verdict",
                                       "input": {"verdict": verdict, "reason": "controlled"}}]}
    state["replies"] = ([{"content": []}, tool("pass"), tool("pass")] if reply_kind == "empty"
                        else [tool("pass" if reply_kind == "error" else reply_kind)] * 3)
    if reply_kind == "error":
        state["status"] = 503
    expected = "pass" if reply_kind == "pass" else "fail"
    _case(calibration, monkeypatch, artifact, artifact, expected)
    observed = _observe_judge_process(monkeypatch)
    calibration.main()
    payload = _assert_wire_measurement(observed, capsys.readouterr().out, expected,
                                       reply_kind in ("pass", "fail"), expected)
    prefix = "api-error" if reply_kind == "error" else "llm"
    assert payload["backend"].startswith(f"{prefix}:{model}")
    assert len(state["calls"]) == (3 if reply_kind in ("pass", "fail") else 1)


@pytest.fixture()
def fake_cli(tmp_path, monkeypatch):
    command = tmp_path / "claude"
    command.write_text(f"#!{sys.executable}\n" +
                       "import json, os, sys\nfrom pathlib import Path\n"
                       "path = Path(os.environ['FAKE_JUDGE_CLI_CONFIG'])\n"
                       "config = json.loads(path.read_text())\n"
                       "reply = config['replies'][min(len(config['calls']), len(config['replies']) - 1)]\n"
                       "config['calls'].append(sys.argv[1:])\n"
                       "path.write_text(json.dumps(config))\n"
                       "sys.stdout.write(reply['stdout'])\n"
                       "sys.stderr.write(reply.get('stderr', ''))\n"
                       "sys.exit(reply.get('returncode', 0))\n")
    command.chmod(0o755)
    config = tmp_path / "cli-replies.json"
    monkeypatch.setenv("FAKE_JUDGE_CLI_CONFIG", str(config))
    monkeypatch.setenv("PATH", str(tmp_path) + os.pathsep + os.environ["PATH"])
    return config


@pytest.mark.parametrize("model", _MODELS)
@pytest.mark.parametrize("reply_kind", ["pass", "fail", "empty", "error"])
def test_cli_subprocess_availability_reaches_calibration(
        calibration, monkeypatch, capsys, tmp_path, isolated_judge_env, fake_cli, model, reply_kind):
    artifact = tmp_path / "large(no-verdict)(truncated:shadow).diff"
    artifact.write_text("x" * 5000)
    monkeypatch.setenv("RELAY_JUDGE_BACKEND", "cli")
    monkeypatch.setenv("RELAY_JUDGE_MODEL", model)
    passed = {"stdout": "VERDICT: PASS"}
    replies = ([{"stdout": ""}, passed, passed] if reply_kind == "empty" else
               [{"stdout": "VERDICT: PASS", "stderr": "controlled error", "returncode": 7},
                passed, passed] if reply_kind == "error" else
               [{"stdout": f"VERDICT: {reply_kind.upper()}"}] * 3)
    fake_cli.write_text(json.dumps({"replies": replies, "calls": []}))
    expected = "pass" if reply_kind == "pass" else "fail"
    _case(calibration, monkeypatch, artifact, artifact, expected)
    observed = _observe_judge_process(monkeypatch)
    calibration.main()
    payload = _assert_wire_measurement(observed, capsys.readouterr().out, expected,
                                       reply_kind in ("pass", "fail"), expected)
    prefix = "cli-error" if reply_kind == "error" else "cli"
    assert payload["backend"].startswith(f"{prefix}:{model}")
    calls = json.loads(fake_cli.read_text())["calls"]
    assert len(calls) == (3 if reply_kind in ("pass", "fail") else 1)
    assert all(args[args.index("--model") + 1] == model for args in calls)


@pytest.mark.parametrize("verdict", ["pass", "fail"])
def test_stub_subprocess_verdict_is_available(
        calibration, monkeypatch, capsys, isolated_judge_env, verdict):
    monkeypatch.setenv("RELAY_JUDGE_BACKEND", "stub")
    monkeypatch.setenv("RELAY_JUDGE_STUB", verdict)
    _case(calibration, monkeypatch, expected=verdict)
    observed = _observe_judge_process(monkeypatch)
    calibration.main()
    payload = _assert_wire_measurement(observed, capsys.readouterr().out, verdict, True, verdict)
    assert payload["backend"] == "stub"
