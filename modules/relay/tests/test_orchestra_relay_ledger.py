"""orchestra_relay ledger: verify CLI, tamper demo, quickstart, and the committed golden ledger for the TS side."""
import itertools
import os
from pathlib import Path
import subprocess
import sys
from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command
import pytest

RELAY = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RELAY / "lib"))
import orchestra_relay
from orchestra_relay import gated
from orchestra_relay.__main__ import main

GOLDEN = RELAY / "test" / "golden" / "external" / "python" / "ledger.jsonl"


class State(TypedDict):
    n: int


def golden_run(project):
    builder = StateGraph(State)
    builder.add_node("write_code", lambda state: {"n": state["n"] + 1})
    builder.add_node("deploy", lambda state: {})
    builder.add_edge(START, "write_code")
    builder.add_edge("write_code", "deploy")
    builder.add_edge("deploy", END)
    graph = gated(builder, {
        "write_code": "test -f flag || { touch flag; echo not yet; exit 1; }",
        "deploy": {"check": "echo deployed", "judge": "the deploy is safe", "approve": True},
    }).compile(checkpointer=InMemorySaver(), name="LangGraph")
    config = {"configurable": {"thread_id": "golden-python"}}
    graph.invoke({"n": 0}, config)
    graph.invoke(Command(resume={"decision": "approve", "note": "looks good"}), config)
    return project / ".relay" / "runs" / "golden-python"


@pytest.fixture
def run(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(orchestra_relay, "clock", itertools.count(1_700_000_000_000, 1000).__next__)
    return golden_run(tmp_path)


def test_golden_ledger_is_reproduced_byte_for_byte(run):
    produced = (run / "ledger.jsonl").read_bytes()
    assert produced == GOLDEN.read_bytes(), produced.decode()


def test_verify_accepts_own_ledger(run, capsys):
    assert main(["verify", str(run)]) == 0
    assert "LEDGER INTACT — 14 chained entries" in capsys.readouterr().out


def test_tamper_demo_is_detected(run, capsys):
    assert main(["demo", "tamper", str(run)]) == 0
    out = capsys.readouterr().out
    assert "TAMPERED line 8: MAC mismatch" in out
    assert "ledger broken at entry 8" in out
    assert main(["verify", str(run)]) == 0


def test_vendored_oracle_matches_benchmark():
    assert (RELAY / "lib" / "orchestra_relay" / "verify_ledger.py").read_bytes() == (
        RELAY / "benchmark" / "verify_ledger.py").read_bytes()


def test_quickstart_runs(tmp_path):
    done = subprocess.run(
        [sys.executable, str(RELAY / "lib" / "orchestra_relay" / "examples" / "quickstart.py")],
        cwd=tmp_path, capture_output=True, text=True, env={**os.environ, "PYTHONPATH": str(RELAY / "lib")},
    )
    assert done.returncode == 0, done.stderr
    assert "FAIL  (attempt 1/3)  → retrying" in done.stderr and "PASS  (attempt 2/3)" in done.stderr
    assert "chain intact" in done.stderr
