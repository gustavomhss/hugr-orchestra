#!/usr/bin/env python3
"""Gate repair + extension: flake-derived coverage and current-run proof identity."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

RUNNERS = {"x86_64-linux": "ubuntu-24.04", "aarch64-linux": "ubuntu-24.04-arm",
           "x86_64-darwin": "macos-15-intel", "aarch64-darwin": "macos-15"}


def fail(label, detail=""):
    raise SystemExit("TOOLCHAIN_GATE_FAILURE:" + label + (":" + str(detail) if detail else ""))


def named_exception(kind, value, traceback):
    label = "JSON_INPUT_MISSING" if issubclass(kind, FileNotFoundError) else "JSON_INPUT_INVALID"
    print("TOOLCHAIN_GATE_FAILURE:" + label + ":" + str(value), file=sys.stderr)


# Guard entrypoints import this module so malformed structural inputs never emit
# an unnamed traceback, including missing canonical JSON fields in shell snippets.
sys.excepthook = named_exception


def read_json(path):
    try:
        return json.loads(Path(path).read_text())
    except FileNotFoundError:
        fail("JSON_INPUT_MISSING", path)
    except (OSError, ValueError):
        fail("JSON_INPUT_INVALID", path)


def text(path):
    try:
        return Path(path).read_text()
    except OSError:
        fail("EVIDENCE_FILE_MISSING", path)


def systems_from(path):
    systems = read_json(path)
    if not isinstance(systems, list) or not systems:
        fail("EMPTY_OR_INVALID_FLAKE_SYSTEMS")
    if not all(isinstance(system, str) and system for system in systems):
        fail("JSON_INPUT_INVALID", path)
    if len(set(systems)) != len(systems):
        fail("DUPLICATE_FLAKE_SYSTEM")
    unknown = set(systems) - set(RUNNERS)
    if unknown:
        fail("UNSUPPORTED_RUNNER_SYSTEM", sorted(unknown))
    return systems


def identity():
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    header = subprocess.check_output(["git", "cat-file", "-p", "HEAD"], text=True).split("\n\n", 1)[0]
    parents = [line.split()[1] for line in header.splitlines() if line.startswith("parent ")]
    result = {"sourceHEAD": head, "githubSHA": os.environ["GITHUB_SHA"],
              "runID": os.environ["GITHUB_RUN_ID"], "runAttempt": os.environ["GITHUB_RUN_ATTEMPT"],
              "event": os.environ["GITHUB_EVENT_NAME"], "parents": parents,
              "needs": {"prepare": os.environ.get("PREPARE_RESULT"), "native": os.environ.get("NATIVE_RESULT")}}
    if head != result["githubSHA"]:
        fail("CHECKOUT_SHA_MISMATCH")
    if result["event"] == "pull_request":
        result["eventHead"] = read_json(os.environ["GITHUB_EVENT_PATH"])["pull_request"]["head"]["sha"]
    return result


def worker_logs(directory, manifest, system):
    directory = Path(directory)
    if text(directory / "native-system.stdout") != system:
        fail("NATIVE_SYSTEM_MISMATCH", system)
    if text(directory / "lock.diff"):
        fail("LOCK_CHANGED", system)
    tools = {}
    for tool in ("bun", "electron"):
        prefix = directory / tool
        expected = manifest[tool]["sources"][system]
        version = manifest[tool]["version"]
        actual = read_json(str(prefix) + "-render.stdout")
        if actual["version"] != version or actual["doInstallCheck"] is not True:
            fail("RENDER_MISMATCH", tool)
        if actual["source"] != {"urls": [expected["url"]], "outputHash": expected["hash"], "outputHashMode": "flat"}:
            fail("SOURCE_MISMATCH", tool)
        for phase in ("render", "build", "rebuild", "restored", "references", "closure", "execute"):
            if text(str(prefix) + "-" + phase + ".exit").strip() != "0":
                fail("INCOMPLETE_TOOL_EVIDENCE", tool + ":" + phase)
        for phase in ("rebuild", "restored"):
            if "TOOLCHAIN_INSTALL_CHECK_OK:" + tool + ":" + version not in text(str(prefix) + "-" + phase + ".stderr"):
                fail("INSTALL_CHECK_MARKER_MISSING", tool)
        for phase in ("check-mutant", "unsupported", "hash-mutant"):
            if text(str(prefix) + "-" + phase + ".exit").strip() == "0":
                fail("MUTANT_PASSED", tool + ":" + phase)
        mutant = text(str(prefix) + "-check-mutant.stderr")
        if "TOOLCHAIN_INSTALL_CHECK_FAIL_PROBE:" + tool not in mutant or "exit code 97" not in mutant:
            fail("FAIL97_EVIDENCE_MISSING", tool)
        if "Unsupported " + tool.capitalize() + " toolchain system: toolchain-unsupported" not in text(str(prefix) + "-unsupported.stderr"):
            fail("UNSUPPORTED_EVIDENCE_MISSING", tool)
        mismatch = text(str(prefix) + "-hash-mutant.stderr")
        if "hash mismatch in fixed-output derivation" not in mismatch or re.findall(r"^\s*got:\s*(\S+)\s*$", mismatch, re.M) != [expected["hash"]]:
            fail("HASH_PROBE_GOT", tool)
        if text(str(prefix) + "-execute.stdout").strip() != version:
            fail("NATIVE_EXECUTION_VERSION", tool)
        image = read_json(str(prefix) + "-native-image.json")
        if image["system"] != system or image["nativeImage"] is not True:
            fail("NATIVE_IMAGE_MISMATCH", tool)
        store = text(str(prefix) + "-build.stdout").strip()
        closure = read_json(str(prefix) + "-closure.stdout")
        references = text(str(prefix) + "-references.stdout").splitlines()
        if not store.startswith("/nix/store/") or store not in closure or sorted(closure[store]["references"]) != sorted(references):
            fail("REFERENCE_EVIDENCE_MISMATCH", tool)
        tools[tool] = {"version": version, "storePath": store, "references": references,
                       "sourceHash": expected["hash"], "checks": {"render": True, "nativeImage": True,
                       "nativeExecute": True, "rebuild": True, "restored": True, "fail97": True,
                       "unsupported": True, "hashMismatch": True}}
    return tools


def pages(path, key):
    value = read_json(path)
    if not isinstance(value, list) or not value:
        fail("JSON_INPUT_INVALID", path)
    result = []
    for page in value:
        if not isinstance(page[key], list):
            fail("JSON_INPUT_INVALID", path)
        result.extend(page[key])
    return result


def orchestration(directory):
    directory = Path(directory)
    systems = systems_from(directory / "systems.json")
    context = read_json(directory / "identity.json")
    run = read_json(directory / "run.json")
    if context["sourceHEAD"] != context["githubSHA"] or str(run["id"]) != context["runID"]:
        fail("SOURCE_SHA_MISMATCH")
    if str(run["run_attempt"]) != context["runAttempt"]:
        fail("RUN_ATTEMPT_MISMATCH")
    if run["event"] != context["event"]:
        fail("RUN_EVENT_MISMATCH")
    if context["event"] == "pull_request":
        if run["head_sha"] != context["eventHead"] or run["head_sha"] not in context["parents"]:
            fail("PR_MERGE_HEAD_RELATION")
    elif run["head_sha"] != context["sourceHEAD"]:
        fail("RUN_HEAD_SHA_MISMATCH")
    jobs = pages(directory / "jobs.json", "jobs")
    prepares = [job for job in jobs if job["name"] == "prepare"]
    if len(prepares) != 1 or prepares[0]["status"] != "completed" or prepares[0]["conclusion"] != "success":
        fail("PREPARE_JOB_FAILED_OR_MISSING")
    native = [job for job in jobs if job["name"].startswith("native (")]
    names = [job["name"] for job in native]
    if len(set(names)) != len(names):
        fail("DUPLICATE_NATIVE_JOB")
    if set(names) != {"native (" + system + ")" for system in systems}:
        fail("MISSING_OR_UNEXPECTED_NATIVE_JOB")
    for job in native:
        if job["conclusion"] == "skipped":
            fail("NATIVE_JOB_SKIPPED", job["name"])
        if job["status"] != "completed" or job["conclusion"] != "success":
            fail("NATIVE_JOB_FAILED_OR_INCOMPLETE", job["name"])
    if context["needs"] != {"prepare": "success", "native": "success"}:
        fail("ORCHESTRATION_NEEDS_FAILURE")
    prefix = "nix-toolchain-" + context["runID"] + "-" + context["runAttempt"] + "-"
    artifacts = [item for item in pages(directory / "artifacts.json", "artifacts") if item["name"].startswith(prefix)]
    names = [item["name"] for item in artifacts]
    if len(set(names)) != len(names):
        fail("DUPLICATE_EVIDENCE_ARTIFACT")
    if set(names) != {prefix + system for system in systems}:
        fail("MISSING_OR_UNEXPECTED_EVIDENCE_ARTIFACT")
    return context, systems, run, artifacts, prefix


def complete(directory):
    directory = Path(directory)
    context, systems, run, artifacts, prefix = orchestration(directory)
    manifest = read_json(directory / "manifest.json")
    observed = []
    for artifact in artifacts:
        if artifact["expired"] or artifact["workflow_run"]["id"] != run["id"] or artifact["workflow_run"]["head_sha"] != run["head_sha"]:
            fail("ARTIFACT_RUN_IDENTITY_MISMATCH")
        path = directory / "artifacts" / artifact["name"]
        record = read_json(path / "evidence.json")
        system = record["nativeSystem"]
        if system not in systems or artifact["name"] != prefix + system:
            fail("EVIDENCE_SYSTEM_MISMATCH")
        if any(record[key] != context[key] for key in ("sourceHEAD", "githubSHA", "runID", "runAttempt")):
            fail("EVIDENCE_SOURCE_SHA_MISMATCH", system)
        if record["tools"] != worker_logs(path, manifest, system):
            fail("WORKER_CLAIM_LOG_MISMATCH", system)
        if set(systems_from(path / "declared-systems.stdout")) != set(systems):
            fail("WORKER_FLAKE_SYSTEMS_MISMATCH", system)
        observed.append(system)
    if len(set(observed)) != len(observed) or set(observed) != set(systems):
        fail("EVIDENCE_SYSTEM_BIJECTION")
    return {"sourceHEAD": context["sourceHEAD"], "runID": context["runID"], "systems": sorted(observed), "gate": "success"}


def main():
    mode, path = sys.argv[1:3]
    if mode == "matrix":
        print(json.dumps({"include": [{"system": system, "runner": RUNNERS[system]} for system in systems_from(path)]}))
    elif mode == "identity":
        Path(path).write_text(json.dumps(identity()))
    elif mode == "record":
        directory = Path(path)
        system = os.environ["TOOLCHAIN_SYSTEM"]
        record = {**identity(), "nativeSystem": system,
                  "tools": worker_logs(directory, read_json("nix/toolchain-sources.json"), system)}
        (directory / "evidence.json").write_text(json.dumps(record, indent=2) + "\n")
    elif mode == "complete":
        print(json.dumps(complete(path)))
    elif mode == "orchestration":
        orchestration(path)
        print("TOOLCHAIN_ORCHESTRATION_OK")
    else:
        fail("UNKNOWN_METADATA_MODE", mode)


if __name__ == "__main__":
    main()
