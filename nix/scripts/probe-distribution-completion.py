#!/usr/bin/env python3
"""Prepared teeth for exact collection and completed-measurement API provenance."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from types import MappingProxyType
from dependency_measurement import require

CONTROL_LEDGER_JSON = """CONTROL_LEDGER_BEGIN
{
  "common": {
    "unchanged-real-capture": null,
    "no-op-api-title": null,
    "empty-jobs": "NATIVE_JOB_SET",
    "extra-job": "NATIVE_JOB_SET",
    "duplicate-native-job": "NATIVE_JOB_SET",
    "unknown-system-job": "NATIVE_JOB_SET",
    "skipped-native-job": "NATIVE_JOB_FAILED",
    "job-wrong-attempt": "JOB_API_IDENTITY",
    "empty-artifacts": "NATIVE_ARTIFACT_SET",
    "extra-artifact": "EXTRA_NATIVE_ARTIFACT",
    "duplicate-artifact": "DUPLICATE_ARTIFACT",
    "unknown-system-artifact": "EXTRA_NATIVE_ARTIFACT",
    "artifact-wrong-head": "ARTIFACT_API_IDENTITY",
    "wrong-run-head": "API_COMMIT_IDENTITY",
    "wrong-workflow": "API_WORKFLOW_IDENTITY",
    "wrong-run-attempt": "API_RUN_IDENTITY"
  },
  "measure": {
    "wrong-worker-head": "WORKER_SOURCE_MISMATCH",
    "wrong-worker-tree": "WORKER_TREE_MISMATCH",
    "wrong-native-system": "WORKER_NATIVE_SYSTEM_MISMATCH",
    "failed-worker": "WORKER_FAILED_OR_DIRTY",
    "candidate-relabelled": "CANDIDATE_IDENTITY",
    "capture-dependency-mismatch": "CANDIDATE_CAPTURE_IDENTITY"
  },
  "verify": {
    "wrong-worker-head": "WORKER_SOURCE_MISMATCH",
    "wrong-worker-tree": "WORKER_TREE_MISMATCH",
    "wrong-native-system": "WORKER_NATIVE_SYSTEM_MISMATCH",
    "failed-worker": "WORKER_FAILED_OR_DIRTY",
    "positive-only-output-controls": "OUTPUT_CONTROL_SET",
    "unknown-output-control": "OUTPUT_CONTROL_SET",
    "duplicate-output-control": "OUTPUT_CONTROL_SET",
    "negative-setup-failure": "OUTPUT_CONTROL_VERDICT",
    "missing-pty-capture": "NATIVE_OUTPUT_CAPTURE"
  },
  "provenance": {
    "cancelled-measurement-run": "MEASUREMENT_RUN_NOT_SUCCESSFUL",
    "failed-measurement-run": "MEASUREMENT_RUN_NOT_SUCCESSFUL",
    "failed-independent-completion": "NATIVE_JOB_FAILED",
    "forged-completion-receipt": "MEASUREMENT_COMPLETION_RECEIPT",
    "positive-only-completion-controls": "MEASUREMENT_COMPLETION_CONTROLS",
    "candidate-relabelled": "MEASUREMENT_WORKER_RECEIPT",
    "wrong-worker-head": "MEASUREMENT_WORKER_API_BINDING",
    "wrong-worker-tree": "MEASUREMENT_WORKER_API_BINDING",
    "wrong-native-system": "MEASUREMENT_WORKER_API_BINDING",
    "current-dependency-mismatch": "MEASUREMENT_DEPENDENCY_IDENTITY",
    "non-hash-checkpoint": "NON_HASH_CHECKPOINT_CHANGE"
  }
}
CONTROL_LEDGER_END"""


def private_directory(original, destination, changed):
    destination.unlink()
    destination.mkdir()
    for child in original.iterdir():
        if child.name != changed:
            (destination / child.name).symlink_to(child.resolve(), target_is_directory=child.is_dir())


def main():
    require(len(sys.argv) == 4, "COMPLETION_PROBE_ARGUMENTS")
    original, directory, phase = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    require(phase in ("measure", "verify", "provenance"), "UNKNOWN_PROBE_PHASE")
    spec = importlib.util.spec_from_file_location("distribution_gate", "nix/scripts/complete-distribution.py")
    require(spec is not None and spec.loader is not None, "PROBE_GATE_MODULE_MISSING")
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    cases = MappingProxyType(gate.ledger(Path(__file__), phase))
    run = gate.document(original / "run.json")
    worker_phase = "measure" if phase == "provenance" else phase
    names = [f"nix-distribution-{worker_phase}-{run['id']}-{run['run_attempt']}-{system}" for system in gate.systems()]
    native_names = {f"native distribution ({system})" for system in gate.systems()}
    directory.mkdir()
    completed = []
    for name, expected in cases.items():
        fixture = directory / name
        fixture.mkdir()
        for file in ("run.json", "workflow.json", "repository.json", "commit.json", "jobs.json", "artifacts.json",
                     "latest-run.json", "compare.json", "dependency-inputs.json"):
            if (original / file).is_file():
                (fixture / file).write_bytes((original / file).read_bytes())
        workers = fixture / "workers"
        workers.mkdir()
        for worker in names:
            (workers / worker).symlink_to((original / "workers" / worker).resolve(), target_is_directory=True)
        if phase == "provenance":
            (fixture / "completion").symlink_to((original / "completion").resolve(), target_is_directory=True)
        if name in ("wrong-run-head", "wrong-run-attempt", "no-op-api-title", "cancelled-measurement-run", "failed-measurement-run"):
            value = gate.document(fixture / "run.json")
            if name == "wrong-run-head": value["head_sha"] = "wrong-source"
            if name == "wrong-run-attempt": value["run_attempt"] += 1
            if name == "no-op-api-title": value["display_title"] = "irrelevant-title"
            if name == "cancelled-measurement-run": value["conclusion"] = "cancelled"
            if name == "failed-measurement-run": value["conclusion"] = "failure"
            (fixture / "run.json").write_text(json.dumps(value))
        if name == "wrong-workflow":
            value = gate.document(fixture / "workflow.json")
            value["path"] = ".github/workflows/wrong-workflow.yml"
            (fixture / "workflow.json").write_text(json.dumps(value))
        if name in ("empty-jobs", "extra-job", "duplicate-native-job", "unknown-system-job", "skipped-native-job", "job-wrong-attempt", "failed-independent-completion"):
            value = gate.document(fixture / "jobs.json")
            native = next(job for page in value for job in page["jobs"] if job["name"] in native_names)
            if name == "empty-jobs": value = [{"jobs": []}]
            if name in ("extra-job", "duplicate-native-job"):
                added = copy.deepcopy(native)
                if name == "extra-job": added["name"] = "unexpected-job"
                value[0]["jobs"].append(added)
            if name == "unknown-system-job": native["name"] = "native distribution (unknown-system)"
            if name == "skipped-native-job": native["conclusion"] = "skipped"
            if name == "job-wrong-attempt": native["run_attempt"] += 1
            if name == "failed-independent-completion":
                next(job for page in value for job in page["jobs"] if job["name"] == "completion")["conclusion"] = "failure"
            (fixture / "jobs.json").write_text(json.dumps(value))
        if name in ("empty-artifacts", "extra-artifact", "duplicate-artifact", "unknown-system-artifact", "artifact-wrong-head"):
            value = gate.document(fixture / "artifacts.json")
            native = next(item for page in value for item in page["artifacts"] if item["name"] in names)
            if name == "empty-artifacts": value = [{"artifacts": []}]
            if name in ("extra-artifact", "duplicate-artifact"):
                added = copy.deepcopy(native)
                if name == "extra-artifact":
                    added["id"] = max(item["id"] for page in value for item in page["artifacts"]) + 1
                    added["name"] = "unexpected-artifact"
                value[0]["artifacts"].append(added)
            if name == "unknown-system-artifact": native["name"] = f"nix-distribution-{worker_phase}-{run['id']}-{run['run_attempt']}-unknown-system"
            if name == "artifact-wrong-head": native["workflow_run"]["head_sha"] = "wrong-source"
            (fixture / "artifacts.json").write_text(json.dumps(value))
        edits = {"wrong-worker-head": ("source-revision.txt", "wrong-source"),
                 "wrong-worker-tree": ("source-tree.txt", "wrong-tree"),
                 "wrong-native-system": ("native-system.stdout", "wrong-system"), "failed-worker": ("batch.exit", "1")}
        if name in edits:
            file, content = edits[name]
            private_directory(original / "workers" / names[0], workers / names[0], file)
            (workers / names[0] / file).write_text(content)
        if name in ("candidate-relabelled", "capture-dependency-mismatch", "positive-only-output-controls", "unknown-output-control", "duplicate-output-control", "missing-pty-capture", "negative-setup-failure"):
            file = "candidate.json" if name == "candidate-relabelled" else "dependency-inputs.json" if name == "capture-dependency-mismatch" else "native-outputs.stdout" if name == "missing-pty-capture" else "probes" if name == "negative-setup-failure" else "output-negative-controls.stdout"
            private_directory(original / "workers" / names[0], workers / names[0], file)
            if name == "negative-setup-failure":
                output_cases = gate.ledger(Path("nix/scripts/probe-distribution.ts"))
                selected = next(key for key, code in output_cases.items() if code is not None)
                target = workers / names[0] / "probes"
                target.mkdir()
                for child in (original / "workers" / names[0] / "probes").iterdir():
                    if child.name != selected + ".json":
                        (target / child.name).symlink_to(child.resolve(), target_is_directory=child.is_dir())
                value = gate.document(original / "workers" / names[0] / "probes" / (selected + ".json"))
                value["verdict"]["failureCode"] = "SETUP_OR_UNEXPECTED_FAILURE"
                value["stdout"] = json.dumps(value["verdict"])
                (target / (selected + ".json")).write_text(json.dumps(value))
            else:
                value = gate.document(original / "workers" / names[0] / file)
                if name == "candidate-relabelled": value["sourceRevision"] = "relabelled-source"
                if name == "capture-dependency-mismatch": value.clear()
                if name == "missing-pty-capture": value["pty"]["bindings"] = []
                if name == "positive-only-output-controls":
                    output_cases = gate.ledger(Path("nix/scripts/probe-distribution.ts"))
                    value["completed"] = [key for key, code in output_cases.items() if code is None]
                if name == "unknown-output-control": value["completed"][-1] = "unknown-control"
                if name == "duplicate-output-control": value["completed"][-1] = value["completed"][0]
                (workers / names[0] / file).write_text(json.dumps(value))
        if name in ("forged-completion-receipt", "positive-only-completion-controls"):
            file = "result.json" if name == "forged-completion-receipt" else "teeth.json"
            private_directory(original / "completion", fixture / "completion", file)
            value = gate.document(original / "completion" / file)
            if name == "forged-completion-receipt": value["sourceRevision"] = "relabelled-source"
            if name == "positive-only-completion-controls":
                measurement_cases = gate.ledger(Path(__file__), "measure")
                value["completed"] = [key for key, code in measurement_cases.items() if code is None]
            (fixture / "completion" / file).write_text(json.dumps(value))
        if name == "current-dependency-mismatch": (fixture / "dependency-inputs.json").write_text("{}")
        if name == "non-hash-checkpoint":
            value = gate.document(fixture / "compare.json")
            value["files"].append({"filename": "packages/core/src/unapproved.ts", "status": "modified"})
            (fixture / "compare.json").write_text(json.dumps(value))
        command = [sys.executable, "nix/scripts/complete-distribution.py", str(fixture), phase]
        if phase == "provenance":
            command = [sys.executable, "nix/scripts/complete-distribution.py", "provenance", str(fixture),
                       str(run["id"]), str(run["run_attempt"]), next(iter(gate.systems()))]
        result = subprocess.run(command, text=True, capture_output=True)
        require((result.returncode == 0 if expected is None else result.returncode == 1 and
                 result.stderr.strip().split(":")[:2] == ["NIX_DISTRIBUTION_FAILURE", expected]), "COMPLETION_PROBE_VERDICT:" + name)
        (fixture / "probe-result.json").write_text(json.dumps({"status": result.returncode, "expected": expected,
                                                             "stdout": result.stdout, "stderr": result.stderr}, indent=2) + "\n")
        completed.append(name)
    require(len(completed) == len(cases) and set(completed) == set(cases), "INCOMPLETE_COMPLETION_CONTROLS")
    print(json.dumps({"status": "COMPLETION_CONTROLS_OK", "completed": completed}, indent=2))


if __name__ == "__main__":
    main()
