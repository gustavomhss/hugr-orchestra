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
# Chars of context per file. 16000 silently cut a 24k-char diff in half on a live run: the judge was
# asked whether a review described a change, shown the first two thirds of that change, and failed the
# review for claims the visible part did not support. The artifact was right and the FAIL was
# transport. Modern context windows make a conservative cap the more dangerous choice.
MAX_CTX = int(os.environ.get("RELAY_JUDGE_MAX_CTX", "120000"))
# Reply budget. `max_tokens` is a cap, not a spend, so a generous default costs nothing on a model
# that answers briefly and fixes a real failure on one that does not. Measured on a live run: at 512
# and at 2048 a reasoning model burned the whole budget on internal thinking and returned an EMPTY
# content list with stop_reason `max_tokens` — no verdict, no tool call, nothing. That reads as a
# failed control, and the failure came from the transport, not from the artifact. At 8192 the same
# model, artifact and criterion answered correctly in both directions.
MAX_TOKENS = int(os.environ.get("RELAY_JUDGE_MAX_TOKENS", "8192"))
# How many independent samples to take before returning a verdict. A discursive control is NOISY —
# measured on a live run: the same model, the same criterion and the same artifact returned pass and
# fail on repeat, and a control that flips on identical input is not fit to BLOCK a chain on one draw.
# The answer is to sample it, not to weaken the criterion or to demote the control. Majority wins; a
# tie fails, because an unproven control is a failed control. The tally goes in the backend tag so the
# ledger records how close the call was rather than hiding it behind a single word.
VOTES = max(1, int(os.environ.get("RELAY_JUDGE_VOTES", "1")))

SYSTEM = (
    "You are an INDEPENDENT compliance auditor. You did NOT write the artifact under review. "
    "Judge ONLY whether the stated criterion is satisfied by the provided artifact — nothing else. "
    "Be strict and literal. If the evidence is missing, ambiguous, or you are uncertain, return FAIL: "
    "an unproven control is a failed control. End your reply with a final line that is exactly "
    "'VERDICT: PASS' or 'VERDICT: FAIL'."
)


TRUNCATED = []   # basenames cut by MAX_CTX on the last read_ctx call


def read_ctx(files):
    """Read the artifacts, and never cut one silently.

    A judge shown two thirds of a diff answers about two thirds of a diff, and its FAIL is
    indistinguishable from one about the artifact. So a cut is announced twice: to the model, which
    can then say the evidence is incomplete, and to the caller, which tags the verdict."""
    del TRUNCATED[:]
    parts = []
    for f in files:
        try:
            with open(f) as fh:
                body = fh.read(MAX_CTX + 1)
        except OSError:
            body = "(file not found)"
        name = os.path.basename(f)
        if len(body) > MAX_CTX:
            body = body[:MAX_CTX] + (
                f"\n\n[TRUNCATED at {MAX_CTX} characters — the rest of {name} was NOT shown to you. "
                "If the criterion cannot be decided from what is here, return FAIL and say so.]")
            TRUNCATED.append(name)
        parts.append(f"--- {name} ---\n{body}")
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
    """One verdict, from VOTES independent samples."""
    if VOTES == 1:
        return _judge_api_once(criterion, files)
    tally, reasons, tags = [], [], []
    for _ in range(VOTES):
        v, why, tag = _judge_api_once(criterion, files)
        if tag.startswith("api-error") or tag.endswith("(no-verdict)"):
            # Not a vote. A transport failure or a reply that never reached a verdict says nothing
            # about the artifact, and counting it would let the plumbing outvote the evidence — the
            # failure mode this whole tagging effort exists to remove. Truncation is NOT in this list:
            # a cut artifact still yields a real judgment on what was shown, and the tag records that.
            return v, why, tag
        tally.append(v); reasons.append(why); tags.append(tag)
    passes = tally.count("pass")
    verdict = "pass" if passes * 2 > len(tally) else "fail"
    base = tags[0].split("(")[0]
    extra = "".join(sorted({t[t.index("("):] for t in tags if "(" in t}))
    reason = f"{passes}/{len(tally)} passed · " + (reasons[tally.index(verdict)] if verdict in tally
                                                  else reasons[0])
    return verdict, reason[:300], f"{base}(votes:{passes}/{len(tally)}){extra}"


def _judge_api_once(criterion, files):
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
                tag = f"llm:{MODEL}"
                if TRUNCATED:
                    tag += f"(truncated:{','.join(TRUNCATED)})"
                return got, reason or "(no reason given)", tag
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
    if TRUNCATED:
        # The ledger must not read a verdict on a partial artifact as a verdict on the artifact.
        tag += f"(truncated:{','.join(TRUNCATED)})"
    if not answered:
        reason = f"no VERDICT line in {len(text)} chars of reply (truncated at max_tokens?): {reason}"
    return verdict, reason[:300], tag


def judge_cli(criterion, files):
    """One verdict from the `claude` CLI, authenticated by the local session (no API key).

    The gate runs the judge as a SUBPROCESS, so it cannot reach an in-process agent tool. When the
    judge must be a strong model rather than whatever a gateway will serve for free, this is the
    bridge. Same voting contract as judge_api: VOTES independent samples, majority wins, and a CLI
    or transport failure is NOT a vote — it aborts the ballot rather than letting the plumbing
    outvote the evidence."""
    if VOTES == 1:
        return _judge_cli_once(criterion, files)
    tally, reasons, tags = [], [], []
    for _ in range(VOTES):
        v, why, tag = _judge_cli_once(criterion, files)
        if tag.startswith("cli-error") or tag.endswith("(no-verdict)"):
            return v, why, tag
        tally.append(v); reasons.append(why); tags.append(tag)
    passes = tally.count("pass")
    verdict = "pass" if passes * 2 > len(tally) else "fail"
    base = tags[0].split("(")[0]
    extra = "".join(sorted({t[t.index("("):] for t in tags if "(" in t}))
    reason = f"{passes}/{len(tally)} passed \u00b7 " + (reasons[tally.index(verdict)] if verdict in tally
                                                   else reasons[0])
    return verdict, reason[:300], f"{base}(votes:{passes}/{len(tally)}){extra}"


def _judge_cli_once(criterion, files):
    import subprocess
    prompt = (f"CRITERION:\n{criterion}\n\nARTIFACT UNDER REVIEW:\n{read_ctx(files)}\n\n"
              "Does the artifact satisfy the criterion? Reason briefly, then give the VERDICT line.")
    try:
        r = subprocess.run(["claude", "-p", prompt, "--model", MODEL,
                            "--append-system-prompt", SYSTEM],
                           capture_output=True, text=True, timeout=300)
    except Exception as e:
        return "fail", f"cli error: {e}", "cli-error"
    if r.returncode != 0:
        return "fail", f"cli exit {r.returncode}: {(r.stderr or '').strip()[:160]}", "cli-error"
    text = (r.stdout or "").strip()
    verdict, answered = "fail", False
    for line in reversed(text.splitlines()):
        u = line.strip().upper()
        if u.startswith("VERDICT:") or u.endswith("VERDICT: PASS") or u.endswith("VERDICT: FAIL"):
            verdict, answered = ("pass" if "PASS" in u else "fail"), True
            break
    reason = (text.splitlines()[-1] if text else "no response")
    tag = f"cli:{MODEL}" if answered else f"cli:{MODEL}(no-verdict)"
    if TRUNCATED:
        tag += f"(truncated:{','.join(TRUNCATED)})"
    if not answered:
        reason = f"no VERDICT line in {len(text)} chars of CLI reply: {reason}"
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
    elif backend == "cli":
        verdict, reason, tag = judge_cli(args.criterion, args.file)
    else:
        verdict, reason, tag = judge_api(args.criterion, args.file)
    print(json.dumps({"verdict": verdict, "reason": reason, "backend": tag}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
