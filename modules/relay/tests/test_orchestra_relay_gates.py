"""orchestra_relay gates on real LangGraph graphs: retry, edge rewiring, approval resume, sync/async/config nodes."""
import asyncio
import json
import os
from pathlib import Path
import sys
from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
import orchestra_relay
from orchestra_relay import gated
from orchestra_relay.__main__ import main

# Counts its runs in `checks`, fails the first time and passes after.
FLAKY = "echo x >> checks; test -f flag || { touch flag; exit 1; }"
PASS = "echo x >> checks"


class State(TypedDict):
    n: int


@pytest.fixture(autouse=True)
def project(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return tmp_path


def build(calls, write=None):
    builder = StateGraph(State)

    def default(state):
        calls.append("write")
        return {"n": state["n"] + 1}

    def ship(state):
        calls.append("ship")
        return {}

    builder.add_node("write", write or default)
    builder.add_node("ship", ship)
    builder.add_edge(START, "write")
    builder.add_edge("write", "ship")
    builder.add_edge("ship", END)
    return builder


def config(thread):
    return {"configurable": {"thread_id": thread}}


def ledger(project, thread):
    return project / ".relay" / "runs" / thread / "ledger.jsonl"


def events(project, thread):
    return [json.loads(line)["event"] for line in ledger(project, thread).read_text().splitlines()]


def checks(project):
    path = project / "checks"
    return len(path.read_text().splitlines()) if path.exists() else 0


def test_failing_check_retries_then_passes(project, capsys):
    calls = []
    graph = gated(build(calls), {"write": FLAKY}, dev=True).compile()
    assert graph.invoke({"n": 0}, config("retry"))["n"] == 2
    assert calls == ["write", "write", "ship"]
    assert checks(project) == 2
    assert events(project, "retry") == ["run.start", "step.start", "check.result", "step.end", "step.start",
                                        "check.result", "step.end", "sprint-complete"]
    err = capsys.readouterr().err
    assert "FAIL  (attempt 1/3)  → retrying" in err and "PASS  (attempt 2/3)" in err and "chain intact" in err
    assert main(["verify", str(ledger(project, "retry").parent)]) == 0


def test_static_out_edge_never_runs_on_unchecked_output(project, capsys):
    calls = []
    graph = gated(build(calls), {"write": {"check": "echo no labeler module; exit 1", "retries": 2}}).compile()
    graph.invoke({"n": 0}, config("blocked"))
    assert calls == ["write", "write"]
    assert events(project, "blocked")[-1] == "escalate"
    # A failing check shows why in the terminal, and the run is named after the project folder.
    err = capsys.readouterr().err
    assert "│ no labeler module" in err and "STOPPED  (check failed 2 of 2 times" in err
    assert json.loads(ledger(project, "blocked").read_text().splitlines()[0])["graph"] == project.name
    assert main(["verify", str(ledger(project, "blocked").parent)]) == 0


def test_approval_comes_before_the_node_and_resume_reruns_nothing(project, capsys):
    calls = []
    graph = gated(build(calls), {"write": {"check": PASS, "approve": True}}).compile(checkpointer=InMemorySaver())
    assert "__interrupt__" in graph.invoke({"n": 0}, config("approve"))
    before = ledger(project, "approve").read_text()
    assert calls == [] and checks(project) == 0
    graph.invoke(Command(resume="approve"), config("approve"))
    assert calls == ["write", "ship"] and checks(project) == 1
    after = ledger(project, "approve").read_text()
    assert after.startswith(before)
    assert [json.loads(line)["event"] for line in after[len(before):].splitlines()] == [
        "approval.decision", "step.start", "check.result", "step.end", "sprint-complete"]
    assert capsys.readouterr().err.count("WAITING") == 1
    assert (ledger(project, "approve").parent / "waiting.pid").read_text() == str(os.getpid())


def test_rejected_approval_never_runs_the_node(project):
    calls = []
    graph = gated(build(calls), {"write": {"check": PASS, "approve": True}}).compile(checkpointer=InMemorySaver())
    graph.invoke({"n": 0}, config("reject"))
    graph.invoke(Command(resume="reject"), config("reject"))
    assert calls == [] and checks(project) == 0
    assert events(project, "reject")[-1] == "escalate"


def test_recorded_decision_is_replayed_without_asking_again(project):
    calls = []
    graph = gated(build(calls), {"write": {"check": PASS, "approve": True}}).compile(checkpointer=InMemorySaver())
    graph.invoke({"n": 0}, config("replay"))
    # The process recorded the decision and died before LangGraph saved the approval node's result.
    request = next(json.loads(line) for line in ledger(project, "replay").read_text().splitlines()
                   if '"approval.request"' in line)
    orchestra_relay._append(ledger(project, "replay"), {
        "event": "approval.decision", "key": "replay/write/1/approval.decision", "node": "write", "attempt": 1,
        "request_seq": request["seq"], "decision": "approve", "note": "", "source": "terminal"})
    result = graph.invoke(None, config("replay"))
    assert "__interrupt__" not in result
    assert calls == ["write", "ship"] and checks(project) == 1
    assert events(project, "replay").count("approval.decision") == 1


def sync_node(calls):
    def write(state, config):
        calls.append(config["configurable"]["thread_id"])
        return {"n": state["n"] + 1}
    return write


def async_node(calls):
    async def write(state, config):
        calls.append(config["configurable"]["thread_id"])
        return {"n": state["n"] + 1}
    return write


@pytest.mark.parametrize("node", [sync_node, async_node])
def test_sync_and_async_nodes_taking_config(project, node):
    calls = []
    graph = gated(build(calls, node(calls)), {"write": FLAKY}, dev=True).compile()
    result = asyncio.run(graph.ainvoke({"n": 0}, config("kinds")))
    assert result["n"] == 2
    assert calls == ["kinds", "kinds", "ship"]
    assert events(project, "kinds")[-1] == "sprint-complete"


def test_conditional_out_edges_are_refused():
    builder = build([])
    builder.add_conditional_edges("ship", lambda state: END, [END])
    with pytest.raises(orchestra_relay.RelayError, match='node "ship" has conditional edges'):
        gated(builder, {"ship": PASS})


def test_a_gate_on_a_missing_node_names_the_graph_nodes():
    with pytest.raises(orchestra_relay.RelayError, match='no node "shipp" in this graph.\\n.*Nodes in this graph: write, ship'):
        gated(build([]), {"write": PASS, "shipp": PASS})
