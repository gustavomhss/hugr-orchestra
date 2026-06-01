#!/usr/bin/env python3
"""
run_crossover.py — the N-sweep efficacy-crossover orchestrator, with integrity guards.

Runs the benchmark arms (M / R / D) on a generated bespoke-graph campaign at a given size N,
across seeds, and reports RSR per arm — but REFUSES to trust any run that does not prove it is real.

Why the guards exist (the lesson that motivated this script): a run can come back "RSR 1.0" while
being completely meaningless if (a) the model never actually executed (empty run.json) or (b) the
reference implementation leaked into the run's repo (you grade the answer against itself). This
script validates BOTH for every run and marks the result VALID / INVALID accordingly. A number is
only reported as a measurement when its run is VALID.

Run it from a CLEAN, dedicated terminal (no other Claude session racing this repo), where `claude -p`
actually works.

  python3 run_crossover.py --n 500 --k 25 --seeds 1            # M-pilot only (default arms=M)
  python3 run_crossover.py --n 500 --k 25 --seeds 1,2,3 --arms M,R,D
  python3 run_crossover.py --n 500 --k 25 --seeds 1 --arms M --check-grader   # also prove grader discriminates

Decision rule (printed at the end):
  * If Arm M (the monolith baseline) scores >= --headroom-rsr (default 0.85), the campaign is
    SATURATED — no headroom — and the amplifier thesis cannot be tested here. Don't bother with R/D.
  * Only when M drops below that threshold is the R-vs-M comparison meaningful (the crossover).
"""
import argparse, json, os, subprocess, sys, filecmp, glob, time

BENCH = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(BENCH, "generator", "gen_campaign_v2.py")
RUN_ARM = os.path.join(BENCH, "run_arm.sh")


def sh(cmd, env=None, timeout=None):
    """Run a shell command, return (rc, stdout, stderr). Never raises on non-zero."""
    p = subprocess.run(cmd, shell=True, cwd=BENCH, env={**os.environ, **(env or {})},
                       capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


def gen_campaign(n, k, seed):
    """Generate the campaign for (n, k, seed); return its dir. Idempotent (generator overwrites)."""
    camp = os.path.join(BENCH, "campaigns", f"_genv2-N{n}-s{seed}-k{k}")
    rc, out, err = sh(f"python3 {GEN!r} --n {n} --seed {seed} --k {k} --out {camp!r}")
    if rc != 0:
        sys.exit(f"[FATAL] generation failed for N={n} k={k} seed={seed}:\n{err}")
    return camp


def reference_core(n, seed):
    """The /tmp reference implementation core.py for (n, seed) — k-independent (same funcs per seed)."""
    return f"/tmp/gen2_ref_genv2-N{n}-s{seed}/engine/core.py"


def find_run_core(out_dir):
    """The candidate's implementation file inside a run dir (v2 = repo/engine/core.py)."""
    p = os.path.join(out_dir, "repo", "engine", "core.py")
    if os.path.exists(p):
        return p
    hits = glob.glob(os.path.join(out_dir, "repo", "**", "core.py"), recursive=True)
    return hits[0] if hits else None


def check_grader_discriminates(camp):
    """Sanity: the pristine (unimplemented) skeleton must FAIL the held-out suite. If it passes,
    the grader is not testing the candidate's code — every result would be a false positive."""
    impl = os.path.join(camp, "repo")
    holdout = os.path.join(camp, "holdout")
    env = {"RELAY_IMPL": impl}
    rc, out, err = sh(f"python3 -m pytest {holdout!r} -q", env=env)
    txt = out + err
    # pytest rc != 0 when tests fail -> that's what we WANT here (pristine should fail).
    passed_clean = (rc == 0) and ("passed" in txt) and ("failed" not in txt)
    return (not passed_clean), txt.strip().splitlines()[-1] if txt.strip() else "(no output)"


def validate_run(out_dir, n, seed):
    """Return (valid: bool, reasons: list[str], usage: dict). Enforces the two integrity guards."""
    reasons = []
    usage = {}

    # Guard 1: the model actually ran. claude -p --output-format json must have emitted a real
    # envelope with non-zero turns/output tokens. Empty run.json == the model never executed.
    rj = os.path.join(out_dir, "run.json")
    if not os.path.exists(rj) or os.path.getsize(rj) == 0:
        reasons.append("model-did-not-run (run.json empty/missing)")
    else:
        try:
            data = json.load(open(rj))
            usage = {
                "cost_usd": data.get("total_cost_usd"),
                "out_tok": (data.get("usage") or {}).get("output_tokens"),
                "turns": data.get("num_turns"),
                "is_error": data.get("is_error"),
            }
            if not (usage.get("turns") or usage.get("out_tok")):
                reasons.append("model-did-not-run (zero turns/output tokens)")
            if usage.get("is_error"):
                reasons.append("model-reported-error (is_error=true)")
        except Exception as e:
            reasons.append(f"run.json-unparseable ({e})")

    # Guard 2: no reference leak. The run's implementation must NOT be byte-identical to the /tmp
    # reference — that would mean the answer was copied in and we'd be grading it against itself.
    run_core = find_run_core(out_dir)
    ref_core = reference_core(n, seed)
    if run_core is None:
        reasons.append("no-impl-file (repo/engine/core.py missing)")
    elif os.path.exists(ref_core) and filecmp.cmp(run_core, ref_core, shallow=False):
        reasons.append("REFERENCE-LEAK (run core.py is byte-identical to the /tmp reference)")

    return (len(reasons) == 0), reasons, usage


def run_one(arm, camp, out_dir, timeout):
    """Run a single arm via run_arm.sh; return the grade dict (or None) plus validation."""
    os.makedirs(os.path.dirname(out_dir) or ".", exist_ok=True)
    env = {"RELAY_TIMEOUT": str(timeout)}
    rc, out, err = sh(f"bash {RUN_ARM!r} {arm} {camp!r} {out_dir!r}", env=env, timeout=timeout + 300)

    grade = None
    gp = os.path.join(out_dir, "grade.json")
    if os.path.exists(gp):
        try:
            grade = json.load(open(gp))
        except Exception:
            pass
    return grade, out, err


def main():
    ap = argparse.ArgumentParser(description="N-sweep efficacy-crossover runner with integrity guards.")
    ap.add_argument("--n", type=int, default=500, help="campaign size (number of requirements)")
    ap.add_argument("--k", type=int, default=25, help="WP cap (lower k => more, smaller WPs)")
    ap.add_argument("--seeds", default="1", help="comma-separated seeds, e.g. 1,2,3")
    ap.add_argument("--arms", default="M", help="comma-separated arms from {M,R,D}")
    ap.add_argument("--timeout", type=int, default=2400, help="per-arm timeout seconds (R needs lots)")
    ap.add_argument("--out-root", default=os.path.join(BENCH, "_runs"))
    ap.add_argument("--json-out", default=os.path.join(BENCH, "_runs", "crossover_results.json"))
    ap.add_argument("--headroom-rsr", type=float, default=0.85,
                    help="M at/above this RSR => campaign saturated, no crossover testable")
    ap.add_argument("--check-grader", action="store_true",
                    help="before running, prove the pristine skeleton FAILS the holdout (grader discriminates)")
    a = ap.parse_args()

    seeds = [int(s) for s in a.seeds.split(",") if s.strip()]
    arms = [s.strip().upper() for s in a.arms.split(",") if s.strip()]
    for arm in arms:
        if arm not in ("M", "R", "D"):
            sys.exit(f"bad arm {arm!r} (must be M, R, or D)")
    os.makedirs(a.out_root, exist_ok=True)

    print(f"== crossover run :: N={a.n} k={a.k} seeds={seeds} arms={arms} timeout={a.timeout}s ==\n")
    results = []

    for seed in seeds:
        camp = gen_campaign(a.n, a.k, seed)
        print(f"[seed {seed}] campaign generated -> {os.path.relpath(camp, BENCH)}")

        if a.check_grader:
            ok, last = check_grader_discriminates(camp)
            tag = "OK (pristine fails => grader discriminates)" if ok else "BROKEN (pristine PASSES => grader not testing candidate!)"
            print(f"[seed {seed}] grader sanity: {tag}  [{last}]")
            if not ok:
                print(f"[seed {seed}] refusing to run arms on a non-discriminating grader.\n")
                continue

        for arm in arms:
            out_dir = os.path.join(a.out_root, f"N{a.n}-s{seed}-k{a.k}-{arm}")
            t0 = time.time()
            print(f"[seed {seed}] arm {arm}: running ...", flush=True)
            grade, out, err = run_one(arm, camp, out_dir, a.timeout)
            dt = time.time() - t0

            valid, reasons, usage = validate_run(out_dir, a.n, seed)
            rsr = grade.get("rsr") if grade else None
            rec = {
                "n": a.n, "k": a.k, "seed": seed, "arm": arm,
                "rsr": rsr, "valid": valid, "reasons": reasons,
                "usage": usage, "secs": round(dt, 1),
                "out_dir": os.path.relpath(out_dir, BENCH),
            }
            results.append(rec)

            status = "VALID" if valid else "INVALID: " + "; ".join(reasons)
            rsr_s = f"{rsr:.4f}" if isinstance(rsr, (int, float)) else "—"
            u = usage or {}
            print(f"[seed {seed}] arm {arm}: rsr={rsr_s}  {status}  "
                  f"(turns={u.get('turns')}, out_tok={u.get('out_tok')}, ${u.get('cost_usd')}, {dt:.0f}s)\n")

    # ---- summary ----
    print("=" * 72)
    print("SUMMARY (only VALID runs are real measurements)")
    print("=" * 72)
    print(f"{'seed':>4} {'arm':>3} {'rsr':>8} {'valid':>6}  {'turns':>5} {'out_tok':>8}  notes")
    for r in results:
        rsr_s = f"{r['rsr']:.4f}" if isinstance(r["rsr"], (int, float)) else "—"
        note = "" if r["valid"] else r["reasons"][0]
        u = r["usage"] or {}
        print(f"{r['seed']:>4} {r['arm']:>3} {rsr_s:>8} {str(r['valid']):>6}  "
              f"{str(u.get('turns')):>5} {str(u.get('out_tok')):>8}  {note}")

    # ---- verdict on M (the headroom gate) ----
    valid_M = [r["rsr"] for r in results if r["arm"] == "M" and r["valid"] and isinstance(r["rsr"], (int, float))]
    print("\nVERDICT:")
    if not valid_M:
        print("  No VALID Arm-M run. Cannot assess headroom. Fix the INVALID reasons above and re-run.")
        print("  (Most common: `claude -p` not executing in this shell, or a reference leak.)")
    else:
        mean_M = sum(valid_M) / len(valid_M)
        if mean_M >= a.headroom_rsr:
            print(f"  Arm M mean RSR = {mean_M:.3f} >= {a.headroom_rsr} => SATURATED at N={a.n}.")
            print("  No headroom: the monolith does not drop requirements here, so there is no crossover")
            print("  to find. The amplifier thesis stays unsupported at this N. (Consistent with RESULTS.md.)")
        else:
            print(f"  Arm M mean RSR = {mean_M:.3f} < {a.headroom_rsr} => HEADROOM FOUND at N={a.n}!")
            print("  The monolith drops requirements here. NOW run --arms M,R,D and compare:")
            print("    R - M > 0 (and surviving REG) => the per-step ratchet recovers what M drops (crossover).")
            valid_R = [r["rsr"] for r in results if r["arm"] == "R" and r["valid"] and isinstance(r["rsr"], (int, float))]
            valid_D = [r["rsr"] for r in results if r["arm"] == "D" and r["valid"] and isinstance(r["rsr"], (int, float))]
            if valid_R:
                mean_R = sum(valid_R) / len(valid_R)
                print(f"    Arm R mean RSR = {mean_R:.3f}  => R-M = {mean_R - mean_M:+.3f}")
            if valid_D:
                mean_D = sum(valid_D) / len(valid_D)
                print(f"    Arm D mean RSR = {mean_D:.3f}  => attribution: D-M={mean_D - mean_M:+.3f} (decomp), "
                      f"R-D={(sum(valid_R)/len(valid_R) - mean_D):+.3f} (gating)" if valid_R else
                      f"    Arm D mean RSR = {mean_D:.3f}  => D-M = {mean_D - mean_M:+.3f} (decomposition alone)")

    os.makedirs(os.path.dirname(a.json_out) or ".", exist_ok=True)
    json.dump({"params": vars(a), "results": results}, open(a.json_out, "w"), indent=2)
    print(f"\nwrote {os.path.relpath(a.json_out, BENCH)}")


if __name__ == "__main__":
    main()
