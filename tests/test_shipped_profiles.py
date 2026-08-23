"""Every profile shipped in `profiles/` must stay compiled, and must gate everything it can.

A profile and its compiled sprint are two committed artifacts, so they can fork — and a compiled
sprint that has drifted from its source is two state machines wearing one name. `--check` is the
same discipline `bin/gen-doc-index.py --check` already enforces, and it runs from HERE because this
repo has no CI configured: a check nobody runs is a comment.

The lint runs against each shipped sprint for the same reason the lint was built before the
compiler. A migrated profile that quietly lost a control would otherwise look exactly like one that
never had it.
"""
import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PROF = ROOT / "bin" / "relay-profile.py"
SPEC = ROOT / "bin" / "relay-spec.py"
PROFILES = ROOT / "profiles"

pytest.importorskip("yaml", reason="the compiler reads real YAML")

SHIPPED = sorted(PROFILES.glob("*.yaml")) if PROFILES.is_dir() else []
# Compilation options a profile needs, kept here rather than inferred: --qualify-ids is a real
# authoring fact (this profile reuses a sub-state id across macros), not a default to guess at.
OPTS = {"tdd_feature": ["--qualify-ids"]}


@pytest.mark.parametrize("profile", SHIPPED, ids=lambda p: p.stem)
def test_the_shipped_sprint_is_not_stale(profile):
    sprint = profile.with_suffix(".sprint.json")
    assert sprint.exists(), f"{profile.name} ships no compiled sprint"
    r = subprocess.run(["python3", str(PROF), str(profile), "-o", str(sprint), "--check",
                        *OPTS.get(profile.stem, [])], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


@pytest.mark.parametrize("profile", SHIPPED, ids=lambda p: p.stem)
def test_the_shipped_sprint_gates_every_state_it_can(profile):
    sprint = profile.with_suffix(".sprint.json")
    r = subprocess.run(["python3", str(SPEC), "lint", str(sprint), "--json"],
                       capture_output=True, text=True)
    findings = json.loads(r.stdout)["findings"]
    errors = [f for f in findings if f["severity"] == "error"]
    assert errors == [], errors


@pytest.mark.parametrize("profile", SHIPPED, ids=lambda p: p.stem)
def test_every_control_is_reachable_from_a_declared_macro(profile):
    """The compiler emits macros[] and per-WP macro fields from the same pipeline, so a mismatch
    would mean the compiler contradicted itself rather than the author making a mistake."""
    sprint = json.loads(profile.with_suffix(".sprint.json").read_text())
    declared = {m["id"] for m in sprint.get("macros", [])}
    for wp in sprint["work_packages"]:
        assert wp["macro"] in declared, (wp["id"], wp["macro"], declared)
