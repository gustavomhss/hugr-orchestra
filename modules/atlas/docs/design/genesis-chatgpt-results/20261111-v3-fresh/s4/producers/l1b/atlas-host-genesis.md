# Atlas host, transports, and candidate Genesis

`S4:L1:atlas-host-genesis` · source `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`; execution `a2095d5a-1464-4c38-a222-6376974fc9c9`. This is static L1 evidence. **Observed** means visible in pinned code; **intended** means a source contract or instruction; **inferred** consequences are identified. No product command, model, test, build, runtime observer or publication ran. `artifacts.json` provides revision/Git-blob/SHA-256 identities; `coverage.json` records the preserved population and inspection depth.

Citation prefixes `A/`, `G/`, `L/`, `T/`, `S/` expand to `modules/atlas/packages/{adapter-io,genesis,cli,tools,mcp-server}/src/`; `B/` means `modules/atlas/boundary/`; `N/` means `modules/atlas/packages/knowledge/src/`. All line citations refer to the fixed baseline. Engine functions and contracts are explained by `S4:L1:atlas-engine`; historical transport and artifact identity are separately covered by accepted `S4:L1:ownership-boundaries`.

## Purpose: bind a real repository to the pure engine without handing it authority

The host composition root supplies filesystem/Git/SCIP/AST/model/store adapters to shared handlers and specialized CLI legs. Its practical job is to turn source relationships into inspectable results while keeping persisted candidates, published knowledge, actor policy and provenance distinct. `composeRuntime` creates the store, applies provenance, replays committed knowledge only under its permitted branch, and builds a shared read-access result. CLI initialization awaits the AST adapter and composes against the working directory. [A/compose.ts:128-174,233-282; L/bin.ts:16-44,52-127]

The adapter package is substantially broader than one door: its preserved population includes verification, history/index/model input, ownership publication/rebuild, surface UI ports, native memory, durable logs and diagnostics. Selected consequential seams below have source inspection; uninspected files retain an explicit group/depth reason rather than an assertion that the entire adapter was proved correct.

## Identity, policy and provenance: distinct controls with explicit limits

CLI/MCP actor identity comes from `ATLAS_ACTOR`, else Git user email, else an empty string. Ratification comes from a separate environment value. The source expressly calls this caller-supplied identity and an anti-accident guardrail, not authentication. Keeping actor fields out of model payloads narrows an accidental channel; it does not stop a process owner from selecting environment values or Git configuration. [A/compose.ts:128-174; N/ratify/ratify.ts:94-107,129-145]

Policy defaults have empty authorization scopes, denying writes when absent or unusable. Membership checks use scope declarations; scope selection follows the longest path-segment prefix. An absent/empty anchor binding imposes no additional anchor restriction, while a populated binding requires the exact anchor. A syntactically nonempty scope alone is not authorization. [A/policy.ts:55-105,236-271; N/write/authz.ts:58-60]

| Provenance returned by source | Read/write consequence in captured composition |
|---|---|
| `trusted` | Use the gated local store; allow the composed write/replay path. |
| `tracked-staging` | Refuse reads through the protected access result; no trusted write path. |
| `tracked-provable` | Read only a projection and CAS view filtered through current re-proof; writes remain refused. |

The classifier checks tracked `.atlas/cas/` and projection/staging sidecars, prioritizing staging. Committed logs and `blobs/` are a different population. `git ls-files` failure is caught as `trusted`, and the classification is cached for that constructed callback. This is a concrete limit: “trusted” does not prove an authenticated origin or that a copied store outside Git passed a door. Re-proof filtering is not permission to fall back to the raw store when it fails. [A/store-provenance.ts:94-104,127-155; A/read-access.ts:1-32,140-158,183-203; A/compose.ts:233-282]

## Storage, governed emission and committed replay

`createDiskStore` gives the canonical CAS a filesystem implementation. A read requires a 64-hex address, opens without following a symlink, requires a regular bounded file (64 MiB), checks containment, parses and re-hashes the object; invalid/unavailable objects return undefined. Writes derive identity before writing JSON. `commitProjection` executes its decision callback against the generation it will settle and can retry it; gates must be inside that callback. `commitStaging` uses the same protocol over a separate candidate sidecar. The older unconditional `persistProjection` remains last-writer-wins even if its individual replacement is atomic. [A/store.ts:121-148,180-229,240-287,301-325]

Governed emission snapshots/validates the request, selects family-specific handling, recomputes truth and, inside the commit decision, checks the incumbent's authority and ownership attachments/ratification origin before choosing the new projection. CAS content is put before the projection references it. Contended, untrusted and unreadable commits have explicit refusal results. This is the shipped seam named by the reference-model ledger; isolated pure `tools/emit` or grounding helpers are not substitutes for these checks. [A/governed-emit.ts:169-214,246-308,354-378,395-402; modules/atlas/harness/gates/reference-model-guard.mjs:122-127]

The logged-store wrapper appends changed/produced projection rows after a settled commit, with actor, time and optional card/attempt source. Each row references a CAS object copied into committed `blobs/` if absent. It does not log staging, and removed projection rows produce no deletion record. Reads require a structurally valid entry, an actor matching its sanitized member folder and a row key matching the event; rows are selected by their logged ordering. This folder agreement is not authentication: a person with repository write access can create such a folder. [A/knowledge-log.ts:49-83,91-120; .orchestra/skills/atlas-ownership/SKILL.md:40-45,66-70]

Replay compares current/logged rows while ignoring `derivedAt`, resolves referenced blobs, then applies only facts with `seal: proven`, an actor in local policy scope and a successful supplied re-proof. Other resolved rows go to staging; missing blobs, rejected lines, unreadable folders and commit refusal remain reported. Restoration accepts an already-present valid local object before trying a committed blob, so a claim that every replayed object was freshly recovered from Git would exceed this implementation. Replay commits through the raw store to avoid logging the same outcome again. It is a separate trust path, not an invocation of every live emit gate. [A/knowledge-replay.ts:41-105; A/compose.ts:233-282]

**Impact.** Even composing a read command can reconstruct local state through replay. A committed candidate log is portable evidence, not an approved projection; editing committed `.atlas` data does not create current ownership publication. Memory is different again: its durable adapter reads records directly and orders by sequence, while orientation's integrity key covers its payload. Do not generalize knowledge's replay rule to those logs. [.orchestra/skills/atlas-usage/SKILL.md:28-32; A/memory-store.ts:45-70; A/orientation-store.ts:59-76]

## Ownership publication, observation and rebuild

The host ownership accessor first searches a provenance-filtered projection for exactly one matching scoped advisory carrier with the required row tier, predicate slot and ownership claim/receipt. Retired carriers are skipped; no carrier is unpublished, multiple carriers are ambiguous. Only then does it invoke the low-level knowledge read/index operation. Storing artifact/result/review objects in the CAS is therefore insufficient to make them discoverable through the published door. [A/ownership-access.ts:18-48; N/ownership/read.ts:16,36-95]

The host observer has three useful states: present with a version, absent only after corroborating a containing directory, and unavailable when observation cannot be justified. The older version callback loses the absent/unavailable distinction. It refuses `.atlas`/`.git` path segments, symlinks, and files over 256,000 bytes. These are observer constraints, not permission to remove such files from the S4 population. Input keys declare what is observed; transport SHA-256/Git-blob identities do not fabricate runtime kernel versions. [A/ownership-input.ts:21-190; S4:L1:ownership-boundaries]

Rebuild uses `planOwnershipUpdate`, registered recipes and captured observations. It checks recipe identity/version, input/contract/predecessor declarations and complete membership; clones captured bytes/lists; and reobserves around work. Unavailable observations or missing mandatory input HOLD. It follows the affected topological order, can skip unchanged precise input/dependency hashes, invokes the registered recipe and evaluator, then reads the candidate graph again. An unchanged manifest returns a candidate with no calls. The result is a candidate, not activation. The source's default basis/evidence explicitly call its fixture recipe output “not semantic acceptance”; a supplied evaluator or pair of structurally valid reviews cannot be described as independent semantic judgment without evidence of that process. [A/ownership-rebuild.ts:1-300]

The fresh native transport protocol at `ee2521a5b966bd505cc95bd1c733e09e12f33531` carries exact body files, source identity and bounded request/response/review references. That does not make this producer a runtime importer. The historical `scripts/ownership-pilot.ts` consumes a specific previous campaign corpus and reviewer/runtime-binding layout; it is not a generic adapter for these four L1 bodies. Its predecessor bindings cannot be silently reused. [modules/atlas/scripts/ownership-pilot.ts:1-158; .orchestra/skills/execute-genesis/references/transport.md:16-39,105-149; .orchestra/skills/execute-genesis/references/runtime.md:30-65,74-127]

## Tools, CLI and MCP: shared dispatch does not mean identical surface

The current handler's `GOVERNANCE_SURFACE` names six tools: init, query, emit, reconcile, link and memory-emit. `WRITE_PATHS` names three: emit, link and memory-emit. Read/planner entries separately include anchors, slots, draft, check, doctor, node and four memory reads. `atlas-diff` is explicitly declared unreached rather than silently counted as shipped. Older five/two prose must not override these arrays. Governed refusal, malformed call and internal failure have distinct handler envelopes; an internal fault is not attributed to caller syntax. [T/handler.ts:35-62,101-112,390-428]

CLI adds command-specific paths beyond shared tools. It parses help/commands, refuses a failed composed read-access result except initialization, routes mining/specialized legs, then marshals common handler calls; init also writes the ignore rule. MCP declares schemas and dispatches shared handlers plus specialized reads, serving over stdio. The MCP README describes Orchestra integration as in-process through the boundary rather than through this standalone server. Source presence proves those entry points exist, not that an external client in this execution used either transport. [L/cli.ts:300-343,575-615; S/server.ts:44-55,262-316; modules/atlas/packages/mcp-server/README.md:6-17]

For dependency/trigger query, the host rebuilds a retrieval model from current projection rows, excludes retired facts, maps all facts per anchor, computes reverse dependency closure, and keeps an empty trigger map in this construction. It uses current-node identity to locate returned facts before minting a pack. The shared bands function separates governing tiers from T2 advisory and enforces an advisory prefix cap of 2,000 measured **claim string units**; off-lattice tiers enter neither band. This is more precise than calling every cap model tokens or claiming the reference pack assembler is the live query path. [A/retrieval-model.ts:48-105,124-147; T/bands.ts:36-56,85-107]

## Candidate Genesis: bounded extraction is not publication or semantic understanding

The extraction loop sorts candidates by PageRank then rank, counts visited sites against a ceiling, and defaults to the smaller of the frontier and 200. A trailing window of 20 stops when fewer than four were admitted. A proposal collection must contain one to four entries; malformed and explicit abstentions remain abstentions. Admission depends on mechanical checks, not model self-confidence. The admit harness routes advisory, predicate, relation, negation, transition and test-vacuity shapes and exposes optional verifier ports; the exact supplied implementation matters to any soundness claim. [G/extract.ts:25-26,168-216; G/admit-harness.ts:132-163,216-239]

The controller keeps pending state in its closure, drives a fresh run into counters/outcomes, and returns structured failure reports. Resume without a pending plan returns an empty report; otherwise it filters remaining rank and accumulates counts. Re-run takes changed buckets; handoff invokes an explicit callback. This in-process mechanism alone is not durable cross-process continuation. The separate checkpoint scripts and workflow supply a different orchestration layer, covered in `coverage-governance`. [G/run-controller.ts:246-365]

Seeding does not invent ratified policy: missing T0 constitution/conventions or mission/terrain/ontology inputs produce explicit UN-SEEDED results; mission stub information is unratified. Mining binds separate `commitStaging` storage under reserved `atlas:mined`/T2. A tracked/unreadable/contended staging store has a concrete refusal and is not overwritten into apparent success. Staging/admission is not a semantic-review receipt, and promotion still crosses a governed door. [G/seed.ts:82-119; L/mine-staging.ts:15-46; modules/atlas/docs/adr/ADR-0008-mining-writes-to-staging-not-to-knowledge.md:50-71]

Model configuration is resolved outside the analyzed repository; an in-repository command configuration is refused. An absent config means no model, while unreadable/invalid/malformed configurations have explicit errors. The config requires a `propose` command and argument array, integer timeout, and an exact integer ratio for cost caps. The command's version probe has a five-second bound and records unavailable output rather than inventing a version. Current CLI arm resolution includes advisory, dependency, count, definition and semantic; the captured legacy workflow's arm allowlist is narrower. Prompt files and claim parsers are inputs to candidate production, not authority sources. [A/model-config.ts:96-201; L/mine-proposer.ts:43-67,90-109; .github/workflows/atlas-genesis.yml:1107-1115]

## The generated boundary is a host package with traceable owners

The boundary exports checked-in JS and declaration bundles. Its build script maps each public subpath to a source entry, resolves Atlas packages to source, builds node-targeted ESM with Bun, generates declarations, and can compare exact output bytes with `--check`. No generation or parity check ran here. The two oversized bundles remain in coverage even though the ownership file observer refuses their size. [B/package.json:1-63; B/script/build.ts:1-85]

| Public boundary subpath | Source entry |
|---|---|
| root | `retrieval/src/host-context.ts` |
| `materialize` | `retrieval/src/own-snapshot.ts` |
| `native-header` | `adapter-io/src/native-header.ts` |
| `native-memory` | `adapter-io/src/native-bound.ts` |
| `surface` | `adapter-io/src/surface/index.ts` |
| `mine` | `cli/src/surface-mine.ts` |
| `context` | `adapter-io/src/context-log.ts` |
| `record` | `persist/src/host-adapter.ts` |
| `record-log` | `adapter-io/src/record-log.ts` |

All table entries are relative to `modules/atlas/packages/`. This mapping identifies the edit/regeneration starting point. A checked-in bundle is an executable consumer artifact, not independent proof of source parity or host invocation. The Continuity archive imports the context subpath, whose source is available here; external Orchestra Session/board authorization and lifecycle remain separate integration boundaries. [B/script/build.ts:1-85; modules/continuity/src/v2/archive.ts:7-13]

## Maintenance and remaining uncertainty

Start governance changes at `compose.ts`, policy, provenance/read-access, governed emit and the durable commit protocol together. Start portable knowledge changes at layout/log/replay plus ignore and migration rules. Start ownership changes at observer/access/rebuild and knowledge shape/read/update-plan, preserving unavailable/absent and candidate/published distinctions. Start model/mining changes at config, proposer parsers, controller/admission and staging; update the boundary source mapping when a host entry changes.

Semantic gaps remain in uninspected verifier families, concurrency failure branches, full UI surface port behavior, generated/source parity, all model transport recovery variants, and external host enforcement. Recorded policies and exported factories do not prove that an uninspected host invokes them. The captured source permits precise bounded statements above; it does not establish a successful run, current source freshness, complete solver soundness, live authenticated ratification or completed S4 ownership. Build dependencies are empty because this is direct-source evidence; navigation to other L1 units is not an accepted predecessor for L2.
