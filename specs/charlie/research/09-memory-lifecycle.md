# R09 — Portable memory lifecycle for Charlie / Atlas

Research date: 2026-10-03. Research-only; source inspection, not runtime validation.

## Decision

**Adopt identity separation, bounded context selection, explicit correction lineage. Adapt promotion and compaction behind Atlas. Reject name-derived identity, automatic learned-rule authority, and another memory store/runtime.**

Charlie remains independent backend-specialist plugin on OpenCode/Orchestra; Maestro-native composition uses same Atlas contracts. Atlas owns durable Knowledge/Memory. Project continuity and execution identity have different keys and lifetimes.

### Evidence boundary

- **Mem0 pin:** [`abb81c88e1f738a8117d8293530fbc31a5ef8fd9`](https://github.com/mem0ai/mem0/commit/abb81c88e1f738a8117d8293530fbc31a5ef8fd9), commit dated 2026-10-01. Inspected Python OSS engine, prompts/history, native OpenCode integration, pinned Platform docs.
- **Mastra pin:** [`daf5de73b5662bb8d4293bb7f7e649aff9bc48cd`](https://github.com/mastra-ai/mastra/commit/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd), commit dated 2026-10-03. Inspected memory/core source and pinned docs. Memory package declares `1.36.0-alpha.2`; Subconscious explicitly experimental. Findings concern this source snapshot, not every released version. [A12] [A13]
- **Native baseline:** private worktree HEAD `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`. Read Git objects `specs/hugr-maestro/actor-identity-contract.md` and `atlas-foundation-seam-register.md`; these establish intended seams, not proof of current adapter implementation. Historical test claims inside those documents were not rerun or adopted.
- Below, **source** means inspected implementation; **docs** means upstream assertion; **proposal** means Atlas/Charlie adaptation. Source tests were read selectively, not executed. Hosted Mem0 behavior remains documentation-backed. No benchmark, latency, accuracy, compression-ratio, or savings claims adopted.

## 1. Identity, scope, and lifecycle

| Surface | Concrete upstream pattern | Portable consequence / trap |
| --- | --- | --- |
| Mem0 OSS scope | `_build_filters_and_metadata` requires user, agent, or run identifier; supplied identifiers compose query filters. Identity keys in freeform metadata are stripped; update preserves existing identity. [M1] | Adopt typed scope supplied by host. User/agent/run filters describe partitions, not caller authorization. `agent_id` alone must not become globally shared specialist authority. |
| Mem0 OpenCode scope | Shared helpers distinguish project `(user, app)`, session `(user, app, run)`, global `(user)`. Project default omits run ID. [M4] [M8] | Useful lifetime separation. These are Platform integration semantics; Python OSS engine's first-class identity tuple differs. Don't conflate `app_id`, hosted project container, and Charlie's project identity. |
| Mem0 project identity | Plugin honors explicit `MEM0_APP_ID`; otherwise parses remote owner/repo into `owner-repo`, then falls back to directory basename. Parser omits host. [M4] [M9] | Clones can share key, but repository rename/transfer changes it. Same owner/repo on different hosts collides; basename fallback also collides. Treat names/remotes/paths as aliases only. |
| Mastra resource/thread | Persistent resource-scoped working memory crosses threads; thread scope isolates conversations. Switching scope selects separate storage, not migration. [A1] [A2] | Strong conceptual split: project knowledge survives Session; task working set remains locally selected. Mastra “working memory” itself is durable text/JSON, not merely ephemeral prompt selection. |
| Mastra delegation | Docs derive resource as `{parentResourceId}-{agentName}`, create fresh thread per delegation. Shared resource lets directly-called agents share working memory. [A1] | Agent rename and supervisor change can fragment memory. Sharing IDs also shares mutable state. Stable member ID needed; display name never key. |
| Mastra project override | `resolveKnowledgeResourceId` reads host `knowledgeResourceId` while leaving execution resource/thread untouched. Source test asserts cross-session pin visibility and changed-scope cache lookup. [A5] [A17] | Best direct analogue for Atlas project continuity alongside Session-bound actor. Experimental source pattern, not recommendation to install Subconscious. Test uses in-memory storage/mocks; not persistence or production proof. |

### Proposed native mapping

Logical semantics below; no new store, API names, or implementation claimed.

| Item | Durable identity / lifetime | Selection and authority |
| --- | --- | --- |
| Project knowledge | Stable native `projectId`; survives Sessions, display-name changes, folder moves | Atlas-owned, with explicit visibility and applicability. Repository aliases resolve to identity rather than generate identity anew. |
| Specialist knowledge | `projectId` + stable `memberId` + applicable domain | Agent-scoped knowledge is audience/applicability, not enduring execution actor. Charlie backend experience stays version/environment qualified. |
| Task evidence | Project + immutable native Task reference; records may outlive execution | Link each contribution to actual Session actor. A later Session may reuse evidence but gains no prior execution ownership. |
| Execution provenance | Existing `ComposedActor = { projectId, sessionId, memberId }` in Maestro-native flow | Task ID attached beside actor. Same Session recovery preserves actor; new Session changes actor. Preserve existing canonical serialization contract. |
| Working set | Session-owned context selection / Context Epoch | Bounded projection of Atlas records plus current Task/Session state; cache is disposable, not second durable memory. |

Charlie standalone must resolve native project/member/Session context without requiring Maestro process or Maestro-owned scratchpad. Maestro composition supplies existing actor envelope; same Atlas ownership rules apply. Stable role identity does not confer unchanged permissions after ownership transfer.

**Rename versus transfer:** rename changes aliases only. Ownership transfer changes authorization/visibility; historical authorship stays intact. Fork/new project needs explicit new identity and selective evidence import. Never silently merge projects because remotes or names match.

## 2. Promotion: capture is not acceptance, acceptance is not pinning

### Mem0: current path differs from familiar descriptions

**Source:** current Python `_add_to_vector_store` retrieves related memories and recent messages, invokes `ADDITIVE_EXTRACTION_PROMPT`, embeds extracted text, deduplicates hashes within retrieved results/current batch, persists ADD records. `infer=False` stores raw non-system messages directly. Legacy `DEFAULT_UPDATE_MEMORY_PROMPT` still describes ADD/UPDATE/DELETE/NONE, and `add()` docstring retains that story; inspected active extraction path is ADD-only. [M1] [M2]

**Useful:** new evidence can coexist with old evidence; explicit `update`/`history` remain available. Prompt asks for source attribution, transitions, temporary/trial qualifiers, exact names/numbers, and no detail contamination from old context. Borrow these extraction criteria, not trust in their enforcement.

**Traps:**

- Prompt extracts from both user and assistant, including recommendations and proposed plans; says **“When in doubt, extract.”** Repeated assistant advice can become apparent project fact unless source role and acceptance stay explicit.
- Hash dedup covers bounded retrieval results/current batch in inspected path, not global semantic uniqueness or retry idempotency.
- Native OpenCode plugin periodically auto-captures user text at project scope with literal `confidence: 0.7`; this is configured metadata, not calibrated probability. Compaction hook writes a status string as a user-role memory and asks model to save more learnings. Compaction pressure thereby encourages promotion. [M4]
- Procedural-memory branch generates an LLM summary of execution history, and source marks support for future removal. Its prompt asks to preserve every output verbatim; that instruction is neither archival integrity nor bounded context. [M1] [M2]

### Mem0 Platform Dream: useful lineage; different authority model

**Docs:** synthesis adds pattern memories beside originals, links sources, claims idempotency; opt-in synthesis applies only to future eligible user-only memories, excluding memories also carrying agent/run/app identity. Supersede and Merge run automatically. Superseded memories still surface by default; `latest_only=true` requests active facts. Merged records are retained but hidden by default. [M5]

**Adapt:** explicit `derivedFrom`, `supersedes`, and current-versus-historical read modes. **Reject:** automatically treating synthesized pattern as standing backend rule. User-only synthesis eligibility also makes direct transplant ill-suited to project/member/task evidence. Hosted behavior and implementations were not executed or inspected.

### Mastra: working-memory tools and experimental curation

**Source/docs:** working-memory tools persist model-written text/JSON. Subconscious curator can create, append, remove, rename, merge, rescope, and synthesize knowledge; opting into Subconscious defaults observation agents to remind/curate and default write scope to resource. `maxScope` is configurable, not an implicit universal prohibition on widening. [A2] [A6] [A13]

**Useful hard boundaries:** tool code supplies `sourceThreadId`, checks visible scope and scope ceilings, and requires expected versions for node changes. Rescope checks both configured ceiling and record ceiling. Curator prompt labels observations untrusted. Origin helper strips subconscious-generated signals from candidate messages, a useful defense against learning from recalled memory again. [A6] [A14] [A16]

**Limits:** prompt distrust is not semantic validation. Code-bound source thread is coarser than exact claim-to-message/part evidence. Model-supplied `when` has format checks, not proof of event time. Scope visibility is not full policy authorization.

### Proposed lifecycle inside Atlas

`source evidence → candidate claim → accepted scoped claim → superseded / invalidated / expired / retracted`

- Capture observations at narrow scope; distinguish statement, question, proposal, observed tool result, inferred pattern, and explicit instruction.
- Promote cross-task rule only with backing authority/evidence: explicit project instruction, authoritative repository artifact, or independently checked outcome within declared conditions. Repetition, retrieval frequency, successful summarization, or confident wording do not qualify.
- Automatic extraction may create candidates. Deterministic policy can accept suitable factual records; it must not silently widen scope or turn one task workaround into project policy.
- Pinning is separate context-residency decision. Relevance/importance and truth/authority are separate fields.
- Existing Task/Session system remains source of execution status. “User acknowledged answer” is weaker than “change applied and verified”; summary completion markers cannot resume or complete execution.

## 3. Working-memory selection and context pressure

### Patterns worth borrowing

1. **Small structured active state.** Mastra schema working memory deep-merges objects, treats null as deletion, replaces arrays; Markdown updates replace full block. Read-only delivery separates reader from writer. [A2] [A18] Use explicit patch/revision semantics at Atlas boundary; do not make model rewrite shared project notebook each turn.
2. **Pinned versus on-demand.** Experimental pins have count/text budgets; curator instructions reserve them for unconditional constraints costly to rediscover and unlikely to be searched. Unpin when no longer true. [A14] [A15] Adapt admission budget to actual token cost and applicability, not only character count.
3. **Nearby evidence.** Semantic recall selects matches plus surrounding messages; scope and metadata filters constrain candidates. Neighbor spans can preserve correction or exception omitted by isolated match. [A3]
4. **Recoverable compression.** OM retrieval mode links observation groups to raw message ranges, exposes paged recall, optionally semantic search. Observation scope can remain thread-local while recall reaches other authorized threads. [A4]
5. **Final prompt-budget check.** TokenLimiter budgets provider prompt after earlier transforms, groups tool calls/results, and errors when system content alone exhausts budget. Its default best-fit can skip oversized recent material while keeping smaller older groups. Inspected hook counts prompt messages; tool definitions and reserved generation budget need separate accounting. [A9] Adopt final-budget location and exchange integrity; protect current request explicitly instead of copying generic best-fit selection.
6. **Safe activation boundaries.** OM safe-buffer-prefix code defers pending newest tool exchange, timestamp cursor collisions, split exchanges, and ambiguous tails. Buffered activation clears delayed continuation hints that could be stale. [A4] [A8] Prefer durable native message/part identity and Context Epoch over timestamp-only cutoffs.

**Pressure trap:** OM docs distinguish activation thresholds from hard caps. Background observation may fall behind; `failurePolicy: 'continue'` retains unobserved messages, so sustained provider outage can exhaust main model context. Reflection may return smallest acceptable candidate still above target. Compression success therefore cannot substitute for final native request-budget check. [A4]

### Qualifier loss is concrete tension, not solved by better prose

Mem0 prompt explicitly preserves qualifiers, temporary changes, exact values. Mastra Observer distinguishes questions from assertions, names state transitions, preserves concrete outcomes, and separates statement time from referenced event time. [M2] [A11]

Mastra Reflector nevertheless rewrites entire observation log and escalates compression toward **“Fewer, more generic observations”**, drops procedural steps, and keeps final state of incremental progress. Recent detail receives preference. Those instructions create predictable pressure against old exceptions and negative evidence. [A7]

Example control fixture:

> Only PostgreSQL migration worker v2 may use `pg_advisory_xact_lock`; never request handlers. Temporary exception until issue DB-42 closes. MySQL service uses a different lock protocol.

“Project uses advisory locks” is unacceptable promotion or summary. Preserve engine/version, worker-only boundary, prohibition, temporary condition, source, and uncertainty. Link raw evidence for exact SQL, commands, diagnostics, and test scope; reload when decision depends on them.

### Atlas-native selection proposal

- Resolve project, member, Task reference, current Session actor, repository/environment revision, and authorized scope first.
- Apply hard eligibility before ranking: authorization, accepted/candidate status, supersession, validity interval, language/runtime/component applicability. Current Task-local exception does not overwrite project default; contradictory applicable claims remain visible as conflict.
- Allocate bounded context among current request/active tool exchange, applicable standing constraints, Task state, relevant accepted evidence, compact historical pointers. Subtract tool definitions, reserved output, protected native context, and token-estimation margin from model limit before admitting optional memory. Current authoritative repository state outranks stale learned claim.
- Emit selection receipt: Atlas record IDs/revisions, source pointers, inclusion/omission reasons, budget, conflicts, and context epoch. Separate valid empty result from unavailable retrieval, invalid identity, and stale projection.
- At pressure: drop redundant/irrelevant recall first; retain constraint-plus-exception as unit; replace older evidence with attributable summaries/pointers; preserve recent boundary-safe tail. If protected content cannot fit, return explicit pressure condition rather than silently weaken constraints.
- Any condensation reuses native Orchestra facilities/provider path. Atlas owns derived record and lineage; Session owns activation/History selection. No extra Observer/Reflector execution loop.
- Background result must match source revision, scope/ownership revision, and intended context epoch before activation. Cancellation, correction, or project switch can invalidate it.

**Cost:** richer eligibility/receipt work and source lookups; optional condensation adds existing-provider usage and latency. Stable context prefixes may improve cache reuse, but dynamic corrections must win over cache stability. Benefit unmeasured.

## 4. Correction, provenance, stale rules, ownership

| Finding | Concrete evidence | Adaptation |
| --- | --- | --- |
| History is not source provenance | Mem0 stores old/new text, operation, timestamps, actor/role; recent-message buffer evicts older messages. ADD payload builder copies caller metadata and `attributed_to`; extracted `linked_memory_ids` requested by prompt are not copied by that builder. [M1] [M2] [M3] | Preserve exact evidence pointers separately. Mutation log proves change history, not factual support. Caller metadata can carry provenance, but automatic per-claim lineage is not established by inspected builder. |
| Historical import can misanchor time | Mem0 prompt helper defaults observation date to current UTC date; active OSS call passes no historical timestamp, and OSS `add(timestamp=...)` rejects it. Past context is character-truncated. [M1] [M2] | Carry source observation/event times explicitly. Never infer event time from ingestion time. Keep vague dates vague; no invented precise date. |
| Correction spans derived views | Mem0 update writes vector payload then history; entity cleanup is best-effort. Delete records previous text in history. Mastra semantic embeddings retain saved thread metadata until reindexed. [M1] [M3] [A3] | Atlas correction invalidates summaries, pins, indexes, and cached Context Epoch inputs. “Deleted from retrieval” does not establish physical erasure of history/derivatives. |
| Shared text can lose concurrent updates | Mastra working-memory writer serializes via instance-local mutex. Knowledge node tools separately expose expected-version edits. Pin edit issues remove then append. [A6] [A10] [A15] | Use Atlas revision/CAS and explicit atomic or resumable replacement. Local mutex alone does not establish multi-process isolation; two-step pin replacement has failure gap at interface. |
| Decay is not invalidation | Mem0 Platform decay rewards returned search results; ranking adjustment does not invalidate stale facts. Final top-k membership can still change. [M6] | Search exposure is not independent validation. Frequently recalled wrong rule can reinforce itself. `lastVerifiedAt` changes only on evidence check, not retrieval. |
| Expiration is not deletion | Mem0 expiration hides search/list results after inclusive UTC date; ID fetch still returns record, malformed stored dates treated unexpired. [M7] | Separate valid-until, review-due, visibility, and retention. Enforce eligibility on every use path, including pins and direct fetch. |
| Ownership docs need qualification | Mastra overview says thread owner cannot change; source has `updateThreadResourceId`. It commits storage transfer, deletes/rebuilds semantic vectors, surfaces migration failure, and permits same-owner retry to repair partial migration. [A1] [A10] | Explicit transfer operation, retryable projection repair, and authorization recheck. Do not infer transfer impossible from overview; do not treat storage transfer as proof all dependent memory moved. |
| Resource-wide OM mixes active tasks | Mastra deprecates resource-scoped OM, citing cross-thread task continuation, cache invalidation, and aggregate processing. Switching scope does not migrate old observations. [A4] | Keep active execution/context epoch Session-local; select shared project knowledge deliberately. Migration needs explicit coverage, not config switch. |

**Minimum useful provenance envelope:** Atlas record ID/revision; scope and widening ceiling; claim kind/status; source Session/message/part or artifact/commit reference; source speaker/tool; actual composed execution actor and optional Task reference; observed time versus event/validity time; conditions/version/environment; derivation inputs/version; correction lineage. Store acceptance reason and verification evidence where relevant. Model attribution labels supplement host provenance, never replace it.

**Stale learned rule policy:** explicit correction supersedes old claim for matching applicability. Preserve history for “what was true then?” requests; current-use selection excludes retired claim. Dependency/toolchain changes mark affected rules review-due. Old rule remains historical evidence, not default instruction. Test against relevant backend/version before reuse when validity unresolved.

## 5. Ranked proposals and costs

| Rank | Decision | Scope and payoff | Cost / condition |
| --- | --- | --- | --- |
| **1** | **Adopt** stable project/member memory keys plus Session-bound execution provenance | Borrow Mastra project override semantics; use native identity contract. Survives renames without cross-Session actor reuse. | Moderate seam/alias/ownership work. Requires proof of actual Atlas adapter and native project resolver. |
| **2** | **Adopt** bounded, read-only working-set projection with source receipts | Pins + contextual recall + exact source rehydration; Session owns Context Epoch. | Moderate selection/trace work; recurrent token cost for pins and occasional source fetch. |
| **3** | **Adapt** evidence-backed promotion, versioned correction, explicit supersession | Borrow Mem0 additive evidence/Dream lineage and Mastra scope ceilings/CAS. Atlas decides durable authority. | Higher policy, lineage, invalidation, and concurrency work. Can begin with explicit scoped facts before learned patterns. |
| **4** | **Adapt cautiously** recoverable pressure compaction | Borrow OM source ranges, pending-tool boundaries, staged activation; preserve qualifiers. | Higher evaluation/activation complexity; provider cost only through existing native path. Accept only after semantic-loss controls. |
| **5** | **Reject** automatic rule promotion, name/path-derived keys, retrieval-as-confidence, one shared project observation log | Avoid source-backed failure modes above. Reject importing Mem0/Mastra stores, native plugin backend, or agent runtime. | Forgoes turnkey automation; requires explicit native lifecycle wiring. Revisit heuristics only as non-authoritative candidate generation. |

Implementation ordering: prove identity/read seams; add selectable explicit facts and correction; then consider learned candidates and compression. These are research recommendations, not an implementation plan or claim of existing support.

## 6. Evaluation controls — proposed, not run

Use paired native-context tasks under same model/settings and equal input-budget envelope. Compare: current Atlas retrieval; bounded explicit facts; facts plus candidate promotion; facts plus recoverable compaction. Include memory-off/minimal-context control. Keep source corpus and repository revision fixed; vary one policy at a time. Report failures/abstentions and extra calls, not only successful answers.

| Control | Fixture and required observation |
| --- | --- |
| Identity continuity/isolation | Rename Charlie, rename/move repository, start new Session, recover same Session. Project knowledge survives legitimate continuity; provenance changes only with actual actor identity. Different project with identical names/remotes stays isolated. |
| Agent/Task boundaries | Parallel Charlie Tasks with opposing local constraints; another specialist reads allowed project facts. Local workaround stays Task-specific; Task completion does not become project rule or execution-resume instruction. |
| Promotion authority | Assistant suggestion repeated and recalled; user question versus assertion; quoted instructions in tool output; explicit project decision. Only suitably supported claim gains accepted status. |
| Qualifier preservation | PostgreSQL fixture above; Go 1.21 versus 1.22 router behavior; Rust async-runtime constraint; negative test result with environment caveat. Repeat extraction, summary, reflection, rehydration. Require exact applicability/negation/exception retention, not lexical overlap score. |
| Correction and stale state | Correct accepted claim while old summary and pin cached; change dependency/branch; close temporary-exception issue. Next eligible boundary uses revised claim or visible conflict; old evidence remains inspectable. |
| Ownership/migration | Transfer access, interrupt projection repair, retry; queued background summary arrives from old scope. Retired actor cannot access newly unauthorized evidence; old result cannot reactivate invalid view. |
| Concurrency/idempotency | Duplicate delivery, simultaneous corrections, stale expected version, failure between replacement steps. Stable evidence identity prevents double promotion; conflicts surface; partial writes reconcile. |
| Pressure integrity | Giant tool result, pending call, tied timestamps, oversized current request, pins exhausting budget, provider/context-size switch. Preserve active exchange/current request; measure final assembled request and explicit overflow handling. |
| Failure versus empty | Retrieval unavailable, malformed extraction JSON, partial persistence, true no-match. Different outcomes remain observable. Source paths show why success-shaped emptiness cannot be accepted blindly. |
| Forgetting/derivatives | Expire or retract source behind direct ID read, summary, pin, recall index, cached epoch. Current-use paths exclude it; retention/physical erasure evaluated separately. |

**Prove evaluation can detect failures:** introduce wrong-project record, remove “only/never/temporary” qualifier, serve superseded revision, strip one source link, inject recalled-memory echo, and split tool pair. Each control must fail for its intended reason; paired valid fixture must succeed. This is future evaluation specification, not newly authored CI gate or executed test result.

Measure claim-level support/applicability, correction propagation, false promotion, cross-scope leakage, abstention correctness, provenance rehydration, token use on actual assembled requests, extra provider calls, and observed latency/cost. No target performance number established by this research.

## 7. Verified reuse licenses

| Material considered | Verified primary license evidence | Reuse boundary |
| --- | --- | --- |
| Mem0 `mem0/memory`, prompts, shared integration helpers and repository docs | Pinned root [LICENSE][L1]: Apache-2.0 | Semantic adaptation preferred. Literal source/prompt reuse must retain applicable notices, supply license, mark modified files, and carry relevant NOTICE attribution if included in reused distribution. |
| Mem0 native OpenCode plugin | Own pinned [LICENSE][L2]: Apache-2.0 | Same obligations. Examined as pattern/counterexample; plugin backend not adoption proposal. |
| Mastra `packages/memory`, selected core memory/processors, repository docs | Root [LICENSE.md][L3] covers material outside exceptions under Apache-2.0; memory [package.json][A12] independently declares Apache-2.0 | Verify exact ported files/dependencies at reuse time; source prompts count as source material. Not blanket claim about entire monorepo. |
| Mastra exceptions | [`ee/LICENSE`][L4]: Enterprise Edition License, production/redistribution restricted; [`packages/connect/LICENSE-ELv2.txt`][L5]: Elastic License 2.0 | Neither needed for proposed semantic adaptations. Do not sweep either into presumed Apache reuse. Third-party components retain own terms. |
| Mem0 hosted Dream/decay implementation | Public product docs inspected; hosted implementation license not established | Behavior can inform independent semantics. OSS license does not establish access/reuse rights to hosted implementation. |

R09 copies no upstream implementation into runtime. Short quotations and permalinks identify evidence; report recommends native semantics rather than dependency installation. Site-rendered assets and transitive dependency licensing outside inspected files not audited.

## 8. Uncertainties and framing gaps

- **Native seam readiness unresolved.** Baseline seam register calls Atlas ownership/Awareness/Orientation candidates, describes derived orientation rather than written-memory persistence, and names missing adapter seams. This research does not invent a Charlie write door or reclassify that snapshot as current implementation proof.
- **Version drift matters.** Mem0 active ADD-only path versus leftover CRUD prose; Mastra immutable-owner overview versus transfer source; experimental Subconscious versus OM docs still describing future replacement. Prefer pinned call paths for behavior, with release availability explicit.
- **“Agent/task/project memory” is not one hierarchy.** Audience, ownership, applicability, lifespan, authority, and context residency are independent axes. Personal preference is not necessarily project policy; cross-agent sharing is not execution delegation.
- **Knowledge, summary, and execution state differ.** Durable knowledge can survive Session while “next action,” task allowance, locks, and interruption ownership cannot. Compression must not recreate execution ownership or replay provider work.
- **Polyglot means applicability, not translated prose alone.** Engine/runtime/framework versions, component boundary, deployment environment, branch/revision, and evidence source language matter. SQL dialect or Go/Rust/TypeScript caveat must survive recall.
- **Ownership change extends beyond ID mapping.** Permission revocation, stale indexes, read caches, background derivations, and historical source access all need transition semantics. No external authentication system proposed; native authority contract remains governing seam.
- **More memory can reduce correctness.** Retrieval reinforces exposure; repeated summaries can look like corroboration; old high-frequency rules can dominate rare authoritative corrections. Provenance must distinguish independent evidence from derived echoes.
- **Pressure is product behavior.** What gets omitted, how conflict/unavailability is shown, and how exact evidence is reloaded need observable contracts. Count/character budgets and prompt instructions alone do not establish semantic preservation.

## Primary source register

All GitHub links below pinned to inspected commits. Live docs useful for navigation: [Mem0 OSS](https://docs.mem0.ai/open-source/overview), [Mem0 Dream](https://docs.mem0.ai/platform/features/dream), [Mastra memory](https://mastra.ai/docs/memory/overview), [Mastra OM](https://mastra.ai/docs/memory/observational-memory). Pinned source governs this report.

[M1]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/mem0/memory/main.py
[M2]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/mem0/configs/prompts.py
[M3]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/mem0/memory/storage.py
[M4]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/integrations/opencode-plugin/opencode-mem0.ts
[M5]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/docs/platform/features/dream.mdx
[M6]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/docs/platform/features/memory-decay.mdx
[M7]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/docs/platform/features/memory-expiration.mdx
[M8]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/integrations/agent-plugin-core/typescript/src/scoping.ts
[M9]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/integrations/agent-plugin-core/typescript/src/identity.ts
[A1]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/docs/src/content/en/docs/memory/overview.mdx
[A2]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/docs/src/content/en/docs/memory/working-memory.mdx
[A3]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/docs/src/content/en/docs/memory/semantic-recall.mdx
[A4]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/docs/src/content/en/docs/memory/observational-memory.mdx
[A5]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/subconscious/scope.ts
[A6]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/subconscious/knowledge-write-tools.ts
[A7]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/reflector-agent.ts
[A8]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/observation-turn/safe-buffer-prefix.ts
[A9]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/core/src/processors/processors/token-limiter.ts
[A10]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/index.ts
[A11]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/observer-agent.ts
[A12]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/package.json
[A13]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/subconscious/index.ts
[A14]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/subconscious/curate.ts
[A15]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/subconscious/pinned.ts
[A16]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/subconscious/origin.ts
[A17]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/__tests__/subconscious-project-scope.test.ts
[A18]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/tools/working-memory.ts
[L1]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/LICENSE
[L2]: https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/integrations/opencode-plugin/LICENSE
[L3]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/LICENSE.md
[L4]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/ee/LICENSE
[L5]: https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/connect/LICENSE-ELv2.txt

### Exact implementation entry points

- Mem0 scope protection: [`main.py` identity filtering](https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/mem0/memory/main.py#L137-L164); [scope assembly](https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/mem0/memory/main.py#L310-L412).
- Mem0 ADD pipeline and payload: [`main.py` L918-L1099](https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/mem0/memory/main.py#L918-L1099); [correction/history/delete](https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/mem0/memory/main.py#L1829-L2142).
- Mem0 temporal/truncation helper: [`prompts.py` L965-L1042](https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/mem0/configs/prompts.py#L965-L1042).
- Mem0 project parser: [`identity.ts`](https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/integrations/agent-plugin-core/typescript/src/identity.ts); [scope helpers](https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/integrations/agent-plugin-core/typescript/src/scoping.ts); [auto-capture](https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/integrations/opencode-plugin/opencode-mem0.ts#L752-L776); [compaction](https://github.com/mem0ai/mem0/blob/abb81c88e1f738a8117d8293530fbc31a5ef8fd9/integrations/opencode-plugin/opencode-mem0.ts#L884-L927).
- Mastra project-scope source test: [`subconscious-project-scope.test.ts`](https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/__tests__/subconscious-project-scope.test.ts).
- Mastra curation/pin/origin semantics: [`curate.ts`](https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/subconscious/curate.ts), [`pinned.ts`](https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/subconscious/pinned.ts), [`origin.ts`](https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/subconscious/origin.ts).
- Mastra exact merge semantics: [`working-memory.ts` L14-L69](https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/tools/working-memory.ts#L14-L69); [instance-local writer mutex](https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/index.ts#L1174-L1253).
- Mastra assertion/time/completion criteria: [`observer-agent.ts` L48-L295](https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/observer-agent.ts#L48-L295); [lossy pressure escalation](https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/processors/observational-memory/reflector-agent.ts#L160-L232).
- Mastra explicit ownership transfer and partial-failure repair: [`index.ts` L3429-L3494](https://github.com/mastra-ai/mastra/blob/daf5de73b5662bb8d4293bb7f7e649aff9bc48cd/packages/memory/src/index.ts#L3429-L3494).
