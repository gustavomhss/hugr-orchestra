#!/usr/bin/env python3
"""relay judge — run a semantic (LLM) check for a checklist `judge` item.

This is the WEAK, NON-AUDITABLE side of the gate, wired honestly:

  * It is ALWAYS non-independent. Even the API backend is the same model family grading an
    artifact it may have helped produce. So the verdict is logged `judge:<backend>(non-independent)`,
    is ADVISORY by default, and never counts as a deterministic, auditable control.
  * The auditor framing is conservative on purpose: the judge is told it did NOT write the code,
    to judge ONLY the stated criterion, and to return FAIL whenever the evidence is insufficient or
    it is uncertain. A semantic gate that defaults to PASS is theatre; this one defaults to FAIL.

Backends (auto-selected: forced RELAY_JUDGE_BACKEND > `api` if ANTHROPIC_API_KEY set > `stub`):
  stub : deterministic TEST double — PASS iff every context file contains the token RELAY_JUDGE_OK
         (RELAY_JUDGE_STUB=pass|fail forces it). For demos/CI only — NEVER a real compliance control.
  api  : Anthropic Messages API (urllib, no SDK). Model via RELAY_JUDGE_MODEL (default sonnet).

Usage:  judge.py --criterion TEXT [--file F ...]
Output: one JSON line {"verdict":"pass|fail","reason":"...","backend":"..."}  (exit always 0;
        the verdict lives in the payload so the caller decides whether it blocks).
"""
import sys, os, json, argparse

MODEL = os.environ.get("RELAY_JUDGE_MODEL", "claude-sonnet-4-6")
MAX_CTX = 16000  # chars of context per file handed to the judge

SYSTEM = (
    "You are an INDEPENDENT compliance auditor. You did NOT write the artifact under review. "
    "Judge ONLY whether the stated criterion is satisfied by the provided artifact — nothing else. "
    "Be strict and literal. If the evidence is missing, ambiguous, or you are uncertain, return FAIL: "
    "an unproven control is a failed control. End your reply with a final line that is exactly "
    "'VERDICT: PASS' or 'VERDICT: FAIL'."
)


def read_ctx(files):
    parts = []
    for f in files:
        try:
            with open(f) as fh:
                body = fh.read(MAX_CTX)
        except OSError:
            body = "(file not found)"
        parts.append(f"--- {os.path.basename(f)} ---\n{body}")
    return "\n\n".join(parts) if parts else "(no artifact provided)"


def pick_backend():
    b = os.environ.get("RELAY_JUDGE_BACKEND")
    if b:
        return b
    return "api" if os.environ.get("ANTHROPIC_API_KEY") else "stub"


def judge_stub(criterion, files):
    forced = os.environ.get("RELAY_JUDGE_STUB")
    if forced in ("pass", "fail"):
        return forced, f"stub forced {forced}"
    if not files:
        return "fail", "stub: no context to inspect"
    for f in files:
        try:
            ok = "RELAY_JUDGE_OK" in open(f).read()
        except OSError:
            ok = False
        if not ok:
            return "fail", f"stub: RELAY_JUDGE_OK marker absent in {os.path.basename(f)}"
    return "pass", "stub: marker present in all context files"


def judge_api(criterion, files):
    import urllib.request
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return "fail", "api: ANTHROPIC_API_KEY not set", "api-error"
    prompt = (f"CRITERION:\n{criterion}\n\nARTIFACT UNDER REVIEW:\n{read_ctx(files)}\n\n"
              "Does the artifact satisfy the criterion? Reason briefly, then give the VERDICT line.")
    body = json.dumps({
        "model": MODEL, "max_tokens": 512, "system": SYSTEM,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
        text = "".join(p.get("text", "") for p in data.get("content", []))
    except Exception as e:  # network/auth/etc — conservative: FAIL, surfaced
        return "fail", f"api error: {e}", "api-error"
    verdict = "fail"
    for line in reversed(text.strip().splitlines()):
        u = line.strip().upper()
        if u.startswith("VERDICT:"):
            verdict = "pass" if "PASS" in u else "fail"
            break
    reason = text.strip().splitlines()[-1] if text.strip() else "no response"
    return verdict, reason[:300], "llm"


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--criterion", required=True)
    ap.add_argument("--file", action="append", default=[])
    args, _ = ap.parse_known_args()

    backend = pick_backend()
    if backend == "stub":
        verdict, reason = judge_stub(args.criterion, args.file)
        tag = "stub"
    else:
        verdict, reason, tag = judge_api(args.criterion, args.file)
    print(json.dumps({"verdict": verdict, "reason": reason, "backend": tag}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
