# Native Atlas integration

Status: proposed shared foundation contract. Product decisions are recorded in [README.md](README.md).

The [canonical Memory consumer reference](atlas-memory-contract.md) rechecks actual types, entry templates, access modes and exposed operations at Atlas `b319723d5c5c86a45ad362386d8c0583ed3a10f4`. It distinguishes the four stored Memory kinds from derived header slabs and documents where executable wiring is narrower than the normative contract.

Ownership clarification: persistence is native; Atlas owns its Knowledge/Memory implementation, and the harness owns Session execution, cache and compaction. This document describes consumed contracts and provider-owned engineering references. It is not a foundation-building backlog for the backend specialist. Maestro supplies team scope and permissions; the backend specialist consumes them through native enforcement.

## The backend specialist's use is implementation-scoped

Atlas access does not enlarge the backend specialist's role. It consumes the project rules and exact Knowledge/Own/task references supplied for its assigned implementation, and records implementation progress, check results and blockers. Investigation, diagnosis, discovery and context production remain with their responsible owners.

A missing/stale reference, insufficient context or unexplained result returns to the caller. The backend specialist does not browse the catalog to invent scope, reconstruct another member's diagnosis or use broader retrieval as a fallback. The shared foundation can expose capabilities to other roles without granting all of them to the backend specialist.

## Atlas's actual role

Atlas is a content-addressed, git-native knowledge foundation with structural retrieval and freshness checks. It includes shared Knowledge and per-member Memory. It is not limited to the static Own projection currently installed in Orchestra.

The Orchestra-vendored Atlas source and the separate local Atlas checkout were inspected. The local checkout was at `b319723d5`; this is a source reference, not an instruction to import a developer's checkout at runtime. Installation must pin the chosen canonical producer revision and verify its generated/package boundary.

### Semantic domains

| Domain | Owner and access | The backend specialist's use |
| --- | --- | --- |
| Knowledge | Shared project facts; Atlas grounding/freshness and governed write doors | Apply the supplied invariants and facts to the assigned implementation |
| Own | Bounded ownership projection over Atlas evidence | Load the assigned canonical unit/context references within the packet's read scope |
| `task` Memory | Member + logical task; explicit consultation, with own resumed-fold exception | `attempted`, `failedWith`, `stoppedAt`, `lesson`, optional `ref` under `taskId` |
| `pr` Memory | Member + PR; explicit consultation; required resume behavior has documented wiring limits | `decisions`, `reviewOutcomes`, `knowledgeDelta`, optional `ref` under `prId` |
| `project` Memory | Member within project; always-injected bounded Rules slab | `rule`, `scope`, `frecency`, optional `grounding`; not optional archive recall |
| `logbook` Memory | Orchestrator-only authoring in inspected version; consultable, never injected | Structured decision journal, one entry per PR; remains Maestro's responsibility |

Memory is experience, not automatically shared truth. A task lesson becomes a project rule only through deliberate admission. A proposed code fact uses the separate Knowledge door. A memory write does not approve product behavior.

Atlas MEM-1 is injection scoping, not confidentiality: the current git-native store is shared plaintext. Serving only the backend specialist's rules does not imply other members' bytes are unreadable to a repository reader.

## Running context and resumption

The project header consists of:

1. **Awareness:** derived mission, constitution, terrain, ontology and taste.
2. **Orientation:** derived goal, last milestone, current milestone and state.
3. **Rules:** the current member's bounded, ranked project rules.

Awareness and Orientation are shared for the same authoritative project state. Rules are member-scoped. Missing Awareness facets use Atlas's explicit `UN-SEEDED` representation. The current Orientation implementation returns empty fields for absent sources; the native boundary must publish their missing-source status without inventing a goal or milestone. Source drift must be visible in the proposed integration. A generic language description cannot stand in for actual Awareness.

The currently declared budgets and slot count belong to Atlas. Some implementations use word/character proxies; the native adapter must not describe those as measured provider tokens. Core's inspected token estimate is characters/4 and compaction is conditional; it is not a measured-token admission guarantee. The native contribution needs an explicit bound with its unit/method recorded, while preserving complete bindings and using the host's existing overflow handling.

Task/PR memory is not injected wholesale on every provider turn. The resume exception is narrow: admit the member's own closing fold for the exact resumed unit once, then preserve it through ordinary Session history. Repeated recall must not grow every request with another copy of the same fold.

That once-only behavior needs a durable admission reference to the exact fold and logical resume, using existing Session evidence. A retry after admission, a replacement process and compaction must not blindly inject a second copy. Switching members does not erase prior transcript content: it remains attributed historical material, while new automatic admission and active rules follow the newly selected member.

```text
New task
  bind project/member/task and complete packet -> load supplied header/Own references

Active task
  retain native Session history -> recall relevant task/PR records when needed
  -> record meaningful progress/failure checkpoints with evidence

Resume
  prove same logical task and member -> select authoritative own fold
  -> admit resume context once -> continue same packet or return its currentness blocker

Close
  record outcome and closing fold -> optionally propose reusable project rule
  -> Atlas evaluates memory admission -> retain actual receipt or refusal
```

Recording a checkpoint is not limited to success. Observed check failures, interruption and missing prerequisites are useful memory when attributed accurately; they are not diagnostic conclusions. Abrupt process death may leave only earlier checkpoints and host events; the system must not invent a final fold.

## Identity: memory owner and execution actor

Two scopes must remain distinct:

- **Persistent memory owner:** the stable member inside the exact Atlas project. It survives a new Session and a public-name change.
- **Execution provenance:** the existing `projectId + authoritySessionId + memberId` actor, plus actual child execution Session and task/attempt references. The serialized field remains `sessionId`; it continues to mean the direct stakeholder conversation from the ratified contract.

The native foundation binding resolves both. A public tool cannot choose an `owner`, repository root or execution actor. CLI project selection is an explicit caller input resolved and validated by its host adapter; model arguments are not host placement.

The proposed mapping uses the existing stable specialist member ID as Memory's owner within an exactly bound Atlas project; execution receipts retain the separate Session-composed actor. For Maestro, the inspected Atlas compatibility identity is `orch` (`LOGBOOK_AUTHOR`), so the shared adapter maps `maestro` to that storage owner while keeping `maestro` in native execution identity. This is a storage compatibility mapping, not another public persona. Display names and Git user email do not select a native member's memory owner. Atlas's generic standalone CLI identity convention is not silently inherited by this adapter.

The inspected Atlas composition root supplies one `actor` string to both Knowledge and Memory. Mapping the full Session-composed actor directly into Memory's owner would partition project rules by Session. The native binding therefore needs an explicit owner/provenance contract; this is a required integration change, not an already-shipped property.

The existing Maestro actor serialization remains unchanged. Direct operation can use the same authority and execution Session; delegation must inherit the authority Session and separately retain the executing child. A stable Memory owner is a separate storage-scoping concern; it must not weaken the provenance recorded for a write.

The current Memory envelope contains `{ owner, kind, entry }`, not full execution provenance. The native boundary must obtain Atlas's canonical record/event identity and persist its link to the canonical execution actor, logical task and actual invocation in existing host evidence. That link cannot exist only in an in-memory adapter object. Closed Atlas entry templates are not widened ad hoc by the consumer.

Any deferred observation, checkpoint or learning proposal retains its originating project/member/authority/execution binding. Later dispatch rechecks applicable settings and permissions under that identity, not the ambient profile or a newly resolved public name. The Hermes profile-context failure in [R27](research/27-agent-failures.md) illustrates why binding only the final writer is too late.

## Shared native foundation boundary

The foundation, not the backend specialist, resolves an installed Atlas implementation and owns its lifecycle. Every specialist and Maestro consumes that same capability. No runtime consumer imports `foundation/atlas` by relative path, reads `.atlas/*.jsonl` directly, or imports a developer-global Atlas checkout.

The specialist consumes the native Atlas interface exposed by its owner. The earlier `@opencode-ai/atlas-boundary/memory` spelling is a historical packaging proposal, not a backend specialist requirement or an available-API claim. Missing exposure belongs to the provider owner. The thin adapter preserves package/runtime boundaries and does not create a private store or another persistence implementation.

Conceptual native surface:

```text
AtlasBinding
  exact project identity
  trusted storage placement
  actual source worktree and revision
  stable memory member + execution actor
  native read/write permissions and cancellation

Foundation capabilities
  availability / diagnostics
  read project header
  recall own task or PR memory
  record own task or PR memory
  admit a proposed project rule
  resolve an own resume fold
  read verified catalog / Own / Knowledge as permitted
```

These are semantic operations, not a second set of Atlas algorithms. The adapter delegates to Atlas-owned handlers and preserves their typed refusals. An operation is advertised only after its installed implementation and required host binding exist.

This is the shared foundation inventory. The backend specialist's exposed view is narrowed to the assigned packet, its exact references and own implementation continuity. Project discovery/catalog exploration remains available only to the roles that own it.

### Reads

- Sample the actual selected member and project before admitting context.
- Preserve record kind, owner, task/PR identity, source references and completeness diagnostics.
- Match project rules to the active work scope through an Atlas-owned contract.
- Preserve `UN-SEEDED`, drift, partial data and unavailable state distinctly.
- Apply a bounded recall contract; oversized results need explicit coverage/pagination semantics rather than an apparently complete preview.
- Do not turn an unreadable/corrupt store into an empty, successful memory result.

### Writes

- Route Memory through the canonical Memory admission door. Route Knowledge through its own governed door.
- Derive identity from the binding and kind from validated data; do not accept an asserted actor or a caller-selected weaker gate.
- Respect Atlas's fixed templates, limits and named pre-write scanner requirement.
- Associate execution evidence using native receipts and supported source references. Do not add arbitrary fields to closed Atlas templates.
- Treat transport failure after a possible append as an unknown outcome requiring receipt/state reconciliation. Do not promise atomicity across Atlas storage and Session events.
- Preserve content-idempotent semantics on an exact retry; define logical checkpoint succession explicitly.
- Never report a refused memory write as remembered work.

A scheduler's “cycle completed,” a model's “saved” response and an actual Atlas admission receipt are distinct. A flush may stop retrying without persisting the intended memory. Record that outcome accurately and keep original task evidence available. The OpenClaw flush-exhaustion path in [R22](research/22-openclaw-memory.md) is a concrete source example.

Project-rule scores are Atlas policy/evidence, not a model-authored confidence number. A useful lesson does not automatically become a permanent instruction. Contradictory, stale and superseded rules need an explicit disposition.

### Deliberate learning

Start with meaningful failure checkpoints and explicit corrections. A reusable lesson records its scope, supporting source/evidence and invalidation conditions. Personal craft enters the member's Memory; a shared claim about the repository follows Knowledge admission. A stable, repeated method may become a versioned skill through the normal source-change path. These are different promotions.

For the backend specialist, candidate lessons come from assigned implementation and its supplied checks. It does not investigate failures to produce lessons, audit the project, or expand its role through remembered instructions. Rules or historical research that request those actions must not override the current execution-only mandate. Skill maintenance and independent validation stay with their assigned owners.

Corrections supersede prior applicability without silently erasing history. Retrieving a rule or repeating it does not prove it was correct. A merge, a thumbs-up or a model-generated confidence score is not a mechanical truth oracle. Avoid an automatic post-task learning agent until its quality and recurring cost are demonstrated.

If a requested correction cannot establish its exact predecessor, do not report successful supersession merely because another note was appended. Preserve the contradiction/unresolved disposition. OpenClaw's forget/tombstone machinery is a useful reference for active-projection invalidation and partial-operation reporting; it does not override Atlas's versioned retention contract or justify claiming universal erasure.

## Project continuity across worktrees

The host distinguishes the source worktree from Atlas's authoritative project storage. Both placements are explicit and validated. A worker does not gain ambient write access to another worktree merely because the projects share a Git origin.

The required product behavior is one logical project's continuity across its authorized task worktrees. Atlas owns the synchronization/versioning mechanism. The consumer must not build a per-worker memory store and hope it becomes project memory later.

The inspected adapter stores Memory at `<repoPath>/.atlas/memory.jsonl`. Simply binding `repoPath` to each task worktree would create independently evolving views. The foundation work package must define and test shared live placement plus versioned carry before claiming cross-worktree continuity.

The proposed live arrangement is one configured authoritative Atlas storage binding per project, shared by that project's authorized worktrees; each invocation still supplies its actual source-worktree/revision identity. The host resolves this mapping, not ambient `cwd`. Atlas's existing versioned records remain the portable substrate. Cross-clone/offline reconciliation is not inferred from same-process sharing and needs its own evidence.

Memory persistence and code freshness also interact: current governed context checks treat repository dirt as relevant. Writing a tracked Memory log in the source worktree can change that state. The integration must keep source and foundation-storage identities explicit and honor the existing freshness contract; blanket Git exclusions would hide an authority change.

## Host context admission

**V2:** selected-member Atlas data enters through the existing System Context/Context Epoch model at safe provider-turn boundaries. Use a member-aware native producer; a Location-wide registration must not inject the backend specialist's private working rules into every selected agent. Context changes should preserve chronological admission and cache semantics.

**V1:** use an explicit host adapter with actual Session/selected-agent identity. The current `experimental.chat.system.transform` input supplies Session and model but not the selected agent. A native context contribution needs the missing binding; it must not infer identity from a prompt substring or display name.

The public V1 hook's `sessionID` is optional. Invocation without a real Session binding cannot perform Session-scoped automatic Memory admission. Native host calls must supply the actual authority/execution relationship as needed; unsupported external host versions report the capability limitation.

The public V2 plugin context currently exposes agent/skill/command/etc. transforms but no generic System Context or tool-registration domain. The host integration must supply or extend a supported seam. A plugin descriptor alone is not proof that dynamic Atlas context or tools reach a provider request.

Ordinary OpenCode compatibility must be versioned and exercised against its real installed loader. Any narrower host support is published explicitly. Native integration is not replaced with instructions telling the model to simulate an unavailable hook.

### V2 degraded-context state mapping

Use a typed source value carrying the selected stable member, capability availability, source identity and applicable current content. For permitted ordinary work, a known Atlas outage produces an **available context value describing degradation**. It does not use Core's `SystemContext.unavailable` sentinel: that sentinel blocks initial context and can retain earlier snapshots during reconciliation.

On an outage after prior admission, the new value marks affected context unavailable/stale and retires its current-authority claim. On a member switch, remove/retire the previous member's active contribution with explicit removal rendering and admit the new member's value, even if that value is degraded. Preserve immutable baselines and chronological updates through the existing Context Epoch machinery. Existing transcript facts retain their original attribution; they are not reassigned to the new member.

Grounded operations independently check required fresh evidence and remain blocked. Changing the rendered outage state never waives their guard. Cold-start outage, mid-session outage and switch-during-outage are distinct acceptance cases.

## Polyglot coverage is capability-specific

The backend specialist can implement a supplied task in a language that a particular Atlas indexing path does not fully refine, provided the packet supplies sufficient authorized context. The inspected Atlas AST path is TypeScript/TSX-specific; foundation owners must establish SCIP/indexer coverage separately. File presence is not proof of established symbol relationships or semantic claims.

Return actual language/operation coverage with the supplied context. The backend specialist uses assigned source and checks; missing information returns to its owner. A grounded operation requiring missing structural evidence remains unavailable until the Atlas-owned boundary supplies it. Do not fill the gap with guessed Own IDs, project discovery or a private backend specialist index.

## Bound work as well as output

The foundation should reuse valid project-root, facet and query observations across members and turns, invalidating by relevant source identity. Returning a short header does not justify rebuilding a full index or rescanning an unbounded memory archive every turn.

Measure header assembly, recall work, storage reads, output size and provider-token pressure separately. Source-backed read diagnostics survive bounding. Cache/pagination changes belong to Atlas or existing native output mechanisms; the backend specialist does not create an independent caching database. See [memory comparison](research/08-atlas-memory.md) and [efficiency research](research/16-efficiency.md).

Refine cached projections with source revision, applicability/authority and registration/renderer dependencies. Reject a pre-invalidation fill that completes late. Separately track whether previously delivered content still resides in the active context: compaction can evict a procedure without changing its source. A cached result or “already shown” flag cannot certify once-only durable admission or current source truth. See [technical-depth T7](technical-depth.md#t7--cache-freshness-authority-and-context-residency-separately).

## Availability and graceful degradation

Track capabilities separately: Knowledge, project header, recall and memory writes can have different availability. One unavailable scanner must not be reported as an unavailable read store; an empty legitimate store must not be reported as a transport failure.

In the owner-approved degraded mode:

- Assigned implementation and specified checks can continue through normal host tools when the supplied packet remains sufficient. Degradation does not authorize investigation, diagnosis or discovery.
- The user receives a concise reason when missing Atlas capability matters to the task.
- Host Session history remains available. It is not represented as a replacement Atlas memory database.
- Grounded/governed operations requiring missing evidence remain blocked.
- Reconnection revalidates project identity and actual state before reuse; it does not blindly replay uncertain writes or provider work.

## Source-backed integration gaps

These observations come from an inspected source baseline, not new runtime test results. They are references for the existing foundation/host owners and require current-state revalidation there. They are not automatically the backend specialist milestones, implementation responsibilities or evidence that native persistence must be rebuilt.

| Gap | Source anchor | Required disposition |
| --- | --- | --- |
| Installed Orchestra boundary exports only static context/materialization | `packages/atlas-boundary/package.json` | Add an explicitly separated, installed Memory/native foundation surface; preserve root isolation |
| One composition `actor` becomes Memory owner | `foundation/atlas/packages/adapter-io/src/compose.ts`, `memory-emit.ts` | Separate stable project/member ownership from Session-composed execution provenance |
| Resume archive currently projects task records only; selection uses first matching fold | `foundation/atlas/packages/memory/src/respawn.ts` | Define succession/conflicts, test multiple checkpoints, and implement the required task/PR resume coverage in Atlas |
| `spawnFold` exists on the read door but is not exported on `ComposedRuntime` | `foundation/atlas/packages/adapter-io/src/memory-read.ts`, `compose-runtime.ts` | Expose and exercise the native resume operation; do not claim CLI/MCP already provides it |
| Project ranking uses stored score decayed by log position; cited-hit bridge is declared unresolved | `foundation/atlas/packages/adapter-io/src/memory-read.ts` | Define authoritative score/citation inputs and prevent model-manufactured ranking |
| Write cap examines the existing owner's project records; read path selects a ranked hot set | `foundation/atlas/packages/adapter-io/src/memory-emit.ts`, `memory-read.ts` | Prove admission/decay/archival/update behavior together before continuous learning is certified |
| Read door header does not take active work scope | `foundation/atlas/packages/adapter-io/src/memory-read.ts` | Implement or expose scope-aware selection in the foundation |
| Rule identity is currently keyed by rule text, including across differing scopes | `foundation/atlas/packages/adapter-io/src/memory-read.ts` | Define scope-safe rule identity and test equal text under distinct applicability |
| Durable read conflates an unreadable log and malformed lines into rejection counts; higher-level reads consume `.store`/`.log` | `foundation/atlas/packages/adapter-io/src/durable-log.ts`, `memory-store.ts`, `memory-read.ts` | Extend the canonical read verdict to distinguish complete-empty, partial-corrupt and unavailable, then propagate it without consumer reparsing |
| Memory/Orientation logs are rooted in a supplied repository path | `foundation/atlas/packages/adapter-io/src/memory-store.ts`, `orientation-store.ts` | Define project storage versus source-worktree binding and prove continuity across worktrees |
| Awareness's current top tier is a taste source label or constitution count, and the composed `read()` uses non-drift-flagging `rollup`; other facets remain unseeded | `foundation/atlas/packages/adapter-io/src/awareness-store.ts`, `foundation/atlas/packages/memory/src/awareness.ts` | Produce substantive, source-backed facet content and freshness-aware assembly; preserve missing-source status |
| Current Orientation missing-source fields are empty strings | `foundation/atlas/packages/memory/src/orient.ts` | Expose missing-source status rather than presenting empty or guessed milestones as current orientation |
| Current grounded Own loader rejects incomplete coverage, dropped advisory and pull-reachable tails | `packages/opencode/src/maestro/atlas-source.ts` | Preserve full-current static Own admission for initial governed dispatch; any future drill consumption requires its own verified contract, not a fallback around this guard |
| Native specialist profile currently denies `skill` and custom capabilities | `packages/opencode/src/maestro/roster.ts`, `session/tools.ts` | Grant only the implemented specialist/foundation capabilities through native policy |
| V1/V2 plugin context seams differ | `packages/plugin/src/index.ts`, `v2/effect/context.ts` | Prove each claimed host integration independently |

Some Atlas README sections and source headers still say the Memory doors have no callers. Current `compose.ts`, `wire.ts`, CLI dispatch and MCP `server-memory-tools.ts` contain those callers. Use the actual call chain to assess reachability.

## Acceptance scenarios

1. Record task progress, terminate the host, resume the same logical task, and recover the correct own checkpoint with its evidence and uncertainty.
2. Record successive checkpoints and prove the authoritative successor is selected; conflicting merged histories produce an explicit result rather than arbitrary selection.
3. Start a new Session in the same project and recover the same member's applicable project rules.
4. Rename the specialist through its environment variable and repeat reads, writes and resume without creating a new memory owner.
5. Use an unrelated project and another member; verify no accidental header/task-context crossover. This does not assert filesystem confidentiality.
6. Run from distinct task worktrees and verify the chosen shared-project continuity/versioning contract.
7. Keep running-turn headers free of bulk task/PR/logbook history; resume admits the exact own fold once.
8. Change source facts and verify current Knowledge/Own freshness behavior; stale evidence cannot authorize grounded work.
9. Corrupt, truncate or make the memory log unreadable and observe named partial/unavailable state.
10. Exercise actual scanner success, scanner findings and scanner failure/unavailability through the real write door.
11. Exercise rule capacity, updates, conflicts, expiry/archival and recovery together without silent deletion or model-supplied scores.
12. Interrupt a write around persistence and reconcile actual state before retry; distinguish an admitted record from a lost response.
13. Disconnect Atlas while ordinary work continues and while a grounded operation waits; observe the correct capability-specific outcomes.
14. Switch the selected agent and prove only the correct member's rules/new automatic context admission and permissions apply at the next boundary; prior history remains attributed and grants no inherited authority.
15. Start with Atlas unavailable, lose it after successful admission, and switch members during outage; ordinary work remains explicitly degraded while evidence-dependent operations hold.
16. Record identically worded rules under different scopes and verify applicability, updates and retirement do not collapse them accidentally.
17. Retry resume after fold admission and after compaction/restart; recover admission evidence without duplicate context or fabricated provider continuation.

## Canonical references

- `foundation/atlas/docs/reference/atlas-memory.md`: MEM-1 through MEM-13 and ratified composition decisions.
- `foundation/atlas/packages/memory/src/{types,inject,respawn,rules,template}.ts`: pure Memory semantics.
- `foundation/atlas/packages/adapter-io/src/{memory-store,memory-read,memory-emit,compose}.ts`: durable and composed paths.
- `foundation/atlas/packages/mcp-server/src/server-memory-tools.ts` and `packages/cli/src/map.ts`: actual transport exposure.
- `specs/hugr-maestro/grounding-boundary.md`: current installed static Own boundary.
