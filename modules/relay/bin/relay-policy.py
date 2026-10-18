#!/usr/bin/env python3
"""
relay-policy — the org guardrail policy layer on top of the arm hook (Roadmap R2).

The arm hook (bin/relay-arm-hook.sh) + the gate core (lib/relay-gate.sh) are the ENFORCEMENT
mechanism: they evaluate each WP's `checklist` of named controls and put every verdict on the
tamper-evident ledger (SPEC §4.1, §7). What they DON'T do is decide which controls every WP must
carry. That is policy — and policy belongs to the org, not the agent that authored the sprint.

A *policy bundle* is a JSON file: a list of checklist controls in the EXACT shape the gate consumes —
`{id, assert, cmd}` (deterministic) or `{id, assert, judge, blocking?}` (semantic). This tool merges
one or more bundles into a sprint by PREPENDING their controls to every work package's checklist, so
an org-mandated Definition of Done is enforced on *every* WP, not just the ones the author remembered.
The output is a plain sprint.json, consumed unchanged by bin/relay-arm-hook.sh / bin/relay-gate.

  relay-policy.py apply --bundle a.json [--bundle b.json ...] --sprint in.json [-o out.json]
      Prepend the union of the named bundles' controls to each WP's checklist. Dedupe by control id
      (an org control wins over a WP-specific one with the same id). Each injected control is stamped
      with a `policy` field (the bundle name) so the ledger/audit can tell org-mandated from
      WP-specific. Validates every control has a `cmd` or `judge` — rejects otherwise.

  relay-policy.py list [--dir policies/]
      List the available bundles with their control counts.
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
POLICIES_DIR = os.path.normpath(os.path.join(HERE, "..", "policies"))


def die(msg):
    print(f"relay-policy: {msg}", file=sys.stderr)
    sys.exit(1)


def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        die(f"file not found: {path}")
    except json.JSONDecodeError as e:
        die(f"invalid JSON in {path}: {e}")


def validate_control(ctl, where):
    """A control is gate-consumable iff it is an object with an id and a `cmd` OR a `judge`."""
    if not isinstance(ctl, dict):
        die(f"{where}: each control must be a JSON object, got {type(ctl).__name__}")
    if not ctl.get("id"):
        die(f"{where}: control is missing an `id`")
    if not ctl.get("cmd") and not ctl.get("judge"):
        die(f"{where}: control {ctl['id']!r} has neither `cmd` (deterministic) nor `judge` (semantic)")
    # A `cmd` is eval'd verbatim by the gate; it MUST be a single shell string. A list/dict cmd
    # would be passed through and newline-joined/coerced by the gate — reject it here, not there.
    if "cmd" in ctl and not isinstance(ctl["cmd"], str):
        die(f"{where}: control {ctl['id']!r} has a `cmd` that is not a string "
            f"(got {type(ctl['cmd']).__name__}); a cmd must be a single POSIX-sh string")


def load_bundle(path):
    """A bundle is a list of controls, or {controls:[...]} — accept either, validate every control."""
    data = load_json(path)
    if isinstance(data, dict) and "controls" in data:
        controls = data["controls"]
    else:
        controls = data
    if not isinstance(controls, list):
        die(f"{path}: a bundle must be a list of controls (or an object with a `controls` list)")
    name = os.path.splitext(os.path.basename(path))[0]
    for ctl in controls:
        validate_control(ctl, f"bundle {name}")
    return name, controls


def merge_controls(bundles):
    """Union the bundles' controls in order, dedupe by id (first bundle to name an id wins), stamp
    each with the `policy` (bundle) it came from. Returns the ordered list of org controls."""
    seen = set()
    merged = []
    for name, controls in bundles:
        for ctl in controls:
            cid = ctl["id"]
            if cid in seen:
                continue
            seen.add(cid)
            stamped = dict(ctl)
            stamped["policy"] = name
            merged.append(stamped)
    return merged


def cmd_apply(args):
    if not args.bundle:
        die("apply needs at least one --bundle")
    bundles = [load_bundle(b) for b in args.bundle]
    org_controls = merge_controls(bundles)
    org_ids = {c["id"] for c in org_controls}

    sprint = load_json(args.sprint)
    if not isinstance(sprint, dict) or not isinstance(sprint.get("work_packages"), list):
        die(f"{args.sprint}: not a sprint (expected an object with a `work_packages` list)")

    injected = 0
    for wp in sprint["work_packages"]:
        if not isinstance(wp, dict):
            die(f"{args.sprint}: each work package must be a JSON object")
        existing = wp.get("checklist")
        # A `checklist` must be a list (or absent). A bare string/number/object is malformed sprint
        # input: iterating it would silently explode a string into per-char entries, iterate an
        # object's keys, or crash on a scalar. Fail cleanly via die() like every other bad-input path.
        if existing is None:
            existing = []
        elif not isinstance(existing, list):
            die(f"{args.sprint}: work package {wp.get('id')!r} has a `checklist` that is not a list "
                f"(got {type(existing).__name__})")
        # Drop any WP-specific control whose id an org control claims: org controls win. Also strip a
        # `policy` stamp off KEPT (non-org) controls — only relay-policy is allowed to stamp provenance,
        # so a sprint author can't forge org-provenance on a WP-specific control.
        kept = [{k: v for k, v in c.items() if k != "policy"} if isinstance(c, dict) else c
                for c in existing if not (isinstance(c, dict) and c.get("id") in org_ids)]
        # Prepend the org controls (fresh copies, so WPs don't share mutable dicts).
        wp["checklist"] = [dict(c) for c in org_controls] + kept
        injected += len(org_controls)

    out = json.dumps(sprint, indent=2)
    if args.out:
        with open(args.out, "w") as f:
            f.write(out + "\n")
        print(f"applied {len(org_controls)} org control(s) x {len(sprint['work_packages'])} WP(s) "
              f"-> {args.out}", file=sys.stderr)
    else:
        print(out)
    return 0


def cmd_list(args):
    d = args.dir
    if not os.path.isdir(d):
        print(f"(no bundle directory at {d})", file=sys.stderr)
        return 0
    names = sorted(n for n in os.listdir(d) if n.endswith(".json"))
    if not names:
        print(f"(no bundles under {d})", file=sys.stderr)
        return 0
    print(f"{'bundle':<28} {'controls':>8}")
    for n in names:
        try:
            _, controls = load_bundle(os.path.join(d, n))
        except SystemExit:
            # A malformed bundle shouldn't make `list` unusable — surface it, keep going.
            print(f"{os.path.splitext(n)[0]:<28} {'INVALID':>8}")
            continue
        print(f"{os.path.splitext(n)[0]:<28} {len(controls):>8}")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Merge org guardrail policy bundles into a sprint.")
    sub = ap.add_subparsers(dest="mode", required=True)

    p_apply = sub.add_parser("apply", help="prepend bundle controls to every WP's checklist")
    p_apply.add_argument("--bundle", action="append", default=[],
                         help="a policy bundle JSON file (repeatable)")
    p_apply.add_argument("--sprint", required=True, help="the input sprint.json")
    p_apply.add_argument("-o", "--out", default=None, help="output file (default: stdout)")
    p_apply.set_defaults(func=cmd_apply)

    p_list = sub.add_parser("list", help="list available bundles with control counts")
    p_list.add_argument("--dir", default=POLICIES_DIR, help="bundle directory (default: policies/)")
    p_list.set_defaults(func=cmd_list)

    a = ap.parse_args()
    return a.func(a)


if __name__ == "__main__":
    sys.exit(main())
