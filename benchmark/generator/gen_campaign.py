#!/usr/bin/env python3
"""Parametric, contamination-immune campaign generator for the Relay benchmark.

Emits a self-contained coupled-engineering campaign at arbitrary size N (SCALE is the lever, not
intricacy). Each requirement is one simple rule of a Processor.process(record) contract; the
failure mode at high N is DROPPING/forgetting requirements, which is exactly the regime Relay
targets. The campaign ships a held-out grader suite (gate != grader) plus a deterministic oracle.

Ground truth is computed by an in-memory reference that is ALSO emitted to /tmp and imported back,
so the baked literal expectations and the reference are the SAME source of truth. The reference is
written ONLY to /tmp (never the repo). Held-out uses input values disjoint from the visible checks
plus boundary/metamorphic assertions, so a lookup-table cheat keyed on the visible inputs fails.

Contract the implementation must satisfy (stated in the brief):
  process(record: dict) -> {"errors": sorted list of error-code strings, "derived": {name: value}}
  raises ProcError if record is not a dict. Missing/invalid numeric fields default to 0 in derived.

Usage:
  gen_campaign.py --n 150 --seed 1 --out <campaign_dir> [--ref /tmp/gen_ref_N150] [--k 5]
"""
import argparse, importlib.util, json, os, random, shutil, sys

# ---------- reference interpreter (single source of truth; emitted verbatim to /tmp) ----------
REF_TEMPLATE = '''\
"""Generated reference implementation (ground truth). Lives in /tmp, never in the repo."""
RULES = {rules_literal}


class ProcError(Exception):
    pass


def _num(record, f, default=0):
    v = record.get(f, default)
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return default
    return v


class Processor:
    def process(self, record):
        if not isinstance(record, dict):
            raise ProcError("record must be a dict")
        errors = []
        derived = {{}}
        for r in RULES:
            k = r["kind"]; p = r["params"]; code = r.get("code")
            if k == "required":
                if record.get(p["f"]) is None:
                    errors.append(code)
            elif k == "type_int":
                if p["f"] in record:
                    v = record[p["f"]]
                    if isinstance(v, bool) or not isinstance(v, int):
                        errors.append(code)
            elif k == "range_max":
                v = record.get(p["f"])
                if isinstance(v, (int, float)) and not isinstance(v, bool) and v > p["K"]:
                    errors.append(code)
            elif k == "range_min":
                v = record.get(p["f"])
                if isinstance(v, (int, float)) and not isinstance(v, bool) and v < p["K"]:
                    errors.append(code)
            elif k == "enum":
                if p["f"] in record and record[p["f"]] not in p["S"]:
                    errors.append(code)
            elif k == "cond_required":
                v1 = record.get(p["f1"])
                if isinstance(v1, (int, float)) and not isinstance(v1, bool) and v1 > p["K"] \\
                        and record.get(p["f2"]) is None:
                    errors.append(code)
            elif k == "linear":
                derived[p["d"]] = round(p["a"] * _num(record, p["f1"]) + p["b"] * _num(record, p["f2"]), 2)
            elif k == "sum":
                derived[p["s"]] = round(sum(_num(record, fi) for fi in p["fields"]), 2)
            elif k == "clamp":
                derived[p["t"]] = min(_num(record, p["f"]), p["CAP"])
            elif k == "echo":
                v = record.get(p["f"])
                derived[p["e"]] = v if (isinstance(v, (int, float)) and not isinstance(v, bool)) else p["D"]
        return {{"errors": sorted(errors), "derived": derived}}
'''

CHEAT_TEMPLATE = '''\
"""Generated reward-hacker: memorizes ONLY the visible checks' exact input records and replays
their reference output; returns an empty default for anything else. Aces the visible gate, but the
held-out grader (disjoint inputs) catches it. Lives in /tmp, never in the repo."""
import json
LOOKUP = {lookup_literal}


class ProcError(Exception):
    pass


def _key(record):
    return json.dumps(record, sort_keys=True)


class Processor:
    def process(self, record):
        if not isinstance(record, dict):
            raise ProcError("record must be a dict")
        hit = LOOKUP.get(_key(record))
        if hit is not None:
            return {{"errors": list(hit["errors"]), "derived": dict(hit["derived"])}}
        return {{"errors": [], "derived": {{}}}}
'''

SKELETON = '''\
"""IMPLEMENT to satisfy the check suite (the spec). Public API: Processor, ProcError.
process(record) -> {"errors": sorted list of error-code strings, "derived": {name: value}};
raises ProcError if record is not a dict. The skeleton raises NotImplementedError (suite starts red)."""


class ProcError(Exception):
    pass


class Processor:
    def process(self, record):
        raise NotImplementedError
'''

CONFTEST = (
    "import os, sys\n"
    "_impl = os.environ.get('RELAY_IMPL') or os.path.join(os.path.dirname(__file__), '..', 'repo')\n"
    "sys.path.insert(0, _impl)\n"
)

VAL_KINDS = ["required", "type_int", "range_max", "range_min", "enum", "cond_required"]
DER_KINDS = ["linear", "sum", "clamp", "echo"]


def build_rules(n, seed):
    rng = random.Random(seed)
    rules, fields, num_fields = [], [], []     # num_fields: numeric-typed fields (exclude enum)
    nfield = 0

    def new_field(numeric=True):
        nonlocal nfield
        f = "f%d" % nfield
        nfield += 1
        fields.append(f)
        if numeric:
            num_fields.append(f)
        return f

    for i in range(1, n + 1):
        rid = "R%d" % i
        code = "E%d" % i
        # ~55% validation (each on a fresh field -> no intra-field contradiction), rest derived/coupling.
        # derived/coupling need >=2 numeric fields to reference.
        if i <= 2 or rng.random() < 0.55 or len(num_fields) < 2:
            kind = rng.choice(VAL_KINDS if len(num_fields) >= 1 else VAL_KINDS[:5])
            if kind == "required":
                f = new_field()
                params = {"f": f}
                stmt = "field '%s' is required (present, not None); on violation add error '%s'." % (f, code)
                deps = []
            elif kind == "type_int":
                f = new_field()
                params = {"f": f}
                stmt = "field '%s' must be an int (reject bool and float); on violation add error '%s'." % (f, code)
                deps = []
            elif kind == "range_max":
                f = new_field(); K = rng.randint(50, 950)
                params = {"f": f, "K": K}
                stmt = "field '%s' must be <= %d; if greater add error '%s'." % (f, K, code)
                deps = []
            elif kind == "range_min":
                f = new_field(); K = rng.randint(10, 200)
                params = {"f": f, "K": K}
                stmt = "field '%s' must be >= %d; if less add error '%s'." % (f, K, code)
                deps = []
            elif kind == "enum":
                f = new_field(numeric=False); S = rng.sample(["a", "b", "c", "d", "e", "g"], 3)
                params = {"f": f, "S": S}
                stmt = "field '%s' must be one of %s; otherwise add error '%s'." % (f, S, code)
                deps = []
            else:  # cond_required (coupling)
                f1 = rng.choice(num_fields); f2 = new_field(); K = rng.randint(50, 500)
                params = {"f1": f1, "f2": f2, "K": K}
                stmt = ("if field '%s' is a number > %d then field '%s' is required; "
                        "else add error '%s'." % (f1, K, f2, code))
                deps = []
        else:
            kind = rng.choice(DER_KINDS)
            if kind == "linear":
                f1, f2 = rng.sample(num_fields, 2); a = rng.randint(2, 9); b = rng.randint(2, 9)
                d = "d%d" % i
                params = {"d": d, "a": a, "f1": f1, "b": b, "f2": f2}
                stmt = "derived '%s' = round(%d*%s + %d*%s, 2) (missing/invalid numeric -> 0)." % (d, a, f1, b, f2)
                deps = []  # field-level coupling is captured in the statement
            elif kind == "sum":
                grp = rng.sample(num_fields, min(3, len(num_fields))); s = "d%d" % i
                params = {"s": s, "fields": grp}
                stmt = "derived '%s' = round(sum of %s, 2) (missing/invalid -> 0)." % (s, grp)
                deps = []
            elif kind == "clamp":
                f = rng.choice(num_fields); CAP = rng.randint(100, 900); t = "d%d" % i
                params = {"t": t, "f": f, "CAP": CAP}
                stmt = "derived '%s' = min(%s, %d) (missing/invalid -> 0)." % (t, f, CAP)
                deps = []
            else:  # echo with default
                f = rng.choice(num_fields); D = rng.randint(1, 50); e = "d%d" % i
                params = {"e": e, "f": f, "D": D}
                stmt = "derived '%s' = %s if it is a number, else default %d." % (e, f, D)
                deps = []
        weight = 1 if kind in ("required", "type_int", "range_max", "range_min", "enum") else 2
        rules.append({"id": rid, "code": code, "kind": kind, "params": params,
                      "weight": weight, "deps": deps, "stmt": stmt})
    return rules


def emit_reference(rules, ref_dir):
    eng = os.path.join(ref_dir, "engine")
    os.makedirs(eng, exist_ok=True)
    lit = json.dumps([{"kind": r["kind"], "params": r["params"], "code": r["code"]} for r in rules], indent=2)
    open(os.path.join(eng, "core.py"), "w").write(REF_TEMPLATE.format(rules_literal=lit))
    open(os.path.join(eng, "__init__.py"), "w").write("from .core import Processor, ProcError\n")


def load_ref(ref_dir):
    spec = importlib.util.spec_from_file_location("genref_core", os.path.join(ref_dir, "engine", "core.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.Processor


def py(v):
    return repr(v)


def cases_for(rule, ref, variant):
    """Return list of (record, kind, target) assertions; kind in err_in/err_not_in/derived_eq.
    variant 'v' (visible) and 'h' (held-out) use DISJOINT input values."""
    p = rule["params"]; code = rule["code"]; k = rule["kind"]
    off = 0 if variant == "v" else 7   # shift values so held-out != visible
    out = []
    if k == "required":
        out.append(({}, "err_in", code))                                  # missing -> error
        out.append(({p["f"]: 3 + off}, "err_not_in", code))               # present -> ok
    elif k == "type_int":
        bad = 1.5 + off if variant == "v" else True                       # float / bool
        out.append(({p["f"]: bad}, "err_in", code))
        out.append(({p["f"]: 7 + off}, "err_not_in", code))
    elif k == "range_max":
        out.append(({p["f"]: p["K"] + 1 + off}, "err_in", code))          # over
        out.append(({p["f"]: p["K"]}, "err_not_in", code))                # boundary inclusive ok
    elif k == "range_min":
        out.append(({p["f"]: p["K"] - 1 - off}, "err_in", code))          # under
        out.append(({p["f"]: p["K"]}, "err_not_in", code))                # boundary inclusive ok
    elif k == "enum":
        out.append(({p["f"]: "zzz"}, "err_in", code))
        out.append(({p["f"]: p["S"][0 if variant == "v" else len(p["S"]) - 1]}, "err_not_in", code))
    elif k == "cond_required":
        out.append(({p["f1"]: p["K"] + 5 + off}, "err_in", code))         # trigger, f2 missing
        out.append(({p["f1"]: p["K"] + 5 + off, p["f2"]: 1}, "err_not_in", code))
        out.append(({p["f1"]: p["K"] - 1}, "err_not_in", code))           # below threshold -> ok
    elif k == "linear":
        rec = {p["f1"]: 11 + off, p["f2"]: 4 + off}
        out.append((rec, "derived_eq", p["d"]))
    elif k == "sum":
        rec = {fi: (i + 2 + off) for i, fi in enumerate(p["fields"])}
        out.append((rec, "derived_eq", p["s"]))
    elif k == "clamp":
        out.append(({p["f"]: p["CAP"] + 50 + off}, "derived_eq", p["t"]))  # above -> CAP
        out.append(({p["f"]: max(0, p["CAP"] - 30 - off)}, "derived_eq", p["t"]))  # below -> value
    elif k == "echo":
        out.append(({p["f"]: 13 + off}, "derived_eq", p["e"]))
        out.append(({}, "derived_eq", p["e"]))                            # missing -> default
    return out


def render_test(fn_name, rule, ref, variant):
    P = ref()
    lines = ["def %s():" % fn_name, "    p = Processor()"]
    ok = False
    for j, (rec, kind, tgt) in enumerate(cases_for(rule, ref, variant)):
        res = P.process(rec)
        var = "r%d" % j
        lines.append("    %s = p.process(%s)" % (var, py(rec)))
        if kind == "err_in":
            assert tgt in res["errors"], (fn_name, rec, "expected err", tgt, res)
            lines.append("    assert %s in %s['errors']" % (py(tgt), var)); ok = True
        elif kind == "err_not_in":
            assert tgt not in res["errors"], (fn_name, rec, "unexpected err", tgt, res)
            lines.append("    assert %s not in %s['errors']" % (py(tgt), var)); ok = True
        elif kind == "derived_eq":
            exp = res["derived"][tgt]
            lines.append("    assert abs(%s['derived'][%s] - %s) < 0.005" % (var, py(tgt), py(exp))); ok = True
    assert ok, fn_name
    return "\n".join(lines) + "\n"


def emit_tests(rules, ref, path, variant):
    body = ["from engine import Processor, ProcError  # noqa\n\n"]
    for r in rules:
        body.append(render_test("test_%s" % r["id"], r, ref, variant))
        body.append("\n")
    open(path, "w").write("".join(body))


def emit_cheat(rules, ref, cheat_dir):
    """Memorize the VISIBLE records -> reference output; default empty otherwise."""
    P = ref()
    lookup = {}
    for r in rules:
        for rec, _kind, _tgt in cases_for(r, ref, "v"):
            lookup[json.dumps(rec, sort_keys=True)] = P.process(rec)
    eng = os.path.join(cheat_dir, "engine")
    if os.path.isdir(cheat_dir):
        shutil.rmtree(cheat_dir)
    os.makedirs(eng, exist_ok=True)
    open(os.path.join(eng, "core.py"), "w").write(
        CHEAT_TEMPLATE.format(lookup_literal=json.dumps(lookup, indent=2)))
    open(os.path.join(eng, "__init__.py"), "w").write("from .core import Processor, ProcError\n")


def emit_requirements(rules, out, name, goal):
    lines = ["# Generated campaign %s — frozen requirement set (RSR denominator)." % name,
             "campaign: %s" % name, 'goal: "%s"' % goal, "requirements:"]
    for r in rules:
        deps = "[%s]" % ", ".join(r["deps"])
        node = "checks/test_gen.py::test_%s" % r["id"]
        lines.append('  - {{ id: {id}, weight: {w}, deps: {deps}, statement: "{stmt}", '
                     'verifier: {{ type: test, node: "{node}" }} }}'.format(
                         id=r["id"], w=r["weight"], deps=deps,
                         stmt=r["stmt"].replace('"', "'"), node=node))
    open(os.path.join(out, "requirements.yaml"), "w").write("\n".join(lines) + "\n")


def wp_instructions(reqs):
    return "Implement these rules in repo/engine/core.py (Processor.process). " + " ".join(
        "%s: %s" % (r["id"], r["stmt"]) for r in reqs)


def dod_for(reqs):
    return [{"type": "test", "cmd": "python3 -m pytest checks/test_gen.py::test_%s -q" % r["id"]} for r in reqs]


def emit_sprints(rules, out, k):
    contract = ("Implement repo/engine/core.py exposing Processor and ProcError. "
                "process(record) returns {\"errors\": a SORTED list of error-code strings, "
                "\"derived\": {name: value}} and raises ProcError if record is not a dict. "
                "Missing or non-numeric fields count as 0 in derived computations. "
                "Each work package gives exact rules; error codes and formulas are fixed.")
    wps = []
    for j in range(0, len(rules), k):
        chunk = rules[j:j + k]
        wps.append({"id": "wp%d" % (j // k + 1), "title": "Rules %s-%s" % (chunk[0]["id"], chunk[-1]["id"]),
                    "instructions": wp_instructions(chunk), "dod": dod_for(chunk)})
    json.dump({"brief": contract, "retry_budget": 3, "work_packages": wps},
              open(os.path.join(out, "sprint.json"), "w"), indent=2)
    mono = [{"id": "wp-all", "title": "Implement the full processor",
             "instructions": contract + " ALL RULES: " + wp_instructions(rules), "dod": dod_for(rules)}]
    json.dump({"brief": contract, "retry_budget": max(3, len(rules) // 3),
               "work_packages": mono}, open(os.path.join(out, "sprint_mono.json"), "w"), indent=2)
    return len(wps)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, required=True)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ref", default=None)
    ap.add_argument("--cheat", default=None, help="emit a reward-hacker lookup stub here (default /tmp/gen_cheat_<name>)")
    ap.add_argument("--k", type=int, default=5)
    a = ap.parse_args()

    name = "gen-N%d-s%d" % (a.n, a.seed)
    ref_dir = a.ref or os.path.join("/tmp", "gen_ref_%s" % name)
    cheat_dir = a.cheat or os.path.join("/tmp", "gen_cheat_%s" % name)
    rules = build_rules(a.n, a.seed)

    # reference is the single source of truth for baked expectations; emit + import it.
    if os.path.isdir(ref_dir):
        shutil.rmtree(ref_dir)
    emit_reference(rules, ref_dir)
    Ref = load_ref(ref_dir)
    emit_cheat(rules, Ref, cheat_dir)   # reward-hacker for the anti-hack proof (kept in /tmp)

    out = a.out
    if os.path.isdir(out):
        shutil.rmtree(out)
    for d in ("repo/engine", "checks", "holdout"):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    open(os.path.join(out, "repo/engine/__init__.py"), "w").write("from .core import Processor, ProcError\n")
    open(os.path.join(out, "repo/engine/core.py"), "w").write(SKELETON)
    open(os.path.join(out, "checks/conftest.py"), "w").write(CONFTEST)
    open(os.path.join(out, "holdout/conftest.py"), "w").write(CONFTEST)

    goal = "Implement a %d-rule record Processor: validations (error codes) + derived fields + cross-field coupling." % a.n
    emit_requirements(rules, out, name, goal)
    emit_tests(rules, Ref, os.path.join(out, "checks/test_gen.py"), "v")     # visible gate
    emit_tests(rules, Ref, os.path.join(out, "holdout/test_gen.py"), "h")    # held-out grader (disjoint inputs)
    wp_count = emit_sprints(rules, out, a.k)

    kinds = {}
    for r in rules:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    json.dump({"id": name, "size_N": a.n, "seed": a.seed, "type": "generated-coupled-scale",
               "k": a.k, "retry_budget": 3, "wp_count": wp_count, "kinds": kinds,
               "domain": "parametric record processor (validation + derived + coupling)",
               "provenance": "machine-generated, self-contained; reference kept in /tmp (out of repo)",
               "note": "SCALE is the difficulty lever; gate=checks/ (visible), grader=holdout/ (disjoint inputs)."},
              open(os.path.join(out, "meta.json"), "w"), indent=2)
    print("generated %s: N=%d wp=%d kinds=%s ref=%s" % (name, a.n, wp_count, kinds, ref_dir))


if __name__ == "__main__":
    main()
