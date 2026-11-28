#!/usr/bin/env python3
"""S3 operational Actions bridge proposal; never manufactures reviews or consumer answers."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile

SOURCE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
PROTOCOL = "ee2521a5b966bd505cc95bd1c733e09e12f33531"


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def utc():
    return datetime.now(timezone.utc).isoformat()


def relative(value, state=False):
    require(isinstance(value, str) and value and not value.startswith("/"), "Invalid relative path")
    require(not re.search(r'[\\:*?"<>|\x00-\x1f\x7f]', value), "Unsafe path characters")
    parts = value.split("/")
    require(all(p not in ("", ".", "..", ".git") and not p.endswith((".", " ")) for p in parts), "Unsafe path components")
    require(state or ".atlas" not in parts, "Atlas state is not a source input")
    return Path(*PurePosixPath(value).parts)


def command(argv, cwd, env=None):
    return subprocess.run(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def git(repo, *args):
    result = command(["git", "-C", str(repo), *args], repo)
    require(result.returncode == 0, f"Git operation failed: {args!r}: {result.stderr.decode(errors='replace')[-1500:]}")
    return result.stdout


def pin(value, length):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{" + str(length) + "}", value), "Missing immutable hash pin")
    return value


def read_ref(repo, ref, allow_baseline_hash_measurement=False):
    commit = pin(ref["commit"], 40)
    path = relative(ref["path"]).as_posix()
    rows = git(repo, "ls-tree", "-z", commit, "--", path).split(b"\0")
    exact = [r.split(b"\t", 1)[0].decode().split() for r in rows if b"\t" in r and r.split(b"\t", 1)[1].decode() == path]
    require(len(exact) == 1 and exact[0][0] in ("100644", "100755") and exact[0][1] == "blob", "Reference is not one regular Git blob: " + path)
    raw = git(repo, "show", commit + ":" + path)
    blob = hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()
    require(blob == exact[0][2], "Git object digest mismatch: " + path)
    if ref["sha256"] is None:
        require(allow_baseline_hash_measurement and commit == SOURCE, "SHA256 measurement is permitted only for pinned baseline-only file inputs")
        require(ref.get("sha256_state") == "TO_BE_MEASURED_FROM_PINNED_GIT_BLOB", "Missing explicit unmeasured baseline hash state")
        require(pin(ref.get("git_blob_sha"), 40) == blob and isinstance(ref.get("byte_length"), int) and ref["byte_length"] == len(raw), "Baseline Git blob/length mismatch")
    else:
        require(digest(raw) == pin(ref["sha256"], 64), "Reference SHA256 mismatch: " + path)
    require(ref.get("git_blob_sha", blob) == blob and ref.get("byte_length", len(raw)) == len(raw), "Reference identity mismatch: " + path)
    return raw


def put(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        require(path.is_file() and not path.is_symlink() and path.read_bytes() == raw, "Refusing to replace existing bytes: " + str(path))
        return
    with path.open("xb") as stream:
        stream.write(raw)


def write_json(path, value):
    put(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())


def file_receipt(path):
    raw = path.read_bytes()
    return {"path": str(path), "byte_length": len(raw), "sha256": digest(raw)}


def inventory(root):
    rows = []
    for path in sorted(root.rglob("*")):
        if path == root / ".git" or ".git" in path.relative_to(root).parts:
            continue
        if path.is_symlink():
            link = os.readlink(path)
            rows.append({"path": path.relative_to(root).as_posix(), "kind": "symlink", "target": link, "sha256": digest(link.encode())})
            continue
        if path.is_file():
            rows.append({**file_receipt(path), "path": path.relative_to(root).as_posix()})
    return rows


def load_plan(args):
    plan = json.loads(args.plan.read_bytes())
    require(os.environ.get("GITHUB_ACTIONS") == "true", "Run only in GitHub Actions")
    require(os.environ.get("GITHUB_REPOSITORY") == "gustavomhss/hugr-orchestra", "Unexpected repository")
    require(os.environ.get("GITHUB_REF") == "refs/heads/genesis-s3-resume", "Unexpected branch")
    require(plan["schema"] == "genesis-s3-operation-plan/v1" and plan["state"] == "READY", "Plan remains blocked until immutable pins are reviewed")
    require(plan["operation"] in ("prepare", "publish", "read"), "Unknown operation")
    require(isinstance(plan["execution_id"], str) and re.fullmatch(r"[a-z0-9-]{8,80}", plan["execution_id"]), "Execution identity missing")
    require(plan["source_revision"] == SOURCE and plan["protocol_revision"] == PROTOCOL, "Epoch mismatch")
    pin(plan["runtime"]["revision"], 40)
    pin(plan["runtime"]["tree"], 40)
    release = read_ref(args.repository, plan["runtime"]["release"])
    released = json.loads(release)
    require(isinstance(released, dict) and released.get("candidate_revision") == plan["runtime"]["revision"], "Release does not identify the selected native runtime revision")
    require(released.get("candidate_tree") == plan["runtime"]["tree"], "Released runtime tree mismatch")
    require(released.get("source_revision") == SOURCE and released.get("protocol_revision") == PROTOCOL, "Released epoch mismatch")
    # Compatibility is reviewed against the pinned release by the primary before READY.
    # This pin check alone does not certify a release or fabricate a capability PASS.
    package = json.loads(read_ref(args.repository, plan["package"]))
    require(package["session"] == "S3" and package["scope"] == plan["scope"], "Wrong package identity")
    require(package["source_revision"] == SOURCE and package["protocol_ref"]["commit"] == PROTOCOL, "Wrong package epoch")
    keys = [a["key"] for a in package["artifacts"]]
    require(len(keys) == len(set(keys)) == 11 and set(keys) == set(plan["package"]["artifact_keys"]), "S3 needs exactly the selected eleven artifacts")
    require(not package["missing_required_artifact_keys"] and set(package["required_artifact_keys"]) == set(keys), "Incomplete package")
    require(all(len(a["semantic_review_refs"]) >= 2 for a in package["artifacts"]), "Both preserved semantic decisions required per artifact")
    if plan["operation"] != "prepare":
        pin(plan["restore"]["archive_sha256"], 64)
        pin(plan["restore"]["candidate_id"], 64)
        for field in ("run_id", "artifact_id"):
            require(isinstance(plan["restore"][field], int) and plan["restore"][field] > 0, "Restore artifact identity missing")
    return plan, package


def data_worktree(repo, root):
    require(not root.exists(), "Isolated source root already exists")
    git(repo, "worktree", "add", "--detach", str(root), SOURCE)
    require(root.resolve() == root and git(root, "rev-parse", "HEAD").decode().strip() == SOURCE, "Invalid real worktree identity")
    # Historical project/member logs are source history, never the fresh operational store.
    # Preserve them separately; no input may name .atlas and no membership prefix is removed.
    if (root / ".atlas").exists():
        shutil.move(root / ".atlas", root.parent / "baseline-atlas-history")
    history = root.parent / "baseline-atlas-history"
    write_json(root.parent / "baseline-state-separation.json", {"source_revision": SOURCE, "omitted_runtime_directory": ".atlas", "preserved_at": str(history), "durable_original": "Git source revision, unchanged", "history_files": inventory(history) if history.exists() else [], "initial_git_index_matches_source": True, "subsequent_index_overlay": "Only exact pinned protocol-tree entries; independently recorded and restored before native observation", "historical_source_not_replayed": True})


def overlay(root, path, raw):
    target = root / relative(path, state=True)
    for parent in [target, *target.parents]:
        if parent == root:
            break
        require(not parent.is_symlink(), "Overlay would traverse a symlink")
    before = file_receipt(target) if target.is_file() else None
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    return {"path": path, "before": before, "after": file_receipt(target)}


def pin_membership_index(root, prefix, files):
    """Track only real pinned protocol blobs so inherited ignores cannot omit them.

    This deliberately augments the isolated worktree index; HEAD stays SOURCE.
    It neither edits ignore rules nor replaces/deletes any existing source entry.
    """
    before = git(root, "ls-files", "--stage", "-z")
    existing = git(root, "ls-files", "--stage", "-z", "--", ":(literal)" + prefix)
    expected = {f"{row['mode']} {row['git_blob_sha']} 0\t{row['path']}".encode() for row in files}
    existing_records = set(existing.split(b"\0")) - {b""}
    require(not existing_records or existing_records == expected, "Protocol index already contains unrelated or mismatched entries")
    ignored = command(["git", "-C", str(root), "check-ignore", "-v", "--", *[row["path"] for row in files]], root)
    require(ignored.returncode in (0, 1) and ignored.stderr == b"", "Cannot inspect protocol ignore rules")
    for row in files:
        git(root, "update-index", "--add", "--cacheinfo", f"{row['mode']},{row['git_blob_sha']},{row['path']}")
    after = git(root, "ls-files", "--stage", "-z")
    after_protocol = set(git(root, "ls-files", "--stage", "-z", "--", ":(literal)" + prefix).split(b"\0")) - {b""}
    before_records = set(before.split(b"\0")) - {b""}
    after_records = set(after.split(b"\0")) - {b""}
    require(after_protocol == expected and after_records == before_records | expected, "Protocol index overlay changed an unrelated source entry")
    require(git(root, "rev-parse", "HEAD").decode().strip() == SOURCE, "Protocol index overlay changed HEAD")
    return {"kind": "explicit-pinned-protocol-index-overlay", "prefix": prefix, "file_count": len(files), "added_entries": len(after_records - before_records), "head": SOURCE, "before_index_sha256": digest(before), "after_index_sha256": digest(after), "source_entries_removed_or_replaced": False, "ignore_rules_changed": False, "prior_ignore_stdout": ignored.stdout.decode(), "prior_ignore_exit_code": ignored.returncode, "entries": [{key: row[key] for key in ("path", "mode", "git_blob_sha", "commit", "sha256")} for row in files]}


def materialize_membership_trees(args, root, declarations, missing_prefixes):
    require(isinstance(declarations, list), "Membership materializations must be explicit")
    prefixes = [row["prefix"] for row in declarations]
    require(len(prefixes) == len(set(prefixes)) and set(prefixes) == missing_prefixes, "Every membership absent from SOURCE needs exactly one complete pinned tree materialization")
    observed = []
    for tree in declarations:
        prefix = relative(tree["prefix"]).as_posix()
        commit = pin(tree["commit"], 40)
        tree_sha = pin(tree["git_tree_sha"], 40)
        require(tree.get("input_key", "members:" + prefix) == "members:" + prefix, "Membership prefix/input key mismatch")
        require(tree.get("complete_tree") is True and tree.get("tree_truncated") is False, "Membership materialization must capture a complete tree")
        source_entry = git(args.repository, "ls-tree", "-z", SOURCE, "--", prefix)
        require(source_entry == b"", "Membership tree overlay is only permitted for a prefix absent from SOURCE")
        entry = git(args.repository, "ls-tree", "-d", "-z", commit, "--", prefix)
        require(entry == f"040000 tree {tree_sha}\t{prefix}\0".encode(), "Pinned membership tree differs from its commit/path")
        listing = git(args.repository, "ls-tree", "-r", "-l", "-z", commit, "--", prefix)
        require(not listing or listing.endswith(b"\0"), "Incomplete recursive Git tree listing")
        expected = {}
        for raw in listing.split(b"\0"):
            if not raw:
                continue
            metadata, path_bytes = raw.split(b"\t", 1)
            mode, kind, blob, size = metadata.decode().split()
            path = relative(path_bytes.decode()).as_posix()
            require(path.startswith(prefix + "/") and mode in ("100644", "100755") and kind == "blob", "Membership tree contains a nonregular or out-of-prefix entry")
            require(path not in expected, "Duplicate Git tree path")
            expected[path] = {"mode": mode, "git_blob_sha": blob, "byte_length": int(size)}
        files = tree["files"]
        paths = [row["path"] for row in files]
        require(len(paths) == len(set(paths)) == tree["file_count"] and set(paths) == set(expected), "Membership pins do not cover the complete recursive tree")
        verified = []
        for row in files:
            wanted = expected[row["path"]]
            length = row.get("byte_length", row.get("size"))
            require(row["commit"] == commit and row["git_blob_sha"] == wanted["git_blob_sha"] and row["mode"] == wanted["mode"] and type(length) is int and length == wanted["byte_length"], "Membership file identity differs from the pinned tree")
            require("size" not in row or row["size"] == length, "Conflicting membership file lengths")
            pin(row["sha256"], 64)
            ref = {"commit": commit, "path": row["path"], **wanted, "sha256": row["sha256"]}
            raw = read_ref(args.repository, ref)
            target = root / relative(row["path"])
            require(not target.exists() or (target.is_file() and target.read_bytes() == raw), "Membership tree conflicts with an already materialized file input/reference")
            overlay(root, row["path"], raw)
            verified.append({**ref, "sha256_state": "VERIFIED_BEFORE_PREPARE"})
        actual_paths = {p.relative_to(root).as_posix() for p in (root / relative(prefix)).rglob("*") if p.is_file() or p.is_symlink()}
        require(actual_paths == set(expected), "Membership materialization has missing or extra files")
        index_overlay = pin_membership_index(root, prefix, verified)
        observed.append({"input_key": "members:" + prefix, "prefix": prefix, "commit": commit, "git_tree_sha": tree_sha, "complete_tree": True, "tree_truncated": False, "file_count": len(verified), "files": verified, "source_prefix_absent": True, "index_overlay": index_overlay})
    return observed


def materialize(args, plan, package, root):
    lock = json.loads(read_ref(args.repository, plan["input_lock"]))
    require(lock["schema"] == "genesis-s3-input-lock/v1" and lock["source_revision"] == SOURCE and lock["package_sha256"] == plan["package"]["sha256"], "Input lock mismatch")
    refs = [package["protocol_ref"], package["contract"]["oracle_ref"]]
    required = {plan["package"]["path"]}
    strict_paths = {plan["package"]["path"]}
    file_inputs = set()
    members = set()
    for artifact in package["artifacts"]:
        refs += [artifact["recipe_ref"], artifact["producer_request_ref"], artifact["producer_response_ref"], *artifact["semantic_review_refs"], *artifact["runtime_receipt_refs"], *artifact["source_refs"]]
        for key in artifact["input_keys"]:
            require(key.startswith(("file:", "members:")), "Unknown ownership input prefix")
            if key.startswith("members:"):
                members.add(key[8:])
                continue
            required.add(key[5:])
            file_inputs.add(key[5:])
        body_path = str(PurePosixPath(plan["package"]["path"]).parent / artifact["body"]["path"])
        required.add(body_path)
        strict_paths.add(body_path)
    strict_paths.update(ref.get("payload_path", ref.get("path")) for ref in refs)
    required.update(strict_paths)
    paths = [row["path"] for row in lock["files"]]
    require(len(paths) == len(set(paths)) and set(paths) == required, "Input lock must contain exactly all package dependencies and references")
    data_worktree(args.repository, root)
    missing_members = {prefix for prefix in members if not (root / relative(prefix)).is_dir()}
    overlays = []
    observed_files = []
    for row in lock["files"]:
        baseline_only = row["path"] in file_inputs and row["path"] not in strict_paths
        raw = read_ref(args.repository, row, allow_baseline_hash_measurement=baseline_only)
        overlays.append(overlay(root, row["path"], raw))
        observed_files.append({**row, "sha256": digest(raw), "byte_length": len(raw), "sha256_state": "MEASURED_FROM_PINNED_GIT_BLOB_BEFORE_PREPARE" if row["sha256"] is None else "VERIFIED_BEFORE_PREPARE"})
    tree_materializations = materialize_membership_trees(args, root, lock.get("membership_materializations", []), missing_members)
    materialized_members = {row["prefix"]: {file["path"] for file in row["files"]} for row in tree_materializations}
    for ref in refs:
        path = ref.get("payload_path", ref.get("path"))
        require(digest((root / relative(path)).read_bytes()) == ref["sha256"], "Preserved transport reference differs: " + path)
    require(digest((root / relative(plan["package"]["path"])).read_bytes()) == plan["package"]["sha256"], "Materialized package differs")
    membership = []
    for prefix in sorted(members):
        relative(prefix)
        result = command(["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ":(literal)" + prefix], root)
        require(result.returncode == 0 and result.stderr == b"", "Incomplete membership enumeration")
        require(not result.stdout or result.stdout.endswith(b"\0"), "Malformed membership output")
        names = sorted(set(result.stdout.decode().split("\0")) - {""})
        require(all((root / relative(name)).is_file() and not (root / name).is_symlink() for name in names), "Membership has missing/nonregular/symlink entries")
        require(prefix not in materialized_members or set(names) == materialized_members[prefix], "Effective Git membership differs from the complete materialized tree")
        membership.append({"key": "members:" + prefix, "paths": names, "enumeration_sha256": digest(result.stdout)})
    write_json(args.output / "input-lock.observed.json", {**lock, "declared_lock_ref": plan["input_lock"], "measurement_completed_before_prepare": True, "files": observed_files, "membership_materializations": tree_materializations})
    write_json(args.output / "materialization.json", {"observed_head": SOURCE, "root": str(root), "source_checkout": "complete real source checkout, immutable-reference overlays, historical .atlas separated outside the served root", "source_git_index_unchanged": not bool(tree_materializations), "index_change_scope": "Only exact pinned protocol-tree entries; original source index entries and ignore rules unchanged", "overlays": overlays, "files": observed_files, "observed_lock": file_receipt(args.output / "input-lock.observed.json"), "memberships": membership, "membership_materializations": tree_materializations})


def restore(args, plan, root, prepared_path):
    archive = args.restore / "state.tar.gz"
    require(digest(archive.read_bytes()) == plan["restore"]["archive_sha256"], "Prior state archive mismatch")
    data_worktree(args.repository, root)
    state = None
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle:
            require(member.isfile() or member.issym(), "Archive must contain regular files or pinned-source symlinks")
            path = relative(member.name, state=True)
            require(path.parts[0] == "source" or member.name in ("prepared.json", "state.json"), "Unexpected archive member")
            if member.issym():
                require(path.parts[0] == "source", "Symlink outside source")
                target = root / Path(*path.parts[1:])
                require(target.is_symlink() and os.readlink(target) == member.linkname, "Only unchanged symlinks from the real source checkout may be restored")
                continue
            raw = bundle.extractfile(member).read()
            if member.name == "state.json":
                state = json.loads(raw)
            elif member.name == "prepared.json":
                put(prepared_path, raw)
            else:
                overlay(root, Path(*path.parts[1:]).as_posix(), raw)
    require(state is not None and state["repo_root"] == str(root) and state["runtime_revision"] == plan["runtime"]["revision"], "Restored runtime/root mismatch")
    require(state["package_sha256"] == plan["package"]["sha256"] and state["source_revision"] == SOURCE, "Restored package/source mismatch")
    require(state["files"] == inventory(root), "Restored files differ from preserved complete inventory")
    lock = json.loads(read_ref(args.repository, plan["input_lock"]))
    trees = lock.get("membership_materializations", [])
    restored_indexes = materialize_membership_trees(args, root, trees, {row["prefix"] for row in trees})
    require(state["git_index_sha256"] == digest(git(root, "ls-files", "--stage", "-z")), "Restored Git index differs from the pinned source/protocol index")
    prepared = json.loads(prepared_path.read_bytes())
    require(prepared["candidate_id"] == state["candidate_id"] == plan["restore"]["candidate_id"], "Restored candidate identity mismatch")
    if plan["operation"] == "read":
        require(state["ownership_manifest"] == pin(plan["restore"]["ownership_manifest"], 64), "Read requires the published manifest")
    write_json(args.output / "restoration.json", {"archive": file_receipt(archive), "state": state, "source_git_head": SOURCE, "git_metadata_recreated_from_real_commit": True, "protocol_index_restored": restored_indexes})
    return state


def operation(args, root, name, extra, env, receipt_name):
    argv = [shutil.which("bun"), "scripts/genesis-native.ts", name, str(root), *extra]
    require(argv[0] is not None, "Bun unavailable")
    start = utc()
    result = command(argv, args.runtime / "modules/atlas", env)
    stdout = args.output / (receipt_name + ".stdout.json")
    stderr = args.output / (receipt_name + ".stderr.txt")
    put(stdout, result.stdout)
    put(stderr, result.stderr)
    write_json(args.output / (receipt_name + ".receipt.json"), {"operation": name, "argv": argv, "cwd": str(args.runtime / "modules/atlas"), "started_at": start, "ended_at": utc(), "exit_code": result.returncode, "stdout": file_receipt(stdout), "stderr": file_receipt(stderr), "environment_names": sorted(env), "original_cli": True})
    return result


def provision_authority(args, plan, root):
    authority = plan["authority"]
    require(authority["actor"] == authority["ratifier"] == "/root", "Use only the actual primary's declared responsibility in this proposal")
    authorization = read_ref(args.repository, authority["authorization"])
    policy = read_ref(args.repository, authority["policy"])
    parsed = json.loads(policy)
    require(parsed["authz"]["scopes"] == {plan["scope"]: [authority["actor"]]} and parsed["authz"]["anchors"] == {".": plan["scope"]}, "Policy must grant only the isolated S3 scope/root")
    existed = (root / ".atlas/policy.json").exists()
    put(root / ".atlas/policy.json", policy)
    put(args.output / "authorization.md", authorization)
    write_json(args.output / "policy-provisioning.json", {"scope": plan["scope"], "actor": authority["actor"], "ratifier": authority["ratifier"], "authorization_ref": authority["authorization"], "policy_ref": authority["policy"], "created_if_absent": not existed, "existing_policy_overwritten": False, "identity_assurance": "Named local responsibility under the user's isolated-publication assignment; not a secret, credential, cryptographic authentication, production activation or synthetic review"})
    return {"ATLAS_ACTOR": authority["actor"], "ATLAS_RATIFY_TOKEN": authority["ratifier"]}


def preserve(args, plan, root, prepared_path, manifest, publication_attempted):
    if not root.is_dir():
        return
    prepared = json.loads(prepared_path.read_bytes()) if prepared_path.exists() else None
    if prepared is not None:
        require(prepared["candidate"]["repo_root"] == str(root) and prepared["candidate"]["observed_head"] == SOURCE, "Candidate root/HEAD differs")
    state = {"schema": "genesis-s3-state/v1", "repo_root": str(root), "source_revision": SOURCE, "runtime_revision": plan["runtime"]["revision"], "release_ref": plan["runtime"]["release"], "package_sha256": plan["package"]["sha256"], "candidate_id": prepared["candidate_id"] if prepared else None, "ownership_manifest": manifest, "publication_attempted": publication_attempted, "last_operation": plan["operation"], "git_index_sha256": digest(git(root, "ls-files", "--stage", "-z")), "files": inventory(root)}
    write_json(args.output / "state.json", state)
    with tarfile.open(args.output / "state.tar.gz", "w:gz", dereference=False) as bundle:
        for row in state["files"]:
            bundle.add(root / row["path"], arcname="source/" + row["path"], recursive=False)
        if prepared_path.exists():
            bundle.add(prepared_path, arcname="prepared.json", recursive=False)
        bundle.add(args.output / "state.json", arcname="state.json", recursive=False)
    receipt = file_receipt(args.output / "state.tar.gz")
    write_json(args.output / "state-archive.receipt.json", receipt)
    print("S3_STATE_ARCHIVE=" + json.dumps(receipt), flush=True)


def run(args, plan, package):
    args.output.mkdir(parents=True, exist_ok=False)
    root = Path("/tmp") / ("genesis-s3-" + plan["execution_id"]) / "source"
    root.parent.mkdir(parents=True, exist_ok=False)
    prepared_path = args.output / "prepared.json"
    manifest = None
    publication_attempted = False
    summary = {"schema": "genesis-s3-operation-receipt/v1", "operation": plan["operation"], "started_at": utc(), "status": "FAILED", "source_revision": SOURCE, "runtime_revision": plan["runtime"]["revision"], "plan": file_receipt(args.plan), "run_id": os.environ["GITHUB_RUN_ID"], "run_attempt": os.environ["GITHUB_RUN_ATTEMPT"], "harness_sha": os.environ["GITHUB_SHA"], "consumer_verdict": "NOT_JUDGED"}
    status = 1
    try:
        require(git(args.runtime, "rev-parse", "HEAD").decode().strip() == plan["runtime"]["revision"], "Runtime HEAD drift")
        require(git(args.runtime, "rev-parse", "HEAD^{tree}").decode().strip() == plan["runtime"]["tree"], "Runtime tree drift")
        require(not git(args.runtime, "diff", "--name-only", "HEAD").strip(), "Runtime tracked changes")
        env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "GITHUB_ACTIONS", "CI") if k in os.environ}
        if plan["operation"] == "prepare":
            materialize(args, plan, package, root)
            result = operation(args, root, "prepare", [plan["package"]["path"], str(prepared_path)], env, "prepare")
            require(result.returncode == 0 and prepared_path.exists(), "Original prepare did not succeed; inspect raw receipt")
            require(json.loads(result.stdout) == json.loads(prepared_path.read_bytes()), "Prepared file/stdout mismatch")
        else:
            prior = restore(args, plan, root, prepared_path)
            manifest = prior["ownership_manifest"]
            publication_attempted = prior["publication_attempted"]
            tracked = git(root, "ls-files", "-z", "--", ".atlas").decode().split("\0")
            require(not any(p.startswith(".atlas/cas/") or re.fullmatch(r"\.atlas/(projection|staging)(\.\d+)?\.json", p) for p in tracked), "Durable Atlas state is tracked; do not bypass provenance")
            if plan["operation"] == "publish":
                require(manifest is None and not prior["publication_attempted"], "Publication was already attempted; resolve its prior result before any retry")
                approval = read_ref(args.repository, plan["binding"])
                for row in plan["binding"]["files"]:
                    put(root / relative(row["path"]), read_ref(args.repository, row))
                put(root / relative(plan["binding"]["path"]), approval)
                env.update(provision_authority(args, plan, root))
                publication_attempted = True
                result = operation(args, root, "publish", [str(prepared_path), plan["binding"]["path"]], env, "publish")
                require(result.returncode == 0, "Original publish did not succeed; preserve its HOLD/error, never weaken the gate")
                observed = json.loads(result.stdout)
                require(observed["kind"] == "publication-attempt" and observed["emission"]["ok"] and observed["emission"]["data"]["emitted"] is True, "No actual governed emission")
                manifest = observed["ownership"]
        for item in plan["queries"]:
            require(plan["operation"] in ("publish", "read") and manifest, "Queries require a published state")
            require(item["operation"] in ("index", "read") and item["query"]["scope"] == plan["scope"], "Invalid query operation/scope")
            require(re.fullmatch(r"[a-zA-Z0-9_-]+", item["request_id"]), "Invalid request id")
            require(isinstance(item["consumer_id"], str) and item["consumer_id"].strip(), "The actual requester must be identified")
            request = read_ref(args.repository, item["request_ref"])
            put(args.output / (item["request_id"] + ".request.txt"), request)
            query_file = args.output / (item["request_id"] + ".query.json")
            write_json(query_file, item["query"])
            result = operation(args, root, item["operation"], [str(query_file)], env, item["request_id"])
            write_json(args.output / (item["request_id"] + ".bridge.json"), {"request_id": item["request_id"], "consumer_id": item["consumer_id"], "request_ref": item["request_ref"], "operation": item["operation"], "query": item["query"], "candidate_id": json.loads(prepared_path.read_bytes())["candidate_id"], "ownership_manifest": manifest, "exit_code": result.returncode, "consumer_verdict": "NOT_JUDGED", "response_is_literal_cli_stdout": True})
            require(result.returncode == 0, "Query returned HOLD/error; raw response preserved for independent assessment")
        summary["status"] = "OPERATION_RETURNED_SUCCESS"
        summary["ownership_manifest"] = manifest
        status = 0
    except Exception as error:
        summary["failure"] = {"type": type(error).__name__, "message": str(error)}
    finally:
        try:
            preserve(args, plan, root, prepared_path, manifest, publication_attempted)
            put(args.output / "baseline-state-separation.json", (root.parent / "baseline-state-separation.json").read_bytes())
        except Exception as error:
            summary["preservation_failure"] = {"type": type(error).__name__, "message": str(error)}
            summary["status"] = "FAILED"
            status = 1
        summary["ended_at"] = utc()
        write_json(args.output / "summary.json", summary)
        print("S3_OPERATION_JSON=" + json.dumps(summary, sort_keys=True), flush=True)
    return status


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("plan", "run"))
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--runtime", type=Path)
    parser.add_argument("--restore", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    args.repository = args.repository.resolve()
    args.plan = args.plan.resolve()
    plan, package = load_plan(args)
    if args.mode == "plan":
        values = {"S3_MODE": plan["operation"], "S3_RUNTIME_SHA": plan["runtime"]["revision"], "S3_STATE_RUN_ID": plan["restore"]["run_id"] or "", "S3_STATE_ARTIFACT_ID": plan["restore"]["artifact_id"] or ""}
        with Path(os.environ["GITHUB_ENV"]).open("a") as stream:
            for key, value in values.items():
                stream.write(f"{key}={value}\n")
        return 0
    require(args.runtime and args.restore and args.output, "Runtime/restore/output paths required")
    args.runtime = args.runtime.resolve()
    args.output = args.output.resolve()
    return run(args, plan, package)


if __name__ == "__main__":
    sys.exit(main())
