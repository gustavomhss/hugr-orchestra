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
R<n>; weights from requirements.yaml.

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


def run_checks(tests_dir, impl_dir):
    """Run pytest on tests_dir with `import billing` resolved to impl_dir (via RELAY_IMPL, which the
    campaign conftest honours). Returns {R<n>: passed_bool}, AND-combining multiple tests per req."""
    xml = tempfile.mktemp(suffix=".xml")
    env = dict(os.environ)
    env["RELAY_IMPL"] = impl_dir
    subprocess.run([sys.executable, "-m", "pytest", tests_dir, "-q",
                    "--junitxml", xml, "-p", "no:cacheprovider"],
                   capture_output=True, env=env)
    res = {}
    if not os.path.exists(xml):
        return res
    root = ET.parse(xml).getroot()
    for tc in root.iter("testcase"):
        m = re.search(r'(R\d+)', tc.get("name") or "")
        if not m:
            continue
        failed = any(c.tag in ("failure", "error") for c in tc)
        r = m.group(1)
        res[r] = res.get(r, True) and not failed   # a req passes only if ALL its tests pass
    os.remove(xml)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--holdout")
    ap.add_argument("--baseline")
    a = ap.parse_args()

    impl_dir = os.path.join(a.dir, "repo")
    tests_dir = a.holdout if a.holdout else os.path.join(a.dir, "checks")
    graded_by = "holdout" if a.holdout else "visible-checks(NOT-independent)"

    w = weights(os.path.join(a.dir, "requirements.yaml"))
    res = run_checks(tests_dir, impl_dir)
    total_w = sum(w.values())
    passed_w = sum(w[r] for r, ok in res.items() if ok and r in w)
    rsr = passed_w / total_w if total_w else 0.0
    ccr = 1 if w and all(res.get(r, False) for r in w) else 0

    reg = []
    if a.baseline and os.path.exists(a.baseline):
        prior = json.load(open(a.baseline))
        prior_res = prior.get("per_req", prior)
        reg = [r for r, ok in prior_res.items() if ok and not res.get(r, False)]

    print(json.dumps({
        "rsr": round(rsr, 4), "ccr": ccr, "graded_by": graded_by,
        "passed": sorted(r for r in res if res[r]),
        "failed": sorted(r for r in w if not res.get(r, False)),
        "regressions": reg,
        "n": len(w), "passed_w": passed_w, "total_w": total_w,
        "per_req": res,
    }, indent=2))


if __name__ == "__main__":
    main()
