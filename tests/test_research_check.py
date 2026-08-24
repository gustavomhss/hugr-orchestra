"""tools/research/research-check — the verifier for the research protocol's six gates, and proof it bites.

One KNOWN-GOOD research directory, then broken one field at a time: every criterion must catch its own
mutation. Coverage says the criterion ran; mutation says it would have noticed.

The protocol is DERIVED, not invented, and the fixture below is shaped by the methods it mechanizes —
ACH's competing hypotheses and diagnosticity, GRADE's derived certainty, the Admiralty code's separate
reliability and credibility grades, PRISMA-S's reproducible search record, grounded theory's constant
comparison, memoing and saturation, and Zettelkasten atomicity. Each mutation below breaks the part of
one of those methods that a machine can check.

Two tests carry more weight than the rest, because they are what a web-capable protocol can actually
promise: `test_a_fabricated_quote_is_caught` and `test_a_snapshot_edited_after_registration_is_caught`.
This cannot verify the world — a page can lie, change or vanish. It verifies the REPORT against what
was retrieved.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CHECK = ROOT / "tools" / "research" / "research-check"
CRIT = ROOT / "tools" / "criterion"

PAGE = ("Release notes 4.2\n"
        "The scheduler now retries a failed job three times before parking it.\n"
        "Parked jobs are never retried automatically.\n")
DOC = "# Ops runbook\n\nA parked job is drained by hand from the console.\n"
BLOG = "Someone on a forum said the scheduler gives up immediately. No detail given.\n"

GOOD = {
  "question.json": {
    "question": "How does the scheduler treat a job that keeps failing?",
    "context": ("A single-tenant 4.2 deployment run by the platform team, with the vendor's release "
                "notes and our own ops runbook as the only written sources; the scheduler's source "
                "code is not available to us."),
    "answer_shape": [{"id": "A-1", "must": "names the retry count"},
                     {"id": "A-2", "must": "says what happens after the retries are spent"}],
    "out_of_scope": ["job scheduling latency", "anything about the console UI"],
    "prior_belief": "I expected an unbounded retry loop with exponential backoff and no parking.",
    "hypotheses": [
      {"id": "H-1", "statement": "The scheduler retries a bounded number of times, then parks the job"},
      {"id": "H-2", "statement": "The scheduler retries indefinitely and never parks anything"}]},
  "sources.json": {
    "searched": [
      {"where": "vendor release notes 4.0-4.3", "query": "retry parked scheduler",
       "at": "2026-08-23T09:50:00Z", "limits": "4.x only"},
      {"where": "internal ops runbook", "query": "parked job",
       "at": "2026-08-23T10:04:00Z", "limits": "none"}],
    "excluded": [{"ref": "https://example.invalid/forum/thread-91",
                  "why": "a single unattributed forum claim, contradicted by the release notes"}],
    "not_searched": [{"what": "the scheduler source itself", "why": "not available to us"},
                     {"what": "vendor support tickets", "why": "no access"}],
    "saturation": {"reached": True, "dry_tail": 1,
                   "why": "the last source re-read added no finding the first two had not already "
                          "established, and no further written source exists inside the scope"},
    "sources": [
      {"id": "S-1", "kind": "web", "ref": "https://example.invalid/notes/4.2", "reliability": "B",
       "retrieved_at": "2026-08-23T10:00:00Z", "snapshot": "snapshots/S-1.txt", "sha256": None},
      {"id": "S-2", "kind": "file", "ref": "runbook.md", "reliability": "C",
       "retrieved_at": "2026-08-23T10:05:00Z", "snapshot": "snapshots/S-2.txt", "sha256": None},
      {"id": "S-3", "kind": "web", "ref": "https://example.invalid/forum/thread-91", "reliability": "F",
       "retrieved_at": "2026-08-23T10:20:00Z", "snapshot": "snapshots/S-3.txt", "sha256": None}]},
  "findings.json": [
    {"id": "F-1", "claim": "A failing job is retried three times before it is parked",
     "evidence": {"kind": "web", "source": "S-1",
                  "quote": "retries a failed job three times before parking it"},
     "credibility": 2, "found_at": "2026-08-23T10:10:00Z",
     "falsifier": "a run showing a fourth automatic attempt after three failures"},
    {"id": "F-2", "claim": "A parked job is never picked up again without a human",
     "evidence": {"kind": "file", "source": "S-2",
                  "quote": "A parked job is drained by hand from the console"},
     "credibility": 1, "corroborated_by": ["S-1"], "found_at": "2026-08-23T10:15:00Z",
     "relates_to": [{"finding": "F-1", "relation": "independent"}],
     "falsifier": "a parked job that resumes with no console action recorded"},
    {"id": "F-3", "claim": "The documented retry count is three",
     "evidence": {"kind": "command", "cmd": "echo 3", "output": "3"},
     "credibility": 3, "found_at": "2026-08-23T10:18:00Z",
     "relates_to": [{"finding": "F-1", "relation": "refines"}],
     "falsifier": "the command prints anything but 3"}],
  "memos.json": [
    {"at": "2026-08-23T10:12:00Z", "about": ["S-1"],
     "note": "S-1 is a release note, so it describes intent rather than observed behaviour; a second "
             "independent source is worth having before anything is called proven."}],
  "contest.json": [
    {"finding": "F-1", "searched_for": "any note describing a fourth attempt or a different count",
     "searched_against": ["S-1", "S-2", "S-3"],
     "scores": {"H-1": "consistent", "H-2": "inconsistent"}, "diagnostic": True,
     "contradictions": [], "resolution": "withstood"},
    {"finding": "F-2", "searched_for": "any automatic drain of parked jobs anywhere in the sources",
     "searched_against": ["S-1", "S-2"],
     "scores": {"H-1": "consistent", "H-2": "consistent"}, "diagnostic": False,
     "contradictions": [], "resolution": "withstood"},
    {"finding": "F-3", "searched_for": "a configurable retry count that would override the default",
     "searched_against": ["S-1", "S-3"],
     "scores": {"H-1": "consistent", "H-2": "inconsistent"}, "diagnostic": True,
     "contradictions": [{"source": "S-3", "quote": "gives up immediately"}], "resolution": "open"}],
  "conclusions.json": [
    {"id": "C-1", "statement": "Failing jobs stop after three automatic attempts",
     "cites": ["F-1"], "answers": ["A-1"], "hypothesis": "H-1",
     "starting_level": "high", "downgrades": [], "calibration": "high",
     "would_change": "a release note after 4.2 changing the retry count"},
    {"id": "C-2", "statement": "Recovery of a parked job requires a person",
     "cites": ["F-3", "F-2"], "answers": ["A-2"], "hypothesis": "H-1",
     "starting_level": "high",
     "downgrades": [{"domain": "inconsistency",
                     "why": "one source contradicts the count and the contradiction is unresolved"}],
     "calibration": "moderate",
     "would_change": "any documented automatic drain path"}],
}
REPORT = """# Scheduler retry behaviour

## Hypotheses

Two explanations were carried into the evidence rather than one: H-1, that the scheduler retries a
bounded number of times and then parks the job, and H-2, that it retries indefinitely and parks
nothing. H-2 is refuted — the release notes state a bound directly, and nothing found is consistent
with unbounded retrying. H-1 is what survives, and it survives on two sources rather than on the
absence of an alternative.

## Conclusions

- C-1 (high) Failing jobs stop after three automatic attempts. The vendor release notes state the
  count directly and nothing contradicts it.
- C-2 (moderate) Recovery of a parked job requires a person. Downgraded once for inconsistency: F-3
  carries an open contradiction about a configurable override that nothing found settles either way,
  so this is not stated at the top level of certainty.

## Sources

- S-1 vendor release notes 4.2, reliability B, retrieved 2026-08-23T10:00:00Z
- S-2 internal ops runbook, reliability C, retrieved 2026-08-23T10:05:00Z
- S-3 forum thread, reliability F (cannot be judged), retrieved 2026-08-23T10:20:00Z, excluded from
  the findings and recorded only because it is the source of the open contradiction above.

## Setting

A single-tenant 4.2 deployment run by the platform team, with the vendor's release notes and our own
ops runbook as the only written sources; the scheduler's source code is not available to us. A reader
on a multi-tenant or self-built deployment should not carry these conclusions across without checking.

## Prior belief

Going in I expected an unbounded retry loop with exponential backoff and no parking. That was wrong:
the bound is documented and parking is explicit, so both conclusions moved off the prior rather than
confirming it.

## What this does not cover

The scheduler's own source was never read and is not available to us, so everything above is what the
written record says the scheduler does, which is a different claim from what it does. Vendor support
tickets were not searched either, for want of access. The prior belief going in was an unbounded retry
loop with backoff and no parking at all, so both conclusions moved off that prior rather than
confirming it. Saturation was reached against the written sources inside the stated scope and against
nothing else: a reader who has access to the code or the tickets should expect to find more than this,
and should treat C-2 in particular as bounded by that.
"""
PHASES = ["question", "survey", "evidence", "contest", "synthesis", "report"]


def _dir(tmp_path, mutate=None):
    d = tmp_path / "research"
    (d / "snapshots").mkdir(parents=True, exist_ok=True)
    snaps = {"S-1.txt": PAGE, "S-2.txt": DOC, "S-3.txt": BLOG}
    data = json.loads(json.dumps(GOOD))
    report = REPORT
    if mutate:
        r = mutate(data, snaps)
        if isinstance(r, str):
            report = r
    for name, body in snaps.items():
        (d / "snapshots" / name).write_text(body)
    # sha256 is stamped from the snapshot actually written, so a test that edits a page without
    # restamping reproduces the real attack rather than a bookkeeping error.
    for s in data["sources.json"]["sources"]:
        if s.get("sha256") is None:
            f = d / s["snapshot"] if s.get("snapshot") else None
            s["sha256"] = (hashlib.sha256(f.read_bytes()).hexdigest()
                           if f is not None and f.is_file() else "")
    for name, body in data.items():
        (d / name).write_text(json.dumps(body, indent=1))
    (d / "report.md").write_text(report)
    return d


def _report(d, phase):
    r = subprocess.run([sys.executable, str(CHECK), "--phase", phase, "--research-dir", str(d),
                        "--repo-root", str(d), "--json"], capture_output=True, text=True)
    assert r.stdout, r.stderr
    return {row["criterion"]: row["status"] for row in json.loads(r.stdout)}, r.returncode


def _failing(d):
    out = set()
    for p in PHASES:
        rep, _ = _report(d, p)
        out |= {c for c, s in rep.items() if s != "PASS"}
    return out


# --------------------------------------------------------------------------- it passes what is right

@pytest.mark.parametrize("phase", PHASES)
def test_a_good_research_directory_passes_every_phase(tmp_path, phase):
    rep, code = _report(_dir(tmp_path), phase)
    assert code == 0, rep


def test_a_missing_artifact_fails_closed(tmp_path):
    d = tmp_path / "empty"
    d.mkdir()
    for p in PHASES:
        rep, code = _report(d, p)
        assert code == 1 and all(s == "FAIL" for s in rep.values()), (p, rep)


# --------------------------------------------------------------------------- one mutation per criterion

def _q(k, v):
    return lambda data, _s: data["question.json"].__setitem__(k, v)


def _src(k, v, i=0):
    return lambda data, _s: data["sources.json"]["sources"][i].__setitem__(k, v)


MUTATIONS = {
  # question — ACH step 1, thick description, the bound scope
  "question_stated": _q("question", "scheduler stuff"),
  "answer_shape_declared": _q("answer_shape", [{"id": "first", "must": "names the retry count"}]),
  "out_of_scope_declared": _q("out_of_scope", []),
  # one hypothesis is not a set: the anchoring countermeasure is the plural
  "competing_hypotheses_enumerated":
    lambda d, _s: d["question.json"]["hypotheses"].pop(),

  # survey — PRISMA-S, Admiralty reliability, the stop rule
  "sources_registered": _src("id", "source-one"),
  "source_reliability_rated": _src("reliability", "very good"),
  "search_record_is_reproducible":
    lambda d, _s: d["sources.json"]["searched"][0].__setitem__("at", ""),
  "excluded_sources_recorded":
    lambda d, _s: d["sources.json"].__setitem__("excluded", []),
  "not_searched_declared":
    lambda d, _s: d["sources.json"].__setitem__("not_searched", []),
  "retrieved_sources_are_snapshotted": _src("snapshot", ""),
  # saturation claimed while the last source is still producing findings
  "saturation_is_declared":
    lambda d, _s: d["findings.json"][0]["evidence"].__setitem__("source", "S-3"),

  # evidence — atomicity, falsifiability, confirmability, Admiralty credibility, constant comparison
  "findings_registered":
    lambda d, _s: d["findings.json"][0].__setitem__("id", "finding-1"),
  "every_finding_has_a_falsifier":
    lambda d, _s: d["findings.json"][0].__setitem__("falsifier", d["findings.json"][0]["claim"]),
  "evidence_traces_to_a_source":
    lambda d, _s: d["findings.json"][0]["evidence"].__setitem__("source", "S-99"),
  "quotes_are_verbatim":
    lambda d, _s: d["findings.json"][0]["evidence"].__setitem__(
        "quote", "retries a failed job five times before parking it"),
  "command_evidence_replays":
    lambda d, _s: d["findings.json"][2]["evidence"].__setitem__("output", "7"),
  # Admiralty 1 means confirmed by another independent source; it has to name one
  "credibility_is_earned":
    lambda d, _s: d["findings.json"][1].__setitem__("corroborated_by", []),
  "every_finding_is_compared_to_the_corpus":
    lambda d, _s: d["findings.json"][1].pop("relates_to"),
  # a memo written after the last finding is a write-up, not a record of thinking during
  "memos_were_written_during_the_work":
    lambda d, _s: d["memos.json"][0].__setitem__("at", "2026-08-23T23:00:00Z"),

  # contest — the ACH matrix
  "every_finding_contested": lambda d, _s: d["contest.json"].pop(0),
  "contest_records_what_was_searched":
    lambda d, _s: d["contest.json"][0].__setitem__("searched_against", []),
  "every_finding_scored_against_every_hypothesis":
    lambda d, _s: d["contest.json"][0]["scores"].pop("H-2"),
  # a row consistent with every hypothesis discriminates nothing, and must say so
  "non_diagnostic_findings_are_marked":
    lambda d, _s: d["contest.json"][1].__setitem__("diagnostic", True),
  "hypotheses_are_refuted_or_survival_is_declared":
    lambda d, _s: [e["scores"].__setitem__("H-2", "neutral") for e in d["contest.json"]],
  "contradictions_are_resolved_or_declared_open":
    lambda d, _s: d["contest.json"][0].__setitem__("resolution", "fine"),

  # synthesis — GRADE
  "conclusions_cite_findings":
    lambda d, _s: d["conclusions.json"][0].__setitem__("cites", ["F-42"]),
  # the arithmetic: a starting level minus its downgrades
  "calibration_is_derived":
    lambda d, _s: d["conclusions.json"][1].__setitem__("calibration", "high"),
  "downgrades_name_a_grade_domain":
    lambda d, _s: d["conclusions.json"][1]["downgrades"][0].__setitem__("domain", "gut-feel"),
  # `high` over an open contradiction
  "calibration_matches_the_evidence":
    lambda d, _s: (d["conclusions.json"][1].__setitem__("downgrades", []),
                   d["conclusions.json"][1].__setitem__("calibration", "high")),
  "every_conclusion_says_what_would_change_it":
    lambda d, _s: d["conclusions.json"][0].__setitem__("would_change", ""),
  "conclusions_answer_the_question":
    lambda d, _s: d["conclusions.json"][1].__setitem__("answers", []),

  # report — what has to reach the reader
  "report_written": lambda d, _s: "# short\n\n## Hypotheses\n\n## Conclusions\n- C-1\n\n## Sources\n- S-1\n",
  "report_carries_every_conclusion": lambda d, _s: re.sub(r"\bC-2\b", "the second one", REPORT),
  "report_labels_every_conclusion_with_its_calibration":
    lambda d, _s: REPORT.replace("C-1 (high)", "C-1"),
  "report_declares_source_age": lambda d, _s: REPORT.replace("2026-08-23", "some time ago"),
  "report_carries_every_open_contradiction":
    lambda d, _s: REPORT.replace("F-3", "one finding"),
  "report_states_the_rejected_hypotheses":
    lambda d, _s: re.sub(r"\bH-2\b", "the other one", REPORT),
  # recorded in the register, never shown to the reader — which is the whole failure
  "report_states_the_setting":
    lambda d, _s: REPORT.replace("A single-tenant 4.2 deployment run by the platform team, with the "
                                 "vendor's release notes and our own\nops runbook", "Some deployment"),
  "report_confronts_the_prior_belief":
    lambda d, _s: re.sub(r"## Prior belief.*?confirming it\.\n", "", REPORT, flags=re.S),
}


@pytest.mark.parametrize("criterion,mutate", sorted(MUTATIONS.items()), ids=sorted(MUTATIONS))
def test_each_criterion_catches_its_own_mutation(tmp_path, criterion, mutate):
    assert criterion in _failing(_dir(tmp_path, mutate)), \
        f"{criterion} did not notice its own mutation"


def test_every_criterion_has_a_mutation_behind_it(tmp_path):
    """A criterion with no mutation is a criterion nobody has shown to work."""
    declared = set()
    for p in PHASES:
        rep, _ = _report(_dir(tmp_path), p)
        declared |= set(rep)
    assert declared == set(MUTATIONS), \
        f"unmutated: {sorted(declared - set(MUTATIONS))} · stale: {sorted(set(MUTATIONS) - declared)}"


# --------------------------------------------------------------------------- the ones that carry weight

def test_atomicity_is_not_claimed_as_a_mechanical_criterion(tmp_path):
    """A deliberate NON-control, pinned so nobody adds it back without reading why.

    spec-check can test a requirement's atomicity because a requirement carries a modal. A free-form
    claim has no marker: "retried three times AND the console shows a banner" is two claims, and the
    same sentence with a comma is the same two claims. A check that fires on one and not the other
    measures punctuation. The predicate lives in the evidence cold review instead."""
    d = _dir(tmp_path, lambda data, _s: data["findings.json"][0].__setitem__(
        "claim", "A failing job is retried three times and the console shows a banner"))
    rep, code = _report(d, "evidence")
    assert code == 0, rep
    assert "findings_are_atomic" not in rep


def test_a_fabricated_quote_is_caught(tmp_path):
    """The failure mode that actually happens with source-based research: a quote that reads exactly
    like the source and says something the source never said."""
    d = _dir(tmp_path, lambda data, _s: data["findings.json"][0]["evidence"].__setitem__(
        "quote", "retries a failed job until it succeeds"))
    rep, code = _report(d, "evidence")
    assert code == 1 and rep["quotes_are_verbatim"] == "FAIL"


def test_a_quote_survives_reflowed_whitespace(tmp_path):
    """And it must not fire on an honest quote. A span copied out of a rendered page keeps its words
    and loses its line breaks; byte equality would fail it and teach the author to stop quoting."""
    d = _dir(tmp_path, lambda data, _s: data["findings.json"][0]["evidence"].__setitem__(
        "quote", "retries a failed job\n   three times   before parking it"))
    _, code = _report(d, "evidence")
    assert code == 0


def test_a_snapshot_edited_after_registration_is_caught(tmp_path):
    """Freezing the page is worth nothing if the frozen copy can be edited to agree with the report
    afterwards. The sha256 in the register is what closes it."""
    d = _dir(tmp_path)
    (d / "snapshots" / "S-1.txt").write_text(PAGE.replace("three times", "five times"))
    rep, code = _report(d, "survey")
    assert code == 1 and rep["retrieved_sources_are_snapshotted"] == "FAIL"


def test_non_diagnostic_evidence_cannot_carry_a_conclusion_alone(tmp_path):
    """ACH's sharpest idea, as a control. F-2 is consistent with BOTH hypotheses, so it discriminates
    nothing however true it is — a conclusion resting only on it has no support that bears on the
    question."""
    d = _dir(tmp_path, lambda data, _s: data["conclusions.json"][1].__setitem__("cites", ["F-2"]))
    rep, code = _report(d, "synthesis")
    assert code == 1 and rep["calibration_matches_the_evidence"] == "FAIL"


def test_an_unjudgeable_source_cannot_carry_the_top_certainty(tmp_path):
    """Admiralty F is 'reliability cannot be judged'. It is not a fatal grade — a source may still be
    worth recording — but it cannot be what makes something certain."""
    def m(data, _s):
        data["findings.json"][0]["evidence"]["source"] = "S-3"
        data["findings.json"][0]["evidence"]["quote"] = "gives up immediately"
        data["sources.json"]["saturation"]["dry_tail"] = 0
    d = _dir(tmp_path, m)
    rep, code = _report(d, "synthesis")
    assert code == 1 and rep["calibration_matches_the_evidence"] == "FAIL"


def test_declaring_saturation_unreached_is_an_honest_pass(tmp_path):
    """An honest limit beats a manufactured one: the stop rule must be STATED, not satisfied."""
    d = _dir(tmp_path, lambda data, _s: data["sources.json"].__setitem__(
        "saturation", {"reached": False,
                       "why": "the vendor's own issue tracker is behind a login we do not have, so "
                              "the search is bounded by access rather than by yield"}))
    rep, code = _report(d, "survey")
    assert code == 0, rep


def test_criterion_shim_exits_zero_only_for_a_passing_criterion(tmp_path):
    d = _dir(tmp_path)
    ok = subprocess.run([sys.executable, str(CRIT), str(CHECK), "evidence", "quotes_are_verbatim",
                         "--research-dir", str(d), "--repo-root", str(d)],
                        capture_output=True, text=True)
    assert ok.returncode == 0, ok.stderr

    bad = _dir(tmp_path / "b", lambda data, _s: data["findings.json"][0]["evidence"].__setitem__(
        "quote", "something the page never said"))
    r = subprocess.run([sys.executable, str(CRIT), str(CHECK), "evidence", "quotes_are_verbatim",
                        "--research-dir", str(bad), "--repo-root", str(bad)],
                       capture_output=True, text=True)
    assert r.returncode == 1
