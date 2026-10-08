"""tools/research/replay-evidence — re-running the evidence rather than checking it is present.

The rule the research protocol is built on: every finding proven by a real command, and the command
run again rather than trusted. A control that checks a finding merely CARRIES a command is a presence
check, and presence checks are what this migration exists to replace.

The half that matters is the OUTPUT comparison. A command that still exits 0 while producing
different output means the claim was true when it was written and is not true now — exactly the state
a stale research report hides, and exactly what exit status alone cannot see.

Judged the same way as `spec-check`: not "does it pass the good case" alone, but "does it notice each
specific way the case can go bad".

`cite-check` used to live beside this and is gone: it graded the v1 report/analysis
shape, and `research-check`'s `conclusions_cite_findings` grades the same property on the shape
research-v2 actually emits. A tool that grades an artifact nothing produces is a trap for whoever
reads it next.
"""
import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
REPLAY = ROOT / "tools" / "research" / "replay-evidence"


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "core.py").write_text("def parse():\n  pass\ndef emit():\n  pass\n")
    return tmp_path


def _analysis(repo, findings):
    p = repo / "analysis.json"
    p.write_text(json.dumps({"areas": [{"name": "surface", "findings": findings}]}))
    return p


def _replay(repo, path):
    r = subprocess.run(["python3", str(REPLAY), str(path), "--cwd", str(repo)],
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


GOOD = [{"claim": "core.py defines exactly two module-level functions",
         "evidence_cmd": "grep -c '^def ' src/core.py", "evidence_output": "2"},
        {"claim": "no TODO markers remain", "evidence_cmd": "! grep -rq TODO src/",
         "evidence_output": ""}]


# --------------------------------------------------------------------- replay: it re-runs, and notices

def test_findings_that_still_hold_replay(repo):
    code, out = _replay(repo, _analysis(repo, GOOD))
    assert code == 0, out
    assert "2/2 findings replay" in out


def test_a_finding_whose_output_drifted_fails(repo):
    """The half that matters. The command still exits 0 — there ARE functions — but there are three
    now, so the claim was true when written and is not true now. That is the state a stale research
    report hides, and exit status alone cannot see it."""
    p = _analysis(repo, GOOD)
    (repo / "src" / "core.py").write_text("def parse():\n  pass\ndef emit():\n  pass\ndef extra():\n  pass\n")
    code, out = _replay(repo, p)
    assert code == 1 and "drifted" in out and "recorded '2', now '3'" in out, out


def test_a_finding_whose_command_now_fails(repo):
    p = _analysis(repo, GOOD)
    (repo / "src" / "core.py").write_text("# TODO: finish this\n")
    code, out = _replay(repo, p)
    assert code == 1 and "exited 1" in out, out


def test_a_claim_with_no_command_is_asserted_not_proven(repo):
    code, out = _replay(repo, _analysis(repo, [{"claim": "the design is sound", "evidence_cmd": ""}]))
    assert code == 1 and "asserted, not proven" in out, out


def test_an_empty_analysis_does_not_pass(repo):
    """No findings is not "all findings replayed". An empty analysis clearing its gate is exactly the
    hole the ungated states had."""
    code, out = _replay(repo, _analysis(repo, []))
    assert code == 1 and "no findings" in out, out


def test_an_empty_expected_output_is_reported_as_the_weaker_check(repo):
    """`evidence_output: ""` checks exit status only. Legitimate, and named in the report so it cannot
    become the default by omission going unnoticed."""
    code, out = _replay(repo, _analysis(repo, GOOD))
    assert "1 checked on exit status alone" in out, out


def test_a_hanging_command_fails_rather_than_hanging_the_gate(repo):
    p = _analysis(repo, [{"claim": "x", "evidence_cmd": "sleep 30", "evidence_output": ""}])
    r = subprocess.run(["python3", str(REPLAY), str(p), "--cwd", str(repo), "--timeout", "1"],
                       capture_output=True, text=True, timeout=20)
    assert r.returncode == 1 and "timed out" in r.stdout + r.stderr
