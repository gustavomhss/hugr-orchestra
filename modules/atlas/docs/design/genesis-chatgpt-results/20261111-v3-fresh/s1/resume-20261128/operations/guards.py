"""Run the original repository guard in an isolated Actions checkout.

This harness records the command and exact historical binary; it does not replace
the guard, suppress findings, edit the candidate, or execute product tests locally.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("This repository gate must run in GitHub Actions.")
    args.output.mkdir(parents=True, exist_ok=False)
    observed = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=args.repository, text=True
    ).strip()
    if observed != args.candidate:
        raise SystemExit(f"Candidate mismatch: {observed} != {args.candidate}")
    base = subprocess.check_output(
        ["git", "rev-parse", "origin/dev"], cwd=args.repository, text=True
    ).strip()
    archive_path = (
        "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/"
        "s1/evidence/source-captures.zip"
    )
    expected_blob = "d83941a9d836a23e466ca09ecba1f21d423094cb"
    historical_commit = "a8df22ae3a140c58c63f62ce2a634c84f415c943"
    actual_blob = subprocess.check_output(
        ["git", "rev-parse", f"{historical_commit}:{archive_path}"],
        cwd=args.repository,
        text=True,
    ).strip()
    raw = subprocess.check_output(
        ["git", "cat-file", "blob", actual_blob], cwd=args.repository
    )
    computed_blob = hashlib.sha1(
        f"blob {len(raw)}\0".encode("ascii") + raw
    ).hexdigest()
    if actual_blob != expected_blob or computed_blob != expected_blob or len(raw) != 1339105:
        raise SystemExit("Historical source-captures.zip identity mismatch")
    (args.output / "source-captures.zip").write_bytes(raw)
    binary = {
        "commit": historical_commit,
        "path": archive_path,
        "git_blob_sha": actual_blob,
        "computed_git_blob_sha": computed_blob,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
        "state": "EXACT_GIT_BYTES_RECOVERED",
    }
    argv = ["bun", "run", "check:guards", "--base", "origin/dev"]
    with (args.output / "guards.log").open("wb") as log:
        result = subprocess.run(argv, cwd=args.repository, stdout=log, stderr=subprocess.STDOUT)
    log = (args.output / "guards.log").read_bytes()
    receipt = {
        "schema": "genesis-s1-original-guard/v1",
        "candidate_revision": observed,
        "base_ref": "origin/dev",
        "base_revision": base,
        "argv": argv,
        "exit_code": result.returncode,
        "log_sha256": hashlib.sha256(log).hexdigest(),
        "log_bytes": len(log),
        "binary_recovery": binary,
        "run_id": os.environ.get("GITHUB_RUN_ID"),
        "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "workflow_revision": os.environ.get("GITHUB_SHA"),
        "guard_modified": False,
    }
    (args.output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(log.decode("utf-8", errors="replace"))
    print("GENESIS_S1_GUARD_RECEIPT=" + json.dumps(receipt, sort_keys=True))
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
