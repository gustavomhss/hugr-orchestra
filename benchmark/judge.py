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
         RELAY_JUDGE_BASE_URL points it at any Messages-API-compatible endpoint (a local gateway,
         a proxy) instead of api.anthropic.com; RELAY_JUDGE_API_KEY supplies that endpoint's key
         when it is not the Anthropic one. The backend tag carries the MODEL that graded, because
         "an LLM said so" is not an audit trail — which LLM is the first thing a reader asks.

Usage:  judge.py --criterion TEXT [--file F ...]
Output: one JSON line {"verdict":"pass|fail","reason":"...","backend":"..."}  (exit always 0;
        the verdict lives in the payload so the caller decides whether it blocks).
"""
import sys, os, json, argparse

MODEL = os.environ.get("RELAY_JUDGE_MODEL", "claude-sonnet-4-6")
MAX_CTX = 16000  # chars of context per file handed to the judge
# Reply budget. `max_tokens` is a cap, not a spend, so a generous default costs nothing on a model
# that answers briefly and fixes a real failure on one that does not. Measured on a live run: at 512
# and at 2048 a reasoning model burned the whole budget on internal thinking and returned an EMPTY
# content list with stop_reason `max_tokens` — no verdict, no tool call, nothing. That reads as a
# failed control, and the failure came from the transport, not from the artifact. At 8192 the same
# model, artifact and criterion answered correctly in both directions.
MAX_TOKENS = int(os.environ.get("RELAY_JUDGE_MAX_TOKENS", "8192"))

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
    base = os.environ.get("RELAY_JUDGE_BASE_URL", "").rstrip("/")
    key = os.environ.get("RELAY_JUDGE_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        # A custom endpoint may not authenticate at all (a loopback gateway), but sending nothing to
        # api.anthropic.com is a guaranteed 401 dressed up as a judgment.
        if not base:
            return "fail", "api: ANTHROPIC_API_KEY not set", "api-error"
        key = ""
    prompt = (f"CRITERION:\n{criterion}\n\nARTIFACT UNDER REVIEW:\n{read_ctx(files)}\n\n"
              "Does the artifact satisfy the criterion? Reason briefly, then give the VERDICT line.")
    # The verdict is taken from a FORCED tool call, not from a line of prose. Measured on a live run:
    # asking a model to end with `VERDICT: PASS` produced the line sometimes and not others for the
    # same artifact and criterion — and a missing line is read as FAIL, so the control's verdict moved
    # with the model's mood rather than with the artifact. `tool_choice` removes the failure mode
    # instead of asking the model more firmly. The prose protocol stays as the fallback for endpoints
    # that ignore tool_choice.
    tool = {"name": "submit_verdict",
            "description": "Return the compliance verdict for the stated criterion.",
            "input_schema": {"type": "object", "properties": {
                "verdict": {"type": "string", "enum": ["pass", "fail"]},
                "reason": {"type": "string", "description": "One or two sentences of justification."},
            }, "required": ["verdict", "reason"]}}
    body = json.dumps({
        "model": MODEL, "max_tokens": MAX_TOKENS, "system": SYSTEM,
        "tools": [tool], "tool_choice": {"type": "tool", "name": "submit_verdict"},
        # Explicit: the Anthropic default is already non-streaming, but a compatible gateway may
        # default the other way, and a streamed body parses as "no verdict" — which the conservative
        # default then reports as FAIL. A control that fails on transport is worse than no control.
        "stream": False,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        (base or "https://api.anthropic.com") + "/v1/messages", data=body,
        headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
        blocks = data.get("content", [])
        text = "".join(p.get("text", "") for p in blocks)
    except Exception as e:  # network/auth/etc — conservative: FAIL, surfaced
        return "fail", f"api error: {e}", "api-error"

    for b in blocks:
        if b.get("type") == "tool_use" and b.get("name") == "submit_verdict":
            got = (b.get("input") or {}).get("verdict", "")
            if got in ("pass", "fail"):
                reason = str((b.get("input") or {}).get("reason", ""))[:300]
                return got, reason or "(no reason given)", f"llm:{MODEL}"
    verdict, answered = "fail", False
    for line in reversed(text.strip().splitlines()):
        u = line.strip().upper()
        if u.startswith("VERDICT:"):
            verdict, answered = ("pass" if "PASS" in u else "fail"), True
            break
    reason = text.strip().splitlines()[-1] if text.strip() else "no response"
    # A judge that never reached a verdict still fails the control — an unproven control is a failed
    # control — but the ledger must not record it as a JUDGMENT. `no-verdict` is the same admission
    # `judge:unavailable(no-diff)` already makes on the other side of the gate: the check could not
    # run, rather than ran and disagreed.
    tag = f"llm:{MODEL}" if answered else f"llm:{MODEL}(no-verdict)"
    if not answered:
        reason = f"no VERDICT line in {len(text)} chars of reply (truncated at max_tokens?): {reason}"
    return verdict, reason[:300], tag


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
