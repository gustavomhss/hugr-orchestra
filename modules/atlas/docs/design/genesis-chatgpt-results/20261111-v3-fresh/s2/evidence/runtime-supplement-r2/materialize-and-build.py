#!/usr/bin/env python3
"""Authorized S2 supplement: captured-byte reconciliation and actual local typecheck.

No Atlas prepare, product tests, publication, authority changes, remote writes,
reserved oracle reads, or semantic review packet reads are performed here.
"""
from pathlib import Path
import base64
import datetime
import hashlib
import json
import shutil
import subprocess
import sys
import time

SUP = Path(__file__).resolve().parent
WORK = SUP.parent
SESSION = WORK.parent
sys.path.insert(0, str(WORK))
from materialize import BASELINE, blob_sha, read_no_link, safe_path, sha256, source_specs, tree_map, write_exact


def save(path, value):
    write_exact(SUP, path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def receipt_file(path):
    content = path.read_bytes()
    return {"path": str(path), "sha256": sha256(content), "byte_length": len(content)}


def reconcile_sources():
    old = json.loads(read_no_link(WORK, "source-materialization.json"))
    old_records = {(x["producer"], x["path"]): x for x in old["records"]}
    old_files = {x["path"]: x for x in old["records"]}
    trees = tree_map(source_specs())
    records, additions, new_files, same_files, manifests = [], [], [], [], []
    principal_bytes = read_no_link(SESSION, "deliverable/evidence/l1-principal-verification.json")
    principal = json.loads(principal_bytes)
    principal_units = {x["unit"]: x for x in principal["units"]}
    write_exact(SUP, "inputs/l1-principal-verification.json", principal_bytes)
    for unit, keys in [("desktop-web", ["sources", "captured_not_directly_inspected"]),
                       ("app-session", ["records"]), ("design-tui", ["captures"])]:
        producer = SESSION / "producers" / unit
        data = read_no_link(producer, "sources.json")
        doc = json.loads(data)
        current = [x for key in keys for x in doc[key]]
        assert sha256(data) == principal_units[unit]["artifact_hashes"]["sources.json"]["sha256"]
        assert len(current) == principal_units[unit]["source_captures"]
        write_exact(SUP, "inputs/" + unit + "-sources.json", data)
        manifests.append({"unit": unit, "sha256": sha256(data), "captures": len(current)})
        for item in current:
            path = str(safe_path(item["path"]))
            assert item["commit"] == BASELINE
            body = read_no_link(producer, item["local_capture_file"])
            actual = {"byte_length": len(body), "sha256": sha256(body), "git_blob_sha": blob_sha(body)}
            assert all(item[k] == v for k, v in actual.items()), (unit, path, "capture identity")
            tree = trees[path]
            assert tree["type"] == "blob" and tree["sha"] == actual["git_blob_sha"] and tree["size"] == len(body)
            record = {"producer": unit, "path": path, "commit": BASELINE, **actual,
                      "connector_tree_file": tree["connector_tree_file"]}
            records.append(record)
            if (unit, path) in old_records:
                assert all(old_records[(unit, path)][k] == v for k, v in actual.items())
                assert read_no_link(WORK / "source-root", path) == body
                continue
            capture = read_no_link(producer, item["connector_response_file"])
            assert len(capture) == item["connector_response_bytes"]
            assert sha256(capture) == item["connector_response_sha256"]
            response = json.loads(capture)
            assert not response.get("isError")
            raw = response["structuredContent"]
            assert raw["sha"] == actual["git_blob_sha"]
            if raw["encoding"] == "base64":
                captured_bytes = base64.b64decode("".join(raw["content"].split()), validate=True)
            elif raw["encoding"] == "utf-8":
                captured_bytes = raw["content"].encode("utf-8")
            else:
                raise ValueError("Unknown original connector encoding")
            assert captured_bytes == body
            request = item["connector_request"]
            assert request["path"] == path and request["ref"] == BASELINE
            assert request["repository_full_name"] == "gustavomhss/hugr-orchestra"
            copy_path = "original-captures/" + unit + "--" + path.replace("/", "__") + ".json"
            write_exact(SUP, copy_path, capture)
            record.update({"original_capture_file": copy_path, "original_capture_sha256": sha256(capture),
                           "original_capture_bytes": len(capture), "original_decoded_bytes_equal": True})
            additions.append(record)
            if path in old_files:
                assert read_no_link(WORK / "source-root", path) == body
                same_files.append(path)
            else:
                new_files.append(path)
                write_exact(WORK / "source-root", path, body)
    assert len(records) == 646 and len(additions) == 6
    unique = {}
    for record in records:
        if record["path"] in unique:
            assert unique[record["path"]]["sha256"] == record["sha256"]
        unique[record["path"]] = record
    assert len(unique) == 641 and len(new_files) == 5
    source_receipt = {"schema": "genesis-s2-source-supplement/v1", "recorded_at": now(),
                      "source_revision": BASELINE, "prior_receipt": receipt_file(WORK / "source-materialization.json"),
                      "principal_verification": receipt_file(SUP / "inputs/l1-principal-verification.json"),
                      "capture_records": len(records), "unique_files": len(unique),
                      "unique_bytes": sum(x["byte_length"] for x in unique.values()),
                      "new_capture_records": len(additions), "new_unique_files": len(new_files),
                      "new_unique_paths": new_files, "new_record_existing_identical_path": same_files,
                      "conflicts": [], "prior_640_records_unchanged": True,
                      "prior_636_materialized_files_unchanged": True,
                      "new_capture_bodies_reconciled_with_original_connector": True,
                      "all_current_source_hashes_match_manifest_and_baseline_trees": True,
                      "manifests": manifests, "additions": additions, "records": records}
    save("source-supplement.json", source_receipt)
    print(json.dumps({k: v for k, v in source_receipt.items() if k not in ("records", "additions", "manifests")}), flush=True)


def run_logged(label, argv, cwd):
    start = now()
    before = time.monotonic()
    result = subprocess.run(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    write_exact(SUP, "commands/" + label + ".stdout", result.stdout)
    write_exact(SUP, "commands/" + label + ".stderr", result.stderr)
    record = {"argv": argv, "cwd": str(cwd), "started_at": start, "ended_at": now(),
              "duration_seconds": time.monotonic() - before, "exit_code": result.returncode,
              "resolved_executable": shutil.which(argv[0]) if not argv[0].startswith("/") else argv[0],
              "stdout": receipt_file(SUP / "commands" / (label + ".stdout")),
              "stderr": receipt_file(SUP / "commands" / (label + ".stderr"))}
    save("commands/" + label + ".json", record)
    print(json.dumps({"label": label, "exit_code": result.returncode,
                      "stdout": result.stdout.decode("utf-8", "replace")[:6000],
                      "stderr": result.stderr.decode("utf-8", "replace")[:6000]}), flush=True)
    return record


def build():
    code = WORK / "runtime-code/modules/atlas"
    runtime = json.loads(read_no_link(WORK, "runtime-materialization.json"))
    for file in runtime["files"]:
        data = read_no_link(WORK / "runtime-code", file["path"])
        assert sha256(data) == file["sha256"] and blob_sha(data) == file["git_blob_sha"]
    bun = str(WORK / "tools/bun-package/bin/bun")
    versions = [run_logged("bun-version", [bun, "--version"], code),
                run_logged("node-version", ["node", "--version"], code)]
    scip = code / "node_modules/@c4312/scip/package.json"
    before = receipt_file(scip)
    postinstall = run_logged("fix-scip-types", ["node", "scripts/fix-scip-types.mjs"], code)
    after = receipt_file(scip)
    assert postinstall["exit_code"] == 0
    typecheck = run_logged("typecheck-adapter-io", [bun, "run", "typecheck"], code / "packages/adapter-io")
    for file in runtime["files"]:
        assert sha256(read_no_link(WORK / "runtime-code", file["path"])) == file["sha256"]
    assert not (WORK / "source-root/.atlas").exists()
    record = {"schema": "genesis-s2-build-supplement/v1", "candidate_revision": runtime["candidate_revision"],
              "source_files_verified_before_and_after": len(runtime["files"]), "source_bytes_changed": False,
              "versions": versions, "typescript_manifest": receipt_file(code / "node_modules/typescript/package.json"),
              "typescript_version": json.loads((code / "node_modules/typescript/package.json").read_text())["version"],
              "postinstall": postinstall, "scip_package_before": before, "scip_package_after": after,
              "typecheck": typecheck, "product_tests_executed": False, "prepare_executed": False,
              "cas_created": False, "product_typecheck_state": "PASS" if typecheck["exit_code"] == 0 else "FAILED"}
    save("build-receipt-initial.json", record)


if __name__ == "__main__":
    if sys.argv[1:] == ["sources"]:
        reconcile_sources()
    elif sys.argv[1:] == ["build"]:
        build()
    else:
        raise SystemExit("usage: materialize-and-build.py sources|build")
