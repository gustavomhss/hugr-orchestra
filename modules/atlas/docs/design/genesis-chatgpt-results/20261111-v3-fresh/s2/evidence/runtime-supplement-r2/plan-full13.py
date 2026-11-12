#!/usr/bin/env python3
"""Inventory metadata only for a future complete S2 package; does not run prepare."""
from pathlib import Path
import datetime
import hashlib
import json
import posixpath

SUP = Path(__file__).resolve().parent
WORK = SUP.parent
SESSION = WORK.parent
PREFIX = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2"
SOURCE = WORK / "source-root"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value):
    target = SUP / path
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("x") as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


pack_bytes = (SESSION / "deliverable/native-package.json").read_bytes()
pack = json.loads(pack_bytes)
(SUP / "inputs/native-package-full13-plan-snapshot.json").write_bytes(pack_bytes)
source_receipt = json.loads((SUP / "source-supplement.json").read_text())
source_map = {item["path"]: item for item in source_receipt["records"]}
files = {}


def reference_path(ref):
    return ref.get("payload_path", ref.get("path"))


def add(path, role, artifact=None, expected_sha=None, byte_length=None, private=False):
    if path not in files:
        files[path] = {"source_root_relative_path": path, "source_root_absolute_path": str(SOURCE / path),
                       "roles": [], "artifacts": [], "sha256": expected_sha, "byte_length": byte_length,
                       "private_content_not_read": private}
    item = files[path]
    if role not in item["roles"]:
        item["roles"].append(role)
    if artifact is not None and artifact not in item["artifacts"]:
        item["artifacts"].append(artifact)
    if expected_sha:
        if item["sha256"] is not None:
            assert item["sha256"] == expected_sha, (path, "conflicting metadata")
        item["sha256"] = expected_sha
    if byte_length is not None:
        item["byte_length"] = byte_length
    item["private_content_not_read"] |= private


add(PREFIX + "/native-package.json", "complete-native-package", expected_sha=digest(pack_bytes), byte_length=len(pack_bytes))
add(reference_path(pack["protocol_ref"]), "protocol-reference-and-live-file-input", expected_sha=pack["protocol_ref"]["sha256"])
add(reference_path(pack["contract"]["oracle_ref"]), "reserved-oracle-reference", expected_sha=pack["contract"]["oracle_ref"]["sha256"], private=True)
for artifact in pack["artifacts"]:
    key = artifact["key"]
    add(posixpath.join(PREFIX, artifact["body"]["path"]), "artifact-body", key, artifact["body"]["sha256"], artifact["body"]["byte_length"])
    for field in ["recipe_ref", "producer_request_ref", "producer_response_ref"]:
        ref = artifact[field]
        add(reference_path(ref), field, key, ref["sha256"])
    for field in ["semantic_review_refs", "runtime_receipt_refs"]:
        for ref in artifact[field]:
            add(reference_path(ref), field, key, ref["sha256"], private=(field == "semantic_review_refs"))
    for ref in artifact["source_refs"]:
        add(ref["path"], "captured-source-reference", key, ref["sha256"])
    for input_key in artifact["input_keys"]:
        if input_key.startswith("file:"):
            add(input_key[5:], "live-file-input", key)
        else:
            raise ValueError("Unexpected membership or other key; current inventory was file-only")

# Principal explicitly prescribed these captured-tree inputs. They are snapshot files,
# not fabricated live membership or Git checkout observations.
population_inputs = []
for unit in ["desktop-web", "app-session", "design-tui"]:
    path = PREFIX + "/inputs/" + unit + "-tree.json"
    local = SESSION / "deliverable/inputs" / (unit + "-tree.json")
    data = local.read_bytes()
    add(path, "principal-prescribed-population-snapshot-live-input", "s2.l1." + unit, digest(data), len(data))
    population_inputs.append({"unit": unit, "path": path, "local_payload_source": str(local),
                              "sha256": digest(data), "byte_length": len(data),
                              "already_in_planning_snapshot_input_keys": any("file:" + path in a["input_keys"] for a in pack["artifacts"]),
                              "provenance_kind": "captured population tree snapshot, not live membership"})

for path, item in files.items():
    if item["private_content_not_read"]:
        item["staging_status"] = "PRINCIPAL_ONLY_NOT_OPENED_OR_CHECKED"
        continue
    if path in source_map:
        actual = source_map[path]
        if item["sha256"]:
            assert item["sha256"] == actual["sha256"]
        item["sha256"] = actual["sha256"]
        item["byte_length"] = actual["byte_length"]
        item["staging_status"] = "PRESENT_VERIFIED_SOURCE"
        item["local_payload_source"] = str(SOURCE / path)
        continue
    if path == reference_path(pack["protocol_ref"]):
        local = WORK / "support/transport.md"
    elif path.startswith(PREFIX + "/"):
        local = SESSION / "deliverable" / path.removeprefix(PREFIX + "/")
    else:
        item["staging_status"] = "UNRESOLVED_PAYLOAD_PATH"
        continue
    if not local.is_file():
        item["staging_status"] = "PAYLOAD_FILE_ABSENT"
        continue
    # These are public producer/payload files, never oracle or judge packet content.
    body = local.read_bytes()
    if item["sha256"]:
        assert item["sha256"] == digest(body), (path, "payload drift")
    item["sha256"] = digest(body)
    item["byte_length"] = len(body)
    item["local_payload_source"] = str(local)
    item["staging_status"] = "VERIFIED_PAYLOAD_NOT_STAGED"

present = {a["key"]: a for a in pack["artifacts"]}
required = [{"key": key, "currently_present": key in present,
             "source_root_body_path": str(SOURCE / PREFIX / present[key]["body"]["path"]) if key in present else None,
             "body_path_state": "EXACT_FROM_MANIFEST" if key in present else "NOT_YET_ASSIGNED_IN_MANIFEST",
             "semantic_review_refs_count": len(present[key]["semantic_review_refs"]) if key in present else None} for key in pack["required_artifact_keys"]]
assert len(required) == 13
limits = [item for item in files.values() if item["byte_length"] is not None and item["byte_length"] > 256000 and
          any("input" in role or role == "captured-source-reference" for role in item["roles"])]
plan = {"schema": "genesis-s2-full13-prepare-plan/v1", "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": "HOLD_NOT_EXECUTED", "execute_authorized": False,
        "package_snapshot_sha256": digest(pack_bytes), "package_state": pack["package_state"],
        "required_artifacts": required, "currently_present_count": len(present), "missing_required_count": len(pack["missing_required_artifact_keys"]),
        "current_roots": pack["roots"], "source_root": str(SOURCE),
        "package_relative_path": PREFIX + "/native-package.json", "package_absolute_path": str(SOURCE / PREFIX / "native-package.json"),
        "cwd_at_current_pin": str(WORK / "runtime-code/modules/atlas"),
        "current_candidate_revision": "e3a8ab8cf56dbff1ee91272df51ffa398d882aa1",
        "current_release_compatibility_with_full13": "INCOMPATIBLE_DUE_TO_256000_FILE_INPUT_LIMIT",
        "proposed_argv_syntax_at_current_pin": [str(WORK / "tools/bun-package/bin/bun"), "scripts/genesis-native.ts", "prepare", str(SOURCE), PREFIX + "/native-package.json", str(WORK / "outputs/s2-full13-prepared-v1.json")],
        "proposed_new_output": str(WORK / "outputs/s2-full13-prepared-v1.json"),
        "future_cas_path": str(SOURCE / ".atlas/cas"), "cas_currently_exists": (SOURCE / ".atlas").exists(),
        "files": sorted(files.values(), key=lambda x: x["source_root_relative_path"]),
        "population_snapshot_inputs": population_inputs, "oversize_file_inputs_at_r1": limits,
        "unresolved_future_file_paths": "The ten missing artifacts have no body, recipe, producer, review or other reference paths assigned in this manifest. Derive exact paths from the final accepted native-package.json, without guessing or creating content here.",
        "preconditions": ["Complete and accept all 13 required artifacts; the worker does not author semantic results or reviews.",
                           "Populate exact roots and navigation/build dependencies so every required key is reachable; dependencies are supported, ordered, acyclic and same-package for r1.",
                           "Preserve at least two actual semantic decision references per artifact; semantic acceptance does not substitute runtime binding.",
                           "Obtain and pin a compatible S4 release that preserves full bytes of all three oversized file inputs; materialize it separately, then adjust code CWD accordingly.",
                           "Stage every exact manifest body, reference and file input. Principal alone handles the reserved oracle and review material; this worker does not open them.",
                           "Recheck exact file hashes and current source bytes after staging; create a new output parent and require the output file to be absent.",
                           "Run prepare only under a later explicit instruction. It writes isolated CAS; it does not publish or supply binding approval."],
        "prohibited_shortcuts": ["No truncation or omission of schema/tui.json or population tree snapshot inputs.", "No fake local Git HEAD or members observations.", "No source-digest replacement for observed source bytes.", "No invented paths, reviews or authority."]}
save("prepare-plan.json", plan)

prior = json.loads((WORK / "final-files.json").read_text())
checks = []
for entry in prior["files"]:
    body = (WORK / entry["path"]).read_bytes()
    assert digest(body) == entry["sha256"] and len(body) == entry["byte_length"], entry["path"]
    checks.append({"path": entry["path"], "sha256": digest(body), "unchanged": True})
save("prior-receipts-immutability.json", {"checks": checks, "all_unchanged": True})
print(json.dumps({"package_sha256": plan["package_snapshot_sha256"], "required": len(required), "present": len(present), "known_staging_files": len(files), "oversize": [{"path":x["source_root_relative_path"],"byte_length":x["byte_length"]} for x in limits], "prior_deliverables_unchanged":len(checks)},ensure_ascii=False))
