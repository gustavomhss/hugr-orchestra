"""Tests for Roadmap #6 — compaction for tail-context rot.

Drives the REAL bin/relay-arm-hook.sh via subprocess (no mocking).
All state is isolated in tmp_path.

Assertions:
  (a) First gate-fail reason contains the full instructions.
  (b) A second consecutive gate-fail reason is SHORTER and omits the full
      instructions but still lists the failing control ids.
  (c) With RELAY_COMPACT_AFTER lowered, advancing past the threshold appends
      the checkpoint hint line AND writes a `compaction-hint` ledger event.
  (d) The ledger still verifies with benchmark/verify_ledger.py after all of
      the above interactions.
"""

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mk_arm(arms: Path, work: Path, token: str, budget: int = 3,
            n_gates: int = 2, instructions: str = "detailed instructions go here") -> Path:
    """Create a minimal arm directory with n_gates gates under tmp_path."""
    d = arms / token
    d.mkdir(parents=True, exist_ok=True)

    wps = []
    for idx in range(n_gates):
        wps.append({
            "id": f"wp{idx+1}",
            "instructions": instructions,
            "checklist": [{
                "id": f"C{idx+1}",
                "assert": f"file{idx+1} exists",
                "cmd": f"test -f {work}/{token}_f{idx+1}",
            }],
        })

    sprint = {"brief": "compaction-test", "retry_budget": budget, "work_packages": wps}
    (d / "sprint.json").write_text(json.dumps(sprint))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": token}))
    (d / "tr.jsonl").write_text(
        json.dumps({"type": "user", "content": f"RELAY-ARM:{token}"}) + "\n"
    )
    (d / "counter").write_text("0")
    return d


def _fire(arms: Path, corpus: Path, token: str,
          extra_env: dict | None = None) -> dict | None:
    """Fire the hook once; return parsed JSON output or None if empty."""
    tr = arms / token / "tr.jsonl"
    env = {
        "RELAY_ARMS_DIR": str(arms),
        "RELAY_CORPUS_DIR": str(corpus),
        "PATH": os.environ["PATH"],
    }
    if extra_env:
        env.update(extra_env)
    result = subprocess.run(
        ["bash", str(HOOK)],
        input=json.dumps({"transcript_path": str(tr)}),
        capture_output=True,
        text=True,
        env=env,
    )
    out = result.stdout.strip()
    if not out:
        return None
    return json.loads(out)


# ---------------------------------------------------------------------------
# (a) + (b): compaction-aware re-block
# ---------------------------------------------------------------------------

class TestReblockCompaction:
    """First failure injects full instructions; subsequent retries shrink the reason."""

    INSTRUCTIONS = "FULL INSTRUCTIONS: configure the server and restart the service"
    FAILING_ID = "C1"

    def _setup(self, tmp_path):
        arms = tmp_path / "arms"
        work = tmp_path / "work"
        corpus = tmp_path / "corpus"
        work.mkdir()
        token = "tok-compact"
        _mk_arm(arms, work, token, budget=5, n_gates=2, instructions=self.INSTRUCTIONS)
        return arms, work, corpus, token

    def test_first_fail_contains_full_instructions(self, tmp_path):
        arms, work, corpus, token = self._setup(tmp_path)
        # Fire #1: gate C1 not satisfied -> first block (r=0, emits full reason)
        out = _fire(arms, corpus, token)
        assert out is not None
        assert out["decision"] == "block"
        reason = out["reason"]
        # Full instructions must appear in the first failure
        assert self.INSTRUCTIONS in reason, (
            f"Expected full instructions in first gate-fail reason.\nGot: {reason!r}"
        )

    def test_second_fail_is_shorter_and_omits_instructions(self, tmp_path):
        arms, work, corpus, token = self._setup(tmp_path)
        # Fire #1 (r=0 -> full reason)
        out1 = _fire(arms, corpus, token)
        assert out1 is not None and out1["decision"] == "block"
        reason1 = out1["reason"]

        # Fire #2 (r=1 -> compact reason)
        out2 = _fire(arms, corpus, token)
        assert out2 is not None and out2["decision"] == "block"
        reason2 = out2["reason"]

        # Compacted reason must NOT contain the full instructions blob
        assert self.INSTRUCTIONS not in reason2, (
            f"Second fail reason should omit full instructions.\nGot: {reason2!r}"
        )
        # But it MUST still reference the failing control id
        assert self.FAILING_ID in reason2, (
            f"Second fail reason must name the failing id ({self.FAILING_ID}).\nGot: {reason2!r}"
        )
        # And it must be strictly shorter
        assert len(reason2) < len(reason1), (
            f"Second reason ({len(reason2)} chars) should be shorter than first ({len(reason1)} chars)"
        )

    def test_ledger_gate_fail_entries_are_unaffected(self, tmp_path):
        """Ledger entries keep full fidelity regardless of compaction."""
        arms, work, corpus, token = self._setup(tmp_path)
        _fire(arms, corpus, token)
        _fire(arms, corpus, token)

        ledger_path = arms / token / "ledger.jsonl"
        entries = [json.loads(l) for l in ledger_path.read_text().splitlines() if l.strip()]
        gate_fails = [e for e in entries if e.get("event") == "gate-fail"]
        assert len(gate_fails) == 2, f"Expected 2 gate-fail events, got {len(gate_fails)}"
        # Both entries record the retry counter (full fidelity)
        retries = [e["retry"] for e in gate_fails]
        assert retries == [1, 2], f"Expected retry counters [1,2], got {retries}"


# ---------------------------------------------------------------------------
# (c): checkpoint hint on deep advance
# ---------------------------------------------------------------------------

class TestCheckpointHint:
    """Advancing past RELAY_COMPACT_AFTER gates triggers the checkpoint hint."""

    COMPACT_AFTER = 3  # lower threshold so we don't need a huge chain

    def _build_deep_chain(self, tmp_path, n_gates: int = 5) -> tuple[Path, Path, Path, str]:
        arms = tmp_path / "arms"
        work = tmp_path / "work"
        corpus = tmp_path / "corpus"
        work.mkdir()
        token = "tok-deep"
        d = arms / token
        d.mkdir(parents=True, exist_ok=True)

        wps = []
        for idx in range(n_gates):
            f = str(work / f"{token}_f{idx+1}")
            wps.append({
                "id": f"wp{idx+1}",
                "instructions": f"instructions for gate {idx+1}",
                "checklist": [{"id": f"C{idx+1}", "assert": f"file{idx+1}", "cmd": f"test -f {f}"}],
            })
        sprint = {"brief": "deep-chain", "retry_budget": 3, "work_packages": wps}
        (d / "sprint.json").write_text(json.dumps(sprint))
        (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": token}))
        (d / "tr.jsonl").write_text(
            json.dumps({"type": "user", "content": f"RELAY-ARM:{token}"}) + "\n"
        )
        (d / "counter").write_text("0")
        return arms, work, corpus, token

    def _fire_with_compact(self, arms, corpus, token):
        return _fire(arms, corpus, token,
                     extra_env={"RELAY_COMPACT_AFTER": str(self.COMPACT_AFTER)})

    def test_checkpoint_hint_appended_to_reason(self, tmp_path):
        """At depth >= RELAY_COMPACT_AFTER the advance reason contains the checkpoint line."""
        arms, work, corpus, token = self._build_deep_chain(tmp_path, n_gates=5)
        n_gates = 5

        # Advance through all gates by satisfying each checklist file in turn
        checkpoint_seen = False
        for idx in range(n_gates):
            # Satisfy the current gate's file
            (work / f"{token}_f{idx+1}").write_text("x")
            out = self._fire_with_compact(arms, corpus, token)
            if out is None:
                # chain complete (last gate)
                break
            assert out["decision"] == "block"
            reason = out["reason"]
            # After advancing to gate index >= COMPACT_AFTER, hint must be present
            ni = idx + 1  # ni is the NEXT gate index after this advance
            if ni >= self.COMPACT_AFTER:
                if "(checkpoint:" in reason:
                    checkpoint_seen = True
                    assert "gates cleared" in reason, (
                        f"Checkpoint hint incomplete.\nGot: {reason!r}"
                    )
                    assert str(ni) in reason, (
                        f"Checkpoint should embed gate count {ni}.\nGot: {reason!r}"
                    )

        assert checkpoint_seen, (
            f"Expected to see at least one checkpoint hint when ni >= {self.COMPACT_AFTER}"
        )

    def test_compaction_hint_ledger_event_written(self, tmp_path):
        """The ledger records a compaction-hint event when the threshold is crossed."""
        arms, work, corpus, token = self._build_deep_chain(tmp_path, n_gates=5)

        for idx in range(5):
            (work / f"{token}_f{idx+1}").write_text("x")
            self._fire_with_compact(arms, corpus, token)

        ledger_path = arms / token / "ledger.jsonl"
        entries = [json.loads(l) for l in ledger_path.read_text().splitlines() if l.strip()]
        hint_events = [e for e in entries if e.get("event") == "compaction-hint"]
        assert len(hint_events) >= 1, (
            f"Expected at least one compaction-hint event in ledger.\n"
            f"Events found: {[e['event'] for e in entries]}"
        )

    def test_no_checkpoint_below_threshold(self, tmp_path):
        """Advancing within the threshold leaves the reason unchanged (no checkpoint line)."""
        arms, work, corpus, token = self._build_deep_chain(tmp_path, n_gates=5)

        # Only advance to gate 1 (ni=1, well below COMPACT_AFTER=3)
        (work / f"{token}_f1").write_text("x")
        out = self._fire_with_compact(arms, corpus, token)
        assert out is not None and out["decision"] == "block"
        assert "(checkpoint:" not in out["reason"], (
            f"Should not see checkpoint hint below threshold.\nGot: {out['reason']!r}"
        )


# ---------------------------------------------------------------------------
# (d): ledger integrity after compaction interactions
# ---------------------------------------------------------------------------

class TestLedgerIntegrityAfterCompaction:
    """After compaction interactions the ledger must still verify cleanly."""

    def test_ledger_verifies_after_reblock_compaction(self, tmp_path):
        arms = tmp_path / "arms"
        work = tmp_path / "work"
        corpus = tmp_path / "corpus"
        work.mkdir()
        token = "tok-verify-reblock"
        _mk_arm(arms, work, token, budget=5, n_gates=2,
                instructions="full instructions for verify test")

        # Two failures (triggers compaction on second), then satisfy and complete
        _fire(arms, corpus, token)  # fail 1
        _fire(arms, corpus, token)  # fail 2 (compact reason)
        (work / f"{token}_f1").write_text("x")
        _fire(arms, corpus, token)  # advance to gate 2
        (work / f"{token}_f2").write_text("x")
        _fire(arms, corpus, token)  # complete

        ledger_path = arms / token / "ledger.jsonl"
        result = subprocess.run(
            ["python3", str(VERIFY), str(ledger_path)],
            capture_output=True, text=True
        )
        assert result.returncode == 0, (
            f"verify_ledger.py failed after reblock compaction.\nOutput: {result.stdout}\n{result.stderr}"
        )

    def test_ledger_verifies_after_deep_advance_with_hint(self, tmp_path):
        arms = tmp_path / "arms"
        work = tmp_path / "work"
        corpus = tmp_path / "corpus"
        work.mkdir()
        token = "tok-verify-deep"
        n_gates = 5

        d = arms / token
        d.mkdir(parents=True, exist_ok=True)
        wps = []
        for idx in range(n_gates):
            f = str(work / f"{token}_f{idx+1}")
            wps.append({
                "id": f"wp{idx+1}",
                "instructions": f"instructions {idx+1}",
                "checklist": [{"id": f"C{idx+1}", "assert": f"f{idx+1}", "cmd": f"test -f {f}"}],
            })
        (d / "sprint.json").write_text(json.dumps(
            {"brief": "deep", "retry_budget": 3, "work_packages": wps}
        ))
        (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": token}))
        (d / "tr.jsonl").write_text(
            json.dumps({"type": "user", "content": f"RELAY-ARM:{token}"}) + "\n"
        )
        (d / "counter").write_text("0")

        env_extra = {"RELAY_COMPACT_AFTER": "3"}
        for idx in range(n_gates):
            (work / f"{token}_f{idx+1}").write_text("x")
            _fire(arms, corpus, token, extra_env=env_extra)

        ledger_path = arms / token / "ledger.jsonl"
        result = subprocess.run(
            ["python3", str(VERIFY), str(ledger_path)],
            capture_output=True, text=True
        )
        assert result.returncode == 0, (
            f"verify_ledger.py failed after deep advance with hints.\nOutput: {result.stdout}\n{result.stderr}"
        )
