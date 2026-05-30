#!/usr/bin/env python3
"""Grade an implementation against a campaign's checks.

Final-state only; structured parsing (junitxml, never substring/eval) per BenchJack.
RSR = weighted fraction of requirements whose check passes. Maps each test `test_R<n>_*`
to requirement R<n>; weights from requirements.yaml.

Usage: grader.py --dir <campaign-or-run-dir> [--baseline prior_per_req.json]
"""
import argparse, json, os, re, subprocess, sys, tempfile
import xml.etree.ElementTree as ET


def weights(req_yaml):
    t = open(req_yaml).read()
    ids = re.findall(r'-\s*id:\s*(\S+)', t)
    ws = re.findall(r'weight:\s*(\d+)', t)
    return {i: int(w) for i, w in zip(ids, ws)}


def run_checks(dirpath):
    xml = tempfile.mktemp(suffix=".xml")
    subprocess.run([sys.executable, "-m", "pytest", "checks/", "-q",
                    "--junitxml", xml, "-p", "no:cacheprovider"],
                   cwd=dirpath, capture_output=True)
    res = {}
    if not os.path.exists(xml):
        return res
    root = ET.parse(xml).getroot()
    for tc in root.iter("testcase"):
        m = re.search(r'(R\d+)', tc.get("name") or "")
        if not m:
            continue
        failed = any(c.tag in ("failure", "error") for c in tc)
        res[m.group(1)] = not failed
    os.remove(xml)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--baseline")
    a = ap.parse_args()

    w = weights(os.path.join(a.dir, "requirements.yaml"))
    res = run_checks(a.dir)
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
        "rsr": round(rsr, 4), "ccr": ccr,
        "passed": sorted(r for r in res if res[r]),
        "failed": sorted(r for r in w if not res.get(r, False)),
        "regressions": reg,
        "n": len(w), "passed_w": passed_w, "total_w": total_w,
        "per_req": res,
    }, indent=2))


if __name__ == "__main__":
    main()
