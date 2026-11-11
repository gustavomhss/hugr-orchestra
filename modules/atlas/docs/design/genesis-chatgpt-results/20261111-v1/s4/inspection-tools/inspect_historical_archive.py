"""Read and hash a retained artifact; never execute its programs or product tests."""
import base64
import collections
import hashlib
import json
import pathlib
import re
import sys
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inspect(archive_path, receipt_path, output_dir):
    archive_bytes = archive_path.read_bytes()
    receipt_bytes = receipt_path.read_bytes()
    source = json.loads(receipt_bytes)
    with zipfile.ZipFile(archive_path) as archive:
        names = [entry.filename for entry in archive.infolist() if not entry.is_dir()]
        if len(names) != len(set(names)):
            raise ValueError("duplicate archive paths")
        if any(pathlib.PurePosixPath(name).is_absolute() or ".." in pathlib.PurePosixPath(name).parts for name in names):
            raise ValueError("unsafe archive paths")
        members = [{"path": name, "bytes": len(archive.read(name)), "sha256": digest(archive.read(name))} for name in sorted(names)]
        objects = {entry["path"]: entry for entry in members}
        replay_bytes = archive.read("recovery/replay.json")
        replay = json.loads(replay_bytes)
        recovery = json.loads(archive.read("recovery/recovery.json"))
        ledger = [json.loads(line) for line in archive.read("control-ledger.jsonl").splitlines()]
        dispatches = [row for row in ledger if row["kind"] == "dispatch"]
        completions = [row for row in ledger if row["kind"] == "completion"]
        completion_by_request = {row["request"]: row for row in completions}
        calls = [json.loads(line) for line in archive.read("provider-calls.jsonl").splitlines()]
        responses = []
        unresolved = []
        for prompt, request in replay["requests"].items():
            path = "recovery/responses/" + request["request"] + ".json"
            if "completionSha256" not in request:
                unresolved.append({"request": request["request"], "prompt_sha256": prompt, "prompt_bytes": request["promptBytes"], "response_present": path in objects})
                continue
            raw = archive.read(path)
            response = json.loads(raw)
            matches = [row for row in completions if row["origin"].get("sourceRequest") == request["request"]]
            stdout = digest(base64.b64decode(response["stdout"], validate=True))
            stderr = digest(base64.b64decode(response["stderr"], validate=True))
            binding = response["kind"] == "completion" and response["request"] == request["request"] and response["arm"] == request["arm"] and response["promptSha256"] == prompt and response["promptBytes"] == request["promptBytes"] and response["identity"] == source["identity"]
            control_binding = len(matches) == 1 and matches[0]["origin"]["kind"] == "replay" and matches[0]["origin"]["sourceRun"] == source["identity"]["run"] and matches[0]["origin"]["sourceAttempt"] == source["identity"]["attempt"] and matches[0]["exitCode"] == response["exitCode"] and matches[0]["stdoutSha256"] == stdout and matches[0]["stderrSha256"] == stderr
            responses.append({"path": path, "request": request["request"], "sha256": digest(raw), "expected_sha256": request["completionSha256"], "bytes_match_replay_manifest": digest(raw) == request["completionSha256"], "identity_binding_matches": binding, "decoded_stdout_sha256": stdout, "decoded_stderr_sha256": stderr, "exit_code": response["exitCode"], "control_replay_bytes_and_origin_match": control_binding})
        cas_prefix = "recovery/atlas/cas/"
        cas = []
        for name in sorted(name for name in names if name.startswith(cas_prefix)):
            path = name[len(cas_prefix):]
            if re.fullmatch(r"[0-9a-f]{2}/[0-9a-f]{64}", path) is None:
                raise ValueError("malformed archived CAS path")
            equivalent = "reconstructed/atlas/cas/" + path
            cas.append({"path": name, "cas_relative_path": path, "bytes": objects[name]["bytes"], "sha256": objects[name]["sha256"], "reconstructed_path": equivalent, "same_reconstructed_bytes": equivalent in objects and archive.read(name) == archive.read(equivalent)})
        cas_inventory_bytes = json.dumps([[row["cas_relative_path"], row["sha256"]] for row in cas], separators=(",", ":")).encode()
        original_staging = json.loads(archive.read("recovery/atlas/staging.json"))
        reconstructed_staging = dict(json.loads(archive.read("reconstructed/atlas/staging.json"))["current"])
        claim_bindings = []
        for key, old in original_staging["current"]:
            new = reconstructed_staging.get(key)
            for claim in old["claims"]:
                old_binding = old.get("claimEvidenceByClaim", {}).get(claim, {"factRef": old.get("contentHash"), "answerRef": old.get("answerRef")})
                new_binding = new.get("claimEvidenceByClaim", {}).get(claim, {"factRef": new.get("contentHash"), "answerRef": new.get("answerRef")}) if new else None
                claim_bindings.append({"place": key, "claim": claim, "binding": old_binding, "present_with_same_binding": bool(new and claim in new["claims"] and old_binding == new_binding)})
        matched_pairs = all(row["request"] in completion_by_request and all(row[field] == completion_by_request[row["request"]][field] for field in ["arm", "promptSha256", "promptBytes", "origin"]) for row in dispatches)
        original_retry = [row for row in completions if row["origin"]["kind"] == "retry" and row["origin"].get("sourceRequest") == source["inFlightRequest"]]
        report = {
            "schema": "genesis-s4-historical-archive-inspection/v1",
            "campaign": "20261111-v1",
            "attempt_id": "S4-PREP-PRESERVE-001",
            "execution_kind": "READ_ONLY_HISTORICAL_ARTIFACT_INSPECTION",
            "candidate_revision": None,
            "new_product_execution": False,
            "archive": {"artifact_id": 13444687733, "run_id": 42087075694, "head_sha": "c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085", "bytes": len(archive_bytes), "sha256": digest(archive_bytes), "expected_sha256": "9df9f969d7f798e3fd9a4665d062da5293ac2aa77bbc1249bffdca41734860da", "hash_matches": digest(archive_bytes) == "9df9f969d7f798e3fd9a4665d062da5293ac2aa77bbc1249bffdca41734860da", "member_count": len(members), "all_members_hashed": True},
            "source_receipt": {"commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38", "path": "script/atlas-genesis/checkpoint-replay-source.json", "sha256": digest(receipt_bytes), "original_identity": source["identity"]},
            "source_bindings": {"replay_identity_matches": replay["identity"] == source["identity"], "recovery_identity_matches": recovery["identity"] == source["identity"], "last_sequence_matches_recorded_source": recovery["snapshotSequence"] == source["lastSequence"], "replay_checksum_matches": digest(replay_bytes) == archive.read("recovery/replay.sha256").decode(), "staging_sha256": objects["recovery/atlas/staging.json"]["sha256"], "staging_matches_source_receipt": objects["recovery/atlas/staging.json"]["sha256"] == source["stagingSha256"], "plans": [{"path": path, "sha256": objects[path]["sha256"], "matches_source_receipt": objects[path]["sha256"] == source["planSha256"]} for path in ["evidence/plan-advisory.json", "recovery/evidence/plan-advisory.json"]]},
            "original_responses": {"request_count": len(replay["requests"]), "responses_count": len(responses), "all_objects_match_replay_manifest": all(row["bytes_match_replay_manifest"] for row in responses), "all_identity_bindings_match": all(row["identity_binding_matches"] for row in responses), "all_control_replays_match": all(row["control_replay_bytes_and_origin_match"] for row in responses), "unresolved": unresolved, "original_unresolved_stays_unresolved": len(unresolved) == 1 and unresolved[0]["request"] == source["inFlightRequest"] and unresolved[0]["prompt_sha256"] == source["inFlightPromptSha256"] and not unresolved[0]["response_present"]},
            "original_cas": {"count": len(cas), "expected_count": source["casFiles"], "inventory_format": "SHA-256 of UTF-8 compact JSON sorted [CAS-relative-path, raw-file-SHA-256] pairs, no trailing newline", "inventory_sha256": digest(cas_inventory_bytes), "expected_inventory_sha256": source["casInventorySha256"], "inventory_matches_source_receipt": digest(cas_inventory_bytes) == source["casInventorySha256"], "all_reconstructed_copies_byte_equal": all(row["same_reconstructed_bytes"] for row in cas)},
            "original_claims": {"places": len(original_staging["current"]), "claims": len(claim_bindings), "all_retained_with_original_binding": all(row["present_with_same_binding"] for row in claim_bindings)},
            "control_observations": {"ledger_records": len(ledger), "dispatches": len(dispatches), "completions": len(completions), "distinct_dispatches": len({row["request"] for row in dispatches}), "distinct_completions": len(completion_by_request), "all_pairs_match": matched_pairs, "origins": dict(collections.Counter(row["origin"]["kind"] for row in dispatches)), "synthetic_provider_call_records": len(calls), "retry_is_new_linked_identity": len(original_retry) == 1 and original_retry[0]["request"] != source["inFlightRequest"] and original_retry[0]["promptSha256"] == source["inFlightPromptSha256"], "production_continuation_verified": False},
            "limits": ["No archived program, product command, provider, replay command or test was executed.", "The full original 295-envelope chain is absent from this archive; the source receipt remains the historical chain trust anchor.", "Archive-byte and binding comparisons prove only the named retained objects, not current migration, reader behavior, semantic acceptance or production authority.", "The synthetic control retry does not settle the original request; original physical attempts, tokens and charges remain UNKNOWN.", "Signed download URLs were redacted after transport; artifact ID, GitHub run URL and SHA-256 remain durable identifiers."],
        }
        output_dir.mkdir(parents=True, exist_ok=True)
        for name, data in [("historical-archive-members.json", members), ("historical-original-responses.json", responses), ("historical-original-cas.json", cas), ("historical-original-claims.json", claim_bindings)]:
            (output_dir / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        report["detail_files"] = [{"path": name, "sha256": digest((output_dir / name).read_bytes()), "bytes": (output_dir / name).stat().st_size} for name in ["historical-archive-members.json", "historical-original-responses.json", "historical-original-cas.json", "historical-original-claims.json"]]
        (output_dir / "historical-archive-receipt.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
        print(json.dumps({"archive": report["archive"], "original_responses": report["original_responses"], "original_cas": report["original_cas"], "original_claims": report["original_claims"], "control_observations": report["control_observations"]}, indent=2))


if __name__ == "__main__":
    inspect(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]))
