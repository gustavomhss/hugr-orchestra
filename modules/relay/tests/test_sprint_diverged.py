"""The last silent attack in docs/enforcement-model.md §9: rewrite the question after it is answered.

Swap a PASSED control's `cmd` (or delete the control) after the run ends, and every signal relay had
still agreed: the chain is intact because nothing on it was touched, and `oracle_drift` sees a single
oracle because the control was graded exactly once. Reproduced against shipped code — `relay verify`
printed `RESULT: PASS — auditable` with the artifact the control existed to check deleted from disk.

`oracle_recheck` closes it by recomputing each control's oracle from the sprint as it is NOW and
comparing it to what the ledger recorded. This is a comparison, not a privilege boundary: someone who
can rewrite the sprint can rewrite the ledger too, and then integrity catches it. What it removes is
the variant that left no trace at all.

Everything here drives the real bin/relay-gate and the real bin/relay via subprocess.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GATE = ROOT / "bin" / "relay-gate"
RELAY = ROOT / "bin" / "relay"


def _env():
    env = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    env.pop("ANTHROPIC_API_KEY", None)
    return env


def _run(tmp_path):
    """A one-state sprint whose single control passes, driven to completion. Returns (run, sprint)."""
    work = tmp_path / "work"
    run = tmp_path / "run"
    (run / ".relay-state").mkdir(parents=True)
    work.mkdir()
    (work / "artifact.txt").write_text("real\n")
    sprint = run / "sprint.json"
    sprint.write_text(json.dumps({
        "brief": "diverge",
        "retry_budget": 3,
        "work_packages": [{
            "id": "wp1", "title": "A", "instructions": "x",
            "checklist": [{"id": "F-REAL", "assert": "artifact exists",
                           "cmd": f"test -f {work}/artifact.txt"}],
        }],
    }))
    p = subprocess.run([str(GATE), "eval", "--sprint", str(sprint), "--workdir", str(work),
                        "--state", str(run / ".relay-state")],
                       capture_output=True, text=True, env=_env())
    assert json.loads(p.stdout)["outcome"] == "complete", p.stdout + p.stderr
    return run, sprint, work


def _verify(target, *extra):
    p = subprocess.run([sys.executable, str(RELAY), "verify", str(target), "--json", *extra],
                       capture_output=True, text=True, env=_env())
    return p.returncode, json.loads(p.stdout)


def test_clean_run_passes_and_recheck_agrees(tmp_path):
    run, _, _ = _run(tmp_path)
    code, out = _verify(run)
    assert code == 0 and out["result"] == "PASS"
    assert out["oracle_recheck"]["status"] == "ok"


def test_swapped_cmd_after_the_run_is_caught(tmp_path):
    run, sprint, work = _run(tmp_path)
    assert _verify(run)[0] == 0                      # passed honestly first
    (work / "artifact.txt").unlink()                 # the violation the control existed to catch
    s = json.loads(sprint.read_text())
    s["work_packages"][0]["checklist"][0]["cmd"] = "true"   # id and assert stay byte-identical
    sprint.write_text(json.dumps(s))
    code, out = _verify(run)
    assert code == 2 and out["result"] == "SPRINT-DIVERGED"
    items = out["oracle_recheck"]["items"]
    assert [i["id"] for i in items] == ["F-REAL"]
    assert items[0]["kind"] == "changed" and items[0]["current"] != items[0]["recorded"]


def test_deleted_control_is_caught(tmp_path):
    run, sprint, _ = _run(tmp_path)
    s = json.loads(sprint.read_text())
    s["work_packages"][0]["checklist"] = []
    sprint.write_text(json.dumps(s))
    code, out = _verify(run)
    assert code == 2 and out["result"] == "SPRINT-DIVERGED"
    assert out["oracle_recheck"]["items"][0]["kind"] == "removed"


def test_editing_prose_around_the_control_is_not_divergence(tmp_path):
    """The oracle is what the control MEASURES. Retitling a state, or rewording an `assert`, changes
    neither — and flagging it would train a reader to ignore the banner."""
    run, sprint, _ = _run(tmp_path)
    s = json.loads(sprint.read_text())
    s["work_packages"][0]["title"] = "renamed"
    s["work_packages"][0]["checklist"][0]["assert"] = "reworded entirely"
    s["brief"] = "different brief"
    sprint.write_text(json.dumps(s))
    code, out = _verify(run)
    assert code == 0 and out["oracle_recheck"]["status"] == "ok"


def test_bare_ledger_reports_not_run_rather_than_agreement(tmp_path):
    """A ledger path has no sprint by construction. Reporting that as `ok` would be a check claiming
    to have run when it did not — the exact shape §5 refuses everywhere else."""
    run, _, _ = _run(tmp_path)
    code, out = _verify(run / ".relay-state" / "ledger.jsonl")
    assert code == 0
    assert out["oracle_recheck"]["status"] == "not-run"
    p = subprocess.run([sys.executable, str(RELAY), "verify",
                        str(run / ".relay-state" / "ledger.jsonl")],
                       capture_output=True, text=True, env=_env())
    assert "oracle re-check not run" in p.stdout


def test_sprint_flag_reaches_a_ledger_that_cannot_find_its_own_sprint(tmp_path):
    run, sprint, _ = _run(tmp_path)
    ledger = run / ".relay-state" / "ledger.jsonl"
    s = json.loads(sprint.read_text())
    s["work_packages"][0]["checklist"][0]["cmd"] = "true"
    sprint.write_text(json.dumps(s))
    code, out = _verify(ledger, "--sprint", str(sprint))
    assert code == 2 and out["result"] == "SPRINT-DIVERGED"


def test_tamper_still_outranks_divergence(tmp_path):
    """Both wrong at once: the record cannot be trusted, so the reader must be told THAT first."""
    run, sprint, _ = _run(tmp_path)
    ledger = run / ".relay-state" / "ledger.jsonl"
    lines = ledger.read_text().splitlines()
    e = json.loads(lines[-1]); e["event"] = "forged"
    lines[-1] = json.dumps(e)
    ledger.write_text("\n".join(lines) + "\n")
    s = json.loads(sprint.read_text())
    s["work_packages"][0]["checklist"][0]["cmd"] = "true"
    sprint.write_text(json.dumps(s))
    code, out = _verify(run)
    assert code == 1 and out["result"] == "TAMPERED"


def test_recompute_matches_the_shell_that_recorded_it(tmp_path):
    """The whole check rests on one equivalence: `sprint_oracles` must reproduce, byte for byte, the
    sha that lib/relay-gate.sh put on the chain — including the judge form, where `paths` joins into
    the oracle because the same criterion over a narrower artifact is a different question.

    Checked against every control in every shipped profile rather than a fixture, because a formula
    that drifts from the shell fails silently in exactly the direction this test exists to prevent.
    """
    from importlib.machinery import SourceFileLoader
    from importlib.util import module_from_spec, spec_from_loader
    ldr = SourceFileLoader("relaymod", str(RELAY))
    mod = module_from_spec(spec_from_loader("relaymod", ldr))
    ldr.exec_module(mod)

    def shell_sha(text):
        """The REAL `relay_oracle_sha`, sourced from the lib that records the chain — not a retyped
        copy of it. A retyped formula agrees with itself no matter how far both have drifted."""
        return subprocess.run(
            ["bash", "-c", f'. {ROOT / "lib" / "relay-gate.sh"}; relay_oracle_sha "$1"', "_", text],
            capture_output=True, text=True).stdout.strip()

    seen_cmd = seen_judge = 0
    profiles = sorted((ROOT / "profiles").glob("*.sprint.json"))
    assert profiles, "no compiled profiles to check against"
    for p in profiles:
        got = mod.sprint_oracles(str(p))
        s = json.loads(p.read_text())
        for wp in s.get("work_packages", []):
            for c in wp.get("checklist", []) or []:
                if c.get("cmd"):
                    seen_cmd += 1
                    assert got[c["id"]] == shell_sha(c["cmd"]), f"{p.name}:{c['id']}"
                elif c.get("judge"):
                    seen_judge += 1
                    scope = " ".join(c.get("paths", []) or [])
                    text = c["judge"] + (f" :: {scope}" if scope else "")
                    assert got[c["id"]] == shell_sha(text), f"{p.name}:{c['id']}"
    assert seen_cmd and seen_judge, f"both control kinds must be exercised ({seen_cmd}/{seen_judge})"

    # No shipped judge control carries `paths` today, so the profiles above never exercise the scope
    # join — dropping it from the oracle survived them all. Pin the shape here instead of waiting for
    # a profile to grow one.
    scoped = tmp_path / "scoped.sprint.json"
    scoped.write_text(json.dumps({
        "brief": "scoped judge", "retry_budget": 1,
        "work_packages": [{"id": "wp1", "checklist": [
            {"id": "J-SCOPED", "assert": "reasoned",
             "judge": "the argument is supported by what it cites",
             "paths": ["docs/a.md", "docs/b.md"]},
            {"id": "J-BARE", "assert": "reasoned", "judge": "the argument is supported by what it cites"},
        ]}],
    }))
    got = mod.sprint_oracles(str(scoped))
    crit = "the argument is supported by what it cites"
    assert got["J-SCOPED"] == shell_sha(f"{crit} :: docs/a.md docs/b.md")
    assert got["J-BARE"] == shell_sha(crit)
    # Same criterion, narrower artifact: a different question, so a different oracle.
    assert got["J-SCOPED"] != got["J-BARE"]
