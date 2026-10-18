"""The arm must bind to ITS OWN subagent, and refuse rather than guess.

MEASURED, and the reason this file exists: a real fan-out of two Task subagents, each armed with its
own token, put BOTH tokens in the session transcript — the parent has to write both dispatch prompts,
so both markers are in its own text. The hook read `transcript_path` (the SESSION transcript) and
bound by first occurrence, so the second subagent was pushed through the FIRST one's chain. It
dutifully created the other arm's file to clear a gate that was never its own.

    session transcript          6 x RELAY-ARM:armA, 8 x RELAY-ARM:armB   (armA first)
    agent-a7214...jsonl         RELAY-ARM:armA only
    agent-ab566...jsonl         RELAY-ARM:armB only

The payload carries `agent_transcript_path` — the subagent's OWN transcript — alongside the session
one. That is the field that answers "which arm is this", and it is the field to read.

The old first-marker rule was a heuristic standing in for "the agent's own opening prompt". It was
right about the intent and wrong about the source, and nothing caught it because every test built a
transcript containing exactly the tokens it meant to test.

Two guards, because a mis-bound arm enforces the wrong chain silently:
  * MORE THAN ONE distinct token in the transcript we are reading -> refuse, do not guess;
  * an arm remembers the agent_id that opened it, and refuses a fire from a different one.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"


def _arm(arms, work, token):
    d = arms / token
    d.mkdir(parents=True, exist_ok=True)
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": 3, "work_packages": [
        {"id": f"{token}-wp1", "instructions": f"make {token}.txt",
         "checklist": [{"id": f"{token}-c1", "assert": "a", "cmd": f"test -f {token}.txt"}]}]}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": token}))
    return d


def _fire(arms, corpus, payload):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    r = subprocess.run(["bash", str(HOOK)], input=json.dumps(payload),
                       capture_output=True, text=True, env=env)
    out = r.stdout.strip()
    return (json.loads(out) if out else None), r.stderr


def _tr(path, *tokens):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(
        json.dumps({"type": "user", "content": f"work RELAY-ARM:{t}"}) + "\n" for t in tokens))
    return path


def test_it_binds_to_the_subagent_s_own_transcript(tmp_path):
    """The reproduction. The session transcript names armA first and armB second, exactly as a parent
    that dispatched both would; the subagent's own transcript names only armB."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    _arm(arms, work, "armA")
    _arm(arms, work, "armB")
    session = _tr(tmp_path / "session.jsonl", "armA", "armB", "armA", "armB")
    mine = _tr(tmp_path / "subagents" / "agent-b.jsonl", "armB")

    out, _ = _fire(arms, corpus, {"transcript_path": str(session),
                                  "agent_transcript_path": str(mine), "agent_id": "b1"})
    assert out and "armB-c1" in out["reason"], out
    assert (arms / "armB" / "retry_armB-wp1").exists()
    assert not list((arms / "armA").glob("retry_*")), "armA must be untouched by armB's stop"


def test_two_distinct_tokens_in_one_transcript_are_refused(tmp_path):
    """Without a subagent transcript there is nothing that says which arm is ours, and enforcing the
    wrong chain is worse than enforcing none: the agent is told to satisfy work it was never given."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    _arm(arms, work, "armA")
    _arm(arms, work, "armB")
    session = _tr(tmp_path / "session.jsonl", "armA", "armB")
    out, err = _fire(arms, corpus, {"transcript_path": str(session)})
    assert out is None, out
    assert "armA" in err and "armB" in err, err
    assert not list((arms / "armA").glob("retry_*")) and not list((arms / "armB").glob("retry_*"))


def test_one_token_repeated_is_not_ambiguous(tmp_path):
    """The guard is about DISTINCT tokens. An agent quoting its own marker ten times is still one arm."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    _arm(arms, work, "armA")
    session = _tr(tmp_path / "session.jsonl", "armA", "armA", "armA")
    out, _ = _fire(arms, corpus, {"transcript_path": str(session)})
    assert out and "armA-c1" in out["reason"], out


def test_an_arm_remembers_which_agent_opened_it(tmp_path):
    """Even a correctly bound arm belongs to ONE agent. A second agent arriving at the same token is
    either a mis-dispatch or a token leak, and both are things to stop on rather than serve."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    _arm(arms, work, "armA")
    mine = _tr(tmp_path / "a.jsonl", "armA")
    out, _ = _fire(arms, corpus, {"agent_transcript_path": str(mine), "agent_id": "agent-1"})
    assert out is not None
    assert (arms / "armA" / "agent_id").read_text().strip() == "agent-1"

    out2, err = _fire(arms, corpus, {"agent_transcript_path": str(mine), "agent_id": "agent-2"})
    assert out2 is None, out2
    assert "agent-2" in err and "agent-1" in err, err


def test_a_payload_without_an_agent_transcript_still_works(tmp_path):
    """Backward compatibility: the plain Stop-hook path (and every pre-existing test) passes only
    `transcript_path`, and a single-token transcript there is unambiguous."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    _arm(arms, work, "armA")
    session = _tr(tmp_path / "session.jsonl", "armA")
    out, _ = _fire(arms, corpus, {"transcript_path": str(session)})
    assert out and "armA-c1" in out["reason"], out
