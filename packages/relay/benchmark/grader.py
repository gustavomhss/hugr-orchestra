#!/usr/bin/env python3
"""Grade an implementation against a campaign's HELD-OUT checks (gate != grader).

Final-state only; structured parsing (junitxml, never substring/eval) per BenchJack.

Integrity model: the GATE (relay_hook.sh) runs the VISIBLE `checks/` suite as the runner's own
feedback — the runner is told to self-check with it, so it can game those exact inputs. The GRADER
runs a DISJOINT, HELD-OUT suite the runner never sees (`holdout/`), with different inputs and
metamorphic invariants, against the same implementation. An implementation that merely hard-codes
the visible inputs therefore scores low. gate != grader is the whole point.

RSR = weighted fraction of requirements whose HELD-OUT check(s) pass. A requirement with more than
one held-out test passes only if ALL its tests pass. Maps each test `test_R<n>_*` -> requirement
R<n>; weights from requirements.yaml. Skipped tests never pass their requirement.

Every grade declares grade_valid and grade_errors. Execution/report/coverage faults produce null
scores, not a zero-quality observation. JSON is emitted even for invalid grades; consumers must
check grade_valid, not merely the grader process's exit status.

Usage:
  grader.py --dir <run_dir> [--holdout <holdout_dir>] [--baseline prior_per_req.json]
    --dir       run dir: contains requirements.yaml and repo/ (the implementation under test).
    --holdout   held-out tests dir, graded against <dir>/repo via RELAY_IMPL. INDEPENDENT of the
                gate. If omitted, falls back to <dir>/checks — which is NOT independent of the gate
                and must be used only for pipeline smoke tests, never cited as efficacy evidence.
"""
import argparse, json, os, re, subprocess, sys, tempfile
import xml.etree.ElementTree as ET


def weights(req_yaml):
    t = open(req_yaml).read()
    ids = re.findall(r'id:\s*(R\d+)\b', t)   # robust to block AND inline-flow YAML
    ws = re.findall(r'weight:\s*(\d+)', t)
    return {i: int(w) for i, w in zip(ids, ws)}


def parse_junit(xml, expected_requirements, exit_code):
    """Validate pytest execution and complete requirement coverage using structured JUnit.

    Named skips are valid negative outcomes. Any error, unmapped/unknown testcase,
    missing requirement, unusable report, or inconsistent exit is an invalid instrument.
    The internal per_req map is diagnostic until grade_valid is true.
    """
    expected = set(expected_requirements)
    result = {"per_req": {}, "grade_valid": False, "grade_errors": [],
              "pytest_exit_code": exit_code, "failures": [], "skipped": []}
    errors = result["grade_errors"]
    if not expected:
        errors.append("requirements-empty")
    if exit_code not in (0, 1):
        errors.append(f"pytest-exit-code: {exit_code} (expected 0 or 1)")
    try:
        root = ET.parse(xml).getroot()
    except FileNotFoundError:
        errors.append("junit-missing")
        return result
    except (OSError, ET.ParseError) as e:
        errors.append(f"junit-unparseable: {e}")
        return result
    if root.tag not in ("testsuites", "testsuite"):
        errors.append(f"junit-invalid-root: {root.tag}")
    cases = list(root.iter("testcase"))
    if not cases:
        errors.append("junit-no-testcases")
    for tag in ("failure", "skipped"):
        if len(list(root.iter(tag))) != sum(len(tc.findall(tag)) for tc in cases):
            errors.append(f"junit-outcome-outside-testcase: {tag}")
    # Collection/setup/teardown errors are not assertion-failure measurements.
    for error in root.iter("error"):
        errors.append(f"junit-error: {error.get('message') or error.get('type') or 'unspecified'}")
    unexpected = set()
    for tc in cases:
        name = tc.get("name") or ""
        m = re.match(r'^test_(R\d+)(?=_|\[|$)', name)
        if not m:
            errors.append(f"junit-unmapped-testcase: {name or '(unnamed)'}")
            continue
        r = m.group(1)
        if r not in expected:
            unexpected.add(r)
            continue
        tags = {c.tag for c in tc}
        if "failure" in tags:
            result["failures"].append(name)
        if "skipped" in tags:
            result["skipped"].append(name)
        passed = not tags.intersection(("failure", "error", "skipped"))
        res = result["per_req"]
        res[r] = res.get(r, True) and passed
    if unexpected:
        errors.append("requirements-unexpected: " + ", ".join(sorted(unexpected)))
    missing = expected - result["per_req"].keys()
    if missing:
        errors.append("requirements-missing: " + ", ".join(sorted(missing)))
    has_failures = bool(list(root.iter("failure")))
    has_errors = bool(list(root.iter("error")))
    if (exit_code == 0 and (has_failures or has_errors)) or (
            exit_code == 1 and not (has_failures or has_errors)):
        errors.append("pytest-exit-mismatch: exit code disagrees with JUnit failures/errors")
    result["grade_valid"] = not errors
    return result


def run_checks(tests_dir, impl_dir, expected_requirements):
    """Run real pytest against RELAY_IMPL and return validated JUnit outcomes.

    Expected IDs come from the existing requirements/weights reader, not a copied list.
    A fresh temporary report prevents a missing tool from reusing stale evidence.
    """
    expected = set(expected_requirements)
    if not expected:
        return {"per_req": {}, "grade_valid": False, "grade_errors": ["requirements-empty"],
                "pytest_exit_code": None, "failures": [], "skipped": []}
    env = dict(os.environ)
    env["RELAY_IMPL"] = os.path.abspath(impl_dir)
    try:
        with tempfile.TemporaryDirectory(prefix="relay-grade-") as tmp:
            xml = os.path.join(tmp, "junit.xml")
            proc = subprocess.run([sys.executable, "-m", "pytest", os.path.abspath(tests_dir), "-q",
                                   "--junitxml", xml, "-p", "no:cacheprovider"],
                                  capture_output=True, text=True, env=env)
            result = parse_junit(xml, expected, proc.returncode)
            if not result["grade_valid"]:
                diagnostic = (proc.stdout + "\n" + proc.stderr).strip()
                if diagnostic:
                    result["grade_errors"].append("pytest-output: " + diagnostic[-4000:])
            return result
    except OSError as e:
        return {"per_req": {}, "grade_valid": False,
                "grade_errors": [f"pytest-unavailable: {e}"], "pytest_exit_code": None,
                "failures": [], "skipped": []}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--holdout")
    ap.add_argument("--baseline")
    a = ap.parse_args()

    impl_dir = os.path.join(a.dir, "repo")
    tests_dir = a.holdout if a.holdout else os.path.join(a.dir, "checks")
    graded_by = "holdout" if a.holdout else "visible-checks(NOT-independent)"

    req_errors = []
    try:
        w = weights(os.path.join(a.dir, "requirements.yaml"))
    except OSError as e:
        w = {}
        req_errors.append(f"requirements-unreadable: {e}")
    checked = run_checks(tests_dir, impl_dir, w)
    total_w = sum(w.values())
    if w and total_w <= 0:
        req_errors.append("requirements-no-positive-weight")
    grade_errors = req_errors + checked["grade_errors"]
    grade_valid = not grade_errors
    res = checked["per_req"] if grade_valid else {}
    passed_w = sum(w[r] for r, ok in res.items() if ok) if grade_valid else None
    rsr = passed_w / total_w if grade_valid else None
    ccr = int(all(res[r] for r in w)) if grade_valid else None

    reg = []
    if grade_valid and a.baseline and os.path.exists(a.baseline):
        prior = json.load(open(a.baseline))
        if prior.get("grade_valid") is not False:
            prior_res = prior.get("per_req", prior)
            reg = [r for r, ok in prior_res.items() if ok and not res.get(r, False)]

    print(json.dumps({
        "rsr": round(rsr, 4) if grade_valid else None, "ccr": ccr, "graded_by": graded_by,
        "grade_valid": grade_valid, "grade_errors": grade_errors,
        "pytest_exit_code": checked["pytest_exit_code"],
        "passed": sorted(r for r in res if res[r]),
        "failed": sorted(r for r in w if not res[r]) if grade_valid else [],
        "regressions": reg,
        "n": len(w), "passed_w": passed_w, "total_w": total_w,
        "per_req": res,
    }, indent=2))


if __name__ == "__main__":
    main()
