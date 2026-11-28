#!/usr/bin/env python3
"""Residual S4 prepare qualification. Run only in the authorized GitHub Actions job."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import time
from datetime import datetime, timezone

RUNTIME = "9b0188b2be5ea69638dff8a44e3e931b4d6d8b10"
RUNTIME_TREE = "77b84e9358c80ae14b98be329ebf2407dfd83fa4"
SOURCE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
PROTOCOL = "ee2521a5b966bd505cc95bd1c733e09e12f33531"
EXPECTED = {
    "S1-03": ("ddada3d4b67cff13ef3a5817b95efc275b0d288061436546c8ec6b73290766a6", 12, 694, 694, 6),
    "S2": ("9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b", 13, 625, 626, 3),
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def blob_digest(data):
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def utc():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)
        stream.write("\n")


def file_receipt(path):
    data = path.read_bytes()
    return {"path": str(path), "byte_length": len(data), "sha256": digest(data)}


def safe_relative(value):
    require(isinstance(value, str), "Non-string path")
    parts = value.split("/")
    require(value and not re.search(r'[\\:*?"<>|\x00-\x1f\x7f]', value), f"Unsafe path: {value}")
    require(all(part and part not in (".", "..") and part.lower() not in (".git", ".atlas")
                and not part.endswith((".", " ")) for part in parts), f"Unsafe path: {value}")
    return Path(*PurePosixPath(value).parts)


def command(argv, cwd, *, check=True, env=None):
    result = subprocess.run(argv, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {argv!r}: {result.stderr.decode(errors='replace')[-4000:]}")
    return result


def git(repository, *argv):
    return command(["git", "-C", str(repository), *argv], repository).stdout


def head(root):
    return git(root, "rev-parse", "HEAD").decode().strip()


def read_git_file(repository, commit, relative, cache):
    safe_relative(relative)
    require(re.fullmatch(r"[0-9a-f]{40}", commit), "Invalid source commit")
    if (commit, relative) not in cache:
        rows = git(repository, "ls-tree", "-z", commit, "--", relative).split(b"\0")
        exact = [row.split(b"\t", 1)[0].decode().split() for row in rows if b"\t" in row and row.split(b"\t", 1)[1].decode() == relative]
        require(len(exact) == 1 and exact[0][0] in ("100644", "100755") and exact[0][1] == "blob",
                f"Not a regular Git blob: {commit}:{relative}")
        data = git(repository, "show", f"{commit}:{relative}")
        require(blob_digest(data) == exact[0][2], f"Git blob digest mismatch: {commit}:{relative}")
        cache[(commit, relative)] = (data, exact[0][2], exact[0][0])
    return cache[(commit, relative)]


def reference_path(reference):
    return reference.get("payload_path", reference.get("path"))


def package_requirements(spec, package):
    references = [package["protocol_ref"], package["contract"]["oracle_ref"]]
    source_refs = []
    body_specs = []
    inputs = set()
    for artifact in package["artifacts"]:
        references.extend([artifact["recipe_ref"], artifact["producer_request_ref"], artifact["producer_response_ref"],
                           *artifact["semantic_review_refs"], *artifact["runtime_receipt_refs"]])
        source_refs.extend(artifact["source_refs"])
        body_specs.append((str(PurePosixPath(spec["package_path"]).parent / artifact["body"]["path"]), artifact["body"]))
        inputs.update(artifact["input_keys"])
    require(all(key.startswith("file:") for key in inputs), "This no-checkout qualification supports only the pinned file: packages")
    observed = inputs | {"file:" + reference_path(package["protocol_ref"])}
    paths = {spec["package_path"], *[key[5:] for key in observed], *[reference_path(ref) for ref in references],
             *[ref["path"] for ref in source_refs], *[path for path, _ in body_specs]}
    return references, source_refs, body_specs, inputs, observed, paths


def materialize(repository, root, spec, cache):
    require(not root.exists(), f"Data root already exists: {root}")
    git(repository, "worktree", "add", "--detach", "--no-checkout", str(root), SOURCE)
    require(root.resolve() == root and head(root) == SOURCE, "Data worktree identity mismatch")
    require(Path(git(root, "rev-parse", "--show-toplevel").decode().strip()).resolve() == root, "Wrong Git worktree root")
    require(not (root / ".atlas").exists(), "Inherited Atlas state is forbidden")
    files = {}
    for row in spec["files"]:
        relative = row["path"]
        target = root / safe_relative(relative)
        require(relative not in files, f"Duplicate lock path: {relative}")
        data, blob, mode = read_git_file(repository, row["commit"], relative, cache)
        require(digest(data) == row["sha256"], f"Locked SHA256 mismatch: {relative}")
        require(row.get("git_blob_sha") in (None, blob), f"Locked Git blob mismatch: {relative}")
        require(row.get("byte_length") in (None, len(data)), f"Locked byte length mismatch: {relative}")
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as stream:
            stream.write(data)
        target.chmod(0o755 if mode == "100755" else 0o644)
        files[relative] = {"path": relative, "commit": row["commit"], "git_blob_sha": blob, "git_mode": mode,
                           "sha256": digest(target.read_bytes()), "byte_length": len(data), "roles": row["roles"]}
    require(len(files) == spec["materialized_file_count"], "Materialized file count mismatch")
    raw = (root / safe_relative(spec["package_path"])).read_bytes()
    expected = EXPECTED[spec["id"]]
    require(digest(raw) == expected[0] == spec["package_sha256"], "Package hash mismatch")
    require(len(raw) == spec["package_bytes"] and blob_digest(raw) == spec["package_git_blob_sha"], "Package byte/blob mismatch")
    package = json.loads(raw)
    require(package["source_revision"] == SOURCE and package["protocol_ref"]["commit"] == PROTOCOL, "Package epochs differ")
    require(not package["missing_required_artifact_keys"], "Package has missing required artifacts")
    artifact_keys = [item["key"] for item in package["artifacts"]]
    require(artifact_keys == spec["expected_artifact_keys"] and len(artifact_keys) == len(set(artifact_keys)),
            "Artifact execution order or uniqueness mismatch")
    required_keys = package["required_artifact_keys"]
    require(len(required_keys) == len(set(required_keys)) and set(required_keys) == set(artifact_keys),
            "Required artifact membership or uniqueness mismatch")
    require(len(package["artifacts"]) == expected[1] == spec["expected_artifact_count"], "Artifact count mismatch")
    references, sources, bodies, inputs, observed, paths = package_requirements(spec, package)
    require(set(files) == paths, "Lock must materialize exactly the paths required by the package")
    require(len(inputs) == expected[2] and len(observed) == expected[3] == spec["expected_observation_count"], "Input cardinality mismatch")
    checked_refs = {}
    for ref in [*references, *sources]:
        relative = reference_path(ref)
        commit = ref.get("commit", spec["payload_commit"])
        data, blob, _ = read_git_file(repository, commit, relative, cache)
        require(digest(data) == ref["sha256"] == files[relative]["sha256"], f"Declared reference mismatch: {commit}:{relative}")
        require(ref.get("git_blob_sha", blob) == blob, f"Declared source blob mismatch: {relative}")
        checked_refs[(commit, relative)] = {"commit": commit, "path": relative, "git_blob_sha": blob, "sha256": digest(data)}
    for relative, body in bodies:
        require(files[relative]["sha256"] == body["sha256"] and files[relative]["byte_length"] == body["byte_length"],
                f"Body mismatch: {relative}")
    require(not (root / ".atlas").exists(), "Materialization created forbidden state")
    provenance = {
        "repo_root": str(root), "observed_head": head(root), "working_tree_is_complete": False,
        "materialization_mode": "no-checkout-required-input-view", "initial_atlas_state": "absent",
        "files": list(files.values()), "declared_reference_checks": list(checked_refs.values()),
        "declared_input_count": len(inputs), "expected_observation_count": len(observed),
    }
    return package, files, provenance


def inventory(root):
    require(root.is_dir() and not root.is_symlink(), f"Missing inventory root: {root}")
    rows = []
    for path in sorted(root.rglob("*")):
        require(not path.is_symlink(), f"Unexpected symlink in state: {path}")
        if path.is_file():
            record = file_receipt(path)
            record["path"] = path.relative_to(root).as_posix()
            rows.append(record)
    return rows


def snapshot(root, files):
    require(head(root) == SOURCE, "Data HEAD changed")
    sources = []
    for relative in sorted(files):
        path = root / safe_relative(relative)
        require(path.is_file() and not path.is_symlink(), f"Materialized file changed kind: {relative}")
        require(digest(path.read_bytes()) == files[relative]["sha256"], f"Materialized bytes changed: {relative}")
        sources.append({"path": relative, "sha256": files[relative]["sha256"], "mode": stat.S_IMODE(path.stat().st_mode)})
    atlas = root / ".atlas"
    if atlas.exists():
        require(sorted(path.name for path in atlas.iterdir()) == ["cas"], "Preparation changed state outside CAS")
    return {"source_inventory_sha256": digest(json.dumps(sources, sort_keys=True).encode()),
            "cas": inventory(atlas / "cas") if atlas.exists() else []}


def prepare(runtime, root, spec, destination, env):
    destination.mkdir()
    output = destination / "prepared.json"
    argv = [shutil.which("bun"), "scripts/genesis-native.ts", "prepare", str(root), spec["package_path"], str(output)]
    require(argv[0] is not None and not output.exists(), "Missing Bun or occupied prepare output")
    started = utc()
    elapsed = time.monotonic()
    result = command(argv, runtime / "modules/atlas", check=False, env=env)
    for name, data in (("stdout.txt", result.stdout), ("stderr.txt", result.stderr)):
        with (destination / name).open("xb") as stream:
            stream.write(data)
    receipt = {
        "schema": "genesis-s4-native-operation/v1", "operation": "prepare", "runtime_revision": RUNTIME,
        "runtime_tree": RUNTIME_TREE, "argv": argv, "cwd": str(runtime / "modules/atlas"), "root": str(root),
        "observed_head": head(root), "started_at": started, "ended_at": utc(),
        "elapsed_seconds": round(time.monotonic() - elapsed, 6), "exit_code": result.returncode,
        "environment_keys": sorted(env), "stdout": file_receipt(destination / "stdout.txt"),
        "stderr": file_receipt(destination / "stderr.txt"), "output": file_receipt(output) if output.exists() else None,
        "original_cli": True, "runtime_code_modified": False, "seams_used": False,
        "policy_or_actor_created": False, "binding_or_publication_attempted": False,
    }
    write_json(destination / "receipt.json", receipt)
    return result, output, receipt


def verify_kernel_ids(runtime, output, env):
    program = """
const { readFileSync } = await import("node:fs");
const { join } = await import("node:path");
const { id } = await import("@atlas/kernel");
const prepared = JSON.parse(readFileSync(process.env.GENESIS_PREPARED_FILE, "utf8"));
const candidate = prepared.candidate;
const checks = [{ kind: "candidate", actual: String(id(candidate)), expected: prepared.candidate_id }];
for (const entry of candidate.entries)
  checks.push({ kind: "entry-inputs", key: entry.key, actual: String(id({ inputs: entry.inputs, dependencies: entry.dependencies })), expected: entry.inputs_id });
for (const observed of candidate.observations) {
  if (!observed.key.startsWith("file:")) throw new Error("Unexpected non-file input");
  const bytes = readFileSync(join(candidate.repo_root, observed.key.slice(5)));
  checks.push({ kind: "full-file-input", key: observed.key, byte_length: bytes.length, actual: String(id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) })), expected: observed.version });
}
console.log(JSON.stringify({ schema: "genesis-s4-kernel-rehash/v1", checks }));
if (checks.some(check => check.actual !== check.expected)) process.exitCode = 1;
"""
    argv = ["bun", "--eval", program]
    result = command(argv, runtime / "modules/atlas", check=False, env={**env, "GENESIS_PREPARED_FILE": str(output)})
    destination = output.parent
    for name, data in (("kernel-identities.json", result.stdout), ("kernel-identities.stderr.txt", result.stderr)):
        with (destination / name).open("xb") as stream:
            stream.write(data)
    receipt = {"argv": argv, "cwd": str(runtime / "modules/atlas"), "runtime_revision": RUNTIME,
               "environment_paths": {"GENESIS_PREPARED_FILE": str(output)}, "exit_code": result.returncode,
               "stdout": file_receipt(destination / "kernel-identities.json"),
               "stderr": file_receipt(destination / "kernel-identities.stderr.txt")}
    write_json(destination / "kernel-identities.receipt.json", receipt)
    require(result.returncode == 0, "Original @atlas/kernel rehash failed")
    checks = json.loads(result.stdout)["checks"]
    require(all(check["actual"] == check["expected"] for check in checks), "Kernel identities differ")
    prepared = json.loads(output.read_bytes())
    require(len(checks) == 1 + len(prepared["candidate"]["entries"]) + len(prepared["candidate"]["observations"]),
            "Kernel rehash omitted a candidate, entry or input")
    return file_receipt(destination / "kernel-identities.receipt.json")


def verify_prepared(root, spec, package, files, output, stdout, large_inputs):
    prepared = json.loads(output.read_bytes())
    require(prepared == json.loads(stdout), "CLI stdout differs from exclusive candidate file")
    require(prepared["schema"] == "genesis-native-prepared/v1" and re.fullmatch(r"[0-9a-f]{64}", prepared["candidate_id"]),
            "Malformed prepared candidate")
    candidate = prepared["candidate"]
    require(candidate["kind"] == "genesis-native-candidate" and candidate["version"] == 1
            and candidate["reference_commit_verification"] == "external-capture-evidence-required", "Candidate contract changed")
    require(candidate["repo_root"] == str(root) and candidate["observed_head"] == SOURCE, "Prepared root/HEAD mismatch")
    require(candidate["source_revision"] == SOURCE and candidate["scope"] == package["scope"] and candidate["session"] == package["session"],
            "Prepared source/scope/session mismatch")
    require(candidate["transport"]["path"] == spec["package_path"] and candidate["transport"]["sha256"] == spec["package_sha256"],
            "Prepared package provenance mismatch")
    require(candidate["required_artifact_keys"] == package["required_artifact_keys"] and candidate["roots"] == package["roots"],
            "Prepared required keys or roots changed")
    criteria = list(dict.fromkeys([*package["contract"]["criteria"], "runtime-import-binding"]))
    require(candidate["criteria"] == criteria, "Prepared criteria changed")
    references, _, bodies, _, expected_keys, _ = package_requirements(spec, package)
    observations = {row["key"]: row for row in candidate["observations"]}
    require(len(observations) == len(candidate["observations"]) and set(observations) == expected_keys, "Observed input set differs")
    require([entry["key"] for entry in candidate["entries"]] == [item["key"] for item in package["artifacts"]],
            "Prepared artifact execution order differs")
    actual_refs = {json.dumps(row["reference"], sort_keys=True) for row in candidate["references"]}
    require(actual_refs == {json.dumps(ref, sort_keys=True) for ref in references}
            and len(actual_refs) == len(candidate["references"]), "Prepared reference set differs or duplicates occur")
    cas = root / ".atlas/cas"
    require(json.loads((cas / prepared["candidate_id"][:2] / prepared["candidate_id"]).read_bytes()) == candidate,
            "Candidate CAS object differs from output")
    contract = json.loads((cas / candidate["contract"][:2] / candidate["contract"]).read_bytes())
    require(contract == {"kind": "ownership-contract", "version": 1, "criteria": criteria}, "CAS contract differs")
    for reference in candidate["references"]:
        body_id = reference["body"]
        body = json.loads((cas / body_id[:2] / body_id).read_bytes())
        require(body["kind"] == "ownership-body" and body["version"] == 1
                and digest(bytes(body["bytes"])) == reference["reference"]["sha256"], "Preserved reference bytes differ")
    for key, observation in observations.items():
        require(re.fullmatch(r"[0-9a-f]{64}", observation["version"]), f"Invalid kernel input version: {key}")
        require(observation["sha256"] == files[key[5:]]["sha256"], f"Incomplete or incorrect observed bytes: {key}")
    preceding = {}
    for artifact, entry, (body_path, body) in zip(package["artifacts"], candidate["entries"], bodies):
        expected_inputs = list(dict.fromkeys([*artifact["input_keys"], "file:" + reference_path(package["protocol_ref"])]))
        require(entry["inputs"] == [{"key": key, "version": observations[key]["version"]} for key in expected_inputs],
                f"Entry inputs changed: {entry['key']}")
        expected_dependencies = [{"key": dependency["key"], "result": preceding[dependency["key"]]}
                                 for dependency in artifact["build_dependencies"]]
        require(entry["dependencies"] == expected_dependencies, f"Entry dependencies changed: {entry['key']}")
        require(entry["artifact"] == {
            "kind": "ownership-artifact", "version": 1, "key": artifact["key"], "scope": package["scope"],
            "title": artifact["title"], "layer": artifact["layer"], "need": artifact["need"],
            "result": entry["artifact"]["result"], "navigation": artifact["navigation"],
        }, f"Entry metadata changed: {entry['key']}")
        result_id = entry["artifact"]["result"]
        preceding[entry["key"]] = result_id
        result = json.loads((cas / result_id[:2] / result_id).read_bytes())
        body_id = result["body"]
        stored_body = json.loads((cas / body_id[:2] / body_id).read_bytes())
        require(stored_body["kind"] == "ownership-body" and stored_body["version"] == 1, "Wrong CAS body schema")
        actual_body = bytes(stored_body["bytes"])
        require(digest(actual_body) == body["sha256"] == files[body_path]["sha256"] and len(actual_body) == body["byte_length"],
                f"Artifact body was not fully preserved: {entry['key']}")
        for field in ("authority", "validity", "gaps", "evidence"):
            require(result[field] == artifact[field], f"Artifact metadata changed: {entry['key']}:{field}")
    scope = "s1" if spec["id"] == "S1-03" else "s2"
    expected_large = {row["path"]: row for row in large_inputs if row["scope"] == scope}
    actual_large = {key[5:] for key in observations if files[key[5:]]["byte_length"] > 256000}
    require(actual_large == set(expected_large) and len(actual_large) == EXPECTED[spec["id"]][4], "Large input membership differs")
    large = []
    for path in sorted(actual_large):
        data = (root / safe_relative(path)).read_bytes()
        locked = expected_large[path]
        require(len(data) == locked["byte_length"] <= 2097152 and digest(data) == locked["sha256"]
                and blob_digest(data) == locked["git_blob_sha"] and digest(data[-64:]) == locked["tail64_sha256"],
                f"Large input integrity mismatch: {path}")
        large.append({**files[path], "tail64_sha256": digest(data[-64:]), "kernel_version": observations["file:" + path]["version"]})
    return {
        "candidate_id": prepared["candidate_id"], "candidate_file": file_receipt(output),
        "artifact_count": len(candidate["entries"]), "observation_count": len(observations), "large_inputs": large,
        "kernel_identity_verification": "Original @atlas/kernel independently rehashes candidate, each entry inputs/dependencies and complete file bytes. Transport SHA256, Git blob SHA1 and kernel IDs remain distinct.",
    }


def run(args, summary):
    repository = args.repository.resolve()
    runtime = args.runtime_root.resolve()
    state = args.state_dir.resolve()
    evidence = args.output_dir.resolve()
    require(os.environ.get("GITHUB_ACTIONS") == "true", "Execution is restricted to GitHub Actions")
    require(os.geteuid() != 0, "Real permission-denial control requires a non-root runner")
    require(head(repository) == os.environ["GITHUB_SHA"], "Harness checkout differs from GITHUB_SHA")
    require(head(runtime) == RUNTIME and git(runtime, "rev-parse", "HEAD^{tree}").decode().strip() == RUNTIME_TREE,
            "Wrong runtime commit/tree")
    require(not git(runtime, "diff", "--name-only", "HEAD").strip(), "Runtime tracked files were modified")
    require(not state.exists(), "State root must be new")
    require(not evidence.is_relative_to(runtime) and not evidence.is_relative_to(state), "Evidence must be outside runtime/data roots")
    state.mkdir(parents=True)
    lock_bytes = args.lock.read_bytes()
    lock = json.loads(lock_bytes)
    require(lock["schema"] == "genesis-s4-runtime-source-manifest/v1" and lock["runtime_revision"] == RUNTIME
            and lock["source_revision"] == SOURCE and lock["protocol_revision"] == PROTOCOL, "Unexpected input lock")
    require({spec["id"] for spec in lock["packages"]} == set(EXPECTED) and len(lock["packages"]) == 2, "Exactly two pinned packages required")
    needed = {SOURCE, RUNTIME, *[row["commit"] for spec in lock["packages"] for row in spec["files"]]}
    for revision in sorted(needed):
        require(re.fullmatch(r"[0-9a-f]{40}", revision), "Invalid locked revision")
        present = command(["git", "-C", str(repository), "cat-file", "-e", revision + "^{commit}"], repository, check=False)
        if present.returncode:
            git(repository, "fetch", "--no-tags", "origin", revision)
        require(git(repository, "rev-parse", revision + "^{commit}").decode().strip() == revision, "Git commit pin failed")
    env = {key: os.environ[key] for key in ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "GITHUB_ACTIONS", "CI") if key in os.environ}
    summary.update({
        "runtime_revision": RUNTIME, "runtime_tree": RUNTIME_TREE, "harness_revision": head(repository),
        "source_revision": SOURCE, "protocol_revision": PROTOCOL, "input_lock": file_receipt(args.lock),
        "workflow_run_url": f"{os.environ['GITHUB_SERVER_URL']}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
        "run_attempt": os.environ["GITHUB_RUN_ATTEMPT"], "job": os.environ["GITHUB_JOB"],
        "versions": {"bun": command(["bun", "--revision"], runtime, env=env).stdout.decode().strip(),
                     "node": command(["node", "--version"], runtime, env=env).stdout.decode().strip(), "python": sys.version},
        "limits": {"ownership_input_bytes": 2097152, "native_transport_bytes": 8388608},
        "historical_common_gate_before_noble_binding": "https://github.com/gustavomhss/hugr-orchestra/actions/runs/43343953480",
        "fresh_scope": "Full S1-03 and S2 native prepares under the Noble-bound kernel, exact input materialization, and real EACCES refusal",
        "binding": "NOT_ATTEMPTED", "publication": "NOT_ATTEMPTED", "independent_runtime_acceptance": "SEPARATE",
    })
    cache = {}
    positive = []
    for spec in lock["packages"]:
        root = state / spec["id"].lower()
        package, files, provenance = materialize(repository, root, spec, cache)
        write_json(evidence / (spec["id"].lower() + "-materialization.json"), provenance)
        result, output, receipt = prepare(runtime, root, spec, evidence / spec["id"].lower(), env)
        require(result.returncode == 0, f"{spec['id']} original prepare failed: {receipt['stderr']}")
        verification = verify_prepared(root, spec, package, files, output, result.stdout, lock["large_inputs"])
        verification["kernel_check_receipt"] = verify_kernel_ids(runtime, output, env)
        snap = snapshot(root, files)
        write_json(evidence / (spec["id"].lower() + "-verification.json"), {**verification, "state": snap})
        summary["packages"].append({"id": spec["id"], "verdict": "PASS", **verification,
                                    "operation_receipt": file_receipt(output.parent / "receipt.json"),
                                    "cas_inventory_sha256": digest(json.dumps(snap["cas"], sort_keys=True).encode())})
        positive.append((root, files, output, snap, digest(output.read_bytes())))
    spec = next(item for item in lock["packages"] if item["id"] == "S2")
    root = state / "s2-permission-refusal"
    package, files, provenance = materialize(repository, root, spec, cache)
    write_json(evidence / "s2-refusal-materialization.json", provenance)
    target = root / safe_relative(package["artifacts"][0]["source_refs"][0]["path"])
    mode = stat.S_IMODE(target.stat().st_mode)
    permission_denied = False
    try:
        target.chmod(0)
        try:
            target.read_bytes()
        except PermissionError:
            permission_denied = True
        require(permission_denied, "chmod000 did not cause a real read denial")
        result, output, receipt = prepare(runtime, root, spec, evidence / "s2-permission-refusal", env)
        error = json.loads(result.stderr)
        require(result.returncode == 1 and not output.exists() and error.get("kind") == "error"
                and "EACCES" in error.get("error", "") and str(target) in error["error"], "Expected exact EACCES refusal was not observed")
    finally:
        target.chmod(mode)
    require(digest(target.read_bytes()) == files[target.relative_to(root).as_posix()]["sha256"], "Refused input was not restored")
    for old_root, old_files, old_output, old_snapshot, old_digest in positive:
        require(snapshot(old_root, old_files) == old_snapshot and digest(old_output.read_bytes()) == old_digest,
                "Negative control altered a positive root or candidate")
    summary["real_permission_refusal"] = {
        "verdict": "PASS", "uid": os.geteuid(), "path": str(target), "read_probe": "PermissionError",
        "exit_code": receipt["exit_code"], "error": error, "candidate_created": False, "restored_mode": oct(mode),
        "positive_roots_unchanged": True, "operation_receipt": file_receipt(evidence / "s2-permission-refusal/receipt.json"),
    }
    require(not git(runtime, "diff", "--name-only", "HEAD").strip(), "Runtime changed during prepare")
    summary["verdict"] = "PASS_PREPARE_QUALIFICATION"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--runtime-root", type=Path, required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--lock", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir = args.output_dir.resolve()
    args.output_dir.mkdir(parents=True, exist_ok=False)
    summary = {"schema": "genesis-s4-runtime-qualification/v1", "started_at": utc(), "verdict": "FAILED", "packages": []}
    exit_code = 0
    try:
        run(args, summary)
    except Exception as error:
        summary["failure"] = {"type": type(error).__name__, "message": str(error)}
        exit_code = 1
    summary["ended_at"] = utc()
    write_json(args.output_dir / "summary.json", summary)
    write_json(args.output_dir / "evidence-index.json", inventory(args.output_dir))
    print("GENESIS_RUNTIME_QUALIFICATION_JSON=" + json.dumps(summary, sort_keys=True), flush=True)
    print("GENESIS_RUNTIME_EVIDENCE_INDEX_SHA256=" + digest((args.output_dir / "evidence-index.json").read_bytes()), flush=True)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
