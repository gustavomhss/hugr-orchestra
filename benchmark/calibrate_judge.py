#!/usr/bin/env python3
"""Judge calibration harness. Feeds the engages-with-the-diff judge a labeled set of
review artifacts (real approvals that DO engage; crafted defects that do NOT) and reports
whether the judge's verdict matches the label. A single live PASS proves the judge can say
yes; this proves it can say no."""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CRIT = json.load(open(os.path.join(HERE, "judge_cases", "criteria.json")))
CORP = os.path.join(HERE, "judge_cases", "corpus")
CD   = os.path.join(HERE, "judge_cases")

# (label, criterion-key, review-file, diff-file, expected)  expected: "pass"|"fail"
CASES = [
 ("ev/real-approve",      "evidence",  f"{CORP}/review-evidence.json",   f"{CORP}/findings.json",    "pass"),
 ("ev/engaged-fixes",     "evidence",  f"{CD}/ev_good_fixesneeded.json", f"{CORP}/findings.json",    "pass"),
 ("ev/generic",           "evidence",  f"{CD}/ev_bad_generic.json",      f"{CORP}/findings.json",    "fail"),
 ("ev/partial",           "evidence",  f"{CD}/ev_bad_partial.json",      f"{CORP}/findings.json",    "fail"),
 ("ev/fabricated",        "evidence",  f"{CD}/ev_bad_fabricated.json",   f"{CORP}/findings.json",    "fail"),
 ("ev/rubberstamp",       "evidence",  f"{CD}/ev_bad_rubberstamp.json",  f"{CORP}/findings.json",    "fail"),
 ("syn/real-approve",     "synthesis", f"{CORP}/review-synthesis.json",  f"{CORP}/conclusions.json", "pass"),
 ("syn/generic",          "synthesis", f"{CD}/syn_bad_generic.json",     f"{CORP}/conclusions.json", "fail"),
 ("syn/partial",          "synthesis", f"{CD}/syn_bad_partial.json",     f"{CORP}/conclusions.json", "fail"),
]

def run(crit, review, diff):
    r = subprocess.run([sys.executable, os.path.join(ROOT, "benchmark", "judge.py"),
                        "--criterion", crit, "--file", review, "--file", diff],
                       capture_output=True, text=True)
    try:
        j = json.loads(r.stdout)
        return j.get("verdict", "?"), j.get("backend", "?")
    except Exception:
        return "?", (r.stdout or r.stderr).strip()[:60]

def main():
    tp=fp=tn=fn=0; invalid=0; rows=[]
    for label, ck, review, diff, exp in CASES:
        verd, back = run(CRIT[ck], review, diff)
        bad_transport = ("api-error" in back) or ("no-verdict" in back) or (verd=="?")
        if bad_transport:
            invalid+=1; rows.append((label, exp, verd, "--", back)); continue
        if exp=="pass" and verd=="pass": tp+=1
        elif exp=="pass" and verd!="pass": fn+=1
        elif exp=="fail" and verd=="fail": tn+=1
        elif exp=="fail" and verd!="fail": fp+=1
        rows.append((label, exp, verd, "OK" if verd==exp else "XX", back))
    print(f"{'case':22} {'want':5} {'got':5} {'':2} backend")
    for r in rows: print(f"{r[0]:22} {r[1]:5} {r[2]:5} {r[3]:2} {r[4]}")
    graded=tp+tn+fp+fn
    print(f"\nINVALID (transport, excluded)={invalid}/{len(CASES)}")
    print(f"TP={tp} TN={tn} FP={fp} FN={fn}  agreement={tp+tn}/{graded} of graded")
    print(f"FP (passed a defective review) = {fp}  <- the dangerous error")
    print(f"FN (rejected a good review)    = {fn}")
main()
