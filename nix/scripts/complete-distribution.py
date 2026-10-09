#!/usr/bin/env python3
"""Independent collection check; measurement mode never claims distribution proof."""
import json
import os
from pathlib import Path
import sys
from dependency_measurement import measured_candidate, require


def read(path):
    require(path.is_file(), "MISSING_EVIDENCE:" + str(path))
    return path.read_text()


def check(directory, phase):
    require(phase in ("measure", "verify"), "UNKNOWN_PHASE")
    sources = json.loads(Path("nix/toolchain-sources.json").read_text())["bun"]["sources"]
    require(isinstance(sources, dict) and bool(sources), "EMPTY_SOURCE_SYSTEM_LIST")
    run = json.loads(read(directory / "run.json"))
    require(run["head_sha"] == os.environ["GITHUB_SHA"]
            and str(run["id"]) == os.environ["GITHUB_RUN_ID"]
            and str(run["run_attempt"]) == os.environ["GITHUB_RUN_ATTEMPT"]
            and run["event"] == "workflow_dispatch", "RUN_IDENTITY_MISMATCH")
    jobs = [job for page in json.loads(read(directory / "jobs.json")) for job in page["jobs"]]
    artifacts = [item for page in json.loads(read(directory / "artifacts.json")) for item in page["artifacts"]]
    records = []
    for system in sources:
        matching = [job for job in jobs if job["name"] == f"native distribution ({system})"]
        require(len(matching) == 1 and matching[0]["status"] == "completed"
                and matching[0]["conclusion"] == "success", "MISSING_OR_FAILED_NATIVE_JOB:" + system)
        name = f"nix-distribution-{phase}-{run['id']}-{run['run_attempt']}-{system}"
        matching = [item for item in artifacts if item["name"] == name]
        require(len(matching) == 1 and not matching[0]["expired"], "MISSING_OR_DUPLICATE_NATIVE_ARTIFACT:" + system)
        worker = directory / "workers" / name
        require(read(worker / "source-revision.txt").strip() == run["head_sha"], "WORKER_SOURCE_MISMATCH:" + system)
        require(read(worker / "native-system.stdout").strip() == system, "WORKER_NATIVE_SYSTEM_MISMATCH:" + system)
        require(read(worker / "batch.exit").strip() == "0"
                and not read(worker / "final-status.txt").strip(), "WORKER_FAILED_OR_DIRTY:" + system)
        phases = ["nix-version", "native-system", "dependency-inputs", "all-consumers", "default-dependency"]
        if phase == "measure":
            phases += ["hash-drv", "hash-capture"]
            require(read(worker / "hash-build.exit").strip() != "0", "UPDATER_UNEXPECTED_SUCCESS:" + system)
            candidate = json.loads(read(worker / "candidate.json"))
            require(candidate["system"] == system and candidate["sourceRevision"] == run["head_sha"]
                    and candidate["status"] == "MEASURED_CANDIDATE_NOT_APPLIED", "CANDIDATE_IDENTITY:" + system)
            require(candidate == measured_candidate(worker, system, run["head_sha"]), "CANDIDATE_LOG_MISMATCH:" + system)
        if phase == "verify":
            phases += ["matching-measurement", "hash-capture-negative-controls", "applied-hash", "toolchain", "consumers", "outputs",
                       "native-outputs", "output-negative-controls", "references-cli", "references-desktop", "closure"]
            if system.endswith("-darwin"):
                phases.append("app-identity")
            output = json.loads(read(worker / "native-outputs.stdout"))
            require(output["system"] == system and output["status"] == "NATIVE_OUTPUT_CHECK_OK"
                    and bool(output["addons"]) and len(output["artifacts"]) == 2, "NATIVE_OUTPUT_CAPTURE:" + system)
            probes = json.loads(read(worker / "output-negative-controls.stdout"))
            require(probes["status"] == "OUTPUT_NEGATIVE_CONTROLS_OK" and bool(probes["completed"]), "EMPTY_OUTPUT_CONTROLS:" + system)
            require(len(set(probes["completed"])) == len(probes["completed"]), "DUPLICATE_OUTPUT_CONTROLS:" + system)
            for name in probes["completed"]:
                probe = json.loads(read(worker / "probes" / f"{name}.json"))
                expected = probe.get("expected")
                require((probe["status"] == 0 if expected is None else
                         probe["status"] != 0 and expected in probe["stderr"]), "OUTPUT_CONTROL_VERDICT:" + name)
        for label in phases:
            require(read(worker / (label + ".exit")).strip() == "0", "FAILED_CAPTURE:" + system + ":" + label)
        records.append(system)
    return {"sourceRevision": run["head_sha"], "runID": run["id"], "runAttempt": run["run_attempt"],
            "systems": records, "status": "MEASUREMENT_ONLY_NOT_DISTRIBUTION" if phase == "measure" else
            "NATIVE_DISTRIBUTION_CAPTURE_COMPLETE_PRODUCT_QUALIFICATION_PENDING"}


if __name__ == "__main__":
    require(len(sys.argv) == 3, "COMPLETION_ARGUMENTS")
    print(json.dumps(check(Path(sys.argv[1]), sys.argv[2]), indent=2))
