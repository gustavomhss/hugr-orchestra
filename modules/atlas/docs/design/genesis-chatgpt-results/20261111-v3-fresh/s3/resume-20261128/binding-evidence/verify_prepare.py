#!/usr/bin/env python3
"""Read-only byte/CAS audit of an existing prepare; never imports or executes Atlas.

The only writes are reports below this script's directory and selected CAS/decoded
objects below the configured /tmp directory. No archive is extracted wholesale.
Kernel IDs remain observed identifiers; this program does not implement `id`.
"""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import posixpath
import re
import sys
import tarfile
import zipfile
from collections import Counter


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()


def no_duplicates(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError("duplicate JSON key: " + key)
        out[key] = value
    return out


def parse(raw):
    return json.loads(raw.decode("utf-8"), object_pairs_hook=no_duplicates,
                      parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))


def stream_digest(f):
    h = hashlib.sha256()
    n = 0
    while chunk := f.read(1024 * 1024):
        h.update(chunk)
        n += len(chunk)
    return {"sha256": h.hexdigest(), "byte_length": n}


def identity(path, raw=None):
    path = pathlib.Path(path)
    raw = path.read_bytes() if raw is None else raw
    return {"path": str(path), "sha256": sha(raw), "byte_length": len(raw)}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def reference_key(ref):
    # Identity of the complete reference JSON for comparison only, not kernel id.
    return json.dumps(ref, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def main(config_path):
    config_path = pathlib.Path(config_path).resolve()
    cfg = parse(config_path.read_bytes())
    base = pathlib.Path(__file__).resolve().parent
    out = pathlib.Path(cfg["output_dir"]).resolve()
    bulk = pathlib.Path(cfg["bulk_dir"]).resolve()
    if not out.is_relative_to(base) or out == base:
        raise ValueError("output_dir must be a child of s3-binding-evidence")
    if not bulk.is_relative_to(pathlib.Path("/tmp")) or bulk == pathlib.Path("/tmp"):
        raise ValueError("bulk_dir must be a child of /tmp")
    checks = Counter()

    def require(condition, category, detail=""):
        if not condition:
            write_json(out / "mechanical-failure.json", {
                "schema": "s3-prepare-mechanical-failure/v1", "author": cfg["author"],
                "config": identity(config_path), "category": category, "detail": detail,
                "successful_comparisons_before_stop": dict(checks),
                "binding_decision": None, "product_executed": False})
            raise ValueError(category + ": " + detail)
        checks[category] += 1

    def pinned(ref):
        raw = pathlib.Path(ref["path"]).read_bytes()
        require(sha(raw) == ref["sha256"] and len(raw) == ref["byte_length"],
                "pinned_local_file", ref["path"])
        return raw

    state_dir = pathlib.Path(cfg["state_dir"])
    local = {pathlib.Path(x["path"]).name: pinned(x) for x in cfg["state_files"]}
    prepared = parse(local["prepared.json"])
    c = prepared["candidate"]
    state = parse(local["state.json"])
    summary = parse(local["summary.json"])
    lock = parse(local["input-lock.observed.json"])
    material = parse(local["materialization.json"])
    receipt = parse(local["prepare.receipt.json"])
    tar_receipt = parse(pinned(cfg["archive"]["tar_receipt"]))
    pack_raw = pinned(cfg["package"])
    pack = parse(pack_raw)
    readback = parse(pinned(cfg["readback"]))
    readback_rows = {x["path"]: x for x in readback["readback"]}
    expected = cfg["expected"]
    require(len(readback_rows) == len(readback["readback"]), "unique_readback_paths")
    require(readback["head"] == expected["git_payload_commit"] and
            readback["package_sha256"] == expected["package_sha256"] and
            readback["exact_readback_complete"] is True, "readback_identity")
    require(prepared["schema"] == "genesis-native-prepared/v1", "prepared_schema")
    require(prepared["candidate_id"] == state["candidate_id"] == expected["candidate_id"], "candidate_id_receipt_agreement")
    require(state["ownership_manifest"] is None and summary["ownership_manifest"] is None and
            state["publication_attempted"] is False and state["last_operation"] == "prepare", "unpublished_state")
    require(summary["status"] == "OPERATION_RETURNED_SUCCESS" and summary["operation"] == "prepare", "prepare_receipt_operation")
    require(str(summary["run_id"]) == cfg["run_id"], "run_identity")
    for field in ["source_revision", "runtime_revision"]:
        require(state[field] == summary[field] == expected[field], "revision_receipts", field)
    require(c["source_revision"] == c["observed_head"] == expected["source_revision"], "candidate_source_revision")
    require(c["transport"]["sha256"] == state["package_sha256"] == sha(pack_raw) == expected["package_sha256"], "package_sha_agreement")
    require(parse(local["prepare.stdout.json"]) == prepared, "stdout_prepared_json_equal")
    require(c["transport"]["path"] == cfg["package"]["archive_path"], "package_path")
    require(len(c["entries"]) == len(pack["artifacts"]) == expected["artifact_count"], "entry_count")
    require(c["roots"] == pack["roots"] and c["required_artifact_keys"] == pack["required_artifact_keys"], "roots_required_keys")
    require(c["scope"] == pack["scope"] and c["session"] == pack["session"], "scope_session")
    implementation = {}
    for role, ref in cfg["implementation_sources"].items():
        raw = pinned(ref)
        require(sha(raw) == c["implementation"][role], "implementation_file_sha", role)
        implementation[role] = ref
    kernel_sources = [dict(ref) for ref in cfg["kernel_sources"]]
    for ref in kernel_sources:
        pinned(ref)

    body_paths = {posixpath.join(posixpath.dirname(c["transport"]["path"]), x["body"]["path"]) for x in pack["artifacts"]}
    ref_paths = {r["reference"].get("payload_path", r["reference"].get("path")) for r in c["references"]}
    retain = body_paths | ref_paths | {c["transport"]["path"]}
    archived, kept, cas_raw, links, outer = {}, {}, {}, {}, {}
    with pathlib.Path(cfg["archive"]["path"]).open("rb") as f:
        zip_hash = stream_digest(f)
    require(zip_hash["sha256"] == cfg["archive"]["sha256"], "zip_sha")
    with zipfile.ZipFile(cfg["archive"]["path"]) as z:
        require(len(z.namelist()) == len(set(z.namelist())), "zip_unique_members")
        for name, raw in local.items():
            require(z.read(name) == raw, "zip_local_exact_bytes", name)
        with z.open(cfg["archive"]["tar_member"]) as f:
            tar_hash = stream_digest(f)
        require(tar_hash["sha256"] == tar_receipt["sha256"] and
                tar_hash["byte_length"] == tar_receipt["byte_length"], "inner_tar_sha_length")
        with z.open(cfg["archive"]["tar_member"]) as f, tarfile.open(fileobj=f, mode="r|gz") as t:
            seen = set()
            for member in t:
                require(member.name not in seen, "tar_unique_members", member.name)
                seen.add(member.name)
                p = pathlib.PurePosixPath(member.name)
                require(not p.is_absolute() and ".." not in p.parts, "tar_safe_member_name", member.name)
                if member.name in ("prepared.json", "state.json"):
                    require(member.isfile(), "tar_snapshot_regular", member.name)
                    outer[member.name] = t.extractfile(member).read()
                    continue
                require(member.name.startswith("source/"), "tar_source_prefix", member.name)
                relative = member.name[len("source/"):]
                if member.isdir():
                    continue
                if member.issym():
                    target = posixpath.normpath(posixpath.join(posixpath.dirname(relative), member.linkname))
                    require(not target.startswith("../") and not target.startswith("/"), "symlink_stays_inside_source", relative)
                    links[relative] = {"linkname": member.linkname, "resolved_archive_path": target}
                    continue
                require(member.isfile(), "tar_supported_member_type", member.name)
                raw = t.extractfile(member).read()
                archived[relative] = {"sha256": sha(raw), "byte_length": len(raw), "git_blob_sha": blob(raw)}
                if relative in retain:
                    kept[relative] = raw
                if relative.startswith(".atlas/cas/"):
                    cid = relative.rsplit("/", 1)[-1]
                    require(bool(re.fullmatch(r"[a-f0-9]{64}", cid)) and relative == f".atlas/cas/{cid[:2]}/{cid}", "cas_path_shape", relative)
                    cas_raw[cid] = raw
    for name in ["prepared.json", "state.json"]:
        require(outer.get(name) == local[name], "tar_snapshot_exact_bytes", name)
    # No symlink is materialized on disk. The runner inventories the UTF-8 link
    # target string itself (not target-file bytes); preserve that distinction.
    for path, link in links.items():
        require(link["resolved_archive_path"] in archived, "symlink_target_present", path)
        archived[path] = {"kind": "symlink", "target": link["linkname"], "sha256": sha(link["linkname"].encode("utf-8"))}
    inventory = {x["path"]: x for x in state["files"]}
    require(len(inventory) == len(state["files"]) and set(inventory) == set(archived), "state_inventory_exact_path_set")
    for path, row in inventory.items():
        if path in links:
            require(archived[path] == {k: v for k, v in row.items() if k != "path"}, "state_inventory_symlink_target_sha", path)
        else:
            require(all(archived[path][k] == row[k] for k in ["sha256", "byte_length"]), "state_inventory_sha_length", path)
    require(retain <= set(kept), "candidate_payload_paths_present")
    require(kept[c["transport"]["path"]] == pack_raw, "archive_selected_package_exact_bytes")
    for row in lock["files"]:
        path = row["path"]
        require(path in archived and path not in links and
                all(archived[path][k] == row[k] for k in ["sha256", "byte_length", "git_blob_sha"]), "input_lock_sha_length_blob", path)
    require(material["files"] == lock["files"], "materialization_observed_lock_equal")
    require(lock["measurement_completed_before_prepare"] is True, "lock_measurement_timing_receipt")

    cas = {cid: parse(raw) for cid, raw in cas_raw.items()}
    require(cas.get(prepared["candidate_id"]) == c, "candidate_cas_prepared_lossless_json_equal")
    contract = cas[c["contract"]]
    criteria = list(dict.fromkeys(pack["contract"]["criteria"] + ["runtime-import-binding"]))
    require(contract == {"kind": "ownership-contract", "version": 1, "criteria": criteria} and
            c["criteria"] == criteria and len(criteria) == expected["criteria_count"], "contract_exact_criteria")
    decoded = {}
    for cid, obj in cas.items():
        if obj.get("kind") == "ownership-body":
            require(set(obj) == {"kind", "version", "bytes"} and obj["version"] == 1 and
                    all(type(n) is int and 0 <= n <= 255 for n in obj["bytes"]), "body_cas_byte_array", cid)
            decoded[cid] = bytes(obj["bytes"])
    require(decoded[c["transport"]["body"]] == pack_raw, "transport_cas_package_exact_bytes")

    def readback_check(path, raw):
        require(path in readback_rows, "selected_readback_path_present", path)
        row = readback_rows[path]
        require(row["exact_utf8_equal"] is True and row["git_blob_sha"] == blob(raw), "selected_readback_blob_match", path)
        return {"receipt": cfg["readback"], "row_pointer": "/readback/" + str(readback["readback"].index(row)),
                "git_payload_commit": readback["head"], "git_blob_sha": row["git_blob_sha"],
                "meaning": "Recorded connector readback identity compared to measured local bytes; no new network read."}

    package_readback = readback_check(c["transport"]["path"], pack_raw)
    expected_refs = [pack["protocol_ref"], pack["contract"]["oracle_ref"]]
    for a in pack["artifacts"]:
        expected_refs += [a["recipe_ref"], a["producer_request_ref"], a["producer_response_ref"], *a["semantic_review_refs"], *a["runtime_receipt_refs"]]
    expected_refs = list({reference_key(r): r for r in expected_refs}.values())
    require([reference_key(r["reference"]) for r in c["references"]] == [reference_key(r) for r in expected_refs], "candidate_reference_order_and_set")
    for r in c["references"]:
        path = r["reference"].get("payload_path", r["reference"].get("path"))
        require(decoded[r["body"]] == kept[path] and sha(decoded[r["body"]]) == r["reference"]["sha256"], "reference_cas_declared_archive_bytes", path)

    observations = {x["key"]: x for x in c["observations"]}
    require(len(observations) == len(c["observations"]), "unique_observations")
    for key, observation in observations.items():
        if key.startswith("file:"):
            require(key[5:] in archived and archived[key[5:]]["sha256"] == observation["sha256"], "file_observation_raw_sha", key)
        else:
            require(key.startswith("members:"), "known_observation_key", key)
    members = {r["key"]: r for r in material["memberships"]}
    require(set(members) == {k for k in observations if k.startswith("members:")}, "membership_key_set")
    for key, row in members.items():
        require(row["paths"] == sorted(set(row["paths"])) and all(p in archived and p not in links for p in row["paths"]), "membership_paths_sorted_unique_present", key)

    release_map = {}
    acceptance_sources = {}
    release_sources = []
    for ref in cfg["releases"]:
        raw = pinned(ref)
        release = parse(raw)
        rb = readback_check(ref["archive_path"], raw)
        release_sources.append({"file": ref, "readback": rb, "scope": "Existing release body identities only; no new semantic judgment."})
        acceptance_sources[release["revision"]] = {"source": ref, "declared_semantic_decision": release["decision"],
            "reviewer_ids": release["reviewer_ids"], "original_decision_refs": release["decisions"],
            "meaning": "Existing semantic release; not a binding decision from this verifier."}
        for i, row in enumerate(release["bodies"]):
            require(row["key"] not in release_map, "unique_release_body", row["key"])
            release_map[row["key"]] = {"file": ref, "pointer": f"/bodies/{i}", "body": row, "acceptance_source_id": release["revision"]}
    custody_raw = pinned(cfg["custody"])
    custody = parse(custody_raw)
    custody_readback = readback_check(cfg["custody"]["archive_path"], custody_raw)
    for i, row in enumerate(custody["inventory"]):
        if row["layer"] == 1:
            acceptance_id = "original-L1:" + row["key"]
            acceptance_sources[acceptance_id] = {"source": cfg["custody"], "pointer": f"/inventory/{i}",
                "declared_semantic_decision": row["acceptance_status"], "reviewer_ids": row["judges"],
                "original_decision_refs": [{k: j[k] for k in ["path", "sha256", "byte_length"]} for j in row["judgments"]],
                "source_commit": row["observed_at_commit"], "revision": row["revision"],
                "meaning": "Recovered original static acceptance, bound to the unchanged L1 body; not a new runtime binding."}
            release_map[row["key"]] = {"file": cfg["custody"], "pointer": f"/inventory/{i}/body",
                "body": {"key": row["key"], "sha256": row["body"]["sha256"], "bytes": row["body"]["byte_length"]}, "acceptance_source_id": acceptance_id}

    prepared_ref = identity(state_dir / "prepared.json", local["prepared.json"])
    def exact_pointer(pointer, count=None):
        result = {"file": prepared_ref, "json_pointer": pointer, "omitted_from_limited_view": True}
        if count is not None:
            result["item_count"] = count
        return result

    cas_roles = {prepared["candidate_id"]: ["candidate"], c["contract"]: ["contract"], c["transport"]["body"]: ["transport"]}
    def role(cid, description):
        cas_roles.setdefault(cid, []).append(description)

    entry_views = []
    entries_by_key = {}
    all_inputs = set()
    for i, (entry, a) in enumerate(zip(c["entries"], pack["artifacts"])):
        key = entry["key"]
        require(key == a["key"] and key not in entries_by_key, "entry_key_order_unique", key)
        result_id = entry["artifact"]["result"]
        result = cas[result_id]
        expected_artifact = {"kind": "ownership-artifact", "version": 1, "key": key,
            "scope": pack["scope"], "title": a["title"], "layer": a["layer"], "need": a["need"],
            "result": result_id, "navigation": a["navigation"]}
        require(entry["artifact"] == expected_artifact, "embedded_artifact_exact_metadata_no_receipt", key)
        require(result == {"kind": "ownership-result", "version": 1, "body": result["body"],
                **{k: a[k] for k in ["authority", "validity", "gaps", "evidence"]}}, "result_package_lossless_fields", key)
        raw = decoded[result["body"]]
        path = posixpath.join(posixpath.dirname(c["transport"]["path"]), a["body"]["path"])
        payload_path = pathlib.Path(cfg["package"]["payload_root"]) / path
        require(raw == kept[path] == payload_path.read_bytes() and
                sha(raw) == a["body"]["sha256"] and len(raw) == a["body"]["byte_length"], "body_cas_archive_selected_exact_bytes", key)
        raw.decode("utf-8", errors="strict")
        rb = readback_check(path, raw)
        rel = release_map[key]
        require(rel["body"]["sha256"] == sha(raw) and rel["body"]["bytes"] == len(raw), "body_release_or_l1_custody_identity", key)
        input_keys = list(dict.fromkeys(a["input_keys"] + ["file:" + pack["protocol_ref"].get("payload_path", pack["protocol_ref"].get("path"))]))
        require([x["key"] for x in entry["inputs"]] == input_keys and
                all(x == {"key": x["key"], "version": observations[x["key"]]["version"]} for x in entry["inputs"]), "entry_inputs_exact_order_observations", key)
        all_inputs.update(input_keys)
        deps = [{"key": d["key"], "result": entries_by_key[d["key"]]["artifact"]["result"]} for d in a["build_dependencies"]]
        require(entry["dependencies"] == deps, "dependencies_exact_order_prior_results", key)
        for source_ref in a["source_refs"]:
            measured = archived[source_ref["path"]]
            require(measured["sha256"] == source_ref["sha256"] and measured["git_blob_sha"] == source_ref["git_blob_sha"], "source_ref_sha_blob", source_ref["path"])
        entries_by_key[key] = entry
        role(result_id, key + ":result")
        role(result["body"], key + ":body")
        entry_views.append({"key": key, "artifact": entry["artifact"],
            "artifact_storage": "Embedded candidate value without receipt; no published artifact ID asserted.",
            "result_id_observed": result_id, "result_exact": result,
            "inputs_id_observed": entry["inputs_id"],
            "inputs_exact_reference": exact_pointer(f"/candidate/entries/{i}/inputs", len(entry["inputs"])),
            "dependencies_exact": entry["dependencies"], "navigation_exact": entry["artifact"]["navigation"],
            "body": {"cas_id_observed": result["body"], "sha256": sha(raw), "byte_length": len(raw),
                "package_path": path, "selected_local_file": identity(payload_path, raw),
                "body_text_omitted": True, "readback": rb, "release_or_custody": rel},
            "all_result_fields_included_losslessly": True,
            "machine_equalities": ["artifact metadata", "full result value", "body bytes", "input key/order/version mapping", "dependency key/result/order", "navigation", "release or L1 custody body identity"]})
    require(all_inputs == set(observations), "observations_exact_union_of_inputs")
    require(set(entries_by_key) == set(c["required_artifact_keys"]), "required_entries_complete")
    equal_bindings = {}
    for e in c["entries"]:
        signature = reference_key({"inputs": e["inputs"], "dependencies": e["dependencies"]})
        require(signature not in equal_bindings or equal_bindings[signature] == e["inputs_id"], "equal_input_dependency_payload_same_observed_id", e["key"])
        equal_bindings[signature] = e["inputs_id"]
    ref_views = []
    for i, r in enumerate(c["references"]):
        role(r["body"], f"reference:{i}")
        raw = decoded[r["body"]]
        ref_views.append({**r, "decoded_sha256": sha(raw), "decoded_byte_length": len(raw),
                          "text_omitted": True, "exact_candidate_pointer": f"/references/{i}"})
    require(set(cas_roles) <= set(cas), "all_referenced_cas_present")
    bulk.mkdir(parents=True, exist_ok=True)
    cas_index = []
    for cid in sorted(cas_roles):
        raw_path = bulk / "cas" / cid[:2] / cid
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        raw_path.write_bytes(cas_raw[cid])
        row = {"kernel_id_observed": cid, "roles": cas_roles[cid], "kind": cas[cid]["kind"],
               "raw_cas_file": identity(raw_path, cas_raw[cid]),
               "archive_member": f"source/.atlas/cas/{cid[:2]}/{cid}"}
        if cid in decoded:
            p = bulk / "decoded" / (cid + ".bin")
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(decoded[cid])
            row["decoded_file"] = identity(p, decoded[cid])
        cas_index.append(row)
    cas_lookup = {r["kernel_id_observed"]: r for r in cas_index}
    for e in entry_views:
        e["body"]["exact_omitted_text_reference"] = cas_lookup[e["body"]["cas_id_observed"]]["decoded_file"]
        e["result_raw_cas"] = cas_lookup[e["result_id_observed"]]["raw_cas_file"]
    for r in ref_views:
        r["exact_omitted_text_reference"] = cas_lookup[r["body"]]["decoded_file"]

    limitations = [
        "No semantic assessment, judge vote, runtime binding, approval, publication or consumer execution is produced by this verifier.",
        "Kernel IDs and inputs_id are observed prepare values. Canonical source was captured at the runtime pin; Python blake3 is unavailable. No substitute digest or kernel ID recomputation was performed.",
        "CAS raw SHA-256 and decoded body SHA-256 are file integrity checks, distinct from kernel BLAKE3 canonical identity.",
        "All extensive input/observation/membership vectors and body/reference prose are omitted from the limited view and linked by exact file SHA, byte length and JSON Pointer or decoded CAS file.",
        "No assertion that judges read the 2.6 MB prepared document, omitted vectors, body prose, producer requests, oracle prose or review prose follows from this view.",
        "Membership path lists were checked as sorted, unique and present in the archived materialization. Original raw git ls-files stdout is absent: enumeration_sha256 and membership kernel versions were preserved, not independently recomputed.",
        "Git readback receipts are previously captured evidence. This program performs no network access and does not establish fresh remote state.",
        "Prepare evidence is tied to this exact package and candidate; a later prepare or changed package requires a fresh view and independent binding decisions."
    ]
    omissions = [
        {"name": "complete_prepared", "reference": {"file": prepared_ref, "json_pointer": ""}},
        {"name": "observations", "reference": exact_pointer("/candidate/observations", len(c["observations"]))},
        {"name": "all_entry_input_vectors", "per_entry_references": [e["inputs_exact_reference"] for e in entry_views], "total_items_with_repetition": sum(len(e["inputs"]) for e in c["entries"])},
        {"name": "observed_input_lock_files", "reference": {"file": identity(state_dir / "input-lock.observed.json", local["input-lock.observed.json"]), "json_pointer": "/files", "item_count": len(lock["files"])}},
        {"name": "materialization_membership_vectors", "reference": {"file": identity(state_dir / "materialization.json", local["materialization.json"]), "json_pointer": "/memberships", "item_count": len(material["memberships"])}},
        {"name": "full_state_file_inventory", "reference": {"file": identity(state_dir / "state.json", local["state.json"]), "json_pointer": "/files", "item_count": len(state["files"])}},
        {"name": "body_and_reference_prose", "reference": "cas-index.json contains exact raw CAS and decoded file identities; per-body/per-reference decoded locators are in binding-view.json."}
    ]
    view = {"schema": "s3-limited-binding-evidence-view/v1", "author": cfg["author"],
        "role": cfg["view_role"], "binding_decision": None, "semantic_verdict": None,
        "run_id": cfg["run_id"], "candidate_id_observed": prepared["candidate_id"],
        "source_revision": expected["source_revision"], "runtime_revision": expected["runtime_revision"],
        "git_payload_commit": readback["head"], "git_commit_meaning": "Publication of files in Git only; not Atlas publication.",
        "ownership_manifest": state["ownership_manifest"], "publication_attempted": state["publication_attempted"],
        "prepared_file": prepared_ref, "candidate_cas": cas_lookup[prepared["candidate_id"]],
        "transport_exact": c["transport"], "selected_package": cfg["package"], "package_readback": package_readback,
        "scope": c["scope"], "session": c["session"], "observed_head": c["observed_head"], "repo_root_recorded": c["repo_root"],
        "reference_commit_verification": c["reference_commit_verification"],
        "implementation_exact": c["implementation"], "implementation_source_files": implementation,
        "contract_id_observed": c["contract"], "contract_exact": contract,
        "criteria_exact": c["criteria"], "roots_exact": c["roots"], "required_artifact_keys_exact": c["required_artifact_keys"],
        "entries": entry_views, "candidate_references": ref_views, "bulk_omissions": omissions,
        "limitations": limitations}
    counts = {"entries": len(entry_views), "criteria": len(criteria), "candidate_references": len(ref_views),
        "cas_present": len(cas), "cas_selected_extracted": len(cas_index),
        "cas_not_selected": len(set(cas) - set(cas_roles)), "decoded_body_objects": len(decoded),
        "observations": len(observations), "file_observations": sum(k.startswith("file:") for k in observations),
        "membership_observations": len(members), "input_items_with_repetition": sum(len(e["inputs"]) for e in c["entries"]),
        "observed_lock_files": len(lock["files"]), "state_inventory_files": len(inventory),
        "archived_regular_source_files": len(archived) - len(links), "archived_symlinks_not_extracted": len(links)}
    report = {"schema": "s3-prepare-mechanical-report/v1", "author": cfg["author"],
        "status": "MECHANICAL_COMPARISONS_COMPLETED", "view_role": cfg["view_role"],
        "semantic_verdict": None, "binding_decision": None, "product_executed": False,
        "runtime_executed": False, "tests_executed": False, "remote_writes": False,
        "config": identity(config_path), "verifier": identity(__file__),
        "candidate_id_observed": prepared["candidate_id"], "package_sha256": sha(pack_raw),
        "zip": {"path": cfg["archive"]["path"], **zip_hash}, "inner_tar": {"member": cfg["archive"]["tar_member"], **tar_hash},
        "counts": counts, "successful_comparisons": dict(checks),
        "prepare_summary_exact": summary, "kernel_id_independently_verified": False,
        "python_blake3_available": importlib.util.find_spec("blake3") is not None,
        "kernel_source_files": kernel_sources, "source_publication_is_not_atlas_publication": True,
        "symlinks_preserved_as_metadata_only": links, "release_identity_sources": release_sources,
        "l1_custody_readback": custody_readback, "limitations": limitations,
        "outputs": ["binding-view.json", "cas-index.json", "omissions.json", "handoff.md", "dispatch-summary.json"],
        "verifier_development_note": "The first v4 audit incorrectly treated a symlink inventory identity as its target-file bytes. The verifier was corrected to compare SHA256 of the UTF-8 link target string, matching runner inventory(). Preserved initial failure is a verifier hypothesis error, not product failure; see ../verifier-corrections.json."}
    write_json(out / "binding-view.json", view)
    write_json(out / "cas-index.json", {"schema": "s3-extracted-cas-index/v1", "objects": cas_index})
    write_json(out / "omissions.json", {"schema": "s3-limited-view-omissions/v1", "omissions": omissions, "limitations": limitations})
    write_json(out / "mechanical-report.json", report)
    lines = [f"# Vista mecânica S3 {cfg['version']}", "", f"Estado: **{cfg['view_role']}**. Sem parecer ou binding.", "",
        f"Prepare real Actions `{cfg['run_id']}`; candidate observado `{prepared['candidate_id']}`; pacote SHA-256 `{sha(pack_raw)}`.", "",
        "O commit identifica arquivos publicados no Git. `ownership_manifest=null` e `publication_attempted=false` permanecem no estado preparado.", "",
        "## Conteúdo e verificações", "",
        f"A vista contém as {len(entry_views)} entradas e os {len(criteria)} critérios exatos. Para cada entrada inclui artifact embutido, result inteiro, result ID, inputs ID, dependências, navegação, hash/tamanho/custódia do corpo e referência exata do vetor de inputs omitido.", "",
        f"Foram comparados ZIP e tar com os hashes pinados, os snapshots e o candidate CAS com prepared, {len(entry_views)} corpos com os bytes CAS/archive/pacote selecionado/readback/releases, {len(ref_views)} refs CAS com os arquivos transportados, {len(lock['files'])} arquivos do input lock e {len(inventory)} entradas do inventário. O único symlink de fonte permaneceu apenas como metadado e foi relacionado ao alvo interno arquivado.", "",
        "## Limites que devem acompanhar qualquer envio", "",
        "- IDs do kernel foram preservados como observados, sem recomputação independente: a fonte canônica foi capturada, mas `blake3` não está instalado no Python usado.",
        "- SHA-256 dos bytes CAS e dos corpos não são IDs canônicos do kernel.",
        "- Os vetores extensos, corpos e textos de referências foram omitidos explicitamente. `omissions.json` e `cas-index.json` fornecem seus hashes e localizadores exatos.",
        "- A leitura desta vista não equivale à leitura humana do prepared completo, dos corpos, dos oráculos ou dos pareceres preservados.",
        "- O verificador não executou produto/runtime/testes, não criou votos e não publicou. A decisão de binding continua separada e deve citar este candidate exato.", "",
        "## Mapa dos corpos", "", "| Key | Bytes | SHA-256 do corpo | Inputs |", "|---|---:|---|---:|"]
    for e in entry_views:
        lines.append(f"| {e['key']} | {e['body']['byte_length']} | `{e['body']['sha256']}` | {e['inputs_exact_reference']['item_count']} |")
    (out / "handoff.md").write_text("\n".join(lines) + "\n")
    dispatch = {"schema": "s3-binding-manual-dispatch/v1", "author": cfg["author"],
        "role": cfg["view_role"], "run_id": cfg["run_id"], "candidate_id_observed": prepared["candidate_id"],
        "source_revision": expected["source_revision"], "runtime_revision": expected["runtime_revision"],
        "package_sha256": sha(pack_raw), "git_payload_commit": readback["head"],
        "git_commit_meaning": "Files in Git only; no Atlas publication", "scope": c["scope"], "session": c["session"],
        "repo_root_recorded": c["repo_root"], "ownership_manifest": None, "publication_attempted": False,
        "binding_decision": None, "semantic_verdict_by_this_verifier": None,
        "kernel_ids_independently_recomputed": False,
        "contract_id_observed": c["contract"], "criteria_exact": c["criteria"], "roots_exact": c["roots"],
        "required_artifact_keys_exact": c["required_artifact_keys"],
        "entries": [{"key": e["key"], "layer": e["artifact"]["layer"], "need": e["artifact"]["need"],
            "result_id_observed": e["result_id_observed"], "inputs_id_observed": e["inputs_id_observed"],
            "body_cas_id_observed": e["body"]["cas_id_observed"], "body_sha256": e["body"]["sha256"], "body_bytes": e["body"]["byte_length"],
            "input_count": e["inputs_exact_reference"]["item_count"],
            "inputs_omitted_pointer_in_prepared": e["inputs_exact_reference"]["json_pointer"],
            "build_dependencies_exact": e["dependencies_exact"], "navigation_exact": e["navigation_exact"],
            "acceptance_source_id": e["body"]["release_or_custody"]["acceptance_source_id"],
            "acceptance_body_pointer": e["body"]["release_or_custody"]["pointer"]} for e in entry_views],
        "acceptance_sources": acceptance_sources,
        "mechanical_checks": {"status": "COMPLETED_WITH_EXPLICIT_LIMITS", "counts": counts,
            "zip_sha256": zip_hash["sha256"], "zip_bytes": zip_hash["byte_length"],
            "tar_sha256": tar_hash["sha256"], "tar_bytes": tar_hash["byte_length"],
            "candidate_raw_cas_sha256": cas_lookup[prepared["candidate_id"]]["raw_cas_file"]["sha256"],
            "contract_raw_cas_sha256": cas_lookup[c["contract"]]["raw_cas_file"]["sha256"],
            "equality_scope": ["ZIP/local/tar prepared and state bytes", "candidate CAS JSON equals prepared candidate losslessly", "contract and 32 criteria", "all 11 artifact/result fields equal selected package", "all 11 body bytes equal CAS/archive/local selected package and measured hashes; readback Git blob and semantic release or L1 custody hashes agree", "all 35 preserved refs equal decoded CAS/archive and declared SHA", "all 6441 entry input pairs match observation order/versions", "dependency results/order and navigation exact", "4639 lock files SHA/length/Git blob; 14576 regular file inventory SHA/length and one symlink target/hash", "45 membership lists sorted unique and present; original enumeration digest not recomputed"],
            "report": identity(out / "mechanical-report.json")},
        "omitted_from_dispatch": {"status": "OMITTED_FROM_DISPATCH", "semantic_verification_by_this_verifier": False,
            "fields": ["all authority/validity/gaps/evidence prose (exact full result values remain in the wide view)", "all full input/observation/membership/state inventories", "all body and producer/oracle/reviewer reference prose", "full candidate raw JSON"],
            "wide_view": identity(out / "binding-view.json"), "prepared": prepared_ref,
            "result_field_pointers": "/entries/<index>/result_exact in the wide view; index order is the dispatch entries order",
            "candidate_field_pointers": ["/candidate/observations", "/candidate/entries/<index>/inputs", "/candidate/references"],
            "cas_index": identity(out / "cas-index.json"), "omissions": identity(out / "omissions.json")},
        "limits": ["This dispatch is a mechanical evidence view, not a binding approval or semantic judgment.",
            "No claim that either judge read the complete prepared document or any omitted text/vector. Additional exact fields may be requested.",
            "Observed kernel IDs were not independently recomputed. Captured kernel canonical source uses BLAKE3; Python blake3 unavailable; raw SHA256 is not kernel ID.",
            "No product/runtime/tests/network/remote writes were performed by this verifier. Actual prepare execution is evidenced by the preserved CI receipts.",
            "Existing semantic acceptance hashes are mapped, not extended to operational binding or publication. New binding decisions must cite this exact candidate.",
            "v3 view is preliminary/superseded. v4 view concerns the final selected package prepared in this run; no verdict is imposed."]}
    dispatch_raw = (json.dumps(dispatch, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    require(len(dispatch_raw) <= 22000, "dispatch_size_limit", str(len(dispatch_raw)))
    (out / "dispatch-summary.json").write_bytes(dispatch_raw)
    for name in ["binding-view.json", "mechanical-report.json", "cas-index.json", "omissions.json", "handoff.md", "dispatch-summary.json"]:
        print(json.dumps(identity(out / name)))
    print(json.dumps({"counts": counts, "binding_decision": None, "kernel_id_independently_verified": False}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", help="Pinned configuration JSON; archive and prepare must already exist")
    args = parser.parse_args()
    main(args.config)
