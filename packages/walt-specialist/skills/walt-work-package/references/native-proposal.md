# Native Relay proposal reference

Schema source pin supplied by Relay: `c0fcf4f394`; inspected transfer baseline: `abf7a72c77fcaeee1206400a8270b2581ae9839c`, [packages/schema/src/relay-sprint.ts](../../../../schema/src/relay-sprint.ts). Exports include `RelaySprint.Sprint`, `WorkPackage` and `Control`. No schema-version field exists; `gen` stamps ledger generation, not author proposal version, proposal identity or approval.

## Author the native shape

Map global context/criteria/coverage and source refs to `brief`; ordered step contracts to `work_packages`; each step's objective, exact read/write scope, inputs, outputs, inherited criteria/deltas, interface anchors and oracle references to `title`/`instructions`; proposed runtime controls to `checklist`. Keep one complete versioned artifact for host, not only the visible step or a diff. A macro groups context, not a second executor. WP/control IDs are nonempty and NUL-free; `host_check` has identifier syntax but that cannot prove registration or authorization.

Use [decomposition](../../walt-plan/references/decomposition.md) for acceptance ownership/five exact headings, [contracts](../../walt-plan/references/load-bearing-contracts.md) for exact load-bearing sketches, and [briefs](../../walt-plan/references/briefs.md) for bounded materials/returns. These prose contracts belong in native text fields or referenced assigned artifacts, not a second execution DSL. `partitionPlan` is authoring material, not durable governed `PlanRevision`.

Host supplies actual model/budget/placement, acquisition evidence and oracle bindings. Author proposes controls only using that evidence, within actual assignment; unresolved identifiers, commands/cwd, runner availability or coverage remain blockers/`UNKNOWN`. `plan-to-gates` / `plan-to-policy` may generate proposal text under the [frozen authorized subset](../../walt-plan/SKILL.md#authorized-structural-helpers), not register checks, approve or enforce it.

## Structural inspection is a host helper

`Schema.decodeUnknownSync(RelaySprint.Sprint)` structurally decodes an unknown value and may throw a schema error. It does not acquire a file, load/create an arm, execute, dispatch or approve scope.

Frozen pure host API: namespace `UpstreamProposal`, synchronous `inspect(bytes: Uint8Array)` returns `{ schemaIdentifier: "RelaySprint.Sprint", digest, byteLength, sprint }`. It snapshots supplied bytes once, strictly decodes UTF-8 and Effect Schema JSON/native `RelaySprint.Sprint`, and hashes the byte snapshot with SHA-256. `digest` describes original bytes, not decoded/re-encoded JSON. This is a structural host helper contract, **not a callable worker tool** or a claim it is installed in the current checkout. It performs no acquisition, effects, commands, arm creation or normalization/second DSL.

Those return fields are inspection facts, not publication, verified provenance, approval or semantic acceptance. Preserve original UTF-8 artifact bytes for later host materialization; do not round-trip decoded JSON and assume any host binding still covers it. Worker-declared digests/source identities cannot replace host-acquired facts.

## Runtime limits and evidence

Excess metadata is preserved but ignored by runtime. Author version/authorship/oracle metadata may document a proposal but cannot add behavior or authority. `self_check` is not evidence; legacy `dod` commands are ignored by the arm; absent/null/empty `checklist` gives no current controls. `human` is structurally accepted but unsupported for arm evaluation. Runtime-invalid commands/judge scopes or an unregistered `host_check` cannot become semantic PASS through structural decoding.

Classify each obligation as a **live invariant** (must still hold at stated boundaries/after work), **historical evidence** (baseline/red-to-green result tied to that revision), or **local acceptance**. A historical failure or check against a legitimately removed column is not an eternal invariant; historical PASS is not current proof. Name required recheck/witness semantics and source-known oracle refs. Missing host support is a blocker; unknown JSON metadata cannot implement witness persistence, replay or global completion.

Keep the MVP one linear WP, one host-created arm and the same Session/logical task. Host owns reads/reveal, evaluation/transitions, replay/stop/continuation and global completion. No extra product Task per step, new scheduler/DB/model loop, routine human gate at every step or self-reviewed acceptance.

## Materialization handoff

Immutable proposal/materialization and approval envelope remain Relay/W6-owned design pending integration. Immutable bytes/revision, actual acquisition identity, real upstream authorship/provenance and applicable approved scope must be bound by host before execution. Worker metadata, publication or returned paths cannot mint those facts. Prior approval is historical evidence, not authority for changed bytes/scope/context.

Return complete proposal version/parent/path, `walt` author, supplied source/evidence refs, coverage and native-shape limitations, assumptions and blockers/unblock owner. The worker neither publishes/approves nor persists authority, installs tools, dispatches/schedules or creates an arm. Stop at local handoff for host integration/review.
