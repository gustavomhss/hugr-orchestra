"""Regression for bin/relay-autodecompose.py — drafting a sprint.json from an existing pytest suite.

Builds a tiny throwaway repo with a known test layout, runs the real tool on it, and asserts the
drafted sprint is well-formed and matches the suite's structure (one WP per file, one control per
test + a rollup). No network, no model.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "bin" / "relay-autodecompose.py"


def _mk_repo(tmp_path):
    """A repo with two test files: 3 tests + 2 tests."""
    (tmp_path / "test_alpha.py").write_text(
        "def test_a1():\n    assert 1 == 1\n"
        "def test_a2():\n    assert 2 == 2\n"
        "def test_a3():\n    assert 3 == 3\n"
    )
    (tmp_path / "test_beta.py").write_text(
        "def test_b1():\n    assert True\n"
        "def test_b2():\n    assert True\n"
    )
    return tmp_path


def _run_tool(repo, *extra):
    p = subprocess.run(
        [sys.executable, str(TOOL), str(repo), *extra],
        capture_output=True, text=True,
    )
    assert p.returncode == 0, f"tool failed: {p.stderr}"
    return json.loads(p.stdout)


def test_drafts_one_wp_per_file(tmp_path):
    repo = _mk_repo(tmp_path)
    sprint = _run_tool(repo)
    assert sprint["retry_budget"] == 3
    assert len(sprint["work_packages"]) == 2  # two test files -> two WPs
    ids = [wp["id"] for wp in sprint["work_packages"]]
    assert any("alpha" in i for i in ids) and any("beta" in i for i in ids)


def test_one_control_per_test_plus_rollup(tmp_path):
    repo = _mk_repo(tmp_path)
    sprint = _run_tool(repo)
    by = {wp["id"]: wp for wp in sprint["work_packages"]}
    alpha = next(wp for k, wp in by.items() if "alpha" in k)
    # 3 tests -> 3 per-test controls + 1 rollup
    assert len(alpha["checklist"]) == 4
    per_test = [c for c in alpha["checklist"] if "::" in c["cmd"] and "suite" not in c["id"]]
    assert len(per_test) == 3
    assert any(c["id"].endswith("-suite") for c in alpha["checklist"])
    # every control is deterministic (cmd, not judge) and references the runner
    for c in alpha["checklist"]:
        assert "cmd" in c and "pytest" in c["cmd"]


def test_per_wp_cap_splits_a_big_file(tmp_path):
    # 5 tests in one file, cap 2 -> 3 WPs (2+2+1) from a single file
    (tmp_path / "test_big.py").write_text(
        "".join(f"def test_n{i}():\n    assert True\n" for i in range(5))
    )
    sprint = _run_tool(tmp_path, "--per-wp-cap", "2")
    big_wps = [wp for wp in sprint["work_packages"] if "big" in wp["id"]]
    assert len(big_wps) == 3


def test_output_is_hook_consumable_schema(tmp_path):
    """The drafted sprint must carry exactly the keys the relay hook reads: work_packages[].id,
    instructions, checklist[].{id,cmd}."""
    sprint = _run_tool(_mk_repo(tmp_path))
    for wp in sprint["work_packages"]:
        assert {"id", "title", "instructions", "checklist"} <= set(wp)
        for ctrl in wp["checklist"]:
            assert {"id", "cmd"} <= set(ctrl)
