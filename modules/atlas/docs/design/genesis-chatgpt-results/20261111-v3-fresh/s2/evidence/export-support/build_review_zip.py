#!/usr/bin/env python3
"""Export an unchanged, complete deliverable tree; never judge its completion."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile


ZIP_NAME = "genesis-s2-resumed-review-package.zip"
MANIFEST_NAME = "genesis-s2-review-manifest.json"
RECEIPT_NAME = "export-receipt.json"
UNITS = ("desktop-web", "app-session", "design-tui")
KEYS = {f"s2.l{layer}.{unit}" for layer in range(1, 5) for unit in UNITS}
KEYS.add("s2.l4.entry")
CHUNK = 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def utc():
    return datetime.now(timezone.utc).isoformat()


def no_symlinks(path):
    """Check existing ancestors as well as the named input/output path."""
    for part in reversed((path, *path.parents)):
        try:
            mode = part.lstat().st_mode
        except FileNotFoundError:
            continue
        require(not stat.S_ISLNK(mode), f"Symlink refused: {part}")


def identity(st):
    return {"device": st.st_dev, "inode": st.st_ino, "mode": st.st_mode,
            "byte_length": st.st_size, "mtime_ns": st.st_mtime_ns,
            "ctime_ns": st.st_ctime_ns, "link_count": st.st_nlink}


def digest(stream, destination=None):
    h, length = hashlib.sha256(), 0
    while block := stream.read(CHUNK):
        length += len(block)
        h.update(block)
        if destination is not None:
            destination.write(block)
    return {"byte_length": length, "sha256": h.hexdigest()}


def open_regular(path):
    no_symlinks(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        require(stat.S_ISREG(os.fstat(fd).st_mode), f"Not a regular file: {path}")
        return os.fdopen(fd, "rb")
    except BaseException:
        os.close(fd)
        raise


def file_identity(path):
    with open_regular(path) as stream:
        before = identity(os.fstat(stream.fileno()))
        result = digest(stream)
        require(identity(os.fstat(stream.fileno())) == before,
                f"File changed while reading: {path}")
    require(identity(path.lstat()) == before, f"File replaced while reading: {path}")
    require(result["byte_length"] == before["byte_length"], f"File size changed: {path}")
    return {**result, "filesystem_identity": before}


def snapshot(root):
    """Include every regular file and directory, including empty directories."""
    no_symlinks(root)
    root_identity = identity(root.lstat())
    require(stat.S_ISDIR(root_identity["mode"]), "Deliverable root is not a directory")
    entries = []

    def visit(directory):
        before = identity(directory.lstat())
        require(stat.S_ISDIR(before["mode"]), f"Directory replaced: {directory}")
        with os.scandir(directory) as scan:
            children = sorted(scan, key=lambda entry: entry.name)
        for child in children:
            path = directory / child.name
            rel = path.relative_to(root).as_posix()
            require("\\" not in rel and "\x00" not in rel, f"Unsafe ZIP name: {rel!r}")
            observed = child.stat(follow_symlinks=False)
            if stat.S_ISDIR(observed.st_mode):
                entries.append({"path": rel, "kind": "directory",
                                "filesystem_identity": identity(observed)})
                visit(path)
            else:
                require(stat.S_ISREG(observed.st_mode), f"Nonregular entry refused: {path}")
                entries.append({"path": rel, "kind": "file", **file_identity(path)})
        require(identity(directory.lstat()) == before, f"Directory changed: {directory}")

    visit(root)
    require(identity(root.lstat()) == root_identity, "Deliverable root changed")
    return {"root_identity": root_identity,
            "entries": sorted(entries, key=lambda entry: entry["path"])}


def no_duplicate_keys(pairs):
    obj = {}
    for key, value in pairs:
        require(key not in obj, f"Duplicate JSON key: {key}")
        obj[key] = value
    return obj


def validate_inputs(root, frozen, expected_state):
    files = {entry["path"]: entry for entry in frozen["entries"] if entry["kind"] == "file"}

    def bound(path):
        require(isinstance(path, str) and path and "\\" not in path,
                "Required reference must be a relative POSIX path")
        rel = PurePosixPath(path)
        require(not rel.is_absolute() and ".." not in rel.parts and str(rel) == path,
                f"Unsafe or noncanonical reference: {path}")
        require(path in files, f"Required file missing: {path}")
        return {key: files[path][key] for key in ("path", "byte_length", "sha256")}

    def document(path):
        ref = bound(path)
        with open_regular(root / path) as stream:
            raw = stream.read()
        require(len(raw) == ref["byte_length"] and hashlib.sha256(raw).hexdigest() == ref["sha256"],
                f"Required file changed: {path}")
        value = json.loads(raw, object_pairs_hook=no_duplicate_keys)
        require(isinstance(value, dict), f"Expected JSON object: {path}")
        return value, ref

    handoff, handoff_ref = document("handoff.json")
    package, package_ref = document("native-package.json")
    work_ref = bound("work.md")
    require(work_ref["byte_length"] > 0, "work.md is empty")
    require(handoff.get("native_package_sha256") == package_ref["sha256"],
            "handoff.native_package_sha256 does not bind the current native-package.json")
    state = handoff.get("completion_state")
    require(isinstance(state, str) and state.strip() == state and bool(state),
            "handoff.completion_state must explicitly state the actual completion state")
    require(state == expected_state, "Handoff completion_state differs from --expected-completion-state")
    require("artifact_revision" in handoff, "handoff.artifact_revision is required; null is allowed")
    revision = handoff["artifact_revision"]
    require(revision is None or isinstance(revision, str) and bool(revision.strip()),
            "handoff.artifact_revision must be a string or null")

    required = package.get("required_artifact_keys", [])
    require(isinstance(required, list) and len(required) == 13 and set(required) == KEYS,
            "Native package does not declare exactly the frozen 13 artifact keys")
    items = package.get("artifacts", [])
    require(isinstance(items, list) and len(items) == 13 and
            {item.get("key") for item in items} == KEYS, "Native package artifact set is not the exact 13")
    require(package.get("missing_required_artifact_keys") == [], "Native package declares missing bodies")
    artifacts = {item["key"]: item for item in items}
    accepted_refs, body_refs, execution_ids = [], [], set()
    for layer in range(1, 5):
        accepted, accepted_ref = document(f"accepted/l{layer}.json")
        accepted_refs.append(accepted_ref)
        require(accepted.get("status") == "SEMANTIC_LAYER_ACCEPTED" and accepted.get("layer") == layer,
                f"L{layer} has no current whole-layer acceptance manifest")
        require(accepted.get("source_revision") == package.get("source_revision") and
                accepted.get("protocol_revision") == package.get("protocol_ref", {}).get("commit"),
                f"L{layer} acceptance pins disagree with the native package")
        execution_ids.add(accepted.get("execution_id"))
        rows = accepted.get("artifacts", [])
        layer_keys = {key for key in KEYS if key.startswith(f"s2.l{layer}.")}
        require(len(rows) == len(layer_keys) and {row.get("key") for row in rows} == layer_keys,
                f"L{layer} acceptance does not cover its exact current artifact set")
        for row in rows:
            item = artifacts[row["key"]]
            require(item.get("layer") == layer and item.get("validity") == "supported",
                    f"Unsupported current body: {row['key']}")
            body = item.get("body", {})
            ref = bound(body.get("path"))
            require(body.get("sha256") == ref["sha256"] and body.get("byte_length") == ref["byte_length"],
                    f"Native package body identity differs: {row['key']}")
            require(row.get("body_path") == ref["path"] and row.get("body_sha256") == ref["sha256"] and
                    row.get("byte_length") == ref["byte_length"], f"Accepted body identity differs: {row['key']}")
            body_refs.append({"artifact_key": row["key"], "layer": layer, **ref})
    require(len(execution_ids) == 1 and all(isinstance(x, str) and x for x in execution_ids),
            "Accepted manifests lack one consistent execution identity")
    return {"handoff": handoff_ref, "work": work_ref, "native_package": package_ref,
            "completion_state_as_declared": state, "artifact_revision_as_declared": revision,
            "accepted_manifests": accepted_refs, "accepted_bodies": body_refs,
            "scope": "Mechanical identity checks only; no semantic or completion verdict is issued."}


def write_zip(root, path, entries):
    with path.open("xb") as output, zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED,
                                                   compresslevel=6, allowZip64=True) as archive:
        for entry in entries:
            is_dir = entry["kind"] == "directory"
            info = zipfile.ZipInfo(entry["path"] + ("/" if is_dir else ""))
            info.create_system = 3
            info.external_attr = entry["filesystem_identity"]["mode"] << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            if is_dir:
                info.external_attr |= 0x10
                archive.writestr(info, b"")
                continue
            with open_regular(root / entry["path"]) as source:
                require(identity(os.fstat(source.fileno())) == entry["filesystem_identity"],
                        f"Input changed before archive write: {entry['path']}")
                with archive.open(info, "w", force_zip64=True) as member:
                    copied = digest(source, member)
                require(identity(os.fstat(source.fileno())) == entry["filesystem_identity"],
                        f"Input changed during archive write: {entry['path']}")
            require(all(copied[key] == entry[key] for key in ("byte_length", "sha256")),
                    f"Archived bytes differ from frozen input: {entry['path']}")


def verify_zip(path, entries):
    expected = {entry["path"] + ("/" if entry["kind"] == "directory" else ""): entry for entry in entries}
    with zipfile.ZipFile(path, "r") as archive:
        members = archive.infolist()
        require(len(members) == len(expected) and {info.filename for info in members} == set(expected),
                "ZIP has missing, duplicate, or additional members")
        for info in members:
            entry = expected[info.filename]
            with archive.open(info, "r") as stream:
                observed = digest(stream)
            want = {"byte_length": 0, "sha256": hashlib.sha256(b"").hexdigest()} if info.is_dir() else {
                key: entry[key] for key in ("byte_length", "sha256")}
            require(observed == want, f"ZIP readback differs: {info.filename}")
            require(info.file_size == observed["byte_length"], f"ZIP size field differs: {info.filename}")


def write_json(path, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    with path.open("xb") as stream:
        stream.write(data)
    require(path.read_bytes() == data, f"Output JSON readback differs: {path}")
    return {"path": path.name, "byte_length": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deliverable-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True,
                        help="New, nonexistent directory outside the deliverable; parent must exist")
    parser.add_argument("--expected-completion-state", required=True,
                        help="Explicit actual handoff state to preserve, e.g. INCOMPLETE_BLOCKED")
    args = parser.parse_args()
    root = Path(os.path.abspath(args.deliverable_root))
    out = Path(os.path.abspath(args.output_dir))
    for path in (root, out):
        no_symlinks(path)
    require(root.is_dir(), "Deliverable root must exist")
    require(out != root and root not in out.parents and out not in root.parents,
            "Output directory and deliverable must be disjoint")
    require(out.parent.is_dir(), "Output parent must already exist")
    require(not os.path.lexists(out), "Output directory already exists; no overwrite is allowed")
    out.mkdir(mode=0o700, exist_ok=False)
    receipt = {"schema": "genesis-s2-review-export-receipt/v1", "started_at": utc(),
               "argv": sys.argv, "cwd": os.getcwd(), "deliverable_root": str(root),
               "output_directory": str(out), "completed_steps": [],
               "semantic_or_completion_verdict": "NOT_ISSUED", "source_writes": 0,
               "remote_operations": 0, "runtime_or_tests_executed": 0}
    try:
        frozen = snapshot(root)
        receipt["completed_steps"].append("froze_every_input_file_and_directory")
        bindings = validate_inputs(root, frozen, args.expected_completion_state)
        receipt["completed_steps"].append("validated_handoff_package_and_13_accepted_body_identities")
        write_zip(root, out / ZIP_NAME, frozen["entries"])
        receipt["completed_steps"].append("wrote_complete_zip_without_exclusions")
        verify_zip(out / ZIP_NAME, frozen["entries"])
        receipt["completed_steps"].append("read_back_every_zip_member_and_verified_bytes_sha256")
        zip_ref = {"path": ZIP_NAME, **file_identity(out / ZIP_NAME)}
        manifest = {"schema": "genesis-s2-review-file-manifest/v1", "recorded_at": utc(),
                    "deliverable_root": str(root), "exclusions": [], "zip": zip_ref,
                    "bindings": bindings, "file_count": sum(e["kind"] == "file" for e in frozen["entries"]),
                    "directory_count": sum(e["kind"] == "directory" for e in frozen["entries"]),
                    "source_snapshot": frozen,
                    "hash_scope": "Every source file; this external manifest and export receipt are not ZIP members. No self-hash cycle.",
                    "zip_metadata": "Member names and mode bits retained; ZIP timestamp fields use 1980-01-01. Original nanosecond times are in this manifest."}
        manifest_ref = write_json(out / MANIFEST_NAME, manifest)
        require(snapshot(root) == frozen, "Inputs changed during export; archive must not be used as a verified export")
        receipt["completed_steps"].append("rehashed_entire_input_tree_and_verified_unchanged")
        receipt.update({"finished_at": utc(), "export_status": "ARCHIVE_BYTES_VERIFIED",
                        "completion_state_as_declared": bindings["completion_state_as_declared"],
                        "artifact_revision_as_declared": bindings["artifact_revision_as_declared"],
                        "zip": zip_ref, "file_manifest": manifest_ref,
                        "file_count": manifest["file_count"], "directory_count": manifest["directory_count"],
                        "limit": "Source stability is verified through the final readback only. Export integrity does not establish mission completion, publication, runtime success, or acceptance beyond the supplied manifests."})
        write_json(out / RECEIPT_NAME, receipt)
        print(json.dumps({"export_status": receipt["export_status"], "output_directory": str(out),
                          "completion_state_as_declared": bindings["completion_state_as_declared"]}))
        return 0
    except (Exception, KeyboardInterrupt) as error:
        receipt.update({"finished_at": utc(), "export_status": "EXPORT_FAILED",
                        "error_type": type(error).__name__, "error": str(error),
                        "partial_outputs_preserved": True})
        if not os.path.lexists(out / RECEIPT_NAME):
            try:
                write_json(out / RECEIPT_NAME, receipt)
            except Exception as receipt_error:
                print(f"Could not record failure receipt: {receipt_error}", file=sys.stderr)
        print(f"Export failed; preserve this output directory: {out}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
