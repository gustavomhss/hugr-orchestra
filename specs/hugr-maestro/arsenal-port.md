# Maestro Arsenal port contract

Source: TechLead `a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5`.
Host baseline: Orchestra `628f72404baaf1cd3f5adedf497e830e176503d9`.

## Ownership and adaptations

Maestro owns architectural/scope judgments and integration. Normal work remains lightweight; governed work retains existing durable admission, grounded context, validation, approval and authorization. This port supplies capabilities on demand, not a mandatory wave ceremony or a completed specialist-team design.

- `packages/maestro-arsenal` owns reusable computation and explicitly scoped acquisition. Runtime must not import the external TechLead checkout, user-global skills, Claude settings or Python hook executables.
- Orchestra owns tool permissions, project placement, model selection, output storage, durable Session evidence and actual tool interception. Arsenal advice cannot grant authority or certify execution.
- Atlas owns verified static Own facts, source identities, completeness and receipts. Repository maps and Composer results cannot replace grounded context.
- Composer owns FastAPI catalog discovery and generation through existing `hugr-*` tools. Maestro loads detailed usage guidance only when relevant. Its subprocess stays lazy; context/output pressure uses existing Orchestra mechanisms.
- Operation state stays outside the repository, under a caller-provided project-isolated data directory. No `.techlead` marker tree, redundant context assembler, hidden global hook installation or unconditional transcript/audit injection.

## Complete capability register

The live source registry, rather than historical documentation counts, is authoritative. Each callable retains an explicit descriptor, input contract, effects and verification evidence.

| Source callable | Maestro capability |
| --- | --- |
| anchor-gen | exact shared-surface briefing |
| brief-usage-check | reject over-specified compiler/Plan briefs |
| conflict-map | write conflicts and read dependencies |
| context-packer | bounded structured dispatch briefs |
| contract-freezer | canonical declared-surface drift binding |
| decompose | acquisition plus compiler-verified decomposition |
| enrich-plan | attach accountable dispatch metadata |
| move-in | scoped repository reconnaissance with explicit coverage |
| plan-check | acceptance ownership and partition validation |
| plan-compiler | pure symbol/partition/edge Plan assembly |
| plan-to-barrel | source generation, not an automatic merge |
| plan-to-briefs | per-slice dispatch packets |
| plan-to-dag | dependency layers and cycle detection |
| plan-to-gates | declarative completion checks, not shell-policy authority |
| plan-to-policy | proposed scoped permission resources |
| profile | explicit project governance preferences |
| relay-arm | arm completion contracts the host evaluates on its Relay arm; request an owner release |
| repo-hygiene-check | acquire Git/filesystem facts and report unknowns |
| repo-mapper | bounded path/size reconnaissance |
| seam-checker | compare declared signatures without claiming AST acquisition |
| sliceability | graph-based decomposition advice |
| stub-gen | return scaffold text without silently writing it |
| symbol-flow-check | actual compiler evidence for cross-slice flows |
| wave-ledger | bounded project-scoped outcome evidence |
| wave-scheduler | replay-pure readiness/integration advice |

Retired source names (`wp-sizer`, `context-budget`, `model-router`, `wp-dod-check`, `target-locator`) map to doctrine, actual provider metadata, verification or existing search. They are not resurrected as empty wrappers. Planned/deferred source claims are not described as delivered capabilities.

## Boundary contract

Public library seam (lead-owned): `Arsenal.list()` resolves bounded descriptors; `Arsenal.describe(name)` resolves one exact descriptor; `Arsenal.execute(name, args, context)` returns the canonical result. `ArsenalContext` contains `directory`, `stateDirectory`, `projectID`, and asynchronous `authorize({ effect, paths, commands })`; effects are `read`, `write`, or `process`. The host supplies these values, not model prose. Registered operations additionally declare their effects; pure operations need no side-effect permission. Catalog loading and selected execution use lazy handler imports.

Native names are `maestro_arsenal_catalog`, `maestro_arsenal_describe`, and `maestro_arsenal_execute`. Catalog/describe make exact schemas available progressively; execute rejects unspecified/invalid inputs before invoking the selected operation. The standalone MCP seam exposes those same registered capabilities through the same library and explicit project root. Documentation calls advisory results advice, not execution receipts.

Native discovery is progressive: catalog returns bounded capability metadata; describe returns the selected input schema/effects; execution validates that exact schema and applies host permissions. MCP exposes the same operations without a second implementation. Invalid input, failed acquisition, unreadable state, compiler launch failure and partial repository coverage have named outcomes; none become a successful empty report.

Pure handlers cannot dispatch workers, merge Git, execute generated check commands or mint approval. Filesystem/process operations must be declared and restricted to the actual project/scratch/data roots. Write operations request native edit authority. Generated gates/policies are proposals until the host binds and executes them.

Source fail-open cases must be closed: numeric/schema constraints, unspecified acquisition, missing compiler diagnostics, Git failure, ledger read errors and partial map extraction. Empty scheduler input may mean an empty completed wave only when explicitly supplied and structurally valid.

## Doctrine and enforcement register

Adapt `techlead` charter, decompose/acceptance, contract/seam, pack/context, verify/evidence, loop/recovery and repository-maintenance procedures into on-demand Maestro skills. Preserve accountable contracts, independent review, measured verification and honest outcomes; remove model-brand budgets, Claude-only hook protocols, automatic human approval ceremonies and unconditional fleet requirements.

Runtime capabilities include gate-bypass prevention, destructive-operation checks, secret-output protection, transcript/context bounds, repository hygiene, instruction/config self-modification protection, dispatch/completion evidence and scoped write policy. Each must be verified at actual native execution boundaries, including custom/MCP tools and applicable V2 paths; plugin presence alone is not proof of coverage.

Governance capabilities include audit/outcome provenance, actual usage/pricing, explicit spend estimates, status views, scoped verification, acceptance evidence, repository change/release checks and safe recovery. Reuse existing Session events, permissions, output stores and selective restore. Never port whole-repository `reset --hard`/`clean -fd` as atomic rollback or reinterpret skipped/missing checks as passing.

Audit source adaptation (`governance/audit-trail.py`) uses existing global EventV2 durable persistence owner for local row-linked seals, not replay identity checks as a historical integrity proof. Orchestra `ArsenalObservations.read` freezes trusted optional `auditWindow: Omit<EventV2.SealWindowInput,"aggregateID">`, checks actual SessionStore project/Location before and after reads, derives aggregate only from that Session, and invokes real Core `verifySealWindow`. Default interval ends at actual Session high-water and spans at most 2,048 rows, across all event types. Native audit/status attach host-only `{projectID,sessionID,window}` integrity even with empty observations, or typed acquisition `UNKNOWN/HOLD` diagnostics with no fabricated window. Model-selected integrity, project, Session, aggregate and window are denied.

Integrity is explicitly `event-window-only` with `observationsVerified:false`; the observation digest remains digest-only and usage coverage is independent. Out-of-window actions and stored predecessor bodies are not certified. UNKNOWN/BROKEN/legacy/compaction/missing rows/overflow never imply PASS or complete history. No additional event type, table, transcript log, per-tool hook or public HttpApi is introduced. Proof: `packages/orchestra/test/maestro/arsenal-integrity.test.ts` and `arsenal-integrity-report.test.ts` exercise actual Session events, durable Progress and settlements, SQL edits, placement denial, history/byte/row bounds, honest action-window coverage and model-source rejection. Removing before/after placement checks or sourcing integrity from model observations makes the corresponding tests fail. Seals are local tamper evidence, not original-remote attestation, external notarization or protection against coherent database/chain replacement.

## Completion on the Relay arm

Relay's arm is the one completion evaluator; this package has none. `relay-arm` only stores a validated contract (`arm`, `read`) and returns a release request (`release`). Orchestra's `ArsenalCompletion` host does the rest:

- **Dispatch.** The native binding resolves the latest `completion-arm` fact of the dispatching session by the actual Task call, child, agent and plan authority, never from model text. The host loads the contract under the state-file rules (identity, no symlink, at most 512 KiB, stable while read, strict schema, project and session match, ≤1000 unique checks), refuses an unbound check, reads HEAD with the sandboxed git, then PUTs the Relay arm under the same token at `<data>/relay/<projectID>/arms/<token>/`: gate → work package, check → `host_check` control, `label` → `brief`, `retryBudget` → `retry_budget` (default 3), the contract's sha256 as `meta.contract_sha256`, and the dispatching session as `agent_id`, so every retry evaluates the same arm. A different body under the token is `completion-contract-drift`. A parked arm HOLDs before any worker starts.
- **Completion.** After a finished worker, one `all-gates` evaluation grades every remaining gate in order under the arm's run lock. Checks run one at a time through the registered callbacks (60 s each; a failure is `acquisition-error`), accepted checks of earlier gates are re-run as regressions, and the revision guard binds them to one HEAD (`completion-revision-drift` when it moves). Each gate's results reach the native observation before that gate's disposition is recorded. Only a complete arm whose keyed ledger audits PASS (`relay verify`) passes; the receipt stays single-use and bound to the task.
- **Budget and release** (Maestro conditions, 2026-10-06). The budget counts per gate; `retryBudget: 0` parks on the first failure. A spent budget parks the arm with `completion-parked-awaiting-owner`, the failing checks and the instruction not to dispatch again. Maestro may request a release with `relay-arm` `release`; the host checks the token was armed in that session and asks the owner through a native approval that no permission rule answers. Approving resets that gate's budget only (`human-release` in the ledger); rejecting leaves the arm parked. No other path releases an Arsenal arm.
- **Spent arms.** An arm that passed every gate verifies no new work (`completion-evaluation-acquisition`); a new task needs a new contract.

Every HOLD keeps its reason code verbatim; `completion-parked-awaiting-owner` is the one new code. Proof: `packages/orchestra/test/maestro/arsenal-completion.test.ts`, `arsenal-relay-arm.test.ts` (each condition through the native Task tool) and `arsenal-one-evaluator.test.ts` (the removed evaluator stays removed).

## Composer literacy

Use available Composer tools for FastAPI infrastructure reuse: narrow `hugr-search`, inspect exact `hugr-describe`, then selected `hugr-compose`/`hugr-scaffold` when appropriate. Understand delegation/skeleton modes and generated-code validation. Honor existing edit/path permissions; writes never reconnect/retry automatically. Backend failure envelopes must be treated as failures. Catalog breadcrumbs naming unexposed tools are pointers, not callable capabilities.

Keep a short relevance rule in Maestro orientation and detailed guidance in one demand-loaded skill. Do not inject full catalogs, repeated generated source or unchanged tool results into every turn.

## Completion evidence

Completion requires a source-to-target register with every capability resolved, actual tools/schema/transport conformance, real filesystem/compiler failure controls, side-effect prevention on denied operations, bounded output/state and project isolation, Composer activation/coexistence checks, independent cold reviews and repository hygiene. Tests must measure the implementation; absent/skipped/unknown results remain distinct from passing results. CI for PR #238 is tracked separately on its exact head.
