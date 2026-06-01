#!/usr/bin/env python3
"""
examples/fleet-chain — reproducible proof of the per-agent checklist-chain loop.

This is the LLM-free, deterministic distillation of a real fleet test (a sonnet agent given a
200-item checklist over a 4500-line file, with the checklist injected only by the Stop-hook). It
reproduces the SAME mechanism a real agent goes through, without spending tokens, so it can run in CI:

  1. Author an "arm" (an ordered chain of gates, each a checklist of deterministic `cmd` controls,
     plus a few arbitrary TRACER FLAGS) the way the `relay-arm` MCP tool does.
  2. Stand up a workdir that simulates an agent who did the WORK but did not know the conventions:
     content is present but in the wrong FORMAT, and the tracer flags are absent (the agent never
     saw them — they exist only inside the gate checks).
  3. Drive the REAL hook (bin/relay-arm-hook.sh) the way Claude Code's SubagentStop would. The agent
     is BLOCKED, the hook returns exactly what's missing; we play the agent reacting to that feedback
     (re-formatting to the demanded convention, planting the demanded flag). Repeat until the chain
     completes — proving each control was satisfied *because the gate demanded it*.
  4. Assert: chain completes, all tracer flags planted with exact content (so they could only have
     come from the hook's feedback), and the per-arm ledger verifies offline.

Run:  python3 examples/fleet-chain/run_example.py        # exit 0 = the loop holds end-to-end
"""
import json, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
RELAY = os.path.abspath(os.path.join(HERE, "..", ".."))
HOOK = os.path.join(RELAY, "bin", "relay-arm-hook.sh")
VERIFY = os.path.join(RELAY, "benchmark", "verify_ledger.py")

# Five arbitrary tracer flags. The agent is NEVER told these; they live only in the gate checks
# below, so a planted flag with exact content proves the hook's feedback was obeyed.
FLAGS = [
    ("f1", "FLAG{fleet::doc::a91c}"),
    ("f2", "FLAG{fleet::test::4d7e}"),
    ("f3", "FLAG{fleet::typed::b2f8}"),
    ("f4", "FLAG{fleet::seal::ff19}"),
]
# A small but representative symbol set (the real test used 66 classes + 28 funcs = 207 items).
SYMBOLS = ["Router", "Route", "Bottle", "MultiDict", "ConfigDict", "HTTPError", "FileUpload", "BaseRequest"]


def make_check(d, name, body):
    p = os.path.join(d, name + ".py")
    open(p, "w").write("#!/usr/bin/env python3\n" + body)
    return f"python3 {p}"


def build_arm(arms_dir, checks_dir, workdir):
    """Author the chain exactly as the relay-arm MCP tool writes it: sprint.json + meta.json."""
    os.makedirs(checks_dir, exist_ok=True)
    gates = []

    # Gate 1 — docs: each symbol must have an EXACT '## <Name>' heading in API.md. Plant flag f1.
    doc_items = []
    for s in SYMBOLS:
        cmd = make_check(checks_dir, f"DOC_{s}",
                         f"import sys; sys.exit(0 if '## {s}' in open('API.md').read() else 1)")
        doc_items.append({"id": f"DOC_{s}", "assert": f"## {s} heading in API.md", "cmd": cmd})
    doc_items.append(flag_item(checks_dir, "f1"))
    gates.append({"id": "g1-docs",
                  "instructions": "In API.md, every symbol needs a section header in the EXACT form '## <Name>' "
                                  "(bare name, no backticks). " + flag_instr("f1"),
                  "checklist": doc_items})

    # Gate 2 — tests: each symbol referenced by name in test_api.py + suite green (a real toolcall). Flag f2.
    tst_items = []
    for s in SYMBOLS:
        cmd = make_check(checks_dir, f"TST_{s}",
                         f"import sys; sys.exit(0 if '{s}' in open('test_api.py').read() else 1)")
        tst_items.append({"id": f"TST_{s}", "assert": f"{s} referenced in test_api.py", "cmd": cmd})
    green = make_check(checks_dir, "TOOL_green",
                       "import subprocess,sys;"
                       "r=subprocess.run(['python3','-m','pytest','test_api.py','-q'],capture_output=True);"
                       "sys.exit(r.returncode)")
    tst_items.append({"id": "TOOL_green", "assert": "pytest suite green", "cmd": green})
    tst_items.append(flag_item(checks_dir, "f2"))
    gates.append({"id": "g2-tests",
                  "instructions": "In test_api.py, reference every symbol by name with a real test; the suite "
                                  "must pass under pytest. " + flag_instr("f2"),
                  "checklist": tst_items})

    # Gate 3 — typed wrappers: typed_<name> with a return annotation, module imports clean. Flag f3.
    typ_items = []
    for s in ["redirect", "abort"]:
        cmd = make_check(checks_dir, f"TYP_{s}",
                         "import sys,ast;"
                         "t=ast.parse(open('typed.py').read());"
                         "fns={n.name:n for n in ast.walk(t) if isinstance(n,ast.FunctionDef)};"
                         f"f=fns.get('typed_{s}');"
                         "sys.exit(0 if f is not None and f.returns is not None else 1)")
        typ_items.append({"id": f"TYP_{s}", "assert": f"typed_{s} with return annotation", "cmd": cmd})
    typ_items.append(flag_item(checks_dir, "f3"))
    gates.append({"id": "g3-typed",
                  "instructions": "In typed.py, add wrappers named EXACTLY typed_<fn> with a '-> Type' return "
                                  "annotation for redirect and abort. " + flag_instr("f3"),
                  "checklist": typ_items})

    # Gate 4 — seal: just plant the final flag.
    gates.append({"id": "g4-seal", "instructions": "Final review. " + flag_instr("f4"),
                  "checklist": [flag_item(checks_dir, "f4")]})

    token = "fleet-example"
    arm = os.path.join(arms_dir, token)
    os.makedirs(arm, exist_ok=True)
    sprint = {"brief": "fleet-chain example", "retry_budget": 8, "work_packages": gates}
    json.dump(sprint, open(os.path.join(arm, "sprint.json"), "w"), indent=2)
    json.dump({"label": "fleet-example", "workdir": workdir, "token": token},
              open(os.path.join(arm, "meta.json"), "w"))
    return token, arm


FLAG_CONTENT = dict(FLAGS)


def flag_item(checks_dir, fid):
    content = FLAG_CONTENT[fid]
    cmd = make_check(checks_dir, f"FLAG_{fid}",
                     f"import sys;\n"
                     f"try: v=open('flags/{fid}.flag').read().strip()\n"
                     f"except Exception: sys.exit(1)\n"
                     f"sys.exit(0 if v=={content!r} else 1)")
    return {"id": f"FLAG_{fid}", "assert": f"tracer {fid}", "cmd": cmd}


def flag_instr(fid):
    return f"Also plant a tracer file at flags/{fid}.flag containing EXACTLY: {FLAG_CONTENT[fid]} (nothing else)."


def seed_blind_work(workdir):
    """Simulate an agent who did the WORK but in the wrong conventions and without the (unknown) flags.
    Content is present; format is off; flags absent. The gate will have to drive the corrections."""
    os.makedirs(workdir, exist_ok=True)
    # API.md: symbols documented, but with '### `Name`' (backticks) — NOT the required '## Name'.
    open(os.path.join(workdir, "API.md"), "w").write(
        "# API Reference\n\n" + "\n".join(f"### `{s}`\n\nDoes {s} things.\n" for s in SYMBOLS))
    # test_api.py: a generic green test that does NOT reference the symbols by name.
    open(os.path.join(workdir, "test_api.py"), "w").write(
        "def test_placeholder():\n    assert 1 + 1 == 2\n")
    # typed.py: wrappers without the typed_ prefix and without annotations.
    open(os.path.join(workdir, "typed.py"), "w").write(
        "def redirect(*a, **k):\n    return None\n\ndef abort(*a, **k):\n    return None\n")


def fire(token, arm, workdir, arms_dir):
    """One SubagentStop fire of the real hook. Returns the block reason, or None on complete."""
    transcript = os.path.join(workdir, "..", "transcript.jsonl")
    open(transcript, "w").write(json.dumps({"type": "user", "content": f"done RELAY-ARM:{token}"}) + "\n")
    # keep retained traces inside this run's sandbox (sibling of arms_dir), never the real corpus
    env = {**os.environ, "RELAY_ARMS_DIR": arms_dir,
           "RELAY_CORPUS_DIR": os.path.join(os.path.dirname(arms_dir), "corpus")}
    p = subprocess.run(["bash", HOOK], input=json.dumps({"transcript_path": os.path.abspath(transcript)}),
                       capture_output=True, text=True, env=env)
    out = p.stdout.strip()
    if not out:
        return None
    try:
        return json.loads(out).get("reason", "")
    except Exception:
        return out


def agent_react(reason, workdir):
    """Play the agent obeying the hook's feedback: re-format to the demanded convention and plant the
    demanded flag. Crucially, the flag content comes from the HOOK's reason, not from this code's knowledge."""
    # 1) plant any tracer the hook named (regex pulls the path + exact content out of the reason)
    m = re.search(r"flags/(\S+\.flag) containing EXACTLY: (FLAG\{[^}]*\})", reason)
    if m:
        os.makedirs(os.path.join(workdir, "flags"), exist_ok=True)
        open(os.path.join(workdir, "flags", m.group(1)), "w").write(m.group(2))
    # 2) react to each gate's structural demand
    if "## <Name>" in reason or "g1-docs" in reason or "API.md" in reason and "## " in reason:
        open(os.path.join(workdir, "API.md"), "w").write(
            "# API Reference\n\n" + "\n".join(f"## {s}\n\nDoes {s} things.\n\n```python\n{s}\n```\n" for s in SYMBOLS))
    if "test_api.py" in reason:
        # self-contained tests (no external import) — each references a symbol by name in a real assert
        lines = ["SYMBOLS = " + repr(SYMBOLS)]
        for s in SYMBOLS:
            lines.append(f"def test_{s}():\n    assert {s!r} in SYMBOLS  # references {s}")
        open(os.path.join(workdir, "test_api.py"), "w").write("\n".join(lines) + "\n")
    if "typed.py" in reason or "typed_" in reason:
        open(os.path.join(workdir, "typed.py"), "w").write(
            "from typing import Any\n"
            "def typed_redirect(*a, **k) -> None:\n    return None\n"
            "def typed_abort(*a, **k) -> Any:\n    return None\n")


def main():
    root = tempfile.mkdtemp(prefix="relay_fleet_example_")
    try:
        arms_dir = os.path.join(root, "arms")
        workdir = os.path.join(root, "work")
        checks_dir = os.path.join(root, "checks")
        os.makedirs(workdir, exist_ok=True)
        token, arm = build_arm(arms_dir, checks_dir, workdir)
        seed_blind_work(workdir)

        # cold-check before the hook: the blind work should fail most items, and ALL flags absent.
        print("== fleet-chain example ==")
        print(f"  arm: {token}  | gates: {len(json.load(open(os.path.join(arm,'sprint.json')))['work_packages'])}")

        nwp = len(json.load(open(os.path.join(arm, "sprint.json")))["work_packages"])
        # drive the real hook; each block -> the agent reacts to the hook's feedback. Bounded loop.
        # A silent (no-output) fire means EITHER the chain completed OR a gate escalated (budget spent);
        # we disambiguate by the counter afterwards.
        stops = 0
        for _ in range(80):
            reason = fire(token, arm, workdir, arms_dir)
            stops += 1
            if reason is None:
                break
            agent_react(reason, workdir)
        counter = int(open(os.path.join(arm, "counter")).read().strip()) if os.path.exists(os.path.join(arm, "counter")) else 0
        complete = counter >= nwp

        flag_ok = []
        for fid, content in FLAGS:
            p = os.path.join(workdir, "flags", f"{fid}.flag")
            ok = os.path.exists(p) and open(p).read().strip() == content
            flag_ok.append(ok)

        ledger = os.path.join(arm, "ledger.jsonl")
        lv = subprocess.run(["python3", VERIFY, ledger], capture_output=True, text=True)

        print(f"  drove {stops} stops -> chain complete: {complete} ({counter}/{nwp} gates)")
        print(f"  tracer flags planted via hook feedback: {sum(flag_ok)}/{len(FLAGS)}")
        print(f"  ledger: {'INTACT' if lv.returncode == 0 else 'BROKEN'} "
              f"({lv.stdout.splitlines()[0] if lv.stdout else ''})")

        ok = complete and all(flag_ok) and lv.returncode == 0
        print("\nRESULT:", "PASS — the checklist-chain loop holds end-to-end" if ok else "FAIL")
        return 0 if ok else 1
    finally:
        shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
