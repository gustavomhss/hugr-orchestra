#!/usr/bin/env python3
"""Build the exact S3 input lock from immutable captures and local payload bytes.

Without --payload-commit this writes only a dependency/capture preflight report.
With the actual commit supplied by root it verifies root's exact GitHub readback
receipt and writes the lock. The runner must verify the immutable bytes again.
This program does not invoke Git, Atlas, tests, network, or semantic reviewers.
Oracle bytes, when needed, are only hashed against already declared references.
"""
import argparse
import base64
import copy
import json
import re
import sys
from pathlib import Path, PurePosixPath

from build_selected_payload import (BASE, ORIGINAL, PACKAGE_PATH, RESUME, SOURCE,
                                    WORKSPACE, load_json, measure, read_bytes,
                                    require, safe_relative, write_json)

PROTOCOL = "ee2521a5b966bd505cc95bd1c733e09e12f33531"
HASH40 = re.compile(r"[0-9a-f]{40}")
HASH64 = re.compile(r"[0-9a-f]{64}")


def add_catalog(catalog, row):
    key = (row["commit"], row["path"])
    require(HASH40.fullmatch(key[0]) is not None, "Captured commit is not immutable")
    safe_relative(key[1])
    require(HASH40.fullmatch(row["git_blob_sha"]) is not None, "Missing captured Git blob: " + key[1])
    require(type(row["byte_length"]) is int and row["byte_length"] >= 0, "Missing captured byte length: " + key[1])
    previous = catalog.get(key)
    if previous:
        for field in ("git_blob_sha", "byte_length"):
            require(previous[field] == row[field], "Conflicting captured " + field + ": " + key[1])
        if previous.get("sha256") and row.get("sha256"):
            require(previous["sha256"] == row["sha256"], "Conflicting captured SHA256: " + key[1])
        if previous.get("mode") and row.get("mode"):
            require(previous["mode"] == row["mode"], "Conflicting captured mode: " + key[1])
        previous["sha256"] = row.get("sha256") or previous.get("sha256")
        previous["mode"] = row.get("mode") or previous.get("mode")
        previous["evidence"] = sorted(set(previous.get("evidence", []) + row.get("evidence", [])))
        if row.get("local_path"):
            previous["local_path"] = row["local_path"]
            previous["sha256_state"] = "LOCAL_BYTES_AND_GIT_BLOB_VERIFIED"
        return
    catalog[key] = copy.deepcopy(row)


def capture_content(catalog, commit, path, record, evidence, raw_output):
    content = record["content"]
    require(isinstance(content, str), "Unexpected connector content type")
    raw = base64.b64decode(content, validate=True) if record.get("encoding") == "base64" else content.encode("utf-8")
    identity = measure(raw)
    require(identity["git_blob_sha"] == record["sha"], "Connector content is not the captured Git blob: " + path)
    target = raw_output / identity["git_blob_sha"]
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        require(read_bytes(target) == raw, "Local capture blob collision")
    else:
        target.write_bytes(raw)
    add_catalog(catalog, {"commit": commit, "path": path, "mode": None, **identity,
                         "local_path": str(target), "sha256_state": "LOCAL_BYTES_AND_GIT_BLOB_VERIFIED", "evidence": [evidence]})


def load_catalog(workspace, output):
    catalog = {}
    baseline = load_json(workspace / "s3-input-lock/baseline-files.json")
    require(baseline["source_revision"] == SOURCE and baseline["source_tree_sha"] == "a522a53e5f046f1758151b0f558531bbded04592", "Unexpected baseline tree")
    baseline_rows = {row["path"]: row for row in baseline["files"]}
    require(len(baseline_rows) == 4590 == len(baseline["files"]), "Baseline file population changed")
    for row in baseline["files"]:
        require(row["presence"] == "PRESENT" and row["regular_file"] and not row["symlink"], "Baseline contains missing/nonregular input")
        add_catalog(catalog, {"commit": row["effective_commit"], "path": row["path"], "mode": row["mode"],
                             "git_blob_sha": row["git_blob_sha"], "byte_length": row["size"], "sha256": row["sha256"],
                             "sha256_state": row["sha256_status"], "evidence": ["s3-input-lock/baseline-files.json"]})
    # Complete metadata trees give modes and lengths without thousands of blob fetches.
    for tree in load_json(workspace / "s3-input-lock/overlay-tree-captures.json"):
        response = tree["response"]
        require(response.get("truncated") is False, "Incomplete captured overlay subtree")
        for entry in response["tree"]:
            if entry["type"] != "blob":
                continue
            add_catalog(catalog, {"commit": tree["commit"], "path": tree["path"] + "/" + entry["path"],
                                 "mode": entry["mode"], "git_blob_sha": entry["sha"], "byte_length": entry["size"],
                                 "sha256": None, "sha256_state": "GIT_TREE_IDENTITY_ONLY", "evidence": [tree["url"]]})
    raw_output = output / "verified-capture-blobs"
    for name in ("fetched-content.json", "support-content.json"):
        capture = load_json(workspace / "s3-provenance" / name)
        for record in capture["files"]:
            match = re.search(r"/blob/([0-9a-f]{40})/(.+)$", record.get("display_url", ""))
            require(match is not None and match[1] == capture["ref"], "Captured file lacks its expected immutable URL")
            capture_content(catalog, match[1], match[2], record, "s3-provenance/" + name, raw_output)
    for record in load_json(workspace / "s3-provenance/l1-support.json"):
        url = record["display_url"]
        match = re.search(r"/blob/([0-9a-f]{40})/(.+)$", url)
        require(match is not None, "L1 support capture lacks immutable URL")
        capture_content(catalog, match[1], match[2], record, url, raw_output)
    for record in load_json(Path(__file__).resolve().parent / "old-strict-captures.json"):
        require("error" not in record, "Unresolved connector receipt capture")
        capture_content(catalog, record["commit"], record["path"], record["result"], "old-strict-captures.json", raw_output)
    # Read bytes only; never decode/interpret reserved oracle material.
    for record in load_json(workspace / "s3-runtime/capture-manifest.json"):
        match = re.search(r"/blob/([0-9a-f]{40})/(.+)$", record["url"])
        if not match:
            continue
        local = workspace / "s3-runtime" / record["file"]
        if not local.is_file():
            continue
        identity = measure(read_bytes(local))
        require(identity["sha256"] == record["sha256"] and identity["git_blob_sha"] == record["git_blob"] and identity["byte_length"] == record["bytes"], "Local captured reference drift: " + record["file"])
        add_catalog(catalog, {"commit": match[1], "path": match[2], "mode": None, **identity,
                             "local_path": str(local), "sha256_state": "LOCAL_BYTES_AND_GIT_BLOB_VERIFIED", "evidence": [record["url"]]})
    # Declared hashes are never treated as measured observations. They must match
    # any local capture and the corresponding immutable Git identity metadata.
    references = load_json(workspace / "s3-input-lock/reference-demands.json")["references"]
    for group in references:
        for use in group["uses"]:
            key = (use["commit"], group["path"])
            if key not in catalog:
                continue
            row = catalog[key]
            if use.get("git_blob_sha"):
                require(row["git_blob_sha"] == use["git_blob_sha"], "Original reference Git blob conflict: " + group["path"])
            if use.get("sha256"):
                require(row.get("sha256") in (None, use["sha256"]), "Original reference SHA256 conflict: " + group["path"])
                if not row.get("sha256"):
                    row["sha256"] = use["sha256"]
                    row["sha256_state"] = "PINNED_REFERENCE_SHA256"
    return catalog, baseline_rows


def native_references(package):
    yield "protocol_ref", package["protocol_ref"]
    yield "contract.oracle_ref", package["contract"]["oracle_ref"]
    for artifact in package["artifacts"]:
        for field in ("recipe_ref", "producer_request_ref", "producer_response_ref"):
            yield artifact["key"] + "." + field, artifact[field]
        for field in ("semantic_review_refs", "runtime_receipt_refs", "source_refs"):
            for index, reference in enumerate(artifact[field]):
                yield f"{artifact['key']}.{field}[{index}]", reference


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=WORKSPACE)
    parser.add_argument("--payload-dir", type=Path, default=Path(__file__).resolve().parent / "payload")
    parser.add_argument("--payload-files", type=Path, default=Path(__file__).resolve().parent / "payload-files.json")
    parser.add_argument("--payload-commit", help="Actual immutable commit returned to root after committing this payload")
    parser.add_argument("--payload-readback", type=Path, default=Path(__file__).resolve().parent / "readback-selected.json")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "input-lock.json")
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    output = args.output.resolve().parent
    require(output == workspace / "s3-selected-finalization/v4" or output.is_relative_to(workspace / "s3-selected-finalization/v4"), "This copy may write only under s3-selected-finalization/v4")
    if args.payload_commit:
        require(HASH40.fullmatch(args.payload_commit) is not None, "Payload commit must be a real immutable SHA supplied by root")
        require(args.payload_commit not in (ORIGINAL, SOURCE, "4b39581e817fa9374c6dc34e768bed1b3feac35f", "caae29c9ae560d49859b67c52c81e66c2a3b078e"), "Historical or v3 commit cannot represent the new v4 selected payload")
    payload_manifest = load_json(args.payload_files)
    require(payload_manifest["package_path"] == PACKAGE_PATH, "Canonical transport package path required")
    payload_pins = {row["path"]: row for row in payload_manifest["files"]}
    require(len(payload_pins) == len(payload_manifest["files"]), "Duplicate local payload path")
    for path, row in payload_pins.items():
        actual = measure(read_bytes(args.payload_dir / safe_relative(path)))
        require(all(row[k] == actual[k] for k in ("sha256", "git_blob_sha", "byte_length")), "Local staged payload drift: " + path)
    package_raw = read_bytes(args.payload_dir / PACKAGE_PATH)
    package = json.loads(package_raw)
    require(package["source_revision"] == SOURCE and len(package["artifacts"]) == 11 and package["package_state"] == "SELECTED_WITH_SEMANTIC_ACCEPTANCE", "Expected final selected eleven-artifact package")
    package_identity = measure(package_raw)
    require(package_identity["sha256"] == payload_manifest["package_sha256"], "Package/manifest digest mismatch")
    readback_identity = None
    if args.payload_commit:
        readback = load_json(args.payload_readback)
        require(readback.get("head") == args.payload_commit and readback.get("package_sha256") == package_identity["sha256"]
                and readback.get("exact_readback_complete") is True, "Actual root payload readback receipt missing or inconsistent")
        rows = {row["path"]: row for row in readback["readback"]}
        require(len(rows) == len(readback["readback"]) and set(rows) == set(payload_pins), "Root readback must cover the entire staged payload exactly")
        for path, expected in payload_pins.items():
            require(rows[path].get("exact_utf8_equal") is True and rows[path].get("git_blob_sha") == expected["git_blob_sha"], "Payload readback does not confirm exact local bytes: " + path)
        readback_identity = {"path": str(args.payload_readback.resolve()), **measure(read_bytes(args.payload_readback)),
                             "head": readback["head"], "tree": readback["tree"], "verified_file_count": len(rows)}
    catalog, baseline = load_catalog(workspace, output)
    demands = {}
    file_inputs, members, strict_paths = set(), set(), set()
    conflicts = []

    def demand(path, role, sha256=None, commit=None, blob=None, strict=False):
        safe_relative(path)
        if sha256 is not None:
            require(HASH64.fullmatch(sha256) is not None, "Non-digest declared SHA256: " + path)
        row = demands.setdefault(path, {"path": path, "roles": [], "sha256_values": set(), "commits": set(), "git_blob_values": set()})
        row["roles"].append(role)
        if sha256 is not None:
            row["sha256_values"].add(sha256)
        if commit is not None:
            row["commits"].add(commit)
        if blob is not None:
            row["git_blob_values"].add(blob)
        if strict:
            strict_paths.add(path)

    # PAYLOAD is an internal unresolved selector, never emitted as a final commit.
    demand(PACKAGE_PATH, "package", package_identity["sha256"], "PAYLOAD", package_identity["git_blob_sha"], True)
    for artifact in package["artifacts"]:
        body = artifact["body"]
        path = str(PurePosixPath(PACKAGE_PATH).parent / safe_relative(body["path"]))
        demand(path, artifact["key"] + ".body", body["sha256"], "PAYLOAD", strict=True)
        require(payload_pins[path]["byte_length"] == body["byte_length"], "Selected body length differs: " + path)
        for input_key in artifact["input_keys"]:
            if input_key.startswith("file:"):
                path = input_key[5:]
                file_inputs.add(path)
                demand(path, artifact["key"] + ".input_key")
            elif input_key.startswith("members:"):
                safe_relative(input_key[8:])
                members.add(input_key[8:])
            else:
                raise ValueError("Unknown input key: " + input_key)
    for label, reference in native_references(package):
        require(isinstance(reference, dict), "Missing strict reference: " + label)
        path = reference.get("payload_path", reference.get("path"))
        require(path is not None and reference.get("sha256") is not None, "Incomplete strict reference: " + label)
        if "commit" in reference:
            commit = reference["commit"]
            require(HASH40.fullmatch(commit) is not None, "Invalid strict reference commit")
        elif path.startswith(RESUME):
            require(path in payload_pins, "New payload reference missing local bytes: " + path)
            commit = "PAYLOAD"
        else:
            matches = {commit for (commit, candidate_path), row in catalog.items()
                       if candidate_path == path and row.get("sha256") == reference["sha256"]}
            # Preserved original payload refs resolve to their captured 19b909e
            # origin; they are not silently assigned SOURCE or today's branch.
            require(ORIGINAL in matches or len(matches) == 1, "Cannot resolve immutable original payload reference: " + path)
            commit = ORIGINAL if ORIGINAL in matches else next(iter(matches))
        demand(path, label, reference["sha256"], commit, reference.get("git_blob_sha"), True)

    pins, matrix, unresolved = [], [], []
    for path in sorted(demands):
        row = demands[path]
        for field in ("sha256_values", "commits", "git_blob_values"):
            if len(row[field]) > 1:
                conflicts.append({"path": path, "field": field, "values": sorted(row[field])})
        sha = next(iter(row["sha256_values"]), None)
        blob = next(iter(row["git_blob_values"]), None)
        selected_commit = next(iter(row["commits"]), None)
        if selected_commit is None:
            if path in payload_pins:
                selected_commit = "PAYLOAD"
            elif path in baseline:
                selected_commit = baseline[path]["effective_commit"]
        if selected_commit == "PAYLOAD":
            captured = payload_pins.get(path)
            if captured is None:
                unresolved.append({"path": path, "reason": "No staged payload bytes"})
                continue
            pin = {"commit": args.payload_commit, "path": path, "git_blob_sha": captured["git_blob_sha"],
                   "byte_length": captured["byte_length"], "sha256": captured["sha256"], "mode": captured["mode"],
                   "sha256_state": "PAYLOAD_BYTES_READ_BACK_FROM_GITHUB" if readback_identity else "LOCAL_PAYLOAD_BYTES_HASHED_REMOTE_READBACK_REQUIRED"}
            evidence = ["payload-files.json", captured["local_path"]]
        else:
            captured = catalog.get((selected_commit, path))
            if captured is None:
                unresolved.append({"path": path, "commit": selected_commit, "reason": "No immutable local/repository capture"})
                continue
            pin = {field: captured.get(field) for field in ("commit", "path", "git_blob_sha", "byte_length", "sha256", "mode", "sha256_state")}
            evidence = captured.get("evidence", [])
        if sha is not None:
            if pin["sha256"] not in (None, sha):
                conflicts.append({"path": path, "field": "selected_sha256", "values": [pin["sha256"], sha]})
            pin["sha256"] = sha
        if blob is not None and pin["git_blob_sha"] != blob:
            conflicts.append({"path": path, "field": "selected_git_blob_sha", "values": [pin["git_blob_sha"], blob]})
        # A blob capture without an API mode is permitted only when the same path
        # has an immutable regular-file tree record or is a known fetched file.
        if pin.get("mode") is not None and pin["mode"] not in ("100644", "100755"):
            unresolved.append({"path": path, "reason": "Nonregular/symlink mode", "mode": pin["mode"]})
        if pin["byte_length"] > 2097152:
            unresolved.append({"path": path, "reason": "Exceeds S4 2MiB file limit", "bytes": pin["byte_length"]})
        if pin["sha256"] is None:
            original = baseline.get(path)
            eligible = (path in file_inputs and path not in strict_paths and selected_commit == SOURCE and original is not None
                        and original["sha256_null_permitted"] is True and original["captured_reference_count"] == 0
                        and original["sha256"] is None)
            if not eligible:
                unresolved.append({"path": path, "reason": "Missing mandatory prior SHA256; baseline-only exception does not apply"})
            else:
                pin["sha256_state"] = "TO_BE_MEASURED_FROM_PINNED_GIT_BLOB"
        else:
            require(HASH64.fullmatch(pin["sha256"]) is not None, "Invalid resolved SHA256: " + path)
        if pin.get("mode") is None:
            pin.pop("mode", None)
        pins.append(pin)
        matrix.append({"path": path, "strict_reference": path in strict_paths, "file_input": path in file_inputs,
                       "effective_commit": args.payload_commit if selected_commit == "PAYLOAD" else selected_commit,
                       "commit_state": "AWAITING_ACTUAL_PAYLOAD_COMMIT" if selected_commit == "PAYLOAD" and not args.payload_commit else "PINNED",
                       "sha256": pin["sha256"], "git_blob_sha": pin["git_blob_sha"], "byte_length": pin["byte_length"],
                       "roles": sorted(set(row["roles"])), "capture_evidence": evidence})

    require(set(demands) == {PACKAGE_PATH, *file_inputs, *strict_paths}, "Internal exact required-set mismatch")
    require(set(baseline).issubset(file_inputs), "A preserved baseline file input was removed")
    membership_document = load_json(workspace / "s3-input-lock/membership_materializations.json")
    materializations = []
    for source_tree in membership_document["membership_materializations"]:
        require(source_tree["prefix"] in members and source_tree["commit"] == PROTOCOL and source_tree["complete_tree"] is True
                and source_tree["tree_truncated"] is False and source_tree["file_count"] == 21, "Unexpected membership overlay")
        tree = {k: source_tree[k] for k in ("input_key", "prefix", "commit", "git_tree_sha", "complete_tree", "tree_truncated", "file_count")}
        tree["files"] = []
        for file in source_tree["files"]:
            identity = measure(read_bytes(file["local_blob_path"]))
            require(identity["sha256"] == file["sha256"] and identity["git_blob_sha"] == file["git_blob_sha"] and identity["byte_length"] == file["size"], "Protocol membership blob drift")
            tree["files"].append({"commit": file["commit"], "path": file["path"], "mode": file["mode"], **identity})
        require(len(tree["files"]) == len({file["path"] for file in tree["files"]}) == tree["file_count"], "Membership file population mismatch")
        materializations.append(tree)
    require(len(materializations) == 1 and materializations[0]["git_tree_sha"] == "fc9bfd981f526d75e7e185e2e5b9a31d5c5d396f", "Missing complete protocol membership tree")
    member_inventory = load_json(workspace / "s3-input-lock/members.json")["members"]
    require(members == {row["prefix"] for row in member_inventory} and len(members) == 45, "Final package altered membership roots")
    memberships_only = {row["path"] for tree in materializations for row in tree["files"]} - set(demands)
    require(len(memberships_only) == 16, "Protocol tree must have five declared files and sixteen membership-only descendants")
    input_keys = sorted({key for artifact in package["artifacts"] for key in artifact["input_keys"]})
    report = {"schema": "s3-selected-input-lock-preflight/v1", "status": "BLOCKED" if unresolved or conflicts else "IDENTITIES_READY",
              "package_path": PACKAGE_PATH, **{"package_" + k: v for k, v in package_identity.items()},
              "payload_commit": args.payload_commit, "payload_commit_state": "ROOT_COMMIT_WITH_EXACT_READBACK" if readback_identity else "NOT_YET_SUPPLIED",
              "payload_readback": readback_identity,
              "file_input_count": len(file_inputs), "members_count": len(members), "input_key_count": len(input_keys),
              "strict_path_count": len(strict_paths), "exact_required_path_count": len(demands), "resolved_path_count": len(pins),
              "known_sha256_count": sum(row["sha256"] is not None for row in pins),
              "baseline_only_sha256_to_measure_count": sum(row["sha256"] is None for row in pins),
              "membership_materialization_file_count": sum(tree["file_count"] for tree in materializations),
              "membership_only_file_count": len(memberships_only), "unresolved": unresolved, "conflicts": conflicts,
              "runtime_status": "NOT_RUN", "remote_status": "NOT_WRITTEN"}
    write_json(output / "input-lock.preflight.json", report)
    write_json(output / "selected-reference-matrix.json", {"schema": "s3-selected-reference-matrix/v1", "entries": matrix, "conflicts": conflicts, "unresolved": unresolved})
    if unresolved or conflicts:
        print(json.dumps(report, ensure_ascii=False))
        return 2
    require(len(pins) == len(demands) and len({row["path"] for row in pins}) == len(pins), "Lock exact path population mismatch")
    if not args.payload_commit:
        print(json.dumps(report, ensure_ascii=False))
        return 0
    require(all(HASH40.fullmatch(row["commit"]) is not None for row in pins), "Final lock cannot contain an unresolved commit")
    lock = {"schema": "genesis-s3-input-lock/v1", "source_revision": SOURCE, "package_commit": args.payload_commit,
            "package_path": PACKAGE_PATH, "package_sha256": package_identity["sha256"], "files": pins,
            "membership_materializations": materializations,
            "capture_status": "PINNED_IDENTITIES_WITH_VERIFIED_PAYLOAD_READBACK",
            "payload_readback_status": "EXACT_BYTES_AND_GIT_BLOBS_CONFIRMED_BY_ROOT_GITHUB_READBACK",
            "payload_readback_receipt": readback_identity,
            "baseline_sha256_policy": "Only baseline-only file inputs have null SHA256; full bytes must be verified and measured before prepare in input-lock.observed.json",
            "runtime_status": "NOT_RUN"}
    write_json(args.output, lock)
    print(json.dumps({**report, "lock_file": str(args.output), "lock_sha256": measure(read_bytes(args.output))["sha256"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError) as error:
        print(json.dumps({"status": "REFUSED", "reason": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2)
