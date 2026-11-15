#!/usr/bin/env python3
"""Mechanical native-package staging. No product execution, network, or semantic judging."""
import argparse
import collections
import copy
import datetime
import hashlib
import json
import pathlib
import re
import unicodedata

P = argparse.ArgumentParser(description=__doc__)
P.add_argument("--workspace", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent.parent)
P.add_argument("--bindings", type=pathlib.Path, help="Root-authored nonreserved references/roots/artifact metadata overrides.")
P.add_argument("--upper", type=pathlib.Path, help="Optional directory of later upper artifact JSON fragments.")
ARGS = P.parse_args()
ROOT = ARGS.workspace.resolve()
OUT = ROOT / "assembly"
PAYLOAD = ROOT / "payload"
ATLAS = ROOT / "atlas-source"
HISTORY = "a8df22ae3a140c58c63f62ce2a634c84f415c943"
BASELINE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
HIST_PREFIX = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1"
PREFIX = HIST_PREFIX + "/subslices/01-sessions"
OLD_CONFIG = PREFIX + "/config_project"
NEW_CONFIG = PREFIX + "/producers/config-project"
MOUNTS = {
    NEW_CONFIG: ROOT / "config_project",
    PREFIX + "/producers/runtime-completion": ROOT / "runtime_completion",
    PREFIX + "/producers/session-state-completion": ROOT / "a1_completion",
    PREFIX + "/judgments": ROOT / "judgments",
    PREFIX + "/upper": ARGS.upper.resolve() if ARGS.upper else ROOT / "upper",
}
changes, missing, preserved, origins, source_additions = [], [], [], [], []
staged = {}
source_checks = {}
blocked_prefixes = {"reserved", "oracles"}

def protected(path):
    return bool(blocked_prefixes.intersection(pathlib.PurePath(str(path)).parts))

def read(path):
    path = pathlib.Path(path)
    if protected(path):
        raise ValueError("Protected input is never read by the assembler: " + str(path))
    resolved = path.resolve()
    if not resolved.is_relative_to(ROOT):
        raise ValueError("Input escapes workspace: " + str(path))
    if path.is_symlink():
        raise ValueError("Symlink input: " + str(path))
    return path.read_bytes()

def load(path):
    return json.loads(read(path))

def sha(data):
    return hashlib.sha256(data).hexdigest()

def blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def compact(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def unique(values):
    return list(dict.fromkeys(values))

def report(kind, **fields):
    missing.append({"kind": kind, **fields})

def path_ok(path):
    return isinstance(path, str) and bool(path) and not re.search(r'[\\:*?"<>|\x00-\x1f\x7f]', path) and all(
        p and p not in {".", ".."} and p.lower() not in {".git", ".atlas"} and not p.endswith((".", " "))
        for p in path.split("/")
    )

def relocated(path):
    return NEW_CONFIG + path[len(OLD_CONFIG):] if path.startswith(OLD_CONFIG + "/") else path

def normalize_ref(ref, owner, field):
    if ref is None:
        report("missing_reference", artifact=owner, field=field)
        return None
    before = copy.deepcopy(ref)
    if "payload_path" in ref:
        path = ref["payload_path"]
        if path.startswith(HIST_PREFIX + "/") and not path.startswith(PREFIX + "/"):
            commit = "882752dea940817edbc261d8b5763bde32872e7e" if "/revisions/b15-economy-v1/" in path else HISTORY
            result = {"commit": commit, "path": path, "sha256": ref["sha256"]}
        else:
            result = {"payload_path": relocated(path), "sha256": ref["sha256"]}
    else:
        result = {k: ref[k] for k in ("commit", "path", "sha256")}
    if result != before:
        changes.append({"artifact": owner, "field": field, "from": before, "to": result})
    return result

def ref_path(ref):
    return ref.get("payload_path", ref.get("path"))

def candidates(path, commit=None):
    path = relocated(path)
    result = []
    if path == ".orchestra/skills/execute-genesis/SKILL.md":
        result.append(ROOT / "control/execute-genesis.md")
    if path == HIST_PREFIX + "/delegation-20261114/01-sessions/sources.jsonl":
        result.append(ROOT / "control/sources.jsonl")
    for remote, local in MOUNTS.items():
        if path.startswith(remote + "/"):
            result.append(local / path[len(remote) + 1:])
    if path.startswith(HIST_PREFIX + "/producers/a/"):
        tail = path.split("/producers/a/", 1)[1]
        result += [ROOT / "a1/originals/producer" / tail, ROOT / "config_project/inherited" / tail]
        if tail.startswith("bodies/"):
            result += [ROOT / "a1/originals/bodies" / tail[7:], ROOT / "runtime_models/inherited-bodies" / tail[7:]]
    if path.startswith(HIST_PREFIX + "/producers/recovery-a1-20261112/"):
        result.append(ROOT / "a1/recovery" / path.split("/recovery-a1-20261112/", 1)[1])
    for name in ("judgments", "review-packets"):
        if path.startswith(HIST_PREFIX + "/" + name + "/"):
            result.append(ROOT / "a1/originals" / name / path.rsplit("/", 1)[1])
    if commit:
        result.append(ROOT / "runtime_models/captures" / commit / path)
    result += [ROOT / name / path for name in ("a1/sources", "config_project/sources", "a1_completion/sources", "a1_completion/cross-sources")]
    result += [ATLAS / path, PAYLOAD / path]
    return result

def locate(path, expected=None, commit=None):
    if protected(path):
        return None
    for candidate in candidates(path, commit):
        if not candidate.is_file() or candidate.is_symlink():
            continue
        data = read(candidate)
        if expected is None or sha(data) == expected:
            return candidate
    return None

def put(local, remote, purpose, expected=None, publish=True):
    if not path_ok(remote):
        report("invalid_materialization_path", path=remote, purpose=purpose)
        return
    data = read(local)
    digest = sha(data)
    if expected and digest != expected:
        report("local_hash_mismatch", path=str(local), expected=expected, observed=digest, purpose=purpose)
        return
    data.decode("utf-8", errors="strict")
    if publish:
        if not remote.startswith(PREFIX + "/"):
            raise ValueError("Remote staging escapes assigned prefix: " + remote)
        if remote in staged and staged[remote]["sha256"] != digest:
            raise ValueError("Conflicting payload bytes: " + remote)
        target = PAYLOAD / remote
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        staged[remote] = {"path": remote, "sha256": digest, "byte_length": len(data), "source_local": str(local.relative_to(ROOT)), "purpose": purpose}
    target = ATLAS / remote
    if not publish and target.is_file() and sha(read(target)) != digest:
        report("immutable_atlas_reference_conflict", path=remote, expected=digest, observed=sha(read(target)))
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    preserved.append({"path": remote, "sha256": digest, "byte_length": len(data), "source_local": str(local.relative_to(ROOT)), "placement": "payload-and-atlas-source" if publish else "atlas-source-only", "purpose": purpose})

def materialize_ref(ref, owner, field):
    if ref is None:
        return
    path = ref_path(ref)
    if protected(path):
        report("root_only_oracle_materialization", artifact=owner, field=field, reference=ref)
        return
    local = locate(path, ref["sha256"], ref.get("commit"))
    if local is None:
        report("reference_bytes_unavailable", artifact=owner, field=field, reference=ref)
        return
    put(local, path, field + " of " + owner, ref["sha256"], path.startswith(PREFIX + "/"))

def normalize_artifact(original, local_body, body_path, metadata_path):
    art = copy.deepcopy(original)
    key = art["key"]
    raw = read(local_body)
    raw.decode("utf-8", errors="strict")
    expected = art["body"]
    if sha(raw) != expected["sha256"] or len(raw) != expected["byte_length"]:
        raise ValueError("Selected body differs from frozen metadata: " + key)
    put(local_body, PREFIX + "/" + body_path, "selected exact artifact body", expected["sha256"])
    origins.append({"key": key, "source_metadata": str(metadata_path.relative_to(ROOT)), "source_metadata_sha256": sha(read(metadata_path)), "selected_metadata_before_normalization": original, "selected_local_body": str(local_body.relative_to(ROOT)), "body_sha256": sha(raw), "body_git_blob_sha": blob(raw)})
    art["body"] = {"path": body_path, "encoding": "utf-8", "byte_length": len(raw), "sha256": sha(raw)}
    for name, allowed in [("authority", ("scope", "basis"))]:
        clean = {k: art[name][k] for k in allowed}
        if art[name] != clean:
            changes.append({"artifact": key, "field": name, "removed_fields": sorted(set(art[name]) - set(allowed))})
        art[name] = clean
    sources = []
    for source in art["source_refs"]:
        clean = {k: source[k] for k in ("commit", "path", "git_blob_sha", "sha256")}
        if source != clean:
            changes.append({"artifact": key, "field": "source_refs", "path": source["path"], "removed_fields": sorted(set(source) - set(clean))})
        sources.append(clean)
    art["source_refs"] = list({compact(s): s for s in sources}.values())
    art["navigation"] = unique(n if isinstance(n, str) else n["key"] for n in art.get("navigation", []))
    if art["navigation"] != original.get("navigation", []):
        changes.append({"artifact": key, "field": "navigation", "from": original.get("navigation", []), "to": art["navigation"]})
    for field in ("recipe_ref", "producer_request_ref", "producer_response_ref"):
        art[field] = normalize_ref(art.get(field), key, field)
        materialize_ref(art[field], key, field)
    evidence = []
    for item in art.get("evidence", []):
        if isinstance(item, str):
            evidence.append(item)
        else:
            ref = normalize_ref(item, key, "evidence")
            evidence.append(compact(ref))
            materialize_ref(ref, key, "evidence")
    art["evidence"] = evidence
    inputs = unique(relocated(i[5:]) if i.startswith("file:") else i for i in art["input_keys"])
    inputs = ["file:" + i if not i.startswith(("file:", "members:")) else i for i in inputs]
    inputs = unique(inputs + ["file:" + s["path"] for s in art["source_refs"]] + (["file:" + ref_path(art["recipe_ref"])] if art["recipe_ref"] else []))
    if inputs != original["input_keys"]:
        changes.append({"artifact": key, "field": "input_keys", "added": [i for i in inputs if i not in original["input_keys"]], "removed_or_relocated": [i for i in original["input_keys"] if i not in inputs]})
    art["input_keys"] = inputs
    art["validity"] = "blocked"
    art["semantic_review_refs"] = []
    art["runtime_receipt_refs"] = [normalize_ref(r, key, "runtime_receipt_refs") for r in original.get("runtime_receipt_refs", [])]
    for ref in art["runtime_receipt_refs"]:
        materialize_ref(ref, key, "runtime_receipt_refs")
    for source in art["source_refs"]:
        identity = (source["path"], source["sha256"])
        if identity in source_checks:
            continue
        local = locate(source["path"], source["sha256"], source["commit"])
        if local is None:
            report("source_bytes_unavailable", artifact=key, source_ref=source)
            source_checks[identity] = {"path": source["path"], "status": "MISSING"}
            continue
        data = read(local)
        source_checks[identity] = {"path": source["path"], "sha256": sha(data), "git_blob_sha": blob(data), "byte_length": len(data), "matches": sha(data) == source["sha256"] and blob(data) == source["git_blob_sha"], "native_source_limit": 256000, "within_native_source_limit": len(data) <= 256000}
        if not source_checks[identity]["matches"]:
            report("source_identity_mismatch", artifact=key, source_ref=source, observed=source_checks[identity])
        elif local != ATLAS / source["path"]:
            put(local, source["path"], "exact declared source, local runtime materialization only", source["sha256"], False)
        if len(data) > 256000:
            report("native_source_file_limit", artifact=key, path=source["path"], bytes=len(data), maximum=256000)
    for inp in inputs:
        if inp.startswith("members:"):
            report("membership_requires_runtime_observation", artifact=key, key=inp)
            continue
        path = inp[5:]
        if path in {s["path"] for s in art["source_refs"]}:
            continue
        local = locate(path)
        if local is None:
            report("input_bytes_unavailable", artifact=key, key=inp)
        else:
            put(local, path, "declared input of " + key, publish=path.startswith(PREFIX + "/"))
    allowed = ("key", "scope", "title", "layer", "need", "body", "authority", "validity", "gaps", "evidence", "input_keys", "source_refs", "recipe_ref", "build_dependencies", "navigation", "producer_request_ref", "producer_response_ref", "semantic_review_refs", "runtime_receipt_refs")
    if set(art) != set(allowed):
        changes.append({"artifact": key, "field": "artifact", "removed_fields": sorted(set(art) - set(allowed))})
    for name in allowed:
        if name not in art:
            report("missing_artifact_field", artifact=key, field=name)
    return {name: art.get(name) for name in allowed}

def ref_for_local(local, remote):
    return {"payload_path": remote, "sha256": sha(read(local))}

def add_source(art, path, reason="Captured recovery evidence addition"):
    existing = {s["path"] for s in art["source_refs"]}
    if path in existing:
        return
    source = source_catalog.get(path)
    if source is None:
        report("supplemental_source_identity_unavailable", artifact=art["key"], path=path)
        return
    clean = {k: source[k] for k in ("commit", "path", "git_blob_sha", "sha256")}
    art["source_refs"].append(clean)
    source_additions.append({"artifact": art["key"], "source_ref": clean, "reason": reason})

historical = load(ROOT / "control/historical-package.json")
mission = load(ROOT / "control/mission.json")
public = load(ROOT / "control/public-contract-v1.json")
binding_path = ARGS.bindings.resolve() if ARGS.bindings else OUT / "root-bindings.json"
bindings = load(binding_path) if binding_path.is_file() else {}
selected = {a["key"]: copy.deepcopy(a) for a in historical["artifacts"] if a["key"] in mission["owned_legacy_artifact_keys"]}
metadata_sources = {key: ROOT / "control/historical-package.json" for key in selected}
cfg = load(ROOT / "config_project/native-package.json")
for a in cfg["artifacts"][:2]:
    selected[a["key"]] = copy.deepcopy(a)
    metadata_sources[a["key"]] = ROOT / "config_project/native-package.json"
for a in load(ROOT / "runtime_models/original-selected-artifact-metadata.json"):
    selected[a["key"]] = copy.deepcopy(a)
    metadata_sources[a["key"]] = ROOT / "runtime_models/original-selected-artifact-metadata.json"
context_correction = load(ROOT / "a1_completion/context-correction.json")
selected["s1.core.context"]["body"] = {**context_correction["candidate"], "encoding": "utf-8"}
metadata_sources["s1.core.context"] = ROOT / "a1_completion/context-correction.json"
selected["s1.core.persistence"]["body"] = {"path": "candidate/bodies/persistence.md", "encoding": "utf-8", "byte_length": 5290, "sha256": "0b43f9bd316aca25361f934e63723f2aa6220a3deb97a4447266fbbc5d350762"}
metadata_sources["s1.core.persistence"] = ROOT / "a1/recovery/metadata-delta.json"
session_fragment = load(ROOT / "a1_completion/candidate-artifact.json")
runtime_fragment = load(ROOT / "runtime_completion/native-artifact-fragment.json")
source_catalog = {}
for artifact in historical["artifacts"] + cfg["artifacts"] + [session_fragment, runtime_fragment]:
    for source in artifact["source_refs"]:
        if source["commit"] == BASELINE:
            source_catalog[source["path"]] = source
for record in load(ROOT / "a1/capture-manifest.json")["records"]:
    if record.get("source_request", {}).get("ref") == BASELINE:
        source_catalog[record["source_request"]["path"]] = {"commit": BASELINE, "path": record["source_request"]["path"], "git_blob_sha": record["git_blob_sha"], "sha256": record["sha256"]}
for source in load(ROOT / "a1_completion/cross-source-manifest.json"):
    source_catalog[source["path"]] = source
for field in ("recipe_ref", "producer_request_ref", "producer_response_ref"):
    selected["s1.core.context"][field] = copy.deepcopy(session_fragment[field])
recovery_prefix = HIST_PREFIX + "/producers/recovery-a1-20261112/"
for field, name in (("recipe_ref", "request.txt"), ("producer_request_ref", "request.txt"), ("producer_response_ref", "response.md")):
    selected["s1.core.persistence"][field] = {"commit": HISTORY, "path": recovery_prefix + name, "sha256": sha(read(ROOT / "a1/recovery" / name))}
changes.append({"artifact": "s1.core.persistence", "field": "recipe_ref", "reason": "Actual preserved recovery request is the correction procedure; no nonexistent recovery recipe is invented. Original producer recipe remains in provenance."})
for delta in load(ROOT / "a1/integration-delta.json")["artifacts"]:
    for source in delta["additional_source_refs"]:
        add_source(selected[delta["key"]], source["path"], "Exact A1 recovery integration delta; not retroactively attributed to historical producer")
driver_paths = [s["path"] for s in load(ROOT / "a1_completion/cross-source-manifest.json")]
for key in ("s1.core.session-admission", "s1.core.persistence", "s1.core.context"):
    for path in ["packages/core/src/event.ts", "packages/core/src/database/database.ts"] + driver_paths:
        add_source(selected[key], path, "Root-directed transaction evidence: shared Database ambient transaction underpins admission/projection or ContextUpdated snapshot atomicity, and persistence driver contract")
for path in ("packages/core/src/tool/read.ts", "packages/core/src/tool/read-filesystem.ts"):
    add_source(selected["s1.core.project"], path, "Root-directed config/project v2 cross-file evidence for the historical read-leaf permission and media/text limit claim")
for key, name in [("s1.core.session-admission", "E1-admission.md"), ("s1.core.session-execution", "E2-execution.md"), ("s1.core.persistence", "E3-persistence.md"), ("s1.core.context", "E4-context.md")]:
    local = ROOT / "a1/recovery/evidence" / name
    selected[key]["evidence"].append({"commit": HISTORY, "path": recovery_prefix + "evidence/" + name, "sha256": sha(read(local))})
    canonical_request = ROOT / "judgments/a1-canonical-request-v1.txt"
    if canonical_request.is_file():
        selected[key]["evidence"].append(ref_for_local(canonical_request, PREFIX + "/judgments/a1-canonical-request-v1.txt"))
selected["s1.core.context"]["evidence"].append(ref_for_local(ROOT / "a1_completion/context-correction.json", PREFIX + "/producers/session-state-completion/context-correction.json"))
body_locations = {
    "session-admission": ROOT / "a1/originals/bodies/session-admission.md",
    "session-execution": ROOT / "a1/originals/bodies/session-execution.md",
    "persistence": ROOT / "a1/recovery/candidate/bodies/persistence.md",
    "context": ROOT / "a1_completion/bodies/context.md",
    "configuration": ROOT / "config_project/inherited/configuration.md",
    "project": ROOT / "config_project/inherited/project.md",
    "runtime": ROOT / "runtime_models/inherited-bodies/runtime.md",
    "models": ROOT / "runtime_models/inherited-bodies/models.md",
    "economy": ROOT / "runtime_models/inherited-bodies/economy.md",
}
artifacts = []
for key in mission["owned_legacy_artifact_keys"]:
    slug = key.rsplit(".", 1)[1]
    artifacts.append(normalize_artifact(selected[key], body_locations[slug], "bodies/" + slug + ".md", metadata_sources[key]))
descriptors = [
    (cfg["artifacts"][2], ROOT / "config_project" / cfg["artifacts"][2]["body"]["path"], "producers/config-project/" + cfg["artifacts"][2]["body"]["path"], ROOT / "config_project/native-package.json"),
    (runtime_fragment, ROOT / "runtime_completion/bodies/runtime-models-economy-completion.md", "producers/runtime-completion/bodies/runtime-models-economy-completion.md", ROOT / "runtime_completion/native-artifact-fragment.json"),
    (session_fragment, ROOT / "a1_completion/bodies/session-state-completion.md", "producers/session-state-completion/bodies/session-state-completion.md", ROOT / "a1_completion/candidate-artifact.json"),
]
upper_dir = ARGS.upper.resolve() if ARGS.upper else ROOT / "upper"
if upper_dir.is_dir():
    for metadata in sorted(upper_dir.glob("*.json")):
        if protected(metadata):
            continue
        document = load(metadata)
        batch = document.get("artifacts", [document]) if isinstance(document, dict) else document if isinstance(document, list) else []
        for artifact in batch:
            if not isinstance(artifact, dict) or not isinstance(artifact.get("key"), str) or "body" not in artifact:
                continue
            rel = artifact["body"]["path"]
            local = upper_dir / rel
            if rel.startswith("upper/"):
                local = ROOT / rel
            target = rel if rel.startswith("upper/") else "upper/" + rel
            descriptors.append((artifact, local, target, metadata))
for descriptor in descriptors:
    artifacts.append(normalize_artifact(*descriptor))
by_key = {a["key"]: a for a in artifacts}
if len(by_key) != len(artifacts):
    raise ValueError("Duplicate selected artifact keys")

# Only the four A1 decisions explicitly authorized by root are rebound automatically.
a1_keys = {"s1.core.session-admission", "s1.core.session-execution", "s1.core.persistence", "s1.core.context"}
canonical = []
for filename in ("a1-config-v1-j1.json", "a1-config-v1-j2.json"):
    local = ROOT / "judgments" / filename
    if local.is_file():
        record = load(local)
        canonical.append((local, record, {d["artifact"]: d for d in record.get("decisions", record.get("artifacts", []))}))
for key in sorted(a1_keys):
    art = by_key[key]
    valid = len(canonical) == 2
    for local, record, decisions in canonical:
        d = decisions.get(key, {})
        valid = valid and d.get("body_sha256") == art["body"]["sha256"] and d.get("verdict") == "PASS" and len(d.get("criteria", {})) == 12 and all(x == "PASS" for x in d.get("criteria", {}).values())
        valid = valid and not d.get("open_findings", d.get("findings_open", []))
    if valid:
        for local, record, decisions in canonical:
            remote = PREFIX + "/judgments/" + local.name
            ref = ref_for_local(local, remote)
            art["semantic_review_refs"].append(ref)
            put(local, remote, "actual canonical A1 judgment", ref["sha256"])
        art["validity"] = "supported"
        stale = [gap for gap in art["gaps"] if gap.startswith("Mandatory A1 review pending:")]
        art["gaps"] = [gap for gap in art["gaps"] if gap not in stale]
        changes.append({"artifact": key, "field": "validity", "to": "supported", "basis": "Two exact-body actual canonical records, each PASS on 12 criteria; root authorized reuse solely for these four keys.", "closed_historical_pending_gap_strings": stale})

# Root may bind later actual reviews or roots without changing this assembler.
for key, override in bindings.get("artifacts", {}).items():
    art = by_key.get(key)
    if art is None:
        report("binding_unknown_artifact", artifact=key)
        continue
    if override.get("body_sha256") != art["body"]["sha256"]:
        report("binding_body_hash_mismatch", artifact=key, expected=art["body"]["sha256"], supplied=override.get("body_sha256"))
        continue
    for field in ("semantic_review_refs", "runtime_receipt_refs"):
        if field in override:
            art[field] = [normalize_ref(ref, key, field) for ref in override[field]]
            for ref in art[field]:
                materialize_ref(ref, key, field)
    for field in ("validity", "gaps", "navigation", "build_dependencies"):
        if field in override:
            art[field] = copy.deepcopy(override[field])
    if art["validity"] == "supported" and len(art["semantic_review_refs"]) < 2:
        art["validity"] = "blocked"
        report("insufficient_actual_review_refs", artifact=key)

protocol_ref = normalize_ref(historical["protocol_ref"], "package", "protocol_ref")
materialize_ref(protocol_ref, "package", "protocol_ref")
oracle_ref = normalize_ref(bindings.get("oracle_ref"), "package", "contract.oracle_ref")
if oracle_ref:
    materialize_ref(oracle_ref, "package", "contract.oracle_ref")
criteria = bindings.get("criteria", unique(historical["contract"]["criteria"] + public["criteria"]))
roots = copy.deepcopy(bindings.get("roots", {"flow": "s1.core.session-execution"}))
# Order only declared build predecessors; navigation never becomes a build edge.
pending = list(artifacts)
ordered = []
while pending:
    ready = [a for a in pending if all(d.get("key") in {p["key"] for p in ordered} for d in a["build_dependencies"])]
    if not ready:
        report("native-build-cycle-or-missing-predecessor", artifacts=[a["key"] for a in pending])
        break
    for artifact in ready:
        ordered.append(artifact)
        pending.remove(artifact)
if not pending:
    artifacts = ordered
package = {
    "schema": "genesis-native-package/v1", "campaign": historical["campaign"],
    "protocol_epoch": historical["protocol_epoch"], "results_epoch": historical["results_epoch"],
    "session": "S1", "source_revision": BASELINE, "protocol_ref": protocol_ref,
    "scope": "orchestra.s1", "package_state": "IN_PROGRESS",
    "contract": {"criteria": criteria, "oracle_ref": oracle_ref},
    "required_artifact_keys": [a["key"] for a in artifacts], "artifacts": artifacts, "roots": roots,
    "missing_required_artifact_keys": [],
    "known_limits": [
        "Local mechanically assembled selection only; no global S1 completion.",
        "Only actual hash-bound semantic decisions are reused. Four canonical A1 PASS records do not accept other artifacts or runtime binding.",
        "Oracle reference, final roots/navigation, pending semantic reviews and runtime gates remain root-owned.",
        "Protocol/oracle/recipe transport hashes are not Atlas input versions or runtime receipts.",
        "Tokens, physical attempts and billing UNKNOWN. No product tests, runtime import or remote write performed by this assembler.",
    ],
}
for art in artifacts:
    if len(art["semantic_review_refs"]) < 2:
        report("native-semantic-review-evidence-missing", artifact=art["key"], observed=len(art["semantic_review_refs"]), required=2)
    for key in art["navigation"]:
        if key not in by_key:
            report("native-missing-link", artifact=art["key"], target=key)
    for dep in art["build_dependencies"]:
        if dep.get("same_package") is not True or set(dep) != {"key", "same_package"}:
            report("native-unsupported-build-dependency", artifact=art["key"], dependency=dep)
        elif dep["key"] not in by_key or by_key[dep["key"]]["validity"] != "supported":
            report("native-predecessor-not-accepted", artifact=art["key"], dependency=dep)
reachable, queue = set(), list(roots.values())
while queue:
    key = queue.pop()
    if not isinstance(key, str) or key not in by_key or key in reachable:
        continue
    reachable.add(key)
    queue.extend(by_key[key]["navigation"])
    queue.extend(d["key"] for d in by_key[key]["build_dependencies"])
unreachable = [a["key"] for a in artifacts if a["key"] not in reachable]
if unreachable:
    report("native-required-unreachable", artifacts=unreachable, resolution="Root supplies final roots/navigation through bindings; no synthetic build edges were introduced.")
for need, key in roots.items():
    if not isinstance(key, str) or key not in by_key or by_key[key]["need"] != need:
        report("native-invalid-root", need=need, value=key)

# Preserve original producer records and changed candidate histories, not raw fetch dumps/source copies.
support = {
    "config_project": ["request.txt", "request-steering.txt", "response.md", "recipe.json", "public-contract-v1.json", "verification.json", "source-gaps.json"],
    "runtime_completion": ["producer-request.txt", "producer-response.txt", "root-followups.txt", "recipe.json", "revision-log.json", "producer-receipt.json", "metadata-rebind.json", "reference-correction.diff", "packet-index.json", "judge-packet.md"],
    "a1_completion": ["context-correction.json", "producer/request.md", "producer/steering.md", "producer/response.md", "producer/recipe.json", "producer/receipt.json", "originals/context.md", "originals/session-state-completion-v0.md", "originals/session-state-completion-v1.md", "evidence/context-truncation.delta.patch", "evidence/session-state-completion-v0-to-v1.patch", "evidence/session-state-completion-v1-to-v2.patch", "packets/principal-review-manifest.json", "packets/context-truncation.md"],
}
remote_producers = {"config_project": NEW_CONFIG, "runtime_completion": PREFIX + "/producers/runtime-completion", "a1_completion": PREFIX + "/producers/session-state-completion"}
for folder, names in support.items():
    for name in names:
        local = ROOT / folder / name
        if local.is_file():
            put(local, remote_producers[folder] + "/" + name, "preserved producer record; sending status is not inferred")
for folder in ("config_project", "runtime_completion", "a1_completion"):
    base = ROOT / folder
    for history_name in ("history", "revisions"):
        history_root = base / history_name
        if not history_root.is_dir():
            continue
        for local in sorted(history_root.rglob("*")):
            if not local.is_file() or protected(local):
                continue
            rel = local.relative_to(base)
            if any(part in {"sources", "captures", "raw", "connector", "__pycache__"} for part in rel.parts):
                continue
            if "bodies" in rel.parts or local.name in {"request.txt", "request.md", "request-steering.txt", "response.md", "producer-request.txt", "producer-response.txt", "recipe.json", "native-package.json", "manifest.json", "preservation-manifest.json", "producer-receipt.json", "metadata-rebind.json", "packet-index.json", "judge-packet.md", "body.diff", "finding-resolutions.json", "review-receipts.json"}:
                put(local, remote_producers[folder] + "/" + rel.as_posix(), "preserved producer candidate/revision identity; no acceptance inferred")
transmitted = ROOT / "config_project/review-packets/transmitted"
if transmitted.is_dir():
    for local in sorted(transmitted.iterdir()):
        if local.is_file() and local.suffix in {".txt", ".md", ".json"}:
            put(local, NEW_CONFIG + "/review-packets/transmitted/" + local.name, "producer-preserved transmitted request/content records")
for name in ("bodies/runtime-models-economy-completion.md", "recipe.json", "producer-request.txt", "producer-response.txt", "producer-receipt.json", "metadata-rebind.json", "packet-index.json", "judge-packet.md"):
    local = ROOT / "runtime_completion/history/revision-01" / name
    if local.is_file():
        put(local, remote_producers["runtime_completion"] + "/history/revision-01/" + name, "preserved earlier producer candidate/record")
for local in sorted((ROOT / "judgments").glob("*")):
    if local.is_file() and local.suffix in {".txt", ".md", ".json"}:
        put(local, PREFIX + "/judgments/" + local.name, "root-supplied actual review/request record; no new vote inferred")
for entry in bindings.get("support_files", []):
    put(ROOT / entry["local_path"], entry["repository_path"], entry["purpose"], entry.get("sha256"))

OUT.mkdir(parents=True, exist_ok=True)
put(pathlib.Path(__file__), PREFIX + "/assembly/assemble-package.py", "reusable mechanical assembler; not a product source input")
if binding_path.is_file():
    put(binding_path, PREFIX + "/assembly/root-bindings.json", "root-supplied transport metadata; oracle content is not read")
provenance = {"schema": "s1-01-mechanical-assembly-provenance/v1", "source_revision": BASELINE, "artifacts": origins, "historical_metadata_unchanged": [a for a in historical["artifacts"] if a["key"] in mission["owned_legacy_artifact_keys"]], "runtime_models_body_origins": load(ROOT / "runtime_models/inherited-body-bindings.json"), "normalizations": changes, "source_additions": source_additions, "preserved_records": preserved, "source_checks": list(source_checks.values()), "actual_semantic_authority": "External real judgment records only; this assembler does not judge.", "usage": {"tokens": "UNKNOWN", "physical_attempts": "UNKNOWN", "billing": "UNKNOWN"}}
provenance_file = OUT / "provenance.json"
provenance_file.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n")
put(provenance_file, PREFIX + "/assembly/provenance.json", "mechanical origin/normalization record")
package_file = OUT / "native-package.draft.json"
package_bytes = (json.dumps(package, ensure_ascii=False, indent=2) + "\n").encode()
package_file.write_bytes(package_bytes)
put(package_file, PREFIX + "/native-package.json", "current mechanically assembled draft package")
summary = {
    "schema": "s1-01-mechanical-assembly-report/v1", "package_path": PREFIX + "/native-package.json",
    "package_sha256": sha(package_bytes), "package_bytes": len(package_bytes), "artifact_count": len(artifacts),
    "layers": dict(collections.Counter(a["layer"] for a in artifacts)),
    "semantic_validity": dict(collections.Counter(a["validity"] for a in artifacts)),
    "selected_bodies": [{"key": a["key"], **a["body"]} for a in artifacts],
    "payload_files": len(staged), "payload_bytes": sum(v["byte_length"] for v in staged.values()),
    "source_count": len(source_checks), "normalizations": len(changes), "missing": missing,
    "source_additions_by_artifact": {key: [s for s in source_additions if s["artifact"] == key] for key in by_key if any(s["artifact"] == key for s in source_additions)},
    "missing_counts": dict(collections.Counter(x["kind"] for x in missing)),
    "strict_native_prepare_ready": not missing,
    "actual_runtime_parser_executed": False, "product_tests": "NOT_RUN", "remote_writes": "NONE",
    "criteria_binding": "Union of already declared historical/public criteria unless root supplied exact override; no new oracle was authored.",
    "historical_oracle_reference_metadata_only": historical["contract"]["oracle_ref"],
    "upper_extension": "Later upper/*.json artifact fragments are discovered; bodies must match declared hashes. Root supplies exact roots, dependencies and reviews through --bindings.",
}
(OUT / "assembly-report.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
(OUT / "staging-manifest.json").write_text(json.dumps({"schema": "s1-01-staging-manifest/v1", "files": list(staged.values())}, ensure_ascii=False, indent=2) + "\n")
lines = ["# Mechanical assembly report", "", f"Selected artifacts: {len(artifacts)}. Package SHA-256: {sha(package_bytes)}.", "", "No bodies were authored or revised. Source copies stay in atlas-source; the remote payload contains only assigned-prefix artifacts, required evidence and producer/history records.", "", "## Exact missing gates", ""]
for kind, count in summary["missing_counts"].items():
    lines.append(f"- {kind}: {count}.")
lines += ["", "## Selected identities and input closure", "", "| Artifact | Source refs | Inputs | Actual review refs | Validity |", "| --- | ---: | ---: | ---: | --- |"]
for artifact in artifacts:
    lines.append(f"| {artifact['key']} | {len(artifact['source_refs'])} | {len(artifact['input_keys'])} | {len(artifact['semantic_review_refs'])} | {artifact['validity']} |")
lines += ["", "## Additional evidence sources retained", ""]
for key, additions in summary["source_additions_by_artifact"].items():
    lines.append("- " + key + ": " + ", ".join(s["source_ref"]["path"] for s in additions) + ".")
lines += ["", "No new source ref was added to session-execution merely because another A1 artifact needed a driver. Its E2 runner and execution-interface supplements point to sources already declared for that body. These proof records are retained as evidence; no build edge or whole-package input was manufactured.", "", "Each supplied source ref is checked against its exact locally captured bytes and Git blob. The 529-source union belongs to the selected body inputs; it is not a statement that every one of 555 inventory rows is semantically accepted.", ""]
lines += ["", "The JSON report identifies every affected key/ref/path. The historical oracle was not opened. Only four exact A1 body decisions may be reused from the two actual canonical files; every other candidate stays blocked unless root later supplies exact bindings.", "", "## Rerun", "", "python assembly/assemble-package.py --bindings assembly/root-bindings.json", "", "Optional root-bindings fields: oracle_ref, criteria, roots, artifacts keyed by stable key with body_sha256 and actual semantic_review_refs/runtime_receipt_refs/validity/gaps/navigation/build_dependencies, and support_files with local_path/repository_path/purpose/sha256. The assembler never creates reviewer identities or verdicts.", "", "upper/*.json may contain one artifact, an artifacts array, or a list of artifacts. Upper body paths are resolved within upper/ unless already prefixed with upper/. No build dependency is synthesized.", "", "Legacy references embedded inside preserved recipe bytes remain unchanged; the normalization record maps relocated outer refs. No historical remote path is modified.", "", "## Limits", "", "This report is deterministic local transport verification. It is not execution of the native adapter, CI, Atlas import/publication or a semantic judgment. Tokens, physical attempts and cost remain UNKNOWN.", ""]
(OUT / "assembly-report.md").write_text("\n".join(lines))
with (OUT / "execution-ledger.jsonl").open("a") as ledger:
    ledger.write(compact({"timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "operation": "mechanical-local-package-assembly", "package_sha256": sha(package_bytes), "artifact_count": len(artifacts), "payload_files": len(staged), "source_files_verified": len(source_checks), "runtime_parser": "NOT_RUN", "product_tests": "NOT_RUN", "remote_writes": "NONE", "tokens": "UNKNOWN", "physical_attempts": "UNKNOWN", "billing": "UNKNOWN"}) + "\n")
print(json.dumps({k: summary[k] for k in ("package_path", "package_sha256", "artifact_count", "semantic_validity", "payload_files", "payload_bytes", "source_count", "missing_counts")}, indent=2))
