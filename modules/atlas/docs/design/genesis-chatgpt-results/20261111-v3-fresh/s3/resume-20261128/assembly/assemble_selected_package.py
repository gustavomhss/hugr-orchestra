#!/usr/bin/env python3
"""Assemble a proposed S3 transport from preserved bytes and real root-supplied receipts.

This is file processing, not an Atlas runtime, semantic judge, or product test.
Without --final it intentionally emits blocked proposals. --final requires real
adoption and two-judge bindings for every selected upper-layer body.
"""
import argparse
import copy
import hashlib
import json
import re
from pathlib import Path

REPO_BASE = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/"
SOURCE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
ORIGINAL_REF = "19b909ef3bf27e0332f24fc30e3a5c471ea37d78"
ORIGINAL_BLOB = "ec9009fc8c3ac15da93aff074fcdd999918011f3"
JUDGES = {"/root/s3_j1", "/root/s3_j2"}
DEPENDENCIES = {
    "s3-l2-maestro": ["s3-l1-maestro", "s3-l1-integrations"],
    "s3-l2-relay": ["s3-l1-relay"],
    "s3-l2-integrations": ["s3-l1-maestro", "s3-l1-integrations"],
    "s3-l3-flows": ["s3-l2-maestro", "s3-l2-relay", "s3-l2-integrations"],
    "s3-l4-entry": ["s3-l3-flows", "s3-l1-maestro"],
    "s3-l4-ownership": ["s3-l3-flows", "s3-l1-maestro", "s3-l1-integrations"],
    "s3-l4-maintenance": ["s3-l3-flows", "s3-l1-maestro", "s3-l1-relay", "s3-l1-integrations"],
    "s3-l4-operational": ["s3-l3-flows", "s3-l1-maestro", "s3-l1-relay", "s3-l1-integrations"],
}
DEPENDENCY_REASONS = {
    "s3-l2-maestro": "Body opening names L1 Maestro and L1 integrations; skills/adapters are substantive inputs.",
    "s3-l2-relay": "Body opening names L1 Relay; other-component pointers remain navigation.",
    "s3-l2-integrations": "Body opening names L1 integrations and L1 Maestro for seat relationships.",
    "s3-l3-flows": "Four integrated flows synthesize all three L2 bodies.",
    "s3-l4-entry": "L3 cumulative predecessor; label resolution details also consume L1 Maestro. Other deep links are navigation.",
    "s3-l4-ownership": "L3 cumulative predecessor plus L1 Maestro/integrations details on labels, Atlas Memory and assets.",
    "s3-l4-maintenance": "L3 cumulative predecessor plus detailed label, Relay, assets and Atlas Memory maintenance from L1.",
    "s3-l4-operational": "L3 cumulative predecessor plus L1 details on Relay audit, Atlas Memory, assets and host boundaries.",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def read_bytes(path):
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
        raise ValueError(f"Symlink refused: {path}")
    return path.read_bytes()


def ref_path(ref):
    return ref.get("payload_path", ref.get("path"))


def check_ref(ref, mapping):
    if not isinstance(ref, dict):
        return False
    expected = {"payload_path", "sha256"} if "payload_path" in ref else {"commit", "path", "sha256"}
    if set(ref) != expected or not isinstance(ref.get("sha256"), str) or not re.fullmatch("[0-9a-f]{64}", ref["sha256"]):
        raise ValueError("Invalid reference shape")
    if "commit" in ref and not re.fullmatch("[0-9a-f]{40}", str(ref["commit"])):
        raise ValueError("Invalid reference commit")
    path = ref_path(ref)
    if not isinstance(path, str) or path.startswith("/") or any(part in {"", ".", "..", ".git", ".atlas"} for part in path.split("/")):
        raise ValueError("Invalid repository reference path")
    local = mapping.get(path)
    if local is None:
        return False
    if digest(read_bytes(Path(local))) != ref["sha256"]:
        raise ValueError(f"Reference digest mismatch: {path}")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=Path("/workspace/scratch/0666cc914bd1/s3-provenance/files"))
    parser.add_argument("--capture-dir", type=Path, default=Path(__file__).parent / "captures")
    parser.add_argument("--bindings", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--final", action="store_true")
    args = parser.parse_args()
    original_bytes = read_bytes(args.source_dir / "native-package.json")
    git_blob = hashlib.sha1(b"blob " + str(len(original_bytes)).encode() + b"\0" + original_bytes).hexdigest()
    if git_blob != ORIGINAL_BLOB:
        raise ValueError("Original three-L1 transport changed; use its exact preserved bytes")
    original = json.loads(original_bytes)
    if original["source_revision"] != SOURCE or len(original["artifacts"]) != 3:
        raise ValueError("Unexpected original package")
    bindings = json.loads(read_bytes(args.bindings)) if args.bindings else {"artifacts": {}, "reference_files": {}}
    if set(bindings.get("artifacts", {})) - set(DEPENDENCIES):
        raise ValueError("Bindings may modify only the eight selected upper artifacts")
    required = json.loads(read_bytes(args.capture_dir / "evidence/required-artifacts.json"))["required_artifacts"]
    history = json.loads(read_bytes(args.capture_dir / "evidence/recovery-candidate-state.json"))
    historical = {item["key"]: item for item in history["artifacts"]}
    collision_ref = {
        "commit": ORIGINAL_REF,
        "path": REPO_BASE + "evidence/concurrent-branch-reconciliation.json",
        "sha256": digest(read_bytes(args.source_dir / "evidence/concurrent-branch-reconciliation.json")),
    }
    pack = copy.deepcopy(original)
    by_key = {item["key"]: item for item in pack["artifacts"]}
    bodies = {}
    selected = []
    blockers = []
    for artifact in original["artifacts"]:
        data = read_bytes(args.source_dir / artifact["body"]["path"])
        if digest(data) != artifact["body"]["sha256"] or len(data) != artifact["body"]["byte_length"]:
            raise ValueError(f"Original L1 body drift: {artifact['key']}")
        bodies[artifact["body"]["path"]] = data
    for specification in required[3:]:
        key = specification["key"]
        supplied = bindings.get("artifacts", {}).get(key, {})
        previous = historical[key]
        body_path = previous["path"]
        override = supplied.get("body")
        data = read_bytes(Path(override["local_path"])) if override else read_bytes(args.source_dir / body_path)
        expected_sha = override["sha256"] if override else previous["sha256"]
        expected_bytes = override["byte_length"] if override else previous["byte_length"]
        if digest(data) != expected_sha or len(data) != expected_bytes:
            raise ValueError(f"Selected body identity mismatch: {key}")
        text_body = data.decode("utf-8")
        bodies[body_path] = data
        refs = {}
        for dependency in DEPENDENCIES[key]:
            for ref in by_key[dependency]["source_refs"]:
                if ref["path"] in refs and refs[ref["path"]] != ref:
                    raise ValueError(f"Conflicting source captures: {ref['path']}")
                refs[ref["path"]] = copy.deepcopy(ref)
        # These are inherited source-capture associations, not a claim that the
        # adoption producer read every original file. Its real request defines reuse.
        source_refs = supplied.get("source_refs", [refs[path] for path in sorted(refs)])
        if not source_refs or len({ref["path"] for ref in source_refs}) != len(source_refs):
            raise ValueError(f"Missing or duplicate source captures: {key}")
        recipe = supplied.get("recipe_ref")
        request = supplied.get("producer_request_ref")
        response = supplied.get("producer_response_ref")
        reviews = supplied.get("semantic_review_refs", [])
        acceptance = supplied.get("semantic_acceptance")
        artifact_blockers = []
        for field, value in [("recipe_ref", recipe), ("producer_request_ref", request), ("producer_response_ref", response)]:
            if not check_ref(value, bindings.get("reference_files", {})):
                artifact_blockers.append(f"{field}: original new-adoption bytes not supplied and verified")
        if len(reviews) != 2 or len({json.dumps(value, sort_keys=True) for value in reviews}) != 2:
            artifact_blockers.append("Two distinct new semantic review references required")
        elif not all(check_ref(value, bindings.get("reference_files", {})) for value in reviews):
            artifact_blockers.append("New semantic review reference bytes not supplied and verified")
        accepted = isinstance(acceptance, dict) and acceptance.get("body_sha256") == expected_sha and len(acceptance.get("reviewer_ids", [])) == 2 and set(acceptance.get("reviewer_ids", [])) == JUDGES and acceptance.get("mandatory_findings_open") == 0 and acceptance.get("verified_by") == "/root" and acceptance.get("decision") == "ACCEPTED"
        if not accepted or not check_ref(acceptance.get("release_ref") if accepted else None, bindings.get("reference_files", {})):
            artifact_blockers.append("Exact-body local semantic release not verified by root with a preserved release receipt")
            accepted = False
        if any(by_key[dependency]["validity"] != "supported" for dependency in DEPENDENCIES[key]):
            artifact_blockers.append("A build predecessor has not yet been released")
        accepted = accepted and not artifact_blockers
        title = next((line[2:] for line in text_body.splitlines() if line.startswith("# ")), key)
        input_keys = {"file:" + ref["path"] for ref in source_refs}
        if recipe:
            input_keys.add("file:" + ref_path(recipe))
        additional = supplied.get("input_keys", [])
        input_keys.update(additional)
        navigation = [item["key"] for item in required if item["key"] != key and item["key"] not in DEPENDENCIES[key]] if specification["layer"] == 4 else []
        origin = {
            "original_execution": "bdac971f-e4ee-40e5-ad9b-30d659303bab",
            "selected_lineage": "concurrent-recovery-e51ef44b",
            "historical_body_sha256": previous["sha256"],
            "selected_body_sha256": expected_sha,
            "historical_raw_producer_prompt_response": "NOT_RECOVERED",
            "new_adoption_receipts": "SUPPLIED" if recipe and request and response else "NOT_SUPPLIED",
        }
        artifact = {
            "key": key, "scope": original["scope"], "title": title,
            "layer": specification["layer"], "need": specification["need"],
            "body": {"path": body_path, "encoding": "utf-8", "byte_length": len(data), "sha256": expected_sha},
            "authority": {"scope": original["scope"], "basis": "Alternative body from concurrent recovery e51ef44b, selected by exact bytes. Original raw historical producer request/response were not recovered. New adoption/rematerialization, when supplied, is a distinct execution; it does not recover the original bdac971f package or inherit its upper-layer acceptances. Static source scope remains the pinned baseline. Runtime binding/publication and current installed behavior require separate evidence."},
            "validity": "supported" if accepted else "blocked",
            "gaps": ["Historical upper-layer prompt/response and original-package identity remain unavailable.", "No runtime binding, publication, index/read, consumer or maintenance result is claimed by this assembly."] + artifact_blockers,
            "evidence": [json.dumps(collision_ref, ensure_ascii=False, sort_keys=True, separators=(",", ":")), json.dumps(origin, ensure_ascii=False, sort_keys=True, separators=(",", ":"))],
            "input_keys": sorted(input_keys), "source_refs": source_refs,
            "recipe_ref": recipe,
            "build_dependencies": [{"key": dependency, "same_package": True} for dependency in DEPENDENCIES[key]],
            "navigation": navigation,
            "producer_request_ref": request, "producer_response_ref": response,
            "semantic_review_refs": reviews, "runtime_receipt_refs": [],
        }
        pack["artifacts"].append(artifact)
        by_key[key] = artifact
        selected.append({"key": key, "historical_body_sha256": previous["sha256"], "selected_body_sha256": expected_sha, "byte_length": len(data), "dependency_reason": DEPENDENCY_REASONS[key], "blockers": artifact_blockers})
        blockers.extend({"artifact": key, "reason": reason} for reason in artifact_blockers)
    pack["required_artifact_keys"] = [item["key"] for item in required]
    pack["missing_required_artifact_keys"] = []
    pack["package_state"] = "SELECTED_WITH_SEMANTIC_ACCEPTANCE" if not blockers else "IN_PROGRESS"
    pack["roots"] = {need: [item["key"] for item in required if item["need"] == need] for need in dict.fromkeys(item["need"] for item in required)}
    pack["known_limits"] = [
        "This is a new selected package. It is not the reported original 0f944421 package or candidate a32c0f65.",
        "Three L1 bodies and historical semantic references are preserved. Upper artifacts retain their recovery origin; new adoption records never masquerade as recovered historical prompts.",
        "Explicit same-package build edges carry predecessor invalidation. Other upper-layer deep links are navigation only. Inherited source_refs preserve existing captures and do not assert new exhaustive source reading.",
        "Source materialization, complete membership observation, S4 runtime qualification, prepare, separate binding, governed publication, index/read, C1-C7 and M0-M3 remain separate obligations.",
        "Original three-L1 transport is preserved byte-for-byte at evidence/lineage/native-package.L1-19b909e.json; transformation details are in transport-transformation.json.",
    ]
    faithful = copy.deepcopy(pack)
    removed = pack["contract"].pop("unit_oracle_refs", [])
    for artifact in pack["artifacts"]:
        artifact["evidence"] = [value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) for value in artifact["evidence"]]
    pack["roots"] = {need: keys[0] for need, keys in faithful["roots"].items()}
    # Lossless transport checks do not execute the runtime or read any oracle.
    for before, after in zip(original["artifacts"], pack["artifacts"][:3]):
        restored = copy.deepcopy(after)
        restored["evidence"] = [json.loads(value) if not isinstance(before["evidence"][index], str) else value for index, value in enumerate(after["evidence"])]
        if restored != before:
            raise ValueError(f"Non-lossless L1 transport adaptation: {before['key']}")
    output_bytes = json_bytes(pack)
    sidecar = {
        "schema": "s3-selected-transport-transformation/v1",
        "operation": "Mechanical assembly and explicit lossless transport adaptation; no runtime execution or semantic judgment",
        "original_package": {"commit": ORIGINAL_REF, "path": REPO_BASE + "native-package.json", "git_blob_sha": ORIGINAL_BLOB, "sha256": digest(original_bytes)},
        "output_sha256": digest(output_bytes),
        "L1_body_and_semantic_refs_unchanged": True,
        "L1_metadata_change": "Only evidence reference objects become canonical JSON strings. Parsing those strings restores the original evidence list; all other L1 artifact fields are identical.",
        "contract_fields_preserved_here": {"unit_oracle_refs": removed},
        "original_roots": original["roots"],
        "proposal_roots": faithful["roots"],
        "runtime_roots": pack["roots"],
        "root_rule": "One key per need as required by db9b423 parser. Entry navigation and cumulative build dependencies keep all 11 required keys reachable without editing any L1 navigation.",
        "selected": selected,
        "unresolved_blockers": blockers,
        "runtime_status": "NOT_RUN",
    }
    if args.final and blockers:
        raise ValueError(f"Final assembly refused: {len(blockers)} unresolved receipt/acceptance/predecessor blockers")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, data in bodies.items():
        path = args.output_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    archive = args.output_dir / "evidence/lineage/native-package.L1-19b909e.json"
    archive.parent.mkdir(parents=True, exist_ok=True)
    archive.write_bytes(original_bytes)
    (args.output_dir / "native-package.faithful-proposal.json").write_bytes(json_bytes(faithful))
    final_name = "native-package.json" if args.final else "native-package.runtime-proposal.json"
    (args.output_dir / final_name).write_bytes(output_bytes)
    (args.output_dir / "transport-transformation.json").write_bytes(json_bytes(sidecar))
    (args.output_dir / "assembly-report.json").write_bytes(json_bytes({
        "status": "ASSEMBLED_FROM_ROOT_VERIFIED_BINDINGS" if args.final else "BLOCKED_PROPOSAL",
        "artifact_count": len(pack["artifacts"]), "unaccepted_upper_keys": [item["key"] for item in selected if item["blockers"]],
        "package_sha256": digest(output_bytes), "package_byte_length": len(output_bytes),
        "original_L1_package_sha256": digest(original_bytes), "runtime_not_executed": True,
        "original_historical_prompt_response_status": "NOT_RECOVERED",
        "remaining_materialization": "Original L1 payload refs, all source files/membership scopes, protocol and reserved oracle must be materialized separately with their fixed hashes. This assembler does not read the oracle or execute source code.",
        "blockers": blockers,
    }))
    print(json.dumps({"status": "ASSEMBLED" if args.final else "BLOCKED_PROPOSAL", "artifacts": 11, "blockers": len(blockers), "package_file": str(args.output_dir / final_name), "package_sha256": digest(output_bytes)}))


if __name__ == "__main__":
    main()
