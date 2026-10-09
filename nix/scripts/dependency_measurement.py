#!/usr/bin/env python3
"""Deferred capture: bind source, commands, structured builder activity and mismatch."""
import base64
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys


def named_exception(kind, value, traceback):
    print("NIX_DISTRIBUTION_FAILURE:EVIDENCE_INPUT_INVALID:" + str(value), file=sys.stderr)


sys.excepthook = named_exception


def require(condition, label):
    if not condition:
        raise SystemExit("NIX_DISTRIBUTION_FAILURE:" + label)


def read(directory, name):
    require((directory / name).is_file(), "EVIDENCE_MISSING:" + name)
    return (directory / name).read_text()


def decode(text, label):
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        require(False, label)


def git(*args):
    result = subprocess.run(["git", *args], text=True, capture_output=True)
    require(result.returncode == 0, "SOURCE_GIT_LOOKUP_FAILED")
    return result.stdout.strip()


def fingerprint(revision):
    entries = git("ls-tree", "-r", "--full-tree", revision, "--",
                  "packages", "patches", "bun.lock", "package.json", "bunfig.toml", "tsconfig.json", "flake.lock",
                  ".github/TEAM_MEMBERS", "flake.nix", "nix/node_modules.nix", "nix/bun.nix",
                  "nix/toolchain-sources.json", "nix/scripts/canonicalize-node-modules.ts",
                  "nix/scripts/normalize-bun-binaries.ts").splitlines()
    blobs = {}
    for line in entries:
        metadata, path = line.split("\t", 1)
        require(metadata.split()[1] == "blob", "DEPENDENCY_INPUT_NOT_BLOB:" + path)
        blobs[path] = metadata.split()[2]
    require("bun.lock" in blobs and "nix/node_modules.nix" in blobs, "DEPENDENCY_INPUTS_MISSING")
    require(any(path.startswith("packages/") for path in blobs), "EMPTY_WORKSPACE_INPUTS")
    return blobs


def source(directory):
    revision = read(directory, "source-revision.txt").strip()
    require(re.fullmatch(r"[0-9a-f]{40}", revision), "INVALID_SOURCE_REVISION")
    require(git("rev-parse", revision + "^{commit}") == revision, "SOURCE_REVISION_MISMATCH")
    tree = read(directory, "source-tree.txt").strip()
    require(tree == git("rev-parse", revision + "^{tree}"), "SOURCE_TREE_MISMATCH")
    require(read(directory, "source-status.txt") == "", "RECORDED_SOURCE_DIRTY")
    inputs = decode(read(directory, "dependency-inputs.json"), "DEPENDENCY_INPUTS_INVALID")
    require(inputs == fingerprint(revision), "CAPTURED_DEPENDENCY_INPUTS_MISMATCH")
    return revision, tree, inputs


def command(directory, label, expected, status):
    try:
        tokens = shlex.split(read(directory, label + ".command"))
    except ValueError:
        require(False, "COMMAND_INVALID:" + label)
    require(tokens == expected, "COMMAND_MISMATCH:" + label)
    require(read(directory, label + ".exit").strip() == str(status), "STATUS_MISMATCH:" + label)


def sha256(token):
    require(re.fullmatch(r"sha256-[A-Za-z0-9+/]{43}=", token), "INVALID_MEASURED_SHA256")
    digest = base64.b64decode(token[7:], validate=True)
    require(len(digest) == 32 and base64.b64encode(digest).decode() == token[7:], "INVALID_MEASURED_SHA256")
    return token


def measured_candidate(directory, system, revision):
    recorded, tree, inputs = source(directory)
    require(revision == recorded, "SOURCE_REVISION_MISMATCH")
    sources = decode(git("show", recorded + ":nix/toolchain-sources.json"), "TOOLCHAIN_SOURCES_INVALID")
    require(system in sources["bun"]["sources"], "UNSUPPORTED_MEASUREMENT_SYSTEM")
    require(read(directory, "native-system.stdout").strip() == system, "NATIVE_SYSTEM_MISMATCH")
    command(directory, "native-system", ["nix", "eval", "--impure", "--raw", "--expr", "builtins.currentSystem"], 0)
    target = ".#packages." + system + ".node_modules_updater"
    command(directory, "hash-drv", ["nix", "eval", "--no-write-lock-file", "--no-update-lock-file", "--raw", target + ".drvPath"], 0)
    command(directory, "hash-build", ["nix", "build", "--no-write-lock-file", "--no-update-lock-file",
                                     "--option", "sandbox", "true", "--no-link", "--print-build-logs",
                                     "--log-format", "internal-json", target], 102)
    drv = read(directory, "hash-drv.stdout").strip()
    require(re.fullmatch(r"/nix/store/[0-9abcdfghijklmnpqrsvwxyz]{32}-orchestra-node_modules-[^/\s]+\.drv", drv), "INVALID_UPDATER_DERIVATION")
    command(directory, "hash-drv-info", ["nix", "derivation", "show", drv], 0)
    info = decode(read(directory, "hash-drv-info.stdout"), "DERIVATION_METADATA_INVALID")
    require(isinstance(info, dict) and list(info) == [drv], "DERIVATION_METADATA_TARGET_MISMATCH")
    metadata = info[drv]
    require(isinstance(metadata, dict) and isinstance(metadata.get("env"), dict), "DERIVATION_METADATA_INVALID")
    name = Path(drv).name[33:-4]
    require(metadata.get("system") == system and metadata.get("env", {}).get("name") == name,
            "DERIVATION_METADATA_IDENTITY_MISMATCH")
    outputs = metadata.get("outputs", {})
    require(isinstance(outputs, dict) and list(outputs) == ["out"] and isinstance(outputs["out"], dict)
            and outputs["out"].get("hashAlgo") == "r:sha256",
            "DERIVATION_METADATA_OUTPUT_INVALID")
    require(outputs["out"].get("hash") in ["0" * 64, "0" * 52, "sha256-" + base64.b64encode(bytes(32)).decode()],
            "DERIVATION_METADATA_HASH_INVALID")
    out = outputs["out"].get("path")
    require(isinstance(out, str) and re.fullmatch(r"/nix/store/[0-9abcdfghijklmnpqrsvwxyz]{32}-" + re.escape(name), out),
            "DERIVATION_METADATA_OUTPUT_INVALID")
    log = read(directory, "hash-build.stderr")
    require(read(directory, "hash-build.stdout") == "", "HASH_BUILD_STDOUT_UNEXPECTED")
    events = []
    for line in log.splitlines():
        require(line.startswith("@nix "), "STRUCTURED_LOG_REQUIRED")
        event = decode(line[5:], "STRUCTURED_LOG_INVALID")
        require(isinstance(event, dict), "STRUCTURED_LOG_INVALID")
        events.append(event)
    require(events, "STRUCTURED_LOG_EMPTY")
    starts = [(index, event) for index, event in enumerate(events)
              if event.get("action") == "start" and event.get("type") == 105
              and isinstance(event.get("fields"), list) and event["fields"][:1] == [drv]]
    require(len(starts) == 1, "TARGET_BUILD_ACTIVITY_MISSING_OR_AMBIGUOUS")
    start, activity = starts[0]
    require(type(activity.get("id")) is int and activity["id"] >= 0, "TARGET_BUILD_ACTIVITY_INVALID")
    require(sum(event.get("action") == "start" and event.get("id") == activity["id"] for event in events) == 1,
            "TARGET_BUILD_ACTIVITY_AMBIGUOUS")
    stops = [index for index, event in enumerate(events) if event.get("action") == "stop" and event.get("id") == activity["id"]]
    require(len(stops) == 1 and stops[0] > start, "TARGET_BUILD_STOP_MISSING_OR_AMBIGUOUS")
    mismatches = [(index, event.get("raw_msg")) for index, event in enumerate(events)
                  if "hash mismatch in fixed-output derivation" in str(event)]
    require(len(mismatches) == 1, "MISSING_OR_AMBIGUOUS_UPDATER_HASH_MISMATCH")
    require(sum(event.get("action") == "msg" and event.get("level") == 0 for event in events) == 1,
            "UNEXPECTED_BUILD_ERROR")
    mismatch_index, message = mismatches[0]
    require(isinstance(message, str), "MISMATCH_RAW_MESSAGE_MISSING")
    # Nix's raw_msg omits human error headers; SGR styling is not hash data.
    message = re.sub(r"\x1b\[[0-9;]*m", "", message)
    match = re.fullmatch(r"hash mismatch in fixed-output derivation '" + re.escape(drv)
                         + r"':\s+specified:\s+(\S+)\s+got:\s+(\S+)\s*", message)
    require(match is not None, "INVALID_UPDATER_HASH_MISMATCH")
    require(events[mismatch_index].get("action") == "msg" and events[mismatch_index].get("level") == 0,
            "INVALID_UPDATER_HASH_MISMATCH")
    specified, measured = sha256(match[1]), sha256(match[2])
    require(specified == "sha256-" + base64.b64encode(bytes(32)).decode() and measured != specified,
            "UPDATER_SPECIFIED_HASH_INVALID")
    receipts = []
    counts = {"canonicalize-node-modules": [], "normalize-bun-binaries": []}
    for index, event in enumerate(events):
        if event.get("action") != "result" or event.get("type") != 101 or event.get("id") != activity["id"]:
            continue
        require(start < index < min(mismatch_index, stops[0]), "TARGET_LOG_ORDER_INVALID")
        fields = event.get("fields")
        require(isinstance(fields, list) and len(fields) == 1 and isinstance(fields[0], str), "TARGET_LOG_FIELDS_INVALID")
        line = fields[0]
        for label in counts:
            if line.startswith("[" + label + "] rebuilt "):
                count = re.fullmatch(r"\[" + label + r"\] rebuilt ([1-9][0-9]*) links", line)
                require(count is not None, "NORMALIZATION_INCOMPLETE:" + label)
                counts[label].append(index)
        if line.startswith("NODE_MODULES_RECEIPT:"):
            receipts.append((index, decode(line.removeprefix("NODE_MODULES_RECEIPT:"), "TARGET_RECEIPT_INVALID")))
    for label, indices in counts.items():
        require(len(indices) == 1, "NORMALIZATION_INCOMPLETE:" + label)
    require(len(receipts) == 3, "TARGET_RECEIPTS_INCOMPLETE")
    for (index, receipt), phase in zip(receipts, ["canonicalize", "normalize", "install"]):
        require(receipt == {"name": name, "system": system, "out": out, "phase": phase}, "TARGET_RECEIPT_IDENTITY_MISMATCH")
    require(counts["canonicalize-node-modules"][0] < receipts[0][0]
            < counts["normalize-bun-binaries"][0] < receipts[1][0] < receipts[2][0] < mismatch_index,
            "TARGET_COMPLETION_ORDER_INVALID")
    evidence_files = ["source-revision.txt", "source-tree.txt", "source-status.txt", "dependency-inputs.json",
                      "native-system.stdout", "native-system.command", "native-system.exit",
                      "hash-drv.stdout", "hash-drv.command", "hash-drv.exit",
                      "hash-drv-info.stdout", "hash-drv-info.command", "hash-drv-info.exit",
                      "hash-build.stdout", "hash-build.stderr", "hash-build.command", "hash-build.exit"]
    evidence_digest = hashlib.sha256(json.dumps({name: read(directory, name) for name in evidence_files},
                                                sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"status": "MEASURED_CANDIDATE_NOT_APPLIED", "system": system, "sourceRevision": recorded,
            "sourceTree": tree, "derivation": drv, "hash": measured, "hashMode": "recursive SHA-256 NAR",
            "dependencyInputs": inputs, "evidence": {"format": "nix-internal-json-v1", "builderName": name,
                                                      "output": out, "activityId": activity["id"],
                                                      "sha256": evidence_digest}}


def main():
    require(len(sys.argv) >= 3, "MEASUREMENT_ARGUMENTS")
    action, directory = sys.argv[1], Path(sys.argv[2])
    if action == "inputs":
        require(len(sys.argv) == 3, "MEASUREMENT_ARGUMENTS")
        revision = read(directory, "source-revision.txt").strip()
        require(revision == git("rev-parse", "HEAD"), "SOURCE_REVISION_MISMATCH")
        require(read(directory, "source-tree.txt").strip() == git("rev-parse", "HEAD^{tree}"), "SOURCE_TREE_MISMATCH")
        require(read(directory, "source-status.txt") == "", "RECORDED_SOURCE_DIRTY")
        require(not git("status", "--porcelain", "--untracked-files=all"), "DIRTY_SOURCE_TREE")
        (directory / "dependency-inputs.json").write_text(json.dumps(fingerprint(revision), indent=2) + "\n")
        return
    if action == "compare":
        require(len(sys.argv) == 3, "MEASUREMENT_ARGUMENTS")
        candidate = decode(read(directory, "candidate.json"), "CANDIDATE_INVALID")
        require(isinstance(candidate, dict), "CANDIDATE_INVALID")
        recorded = read(directory, "source-revision.txt").strip()
        require(candidate.get("sourceRevision") == recorded, "CANDIDATE_SOURCE_REVISION_MISMATCH")
        system = read(directory, "native-system.stdout").strip()
        require(json.dumps(candidate, sort_keys=True) == json.dumps(measured_candidate(directory, system, recorded), sort_keys=True),
                "CANDIDATE_EVIDENCE_MISMATCH")
        require(not git("status", "--porcelain", "--untracked-files=all"), "DIRTY_SOURCE_TREE")
        require(fingerprint("HEAD") == candidate["dependencyInputs"], "DEPENDENCY_INPUT_CHANGED_SINCE_MEASUREMENT")
        changed = git("diff", "--name-only", recorded, "HEAD").splitlines()
        require(all(path == "nix/hashes.json" for path in changed), "NON_HASH_SOURCE_CHECKPOINT")
        return
    require(action == "capture" and len(sys.argv) == 5, "MEASUREMENT_ACTION")
    require(not (directory / "candidate.json").exists(), "CANDIDATE_ALREADY_EXISTS")
    require(sys.argv[4] == git("rev-parse", "HEAD"), "SOURCE_REVISION_MISMATCH")
    require(read(directory, "source-tree.txt").strip() == git("rev-parse", "HEAD^{tree}"), "SOURCE_TREE_MISMATCH")
    require(not git("status", "--porcelain", "--untracked-files=all"), "DIRTY_SOURCE_TREE")
    candidate = measured_candidate(directory, sys.argv[3], sys.argv[4])
    (directory / "candidate.json").write_text(json.dumps(candidate, indent=2) + "\n")
    print("DEPENDENCY_HASH_CANDIDATE:" + candidate["system"] + ":" + candidate["hash"])


if __name__ == "__main__":
    main()
