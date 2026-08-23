"""V5 (docs/relay-v2.md §3) — the artifact a discursive control is graded against is COMPUTED.

A discursive control asks the agent to describe what it did, and is graded by cross-checking that
description against the artifact. Measured over six fixtures, that works — honest description passes,
fabrication, vagueness, omission and prompt-injection all fail
(`docs/fixtures/enforcement-model/`).

It works only if the artifact is real. Until now the judge received whatever static file paths the
plan listed in `context`, and nothing computed a diff at all — so the control was graded against a
selection someone else made. Two holes, both named in `enforcement-model.md` §5:

  * **against what base ref, by whom, at what moment** was undefined, so the control was undefined;
  * **artifact selection is an oracle decision, not a state decision.** `context` lives in the plan.
    Narrowing it to omit the file where the problem lives makes the judge dutifully cross-check an
    incomplete artifact and pass — the same scope-narrowing attack the control is tested against,
    moved out of the agent's prose and into the orchestrator's field.

So: the gate records a `base_ref` when a state is entered, computes `git diff <base_ref>` itself, and
hands that to the judge. Narrowing is still allowed — sometimes it is right — but it is folded into
the control's ORACLE and written onto the chain, so it costs a visible entry instead of being free,
and V3's drift detector catches a narrowing introduced mid-run.

The stub judge passes iff every context file contains `RELAY_JUDGE_OK`, which is what lets these
tests assert on the diff's actual CONTENT rather than on the fact that some file was passed.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"


def _git(work, *args):
    return subprocess.run(["git", "-C", str(work), *args], capture_output=True, text=True, check=True)


def _repo(work):
    work.mkdir(parents=True)
    _git(work, "init", "-q")
    _git(work, "config", "user.email", "t@t"); _git(work, "config", "user.name", "t")
    (work / "seed.txt").write_text("seed\n")
    _git(work, "add", "-A"); _git(work, "commit", "-q", "-m", "seed")
    return _git(work, "rev-parse", "HEAD").stdout.strip()


def _arm(tmp_path, wps, base_ref=None, git=True):
    arms, corpus = tmp_path / "arms", tmp_path / "corpus"
    work = tmp_path / "work"
    head = _repo(work) if git else (work.mkdir(parents=True) or None)
    d = arms / "tok"
    d.mkdir(parents=True)
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": 3, "work_packages": wps}))
    meta = {"workdir": str(work), "token": "tok"}
    if base_ref is not None:
        meta["base_ref"] = base_ref if base_ref != "HEAD" else head
    (d / "meta.json").write_text(json.dumps(meta))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n")
    return arms, work, corpus


def _fire(arms, corpus):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"],
           "RELAY_JUDGE_BACKEND": "stub"}
    r = subprocess.run(["bash", str(HOOK)],
                       input=json.dumps({"transcript_path": str(arms / "tok" / "tr.jsonl")}),
                       capture_output=True, text=True, env=env)
    out = r.stdout.strip()
    return json.loads(out) if out else None


def _entries(arms):
    f = arms / "tok" / "ledger.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines() if l.strip()] if f.exists() else []


def _item(arms, cid):
    hits = [e for e in _entries(arms) if e.get("item") == cid]
    return hits[-1] if hits else None


def _judged_wp(cid="J1", paths=None, blocking=True):
    c = {"id": cid, "assert": "the description matches the change",
         "judge": "Does the description match the diff?", "diff": True, "blocking": blocking}
    if paths is not None:
        c["paths"] = paths
    return {"id": "wp1", "instructions": "work", "checklist": [c]}


# --------------------------------------------------------------- the diff is real and it is content

def test_the_computed_diff_is_what_the_judge_reads(tmp_path):
    """The token lives only in the CHANGE, never in a file the plan listed. It can reach the judge
    only if the gate computed the diff itself."""
    arms, work, corpus = _arm(tmp_path, [_judged_wp()], base_ref="HEAD")
    (work / "impl.py").write_text("# RELAY_JUDGE_OK\n")
    out = _fire(arms, corpus)
    assert out is None or out.get("decision") != "block", out
    assert _item(arms, "J1")["verdict"] == "pass", _item(arms, "J1")


def test_a_change_the_criterion_does_not_cover_fails(tmp_path):
    arms, work, corpus = _arm(tmp_path, [_judged_wp()], base_ref="HEAD")
    (work / "impl.py").write_text("# nothing the judge accepts\n")
    out = _fire(arms, corpus)
    assert out and out["decision"] == "block" and "J1" in out["reason"], out
    assert _item(arms, "J1")["verdict"] == "fail"


def test_a_brand_new_file_is_visible(tmp_path):
    """Found by running it: `git diff <base>` shows TRACKED changes only, so the first version of
    this passed an empty diff to the judge whenever the work was a new file — the most common shape
    of new work, and precisely what the control exists to see. Untracked files are appended as
    no-index diffs. Not via `git add -N`: the gate must not write into the index of the workspace it
    is judging."""
    arms, work, corpus = _arm(tmp_path, [_judged_wp()], base_ref="HEAD")
    (work / "brand_new.py").write_text("# RELAY_JUDGE_OK\n")     # never added, never committed
    _fire(arms, corpus)
    assert _item(arms, "J1")["verdict"] == "pass", "a new file is work, and must reach the judge"
    r = subprocess.run(["git", "-C", str(work), "status", "--porcelain"], capture_output=True, text=True)
    assert r.stdout.strip() == "?? brand_new.py", "the gate must leave the workspace untouched"


def test_committed_work_is_visible_too(tmp_path):
    """`git diff <base>` covers committed and uncommitted alike, so an agent that commits its work
    is not invisible to the control."""
    arms, work, corpus = _arm(tmp_path, [_judged_wp()], base_ref="HEAD")
    (work / "impl.py").write_text("# RELAY_JUDGE_OK\n")
    _git(work, "add", "-A"); _git(work, "commit", "-q", "-m", "work")
    _fire(arms, corpus)
    assert _item(arms, "J1")["verdict"] == "pass"


# --------------------------------------------------------------- narrowing costs a visible entry

def test_narrowing_the_scope_is_recorded_on_the_chain(tmp_path):
    """Narrowing is allowed — sometimes it is right — but never free. The paths land on the chain."""
    arms, work, corpus = _arm(tmp_path, [_judged_wp(paths=["a.txt"])], base_ref="HEAD")
    (work / "a.txt").write_text("# RELAY_JUDGE_OK\n")
    _fire(arms, corpus)
    it = _item(arms, "J1")
    assert it["scope"] == "a.txt", it
    assert it["verdict"] == "pass"


def test_narrowing_that_hides_the_change_fails_the_control(tmp_path):
    """The scope-narrowing attack, moved from the agent's prose into the plan's field: the change is
    in b.txt and the scope names only a.txt, so the judge cross-checks an artifact with a hole in it."""
    arms, work, corpus = _arm(tmp_path, [_judged_wp(paths=["a.txt"])], base_ref="HEAD")
    (work / "a.txt").write_text("nothing here\n")
    (work / "b.txt").write_text("# RELAY_JUDGE_OK\n")
    _fire(arms, corpus)
    assert _item(arms, "J1")["verdict"] == "fail", "the judge can only see what it was given"


def test_the_scope_is_part_of_the_oracle(tmp_path):
    """What the control measures is the criterion AND the artifact it measures it against. Folding
    the scope into the oracle sha means a narrowing introduced mid-run reads as ORACLE DRIFT (V3)."""
    wide, w1, c1 = _arm(tmp_path / "wide", [_judged_wp()], base_ref="HEAD")
    (w1 / "a.txt").write_text("# RELAY_JUDGE_OK\n")
    _fire(wide, c1)
    narrow, w2, c2 = _arm(tmp_path / "narrow", [_judged_wp(paths=["a.txt"])], base_ref="HEAD")
    (w2 / "a.txt").write_text("# RELAY_JUDGE_OK\n")
    _fire(narrow, c2)
    assert _item(wide, "J1")["oracle"] != _item(narrow, "J1")["oracle"], \
        "same criterion, different artifact — that is a different question"


# --------------------------------------------------------------- it fails closed, never open

def test_a_non_git_workdir_fails_the_control_closed(tmp_path):
    arms, work, corpus = _arm(tmp_path, [_judged_wp()], base_ref="deadbeef", git=False)
    out = _fire(arms, corpus)
    it = _item(arms, "J1")
    assert it["verdict"] == "fail", it
    assert "unavailable" in it["graded_by"], "an infrastructure failure is not a judgment"
    assert out and out["decision"] == "block"


def test_a_missing_base_ref_fails_the_control_closed(tmp_path):
    """The first state's base ref is the ARM AUTHOR's to record — the hook only ever speaks once the
    agent has stopped, by which time the work is done. Absent, the control cannot run, so it fails."""
    arms, work, corpus = _arm(tmp_path, [_judged_wp()])   # no base_ref in meta.json
    (work / "impl.py").write_text("# RELAY_JUDGE_OK\n")
    _fire(arms, corpus)
    it = _item(arms, "J1")
    assert it["verdict"] == "fail" and "unavailable" in it["graded_by"], it


def test_an_unrunnable_advisory_control_still_only_advises(tmp_path):
    """Fail-closed means the verdict is `fail`, not that an advisory control suddenly blocks. This is
    exactly why a discursive control is never allowed to stand alone."""
    wp = _judged_wp(blocking=False)
    wp["checklist"].append({"id": "D1", "assert": "real oracle", "cmd": "true"})
    arms, work, corpus = _arm(tmp_path, [wp], base_ref="deadbeef", git=False)
    out = _fire(arms, corpus)
    assert _item(arms, "J1")["verdict"] == "fail"
    assert out is None or out.get("decision") != "block" or "J1" not in out.get("reason", ""), out


# --------------------------------------------------------------- the base ref is recorded, not guessed

def test_entering_a_state_records_its_base_ref(tmp_path):
    """The base ref for state N is captured when state N STARTS — the advance out of N-1 — because
    that is the only moment the engine runs before the work happens."""
    arms, work, corpus = _arm(
        tmp_path,
        [{"id": "wp1", "instructions": "a", "checklist": [{"id": "c1", "assert": "a", "cmd": "true"}]},
         {"id": "wp2", "instructions": "b", "checklist": [{"id": "c2", "assert": "b", "cmd": "true"}]}],
        base_ref="HEAD")
    head = _git(work, "rev-parse", "HEAD").stdout.strip()
    _fire(arms, corpus)
    adv = [e for e in _entries(arms) if e["event"] == "advance-reveal"]
    assert adv and adv[-1]["base_ref"] == head, adv
    assert (arms / "tok" / "base_wp2").read_text().strip() == head


def test_the_model_agnostic_cli_can_supply_a_base_ref(tmp_path):
    """`diff: true` was arm-path only: the hook stamps a base ref when it advances into a state, and
    `bin/relay-gate` has no such moment, so every discursive control failed closed under a non-Claude
    harness. It now reads $STATE_DIR/base_ref — whatever the driving harness recorded — so the
    documented model-agnostic path can use the feature at all.
    """
    arms, work, corpus = _arm(tmp_path, [_judged_wp()], base_ref="HEAD")
    head = _git(work, "rev-parse", "HEAD").stdout.strip()
    (work / "impl.py").write_text("# RELAY_JUDGE_OK\n")
    state = tmp_path / "gatestate"
    state.mkdir()
    (state / "counter").write_text("0")

    env = dict(os.environ, RELAY_JUDGE_BACKEND="stub")
    args = ["bash", str(ROOT / "bin" / "relay-gate"), "eval",
            "--sprint", str(arms / "tok" / "sprint.json"),
            "--workdir", str(work), "--state", str(state)]
    without = subprocess.run(args, capture_output=True, text=True, env=env)
    assert "J1" in without.stdout, "with no base_ref the control must fail closed, not pass"

    (state / "base_ref").write_text(head)
    (state / "counter").write_text("0")
    (state / "ledger.jsonl").unlink(missing_ok=True)
    with_ref = subprocess.run(args, capture_output=True, text=True, env=env)
    assert json.loads(with_ref.stdout)["outcome"] in ("advance", "complete"), with_ref.stdout
