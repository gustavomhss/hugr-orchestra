"""Regression for the org-guardrail policy layer: bin/relay-policy.py (Roadmap R2).

Drives the REAL bin/relay-policy.py via subprocess. Asserts apply prepends org controls to EVERY
work package, dedupes by control id (org wins), stamps a `policy` field, rejects a malformed control,
and that the merged sprint is schema-valid for the real gate (we actually run bin/relay-gate eval on
it). `list` is exercised against a tmp bundle dir and against the shipped policies/. Tmp-isolated.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "bin" / "relay-policy.py"
GATE = ROOT / "bin" / "relay-gate"
POLICIES = ROOT / "policies"


def _run(*args):
    return subprocess.run([sys.executable, str(TOOL), *args], capture_output=True, text=True)


def _bundle(tmp_path, name, controls):
    p = tmp_path / f"{name}.json"
    p.write_text(json.dumps(controls))
    return p


def _sprint(tmp_path, work_packages, **extra):
    s = {"brief": "t", "retry_budget": 3, "work_packages": work_packages, **extra}
    p = tmp_path / "sprint.json"
    p.write_text(json.dumps(s))
    return p


def test_apply_prepends_to_every_wp(tmp_path):
    bundle = _bundle(tmp_path, "org", [
        {"id": "ORG-1", "assert": "a", "cmd": "true"},
        {"id": "ORG-2", "assert": "b", "judge": "ok?"},
    ])
    sprint = _sprint(tmp_path, [
        {"id": "wp1", "instructions": "x", "checklist": [{"id": "WP-1", "assert": "w", "cmd": "true"}]},
        {"id": "wp2", "instructions": "y"},  # no checklist at all
    ])
    r = _run("apply", "--bundle", str(bundle), "--sprint", str(sprint))
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout)
    for wp in out["work_packages"]:
        ids = [c["id"] for c in wp["checklist"]]
        # org controls are first, in bundle order, on EVERY wp
        assert ids[:2] == ["ORG-1", "ORG-2"], ids
        # and each injected control is stamped with its bundle name
        assert all(c.get("policy") == "org" for c in wp["checklist"][:2])
    # the wp-specific control is preserved after the org ones
    assert [c["id"] for c in out["work_packages"][0]["checklist"]] == ["ORG-1", "ORG-2", "WP-1"]
    # the wp without a checklist now has exactly the org controls
    assert [c["id"] for c in out["work_packages"][1]["checklist"]] == ["ORG-1", "ORG-2"]


def test_dedupe_by_id_org_wins(tmp_path):
    bundle = _bundle(tmp_path, "org", [{"id": "DUP", "assert": "org-version", "cmd": "true"}])
    sprint = _sprint(tmp_path, [
        {"id": "wp1", "checklist": [
            {"id": "DUP", "assert": "wp-version", "cmd": "false"},
            {"id": "KEEP", "assert": "k", "cmd": "true"},
        ]},
    ])
    out = json.loads(_run("apply", "--bundle", str(bundle), "--sprint", str(sprint)).stdout)
    chk = out["work_packages"][0]["checklist"]
    ids = [c["id"] for c in chk]
    # DUP appears once; it's the org version (assert + cmd from the bundle, stamped policy)
    assert ids == ["DUP", "KEEP"], ids
    dup = chk[0]
    assert dup["assert"] == "org-version" and dup["cmd"] == "true" and dup["policy"] == "org"


def test_multiple_bundles_union_first_wins(tmp_path):
    b1 = _bundle(tmp_path, "alpha", [{"id": "SHARED", "assert": "from-alpha", "cmd": "true"},
                                     {"id": "A-ONLY", "assert": "a", "cmd": "true"}])
    b2 = _bundle(tmp_path, "beta", [{"id": "SHARED", "assert": "from-beta", "cmd": "false"},
                                    {"id": "B-ONLY", "assert": "b", "cmd": "true"}])
    sprint = _sprint(tmp_path, [{"id": "wp1"}])
    out = json.loads(_run("apply", "--bundle", str(b1), "--bundle", str(b2), "--sprint", str(sprint)).stdout)
    chk = out["work_packages"][0]["checklist"]
    assert [c["id"] for c in chk] == ["SHARED", "A-ONLY", "B-ONLY"]
    shared = chk[0]
    assert shared["assert"] == "from-alpha" and shared["policy"] == "alpha"  # first bundle wins
    assert chk[2]["policy"] == "beta"


def test_reject_control_without_cmd_or_judge(tmp_path):
    bundle = _bundle(tmp_path, "bad", [{"id": "NOPE", "assert": "neither cmd nor judge"}])
    sprint = _sprint(tmp_path, [{"id": "wp1"}])
    r = _run("apply", "--bundle", str(bundle), "--sprint", str(sprint))
    assert r.returncode != 0
    assert "NOPE" in r.stderr and ("cmd" in r.stderr and "judge" in r.stderr)


def test_out_file_written(tmp_path):
    bundle = _bundle(tmp_path, "org", [{"id": "ORG-1", "assert": "a", "cmd": "true"}])
    sprint = _sprint(tmp_path, [{"id": "wp1"}])
    out_path = tmp_path / "merged.json"
    r = _run("apply", "--bundle", str(bundle), "--sprint", str(sprint), "-o", str(out_path))
    assert r.returncode == 0
    merged = json.loads(out_path.read_text())
    assert merged["work_packages"][0]["checklist"][0]["id"] == "ORG-1"


def test_merged_sprint_is_gate_schema_valid(tmp_path):
    """The merged sprint must be consumed UNCHANGED by the real gate. Run bin/relay-gate eval on it:
    an org `cmd` control that passes + a wp control that passes => the gate advances (exit 0)."""
    work = tmp_path / "work"
    work.mkdir()
    (work / "present").write_text("x")
    bundle = _bundle(tmp_path, "org", [
        {"id": "ORG-PRESENT", "assert": "present file exists", "cmd": "test -f present"},
    ])
    sprint = _sprint(tmp_path, [
        {"id": "wp1", "instructions": "i", "checklist": [
            {"id": "WP-PRESENT", "assert": "also present", "cmd": "test -f present"}]},
    ])
    merged = tmp_path / "merged.json"
    assert _run("apply", "--bundle", str(bundle), "--sprint", str(sprint), "-o", str(merged)).returncode == 0

    state = tmp_path / "state"
    env = dict(os.environ, RELAY_JUDGE_BACKEND="stub")
    g = subprocess.run([str(GATE), "eval", "--sprint", str(merged),
                        "--workdir", str(work), "--state", str(state)],
                       capture_output=True, text=True, env=env)
    assert g.returncode == 0, f"gate did not advance: rc={g.returncode} {g.stdout} {g.stderr}"
    outcome = json.loads(g.stdout)
    assert outcome["outcome"] in ("advance", "complete")
    # the org control's verdict is on the ledger, graded deterministically
    ledger = (state / "ledger.jsonl").read_text().splitlines()
    items = [json.loads(l) for l in ledger if json.loads(l).get("event") == "checklist-item"]
    org_item = next(i for i in items if i["item"] == "ORG-PRESENT")
    assert org_item["verdict"] == "pass" and org_item["graded_by"] == "deterministic"


def test_org_cmd_control_can_block_the_gate(tmp_path):
    """A failing org control must actually fail the gate (proves the injected control is enforced)."""
    work = tmp_path / "work"
    work.mkdir()
    bundle = _bundle(tmp_path, "org", [
        {"id": "ORG-MISSING", "assert": "missing file exists", "cmd": "test -f never_here"},
    ])
    sprint = _sprint(tmp_path, [{"id": "wp1", "instructions": "i"}], retry_budget=0)
    merged = tmp_path / "merged.json"
    _run("apply", "--bundle", str(bundle), "--sprint", str(sprint), "-o", str(merged))
    state = tmp_path / "state"
    g = subprocess.run([str(GATE), "eval", "--sprint", str(merged),
                        "--workdir", str(work), "--state", str(state)],
                       capture_output=True, text=True)
    # retry_budget 0 -> a failing control escalates immediately
    assert g.returncode == 2, f"{g.stdout} {g.stderr}"
    outcome = json.loads(g.stdout)
    assert "ORG-MISSING" in outcome["failing"]


def test_reject_checklist_string(tmp_path):
    """A WP `checklist` that is a string must be rejected cleanly — NOT exploded per-character."""
    bundle = _bundle(tmp_path, "org", [{"id": "ORG-1", "assert": "a", "cmd": "true"}])
    sprint = _sprint(tmp_path, [{"id": "wp1", "checklist": "hello"}])
    r = _run("apply", "--bundle", str(bundle), "--sprint", str(sprint))
    assert r.returncode != 0, r.stdout
    assert "checklist" in r.stderr and "list" in r.stderr
    # no traceback, and the string was not exploded into per-char entries
    assert "Traceback" not in r.stderr and '"h"' not in r.stdout


def test_reject_checklist_object(tmp_path):
    """A WP `checklist` that is an object must be rejected, not have its keys iterated."""
    bundle = _bundle(tmp_path, "org", [{"id": "ORG-1", "assert": "a", "cmd": "true"}])
    sprint = _sprint(tmp_path, [{"id": "wp1", "checklist": {"id": "X"}}])
    r = _run("apply", "--bundle", str(bundle), "--sprint", str(sprint))
    assert r.returncode != 0, r.stdout
    assert "checklist" in r.stderr and "list" in r.stderr
    assert "Traceback" not in r.stderr


def test_reject_checklist_int(tmp_path):
    """A WP `checklist` that is a scalar must die() cleanly — NOT raise an uncaught TypeError."""
    bundle = _bundle(tmp_path, "org", [{"id": "ORG-1", "assert": "a", "cmd": "true"}])
    sprint = _sprint(tmp_path, [{"id": "wp1", "checklist": 5}])
    r = _run("apply", "--bundle", str(bundle), "--sprint", str(sprint))
    assert r.returncode != 0
    assert "checklist" in r.stderr and "list" in r.stderr
    assert "Traceback" not in r.stderr and "not iterable" not in r.stderr


def test_reject_bundle_cmd_not_string(tmp_path):
    """A bundle control whose `cmd` is a list/dict (which the gate would eval coerced) is rejected."""
    bundle = _bundle(tmp_path, "bad", [{"id": "ARR", "assert": "a", "cmd": ["true", "touch x"]}])
    sprint = _sprint(tmp_path, [{"id": "wp1"}])
    r = _run("apply", "--bundle", str(bundle), "--sprint", str(sprint))
    assert r.returncode != 0
    assert "ARR" in r.stderr and "cmd" in r.stderr and "string" in r.stderr


def test_forged_policy_on_wp_control_is_stripped(tmp_path):
    """Only relay-policy may stamp provenance: a WP-specific control carrying a forged `policy` field
    must have it stripped, so an author can't spoof org-provenance on a non-org control."""
    bundle = _bundle(tmp_path, "org", [{"id": "ORG-1", "assert": "a", "cmd": "true"}])
    sprint = _sprint(tmp_path, [{"id": "wp1", "checklist": [
        {"id": "WP-X", "assert": "w", "cmd": "true", "policy": "trusted-corp-security-team"},
    ]}])
    out = json.loads(_run("apply", "--bundle", str(bundle), "--sprint", str(sprint)).stdout)
    chk = out["work_packages"][0]["checklist"]
    wpx = next(c for c in chk if c["id"] == "WP-X")
    assert "policy" not in wpx, wpx  # forged stamp stripped
    # the genuine org control still carries its stamp
    org = next(c for c in chk if c["id"] == "ORG-1")
    assert org["policy"] == "org"


def test_git_grep_bundle_fails_closed_outside_git(tmp_path):
    """The shipped git-grep bundle must FAIL (not silently pass) in a non-git workdir that contains a
    violation — otherwise an org-mandated control lands on the ledger as `pass` having scanned nothing."""
    work = tmp_path / "work"  # deliberately NOT a git repo
    work.mkdir()
    (work / "leftover.py").write_text('print("debug")\n')
    sprint = _sprint(tmp_path, [{"id": "wp1", "instructions": "i"}], retry_budget=0)
    merged = tmp_path / "merged.json"
    r = _run("apply", "--bundle", str(POLICIES / "no-debug-prints.json"),
             "--sprint", str(sprint), "-o", str(merged))
    assert r.returncode == 0, r.stderr
    state = tmp_path / "state"
    g = subprocess.run([str(GATE), "eval", "--sprint", str(merged),
                        "--workdir", str(work), "--state", str(state)],
                       capture_output=True, text=True)
    # retry_budget 0 -> the failing (fail-closed) org control escalates immediately
    assert g.returncode == 2, f"git-grep bundle did NOT fail closed: rc={g.returncode} {g.stdout} {g.stderr}"
    outcome = json.loads(g.stdout)
    assert "ORG-NO-DEBUG-PRINTS" in outcome["failing"], outcome


def test_list_tmp_bundles(tmp_path):
    _bundle(tmp_path, "one", [{"id": "A", "assert": "a", "cmd": "true"}])
    _bundle(tmp_path, "two", [{"id": "B", "assert": "b", "cmd": "true"},
                              {"id": "C", "assert": "c", "judge": "ok?"}])
    r = _run("list", "--dir", str(tmp_path))
    assert r.returncode == 0
    assert "one" in r.stdout and "1" in r.stdout
    assert "two" in r.stdout and "2" in r.stdout


def test_list_marks_invalid_bundle(tmp_path):
    (tmp_path / "broken.json").write_text("{ not json")
    r = _run("list", "--dir", str(tmp_path))
    assert r.returncode == 0 and "INVALID" in r.stdout


def test_shipped_bundles_are_valid_and_listable():
    """The starter bundles we ship must themselves load + list cleanly."""
    r = _run("list", "--dir", str(POLICIES))
    assert r.returncode == 0, r.stderr
    assert "INVALID" not in r.stdout, r.stdout
    for name in ("no-debug-prints", "no-loosened-tests", "coverage-floor"):
        assert name in r.stdout, r.stdout
    # and each can actually be applied to a sprint
    for name in ("no-debug-prints", "no-loosened-tests", "coverage-floor"):
        b = POLICIES / f"{name}.json"
        out = subprocess.run([sys.executable, str(TOOL), "apply", "--bundle", str(b),
                              "--sprint", "/dev/stdin"],
                             input=json.dumps({"work_packages": [{"id": "wp1"}]}),
                             capture_output=True, text=True)
        assert out.returncode == 0, out.stderr
        chk = json.loads(out.stdout)["work_packages"][0]["checklist"]
        assert len(chk) == 1 and chk[0]["policy"] == name
