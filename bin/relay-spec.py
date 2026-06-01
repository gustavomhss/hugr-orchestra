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
    a = ap.parse_args()

    specs = a.specs
    if a.mode == "list":
        return cmd_list(specs)
    if a.mode == "show":
        return cmd_show(specs, a.id)
    if a.mode == "instantiate":
        return cmd_instantiate(specs, a.id, a.param, a.out)
    return 1


if __name__ == "__main__":
    sys.exit(main())
