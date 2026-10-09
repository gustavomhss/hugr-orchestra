#!/usr/bin/env python3
"""Deferred controls mutate real evidence; replay is valid at a hash-only checkpoint.

The evidence replay uses measured_candidate directly, not a fake HEAD or a checkout.
CLI capture freshness remains a separate control; compare validates checkpoint scope.
"""
import json
from pathlib import Path
import subprocess
import sys
from dependency_measurement import fingerprint, git, require


def main():
    require(len(sys.argv) == 3, "HASH_PROBE_ARGUMENTS")
    measurement, directory = map(Path, sys.argv[1:])
    require(not directory.exists(), "HASH_PROBE_DIRECTORY_NOT_FRESH")
    candidate = json.loads((measurement / "candidate.json").read_text())
    original = {file.name: file.read_text() for file in measurement.iterdir()
                if file.is_file() and file.name in {
                    "source-revision.txt", "source-tree.txt", "source-status.txt", "dependency-inputs.json",
                    "native-system.stdout", "native-system.command", "native-system.exit",
                    "hash-drv.stdout", "hash-drv.command", "hash-drv.exit",
                    "hash-drv-info.stdout", "hash-drv-info.command", "hash-drv-info.exit",
                    "hash-build.stdout", "hash-build.stderr", "hash-build.command", "hash-build.exit"}}
    events = [json.loads(line.removeprefix("@nix ")) for line in original["hash-build.stderr"].splitlines()]
    mismatch = next(index for index, event in enumerate(events)
                    if "hash mismatch in fixed-output derivation" in event.get("msg", ""))
    activity = candidate["evidence"]["activityId"]

    def log(changed):
        return "".join("@nix " + json.dumps(event) + "\n" for event in changed)

    def edit_message(text):
        return log([event | {"raw_msg": text, "msg": "error: " + text} if index == mismatch else event for index, event in enumerate(events)])

    def edit_lines(change):
        return log([event | {"fields": [change(event["fields"][0])]} if event.get("action") == "result"
                    and event.get("type") == 101 and event.get("id") == activity else event for event in events])

    cases = []

    def case(name, changes, expected, action="replay", candidate_changes=None):
        cases.append({"name": name, "changes": changes, "expected": expected, "action": action,
                      "candidateChanges": candidate_changes})

    case("unchanged-real-evidence", {}, None)
    case("restored-real-evidence", {}, None)
    case("stale-source-sha", {"source-revision.txt": "0" * 40 + "\n"}, "SOURCE_GIT_LOOKUP_FAILED")
    old_revision = git("rev-parse", candidate["sourceRevision"] + "^")
    case("stale-recorded-real-source", {"source-revision.txt": old_revision + "\n",
                                        "source-tree.txt": git("rev-parse", old_revision + "^{tree}") + "\n",
                                        "dependency-inputs.json": json.dumps(fingerprint(old_revision))}, "SOURCE_REVISION_MISMATCH")
    case("capture-stale-source-argument", {}, "SOURCE_REVISION_MISMATCH", "capture")
    case("malformed-source-sha", {"source-revision.txt": "not-a-sha\n"}, "INVALID_SOURCE_REVISION")
    case("stale-source-tree", {"source-tree.txt": "0" * 40 + "\n"}, "SOURCE_TREE_MISMATCH")
    case("recorded-dirty-source", {"source-status.txt": " M bun.lock\n"}, "RECORDED_SOURCE_DIRTY")
    case("stale-fingerprint", {"dependency-inputs.json": "{}\n"}, "CAPTURED_DEPENDENCY_INPUTS_MISMATCH")
    case("malformed-fingerprint", {"dependency-inputs.json": "{\n"}, "DEPENDENCY_INPUTS_INVALID")
    case("wrong-native-system", {"native-system.stdout": candidate["system"] + "-extra\n"}, "NATIVE_SYSTEM_MISMATCH")
    for label in ["native-system", "hash-drv", "hash-drv-info", "hash-build"]:
        case("wrong-command-" + label, {label + ".command": "nix --version\n"}, "COMMAND_MISMATCH:" + label)
        case("malformed-status-" + label, {label + ".exit": "unknown\n"}, "STATUS_MISMATCH:" + label)
        case("arbitrary-status-" + label, {label + ".exit": "42\n"}, "STATUS_MISMATCH:" + label)
    case("successful-updater", {"hash-build.exit": "0\n"}, "STATUS_MISMATCH:hash-build")
    case("generic-error-exit", {"hash-build.exit": "1\n"}, "STATUS_MISMATCH:hash-build")
    case("ordinary-builder-error-exit", {"hash-build.exit": "100\n"}, "STATUS_MISMATCH:hash-build")
    case("missing-raw-mismatch-message", {"hash-build.stderr": log([{key: value for key, value in event.items() if key != "raw_msg"} if index == mismatch else event for index, event in enumerate(events)])}, "MISMATCH_RAW_MESSAGE_MISSING")
    case("wrong-derivation", {"hash-drv.stdout": candidate["derivation"].replace("orchestra-node_modules", "wrong-package")}, "INVALID_UPDATER_DERIVATION")
    case("wrong-drv-metadata", {"hash-drv-info.stdout": "{}\n"}, "DERIVATION_METADATA_TARGET_MISMATCH")
    case("malformed-drv-metadata", {"hash-drv-info.stdout": "{\n"}, "DERIVATION_METADATA_INVALID")
    for field, value, expected in [("system", candidate["system"] + "-extra", "DERIVATION_METADATA_IDENTITY_MISMATCH"),
                                    ("outputs", {}, "DERIVATION_METADATA_OUTPUT_INVALID")]:
        info = json.loads(original["hash-drv-info.stdout"])
        info[candidate["derivation"]][field] = value
        case("wrong-drv-" + field, {"hash-drv-info.stdout": json.dumps(info)}, expected)
    case("generic-failure", {"hash-build.stderr": log([{"action": "msg", "level": 0, "msg": "builder failed before install"}])}, "TARGET_BUILD_ACTIVITY_MISSING_OR_AMBIGUOUS")
    case("empty-log", {"hash-build.stderr": ""}, "STRUCTURED_LOG_EMPTY")
    case("unexpected-build-stdout", {"hash-build.stdout": "unrelated output\n"}, "HASH_BUILD_STDOUT_UNEXPECTED")
    case("unstructured-log", {"hash-build.stderr": "builder failed\n"}, "STRUCTURED_LOG_REQUIRED")
    case("malformed-structured-log", {"hash-build.stderr": "@nix {\n"}, "STRUCTURED_LOG_INVALID")
    case("missing-mismatch", {"hash-build.stderr": log([event for index, event in enumerate(events) if index != mismatch])}, "MISSING_OR_AMBIGUOUS_UPDATER_HASH_MISMATCH")
    case("duplicate-mismatch", {"hash-build.stderr": log(events + [events[mismatch]])}, "MISSING_OR_AMBIGUOUS_UPDATER_HASH_MISMATCH")
    case("additional-malformed-mismatch", {"hash-build.stderr": log(events + [{"action": "msg", "level": 0, "msg": "hash mismatch in fixed-output derivation malformed"}])}, "MISSING_OR_AMBIGUOUS_UPDATER_HASH_MISMATCH")
    case("additional-unrelated-mismatch", {"hash-build.stderr": log(events + [events[mismatch] | {"msg": events[mismatch]["msg"].replace(candidate["derivation"], "/nix/store/unrelated.drv")}])}, "MISSING_OR_AMBIGUOUS_UPDATER_HASH_MISMATCH")
    case("wrong-mismatch-derivation", {"hash-build.stderr": edit_message(events[mismatch]["raw_msg"].replace(candidate["derivation"], "/nix/store/unrelated.drv"))}, "INVALID_UPDATER_HASH_MISMATCH")
    case("sri-garbage-suffix", {"hash-build.stderr": edit_message(events[mismatch]["raw_msg"].replace(candidate["hash"], candidate["hash"] + "!garbage"))}, "INVALID_MEASURED_SHA256")
    case("sri-short-digest", {"hash-build.stderr": edit_message(events[mismatch]["raw_msg"].replace(candidate["hash"], "sha256-AA=="))}, "INVALID_MEASURED_SHA256")
    case("sri-invalid-base64", {"hash-build.stderr": edit_message(events[mismatch]["raw_msg"].replace(candidate["hash"], "sha256-" + "!" * 43 + "="))}, "INVALID_MEASURED_SHA256")
    case("sri-noncanonical-padding-bits", {"hash-build.stderr": edit_message(events[mismatch]["raw_msg"].replace(candidate["hash"], "sha256-" + "A" * 42 + "B="))}, "INVALID_MEASURED_SHA256")
    case("mismatch-extra-token", {"hash-build.stderr": edit_message(events[mismatch]["raw_msg"] + " extra")}, "INVALID_UPDATER_HASH_MISMATCH")
    zero_hash = "sha256-" + "A" * 43 + "="
    case("wrong-specified-updater-hash", {"hash-build.stderr": edit_message(events[mismatch]["raw_msg"].replace(zero_hash, candidate["hash"]))}, "UPDATER_SPECIFIED_HASH_INVALID")
    case("reformatted-log-bound-candidate", {"hash-build.stderr": log(events)}, "CANDIDATE_EVIDENCE_MISMATCH", "compare")
    case("additional-build-error", {"hash-build.stderr": log(events + [{"action": "msg", "level": 0, "msg": "another error"}])}, "UNEXPECTED_BUILD_ERROR")
    case("unrelated-builder-activity", {"hash-build.stderr": log([event | {"fields": ["/nix/store/unrelated.drv", *event["fields"][1:]]} if event.get("action") == "start" and event.get("id") == activity else event for event in events])}, "TARGET_BUILD_ACTIVITY_MISSING_OR_AMBIGUOUS")
    case("missing-target-stop", {"hash-build.stderr": log([event for event in events if not (event.get("action") == "stop" and event.get("id") == activity)])}, "TARGET_BUILD_STOP_MISSING_OR_AMBIGUOUS")
    case("unrelated-builder-receipts", {"hash-build.stderr": log([event | {"id": activity + 1000000} if event.get("action") == "result" and event.get("id") == activity else event for event in events])}, "NORMALIZATION_INCOMPLETE:canonicalize-node-modules")
    for label in ["canonicalize-node-modules", "normalize-bun-binaries"]:
        case("missing-" + label, {"hash-build.stderr": edit_lines(lambda line: line.replace("[" + label + "]", "[removed]"))}, "NORMALIZATION_INCOMPLETE:" + label)
    case("missing-install-receipt", {"hash-build.stderr": edit_lines(lambda line: "removed" if '"phase":"install"' in line else line)}, "TARGET_RECEIPTS_INCOMPLETE")
    for field in ["name", "system", "out"]:
        def wrong_receipt(line):
            if not line.startswith("NODE_MODULES_RECEIPT:"):
                return line
            receipt = json.loads(line.removeprefix("NODE_MODULES_RECEIPT:"))
            receipt[field] += "-extra"
            return "NODE_MODULES_RECEIPT:" + json.dumps(receipt)
        case("wrong-receipt-" + field, {"hash-build.stderr": edit_lines(wrong_receipt)}, "TARGET_RECEIPT_IDENTITY_MISMATCH")
    case("malformed-receipt", {"hash-build.stderr": edit_lines(lambda line: "NODE_MODULES_RECEIPT:{" if line.startswith("NODE_MODULES_RECEIPT:") else line)}, "TARGET_RECEIPT_INVALID")
    receipt_indices = [index for index, event in enumerate(events) if event.get("action") == "result"
                       and event.get("id") == activity and str(event.get("fields", [""])[0]).startswith("NODE_MODULES_RECEIPT:")]
    reordered = list(events)
    reordered[receipt_indices[0]], reordered[receipt_indices[-1]] = reordered[receipt_indices[-1]], reordered[receipt_indices[0]]
    case("wrong-completion-order", {"hash-build.stderr": log(reordered)}, "TARGET_RECEIPT_IDENTITY_MISMATCH")
    late = [event for index, event in enumerate(events) if index not in receipt_indices] + [events[index] for index in receipt_indices]
    case("completion-after-mismatch", {"hash-build.stderr": log(late)}, "TARGET_LOG_ORDER_INVALID")
    for file in original:
        case("missing-" + file.replace(".", "-"), {file: None}, "EVIDENCE_MISSING:" + file)
    for field, value in [("sourceRevision", "0" * 40), ("sourceTree", "0" * 40), ("dependencyInputs", {}),
                         ("system", candidate["system"] + "-extra"), ("hash", candidate["hash"] + "!garbage"),
                         ("status", "APPLIED"), ("derivation", "/nix/store/unrelated.drv"),
                         ("evidence", {}), ("hashMode", "flat")]:
        case("candidate-tampered-" + field, {}, "CANDIDATE_SOURCE_REVISION_MISMATCH" if field == "sourceRevision" else "CANDIDATE_EVIDENCE_MISMATCH", "compare", {field: value})
    case("unchanged-compare-identity", {}, None, "compare")
    case("restored-compare-identity", {}, None, "compare")
    case("missing-candidate", {}, "EVIDENCE_MISSING:candidate.json", "compare")
    directory.mkdir()
    # Stable JSON case array is the prepared ledger; result files record later execution.
    (directory / "cases.json").write_text(json.dumps(cases, indent=2) + "\n")
    for control in cases:
        fixture = directory / control["name"]
        fixture.mkdir()
        for file, content in (original | control["changes"]).items():
            if content is not None:
                (fixture / file).write_text(content)
        if control["action"] == "capture":
            invocation = [sys.executable, "nix/scripts/dependency_measurement.py", "capture", str(fixture),
                          candidate["system"], "0" * 40]
        elif control["action"] == "compare":
            if control["name"] != "missing-candidate":
                (fixture / "candidate.json").write_text(json.dumps(candidate | (control["candidateChanges"] or {}), indent=2) + "\n")
            invocation = [sys.executable, "nix/scripts/dependency_measurement.py", "compare", str(fixture)]
        else:
            invocation = [sys.executable, "-c",
                          "import json,sys; from pathlib import Path; sys.path.insert(0,'nix/scripts'); "
                          "from dependency_measurement import measured_candidate; "
                          "d=Path(sys.argv[1]); c=measured_candidate(d,sys.argv[2],sys.argv[3]); "
                          "(d/'candidate.json').write_text(json.dumps(c,indent=2)+'\\n')",
                          str(fixture), candidate["system"], candidate["sourceRevision"]]
        before = (fixture / "candidate.json").read_bytes() if (fixture / "candidate.json").exists() else None
        result = subprocess.run(invocation, text=True, capture_output=True)
        expected = control["expected"]
        require(result.returncode == 0 if expected is None else result.returncode != 0
                and "NIX_DISTRIBUTION_FAILURE:" + expected in result.stderr, "HASH_PROBE_VERDICT:" + control["name"])
        if expected is None:
            require(json.loads((fixture / "candidate.json").read_text()) == candidate, "HASH_REPLAY_CHANGED_CANDIDATE:" + control["name"])
        if expected is not None:
            require((fixture / "candidate.json").read_bytes() == before if before is not None
                    else not (fixture / "candidate.json").exists(), "INVALID_HASH_CANDIDATE_PUBLISHED:" + control["name"])
        (fixture / "result.json").write_text(json.dumps({"name": control["name"], "status": result.returncode,
                                                        "expected": expected, "stdout": result.stdout,
                                                        "stderr": result.stderr}, indent=2) + "\n")
    print(json.dumps({"status": "HASH_CAPTURE_CONTROLS_OK", "completed": [control["name"] for control in cases]}, indent=2))


if __name__ == "__main__":
    main()
