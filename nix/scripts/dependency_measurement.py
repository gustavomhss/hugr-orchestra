#!/usr/bin/env python3
"""Deferred measurement capture. Never edits hashes.json or accepts generic failure."""
import base64
import json
from pathlib import Path
import re
import subprocess
import sys


def named_exception(kind, value, traceback):
    label = "EVIDENCE_INPUT_MISSING" if issubclass(kind, FileNotFoundError) else "EVIDENCE_INPUT_INVALID"
    print("NIX_DISTRIBUTION_FAILURE:" + label + ":" + str(value), file=sys.stderr)


sys.excepthook = named_exception


def require(condition, label):
    if not condition:
        raise SystemExit("NIX_DISTRIBUTION_FAILURE:" + label)


def fingerprint():
    entries = subprocess.check_output([
        "git", "ls-tree", "-r", "--full-tree", "HEAD", "--",
        "packages", "patches", "bun.lock", "package.json", "bunfig.toml", "tsconfig.json", "flake.lock",
        ".github/TEAM_MEMBERS",
        "flake.nix", "nix/node_modules.nix", "nix/bun.nix",
        "nix/toolchain-sources.json", "nix/scripts/canonicalize-node-modules.ts",
        "nix/scripts/normalize-bun-binaries.ts",
    ], text=True).splitlines()
    blobs = {}
    for line in entries:
        metadata, path = line.split("\t", 1)
        require(metadata.split()[1] == "blob", "DEPENDENCY_INPUT_NOT_BLOB:" + path)
        blobs[path] = metadata.split()[2]
    require("bun.lock" in blobs and "nix/node_modules.nix" in blobs, "DEPENDENCY_INPUTS_MISSING")
    require(any(path.startswith("packages/") for path in blobs), "EMPTY_WORKSPACE_INPUTS")
    return blobs


def measured_candidate(directory, system, revision):
    sources = json.loads(Path("nix/toolchain-sources.json").read_text())
    require(system in sources["bun"]["sources"], "UNSUPPORTED_MEASUREMENT_SYSTEM")
    require(int((directory / "hash-build.exit").read_text()) != 0, "UPDATER_UNEXPECTED_SUCCESS")
    drv = (directory / "hash-drv.stdout").read_text().strip()
    require(drv.startswith("/nix/store/") and drv.endswith(".drv")
            and "-orchestra-node_modules-" in drv and "\n" not in drv, "INVALID_UPDATER_DERIVATION")
    log = (directory / "hash-build.stderr").read_text()
    matches = re.findall(
        r"hash mismatch in fixed-output derivation ['\"]" + re.escape(drv)
        + r"['\"]:\s*specified:\s*\S+\s*got:\s*(sha256-[A-Za-z0-9+/]+={0,2})", log,
    )
    require(len(matches) == 1, "MISSING_OR_AMBIGUOUS_UPDATER_HASH_MISMATCH")
    digest = base64.b64decode(matches[0].removeprefix("sha256-"), validate=True)
    require(len(digest) == 32, "INVALID_MEASURED_SHA256")
    for label in ("canonicalize-node-modules", "normalize-bun-binaries"):
        counts = re.findall(r"\[" + label + r"\] rebuilt\s+(\d+)\s+links", log)
        require(len(counts) == 1 and int(counts[0]) > 0, "NORMALIZATION_INCOMPLETE:" + label)
    require("NODE_MODULES_INSTALL_COMPLETE:" + system in log, "DEPENDENCY_INSTALL_INCOMPLETE")
    return {
        "status": "MEASURED_CANDIDATE_NOT_APPLIED",
        "system": system, "sourceRevision": revision, "derivation": drv,
        "hash": matches[0], "hashMode": "recursive SHA-256 NAR",
        "dependencyInputs": fingerprint(),
    }


def main():
    require(len(sys.argv) >= 3, "MEASUREMENT_ARGUMENTS")
    action, directory = sys.argv[1], Path(sys.argv[2])
    if action == "inputs":
        (directory / "dependency-inputs.json").write_text(json.dumps(fingerprint(), indent=2) + "\n")
        return
    if action == "compare":
        require(fingerprint() == json.loads((directory / "dependency-inputs.json").read_text()),
                "DEPENDENCY_INPUT_CHANGED_SINCE_MEASUREMENT")
        return
    require(action == "capture" and len(sys.argv) == 5, "MEASUREMENT_ACTION")
    candidate = measured_candidate(directory, sys.argv[3], sys.argv[4])
    (directory / "candidate.json").write_text(json.dumps(candidate, indent=2) + "\n")
    print("DEPENDENCY_HASH_CANDIDATE:" + candidate["system"] + ":" + candidate["hash"])


if __name__ == "__main__":
    main()
