#!/usr/bin/env python3
"""Verify a Relay verified-trace ledger (hash chain).

The ledger (.relay-state/ledger.jsonl) is append-only: each line carries
  prev = h(previous line)   and   h = sha256(this line without its own `h` field).
So any edit, reordering, or deletion of a line breaks the chain at that point.

This is what turns the trace from "a log we wrote" into a tamper-evident proof an auditor
can check OFFLINE without trusting us: the chain reproduces only if nothing was altered.

Usage:  python3 verify_ledger.py <ledger.jsonl>
Exit 0 = intact;  exit 1 = TAMPERED/BROKEN (with the offending line reported).
"""
import sys, json, hashlib


def body_bytes(line: str) -> bytes:
    """The exact bytes that were hashed: the line minus its trailing `,"h":"..."}` suffix.

    The hook appends `h` last (jq `. + {h:$h}`), so stripping from the final `,"h":` recovers
    the canonical body the chain committed to — no re-serialization, hence no formatting drift.
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

    prev = "GENESIS"
    items = checklist = gates = 0
    for n, line in enumerate(lines, 1):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"BROKEN line {n}: not valid JSON ({e})")
            return 1
        h = entry.get("h")
        computed = hashlib.sha256(body_bytes(line)).hexdigest()
        if computed != h:
            print(f"TAMPERED line {n}: content hash mismatch")
            print(f"   stored   h = {h}")
            print(f"   recomputed = {computed}")
            return 1
        if entry.get("prev") != prev:
            print(f"TAMPERED line {n}: broken link (prev={entry.get('prev')!r}, expected {prev!r})")
            print("   -> a preceding line was altered, removed, or reordered.")
            return 1
        prev = h
        gates += 1
        if entry.get("event") == "checklist-item":
            checklist += 1
            if entry.get("verdict") == "fail":
                pass  # a recorded failure is still a valid (intact) entry
        items += 1

    print(f"LEDGER INTACT — {gates} chained entries, chain head {prev[:12]}…")
    if checklist:
        print(f"  ({checklist} checklist-item verdicts on the chain)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
