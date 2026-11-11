#!/usr/bin/env python3
"""Verify Genesis transport bytes and declared bindings; this is not an Atlas/product test."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--package", type=Path, default=Path(__file__).with_name("native-package.json"))
parser.add_argument("--source-captures", type=Path)
args = parser.parse_args()
package_path = args.package.resolve()
root = package_path.parent
package = json.loads(package_path.read_text())
errors = []
checks = 0

def require(condition, message):
    global checks
    checks += 1
    if not condition:
        errors.append(message)

def confined(relative):
    path = Path(relative)
    require(not path.is_absolute() and ".." not in path.parts, "unsafe body path: " + relative)
    target = root / path
    require(target.is_file() and not target.is_symlink(), "missing/symlink body: " + relative)
    require(target.resolve().is_relative_to(root), "escaped body root: " + relative)
    return target

require(package.get("schema") == "genesis-native-package/v1", "wrong schema")
require(package.get("session") == "S1", "wrong session")
require(package.get("source_revision") == "1cde2ff7a71bcf7aecb5d030917b577165135d38", "wrong source pin")
artifacts = package.get("artifacts", [])
keys = [a["key"] for a in artifacts]
require(len(keys) == len(set(keys)), "duplicate artifact keys")
required = set(package.get("required_artifact_keys", []))
require(required <= set(keys), "missing required artifact keys")
needs = {"entry", "ownership", "maintenance", "operational", "flow", "evidence", "component"}
seen = set()
source_reads = {}
if args.source_captures:
    for producer in args.source_captures.iterdir():
        source_dir = producer / "sources"
        if source_dir.exists():
            for path in source_dir.rglob("*"):
                if path.is_file():
                    relative = str(path.relative_to(source_dir))
                    body = path.read_bytes()
                    old = source_reads.get(relative)
                    require(old is None or old == body, "inconsistent source captures: " + relative)
                    source_reads[relative] = body
for artifact in artifacts:
    key = artifact["key"]
    require(artifact.get("scope") == package["scope"], "scope mismatch: " + key)
    require(type(artifact.get("layer")) is int and artifact["layer"] in (1, 2, 3, 4), "invalid layer: " + key)
    require(artifact.get("need") in needs, "invalid need: " + key)
    require(artifact.get("validity") in ("supported", "blocked"), "invalid validity: " + key)
    body_info = artifact["body"]
    path = confined(body_info["path"])
    if path.is_file():
        body = path.read_bytes()
        body.decode("utf-8")
        require(body_info.get("encoding") == "utf-8", "wrong body encoding: " + key)
        require(len(body) == body_info["byte_length"], "body length mismatch: " + key)
        require(hashlib.sha256(body).hexdigest() == body_info["sha256"], "body hash mismatch: " + key)
    for dep in artifact.get("build_dependencies", []):
        if dep.get("same_package"):
            require(dep["key"] in seen, "missing/forward/cyclic dependency: " + key + " -> " + dep["key"])
        else:
            require(bool(dep.get("package_ref")), "unbound external dependency: " + key)
    for source in artifact.get("source_refs", []):
        require(source.get("commit") == package["source_revision"], "unexpected source revision: " + source["path"])
        if args.source_captures:
            body = source_reads.get(source["path"])
            require(body is not None, "uncaptured declared source: " + source["path"])
            if body is not None:
                require(hashlib.sha256(body).hexdigest() == source["sha256"], "source SHA256 mismatch: " + source["path"])
                git_blob = hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()
                require(git_blob == source["git_blob_sha"], "source Git blob mismatch: " + source["path"])
    seen.add(key)
for need, roots in package.get("roots", {}).items():
    require(need in needs, "invalid root need: " + need)
    require(isinstance(roots, list), "roots must be a list: " + need)
    if isinstance(roots, list):
        require(all(key in seen for key in roots), "unknown root: " + need)
report = {"kind": "transport_verification_only", "package_sha256": hashlib.sha256(package_path.read_bytes()).hexdigest(), "artifacts": len(artifacts), "checks": checks, "errors": errors, "status": "PASS" if not errors else "FAIL", "does_not_prove": ["semantic sufficiency", "Atlas import or publication", "ownership.index/read", "product tests or CI"]}
print(json.dumps(report, indent=2))
raise SystemExit(bool(errors))
