#!/usr/bin/env python3
"""relay-profile — compile a Protocol Enforcer profile into a Relay v2 sprint.

Relay is the engine; the MCP state machine is a frozen reference whose profiles are the corpus we
migrate from (docs/relay-v2.md). This is the compiler. It is a generalization of the port
experiment's `planning-to-sprint.py`, which proved the idea on one profile.

The state machine is NOT re-authored here. Macro order, sub-state order and the criteria are READ
from the profile and never restated — the family's cardinal rule, and the reason a compiled sprint
can be regenerated rather than maintained.

Exactly one thing changes in translation:

  Protocol Enforcer   a checklist gate passes when a key with the criterion's NAME IS PRESENT in the
                      evidence the executor submitted (`crates/fsm/src/injection.rs`, `is_present`).
                      Running the mechanical check is the executor's job, on its honour — and a real
                      session was MEASURED advancing a gate on evidence whose values read "FAIL".
  Relay               a gate passes when A COMMAND EXITS ZERO, run by the gate itself and recorded
                      with its own verdict, oracle sha and origin on a hash-chained ledger.

THE LOAD-BEARING CLAUSE. A criterion with no command behind it compiles to NOTHING, and
`relay-spec.py lint` then reports the sub-state as ungated. It is never compiled into a placeholder
that passes. A silently-passing placeholder is worse than an admitted hole because it reads as
coverage — and the pressure while authoring a few hundred criteria is precisely to produce one.

The commands live in the profile's own `criteria_map`, not in this file:

    criteria_map:
      default: "plan-check --phase {macro} --criterion {criterion}"   # optional, applies to all
      per_criterion:
        readback_emitted: "test -s plan/{macro}/readback.md"          # beats the default
      per_sub:
        dispatch.hostile_read:                                        # a sub with no criteria
          - {id: hostile-read-approved, assert: "...", cmd: "..."}

They live there so profile and mapping are ONE artifact that cannot fork from itself, and because a
`default` is then an authoring choice on the record rather than something this compiler invented.
The coverage report counts each source separately, so a hand-written control is never passed off as
derived from the profile.

Usage:
  relay-profile.py <profile.yaml> [-o sprint.json] [--qualify-ids] [--check]
  --check    exit 1 if the sprint on disk differs from a fresh compile (same discipline as
             bin/gen-doc-index.py --check; run from the test suite, since this repo has no CI)
"""
import argparse
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:                                              # pragma: no cover - env-dependent
    # Deliberately a dependency rather than a hand-rolled parser. A profile's `system_prompt` is a
    # YAML block scalar carrying the protocol the agent will be judged against; a parser that
    # silently truncates one produces exactly the `inject-missing` failure class, without the error.
    sys.exit("relay-profile needs PyYAML to read profiles:  python3 -m pip install pyyaml")

# Protocol Enforcer's sub-state types, onto the kinds this engine implements (docs/relay-v2.md §2.3).
KIND = {"execute": "execute", "checklist": "gate", "review": "review",
        "inject": "inject", "human_approval": "human"}


def compile_profile(profile, qualify=False):
    """-> (sprint, coverage). coverage rows are (wp_id, pe_type, source, n_controls, unmapped[])."""
    name = profile.get("name", "profile")
    version = profile.get("version", "0")
    origin = f"pe-profile:{name}@{version}"
    cmap = profile.get("criteria_map") or {}
    default_tpl = cmap.get("default")
    per_crit = cmap.get("per_criterion") or {}
    per_sub = cmap.get("per_sub") or {}

    macros, wps, coverage = [], [], []
    for macro in profile.get("pipeline", []):
        if not macro.get("enabled", True):
            continue
        mid = macro["state_id"]
        macros.append({k: v for k, v in (
            ("id", mid),
            ("title", macro.get("name")),
            ("instructions", (macro.get("system_prompt") or "").strip()),
        ) if v})

        for sub in macro.get("sub_states", []):
            if not sub.get("enabled", True):
                continue
            sid = sub["id"]
            wid = f"{mid}.{sid}" if qualify else sid
            ptype = sub.get("type", "execute")
            kind = KIND.get(ptype)
            if kind is None:
                sys.exit(f"relay-profile: {mid}.{sid} declares type {ptype!r}, "
                         f"which maps to no kind this engine implements ({sorted(KIND)})")

            checklist, sources, unmapped = [], set(), []
            for crit in (sub.get("criteria") or []):
                tpl = per_crit.get(crit, default_tpl)
                if not tpl:
                    # Not faked, and not silent: it is reported, and the lint will call the
                    # sub-state ungated.
                    unmapped.append(crit)
                    continue
                checklist.append({
                    "id": crit,
                    "assert": crit,
                    "cmd": tpl.format(macro=mid, sub=sid, criterion=crit),
                    "origin": origin,
                })
                sources.add("per-criterion" if crit in per_crit else "default")

            for c in per_sub.get(f"{mid}.{sid}", []):
                checklist.append({**c, "cmd": c["cmd"].format(macro=mid, sub=sid),
                                  "origin": origin})
                sources.add("hand-mapped")

            wp = {"id": wid, "macro": mid, "kind": kind}
            if sub.get("name"):
                wp["title"] = sub["name"]
            wp["instructions"] = (sub.get("description") or "").strip()
            if kind == "inject":
                # A missing `file` is refused by the engine at run time and by the lint at authoring
                # time; carried through verbatim so both can see it rather than being defaulted here.
                wp["file"] = sub.get("file", "")
            wp["checklist"] = checklist
            wps.append(wp)
            coverage.append((wid, ptype, "+".join(sorted(sources)) or "ungated",
                             len(checklist), unmapped))

    dupes = sorted({w["id"] for w in wps if [x["id"] for x in wps].count(w["id"]) > 1})
    if dupes:
        sys.exit(f"relay-profile: duplicate sub-state ids {dupes} — retry state, keep-best and drift "
                 f"detection all key on the work package id, so two states sharing one would share a "
                 f"budget. Re-run with --qualify-ids to emit them as <macro>.<sub>.")

    sprint = {
        "brief": f"{name} v{version} — {profile.get('description', '')}".strip(),
        "gen": 0,
        # The profile's own per-macro cap, applied by Relay PER WORK PACKAGE. Protocol Enforcer
        # applies it per macro, so a four-sub-state macro gets a larger total budget here. A real
        # semantic difference, recorded rather than smoothed over.
        "retry_budget": max((m.get("max_iterations", 3) for m in profile.get("pipeline", [])),
                            default=3),
        "macros": macros,
        "work_packages": wps,
    }
    return sprint, coverage


def report(profile_path, out_path, coverage, stream=sys.stderr):
    n_ctl = sum(n for _, _, _, n, _ in coverage)
    print(f"compiled {profile_path} -> {out_path}", file=stream)
    print(f"  {len(coverage)} sub-states -> work packages, {n_ctl} controls\n", file=stream)
    print(f"  {'work package':<26} {'pe type':<14} {'controls':<9} source", file=stream)
    for wid, ptype, source, n, _ in coverage:
        print(f"  {wid:<26} {ptype:<14} {n:<9} {source}", file=stream)

    by_source = {}
    for _, _, source, n, _ in coverage:
        for s in source.split("+"):
            by_source[s] = by_source.get(s, 0) + (n if s != "ungated" else 0)
    print("", file=stream)
    for s in ("default", "per-criterion", "hand-mapped"):
        print(f"  {s + ':':<16} {by_source.get(s, 0)} controls", file=stream)

    ungated = [c[0] for c in coverage if c[2] == "ungated"]
    print(f"  {'ungated:':<16} {len(ungated)} sub-states"
          f"{' (' + ', '.join(ungated) + ')' if ungated else ''}", file=stream)

    unmapped = [(wid, c) for wid, _, _, _, u in coverage for c in u]
    if unmapped:
        print(f"\n  UNMAPPED CRITERIA — {len(unmapped)}, compiled to nothing rather than to a "
              f"placeholder that passes:", file=stream)
        for wid, crit in unmapped:
            print(f"    {wid:<26} {crit}", file=stream)
        print("  Give each one a command in the profile's criteria_map, or accept the state as "
              "ungated with your eyes open.", file=stream)


def main():
    ap = argparse.ArgumentParser(description="Compile a Protocol Enforcer profile into a Relay sprint.")
    ap.add_argument("profile")
    ap.add_argument("-o", "--out", default=None, help="write sprint.json here (default: stdout)")
    ap.add_argument("--qualify-ids", action="store_true",
                    help="emit work package ids as <macro>.<sub> (resolves a sub-id collision)")
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if --out differs from a fresh compile; write nothing")
    a = ap.parse_args()

    profile = yaml.safe_load(Path(a.profile).read_text())
    sprint, coverage = compile_profile(profile, qualify=a.qualify_ids)
    rendered = json.dumps(sprint, indent=2) + "\n"

    if a.check:
        if not a.out:
            sys.exit("relay-profile: --check needs --out, the sprint to compare against")
        current = Path(a.out).read_text() if Path(a.out).exists() else ""
        if current != rendered:
            sys.exit(f"relay-profile: {a.out} is STALE — it does not match a fresh compile of "
                     f"{a.profile}. Regenerate it; a compiled artifact that has drifted from its "
                     f"source is two state machines wearing one name.")
        print(f"{a.out} is up to date.")
        return 0

    if a.out:
        Path(a.out).write_text(rendered)
        report(a.profile, a.out, coverage)
    else:
        sys.stdout.write(rendered)
        report(a.profile, "(stdout)", coverage)
    return 0


if __name__ == "__main__":
    sys.exit(main())
