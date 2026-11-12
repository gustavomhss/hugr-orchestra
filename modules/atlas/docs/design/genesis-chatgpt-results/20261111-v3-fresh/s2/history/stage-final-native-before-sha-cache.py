#!/usr/bin/env python3
"""Freeze final S2 files for a later, separately authorized native prepare.

Default: read-only final plan. --inspect-current inventories an incomplete package.
--apply stages only a complete accepted full13 package with finalized entry roots.
This program never invokes Bun, prepare, tests, publication, Git, or a network tool.
"""
import argparse
from collections import deque
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile

from integrate_native_layer import IntegrationError, PREFIX, Reads, blob, canonical_sources, digest, encoded, native_path, require, sha


UNITS = ("desktop-web", "app-session", "design-tui")
REQUIRED = {f"s2.l{n}.{u}" for n in (1, 2, 3, 4) for u in UNITS} | {"s2.l4.entry"}
PAYLOAD_DIRS = {"accepted", "layers", "requests", "judgments", "inputs", "oracles", "evidence", "corrections", "verification", "archives", "history"}
CAPTURE_FIELDS = ("local_capture_file", "capture_path", "canonical_capture")
CONNECTOR_FIELDS = ("connector_response_file", "original_connector_response_file", "connector_response_path")


def final_conditions(pack):
    errors = []
    artifacts = {a["key"]: a for a in pack["artifacts"]}
    if len(artifacts) != len(pack["artifacts"]) or set(artifacts) != REQUIRED or set(pack["required_artifact_keys"]) != REQUIRED:
        errors.append("Exactly the actual 13 assigned artifacts are required; no missing or duplicate keys.")
    if pack["missing_required_artifact_keys"]:
        errors.append("missing_required_artifact_keys is not empty.")
    if pack["roots"] != {"entry": "s2.l4.entry"}:
        errors.append('Principal must finalize exactly roots={"entry":"s2.l4.entry"}; this utility never edits roots.')
    entry = artifacts.get("s2.l4.entry")
    if entry is None or entry["need"] != "entry" or entry["layer"] != 4:
        errors.append("The actual s2.l4.entry artifact must have need=entry and layer=4.")
    preceding = set()
    for artifact in pack["artifacts"]:
        if artifact["validity"] != "supported" or len(artifact["semantic_review_refs"]) < 2:
            errors.append(f"{artifact['key']} is not supported with at least two actual semantic decision references.")
        for dependency in artifact["build_dependencies"]:
            if set(dependency) != {"key", "same_package"} or dependency.get("same_package") is not True or dependency["key"] not in preceding:
                errors.append(f"Invalid, external, cyclic or unordered build dependency on {artifact['key']}: {dependency}")
        if any(key not in artifacts for key in artifact["navigation"]):
            errors.append(f"Missing navigation destination on {artifact['key']}.")
        preceding.add(artifact["key"])
    reached, queue = set(), list(pack["roots"].values())
    while queue:
        key = queue.pop()
        if key in reached or key not in artifacts:
            continue
        reached.add(key)
        queue.extend(artifacts[key]["navigation"])
        queue.extend(d["key"] for d in artifacts[key]["build_dependencies"])
    if not REQUIRED <= reached:
        errors.append("Required keys not reachable through actual navigation/build links: " + ", ".join(sorted(REQUIRED - reached)))
    return errors, sorted(reached)


class Closure:
    def __init__(self, reads, source_root, pack, origin_map):
        self.reads, self.root, self.source_root, self.pack = reads, reads.root, source_root, pack
        self.canonical, self.canonical_manifests = canonical_sources(reads, pack["source_revision"])
        self.origin_map = origin_map
        self.nodes, self.origins, self.queue, self.walked = {}, [], deque(), set()
        self.errors, self.external_captures, self.metadata_only = [], [], []

    def error(self, label, error):
        self.errors.append({"reference": label, "code": getattr(error, "code", "MISSING_OR_INVALID_REFERENCE"), "message": str(error)})

    def local(self, name, expected=None, context=None):
        """Resolve workspace provenance without following arbitrary external paths."""
        original = name
        if name in self.origin_map:
            name = self.origin_map[name]
        if name.startswith("/"):
            marker = "/genesis-s2/"
            require(marker in name, "EXTERNAL_REFERENCE_MAP_REQUIRED", original)
            name = name.split(marker, 1)[1]
        name = native_path(name)
        choices = [name]
        if name.startswith("deliverable/"):
            choices.append(name)
        elif name.split("/", 1)[0] in PAYLOAD_DIRS:
            choices.insert(0, "deliverable/" + name)
        if context:
            choices.append((Path(context).parent / name).as_posix())
            match = re.search(r"(?:^|/)(desktop-web|app-session|design-tui)(?:/|$)", context)
            if match and (name.startswith(("sources/", "captures/", "blob-captures/")) or name == "capture-attempts.json"):
                choices.insert(0, "producers/" + match[1] + "/" + name)
        for relative in dict.fromkeys(choices):
            path = self.reads.path(relative)
            if not path.is_file():
                continue
            data = self.reads.read(relative)
            if expected is None or sha(data) == expected:
                return relative, data
        # Historical provenance may name a mutable working location. Preserve exact
        # historical bytes from an existing same-name snapshot, never rewrite the ref.
        if expected:
            basename = Path(name).name
            search_roots = [self.root / p for p in ("deliverable", "producers", "later-producers", "corrections", "protocol", "runtime-work/supplement-r2/inputs")]
            for folder in search_roots:
                if not folder.is_dir():
                    continue
                for path in sorted(folder.rglob(basename)):
                    if path.is_file() and not path.is_symlink():
                        relative = path.relative_to(self.root).as_posix()
                        data = self.reads.read(relative)
                        if sha(data) == expected:
                            return relative, data
        raise IntegrationError("PROVENANCE_MISSING_OR_HASH_MISMATCH", original)

    def put(self, destination, local, data, expected, role, label, mode="document", git_blob=None):
        destination = native_path(destination)
        actual = sha(data)
        require(expected is None or expected == actual, "FILE_HASH_MISMATCH", label)
        require(git_blob is None or blob(data) == git_blob, "GIT_BLOB_MISMATCH", label)
        previous = self.nodes.get(destination)
        if previous:
            require(previous["sha256"] == actual, "CONFLICTING_FINAL_PATH", destination)
            if role not in previous["roles"]:
                previous["roles"].append(role)
        else:
            self.nodes[destination] = {"path": destination, "sha256": actual, "byte_length": len(data),
                "origin": local, "roles": [role], "git_blob_sha": git_blob, "_bytes": data}
        self.origins.append({"reference": label, "resolved_origin": local, "staged_path": destination,
                             "sha256": actual, "declared_hash": expected is not None})
        if mode == "document" and destination.endswith(".json"):
            self.queue.append((destination, local))
        return destination

    def native(self, path, expected=None, role="reference", label=None, commit=None, git_blob=None, mode="document"):
        label = label or path
        try:
            path = native_path(path)
            if path.startswith(PREFIX + "/"):
                local = "deliverable/" + path[len(PREFIX) + 1:]
                data = self.reads.read(local)
            elif path.startswith(".orchestra/skills/execute-genesis/"):
                local = "protocol/" + path.removeprefix(".orchestra/skills/execute-genesis/")
                if path.endswith("/references/transport.md"):
                    local = "runtime-work/support/transport.md"
                data = self.reads.read(local)
            else:
                capture = self.canonical.get(path)
                if capture is None:
                    self.external_captures.append({"repository": "gustavomhss/hugr-orchestra", "commit": commit or self.pack["source_revision"],
                        "path": path, "sha256": expected, "git_blob_sha": git_blob, "read_only_capture_required": True})
                    raise IntegrationError("PUBLIC_SOURCE_CAPTURE_REQUIRED", path)
                pin, canonical_blob, canonical_sha = capture["identity"]
                require(commit is None or commit == pin, "SOURCE_COMMIT_MISMATCH", path)
                require(expected is None or expected == canonical_sha, "CANONICAL_SOURCE_HASH_MISMATCH", path)
                require(git_blob is None or git_blob == canonical_blob, "CANONICAL_SOURCE_BLOB_MISMATCH", path)
                local, git_blob, expected = capture["capture"], canonical_blob, canonical_sha
                data = self.reads.read(local)
                mode = "opaque"
            return self.put(path, local, data, expected, role, label, mode, git_blob)
        except (IntegrationError, OSError, UnicodeError, ValueError) as error:
            self.error(label, error)

    def provenance(self, name, expected=None, context=None, role="provenance", opaque=False):
        try:
            local, data = self.local(name, expected, context)
            # Explicit provenance labels retain their original text. A resolution map
            # identifies the preserved bytes; no author, review or oracle is rewritten.
            equivalent = next((p for p, n in self.nodes.items() if n["sha256"] == sha(data)), None)
            target = equivalent or PREFIX + "/staged-provenance/" + sha(data) + "/" + Path(local).name
            self.put(target, local, data, expected, role, name, "opaque" if opaque else "document")
        except (IntegrationError, OSError, UnicodeError, ValueError) as error:
            self.error(name, error)

    def relative_ref(self, path, expected, context, role):
        if path.startswith(PREFIX + "/"):
            self.native(path, expected, role)
        elif not path.startswith("/") and path.split("/", 1)[0] in PAYLOAD_DIRS and self.reads.path("deliverable/" + path).is_file():
            self.native(PREFIX + "/" + path, expected, role)
        else:
            self.provenance(path, expected, context, role)

    def walk(self, value, context, location="", parent=None):
        if isinstance(value, list):
            for index, item in enumerate(value):
                self.walk(item, context, location + "/" + str(index), parent)
            return
        if isinstance(value, str):
            # Only explicitly encoded evidence/reference objects are parsed. Prose,
            # captured provider text and ordinary source strings are not instructions.
            if parent in ("evidence", "source_refs") and value.lstrip().startswith("{"):
                try:
                    obj = json.loads(value)
                    if isinstance(obj, dict) and ("payload_path" in obj or "commit" in obj):
                        self.walk(obj, context, location + "/encoded")
                except ValueError:
                    pass
            return
        if not isinstance(value, dict):
            return
        label = context + "#" + location
        if "payload_path" in value and "sha256" in value:
            self.native(value["payload_path"], value["sha256"], "transitive-payload-reference", label)
        elif all(k in value for k in ("commit", "path", "sha256")):
            self.native(value["path"], value["sha256"], "transitive-source-reference", label, value["commit"], value.get("git_blob_sha"))
        elif "path" in value and "sha256" in value and isinstance(value["path"], str):
            self.relative_ref(value["path"], value["sha256"], context, "transitive-file-reference")
        for field, hash_field in (("body_path", "body_sha256"), ("body_path", "sha256"),
                                  ("response_path", "response_sha256"), ("request_path", "request_sha256"),
                                  ("input_file", "input_sha256")):
            if isinstance(value.get(field), str) and isinstance(value.get(hash_field), str):
                self.relative_ref(value[field], value[hash_field], context, "transitive-" + field)
        for field in CAPTURE_FIELDS:
            if isinstance(value.get(field), str):
                self.provenance(value[field], value.get("sha256"), context, "source-capture-alias", True)
        for field in CONNECTOR_FIELDS:
            if isinstance(value.get(field), str):
                self.provenance(value[field], value.get("connector_response_sha256"), context, "original-connector-capture", True)
        for field in ("capture_file", "capture", "resolved_by", "original_attempt_ledger"):
            name = value.get(field)
            if isinstance(name, str) and (name.startswith(("captures/", "blob-captures/")) or name == "capture-attempts.json"):
                self.provenance(name, None, context, "original-connector-capture", True)
        if isinstance(value.get("file"), str) and value["file"].startswith(("captures/", "blob-captures/")):
            self.provenance(value["file"], value.get("sha256"), context, "original-connector-capture", True)
        if isinstance(value.get("destination"), str) and isinstance(value.get("producer_files"), list):
            for file in value["producer_files"]:
                self.native(PREFIX + "/" + value["destination"] + "/" + file["name"], file["sha256"], "mechanical-producer-file")
        # Principal mechanical verification names artifact files as dictionary keys.
        if isinstance(value.get("unit"), str) and isinstance(value.get("artifact_hashes"), dict):
            for name, details in value["artifact_hashes"].items():
                if isinstance(details, dict) and "sha256" in details:
                    self.native(PREFIX + "/layers/l1/" + value["unit"] + "/" + name, details["sha256"], "principal-artifact-file")
        # Hash-only body/section fingerprints and Git tree entries are metadata, not
        # requests to capture every file from the 4,506-entry assigned population.
        if {"path", "sha", "type"} <= value.keys() and "sha256" not in value:
            return
        for key, item in value.items():
            self.walk(item, context, location + "/" + key, key)

    def finish(self):
        while self.queue:
            path, origin = self.queue.popleft()
            identity = (path, self.nodes[path]["sha256"])
            if identity in self.walked:
                continue
            self.walked.add(identity)
            try:
                self.walk(json.loads(self.nodes[path]["_bytes"]), origin)
            except (ValueError, TypeError, KeyError, OSError, IntegrationError) as error:
                self.error(path, error)


def build_plan(args):
    root = args.workspace.absolute()
    require(root.is_dir() and root.resolve() == root, "WORKSPACE_PATH", str(root))
    source_root = args.source_root or root / "runtime-work/source-root"
    if not source_root.is_absolute():
        source_root = root / source_root
    require(source_root.is_dir() and source_root.resolve() == source_root and source_root.is_relative_to(root / "runtime-work"), "SOURCE_ROOT_PATH", str(source_root))
    require(not (source_root / ".git").exists() and not (source_root / ".atlas").exists(), "SOURCE_STATE_ALREADY_EXISTS", "No fabricated Git or preexisting runtime CAS is accepted for final staging.")
    reads = Reads(root)
    raw = reads.read("deliverable/native-package.json")
    pack = json.loads(raw)
    require(pack.get("schema") == "genesis-native-package/v1" and pack.get("session") == "S2", "PACKAGE_SCHEMA", "Expected actual S2 package")
    conditions, reached = final_conditions(pack)
    origin_map = json.loads(reads.read(args.origin_map)) if args.origin_map else {}
    require(isinstance(origin_map, dict), "ORIGIN_MAP_FORMAT", "Expected original label -> workspace-relative captured file")
    closure = Closure(reads, source_root, pack, origin_map)
    closure.native(PREFIX + "/native-package.json", sha(raw), "native-package")
    for ref in (pack["protocol_ref"], pack["contract"]["oracle_ref"]):
        closure.native(ref.get("payload_path", ref.get("path")), ref["sha256"], "runtime-reference", commit=ref.get("commit"))
    # Bind the retained protocol support bytes to the prior resumption inventory.
    # Only the transport reference is consumed by native prepare; the remaining
    # protocol files stay explicit provenance, without inventing Git observations.
    protocol_inventory = json.loads(reads.read("deliverable/evidence/resumption.json"))
    protocol_records = [x for x in protocol_inventory["files"] if x["path"].startswith("protocol/")]
    require(protocol_records, "PROTOCOL_INVENTORY_MISSING", "No retained protocol hashes")
    for item in protocol_records:
        closure.native(".orchestra/skills/execute-genesis/" + item["path"].removeprefix("protocol/"), item["sha256"], "pinned-protocol-support", mode="opaque")
    closure.provenance("deliverable/evidence/resumption.json", context=None, role="protocol-preservation-receipt", opaque=True)
    for artifact in pack["artifacts"]:
        closure.native(PREFIX + "/" + artifact["body"]["path"], artifact["body"]["sha256"], "runtime-body")
        for name in ("recipe_ref", "producer_request_ref", "producer_response_ref"):
            ref = artifact[name]
            closure.native(ref.get("payload_path", ref.get("path")), ref["sha256"], "runtime-reference", commit=ref.get("commit"))
        for ref in artifact["semantic_review_refs"] + artifact["runtime_receipt_refs"]:
            closure.native(ref.get("payload_path", ref.get("path")), ref["sha256"], "runtime-reference", commit=ref.get("commit"))
        for ref in artifact["source_refs"]:
            closure.native(ref["path"], ref["sha256"], "runtime-source", commit=ref["commit"], git_blob=ref["git_blob_sha"])
        for key in artifact["input_keys"]:
            if key.startswith("file:"):
                closure.native(key[5:], role="runtime-input")
            else:
                closure.errors.append({"reference": key, "code": "MEMBERSHIP_NOT_MATERIALIZED", "message": "No local Git checkout or membership observation is fabricated."})
    # Preserve actual request/decision/oracle packets as opaque evidence. These bytes
    # are not interpreted as new instructions or automatically counted as approvals.
    for folder in ("requests", "judgments", "oracles"):
        for path in sorted((root / "deliverable" / folder).rglob("*")):
            if path.is_file():
                relative = path.relative_to(root / "deliverable").as_posix()
                closure.native(PREFIX + "/" + relative, role="preserved-decision-or-request-evidence", mode="opaque")
    for layer in (1, 2, 3, 4):
        relative = f"accepted/l{layer}.json"
        if (root / "deliverable" / relative).is_file():
            closure.native(PREFIX + "/" + relative, role="accepted-layer-evidence")
        elif not args.inspect_current:
            closure.errors.append({"reference": relative, "code": "ACCEPTED_LAYER_MANIFEST_MISSING", "message": "All four actual accepted layer records must exist before final staging."})
    closure.finish()
    originals = []
    for path in sorted(source_root.rglob("*")):
        require(not path.is_symlink(), "SOURCE_SYMLINK", str(path))
        if not path.is_file():
            continue
        relative = path.relative_to(source_root).as_posix()
        data = reads.read(path.relative_to(root).as_posix())
        if relative in closure.canonical:
            require((sha(data), blob(data)) == (closure.canonical[relative]["identity"][2], closure.canonical[relative]["identity"][1]), "MATERIALIZED_ORIGINAL_DRIFT", relative)
        originals.append({"path": relative, "sha256": sha(data), "byte_length": len(data)})
    for path, node in closure.nodes.items():
        existing = reads.path((source_root / path).relative_to(root).as_posix())
        if existing.is_file():
            require(sha(reads.read(existing.relative_to(root).as_posix())) == node["sha256"], "EXISTING_STAGING_CONFLICT", path)
    runtime_dir = root / "runtime-work/runtime-code/modules/atlas"
    implementation = {}
    for name in ("scripts/genesis-native.ts", "packages/adapter-io/src/genesis-native.ts", "packages/adapter-io/src/genesis-native-format.ts", "packages/adapter-io/src/genesis-native-io.ts", "packages/adapter-io/src/ownership-input.ts"):
        implementation[name] = sha(reads.read((runtime_dir / name).relative_to(root).as_posix()))
    release_raw = reads.read(args.runtime_release)
    observed_release = json.loads(release_raw)
    operation = root / "runtime-work/final-staging" / sha(raw)
    nodes = [{k: v for k, v in n.items() if not k.startswith("_")} for _, n in sorted(closure.nodes.items())]
    caps = [n for n in nodes if n["byte_length"] > 256000 and any(r in n["roles"] for r in ("runtime-input", "runtime-source"))]
    oversized_refs = [n for n in nodes if n["byte_length"] > 8388608 and any(r in n["roles"] for r in ("native-package", "runtime-body", "runtime-reference"))]
    plan = {"schema": "genesis-s2-final-staging-plan/v1", "package_sha256": sha(raw), "package_bytes": len(raw),
        "source_root": str(source_root), "payload_prefix": PREFIX, "required_count": len(pack["required_artifact_keys"]),
        "artifact_count": len(pack["artifacts"]), "supported_count": sum(a["validity"] == "supported" for a in pack["artifacts"]),
        "roots_observed": pack["roots"], "roots_required_shape": {"entry": "s2.l4.entry"}, "reachable_required_keys": reached,
        "final_conditions": conditions, "reference_errors": closure.errors, "additional_public_read_only_captures": closure.external_captures,
        "files": nodes, "resolution_map": closure.origins, "materialized_originals_to_preserve": originals,
        "runtime_candidate_revision": observed_release["candidate_revision"], "runtime_release_id": observed_release["release_id"],
        "runtime_release_ref": {"path": args.runtime_release, "sha256": sha(release_raw)},
        "runtime_implementation_sha256": implementation, "r1_oversized_live_inputs": caps, "oversized_native_reference_reads": oversized_refs,
        "runtime_compatibility": "HOLD_KNOWN_INPUT_LIMIT" if caps else "NOT_EXECUTED_NOT_PROVEN",
        "prepare_request": {"state": "NOT_AUTHORIZED_NOT_RUN", "cwd": str(runtime_dir),
            "argv": [str(root / "runtime-work/tools/bun-package/bin/bun"), "scripts/genesis-native.ts", "prepare", str(source_root), PREFIX + "/native-package.json", str(operation / "prepared.json")],
            "output_file": str(operation / "prepared.json"), "stdout_file": str(operation / "prepare.stdout"), "stderr_file": str(operation / "prepare.stderr"),
            "receipt_file": str(operation / "prepare-execution-receipt.json"), "exit_code": None, "candidate_id": None,
            "future_cas": str(source_root / ".atlas/cas"), "authority": "Root must authorize the actual operation after all13 are accepted; this plan provides no publication or binding authority."},
        "operation_directory": str(operation), "staging_applied": False, "runtime_cas_created": False,
        "reference_semantics": ["Native refs, encoded evidence refs, source manifests, accepted body/review bindings and explicit local file refs are followed transitively.",
            "Historical local provenance is preserved by exact hash under staged-provenance; original labels remain unchanged and the resolution map records each destination.",
            "Source code, original connector envelopes and adjunct request packets are opaque. Plain prose mentions, section hashes and Git tree inventory entries are data, not extra capture requests.",
            "A missing or mismatched real file reference blocks staging. Source capture requests are never replaced by empty data or inferred absence."]}
    reads.unchanged()
    return reads, closure, plan


def write_exclusive(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    require(not path.is_symlink(), "WRITE_SYMLINK", str(path))
    with path.open("xb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    require(path.read_bytes() == data, "STAGING_WRITE_DRIFT", str(path))


def apply_plan(reads, closure, plan):
    require(not plan["final_conditions"], "FINAL_PACKAGE_NOT_ACCEPTED", "Final conditions remain open", plan["final_conditions"])
    require(not plan["reference_errors"], "UNRESOLVED_FILE_REFERENCES", "Every reference must resolve exactly", plan["reference_errors"])
    target = closure.source_root / PREFIX
    require(not target.exists(), "FINAL_PAYLOAD_EXISTS", "A sealed payload is never overwritten; use a new isolated source root for a changed package.")
    operation = Path(plan["operation_directory"])
    require(not operation.exists(), "PREVIOUS_STAGING_ATTEMPT_EXISTS", "Reconcile the retained attempt before proceeding; do not repeat uncertain staging automatically.")
    reads.unchanged()
    operation.mkdir(parents=True, exist_ok=False)
    write_exclusive(operation / "stage-plan.json", encoded(plan))
    temporary = Path(tempfile.mkdtemp(prefix="payload-", dir=operation))
    # Keep a failed attempt intact for diagnosis. Never delete existing source files.
    for path, node in sorted(closure.nodes.items()):
        if path.startswith(PREFIX + "/"):
            output = temporary / path[len(PREFIX) + 1:]
            write_exclusive(output, node["_bytes"])
        else:
            output = reads.path((closure.source_root / path).relative_to(reads.root).as_posix())
            if output.exists():
                require(output.is_file() and sha(output.read_bytes()) == node["sha256"], "EXISTING_STAGING_CONFLICT", path)
            else:
                write_exclusive(output, node["_bytes"])
                os.chmod(output, 0o444)
    reads.unchanged()
    require(not target.exists(), "FINAL_PAYLOAD_EXISTS", str(target))
    for path in sorted(temporary.rglob("*"), reverse=True):
        os.chmod(path, 0o555 if path.is_dir() else 0o444)
    os.chmod(temporary, 0o555)
    target.parent.mkdir(parents=True, exist_ok=True)
    os.rename(temporary, target)
    for node in plan["files"]:
        data = (closure.source_root / node["path"]).read_bytes()
        require(sha(data) == node["sha256"] and len(data) == node["byte_length"], "SEALED_FILE_DRIFT", node["path"])
    for old in plan["materialized_originals_to_preserve"]:
        require(sha((closure.source_root / old["path"]).read_bytes()) == old["sha256"], "ORIGINAL_CHANGED", old["path"])
    seal = {"schema": "genesis-s2-final-staging-seal/v1", "package_sha256": plan["package_sha256"], "stage_plan_sha256": sha(encoded(plan)),
        "source_root": plan["source_root"], "payload_prefix": PREFIX, "file_count": len(plan["files"]),
        "original_count_preserved": len(plan["materialized_originals_to_preserve"]), "payload_read_only_permissions": True,
        "runtime_compatibility": plan["runtime_compatibility"], "prepare_executed": False, "runtime_cas_created": False}
    write_exclusive(operation / "sealed.json", encoded(seal))
    os.chmod(operation / "stage-plan.json", 0o444)
    os.chmod(operation / "sealed.json", 0o444)
    return seal


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--source-root", type=Path)
    parser.add_argument("--runtime-release", default="runtime-work/github/runtime-release.json", help="Workspace-relative exact captured release; explicitly pin a newer readback without overwriting historical discovery")
    parser.add_argument("--origin-map", help="Optional workspace-relative JSON mapping original provenance labels to existing captured files")
    parser.add_argument("--inspect-current", action="store_true", help="Read-only actual inventory even while the package is incomplete")
    parser.add_argument("--report-dir", type=Path, help="New directory for inventory/request plans; never an author/review directory")
    parser.add_argument("--apply", action="store_true", help="Stage and seal final accepted full13 bytes; never execute prepare")
    args = parser.parse_args()
    require(not (args.apply and args.inspect_current), "INVALID_MODE", "inspect-current cannot stage")
    reads, closure, plan = build_plan(args)
    result = apply_plan(reads, closure, plan) if args.apply else None
    if args.report_dir:
        folder = args.report_dir if args.report_dir.is_absolute() else reads.root / args.report_dir
        require(folder.absolute() == folder.resolve(), "REPORT_DIRECTORY_SYMLINK_OR_TRAVERSAL", str(folder))
        require(folder.is_relative_to(reads.root / "assembly-tools") or folder.is_relative_to(reads.root / "runtime-work"), "REPORT_DIRECTORY", str(folder))
        require(not folder.exists(), "REPORT_EXISTS", str(folder))
        folder.mkdir(parents=True, exist_ok=False)
        write_exclusive(folder / "staging-plan.json", encoded(plan))
        write_exclusive(folder / "prepare-request.json", encoded(plan["prepare_request"]))
    print(json.dumps({"status": "STAGED_SEALED" if result else "INVENTORIED_NOT_STAGED", "package_sha256": plan["package_sha256"],
        "files": len(plan["files"]), "reference_errors": plan["reference_errors"],
        "additional_public_read_only_captures": plan["additional_public_read_only_captures"],
        "final_conditions": plan["final_conditions"], "roots_required_shape": plan["roots_required_shape"],
        "runtime_compatibility": plan["runtime_compatibility"], "prepare_executed": False}, ensure_ascii=False, indent=2))
    if plan["reference_errors"] or (plan["final_conditions"] and not args.inspect_current):
        raise SystemExit(2)


if __name__ == "__main__":
    try:
        main()
    except IntegrationError as error:
        print(json.dumps({"status": "ERROR", "code": error.code, "message": str(error), "details": error.details}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"status": "ERROR", "code": "INVALID_OR_MISSING_INPUT", "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2)
