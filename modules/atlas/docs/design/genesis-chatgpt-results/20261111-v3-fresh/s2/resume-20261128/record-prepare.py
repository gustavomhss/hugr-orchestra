#!/usr/bin/env python3
"""Record one new S2 prepare through the original CLI; never publish or run tests."""
import argparse
import datetime
import hashlib
import json
import pathlib
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument("--code-root", type=pathlib.Path, required=True)
parser.add_argument("--corpus-root", type=pathlib.Path, required=True)
parser.add_argument("--bun", type=pathlib.Path, required=True)
parser.add_argument("--output-dir", type=pathlib.Path, required=True)
parser.add_argument("--execution-id", required=True)
args = parser.parse_args()
code = args.code_root.resolve(strict=True)
corpus = args.corpus_root.resolve(strict=True)
bun = args.bun.resolve(strict=True)
out = args.output_dir.absolute()
package_path = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/native-package.json"
expected_package = "9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b"
expected_code = "db9b4235022c4df32fe3bfd4faeea8adcd69abb7"
expected_corpus = "bb2a931301d541692b11e5a7f1eab234cd9ed2fd"


def command(argv, cwd):
    return subprocess.check_output(argv, cwd=cwd, text=True).strip()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_identity(path, relative):
    data = path.read_bytes()
    return {"path": relative, "byte_length": len(data), "sha256": digest(data)}


def save(name, value):
    (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


code_head = command(["git", "rev-parse", "HEAD"], code)
corpus_head = command(["git", "rev-parse", "HEAD"], corpus)
assert code_head == expected_code, ("unexpected code", code_head)
assert corpus_head == expected_corpus, ("unexpected corpus", corpus_head)
assert command(["git", "diff", "--name-only", "HEAD"], code) == "", "modified runtime"
assert command(["git", "diff", "--name-only", "HEAD"], corpus) == "", "modified corpus"
package_bytes = (corpus / package_path).read_bytes()
assert digest(package_bytes) == expected_package, "package bytes changed"
pack = json.loads(package_bytes)
paths = {package_path}
references = [pack["protocol_ref"], pack["contract"]["oracle_ref"]]
for artifact in pack["artifacts"]:
    paths.add(str(pathlib.PurePosixPath(package_path).parent / artifact["body"]["path"]))
    paths.update(ref["path"] for ref in artifact["source_refs"])
    assert all(key.startswith("file:") for key in artifact["input_keys"]), "record membership explicitly"
    paths.update(key[5:] for key in artifact["input_keys"])
    references.extend([artifact["recipe_ref"], artifact["producer_request_ref"], artifact["producer_response_ref"]])
    references.extend(artifact["semantic_review_refs"] + artifact["runtime_receipt_refs"])
paths.update(ref.get("payload_path", ref.get("path")) for ref in references)


def sources():
    rows = []
    for relative in sorted(paths):
        path = corpus / relative
        assert path.resolve(strict=True) == path and path.is_file(), ("nonregular input", relative)
        rows.append(file_identity(path, relative))
    return rows


before = sources()
assert not (corpus / ".atlas/cas").exists(), "use a new isolated CAS for this diagnostic"
out.mkdir(parents=True, exist_ok=False)
save("inputs.before.json", before)
argv = [str(bun), "scripts/genesis-native.ts", "prepare", str(corpus), package_path, str(out / "prepared.json")]
started = utc()
tick = time.monotonic()
with (out / "stdout.json").open("xb") as stdout, (out / "stderr.txt").open("xb") as stderr:
    process = subprocess.run(argv, cwd=code / "modules/atlas", stdout=stdout, stderr=stderr, check=False)
duration = time.monotonic() - tick
ended = utc()
after = sources()
save("inputs.after.json", after)
cas_root = corpus / ".atlas/cas"
cas = [file_identity(path, str(path.relative_to(corpus))) for path in sorted(cas_root.rglob("*")) if path.is_file()]
save("cas-manifest.json", cas)
prepared = json.loads((out / "prepared.json").read_bytes()) if (out / "prepared.json").exists() else None
receipt = {
    "schema": "genesis-s2-new-prepare-receipt/v1",
    "execution_id": args.execution_id,
    "operation_id": "s2-prepare-db9b423-20261128-01",
    "operation": "prepare",
    "record_kind": "ORIGINAL_EXECUTION_RECEIPT",
    "relationship_to_r4": "NEW_EXECUTION_NOT_RECOVERED_R4",
    "release_status": "UNPROMOTED_SOURCE_DIAGNOSTIC_ONLY",
    "started_at": started, "ended_at": ended, "duration_seconds": duration,
    "command_argv": argv, "cwd": str(code / "modules/atlas"),
    "runtime_code_revision": code_head, "source_revision": pack["source_revision"],
    "protocol_revision": "ee2521a5b966bd505cc95bd1c733e09e12f33531",
    "corpus_revision": corpus_head, "corpus_root": str(corpus),
    "runtime_code_modified": False,
    "runtime_versions": {
        "bun": command([str(bun), "--version"], code),
        "node": command(["node", "--version"], code),
        "npm": command(["npm", "--version"], code),
        "typescript": json.loads((code / "modules/atlas/node_modules/typescript/package.json").read_text())["version"]
    },
    "package": file_identity(corpus / package_path, package_path),
    "package_lock": file_identity(code / "modules/atlas/package-lock.json", "modules/atlas/package-lock.json"),
    "exit_code": process.returncode,
    "state": "PREPARE_SUCCEEDED" if process.returncode == 0 and prepared else "PREPARE_FAILED",
    "candidate_id": prepared["candidate_id"] if prepared else None,
    "artifact_count": len(prepared["candidate"]["entries"]) if prepared else None,
    "observations": len(prepared["candidate"]["observations"]) if prepared else None,
    "prepared": file_identity(out / "prepared.json", "prepared.json") if prepared else None,
    "stdout": file_identity(out / "stdout.json", "stdout.json"),
    "stderr": file_identity(out / "stderr.txt", "stderr.txt"),
    "input_manifest_before": file_identity(out / "inputs.before.json", "inputs.before.json"),
    "input_manifest_after": file_identity(out / "inputs.after.json", "inputs.after.json"),
    "input_file_count": len(before), "source_bytes_unchanged": before == after,
    "cas_manifest": file_identity(out / "cas-manifest.json", "cas-manifest.json"),
    "cas_object_count": len(cas),
    "corpus_tracked_changes_after": command(["git", "diff", "--name-only", "HEAD"], corpus).splitlines(),
    "runtime_tracked_changes_after": command(["git", "diff", "--name-only", "HEAD"], code).splitlines(),
    "policy_or_actor_created": False, "binding_executed": False, "publish_executed": False,
    "index_read_executed": False, "consumers_executed": False, "maintenance_executed": False,
    "product_tests_executed_locally": False, "delivery_complete": False,
    "limits": ["This operation does not recover the historical r4 receipt or promote a release.",
               "Reference hashes and this checkout are recorded; original external commit capture remains a distinct provenance obligation.",
               "Runtime policy, binding, publication, consumer and maintenance are separate obligations."]
}
save("receipt.json", receipt)
print(json.dumps({key: receipt[key] for key in ["state", "candidate_id", "artifact_count", "observations", "exit_code", "source_bytes_unchanged", "input_file_count", "cas_object_count"]}))
raise SystemExit(process.returncode)
