#!/usr/bin/env python3
"""
relay-autodecompose — draft a Relay sprint.json from a repo's EXISTING test suite.

The #1 authoring tax is hand-writing a checklist of 100+ Definition-of-Done controls. But a repo that
already has a pytest suite has *already encoded* its DoD: every test is a named, deterministic control.
This tool harvests that suite and drafts the gates for you — turning authoring cost toward zero.

What it does:
  1. Collect the suite with `pytest --collect-only -q` (no tests are run).
  2. Group test nodeids by their test FILE — each file becomes one Work Package (the natural concern
     boundary). Files are ordered by name for reproducibility.
  3. For each WP, draft a `checklist` of named deterministic controls: one `cmd` item per test
     (id = the test name, cmd = `pytest <nodeid>`), plus a WP-level "suite green" rollup. These are
     exactly the on-disk control format the Relay hook (bin/relay-arm-hook.sh) and SPEC §4.1 consume.
  4. Emit a valid sprint.json. The draft is a STARTING POINT — the lead edits instructions, splits
     oversized WPs, adds semantic `judge` items where a script can't decide. Authoring becomes editing.

It does NOT run the tests or judge them; it only reads structure. A green suite today => a gate that
holds the agent to that same green tomorrow.

Usage:
  relay-autodecompose.py <repo-dir> [--tests <path>] [--runner "python3 -m pytest"]
                         [--per-wp-cap N] [--brief "..."] [-o sprint.json]
  # then:  RELAY_ARMS_DIR / relay-arm  or  drop the sprint.json into a run and point the hook at it.
"""
import argparse, json, os, re, shlex, subprocess, sys
from collections import OrderedDict


def collect(repo, tests_path, runner):
    """Return ordered {test_file: [nodeid, ...]} via pytest --collect-only. Never runs the tests."""
    cmd = runner.split() + ["--collect-only", "-q"]
    if tests_path:
        cmd.append(tests_path)
    p = subprocess.run(cmd, cwd=repo, capture_output=True, text=True)
    # --collect-only -q prints one nodeid per line ("path::test" / "path::Class::test"); a summary
    # line ("N tests collected") and blank lines may follow — keep only lines containing "::".
    # Bug 3 fix: require ".py::" so that lines like "<frozen importlib._bootstrap>::..." are excluded.
    nodeids = [ln.strip() for ln in p.stdout.splitlines()
               if ".py::" in ln and not ln.startswith(("=", "ERROR"))]
    if not nodeids:
        sys.exit(f"[relay-autodecompose] no tests collected.\n  cmd: {' '.join(cmd)}\n"
                 f"  stdout tail: {p.stdout.strip()[-400:]}\n  stderr tail: {p.stderr.strip()[-400:]}")
    # Bug 2 fix: warn (but don't abort) if pytest exited with an error code other than 0 (success)
    # or 5 (no tests collected, already handled above).
    if p.returncode not in (0, 5):
        print(f"[relay-autodecompose] WARNING: pytest --collect-only exited with returncode "
              f"{p.returncode} — collection may be partial. Check stderr above.",
              file=sys.stderr)
    groups = OrderedDict()
    for nid in nodeids:
        f = nid.split("::", 1)[0]
        groups.setdefault(f, []).append(nid)
    return OrderedDict(sorted(groups.items()))


def wp_id(test_file, idx):
    base = re.sub(r"[^a-z0-9]+", "-", os.path.basename(test_file).lower())
    base = re.sub(r"^test-|-?\.py$|^-+|-+$", "", base) or f"wp{idx}"
    return f"wp{idx}-{base}"


def item_id(nodeid):
    """A stable, readable control id from a nodeid's test part."""
    tail = nodeid.split("::", 1)[1].replace("::", ".")
    return re.sub(r"[^A-Za-z0-9_.]+", "_", tail)


def draft(groups, runner, per_wp_cap, brief, retry_budget):
    work_packages = []
    idx = 0
    for test_file, nodeids in groups.items():
        # split a file that exceeds the cap into multiple WPs so no single gate is unwieldy
        chunks = [nodeids[i:i + per_wp_cap] for i in range(0, len(nodeids), per_wp_cap)] \
            if per_wp_cap and len(nodeids) > per_wp_cap else [nodeids]
        for c, chunk in enumerate(chunks):
            idx += 1
            suffix = f"-{c+1}" if len(chunks) > 1 else ""
            checklist = [
                {"id": item_id(nid), "assert": f"{nid} passes",
                 "cmd": f"{runner} {shlex.quote(nid)} -q"} for nid in chunk
            ]
            # WP-level rollup: the whole chunk green in one shot (cheap belt-and-suspenders)
            checklist.append({
                "id": f"{wp_id(test_file, idx)}{suffix}-suite",
                "assert": f"all {len(chunk)} tests in this package pass together",
                "cmd": f"{runner} " + " ".join(shlex.quote(n) for n in chunk) + " -q",
            })
            work_packages.append({
                "id": f"{wp_id(test_file, idx)}{suffix}",
                "title": f"{os.path.basename(test_file)}{suffix} ({len(chunk)} controls)",
                "instructions": f"DRAFT — make every control in {test_file} pass. "
                                f"Edit the implementation under test; do not modify the tests. "
                                f"(Auto-drafted from the existing suite — refine this instruction.)",
                "checklist": checklist,
            })
    return {"brief": brief, "retry_budget": retry_budget, "work_packages": work_packages}


def main():
    ap = argparse.ArgumentParser(description="Draft a Relay sprint.json from an existing pytest suite.")
    ap.add_argument("repo", help="repo directory (pytest is run here)")
    ap.add_argument("--tests", default=None, help="restrict collection to this path (default: whole repo)")
    ap.add_argument("--runner", default="python3 -m pytest", help="test runner (default: python3 -m pytest)")
    ap.add_argument("--per-wp-cap", type=int, default=12, help="max controls per WP before splitting (default 12)")
    ap.add_argument("--brief", default=None, help="sprint brief (default: auto)")
    ap.add_argument("--retry-budget", type=int, default=3)
    ap.add_argument("-o", "--out", default=None, help="write sprint.json here (default: stdout)")
    a = ap.parse_args()

    repo = os.path.abspath(a.repo)
    if not os.path.isdir(repo):
        sys.exit(f"not a directory: {repo}")
    groups = collect(repo, a.tests, a.runner)
    brief = a.brief or f"Auto-drafted sprint from the test suite of {os.path.basename(repo)} " \
                       f"({sum(len(v) for v in groups.values())} controls across {len(groups)} files)."
    sprint = draft(groups, a.runner, a.per_wp_cap, brief, a.retry_budget)

    n_ctrl = sum(len(wp["checklist"]) for wp in sprint["work_packages"])
    out = json.dumps(sprint, indent=2)
    if a.out:
        open(a.out, "w").write(out + "\n")
        print(f"[relay-autodecompose] {len(sprint['work_packages'])} WPs, {n_ctrl} controls "
              f"-> {a.out}\n  brief: {brief}", file=sys.stderr)
    else:
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
