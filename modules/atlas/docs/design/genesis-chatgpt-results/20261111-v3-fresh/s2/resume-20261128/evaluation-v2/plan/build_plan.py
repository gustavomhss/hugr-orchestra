#!/usr/bin/env python3
"""Materialize S2 evaluation inputs and a proposed v2 plan; invoke no Atlas code.

Original bytes are copied, never rewritten. The new root deliberately has no Git
identity and no .atlas state. This is file preparation, not prepareEvaluation,
admission, policy provisioning, a reader call, a product test or a judge verdict.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import stat
import subprocess

SOURCE = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
PROTOCOL = "ee2521a5b966bd505cc95bd1c733e09e12f33531"
CORPUS = "bb2a931301d541692b11e5a7f1eab234cd9ed2fd"
RUNTIME = "db9b4235022c4df32fe3bfd4faeea8adcd69abb7"
PACKAGE_SHA = "9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b"
PREPARED_SHA = "476891f3bf1edf24f7d2c486a1218bab5b0cd5b2b36b8295c3892917724c2b4a"
PREFLIGHT_SHA = "51b91eecab81cc7a71607167a81eaf8aacccdb0ec1b2262e960e8b9ad26e3778"
ORIGINAL_CANDIDATE = "4a36e1210acf6a4bb460846b717d446e6c259f80a78fd73cfce8b5a6e445f522"
ORIGINAL_CONTRACT = "9f3829c9ebdd70aa303b9eb1f167bda77adf2f3b1988e98a973205d712ddfce2"
S2 = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2"
PACKAGE = S2 + "/native-package.json"
PREFIX = S2 + "/resume-20261128/evaluation-v2"
PLAN = PREFIX + "/evaluation-plan.json"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def blob_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def safe_relative(path):
    value = pathlib.PurePosixPath(path)
    assert not value.is_absolute() and all(x not in ("", ".", "..", ".git", ".atlas") for x in value.parts), path
    return str(value)


def git(root, *argv):
    env = os.environ.copy()
    env["GIT_OPTIONAL_LOCKS"] = "0"
    return subprocess.check_output(["git", *argv], cwd=root, env=env)


def git_tree(root, revision):
    result = {}
    for row in git(root, "ls-tree", "-r", "-z", revision).split(b"\0"):
        if not row:
            continue
        header, path = row.split(b"\t", 1)
        mode, kind, oid = header.decode().split()
        if kind == "blob":
            result[path.decode("utf-8")] = {"mode": mode, "git_blob_sha": oid}
    return result


def file_identity(path):
    data = path.read_bytes()
    return {"byte_length": len(data), "sha256": sha256(data), "git_blob_sha": blob_sha(data)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=pathlib.Path, default=pathlib.Path("/workspace/scratch/5cfbb6c803f1"))
    parser.add_argument("--evaluation-root", type=pathlib.Path)
    parser.add_argument("--report-dir", type=pathlib.Path)
    args = parser.parse_args()
    workspace = args.workspace.resolve(strict=True)
    source = workspace / "s2-corpus"
    runtime = workspace / "s2-runtime"
    destination = (args.evaluation_root or workspace / "s2-evaluation").absolute()
    report_dir = (args.report_dir or workspace / "s2-investigation/evaluation-plan").absolute()
    assert not destination.exists(), "A new empty materialization root is required"
    assert source.resolve(strict=True) == source and runtime.resolve(strict=True) == runtime
    assert destination != source and source not in destination.parents and destination not in source.parents
    assert destination != runtime and runtime not in destination.parents and destination not in runtime.parents
    assert git(source, "rev-parse", "HEAD").decode().strip() == CORPUS
    assert git(runtime, "rev-parse", "HEAD").decode().strip() == RUNTIME
    before_source_status = git(source, "status", "--porcelain", "--untracked-files=no").decode()
    before_runtime_status = git(runtime, "status", "--porcelain", "--untracked-files=no").decode()
    assert not before_source_status and not before_runtime_status
    preflight_path = workspace / "s2-investigation/byte-audit/source-preflight.json"
    preflight_bytes = preflight_path.read_bytes()
    assert sha256(preflight_bytes) == PREFLIGHT_SHA
    preflight = json.loads(preflight_bytes)
    assert preflight["unique_files_checked"] == len(preflight["files"]) == 667
    assert not preflight["failures"] and not preflight["global_issues"] and not preflight["git_tree_pin_errors"]
    prepared_path = workspace / "s2-execution/prepare-01/prepared.json"
    prepared_bytes = prepared_path.read_bytes()
    assert len(prepared_bytes) == 344738 and sha256(prepared_bytes) == PREPARED_SHA
    prepared = json.loads(prepared_bytes)
    original = prepared["candidate"]
    assert prepared["candidate_id"] == ORIGINAL_CANDIDATE and original["contract"] == ORIGINAL_CONTRACT
    assert original["repo_root"] == str(source) and original["observed_head"] == CORPUS
    assert original["criteria"] == [f"AC-{n:02d}" for n in range(1, 11)] + ["runtime-import-binding"]
    package_bytes = (source / PACKAGE).read_bytes()
    assert sha256(package_bytes) == PACKAGE_SHA
    package = json.loads(package_bytes)
    assert package["source_revision"] == SOURCE and len(package["artifacts"]) == 13
    trees = {revision: git_tree(source, revision) for revision in (SOURCE, PROTOCOL, CORPUS, RUNTIME)}
    destination.mkdir(parents=True)
    assert destination.resolve(strict=True) == destination
    report_dir.mkdir(parents=True, exist_ok=True)
    catalog = []
    paths = set()

    def put(relative, data, category, provenance, mode=0o644):
        relative = safe_relative(relative)
        assert relative not in paths, ("duplicate output", relative)
        path = destination / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        assert path.parent.resolve(strict=True) == path.parent
        with path.open("xb") as handle:
            handle.write(data)
        path.chmod(mode)
        attributes = path.lstat()
        assert stat.S_ISREG(attributes.st_mode) and attributes.st_nlink == 1 and path.resolve(strict=True) == path
        assert path.read_bytes() == data
        record = {"path": relative, "category": category, "byte_length": len(data), "sha256": sha256(data),
                  "git_blob_sha": blob_sha(data), "mode": oct(stat.S_IMODE(attributes.st_mode)),
                  "regular_file": True, "hardlink_count": attributes.st_nlink, "symlink": False,
                  "provenance": provenance}
        catalog.append(record)
        paths.add(relative)
        return {"payload_path": relative, "sha256": record["sha256"]}

    # The exact 667 files previously consumed by native preparation, with no store or Git metadata.
    originals = []
    for row in preflight["files"]:
        relative = safe_relative(row["path"])
        path = source / relative
        assert path.resolve(strict=True) == path and path.is_file(), ("source alias", relative)
        data = path.read_bytes()
        assert len(data) == row["byte_length"] and sha256(data) == row["sha256"] and blob_sha(data) == row["git_blob_sha"], relative
        assert trees[CORPUS][relative]["git_blob_sha"] == row["head_blob_sha"] == row["git_blob_sha"], relative
        for revision in row["pinned_commits"]:
            assert trees[revision][relative]["git_blob_sha"] == row["git_blob_sha"], (revision, relative)
        provenance = {"kind": "exact-prior-prepare-input", "corpus_revision": CORPUS,
                      "source_path": relative, "pinned_commits": row["pinned_commits"],
                      "prior_preflight_sha256": PREFLIGHT_SHA, "roles": row["roles"],
                      "artifact_keys": row["artifact_keys"], "git_tree_bindings_verified": True}
        put(relative, data, "original-prepare-input", provenance, stat.S_IMODE(path.stat().st_mode))
        originals.append({"path": relative, "sha256": row["sha256"], "byte_length": row["byte_length"]})

    def add_git_copy(revision, path, category, destination_path=None):
        data = git(source, "show", f"{revision}:{path}")
        oid = trees[revision][path]["git_blob_sha"]
        assert blob_sha(data) == oid
        target = destination_path or f"{PREFIX}/{category}/{revision}/{path}"
        return put(target, data, category, {"kind": "exact-git-blob", "repository": "gustavomhss/hugr-orchestra",
                   "commit": revision, "source_path": path, "git_blob_sha": oid,
                   "transport_ref_kind": "payload_path; historical path and commit recorded in this catalog"})

    prepared_ref = put(PREFIX + "/original/prepared.json", prepared_bytes, "original-prepared-v1",
                       {"kind": "original-execution-output", "source_path": str(prepared_path),
                        "candidate_id": ORIGINAL_CANDIDATE, "relationship_to_r4": "NEW_EXECUTION_NOT_RECOVERED_R4"})
    contract_path = source / ".atlas/cas" / ORIGINAL_CONTRACT[:2] / ORIGINAL_CONTRACT
    contract_bytes = contract_path.read_bytes()
    contract_object = json.loads(contract_bytes)
    assert contract_object == {"kind": "ownership-contract", "version": 1, "criteria": original["criteria"]}
    original_contract_ref = put(PREFIX + "/original/contract.json", contract_bytes, "original-contract-cas-evidence",
                               {"kind": "exact-original-CAS-bytes", "source_path": str(contract_path),
                                "kernel_id": ORIGINAL_CONTRACT, "kernel_id_not_recomputed_by_this_materializer": True})

    normative_refs = [original_contract_ref]
    for path in ["modules/atlas/docs/design/genesis-ownership-plan.md",
                 "modules/atlas/docs/design/genesis-update-plan-contract.md",
                 "modules/atlas/docs/design/genesis-economy-control-contract.md",
                 "modules/atlas/docs/design/genesis-global-completion-plan.md"]:
        normative_refs.append(add_git_copy(SOURCE, path, "normative"))
    for name in ["transport.md", "runtime.md", "judging.md", "completion.md", "campaign.md", "fatia-2.md", "principles.md", "criteria.json"]:
        normative_refs.append(add_git_copy(PROTOCOL, ".orchestra/skills/execute-genesis/references/" + name, "normative"))
    normative_refs.append(add_git_copy(CORPUS,
        "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/resume-20261128/S2-INTERFACES.md", "normative"))
    evaluation_protocol_ref = add_git_copy(RUNTIME, "modules/atlas/docs/design/evaluation-admission.md", "normative")
    normative_refs.append(evaluation_protocol_ref)

    # Reserved answer content is preserved separately, never inserted into the plan's text.
    oracle_refs = []
    for relative in [S2 + "/oracles/ownership-v1.json", S2 + "/oracles/layers-addendum.json",
                     S2 + "/oracles/update-final-graph-expectation.json"]:
        if relative not in paths:
            add_git_copy(CORPUS, relative, "additional-frozen-evaluation-evidence", relative)
        data = (destination / relative).read_bytes()
        oracle_refs.append({"payload_path": relative, "sha256": sha256(data)})
    graph_ref = oracle_refs[-1]
    assert graph_ref["sha256"] == "716f9f06506a34556ec8b56978048f5e31b401d43aae1bdeb0fdd2de476c954f"
    deck_path = S2 + "/requests/consumer-question-deck.json"
    if deck_path not in paths:
        add_git_copy(CORPUS, deck_path, "additional-frozen-evaluation-evidence", deck_path)
    deck_bytes = (destination / deck_path).read_bytes()
    assert sha256(deck_bytes) == "51dacb110d80dd3e3f0fcf6cb3aa87ebb8a4c8d47e18abf76891d8bef430b356"
    deck = json.loads(deck_bytes)
    assert len(deck["cases"]) == 14
    # Capture the question deck itself as immutable evaluation evidence too. The
    # plan exposes case identities and limits; this reference does not insert any
    # reserved expected answers into the plan.
    deck_ref = {"payload_path": deck_path, "sha256": sha256(deck_bytes)}
    oracle_refs.append(deck_ref)
    obligation_set = {"schema": "genesis-obligation-set/v1", "original_candidate": ORIGINAL_CANDIDATE,
                      "original_contract": ORIGINAL_CONTRACT, "criteria": original["criteria"],
                      "normative_refs": normative_refs, "oracle_refs": oracle_refs, "status": "PENDING_FINAL_EVIDENCE"}
    obligation_ref = put(PREFIX + "/obligation-set.json", json_bytes(obligation_set), "new-obligation-set",
                        {"kind": "new-stage-record", "all_original_criteria_preserved": True,
                         "original_contract_and_criteria_not_redefined": True})

    implementation_paths = [
        "modules/atlas/scripts/genesis-evaluation.ts",
        "modules/atlas/scripts/genesis-native.ts",
        "modules/atlas/packages/adapter-io/src/genesis-evaluation.ts",
        "modules/atlas/packages/adapter-io/src/genesis-evaluation-binding.ts",
        "modules/atlas/packages/adapter-io/src/ownership-evaluation-policy.ts",
        "modules/atlas/packages/adapter-io/src/evaluation-runtime-identity.ts",
        "modules/atlas/packages/adapter-io/src/evaluation-read-budget.ts",
        "modules/atlas/packages/adapter-io/src/evaluation-state-io.ts",
        "modules/atlas/packages/adapter-io/src/evaluation-manifest-binding.ts",
        "modules/atlas/packages/adapter-io/src/store-evaluation-identity.ts",
        "modules/atlas/packages/adapter-io/src/evaluation-rebuild.ts",
        "modules/atlas/packages/adapter-io/src/genesis-native.ts",
        "modules/atlas/packages/adapter-io/src/genesis-native-format.ts",
        "modules/atlas/packages/adapter-io/src/genesis-native-io.ts",
        "modules/atlas/packages/adapter-io/src/genesis-native-binding.ts",
        "modules/atlas/packages/adapter-io/src/ownership-input.ts",
        "modules/atlas/packages/adapter-io/src/ownership-access.ts",
        "modules/atlas/packages/adapter-io/src/compose.ts",
        "modules/atlas/packages/adapter-io/src/store.ts",
        "modules/atlas/packages/adapter-io/package.json",
        "modules/atlas/packages/knowledge/src/ownership/evaluation.ts",
        "modules/atlas/packages/knowledge/src/ownership/read.ts",
        "modules/atlas/packages/knowledge/src/ownership/shape.ts",
        "modules/atlas/packages/knowledge/src/ownership/types.ts",
        "modules/atlas/packages/kernel/src/canonical.ts",
        "modules/atlas/packages/kernel/src/encoder.ts",
        "modules/atlas/package.json",
        "modules/atlas/package-lock.json",
    ]
    implementation = {}
    for path in implementation_paths:
        data = git(source, "show", f"{RUNTIME}:{path}")
        assert (runtime / path).read_bytes() == data, ("runtime working copy drift", path)
        ref = add_git_copy(RUNTIME, path, "implementation")
        assert len(data) <= 2097152
        implementation[ref["payload_path"]] = ref["sha256"]

    # Per-entry applicability is new plan metadata, not a new semantic verdict.
    entries = []
    original_by_key = {entry["key"]: entry for entry in original["entries"]}
    for artifact in package["artifacts"]:
        key = artifact["key"]
        for ref in artifact["semantic_review_refs"]:
            path = ref.get("payload_path", ref.get("path"))
            assert sha256((destination / path).read_bytes()) == ref["sha256"]
        entries.append({"key": key, "semantic_refs": artifact["semantic_review_refs"],
            "applicability": f"Historical semantic evidence is reused only for the unchanged accepted {key} body: SHA-256 {artifact['body']['sha256']}, {artifact['body']['byte_length']} bytes, source revision {SOURCE}, original native package SHA-256 {PACKAGE_SHA}, and original v1 result {original_by_key[key]['artifact']['result']}. This plan does not create a new semantic decision.",
            "limits": " ".join(artifact["gaps"]) + " Original AC-01 through AC-10 and runtime-import-binding remain pending final evidence in the obligation set. A separate new isolated-evaluation-admission decision is required. Changed source, result metadata, applicability or implementation requires new identities and affected review; no historical decision is transplanted to a changed result."})
    maintenance_controls = json.loads((destination / oracle_refs[0]["payload_path"]).read_bytes())["impact_case"]["controls"]
    plan = {"schema": "genesis-evaluation-plan/v1", "package_path": PACKAGE,
            "original_prepared": prepared_ref, "obligations": obligation_ref, "entries": entries,
            "consumer_ids": [case["id"] for case in deck["cases"]],
            "consumer_modes": {case["id"]: case["depth"] for case in deck["cases"]},
            "read_limits": {key: deck["read_limits"][key] for key in ("routine", "deep")},
            "maintenance": {
                "case": "S2-U1", "status": "FROZEN_NOT_RUN_PENDING_DISTINCT_TARGET_PLAN",
                "initial_phase": "The initial isolated evaluation phase covers only the 14 frozen consumer cases through the real bounded index/read ports. Case IDs are budget identities, not host agent IDs; actual fresh consumer identities will be recorded separately.",
                "initial_policy_operation_intent": ["admit", "index", "read"],
                "initial_policy_excludes": ["evaluation-maintenance"],
                "policy_created": False,
                "question_deck_ref": deck_ref,
                "frozen_case_ref": oracle_refs[0], "frozen_graph_ref": graph_ref,
                "changed_input": "file:apps/desktop/src/main/owned-serve.ts",
                "controls": maintenance_controls,
                "required_before_maintenance": [
                    "Freeze a distinct target plan before target production, including the concrete behavior edit, its expected observable consequences, producer recipe, identity and exact source/runtime pins.",
                    "Preserve the original obligation set and frozen S2-U1 graph; distinguish affected graph reachability from actual interpretation and recipe call counts.",
                    "Use the evaluation v2 rebuild path; legacy v1 maintenance cannot be used for v2 authority envelopes.",
                    "Obtain fresh result-specific semantic evidence for changed results and two new exact target admission decisions before any target admission.",
                    "Provide a separately reviewed evaluation-maintenance policy only after its prerequisites are satisfied; initial policy must not grant it.",
                    "Record invalidation, rebuild, current-reader refusal/restoration, reuse and recovery; do not relabel S2-U1 as executed, passed or not applicable before those observations.",
                ],
                "not_yet_fixed": ["concrete behavior patch", "target producer recipe", "mutation-specific expected observables", "exact target/recovery operation commands"],
                "acceptance": "No ADMIT criterion or final AC verdict is asserted by this plan. The adequacy of the initial-phase boundary and later target-plan sequence remains subject to the two independent admission reviewers.",
            },
            "implementation": implementation,
            "isolation": {"root": str(destination), "original_root": str(source)}}
    plan_ref = put(PLAN, json_bytes(plan), "new-evaluation-plan",
                   {"kind": "new-stage-plan-proposal", "runtime_revision": RUNTIME,
                    "admission_protocol_ref": evaluation_protocol_ref, "contains_reserved_answers": False,
                    "judge_verdict": None, "runtime_operation_executed": False})

    # Full file-byte reconciliation, independent of any future Atlas identity computation.
    for row in catalog:
        path = destination / row["path"]
        assert file_identity(path) == {key: row[key] for key in ("byte_length", "sha256", "git_blob_sha")}
        assert path.lstat().st_nlink == 1 and path.resolve(strict=True) == path
    for row in originals:
        assert sha256((source / row["path"]).read_bytes()) == row["sha256"]
    assert prepared_path.read_bytes() == prepared_bytes and contract_path.read_bytes() == contract_bytes
    assert not (destination / ".atlas").exists() and not (destination / ".git").exists()
    assert len([path for path in destination.rglob("*") if path.is_file()]) == len(catalog)
    git_probe = subprocess.run(["git", "rev-parse", "HEAD"], cwd=destination, text=True, capture_output=True)
    assert git_probe.returncode != 0 and not git_probe.stdout.strip(), "New root unexpectedly inherits a Git identity"
    after_source_status = git(source, "status", "--porcelain", "--untracked-files=no").decode()
    after_runtime_status = git(runtime, "status", "--porcelain", "--untracked-files=no").decode()
    assert before_source_status == after_source_status == before_runtime_status == after_runtime_status == ""
    counts = {}
    for row in catalog:
        counts[row["category"]] = counts.get(row["category"], 0) + 1
    manifest = {"schema": "genesis-s2-evaluation-materialization/v1", "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "operation": "File materialization and static byte/pin inspection only; no Atlas function, CLI operation or product test executed.",
                "state": "MATERIALIZED_PLAN_PROPOSAL_NOT_RUNTIME_PREPARED", "execution_id": "846d4f9c-fb77-4e21-aff6-1fffccc3132b",
                "original_candidate": ORIGINAL_CANDIDATE, "original_contract": ORIGINAL_CONTRACT,
                "original_prepared_sha256": PREPARED_SHA, "native_package_sha256": PACKAGE_SHA,
                "source_revision": SOURCE, "protocol_revision": PROTOCOL, "runtime_revision": RUNTIME,
                "original_root": str(source), "original_root_head": CORPUS, "evaluation_root": str(destination),
                "materialization_kind": "verified exact files; no Git repository", "observed_head": None,
                "git_observation": {"argv": ["git", "rev-parse", "HEAD"], "cwd": str(destination), "exit_code": git_probe.returncode,
                                    "stdout": git_probe.stdout, "stderr": git_probe.stderr},
                "prior_source_preflight": {"path": str(preflight_path), "sha256": PREFLIGHT_SHA},
                "plan": plan_ref, "obligation_set": obligation_ref, "admission_protocol": evaluation_protocol_ref,
                "original_files_copied": 667, "file_count": len(catalog), "category_counts": counts,
                "total_bytes": sum(row["byte_length"] for row in catalog),
                "all_file_bytes_and_pins_match": True, "new_root_has_git": False, "new_root_has_atlas": False,
                "symlink_or_hardlink_aliases": [], "original_input_bytes_unchanged": True,
                "source_tracked_status_before": before_source_status, "source_tracked_status_after": after_source_status,
                "runtime_tracked_status_before": before_runtime_status, "runtime_tracked_status_after": after_runtime_status,
                "consumer_case_ids": plan["consumer_ids"], "consumer_host_ids": "NOT_CREATED_OR_ASSIGNED_BY_THIS_MATERIALIZER",
                "operations_executed": {"prepareEvaluation": False, "initializeEvaluationStore": False, "policy_provisioning": False,
                                        "admission": False, "reader": False, "consumer": False, "maintenance": False, "product_tests": False},
                "maintenance_unresolved": plan["maintenance"]["not_yet_fixed"],
                "limits": [
                    "A compatible S4 release is still required before admission and reader use; this materialization does not promote one.",
                    "The new plan, source root, obligation set and per-entry applicability create a new future candidate; no v1 or historical-r4 candidate ID is reused as that candidate.",
                    "New exact admission decisions and explicit isolated state initialization/policy are not present.",
                    "Initial phase is restricted to 14 frozen consumer cases. S2-U1 remains mandatory and requires its distinct frozen target plan and later authorization scope.",
                    "The copied baseline normative documents retain historical headers and state; the current mission and protocol govern this new execution. No header was rewritten to imply fresh results.",
                    "Implementation pins here are explicit copied source evidence; the actual evaluation runtime must independently compute its complete installed runtime/dependency identity.",
                    "File checks are not Atlas source observations, CAS identities, semantic judgments or operational proof.",
                ], "files": catalog}
    manifest_bytes = json_bytes(manifest)
    (report_dir / "materialization-manifest.json").write_bytes(manifest_bytes)
    (report_dir / "evaluation-plan.json").write_bytes((destination / PLAN).read_bytes())
    (report_dir / "obligation-set.json").write_bytes((destination / obligation_ref["payload_path"]).read_bytes())
    summary = {key: manifest[key] for key in ("state", "evaluation_root", "observed_head", "original_files_copied", "file_count", "category_counts", "total_bytes", "plan", "obligation_set", "maintenance_unresolved")}
    summary["materialization_manifest_sha256"] = sha256(manifest_bytes)
    summary["build_script_sha256"] = sha256(pathlib.Path(__file__).read_bytes())
    summary["new_root_has_atlas"] = False
    (report_dir / "summary.json").write_bytes(json_bytes(summary))
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
