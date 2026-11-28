"""Approval topology is validated before changing the graph or project files."""
import sys
from pathlib import Path
from typing import TypedDict

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from orchestra_relay import RelayError, gated


class State(TypedDict):
    n: int


def joined(calls):
    builder = StateGraph(State)

    def left(state):
        calls.append("left")
        return {}

    def right(state):
        calls.append("right")
        return {}

    builder.add_node("left", left)
    builder.add_node("right", right)

    def deploy(state):
        calls.append("deploy")
        return {}

    builder.add_node("deploy", deploy)
    builder.add_edge(START, "left")
    builder.add_edge(START, "right")
    builder.add_edge(["left", "right"], "deploy")
    builder.add_edge("deploy", END)
    return builder


def shape(builder):
    return (
        dict(builder.nodes), set(builder.edges), set(builder.waiting_edges),
        {name: {key: (branch.path, dict(branch.ends) if branch.ends is not None else None, branch.input_schema)
                for key, branch in branches.items()} for name, branches in builder.branches.items()},
    )


@pytest.mark.parametrize("existing_ignore", [False, True])
def test_incoming_approval_join_rejected_without_graph_or_file_mutation(tmp_path, monkeypatch, existing_ignore):
    monkeypatch.chdir(tmp_path)
    ignore = tmp_path / ".gitignore"
    if existing_ignore:
        ignore.write_bytes(b"owner-content\n")
    calls = []
    builder = joined(calls)
    before = shape(builder)
    with pytest.raises(RelayError, match='deploy.*join') as rejected:
        gated(builder, {"deploy": {"approve": True}})
    assert "incoming" in str(rejected.value)
    assert "static edge" in str(rejected.value)
    assert shape(builder) == before
    assert calls == []
    assert not (tmp_path / ".relay").exists()
    assert ignore.read_bytes() == b"owner-content\n" if existing_ignore else not ignore.exists()


def test_later_invalid_gate_does_not_partially_install_an_earlier_valid_gate(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    builder = joined([])
    builder.add_node("first", lambda state: {})
    builder.add_edge(START, "first")
    builder.add_edge("first", END)
    before = shape(builder)
    with pytest.raises(RelayError, match='deploy.*join'):
        gated(builder, {"first": {"approve": True}, "deploy": {"approve": True}})
    assert shape(builder) == before
    assert not (tmp_path / ".gitignore").exists()


@pytest.mark.parametrize("invalid", ["missing", "outgoing-join", "outgoing-conditional", "outgoing-command", "incoming-conditional"])
def test_existing_invalid_shapes_are_preflighted_before_any_mutation(tmp_path, monkeypatch, invalid):
    monkeypatch.chdir(tmp_path)
    builder = StateGraph(State)
    builder.add_node("first", lambda state: {})
    builder.add_node("protected", lambda state: {}, destinations=("after",) if invalid == "outgoing-command" else None)
    builder.add_node("other", lambda state: {})
    builder.add_node("after", lambda state: {})
    builder.add_edge(START, "first")
    builder.add_edge("first", END)
    builder.add_edge(START, "protected")
    if invalid == "outgoing-join":
        builder.add_edge(["protected", "other"], "after")
    if invalid == "outgoing-conditional":
        builder.add_conditional_edges("protected", lambda state: "after", {"after": "after"})
    if invalid == "incoming-conditional":
        builder.add_conditional_edges("other", lambda state: "protected", {"protected": "protected"})
    before = shape(builder)
    target = "absent" if invalid == "missing" else "protected"
    with pytest.raises(RelayError):
        gated(builder, {"first": {"approve": True}, target: {"approve": True}})
    assert shape(builder) == before
    assert not (tmp_path / ".gitignore").exists()


def test_static_approval_still_interrupts_before_the_protected_effect(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    calls = []
    builder = StateGraph(State)

    def deploy(state):
        calls.append("deploy")
        return {}

    builder.add_node("deploy", deploy)
    builder.add_edge(START, "deploy")
    builder.add_edge("deploy", END)
    graph = gated(builder, {"deploy": {"approve": True}}).compile(checkpointer=InMemorySaver())
    result = graph.invoke({"n": 0}, {"configurable": {"thread_id": "static-approval"}})
    assert result["__interrupt__"]
    assert calls == []


def test_incoming_join_is_still_valid_for_a_check_only_gate(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    calls = []
    builder = joined(calls)
    graph = gated(builder, {"deploy": {"check": f'"{sys.executable}" -c "pass"'}}).compile(checkpointer=InMemorySaver())
    assert (("left", "right"), "deploy") in builder.waiting_edges
    graph.invoke({"n": 0}, {"configurable": {"thread_id": "check-only-join"}})
    assert sorted(calls[:2]) == ["left", "right"]
    assert calls[2:] == ["deploy"]
