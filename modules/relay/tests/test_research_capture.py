"""tools/research/research-capture — freezing a source at the moment it is read.

The protocol requires every retrieved source to be snapshotted, hashed and dated. Four manual steps
is three too many: a control that is tedious to satisfy honestly is one people learn to satisfy
dishonestly, and the dishonest version of "I froze the page" is a register entry with no file behind
it. So the capture is one call, and what it writes is exactly what `research-check` grades.

The pair of tests that matter are the round trip — capture then verify — and the failure path: a
source that could not be retrieved must produce no register entry at all. A half-registered source is
worse than none, because the register is what the rest of the protocol trusts.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAPTURE = ROOT / "tools" / "research" / "research-capture"
CHECK = ROOT / "tools" / "research" / "research-check"


def _cap(*args):
    return subprocess.run([sys.executable, str(CAPTURE), *[str(a) for a in args]],
                          capture_output=True, text=True)


def test_a_file_is_frozen_hashed_and_dated(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "runbook.md").write_text("A parked job is drained by hand.\n")
    into = tmp_path / "research"

    r = _cap("--file", "runbook.md", "--into", into, "--repo-root", repo, "--json")
    assert r.returncode == 0, r.stderr
    entry = json.loads(r.stdout)

    assert entry["id"] == "S-1" and entry["kind"] == "file" and entry["ref"] == "runbook.md"
    snap = into / entry["snapshot"]
    assert snap.read_text() == "A parked job is drained by hand.\n"
    assert entry["sha256"] == hashlib.sha256(snap.read_bytes()).hexdigest()
    assert entry["retrieved_at"].endswith("Z")

    doc = json.loads((into / "sources.json").read_text())
    assert [s["id"] for s in doc["sources"]] == ["S-1"]
    # The register keeps the shape research-check reads, including the two lists a first capture has
    # nothing to put in yet — an absent key and an empty list are the same fact, said differently.
    assert doc["searched"] == [] and doc["not_searched"] == []


def test_ids_do_not_collide_across_captures(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "a.txt").write_text("one\n")
    (repo / "b.txt").write_text("two\n")
    into = tmp_path / "research"
    _cap("--file", "a.txt", "--into", into, "--repo-root", repo)
    _cap("--file", "b.txt", "--into", into, "--repo-root", repo)
    doc = json.loads((into / "sources.json").read_text())
    assert [s["id"] for s in doc["sources"]] == ["S-1", "S-2"]
    assert len({s["snapshot"] for s in doc["sources"]}) == 2

    clash = _cap("--file", "a.txt", "--into", into, "--repo-root", repo, "--id", "S-1")
    assert clash.returncode == 2 and "already registered" in clash.stderr


def test_a_command_source_records_its_output_and_needs_no_snapshot(tmp_path):
    """A command freezes itself: `replay-evidence` re-runs it and compares. Demanding a snapshot too
    would be ceremony, and `retrieved_sources_are_snapshotted` exempts it for the same reason."""
    into = tmp_path / "research"
    r = _cap("--cmd", "echo three", "--into", into, "--repo-root", tmp_path, "--json")
    assert r.returncode == 0, r.stderr
    entry = json.loads(r.stdout)
    assert entry["kind"] == "command" and entry["output"] == "three" and entry["exit"] == 0
    assert "snapshot" not in entry


def test_a_source_that_could_not_be_retrieved_is_not_registered(tmp_path):
    """The failure that must not be half-done. A register entry with no file behind it would pass
    `sources_registered` and then fail `quotes_are_verbatim` two states later, blaming the wrong
    thing — port 9 is the discard port, so this is a refusal, not a timeout."""
    into = tmp_path / "research"
    r = _cap("--url", "http://127.0.0.1:9/nope", "--into", into)
    assert r.returncode == 1 and "could not retrieve" in r.stderr
    doc = json.loads((into / "sources.json").read_text()) if (into / "sources.json").exists() \
        else {"sources": []}
    assert doc["sources"] == []

    missing = _cap("--file", "nope.md", "--into", into, "--repo-root", tmp_path)
    assert missing.returncode == 1 and "could not read" in missing.stderr


def test_what_capture_writes_is_what_the_checker_reads(tmp_path):
    """The round trip, end to end: capture a source, quote it, and let `research-check` grade the
    quote against the frozen copy. If the two tools disagree about the register's shape, this is
    where it shows — and it is the only place a test can show it before a live run does."""
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "notes.md").write_text("The scheduler retries a failed job three times.\n")
    into = tmp_path / "research"
    entry = json.loads(_cap("--file", "notes.md", "--into", into, "--repo-root", repo,
                            "--json").stdout)

    (into / "findings.json").write_text(json.dumps([
        {"id": "F-1", "claim": "A failing job is retried three times",
         "evidence": {"kind": "file", "source": entry["id"],
                      "quote": "retries a failed job three times"},
         "falsifier": "a run showing a fourth automatic attempt"}]))

    r = subprocess.run([sys.executable, str(CHECK), "--phase", "evidence",
                        "--research-dir", str(into), "--repo-root", str(repo), "--json"],
                       capture_output=True, text=True)
    rep = {row["criterion"]: row["status"] for row in json.loads(r.stdout)}
    assert rep["quotes_are_verbatim"] == "PASS", rep
    assert rep["evidence_traces_to_a_source"] == "PASS", rep

    # And the same round trip with the quote altered must fail — otherwise the pass above proves only
    # that the checker ran.
    (into / "findings.json").write_text(json.dumps([
        {"id": "F-1", "claim": "A failing job is retried five times",
         "evidence": {"kind": "file", "source": entry["id"],
                      "quote": "retries a failed job five times"},
         "falsifier": "a run showing a sixth automatic attempt"}]))
    r = subprocess.run([sys.executable, str(CHECK), "--phase", "evidence",
                        "--research-dir", str(into), "--repo-root", str(repo), "--json"],
                       capture_output=True, text=True)
    rep = {row["criterion"]: row["status"] for row in json.loads(r.stdout)}
    assert rep["quotes_are_verbatim"] == "FAIL", rep
