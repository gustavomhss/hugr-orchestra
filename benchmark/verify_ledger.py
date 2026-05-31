#!/usr/bin/env python3
"""Verify a Relay verified-trace ledger (hash chain).

The ledger (.relay-state/ledger.jsonl) is append-only. Each line carries
  prev = h(previous line),  seq = its 0-based position,  and
  h    = MAC of the line without its own `h` field, where MAC is:
           HMAC-SHA256(key, body)   if RELAY_LEDGER_KEY is set   (KEYED mode)
           SHA-256(body)            otherwise                    (PLAIN mode)

What each mode actually guarantees — stated honestly, because "tamper-evident" is a claim:

  PLAIN (no key):  detects any IN-PLACE edit, reorder, or middle-deletion (the broken link shows).
                   It does NOT make the trace unforgeable: anyone holding the file can recompute every
                   hash and rewrite the whole chain from genesis. Plain mode is integrity-against-
                   accident / lazy-tampering, NOT against a motivated party with write access.
  KEYED (RELAY_LEDGER_KEY):  the MAC depends on a secret, so a party without the key cannot edit,
                   rewrite, append, or re-seal anything. This is the mode for an actual adversary.

Tail-truncation (dropping trailing lines) leaves a valid prefix in BOTH modes — only an out-of-band
anchor of the latest head can rule it out. So we also report `seq` count and whether the trace ends
in a terminal event (sprint-complete / escalate); a non-terminal end is flagged as possible truncation.

Usage:  [RELAY_LEDGER_KEY=...] python3 verify_ledger.py <ledger.jsonl>
Exit 0 = chain intact;  1 = TAMPERED/BROKEN.
"""
import sys, os, json, hashlib, hmac

KEY = os.environ.get("RELAY_LEDGER_KEY")
TERMINAL = {"sprint-complete", "escalate"}


def mac(body: bytes) -> str:
    if KEY:
        return hmac.new(KEY.encode(), body, hashlib.sha256).hexdigest()
    return hashlib.sha256(body).hexdigest()


def body_bytes(line: str) -> bytes:
    """Exact bytes that were MAC'd: the line minus its trailing `,"h":"..."}` suffix.

    `h` is always appended last (jq `. + {h:$h}`), so stripping from the final `,"h":` recovers
    the canonical body with no re-serialization — hence no formatting drift.
    """
    idx = line.rfind(',"h":')
    if idx == -1:
        raise ValueError("line has no h field")
    return (line[:idx] + "}").encode()


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: verify_ledger.py <ledger.jsonl>", file=sys.stderr)
        return 2
    path = sys.argv[1]
    try:
        with open(path) as f:
            lines = [ln.rstrip("\n") for ln in f if ln.strip()]
    except FileNotFoundError:
        print(f"no ledger at {path}", file=sys.stderr)
        return 2

    mode = "KEYED (HMAC-SHA256)" if KEY else "PLAIN (SHA-256)"
    prev = "GENESIS"
    checklist = 0
    last_event = None
    for n, line in enumerate(lines):  # n is the expected seq (0-based)
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"BROKEN line {n + 1}: not valid JSON ({e})")
            return 1
        h = entry.get("h")
        computed = mac(body_bytes(line))
        if not h or not hmac.compare_digest(computed, h):
            print(f"TAMPERED line {n + 1}: MAC mismatch under {mode}")
            if KEY:
                print("   (wrong key, or the line was altered — both fail identically by design)")
            return 1
        if entry.get("prev") != prev:
            print(f"TAMPERED line {n + 1}: broken link (prev={entry.get('prev')!r}, expected {prev!r})")
            print("   -> a preceding line was altered, removed, or reordered.")
            return 1
        if entry.get("seq") != n:
            print(f"TAMPERED line {n + 1}: seq={entry.get('seq')!r}, expected {n}")
            return 1
        prev = h
        last_event = entry.get("event")
        if last_event == "checklist-item":
            checklist += 1

    print(f"LEDGER INTACT — {len(lines)} chained entries [{mode}], chain head {prev[:12]}…")
    if checklist:
        print(f"  ({checklist} checklist-item verdicts on the chain)")
    if not KEY:
        print("  NOTE: plain mode is tamper-evident, not unforgeable. Set RELAY_LEDGER_KEY for an "
              "adversary-resistant (keyed) chain.")
    if lines and last_event not in TERMINAL:
        print(f"  NOTE: trace ends on '{last_event}', not a terminal event — possible tail-truncation; "
              "only an out-of-band anchor of the head can rule it out.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
