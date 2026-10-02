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

Mode is BOUND to the artifact: each entry records the algorithm it was sealed with (the `mac` field,
inside the hashed body — the algorithm name is not secret). The verifier refuses to validate a chain
under a different mode than it was sealed with. This closes the downgrade attack: re-sealing a keyed
chain in plain sha256 (which needs no key) is caught by an auditor holding the key (mac=sha256 while a
key is set → REFUSED), and a keyed chain checked without the key is REFUSED with "set RELAY_LEDGER_KEY"
rather than silently accepted as plain. Legacy ledgers without a `mac` field are treated as plain.

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


def unique_object(pairs):
    """Reject duplicate decoded keys in every object, including escaped equivalents."""
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError(f"duplicate JSON key {key!r}")
        out[key] = value
    return out


def reject_constant(token):
    raise ValueError(f"non-JSON constant {token!r}")


def strict_json_loads(text):
    """Decode JSON without duplicate keys or non-JSON constants."""
    return json.loads(text, object_pairs_hook=unique_object, parse_constant=reject_constant)


def body_bytes(line: str):
    """Recover exact signed body bytes, never reserialize the decoded object.

    Call only after duplicate-free decoding, final root h order and digest type validation.
    The writer appends h last with `,"h":`. Verify that the located delimiter starts only
    that final root member, not a nested data.h whose spelling happened to match.
    """
    idx = line.rfind(',"h":')
    if idx == -1:
        return None
    try:
        suffix = strict_json_loads("{" + line[idx + 1:])
    except ValueError:
        return None
    if list(suffix) != ["h"]:
        return None
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
    except (OSError, UnicodeError) as e:
        print(f"BROKEN ledger: cannot read {path} ({e})")
        return 1

    mode = "KEYED (HMAC-SHA256)" if KEY else "PLAIN (SHA-256)"
    prev = "GENESIS"
    checklist = 0
    last_event = None
    for n, line in enumerate(lines):  # n is the expected seq (0-based)
        try:
            entry = strict_json_loads(line)
        except ValueError as e:
            print(f"BROKEN line {n + 1}: invalid or ambiguous JSON ({e})")
            return 1
        if not isinstance(entry, dict):
            print(f"BROKEN line {n + 1}: entry must be a JSON object")
            return 1
        if "h" not in entry:
            print(f"TAMPERED line {n + 1}: missing h field (malformed or truncated entry)")
            return 1
        if next(reversed(entry)) != "h":
            print(f"TAMPERED line {n + 1}: h must be the final root member (unsigned fields after h)")
            return 1
        h = entry["h"]
        if not isinstance(h, str) or len(h) != 64 or any(c not in "0123456789abcdef" for c in h):
            print(f"TAMPERED line {n + 1}: h must be a SHA-256 hex string")
            return 1
        body = body_bytes(line)
        if body is None:
            print(f"TAMPERED line {n + 1}: missing final root h delimiter")
            return 1
        # Mode binding: the line records the MAC algorithm it was sealed with (`mac`; absent on legacy
        # ledgers, treated as plain sha256). Refuse to validate it under a DIFFERENT mode — this is what
        # catches a keyed chain re-sealed in plain (downgrade), and tells an auditor when a key is needed
        # instead of reporting a bare "TAMPERED".
        stamped = entry.get("mac", "sha256")
        expected = "hmac-sha256" if KEY else "sha256"
        if stamped != expected:
            if stamped == "hmac-sha256" and not KEY:
                print(f"REFUSED line {n + 1}: this is a KEYED chain (mac=hmac-sha256) — set "
                      "RELAY_LEDGER_KEY to verify it. Validating it as plain would accept a forgery.")
            elif stamped == "sha256" and KEY:
                print(f"REFUSED line {n + 1}: a key is set but this entry is sealed PLAIN (mac=sha256) "
                      "— possible downgrade of a keyed chain. Refusing to accept it as intact.")
            else:
                print(f"TAMPERED line {n + 1}: unknown MAC algorithm {stamped!r}")
            return 1
        if not hmac.compare_digest(mac(body), h):
            print(f"TAMPERED line {n + 1}: MAC mismatch under {mode}")
            if KEY:
                print("   (wrong key, or the line was altered — both fail identically by design)")
            return 1
        if entry.get("prev") != prev:
            print(f"TAMPERED line {n + 1}: broken link (prev={entry.get('prev')!r}, expected {prev!r})")
            print("   -> a preceding line was altered, removed, or reordered.")
            return 1
        if type(entry.get("seq")) is not int or entry["seq"] != n:
            print(f"TAMPERED line {n + 1}: seq={entry.get('seq')!r}, expected {n}")
            return 1
        if not isinstance(entry.get("event"), str) or not entry["event"].strip():
            print(f"BROKEN line {n + 1}: event must be a nonempty string")
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
