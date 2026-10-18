"""tools/spec/spec-check — the verifier for the spec-decompose gates, and proof that it discriminates.

A checker that only ever fails is useless, and a checker that only ever passes is worse. So this
file holds one KNOWN-GOOD spec and then breaks it one field at a time, asserting each criterion
catches its own mutation and nothing else's. That is the golden-teeth test: coverage says the
criterion ran, mutation says it would have noticed.

What spec-check deliberately does not judge — whether an invariant is well chosen, whether a scenario
is meaningful, whether a package is the right cut — is reserved for the cold review, which is graded
against the diff by a judge. Splitting it that way is the point: the mechanical half must be
mechanical, or its verdict means nothing.
"""
import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CHECK = ROOT / "tools" / "spec" / "spec-check"
CRIT = ROOT / "tools" / "criterion"

GOOD = {
  "invariants.json": [
    {"id": "INV-1", "statement": "A ledger entry is never rewritten",
     "grounding": "hash chain, docs/control-plane.md §5", "falsifier": "verify_ledger reports TAMPERED"},
    {"id": "INV-2", "statement": "A gate passes only on a recorded verdict",
     "grounding": "lib/relay-gate.sh", "falsifier": "a chain advances with no checklist-item entry"}],
  "requirements.json": [
    {"id": "REQ-1", "statement": "The system SHALL reject an entry whose prev hash mismatches",
     "source_invs": ["INV-1"]},
    {"id": "REQ-2", "statement": "The gate SHALL record one verdict per control before advancing",
     "source_invs": ["INV-2"]}],
  "spec.json": {
    "interfaces": [
      {"name": "chain_append", "inputs": ["body"], "outputs": ["entry"],
       "errors": ["PrevMismatch"], "source_reqs": ["REQ-1"]},
      {"name": "run_checklist", "inputs": ["wp"], "outputs": ["verdicts"],
       "errors": ["OracleUnavailable"], "source_reqs": ["REQ-2"]}],
    "edge_cases": ["empty ledger", "control with no cmd"]},
  "scenarios.json": [
    {"id": "SCN-1", "kind": "happy", "source_req": "REQ-1", "can_fail": True},
    {"id": "SCN-2", "kind": "guard", "source_req": "REQ-1", "can_fail": True},
    {"id": "SCN-3", "kind": "happy", "source_req": "REQ-2", "can_fail": True},
    {"id": "SCN-4", "kind": "guard", "source_req": "REQ-2", "can_fail": True}],
  "packages.json": [
    {"id": "WP-1", "intent": "harden the chain append", "source_reqs": ["REQ-1"],
     "acceptance": ["SCN-1", "SCN-2"], "deps": []},
    {"id": "WP-2", "intent": "record verdicts before advance", "source_reqs": ["REQ-2"],
     "acceptance": ["SCN-3", "SCN-4"], "deps": ["WP-1"]}],
}
PHASES = ["invariants", "requirements", "spec", "goldens", "work_packages"]


def _spec(tmp_path, mutate=None):
    d = tmp_path / "spec"
    d.mkdir(parents=True, exist_ok=True)
    data = json.loads(json.dumps(GOOD))          # deep copy
    if mutate:
        mutate(data)
    for name, body in data.items():
        (d / name).write_text(json.dumps(body))
    return d


def _report(spec_dir, phase):
    r = subprocess.run(["python3", str(CHECK), "--phase", phase, "--spec-dir", str(spec_dir), "--json"],
                       capture_output=True, text=True)
    return {row["criterion"]: row["status"] for row in json.loads(r.stdout)}, r.returncode


def _failing(spec_dir):
    out = {}
    for p in PHASES:
        rep, _ = _report(spec_dir, p)
        out.update({c: s for c, s in rep.items() if s != "PASS"})
    return set(out)


# --------------------------------------------------------------------------- it passes what is right

@pytest.mark.parametrize("phase", PHASES)
def test_a_good_spec_passes_every_phase(tmp_path, phase):
    rep, code = _report(_spec(tmp_path), phase)
    assert code == 0, rep
    assert set(rep.values()) == {"PASS"}, rep


def test_a_missing_artifact_fails_closed(tmp_path):
    d = tmp_path / "spec"
    d.mkdir()
    rep, code = _report(d, "invariants")
    assert code == 1 and set(rep.values()) == {"FAIL"}, rep


# --------------------------------------------------------------- and it notices what is wrong, exactly

MUTATIONS = [
    ("invariants_registered", lambda d: d["invariants.json"][0].__setitem__("id", "INVARIANT-1")),
    ("each_invariant_grounded", lambda d: d["invariants.json"][1].__setitem__("grounding", "  ")),
    ("each_invariant_falsifiable", lambda d: d["invariants.json"][0].pop("falsifier")),
    # Singular, per ISO 29148: two obligations behind one verdict hides a half-met requirement.
    ("requirements_atomic",
     lambda d: d["requirements.json"][0].__setitem__(
         "statement", "The system SHALL reject a bad entry and SHALL log it")),
    # DERIVED both ways — a REQ citing nothing real, and an INV nothing closes.
    ("requirements_traced_to_invariants",
     lambda d: d["requirements.json"][0].__setitem__("source_invs", ["INV-99"])),
    ("ambiguity_scan_done",
     lambda d: d["requirements.json"][1].__setitem__(
         "statement", "The gate SHALL record verdicts in a reasonable time")),
    ("interfaces_defined", lambda d: d["spec.json"]["interfaces"][0].pop("outputs")),
    ("error_behavior_specified", lambda d: d["spec.json"]["interfaces"][1].__setitem__("errors", [])),
    # COMPLETE: a spec covering only some requirements is a spec with a hole in it.
    ("edge_cases_enumerated",
     lambda d: d["spec.json"]["interfaces"][1].__setitem__("source_reqs", [])),
    ("happy_scenarios_written",
     lambda d: [s.__setitem__("kind", "guard") for s in d["scenarios.json"]]),
    ("guard_scenarios_written",
     lambda d: [s.__setitem__("kind", "happy") for s in d["scenarios.json"]]),
    ("every_requirement_covered", lambda d: d["scenarios.json"].pop(3)),
    # TOOTHED: a scenario that cannot fail is documentation wearing a test's clothes.
    ("every_scenario_can_fail", lambda d: d["scenarios.json"][2].__setitem__("can_fail", False)),
    ("wp_cards_complete", lambda d: d["packages.json"][0].__setitem__("acceptance", [])),
    # CLOSED is a PARTITION, not a covering: a REQ in two packages is two agents building one thing.
    ("coverage_matrix_closed",
     lambda d: d["packages.json"][1].__setitem__("source_reqs", ["REQ-1", "REQ-2"])),
    ("dependencies_mapped", lambda d: d["packages.json"][1].__setitem__("deps", ["WP-9"])),
]


@pytest.mark.parametrize("criterion,mutate", MUTATIONS, ids=[m[0] for m in MUTATIONS])
def test_each_criterion_catches_its_own_mutation(tmp_path, criterion, mutate):
    failing = _failing(_spec(tmp_path, mutate))
    assert criterion in failing, f"{criterion} did not notice its mutation; failing were {failing}"


def test_every_criterion_has_a_mutation(tmp_path):
    """A criterion with no mutation behind it is a criterion nobody has shown can fail — which is the
    same charge `every_scenario_can_fail` levels at a golden."""
    declared = set()
    for p in PHASES:
        declared |= set(_report(_spec(tmp_path), p)[0])
    assert declared == {m[0] for m in MUTATIONS}, declared ^ {m[0] for m in MUTATIONS}


# ------------------------------------------------------------------------------- the generic shim

def test_criterion_exits_zero_only_for_a_passing_criterion(tmp_path):
    d = _spec(tmp_path)
    ok = subprocess.run(["python3", str(CRIT), str(CHECK), "invariants", "each_invariant_grounded",
                         "--spec-dir", str(d)], capture_output=True, text=True)
    assert ok.returncode == 0, ok.stderr

    bad = _spec(tmp_path / "bad", lambda x: x["invariants.json"][0].pop("falsifier"))
    r = subprocess.run(["python3", str(CRIT), str(CHECK), "invariants", "each_invariant_falsifiable",
                        "--spec-dir", str(bad)], capture_output=True, text=True)
    assert r.returncode == 1 and "falsifier" in r.stderr, r.stderr

    absent = subprocess.run(["python3", str(CRIT), str(CHECK), "invariants", "no_such_criterion",
                             "--spec-dir", str(d)], capture_output=True, text=True)
    assert absent.returncode == 1 and "not a criterion" in absent.stderr, absent.stderr


# ---------- atomicity: a conjunction is only a defect when it joins two OBLIGATIONS -------------

def _atomic(statement):
    from importlib.machinery import SourceFileLoader
    from importlib.util import module_from_spec, spec_from_loader
    ldr = SourceFileLoader("speccheck", str(CHECK))
    mod = module_from_spec(spec_from_loader("speccheck", ldr))
    ldr.exec_module(mod)
    return mod._joins_two_obligations(statement)


ATOMICITY = [
    # (statement, joins_two_obligations)
    ("The app shall refuse an expired license.", False),
    # Two obligations, one modal — the shape the first version caught correctly.
    ("The app shall complete start-up and enable every feature.", True),
    ("The app shall persist a mark and shall use it.", True),
    # A semicolon joining two obligations. `\b(?:and|;)\b` could NEVER match one — `;` is not a word
    # character — so every semicolon-joined pair passed silently until the split was fixed.
    ("The app shall log the reason; it shall exit non-zero.", True),
    # Noun lists inside ONE obligation. Both were flagged by the first version, on a real agent's
    # register: half its findings were wrong, which is how a check teaches its reader to override it.
    ("The artifact shall contain no private key and no other secret.", False),
    ("Verification shall cover every field (including expiry and identity).", False),
    ("The message shall name the cause and the remedy.", False),
    # Documented limit, not an oversight: swap the conjunction for a comma and two obligations pass.
    # `requirements.cold_review` carries the predicate as judgment for exactly this reason.
    ("The app shall refuse the license, it shall exit non-zero.", False),
]


@pytest.mark.parametrize("statement,expected", ATOMICITY,
                         ids=[s[:38] for s, _ in ATOMICITY])
def test_atomicity_flags_obligations_not_conjunctions(statement, expected):
    assert _atomic(statement) is expected
