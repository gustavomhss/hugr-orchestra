#!/usr/bin/env python3
"""Goldens for `relay-gate check`, and the scenario runner shared with arm.py (G2, dev-only).

    python3 check.py            regenerate test/golden/check/
    python3 check.py --verify   regenerate into a scratch directory and compare byte for byte

The Python and bash Relay in packages/relay/{bin,lib,benchmark} is the oracle. test/golden/FORMAT.md defines the
scenario format; this runner applies exactly what a scenario.json says and nothing else, so a TS test can rebuild
every scenario from its JSON alone. Conventions FORMAT.md leaves to the generator, also recorded in GENERATOR.json:

- `meta.workdir`, when present, becomes the working tree; a meta without it leaves the hook on its cwd fallback.
- Layout under a fresh scenario root: `arms/<token>/` (token `tok`), working tree `work/`, empty `home/`, the agent
  transcript `transcript.jsonl` and the fake `date` in `bin/`. The root is never inside a git repository.
- Every fire runs with cwd = `work/`, under `env -i` with PATH (fake `date` first, then the asserted tools), HOME,
  the pinned GIT_AUTHOR_* and GIT_COMMITTER_* values, RELAY_ARMS_DIR, RELAY_CORPUS_DIR, RELAY_ARM_TOKEN=tok,
  RELAY_JUDGE_BACKEND=stub and CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0, then the scenario's `env` on top. A scenario
  sets RELAY_ARM_TOKEN itself to exercise refused tokens and the marker scan.
- A relative RELAY_JUDGE (a fake judge) resolves against `work/`, where the scenario's tree puts it.
- Commits: `git init`, then per commit write `files`, `git add -A` and `git commit --allow-empty -m <message>` with
  the pinned identity and date. `{"commit": N}` is accepted in meta.base_ref, prestate values and check.baseRef.
- Prestate keys may contain `/`; `.run.lock/owner` creates a held run lock. `null` deletes a path.
- Transcript rows that are objects are written as compact JSON with raw non-ASCII (JSON.stringify), one per line,
  each followed by LF; the payload is `{"agent_transcript_path"?, "agent_id"?}`.
- A check fire runs `relay-gate check --sprint arms/tok/sprint.json --workdir work --state arms/tok`; `counter`
  as a number writes `<N>\\n` to the state directory first, as a string writes its bytes; `baseRef` passes
  `--base-ref`.
- The absolute scenario root is written as `<root>` in expected arm files and stderr, the oracle package as
  `<relay>`.
"""
import argparse
import base64
import filecmp
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
GOLDEN = HERE.parent
RELAY = GOLDEN.parent.parent
HOOK = RELAY / "bin" / "relay-arm-hook.sh"
GATE = RELAY / "bin" / "relay-gate"
ORACLE_FILES = ["bin/relay-arm-hook.sh", "bin/relay-gate", "lib/relay-gate.sh", "benchmark/judge.py"]
FORMAT = GOLDEN / "FORMAT.md"

TOKEN = "tok"
EPOCH = 1700000000
STEP = 60
GIT_ENV = {
    "GIT_AUTHOR_NAME": "Relay Golden",
    "GIT_AUTHOR_EMAIL": "golden@relay.invalid",
    "GIT_AUTHOR_DATE": "1700000000 +0000",
    "GIT_COMMITTER_NAME": "Relay Golden",
    "GIT_COMMITTER_EMAIL": "golden@relay.invalid",
    "GIT_COMMITTER_DATE": "1700000000 +0000",
}
DEFAULT_ENV = {
    "RELAY_ARM_TOKEN": TOKEN,
    "RELAY_JUDGE_BACKEND": "stub",
    "CLAUDE_CODE_STOP_HOOK_BLOCK_CAP": "0",
}
UNCOMPARED = {"relay.log", "ledger.jsonl", ".run.lock", ".chain.lock"}
SECTIONS = {"arm": "### `bin/relay-arm-hook.sh`", "check": "### `bin/relay-gate check`"}


# ---- Tools ---------------------------------------------------------------------------------------------------------

def tools():
    """Resolve and assert the oracle's tools once; PATH for every fire is built from their directories."""
    found = {name: shutil.which(name) for name in ("jq", "bash", "git", "python3", "shasum")}
    missing = [name for name, path in found.items() if not path]
    if missing:
        sys.exit(f"generator: missing tools: {', '.join(missing)}")
    dirs = []
    for name in ("jq", "bash", "git", "python3"):
        parent = str(Path(found[name]).parent)
        if parent not in dirs:
            dirs.append(parent)
    dirs += [d for d in ("/usr/bin", "/bin", "/usr/sbin", "/sbin") if d not in dirs]
    path = os.pathsep.join(dirs)
    probe = {"PATH": path}
    jq = run_text(["jq", "--version"], probe)
    # FORMAT pins jq 1.7.x. jq 1.8 prints the integers, escapes and key order this oracle produces identically;
    # 1.6 (macOS /usr/bin/jq) does not, so it is refused.
    if not re.fullmatch(r"jq-1\.[78]\.\d+", jq):
        sys.exit(f"generator: jq 1.7.x or 1.8.x required, found {jq!r} on {path}")
    bash = run_text(["bash", "-c", 'printf %s "$BASH_VERSION"'], probe)
    if not bash.startswith("5."):
        sys.exit(f"generator: bash 5.x required, found {bash!r}")
    return {
        "path": path,
        "bash": shutil.which("bash", path=path),
        "versions": {
            "jq": jq,
            "bash": bash,
            "git": run_text(["git", "--version"], probe),
            "python3": run_text(["python3", "-c", "import platform; print(platform.python_version())"], probe),
        },
    }


def run_text(args, env):
    return subprocess.run(args, env=env, capture_output=True, text=True, check=True).stdout.strip()


# ---- Byte values ---------------------------------------------------------------------------------------------------

def to_bytes(value, shas):
    if value is None:
        return None
    if isinstance(value, str):
        return value.encode()
    if isinstance(value, dict) and list(value) == ["base64"]:
        return base64.b64decode(value["base64"])
    if isinstance(value, dict) and list(value) == ["commit"]:
        return shas[value["commit"]].encode()
    raise ValueError(f"not a byte value: {value!r}")


def apply_files(base, files, shas):
    for rel, value in files.items():
        path = base / rel
        data = to_bytes(value, shas)
        if data is None:
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
            elif path.exists() or path.is_symlink():
                path.unlink()
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def compact(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def transcript_bytes(rows):
    return b"".join((row if isinstance(row, str) else compact(row)).encode() + b"\n" for row in rows)


# ---- One scenario --------------------------------------------------------------------------------------------------

class Root:
    def __init__(self, path):
        self.path = path
        self.arms = path / "arms"
        self.arm = self.arms / TOKEN
        self.work = path / "work"
        self.home = path / "home"
        self.bin = path / "bin"
        self.transcript = path / "transcript.jsonl"
        for directory in (self.arm, self.work, self.home, self.bin):
            directory.mkdir(parents=True)

    def normalize(self, data):
        for raw, mark in ((str(self.path).encode(), b"<root>"), (str(RELAY).encode(), b"<relay>")):
            data = data.replace(raw, mark)
        return data


def run_scenario(scenario, tool):
    with tempfile.TemporaryDirectory(prefix="relay-golden-") as tmp:
        root = Root(Path(os.path.realpath(tmp)))
        shas = setup(root, scenario)
        results = []
        for n, fire in enumerate(scenario["fires"]):
            results.append(run_fire(root, scenario, shas, n, fire, tool))
        return results


def setup(root, scenario):
    shas = []
    commits = scenario.get("commits", [])
    if commits:
        env = {"PATH": TOOLS["path"], "HOME": str(root.home), "GIT_CONFIG_NOSYSTEM": "1", **GIT_ENV}
        git(root.work, env, "-c", "init.defaultBranch=main", "init", "-q")
        for commit in commits:
            apply_files(root.work, commit.get("files", {}), shas)
            git(root.work, env, "add", "-A")
            git(root.work, env, "commit", "-q", "--allow-empty", "-m", commit["message"])
            shas.append(git(root.work, env, "rev-parse", "HEAD"))
    apply_files(root.work, scenario.get("tree", {}), shas)
    if "sprint" in scenario:
        (root.arm / "sprint.json").write_text(compact(scenario["sprint"]))
    if "meta" in scenario:
        meta = dict(scenario["meta"])
        if "workdir" in meta:
            meta["workdir"] = str(root.work)
        if isinstance(meta.get("base_ref"), dict):
            meta["base_ref"] = to_bytes(meta["base_ref"], shas).decode()
        (root.arm / "meta.json").write_text(compact(meta))
    apply_files(root.arm, scenario.get("prestate", {}), shas)
    return shas


def git(work, env, *args):
    return subprocess.run(["git", "-C", str(work), *args], env=env, capture_output=True, text=True,
                          check=True).stdout.strip()


def run_fire(root, scenario, shas, n, fire, tool):
    at = fire.get("at", EPOCH + STEP * n)
    date = root.bin / "date"
    date.write_text(f"#!/bin/sh\nprintf '%s\\n' {at}\n")
    date.chmod(0o755)
    apply_files(root.work, fire.get("tree", {}), shas)
    if "release" in fire:
        apply_files(root.arm, {"release": fire["release"]}, shas)
    payload = {}
    if "transcript" in fire:
        root.transcript.write_bytes(transcript_bytes(fire["transcript"]))
        payload["agent_transcript_path"] = str(root.transcript)
    if "agentID" in fire:
        payload["agent_id"] = fire["agentID"]
    env = {"PATH": f"{root.bin}{os.pathsep}{tool['path']}", "HOME": str(root.home), **GIT_ENV,
           "RELAY_ARMS_DIR": str(root.arms), "RELAY_CORPUS_DIR": str(root.path / "corpus"),
           **DEFAULT_ENV, **scenario.get("env", {})}
    held = (root.arm / ".run.lock").exists()
    ledger_before = read(root.arm / "ledger.jsonl") or b""
    if "check" in fire:
        args, stdin = check_args(root, shas, fire["check"], tool), b""
    else:
        args, stdin = [tool["bash"], str(HOOK)], compact(payload).encode()
    proc = subprocess.run(args, input=stdin, capture_output=True, cwd=root.work, env=env, timeout=120)
    if (root.arm / ".chain.lock").exists():
        sys.exit(f"fire {n} left .chain.lock behind")
    if (root.arm / ".run.lock").exists() != held:
        sys.exit(f"fire {n} changed .run.lock ownership")
    stdout = json.loads(proc.stdout) if proc.stdout.strip() else None
    ledger = read(root.arm / "ledger.jsonl")
    appended = (ledger or b"")[len(ledger_before):] if (ledger or b"").startswith(ledger_before) else None
    return {
        "exit": proc.returncode,
        "stdout": stdout,
        "stderr": root.normalize(proc.stderr).decode(errors="replace"),
        "reason": stdout["reason"] if isinstance(stdout, dict) and stdout.get("decision") == "block" else None,
        "arm": snapshot(root),
        "ledger": ledger,
        "entries": None if appended is None else [json.loads(line) for line in appended.splitlines() if line],
    }


def check_args(root, shas, check, tool):
    if "counter" in check:
        counter = check["counter"]
        data = f"{counter}\n".encode() if isinstance(counter, int) else to_bytes(counter, shas)
        (root.arm / "counter").write_bytes(data)
    args = [tool["bash"], str(GATE), "check", "--sprint", str(root.arm / "sprint.json"),
            "--workdir", str(root.work), "--state", str(root.arm)]
    if "position" in check:
        args += ["--position", check["position"]]
    if "baseRef" in check:
        args += ["--base-ref", to_bytes(check["baseRef"], shas).decode()]
    return args


def read(path):
    return path.read_bytes() if path.is_file() else None


def snapshot(root):
    files = {}
    for path in sorted(root.arm.rglob("*")):
        rel = path.relative_to(root.arm)
        if rel.parts[0] in UNCOMPARED or not path.is_file():
            continue
        files[rel.as_posix()] = root.normalize(path.read_bytes())
    return files


# ---- Expectations: each scenario proves it reaches the path it claims ----------------------------------------------

def verify(name, n, result, expect):
    def fail(message):
        sys.exit(f"{name} fire {n}: {message}\n{json.dumps(summary(result), indent=2, ensure_ascii=False)}")

    if "exit" in expect and result["exit"] != expect["exit"]:
        fail(f"exit {result['exit']} != {expect['exit']}")
    if "block" in expect and (result["reason"] is not None) != expect["block"]:
        fail(f"block {result['reason'] is not None} != {expect['block']}")
    if expect.get("silent") and (result["stdout"] is not None or result["stderr"]):
        fail("expected no output")
    if "stdout" in expect:
        if expect["stdout"] is None:
            if result["stdout"] is not None:
                fail("expected empty stdout")
        elif not isinstance(result["stdout"], dict) or any(
                result["stdout"].get(k, KeyError) != v for k, v in expect["stdout"].items()):
            fail(f"stdout does not contain {expect['stdout']}")
    if "events" in expect:
        events = None if result["entries"] is None else [e.get("event") for e in result["entries"]]
        if events != expect["events"]:
            fail(f"events {events} != {expect['events']}")
    for subset in expect.get("entries", []):
        if not any(all(e.get(k, KeyError) == v for k, v in subset.items()) for e in result["entries"] or []):
            fail(f"no appended entry contains {subset}")
    for key, value in expect.get("files", {}).items():
        actual = result["arm"].get(key)
        wanted = None if value is None else value.encode() if isinstance(value, str) else value
        if actual != wanted:
            fail(f"arm file {key}: {actual!r} != {wanted!r}")
    for text in expect.get("reason_has", []):
        if text not in (result["reason"] or ""):
            fail(f"reason lacks {text!r}")
    for text in expect.get("reason_lacks", []):
        if text in (result["reason"] or ""):
            fail(f"reason has {text!r}")
    for text in expect.get("stderr_has", []):
        if text not in result["stderr"]:
            fail(f"stderr lacks {text!r}")


def summary(result):
    return {"exit": result["exit"], "stdout": result["stdout"], "stderr": result["stderr"],
            "events": [e.get("event") for e in result["entries"] or []],
            "arm": {k: v.decode(errors="replace") for k, v in result["arm"].items()}}


# ---- Output --------------------------------------------------------------------------------------------------------

SCENARIO_KEYS = ("sprint", "meta", "prestate", "commits", "tree", "env", "fires")


def write_area(area, scenarios, out):
    ids = format_ids(area)
    coverage = {path: [] for path in ids}
    names = set()
    for case in scenarios:
        name = case["name"]
        if name in names or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name):
            sys.exit(f"bad or duplicate scenario name {name!r}")
        names.add(name)
        for path in case["covers"]:
            if path not in coverage:
                sys.exit(f"{name} covers {path}, which FORMAT.md does not list for {area}")
            coverage[path].append(name)
        scenario = {key: case[key] for key in SCENARIO_KEYS if key in case}
        for n, fire in enumerate(scenario["fires"]):
            if ("check" in fire) != (area == "check"):
                sys.exit(f"{name} fire {n}: check fires belong to the check area only")
        results = run_scenario(scenario, TOOLS)
        for n, expect in case.get("expect", {}).items():
            verify(name, n, results[n], expect)
        directory = out / name
        directory.mkdir(parents=True)
        dump_json(directory / "scenario.json", scenario)
        for n, result in enumerate(results):
            write_fire(directory / "expected" / str(n), result)
    uncovered = [path for path, cases in coverage.items() if not cases]
    if uncovered:
        sys.exit(f"{area}: no scenario covers {', '.join(uncovered)}")
    (out / ".gitattributes").write_text("# Golden bytes are exact; never convert line endings.\n* -text\n")
    dump_json(out / "GENERATOR.json", {
        "generator": f"test/golden/generate/{area}.py",
        "oracle": {name: hashlib.sha256((RELAY / name).read_bytes()).hexdigest() for name in ORACLE_FILES},
        "tools": TOOLS["versions"],
        "token": TOKEN,
        "layout": {"arm": f"<root>/arms/{TOKEN}", "workdir": "<root>/work", "home": "<root>/home",
                   "transcript": "<root>/transcript.jsonl", "cwd": "<root>/work"},
        "env": {**GIT_ENV, "RELAY_ARMS_DIR": "<root>/arms", "RELAY_CORPUS_DIR": "<root>/corpus", **DEFAULT_ENV},
        "epoch": {"base": EPOCH, "step": STEP},
        "git": ["git init", "per commit: write files", "git add -A", "git commit --allow-empty -m <message>"],
        "coverage": coverage,
    })


def write_fire(directory, result):
    directory.mkdir(parents=True)
    dump_json(directory / "outcome.json",
              {"exit": result["exit"], "stdout": result["stdout"], "stderr": result["stderr"]})
    if result["reason"] is not None:
        (directory / "reason.txt").write_bytes(result["reason"].encode())
    for rel, data in result["arm"].items():
        path = directory / "arm" / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    if result["ledger"] is not None:
        (directory / "ledger.jsonl").write_bytes(result["ledger"])


def dump_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def format_ids(area):
    """The exit-path IDs FORMAT.md lists for one area. Finding none is a failure, never an empty pass."""
    lines = FORMAT.read_text().splitlines()
    try:
        start = lines.index(SECTIONS[area])
    except ValueError:
        sys.exit(f"FORMAT.md has no section {SECTIONS[area]!r}")
    ids = []
    for line in lines[start + 1:]:
        if line.startswith("### "):
            break
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")] if line.startswith("|") else []
        match = re.fullmatch(r"([A-K]\d+)( †)?", cells[0]) if cells else None
        if match:
            ids.append(match.group(1))
    if not ids:
        sys.exit(f"FORMAT.md lists no exit paths for {area}")
    return ids


def main(area, scenarios):
    parser = argparse.ArgumentParser(description=f"Generate test/golden/{area}/ from the Python Relay oracle.")
    parser.add_argument("--verify", action="store_true", help="regenerate and compare with the committed goldens")
    args = parser.parse_args()
    target = GOLDEN / area
    with tempfile.TemporaryDirectory(prefix=f"relay-golden-{area}-") as tmp:
        out = Path(tmp) / area
        out.mkdir()
        write_area(area, scenarios, out)
        if args.verify:
            differences = compare(out, target)
            for line in differences:
                print(line)
            print(f"{area}: {'byte-identical' if not differences else f'{len(differences)} differences'}"
                  f" ({len(scenarios)} scenarios)")
            return 1 if differences else 0
        if target.exists() and not (target / "GENERATOR.json").is_file():
            sys.exit(f"{target} exists but is not generator-owned (no GENERATOR.json)")
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(out, target)
    print(f"{area}: wrote {len(scenarios)} scenarios to {target.relative_to(RELAY)}")
    return 0


def compare(left, right):
    if not right.is_dir():
        return [f"missing {right}"]
    files = lambda base: {p.relative_to(base).as_posix() for p in base.rglob("*") if p.is_file()}
    a, b = files(left), files(right)
    return ([f"only in regenerated: {p}" for p in sorted(a - b)] + [f"only in committed: {p}" for p in sorted(b - a)]
            + [f"differs: {p}" for p in sorted(a & b) if not filecmp.cmp(left / p, right / p, shallow=False)])


# ---- Check scenarios -----------------------------------------------------------------------------------------------

def control(cid, cmd=None, **fields):
    return {"id": cid, **({"cmd": cmd} if cmd is not None else {}), **fields}


def wp(wid, *controls, **fields):
    return {"id": wid, "instructions": f"do {wid}", "checklist": list(controls), **fields}


TWO = {"retry_budget": 3, "work_packages": [
    wp("alpha", control("F-ALPHA", "test -f alpha.txt", **{"assert": "alpha.txt exists"})),
    wp("beta", control("F-BETA", "test -f beta.txt", **{"assert": "beta.txt exists"})),
]}
DIFF_SPRINT = {"work_packages": [wp("target", control("DIFF", judge="inspect change", diff=True, blocking=True))]}
SEED = [{"message": "seed", "files": {"seed.txt": "seed\n"}}]
HELD = {".run.lock/owner": "another evaluator"}


def k(name, covers, sprint, fires, expect=None, **extra):
    return {"name": name, "covers": covers, "sprint": sprint, **extra, "fires": fires, "expect": expect or {}}


def check_fire(**check):
    return {"check": check}


def checked(code, wid, i, failing, **more):
    return {"exit": code, "stdout": {"outcome": "check", "wp": wid, "i": i, "failing": failing, **more}}


CHECK_SCENARIOS = [
    k("k1-all-pass", ["K1"], TWO, [check_fire()], {0: checked(0, "alpha", 0, [])},
      tree={"alpha.txt": "a\n"}),
    k("k1-macro", ["K1"], {"work_packages": [
        wp("current", control("PASS", "true"), macro="\tbuild\n\n")]}, [check_fire()],
      {0: checked(0, "current", 0, [], macro="\tbuild\n\n")}),
    k("k2-failing-in-order", ["K2"], {"work_packages": [wp("only",
        control("F-1", "test -f one"), control("P-2", "true"), control("F-3", "false"))]},
      [check_fire(), {"tree": {"one": "1\n"}, "check": {}}],
      {0: checked(1, "only", 0, ["F-1", "F-3"]), 1: checked(1, "only", 0, ["F-3"])},
      prestate={"counter": "0\n"}),
    k("k2-counter-selects-wp", ["K1", "K2"], TWO,
      [check_fire(counter=1), {"tree": {"beta.txt": "b\n"}, "check": {"counter": 1}}],
      {0: checked(1, "beta", 1, ["F-BETA"]), 1: checked(0, "beta", 1, [])}),
    k("k3-unknown-position", ["K3"], TWO, [check_fire(position="lost.wp", counter=99)],
      {0: {"exit": 2, "stdout": {"outcome": "error", "error": "unknown-position", "position": "lost.wp"}}}),
    k("k4-counter-at-end", ["K4"], TWO, [check_fire(counter=2), check_fire(counter=99)],
      {0: {"exit": 0, "stdout": {"outcome": "complete", "i": 2}},
       1: {"exit": 0, "stdout": {"outcome": "complete", "i": 99}}}),
    k("k5-position-overrides-counter", ["K5"], {"retry_budget": 3, "work_packages": [
        wp("inserted", control("WRONG", "true")), *TWO["work_packages"]]},
      [check_fire(position="beta", counter=0), check_fire(position="build.beta", counter=99),
       check_fire(position="beta", counter="stale")],
      {0: checked(1, "beta", 2, ["F-BETA"]), 1: checked(1, "beta", 2, ["F-BETA"]),
       2: checked(1, "beta", 2, ["F-BETA"])},
      prestate={"position": "build.beta", "retry_2": "2\n", "ledger.jsonl": "", "state": "active"}),
    k("k5-position-overrides-parked", ["K5"], TWO,
      [check_fire(position="alpha"), check_fire(position="beta")],
      {0: checked(0, "alpha", 0, []), 1: checked(1, "beta", 1, ["F-BETA"])},
      tree={"alpha.txt": "a\n"},
      prestate={"position": "beta", "state": "awaiting-human", "counter": "2\n", "retry_beta": "3\n"}),
    k("k5-whole-id-before-suffix", ["K5"], {"work_packages": [
        wp("beta", control("SUFFIX", "true")), wp("build.beta", control("WHOLE", "false"))]},
      [check_fire(position="build.beta"), check_fire(position="outer.build.beta"), check_fire(position="x.beta")],
      {0: checked(1, "build.beta", 1, ["WHOLE"]), 1: checked(1, "build.beta", 1, ["WHOLE"]),
       2: checked(0, "beta", 0, [])}),
    k("k5-newline-sibling", ["K5"], {"work_packages": [
        wp("target", control("plain-pass", "true")), wp("target\n", control("actual-fail", "false"))]},
      [check_fire(position="target"), check_fire(position="target\n")],
      {0: checked(0, "target", 0, []), 1: checked(1, "target\n", 1, ["actual-fail"])},
      prestate={"counter": "99", "position": "target\n"}),
    k("k6-explicit-empty-base-ref", ["K6"], DIFF_SPRINT,
      [check_fire(position="target"), check_fire(position="target", baseRef=""),
       check_fire(position="target", baseRef={"commit": 0}), check_fire(position="target", baseRef="not-a-commit")],
      {0: checked(0, "target", 0, []), 1: checked(1, "target", 0, ["DIFF"]), 2: checked(0, "target", 0, []),
       3: checked(1, "target", 0, ["DIFF"])},
      commits=SEED, tree={"result.txt": "RELAY_JUDGE_OK\n"},
      prestate={"counter": "99", "position": "target", "retry_0": "2", "ledger.jsonl": "",
                "base_ref": {"commit": 0}}),
    k("k6-base-ref-overrides-state", ["K6"], DIFF_SPRINT,
      [check_fire(position="target"), check_fire(position="target", baseRef={"commit": 0}),
       {"tree": {"result.txt": "nothing the judge accepts\n"}, "check": {"position": "target", "baseRef": {"commit": 0}}}],
      {0: checked(1, "target", 0, ["DIFF"]), 1: checked(0, "target", 0, []), 2: checked(1, "target", 0, ["DIFF"])},
      commits=SEED, tree={"result.txt": "RELAY_JUDGE_OK\n"},
      prestate={"counter": "99", "base_ref": "invalid-state-base"}),
    k("k6-no-git-workdir", ["K6"], DIFF_SPRINT, [check_fire(baseRef="0123456789abcdef0123456789abcdef01234567")],
      {0: checked(1, "target", 0, ["DIFF"])}, tree={"result.txt": "RELAY_JUDGE_OK\n"}),
    k("k7-lock-held", ["K7"], TWO, [check_fire(), check_fire(position="beta")],
      {0: {"exit": 3, "stdout": None, "stderr_has": ["another evaluation holds <root>/arms/tok/.run.lock"]},
       1: {"exit": 3, "stdout": None}},
      prestate=HELD),
    *[k(f"k8-{label}", ["K8"], {"work_packages": [{**wp("current", control("SIDE-EFFECT", "touch ran")), field: value}]},
        [check_fire()], {0: {"exit": 1, "stdout": None, "stderr_has": [f"WP {field}"]}},
        prestate={"counter": "0"})
      for label, field, value in [
          ("nonstring-id", "id", 7), ("nul-id", "id", "bad\u0000id"), ("null-id", "id", None), ("empty-id", "id", ""),
          ("nonstring-macro", "macro", False), ("nul-macro", "macro", "bad\u0000macro")]],
    *[k(f"k8-checklist-{label}", ["K8"], {"work_packages": [{"id": "current", "checklist": checklist}]},
        [check_fire()], {0: {"exit": 1, "stdout": None}})
      for label, checklist in [("object", {}), ("string", "test -f x"), ("number", 7)]],
    k("k8-invalid-control-identity", ["K8"], {"work_packages": [wp("current",
        control("FIRST", "touch first-ran"), {"id": 17, "cmd": "touch ran"})]},
      [check_fire()], {0: {"exit": 1, "stdout": None, "stderr_has": ["invalid id"]}}),
    k("k8-invalid-assertion", ["K8"], {"work_packages": [wp("current",
        control("REPORT", "touch ran", **{"assert": True}))]},
      [check_fire()], {0: {"exit": 1, "stdout": None, "stderr_has": ["invalid assertion"]}}),
    k("check-next-identity-out-of-scope", ["K1"], {"work_packages": [
        wp("current", control("PASS", "true")), {"id": 7, "checklist": []}]},
      [check_fire()], {0: checked(0, "current", 0, [])}),
    k("check-current-scope-only", ["K2"], {"retry_budget": 3, "work_packages": [
        {**wp("first", control("EARLIER", "false")), "dod": [{"cmd": "false"}]},
        {**wp("second", control("CURRENT", "test -f second.txt")), "dod": [{"id": "DOD", "cmd": "false"}]}]},
      [check_fire(counter=1), {"tree": {"second.txt": "2\n"}, "check": {"counter": 1}}],
      {0: checked(1, "second", 1, ["CURRENT"]), 1: checked(0, "second", 1, [])}),
    k("check-command-transport", ["K2"], {"work_packages": [wp("transport",
        control("MULTILINE-PASS", "false\ntrue"),
        control("MULTILINE-FAIL", "true\n# second line\ntest -f missing"),
        control("TABS-AND-LF", "\ttrue # café\n\n"),
        control("ERREXIT-SUPPRESSED", "false; true"),
        control("PIPEFAIL", "false | true"),
        control("NOUNSET", 'test -z "$RELAY_GOLDEN_UNSET_NAME"'),
        control("STDIN-EOF", "cat >/dev/null"),
        control("HEREDOC", "grep -qx supplied <<'PAYLOAD'\nsupplied\nPAYLOAD"),
        control("CWD", "test -f marker.txt && test \"$(basename \"$PWD\")\" = work"))]},
      [check_fire()], {0: checked(1, "transport", 0, ["MULTILINE-FAIL", "PIPEFAIL", "NOUNSET"])},
      tree={"marker.txt": "m\n"}),
    k("check-hook-variables-visible", ["K1"], {"work_packages": [wp("alpha",
        control("SEES-WP-ID", 'test "$wp_id" = alpha'), control("SEES-SPRINT", 'test -f "$SPRINT"'),
        control("SEES-MODE", 'test "$MODE" = check'))]},
      [check_fire()], {0: checked(0, "alpha", 0, [])}),
    k("check-params", ["K1", "K2"], {"work_packages": [wp("params",
        control("CMD-SEES-PARAM", 'test -f "$wp_dir/note.md"'),
        control("CONTEXT-EXPANDED", judge="note is ready", context="${wp_dir}/note.md", blocking=True),
        control("SCOPE-UNSET-STAYS-LITERAL", judge="scope", paths=["${relay_golden_unset}/x.md"], blocking=True,
                context=["${wp_dir}/note.md"]),
        control("CONTEXT-UNSET", judge="missing", context="${relay_golden_unset}/note.md", blocking=True))]},
      [check_fire()], {0: checked(1, "params", 0, ["CONTEXT-UNSET"])},
      tree={"docs/note.md": "RELAY_JUDGE_OK\n"}, env={"wp_dir": "docs"}),
    k("check-judge-outcomes", ["K2"], {"work_packages": [wp("judged",
        control("BLOCKING-PASS", judge="ok", context="ok.txt", blocking=True),
        control("BLOCKING-FAIL", judge="bad", context="bad.txt", blocking=True),
        control("ADVISORY-FAIL", judge="bad", context="bad.txt"),
        control("NO-CONTEXT", judge="nothing", blocking=True),
        control("INVALID-CRITERION", blocking=False),
        control("INVALID-SCOPE", judge="scope", paths="ok.txt"),
        control("EMPTY-CMD-FALLS-BACK", "", judge="ok", context="ok.txt", blocking=True),
        control("ADVISORY-NO-DIFF", judge="diff", diff=True))]},
      [check_fire()],
      {0: checked(1, "judged", 0, ["BLOCKING-FAIL", "NO-CONTEXT", "INVALID-CRITERION", "INVALID-SCOPE"])},
      tree={"ok.txt": "RELAY_JUDGE_OK\n", "bad.txt": "no marker\n"}),
    k("check-judge-forced", ["K1"], {"work_packages": [wp("forced",
        control("FORCED", judge="anything", context="bad.txt", blocking=True))]},
      [check_fire()], {0: checked(0, "forced", 0, [])},
      tree={"bad.txt": "no marker\n"}, env={"RELAY_JUDGE_STUB": "pass"}),
    k("check-records-nothing", ["K1"], TWO, [check_fire(), check_fire(position="beta")],
      {0: {**checked(0, "alpha", 0, []), "files": {"counter": "0\n", "retry_alpha": "1\n"}},
       1: checked(1, "beta", 1, ["F-BETA"])},
      tree={"alpha.txt": "a\n"},
      prestate={"counter": "0\n", "position": "alpha", "retry_alpha": "1\n", "state": "active"}),
]


TOOLS = tools()

if __name__ == "__main__":
    sys.exit(main("check", CHECK_SCENARIOS))
