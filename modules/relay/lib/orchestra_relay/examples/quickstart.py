"""Quickstart: one gated node whose check fails once, retries, then passes."""
import sys
import tempfile
import uuid
from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from orchestra_relay import gated

# Stands in for `pytest -q`: fails the first time, passes once the flag file exists.
flag = Path(tempfile.mkdtemp()) / "written"
check = f'"{sys.executable}" -c "import pathlib,sys; p=pathlib.Path(sys.argv[1]); ok=p.exists(); p.touch(); sys.exit(0 if ok else 1)" "{flag}"'


class State(TypedDict):
    code: str


def write_code(state):
    return {"code": "print('hello')"}


builder = StateGraph(State)
builder.add_node("write_code", write_code)
builder.add_edge(START, "write_code")
builder.add_edge("write_code", END)

graph = gated(builder, {"write_code": check}, dev=True).compile()
print(graph.invoke({"code": ""}, {"configurable": {"thread_id": f"quickstart-{uuid.uuid4().hex[:8]}"}}))
