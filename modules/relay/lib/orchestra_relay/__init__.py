"""Verifiable gates for LangGraph graphs: checks, approvals and a hash-chained ledger."""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END
from langgraph.types import interrupt

__version__ = "0.1.0"
VERIFY = Path(__file__).with_name("verify_ledger.py")


# Epoch milliseconds stamped as `at` on every ledger entry; tests replace it for a deterministic ledger.
def clock():
    return int(time.time() * 1000)


class RelayError(Exception):
    pass


def gated(builder, gates, dev=False):
    """Insert a check node (and an approval node when asked) after each gated node and route its edges through them."""
    root = project_root()
    ignore = root / ".gitignore"
    if ".relay/" not in (ignore.read_text(encoding="utf-8").splitlines() if ignore.exists() else []):
        with ignore.open("a", encoding="utf-8") as f:
            f.write(".relay/\n")
        print(f"relay: added .relay/ to {ignore}", file=sys.stderr)
    graph = {"name": "LangGraph"}
    for node, gate in gates.items():
        _gate(builder, root, graph, node, {"check": gate} if isinstance(gate, str) else gate)
    builder.edges = {(start, "relay__end" if end == END else end) for start, end in builder.edges}
    builder.add_node("relay__end", lambda state, config: _finish(root, graph, config))
    builder.add_edge("relay__end", END)
    return _Gated(builder, graph, dev, any(isinstance(g, dict) and g.get("approve") for g in gates.values()))


class _Gated:
    def __init__(self, builder, graph, dev, approve):
        self.builder, self.graph, self.dev, self.approve = builder, graph, dev, approve

    def compile(self, checkpointer=None, **kwargs):
        self.graph["name"] = kwargs.get("name") or "LangGraph"
        if checkpointer is None and self.dev:
            print("relay: dev mode, compiling with an in-memory checkpointer (InMemorySaver)", file=sys.stderr)
            checkpointer = InMemorySaver()
        if checkpointer is None and self.approve:
            raise RelayError(
                "relay: a gate in this graph needs a way to pause for approval.\n"
                "       This graph was compiled without a checkpointer.\n"
                "       Fix: .compile(checkpointer=InMemorySaver())   # dev\n"
                "            or let relay add one: gated(builder, ..., dev=True)"
            )
        return self.builder.compile(checkpointer=checkpointer, **kwargs)


def project_root():
    cwd = Path.cwd()
    return next((p for p in (cwd, *cwd.parents) if (p / ".git").exists()), cwd)


def _gate(builder, root, graph, node, gate):
    if node not in builder.nodes:
        raise RelayError(f'relay: no node "{node}" in this graph. Gated nodes: add_node("{node}", ...) first.')
    if builder.branches.get(node) or builder.nodes[node].ends or any(node in s for s, _ in builder.waiting_edges):
        raise RelayError(
            f'relay: node "{node}" has conditional edges, Command destinations or a join edge.\n'
            "       relay moves only static edges; anything else could run on unchecked output.\n"
            f'       Fix: give "{node}" one static edge to a separate router node, and gate "{node}".'
        )
    targets = sorted(end for start, end in builder.edges if start == node)
    builder.edges -= {(node, end) for end in targets}
    targets = [("relay__end" if end == END else end) for end in targets] or ["relay__end"]
    retries = gate.get("retries", 3)
    check, approve = f"{node}__relay_check", f"{node}__relay_approve"

    def run_check(state, config):
        thread, ledger = _ledger(root, config)
        _append(ledger, {"event": "run.start", "key": f"{thread}/__start__/0/run.start", "thread_id": thread,
                         "graph": graph["name"], "library_version": __version__})
        entries = _read(ledger)
        starts = sum(e["event"] == "step.start" and e.get("node") == node for e in entries)
        ends = sum(e["event"] == "step.end" and e.get("node") == node for e in entries)
        attempt = starts if starts > ends else starts + 1
        key = f"{thread}/{node}/{attempt}"
        _append(ledger, {"event": "step.start", "key": f"{key}/step.start", "node": node, "attempt": attempt})
        failed = False
        for kind, spec in (("cmd", gate.get("check")), ("judge", gate.get("judge"))):
            if spec is None:
                continue
            recorded = next((e for e in entries if e.get("key") == f"{key}/check.result:{spec}"), None)
            verdict, output = (recorded["verdict"], recorded["output"]) if recorded else _evaluate(kind, spec, root)
            _append(ledger, {"event": "check.result", "key": f"{key}/check.result:{spec}", "node": node,
                             "attempt": attempt, "id": spec, "kind": kind, "verdict": verdict, "output": output})
            failed = failed or verdict == "fail"
            label = f"check {spec}" if kind == "cmd" else f'judge "{spec}"'
            note = "  → retrying" if verdict == "fail" and attempt < retries else ""
            _say(node, label, f"{verdict.upper()}  (attempt {attempt}/{retries}){note}")
        if failed:
            _append(ledger, {"event": "step.end", "key": f"{key}/step.end", "node": node, "attempt": attempt,
                             "outcome": "fail"})
            if attempt >= retries:
                _escalate(ledger, thread, node, f'check failed {attempt} of {retries} times on node "{node}"')
            return None
        if not gate.get("approve"):
            _append(ledger, {"event": "step.end", "key": f"{key}/step.end", "node": node, "attempt": attempt,
                             "outcome": "pass"})
        return None

    def run_approve(state, config):
        thread, ledger = _ledger(root, config)
        attempt = sum(e["event"] == "step.start" and e.get("node") == node for e in _read(ledger))
        key = f"{thread}/{node}/{attempt}"
        _append(ledger, {"event": "approval.request", "key": f"{key}/approval.request", "node": node,
                         "attempt": attempt})
        # A decision already on the ledger is replayed, so a re-run of this node never asks twice.
        entries = _read(ledger)
        recorded = next((e for e in entries if e.get("key") == f"{key}/approval.decision"), None)
        if recorded is None:
            _say(node, "approval", "WAITING")
            answer = interrupt({"node": node, "attempt": attempt, "ledger": str(ledger)})
            decision = answer.get("decision") if isinstance(answer, dict) else answer
            recorded = {"event": "approval.decision", "key": f"{key}/approval.decision", "node": node,
                        "attempt": attempt,
                        "request_seq": next(e["seq"] for e in entries if e["key"] == f"{key}/approval.request"),
                        "decision": "approve" if decision == "approve" else "reject",
                        "note": str(answer.get("note", "")) if isinstance(answer, dict) else "", "source": "terminal"}
            _append(ledger, recorded)
        _say(node, "approval", "APPROVED" if recorded["decision"] == "approve" else "REJECTED")
        if recorded["decision"] == "approve":
            _append(ledger, {"event": "step.end", "key": f"{key}/step.end", "node": node, "attempt": attempt,
                             "outcome": "pass"})
            return None
        _append(ledger, {"event": "step.end", "key": f"{key}/step.end", "node": node, "attempt": attempt,
                         "outcome": "fail"})
        _escalate(ledger, thread, node, f'approval rejected on node "{node}"')
        return None

    # The route is read back from the ledger: the node's last entry says passed, retry, escalated or awaiting approval.
    def route(state, config):
        last = [e for e in _read(_ledger(root, config)[1]) if e.get("node") == node][-1]
        if last["event"] == "escalate":
            return END
        if last["event"] == "step.end":
            return targets if last["outcome"] == "pass" else node
        return approve

    builder.add_node(check, run_check)
    builder.add_edge(node, check)
    builder.add_conditional_edges(check, route, [*targets, node, END, *([approve] if gate.get("approve") else [])])
    if gate.get("approve"):
        builder.add_node(approve, run_approve)
        builder.add_conditional_edges(approve, route, [*targets, END])


def _evaluate(kind, spec, root):
    if kind == "judge":
        model = os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
        return "advisory", "model judging is not available in this version" if model else "no model configured"
    try:
        done = subprocess.run(spec, shell=True, cwd=root, capture_output=True, timeout=600)
    except subprocess.TimeoutExpired:
        return "fail", "timed out after 600 s"
    return ("pass" if done.returncode == 0 else "fail"), (done.stdout + done.stderr).decode("utf-8", "replace")[:4000]


def _finish(root, graph, config):
    thread, ledger = _ledger(root, config)
    _append(ledger, {"event": "run.start", "key": f"{thread}/__start__/0/run.start", "thread_id": thread,
                     "graph": graph["name"], "library_version": __version__})
    if not any(e["event"] in ("sprint-complete", "escalate") for e in _read(ledger)):
        _append(ledger, {"event": "sprint-complete", "key": f"{thread}/__end__/0/sprint-complete"})
        _summary(ledger)
    return None


def _escalate(ledger, thread, node, reason):
    _append(ledger, {"event": "escalate", "key": f"{thread}/__end__/0/escalate", "reason": reason, "node": node})
    _summary(ledger)


def _summary(ledger):
    lines = ledger.read_text(encoding="utf-8").splitlines()
    h = json.loads(lines[-1])["h"]
    intact = subprocess.run([sys.executable, str(VERIFY), str(ledger)], capture_output=True).returncode == 0
    state = "chain intact" if intact else "CHAIN BROKEN"
    print(f"relay  ledger       {len(lines)} entries · {state} · {h[:4]}…{h[-4:]}", file=sys.stderr)
    print(f"relay  verify  →    python -m orchestra_relay verify {ledger.parent}", file=sys.stderr)


def _say(node, label, status):
    print(f"relay  {node:<12} {label} {'.' * max(3, 28 - len(label))} {status}", file=sys.stderr)


def _ledger(root, config):
    thread = str((config.get("configurable") or {}).get("thread_id") or "")
    if not thread:
        raise RelayError(
            "relay: this run has no thread_id, so relay cannot name its ledger.\n"
            '       Fix: graph.invoke(..., {"configurable": {"thread_id": "my-run"}})'
        )
    run = thread if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", thread) else "t_" + hashlib.sha256(thread.encode()).hexdigest()[:32]
    return thread, root / ".relay" / "runs" / run / "ledger.jsonl"


def _read(ledger):
    return [json.loads(line) for line in ledger.read_text(encoding="utf-8").splitlines() if line.strip()] if ledger.exists() else []


def _append(ledger, body):
    """Append `body + {gen, prev, seq, mac}` and then `h` last, as `modules/relay/src/ledger/chain.ts` does.

    Skips a body whose `key` is already on the ledger, so a re-run never appends twice.
    """
    ledger.parent.mkdir(parents=True, exist_ok=True)
    lock = ledger.parent / ".chain.lock"
    for _ in range(200):
        try:
            lock.mkdir()
            break
        except FileExistsError:
            time.sleep(0.05)
    else:
        raise RelayError(f"relay: {lock} is held by another writer. Remove it if no run is active.")
    try:
        entries = _read(ledger)
        if any(e.get("key") == body["key"] for e in entries):
            return
        last = entries[-1] if entries else {}
        # chain.ts writes JSON.stringify strings plus an escaped DEL; json.dumps leaves DEL raw.
        written = json.dumps(
            {"event": body["event"], "key": body["key"], "at": clock(), **body,
             "gen": 0, "prev": last.get("h", "GENESIS"), "seq": last.get("seq", -1) + 1, "mac": "sha256"},
            separators=(",", ":"), ensure_ascii=False, allow_nan=False,
        ).replace("\x7f", "\\u007f")
        with ledger.open("a", encoding="utf-8", newline="\n") as f:
            f.write(f'{written[:-1]},"h":"{hashlib.sha256(written.encode()).hexdigest()}"}}\n')
    finally:
        lock.rmdir()
