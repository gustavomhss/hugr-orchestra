"""S1 operation bridge to the original qualified S4 CLI; Actions only.

No runtime implementation, semantic vote, publication policy or binding is
created here. Full Git worktrees retain real membership for the API package.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import time
import traceback


SOURCE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
PREFIX = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/"
SPECS = {
    "automation": {
        "commit": "2e5b1ff067c85c66647492a9d27af5d535d4cd7e",
        "path": PREFIX + "s1/subslices/03-automation/native-package.json",
        "sha256": "ddada3d4b67cff13ef3a5817b95efc275b0d288061436546c8ec6b73290766a6",
        "artifacts": 12,
        "inputs": 694,
        "expected_candidate_id": "0ff5e4144f7ec153a51ca9615b233219a3ec0bf83b4ee62593921646e64bcb56",
    },
    "api": {
        "commit": "d81a973d98ebe9b1f6db779bfc78af5152f14041",
        "path": PREFIX + "s1/subslices/04-api/native-package.json",
        "sha256": "71bc1102fd5e2c6be166b2df790e8ee8fe4ecd053ab2d7fed5bbc46130349442",
        "artifacts": 16,
        "inputs": 354,
        "expected_candidate_id": "efb8558f751e8e4c4926eec2b736eadc3948230ad368023f5e5d19130b6faac8",
    },
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def blob(raw):
    return hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()


def relative(value):
    require(isinstance(value, str) and value, "Missing relative path")
    require(not re.search(r'[\\:*?"<>|\x00-\x1f\x7f]', value), "Unsafe path")
    require(all(part and part not in (".", "..") and part.lower() not in (".git", ".atlas")
                and not part.endswith((".", " ")) for part in value.split("/")), "Unsafe component")
    return Path(*PurePosixPath(value).parts)


def git(repository, *args, check=True):
    return subprocess.run(["git", "-C", str(repository), *args], check=check,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def capture(repository, revision, path, cache):
    relative(path)
    require(re.fullmatch(r"[0-9a-f]{40}", revision), "Unpinned revision")
    identity = revision, path
    if identity not in cache:
        listing = git(repository, "ls-tree", "-z", revision, "--", path).stdout.split(b"\0")
        rows = [row.split(b"\t", 1)[0].decode().split() for row in listing
                if b"\t" in row and row.split(b"\t", 1)[1].decode() == path]
        require(len(rows) == 1 and rows[0][0] in ("100644", "100755") and rows[0][1] == "blob",
                f"Not one regular Git file: {revision}:{path}")
        raw = git(repository, "cat-file", "blob", rows[0][2]).stdout
        require(blob(raw) == rows[0][2], f"Git blob mismatch: {path}")
        cache[identity] = raw, rows[0][2], rows[0][0]
    return cache[identity]


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def materialize(repository, destination, spec, cache, output):
    require(not destination.exists(), "Isolated data path already exists")
    git(repository, "worktree", "add", "--detach", str(destination), SOURCE)
    require(git(destination, "rev-parse", "HEAD").stdout.decode().strip() == SOURCE, "Wrong data HEAD")
    # A complete baseline checkout contains tracked Atlas project/member files.
    # Preserve those bytes outside the execution root before opening a new CAS;
    # neither historical state nor authority is reused as this execution's state.
    inherited = destination / ".atlas"
    isolated = {"baseline_atlas_present": inherited.exists(), "quarantined_files": [],
                "execution_atlas_before_prepare": "absent", "authority_reused": False}
    if inherited.exists():
        require(inherited.is_dir() and not inherited.is_symlink(), "Unexpected baseline Atlas path")
        for item in sorted(inherited.rglob("*")):
            require(not item.is_symlink(), "Baseline Atlas contains a symlink")
            if not item.is_file():
                continue
            path = item.relative_to(destination).as_posix()
            # This verification is deliberately separate from public input paths:
            # .atlas is never admitted as an artifact source input.
            original = git(repository, "show", SOURCE + ":" + path).stdout
            raw = item.read_bytes()
            require(raw == original, "Baseline Atlas file differs from pinned Git bytes")
            isolated["quarantined_files"].append({"path": path, "sha256": sha(raw),
                                                 "git_blob_sha": blob(raw), "byte_length": len(raw)})
        inherited.rename(output / "baseline-atlas-quarantine")
    require(not inherited.exists(), "Execution Atlas state was not isolated")
    package_raw, _, _ = capture(repository, spec["commit"], spec["path"], cache)
    require(sha(package_raw) == spec["sha256"], "Original package changed")
    package = json.loads(package_raw)
    require(package["source_revision"] == SOURCE, "Wrong source revision")
    require(len(package["artifacts"]) == spec["artifacts"], "Wrong artifact count")
    declared = set(key for artifact in package["artifacts"] for key in artifact["input_keys"])
    require(len(declared) == spec["inputs"], "Wrong input count")
    requests = []
    references = [package["protocol_ref"], package["contract"]["oracle_ref"]]
    bodies = []
    for artifact in package["artifacts"]:
        references.extend([artifact["recipe_ref"], artifact["producer_request_ref"], artifact["producer_response_ref"],
                           *artifact["semantic_review_refs"], *artifact["runtime_receipt_refs"], *artifact["source_refs"]])
        body_path = str(PurePosixPath(spec["path"]).parent / artifact["body"]["path"])
        bodies.append((body_path, artifact["body"]))
        requests.append({"path": body_path, "commit": spec["commit"], "sha256": artifact["body"]["sha256"], "role": "body"})
    for ref in references:
        requests.append({"path": ref.get("path", ref.get("payload_path")), "commit": ref.get("commit", spec["commit"]),
                         "sha256": ref["sha256"], "git_blob_sha": ref.get("git_blob_sha"), "role": "reference"})
    requests.append({"path": spec["path"], "commit": spec["commit"], "sha256": spec["sha256"], "role": "package"})
    known = {row["path"] for row in requests}
    for key in sorted(declared):
        require(key.startswith(("file:", "members:")), "Unknown input kind")
        path = key.split(":", 1)[1]
        relative(path)
        if key.startswith("members:") or path in known:
            continue
        revision = SOURCE if git(repository, "cat-file", "-e", f"{SOURCE}:{path}", check=False).returncode == 0 else spec["commit"]
        requests.append({"path": path, "commit": revision, "role": "declared-file-input"})
    files = {}
    checks = []
    for row in requests:
        raw, git_blob, mode = capture(repository, row["commit"], row["path"], cache)
        require(row.get("sha256") in (None, sha(raw)), f"Declared SHA mismatch: {row['path']}")
        require(row.get("git_blob_sha") in (None, git_blob), f"Declared blob mismatch: {row['path']}")
        require(row["path"] not in files or files[row["path"]]["sha256"] == sha(raw), f"Conflicting source versions: {row['path']}")
        target = destination / relative(row["path"])
        require(not target.is_symlink(), f"Symlink target: {row['path']}")
        require(all(not parent.is_symlink() for parent in target.parents if parent != destination.parent), "Symlink parent")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        target.chmod(0o755 if mode == "100755" else 0o644)
        record = {"path": row["path"], "commit": row["commit"], "git_blob_sha": git_blob,
                  "sha256": sha(raw), "byte_length": len(raw), "role": row["role"]}
        files[row["path"]] = record
        checks.append(record)
    for path, body in bodies:
        require(files[path]["byte_length"] == body["byte_length"], f"Body length mismatch: {path}")
    members = {}
    for key in sorted(declared):
        if key.startswith("members:"):
            output = git(destination, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", key[8:]).stdout
            members[key] = {"git_listing_sha256": sha(output), "paths": sorted(set(x.decode() for x in output.split(b"\0") if x))}
    return package, {"schema": "genesis-s1-git-materialization/v1", "source_revision": SOURCE,
                     "observed_head": git(destination, "rev-parse", "HEAD").stdout.decode().strip(),
                     "root": str(destination), "mode": "full-baseline-Git-worktree-with-exact-referenced-payloads",
                     "package": spec, "declared_input_count": len(declared), "files": list(files.values()),
                     "reference_checks": checks, "membership": members, "atlas_isolation": isolated}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--runtime-revision", required=True)
    parser.add_argument("--release-commit", required=True)
    parser.add_argument("--selection", choices=SPECS, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    require(os.environ.get("GITHUB_ACTIONS") == "true", "Product operations run only in Actions")
    require(not args.output.exists(), "Output must be new")
    args.output.mkdir(parents=True)
    cache = {}
    release_raw, release_blob, _ = capture(args.repository, args.release_commit, PREFIX + "s4/runtime-release.json", cache)
    release = json.loads(release_raw)
    capability = release["capabilities"]["native_import"]
    require(capability["state"] == "PROVEN" and capability.get("candidate_revision", release["candidate_revision"]) == args.runtime_revision,
            "Runtime is not the pinned S4 native-import release")
    require(git(args.runtime, "rev-parse", "HEAD").stdout.decode().strip() == args.runtime_revision, "Runtime HEAD mismatch")
    (args.output / "runtime-release.json").write_bytes(release_raw)
    package, provenance = materialize(args.repository, args.root, SPECS[args.selection], cache, args.output)
    save(args.output / "materialization.json", provenance)
    argv = ["bun", "scripts/genesis-native.ts", "prepare", str(args.root), SPECS[args.selection]["path"], str(args.output / "prepared.json")]
    started = time.time()
    result = subprocess.run(argv, cwd=args.runtime / "modules/atlas", stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    (args.output / "prepare.stdout").write_bytes(result.stdout)
    (args.output / "prepare.stderr").write_bytes(result.stderr)
    receipt = {"schema": "genesis-s1-native-operation/v1", "operation": "prepare", "selection": args.selection,
               "runtime_revision": args.runtime_revision, "runtime_release_commit": args.release_commit,
               "runtime_release_sha256": sha(release_raw), "runtime_release_git_blob": release_blob,
               "argv": argv, "cwd": str(args.runtime / "modules/atlas"), "exit_code": result.returncode,
               "started_at_unix": started, "ended_at_unix": time.time(), "run_id": os.environ.get("GITHUB_RUN_ID"),
               "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"), "workflow_revision": os.environ.get("GITHUB_SHA"),
               "stdout_sha256": sha(result.stdout), "stderr_sha256": sha(result.stderr),
               "original_cli": True, "runtime_modified": False, "binding_created": False, "publication_attempted": False}
    prepared_path = args.output / "prepared.json"
    if prepared_path.exists():
        prepared = json.loads(prepared_path.read_bytes())
        require(prepared["candidate_id"] == SPECS[args.selection]["expected_candidate_id"], "Previously observed candidate identity changed")
        require(prepared["candidate"]["repo_root"] == str(args.root), "Prepared root mismatch")
        require(prepared["candidate"]["observed_head"] == SOURCE, "Prepared observed HEAD mismatch")
        require(prepared["candidate"]["transport"]["sha256"] == SPECS[args.selection]["sha256"], "Prepared transport mismatch")
        receipt.update({"candidate_id": prepared["candidate_id"], "contract": prepared["candidate"]["contract"],
                        "prepared_sha256": sha(prepared_path.read_bytes()), "entries": len(prepared["candidate"]["entries"]),
                        "observations": len(prepared["candidate"]["observations"])})
    save(args.output / "prepare-receipt.json", receipt)
    if result.returncode == 0:
        preserve_prepared_objects(args, package, prepared)
    print("GENESIS_S1_NATIVE_RECEIPT=" + json.dumps(receipt, sort_keys=True))
    if result.returncode:
        print(result.stderr.decode(errors="replace"))
    raise SystemExit(result.returncode)


def preserve_prepared_objects(args, package, prepared):
    """Export immutable evidence, then ask the released kernel/observer to verify IDs.

    This is an operator evidence check in Actions, not a replacement implementation
    of prepare, binding, publication or the qualified common runtime controls.
    """
    cas = args.root / ".atlas/cas"
    require(sorted(item.name for item in cas.parent.iterdir()) == ["cas"], "Prepare wrote state outside CAS")
    target = args.output / "cas"
    target.mkdir()
    inventory = []
    for item in sorted(cas.rglob("*")):
        require(not item.is_symlink(), "CAS export encountered symlink")
        if item.is_dir():
            continue
        require(item.is_file() and re.fullmatch(r"[0-9a-f]{64}", item.name), "Unexpected CAS entry")
        relative_path = item.relative_to(cas)
        require(relative_path.as_posix() == item.name[:2] + "/" + item.name, "Unexpected CAS shard")
        raw = item.read_bytes()
        destination = target / relative_path
        destination.parent.mkdir(exist_ok=True)
        with destination.open("xb") as stream:
            stream.write(raw)
        inventory.append({"id": item.name, "path": "cas/" + relative_path.as_posix(),
                          "byte_length": len(raw), "sha256": sha(raw)})
    save(args.output / "cas-inventory.json", {"schema": "genesis-s1-cas-export/v1", "objects": inventory})
    def obj(identity):
        return json.loads((cas / identity[:2] / identity).read_bytes())
    candidate = prepared["candidate"]
    require(obj(prepared["candidate_id"]) == candidate, "Candidate CAS differs from prepared")
    require(obj(candidate["contract"]) == {"kind": "ownership-contract", "version": 1, "criteria": candidate["criteria"]},
            "Contract CAS differs from declared criteria")
    require(prepared == json.loads((args.output / "prepare.stdout").read_bytes()), "CLI output differs from prepared file")
    by_key = {artifact["key"]: artifact for artifact in package["artifacts"]}
    for entry in candidate["entries"]:
        artifact = by_key[entry["key"]]
        result = obj(entry["artifact"]["result"])
        body = obj(result["body"])
        raw = bytes(body["bytes"])
        require(body["kind"] == "ownership-body" and body["version"] == 1 and
                sha(raw) == artifact["body"]["sha256"] and len(raw) == artifact["body"]["byte_length"], "Artifact body CAS mismatch")
        for field in ("authority", "validity", "gaps", "evidence"):
            require(result[field] == artifact[field], "Artifact result metadata mismatch")
    for reference in candidate["references"]:
        body = obj(reference["body"])
        require(body["kind"] == "ownership-body" and body["version"] == 1 and
                sha(bytes(body["bytes"])) == reference["reference"]["sha256"], "Reference CAS mismatch")
    program = r'''
const { readFileSync } = await import("node:fs");
const { join } = await import("node:path");
const { id } = await import("@atlas/kernel");
const { observeOwnershipInput } = await import("./packages/adapter-io/src/ownership-input.ts");
const prepared = JSON.parse(readFileSync(process.env.GENESIS_PREPARED_FILE, "utf8"));
const candidate = prepared.candidate;
const inventory = JSON.parse(readFileSync(process.env.GENESIS_CAS_INVENTORY, "utf8"));
const checks = [{kind:"candidate",actual:String(id(candidate)),expected:prepared.candidate_id}];
for (const entry of candidate.entries)
  checks.push({kind:"entry-inputs",key:entry.key,actual:String(id({inputs:entry.inputs,dependencies:entry.dependencies})),expected:entry.inputs_id});
for (const observed of candidate.observations) {
  const reobserved = observeOwnershipInput(candidate.repo_root, observed.key);
  checks.push({kind:"original-observer",key:observed.key,state:reobserved.kind,actual:reobserved.kind === "present" ? reobserved.version : null,expected:observed.version});
}
for (const object of inventory.objects) {
  const value = JSON.parse(readFileSync(join(process.env.GENESIS_EVIDENCE_ROOT, object.path), "utf8"));
  checks.push({kind:"cas-object",key:object.id,actual:String(id(value)),expected:object.id});
}
console.log(JSON.stringify({schema:"genesis-s1-original-kernel-verification/v1",checks}));
if (checks.some(check => check.actual !== check.expected)) process.exitCode=1;
'''
    argv = ["bun", "--eval", program]
    env = {**os.environ, "GENESIS_PREPARED_FILE": str(args.output / "prepared.json"),
           "GENESIS_CAS_INVENTORY": str(args.output / "cas-inventory.json"), "GENESIS_EVIDENCE_ROOT": str(args.output)}
    result = subprocess.run(argv, cwd=args.runtime / "modules/atlas", env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    (args.output / "kernel-identities.json").write_bytes(result.stdout)
    (args.output / "kernel-identities.stderr").write_bytes(result.stderr)
    receipt = {"schema": "genesis-s1-cas-verification/v1", "runtime_revision": args.runtime_revision,
               "runtime_tree": git(args.runtime, "rev-parse", "HEAD^{tree}").stdout.decode().strip(),
               "runtime_tracked_diff": git(args.runtime, "diff", "--no-ext-diff", "HEAD").stdout.decode(),
               "candidate_id": prepared["candidate_id"], "argv": argv, "exit_code": result.returncode,
               "stdout_sha256": sha(result.stdout), "stderr_sha256": sha(result.stderr),
               "cas_inventory_sha256": sha((args.output / "cas-inventory.json").read_bytes()),
               "cas_objects": len(inventory), "observer_checks": len(candidate["observations"]),
               "membership_checks": sum(row["key"].startswith("members:") for row in candidate["observations"]),
               "body_and_reference_bytes_verified": True, "authority_or_projection_created": False}
    save(args.output / "cas-verification-receipt.json", receipt)
    require(result.returncode == 0, "Original kernel or observer verification failed")
    checks = json.loads(result.stdout)["checks"]
    require(len(checks) == 1 + len(candidate["entries"]) + len(candidate["observations"]) + len(inventory), "Incomplete verification")
    require(all(check["actual"] == check["expected"] for check in checks), "Kernel identities changed")
    require(receipt["runtime_tracked_diff"] == "", "Runtime tracked code changed")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        detail = traceback.format_exc()
        if "--output" in sys.argv:
            failure_root = Path(sys.argv[sys.argv.index("--output") + 1])
            failure_root.mkdir(parents=True, exist_ok=True)
            (failure_root / "bridge-failure.txt").write_text(detail)
        raise
