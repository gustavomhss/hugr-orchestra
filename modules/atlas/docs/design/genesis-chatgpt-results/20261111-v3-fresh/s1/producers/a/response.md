Producer A completed a concrete **17-artifact L1 candidate** for `S1-L1-A`, under the common `orchestra.s1` scope. The bodies contain 81,782 UTF-8 bytes and are grounded in 102 exact pinned source captures totaling 1,125,275 bytes. All 1,441 assigned entries have an explicit coverage disposition. This completes the assigned source-production fragment; independent semantic review, later layers and runtime/import/publication remain separate principal obligations.

## Deliverable files

All files are under `/workspace/scratch/2b46fb541868/genesis-s1/producers/a`.

- [artifacts.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/artifacts.json): common transport fragment, 17 stable keys, exact body bindings, source references, authority, limits, producer/recipe references and empty L1 build dependencies.
- [coverage.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/coverage.json): every assigned entry, original blob, family, kind, depth, reason, read status, need and proposed artifact key.
- [family-disposition.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/family-disposition.json): all 33 inventory families and their explicit unread substantive leaves.
- [capture-manifest.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/capture-manifest.json): exact paths, commit, Git blob, SHA-256 and byte count for all 102 captures stored unmodified under `sources/`.
- [review-evidence-compact.md](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/review-evidence-compact.md): 83 exact decisive excerpts, 64,155 bytes, with the artifact-to-excerpt map.
- [review-evidence.md](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/review-evidence.md): complete cited-anchor archive, 193 exact spans, 644,755 bytes.
- [excerpt-map.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/excerpt-map.json): body/excerpt/source bindings for both projections.
- [request.txt](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/request.txt) and [request-steering.txt](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/request-steering.txt): original task and task-relevant principal steering, preserved separately.
- [recipe.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/recipe.json): source pin, protocol identity, public criteria and request bindings.
- [capture-errors.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/capture-errors.json): three observed connector 404s from guessed paths and their honest dispositions, plus local bookkeeping retries.
- [verification.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/verification.json) and [checksums.json](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/checksums.json): actual structural verification results and final file hashes.
- [response.md](sandbox:/workspace/scratch/2b46fb541868/genesis-s1/producers/a/response.md): this visible producer delivery summary.

`work/` contains reproducible capture, authoring, classification and evidence-generation bookkeeping. It is intermediate material; the deliverable bodies, manifests, evidence and source bytes above are the review payload.

## L1 bodies

Every stable key begins `s1.core.`; every body is L1.

| Key suffix | Exact body path | Main factual boundary |
| --- | --- | --- |
| `entry` | `bodies/entry.md` | Core authority, package entry and complete family disposition |
| `session-admission` | `bodies/session-admission.md` | Session identity, durable inbox, retry equivalence and promotion |
| `session-execution` | `bodies/session-execution.md` | Process-local ownership, provider turns, continuation and interruption |
| `persistence` | `bodies/persistence.md` | SQLite, migrations, event projection/replay and seals |
| `context` | `bodies/context.md` | Source observation, context epochs, selected history and compaction |
| `tools` | `bodies/tools.md` | Canonical tools, captured registration, settlement and retention |
| `security` | `bodies/security.md` | Permission surfaces, conditional confinement and secret storage |
| `configuration` | `bodies/configuration.md` | Precedence, project trust and Location lifetime |
| `project` | `bodies/project.md` | Project identity, physical paths and retained checkpoints |
| `extensions` | `bodies/extensions.md` | Plugin, integration, MCP and skill lifetimes |
| `capability` | `bodies/capability.md` | Issued invocation identity, persisted policy checks and commits |
| `automation` | `bodies/automation.md` | Actions admission, scheduled dispatch and Board decisions |
| `research` | `bodies/research.md` | Pinned toolkit acquisition/readiness and retained research evidence |
| `runtime` | `bodies/runtime.md` | Host composition, process/PTY and infrastructure services |
| `models` | `bodies/models.md` | Catalog availability versus current native Session adapter support |
| `economy` | `bodies/economy.md` | Durable reservations, terminal evidence, usage and semantic outcomes |
| `boundaries` | `bodies/boundaries.md` | Core Atlas/Relay adapters, workspace movement and RAG schema |

## Actual source coverage

The assigned population contains 814 Core source entries, 584 test entries and 43 other entries. The capture set includes 101 assigned entries plus root `AGENTS.md`. The coverage ledger marks 94 assigned entries as decisive source reads used by bodies, seven as captured orientation evidence, and 1,340 as not individually read. Those unread entries retain their family and justified depth; substantive leaves are explicitly flagged for deeper reading before leaf-specific claims or changes.

The 102 named captures are enumerated in `capture-manifest.json`; the set includes Session facade/input/coordinator/runner/storage/projectors/context, database and event machinery, tool/permission/sandbox/credential implementations, config/trust/Location/project infrastructure, plugin/MCP/integration/skill and agent state, capability invocation/policy/registration, Actions/scheduler/Board, toolkits/research, host/process/Omni/PTY/LSP/format/update/telemetry, catalog/model/AISDK, economy and Core Atlas/Relay/control-plane/RAG adapters. Relevant root/tool instructions, current guides and specs are captured alongside implementation.

## Preserved conflicts and unresolved limits

- The older Session spec says Bash is not sandboxed; current code applies conditional confinement with explicit permitted fallback. The body preserves both sources and avoids a universal sandbox claim.
- The older read description permits broad base64 binary content; the current leaf supports selected image types and explicitly refuses other binary/document formats.
- The request-usage material describes one-request Deny behavior; current permission rejection also rejects other pending permissions in the same Session.
- Session execution coordination is process-local. Event replay ownership and scheduler dispatch leases do not establish clustered model execution or post-crash provider continuation.
- A scheduled `started` receipt establishes durable prompt admission. The scheduler explicitly retains a revocation-to-admission race; it is not a completion receipt.
- Actions preserves ambiguous external outcomes. A timeout/abort is not proof that a remote mutation did not execute.
- Native Session model support is narrower than the full catalog and dynamic SDK plugin surface.
- Session movement can fail after destination file changes and the location event. The inspected legacy move adapter does not itself coordinate an active runner.
- PTY replay retention does not solve the documented slow WebSocket-client memory limit. Process bounds depend on caller options and backend support.
- Research warm-up can convert a planning failure to an empty shard list. A no-work warm-up cannot establish complete index coverage.
- Runtime qualification, individual unread leaf semantics, vendor/engine implementation details, and historical document reconciliation beyond the cited conflicts remain explicit limits. Product economy code is not a usage receipt for this conversation; tokens, physical model attempts and billing remain **UNKNOWN**.

## What was verified

Performed deterministic checks of every captured byte count, SHA-256 and canonical Git blob hash; compared captured assigned blobs against the frozen population; reconciled exactly 1,441 unique coverage rows; checked artifact scope/layer/needs, body hashes, source pins and empty L1 build dependencies; checked every cited line span and every exact evidence slice; and bound the preserved request, steering, recipe and response.

No Orchestra product test, provider call, tool invocation through product code, database migration, external mutation, remote write, Atlas import or publication was performed. Local Python only processed evidence and produced the transport files. Structural verification is separate from semantic acceptance. No judge, review receipt or runtime result was fabricated.

## Stable hashes

| Item | SHA-256 |
| --- | --- |
| Frozen assigned `population.json` | `6945f5adecc4ba749df0af7eebe00aee24f344daaa47874ed703b7bb571aa0ba` |
| `coverage.json` | `7eeb9775351e5e85021c4bb584cd8833cf9bb36326c87827077cb2033bde7337` |
| `capture-manifest.json` | `2004c9856c8f13281261a77a3cb4269fb9c8d6ff7b58656773d6f9438e50d188` |
| Compact evidence | `1d28ad12ce7c525d230e42486b6bccd691104d5e6acd4a815728dda7b8ed8676` |
| Full cited-anchor archive | `1fe966ab3868ab0dc12695f7d6e3e3c332ebf8648620f5dc5f226be2f2f01885` |
| Sorted body-binding set | `ab2bb9d000464f0b3ed18bc4816f61664464d078fe0376ab3ce98cbc21177fea` |

The body-binding set hashes UTF-8 lines `key<TAB>body_sha256<LF>` sorted by key. Individual body and source hashes are in the corresponding manifests; final transport/provenance file hashes are in `checksums.json`.
