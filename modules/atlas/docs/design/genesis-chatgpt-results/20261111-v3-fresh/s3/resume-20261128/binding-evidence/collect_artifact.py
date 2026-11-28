#!/usr/bin/env python3
"""Read and preserve a real Actions artifact; no product/runtime import or execution."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("zip", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--run-id", required=True, type=int)
    ap.add_argument("--artifact-id", required=True, type=int)
    args = ap.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    rows = []
    with zipfile.ZipFile(args.zip) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP path")
        for info in archive.infolist():
            rel = PurePosixPath(info.filename)
            if rel.is_absolute() or ".." in rel.parts or "\\" in info.filename:
                raise ValueError("Unsafe ZIP path")
            if info.is_dir():
                continue
            digest = hashlib.sha256()
            size = 0
            chunks = []
            preserve = info.filename != "state.tar.gz"
            with archive.open(info) as stream:
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
                    size += len(chunk)
                    if preserve:
                        chunks.append(chunk)
            if size != info.file_size:
                raise ValueError("ZIP member length differs")
            row = {"path": info.filename, "byte_length": size, "sha256": digest.hexdigest(), "extracted": preserve}
            rows.append(row)
            if preserve:
                target = args.output.joinpath(*rel.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                data = b"".join(chunks)
                if target.exists() and target.read_bytes() != data:
                    raise ValueError("Refusing to replace different prior artifact bytes")
                target.write_bytes(data)
    value = {"schema": "s3-actions-artifact-byte-custody/v1", "run_id": args.run_id,
             "artifact_id": args.artifact_id, "zip": {"path": str(args.zip),
             "byte_length": args.zip.stat().st_size, "sha256": sha(args.zip.read_bytes())},
             "members": rows, "product_execution": False,
             "state_archive_retained_in_original_zip": "state.tar.gz" in names}
    (args.output / "artifact-custody.json").write_text(json.dumps(value, indent=2) + "\n")
    print(json.dumps({"run_id": args.run_id, "artifact_id": args.artifact_id,
                      "zip_sha256": value["zip"]["sha256"], "members": len(rows),
                      "output": str(args.output)}, sort_keys=True))


if __name__ == "__main__":
    main()
