#!/usr/bin/env python3
"""Verify this documentary package against exact baseline source bytes.

No network, product execution, CI, semantic judgment or acceptance is performed.
The recursive Git tree is reconstructed, including modes, from the public census.
Usage: python verification/verify.py --source-root /path/to/baseline/repository
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath

BASELINE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
OMNI_TREE = "6d1020e8641d699f2f3eeef3007b2749fb6b4c28"
PATH_DIGEST = "e86453445865832e50e71e737133734dca240ca5b77fa2cbcbbf725fa6edbda3"
IDENTITY_DIGEST = "da624b9ba01adc0976a0705557f939f8335a0ac02820db8555d6d22df1692d2d"
REQUIRED = {"path", "git_blob_sha", "source_sha256", "source_bytes", "line_count", "kind", "disposition", "purpose", "behavior", "contracts", "dependencies", "failures_or_limits", "evidence", "inference", "gaps", "runtime_status", "author_role"}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git_object(kind, data):
    return hashlib.sha1(kind.encode() + b" " + str(len(data)).encode() + b"\0" + data).hexdigest()


def read_json(path):
    return json.loads(path.read_bytes())


def beneath(root, relative):
    parts = PurePosixPath(relative)
    if parts.is_absolute() or any(part in (".", "..") for part in parts.parts) or "\\" in relative:
        raise ValueError("unsafe path: " + relative)
    path = root.joinpath(*parts.parts)
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError("symlink or escape: " + relative)
    return path


def verify(source_root, result_root):
    errors = []
    checked = {"sources": 0, "excluded_support": 0, "records": 0, "excerpts": 0, "bodies": 0, "git_trees": 0, "dual_accepted_summary_records": 0}

    def require(condition, code, location="", detail=None):
        if not condition:
            errors.append({"code": code, "location": location, **({"detail": detail} if detail is not None else {})})

    manifest = read_json(result_root / "manifest.json")
    census = read_json(result_root / "verification/inventory-tree.json")
    require(manifest["source_revision"] == census["source_revision"] == BASELINE, "BASELINE")
    require(census["git_tree_sha"] == manifest["omni_tree"] == OMNI_TREE and census["truncated"] is False, "TREE_IDENTITY")
    entries, excluded = manifest["entries"], manifest["excluded"]
    by_path = {entry["path"]: entry for entry in entries}
    omitted = {entry["path"]: entry for entry in excluded}
    require(len(entries) == len(by_path) == 393, "PRODUCTION_COUNT")
    require(len(excluded) == len(omitted) == 33, "EXCLUSION_COUNT")
    require(not set(by_path) & set(omitted), "EXCLUSION_OVERLAP")
    require(digest("".join(path + "\n" for path in sorted(by_path)).encode()) == PATH_DIGEST, "PATH_SET")
    require(digest("".join(path + "\t" + by_path[path]["git_blob_sha"] + "\n" for path in sorted(by_path)).encode()) == IDENTITY_DIGEST, "PATH_BLOB_SET")

    tree_entries = census["entries"]
    tree_index = {entry["path"]: entry for entry in tree_entries}
    require(len(tree_index) == len(tree_entries), "CENSUS_DUPLICATE")
    blobs = {"native/omni/" + entry["path"]: entry for entry in tree_entries if entry["type"] == "blob"}
    require(len(blobs) == 426 and set(blobs) == set(by_path) | set(omitted), "CENSUS_POPULATION")
    files = {}
    for path, entry in blobs.items():
        source = beneath(source_root, path)
        if not source.is_file():
            require(False, "SOURCE_MISSING", path)
            continue
        data = source.read_bytes()
        files[path] = data
        actual = git_object("blob", data)
        require(actual == entry["sha"], "SOURCE_BLOB", path)
        require(len(data) == entry["size"], "SOURCE_SIZE", path)
        require((by_path.get(path) or omitted[path])["git_blob_sha"] == entry["sha"], "MANIFEST_BLOB", path)
        checked["sources"] += 1
        checked["excluded_support"] += path in omitted

    directories = {"": OMNI_TREE, **{entry["path"]: entry["sha"] for entry in tree_entries if entry["type"] == "tree"}}
    for directory, expected in directories.items():
        parent = directory or "."
        children = [entry for entry in tree_entries if str(PurePosixPath(entry["path"]).parent) == parent]
        children.sort(key=lambda entry: (PurePosixPath(entry["path"]).name + ("/" if entry["type"] == "tree" else "")).encode())
        raw = b"".join(entry["mode"].lstrip("0").encode() + b" " + PurePosixPath(entry["path"]).name.encode() + b"\0" + bytes.fromhex(entry["sha"]) for entry in children)
        require(git_object("tree", raw) == expected, "GIT_TREE", directory or "native/omni")
        checked["git_trees"] += 1

    bodies, seen, mapped = {}, set(), set()
    for path, entry in by_path.items():
        require(len(entry["artifacts"]) == 1, "L1_MAPPING_COUNT", path)
        for artifact in entry["artifacts"]:
            body_path = artifact["path"]
            require(body_path.startswith("bodies/" + entry["owner"] + "/"), "OWNER_MAPPING", path)
            if body_path not in bodies:
                bodies[body_path] = read_json(beneath(result_root, body_path))
                require(isinstance(bodies[body_path], list), "BODY_ARRAY", body_path)
            index = artifact["record_index"]
            location = body_path + "#" + str(index)
            require((body_path, index) not in mapped, "DUPLICATE_MAPPING", location)
            mapped.add((body_path, index))
            records = bodies[body_path]
            if not isinstance(index, int) or not 0 <= index < len(records):
                require(False, "RECORD_INDEX", location)
                continue
            record = records[index]
            require(REQUIRED <= record.keys(), "RECORD_FIELDS", location)
            require(record["path"] == path and path not in seen, "RECORD_PATH", location)
            seen.add(path)
            data = files.get(path)
            if data is None:
                continue
            require(record["git_blob_sha"] == entry["git_blob_sha"], "RECORD_BLOB", location)
            require(record["source_sha256"] == entry["source_sha256"] == digest(data), "SOURCE_SHA256", location)
            require(record["source_bytes"] == entry["source_bytes"] == len(data), "RECORD_SIZE", location)
            text = data.decode("utf-8")
            lines = text.replace("\r\n", "\n").split("\n") if text else []
            if text.endswith("\n"):
                lines.pop()
            require(record["line_count"] == entry["line_count"] == len(lines), "LF_LINE_COUNT", location)
            require(record["runtime_status"] == "NOT_RUN", "SOURCE_NOT_EXECUTED", location)
            require(record["disposition"] == "analyzed" and bool(record["purpose"]) and bool(record["behavior"]), "DISPOSITION", location)
            require(bool(record["evidence"]), "EVIDENCE_MISSING", location)
            for number, excerpt in enumerate(record["evidence"]):
                start, end = excerpt["start_line"], excerpt["end_line"]
                valid = isinstance(start, int) and isinstance(end, int) and 1 <= start <= end <= len(lines)
                require(valid, "EXCERPT_RANGE", location + "/" + str(number))
                if valid:
                    exact = "\n".join(lines[start - 1:end])
                    require(excerpt["quote"] in (exact, exact + "\n"), "EXCERPT_BYTES", location + "/" + str(number))
                checked["excerpts"] += 1
            checked["records"] += 1
    require(set(by_path) == seen, "RECORD_COVERAGE")
    require(sum(len(body) for body in bodies.values()) == len(mapped) == 393, "UNMAPPED_OR_DUPLICATE_RECORD")

    reviews = {}
    expected_judges = {"/root/omni_review_courier/omni_j1", "/root/omni_review_courier/omni_j2"}
    for path, entry in by_path.items():
        if entry["state"] != "DUAL_REVIEW_ACCEPTED_L1":
            continue
        refs = entry.get("review_refs", [])
        require(len(refs) == len(set(refs)) == 2, "REVIEW_REFERENCE_PAIR", path)
        judges = set()
        mapping = entry["artifacts"][0]
        for ref in refs:
            if ref not in reviews:
                reviews[ref] = read_json(beneath(result_root, ref))
            review = reviews[ref]
            judges.add(review["judge_identity"])
            body = beneath(result_root, mapping["path"]).read_bytes()
            require(review["artifact"]["public_path"] == mapping["path"] and review["artifact"]["sha256"] == digest(body) and review["artifact"]["bytes"] == len(body), "REVIEW_BODY_BINDING", path)
            matching = [row for row in review["records"] if row["path"] == path and row["index"] == mapping["record_index"] and row["verdict"] == "PASS"]
            require(len(matching) == 1, "REVIEW_RECORD_COVERAGE", path)
            require(review["verdict"] == "PASS" and set(review["criteria"]) == {"C" + str(i) for i in range(1, 8)} and all(row["verdict"] == "PASS" for row in review["criteria"].values()) and not review["mandatory_findings_remaining"] and not review["missing_evidence"], "REVIEW_NOT_ACCEPTED", ref)
        require(judges == expected_judges, "REVIEWER_PAIR", path)
        checked["dual_accepted_summary_records"] += 1
    require(manifest["independently_reviewed_count"] == manifest["reviewed_count"] == checked["dual_accepted_summary_records"], "REVIEW_COUNT")

    native = read_json(result_root / "native-package.json")
    for artifact in native["artifacts"]:
        body = artifact["body"]
        data = beneath(result_root, body["path"]).read_bytes()
        require(len(data) == body["byte_length"] and digest(data) == body["sha256"], "NATIVE_BODY", artifact["key"])
        checked["bodies"] += 1
    return {"schema": "omni-public-verification/v1", "source_revision": BASELINE, "omni_tree": OMNI_TREE, "checked": checked, "errors": errors, "result": "PASS" if not errors else "FAIL", "scope": "Recursive Git census, source bytes, per-source mappings, LF-numbered excerpts, native body hashes and consistency of public review summaries. Summary checks do not authenticate the private exchanges. No semantic judgment, runtime execution, CI or Genesis acceptance."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--result-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        result = verify(args.source_root, args.result_root)
    except (OSError, ValueError, KeyError, TypeError) as error:
        result = {"result": "FAIL", "errors": [{"code": "INVALID_OR_MISSING_INPUT", "detail": str(error)}]}
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(output)
    print(output, end="")
    raise SystemExit(0 if result["result"] == "PASS" else 1)
