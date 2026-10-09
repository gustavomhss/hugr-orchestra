#!/usr/bin/env python3
"""Deferred teeth using the actual captured updater log, never a made-up hash."""
import json
from pathlib import Path
import subprocess
import sys
from dependency_measurement import require


def main():
    require(len(sys.argv) == 3, "HASH_PROBE_ARGUMENTS")
    measurement, directory = map(Path, sys.argv[1:])
    directory.mkdir()
    candidate = json.loads((measurement / "candidate.json").read_text())
    original = {name: (measurement / name).read_text() for name in
                ("hash-build.stderr", "hash-build.exit", "hash-drv.stdout")}
    mutations = {
        "unchanged-real-evidence": ({}, None),
        "generic-failure": ({"hash-build.stderr": "builder failed before install\n"}, "MISSING_OR_AMBIGUOUS_UPDATER_HASH_MISMATCH"),
        "empty-log": ({"hash-build.stderr": ""}, "MISSING_OR_AMBIGUOUS_UPDATER_HASH_MISMATCH"),
        "successful-updater": ({"hash-build.exit": "0\n"}, "UPDATER_UNEXPECTED_SUCCESS"),
        "wrong-derivation": ({"hash-drv.stdout": candidate["derivation"].replace("orchestra-node_modules", "wrong-package")}, "INVALID_UPDATER_DERIVATION"),
        "missing-canonicalization": ({"hash-build.stderr": original["hash-build.stderr"].replace("[canonicalize-node-modules]", "[removed]")}, "NORMALIZATION_INCOMPLETE:canonicalize-node-modules"),
        "missing-binary-normalization": ({"hash-build.stderr": original["hash-build.stderr"].replace("[normalize-bun-binaries]", "[removed]")}, "NORMALIZATION_INCOMPLETE:normalize-bun-binaries"),
        "missing-install-receipt": ({"hash-build.stderr": original["hash-build.stderr"].replace("NODE_MODULES_INSTALL_COMPLETE:", "REMOVED_INSTALL_COMPLETE:")}, "DEPENDENCY_INSTALL_INCOMPLETE"),
    }
    for name, (changes, expected) in mutations.items():
        fixture = directory / name
        fixture.mkdir()
        for file, content in (original | changes).items():
            (fixture / file).write_text(content)
        result = subprocess.run([sys.executable, "nix/scripts/dependency_measurement.py", "capture", str(fixture),
                                 candidate["system"], candidate["sourceRevision"]], text=True, capture_output=True)
        require((result.returncode == 0 if expected is None else
                 result.returncode != 0 and expected in result.stderr), "HASH_PROBE_VERDICT:" + name)
        if expected is None:
            require(json.loads((fixture / "candidate.json").read_text())["hash"] == candidate["hash"], "HASH_REPLAY_CHANGED_MEASUREMENT")
        if expected is not None:
            require(not (fixture / "candidate.json").exists(), "INVALID_HASH_CANDIDATE_PUBLISHED:" + name)
        (fixture / "result.json").write_text(json.dumps({"status": result.returncode, "expected": expected,
                                                       "stdout": result.stdout, "stderr": result.stderr}, indent=2) + "\n")
    print(json.dumps({"status": "HASH_CAPTURE_CONTROLS_OK", "completed": list(mutations)}, indent=2))


if __name__ == "__main__":
    main()
