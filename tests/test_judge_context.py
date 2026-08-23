"""A discursive control must be handed the artifact it is asked about.

Found by the first live run of `wp-execute`. `review-engages-with-the-diff` asks *"does this review
describe the change in the diff?"* — and the control declared `diff: true` and no `context`, so the
judge received the diff and NOTHING ELSE. It was being asked about a review it had never seen.

The failure mode is worse than a wrong answer, because the verdict is then arbitrary: measured on the
same criterion with the review withheld, two live models returned FAIL on the `wp-execute` diff — and
the earlier `tdd_feature` run had returned PASS under exactly the same blindness. A control that
answers differently depending on nothing is not a control.

Two things are locked here. The compiled profiles must supply the artifact; and the gate must expand
`${...}` in a context path, since the path is written once in a profile and only the run knows where
`${wp_dir}` points. The stub backend is the oracle for the second: it passes only when every context
file it was handed contains `RELAY_JUDGE_OK`, so an unexpanded path cannot fake a pass.
"""
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
GATE = ROOT / "bin" / "relay-gate"
SHIPPED = sorted((ROOT / "profiles").glob("*.yaml"))


def _env(extra=None):
    env = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    env.pop("ANTHROPIC_API_KEY", None)
    if extra:
        env.update({k: str(v) for k, v in extra.items()})
    return env


@pytest.mark.parametrize("profile", SHIPPED, ids=lambda p: p.stem)
def test_a_judge_on_a_review_state_is_given_the_review(profile):
    """A `review` state exists to produce an artifact and have it judged. A judge control sitting on
    one with no `context` is grading the void."""
    sprint = json.loads(profile.with_suffix(".sprint.json").read_text())
    for wp in sprint["work_packages"]:
        if wp.get("kind") != "review":
            continue
        for c in wp.get("checklist", []):
            if "judge" not in c:
                continue
            assert c.get("context"), (
                f"{profile.stem}:{wp['id']}:{c['id']} judges an artifact it is never handed")


def _run_gate(tmp_path, context_value, marker_in_file):
    work = tmp_path / "work"
    (work / "wp").mkdir(parents=True)
    state = tmp_path / "state"
    (work / "wp" / "review.md").write_text(
        "a review" + (" RELAY_JUDGE_OK" if marker_in_file else "") + "\n")
    sprint = tmp_path / "sprint.json"
    sprint.write_text(json.dumps({
        "brief": "context expansion", "retry_budget": 1,
        "work_packages": [{
            "id": "wp1", "kind": "review", "title": "R", "instructions": "x",
            "checklist": [{"id": "J", "assert": "judged", "judge": "is it reviewed?",
                           "context": [context_value], "blocking": True}],
        }],
    }))
    p = subprocess.run([str(GATE), "eval", "--sprint", str(sprint), "--workdir", str(work),
                        "--state", str(state)],
                       capture_output=True, text=True,
                       env=_env({"RELAY_JUDGE_BACKEND": "stub", "wp_dir": "wp"}))
    return json.loads(p.stdout), (state / "ledger.jsonl").read_text()


def test_a_templated_context_path_resolves_against_the_run(tmp_path):
    out, _ = _run_gate(tmp_path, "${wp_dir}/review.md", marker_in_file=True)
    assert out["outcome"] in ("advance", "complete"), out


def test_the_gate_really_read_that_file_and_did_not_pass_on_an_empty_context(tmp_path):
    """Same templated path, marker removed. If expansion silently produced a path that does not
    exist, the stub would be judging '(no artifact provided)' — and this asserts it does not pass."""
    out, _ = _run_gate(tmp_path, "${wp_dir}/review.md", marker_in_file=False)
    assert out["outcome"] == "gate-fail", out


def test_an_unset_parameter_is_left_verbatim_rather_than_collapsing_to_the_workdir(tmp_path):
    """`${nope}/review.md` must not become `/review.md` or `review.md`. An empty expansion would
    resolve somewhere real often enough to hide the mistake."""
    out, _ = _run_gate(tmp_path, "${nope}/review.md", marker_in_file=True)
    assert out["outcome"] == "gate-fail", out


def test_a_context_path_is_data_and_is_never_executed(tmp_path):
    """A `cmd` goes through `eval` by construction. A path must not: expanding it through the shell
    would turn any profile that writes `${wp_dir}` into an execution site."""
    canary = tmp_path / "PWNED"
    out, _ = _run_gate(tmp_path, f"$(touch {canary})/review.md", marker_in_file=True)
    assert not canary.exists(), "a context path reached the shell"
    assert out["outcome"] == "gate-fail", out
