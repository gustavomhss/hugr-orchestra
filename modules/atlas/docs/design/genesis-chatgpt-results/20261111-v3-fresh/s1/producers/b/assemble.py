"""Assemble this producer's transport metadata from preserved local bytes; no product execution."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib
import json
import re
import runpy

B = Path(__file__).resolve().parent
PIN = "1cde2ff7a71bcf7aecb5d030917b577165135d38"
PROTOCOL_PIN = "ee2521a5b966bd505cc95bd1c733e09e12f33531"
PAYLOAD = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/b"
CRITERIA = ["QS-1", "QS-2", "QS-4", "QS-5", "QS-6", "CC-1", "CC-3", "CC-7", "GO-I1", "GO-I2", "GO-I7", "GO-I8"]
manifest = json.loads((B / "source-manifest.json").read_text())
sources = {s["path"]: s for s in manifest["sources"]}
population = json.loads((B / "population.json").read_text())
reads = json.loads((B / "reading-classification.json").read_text())["sources"]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def dump(path, data):
    (B / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

def payload_ref(path):
    return {"payload_path": f"{PAYLOAD}/{path}", "sha256": sha((B / path).read_bytes())}

def source_ref(path):
    s = sources[path]
    return {k: s[k] for k in ("commit", "path", "git_blob_sha", "sha256")}

artifact_specs = [
    ("boundaries", "Package authority and runtime boundaries", "ownership"),
    ("schema-contracts", "Shared DTO and event schema contracts", "component"),
    ("session-contract", "Session HTTP admission and pages", "flow"),
    ("server-edge", "Server errors, authorization and location", "operational"),
    ("stream-contract", "Live SSE and durable session streams", "flow"),
    ("client-projection", "Client projections and raw transfer boundary", "component"),
    ("codegen", "HTTP client generation authority", "maintenance"),
    ("sdk-composition", "Embedded SDK and operator transport", "component"),
    ("surface-disposition", "Assigned API population and evidence depth", "entry"),
]
keys = {slug: "s1.api." + slug for slug, _, _ in artifact_specs}
needs = {keys[slug]: need for slug, _, need in artifact_specs}

def group_entry(p):
    if p.startswith("docs/"):
        return "architecture.historical-intent", "documentation", "boundaries"
    if p == "packages/schema/AGENTS.md":
        return "schema.instructions", "instruction", "boundaries"
    owner = p.split("/")[1]
    if "/test/" in p or p.endswith(".test.ts"):
        if "httpapi-exercise" in p:
            return owner + ".exercise-harness", "fixture" if "fixture" in p else "test-support", "surface-disposition"
        if any(s in p for s in ("/generated/", "/default-headers-imported/", "/default-headers-portable/")):
            return owner + ".generated-test-fixtures", "generated-fixture", "codegen"
        if "fixture" in p:
            return owner + ".fixtures", "fixture", "codegen" if owner == "httpapi-codegen" else "surface-disposition"
        target = {
            "packages/server/test/client-contract-identity.test.ts": "boundaries",
            "packages/server/test/event-stream.test.ts": "stream-contract",
            "packages/sdk-next/test/embedded.test.ts": "sdk-composition",
            "packages/sdk-next/test/import-boundaries.test.ts": "boundaries",
        }.get(p)
        if not target and reads.get(p) == "captured_full_source_read":
            target = "schema-contracts" if owner == "schema" else "client-projection" if owner == "client" else "surface-disposition"
        return owner + ".verification", "test" if p.endswith(".test.ts") else "test-support", target or ("codegen" if owner == "httpapi-codegen" else "surface-disposition")
    if "/generated-effect/" in p or "/generated/" in p:
        return "client.generated-effect" if "/generated-effect/" in p else "client.generated-promise", "generated-manifest" if p.endswith(".json") else "generated", "client-projection"
    if p.endswith("package.json"):
        return owner + ".package-authority", "manifest", "codegen" if owner == "httpapi-codegen" else "boundaries"
    if p.endswith("README.md"):
        target = {"schema": "schema-contracts", "protocol": "boundaries", "server": "server-edge", "client": "client-projection", "sdk-next": "sdk-composition", "httpapi-codegen": "codegen"}[owner]
        return owner + ".documentation", "documentation", target
    if p.endswith(("tsconfig.json", "bunfig.toml")):
        return owner + ".configuration", "support", "surface-disposition"
    if "/script/" in p:
        return owner + ".build-support", "build-script" if owner == "client" else "test-support", "codegen" if owner == "client" else "surface-disposition"
    if owner == "httpapi-codegen":
        return "codegen.production", "production", "codegen"
    if owner == "sdk-next":
        return "sdk.embedded-composition", "production", "sdk-composition"
    if owner == "client":
        return "client.handwritten", "production", "client-projection"
    if reads.get(p) == "captured_literal_surface_indexed":
        return owner + ".domain-surfaces", "production", "surface-disposition"
    if owner == "schema":
        return "schema.session-event-foundation", "production", "schema-contracts"
    if p.endswith("/api.ts") or p.endswith("/handlers.ts"):
        return owner + ".composition", "production", "boundaries"
    if any(p.endswith("/" + x + ".ts") for x in ("session", "message")) or p.endswith("/middleware/session-location.ts"):
        return owner + ".session-adapter", "production", "session-contract"
    if p.endswith("/event.ts"):
        return owner + ".stream-adapter", "production", "stream-contract"
    if p.endswith("/actions-transfer.ts"):
        return owner + ".raw-transfer-boundary", "production", "client-projection"
    return owner + ".edge-adapters", "production", "server-edge"

coverage = []
for entry in population:
    p = entry["path"]
    family, kind, target = group_entry(p)
    status = reads.get(p, "inventory_only_not_read")
    if status == "captured_full_source_read":
        depth = "L1_full_source"
        reason = "Exact source read for this bounded L1 contract; no execution and no semantic acceptance implied."
    elif status == "captured_representative_sections_read":
        depth = "L1_representative_source"
        reason = "Large generated client: runtime and decisive endpoint regions read; generation authority and manifest own remaining output. Not every generated method inspected."
    elif status == "captured_literal_surface_indexed":
        depth = "L1_literal_surface"
        reason = "Handwritten production source captured; literal imports/exports/route or handler declarations indexed. Domain implementation internals not semantically reviewed."
    elif status == "captured_not_semantically_read":
        depth = "captured_only"
        reason = "Generated bytes preserved and hash-verified; content not semantically read. Authority is the generator, Client build and output manifests."
    else:
        depth = "inventory_only"
        if kind.startswith("generated"):
            reason = "Pinned generated-family membership recorded; source not read. Regeneration authority and representative outputs are separately evidenced."
        elif kind in {"test", "test-support", "fixture"}:
            reason = "Pinned verification/fixture membership recorded; no assertion or fixture behavior inferred from an unread file and no test executed."
        else:
            reason = "Pinned support-file membership recorded; contents not read and configuration semantics not inferred."
    item = {
        "path": p, "git_blob_sha": entry["sha"], "inventory_byte_length": entry["size"],
        "family": family, "kind": kind, "depth": depth, "target_layer": 1,
        "justification": reason, "source_read_status": status,
        "need": needs[keys[target]], "artifact_key": keys[target],
        "related_artifact_keys": [keys["surface-disposition"]] if target != "surface-disposition" else [],
        "semantic_acceptance": "unjudged", "execution_evidence": "none",
    }
    if p in sources:
        item["source_ref"] = source_ref(p)
    if p.startswith("packages/client/src/generated"):
        item["regeneration_authority"] = ["AGENTS.md", "packages/client/package.json", "packages/client/script/build.ts", "packages/client/src/contract.ts", "tooling/httpapi-codegen/src/index.ts"]
        item["generated_membership_manifest"] = "packages/client/src/generated-effect/.httpapi-codegen.json" if "/generated-effect/" in p else "packages/client/src/generated/.httpapi-codegen.json"
    coverage.append(item)

coverage_doc = {
    "schema": "genesis-population-coverage/v1", "scope": "orchestra.s1", "task": "S1-L1-B",
    "execution_id": "c56ee4c3-b9dc-4569-aeb0-d3cfa5c2a502", "source_revision": PIN,
    "assigned_count": len(population), "captured_assigned_count": sum(x["path"] in sources for x in population),
    "boundary_sources_outside_assignment": [source_ref(p) for p in sources if p not in {x["path"] for x in population}],
    "family_counts": dict(sorted(Counter(x["family"] for x in coverage).items())),
    "kind_counts": dict(sorted(Counter(x["kind"] for x in coverage).items())),
    "depth_counts": dict(sorted(Counter(x["depth"] for x in coverage).items())),
    "acceptance_limit": "Complete disposition is not semantic acceptance. All artifacts remain unjudged; tests are not execution evidence.",
    "entries": coverage,
}
dump("coverage.json", coverage_doc)

# Ranges are inclusive. Extracted text is copied directly from captured source bytes, without adding line numbers inside the code fences.
excerpt_specs = []
def ex(tags, path, *ranges):
    for start, end in ranges:
        excerpt_specs.append((tags.split(), path, start, end))

ex("boundaries codegen", "AGENTS.md", (1, 3))
ex("boundaries schema-contracts", "packages/schema/AGENTS.md", (1, 28), (39, 60), (71, 76))
ex("boundaries", "packages/schema/package.json", (1, 15), (122, 130))
ex("boundaries", "packages/protocol/package.json", (1, 15), (69, 78))
ex("boundaries client-projection codegen", "packages/client/package.json", (1, 38))
ex("boundaries server-edge", "packages/server/package.json", (36, 55))
ex("boundaries sdk-composition", "packages/sdk-next/package.json", (1, 27))
ex("boundaries codegen", "tooling/httpapi-codegen/package.json", (1, 22))
ex("boundaries server-edge", "packages/protocol/src/api.ts", (59, 84), (90, 157))
ex("boundaries client-projection", "packages/client/src/contract.ts", (1, 22), (116, 126))
ex("boundaries", "packages/server/src/api.ts", (1, 8))
ex("boundaries sdk-composition", "packages/core/src/host.ts", (26, 63))
ex("schema-contracts", "packages/schema/src/schema.ts", (1, 31))
ex("schema-contracts", "packages/schema/src/session-id.ts", (1, 15))
ex("schema-contracts", "packages/schema/src/session.ts", (20, 53))
ex("schema-contracts", "packages/schema/src/model.ts", (6, 19), (81, 89))
ex("schema-contracts", "packages/schema/src/prompt.ts", (1, 38))
ex("schema-contracts", "packages/schema/src/prompt-input.ts", (1, 26))
ex("schema-contracts session-contract", "packages/schema/src/session-input.ts", (8, 27))
ex("schema-contracts", "packages/schema/src/session-message.ts", (13, 17), (122, 142), (206, 219))
ex("schema-contracts", "packages/schema/src/session-delivery.ts", (1, 6))
ex("schema-contracts client-projection", "packages/schema/src/location.ts", (1, 33))
ex("schema-contracts stream-contract", "packages/schema/src/event.ts", (9, 13), (42, 112))
ex("schema-contracts stream-contract", "packages/schema/src/session-event.ts", (42, 56), (219, 251), (269, 291), (511, 596))
ex("schema-contracts stream-contract", "packages/schema/src/event-manifest.ts", (33, 83))
ex("schema-contracts stream-contract", "packages/schema/src/durable-event-manifest.ts", (1, 20))
ex("session-contract", "packages/protocol/src/groups/session.ts", (99, 113), (137, 191), (202, 220), (333, 353), (617, 681))
ex("session-contract", "packages/server/src/handlers/session.ts", (45, 87), (107, 178), (247, 263), (615, 662))
ex("session-contract", "packages/protocol/src/groups/message.ts", (1, 55))
ex("session-contract", "packages/server/src/handlers/message.ts", (8, 80))
ex("session-contract server-edge", "packages/server/src/middleware/session-location.ts", (15, 62))
ex("server-edge", "packages/protocol/src/errors.ts", (1, 121))
ex("server-edge", "packages/server/src/auth.ts", (6, 49))
ex("server-edge", "packages/server/src/middleware/authorization.ts", (10, 13), (33, 63))
ex("server-edge", "packages/server/src/middleware/capability-authorization.ts", (17, 85))
ex("server-edge", "packages/server/src/middleware/schema-error.ts", (1, 20))
ex("server-edge", "packages/server/src/location.ts", (33, 94))
ex("server-edge", "packages/server/src/handlers/pty.ts", (116, 160), (175, 183))
ex("server-edge", "packages/server/src/handlers/capability-artifacts.ts", (58, 84))
ex("server-edge sdk-composition", "packages/server/src/principal.ts", (1, 20))
ex("server-edge", "packages/server/src/handlers/model.ts", (8, 47))
ex("server-edge", "packages/server/src/handlers/provider.ts", (10, 61))
ex("stream-contract", "packages/protocol/src/groups/event.ts", (1, 31))
ex("stream-contract", "packages/server/src/handlers/event.ts", (1, 64))
ex("stream-contract client-projection", "packages/client/src/generated/client.ts", (535, 666), (4072, 4110))
ex("client-projection", "packages/client/README.md", (11, 15), (27, 36))
ex("client-projection", "packages/client/src/generated/client.ts", (1548, 1572))
ex("client-projection", "packages/protocol/src/groups/fs.ts", (1, 48))
ex("client-projection", "packages/client/src/wire.ts", (1, 12))
ex("client-projection", "packages/client/src/generated-effect/client-error.ts", (1, 15))
ex("client-projection", "packages/client/src/actions-transfer.ts", (58, 70), (104, 130), (143, 176))
ex("client-projection", "packages/client/src/actions-transfer-error.ts", (4, 73))
ex("client-projection", "packages/protocol/src/groups/actions-transfer.ts", (1, 17))
ex("client-projection", "packages/server/src/handlers/actions-transfer.ts", (1, 35))
ex("codegen", "packages/client/script/build.ts", (1, 48))
ex("codegen", "tooling/httpapi-codegen/src/index.ts", (75, 123), (140, 164), (178, 219), (318, 354), (687, 745), (757, 778), (946, 955))
ex("codegen client-projection", "tooling/httpapi-codegen/src/imported-effect.ts", (35, 42), (51, 64))
ex("codegen client-projection", "tooling/httpapi-codegen/src/effect-headers.ts", (1, 34))
ex("codegen", "tooling/httpapi-codegen/src/layout.ts", (93, 113), (146, 161), (180, 190))
ex("codegen surface-disposition", "packages/client/src/generated/.httpapi-codegen.json", (1, 42))
ex("codegen surface-disposition", "packages/client/src/generated-effect/.httpapi-codegen.json", (1, 16))
ex("sdk-composition", "packages/sdk-next/src/orchestra.ts", (1, 59))
ex("sdk-composition", "packages/sdk-next/src/operator-transport.ts", (1, 28))
ex("sdk-composition server-edge", "packages/server/src/routes.ts", (89, 112))

excerpt_index = []
chunks = ["# Exact pinned review evidence\n\nThis packet supplies actual source excerpts to tool-free judges. Every range below is extracted unchanged from the captured source; omitted ranges make no claim. All product source excerpts use commit `" + PIN + "`. The manifest contains the complete source bytes, Git blob identities, SHA-256 values, and byte lengths. Tests were not executed.\n\nThe nine bodies remain L1 and unjudged. Review their bounded claims and explicit gaps, rather than treating complete inventory as complete semantics.\n\n"]
chunks.append("## Artifact-to-evidence index\n\n")
for index, (tags, path, start, end) in enumerate(excerpt_specs, 1):
    raw = (B / "sources" / path).read_bytes()
    lines = raw.decode("utf-8").splitlines(keepends=True)
    if start > len(lines):
        raise ValueError((path, start, len(lines)))
    end = min(end, len(lines))
    selected = "".join(lines[start-1:end])
    ident = f"E{index:03}"
    excerpt_index.append({"id": ident, "artifact_keys": [keys[t] for t in tags], "path": path, "git_blob_sha": sources[path]["git_blob_sha"], "source_sha256": sources[path]["sha256"], "start_line": start, "end_line": end, "excerpt_sha256": sha(selected.encode()), "byte_length": len(selected.encode())})
    excerpt_specs[index-1] = (ident, tags, path, start, end, selected)
for slug, _, _ in artifact_specs:
    refs = [e["id"] for e in excerpt_index if keys[slug] in e["artifact_keys"]]
    chunks.append(f"- `{keys[slug]}`: {', '.join(refs) if refs else 'Provenance summary and coverage checks below'}.\n")
chunks.append("\n## Population and fidelity evidence\n\n")
chunks.append(f"Assigned Git blobs: {len(population)}. Exact captured sources: {len(sources)} ({coverage_doc['captured_assigned_count']} assigned plus 2 boundary authorities). Uncaptured assigned members: {len(population)-coverage_doc['captured_assigned_count']}. All 252 assigned handwritten production modules are captured; the literal surface index has 253 modules including Core host. These are transport observations, not semantic acceptance.\n\n")
chunks.append("Read register: `" + json.dumps(dict(Counter(reads.values())), sort_keys=True) + "`.\n\n")
chunks.append("The generated source `packages/client/src/generated/types.ts` has 462,732 captured bytes and Git blob `" + sources["packages/client/src/generated/types.ts"]["git_blob_sha"] + "`. This exceeds the shared protocol's stated current 256,000-byte runtime observer limit. No runtime version or receipt is claimed.\n\n")
for ident, tags, path, start, end, selected in excerpt_specs:
    chunks.append(f"## {ident} — `{path}`\n\nCommit `{PIN}`; Git blob `{sources[path]['git_blob_sha']}`; source lines {start}–{end}. Applies to: {', '.join(keys[t] for t in tags)}.\n\n```{ 'json' if path.endswith('.json') else 'typescript' if path.endswith('.ts') else 'text' }\n")
    chunks.append(selected)
    if not selected.endswith("\n"):
        chunks.append("\n")
    chunks.append("```\n\n")
(B / "review-evidence.md").write_text("".join(chunks))
dump("review-evidence-index.json", {"schema": "genesis-review-excerpts/v1", "source_revision": PIN, "excerpts": excerpt_index})
runpy.run_path(str(B / "compact_evidence.py"))
compact_index = json.loads((B / "review-evidence-compact-index.json").read_text())

artifact_sources = {}
for slug, _, _ in artifact_specs:
    selected = {x["path"] for x in coverage if x["artifact_key"] == keys[slug] and x["path"] in sources}
    selected.update(e["path"] for e in excerpt_index if keys[slug] in e["artifact_keys"])
    if slug == "surface-disposition":
        selected.update(sources)
    if slug == "boundaries":
        selected.update(p for p in sources if p.startswith("docs/architecture/phase-plans/70-90-briefs/"))
    if slug == "codegen":
        selected.add("packages/client/src/generated/types.ts")
    artifact_sources[slug] = sorted(selected)

common_gaps = ["No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.", "No local product tests, generation, builds, or runtime operations were executed."]
specific_gaps = {
    "boundaries": ["Package declarations and inspected imports do not prove the complete transitive browser dependency graph."],
    "schema-contracts": ["Most non-session domain schema modules received literal surface indexing only.", "V2 annotations/brands remain despite unversioned naming intent."],
    "session-contract": ["Core persistence, scheduling, execution and recovery internals are delegated boundaries, not independently proven here."],
    "server-edge": ["No runtime authorization, location, provider or socket checks; PTY output queue is unbounded in source."],
    "stream-contract": ["No replay/overflow/network experiment; global live readiness is not durable replay or automatic reconnect."],
    "client-projection": ["Generated freshness unverified; most generated modules are inventory-only.", "generated/types.ts is 462732 bytes; current runtime observer refuses inputs above 256000 bytes, so its binding remains unresolved.", "README raw-file omission conflicts with generated fs.read; handwritten upload route lacks a corresponding declaration in the inspected Actions transfer group/handler."],
    "codegen": ["Regeneration/freshness and generator test fixtures were not executed.", "Line-bounded selected type modules do not guarantee every generated input is below the runtime observer byte limit."],
    "sdk-composition": ["Embedded tests were read but not run; Core lifecycle/recovery and all concurrency isolation remain unproven."],
    "surface-disposition": ["183 assigned entries are inventory-only; 190 captured source modules have literal surface depth, not full semantic reading.", "Required oversized generated input retained; no unavailable runtime observation is relabeled absent or supplied with a fabricated version."],
}
members = {
    "boundaries": ["packages/schema", "packages/protocol", "packages/server", "packages/client", "packages/sdk-next", "tooling/httpapi-codegen", "docs/architecture/phase-plans/70-90-briefs"],
    "schema-contracts": ["packages/schema/src", "packages/schema/test"],
    "session-contract": ["packages/protocol/src/groups", "packages/server/src/handlers", "packages/server/src/middleware"],
    "server-edge": ["packages/protocol/src/middleware", "packages/server/src/middleware", "packages/server/src/handlers"],
    "stream-contract": ["packages/schema/src", "packages/protocol/src/groups", "packages/server/src/handlers"],
    "client-projection": ["packages/client/src", "packages/client/src/generated", "packages/client/src/generated-effect", "packages/client/test"],
    "codegen": ["tooling/httpapi-codegen/src", "tooling/httpapi-codegen/test", "packages/client/script", "packages/client/src/generated", "packages/client/src/generated-effect"],
    "sdk-composition": ["packages/sdk-next/src", "packages/sdk-next/test"],
    "surface-disposition": ["packages/schema", "packages/protocol", "packages/server", "packages/client", "packages/sdk-next", "tooling/httpapi-codegen", "docs/architecture/phase-plans/70-90-briefs"],
}

response = f"""# S1-L1-B producer delivery

Completed the native L1 evidence fragment in `/workspace/scratch/2b46fb541868/genesis-s1/producers/b`.

- Nine L1 artifacts, all under stable `s1.api.*` keys in scope `orchestra.s1`.
- Complete disposition of all 472 assigned entries in `coverage.json`.
- 291 exact pinned source captures: 289 assigned entries and two boundary authorities. All 252 handwritten production TypeScript modules in the assignment are preserved; the literal surface index has 253 modules including Core host.
- Read depths: 97 full sources, two generated-client representative reads, 190 literal surface-indexed sources, and two captured generated files without semantic reading. The 183 uncaptured assigned entries remain explicitly inventory-only.
- `review-evidence.md` contains {len(excerpt_index)} mechanically extracted source ranges with path, commit, Git blob, and line spans; `review-evidence-index.json` additionally binds each excerpt's bytes.
- `review-evidence-compact.md` retains the decisive branches in 62,330 bytes across 47 sources for economical judge delivery; the complete evidence archive remains preserved.

The factual bodies cover package authority, DTO/event schemas, session admission and pagination, HTTP errors/authorization/location, live versus durable streams, Promise and Effect clients, generation authority, embedded SDK composition, and the population's evidence depth. They retain the fs.read documentation mismatch, the unmatched upload declaration in the inspected transfer group/handler, and remaining V2 names as real discrepancies.

Exact delivery paths:

- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/artifacts.json`
- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/coverage.json`
- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/source-manifest.json`
- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/review-evidence.md`
- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/review-evidence-index.json`
- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/review-evidence-compact.md`
- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/review-evidence-compact-index.json`
- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/checks.json`
- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/request.txt`
- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/request-steering.txt`
- `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/response.md`
- Bodies: `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/bodies/`
- Source bytes: `/workspace/scratch/2b46fb541868/genesis-s1/producers/b/sources/`

The local transport checks verify coverage bijection, source Git blob/SHA-256/length fidelity, body bytes, source references, legal layers/needs/paths, full and compact excerpt fidelity, and empty build dependencies. `checks.json` records those results and artifact file hashes. No product test, build, generation, server, product HTTP/provider request, remote mutation, semantic judge acceptance, or Atlas runtime binding is claimed.

Source-manifest SHA-256: `{sha((B / 'source-manifest.json').read_bytes())}`.
Coverage SHA-256: `{sha((B / 'coverage.json').read_bytes())}`.
Review-evidence SHA-256: `{sha((B / 'review-evidence.md').read_bytes())}`.
Compact review-evidence SHA-256: `{sha((B / 'review-evidence-compact.md').read_bytes())}`.

The critical later binding gap is retained: `packages/client/src/generated/types.ts` is 462,732 bytes, above the current 256,000-byte observer limit. Inventory-only files and surface-indexed domain internals do not gain semantic acceptance from these checks. The fragment remains `IN_PROGRESS`; L2–L4 dependencies are intentionally absent pending the required two-judge acceptance.
"""
(B / "response.md").write_text(response)

artifacts = []
for slug, title, need in artifact_specs:
    path = f"bodies/{slug}.md"
    raw = (B / path).read_bytes()
    ss = artifact_sources[slug]
    evidence = [dict(payload_ref("review-evidence.md"), excerpt_ids=[e["id"] for e in excerpt_index if keys[slug] in e["artifact_keys"]]), dict(payload_ref("review-evidence-compact.md"), source_excerpt_ids=[e["id"] for e in compact_index["sources"] if keys[slug] in e["artifact_keys"]]), payload_ref("source-manifest.json"), payload_ref("coverage.json")]
    a = {
        "key": keys[slug], "scope": "orchestra.s1", "title": title, "layer": 1, "need": need,
        "body": {"path": path, "encoding": "utf-8", "byte_length": len(raw), "sha256": sha(raw)},
        "authority": {
            "scope": "orchestra.s1",
            "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
            "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
            "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding.",
        },
        "validity": "supported", "gaps": common_gaps + specific_gaps[slug], "evidence": evidence,
        "validity_basis": "Supported only for bounded source observations; no semantic acceptance or runtime import is implied.",
        "input_keys": sorted({"file:" + p for p in ss} | {"members:" + d for d in members[slug]} | {f"file:{PAYLOAD}/request.txt", f"file:{PAYLOAD}/request-steering.txt", "file:.orchestra/skills/execute-genesis/SKILL.md", "file:.orchestra/skills/execute-genesis/references/principles.md", "file:.orchestra/skills/execute-genesis/references/transport.md"}),
        "source_refs": [source_ref(p) for p in ss],
        "recipe_ref": payload_ref("request.txt"), "recipe_supplement_refs": [payload_ref("request-steering.txt")],
        "build_dependencies": [], "navigation": [{"key": keys[s], "same_package": True} for s in keys if s != slug],
        "producer_request_ref": payload_ref("request.txt"), "producer_response_ref": payload_ref("response.md"),
        "semantic_review_refs": [], "runtime_receipt_refs": [],
    }
    artifacts.append(a)

protocol_raw = (B.parent.parent / "protocol/SKILL.md").read_bytes()
package = {
    "schema": "genesis-native-package/v1", "campaign": "20261111-v1", "protocol_epoch": "parallel-v3-fresh", "results_epoch": "20261111-v3-fresh", "session": "S1", "task": "S1-L1-B",
    "source_revision": PIN, "protocol_ref": {"commit": PROTOCOL_PIN, "path": ".orchestra/skills/execute-genesis/SKILL.md", "git_blob_sha": "852e1d66539be5df895ba4cdbd2f9ab6e2331877", "sha256": sha(protocol_raw)},
    "scope": "orchestra.s1", "package_state": "IN_PROGRESS", "fragment_path_base": "producer-local; principal remaps bodies/ to producers/b/bodies/ in shared package",
    "contract": {"criteria": CRITERIA, "oracle_ref": None, "oracle_access": "Producer did not read reserved oracle; principal binds its frozen reference."},
    "required_artifact_keys": list(keys.values()), "artifacts": artifacts,
    "roots": {"entry": [keys["surface-disposition"]], "ownership": [keys["boundaries"]], "maintenance": [keys["codegen"]], "operational": [keys["server-edge"]], "flow": [keys["session-contract"], keys["stream-contract"]], "component": [keys["schema-contracts"], keys["client-projection"], keys["sdk-composition"]]},
    "missing_required_artifact_keys": [],
    "known_limits": ["Producer fragment only. Complete assignment disposition does not grant whole-population semantic acceptance.", "No semantic review or runtime acceptance exists yet.", "generated/types.ts exceeds the current runtime observer byte limit; input retained, binding unresolved.", "No local product tests or regeneration were run."],
    "producer": {"task": "S1-L1-B", "agent": "/root/producer_b", "execution_id": "c56ee4c3-b9dc-4569-aeb0-d3cfa5c2a502", "model_telemetry": "No independent model/runtime telemetry asserted."},
}
dump("artifacts.json", package)

errors = []
def check(cond, label):
    if not cond:
        errors.append(label)

check(len(population) == 472 and len(coverage) == 472, "population size")
check(len({e["path"] for e in coverage}) == 472, "coverage uniqueness")
check({e["path"] for e in coverage} == {e["path"] for e in population}, "coverage bijection")
for p, s in sources.items():
    raw = (B / s["capture_path"]).read_bytes()
    check(sha(raw) == s["sha256"] and len(raw) == s["byte_length"], "source bytes: " + p)
    check(hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == s["git_blob_sha"], "source blob: " + p)
    check(s["commit"] == PIN, "source pin: " + p)
    check(not (B / s["capture_path"]).is_symlink(), "source symlink: " + p)
for e in coverage:
    if e["path"] in sources:
        check(e["git_blob_sha"] == sources[e["path"]]["git_blob_sha"], "inventory blob: " + e["path"])
        check(e["inventory_byte_length"] == sources[e["path"]]["byte_length"], "inventory size: " + e["path"])
for a in artifacts:
    p = Path(a["body"]["path"])
    check(not p.is_absolute() and ".." not in p.parts and not (B / p).is_symlink(), "body path " + a["key"])
    raw = (B / p).read_bytes()
    check(sha(raw) == a["body"]["sha256"] and len(raw) == a["body"]["byte_length"], "body bytes " + a["key"])
    check(a["layer"] == 1 and a["need"] in {"entry", "ownership", "maintenance", "operational", "flow", "evidence", "component"}, "enum " + a["key"])
    check(a["scope"] == "orchestra.s1" and a["validity"] in {"supported", "blocked"}, "scope/validity " + a["key"])
    check(a["build_dependencies"] == [] and a["semantic_review_refs"] == [] and a["runtime_receipt_refs"] == [], "no fabricated acceptance " + a["key"])
    for r in a["source_refs"]:
        check(r == source_ref(r["path"]), "source reference " + r["path"])
    check(all(k.startswith(("file:", "members:")) for k in a["input_keys"]), "input key kinds " + a["key"])
for e in excerpt_index:
    lines = (B / "sources" / e["path"]).read_bytes().decode().splitlines(keepends=True)
    raw = "".join(lines[e["start_line"]-1:e["end_line"]]).encode()
    check(sha(raw) == e["excerpt_sha256"] and len(raw) == e["byte_length"], "excerpt bytes " + e["id"])
for e in compact_index["sources"]:
    lines = (B / "sources" / e["path"]).read_bytes().decode().splitlines(keepends=True)
    for span in e["ranges"]:
        raw = "".join(lines[span["start_line"]-1:span["end_line"]]).encode()
        check(sha(raw) == span["sha256"] and len(raw) == span["byte_length"], "compact excerpt bytes " + e["id"])
        check(any(full["path"] == e["path"] and full["start_line"] <= span["start_line"] and full["end_line"] >= span["end_line"] for full in excerpt_index), "compact range retained in full archive " + e["id"])
check(compact_index["full_evidence_sha256"] == sha((B / "review-evidence.md").read_bytes()), "compact full-archive binding")
assigned_production = [e for e in population if "/src/" in e["path"] and "/generated" not in e["path"] and e["path"].endswith(".ts")]
check(len(assigned_production) == 252 and all(e["path"] in sources for e in assigned_production), "all assigned production modules captured")
check(len({a["key"] for a in artifacts}) == len(artifacts), "artifact uniqueness")
check(hashlib.sha1(b"blob " + str(len(protocol_raw)).encode() + b"\0" + protocol_raw).hexdigest() == "852e1d66539be5df895ba4cdbd2f9ab6e2331877", "protocol skill blob")
checks = {
    "schema": "genesis-producer-transport-checks/v1", "task": "S1-L1-B", "source_revision": PIN,
    "status": "PASS" if not errors else "FAIL", "scope": "transport mechanics only, not product tests, semantic acceptance or runtime binding",
    "counts": {"artifacts": len(artifacts), "assigned_entries": len(population), "covered_entries": len(coverage), "captured_sources": len(sources), "captured_assigned": coverage_doc["captured_assigned_count"], "uncaptured_assigned": len(population)-coverage_doc["captured_assigned_count"], "assigned_handwritten_production_modules": len(assigned_production), "exact_excerpts": len(excerpt_index), "compact_sources": len(compact_index["sources"]), "compact_ranges": sum(len(e["ranges"]) for e in compact_index["sources"])},
    "checks": ["Coverage is a bijection over 472 assigned paths", "All 291 sources match SHA-256, byte length and observed Git blob", "All 252 assigned handwritten production src modules captured", "Captured source identities match pinned inventory", "All body hashes and lengths match", "Legal scope/layer/need/validity and relative body paths", "Source references match manifest", "Every full and compact excerpt hash matches exact selected source lines", "Compact ranges are retained in full archive and full archive hash matches", "Input keys are file or members", "No build dependencies or fabricated judge/runtime receipts", "Mirrored protocol SKILL matches observed Git blob"],
    "errors": errors,
    "file_hashes": {p: {"sha256": sha((B / p).read_bytes()), "byte_length": len((B / p).read_bytes())} for p in ["artifacts.json", "coverage.json", "source-manifest.json", "review-evidence.md", "review-evidence-index.json", "review-evidence-compact.md", "review-evidence-compact-index.json", "surface-index.json", "reading-classification.json", "request.txt", "request-steering.txt", "response.md"]},
    "execution_limits": {"product_tests_run": 0, "generation_runs": 0, "runtime_imports": 0, "remote_writes": 0, "judges_run_by_producer": 0},
}
dump("checks.json", checks)
print(json.dumps({"status": checks["status"], "counts": checks["counts"], "errors": errors, "artifacts_sha256": checks["file_hashes"]["artifacts.json"]["sha256"], "review_evidence_bytes": checks["file_hashes"]["review-evidence.md"]["byte_length"]}, indent=2))
if errors:
    raise SystemExit(1)
