# Backend specialist architecture

Status: architecture proposal, not an implemented plugin or a readiness certificate.
Recorded: 2026-10-03. Orchestra source baseline: `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0` (`fork/dev`).
The unmerged Maestro Arsenal reference inspected was `88c31603359ad4ee6cdc8aff285075749fd88812`.

Read the [research synthesis](research/README.md) for competitor strengths, weaknesses, community evidence and adoption decisions. The research reports are supporting material, not an always-loaded agent corpus.

The [backend implementation toolbox](backend-toolbox.md) is the corrected-scope shortlist: contract/SQL/code generation, precise transformations, native boundary libraries, assigned tests and narrowly applicable verified-code techniques. It records concrete outputs and integration costs rather than adding agent infrastructure.

The [skill catalog](skill-catalog.md) defines proposed task-oriented entries and shared references. The [variant matrix](skill-matrix.md) shows concrete changes by scope, language/runtime, framework/library and version, incorporating Matt Pocock and other GitHub sources without importing their broader agent roles.

[Tool distribution](tool-distribution.md) distinguishes HuGR/backend-specialist-owned operations from selected external free/open-source engines supplied ready by default. Skill applicability, installation availability and native/CLI/MCP exposure are separate decisions.

[Owned tool contracts](owned-tools.md) specify the initial qualified Composer operations. [Integration flow](integration-flow.md) connects Maestro/caller, the backend specialist and Atlas; [Atlas Memory](atlas-memory-contract.md) records the canonical `task`/`pr`/`project`/`logbook` templates and their different access modes.

The [technical-depth reference](technical-depth.md) preserves team/foundation engineering knowledge. It is not a discovery or diagnosis playbook for the backend specialist. The role boundary below supersedes earlier research recommendations that assigned those responsibilities to it.

## Role boundary — owner correction

**The backend specialist is the backend implementation specialist for an already-defined scope. The backend specialist does not investigate, diagnose, perform discovery, define the scope or take over another member's responsibility.** Those activities are inputs from their responsible owners.

The backend specialist receives the implementation task, chosen contracts/technical decisions, authorized code targets, relevant context and acceptance/check requirements. It reads the supplied code/context, writes or changes the assigned backend code, implements associated tests only when assigned, executes the specified checks and returns the delta plus observed results.

A missing decision, missing context, contradictory packet or problem outside that scope becomes a precise blocker returned to Maestro or the direct caller. The backend specialist does not open an investigation, pick a new architecture, delegate another member's work or expand its own mandate. Direct use without Maestro preserves this same boundary.

## Existing foundation — ownership, not a backend specialist backlog

- **Maestro** defines and supplies the assigned scope and permissions in team operation. An independent caller supplies an explicit packet through existing host authority; the backend specialist never authors or widens its own grants.
- **Harness** already owns persistence, execution, Session lifecycle, cache, compaction and permission enforcement.
- **Atlas** owns the native Knowledge and Memory capabilities consumed by the specialist.
- **The backend specialist** implements the supplied backend task using those existing capabilities.

Integrating with these owners is not a project to rebuild them. Missing integration capability is reported to its existing owner; it does not become a persistence, policy, cache or compaction subsystem inside the backend specialist.

## Product decisions supplied by the owner

- The backend specialist is a plugin that works independently of Maestro and integrates natively with Maestro.
- The backend specialist executes a clear, preassigned backend scope. Investigation, diagnosis, discovery, scope definition and other members' responsibilities stay with their respective owners.
- It runs on OpenCode/Orchestra. CLI and MCP expose its capabilities; a second conversational/model runtime is outside this design.
- Atlas is the shared foundation of Maestro and the team. Native Knowledge and Memory integration is a requirement.
- The backend specialist owns `task`, `pr` and `project` Memory in Atlas. Its bounded Project Rules are injected through native context; task/PR history is explicitly consultable, with the own resumed-fold contract. Orchestrator `logbook` and shared derived Awareness/Orientation remain distinct.
- Atlas unavailability permits explicitly degraded ordinary work. An operation that requires unavailable Atlas evidence remains blocked.
- Backend coverage is polyglot: Rust, Go, Python, TypeScript, JavaScript, Node, Next, and other project stacks. Do not restrict the product to FastAPI or one initial language.
- Specialists have environment-configurable public names. Only Maestro has a fixed public name.
- Avoid overengineering. Skills, protocols, workflows, CLI and MCP must earn their existence through useful work.
- Keep owned tools distinct from selected external tools. Useful free/open-source engines chosen for the product come ready in the default installation; the user does not install each one per task.
- This design effort investigates competitors and community pain, including Devin, Replit and Grok/Grokbot; it does not assign that research role to the backend specialist. Optimize implementation quality, tokens, tool use and time together.
- Deliver the architecture first; implementation follows this design stage.

The environment variable spellings, package layout and operation shapes below are proposed implementation decisions. They have not been installed.

## Objective

Build an exceptional backend programmer who turns a complete assigned work packet into idiomatic, correct code within its exact boundaries. Technical depth serves implementation quality; it does not confer ownership of diagnosis, architecture or discovery. The default public name is the backend specialist; competence and stable identity do not depend on that label.

Excellence is observable: correct behavior, preserved invariants, useful tests, recovery from failed approaches, concise evidence, and fewer repeated mistakes. A longer prompt, a larger tool catalog, and a claim of being the best are not substitutes for these outcomes.

## User experience contract

The normal interaction uses existing conversation, progress and review surfaces. It does not require a new workflow editor or a configuration questionnaire before useful work.

| Moment | User-visible behavior | Engineering obligation |
| --- | --- | --- |
| Start | Confirm the assigned implementation and begin from its supplied targets | Check packet completeness and consume the supplied code, versions, patterns and Atlas references |
| Missing input | Return the exact missing or contradictory prerequisite | Ask the caller/responsible owner for the needed input; do not substitute discovery or an architectural assumption |
| Work | Report meaningful progress and blockers, with inspectable changes | A planned action, an admitted command and a finished effect remain distinct |
| Redirect/stop | Acknowledge the request and make its effective state visible | Preserve native steer/queue boundaries and interruption ownership; retain useful partial work |
| Finish | Explain what works, how to use it, what changed and what was actually checked | Link relevant tests/runtime observations to the current artifact; distinguish local success from deployment success |
| Return later | Resume the same assigned implementation from its recorded checkpoint | Use native identity/currentness checks; return changed-scope or stale-packet conflicts to the caller |
| Failure | Return the observed failure, affected assigned check and relevant evidence | Adjust assigned implementation within the supplied contract; return unresolved causes or out-of-scope failures for diagnosis by the responsible member |

Novices get plain-language outcomes and runnable examples. Experienced engineers get exact diffs, commands, revisions and tradeoffs on demand. The correctness bar is the same; presentation depth changes with the user and task.

The key differentiation is less user rescue: fewer repeated explanations, surprise rewrites, false completion claims and paid dead ends. These are evaluation hypotheses grounded in [community evidence](research/15-community.md), not a claim that every competitor currently exhibits each failure.

## Definition of Done

- A user can select the specialist directly without a Maestro installation or session.
- Both direct and delegated calls supply a clear implementation packet; incomplete scope produces a blocker, not a self-assigned investigation.
- Maestro can delegate to the same implementation through a native work contract and receive a structured result.
- Atlas project rules survive Session changes and display-name changes; task memory follows the exact logical task being resumed.
- Library, native tools, CLI and MCP share handlers, schemas and result semantics.
- The published default external toolset is installed and usable on supported host targets, with its actual tool dependencies, versions and invocation paths.
- Stack-specific behavior is exercised against real projects and tools for the required language/runtime families.
- Backend work can complete in normal mode without introducing mandatory approval or orchestration ceremonies.
- Native integration, runtime/version compatibility and evaluation results are documented with their actual tested scope.

## Invariants

- Atlas owns Knowledge, Memory, grounding, freshness, memory storage, ranking and archival policy. Consumers do not create a competing memory database.
- Display name is presentation. Stable member identity controls routing, permissions, memory ownership and provenance.
- Native host placement and execution identity cannot be supplied or replaced by model arguments.
- A worker's narrative cannot mint approval, independent review, successful verification or integration authority.
- The specialist makes implementation decisions inside its mandate. Cross-owner architecture, scope expansion and product decisions return to the responsible owner.
- Tool availability and Atlas access do not authorize investigation, diagnosis, discovery, self-delegation or work outside the assigned packet.
- An unavailable check, partial observation or failed memory write remains explicitly unavailable, partial or failed.
- A memory entry cannot override live user instructions, the current work contract, host permissions or fresh Knowledge.
- Runtime dependencies point from consumers toward Atlas; Atlas never imports a specialist or Maestro.

## Architecture

```text
User with defined scope               Maestro with assigned packet
       \                              /
        OpenCode / Orchestra host adapters
        - actual Session and selected member
        - Location, tools, permissions, model execution
        - bounded system-context admission and evidence
                         |
                  Backend plugin
        - stable identity and public-name rendering
        - concise charter and demand-loaded skills
        - work/result protocol and workflow templates
        - backend-specific capabilities when justified
                         |
               Native Atlas foundation
        Knowledge / verified Own / member Memory
        Awareness / Orientation / Rules / task recall

CLI adapter ------- shared capability handlers ------- MCP adapter
```

### Ownership boundaries

| Component | Owns |
| --- | --- |
| Backend package | Specialist charter, skills, workflow templates, typed work/result contract, backend-specific computation |
| Tool distribution | Selected external executables/helper environments, pinned versions, supported-target artifacts and installation readiness |
| Host adapter | Consume native actor/Session/Task/Location bindings and runtime services; enforce supplied grants through existing harness mechanisms |
| Atlas foundation | Shared Knowledge; per-member task/PR/project Memory; derived slabs; storage, write doors and read semantics |
| Maestro adapter | Receive Maestro-defined scope, permissions and work packet; return implementation results; orchestration and grant decisions remain with Maestro |
| CLI/MCP adapters | Parse and validate inputs, bind their real caller/project context, invoke shared handlers and encode results |
| Provider runtime | Model selection, credentials, provider turns and usage; supplied by OpenCode/Orchestra |

The proposed specialist package is `packages/backend-specialist`. It does not import Maestro services, Core databases, Server internals or the vendored Atlas implementation. Orchestra-specific composition remains host-owned. The installed Atlas boundary is a shared foundation package, not a module hidden inside the backend specialist.

The backend package consumes the native Atlas contract its owner exposes. The previously suggested `/memory` export was a foundation packaging option, not a required the backend specialist deliverable or an installed API claim. Existing boundary isolation remains intact; the backend specialist carries no private Atlas copy or Memory store.

### Complexity budget

The first implementation adds the specialist package and the thin adapters needed to consume existing host/Atlas contracts. Persistence, permissions policy, cache, compaction, execution coordination and Memory storage are not new backend specialist deliverables. A missing contract is an external dependency for its owner, not permission to recreate the subsystem.

Normal package installation also supplies the chosen external toolset through ordinary packaging mechanisms. This is product distribution, not a second agent runtime. A CLI used through native shell can be a fully integrated default without a redundant MCP wrapper.

Start with one dependable implementation path. Host/caller owners select model/runtime policy; other members retain investigation, architecture and review. The backend specialist does not acquire a critic team, background discovery or self-delegation as an optional extension. Small and difficult assigned changes both retain the same closed role boundary.

### Initial runtime and compatibility boundary

The first end-to-end integration targets Orchestra's existing **V1 server-plugin/Agent/Task path**, where the current native specialist roster and Maestro delegation actually execute. This choice avoids making a Core runtime migration a hidden prerequisite for proving the backend specialist's value. “Maestro V2” as a product program is not the same term as Core's `SessionV2` execution runtime.

The package also targets standalone OpenCode through its actual supported V1 plugin loader; installation, selected-agent binding and context/tool behavior must be verified against each claimed version. Maestro's absence is part of that test, not an inferred property of packaging.

V2 context and tool adapters are a separate compatibility work package using the same specialist/foundation contracts. V2's durable inbox, steer/queue and Context Epoch semantics are requirements for that adapter, not guarantees attributed to V1. Never run the V2 model loop through legacy `SessionPrompt.loop(...)` to manufacture parity. V2 governed delegation remains unavailable until its native Task/authority seam is actually supported.

## Direct and delegated operation

Both modes use one specialist and one body of skills.

**Direct:** the user or another caller supplies a clear backend implementation packet without Maestro. The backend specialist executes that packet and reports its result. Missing scope/context returns to that caller; standalone packaging does not turn the backend specialist into a generalist or orchestrator.

**Delegated:** the host binds a bounded work item, its exact source baseline and execution context. The specialist receives the necessary artifacts and constraints, performs its work, and returns a compact result to the delegator. It does not inherit the author's complete transcript as its specification.

**Governed:** an additional execution mode requiring the existing Maestro authority chain. The backend package consumes a verified host capability; it does not parse approval prose or manufacture an `authorizationID`. Ordinary direct/delegated work stays available independently of this mode.

### Judgment boundary

Local coding choices remain inside the supplied interfaces, behavior, scope and implementation latitude. The backend specialist does not choose public API shape, cross-package architecture, migration strategy, product policy or a root-cause hypothesis. If those are needed and absent, the work returns to its owner for completion. Reading the named implementation files and using supplied patterns is execution preparation, not authorization to explore the repository.

## Identity and configurable names

The proposed public-name variable is `HUGR_BACKEND_NAME`, defaulting to the default label (`BACKEND_DEFAULT_LABEL` in `packages/opencode/src/maestro/roster.ts`) when absent. For example, `HUGR_BACKEND_NAME=Ada` renders Ada while preserving the same backend specialist.

| Identity | Meaning | Survives display rename? |
| --- | --- | --- |
| `memberId` | Stable native specialist ID; retain existing `backend` for compatibility | Yes |
| `displayName` | Configurable presentation label | Changes |
| `projectId` | Host-resolved project identity | Yes |
| `taskId` | Stable logical work item, distinct from a model turn or attempt | Yes |
| `authoritySessionId` | Direct stakeholder conversation retained by the native delegation binding | Yes |
| `executionSessionId` | Actual Session currently executing the specialist; a child under delegation | Yes |
| `executionActor` | Existing project + authority Session + actual member provenance identity | Yes |
| Memory ownership | Project + stable member; task/PR adds its own logical unit | Yes |

`backend` as an internal compatibility ID is not a fixed public persona name. Tool IDs, package names and machine handles remain stable; human-facing labels use the configured name.

Proposed team-wide name convention:

| Stable member | Public-name environment variable | Default |
| --- | --- | --- |
| `backend` | `HUGR_BACKEND_NAME` | The backend specialist |
| `patty` | `HUGR_FRONTEND_NAME` | Patty |
| `lucy` | `HUGR_REVIEWER_NAME` | Lucy |
| `bobby` | `HUGR_ARCHITECT_NAME` | Bobby |
| `billy` | `HUGR_SECURITY_NAME` | Billy |
| `jimmy` | `HUGR_EXPLORER_NAME` | Jimmy |
| `rosie` | `HUGR_DOCS_NAME` | Rosie |
| `frankie` | `HUGR_AUDITOR_NAME` | Frankie |
| `maestro` | None | Maestro |

Name resolution belongs to host startup/configuration, not model input. Blank, multiline, control-character and reserved Maestro labels need explicit configuration errors. Unicode names are supported. Duplicate display labels in an active roster require a diagnostic; they never change routing. Prompts, menus, task titles and return-card labels consume the same resolved name.

Cross-member instructions and approval/tool descriptions resolve a role by stable ID and render its current label. Renaming the reviewer must not leave Maestro routing by the literal word `Lucy`, for example.

Roster/policy hashes bind behavior and stable identities, not cosmetic labels. Name changes must not invalidate historical receipts or silently orphan project memory. The current validation implementation hashes the full roster, so introducing dynamic labels requires separating the presentation projection from the authority projection first. Hash the canonical behavioral template rather than its display-name interpolation; preserve versioned verification of historical receipts.

Direct operation can have equal authority and execution Session IDs. Delegated operation inherits the stakeholder Session from native authority binding and records its child Session separately. The canonical actor identity fields remain `{ projectId, sessionId: authoritySessionId, memberId }`, within the existing versioned serialization; the executing member is the backend specialist, not the delegating Maestro. The child cannot select a different authority Session in a tool argument.

Native adoption must also replace the existing protected `backend` placeholder through an explicit host registration seam, enable primary-capable direct selection and retain delegated restrictions. UI normalization and task/draft payloads must preserve stable IDs separately from rendered names. An environment variable alone cannot fix current paths that route through `.name`.

## Work and result protocol

The host supplies native identity and placement. Maestro supplies team scope and grants; a standalone caller supplies the explicit packet through existing host authority. These inputs are read-only to the backend specialist and separate from model-authored result content.

```text
HostBinding
  projectId, memberId, authoritySessionId, executionSessionId
  taskId, existing execution references
  actual source worktree, baseline/revision evidence
  allowed operations and resource scope
  Atlas project binding and optional governed authorization

WorkRequest
  specified implementation change and acceptance
  supplied design/decisions; supplied diagnosis and fix direction for a repair
  authorized read/write targets, interfaces and relevant patterns/context
  stack/runtime versions, dependencies and constraints
  assigned tests and exact verification commands/cwd; known baseline failures
  implementation latitude and escalation boundary
  caller/responsible-owner return address for blockers

WorkResult
  taskId, execution: ended | blocked | failed | interrupted
  changes and exact source/artifact references
  checks: passed | failed | skipped | unavailable, with evidence
  verification: verified | failed | incomplete
  acceptance: pending | accepted | rejected, with actual deciding authority
  unresolved decisions, risks and next actions
  Atlas memory-write/read outcomes and pointers
```

The specialist can return a candidate and its evidence. A host verifier or the user supplies the applicable verification/acceptance decision; a model-written `accepted` field cannot certify itself. A completed tool operation establishes that operation's outcome, not acceptance of the whole backend task.

Adapters preserve original terminal reason, partial/truncated coverage and any known uncertainty about effects. A caught nested failure, exhausted retry latch or usable child summary cannot be flattened into verified task success. When observable, result persistence and delivery/parent consumption remain separate facts; a delivery retry should reuse retained work rather than regenerate it.

The work packet can be concise ordinary text or existing Session data; a form and a new task database are unnecessary. Its scope, decisions and context must already be supplied rather than discovered or inferred by the backend specialist. Logical task identity remains explicit at the Atlas boundary. A standalone caller can supply the packet without a Maestro-issued task ID.

An interrupted attempt may resume the same Session. A replacement Session can continue the same logical task only through explicit host binding; it does not inherit authority from a copied task-name string. The existing generic Task fallback for an unknown `task_id` is not a sufficient strict-resume contract.

Execution references reuse existing message/tool/provider identities. A process-local Session drain does not become a new durable task, run or transcript container. The backend work/result view is an adapter over actual work; it is not another scheduler.

## Context discipline

- The base charter carries role, judgment boundary, tool discipline and result expectations.
- Backend concepts and stack-specific practice live in demand-loaded skills.
- Atlas supplies the bounded project header and the assigned verified Own references. Missing references/coverage return to their owner; the backend specialist does not search for substitute scope.
- Header means shared derived Awareness + Orientation and the backend specialist's always-injected bounded `project` Rules. This does not depend on invoking a memory skill; it does not inject the entire task/PR archive or Maestro's logbook.
- Task/PR memory is recalled for the assigned work; the own closing fold is admitted once for an actual resume. Memory never expands the current role or packet.
- Large artifacts stay behind existing output/resource pointers. A pointer is useful only while its bytes remain recoverable.
- Existing Session History, System Context and Context Epoch machinery remain the host's conversation model.

For V2, ordinary Atlas degradation is an explicitly rendered context value, not a direct mapping to `SystemContext.unavailable`, which currently blocks initial baseline creation and retains prior values on refresh. A member switch retires the previous member's active rules and admits the new member's state. Previously admitted task context remains attributed history; this is no new cross-member injection or authority inheritance, not a confidentiality or history-erasure promise. [Atlas integration](atlas.md#host-context-admission) defines the state mapping.

Details: [Atlas integration](atlas.md) and [competencies, workflows and evaluation](capabilities.md).

## Efficiency is part of correctness

Optimize total cost and time to an accepted outcome, including failed attempts and user repair. Reducing tokens by omitting necessary contracts, failure evidence or verification is a regression. Repeatedly rereading unchanged context, loading an entire skill corpus, and rerunning unrelated checks are also regressions when they add no useful evidence.

Reuse native cache-stable context, batch independent reads, load exact procedures on demand and preserve expandable evidence. Initial budget controls use actual host capabilities. An estimate is not a provider-enforced spending ceiling; missing usage is not zero. [Efficiency design](capabilities.md#efficiency-contract) defines the measurements and adoption tests.

## Quality Standards

- Prefer the repository's existing architecture, libraries, commands and test runners.
- Keep implementation minimal within the supplied design and acceptance boundary. Do not introduce an architectural change or an unrelated refactor.
- Test behavior through real implementation and relevant failure paths. A database compatibility claim needs the actual database semantics in its evidence.
- Execute the assigned verification and mandatory project checks applicable to the packet. A need for broader impact analysis or additional scope returns to the responsible owner.
- Keep public contracts, migrations, rollback assumptions, observability and operational effects explicit.
- Independent review remains independent. The specialist's self-check is useful preparation, not a replacement for a cold reviewer.

## Completeness Criteria

- Every named native behavior has a source seam, an owner and an acceptance scenario.
- Normal and governed modes have separate authority expectations.
- Direct use, Maestro delegation, resumption, display rename and Atlas degradation are all covered.
- Missing decisions, unexplained failures and requests for discovery are returned to their owners; solving them by taking over another role is an evaluation failure.
- The capability inventory has no advertised operation without an executable handler or an explicit guidance-only designation.
- Each named stack has held-out evaluation cases. Unsupported versions and absent tools are reported without fabricated results.

## Success Criteria

- A user gets a backend change that satisfies the request, fits the existing system and carries credible verification.
- A returning specialist avoids repeating a recorded failed approach and respects relevant project rules.
- Maestro can consume the result without reconstructing the worker's entire reasoning or rediscovering its scope.
- Quality improvements are measurable against the same model and task baseline; prompt size and tool count are not success metrics.

## Current source anchors

- `packages/opencode/src/agent/agent.ts`: native roster registration, default selection and protected specialist configuration.
- `packages/opencode/src/maestro/roster.ts`: stable members, initial profiles and short role prompts.
- `packages/opencode/src/maestro/validation-record.ts`: current roster/grant/review-policy hash inputs.
- `packages/opencode/src/tool/task.ts`: child creation, resumption and governed execution paths.
- `packages/plugin/src/index.ts`, `packages/plugin/src/v2/effect/context.ts`: actual V1 and V2 plugin extension surfaces.
- `packages/core/src/system-context/registry.ts`: scoped context composition.
- `specs/hugr-maestro/actor-identity-contract.md`: ratified Session-composed execution provenance.

These are source observations, not a report that the new design has run. The follow-on documents record integration gaps and the construction order.
