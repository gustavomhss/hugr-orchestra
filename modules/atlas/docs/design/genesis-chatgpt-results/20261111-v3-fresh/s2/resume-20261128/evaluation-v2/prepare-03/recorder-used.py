#!/usr/bin/env python3
"""Preserve one real, requested Genesis CLI operation and its original streams.

This recorder neither implements an Atlas reader nor synthesizes any approval.
Its command file names the original entrypoint and optional nominal local actor.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import time


def digest(data):
    return hashlib.sha256(data).hexdigest()


def identity(path, label=None):
    path = pathlib.Path(path)
    data = path.read_bytes()
    return {"path": label or str(path), "byte_length": len(data), "sha256": digest(data)}


def git(root, *argv):
    return subprocess.check_output(["git", *argv], cwd=root, text=True).strip()


def repository_identity(root):
    process = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=root,
                             text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if process.returncode or pathlib.Path(process.stdout.strip()).resolve() != root:
        return {"is_repository_root": False, "head": None, "tracked_changes": None}
    return {"is_repository_root": True, "head": git(root, "rev-parse", "HEAD"),
            "tracked_changes": git(root, "diff", "--name-only", "HEAD").splitlines()}


def cas_inventory(root):
    directory = root / ".atlas/cas"
    return [identity(path, str(path.relative_to(root))) for path in sorted(directory.rglob("*"))
            if path.is_file()] if directory.exists() else []


def state_inventory(root):
    directory = root / ".atlas"
    return [identity(path, str(path.relative_to(root))) for path in sorted(directory.rglob("*"))
            if path.is_file() and "cas" not in path.relative_to(directory).parts] if directory.exists() else []


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command_file", type=pathlib.Path)
    parser.add_argument("output_dir", type=pathlib.Path)
    args = parser.parse_args()
    config_bytes = args.command_file.read_bytes()
    config = json.loads(config_bytes)
    out = args.output_dir.absolute()
    code = pathlib.Path(config["code_root"]).resolve(strict=True)
    corpus = pathlib.Path(config["corpus_root"]).resolve(strict=True)
    assert git(code, "rev-parse", "HEAD") == config["runtime_revision"]
    assert not git(code, "diff", "--name-only", "HEAD"), "runtime code changed"
    corpus_before = repository_identity(corpus)
    assert corpus_before["head"] == config["corpus_revision"]
    if config.get("require_no_atlas_state"):
        assert not (corpus / ".atlas").exists(), "expected new state-free materialization"
    # Named nominal declarations only; never capture the caller's environment.
    declared = config.get("nominal_environment", {})
    assert set(declared) <= {"ATLAS_ACTOR", "ATLAS_RATIFY_TOKEN"}
    argv = config["command_argv"]
    assert isinstance(argv, list) and all(isinstance(item, str) for item in argv)
    assert argv[0] == config["bun"]
    cwd = pathlib.Path(config["cwd"]).resolve(strict=True)
    assert cwd == code / "modules/atlas"
    expected_files = config.get("input_files", [])
    before = [identity(path) for path in expected_files]
    cas_before = cas_inventory(corpus)
    state_before = state_inventory(corpus)
    out.mkdir(parents=True, exist_ok=False)
    (out / "command.json").write_bytes(config_bytes)
    # Optional external byte guard. This does not change Atlas identity semantics:
    # it binds this operator's actual invocation to explicitly captured installed bytes.
    byte_lock = config.get("expected_input_files", [])
    observed = {entry["path"]: entry for entry in before}
    mismatches = [entry for entry in byte_lock if observed.get(entry["path"]) != entry]
    guard = {"schema": "genesis-s2-external-byte-guard/v1", "observed_at": utc(),
             "expected_files": len(byte_lock), "matched": not mismatches,
             "mismatches": mismatches, "runtime_executed_at_check": False,
             "limit": "External invocation precondition, not a change to intrinsic Atlas runtime_identity coverage."}
    (out / "precondition.json").write_text(json.dumps(guard, ensure_ascii=False, indent=2) + "\n")
    if mismatches:
        print(json.dumps({"operation_id": config["operation_id"], "state": "NOT_RUN_INPUT_LOCK_MISMATCH",
                          "runtime_exit_code": None, "mismatches": len(mismatches)}))
        return 3
    env = os.environ.copy()
    removed = config.get("unset_environment", [])
    assert set(removed) <= {"ATLAS_ACTOR", "ATLAS_RATIFY_TOKEN"}
    for name in removed:
        env.pop(name, None)
    env.update(declared)
    started = utc()
    tick = time.monotonic()
    with (out / "stdout.json").open("xb") as stdout, (out / "stderr.txt").open("xb") as stderr:
        process = subprocess.run(argv, cwd=cwd, env=env, stdout=stdout, stderr=stderr, check=False)
    ended = utc()
    elapsed = time.monotonic() - tick
    after = [identity(path) for path in expected_files]
    streams = {
        "stdout": identity(out / "stdout.json", "stdout.json"),
        "stderr": identity(out / "stderr.txt", "stderr.txt"),
    }
    try:
        response = json.loads((out / "stdout.json").read_bytes())
    except (UnicodeDecodeError, ValueError):
        response = None
    receipt = {
        "schema": "genesis-s2-runtime-operation-receipt/v1",
        "record_kind": "ORIGINAL_EXECUTION_RECEIPT",
        "execution_id": config["execution_id"],
        "operation_id": config["operation_id"],
        "operation": config["operation"],
        "started_at": started, "ended_at": ended,
        "duration_seconds": elapsed,
        "command_argv": argv, "cwd": str(cwd),
        "nominal_environment": declared,
        "unset_environment": removed,
        "recorder_identity": identity(pathlib.Path(__file__).resolve()),
        "external_byte_guard": {"expected_files": len(byte_lock), "matched": not mismatches,
                                "record": "precondition.json", "intrinsic_runtime_identity_modified": False},
        "runtime_revision": git(code, "rev-parse", "HEAD"),
        "corpus_revision": corpus_before["head"],
        "corpus_identity_before": corpus_before,
        "corpus_identity_after": repository_identity(corpus),
        "corpus_root": str(corpus),
        "release_pin": config.get("release_pin"),
        "candidate_id": config.get("candidate_id"),
        "original_candidate": config.get("original_candidate"),
        "input_files_before": before, "input_files_after": after,
        "named_input_bytes_unchanged": before == after,
        "exit_code": process.returncode,
        "response_kind": response.get("kind") if isinstance(response, dict) else None,
        "response_schema": response.get("schema") if isinstance(response, dict) else None,
        "returned_candidate_id": response.get("candidate_id") if isinstance(response, dict) else None,
        "response_manifest": response.get("manifest", response.get("ownership")) if isinstance(response, dict) else None,
        "returned_body_bytes": len(response["body"].encode("utf-8")) if isinstance(response, dict) and isinstance(response.get("body"), str) else 0,
        "streams": streams,
        "output_files": [identity(path) for path in config.get("output_files", []) if pathlib.Path(path).is_file()],
        "cas_before": cas_before,
        "cas_after": cas_inventory(corpus),
        "state_files_before": state_before,
        "state_files_after": state_inventory(corpus),
        "runtime_tracked_changes_after": git(code, "diff", "--name-only", "HEAD").splitlines(),
        "corpus_tracked_changes_after": repository_identity(corpus)["tracked_changes"],
        "product_tests_executed": False,
        "limits": ["Records this original CLI call only; no independent consumer or judge decision is synthesized.",
                   "Nominal actor and ratifier are local responsibility declarations, not authenticated identity or a credential."]
    }
    (out / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ("operation_id", "exit_code", "response_kind", "response_manifest", "returned_body_bytes", "named_input_bytes_unchanged")}))
    return process.returncode


if __name__ == "__main__":
    raise SystemExit(main())
