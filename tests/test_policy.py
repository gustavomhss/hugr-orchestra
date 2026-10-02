"""Regression for the org-guardrail policy layer: bin/relay-policy.py (Roadmap R2).

Drives the REAL bin/relay-policy.py via subprocess. Asserts apply prepends org controls to EVERY
work package, dedupes by control id (org wins), stamps a `policy` field, rejects a malformed control,
and that the merged sprint is schema-valid for the real gate (we actually run bin/relay-gate eval on
it). `list` is exercised against a tmp bundle dir and against the shipped policies/. Tmp-isolated.
The shipped Git detectors are also checked against real tracked content and search/tool failures,
both through Bash eval and through policy application followed by the real gate.
"""
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

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


@pytest.fixture(params=["no-debug-prints", "no-loosened-tests"])
def git_bundle(request):
    name = request.param
    control, = json.loads((POLICIES / f"{name}.json").read_text())
    return name, control


@pytest.fixture
def tracked_work(tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    (work / "tests").mkdir()
    (work / "app.py").write_text("value = 1\n")
    (work / "tests" / "test_sample.py").write_text("def test_value():\n    assert 1 == 1\n")
    subprocess.run(["git", "init", "-q", str(work)], check=True, capture_output=True)
    subprocess.run(["git", "add", "app.py", "tests/test_sample.py"], cwd=work,
                   check=True, capture_output=True)
    return work


def _plant_git_violation(work, name):
    if name == "no-debug-prints":
        (work / "app.py").write_text('print("debug")\n')
    else:
        (work / "tests" / "test_sample.py").write_text("@pytest.mark.skip\ndef test_value():\n    pass\n")


def _git_search_env(tmp_path, status):
    """Use real rev-parse, then an empty-output search status (or remove Git after preflight)."""
    real_git = shutil.which("git")
    assert real_git is not None, "real Git is required for detector conformance"
    tools = tmp_path / "fake-bin"
    tools.mkdir()
    calls = tmp_path / "git-calls"
    wrapper = tools / "git"
    env = dict(os.environ)
    if status == "missing":
        # Keep the real gate's dependencies available, with no fallback Git on PATH.
        for tool in ("bash", "dirname", "mkdir", "cat", "jq", "shasum", "cut", "date",
                     "seq", "sleep", "tail", "rmdir", "sed", "python3", "openssl"):
            binary = shutil.which(tool)
            assert binary is not None, f"gate dependency missing: {tool}"
            (tools / tool).symlink_to(binary)
        env["PATH"] = str(tools)
        # Removing the cached executable also probes Bash 3.2's errexit status edge.
        remove = '/bin/rm -- "$0"; '
        search = "exit 99"
    else:
        env["PATH"] = f"{tools}{os.pathsep}{env.get('PATH', '')}"
        remove = ""
        env["RELAY_TEST_GREP_STATUS"] = str(status)
        search = 'exit "$RELAY_TEST_GREP_STATUS"'
    wrapper.write_text(
        "#!/bin/bash\n"
        f"printf '%s\\n' \"$1\" >> {shlex.quote(str(calls))}\n"
        'case "$1" in\n'
        f"  rev-parse) {remove}exec {shlex.quote(real_git)} \"$@\" ;;\n"
        f"  grep) {search} ;;\n"
        "  *) exit 99 ;;\n"
        "esac\n"
    )
    wrapper.chmod(0o755)
    return env, calls


def _eval_git_cmd(control, work, shell_options, env=None):
    return subprocess.run(["/bin/bash", *shell_options, "-c", 'eval "$1"',
                           "policy-test", control["cmd"]], cwd=work, env=env,
                          capture_output=True, text=True)


def _eval_shipped_git_gate(tmp_path, work, git_bundle, env=None):
    name, control = git_bundle
    sprint = _sprint(tmp_path, [{"id": "wp1", "instructions": "i"}], retry_budget=0)
    merged = tmp_path / "merged.json"
    applied = _run("apply", "--bundle", str(POLICIES / f"{name}.json"),
                   "--sprint", str(sprint), "-o", str(merged))
    assert applied.returncode == 0, applied.stderr
    injected = json.loads(merged.read_text())["work_packages"][0]["checklist"]
    assert injected == [{**control, "policy": name}]
    state = tmp_path / "state"
    g = subprocess.run(["/bin/bash", str(GATE), "eval", "--sprint", str(merged),
                        "--workdir", str(work), "--state", str(state)],
                       capture_output=True, text=True, env=env)
    return g, state


def _assert_git_gate(g, state, git_bundle, passes):
    name, control = git_bundle
    assert g.returncode == (0 if passes else 2), f"rc={g.returncode} {g.stdout} {g.stderr}"
    outcome = json.loads(g.stdout)
    assert outcome["outcome"] == ("complete" if passes else "escalate"), outcome
    assert outcome.get("failing", []) == ([] if passes else [control["id"]]), outcome
    entries = [json.loads(line) for line in (state / "ledger.jsonl").read_text().splitlines()]
    item, = [entry for entry in entries if entry["event"] == "checklist-item"]
    assert item["item"] == control["id"]
    assert item["verdict"] == ("pass" if passes else "fail")
    assert item["graded_by"] == "deterministic"
    assert item["origin"] == f"policy:{name}"
    assert item["oracle"] == hashlib.sha256(control["cmd"].encode()).hexdigest()


SHELL_OPTIONS = [(), ("-e",), ("-o", "pipefail"), ("-euo", "pipefail")]
SEARCH_STATUSES = [0, 1, 2, 99, 126, 127, 128, 129, 130, 255, "missing"]


@pytest.mark.parametrize("shell_options", SHELL_OPTIONS,
                         ids=["normal", "errexit", "pipefail", "strict"])
@pytest.mark.parametrize("violation", [False, True], ids=["clean", "tracked-violation"])
def test_shipped_git_detector_real_conformance(tracked_work, git_bundle, shell_options, violation):
    name, control = git_bundle
    if violation:
        _plant_git_violation(tracked_work, name)
    r = _eval_git_cmd(control, tracked_work, shell_options)
    assert r.returncode == (1 if violation else 0), f"rc={r.returncode} {r.stdout} {r.stderr}"


@pytest.mark.parametrize("shell_options", SHELL_OPTIONS,
                         ids=["normal", "errexit", "pipefail", "strict"])
@pytest.mark.parametrize("status", SEARCH_STATUSES)
def test_shipped_git_detector_search_status(tmp_path, tracked_work, git_bundle, shell_options, status):
    _, control = git_bundle
    env, calls = _git_search_env(tmp_path, status)
    r = _eval_git_cmd(control, tracked_work, shell_options, env)
    assert calls.read_text().splitlines() == (["rev-parse"] if status == "missing"
                                            else ["rev-parse", "grep"])
    assert r.returncode == (0 if status == 1 else 1), f"status={status}: rc={r.returncode} {r.stderr}"


@pytest.mark.parametrize("shell_options", [(), ("-euo", "pipefail")], ids=["normal", "strict"])
def test_shipped_git_detector_closed_status_set(tmp_path, tracked_work, git_bundle, shell_options):
    """Only Git's documented no-match status may pass, across all shell exit statuses."""
    _, control = git_bundle
    env, calls = _git_search_env(tmp_path, 0)
    for status in range(256):
        env["RELAY_TEST_GREP_STATUS"] = str(status)
        r = _eval_git_cmd(control, tracked_work, shell_options, env)
        assert r.returncode == (0 if status == 1 else 1), f"status={status}: rc={r.returncode} {r.stderr}"
    assert calls.read_text().splitlines() == ["rev-parse", "grep"] * 256


@pytest.mark.parametrize("violation", [False, True], ids=["clean", "tracked-violation"])
def test_shipped_git_detector_real_gate(tmp_path, tracked_work, git_bundle, violation):
    if violation:
        _plant_git_violation(tracked_work, git_bundle[0])
    g, state = _eval_shipped_git_gate(tmp_path, tracked_work, git_bundle)
    _assert_git_gate(g, state, git_bundle, passes=not violation)


@pytest.mark.parametrize("status", SEARCH_STATUSES)
def test_shipped_git_search_status_blocks_gate(tmp_path, tracked_work, git_bundle, status):
    env, calls = _git_search_env(tmp_path, status)
    g, state = _eval_shipped_git_gate(tmp_path, tracked_work, git_bundle, env)
    assert calls.read_text().splitlines() == (["rev-parse"] if status == "missing"
                                            else ["rev-parse", "grep"])
    _assert_git_gate(g, state, git_bundle, passes=status == 1)


def test_shipped_git_detector_scope_preserved(tmp_path, tracked_work, git_bundle):
    name, control = git_bundle
    if name == "no-debug-prints":
        excluded = ["tests/test_excluded.py", "spec_helper.py", "NOTES.md"]
        untracked = "scratch.py"
        violation = 'print("debug")\n'
    else:
        excluded = ["app.py", "tests/test_relay_helper.py"]
        untracked = "tests/test_untracked.py"
        violation = "@pytest.mark.skip\n"
    for path in excluded:
        (tracked_work / path).write_text(violation)
    subprocess.run(["git", "add", "--", *excluded], cwd=tracked_work,
                   check=True, capture_output=True)
    (tracked_work / untracked).write_text(violation)
    r = _eval_git_cmd(control, tracked_work, ("-euo", "pipefail"))
    assert r.returncode == 0, f"excluded/untracked content failed: {r.stderr}"
    # A violation in the included tracked scope must still fire in the same tree.
    _plant_git_violation(tracked_work, name)
    r = _eval_git_cmd(control, tracked_work, ("-euo", "pipefail"))
    assert r.returncode == 1, f"included tracked violation passed: {r.stderr}"


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


def test_git_grep_bundle_fails_closed_outside_git(tmp_path, git_bundle):
    """The shipped git-grep bundles must FAIL (not silently pass) in a non-git workdir that contains a
    violation — otherwise an org-mandated control lands on the ledger as `pass` having scanned nothing."""
    work = tmp_path / "work"  # deliberately NOT a git repo
    work.mkdir()
    (work / "tests").mkdir()
    name, control = git_bundle
    _plant_git_violation(work, name)
    sprint = _sprint(tmp_path, [{"id": "wp1", "instructions": "i"}], retry_budget=0)
    merged = tmp_path / "merged.json"
    r = _run("apply", "--bundle", str(POLICIES / f"{name}.json"),
             "--sprint", str(sprint), "-o", str(merged))
    assert r.returncode == 0, r.stderr
    state = tmp_path / "state"
    g = subprocess.run([str(GATE), "eval", "--sprint", str(merged),
                        "--workdir", str(work), "--state", str(state)],
                       capture_output=True, text=True)
    # retry_budget 0 -> the failing (fail-closed) org control escalates immediately
    assert g.returncode == 2, f"git-grep bundle did NOT fail closed: rc={g.returncode} {g.stdout} {g.stderr}"
    outcome = json.loads(g.stdout)
    assert control["id"] in outcome["failing"], outcome


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
