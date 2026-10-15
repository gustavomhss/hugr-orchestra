#!/usr/bin/env python3
"""Generator v2 — the NON-COMPRESSIBLE, cross-coupled substrate (the amplifier's hard test).

v1 failed to break the monolith because templated rules compress to one general dispatch. v2 removes
the shortcut: N bespoke functions g1..gN, each a UNIQUE arithmetic expression that may call ONE
earlier function (a single-call chain -> error in gj propagates to every caller, no exponential
blowup), then each applies 3 GLOBAL rules based on its own static properties (index parity / index
%7 / whether it makes a call). There is no table to interpret — the model must emit N distinct
definitions AND apply the right global-rule combination to each. This targets the real long-horizon
failure mode: volume of distinct, non-local decisions.

Clean deterministic oracle: a /tmp reference (N real defs) is the single source of truth; visible and
held-out expectations are computed by importing it. Held-out uses disjoint (a,b) inputs; a reward-
hacker lookup stub is auto-emitted for the anti-hack proof. Reference + cheat stay in /tmp.

Contract: module `engine` exposes g1..gN; each gi(a:int,b:int)->int. Global rules, applied in order
to the base value v = (<body>) % 1009:
  G1: if i % 7 == 0:            v += 100
  G2: if gi calls another fn:   v = min(v, 500)
  G3: if i % 2 == 0:            v = v % 777

Usage: gen_campaign_v2.py --n 150 --seed 1 --out <dir> [--k 5]
"""
import argparse, importlib.util, json, os, random, shutil

CONFTEST = (
    "import os, sys\n"
    "_impl = os.environ.get('RELAY_IMPL') or os.path.join(os.path.dirname(__file__), '..', 'repo')\n"
    "sys.path.insert(0, _impl)\n"
)


def build_funcs(n, seed):
    rng = random.Random(seed)
    funcs = []
    for i in range(1, n + 1):
        terms, call = [], None
        # 2-3 terms over a, b, const, and optionally ONE call to a recent earlier fn (single-call chain)
        if i >= 2 and rng.random() < 0.72:
            j = rng.randint(max(1, i - 6), i - 1)
            call = j
            args = "a, b" if rng.random() < 0.5 else "b, a"
            terms.append("g%d(%s)" % (j, args))
        nbase = rng.randint(2, 3)
        for _ in range(nbase):
            terms.append(rng.choice(["a", "b", str(rng.randint(1, 20))]))
        rng.shuffle(terms)
        ops = [rng.choice(["+", "-", "*"]) for _ in range(len(terms) - 1)]
        expr = terms[0]
        for op, t in zip(ops, terms[1:]):
            expr += " %s %s" % (op, t)
        funcs.append({"i": i, "expr": expr, "call": call,
                      "g1": i % 7 == 0, "g2": call is not None, "g3": i % 2 == 0})
    return funcs


def ref_body(f):
    lines = ["    v = (%s) %% 1009" % f["expr"]]
    if f["g1"]:
        lines.append("    v += 100")
    if f["g2"]:
        lines.append("    v = min(v, 500)")
    if f["g3"]:
        lines.append("    v = v % 777")
    lines.append("    return v")
    return "\n".join(lines)


def emit_module(funcs, path, body_fn):
    eng = os.path.join(path, "engine")
    os.makedirs(eng, exist_ok=True)
    out = ['"""Generated engine."""\n']
    for f in funcs:
        out.append("def g%d(a, b):\n%s\n\n" % (f["i"], body_fn(f)))
    open(os.path.join(eng, "core.py"), "w").write("".join(out))
    open(os.path.join(eng, "__init__.py"), "w").write("from .core import *  # noqa\n")


def emit_reference(funcs, ref_dir):
    if os.path.isdir(ref_dir):
        shutil.rmtree(ref_dir)
    emit_module(funcs, ref_dir, ref_body)


def emit_skeleton(funcs, out):
    # the runner edits repo/engine/core.py; conftest resolves `import engine` to ../repo
    emit_module(funcs, os.path.join(out, "repo"), lambda f: "    raise NotImplementedError")


def load_ref(ref_dir):
    # load core.py directly (no relative imports there); tests use `import engine` via sys.path instead.
    spec = importlib.util.spec_from_file_location("genref2_core", os.path.join(ref_dir, "engine", "core.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def inputs_for(i, variant):
    """Disjoint (a,b) pairs for visible vs held-out, varied by index."""
    if variant == "v":
        return [(3 + i % 5, 2 + i % 4), (7, 5)]
    return [(11 + i % 6, 4 + i % 3), (9, 8)]   # held-out: different pairs


def emit_tests(funcs, ref, path, variant):
    body = ["import engine  # noqa\n\n"]
    for f in funcs:
        i = f["i"]
        lines = ["def test_R%d():" % i]
        for (a, b) in inputs_for(i, variant):
            exp = getattr(ref, "g%d" % i)(a, b)
            lines.append("    assert engine.g%d(%d, %d) == %d" % (i, a, b, exp))
        body.append("\n".join(lines) + "\n\n")
    open(path, "w").write("".join(body))


def emit_cheat(funcs, ref, cheat_dir):
    """Memorize visible (i,a,b) -> reference value; default 0 otherwise."""
    L = {}
    for f in funcs:
        i = f["i"]
        for (a, b) in inputs_for(i, "v"):
            L["%d,%d,%d" % (i, a, b)] = getattr(ref, "g%d" % i)(a, b)
    eng = os.path.join(cheat_dir, "engine")
    if os.path.isdir(cheat_dir):
        shutil.rmtree(cheat_dir)
    os.makedirs(eng, exist_ok=True)
    src = ["_L = %s\n\n" % json.dumps(L)]
    for f in funcs:
        src.append("def g%d(a, b):\n    return _L.get('%d,%%d,%%d' %% (a, b), 0)\n\n" % (f["i"], f["i"]))
    open(os.path.join(eng, "core.py"), "w").write("".join(src))
    open(os.path.join(eng, "__init__.py"), "w").write("from .core import *  # noqa\n")


def statement(f):
    rules = []
    if f["g1"]:
        rules.append("G1(+100, index%7==0)")
    if f["g2"]:
        rules.append("G2(min .,500 — has a call)")
    if f["g3"]:
        rules.append("G3(%777, even index)")
    rs = (" then " + ", ".join(rules)) if rules else " (no global rules apply)"
    return "g%d(a,b) = (%s) %% 1009%s." % (f["i"], f["expr"], rs)


def emit_requirements(funcs, out, name):
    goal = ("Implement engine.g1..g%d: each a bespoke expression (may call ONE earlier g) mod 1009, "
            "then global rules G1 (index%%7==0:+100), G2 (has a call: min(.,500)), G3 (even index: %%777), "
            "applied in order." % len(funcs))
    lines = ["# Generated v2 campaign %s — bespoke function graph (non-compressible)." % name,
             "campaign: %s" % name, 'goal: "%s"' % goal, "requirements:"]
    for f in funcs:
        deps = "[R%d]" % f["call"] if f["call"] else "[]"
        node = "checks/test_gen.py::test_R%d" % f["i"]
        lines.append('  - {{ id: R{i}, weight: 1, deps: {deps}, statement: "{st}", '
                     'verifier: {{ type: test, node: "{node}" }} }}'.format(
                         i=f["i"], deps=deps, st=statement(f).replace('"', "'"), node=node))
    open(os.path.join(out, "requirements.yaml"), "w").write("\n".join(lines) + "\n")


def wp_instructions(chunk):
    return ("Implement these functions in repo/engine/core.py (each gi(a,b)->int; apply the global "
            "rules G1/G2/G3 in order to v=(body)%1009). " + " ".join(statement(f) for f in chunk))


def dod_for(chunk):
    return [{"type": "test", "cmd": "python3 -m pytest checks/test_gen.py::test_R%d -q" % f["i"]} for f in chunk]


def emit_sprints(funcs, out, k):
    contract = ("Implement repo/engine/core.py exposing g1..g%d (each gi(a,b)->int). For each: "
                "v = (the given body) %% 1009, then apply global rules IN ORDER — G1: if index%%7==0 "
                "add 100; G2: if the function calls another g, set v=min(v,500); G3: if index is even, "
                "v=v%%777. Return v. Functions may call earlier functions." % len(funcs))
    wps = [{"id": "wp%d" % (j // k + 1), "title": "g%d-g%d" % (funcs[j]["i"], funcs[min(j + k, len(funcs)) - 1]["i"]),
            "instructions": wp_instructions(funcs[j:j + k]), "dod": dod_for(funcs[j:j + k])}
           for j in range(0, len(funcs), k)]
    json.dump({"brief": contract, "retry_budget": 3, "work_packages": wps},
              open(os.path.join(out, "sprint.json"), "w"), indent=2)
    mono = [{"id": "wp-all", "title": "Implement all %d functions" % len(funcs),
             "instructions": contract + " ALL: " + wp_instructions(funcs), "dod": dod_for(funcs)}]
    json.dump({"brief": contract, "retry_budget": max(3, len(funcs) // 3),
               "work_packages": mono}, open(os.path.join(out, "sprint_mono.json"), "w"), indent=2)
    return len(wps)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, required=True)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", required=True)
    ap.add_argument("--k", type=int, default=5)
    a = ap.parse_args()

    name = "genv2-N%d-s%d" % (a.n, a.seed)
    ref_dir = os.path.join("/tmp", "gen2_ref_%s" % name)
    cheat_dir = os.path.join("/tmp", "gen2_cheat_%s" % name)
    funcs = build_funcs(a.n, a.seed)

    emit_reference(funcs, ref_dir)
    ref = load_ref(ref_dir)
    emit_cheat(funcs, ref, cheat_dir)

    out = a.out
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, "checks"), exist_ok=True)
    os.makedirs(os.path.join(out, "holdout"), exist_ok=True)
    emit_skeleton(funcs, out)
    open(os.path.join(out, "checks/conftest.py"), "w").write(CONFTEST)
    open(os.path.join(out, "holdout/conftest.py"), "w").write(CONFTEST)
    emit_requirements(funcs, out, name)
    emit_tests(funcs, ref, os.path.join(out, "checks/test_gen.py"), "v")
    emit_tests(funcs, ref, os.path.join(out, "holdout/test_gen.py"), "h")
    wp_count = emit_sprints(funcs, out, a.k)
    ncall = sum(1 for f in funcs if f["call"])
    json.dump({"id": name, "size_N": a.n, "seed": a.seed, "type": "bespoke-function-graph-noncompressible",
               "k": a.k, "retry_budget": 3, "wp_count": wp_count, "calls": ncall,
               "domain": "N bespoke arithmetic functions + single-call chain + 3 global rules",
               "provenance": "machine-generated, self-contained; reference + cheat in /tmp (out of repo)",
               "note": "NON-COMPRESSIBLE: N distinct defs, no dispatch shortcut. gate=checks/, grader=holdout/."},
              open(os.path.join(out, "meta.json"), "w"), indent=2)
    print("generated %s: N=%d wp=%d calls=%d ref=%s cheat=%s" % (name, a.n, wp_count, ncall, ref_dir, cheat_dir))


if __name__ == "__main__":
    main()
