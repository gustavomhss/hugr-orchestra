# Maestro planning-authorship transfer handoff

Status: documentation handoff on branch `upstream-docs`. Original worktree/live-prompt and playbook-anchor
baseline remains `abf7a72c77fcaeee1206400a8270b2581ae9839c`. Core/V1 authoring bindings and structural
inspection are now implemented in unlanded candidate `ff3b57d4a6323a150949072d06ad379f666a65af`; V2
application binding, W6 immutable publication/provenance/approved scope and real qualification remain
pending. The replacements below are **not installed**. The neighboring Maestro/runtime owner owns the
live prompt and playbooks; this slice changes only TEAM, the class map and this handoff.

## Frozen ownership and implementation status

- Stable native ID: `walt`; profile projection: `upstream`; assignment through existing `task` with
  `subagent_type: "walt"`. Presentation comes from `UPSTREAM_DEFAULT_LABEL`, config `agent.walt.name`,
  overridden by `HUGR_UPSTREAM_NAME`. Use role/ID, never a literal default label. [S2, S4, S13]
- Native registration, central name resolution, packaged assets/skills and the strict `upstream-result`
  card with `upstream-work-result-v1` host projection are implemented and reviewed in the candidate. This
  is not landing, deployment, a live pilot or domain qualification. Paths in a card remain worker claims;
  host-observed message authorship is not immutable artifact acquisition/publication or adoption. [S3, S5]
- Core/V1 restricted native Arsenal authoring bindings and `UpstreamProposal.inspect(bytes: Uint8Array)`
  are implemented in unlanded candidate `ff3b57d4a6323a150949072d06ad379f666a65af`. Actual V2 application
  binding remains pending; neither candidate implementation nor this prose establishes deployed exposure.
  The existing tool IDs stay
  `maestro_arsenal_catalog`, `maestro_arsenal_describe`, `maestro_arsenal_execute`; host attestation must
  identify actual native `walt`, never forge `nativeMaestro`. [S1, S16]
- The frozen pure authoring subset is `anchor-gen`, `conflict-map`, `context-packer`, `contract-freezer`,
  `enrich-plan`, `plan-check`, `plan-compiler`, `plan-to-briefs`, `plan-to-dag`, `plan-to-gates`,
  `plan-to-policy`, `seam-checker`, `sliceability`. Catalog filters before pagination; describe/execute
  enforce the same surface and current access. Missing operations/non-pure drift are named failures.
  No acquisition, scaffolding, governance, approval, dispatch or workflow execution grant follows. [S1, S2]
- Structural inspection targets native `RelaySprint.Sprint`, snapshots supplied bytes, strictly decodes
  UTF-8 and native schema JSON, and returns `schemaIdentifier`, SHA-256 `digest`, `byteLength`, `sprint`.
  It neither acquires a file nor executes, arms, approves, normalizes or publishes a proposal. Unknown
  metadata is not authority; `gen` is ledger generation, not schema version. Empty checklists, accepted
  `human` kind and runtime-invalid commands do not imply semantic PASS. [S1, S9, S16]
- W6 immutable publication/revision, actual upstream provenance, acquisition identity and applicable
  native approved-scope binding remain mandatory pending integration. Approval must cover the materialized
  revision and scope; edits produce new proposals. Progressive execution/replay/stop/completion remains
  Relay/W6-owned. No second workflow schema, planner, approval envelope or execution engine is introduced.
  [S1–S3]

`walt` authors product, architecture, specification, acceptance proposals, decomposition, Tasks/WPs,
roadmaps, briefs and revisions within Maestro's assignment. Maestro organizes and decides within owner
authority, discovers and supplies host facts, routes review, adopts current work, binds placement and
permissions, dispatches and integrates. Maestro requests upstream revisions for plan gaps; it does not
write a substitute plan. The architecture-only reviewer is retired, not absorbed into upstream. General
code review considers architectural consequences as part of the whole deliverable. Backend ownership,
charter, toolkit and Atlas boundary stay with `backend`; runtime Atlas Memory supports only that member.
Documentation/charter lists do not enforce semantic behavior. [S1, S2, S4, S10]

## Normal versus governed work

| Boundary | Normal work | Explicit governed work |
| --- | --- | --- |
| Authoring | Bounded assignment to `walt`; small Task planning can remain inline and lightweight. | Upstream still authors content; the proposal cannot mint a governed record or authority. |
| Work unit | Existing Task identity, format and lifecycle; no compulsory WP, compiler, arm or steps. A WP step is not a Task. | Existing governed work-card headings and lifecycle requirements apply only where genuinely requested. Progressive steps introduce no per-step human approval ceremony. |
| Context and evidence | Maestro supplies observed facts and checks; upstream distinguishes proposals/estimates from observations. | Exact verified catalog territory names and Own unit IDs; admission, immutable `PlanRevision`, current GROUNDED context, validation, cold review and exact direct-owner approval bindings remain required. |
| Dispatch | Available native `task`, actual host permissions/writePaths and existing model policy. | Exact current `authorizationID`; approved `subagent_type`, prompt and model match intent byte-for-byte. One authorization permits one dispatch. IDs/hashes come from tools, never prose. |
| Changed plan or scope | Return evidence to `walt` for revision, then review/adopt the current proposal. | New revision/context/validation/review/approval/authorization as the existing lifecycle requires; no inherited approval for changed fields or scope. |

The current `PlanRevision` field schema accepts only `stakeholder | maestro | orientation` in both the
tool and durable event. These denote owner statements, Maestro proposals and observations in the current
governed playbook; none denotes an upstream-authored proposal. **Do not send `source: "upstream"` to the
current tool, or relabel upstream authorship as one of the supported values.** Recording is host-owned;
Maestro calling the persistence tool does not make it the content author. Adoption of upstream-authored
fields through that boundary is blocked until the host/schema owner provides truthful provenance support.
Normal proposal authoring does not need a fabricated `PlanRevision`. [S6, S7, S8]

This handoff grants no insertion of an ordinary authoring Task into the active governed chain, no clean-tree
bypass, no synthetic owner approval, and no governed fallback that silently becomes normal execution.
Before any authoring assignment or revision, Maestro inspects existing arm/completion bindings and governed
state through available actual host inspection. Authoring precedes execution arming. The current native
Task dispatch path calls `completion.beforeDispatch` for ordinary and governed calls, with no authoring
exemption; an upstream assignment must not consume or inherit execution gates. If an active binding
prevents authoring, or required state cannot be inspected, report HOLD through the existing owner process.
Do not invent a disarm operation, move to a fresh Session or downgrade governed work to normal. Use only
actual available inspection surfaces; no tool/method name is guessed by this handoff. `beforeDispatch` is
internal dispatch behavior, not a model-callable inspection method. [S8, S15]
The integration must preserve the existing chain and its preconditions. No source-enum/schema change is
made here. The separate baseline conflict between the Maestro prompt's small/direct implementation wording
and its roster's `forbiddenActions: ["product implementation", ...]` remains a runtime-owner issue; these
replacements transfer planning authorship without deciding that unrelated policy conflict. [S2, S4, S8]

## Exact prompt replacements — Maestro/runtime owner

Target: `packages/core/src/agent/prompt/maestro.txt` at the baseline above. Apply the following replacements
by the quoted anchors; retain other prompt text. If an anchor changed, reconcile with its current owner
rather than treating this handoff as permission to overwrite neighboring work.

### Tools: replace the last bullet under `# Tools`

```text
- For large work, `maestro_arsenal_*` offers repository and conflict maps, decomposition, plan checks and wave scheduling. Product, architecture, specification and planning authorship belongs to native `walt`; use your available operations for discovery, host facts and verification of its proposal, not to author a replacement plan. Restricted upstream authoring bindings are available only when the actual host exposes them; their results grant no approval or dispatch authority.
```

### Team: replace the first bullet under `# Your team`

```text
- Keep small or tightly coupled work lightweight. Product definition, architecture, specification, planning, decomposition, Tasks/WPs, roadmaps and execution briefs are authored or revised by native `walt`, subordinate to your assignment; this includes small inline planning requests and introduces no compulsory WP, arm or steps. Before any authoring assignment or revision, inspect existing arm/completion bindings and governed state through available actual host inspection. Authoring precedes execution arming; native Task calls completion.beforeDispatch for ordinary and governed dispatch, with no authoring exemption. A binding that prevents authoring means HOLD through the existing owner process, not inherited execution gates, an ordinary Task inside the active governed chain, invented disarm, a fresh Session or a downgrade to normal. Required inspection unavailable also means HOLD; do not guess inspection tools or methods. Give upstream the owner's request, settled decisions, constraints, current evidence, requested deliverables and exact permitted paths. A missing decision or plan gap returns to `walt`, or through you to the owner when owner input is needed; do not fill it yourself. Delegate implementation when a slice is sizeable and independent, parallel work saves real time or fresh context helps. The `task` tool lists each teammate's role, tools, return and brief shape. Leave `model` unset unless the owner or an instruction file names one. List authorized file targets in `writePaths`; a seat that honors it stays read-only without them.
```

Insert the following bullet immediately after the existing synthesis/review bullet:

```text
- You organize and decide within the owner's authority, coordinate discovery and independent review, adopt the current proposal, bind actual placement and permissions, dispatch and integrate. Upstream may self-check but cannot independently review, approve, dispatch or claim implementation completion. General code review considers architecture as a consequence of the whole deliverable; there is no architecture-only reviewer and that retired mandate does not move to `walt`. Preserve actual upstream authorship. A host computation, structural check or your persistence call does not make you the author. Current `PlanRevision.source` supports only `stakeholder`, `maestro` and `orientation`; do not relabel upstream proposals to fit it. Report the blocked adoption boundary until the host/schema owner supports truthful provenance. Normal inline proposals need no fabricated durable revision.
```

### Units of work: replace the paragraph after the five criterion bullets

```text
A journey (the path a user, a call or a payload takes), an example and a counter-example are optional; add one only when it makes a criterion checkable. Depth follows size and risk. Upstream authors the criteria and planning content; for a small Task they can stay implicit in a lightweight inline proposal, and observed check/report evidence closes the work. A brief carries the criteria it needs, in the shape the `task` tool describes. For an epic or governed work, present the upstream-authored criteria in your reply or brief, not in a repository file unless the owner requested that artifact; the `maestro-decompose` playbook coordinates authoring and review. Tasks retain their current format and lifecycle: no automatic WP, compiler, arm or progressive steps, and a WP step is not a Task. No per-step human approval ceremony is added. Do not call a unit done before its check passed; if no check can run, say so and why.
```

The existing `# Governed work`, permission/refusal/stop rules and owner-only acceptance remain binding.
The replacement playbooks below are operational wrappers; authoring methods go to the existing packaged
`walt-plan` / `walt-work-package` skills, whose wave-2 method owner is separate from this slice. Do not
install new project-skill or memory grants to implement this prose transfer.

## Exact playbook replacement — `maestro-decompose`

Replace `packages/orchestra/playbooks/maestro-decompose/SKILL.md` with:

````markdown
---
name: maestro-decompose
description: Coordinate upstream acceptance coverage, decomposition review and adoption. Use for substantial multi-part work or before deciding whether to dispatch parallel slices; small Tasks stay lightweight.
---

# Maestro Decompose

## Trigger and rationale

Use when a demand spans responsibilities, shared writes or independently deliverable outcomes.
Native `walt` authors acceptance, decomposition, Tasks/WPs, dependencies and revisions. Maestro organizes
and decides within owner authority, supplies observed host facts, coordinates review/adoption, dispatches
and integrates. Missing planning content returns to upstream; Maestro does not invent it. Small Tasks
retain their current format and lifecycle, without compulsory WPs, compiler, arm or progressive steps.

## Inputs

Owner demand and settled decisions; observed baseline; project checks; verified ownership/context facts;
current upstream proposal, if any. Current static `own_*` facts dominate reconnaissance for canonical
units. Follow only explicit Own drill pointers; stale, missing, ambiguous or held Own state is HOLD.
Normal source inspection cannot substitute for governed GROUNDED evidence.

## Procedure

0. Before any authoring assignment or revision, inspect existing arm/completion bindings and governed
   state through available actual host inspection; do not guess tool/method names or assume no binding.
   Authoring precedes execution arming. Native Task calls `completion.beforeDispatch` for ordinary and
   governed dispatch, without an authoring exemption. Do not let authoring consume or inherit execution
   gates. If an active binding prevents authoring or required inspection is unavailable, HOLD through the
   existing owner process. No ordinary Task enters the active governed chain; do not invent disarm,
   fresh-Session escape or downgrade to normal. Repeat this inspection before later authoring revisions.
1. Gather the owner's request and constraints, actual baseline/placement, available checks, permissions
   and relevant read/write facts. Record observations and unknowns, not a newly authored partition.
   Run preserved-behavior baseline checks and capture meaningful failing evidence for new behavior when
   runnable. Separate preservation from red-to-green proof; untestable items remain judged by an
   accountable decision owner, never auto-green.
2. Assign native `walt` to author or revise requested acceptance, five criteria, coverage, bounded units,
   dependencies, conflicts, sizing and briefs. Supply actual facts and exact permitted paths. Small
   planning requests may return inline proposals; drafting them starts no execution Task.
3. Coordinate independent cold coverage critique where warranted using [suite-review.md](suite-review.md).
   Supply demand and acceptance evidence, not a conclusion to confirm. Record unavailable review as
   UNKNOWN. Send missing/vague/overreaching coverage findings to upstream for revision; do not repair
   the plan yourself. Self-checking and structural acceptance are not independent review or completeness.
4. Inspect the current proposal's acceptance owners, writes/reads, dependencies and shared-file handoffs.
   Return orphan acceptance, conflicting writes, cycles, oversized slices or unresolved design forks to
   upstream. Actual readiness/concurrency decisions stay with Maestro inside the adopted constraints;
   changing boundaries or dependencies requires an upstream revision. Load `maestro-contract` for seams.
5. Use available host operations to acquire scoped facts or verify the authored proposal. Upstream uses
   only its actually exposed pure authoring subset. Never forge native identity or assume candidate
   implementation proves current-host exposure; actual V2 application binding remains pending.
   `move-in`, `repo-mapper`, compiler acquisition in `decompose` and `symbol-flow-check` remain under
   existing Maestro/host authority; a host computation does not make Maestro the planner. Do not use
   them to create a substitute partition. Missing acquisition, partial extraction or compiler failure
   is a named failure/UNKNOWN, never empty success; send new evidence back to upstream.
6. Adopt the current proposal after required review under owner instructions, preserving actual author
   and source/baseline evidence. Resolve owner-required choices through the owner and request upstream
   revision. Select actual execution model/budget from host metadata under existing Task policy.
7. Keep `partitionPlan` distinct from work card and durable `PlanRevision`. Explicit governed execution
   retains admission, verified catalog/Own scope, GROUNDED context, validation, cold review, exact direct
   owner approval and authorization before Task. Current PlanRevision provenance cannot represent
   upstream-authored proposals; report that adoption blocker instead of relabeling them. Arsenal results
   record none of that authority. Continue with `maestro-pack` only when the relevant boundary is ready.
   When that governed boundary is supported, present the upstream-authored card with exactly one each
   of `## Completeness Criteria`, `## Success Criteria`, `## Invariants`, `## Quality Standards` and
   `## Definition of Done`, as the existing validation requires. Normal small Tasks gain no such ceremony.

## Exact tool sequence and evidence

Use `maestro_arsenal_catalog` only for narrow discovery when an operation is unknown. Describe each
selected operation for its exact inputSchema/effects before execute. Fill observed/schema-valid inputs;
never guess field names. An unavailable tool is UNKNOWN; ordinary tools may gather normal-flow facts,
but cannot claim the missing operation ran. Host owns placement, permissions and state directory.

Pin baseline with `git rev-parse HEAD` and `git status --short` in the actual worktree. In this repository,
tests run on Actions via `bun run test:ci orchestra <resolved-suite>` from repository root; typecheck is
`bun typecheck` in `packages/orchestra`. Record command, cwd, exit, evidence, baseline and skipped/missing
configurations. Use actual check results, not proposed oracles or an upstream `done` claim.

## Success / fail

Success: current upstream proposal has evidence owners, explicit dependencies/conflicts and observed
baseline; required review/adoption and actual host checks are recorded. FAIL: uncovered acceptance,
unresolved cycles/conflicts or failing checks. HOLD: stale ownership/grounding or unavailable required
authority, including truthful governed provenance. UNKNOWN: missing runner, review, acquisition or tool.
Never convert FAIL/HOLD/UNKNOWN to PASS; return planning findings for upstream revision.

## Output schema

The following is a coordination summary of authored content and observed host facts, not a new workflow DTO:

```text
{mode: normal|governed, baseline: {sha, cwd, evidence},
 acceptance: [{id, demandRef, oracle, baselineStatus, judged, owner}],
 coverageReview: {status, evidence, unresolved}, partitionPlan: artifactPointer|null,
 slices: [{id, writes, reads, ownsItems, hardDeps, contractDeps, model, budgetBasis}],
 conflicts: [{slices, verdict, evidence}], checks: [{operation, status, evidence}],
 decision: sequential|parallel|hybrid|hold, next, unknowns}
```

Retain proposal authorship/version in existing artifact/Session evidence pointers. Do not create a marker
tree. Scheduling the adopted partition is operational; re-slicing its content returns to upstream.
````

## Exact playbook replacement — `maestro-contract`

Replace `packages/orchestra/playbooks/maestro-contract/SKILL.md` with:

````markdown
---
name: maestro-contract
description: Coordinate upstream shared-contract authoring, implementation scaffolds and seam verification. Use when one work unit consumes another or a shared boundary requires coordinated changes.
---

# Maestro Contract

## Trigger and rationale

Use for dependent slices, public schema changes, shared events or migrations crossing ownership.
Independent local edits need no contract ceremony. Upstream authors minimal shared contracts and
revisions under Maestro's assignment. Maestro coordinates decisions within owner authority, review,
adoption, actual implementation placement and seam verification. Workers retain local implementation
choices inside adopted constraints. A declared-surface freeze does not prove behavioral compatibility.

## Inputs

Observed producer/consumer sites and current source identity; current upstream proposal; exact adopted
decisions; acceptance evidence and Own pointers where applicable. Current static `own_*` facts dominate
maps/search; follow explicit drill pointers and HOLD stale Own state.

## Procedure

0. Before any authoring assignment or revision, inspect existing arm/completion bindings and governed
   state through available actual host inspection; do not guess tool/method names or assume no binding.
   Authoring precedes execution arming. Native Task calls `completion.beforeDispatch` for ordinary and
   governed dispatch, without an authoring exemption. Do not let authoring consume or inherit execution
   gates. If an active binding prevents authoring or required inspection is unavailable, HOLD through the
   existing owner process. No ordinary Task enters the active governed chain; do not invent disarm,
   fresh-Session escape or downgrade to normal. Repeat this inspection before later authoring revisions.
1. Supply current boundary facts to native `walt` and request the smallest load-bearing contract: exact
   signatures/types/errors, wire/event or DB/migration shapes, invariants, producer/consumer duties,
   source identities and seam-test oracles. Private algorithms remain implementation-owned. Do not
   create speculative interfaces or fill missing contract decisions yourself.
2. Coordinate required review and owner-required decisions. Return findings and changed source identity
   to upstream for revision. Adopt only the current proposal after required review; self-checks are not review.
3. Inspect upstream's actually available `contract-freezer`, `anchor-gen` and `seam-checker` evidence.
   These pure authoring helpers neither acquire arbitrary AST facts nor approve an interface. If needed,
   use your existing host verification tools against the adopted surface, preserving upstream authorship.
   Completed Core/V1 candidate bindings are not evidence of current-host deployment or actual V2
   application binding. Missing operations cannot be claimed as available or successful.
4. If parallel consumers need source scaffolding, coordinate implementation by the current source owner
   under exact permitted paths. `stub-gen` stays outside upstream's pure subset. Generated text is not
   a write receipt; inspect/apply under actual authority and compile in the actual project. Mark stubs:
   compilation of a stub is not production behavior. This transfers no backend charter or toolkit grant.
5. Coordinate actual compiler and integration tests; use `symbol-flow-check` only under existing host
   acquisition authority with actual diagnostics. Include meaningful negative/error cases; a second
   copy of the implementation is not an independent oracle. General code review considers architectural
   consequences as part of the whole delivery; no architecture-only reviewer or upstream self-approval.
6. Drift returns to upstream for contract revision and consumer impacts, through Maestro to the owner
   for owner-required choices. Coordinate renewed verification. Governed scope/context/approval changes
   retain the native lifecycle; a frozen hash replaces neither PlanRevision nor GROUNDED context, exact
   direct-owner approval or Task authorization. Preserve truthful provenance; do not relabel upstream
   fields to fit the current PlanRevision source enum.

## Exact tool sequence and checks

Catalog only for narrow discovery when needed. Describe each selected operation's exact inputSchema/effects
before execute. Host owns permissions/placement; unavailable tools or acquisition stay UNKNOWN.
Compare the actual adopted shared/consumer paths with `git diff -- <shared-path> <consumer-path>`.
Resolve paths/suites before execution: `bun typecheck` in `packages/orchestra`; tests run on Actions via
`bun run test:ci orchestra <resolved-seam-suite>` from repository root. For public Protocol/Server HttpApi
changes run `bun run generate` in `packages/client`, never edit generated client source. Regenerate the
legacy JS SDK with `./packages/sdk/js/script/build.ts` from repository root when the change requires it.

## Success / fail

Success: current adopted contract binds the minimal seam, real consumers compile and real tests verify
behavior; stubs are identified/replaced before production completion. FAIL: drift, compile error,
behavioral mismatch, unresolved stub or failing check. UNKNOWN: missing acquisition/compiler/runner.
HOLD: stale Own or required authority/provenance unavailable. Return planning changes to upstream.

## Output schema

```text
{surface: [{sourcePointer, identity, declaration, producer, consumers, invariants}],
 frozenBinding: evidencePointer|null, anchors: [{slice, pointer}],
 stubs: [{path, status, permissionReceipt}], seamTests: [{command, cwd, status, evidence}],
 drift: [], unknowns: [], verdict: ready|fix-first|hold, next}
```

This coordination summary retains upstream proposal/version and observed evidence through existing
pointers. Keep anchors bounded to consumers; no new approval DTO or publication claim follows.
````

## Exact playbook replacement — `maestro-pack`

Replace `packages/orchestra/playbooks/maestro-pack/SKILL.md` with:

````markdown
---
name: maestro-pack
description: Coordinate upstream-authored briefs, bind actual dispatch facts and inspect compact returns. Use before delegation or when evidence/context pressure needs bounded recovery.
---

# Maestro Pack

## Trigger and rationale

Use before actual delegation or to trim a bloated working set. No workers means no dispatch ceremony.
Upstream authors briefs/context requirements from supplied facts. Maestro gathers host facts, coordinates
review/adoption and binds actual execution placement, permissions, model and dispatch authority. Missing
planning content returns to upstream. Use existing truncation, resource pointers, Session evidence and
whole-context handling; no new assembler, copied transcripts or fixed model-brand budgets.

## Inputs

Current upstream proposal/brief; owner decisions; baseline/worktree; proposed owned paths and dependencies;
adopted anchors; actual permission/governance state; available model window/usage/pricing. Current static
`own_*` facts dominate reconnaissance: pass fresh explicit drill pointers, not guessed names. Missing,
stale or held canonical ownership evidence stays HOLD; Composer does not replace Own.

## Procedure

0. Before any authoring assignment or revision, inspect existing arm/completion bindings and governed
   state through available actual host inspection; do not guess tool/method names or assume no binding.
   Authoring precedes execution arming. Native Task calls `completion.beforeDispatch` for ordinary and
   governed dispatch, without an authoring exemption. Do not let authoring consume or inherit execution
   gates. If an active binding prevents authoring or required inspection is unavailable, HOLD through the
   existing owner process. No ordinary Task enters the active governed chain; do not invent disarm,
   fresh-Session escape or downgrade to normal. Repeat this inspection before later authoring revisions.
1. Observe baseline/placement, actual source and consumer identities, checks, permissions and provider
   facts. Use dedicated read/search and existing host `repo-mapper`/`move-in` only for missing scoped
   reconnaissance. Partial maps and unknown acquisition stay explicit. Supply facts, not a new plan.
2. Request native `walt` to author/revise the bounded brief: exact targets, proposed writes/reads,
   acceptance, smallest useful anchors, forbidden scope, assumptions, resolved check commands/cwd,
   criterion deltas, local implementation latitude and compact return shape. The actually exposed pure
   `context-packer`, `plan-to-briefs` and `enrich-plan` may assist upstream; missing tools do not justify
   claiming they ran or moving authorship back to Maestro. `partitionPlan` is not durable PlanRevision.
3. Inspect and coordinate required review/adoption of the current brief. Send scope/coverage/interface gaps to
   upstream for revision. Bind observed worktree, authorized `writePaths`, actual model under existing
   Task policy and permission/dispatch state without rewriting accepted planning content. A changed
   dependency, acceptance item or scope requires upstream revision and applicable renewed authority.
   When compiler/Plan brief symbol usage needs checking, Maestro runs available `brief-usage-check`
   after describe, using its exact schema and observed acquisition facts. It is a read/process check,
   outside upstream's pure authoring subset. Acquisition omissions/compiler errors are failures, not
   empty over-spec success. Return findings to `walt` for brief revision; do not trim or rewrite authored
   content yourself. Verification is not authorship, and the check does not prove semantic completeness.
4. Supply the needed project facts. Native seats load only their own permitted packaged skills; backend
   keeps its own backend kit and upstream its authoring skills. Only governed Task and the cold reviewer
   (`lucy`) receive GROUNDED Own content automatically under the current contract; other briefs quote
   governing facts, gotchas and drill facts with fact IDs. T0/T1 facts are ratified/binding, T2 advisory
   proposals are labelled and last. Go deeper only through exact catalog/Drill `own_*` names. Runtime
   Atlas Memory is backend-only: do not claim upstream, Maestro or every seat has task/pr/project/logbook
   memory. Briefs grant no memory ownership or new skill permission.
5. Use actual provider metadata and Session usage to inspect packet + reads + reasoning + output +
   headroom. Unknown limits/prices stay unknown; estimates are not observed charges. For authored-content
   trimming or re-slicing, return bounded revision requests to upstream rather than silently dropping
   acceptance/context. Maestro still manages its own context pressure and existing evidence pointers.
6. Only after authoring and required review/adoption, where the existing execution contract genuinely
   needs completion binding, inspect `relay-arm` and actual native dispatch support under Maestro/host
   authority. Re-inspect current bindings before execution dispatch; no authoring assignment is inserted
   after execution arming. Proposed checks are not bound/executed
   until host evidence says so; arming alone is not enforcement. Current armed contracts bind the next
   native Task in this Session on the host Relay arm; spent retry budgets park the arm until owner
   release. Require actual dispatch/completion receipts, not plugin-presence claims, external hooks or
   Relay token lines. Small Tasks need no automatic arm, WP or progressive steps; a WP step is not a
   Task and introduces no per-step human approval ceremony. W6 proposal publication/approved scope is
   pending integration, not supplied by structural inspection, a card/path or these instructions.
7. Dispatch through available native `task` under actual permissions. In explicit governed mode retain
   exact current authorizationID and byte-identical approved subagent_type, prompt and model. No packet,
   policy, structural result or worker card mints authority; current upstream PlanRevision provenance is
   an adoption blocker, not a reason to relabel it. Unavailable tools stay UNKNOWN, never fake dispatch.
8. Read compact return first, then specific evidence needed to verify. Large outputs stay in existing
   stores with pointers; refresh stale source identity. Host-observed upstream authorship and terminal
   card validity prove neither artifact acquisition/publication nor product completion. Verify actual
   implementation returns, request required cold review and coordinate integration; planning findings
   go back to upstream for revision.

## Exact tool sequence and baseline check

Catalog only for narrow discovery. Describe selected operation inputSchema/effects before execute;
host owns placement/state/authority. Do not claim retired `context-budget`/`model-router` tools exist.
Worker Step 0 in assigned worktree: `git rev-parse HEAD`, `git status --short` and
`git merge-base --is-ancestor <assigned-baseline-sha> HEAD`, with the SHA resolved before dispatch.
Initial HEAD equals assigned baseline unless a delta was explicitly assigned; verify complete
baseline-to-working-tree diff on return. Nonzero Git exit is failure, not empty clean output.
Tests here run on Actions via `bun run test:ci orchestra <resolved-suite>` from repository root;
typecheck is `bun typecheck` in `packages/orchestra`, never local `bun test`.

## Success / fail

Success: current adopted upstream brief has exact contract, observed baseline, resolved checks, explicit
latitude and compact return; actual host permissions/dispatch and relevant measured context limits are
recorded. FAIL: wrong baseline, ambiguous scope, unavailable required checks or unresolved overflow.
HOLD: stale Own or required authority/provenance. UNKNOWN: metadata, lifecycle, tool or acquisition missing.
Request upstream revision or report the blocker; never silently drop requirements to fit a packet.

## Output schema

```text
{slice, baseline: {sha, worktree, preexistingDelta}, targets: [{path, sourceIdentity, excerptPointer}],
 writes: [], reads: [], acceptance: [], contractPointer, latitude, hardRules: [],
 checks: [{command, cwd, expectedOutcome}], context: {model, limitBasis, estimate, unknowns},
 dispatch: {status, receipt, authorizationID}, completionBinding: {status, evidence},
 returnShape: {status, baseline, changedPaths, evidencePointers, blockers, newDecisions}}
```

Keep proposal authorship/version and decisions in existing Session/artifact evidence pointers, not new
workflow envelopes or committed runtime telemetry. Operational binding does not make Maestro the author.
````

## Governed provenance guard text — existing governed owner

Target: `packages/orchestra/playbooks/maestro-governed/SKILL.md`. Replace procedure step 4 in full with
the following; the tool call, field shapes and new-revision requirement are preserved:

```text
4. `maestro_record_plan_revision`. `goal` and `reviewRequirement` are single `{value, source}` fields; `acceptance`, `scope` (exact territory names), `constraints`, `assumptions` and `risks` are arrays of them; `units` is an array of plain unit-ID strings. `source` currently accepts only `stakeholder` (the owner said it), `orientation` (observed) or `maestro` (a Maestro-authored proposal). These values do not represent upstream-authored proposals. Do not invent `upstream` as a current enum value or relabel upstream content to fit the schema. Report HOLD at that adoption boundary until the host/schema owner supports truthful upstream provenance. Never upgrade inference to stakeholder. Any changed field is a new revision.
```

This is a precise guard handoff, not a new governed authoring sequence. All other preconditions and steps
remain as currently implemented, including the byte-identical card, current context/IDs/hashes, exact
direct-user approval and one-dispatch authorization. The host/schema integration must be reviewed by its
owner; no approved envelope or migration decision is fabricated here.

## Integrating owners and blockers

| Owner | Exact surface / next handoff |
| --- | --- |
| Maestro/runtime lead | `packages/core/src/agent/prompt/maestro.txt`; `packages/orchestra/playbooks/maestro-{decompose,contract,pack}/SKILL.md`; coordinate the governed-source guard above. Apply/reconcile the exact text, retain operational discovery/decisions/review/adoption/dispatch/integration and request author revisions. |
| Wave-2 upstream method owner | `packages/walt-specialist/skills/**`; receives authoring methods from the current playbooks under frozen operation IDs/native Relay schema. These skills are not a second planner. |
| Upstream integrator + Core/Orchestra wave-2 owners | `packages/core/src/tool/maestro-arsenal.ts`, `packages/orchestra/src/tool/maestro-arsenal.ts`, `packages/orchestra/src/tool/registry.ts`, `packages/orchestra/src/maestro/roster.ts`, `packages/orchestra/src/maestro/upstream-proposal.ts`; Core/V1 restricted bindings and structural inspection are implemented in candidate `ff3b57d4a6323a150949072d06ad379f666a65af`. Actual V2 application binding remains a separate integration handoff; candidate code is not deployed authority. This document grants no permission change. |
| Relay/W6 lead | Sole integrator for Relay service/schema and W6-specific Task/Session/`arsenal-completion` changes; shared `packages/orchestra/src/maestro/arsenal-bindings.ts` receives an explicit V2 attestation handoff and requires acknowledgment. Immutable proposal identity/publication, truthful upstream provenance and native approved scope remain mandatory. |
| Host/schema owner coordinated with Relay and Maestro/runtime | `packages/orchestra/src/tool/maestro-plan.ts`, `packages/schema/src/maestro-event.ts`, `packages/orchestra/src/maestro/plan-revision.ts`; current source enum is insufficient. Design/integrate truthful author persistence under the existing owner process; this document neither changes the schema nor chooses a new DTO. |

Ready handoff: canonical role/class reconciliation and exact prompt/playbook transfer text. Blocking full
closure: live transfer, actual V2 application binding, W6 immutable publication/materialization/approved scope and
truthful PlanRevision provenance. Domain/live pilot qualification is unobserved by this slice. Coordination
and candidate review are not owner acceptance, landing or deployment. Core/V1 authoring bindings and
structural inspection are implemented in the unlanded `ff3b57d4a6323a150949072d06ad379f666a65af` candidate,
not unfinished slices. [S1–S3, S16]

## Source-citation review

The approved-owner planning documents and host interface were read as frozen inputs, not edited or
re-researched. TEAM/class-map content is reconciled onto this runtime baseline, with candidate-status,
backend-only Memory and enforcement wording corrected. Baseline source anchors below remain pinned to
`abf7a72c77fcaeee1206400a8270b2581ae9839c`; their lines refer to pre-transfer text. S16 records the later
implemented candidate separately, not future deployed behavior.

| Ref | Source and reach |
| --- | --- |
| S1 | `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/archie-runtime/specs/upstream-specialist/wave-2.md:15–59`: frozen authoring subset, real native attestations, V2 handoff, structural inspector and pending W6 authority. |
| S2 | `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/archie-planning/specs/upstream-specialist/host-interface.md:9–69,71–109`: identity/card/tool boundary, ordinary assignment, small Tasks, single integrators, materialization, policy conflict; historical baseline/schema pins are not new approvals. |
| S3 | `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/archie-runtime/specs/upstream-specialist/runtime-handoff.md:3–34,36–63`: prior registration/assets/card implementation/review and mandatory closure. Its unfinished restricted-access status is superseded by S16. Its check/review evidence is prior workstream evidence, not tests, approval or a pilot performed by this docs slice. |
| S4 | Baseline `packages/orchestra/src/maestro/seats/walt.ts:4–31`, `packages/orchestra/src/maestro/roster.ts:13–16,80–95,136–160`: ID/profile/label env/skills, no upstream memory/toolkit, roster lists and separate fixed Maestro role. |
| S5 | Baseline `packages/orchestra/src/maestro/backend-result.ts:58–79,88–139`: strict upstream card projection, actual assistant authorship, no invented author for no-message results; immutable artifact identity/approval remain separate contracts. |
| S6 | Baseline `packages/orchestra/src/tool/maestro-plan.ts:12–27,82–105`: supported field source enum, native Maestro persistence identity and PENDING context; no upstream source label. |
| S7 | Baseline `packages/schema/src/maestro-event.ts:186–225`: the same provenance enum in durable PlanRevision events, distinct event version/grounding. |
| S8 | Baseline `packages/orchestra/playbooks/maestro-governed/SKILL.md:10–78`: explicit governed mode, preconditions, existing source meanings, exact native chain/approval/authorization/intent and renewed revisions. |
| S9 | Baseline `packages/schema/src/relay-sprint.ts:5–8,21–44,53–87`: native schema, preserved unknown metadata, unsupported human kind, optional checklists and ledger generation. Structural decoding is narrower than runtime/semantic acceptance. |
| S10 | Baseline `packages/orchestra/src/maestro/atlas-memory.ts:17–26,39–59,72–101`: backend-only runtime owner and host-written memory bindings; the foundation Memory model does not extend them. |
| S11 | Approved-owner inputs `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/archie-planning/foundation/atlas/docs/TEAM.md:3–95,96–131` and `explanation/classes.md:5–52` alongside it: unified subordinate upstream, retired architecture-only review, small Tasks and preserved governed authority. Implementation-status/Memory/enforcement wording is reconciled against S1/S3/S10. |
| S12 | Baseline `packages/core/src/agent/prompt/maestro.txt:35–40,69–84`; `packages/orchestra/playbooks/maestro-decompose/SKILL.md:10–54,64–106`, `packages/orchestra/playbooks/maestro-contract/SKILL.md:10–41,43–77`, `packages/orchestra/playbooks/maestro-pack/SKILL.md:10–60,62–101`: exact live planner/decomposer/contract/brief-authoring responsibilities to transfer; source of retained operational checks, baseline rules and existing summary formats. Pack line 31 retains Maestro's `brief-usage-check`, not upstream authorship. |
| S13 | Baseline `packages/orchestra/src/agent/agent.ts:273–290,321–328,362–390`, `packages/orchestra/src/effect/runtime-flags.ts:5–7,60`: native subagent registration and central config/environment label precedence. `packages/orchestra/src/maestro/seat-skill-root.ts:13–47`, `packages/orchestra/src/skill/index.ts:288–295,388–401`: existing source/embedded seat assets and skill visibility under actual permission rules. |
| S14 | Baseline `packages/maestro-arsenal/src/engine/descriptors.ts:6–14`, `packages/maestro-arsenal/src/tools/brief-usage-check.ts:5–7`, `packages/maestro-arsenal/src/engine/brief-usage.ts:6–44`: read/process verification of declared Plan symbols or compiler-proven unused declarations, schema-bounded source/available modes and named acquisition/compiler failures; not authoring or semantic completeness. |
| S15 | Baseline `packages/orchestra/src/tool/task.ts:430–441`: `completion.beforeDispatch` is on the ordinary/governed dispatch path before the governed-only branch, without an upstream authoring exemption. `packages/orchestra/src/maestro/arsenal-completion.ts:131–151`: host binding resolution, identity/check validation and arming when a binding applies. These internal methods are not model-callable inspection tools; inspect through actual available host surfaces, HOLD preventing bindings under the existing owner process. |
| S16 | Implemented unlanded candidate `ff3b57d4a6323a150949072d06ad379f666a65af`, inspected through its Git object/diff from original baseline: `packages/core/src/tool/maestro-arsenal.ts` (`makeHandlers`, `registerScoped`), `packages/orchestra/src/tool/maestro-arsenal.ts` (`make`), `packages/orchestra/src/tool/registry.ts` (`ToolRegistry.tools`), `packages/orchestra/src/maestro/roster.ts` (`seatProfile`), `packages/orchestra/src/maestro/upstream-proposal.ts:1–23` (`inspect`). Core/V1 restricted authoring and byte-snapshot structural inspection are implemented; Core's optional V2 attestation support is not the pending actual V2 application binding. No tests, landing, deployment or real qualification are claimed by this source review. |

Framing corrected: separate upstream personas and a dedicated architecture evaluator; Maestro as author
of decomposition/contracts/briefs; candidate registration confused with complete deployment; structural
acceptance confused with semantic review/approved publication; every seat's foundation Memory confused
with backend-only runtime; provenance relabeling and compulsory WP/step/approval ceremony for small Tasks.
None of these corrections changes the frozen architecture or invents an alternate planner.
