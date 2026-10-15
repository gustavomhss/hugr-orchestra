#!/usr/bin/env python3
"""
relay-spec — the executable-spec library (Relay Roadmap R3).

Hand-writing a sprint.json per project is the authoring tax R2/auto-decompose already attacks; R3
closes the loop with REUSE. A *spec* is a versioned, parameterized sprint you author once and
instantiate many times: a generic "make this suite green" or "scaffold a Python package" template
whose project-specific bits (test path, package name) are `${param}` placeholders. Author-once,
ratchet-many.

On disk a spec is a directory under specs/<id>/ holding two files:
  - sprint.json — a normal Relay sprint (SPEC §3 schema: brief, retry_budget, work_packages[] with
                  id/title/instructions and a checklist[] of {id, cmd|judge}) — but with `${param}`
                  placeholders anywhere in the text (brief, instructions, assert, cmd).
  - meta.json   — {id, title, description, version, params?}. `params` is an optional list of param
                  specs: {name, description?, default?} (or a bare "name" string).

`relay-spec.py` renders a spec into a runnable sprint.json that the Relay hook / bin/relay-gate
consume UNCHANGED — same on-disk control format as the auto-decomposer's output.

Usage:
  relay-spec.py [--specs DIR] list                     # catalog: id, version, title
  relay-spec.py [--specs DIR] show <id>                # meta + WP titles + declared params
  relay-spec.py [--specs DIR] instantiate <id> [--param k=v ...] [-o sprint.json]
      # render the spec, substitute every ${k}, fail loudly if any ${param} is left unsupplied,
      # emit a schema-valid sprint.json (stdout, or -o FILE).

--specs defaults to $RELAY_SPECS_DIR, else the specs/ catalog shipped next to this tool.
Pure stdlib. The catalog is data; this tool never runs a control — it only renders.

Safety: the rendered sprint is consumed UNCHANGED by a gate that runs each control via `eval`. So a
param value landing in a `cmd` field is shell-quoted at render time (shlex), making it inert data —
authors do NOT need to (and should not) hand-quote `${params}` inside a cmd. Spec ids are required
to be a single catalog entry name (no path separators / traversal), so a crafted id can't make the
tool render an un-reviewed sprint.json from outside the catalog.
"""
import argparse
import json
import os
import re
import shlex
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SPECS = os.environ.get("RELAY_SPECS_DIR", os.path.join(HERE, "..", "specs"))

# A placeholder is ${name} with a slug-style name. Kept deliberately strict so that a stray "$" or
# a shell ${VAR:-default} in a cmd is not mistaken for a relay param.
PARAM_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def die(msg):
    print(f"relay-spec: {msg}", file=sys.stderr)
    sys.exit(1)


def spec_dir(specs, spec_id):
    # The catalog is data we authored: a spec id must name a single directory *inside* the catalog,
    # never escape it. Reject anything that isn't one safe path segment (no separators, no '.'/'..',
    # not absolute) so a crafted id can't make us load an un-reviewed sprint.json from elsewhere on
    # disk (which would then flow into the gate's eval).
    if (
        not spec_id
        or os.path.isabs(spec_id)
        or os.sep in spec_id
        or (os.altsep and os.altsep in spec_id)
        or spec_id in (os.curdir, os.pardir)
    ):
        die(f"invalid spec id {spec_id!r}: must be a single catalog entry name, not a path")
    return os.path.join(specs, spec_id)


def load_spec(specs, spec_id):
    """Return (meta, sprint) for a spec id, or die clearly if anything is missing/malformed."""
    d = spec_dir(specs, spec_id)
    if not os.path.isdir(d):
        die(f"no such spec: {spec_id!r} (looked in {specs})")
    meta_p = os.path.join(d, "meta.json")
    sprint_p = os.path.join(d, "sprint.json")
    for p in (meta_p, sprint_p):
        if not os.path.isfile(p):
            die(f"spec {spec_id!r} is incomplete: missing {os.path.basename(p)}")
    try:
        meta = json.load(open(meta_p))
    except (json.JSONDecodeError, OSError) as e:
        die(f"spec {spec_id!r}: meta.json is not valid JSON ({e})")
    try:
        sprint = json.load(open(sprint_p))
    except (json.JSONDecodeError, OSError) as e:
        die(f"spec {spec_id!r}: sprint.json is not valid JSON ({e})")
    return meta, sprint


def iter_specs(specs):
    """Yield (id, meta) for every well-formed spec dir under `specs`, ordered by id."""
    if not os.path.isdir(specs):
        return
    for name in sorted(os.listdir(specs)):
        d = os.path.join(specs, name)
        meta_p = os.path.join(d, "meta.json")
        sprint_p = os.path.join(d, "sprint.json")
        if not (os.path.isfile(meta_p) and os.path.isfile(sprint_p)):
            continue
        try:
            meta = json.load(open(meta_p))
        except (json.JSONDecodeError, OSError):
            continue
        yield name, meta


def declared_params(meta):
    """Normalize meta['params'] into an ordered list of {name, description, default} dicts."""
    out = []
    for p in meta.get("params", []) or []:
        if isinstance(p, str):
            out.append({"name": p, "description": "", "default": None})
        elif isinstance(p, dict) and p.get("name"):
            out.append({
                "name": p["name"],
                "description": p.get("description", ""),
                "default": p.get("default"),
            })
        else:
            die(f"malformed param entry in meta.json: {p!r}")
    return out


def placeholders_in(sprint):
    """Every distinct ${name} that appears anywhere in the sprint's text, in first-seen order."""
    seen = []
    for tok in PARAM_RE.findall(json.dumps(sprint)):
        if tok not in seen:
            seen.append(tok)
    return seen


# Fields whose rendered string is later handed to a shell (`eval "$cmd"` in lib/relay-gate.sh).
# A param value substituted into one of these is DATA, not shell — it must be shell-quoted so a
# value containing a quote/`;`/`$(...)`/backtick cannot break out of the spec's quoting and inject
# arbitrary commands (which the gate would both execute and report as a forged PASS).
SHELL_FIELDS = frozenset({"cmd"})


def shell_safe(value):
    """Render a param value for a shell context as inert DATA.

    A value is treated as a sequence of intended shell *words* (so a multi-word runner like
    "python3 -m pytest" stays three args) but every word is re-quoted via shlex, so any shell
    metacharacter inside it — quote, `;`, `&&`, `$(...)`, backtick, newline — becomes literal text
    and CANNOT break out of the spec's quoting to inject a command. If the value is not even
    parseable as shell words (e.g. an unbalanced quote), fall back to quoting it whole.
    """
    try:
        return shlex.join(shlex.split(value))
    except ValueError:
        return shlex.quote(value)


def _sub_string(s, values, shell_quote):
    """Replace every ${k} in `s` with values[k]. When `shell_quote`, each substituted value is
    rendered shell-safe (see shell_safe) so it is inert in the shell the gate runs."""
    def repl(m):
        k = m.group(1)
        if k not in values:
            return m.group(0)  # unsupplied -> left intact so the caller detects the omission
        v = values[k]
        return shell_safe(v) if shell_quote else v
    return PARAM_RE.sub(repl, s)


def substitute(obj, values, shell_quote=False):
    """Recursively replace ${k} with values[k] in every string in a JSON-like structure.

    Only string LEAVES are touched, so dict keys and structure are preserved. A ${k} with no value
    supplied is left intact, which lets the caller detect the omission after rendering.

    `shell_quote` propagates True into the value of any `cmd` field (see SHELL_FIELDS) so values
    landing in a shell-`eval`'d control are quoted as data, never executed as code. The flag is
    keyed on the dict KEY, so it covers `cmd` strings nested arbitrarily deep.
    """
    if isinstance(obj, str):
        return _sub_string(obj, values, shell_quote)
    if isinstance(obj, list):
        return [substitute(x, values, shell_quote) for x in obj]
    if isinstance(obj, dict):
        return {k: substitute(v, values, shell_quote or k in SHELL_FIELDS)
                for k, v in obj.items()}
    return obj


def parse_params(pairs):
    """--param k=v ... -> {k: v}. Splits on the FIRST '=' so a value may contain '='."""
    values = {}
    for raw in pairs or []:
        if "=" not in raw:
            die(f"--param expects k=v, got {raw!r}")
        k, v = raw.split("=", 1)
        k = k.strip()
        if not k:
            die(f"--param has an empty key: {raw!r}")
        values[k] = v
    return values


# ---- subcommands -------------------------------------------------------------------------------

def cmd_list(specs):
    rows = list(iter_specs(specs))
    if not rows:
        print(f"(no specs found under {specs})", file=sys.stderr)
        return 0
    width = max(len(i) for i, _ in rows)
    for spec_id, meta in rows:
        # Coerce to str: a neighbor whose meta.json has a non-string version/title (e.g. a JSON
        # list) must not crash the whole catalog listing with a format-spec TypeError.
        ver = str(meta.get("version", "?"))
        title = str(meta.get("title", ""))
        print(f"{spec_id:<{width}}  v{ver:<6}  {title}")
    return 0


def cmd_show(specs, spec_id):
    meta, sprint = load_spec(specs, spec_id)
    print(f"{meta.get('id', spec_id)}  (v{meta.get('version', '?')})")
    if meta.get("title"):
        print(f"  {meta['title']}")
    if meta.get("description"):
        print(f"  {meta['description']}")
    wps = sprint.get("work_packages", [])
    print(f"\nwork packages ({len(wps)}):")
    for n, wp in enumerate(wps, 1):
        n_ctrl = len(wp.get("checklist", []))
        print(f"  {n}. {wp.get('id', '?')} — {wp.get('title', '')} ({n_ctrl} controls)")
    declared = declared_params(meta)
    used = placeholders_in(sprint)
    print(f"\nparams ({len(declared)}):")
    if not declared:
        print("  (none declared)")
    for p in declared:
        default = "" if p["default"] is None else f"  [default: {p['default']}]"
        desc = f" — {p['description']}" if p["description"] else ""
        print(f"  ${{{p['name']}}}{desc}{default}")
    # Surface drift: placeholders used in the sprint but never declared in meta.params.
    undeclared = [u for u in used if u not in {p["name"] for p in declared}]
    if undeclared:
        print("\n  note: used in sprint but not declared in meta.params: "
              + ", ".join(f"${{{u}}}" for u in undeclared))
    return 0


def cmd_instantiate(specs, spec_id, param_pairs, out):
    meta, sprint = load_spec(specs, spec_id)
    declared = declared_params(meta)

    # Defaults first, then explicit --param overrides.
    values = {p["name"]: p["default"] for p in declared if p["default"] is not None}
    values.update(parse_params(param_pairs))

    # Missing = placeholders that the SPEC's own text needs but no value (default or --param)
    # supplied. Scan the ORIGINAL sprint, not the rendered output: a supplied value may itself
    # contain a literal ${other} (which we intentionally do NOT re-expand), and re-scanning the
    # rendered text would falsely re-flag `other` as missing.
    missing = [tok for tok in placeholders_in(sprint) if tok not in values]
    if missing:
        die("missing required param(s): "
            + ", ".join(sorted(missing))
            + f"\n  supply with: relay-spec.py instantiate {spec_id} "
            + " ".join(f"--param {m}=..." for m in sorted(missing)))

    rendered = substitute(sprint, values)

    validate_sprint(rendered, spec_id)

    text = json.dumps(rendered, indent=2)
    if out:
        with open(out, "w") as f:
            f.write(text + "\n")
        print(f"wrote sprint -> {out}", file=sys.stderr)
    else:
        print(text)
    return 0


def validate_sprint(sprint, spec_id):
    """Guard that a rendered spec is schema-valid for the hook / bin/relay-gate before it is emitted.

    Checks exactly the shape those consumers require (lib/relay-gate.sh, bin/relay-arm-hook.sh):
    work_packages[] each with an id and a checklist[]; every control has an id and EITHER a cmd
    (deterministic) or a judge (semantic). A spec that doesn't satisfy this would fail silently
    inside the gate later — catch it at render time instead.
    """
    if not isinstance(sprint, dict):
        die(f"spec {spec_id!r}: rendered sprint is not a JSON object")
    wps = sprint.get("work_packages")
    if not isinstance(wps, list) or not wps:
        die(f"spec {spec_id!r}: sprint has no work_packages")
    for n, wp in enumerate(wps):
        if not isinstance(wp, dict) or not wp.get("id"):
            die(f"spec {spec_id!r}: work_packages[{n}] missing an id")
        checklist = wp.get("checklist")
        if not isinstance(checklist, list) or not checklist:
            die(f"spec {spec_id!r}: work package {wp.get('id')!r} has an empty checklist")
        for ctrl in checklist:
            if not isinstance(ctrl, dict) or not ctrl.get("id"):
                die(f"spec {spec_id!r}: a control in {wp['id']!r} is missing an id")
            if not (ctrl.get("cmd") or ctrl.get("judge")):
                die(f"spec {spec_id!r}: control {ctrl['id']!r} in {wp['id']!r} "
                    f"has neither a cmd nor a judge")


# ---- lint (V8 — docs/relay-v2.md §3) -------------------------------------------------------------
# Compiling profiles/planning.yaml onto Relay produced 53 controls and ELEVEN ungated sub-states —
# every `execute` state. Under MCP those states also advanced on nothing, so the port was honest; but
# v2's claim is that a state is EARNED, and a state with no deterministic control is not.
#
# Authoring those controls is the migration's real cost, and the pressure while doing it is to fill a
# hole with something that passes. So this ships before the compiler: built after, it would grade its
# own homework.
#
# It runs offline, and that bounds what it may honestly claim. It compares chain length against the
# DOCUMENTED default cap because it cannot see the agent's environment; the hook's preflight reads
# the live value. Every finding says what it knows, not what it guesses.

# A command that cannot fail is not a control. Normalized before matching so ` : ` and `exit  0` do
# not slip through on whitespace.
TRIVIAL_CMDS = {"true", ":", "exit 0", "test -e .", "test -d .", "echo", "/bin/true"}
KNOWN_KINDS = {"execute", "gate", "review", "inject", "human"}
DEFAULT_BLOCK_CAP = 8


def _trivial(cmd):
    c = " ".join(str(cmd).split())
    return c in TRIVIAL_CMDS


def _norm(text):
    return " ".join(str(text).lower().split()).strip(" .")


def lint_sprint(sprint, allow_ungated=False):
    """Findings, worst first. Each is {category, severity, wp, detail}."""
    out = []
    wps = sprint.get("work_packages") or []
    declared_macros = {m.get("id") for m in (sprint.get("macros") or [])}
    seen_control_ids = {}

    for wp in wps:
        wid = wp.get("id", "?")
        kind = wp.get("kind") or "execute"
        checklist = wp.get("checklist") or []

        if kind not in KNOWN_KINDS:
            out.append({"category": "unknown-kind", "severity": "error", "wp": wid,
                        "detail": f"kind {kind!r} is not one of {sorted(KNOWN_KINDS)}"})
        if kind == "inject" and not (wp.get("file") or wp.get("text")):
            out.append({"category": "inject-without-file", "severity": "error", "wp": wid,
                        "detail": "an inject state with neither `file` nor inline `text` delivers "
                                  "nothing, and the agent is then judged against rules it was never "
                                  "handed"})
        if wp.get("macro") and declared_macros and wp["macro"] not in declared_macros:
            out.append({"category": "undeclared-macro", "severity": "error", "wp": wid,
                        "detail": f"macro {wp['macro']!r} is not in macros[], so its protocol is "
                                  f"never injected"})

        det, advisory = [], []
        for c in checklist:
            cid = c.get("id", "?")
            if cid in seen_control_ids and seen_control_ids[cid] != wid:
                out.append({"category": "duplicate-control-id", "severity": "error", "wp": wid,
                            "detail": f"control id {cid!r} is also used in "
                                      f"{seen_control_ids[cid]!r}; retry state, keep-best and drift "
                                      f"detection all key on it, so one silently stands in for the other"})
            seen_control_ids.setdefault(cid, wid)

            if c.get("cmd"):
                if _trivial(c["cmd"]):
                    out.append({"category": "trivial-control", "severity": "error", "wp": wid,
                                "detail": f"control {cid!r} runs {c['cmd']!r}, which cannot fail — the "
                                          f"state reads as covered, which is worse than an admitted gap"})
                else:
                    det.append(c)
            elif c.get("judge"):
                # A judge verdict never counts as a deterministic control, blocking or not: it is
                # non-independent by construction, and docs/enforcement-model.md §5 allows a
                # discursive control only as an ADDITION to a real oracle. A blocking one at least
                # stops the chain; a non-blocking one is recorded and stops nothing.
                advisory.append(c)
                if not c.get("blocking"):
                    out.append({"category": "advisory-only", "severity": "warn", "wp": wid,
                                "detail": f"control {cid!r} is a non-blocking judge: it is recorded "
                                          f"and it never stops anything"})

        # `inject` has no work of its own, so demanding a control there would train authors to add a
        # trivial one — the lint arguing itself into the failure it exists to catch.
        if kind not in ("inject", "human") and not det:
            out.append({"category": "ungated", "severity": "warn" if allow_ungated else "error",
                        "wp": wid,
                        "detail": "no deterministic control: this state advances on nothing"})

        for q in (wp.get("self_check") or []):
            for c in checklist:
                if c.get("assert") and _norm(q) == _norm(c["assert"]):
                    out.append({"category": "self-check-restates-control", "severity": "warn",
                                "wp": wid,
                                "detail": f"self-check {q!r} asks what control {c.get('id')!r} already "
                                          f"measures; a self-check must probe the protocol's steps"})

    blocks = len(wps) + 1
    if blocks > DEFAULT_BLOCK_CAP:
        out.append({"category": "chain-exceeds-default-cap", "severity": "warn", "wp": None,
                    "detail": f"this chain needs at least {blocks} hook blocks and the documented "
                              f"default cap is {DEFAULT_BLOCK_CAP}; set "
                              f"CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0. This lint cannot see the live "
                              f"value — the hook's preflight reads it at run time"})

    rank = {"error": 0, "warn": 1}
    out.sort(key=lambda f: rank.get(f["severity"], 9))
    return out


def cmd_lint(path, allow_ungated, as_json):
    try:
        sprint = json.load(open(path))
    except (OSError, ValueError) as e:
        die(f"cannot read sprint {path!r}: {e}")
    findings = lint_sprint(sprint, allow_ungated=allow_ungated)
    if as_json:
        print(json.dumps({"sprint": path, "findings": findings}, indent=2))
    elif not findings:
        print(f"lint clean — {path}")
    else:
        print(f"RELAY LINT — {path}\n")
        for f in findings:
            where = f" [{f['wp']}]" if f.get("wp") else ""
            print(f"  {f['severity'].upper():<5} {f['category']}{where}\n        {f['detail']}")
    # Only an error fails the lint. A migration in progress must be able to run its own instrument.
    return 1 if any(f["severity"] == "error" for f in findings) else 0


# ---- amend-check (V11 — docs/relay-v2.md §3) -----------------------------------------------------
# An amendment may add work; it may not quietly shrink what must pass. Two corrections to shipped
# doctrine, both wrong in the intuitive direction, which is why this is a tool and not a paragraph.
#
# LOOSENING IS DEFINED BY EFFECT, NOT ACT TYPE. The original wording made deletion a signed act and
# left "additions" free — but rerouting a control out of reach, moving it behind the cursor,
# splitting one hard control into two weak ones as "decomposition", and adding a state that bypasses
# a control's consequence all shrink the set that must pass, and every one was free under act-type.
# So the rule is the SET:
#
#     loosening = the set of controls that must pass to reach a terminal state shrinks
#
# comparable mechanically, before and after, without anyone judging intent.
#
# COMPLIANCE GRANULARITY IS WHATEVER HAS A RECORDED VERDICT. With the cursor at `m1.sub3`, amending
# `m1.sub2` is both "under the cursor" (m1 is open) and "already passed" (sub2 has a pass). The
# linear criterion answers both ways. A recorded verdict binds; the enclosing macro is irrelevant.
#
# WHAT THIS DOES NOT CLAIM. It cannot rank two commands by strength. The same id under a different
# command is an ORACLE change, which `relay verify` reports from the live chain (V3) — claiming it
# here would be guessing, and a check that guesses gets ignored.


def control_index(sprint):
    """id -> {wp, index, blocking, has_cmd, must_pass}, over EVERY declared control.

    `must_pass` is the membership that matters: a control is in the must-pass set when it has a `cmd`
    or is a blocking judge. A non-blocking judge is recorded and stops nothing, so it was never in
    the set and removing it takes nothing out.

    Indexed over all controls rather than only the members, so that a control which is still declared
    but has DROPPED OUT of the set is diagnosed as disarmed rather than as removed. Both are
    loosening; only the accurate one tells the reader what actually happened.
    """
    out = {}
    for n, wp in enumerate(sprint.get("work_packages") or []):
        for c in (wp.get("checklist") or []):
            if not c.get("id"):
                continue
            out[c["id"]] = {"wp": wp.get("id"), "index": n,
                            "blocking": bool(c.get("blocking")), "has_cmd": bool(c.get("cmd")),
                            "must_pass": bool(c.get("cmd") or c.get("blocking"))}
    return out


def amend_check(before, after, cursor=None):
    """-> (loosening[], notes[]). Each finding is {kind, control, detail}."""
    b, a = control_index(before), control_index(after)
    ids = [w.get("id") for w in (after.get("work_packages") or [])]
    cursor_ix = ids.index(cursor) if cursor in ids else None
    findings, notes = [], []

    for cid, was in b.items():
        if not was["must_pass"]:
            continue                     # it was never in the set; nothing to take out of it
        now = a.get(cid)
        if now is None:
            findings.append({"kind": "control-removed", "control": cid,
                             "detail": f"it had to pass in {was['wp']!r} and is now in no work "
                                       f"package. Splitting it into differently-named controls counts "
                                       f"here too: the control that had to pass is gone."})
            continue
        if was["has_cmd"] and not now["has_cmd"]:
            findings.append({"kind": "oracle-downgraded", "control": cid,
                             "detail": "a deterministic command became a judge — a real oracle "
                                       "replaced by a non-independent opinion under the same name"})
        elif not now["must_pass"]:
            findings.append({"kind": "control-disarmed", "control": cid,
                             "detail": "a blocking judge became advisory: nothing moved and nothing "
                                       "was deleted, it simply stopped being able to stop anything"})
        # A recorded verdict binds. Moving a control BEHIND the cursor means it is never evaluated at
        # a gate again — the act reads as a reorder, the effect is a removal. Moving it FORWARD still
        # requires it to pass, so that is free.
        if cursor_ix is not None and now["index"] < cursor_ix <= was["index"]:
            findings.append({"kind": "moved-behind-cursor", "control": cid,
                             "detail": f"moved from {was['wp']!r} to {now['wp']!r}, which the chain "
                                       f"has already left; it will not be evaluated at a gate again"})

    changed = [cid for cid in set(b) & set(a)
               if _control_cmd(before, cid) != _control_cmd(after, cid)]
    if changed:
        notes.append(f"{len(changed)} control(s) kept their id under a different command "
                     f"({', '.join(sorted(changed))}). Ranking two commands by strength is not "
                     f"mechanically decidable, so it is not claimed here — `relay verify` reports a "
                     f"mid-run change of oracle as ORACLE DRIFT, from the chain rather than the plan.")
    return findings, notes


def _control_cmd(sprint, cid):
    for wp in (sprint.get("work_packages") or []):
        for c in (wp.get("checklist") or []):
            if c.get("id") == cid:
                return c.get("cmd") or c.get("judge")
    return None


def cmd_amend_check(before_path, after_path, cursor, signed_by, as_json):
    try:
        before = json.load(open(before_path))
        after = json.load(open(after_path))
    except (OSError, ValueError) as e:
        die(f"cannot read both sprints: {e}")
    findings, notes = amend_check(before, after, cursor=cursor)
    signed = (signed_by or "").strip()

    if as_json:
        print(json.dumps({"before": before_path, "after": after_path, "cursor": cursor,
                          "loosening": findings, "notes": notes, "signed_by": signed}, indent=2))
    elif not findings:
        print(f"amendment adds work and removes none — {after_path}")
        for n in notes:
            print(f"  note: {n}")
    else:
        print(f"LOOSENING — {after_path}\n")
        for f in findings:
            print(f"  {f['kind']}  {f['control']}\n        {f['detail']}")
        for n in notes:
            print(f"\n  note: {n}")
        if signed:
            print(f"\n  signed by: {signed}")

    if not findings:
        return 0
    # Shrinking the set is not forbidden — it is a SIGNED act. The job here is to make sure it cannot
    # happen by accident, not to make it impossible; an override that does not exist gets replaced by
    # an operator editing the plan out of band, which loses the record entirely.
    if signed_by is not None and not signed:
        die("--signed-by was given with no reason: an unattributed signature is not a signature")
    return 0 if signed else 1


def main():
    ap = argparse.ArgumentParser(description="Relay executable-spec library: list / show / instantiate.")
    ap.add_argument("--specs", default=DEFAULT_SPECS,
                    help="spec catalog dir (default: $RELAY_SPECS_DIR or the shipped specs/)")
    sub = ap.add_subparsers(dest="mode", required=True)
    sub.add_parser("list", help="catalog of available specs")
    sp_show = sub.add_parser("show", help="meta + WP titles + params for one spec")
    sp_show.add_argument("id")
    sp_inst = sub.add_parser("instantiate", help="render a spec into a runnable sprint.json")
    sp_inst.add_argument("id")
    sp_inst.add_argument("--param", action="append", default=[], metavar="k=v",
                         help="bind a ${k} placeholder (repeatable)")
    sp_inst.add_argument("-o", "--out", default=None, help="write sprint.json here (default: stdout)")
    sp_lint = sub.add_parser("lint", help="report what a sprint does NOT gate")
    sp_lint.add_argument("sprint", help="path to a sprint.json")
    sp_lint.add_argument("--allow-ungated", action="store_true",
                         help="downgrade ungated states to warnings (migration in progress)")
    sp_lint.add_argument("--json", action="store_true", dest="as_json")
    sp_am = sub.add_parser("amend-check", help="does an amended plan shrink what must pass?")
    sp_am.add_argument("before"); sp_am.add_argument("after")
    sp_am.add_argument("--cursor", default=None, help="the WP id the chain currently stands on")
    sp_am.add_argument("--signed-by", default=None, metavar="REASON",
                       help="accept a loosening as a signed act, recording who and why")
    sp_am.add_argument("--json", action="store_true", dest="am_json")
    a = ap.parse_args()

    specs = a.specs
    if a.mode == "list":
        return cmd_list(specs)
    if a.mode == "show":
        return cmd_show(specs, a.id)
    if a.mode == "instantiate":
        return cmd_instantiate(specs, a.id, a.param, a.out)
    if a.mode == "lint":
        return cmd_lint(a.sprint, a.allow_ungated, a.as_json)
    if a.mode == "amend-check":
        return cmd_amend_check(a.before, a.after, a.cursor, a.signed_by, a.am_json)
    return 1


if __name__ == "__main__":
    sys.exit(main())
