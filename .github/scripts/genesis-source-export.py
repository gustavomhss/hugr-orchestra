"""Export fixed public source scopes, never worktree state or credentials.

No repository code is executed. The selector is an already-public, fixed S3
package. Results/judgments/receipts are excluded; their separate captures are
not replaced. Git object identities and snapshot distinctions are retained.
"""
import hashlib
import json
import pathlib
import re
import subprocess
import zipfile

SOURCE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
PROTOCOL = "ee2521a5b966bd505cc95bd1c733e09e12f33531"
TRANSPORT = "68fca8e90c3150416e4e7ef8410df1cc42ee9d1b"
PINS = (SOURCE, PROTOCOL, TRANSPORT)
SELECTOR = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/native-package.json"
RESULTS = "modules/atlas/docs/design/genesis-chatgpt-results/"
OUTPUT = pathlib.Path("genesis-source-export.zip")
MAX_OBJECT = 32 * 1024 * 1024
MAX_RAW = 512 * 1024 * 1024
MAX_ARCHIVE = 128 * 1024 * 1024


def git(*args):
    return subprocess.check_output(["git", *args])


def valid_path(path):
    if not isinstance(path, str) or not path or path.startswith("/"):
        raise ValueError("invalid repository path")
    if "\\" in path or any(ord(c) < 32 for c in path):
        raise ValueError("unsafe repository path")
    if any(p in ("", ".", "..", ".git") for p in path.split("/")):
        raise ValueError("unsafe repository component")
    return path


selector_bytes = git("show", f"{TRANSPORT}:{SELECTOR}")
selector = json.loads(selector_bytes)
if selector["source_revision"] != SOURCE:
    raise ValueError("selector source revision differs")
files, members = set(), set()
for artifact in selector["artifacts"]:
    for key in artifact["input_keys"]:
        kind, path = key.split(":", 1)
        valid_path(path)
        if kind == "file":
            files.add(path)
        elif kind == "members":
            members.add(path)
        else:
            raise ValueError("unexpected observer key")
    for reference in artifact["source_refs"]:
        files.add(valid_path(reference["path"]))

excluded = sorted(p for p in files if p.startswith(RESULTS))
files.difference_update(excluded)
if any(p.startswith(RESULTS) for p in members):
    raise ValueError("result directory cannot be a source membership export")

objects = {}
snapshots = []
for pin in PINS:
    commit = git("rev-parse", f"{pin}^{{commit}}").decode().strip()
    if commit != pin:
        raise ValueError("pin did not resolve exactly")
    root_tree = git("rev-parse", f"{pin}^{{tree}}").decode().strip()
    objects[pin] = "commit"
    objects[root_tree] = "tree"
    records, selected = [], []
    for raw in git("ls-tree", "-r", "-t", "-z", "--full-tree", pin).split(b"\0"):
        if not raw:
            continue
        fields, name = raw.split(b"\t", 1)
        mode, kind, oid = fields.decode("ascii").split(" ")
        path = valid_path(name.decode("utf-8"))
        if kind == "tree":
            objects[oid] = "tree"
            continue
        wanted = path in files or any(path == m or path.startswith(m + "/") for m in members)
        # Complete public membership scopes, not just their listed file inputs.
        if wanted and not path.startswith(RESULTS):
            if kind != "blob" or mode not in ("100644", "100755", "120000"):
                raise ValueError("selected source is not an ordinary Git blob")
            objects[oid] = "blob"
            selected.append(path)
            records.append({"path": path, "mode": mode, "git_blob": oid})
    snapshots.append({"commit": pin, "root_tree": root_tree, "entries": records,
                      "missing_file_inputs": sorted(files.difference(selected))})

potential_secret = re.compile(
    rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
    rb"\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b|"
    rb"\bsk-proj-[A-Za-z0-9_-]{40,}\b"
)
total = 0
inventory = []
try:
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        process = subprocess.Popen(["git", "cat-file", "--batch"], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE)
        try:
            for oid, expected_type in sorted(objects.items()):
                process.stdin.write((oid + "\n").encode("ascii"))
                process.stdin.flush()
                header = process.stdout.readline().decode("ascii").strip().split(" ")
                if len(header) != 3 or header[0] != oid or header[1] != expected_type:
                    raise ValueError("Git object header mismatch")
                size = int(header[2])
                if size > MAX_OBJECT or total + size > MAX_RAW:
                    raise ValueError("export size bound exceeded; no truncated export")
                data = process.stdout.read(size)
                if len(data) != size or process.stdout.read(1) != b"\n":
                    raise ValueError("short Git object read")
                canonical = f"{expected_type} {size}\0".encode("ascii") + data
                if hashlib.sha1(canonical).hexdigest() != oid:
                    raise ValueError("Git object digest mismatch")
                if expected_type == "blob" and potential_secret.search(data):
                    raise ValueError("potential credential marker in selected public blob: " + oid)
                total += size
                archive.writestr("objects/" + oid, canonical)
                inventory.append({"oid": oid, "type": expected_type, "bytes": size,
                                  "canonical_sha256": hashlib.sha256(canonical).hexdigest()})
        finally:
            process.stdin.close()
            process.stdout.close()
            if process.wait(timeout=30) != 0:
                raise ValueError("Git object reader failed")
        manifest = {"schema": "genesis-public-source-export/v1", "pins": list(PINS),
                    "selector": {"commit": TRANSPORT, "path": SELECTOR,
                                 "sha256": hashlib.sha256(selector_bytes).hexdigest()},
                    "file_inputs": sorted(files), "membership_scopes": sorted(members),
                    "excluded_results": excluded, "snapshots": snapshots, "objects": inventory,
                    "raw_bytes": total, "worktree_exported": False, "runtime_credentials_exported": False,
                    "credential_scan": "Selected signatures not detected; limited scan does not certify absence of all secrets in public source blobs.",
                    "repository_code_executed": False,
                    "scope": "Selected public files plus complete declared membership scopes; all tree/commit objects are metadata, not an assertion of a full working copy."}
        archive.writestr("manifest.json", json.dumps(manifest, sort_keys=True, indent=2) + "\n")
    if OUTPUT.stat().st_size > MAX_ARCHIVE:
        raise ValueError("compressed export exceeds bound; no partial artifact")
except BaseException:
    OUTPUT.unlink(missing_ok=True)
    raise
print(json.dumps({"objects": len(inventory), "raw_bytes": total,
                  "archive_bytes": OUTPUT.stat().st_size,
                  "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest()}))
