"""Mechanical reconciliation only; never infer semantic acceptance from source capture."""
from pathlib import Path
import collections
import datetime
import hashlib
import json

W = Path(__file__).resolve().parents[1]
P = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/01-sessions"
read = lambda p: json.loads((W / p).read_text())
lines = lambda p: [json.loads(x) for x in (W / p).read_text().splitlines() if x]
inventory = lines("control/sources.jsonl")
assigned = {r["path"]: r for r in inventory}
assert len(inventory) == len(assigned) == 555
groups = [
    ("session-state", "a1_completion/row-dispositions.jsonl", lines("a1_completion/row-dispositions.jsonl"), "producers/session-state-completion/row-dispositions.jsonl", "s1.subslice01.session-state-completion", "read_depth", "a1_completion/bodies/session-state-completion.md"),
    ("configuration-project", "config_project/coverage.json", read("config_project/coverage.json")["rows"], "producers/config-project/coverage.json", "s1.subslice01.config-project-supplement", "semantic_read_status", "config_project/bodies/config-project-supplement-v2.md"),
    ("runtime-models-economy", "runtime_completion/source-coverage.jsonl", lines("runtime_completion/source-coverage.jsonl"), "producers/runtime-completion/source-coverage.jsonl", "s1.subslice01.runtime-models-economy-completion", "evidence_depth", "runtime_completion/bodies/runtime-models-economy-completion.md"),
]
acceptance_path = W / "judgments/acceptance-index.json"
acceptance = json.loads(acceptance_path.read_text()) if acceptance_path.exists() else {"artifacts": {}}
all_rows = []
counts = []
seen = set()
for group, local, rows, remote, key, depth_key, body_path in groups:
    body_sha = hashlib.sha256((W / body_path).read_bytes()).hexdigest()
    accepted = acceptance.get("artifacts", {}).get(key, {})
    assert len(rows) == {"session-state": 197, "configuration-project": 123, "runtime-models-economy": 235}[group]
    for row in rows:
        path = row["path"]
        assert path in assigned and path not in seen, path
        seen.add(path)
        expected = assigned[path].get("git_blob_sha", assigned[path].get("blob_sha"))
        assert expected == row["git_blob_sha"], (path, expected, row["git_blob_sha"])
        all_rows.append({
            "path": path, "git_blob_sha": row["git_blob_sha"],
            "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
            "work_package": group, "legacy_artifact_key": assigned[path].get("legacy_artifact_key", assigned[path].get("artifact_key")),
            "need_support_key": key, "need_support_body_sha256": body_sha,
            "producer_disposition_ref": P + "/" + remote,
            "producer_disposition_file_sha256": hashlib.sha256((W / local).read_bytes()).hexdigest(),
            "read_depth": row.get(depth_key),
            "semantic_disposition": accepted.get("state", "PENDING_SAME_PAIR_REVIEW") if accepted.get("body_sha256") == body_sha else "PENDING_SAME_PAIR_REVIEW",
            "coverage_limit": "A reviewed family disposition does not mean every source body or branch was read or executed. Preserve the exact producer depth/ranges/limits at the referenced row.",
            "product_execution": "NOT_RUN",
        })
    counts.append({"work_package": group, "count": len(rows), "depth_counts": dict(collections.Counter(row.get(depth_key, "unknown") for row in rows)), "body_sha256": body_sha})
assert seen == set(assigned)
out = {"schema": "genesis-s1-01-coverage/v1", "execution_id": "6e9b2070-17eb-4e92-bba6-64ce616d6116", "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "assigned_count": 555, "unique_disposed_count": len(seen), "missing_paths": [], "extra_paths": [], "groups": counts, "judgment_policy": "Same two real judges assess the exact body and its depth-disclosed population; no acceptance follows merely from hashes, file lists or supported metadata.", "rows": sorted(all_rows, key=lambda r: r["path"])}
(W / "coverage.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"counts": counts, "rows": len(all_rows), "sha256": hashlib.sha256((W / "coverage.json").read_bytes()).hexdigest()}, ensure_ascii=False))
