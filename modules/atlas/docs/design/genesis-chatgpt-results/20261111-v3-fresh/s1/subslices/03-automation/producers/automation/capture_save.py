"""Persist connector UTF-8 text and calculate transport identities; never runs product code."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
BASELINE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
records = json.loads(sys.argv[1])
if isinstance(records, dict):
    records = [records]
results = []
for record in records:
    relative = Path(record["path"])
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("invalid source path")
    data = record["content"].encode("utf-8")
    blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    if blob != record["git_blob_sha"]:
        raise ValueError(f"Git blob mismatch for {relative}: {blob} != {record['git_blob_sha']}")
    target = ROOT / "sources" / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    receipt = {
        "path": str(relative), "commit": record.get("commit", BASELINE),
        "git_blob_sha": blob, "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data), "encoding": "utf-8", "connector": "github.fetch_blob",
        "capture_path": str(target.relative_to(ROOT)), "git_blob_verified": True,
    }
    ledger = ROOT / "capture-ledger.jsonl"
    with ledger.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(receipt, ensure_ascii=False) + "\n")
    results.append({"path": str(relative), "bytes": len(data), "git_blob_verified": True})
print(json.dumps(results))
