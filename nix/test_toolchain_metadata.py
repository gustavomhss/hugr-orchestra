#!/usr/bin/env python3
"""Teeth against captured real run JSON and artifacts, never a mirrored matrix."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from toolchain_metadata import read_json, systems_from

source = Path(sys.argv[1]).resolve()
validator = Path(__file__).with_name("toolchain_metadata.py").resolve()
systems = systems_from(source / "systems.json")
baseline = subprocess.run([sys.executable, str(validator), "complete", str(source)], text=True, capture_output=True)
if baseline.returncode:
    raise SystemExit("TOOLCHAIN_TEETH_BASELINE_FAILED:" + baseline.stderr)
linux = next(system for system in systems if system.endswith("-linux"))
darwin = next(system for system in systems if system == "aarch64-darwin")
context = read_json(source / "identity.json")
prefix = "nix-toolchain-" + context["runID"] + "-" + context["runAttempt"] + "-"
evidence = "artifacts/" + prefix + linux + "/evidence.json"


def edit(root, path, transform):
    file = root / path
    file.write_text(json.dumps(transform(read_json(file))))


def jobs(root, transform):
    edit(root, "jobs.json", lambda pages: [{"jobs": transform([job for page in pages for job in page["jobs"]])}])


def artifacts(root, transform):
    edit(root, "artifacts.json", lambda pages: [{"artifacts": transform([item for page in pages for item in page["artifacts"]])}])


def job_state(root, state):
    jobs(root, lambda rows: [{**job, "conclusion": state} if job["name"] == "native (" + linux + ")" else job for job in rows])


cases = [
    ("missing-darwin-arm-job", "MISSING_OR_UNEXPECTED_NATIVE_JOB", lambda root: jobs(root, lambda rows: [job for job in rows if job["name"] != "native (" + darwin + ")"])),
    ("duplicate-linux-job", "DUPLICATE_NATIVE_JOB", lambda root: jobs(root, lambda rows: rows + [next(job for job in rows if job["name"] == "native (" + linux + ")")])),
    ("skipped-job", "NATIVE_JOB_SKIPPED", lambda root: job_state(root, "skipped")),
    ("failed-job", "NATIVE_JOB_FAILED_OR_INCOMPLETE", lambda root: job_state(root, "failure")),
    ("missing-artifact", "MISSING_OR_UNEXPECTED_EVIDENCE_ARTIFACT", lambda root: artifacts(root, lambda rows: [item for item in rows if item["name"] != prefix + darwin])),
    ("duplicate-artifact", "DUPLICATE_EVIDENCE_ARTIFACT", lambda root: artifacts(root, lambda rows: rows + [next(item for item in rows if item["name"] == prefix + linux)])),
    ("wrong-source-sha", "EVIDENCE_SOURCE_SHA_MISMATCH", lambda root: edit(root, evidence, lambda value: {**value, "sourceHEAD": "0" * 40})),
    ("old-run-artifact", "ARTIFACT_RUN_IDENTITY_MISMATCH", lambda root: artifacts(root, lambda rows: [{**item, "workflow_run": {**item["workflow_run"], "id": 0}} for item in rows])),
    ("missing-file", "JSON_INPUT_MISSING", lambda root: (root / evidence).unlink()),
    ("malformed-json", "JSON_INPUT_INVALID", lambda root: (root / "systems.json").write_text("{")),
    ("empty-systems", "EMPTY_OR_INVALID_FLAKE_SYSTEMS", lambda root: (root / "systems.json").write_text("[]")),
    ("duplicate-systems", "DUPLICATE_FLAKE_SYSTEM", lambda root: edit(root, "systems.json", lambda values: values + [values[0]])),
    ("unknown-system", "UNSUPPORTED_RUNNER_SYSTEM", lambda root: edit(root, "systems.json", lambda values: values + ["unsupported-system"])),
    ("empty-jobs", "PREPARE_JOB_FAILED_OR_MISSING", lambda root: jobs(root, lambda rows: [])),
    ("malformed-job-shape", "JSON_INPUT_INVALID", lambda root: (root / "jobs.json").write_text('[{"jobs": {}}]')),
    ("incomplete-logs", "EVIDENCE_FILE_MISSING", lambda root: (root / "artifacts" / (prefix + linux) / "bun-restored.exit").unlink()),
    ("wrong-source-url", "SOURCE_MISMATCH", lambda root: edit(root, "manifest.json", lambda value: {**value, "bun": {**value["bun"], "sources": {**value["bun"]["sources"], linux: {**value["bun"]["sources"][linux], "url": "https://invalid.example"}}}})),
    ("worker-claim-only", "WORKER_CLAIM_LOG_MISMATCH", lambda root: edit(root, evidence, lambda value: {**value, "tools": {}})),
]
for name, label, mutate in cases:
    with tempfile.TemporaryDirectory(prefix="toolchain-teeth-") as temp:
        root = Path(temp) / "captured"
        shutil.copytree(source, root)
        mutate(root)
        result = subprocess.run([sys.executable, str(validator), "complete", str(root)], text=True, capture_output=True)
        if result.returncode == 0 or "TOOLCHAIN_GATE_FAILURE:" + label not in result.stderr:
            raise SystemExit("TOOLCHAIN_TEETH_FAILED:" + name + ":" + result.stdout + result.stderr)
        print("TOOLCHAIN_TEETH_RED:" + name + ":" + label)
print("TOOLCHAIN_TEETH_OK:" + str(len(cases)))
