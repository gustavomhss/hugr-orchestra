"""Deterministic provenance inventory; this does not execute Atlas or any test suite."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "sources"
PREFIX = "modules/atlas/docs/design/genesis-ownership-results/"
REVISION = "1cde2ff7a71bcf7aecb5d030917b577165135d38"


def read(path):
    return json.loads((SOURCE / path).read_text())


def digest(path):
    return hashlib.sha256((SOURCE / path).read_bytes()).hexdigest()


def reference(path):
    return {"commit": REVISION, "path": path, "sha256": digest(path)}


layers = []
for directory, name, version in [
    ("layer-1", "L1", 3),
    ("layer-2", "L2", 4),
    ("layer-3", "L3", 3),
    ("layer-4", "L4", 2),
    ("layer-4-sol", "L4-sol", 2),
]:
    parent = PREFIX + directory + "/"
    manifest_path = parent + f"{name}-review-manifest-v{version}.json"
    acceptance_path = parent + f"{name}-acceptance.json"
    manifest = read(manifest_path)
    acceptance = read(acceptance_path)
    artifacts = []
    for output in manifest["outputs"]:
        path = parent + output["file"]
        artifacts.append({
            "producer_role": output["seat"],
            "reference": reference(path),
            "expected_body_sha256": output["bodySha256"],
            "body_sha256_matches": digest(path) == output["bodySha256"],
            "historical_producer_session": output.get("sessionID"),
            "historical_producer_message": output.get("messageID"),
            "historical_prompt_sha256": output.get("promptSha256", output.get("originalPacketSha256")),
            "authorship": output.get("authorship", "see preserved manifest and original body"),
            "input_bindings": output.get("inputs", []),
            "disposition": "HISTORICAL_INPUT_CANDIDATE_PENDING_CAMPAIGN_BINDING",
        })
    reviews = []
    for judgment in acceptance["judgments"]:
        path = parent + judgment["file"]
        body = (SOURCE / path).read_text()
        parsed = json.loads(body) if path.endswith(".json") else None
        review_id = parsed.get("manifestID") if parsed else next((line.split(":", 1)[1].strip() for line in body.splitlines() if line.startswith("Reviewed manifest:")), None)
        review_verdict = parsed.get("verdict") if parsed else next((line.split(":", 1)[1].strip() for line in body.splitlines() if line.startswith("Verdict:")), None)
        reviews.append({
            "reference": reference(path),
            "judge": judgment["judge"],
            "historical_session": judgment["sessionID"],
            "historical_message": judgment["messageID"],
            "expected_sha256": judgment["sha256"],
            "sha256_matches": digest(path) == judgment["sha256"],
            "manifest_id": review_id,
            "manifest_id_matches": review_id == manifest["manifestID"] == acceptance["manifestID"],
            "historical_verdict": review_verdict,
            "campaign_judgment": False,
        })
    layers.append({
        "layer": name,
        "legacy_manifest_id": manifest["manifestID"],
        "manifest_ref": reference(manifest_path),
        "acceptance_ref": reference(acceptance_path),
        "historical_status": acceptance["status"],
        "historical_scope": acceptance["scope"],
        "historical_source_revision": acceptance["sourceRevision"],
        "predecessor_bindings": {key: val for key, val in acceptance.items() if "ManifestID" in key and key != "manifestID"},
        "artifacts": artifacts,
        "reviews": reviews,
    })

supplement_parent = PREFIX + "layer-4-sol/"
supplement_manifest = read(supplement_parent + "operational-supplement-v1.manifest.json")
supplement_acceptance = read(supplement_parent + "operational-supplement-v1.acceptance.json")
supplement_body = supplement_parent + supplement_manifest["bodyFile"]
supplement = {
    "legacy_manifest_id": supplement_manifest["manifestID"],
    "manifest_ref": reference(supplement_parent + "operational-supplement-v1.manifest.json"),
    "acceptance_ref": reference(supplement_parent + "operational-supplement-v1.acceptance.json"),
    "body_ref": reference(supplement_body),
    "expected_body_sha256": supplement_manifest["bodySha256"],
    "body_sha256_matches": digest(supplement_body) == supplement_manifest["bodySha256"],
    "reviews": [{
        "reference": reference(supplement_parent + review["file"]),
        "sha256_matches": digest(supplement_parent + review["file"]) == review["sha256"],
        "historical_verdict": review["verdict"],
        "identity_correction": review["identityCorrection"],
        "campaign_judgment": False,
    } for review in supplement_acceptance["judgments"]],
    "historical_status": supplement_acceptance["status"],
}

delta_parent = PREFIX + "runtime-pilot/consumer-v3/"
delta_manifest_path = delta_parent + "provenance-revision/source-correction-manifest-v1.json"
delta_manifest = read(delta_manifest_path)
delta_freeze = read(delta_parent + "prefreeze-v2.json")
delta_approvals = read(delta_parent + "binding-approvals-v2.json")
delta = {
    "historical_candidate_id": delta_freeze["candidateID"],
    "manifest_ref": reference(delta_manifest_path),
    "manifest_sha256_matches_prefreeze": digest(delta_manifest_path) == delta_freeze["sourceCorrectionManifestSha256"],
    "prefreeze_ref": reference(delta_parent + "prefreeze-v2.json"),
    "binding_approvals_ref": reference(delta_parent + "binding-approvals-v2.json"),
    "both_exact_candidate_import_approvals": len(delta_approvals) == 2 and all(row["manifestID"] == delta_freeze["candidateID"] and row["verdict"] == "PASS" for row in delta_approvals),
    "historical_isolated_publication_receipt_ref": reference(delta_parent + "publication-native-v1.json"),
    "artifacts": [{
        "key": amendment["key"],
        "reference": reference(delta_parent + "provenance-revision/" + amendment["file"]),
        "body_sha256_matches": digest(delta_parent + "provenance-revision/" + amendment["file"]) == amendment["bodySha256"],
        "supersedes_original_body_sha256": amendment["originalBodySha256"],
        "authorship": amendment["authorship"],
        "disposition": "HISTORICAL_CORRECTED_INPUT_CANDIDATE_PENDING_CAMPAIGN_BINDING",
    } for amendment in delta_manifest["amendments"]],
    "limits": ["Historical isolated publication is not an execution by S2", "No consumer responses or reserved answers were read", "Import mapping approval is not global acceptance or S5 judgment"],
}

inventory = {
    "schema": "genesis-preparation-reuse-inventory/v1",
    "attempt_id": "PREP-S2-03",
    "campaign": "20261111-v1",
    "session": "s2",
    "producer": "/root/reuse_inventory",
    "source_revision": REVISION,
    "protocol_revision": "2689c516d63488be37de678cc853dd4556fd5c13",
    "status": "PREPARATION_ONLY",
    "layers": layers,
    "operational_supplement": supplement,
    "operational_source_correction": delta,
    "limits": [
        "This is provenance and compatibility inspection, not construction, an Atlas import/cache/rebuild run, or semantic acceptance",
        "Source identity matches only the inspected 16 unique source files; no repository-wide membership or dependency-closure sufficiency is certified",
        "All historical author/model/session and editorial-derivative identities remain historical",
        "New scope, source authority, recipe, contracts and membership must be fixed by S1 and bound to S5 acceptance before dependent production",
        "Historical acceptance statuses cannot satisfy the two native S5 judges for campaign 20261111-v1 automatically",
        "Exact old producer response/receipt files outside the committed corpus were not fetched or reconstructed",
        "Physical attempts, tokens and billing in this native inspection are UNKNOWN",
    ],
}
(ROOT / "reuse-candidates.json").write_text(json.dumps(inventory, indent=2, ensure_ascii=False) + "\n")
summary = {
    "historical_layers": len(layers),
    "historical_manifest_bodies": sum(len(layer["artifacts"]) for layer in layers),
    "body_sha256_matches": sum(artifact["body_sha256_matches"] for layer in layers for artifact in layer["artifacts"]),
    "historical_review_files": sum(len(layer["reviews"]) for layer in layers),
    "review_sha256_and_manifest_matches": sum(review["sha256_matches"] and review["manifest_id_matches"] for layer in layers for review in layer["reviews"]),
    "supplement_body_sha256_matches": supplement["body_sha256_matches"],
    "supplement_review_sha256_matches": sum(review["sha256_matches"] for review in supplement["reviews"]),
    "corrected_bodies_sha256_matches": sum(artifact["body_sha256_matches"] for artifact in delta["artifacts"]),
    "source_correction_manifest_matches_prefreeze": delta["manifest_sha256_matches_prefreeze"],
    "historical_exact_candidate_import_approvals": delta["both_exact_candidate_import_approvals"],
    "atlas_producer_executed": False,
    "tests_run": False,
    "campaign_acceptance": False,
}
(ROOT / "integrity-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
