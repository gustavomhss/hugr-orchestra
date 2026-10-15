#!/usr/bin/env python3
"""Archive repair: retain finite capture/control records, not executable fixtures."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
from dependency_measurement import require


def main():
    require(len(sys.argv) == 4 and sys.argv[1] in ("native", "completion"), "ARCHIVE_ARGUMENTS")
    kind, source, destination = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    require(source.is_dir(), "ARCHIVE_SOURCE_MISSING")
    require(not destination.exists(), "ARCHIVE_DESTINATION_NOT_FRESH")
    require(source.resolve() != destination.resolve() and source.resolve() not in destination.resolve().parents,
            "ARCHIVE_DESTINATION_INSIDE_SOURCE")
    destination.mkdir()
    if kind == "native":
        native(source, destination, support=True)
    if kind == "completion":
        collection(source, destination, fixtures=True)
    files = sorted(path for path in destination.rglob("*") if path.is_file())
    require(bool(files), "ARCHIVE_EMPTY_RECORD_SET")
    records = []
    for file in files:
        relative = file.relative_to(destination)
        original = source / relative
        require(not file.is_symlink(), "ARCHIVE_OUTPUT_SYMLINK:" + str(relative))
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        require(digest == hashlib.sha256(original.read_bytes()).hexdigest(), "ARCHIVE_RECORD_CHANGED:" + str(relative))
        records.append({"path": str(relative), "bytes": file.stat().st_size, "sha256": digest})
    (destination / "archive-records.json").write_text(json.dumps({"kind": kind, "records": records}, indent=2) + "\n")
    print(json.dumps({"status": "FINITE_CAPTURE_ARCHIVED", "kind": kind, "records": len(records),
                      "bytes": sum(record["bytes"] for record in records)}))


def direct(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    for file in source.iterdir():
        if file.is_file():
            shutil.copyfile(file, destination / file.name)


def native(source, destination, support=False):
    direct(source, destination)
    if (source / "probes").is_dir():
        # Oracle reads probes/*.json. The sibling directories are runtime fixtures.
        direct(source / "probes", destination / "probes")
    if not support:
        return
    if (source / "toolchain").is_dir():
        direct(source / "toolchain", destination / "toolchain")
    if (source / "hash-probes").is_dir():
        direct(source / "hash-probes", destination / "hash-probes")
        for case in (source / "hash-probes").iterdir():
            if case.is_dir():
                direct(case, destination / "hash-probes" / case.name)
    if (source / "provenance-controls").is_dir():
        for case in (source / "provenance-controls").iterdir():
            if case.is_dir():
                collection(case, destination / "provenance-controls" / case.name)


def collection(source, destination, fixtures=False):
    direct(source, destination)
    if (source / "workers").is_dir():
        for worker in (source / "workers").iterdir():
            require(worker.is_dir(), "ARCHIVE_WORKER_NOT_DIRECTORY:" + worker.name)
            native(worker, destination / "workers" / worker.name)
    if (source / "completion").is_dir():
        collection(source / "completion", destination / "completion")
    if (source / "teeth").is_dir():
        for case in (source / "teeth").iterdir():
            if not case.is_dir():
                continue
            if fixtures:
                collection(case, destination / "teeth" / case.name)
                continue
            # Provenance consumes each exact verdict, not nested clones of its inputs.
            direct(case, destination / "teeth" / case.name)


if __name__ == "__main__":
    main()
