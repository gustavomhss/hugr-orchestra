"""tools/design/design-check — the DESIGN protocol's six gates, and proof it discriminates.

The protocol names its own verify hooks and says who runs them: *"Verify hooks (run by the harness,
not claimed by the agent): clean-hands-lint over the question log; intake-reconcile over the map
(100% provenance, quote-is-substring-of-utterance, unique ids, valid kinds, last two rounds
recorded)"*. This is those hooks.

The split between mechanical and judgment is the PROTOCOL'S, not an invention: it defines three
`review` states — `distinctness`, `dress_rehearsal`, `no_flinching` — for the questions a checker
cannot answer, and it says plainly why: *"The lint is a floor, not a ceiling... Claiming more for
the lint than it does would be exactly the false comfort this method exists to kill."*

Judged the same way as spec-check: one known-good design, broken ONE FIELD AT A TIME, with every
criterion required to catch its own mutation.
"""
import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CHECK = ROOT / "tools" / "design" / "design-check"
PHASES = ["intake", "mirror", "concept", "shape", "risks", "ratify"]

FRONT_PAGE = """# The one-pager

## The problem
Stated from the owner's point of view.

## What this does NOT do
It does not replace the existing importer.

## How this could fail
Nobody adopts it because the export step stays manual.
"""

MEMO = """# Decision memo

## Context
The importer is slow.

## Options considered
Three doors, recorded in doors.json.

## Decision
Door B.

## Consequences
The manual export stays for v1.
"""

GOOD = {
  "transcript.json": {"contract_presented": True, "utterances": [
      {"id": "U-1", "speaker": "owner", "text": "Last Tuesday the import took four hours and I gave up."},
      {"id": "U-2", "speaker": "owner", "text": "I keep a spreadsheet on the side because I do not trust it."}]},
  "map.json": {"entries": [
      {"id": "M-1", "kind": "fact", "quote": "the import took four hours", "utterance_id": "U-1"},
      {"id": "M-2", "kind": "episode", "quote": "Last Tuesday", "utterance_id": "U-1"},
      {"id": "M-3", "kind": "term", "quote": "spreadsheet on the side", "utterance_id": "U-2"},
      {"id": "M-4", "kind": "tension", "linked_to": ["M-1", "M-3"], "disposition": "open-for-signer"}],
      "rounds": [{"new_topic_rate": 0.5, "new_nuance_rate": 0.4},
                 {"new_topic_rate": 0.1, "new_nuance_rate": 0.1}]},
  "question-log.json": {"questions": [
      {"round": 1, "text": "Walk me through the last time that happened."},
      {"round": 2, "text": "What else was going on that day?"}]},
  "front-page.md": FRONT_PAGE,
  "readback.json": {"chunks": [
      {"id": "C-1", "response": "confirm", "verbatim": "yes that is exactly it"},
      {"id": "C-2", "response": "correct", "verbatim": "it was three hours not four", "map_update": "M-1"},
      {"id": "C-3", "response": "disagree", "verbatim": "I would not call it a workaround",
       "recorded_as": "M-4"}]},
  "doors.json": {"doors": [
      {"id": "D-1", "paragraph": "Batch importer.", "tradeoffs": "slow to build",
       "aggravates": ["feasibility"]},
      {"id": "D-2", "paragraph": "Streaming importer.", "tradeoffs": "harder ops",
       "aggravates": ["viability"]},
      {"id": "D-3", "paragraph": "Drop the importer, adopt the spreadsheet.", "tradeoffs": "manual",
       "aggravates": ["usability"]}],
      "chosen": "D-2", "rationale": "It removes the four-hour wait the owner described.",
      "rejected": [{"id": "D-1", "reason": "keeps the wait"}, {"id": "D-3", "reason": "owner rejected"}],
      "traces_to": ["M-1", "M-3"]},
  "verdict-distinctness.json": {"verdict": "APPROVE", "findings": "RELAY_JUDGE_OK. Three approaches."},
  "skeleton.json": {"vertebrae": [
      {"id": "V-1", "step": "connect the source", "produces": "connection",
       "touchpoints": ["a connect screen"], "nouns": ["source"]},
      {"id": "V-2", "step": "stream the rows", "consumes": "connection", "produces": "rows",
       "touchpoints": ["a progress line"], "nouns": ["row"]}],
      "scenes": [
        {"id": "S-1", "kind": "first_use", "actor": "the owner", "observable_ending": "rows land",
         "observable_failure": "no rows land within a minute"},
        {"id": "S-2", "kind": "failure", "actor": "the owner", "observable_ending": "an error names the row",
         "observable_failure": "the error names nothing"},
        {"id": "S-3", "kind": "normal", "actor": "the owner", "observable_ending": "rows land",
         "observable_failure": "the count differs from the source"}],
      "non_goals": [{"text": "no scheduled imports", "plausibly_expected_by": "anyone used to cron"}]},
  "verdict-dress_rehearsal.json": {"verdict": "APPROVE", "findings": "RELAY_JUDGE_OK. Every scene can fail."},
  "risks.json": {
      "obituaries": [{"axis": a, "rank": i + 1, "narrative": "It died because..."}
                     for i, a in enumerate(["value", "usability", "feasibility", "viability"])],
      "assumptions": [
        {"id": "A-1", "importance": 5, "evidence": 1, "probe": "ask five users to run the export",
         "kill_criterion": "fewer than three finish", "kill_sealed_at": "2026-01-01T00:00:00Z",
         "probe_ran_at": "2026-01-05T00:00:00Z"},
        {"id": "A-2", "importance": 2, "evidence": 4}],
      "front_page_promises": ["removes the four-hour wait"],
      "v1_delivers": ["removes the four-hour wait"]},
  "verdict-no_flinching.json": {"verdict": "APPROVE", "findings": "RELAY_JUDGE_OK. No soft obituary."},
  "memo.md": MEMO,
  "ratify.json": {"dissent": [], "ledger": [{"id": "A-1", "status": "confirmed"},
                                            {"id": "A-2", "status": "killed"}],
                  "signature": {"signer": "the owner", "signature": "ed25519:abcd",
                                "covers": ["v1_scope", "accepted_risks", "confirmed_assumptions"]}},
}


def _design(tmp_path, mutate=None):
    d = tmp_path / "design"
    d.mkdir(parents=True, exist_ok=True)
    data = json.loads(json.dumps({k: v for k, v in GOOD.items() if not k.endswith(".md")}))
    data.update({k: v for k, v in GOOD.items() if k.endswith(".md")})
    if mutate:
        mutate(data)
    for name, body in data.items():
        (d / name).write_text(body if isinstance(body, str) else json.dumps(body))
    return d


def _report(d, phase):
    r = subprocess.run(["python3", str(CHECK), "--phase", phase, "--design-dir", str(d), "--json"],
                       capture_output=True, text=True)
    return {row["criterion"]: row["status"] for row in json.loads(r.stdout)}, r.returncode


def _failing(d):
    bad = set()
    for p in PHASES:
        rep, _ = _report(d, p)
        bad |= {c for c, s in rep.items() if s != "PASS"}
    return bad


@pytest.mark.parametrize("phase", PHASES)
def test_a_good_design_passes_every_phase(tmp_path, phase):
    rep, code = _report(_design(tmp_path), phase)
    assert code == 0, rep
    assert set(rep.values()) == {"PASS"}, rep


@pytest.mark.parametrize("phase", PHASES)
def test_an_absent_design_fails_closed(tmp_path, phase):
    d = tmp_path / "empty"
    d.mkdir()
    rep, code = _report(d, phase)
    assert code == 1 and set(rep.values()) == {"FAIL"}, rep


MUTATIONS = [
    ("narrative_captured", lambda d: d["transcript.json"].__setitem__("contract_presented", False)),
    ("episodes_anchored", lambda d: d["map.json"]["entries"][1].pop("utterance_id")),
    ("map_consolidated", lambda d: d["map.json"]["entries"][2].__setitem__("id", "M-1")),
    ("tensions_swept", lambda d: d["map.json"]["entries"][3].pop("disposition")),
    ("saturation_reached",
     lambda d: d["map.json"]["rounds"][1].__setitem__("new_topic_rate", 0.9)),
    ("question_log_clean",
     lambda d: d["question-log.json"]["questions"][0].__setitem__(
         "text", "Don't you think a batch importer would fix this?")),
    # The anti-fabrication control: a plausible paraphrase that never left the owner's mouth.
    ("provenance_complete",
     lambda d: d["map.json"]["entries"][0].__setitem__("quote", "the import was unbearably slow")),
    ("front_page_written",
     lambda d: d.__setitem__("front-page.md", "# Page\n\n## The problem\nOnly the good news.\n")),
    ("every_chunk_confirmed", lambda d: d["readback.json"]["chunks"][0].__setitem__("verbatim", "")),
    ("corrections_folded", lambda d: d["readback.json"]["chunks"][1].pop("map_update")),
    ("disagreements_recorded", lambda d: d["readback.json"]["chunks"][2].pop("recorded_as")),
    # Not "remove a door" — 2 is still a legal count, so that mutation changes nothing and the first
    # version of this test wrongly accused the checker. The shape violation is the real one: a door
    # must name which of the FOUR risk axes it aggravates, and "convenience" is not one of them.
    ("doors_reviewed",
     lambda d: d["doors.json"]["doors"][1].__setitem__("aggravates", ["convenience"])),
    ("choice_rationale_logged", lambda d: d["doors.json"].__setitem__("rationale", "  ")),
    ("rejected_doors_recorded",
     lambda d: d["doors.json"]["rejected"][0].__setitem__("reason", "")),
    ("choice_traces_to_problem", lambda d: d["doors.json"].__setitem__("traces_to", ["M-99"])),
    ("skeleton_walks_end_to_end",
     lambda d: d["skeleton.json"]["vertebrae"][1].__setitem__("consumes", "something nobody wrote")),
    ("touchpoints_per_vertebra",
     lambda d: d["skeleton.json"]["vertebrae"][0].__setitem__("touchpoints", [])),
    ("nouns_named", lambda d: [v.__setitem__("nouns", []) for v in d["skeleton.json"]["vertebrae"]]),
    # "A scene that cannot fail is decoration and is rejected."
    ("scenes_reviewed",
     lambda d: d["skeleton.json"]["scenes"][2].__setitem__("observable_failure", "")),
    ("non_goals_explicit",
     lambda d: d["skeleton.json"]["non_goals"][0].__setitem__("plausibly_expected_by", "")),
    ("boundary_scenes_present",
     lambda d: d["skeleton.json"]["scenes"][0].__setitem__("kind", "normal")),
    ("four_axes_ranked", lambda d: d["risks.json"]["obituaries"].pop()),
    ("assumptions_plotted", lambda d: d["risks.json"]["assumptions"][0].pop("evidence")),
    ("critical_assumptions_have_probes",
     lambda d: d["risks.json"]["assumptions"][0].__setitem__("probe", "")),
    # A kill criterion written after the probe ran is a result narrated into a threshold.
    ("kill_criteria_sealed_before_probes",
     lambda d: d["risks.json"]["assumptions"][0].__setitem__("kill_sealed_at", "2026-02-01T00:00:00Z")),
    ("anti_optimism_reviewed",
     lambda d: d["verdict-no_flinching.json"].__setitem__("verdict", "FIXES-NEEDED")),
    ("v1_still_delivers_front_page", lambda d: d["risks.json"].__setitem__("v1_delivers", [])),
    ("memo_written", lambda d: d.__setitem__("memo.md", "# Memo\n\n## Decision\nDoor B.\n")),
    ("dissent_solicited", lambda d: d["ratify.json"].pop("dissent")),
    ("assumption_ledger_closed",
     lambda d: d["ratify.json"]["ledger"][0].__setitem__("status", "ASSUMED")),
    ("owner_signed", lambda d: d["ratify.json"]["signature"].__setitem__("covers", ["v1_scope"])),
]


@pytest.mark.parametrize("criterion,mutate", MUTATIONS, ids=[m[0] for m in MUTATIONS])
def test_each_criterion_catches_its_own_mutation(tmp_path, criterion, mutate):
    failing = _failing(_design(tmp_path, mutate))
    assert criterion in failing, f"{criterion} did not notice its mutation; failing were {failing}"


def test_every_criterion_has_a_mutation(tmp_path):
    declared = set()
    for p in PHASES:
        declared |= set(_report(_design(tmp_path), p)[0])
    assert declared == {m[0] for m in MUTATIONS}, declared ^ {m[0] for m in MUTATIONS}
