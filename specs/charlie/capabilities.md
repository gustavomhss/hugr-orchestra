# Backend competence, workflows and evaluation

Status: architecture and construction plan. No skill, CLI command or tool described here is claimed as newly installed.

Basis: [research synthesis](research/README.md), particularly [Rust/Go procedures](research/17-rust-go.md), [dynamic backend stacks](research/18-backend-stacks.md), [data/API correctness](research/19-data-api.md), [efficiency](research/16-efficiency.md) and [evaluation](research/20-evaluation.md).

The [technical-depth reference](technical-depth.md) serves the responsible investigation, architecture, verification and foundation owners. It is not Charlie's diagnostic workflow. Those owners may supply relevant implementation constraints and check scenarios in an assigned packet.

## Mandatory role boundary

Charlie implements backend code within a scope already defined by the caller. Investigation, diagnosis, discovery, architecture/scope selection and independent review belong to other owners. Every skill and workflow below starts from a complete implementation packet. Missing inputs or unexplained/out-of-scope failures return as blockers; tool availability does not grant another role.

Maestro owns team scope/permission decisions. The harness already owns persistence, execution, enforcement, cache and compaction; Atlas owns Knowledge/Memory. Charlie consumes their contracts. These native capabilities are dependencies, not work to build into the specialist.

## Competence model

The specialist applies deep, version-aware backend knowledge to supplied designs, code targets, patterns and acceptance requirements. He loads implementation guidance relevant to that packet. The caller/host supplies target-component and environment facts; repair assignments additionally supply the needed diagnostic conclusions. Local SQL, helpers and other implementation details remain Charlie's judgment within the agreed scope.

| Domain | Required behavior | Representative failure to catch |
| --- | --- | --- |
| Architecture conformance | Implement within the supplied boundaries, dependency direction and patterns | Inventing a service/event layer for a local function change |
| API implementation | Implement the specified validation, wire/error semantics and authorization contract | A valid token reading another tenant's resource |
| Data and transactions | Implement the assigned schema/query/migration and transaction semantics | A retry creating duplicate business effects |
| Concurrency and async work | Encode the specified ownership, cancellation, deadlines and backpressure | A cancelled request leaving an active worker or transaction |
| Distributed effects | Implement the supplied ordering, deduplication and delivery contract | Treating at-least-once delivery as exactly-once execution |
| Security implementation | Apply the supplied trust/authorization rules inside assigned code | Client-controlled identity being used as authority |
| Assigned tests and checks | Implement tests when assigned and execute the supplied behavior/negative cases | Reporting verification that did not exercise the specified behavior |
| Optimization implementation | Apply the specified optimization and run the supplied benchmark/checks | Changing the workload or choosing an unrelated optimization |
| Observability implementation | Add the assigned bounded logs, metrics or tracing | Reporting an asynchronous failure as success |
| Handoff | Return the code delta, check results and blockers to the owner | Treating implementation handoff as review, merge or deployment authority |

The supplied architecture and conventions remain authoritative. An unresolved technical decision is returned to its owner rather than settled through a self-assigned design exercise.

## Stack-specific depth

The named families are requirements, not alternate product editions.

| Family | Specialized practice |
| --- | --- |
| Rust | Ownership and lifetimes, error types, async cancellation/drop behavior, `Send`/`Sync`, resource ownership, feature/target matrices, justified unsafe boundaries, Cargo workspace/toolchain conventions |
| Go | Context propagation, goroutine lifecycle, error wrapping, interfaces at genuine boundaries, transaction lifetime, bounded worker pools, race testing on supported targets, module/version discipline |
| Python | Actual packaging/lock environment, typing at boundaries, async versus blocking work, framework/version semantics, transaction/session lifecycle, real database integration and migration tooling |
| TypeScript | Runtime validation beyond static types, nullability and error algebra, module boundaries, promise/cancellation semantics, package exports and repository-specific build/test conventions |
| JavaScript / Node | ESM/CJS behavior, event-loop blocking, streams/backpressure, process signals, graceful shutdown, resource cleanup, dependency/runtime support |
| Bun | Implement against the supplied Bun version/runtime contract and execute the assigned compatibility checks |
| Effect | Use the repository's installed major/beta version and source; model service scope, typed failures, interruption and resource acquisition explicitly |
| Next | Implement the specified Route Handler/Server Action/data-access/auth/cache behavior for the supplied version, router and runtime |
| Other backend stacks | Use supplied toolchain/version/reference context and implement the assigned behavior with idiomatic code |

Next work here means the assigned server-side behavior. UI work belongs to its responsible member; Charlie returns a dependency/blocker when implementation requires changes outside his packet.

Java/Kotlin, .NET, Ruby, PHP, Elixir, databases, queues, caches and deployment systems are eligible project stacks. Coverage expands through focused procedures and held-out cases, not through a new agent/runtime for each language. A language absent from the initial evaluation matrix is not advertised as benchmark-proven.

## Skill design

Each skill has a precise trigger, prerequisites, actual input/output expectations, a short procedure, failure handling, verification guidance and references. It should help the agent make a better decision or perform a repeatable operation, rather than restate general slogans.

### Shared methods

The [skill catalog](skill-catalog.md) and [variant matrix](skill-matrix.md) refine the original draft into task-oriented entries with mode, language/runtime and framework/library/version references. Proposed stable skill IDs:

- `backend-implement`: consume the complete packet, read assigned code/patterns and implement inside its boundaries.
- `backend-api`: implement specified endpoints, validation, authorization, errors, pagination and streaming behavior.
- `backend-data`: implement the supplied persistence/schema/query/migration design.
- `backend-concurrency`: implement the supplied resource-lifetime, cancellation, retry, queue and backpressure contract.
- `backend-refactor`: apply prescribed structural changes while preserving assigned behavior and scope.
- `backend-check`: implement associated tests only when assigned, execute specified checks and report actual results.

Native context continuity and evidence handoff are shared guidance in `backend-implement`; the earlier `backend-memory` and `backend-handoff` draft entries are not separate initial skills. This changes proposed packaging, not ownership of Atlas or harness capabilities.

Memory uses Atlas's actual kinds: Charlie's `project` Rules are always supplied in native context; `task`/`pr` are explicitly consultable with the own resumed-fold contract; `logbook` is orchestrator-owned. Awareness and Orientation are derived header slabs, not stored member memory types. Follow the [exact templates, existing tools and wiring limits](atlas-memory-contract.md), including source-derived kind and bound write owner.

Discovery, diagnosis, architecture planning, security audit, bottleneck investigation and incident triage are not Charlie skills. The earlier `backend-orient`, `backend-design` and `backend-debug` proposals are withdrawn. Their owners may provide outputs that Charlie implements.

### Stack procedures

Language/runtime and framework/library differences initially live in conditional reference profiles: for example Python/FastAPI/SQLAlchemy versus Python/Django/DRF, Go/chi/pgx versus Go/Gin/Ent, and Rust/Axum versus Rust/Actix. The earlier standalone language-ID proposals are profile labels, not a mandatory extra skill invocation for every task. Selection follows supplied target-component facts and exact versions; JavaScript work does not imply a TypeScript migration.

The skill owner adds procedures when assigned work/evaluation establishes a need. Charlie consumes the supplied version-matched references; missing context is returned, not replaced with an open-ended documentation/repository investigation.

Native metadata does not implement automatic variant matching or inheritance. Entry bodies point explicitly to applicable references. Public skill collections contribute adapted methods and cited examples; their planning, diagnosis, self-review, publication and host-specific hooks do not become Charlie responsibilities.

### Procedure cards rather than framework manuals

Each stack-specific reference supports implementation of an already-specified change. Shared concepts are referenced, not copied into every language file. Diagnostic work represented in historical research remains with its owners. Examples of implementation constraints:

| Trigger | Procedure | Evidence that matters |
| --- | --- | --- |
| Assigned Rust cancellation change | Encode the supplied task/handle/permit lifetime and completion contract | Execute the supplied cancellation and resource-release checks |
| Assigned Go transaction change | Use the specified driver and transaction/rollback owner | Execute the assigned atomicity and connection-reuse checks |
| Assigned FastAPI dependency/stream change | Apply the supplied version and resource-scope contract | Execute the assigned stream lifetime and failure checks |
| Assigned TypeScript/JavaScript boundary | Implement the specified decoder, errors and Promise ownership | Invalid input and premature success fail the provided checks |
| Assigned Node/Bun stream/shutdown change | Implement the supplied pressure, abort and connection-lifetime design | Execute the specified slow-peer, disconnect and process checks |
| Assigned Bun transaction change | Keep implementation within the supplied synchronous/async transaction contract | Run the provided commit/rollback fixture |
| Effect resource or error change | Use installed version's source and existing service/test patterns | Real use remains inside scope; interruption and typed failure remain distinguishable |
| Assigned Next auth/cache change | Implement the provided principal/resource policy and cache identity | Run the supplied cross-principal/cache-hit cases |
| Database migration | Test populated upgrade and old/new application coexistence | Backfill and rollback assumptions survive concurrent writers and interrupted progress |
| Retried external effect | Reuse exact intent identity and reconcile uncertain outcome | Lost response does not become a fresh payment/job/resource request |

The packet supplies project commands and working directories where relevant; reusable tool invocation details live in recipes. Product installation supplies selected default tools and their invocation dependencies. A missing promised default is an installation defect; missing project-specific commands/services are separate prerequisites. Charlie reports the precise gap rather than choosing/installing an alternative environment. Version-specific reference details remain outside the base prompt.

### Reuse

Use existing tools only for the assigned code/context and prescribed checks. Composer can apply a supplied recipe/primitive selection when assigned; Charlie does not perform recipe discovery or choose the service architecture. Maestro Arsenal may supply prepared artifacts through delegation; execution must not depend on Maestro being installed.

The [backend implementation toolbox](backend-toolbox.md) selects concrete recipe candidates from the corrected-scope research. Code generators, typed SQL, structural transformations and assigned test libraries use compatible project tools or the supplied default toolset. [Tool distribution](tool-distribution.md) separates our operations from packaged external engines; neither introduces a new orchestration layer. Composer's selected output mode and callable/write behavior need qualification before use; a catalog entry or syntax-valid skeleton is not completed implementation.

Skills stay package-owned and discoverable through the host's supported skill mechanism. They use the configured public name in human-facing content and stable capability identifiers for lookup. Their bodies are loaded on demand, not concatenated into every system context.

A skill revision includes its selected supporting resources, relevant executable metadata and origin, not only `SKILL.md`. External dependency/runtime versions are separate evidence. Read deduplication must be invalidated when context eviction removes content needed for the next action; matching file metadata alone does not mean the model can still see it.

## Workflows

A workflow is a reusable procedure over existing tools and evidence. It is not a second scheduler, a mandatory state machine for every edit or a new durable execution entity.

| Workflow | Operational sequence | Completion evidence |
| --- | --- | --- |
| Assigned feature | Consume supplied design/context → read assigned targets → implement → execute assigned checks → hand off | Implementation meets the supplied behavior and scope |
| Specified repair | Receive diagnosis, fix direction and regression case → implement correction → execute provided checks | The supplied regression and preservation criteria pass; no root-cause investigation is assumed |
| Specified data change | Receive schema/migration strategy and order → implement assigned files → run assigned migration checks | Results from the specified target engine and compatibility cases |
| Specified API change | Receive wire/interface/consumer contract → implement → run assigned generator/check commands | Exact delta and specified compatibility evidence |
| Specified refactor | Receive target seams and preserved behavior → implement scoped structural change → execute assigned checks | Preserved behavior and requested structural change |
| Specified optimization | Receive identified bottleneck, chosen change and benchmark → implement → run provided measurement | Comparable results for the supplied workload and preserved behavior |
| Resume | Resolve same native task → recover own implementation checkpoint and supplied packet → continue if current; otherwise return blocker | Same scope and permissions, no self-assigned drift investigation |

The entrypoint can be direct invocation, a native command or Maestro delegation. Each supplies the same clear implementation scope. Small changes can use a concise read-assigned-code/edit/run-assigned-checks path. Investigation and incident diagnosis are not entry workflows for Charlie.

### Repeat-failure protocol

On a failed step, preserve the relevant input/revision, observed failure and implementation delta. Charlie can adjust his assigned code to satisfy the supplied contract/checks. If progress requires a new diagnosis, missing decision or scope change, return that blocker with the observed evidence; do not form an investigative hypothesis or open a diagnostic loop. Transient provider/tool failures use the host's existing bounded retry owner.

The user can steer, stop and resume through native controls. Stop acknowledgement and completed cancellation remain separate observations. A process that stopped waiting for an external operation must preserve that operation's possibly unknown outcome.

### Finish and handoff protocol

Return a concise outcome first, followed by the delta, exact relevant verification, use/run instructions and remaining limits. Keep three facts distinct: execution ended, verification succeeded, and the work was accepted. A preview is local execution evidence; production deployment needs its own evidence. A task that is cancelled or archived does not become successful because the UI groups it under a terminal heading.

Use the existing diff and evidence surfaces. A small task may fit in a short message; a complex migration may need linked artifacts. Detail is available without forcing the user to read the entire worker transcript.

## Tools, CLI and MCP

### Owned versus supplied tools

HuGR/Charlie-owned operations and external free/open-source engines have separate provenance and maintenance ownership. Selected useful external engines are part of the default installation, ready to invoke; task/stack selection controls use, not manual installation. Native, CLI and MCP are interface choices independent of origin. An engine may be fully useful through its preinstalled CLI and an existing native shell tool.

Tools and their invocation runtimes belong to distribution; application libraries, databases and project toolchains have distinct version/service requirements. See [tool-distribution.md](tool-distribution.md) for the initial payload and project-version precedence. Availability never supplies scope or permission.

### Admission rule for a new owned tool

A new owned operation needs all of: a recurring domain operation, an exact input contract, useful output, a named failure model, a permission/effect boundary, and tests showing an advantage over existing primitives. A wrapper that merely renames `bash`, `grep`, a test runner or an Atlas operation is not a backend capability. This does not prohibit packaging a valuable existing external engine without inventing a wrapper.

### Initial surfaces

The concrete initial owned operations are specified in [owned-tools.md](owned-tools.md): qualified `hugr-compose` and `hugr-scaffold`, their input/result/error semantics, effect boundaries and native/CLI/MCP mapping. The list below describes consumed integration surfaces, not additional invented backend tools.

1. **Native Atlas integration:** consume the provided scoped Knowledge/Memory interfaces. Test Charlie's use of them; do not make rebuilding Atlas part of the plugin.
2. **Skill/workflow catalog:** host metadata and selected implementation guidance for the assigned task. Catalog discovery is a protocol operation, not authorization for Charlie to perform project discovery.
3. **Host capability status:** implementation/admin surface for actual availability and typed failures. Charlie receives that state and returns blockers; he does not diagnose the environment.
4. **Work/result contract validation:** check the supplied implementation packet. A concise direct request can supply it without a form, but missing scope/decisions are not inferred by Charlie.

New Charlie tools must serve assigned implementation or its specified checks. Repository discovery, impact analysis, architecture assessment and diagnosis tools belong to their responsible roles; they are not future Charlie capabilities merely because they concern backend code.

### One implementation

```text
native adapter ─┐
CLI adapter ────┼─ canonical schema/handler ─ actual host and Atlas capabilities
MCP adapter ────┘
```

MCP uses normal `tools/list` and `tools/call` discovery rather than introducing a second catalog protocol. CLI exposes the same operations with structured output and explicit non-success exits. Neither adapter installs a second model loop, stores parallel memory or manufactures host evidence.

An illustrative role-stable CLI name is `hugr-backend`; changing the public persona name does not rename machine entrypoints. Exact commands are frozen when their handlers are selected. Executing a CLI operation expresses its actual user's intent; existing host/resource policy still decides applicable permissions.

Pure tooling can be shared with other callers. A memory or execution operation always needs a real project/member binding. The adapter owns that binding rather than accepting an untrusted `approved: true` field.

Atlas Memory transport permissions are separate from repository-write permission. CLI/MCP operations that need a Session-composed execution actor must resolve an actual host Session or report that the capability is unbound; they cannot invent a synthetic conversation ID. Standalone pure/read-only operations do not manufacture governed execution authority.

For actual cross-tool computation, reuse the host's existing CodeMode only through its supported scope. Each nested call retains native identity, current registration, final-argument validation, leaf permission, cancellation and semantic outcome. Explicitly empty scope remains empty. A small direct operation stays direct; broad native-tool composition waits for the typed host seam rather than reaching private executors. The inspected V1 CodeMode adapter is MCP-oriented and supplies no explicit execution limits, so bounded Charlie use is integration work, not an existing guarantee.

## Efficiency contract

### Context

1. Consume the supplied component, runtime, command and context references; reuse them while current.
2. Read the authorized targets and supplied references. Missing targets, unknown dependencies or insufficient context return to the caller; do not launch repository discovery or search for an expanded scope.
3. Keep skill metadata concise; load selected procedures and dependencies only when relevant. Expose effective source/version and invalid/overridden status through the native loader.
4. Keep stable prefixes and tool ordering stable within the host's context model. Model/profile changes and large dynamic prefixes can invalidate caching and must earn their cost.
5. Retain exact active constraints, identities and failure evidence through compaction. Reuse existing native compaction and Atlas recall rather than building a second context assembler.

The authorized read set includes implementation files and supporting context supplied by the owner. Charlie does not broaden that set to discover callers or diagnose an unexplained failure. Supplying adequate context is the delegator's responsibility.

### Tools

- Batch independent reads within the assigned context when useful; preserve dependencies such as read-assigned-code → edit → assigned check.
- Return the useful answer plus source/coverage and a recoverable expansion path. A bounded preview must not imply a complete scan or successful check.
- Keep native tools easy to select and schemas precise. Add examples for ambiguous inputs, actionable validation errors and typed failure outcomes.
- Apply progressive tool discovery only where catalog size justifies its extra call/selection cost. A small stable toolset can be cheaper to expose eagerly.
- Reuse existing output storage and range/filter controls. Critical diagnostics and exact authorization bindings cannot be discarded for token savings.
- Use deterministic tooling to avoid repeated model work when it adds actual semantic value, not merely to increase the catalog.

Bound acquisition and producer work as well as model-facing output. A short result can still follow a full index rebuild, unbounded buffering, many remote calls or paid auxiliary inference. Count leaf calls and hidden sampling/model requests; distinguish reduced parent-context tokens from reduced total cost. Preserve partial-source and nested-error outcomes even when a program returns normally.

### Verification and model effort

- Run the supplied detecting case, assigned checks and applicable mandatory project checks. Return the need for broader impact analysis/check scope to its owner.
- Reuse applicable evidence; rerun when the artifact, environment or claim changes. A formatter-only edit and a transaction-isolation change need different verification depth.
- Start with an available, capable host-selected model. Cheap-model routing and second opinions are optional experiments, not required infrastructure.
- Count planning, retrieval, compaction, retries, consultations, cache warm-up and user repair when comparing alternatives. Cheap requests that create expensive repair are not an efficiency win.
- Reuse native limits and usage records. Report actual, estimated and unavailable cost separately. A hard monetary ceiling requires a real enforceable provider/host contract; a price estimate must not claim that guarantee.

### Measurements

```text
first-delivery acceptance
acceptance after user/maintainer repair
total serving cost / accepted tasks
elapsed time to first useful progress and accepted result
active user setup, review, correction and repair time
uncached input, cache reads/writes, output and reported reasoning
tool calls, invalid calls, repeated unchanged reads, retries
assigned-check coverage, failure honesty and scoped resume fidelity
```

All attempts count, including failures and abandonment. Zero accepted tasks yields no cost-per-acceptance figure, not a zero cost. Cached/reasoning counters must follow the actual provider's accounting; unknown usage stays unknown. Report cold setup and warm operation separately.

**Measurement prerequisite:** identify the authoritative request-level usage source before any cost comparison. At the inspected baseline, `packages/core/src/session/runner/publish-llm-event.ts` maps missing counters to zero and `runner/llm.ts` publishes literal `cost: 0`. Those projected values alone cannot distinguish absent accounting from a reported zero. The native measurement path must preserve availability and reconcile primary, auxiliary and compaction requests exactly once. This is a host telemetry contract, not a new Charlie accounting service. Historical rows without sufficient evidence remain unknown.

No universal token/time target is frozen from vendor marketing or a researcher's guess. Establish the matched baseline and user task budget first. Required quality and meaningful verification remain fixed while optimizing cost/time.

## Evaluation: how excellence becomes falsifiable

### Deterministic integration cases

- Native installation, direct agent selection and Maestro delegation resolve the same specialist implementation.
- Display rename updates UI/prompt labels but preserves member ID, Atlas owner and historical receipts.
- Tool/schema/result behavior is equivalent across the library, native host, CLI and MCP for the same bound operation.
- The advertised default toolset works from the normal supported-target installation without per-tool user setup; checks distinguish broken installation from missing project services or an incompatible project pin.
- Permissions deny out-of-scope effects at execution; generated policy prose is not evidence of enforcement.
- Actual Atlas persistence, reload, checkpoint succession, capacity/decay and degraded-mode behavior meet [atlas.md](atlas.md).
- Current selected-agent identity governs active rules and new automatic context admission. Switching agents cannot newly inject another member's rules/fold or borrow its permissions. Previously admitted transcript content remains attributed historical data, including after compaction; this does not assert confidentiality or erase history.
- Native running context includes the member's bounded `project` Rules with derived Awareness/Orientation. Task/PR/logbook records stay outside that header; exact own resumed-fold admission is verified separately through the actual supported path.
- Worker cancellation, incomplete checks and refused writes cannot appear as verified completion.
- A complete packet produces assigned code; a missing diagnosis, target, decision or context produces a precise blocker rather than an investigation.
- Unexpected out-of-scope failure is returned with observations. Broad searches, self-selected architecture, diagnosis or taking over another member's task fail role conformance even if they find a useful fix.

### Representative backend tasks

Every row begins with supplied decisions/diagnosis, authorized targets and check requirements. The evaluator varies implementation cases within that contract; it does not ask Charlie to discover the problem.

| Family | Held-out task | Required negative/control |
| --- | --- | --- |
| Rust | Fix cancellation/resource cleanup in a bounded async service | Cancel during the operation; demonstrate the resource stops or closes as specified |
| Go | Implement bounded concurrent processing with deadlines | Cancellation and supported race/lifecycle checks detect the broken variant |
| Python | Evolve a transactional API with an actual database | Duplicate/retried request and rollback behavior exercise the real transaction semantics |
| TypeScript/Effect | Fix typed error and scope handling across a service boundary | Interrupted or failed operation closes resources and preserves the intended error channel |
| JavaScript/Node | Repair streaming/backpressure or graceful shutdown | Slow consumer, disconnect and shutdown scenarios remain bounded |
| Next | Fix a server-side authorization/cache-scope defect | Cross-user or cross-tenant requests cannot observe another principal's cached data |
| Cross-stack | Implement an idempotent operation consumed through a public API | Retry, partial failure and malformed input preserve the actual business invariant |
| Memory | Resume a failed backend task in another Session | The correct previous attempt is recovered without adopting stale authority or repeating the known failure |

Every representative task supplies its diagnosis/design, code targets, interfaces, context and check contract; it is not a symptom-only investigation benchmark. Acceptance covers both the specified behavior and role/scope conformance. Environment-dependent cases name required prerequisites and cannot silently skip into a passing claim. A model that rejects every complete packet or makes no required change cannot satisfy the healthy control.

### Model-level evidence

Compare the same model/provider/version on identical scoped implementation packets with and without the specialist package, under the same role restriction. Keep a held-out set separate from prompt/skill tuning. Repeat enough runs to expose variability rather than selecting one attractive transcript.

Record correctness, preservation of invariants, review findings, unauthorized effects, unnecessary changes, recovery behavior, repeated failed approaches, context pressure, elapsed work and actual cost when observable. Unknown usage/pricing remains unknown. Publish the tested model/runtime/task scope with results; do not claim universal superiority.

Use the production host's real execution path. A small experiment driver can prepare tasks and grade artifacts; it must not replace SessionRunner with a toy agent loop. Keep graders/reference solutions outside candidate-controlled state and Atlas memories. A held-out test recipe published in this design is not itself a sealed holdout.

Retain full deliverables, including intended untracked files, and grade the current artifact. Calibrate with a known-good solution, the relevant buggy/no-op case, a plausible wrong solution, an alternative valid solution, missing reports, zero test selection and forced skips. Runtime state needs direct observation; patch replay alone does not establish correct Session/Memory recovery.

For learned/generated skills, export the complete candidate and reload it through the real plugin/skill loader before grading. A better in-memory optimizer module does not prove the saved skill improved. Group related task/session/project examples before splitting holdouts; retain regressions and failed-trial cost. Keyword overlap, frontmatter validity and procedure-following prose cannot replace executable backend acceptance. See the separate Hermes self-evolution prototype analysis in [R25A](research/25-hermes-memory.md) and [technical-depth T10](technical-depth.md#t10--learn-from-evidence-evaluate-what-will-actually-ship).

### Pilot manifest and trial semantics

Freeze a compact manifest before comparison:

```text
task/repository/base identity and initial dirty-state fixture
disclosed acceptance plus grader/reference identity
host/runtime/plugin/skill/model versions and model settings
initial Atlas project/member/task state; cold/warm cache condition
required services, resources and network regime
per-trial limits, retry policy, repetitions and stopping rule
counterbalanced/randomized arm order and infrastructure-rerun policy
acceptance authority and post-delivery repair protocol
```

A Charlie trial includes packet consumption, assigned implementation, scoped recall, prescribed checks and implementation adjustments through delivery/stop. Upstream discovery/design/diagnosis is supplied equally to both arms, not assigned to Charlie; report its team cost separately when measuring an end-to-end team workflow. Blocker clarification and scripted resume do not create extra successful tasks. Post-delivery correction distinguishes first-delivery from eventual acceptance; a rescue Session does not reset the denominator.

Use the same starting state and limits for native-baseline and Charlie arms; record Atlas capability differences as part of the treatment if they cannot be held equal. Freeze repetitions/stopping before examining outcomes. Retain infrastructure failures and rerun only under the declared policy, preserving the original record. Grader-only changes permit versioned regrading of saved artifacts; changes visible to the agent require comparable reruns. These are experimental definitions, not additional per-edit product ceremony.

### Ablations and user trials

Compare native baseline against the same model/runtime plus Charlie on the same complete implementation packet. Isolate skill loading, scoped Atlas continuity, implementation tools, output bounding and permitted model configuration. Team planning/diagnosis is a separate evaluation owned by its responsible members. Avoid an exhaustive feature-by-language Cartesian product.

Measure direct callers and Maestro delegation with the same scoped-packet requirement. Can the caller use the result, understand a missing prerequisite and resume assigned implementation? A novice's broad product request must be framed by the appropriate upstream role rather than silently turning Charlie into that role. Independent owners adjudicate review/acceptance; Charlie's check results do not replace them.

A candidate earns adoption by improving accepted outcomes or reducing total time/cost/repair while preserving the required quality boundary. Confirmed data loss, false verification, scope leakage or identity corruption is not offset by a favorable average score. Sampling uncertainty remains visible; a small pilot does not establish a global SOTA ranking.

## Construction order and ownership

| Stage | Owner surface | Deliverable | Entry / exit |
| --- | --- | --- | --- |
| E0: value baseline | Scoped implementation fixture and evaluator | Complete input packet, supplied oracle and native-baseline record | Runs alongside plugin work using the existing runtime |
| C0: identity and packaging | `packages/charlie`, tool distribution and thin native registration adapter | Independent plugin, configurable public name, stable identity and ready default tool payload | Consume supported host registration; exercise packaged tools on supported targets; report missing host exposure to its owner |
| C1: work and context | Specialist contract and thin host/Atlas adapters | Consume assigned packet, grants, context and continuity; return implementation evidence | C0 plus actual supplied interfaces; no new persistence/policy/cache/compaction machinery |
| C2: competence corpus | Package-owned skills and workflow assets | Shared backend methods and named stack procedures | Work/context contract fixed → source-cited content review and selected workflow use |
| C3: transports | Thin package CLI/MCP adapters | Same useful capabilities over both transports | Handlers real → actual CLI and stdio MCP conformance |
| C4: polyglot evaluation | Isolated real-project fixtures and pilot runner | Meaningful deterministic cases plus model-level trials | First candidate comparison as soon as C1 plus relevant C2 procedure work; remaining stack coverage expands incrementally |
| C5: Maestro integration | Maestro-owned adapter and narrow shared seams | Same specialist under normal and governed delegation | Standalone cases pass → end-to-end delegation/review/return evidence |
| Host compatibility | Thin adapters for the host versions actually supported | Same scoped implementation behavior on the available native contracts | Harness owns runtime evolution; do not turn a missing V2 seam into a Charlie runtime migration |

The former broad F0 foundation-building stage is removed from Charlie's plan. Host/Atlas maintainers own their existing systems and any independently assigned changes. Charlie integration consumes available interfaces and exposes concrete missing dependencies; it does not absorb their backlog.

Each implementation work package must name exact owner files, base revision, interfaces, checks and dependencies before dispatch. A stage in this plan does not itself authorize publication or certify the previous stage. The first vertical slice should already demonstrate direct use, configurable name, actual Atlas task/project continuity, a useful backend change and truthful evidence. It should not wait for a marketplace, generic orchestrator or every optional tool.

### First value slice: resumable Go reservation repair

Proposed evaluator fixture, not an existing benchmark result: a Go/pgx/PostgreSQL reservation repair whose diagnosis and technical decisions are already supplied. The packet names the affected handlers/SQL/helpers, the identified retry/transaction/cleanup defects, the chosen correction, authorized files, preserved API and exact check commands. Charlie implements that correction; he is not asked to investigate a symptom.

The slice uses direct Charlie with the complete packet, one relevant implementation procedure, scoped read/edit/check tools and the installed Atlas continuity path. Its outcome is the assigned corrected code with real database check results. Pause implementation, resume the same task in another execution Session, rename the public agent and verify its packet/checkpoint/rules remain usable. A separate incomplete-packet case must return a blocker without discovery.

Healthy request, concurrent exact retry, changed-intent conflict and cancellation/cleanup provide the behavior controls. The evaluator creates and seals the actual fixture, reference and failure interleavings; this visible description is only its contract. Baseline/oracle preparation starts before broad skill authoring, and the first candidate comparison starts when this slice runs.

**Native dependencies exercised by this slice:** supplied identity/grants, existing Session persistence/resume and available Atlas context/task-memory interfaces. Test correct consumption, rename and configured placement. Missing required exposure is returned to the native owner; the slice does not build a new persistence, authorization, cache or Memory implementation.

**Further Charlie slices:** deepen assigned implementation skills across the required stacks, validate actual CLI/MCP adapters and optional Maestro integration. Atlas ranking, Awareness production, orchestrator logbooks and harness runtime evolution remain with their existing owners; consuming a capability does not certify its entire subsystem.

Rust, Python, TS/JS, Node/Bun, Effect and Next stay required evaluation families. This sequencing is an early value test, not a Go-only product or a declaration that other stacks are already proven.

## Each slice's dispatch prerequisites

Apply these requirements to the affected plugin work package. E0 can prepare the first scoped fixture/native baseline alongside C0. External native capability gaps are explicit dependencies, not a broad prerequisite campaign owned by Charlie.

- Name the actual host/Atlas interfaces and versions consumed by the slice; do not invent a required replacement API or store.
- Map the supplied native identities and Maestro/caller grants into a thin adapter without changing their authority or ownership.
- Test the integration through actual native capabilities; return unavailable requirements to the existing owner rather than implementing substitute infrastructure.
- Freeze supported host-version seams for selected-agent context and tools; do not infer V1/V2 parity.
- Separate display metadata from hashed authority data before enabling environment-driven specialist names.
- Specify the initial executable capability set and exact schemas; keep guidance-only procedures distinct.
- Select the real evaluation fixture and execution requirements for the dispatched slice. Select the remaining named-stack fixtures in their evaluation packages; full polyglot coverage remains an overall product obligation.

This design stage produces those boundaries and identifies the prerequisite work. The implementation must not claim a capability complete merely because its corresponding document exists.
