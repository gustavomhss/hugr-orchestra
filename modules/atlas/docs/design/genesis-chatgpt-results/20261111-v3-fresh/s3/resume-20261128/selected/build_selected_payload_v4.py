#!/usr/bin/env python3
"""Mechanical S3 payload assembly, gated by existing root and judge receipts.

No Atlas invocation, semantic judgment, remote write, or product test occurs here.
The producer and reviewer records are preserved byte for byte; this tool does not
grant acceptance. This v4 copy requires root's real L4-adoption-v4 (or later)
release and preserves the selected v3 bytes in an explicit lineage archive.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

WORKSPACE = Path(__file__).resolve().parents[2]
BASE = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/"
RESUME = BASE + "resume-20261128/"
PACKAGE_PATH = BASE + "native-package.json"
SOURCE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
ORIGINAL = "19b909ef3bf27e0332f24fc30e3a5c471ea37d78"
EXECUTION = "15cc9853-0e71-4950-8813-0bfb66f82c8a"
REVIEWERS = {"/root/s3_j1", "/root/s3_j2"}
L2 = ["s3-l2-maestro", "s3-l2-relay", "s3-l2-integrations"]
L3 = ["s3-l3-flows"]
L4 = ["s3-l4-entry", "s3-l4-ownership", "s3-l4-maintenance", "s3-l4-operational"]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_relative(value):
    require(isinstance(value, str) and value and not value.startswith("/"), "Expected a repository relative path")
    require(all(part not in ("", ".", "..", ".git", ".atlas") for part in value.split("/")), "Unsafe repository path: " + value)
    return PurePosixPath(value)


def read_bytes(path):
    path = Path(path)
    require(not path.is_symlink() and not any(p.is_symlink() for p in path.parents), "Symlink refused: " + str(path))
    require(path.is_file(), "Missing regular local file: " + str(path))
    return path.read_bytes()


def measure(raw):
    return {"sha256": hashlib.sha256(raw).hexdigest(),
            "git_blob_sha": hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest(),
            "byte_length": len(raw)}


def load_json(path):
    return json.loads(read_bytes(path))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())


def declared_review_bodies(document):
    """Read only the explicit identity fields of the real decision record."""
    found = {}
    for field in ("hashes_declared", "declared_hashes", "declared_bodies", "body_hashes"):
        value = document.get(field, {})
        if isinstance(value, dict):
            for key, row in value.items():
                if key.startswith("s3-") and isinstance(row, dict) and "sha256" in row:
                    found[key] = row
    if isinstance(document.get("declared_artifact"), dict):
        row = document["declared_artifact"]
        key = row.get("key", row.get("name"))
        if key:
            found[key] = row
    if isinstance(document.get("artifact"), str) and isinstance(document.get("declared_body"), dict):
        found[document["artifact"]] = document["declared_body"]
    return found


def verify_release(workspace, release_file, layer, expected_bodies):
    release = load_json(release_file)
    require(release.get("schema") == "genesis-s3-semantic-layer-release/v1", "Unknown root release schema")
    require(release.get("layer") == layer and release.get("execution_record_id") == EXECUTION, "Root release execution/layer mismatch")
    require(release.get("decision") == "ACCEPTED" and release.get("verified_by") == "/root", "No real accepted root release: " + str(release_file))
    require(release.get("mandatory_findings_open") == 0, "Root release has unresolved mandatory findings")
    require(len(release.get("reviewer_ids", [])) == 2 and set(release["reviewer_ids"]) == REVIEWERS, "Unexpected reviewer pair")
    released = {row["key"]: row for row in release.get("bodies", [])}
    require(len(released) == len(release.get("bodies", [])) and set(released) == set(expected_bodies), "Release body set differs from selected layer")
    for key, identity in expected_bodies.items():
        row = released[key]
        require(row.get("sha256") == identity["sha256"] and row.get("bytes") == identity["byte_length"], "Root release body identity mismatch: " + key)
    decisions = release.get("decisions", [])
    require(len(decisions) == 2 and {row.get("reviewer_id") for row in decisions} == REVIEWERS, "Two actual root-cited decision files required")
    checked = []
    for row in decisions:
        path = safe_relative(row["path"])
        require(path.parts[:2] == ("s3-resume-work", "judgments"), "Decision must come from the root judgment archive")
        local = workspace / path
        identity = measure(read_bytes(local))
        require(identity["sha256"] == row.get("sha256") and identity["byte_length"] == row.get("bytes"), "Root-cited decision bytes differ: " + str(path))
        decision = load_json(local)
        require(decision.get("reviewer", decision.get("reviewer_id")) == row["reviewer_id"], "Decision reviewer mismatch")
        require(decision.get("execution_id") == EXECUTION and decision.get("decision") == "PASS", "An actual decision is not PASS for this execution")
        declared = declared_review_bodies(decision)
        for key, expected in expected_bodies.items():
            observed = declared.get(key, {})
            require(observed.get("sha256") == expected["sha256"] and observed.get("bytes", observed.get("byte_length")) == expected["byte_length"], "Decision does not cover exact selected body: " + key)
        checked.append({"reviewer_id": row["reviewer_id"], "local_path": str(local), "path": RESUME + "judgments/" + local.name, **identity})
    return {"file": str(release_file), "document": release, "identity": measure(read_bytes(release_file)), "decisions": checked}


def producer_output_identity(document, key):
    """Read the actual output identity field, never a matching input/prior hash."""
    name = key[3:] + ".md"
    if key in L2:
        matches = [row["after"] for row in document["bodies"] if row["path"] == "bodies/" + name]
    elif key in L3:
        matches = [row for row in document["artifacts"] if row["path"] == "s3-l3-adoption/bodies/" + name]
    elif key == "s3-l4-entry":
        matches = [document["entry_after"]]
    elif key == "s3-l4-maintenance":
        matches = [document["maintenance_after"]]
    else:
        matches = [row["output"] for row in document["artifacts"] if row["name"] == name]
    require(len(matches) == 1, "Producer receipt must identify one exact output: " + key)
    return matches[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=WORKSPACE)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--l4-release", type=Path)
    parser.add_argument("--final", action="store_true")
    args = parser.parse_args()
    workspace, output = args.workspace.resolve(), args.output_dir.resolve()
    require(output == workspace / "s3-selected-finalization/v4" or output.is_relative_to(workspace / "s3-selected-finalization/v4"), "This copy may write only under s3-selected-finalization/v4")
    output.mkdir(parents=True, exist_ok=True)
    sources = {key: workspace / "s3-l2-revision" / "bodies" / (key[3:] + ".md") for key in L2}
    sources.update({key: workspace / "s3-l3-adoption" / "bodies" / (key[3:] + ".md") for key in L3})
    sources.update({key: workspace / "s3-l4-adoption" / "bodies" / (key[3:] + ".md") for key in L4})
    bodies = {key: {"local_path": str(path), **measure(read_bytes(path))} for key, path in sources.items()}
    releases = {}
    blockers = []
    candidates = []
    for path in (workspace / "s3-resume-work/releases").glob("L4-adoption-v*.json"):
        match = re.fullmatch(r"L4-adoption-v([0-9]+)\.json", path.name)
        if match and int(match[1]) >= 4:
            candidates.append((int(match[1]), path))
    l4_path = args.l4_release or (max(candidates)[1] if candidates else None)
    specifications = [("L2", "L2-v2.json", L2), ("L3", "L3-adoption-v1.json", L3), ("L4", l4_path, L4)]
    for layer, name, keys in specifications:
        try:
            require(name is not None, "No real L4-adoption-v4 or later root release exists")
            release_file = Path(name) if layer == "L4" else workspace / "s3-resume-work/releases" / name
            if not release_file.is_absolute():
                release_file = workspace / release_file
            if layer == "L4":
                require(release_file.resolve().parent == (workspace / "s3-resume-work/releases").resolve(), "L4 release must be in the root release archive")
                match = re.fullmatch(r"L4-adoption-v([0-9]+)\.json", release_file.name)
                require(match is not None and int(match[1]) >= 4, "L4 release predates required v4")
            releases[layer] = verify_release(workspace, release_file, layer, {key: bodies[key] for key in keys})
        except (ValueError, FileNotFoundError, KeyError) as error:
            blockers.append({"layer": layer, "reason": str(error)})
    gate = {"schema": "s3-selected-payload-gate/v1", "status": "ROOT_RELEASES_VERIFIED" if not blockers else "BLOCKED",
            "selected_bodies": bodies, "releases": {k: {"file": v["file"], **v["identity"], "decisions": v["decisions"]} for k, v in releases.items()},
            "blockers": blockers, "runtime_status": "NOT_RUN", "remote_status": "NOT_WRITTEN"}
    write_json(output / "gate-report.json", gate)
    if blockers:
        print(json.dumps({"status": "BLOCKED", "blockers": blockers}, ensure_ascii=False))
        return 2 if args.final else 0
    if not args.final:
        print(json.dumps({"status": "ROOT_RELEASES_VERIFIED", "action": "No assembly; use --final for deterministic assembly", "gate_report": str(output / "gate-report.json")}))
        return 0

    payload = output / "payload"
    manifest = {}
    superseded_checkpoint_bytes = {}
    def stage(local, repository_path, kind, declared_commit=None):
        relative = safe_relative(repository_path)
        raw = read_bytes(local)
        identity = measure(raw)
        if repository_path in manifest:
            require(manifest[repository_path]["sha256"] == identity["sha256"], "Staging collision: " + repository_path)
        target = payload / relative
        if target.exists():
            existing = read_bytes(target)
            if existing != raw:
                require(kind == "preserved-root-record" and existing == superseded_checkpoint_bytes.get(repository_path), "Output already contains different bytes: " + repository_path)
                target.write_bytes(raw)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        manifest[repository_path] = {"path": repository_path, "local_path": str(target), "source_local_path": str(local),
                                     "kind": kind, "source_commit": declared_commit, "mode": "100644", **identity}
        return {"payload_path": repository_path, "sha256": identity["sha256"]}

    # Prior root checkpoints and all visible host transmissions remain exact bytes.
    prior = workspace / "s3-resume-work/payload"
    for file in sorted(prior.rglob("*")):
        if file.is_file():
            repository_path = file.relative_to(prior).as_posix()
            suffix = repository_path[len(RESUME):] if repository_path.startswith(RESUME) else None
            current = workspace / "s3-resume-work" / suffix if suffix else None
            if current is not None and current.is_file() and read_bytes(current) != read_bytes(file):
                superseded_checkpoint_bytes[repository_path] = read_bytes(file)
                stage(file, RESUME + "lineage/checkpoint-before-selection/" + suffix, "preserved-superseded-root-checkpoint")
            else:
                stage(file, repository_path, "preserved-root-checkpoint")
    for folder in ("judgments", "releases", "review-requests"):
        for file in sorted((workspace / "s3-resume-work" / folder).rglob("*")):
            if file.is_file():
                stage(file, RESUME + folder + "/" + file.relative_to(workspace / "s3-resume-work" / folder).as_posix(), "preserved-root-record")
    for name in ("execution.json", "visible-ledger.json"):
        file = workspace / "s3-resume-work" / name
        if file.is_file():
            stage(file, RESUME + name, "preserved-root-record")
    producer_roots = {"L2": (workspace / "s3-l2-revision", RESUME + "producers/L2-v2/"),
                      "L3": (workspace / "s3-l3-adoption", RESUME + "producers/L3-adoption-v1/"),
                      "L4": (workspace / "s3-l4-adoption", RESUME + "producers/" + releases["L4"]["document"]["revision"] + "/")}
    for local_root, repo_root in producer_roots.values():
        for file in sorted(local_root.rglob("*")):
            if file.is_file():
                stage(file, repo_root + file.relative_to(local_root).as_posix(), "preserved-new-producer-record")

    # Explicit archive of the concurrent recovery selection, distinct from missing
    # original-executor bytes; the original L1 JSON is also kept by the assembler.
    for key in L2 + L3 + L4:
        name = "bodies/" + key[3:] + ".md"
        stage(workspace / "s3-provenance/files" / name, RESUME + "lineage/concurrent-recovery-19b909e/" + name, "historical-recovery-body", ORIGINAL)
    for file in sorted((workspace / "s3-package-assembly/captures").rglob("*")):
        if file.is_file():
            stage(file, RESUME + "lineage/concurrent-recovery-19b909e/" + file.relative_to(workspace / "s3-package-assembly/captures").as_posix(), "historical-capture", ORIGINAL)

    # Preserve the actual selected v3 package and every body before the canonical
    # paths are superseded. This is its verified prior commit, never a v4 commit.
    prior_selected = workspace / "s3-selected-finalization"
    prior_manifest = load_json(prior_selected / "payload-files.json")
    prior_rows = {row["path"]: row for row in prior_manifest["files"]}
    prior_readback = load_json(prior_selected / "readback-selected.json")
    prior_commit = "caae29c9ae560d49859b67c52c81e66c2a3b078e"
    prior_sha256 = "4bcee3f8e534dc6a191cee647e27b5a6faf98a4a7e1f3ed09e9fda7488d64c86"
    require(prior_readback["head"] == prior_commit and prior_readback["package_sha256"] == prior_sha256
            and prior_readback["exact_readback_complete"] is True, "Prior v3 readback is not the actual verified selection")
    prior_remote_rows = {row["path"]: row for row in prior_readback["readback"]}
    prior_package_path = prior_selected / "payload" / PACKAGE_PATH
    require(measure(read_bytes(prior_package_path))["sha256"] == prior_sha256, "Prior v3 package drift")
    prior_package = load_json(prior_package_path)
    archive_prefix = RESUME + "lineage/selected-v3-caae29c/"
    prior_paths = [PACKAGE_PATH] + [BASE + row["body"]["path"] for row in prior_package["artifacts"]]
    prior_paths += [RESUME + "selected/" + name for name in ("transport-transformation.json", "assembly-report.json", "selected-assembly.json")]
    archived = []
    for repository_path in prior_paths:
        previous = prior_rows[repository_path]
        local = prior_selected / "payload" / repository_path
        identity = measure(read_bytes(local))
        require(all(identity[field] == previous[field] for field in ("sha256", "git_blob_sha", "byte_length")), "Prior v3 staged bytes drift: " + repository_path)
        require(prior_remote_rows[repository_path]["exact_utf8_equal"] is True
                and prior_remote_rows[repository_path]["git_blob_sha"] == identity["git_blob_sha"], "Prior v3 bytes lack exact readback")
        archive_path = archive_prefix + repository_path[len(BASE):]
        stage(local, archive_path, "preserved-selected-v3", prior_commit)
        archived.append({"original_commit": prior_commit, "original_path": repository_path, "archive_path": archive_path, **identity})
    stage(prior_selected / "readback-selected.json", archive_prefix + "readback-selected.json", "preserved-selected-v3-readback")
    write_json(output / "v3-lineage-archive.json", {"schema": "s3-selected-v3-lineage-archive/v1", "commit": prior_commit,
               "package_sha256": prior_sha256, "files": archived, "v4_runtime_binding": "NOT_CLAIMED"})
    stage(output / "v3-lineage-archive.json", archive_prefix + "archive-manifest.json", "mechanical-v3-lineage-archive")

    bindings = {"artifacts": {}, "reference_files": {}}
    recipe_names = {key: ("recipe.md", "request.md", "response.json", "v1") for key in L2 + L3 + L4}
    recipe_names["s3-l4-entry"] = ("recipe-v4.md", "request-v4.md", "response-v4.json", "v4")
    recipe_names["s3-l4-maintenance"] = ("recipe-v3.md", "correction-v3-request.md", "correction-v3-response.json", "v3")
    selections = []
    for key in L2 + L3 + L4:
        layer = "L" + key[4]
        release = releases[layer]
        local_root, repo_root = producer_roots[layer]
        recipe, request, response, producer_revision = recipe_names[key]
        producer_output = producer_output_identity(load_json(local_root / response), key)
        require(producer_output.get("sha256") == bodies[key]["sha256"] and producer_output.get("bytes", producer_output.get("byte_length")) == bodies[key]["byte_length"], "Selected producer response does not identify current output body: " + key)
        body_repo = repo_root + "bodies/" + key[3:] + ".md"
        body_local = payload / body_repo
        require(measure(read_bytes(body_local))["sha256"] == bodies[key]["sha256"], "Producer body changed during staging")
        references = [{"payload_path": repo_root + name, "sha256": manifest[repo_root + name]["sha256"]} for name in (recipe, request, response)]
        review_refs = [{"payload_path": row["path"], "sha256": row["sha256"]} for row in release["decisions"]]
        release_path = RESUME + "releases/" + Path(release["file"]).name
        release_ref = {"payload_path": release_path, "sha256": release["identity"]["sha256"]}
        # These are exact preserved evidence inputs, not newly invented source reads.
        extra_inputs = ["file:" + release_path]
        if layer == "L2":
            extra_inputs += ["file:" + repo_root + name for name in ("adoption-manifest.json", "request-supplement.md", "recipe-response.json")]
        bindings["artifacts"][key] = {
            "body": {"local_path": str(body_local), "sha256": bodies[key]["sha256"], "byte_length": bodies[key]["byte_length"]},
            "recipe_ref": references[0], "producer_request_ref": references[1], "producer_response_ref": references[2],
            "semantic_review_refs": review_refs, "input_keys": extra_inputs,
            "semantic_acceptance": {"body_sha256": bodies[key]["sha256"], "reviewer_ids": release["document"]["reviewer_ids"],
                                    "mandatory_findings_open": release["document"]["mandatory_findings_open"],
                                    "verified_by": release["document"]["verified_by"], "decision": release["document"]["decision"], "release_ref": release_ref}}
        selections.append({"key": key, "producer_revision": "L2-v2" if layer == "L2" else producer_revision,
                           "root_release": release_ref, "body": bodies[key], "recipe_ref": references[0],
                           "producer_request_ref": references[1], "producer_response_ref": references[2], "semantic_review_refs": review_refs})
    bindings["reference_files"] = {path: row["local_path"] for path, row in sorted(manifest.items())}
    write_json(output / "bindings.selected.json", bindings)
    assembler = workspace / "s3-package-assembly/assemble_selected_package.py"
    assembler_identity = measure(read_bytes(assembler))
    assembly = output / "assembly"
    argv = [sys.executable, str(assembler), "--source-dir", str(workspace / "s3-provenance/files"), "--capture-dir", str(workspace / "s3-package-assembly/captures"),
            "--bindings", str(output / "bindings.selected.json"), "--output-dir", str(assembly), "--final"]
    process = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    (output / "assembler.stdout.txt").write_bytes(process.stdout)
    (output / "assembler.stderr.txt").write_bytes(process.stderr)
    require(process.returncode == 0, "Deterministic assembler refused the bindings; inspect assembler.stderr.txt")
    selected_package = load_json(assembly / "native-package.json")
    require(len(selected_package["artifacts"]) == 11 and all(row["validity"] == "supported" for row in selected_package["artifacts"]), "Assembler did not produce eleven root-released artifacts")
    stage(assembly / "native-package.json", PACKAGE_PATH, "new-selected-canonical-package")
    for artifact in selected_package["artifacts"]:
        stage(assembly / artifact["body"]["path"], BASE + artifact["body"]["path"], "selected-canonical-body")
    stage(assembly / "evidence/lineage/native-package.L1-19b909e.json", BASE + "evidence/lineage/native-package.L1-19b909e.json", "exact-original-L1-package", ORIGINAL)
    for name in ("transport-transformation.json", "assembly-report.json", "native-package.faithful-proposal.json"):
        stage(assembly / name, RESUME + "selected/" + name, "deterministic-assembly-evidence")
    package_identity = manifest[PACKAGE_PATH]
    report = {"schema": "s3-selected-payload-assembly/v1", "status": "ASSEMBLED_FROM_REAL_ROOT_RELEASES", "package_path": PACKAGE_PATH,
              "package_sha256": package_identity["sha256"], "package_byte_length": package_identity["byte_length"],
              "package_git_blob_sha": package_identity["git_blob_sha"], "source_revision": SOURCE,
              "selected_artifacts": selections, "root_releases": gate["releases"], "assembler": {"path": str(assembler), **assembler_identity},
              "historical_original_execution_package": "NOT_RECOVERED", "payload_commit": None,
              "payload_commit_state": "ROOT_MUST_COMMIT_AND_READ_BACK", "runtime_status": "NOT_RUN", "remote_status": "NOT_WRITTEN"}
    write_json(output / "selected-assembly.json", report)
    stage(output / "selected-assembly.json", RESUME + "selected/selected-assembly.json", "mechanical-assembly-record")
    write_json(output / "payload-files.json", {"schema": "s3-local-payload-files/v1", "package_path": PACKAGE_PATH,
               "payload_root": str(payload), "package_sha256": package_identity["sha256"], "payload_commit": None,
               "remote_readback_status": "NOT_PERFORMED", "files": [manifest[path] for path in sorted(manifest)]})
    print(json.dumps({"status": report["status"], "artifact_count": 11, "package_path": PACKAGE_PATH,
                      "package_sha256": package_identity["sha256"], "payload_files": len(manifest), "runtime_status": "NOT_RUN"}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError) as error:
        print(json.dumps({"status": "REFUSED", "reason": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2)
