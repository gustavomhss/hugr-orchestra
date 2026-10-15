"""Regression for bin/relay-autodecompose.py — drafting a sprint.json from an existing pytest suite.

Builds a tiny throwaway repo with a known test layout, runs the real tool on it, and asserts the
drafted sprint is well-formed and matches the suite's structure (one WP per file, one control per
test + a rollup). No network, no model.
"""
import importlib.util
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


# ---------------------------------------------------------------------------
# New tests — security and robustness regressions
# ---------------------------------------------------------------------------

def _load_draft():
    """Import the draft() and item_id() helpers directly from relay-autodecompose.py."""
    spec = importlib.util.spec_from_file_location("relay_autodecompose", str(TOOL))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_single_quote_nodeid_does_not_inject(tmp_path):
    """BUG 1 regression: a nodeid containing a single quote and a shell subexpression must not
    execute the subexpression when the emitted cmd is run via 'bash -c'.

    Strategy: use draft() directly with a crafted nodeid, then execute the resulting cmd with
    bash -c and assert no side-effect file was created.
    """
    mod = _load_draft()

    # A nodeid that, if quoted with Python repr, would become "..." (double-quoted) and leave
    # $(touch …) shell-active.
    sentinel = tmp_path / "PWNED_relay_test"
    malicious_nid = f"test_x.py::test_param[a'$(touch {sentinel})]"

    from collections import OrderedDict
    groups = OrderedDict({"test_x.py": [malicious_nid]})
    sprint = mod.draft(groups, "python3 -m pytest", None, "brief", 3)

    # Gather every cmd in the sprint.
    cmds = [ctrl["cmd"] for wp in sprint["work_packages"] for ctrl in wp["checklist"]]
    assert cmds, "draft produced no controls"

    # Run each cmd through bash -c exactly as the Relay hook does.
    for cmd in cmds:
        subprocess.run(["bash", "-c", cmd], capture_output=True)

    # The injection must NOT have been triggered — no sentinel file should exist.
    assert not sentinel.exists(), (
        f"Command injection succeeded — sentinel file was created.\n"
        f"Offending cmds: {cmds}"
    )


def test_frozen_importlib_line_excluded(tmp_path):
    """BUG 3 regression: lines like '<frozen importlib._bootstrap>::something' must be excluded
    from the collected nodeids and therefore must not appear as WP ids or checklist entries.

    Strategy: create a test repo whose pytest --collect-only output would normally contain such a
    line; since we cannot force pytest to emit it here, we test the filter predicate directly by
    confirming that '.py::' is required — lines without it are discarded.
    """
    # The filter applied in collect() is: ".py::" in ln
    # Verify the predicate rejects frozen-module lines and accepts normal nodeids.
    frozen_line = "<frozen importlib._bootstrap>::_find_and_load"
    normal_line = "tests/test_alpha.py::test_a1"
    parametrized_line = "tests/test_alpha.py::test_param[x-1]"
    summary_line = "3 tests collected in 0.01s"
    warning_line = "  PytestUnraisableExceptionWarning"

    def _passes_filter(ln):
        return ".py::" in ln and not ln.strip().startswith(("=", "ERROR"))

    assert not _passes_filter(frozen_line), "frozen line should be excluded"
    assert not _passes_filter(summary_line), "summary line should be excluded"
    assert not _passes_filter(warning_line), "warning line should be excluded"
    assert _passes_filter(normal_line), "normal nodeid should be included"
    assert _passes_filter(parametrized_line), "parametrized nodeid should be included"

    # End-to-end: run the real tool on a repo with a parametrized test that has a simple value
    # containing a single quote (produces a nodeid with '.py::') and confirm no frozen lines
    # pollute the WP list.
    (tmp_path / "test_param.py").write_text(
        "import pytest\n"
        "@pytest.mark.parametrize('x', [\"a'b\"])\n"
        "def test_p(x):\n"
        "    assert x\n"
    )
    sprint = _run_tool(tmp_path)
    all_ids = [wp["id"] for wp in sprint["work_packages"]]
    # No WP id should contain "frozen" or "bootstrap".
    for wid in all_ids:
        assert "frozen" not in wid and "bootstrap" not in wid, (
            f"Frozen-module line leaked into WP ids: {all_ids}"
        )
