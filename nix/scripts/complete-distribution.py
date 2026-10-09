#!/usr/bin/env python3
"""Gate strengthening: API-bound attempts, exact native sets and immutable controls."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from dependency_measurement import measured_candidate, require

WORKFLOW_PATH = ".github/workflows/nix-distribution.yml"
BATCH_BRANCH = "nix-validation"


def read(path):
    require(path.is_file(), "MISSING_EVIDENCE:" + str(path))
    return path.read_text()


def document(path):
    return json.loads(read(path))


def ledger(path, phase=None):
    source = read(path)
    start, end = "CONTROL_LEDGER_BEGIN\n", "\nCONTROL_LEDGER_END"
    require(source.count(start) == source.count(end) == 1, "CONTROL_LEDGER_DELIMITERS:" + str(path))
    def unique(pairs):
        require(len({key for key, _ in pairs}) == len(pairs), "DUPLICATE_CONTROL_LEDGER")
        return dict(pairs)
    value = json.loads(source.split(start)[1].split(end)[0], object_pairs_hook=unique)
    if phase is not None:
        require(set(value) == {"common", "measure", "verify", "provenance"}, "CONTROL_LEDGER_PHASES")
        require(not (set(value["common"]) & set(value[phase])), "DUPLICATE_CONTROL_LEDGER")
        value = value["common"] | value[phase]
    require(isinstance(value, dict) and bool(value), "EMPTY_CONTROL_LEDGER")
    require(all(isinstance(name, str) and re.fullmatch(r"[a-z0-9-]+", name)
                and (code is None or isinstance(code, str) and bool(code)) for name, code in value.items()), "CONTROL_LEDGER_SHAPE")
    return value


def systems():
    sources = document(Path("nix/toolchain-sources.json"))["bun"]["sources"]
    require(isinstance(sources, dict) and bool(sources), "EMPTY_SOURCE_SYSTEM_LIST")
    return sources


def api_context(directory, run_id, attempt, finished=False, current=False):
    run = document(directory / "run.json")
    workflow = document(directory / "workflow.json")
    repository = document(directory / "repository.json")
    commit = document(directory / "commit.json")
    require(str(repository["id"]) == os.environ["GITHUB_REPOSITORY_ID"]
            and repository["full_name"] == os.environ["GITHUB_REPOSITORY"], "API_REPOSITORY_IDENTITY")
    require(workflow["path"] == WORKFLOW_PATH and workflow["name"] == "nix-distribution"
            and workflow["state"] == "active" and workflow["id"] == run["workflow_id"]
            and run["path"] == WORKFLOW_PATH, "API_WORKFLOW_IDENTITY")
    require(str(run["id"]) == str(run_id) and str(run["run_attempt"]) == str(attempt)
            and run["head_repository"]["id"] == repository["id"]
            and run["event"] in ("push", "workflow_dispatch")
            and run["head_branch"] == BATCH_BRANCH, "API_RUN_IDENTITY")
    require(commit["sha"] == run["head_sha"] and re.fullmatch(r"[a-f0-9]{40}", commit["tree"]["sha"]), "API_COMMIT_IDENTITY")
    if current:
        require(run["head_sha"] == os.environ["GITHUB_SHA"] and run["event"] == os.environ["GITHUB_EVENT_NAME"], "API_CURRENT_HEAD")
    if finished:
        latest = document(directory / "latest-run.json")
        require(all(latest[key] == run[key] for key in ("id", "workflow_id", "path", "head_sha", "head_branch", "event"))
                and latest["run_attempt"] >= run["run_attempt"], "API_RUN_IDENTITY")
        require(run["status"] == "completed" and run["conclusion"] == "success", "MEASUREMENT_RUN_NOT_SUCCESSFUL")
    return run, repository, commit


def native_jobs(directory, run, finished=False):
    jobs = [job for page in document(directory / "jobs.json") for job in page["jobs"]]
    expected = {"prepare", "completion"} | {f"native distribution ({system})" for system in systems()}
    require(len(jobs) == len(expected) and {job["name"] for job in jobs} == expected, "NATIVE_JOB_SET")
    for job in jobs:
        require(job["run_id"] == run["id"] and job["run_attempt"] == run["run_attempt"]
                and job["head_sha"] == run["head_sha"], "JOB_API_IDENTITY")
        if job["name"] != "completion" or finished:
            require(job["status"] == "completed" and job["conclusion"] == "success", "NATIVE_JOB_FAILED:" + job["name"])
        if job["name"] == "completion" and not finished:
            require(job["status"] == "in_progress", "COMPLETION_JOB_STATE")


def native_artifacts(directory, phase, run, repository, completed=False):
    rows = [item for page in document(directory / "artifacts.json") for item in page["artifacts"]]
    require(len({row["id"] for row in rows}) == len(rows) and len({row["name"] for row in rows}) == len(rows), "DUPLICATE_ARTIFACT")
    expected = {f"nix-distribution-{phase}-{run['id']}-{run['run_attempt']}-{system}" for system in systems()}
    if completed:
        expected.add(f"nix-distribution-completion-{run['id']}-{run['run_attempt']}")
    selected = {}
    for row in rows:
        context = row["workflow_run"]
        require(context == {"id": run["id"], "repository_id": repository["id"],
                            "head_repository_id": repository["id"], "head_branch": run["head_branch"],
                            "head_sha": run["head_sha"]}, "ARTIFACT_API_IDENTITY:" + row["name"])
        if row["name"] not in expected:
            # Only explicitly identified older-attempt artifacts may coexist.
            older = re.fullmatch(r"nix-distribution-(measure|verify|completion)-(\d+)-(\d+)(?:-(.+))?", row["name"])
            require(older is not None and int(older[2]) == run["id"] and 0 < int(older[3]) < run["run_attempt"]
                    and ((older[1] == phase and older[4] in systems()) or (older[1] == "completion" and older[4] is None)),
                    "EXTRA_NATIVE_ARTIFACT:" + row["name"])
            continue
        require(not row["expired"], "EXPIRED_NATIVE_ARTIFACT:" + row["name"])
        selected[row["name"]] = row
    require(set(selected) == expected, "NATIVE_ARTIFACT_SET")
    return selected


def check_controls(worker):
    expected = ledger(Path("nix/scripts/probe-distribution.ts"))
    report = document(worker / "output-negative-controls.stdout")
    require(report["status"] == "OUTPUT_NEGATIVE_CONTROLS_OK" and isinstance(report["completed"], list)
            and len(report["completed"]) == len(expected) and set(report["completed"]) == set(expected), "OUTPUT_CONTROL_SET")
    records = {file.stem for file in (worker / "probes").glob("*.json")}
    require(records == set(expected), "OUTPUT_CONTROL_RECORD_SET")
    for name, code in expected.items():
        result = document(worker / "probes" / f"{name}.json")
        verdict = result["verdict"]
        require(result.get("expected") == code and verdict == json.loads(result["stdout"]), "OUTPUT_CONTROL_RECORD:" + name)
        require((result["status"] == 0 and verdict["status"] == "NATIVE_OUTPUT_CHECK_OK" if code is None else
                 result["status"] == 1 and verdict["status"] == "NATIVE_OUTPUT_CHECK_FAILED" and verdict["failureCode"] == code),
                "OUTPUT_CONTROL_VERDICT:" + name)


def check(directory, phase, expected_context=None):
    require(phase in ("measure", "verify"), "UNKNOWN_PHASE")
    run, repository, commit = api_context(directory, os.environ["GITHUB_RUN_ID"] if expected_context is None else expected_context["id"],
                                          os.environ["GITHUB_RUN_ATTEMPT"] if expected_context is None else expected_context["run_attempt"],
                                          current=expected_context is None)
    if expected_context is not None:
        require(all(run[key] == expected_context[key] for key in ("id", "run_attempt", "workflow_id", "head_sha", "head_branch", "event")), "COMPLETION_RECEIPT_CONTEXT")
    native_jobs(directory, run)
    artifacts = native_artifacts(directory, phase, run, repository)
    for system in systems():
        worker = directory / "workers" / f"nix-distribution-{phase}-{run['id']}-{run['run_attempt']}-{system}"
        require(read(worker / "source-revision.txt").strip() == run["head_sha"], "WORKER_SOURCE_MISMATCH:" + system)
        require(read(worker / "source-tree.txt").strip() == commit["tree"]["sha"], "WORKER_TREE_MISMATCH:" + system)
        require(read(worker / "native-system.stdout").strip() == system, "WORKER_NATIVE_SYSTEM_MISMATCH:" + system)
        require(read(worker / "batch.exit").strip() == "0" and not read(worker / "final-status.txt").strip(), "WORKER_FAILED_OR_DIRTY:" + system)
        phases = ["nix-version", "native-system", "dependency-inputs", "all-consumers", "default-dependency"]
        if phase == "measure":
            phases += ["hash-drv", "hash-capture"]
            candidate = document(worker / "candidate.json")
            require(candidate["sourceRevision"] == run["head_sha"] and candidate["system"] == system
                    and candidate.get("sourceTree", commit["tree"]["sha"]) == commit["tree"]["sha"], "CANDIDATE_IDENTITY:" + system)
            require(candidate["dependencyInputs"] == document(worker / "dependency-inputs.json"), "CANDIDATE_CAPTURE_IDENTITY")
            require(candidate == measured_candidate(worker, system, run["head_sha"]), "CANDIDATE_LOG_MISMATCH:" + system)
        if phase == "verify":
            phases += ["measurement-provenance", "provenance-controls", "matching-measurement", "hash-capture-negative-controls", "applied-hash", "toolchain", "consumers", "outputs",
                       "native-outputs", "output-negative-controls", "references-cli", "references-desktop", "closure"]
            if system.endswith("-darwin"):
                phases.append("app-identity")
            output = document(worker / "native-outputs.stdout")
            pty = output["pty"]
            package = "@lydell/node-pty-" + ("darwin" if system.endswith("-darwin") else "linux") + "-" + ("arm64" if system.startswith("aarch64-") else "x64")
            require(output["system"] == system and output["status"] == "NATIVE_OUTPUT_CHECK_OK" and bool(output["addons"])
                    and len(output["artifacts"]) == 2 and pty["status"] == "PACKAGED_PTY_OK" and pty["package"] == package
                    and pty["exports"]["spawn"] == "function" and bool(pty["bindings"]), "NATIVE_OUTPUT_CAPTURE:" + system)
            check_controls(worker)
        for label in phases:
            require(read(worker / (label + ".exit")).strip() == "0", "FAILED_CAPTURE:" + system + ":" + label)
    return {"sourceRevision": run["head_sha"], "sourceTree": commit["tree"]["sha"], "workflowID": run["workflow_id"], "repositoryID": repository["id"],
            "runID": run["id"], "runAttempt": run["run_attempt"], "systems": list(systems()), "artifactIDs": sorted(row["id"] for row in artifacts.values()),
            "status": "MEASUREMENT_ONLY_NOT_DISTRIBUTION" if phase == "measure" else "NATIVE_DISTRIBUTION_CAPTURE_COMPLETE_PRODUCT_QUALIFICATION_PENDING"}


def measurement_provenance(directory, run_id, attempt, system):
    run, repository, commit = api_context(directory, run_id, attempt, finished=True)
    native_jobs(directory, run, finished=True)
    rows = native_artifacts(directory, "measure", run, repository, completed=True)
    receipt = directory / "completion"
    observed = check(receipt, "measure", expected_context=run)
    require(document(receipt / "result.json") == observed, "MEASUREMENT_COMPLETION_RECEIPT")
    controls = ledger(Path("nix/scripts/probe-distribution-completion.py"), "measure")
    teeth = document(receipt / "teeth.json")
    require(teeth["status"] == "COMPLETION_CONTROLS_OK" and len(teeth["completed"]) == len(controls)
            and set(teeth["completed"]) == set(controls), "MEASUREMENT_COMPLETION_CONTROLS")
    require({path.name for path in (receipt / "teeth").iterdir() if path.is_dir()} == set(controls), "MEASUREMENT_COMPLETION_CONTROL_RECORDS")
    for name, code in controls.items():
        result = document(receipt / "teeth" / name / "probe-result.json")
        require(result.get("expected") == code and (result["status"] == 0 and json.loads(result["stdout"]) == observed if code is None else
                result["status"] == 1 and result["stderr"].strip().split(":")[:2] == ["NIX_DISTRIBUTION_FAILURE", code]),
                "MEASUREMENT_COMPLETION_CONTROL_VERDICT:" + name)
    inner = native_artifacts(receipt, "measure", run, repository)
    require(all(inner[name] == rows[name] for name in inner), "MEASUREMENT_ARTIFACT_RECEIPT")
    require(system in systems(), "UNSUPPORTED_MEASUREMENT_SYSTEM")
    for item in systems():
        name = f"nix-distribution-measure-{run['id']}-{run['run_attempt']}-{item}"
        external = directory / "workers" / name
        captured = receipt / "workers" / name
        require(document(external / "candidate.json") == document(captured / "candidate.json"), "MEASUREMENT_WORKER_RECEIPT")
        require(read(external / "source-revision.txt").strip() == run["head_sha"]
                and read(external / "source-tree.txt").strip() == commit["tree"]["sha"]
                and read(external / "native-system.stdout").strip() == item, "MEASUREMENT_WORKER_API_BINDING")
        candidate = document(external / "candidate.json")
        require(candidate == measured_candidate(external, item, run["head_sha"])
                and candidate["dependencyInputs"] == document(external / "dependency-inputs.json")
                == document(captured / "dependency-inputs.json")
                == document(directory / "dependency-inputs.json"), "MEASUREMENT_DEPENDENCY_IDENTITY")
    comparison = document(directory / "compare.json")
    require(comparison["base_commit"]["sha"] == comparison["merge_base_commit"]["sha"] == run["head_sha"]
            and comparison["status"] == "ahead" and comparison["total_commits"] == len(comparison["commits"]) == 1
            and comparison["commits"][0]["sha"] == os.environ["GITHUB_SHA"], "MEASUREMENT_CHECKPOINT_ANCESTRY")
    changes = {file["filename"] for file in comparison["files"]}
    require("nix/hashes.json" in changes and changes <= {"nix/hashes.json", "nix/distribution.md"}
            and all(file["status"] == "modified" for file in comparison["files"]), "NON_HASH_CHECKPOINT_CHANGE")
    return {**observed, "selectedSystem": system, "status": "MEASUREMENT_API_PROVENANCE_OK"}


def request():
    source = read(Path("nix/distribution.md"))
    start, end = "<!-- NIX_BATCH_REQUEST_BEGIN -->\n", "\n<!-- NIX_BATCH_REQUEST_END -->"
    require(source.count(start) == source.count(end) == 1, "BATCH_REQUEST_DELIMITERS")
    value = json.loads(source.split(start)[1].split(end)[0])
    require(set(value) == {"ready", "phase", "sourceParent", "measurementRun", "measurementAttempt"}, "BATCH_REQUEST_SHAPE")
    require(value["ready"] is True and value["phase"] in ("measure", "verify"), "BATCH_NOT_READY")
    require(os.environ["GITHUB_REF"] == "refs/heads/" + BATCH_BRANCH, "BATCH_BRANCH_MISMATCH")
    require(value["sourceParent"] == subprocess.check_output(["git", "rev-parse", "HEAD^"], text=True).strip(), "BATCH_SOURCE_PARENT")
    changes = set(subprocess.check_output(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], text=True).splitlines())
    require("nix/distribution.md" in changes and changes <= {"nix/distribution.md", "nix/hashes.json"}, "BATCH_REQUEST_COMMIT_SCOPE")
    if value["phase"] == "verify":
        require(changes == {"nix/distribution.md", "nix/hashes.json"}, "BATCH_HASH_REQUEST_SCOPE")
        require(all(isinstance(value[key], int) and not isinstance(value[key], bool) and value[key] > 0 for key in ("measurementRun", "measurementAttempt")), "BATCH_MEASUREMENT_IDENTITY")
    if value["phase"] == "measure":
        require(changes == {"nix/distribution.md"} and value["measurementRun"] is None
                and value["measurementAttempt"] is None, "BATCH_MEASURE_REQUEST_SCOPE")
    return value


if __name__ == "__main__":
    if sys.argv[1:] == ["request"]:
        print(json.dumps(request()))
    elif len(sys.argv) == 6 and sys.argv[1] == "provenance":
        print(json.dumps(measurement_provenance(Path(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5]), indent=2))
    elif len(sys.argv) == 5 and sys.argv[1] == "downloads":
        directory = Path(sys.argv[2])
        run, repository, _ = api_context(directory, sys.argv[3], sys.argv[4], finished=True)
        native_jobs(directory, run, finished=True)
        print("\n".join(native_artifacts(directory, "measure", run, repository, completed=True)))
    else:
        require(len(sys.argv) == 3, "COMPLETION_ARGUMENTS")
        print(json.dumps(check(Path(sys.argv[1]), sys.argv[2]), indent=2))
