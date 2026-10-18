# Initial owned tool contracts

Status: proposed qualified backend specialist contracts, 2026-10-04. The existing tool names and producer functions below are real; the stricter input/result behavior and qualification work described here are not implemented by this document.

## Selected initial operations

| Tool | Domain operation and value | Producer / ownership | Consuming skills |
| --- | --- | --- | --- |
| `hugr-compose` | Generate a selected HuGR composition from supplied recipe/primitives, including its actual source and dependency/wiring requirements | Existing HuGR Composer `fastapi_meta_compose`; the backend specialist consumes a qualified interface | `backend-implement`, relevant `backend-api` / `backend-data` / `backend-concurrency` reference |
| `hugr-scaffold` | Generate an explicitly selected FastAPI project profile from supplied models and auth/ownership settings | Existing HuGR Composer `fastapi_meta_scaffold`; the backend specialist consumes a qualified interface | `backend-implement`, `backend-api`, `backend-data`; `backend-check` for assigned generated-app checks |

These reuse HuGR-owned implementation rather than claiming third-party engines as new inventions. Polyglot work also uses the [approved external toolset](tool-distribution.md#approved-initial-default-payload). A generic CLI launcher, file patcher, test runner or new Atlas memory wrapper does not become another owned backend operation merely by renaming it.

The initial contract set is deliberately these concrete operations. Additional producer slices or genuinely new backend specialist algorithms need their own demonstrated operation and contract; neither a returned delegation pointer nor a catalog suggestion adds them automatically.

## Binding shared by both tools

The host supplies the actual working directory/worktree, caller/member context, native authority, cancellation and installed producer/version. The implementation resolves operation paths against that binding and uses native enforcement. Requested `output_dir` is a destination inside the authorized placement, not permission to select another project.

Recipe/profile metadata comes from the installed, qualified producer and supplied references. It describes the selected dependency closure, callable shapes, conventions and effects; callers do not need to rewrite that metadata for every task. The requested selection must fit the assigned application design. Missing material decisions return a blocker; the backend specialist retains local implementation freedom.

For standalone CLI, the real user's directory selection establishes the filesystem target through its adapter. Local MCP uses its configured project binding. Neither invents an Atlas/Session identity. [Integration flow](integration-flow.md) owns the assignment and backend-specialist-memory lifecycle outside these generation operations.

## `hugr-compose`

### Inputs

| Field | Qualified contract |
| --- | --- |
| `output_dir` | Required project output directory; resolve relative paths against bound directory and validate physical destination through existing host mechanisms |
| `recipe_id` | Nonempty exact selected recipe ID, mutually exclusive with `primitives` |
| `primitives` | Nonempty unique selected primitive IDs when no recipe ID is supplied; not a search query |
| `name` | Optional explicit composition name; resolved filename/symbol must remain valid and inside the admitted destination |
| `mount_path` | Optional only when the selected recipe's documented default matches the supplied API contract; otherwise caller/task supplies it |
| `dry_run` | Boolean, default `false` matching current invocation intent; `true` requests source preview with no project writes |
| `force` | Initial qualified path accepts absent/`false` only. `true` returns unsupported replacement before writing; existing user files are edited through the native scoped edit workflow |
| `expected_kind` | Proposed required field: `composition` or `skeleton`. Makes the requested output class explicit; not currently in the bridge/producer schema |

Exactly one selection is required. Current producer's recipe-plus-primitives subset assertion is not the qualified contract: it can expand selection. A supplied recipe ID must retain its exact identity; matching a different template with the same/subset primitive set is not an equivalent operation.

### Operation and outputs

1. Resolve the installed producer and exact supplied selection; verify its qualified callable/dependency metadata and relevant input support.
2. Prepare source using the selected recipe and requested output kind. Validate producer response and output mode before project writes. Existing producer writes too early for some of these checks; qualify a real preparation path rather than performing post-write checks and claiming preflight.
3. For preview, return actual source/artifact references and proposed paths. For generation, create the admitted composition module and any required missing package initializer; preserve existing files.
4. Return actual selected recipe/primitives, generated source kind, observed files, dependency/wiring requirements and tool-local check results.

Publication must use the artifact actually prepared under the bound producer/selection, and revalidate its destination before writing. A second unbound generation call is not proof that the checked preview and written bytes match. Use supported producer/native filesystem mechanisms; do not create a general-purpose parallel edit service.

Expected normal destination is `app/compositions/<resolved-name>.py`, plus missing package initializer where needed. The tool does not silently copy an arbitrary primitive catalog, alter `app/main.py`, implement missing business methods or install application dependencies. Such assigned work remains explicit in the surrounding implementation.

`adapter_reuse` is a producer mode, not proof of valid imports/calls. `recipe_template` and `ad_hoc` are skeletons, not completed compositions. `tool_delegate` produces an advisory pointer, not generated code: return a blocked result identifying the required separate operation, without invoking it or searching for a substitute. An unexpected output kind is never a successful composition.

Syntax-only validation is reported as syntax-only. Generated code and its dependency references do not establish that the application's business behavior has been tested.

## `hugr-scaffold`

### Inputs

| Field | Qualified contract |
| --- | --- |
| `output_dir` | Required destination for a new scaffold; initial write path requires absent or empty target directory and native write authority |
| `name` | Required explicit project name supported by selected producer; no silent fallback to unrelated application identity |
| `profile` | Required selected `minimal`, `api`, `full` or `worker`, supported by the installed qualified producer; no implicit `full` selection |
| `models` | Required explicit model-to-field-type map; `{}` deliberately requests no business models. Shorthand covers only its documented, qualified subset |
| `owner_models` | Optional explicit owner mapping, default `{}`; keys and ownership semantics must match supplied models/policy |
| `shared_models` | Optional unique names, default `[]`; validate producer's ownership relationship rather than silently accepting unknown models |
| `with_auth` | Required explicit boolean matching the supplied application choice; not a request for the backend specialist to choose an auth architecture |
| `dry_run` | Proposed boolean, default `false`; preview support must be implemented/qualified before advertising it. Current scaffold bridge/producer has no such parameter |

Unknown field types or unsupported model semantics are rejected, not silently converted to strings. Documented template defaults—IDs, timestamps, constraints, relationships and generated dependency ranges—must be visible in the selected profile. They are not a substitute for the application's contract. A requirement not representable by the supported shorthand needs a different assigned implementation path, not guessed schema semantics.

### Operation and outputs

1. Bind the selected profile, model/auth inputs, producer revision and declared output/effect set; reject unsupported combinations before modifying the project.
2. Prepare the selected scaffold. Preview can use existing host-managed temporary/artifact facilities after the producer's actual effect boundaries are qualified. It must not write into the assigned project, caller CWD or unrelated directories.
3. Generate the admitted backend tree into the fresh target. Every model, route, config, migration and sidecar produced is accounted for; no automatic unrequested entity such as `OrderItem`.
4. Return the actual file inventory, generated conventions/dependencies, incomplete implementation items and observed local checks.

Profiles may have different file/process effects. A deployment/SBOM phase, subprocess, migration execution, package installation or live service action is not authorized merely because profile is called `full`. Only the qualified generation effects covered by the assignment/native grants may occur; unsupported effects return a precise blocker. Writing a migration file does not apply it to a database.

The initial owned operation creates a new scaffold; extending or merging into a populated application remains separate assigned code work. This avoids disguising unconditional generator overwrites as an ordinary safe merge.

## Shared result semantics

This is a compact result contract for these operations, not a new execution or persistence protocol.

| Field | Meaning |
| --- | --- |
| `tool` | Actual owned operation name |
| `status` | `previewed`, `generated`, `blocked`, `failed` or `interrupted` |
| `producer` | Actual installed producer/version and selected recipe/profile identity; preserve raw producer mode where relevant |
| `artifact_kind` | Actual `composition`, `skeleton` or `scaffold` when material exists; never a business-readiness certificate |
| `artifacts` | Recoverable source/bundle references or bounded inline content using existing host output facilities |
| `planned_files` | Proposed paths; not evidence they were written |
| `observed_changes` | Actual created/modified/deleted paths with available artifact references; may include unexpected changes on failure |
| `effects` | `none`, `observed`, `partial` or `unknown`; identify whether the change inventory is complete rather than fabricating an empty list |
| `requirements` | Runtime/dependency/wiring requirements of the generated artifact, distinct from installed generator dependencies |
| `remaining_work` | Concrete incomplete implementation within the generation result, not new scope or executable instructions from producer `next_steps` |
| `checks` | Tool-local checks actually performed and their reach/outcome; omitted/not-run business tests do not become passes |
| `error` | On non-success: named code, useful reason, relevant source/output references and any uncertainty |

`previewed` means an actual preview artifact exists and project effects are absent; temporary producer work remains subject to its real host boundary. `generated` means the requested output class was produced and its project writes observed. Neither means task accepted, app deployed, checks passed or memory saved.

`blocked` is used before project mutation when a prerequisite/selection/permission prevents the operation. If mutation already occurred or effects are uncertain, return failed/interrupted with the observed/unknown effects. Empty producer arrays, skipped phases, malformed payloads or an exit-zero transport are not substitutes for generation evidence.

First-version writes are create-only. Existing target content yields a conflict, including on attempted retries; there is no invented no-op/idempotency guarantee. Preserve this at the actual create operation: a preflight existence check followed by unconditional overwrite is insufficient if another writer creates the file between them. Multi-file generation is not promised atomic. Cancellation, transport timeout or process failure can leave partial effects; preserve actual evidence and do not automatically replay mutating calls. Reconcile existing artifacts inside the assigned scope before another operation.

### Named non-success cases

- `INVALID_INPUT`: malformed/mutually conflicting selection, invalid model reference or unsupported argument.
- `CAPABILITY_UNAVAILABLE`: missing installed producer, incompatible qualified contract or unavailable preview/profile support.
- `SELECTION_UNAVAILABLE`: named recipe/primitive is absent or does not match the supplied qualified version; no catalog-discovery fallback.
- `UNSUPPORTED_OUTPUT`: required composition would become a skeleton/delegation, or model/profile semantics cannot represent the supplied request.
- `OUTPUT_CONFLICT`: destination conflicts with create-only behavior.
- `PERMISSION_DENIED`: actual native decision rejects requested effects; no model-supplied approval field can override it.
- `PRODUCER_FAILED` / `INVALID_PRODUCER_RESULT`: producer reports failure, violates output/effect contract or returns an uninterpretable result.
- `CANCELLED` / `TIMEOUT`: execution interrupted; known writes and uncertainty retained.

These names describe proposed canonical outcomes. Native host errors remain authoritative and are preserved rather than replaced with a success-looking tool title.

## Native, CLI and MCP mapping

| Surface | Proposed mapping |
| --- | --- |
| Native | Preserve `hugr-compose` and `hugr-scaffold` identities through one qualified producer binding; avoid duplicate registration with the existing Composer plugin |
| CLI | `hugr-backend compose --input <request.json> --json` and `hugr-backend scaffold --input <request.json> --json`; project root from real launch binding |
| MCP | Same operation names and canonical input/result semantics; producer/tool failures are error results, with the structured outcome retained |

CLI success is reserved for `previewed`/`generated`; other outcomes use non-success exit and retain machine-readable result plus actual terminal reason. MCP uses structured content where supported, preserving `isError` for non-success. Native V1 supports string or `{ output, metadata, attachments }`, not an invented top-level `status` property: successful results encode the canonical envelope; failure must settle through the real host failure path while keeping its effects/evidence recoverable. The implementation must exercise this mapping rather than return failed JSON as native success.

Transport adapters parse/bind/encode; they do not contain separate generation implementations. Unknown request fields, especially asserted identity/permission fields, do not acquire meaning or authority. Interface additions (`expected_kind`, scaffold preview, stricter required fields) require an explicit qualified-version binding; do not silently pass unsupported keys to the legacy producer or claim the current bridge already implements them.

## Atlas memory and Maestro handoff

Maestro/caller supplies the task; native binding resolves identity and permissions; Atlas provides assigned context and the backend specialist's own memory. These tools perform only their declared code-generation operation.

The backend specialist/native integration maps meaningful generation attempts to Atlas's exact `task` fields: `attempted`, `failedWith`, `stoppedAt`, `lesson` and `ref`, under the real `taskId`. PR experience uses the separate `pr` template. Its `project` rules are the always-injected bounded Memory slab; `logbook` belongs to the orchestrator. Awareness/Orientation are derived header data, not extra written memory kinds.

Use existing `atlas-memory-emit` and recall/header capabilities through the native binding. Writes submit an entry: Atlas derives kind and binds owner, so a tool result cannot choose an owner or its own validation gate. No extra checkpoint fields, parallel store or self-approved rule. [Exact templates and implementation limits](atlas-memory-contract.md), [complete lifecycle](integration-flow.md#the-backend-specialist-has-its-own-memory-in-atlas).

Task handoff reports generation outcome, later implementation/check evidence and Atlas read/write outcome separately. A memory failure does not erase a successful code change or trigger another generation attempt; a generated skeleton cannot be remembered as a completed feature.

## Required qualification before runtime advertisement

These are proposed future checks; none ran during contract drafting.

| Case | Required observation |
| --- | --- |
| Exact selected composition | Real installed producer retains recipe/primitive identity; generated artifact uses correct actual callable/dependency shape |
| Skeleton / delegation | Requested skeleton is labeled as such; skeleton/delegate cannot satisfy requested composition; no automatic extra tool or discovery call |
| Valid scaffold | Explicit profile/models/auth produce accounted-for expected tree; generated app import/wiring and assigned behavior cases exercise the actual output |
| Invalid/unsupported model | Unknown type, unrequested entity or unsupported semantic shape is rejected instead of fallback generation |
| Preview and destination | Project remains unchanged; CWD outside output and sibling/symlink sentinels expose escaping writes; allowed destination also has a successful control |
| Existing content / force | User content preserved; replace request or nonempty scaffold destination conflicts before writes; a file appearing after preflight is not overwritten |
| Partial failure / cancellation | Known effects retained; missing observation stays unknown; no automatic second mutating call |
| False producer success | `ok:false`, MCP error, failed phase, missing expected artifact, incomplete inventory and malformed response cannot yield generated success |
| Native / CLI / MCP | Same bound request preserves selection, artifact meaning and terminal/effect semantics through actual adapters, including failure settlement |
| Memory and role | Relevant progress uses actual bound backend specialist memory; no fabricated actor/receipt, task acceptance, catalog exploration or delegated action |

Implementation work stays narrow: qualify producer identity/mode/callable/effect behavior, preserve structured failures and actual files, add the supported preview/input paths, then exercise the real distributed producer through its adapters. It does not require rebuilding Atlas, permissions, persistence, the task runner or generic editing.

## Source basis

- Orchestra baseline `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`: `packages/orchestra/src/plugin/hugr-composer/tools.ts`, `client.ts`, `packages/plugin/src/tool.ts`, native `packages/orchestra/src/tool/edit.ts`.
- Composer HEAD rechecked as `df04cf8f9c9c4307d22b6447d513b05b94c08572`; selected working-tree sources re-read: `mcp_tools/compose.py:473–675`, `mcp_tools/tier1.py:442–506`, `generators/database/model.py`.
- [R38](research/38-python-composer.md) records the output modes, adapter mismatch, overwrite/CWD paths, partial reports and distinction between kit audit and emitted-app validation. Those source observations motivate qualification requirements, not claims that the new contract already runs.
