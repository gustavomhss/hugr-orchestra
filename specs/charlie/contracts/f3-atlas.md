## F3 — Atlas provider contract

Status: draft for LEAD-0 freeze, 2026-10-05. Source inspection only; nothing was run, installed or written outside this file.

Baselines: Orchestra `O` = `_worktrees/charlie-plugin` HEAD `d11d8652aa`; canonical Atlas `A` = `HuGR/atlas` HEAD `b319723d5c` (unchanged since P2). Vendored `O/foundation/atlas` is unchanged since `76015a9`; its twelve Memory-cluster sources (`memory/src/{types,inject,respawn,template,rules,logbook}.ts`, `adapter-io/src/{memory-read,memory-emit,memory-store,durable-log,scanner,compose-runtime}.ts`) are equivalent to `A` modulo whitespace, quotes, semicolons and commas (normalized-hash check; the raw diff does differ, so the check can see a difference). `A:` line anchors below therefore also hold semantically for the vendored copy.

Notation: **[E]** = existing shape, cited to source and used verbatim. **[N-Ax]** = required-new, owned by the named work package. Nothing marked [N] exists today. A clause that names no [N] item is satisfiable by current Atlas code alone.

Vocabulary: *bound view* = the narrowed Atlas capability set the harness exposes for one binding (clause 1). *Record* = Atlas `MemoryRecord`. *Checkpoint* = an admitted own `task` or `pr` record. *Resume fold* = the projection of one exact checkpoint that is pushed at a logical resume.

### Contract

#### I. Binding and identity

1. **Binding input.** Every Atlas operation in this contract runs under an immutable `AtlasBinding` that the harness supplies (F2). The model never supplies it, and neither do process environment, git identity or `cwd`. [N-A1] `AtlasBinding = { storage: { projectID, root }, source: { worktree, revision }, memoryOwner: MemberId, execution: { actor, executionSessionID, invocation? }, unit?: ResumeUnit, logicalResumeID? }`. `MemberId = string` [E `A/packages/memory/src/types.ts:24`]. `ResumeUnit = { kind: 'task' | 'pr', id: string }` [E `A/packages/memory/src/respawn.ts:31-34`]. `actor` is the unchanged `maestro-actor-v1` serialization `{ memberId, projectId, sessionId }` [E `O/packages/opencode/src/maestro/context-tool-plan.ts:34-41`]. `invocation = { callID, assistantMessageID }`, read from the V2 tool registry invocation [E `O/packages/core/src/tool/registry.ts`, `invocation` object]. The F2 freeze defines how each field is obtained. F3 only fixes the field set.
2. **Memory owner.** `memoryOwner` is the stable roster member ID (`charlie`), resolved with `lookupRosterMember` [E `O/packages/opencode/src/maestro/roster.ts`]. Maestro's owner is mapped `maestro → orch`, and only for storage, because `LOGBOOK_AUTHOR = 'orch'` [E `A/packages/memory/src/logbook.ts:56`]. A display name, a Session ID or the Session-composed actor is never an owner. Changing the public name or opening a new Session never creates a new owner.
3. **Receipt actor is distinct from the owner.** Atlas persists only `MemoryRecord { owner, kind, entry }` [E `A/packages/memory/src/types.ts:137-141`]. Execution provenance (`execution.actor`, `executionSessionID`, `invocation`, logical task) is never written into an entry or a record. The harness persists it next to the Atlas receipt in existing Session tool evidence (clause 24). In direct use, the authority and execution Sessions may be the same real Session (F2).
4. **Owner injection point.** [N-A1] A bound Memory composition (P2's proposed `adapter-io/src/native-memory.ts`) builds `createMemoryRead` / `createMemoryEmit` [E `A/packages/adapter-io/src/index.ts:119-123`] with `actor := binding.memoryOwner` and `store := createDurableMemory(binding.storage.root)` [E `memory-store.ts:45`]. It must not route through `composeRuntime`, which resolves `ATLAS_ACTOR ?? gitUserEmail ?? ''` [E `A/packages/adapter-io/src/compose.ts:170`] and feeds that value to both Knowledge and Memory [E `compose.ts:362-374`]. Knowledge actor and permissions stay a separate, explicit input.
5. **Record identity.** A record's canonical identity is Atlas-minted: `contentHash = id(record)`, and `eventId = eventId({ seq: 0, contentHash, fresh: true, supersedes: [], payload: record })` [E `A/packages/memory/src/respawn.ts:50-60`; `A/packages/kernel/src/canonical.ts:113`, `log.ts:82`]. [N-A1] The bound API returns `RecordRef = { contentHash, eventId }` with every admitted write and every resolved record. Consumers never compute, hash or parse identity themselves. Identity is content-derived. The same owner submitting an identical entry produces the same `RecordRef`, folds to one record [E `durable-log.ts:130-132`], and still appends a physical duplicate line [E `durable-log.ts:137-147`]. An identical resubmission is therefore never a new checkpoint. Succession must come from host evidence (clause 16), not from identity.

#### II. Running header (Awareness + Orientation + Rules)

6. **Header shape.** The header payload is exactly `TurnHeader = { awareness: Awareness, orientation: Orientation, rules: readonly ProjectMemoryEntry[] }` [E `A/packages/memory/src/inject.ts:30-34`]. It is produced by `MemoryReadDoor.header(awareness, orientation)` for the bound owner [E `A/packages/adapter-io/src/memory-read.ts:188-194`]. `Awareness` has five `AwarenessFacet { content, grounding, state }` with `state ∈ 'seeded' | 'UN-SEEDED' | 'drifted'` [E `types.ts:179-211`]. `Orientation = { goal, last, current, state }` [E `types.ts:157-162`]. `rules` holds at most `RULES_SLAB_SLOTS = 12` of the owner's own `project` entries, ranked by `stored × 0.5^age` [E `rules.ts:97-105`; `memory-read.ts:154-184`]. `task`, `pr` and `logbook` are structurally absent from the header.
7. **Bound header envelope.** [N-A1] `BoundHeader = { header?: TurnHeader, state: SlabStates, bound: HeaderBound }`.
   - `SlabStates.awareness` reuses each facet's existing `state` [E].
   - `SlabStates.orientation` is [N-A2] a per-field `'present' | 'missing-source'`. Today a missing source yields `''` [E `A/packages/memory/src/orient.ts:62,68,92`], and the empty string must not be presented as a current milestone.
   - `SlabStates.rules` is [N-A1] `StoreState = 'complete' | 'partial' | 'unavailable'`. It is derived from `MemoryRead.rejected` [E `memory-store.ts:33`], which the read doors currently discard. An unreadable log reads as an empty log with `rejected: 1` [E `durable-log.ts:110-118`] and must map to `unavailable`, never to complete-empty. Malformed lines map to `partial`.
8. **Size bound and unit.** `HeaderBound = { rulesWords: number, method: 'whitespace-words' }` [N-A1]. It reuses the pinned `tok()` [E `A/packages/memory/src/rules.ts:110-113`]. No provider-token claim is made for any slab. Host overflow and compaction handling stay as they are.
9. **Rules always injected for the selected member.** Each V2 provider turn carries the header for the member sampled by `agents.select(session.agent)` [E `O/packages/core/src/session/runner/llm.ts:182`]. It comes through a member-aware producer that joins `loadSystemContext(agent)` [E `llm.ts:168-171`] and goes through `SessionContextEpoch.prepare` [E `llm.ts:197-198`; `O/packages/core/src/session/context-epoch.ts`]. [N-A4] The producer is never a Location-wide `SystemContextRegistry` entry, because `load()` takes no Session or agent [E `O/packages/core/src/system-context/registry.ts:14,39`]. V1 [N-A4/H2]: the hook `experimental.chat.system.transform` receives only `{ sessionID?, model }` [E `O/packages/opencode/src/session/llm/request.ts:69-73`; `O/packages/plugin/src/index.ts:291-296`]. The selected-member binding must be added. When the Session is absent, no automatic header admission happens.
10. **Degradation is a value, not a sentinel.** On a known Atlas outage, ordinary permitted work receives an available context value with `header` absent and the affected `SlabStates` set to `unavailable` [N-A4]. It never receives `SystemContext.unavailable` [E `O/packages/core/src/system-context/index.ts:28`], which blocks initialization [E `index.ts:201-202`]. A mid-session outage retires the earlier header's current-authority claim. A member switch removes the previous member's contribution and admits the new member's value, even when that value is degraded. Cold start, mid-session outage and switch during outage are three distinct observable states. Grounded operations keep their own freshness guards no matter how the header renders.
11. **No scope matching is claimed.** The current header takes no work-scope argument, and rule identity is keyed by `rule` text alone [E `memory-read.ts:140-151`]. F3 freezes "own top-12 ranked project rules". Scope-aware selection is Open decision D1.

#### III. Explicit recall (task / pr)

12. **Bound recall.** Charlie's recall input is `{ kind: 'task', taskId } | { kind: 'pr', prId }` [N-A1, narrowing of E `inject.ts:148-164`]. `owner` is always forced to `binding.memoryOwner` and is not a parameter. `kind: 'project' | 'logbook'` and caller-chosen `owner` are not accepted. The raw recall and MCP schema accept `owner` [E `A/packages/mcp-server/src/server-memory-tools.ts:39-48`]. Charlie never reaches that raw surface. `logbook` content reaches Charlie only as a packet-supplied reference from Maestro.
13. **Recall result.** `{ records: readonly MemoryRecord[], refs: readonly RecordRef[], store: StoreState }` [records E `memory-read.ts:200-205`; refs and store N-A1]. A qualified, empty, `complete` result is a legitimate "nothing recorded". `partial` and `unavailable` are never presented as empty.

#### IV. Resume fold and once-only admission

14. **Fold shapes.** The task fold is `ClosingFold = Pick<TaskMemoryEntry, 'attempted' | 'failedWith' | 'stoppedAt' | 'lesson'>` [E `respawn.ts:23`]. The PR fold is [N-A2] `PrClosingFold = Pick<PrMemoryEntry, 'decisions' | 'reviewOutcomes'>`, the "analogous decisions/outcomes subset" named at [E `respawn.ts:21,138-139`]. Whether to add `knowledgeDelta` is Open decision D2. No PR projection exists today: `foldArchiveFromRecord` projects only `task` records [E `respawn.ts:141-145`].
15. **Exact resolution, not first match.** [N-A1/A2] `resolveFold(unit, ref: RecordRef) → FoldVerdict`. It resolves the exact record by `eventId`, checks `record.owner === memoryOwner`, `record.kind === unit.kind` and the entry's `taskId`/`prId === unit.id`, then projects per clause 14. `FoldVerdict = { ok: true, unit, ref, fold } | { ok: false, refusal, reason }`, where `refusal ∈ 'no-own-fold'` [E `memory-read.ts:97`] `| 'record-not-found' | 'foreign-owner' | 'unit-mismatch' | 'store-partial' | 'store-unavailable' | 'ambiguous'` [N]. The existing `spawnFold(unit)` [E `memory-read.ts:225-237`] uses `archive.find`, which picks the first own match in log order [E `respawn.ts:168-170`] (the oldest checkpoint). It is not a selection authority under this contract and must not back resume. It is also not on `ComposedRuntime` or MCP [E `compose-runtime.ts:164-190`; `server-memory-tools.ts:30-33`]. No existing "spawn" tool may be described as available.
16. **Selection authority is host evidence.** The checkpoint to resume is the latest own record for `unit` whose admission receipt (clause 23) is in durable host evidence for the same logical task. Refused writes, `unknown` writes (clause 25) and identical resubmissions (clause 5) never advance selection. Without any host receipt: if exactly one own record exists for `unit`, it is selected. If there are none, the result is `no-own-fold`. If there are several, the result is `ambiguous` (disposition: Open decision D3). Log line order is never treated as "latest".
17. **Admission reference.** [N-A4] The once-only key is `AdmissionKey = (storage.projectID, memoryOwner, logicalResumeID, unit.kind, unit.id)`, and the admitted value is `ref.eventId`. The host persists the key, `ref` and the exact rendered fold in one Session event write, using the existing EventV2 transaction pattern. The event is either a narrow extension of `Synthetic`/`ContextUpdated` [E `O/packages/schema/src/session-event.ts:101-121`] or a new event; the schema owner is A4 with H2. Before selection, the host looks up `AdmissionKey`. If it finds one, it never admits again, even if a newer checkpoint exists. Replay verifies the payload is byte-identical. A new `logicalResumeID` (defined in F2) may admit again.
18. **Delivery channel.** The resume fold enters ordinary Session history once. It is not part of the running header and is never re-sent per turn. Durable admission and context residency are different facts. Behaviour after compaction evicts an admitted fold is Open decision D4. Until D4 is decided, there is no automatic re-admission, and Charlie may explicitly recall (clause 12).
19. **No guaranteed final fold.** Lifecycle hooks and the Arsenal completion receipt [E `O/packages/opencode/src/maestro/arsenal-completion.ts:24`] carry no closing-checkpoint semantics. Neither the host nor Charlie synthesizes, back-fills or labels a "closing" fold. The resume fold is "the latest admitted own checkpoint" and is rendered as such. Abrupt termination leaves whatever was last admitted.
20. **Missing fold is an outcome, not a failure.** `no-own-fold` on a fresh unit is normal. When the packet declares a resume that depends on prior context, `no-own-fold`, `ambiguous`, `store-partial` or `store-unavailable` becomes a precise blocker that Charlie returns (F4). It never triggers investigation or a fallback recall across owners.

#### V. Writes, receipts and refusals

21. **Write input.** The input is `{ entry: MemoryEntry }` and nothing else [E `A/packages/tools/src/handler.ts:319-330`; `memory-emit.ts:112`]. Atlas derives the kind (`memoryKindOf`) [E `A/packages/memory/src/template.ts:120-133`] and binds the owner (`put('memory', entry, actor)`) [E `memory-emit.ts:156`]. Through the bound view, Charlie submits only `TaskMemoryEntry`, `PrMemoryEntry` and `ProjectMemoryEntry` shapes [E `types.ts:58-102`]. A logbook-shaped entry is refused `logbook-unauthorized` [E `memory-emit.ts:167-173`], and the bound view does not advertise logbook authoring to Charlie.
22. **Closed templates.** Entries carry only template keys. Provenance, checks, status and Session IDs are never added. Unknown keys are refused at derivation [E `template.ts:126-132`]. Evidence pointers use the existing optional `ref?: Ref` / `grounding?: Ref`, where `Ref = StructRef | string` [E `types.ts:44`]. For `project`: `frecency` must be an integer to persist, because canonical form rejects non-integers [E `A/packages/kernel/src/canonical.ts:48-49`] even though the template accepts any finite number. The value comes from Atlas-owned policy [N-A2], never from the model (Open decision D6).
23. **Receipt shape.** [E+N-A1] `WriteVerdict = { ok: true, record: MemoryRecord, ref: RecordRef } | MemoryRejected`. `MemoryRejected = { ok: false, refusal: MemoryRefusal, reason, tokens?, cap?, scanner? }` and `MemoryRefusal ∈ 'undetermined-kind' | 'template-invalid' | 'kind-conflation' | 'unowned' | 'logbook-duplicate' | 'logbook-unauthorized' | 'over-cap' | 'scanner-blocked' | 'scanner-unavailable'` [E `A/packages/adapter-io/src/memory-emit.ts:67-96`]. The bound API passes `MemoryRejected` through verbatim. It does not adopt the `wire.ts` flattening, which drops `tokens`/`cap`/`scanner` [E `A/packages/adapter-io/src/wire.ts:489-496`], or MCP `verdictToResult`, which drops refusal `data` [E `A/packages/mcp-server/src/server.ts:227-234`]. [N-A1] corrections:
    - (a) A scanner `could-not-run` must surface as `scanner-unavailable`, not `scanner-blocked`. Today `makeScannerAdapter.scan` collapses it [E `A/packages/adapter-io/src/scanner.ts:191-192`].
    - (b) State-dependent gates (logbook duplicate, project cap) read the durable store [E `memory-emit.ts:164`]. On a `partial`/`unavailable` read they refuse with a new `store-partial` / `store-unavailable` refusal instead of judging an incomplete set.
24. **Receipt persistence.** The host stores the `WriteVerdict` (admitted `ref` or full refusal) together with the binding in existing durable tool evidence (`Tool.Success` structured output) [E `session-event.ts:344`; `O/packages/core/src/tool/registry.ts`]. The receipt is kept compact and outside expiring output-offload files. Memory-write status travels in the F4 WorkResult. Tool success and memory success are reported separately, and a refused write is never reported as remembered.
25. **Unknown outcome and reconciliation.** If a transport or process failure occurs after a possible append, the outcome is `unknown` (a host-level state, not an Atlas refusal). [N-A1] `reconcile(entry) → { present: true, ref } | { present: false, store: StoreState }`. It is answered by Atlas, which computes identity for `(memoryOwner, derived kind, entry)` and looks it up. A retry is allowed only after `present: false` on a `complete` store. Atlas storage and Session events are not one atomic transaction, and the contract claims no atomicity. Note that a blind retry of an already-admitted entry is refused `logbook-duplicate` for a logbook entry, and for a project rule it double-counts against the cap [E `memory-emit.ts:175-201`].
26. **Admission concurrency.** The emit door reads the incumbent and cap state before it scans and appends [E `memory-emit.ts:164-240`], and no lock serializes gates across processes. F3 certifies admission correctness only for one writer process per storage root (Open decision D8).

#### VI. Exposure, permissions, placement

27. **Installed boundary only.** Charlie and the harness consume Atlas Memory only through a new, separately exported subpath of `@opencode-ai/atlas-boundary` [N-A3]. The lead freezes the name. The pure root `.` and `./materialize` are unchanged [E `O/packages/atlas-boundary/package.json`]. Charlie never imports `foundation/atlas` internals, never reads `.atlas/*.jsonl`, never launches the generic Atlas CLI/MCP bins (which compose from `cwd` and `ATLAS_ACTOR` [E `A/packages/cli/src/bin.ts:17`, `A/packages/mcp-server/src/bin.ts:18`]), and never keeps a private store, ranker or identity.
28. **Host actions and model tools.** Header injection (clause 9) and resume admission (clauses 15-17) are host actions, never discretionary model tool calls. The only Atlas Memory tools Charlie's model sees are bound recall (clause 12) and bound emit (clause 21). Neither takes an `owner`, root, project or actor argument. Each is advertised only when its installed implementation and host binding exist. Otherwise the capability reports `unavailable` and nothing simulates it.
29. **Native policy.** Both tools are granted by explicit tool ID under the default-deny execution profile [E `O/packages/opencode/src/maestro/roster.ts:10-18`] (H1/H2). They run inside `ToolSafety.run` like every V2 tool [E `O/packages/core/src/tool/registry.ts`, diff since `76015a9`]. A `ToolSafety.Denied` result is a blocker that Charlie consumes and never works around. How Atlas storage writes relate to Maestro's per-task `writeRoots` / `neverTouch` profile is Open decision D7.
30. **Storage placement.** The durable log lives at `memoryLogPath(root) = <root>/.atlas/memory.jsonl` [E `A/packages/adapter-io/src/memory-store.ts:26`]. `root` is always `binding.storage.root`, never a model-chosen path or the tool `cwd`. Owner ruling D5 (2026-10-05): Memory is versioned in Git with the code, so `binding.storage.root` is the repository root of the task's worktree and `.atlas/memory.jsonl` is a tracked file on the task branch. A worktree's Memory becomes canonical only when its branch merges into the default branch. The log must be merge-safe across parallel branches (append-only records with stable record IDs; mechanism chosen in A1, e.g. union merge or one file per record). Current Maestro config binds only `projectID`/`directory`/`sourceDirectory` [E `O/packages/schema/src/config-maestro.ts:10-12`]. Authorized storage resolution is [N-A4 with F2].
31. **Pre-write scanner.** Every write needs a named scanner on `PATH` (`gitleaks`, then `trufflehog`). Without one, every write is refused `scanner-unavailable` [E `scanner.ts:76-97,117-123,174-187`; `memory-emit.ts:213-221`]. The contract keeps this fail-closed behaviour unchanged. Whether a scanner is part of the supported install is Open decision D9.

### Source anchors

Existing (verified at Atlas `b319723d5c`, Orchestra `d11d8652aa`):

| Concern | Anchor |
| --- | --- |
| Kinds, entries, record, slabs | `A/packages/memory/src/types.ts:24,32,44,58-63,75-82,96-102,113-123,137-141,157-162,179-211` |
| Header, owner filter, raw recall | `A/packages/memory/src/inject.ts:30-34,85-87,104-122,148-187` |
| Fold, unit, record identity, first-match | `A/packages/memory/src/respawn.ts:23,31-34,50-60,141-145,165-178` |
| Kind derivation | `A/packages/memory/src/template.ts:120-133` |
| Caps, slots, decay, word tokenizer | `A/packages/memory/src/rules.ts:93-113` |
| Logbook author | `A/packages/memory/src/logbook.ts:56` |
| Orientation empty strings | `A/packages/memory/src/orient.ts:62,68,87-92,102-106` |
| Read door, ranking, spawnFold verdict | `A/packages/adapter-io/src/memory-read.ts:97-127,140-184,186-239` |
| Write door, refusals, gate order | `A/packages/adapter-io/src/memory-emit.ts:67-96,122-245` |
| Store path, rejected count | `A/packages/adapter-io/src/memory-store.ts:26,29-34,45-61`; `durable-log.ts:108-147` |
| Scanner third state collapse, absence | `A/packages/adapter-io/src/scanner.ts:41,76-98,117-123,174-195` |
| Actor resolution, door wiring, public legs | `A/packages/adapter-io/src/compose.ts:170,362-374,582-585`; `compose-runtime.ts:164-190`; `index.ts:119-132` |
| Transport flattening | `A/packages/adapter-io/src/wire.ts:482-496`; `A/packages/mcp-server/src/server.ts:227-234`; `server-memory-tools.ts:30-48` |
| Write schema / out shape | `A/packages/tools/src/handler.ts:319-330`; `types.ts:171-176` |
| Canonical integer-only numbers | `A/packages/kernel/src/canonical.ts:41-49` |
| MEM-4 / MEM-13 normative text | `A/docs/reference/atlas-memory.md:19-20,118,127` |
| V2 runner seam | `O/packages/core/src/session/runner/llm.ts:168-171,182-183,197-198` |
| Registry without Session/agent | `O/packages/core/src/system-context/registry.ts:14,39-42` |
| Unavailable sentinel | `O/packages/core/src/system-context/index.ts:28,201-202` |
| V1 hook seam | `O/packages/opencode/src/session/llm/request.ts:69-73`; `O/packages/plugin/src/index.ts:291-296` |
| Actor serialization | `O/packages/opencode/src/maestro/context-tool-plan.ts:34-41,73-87` |
| Execution profile | `O/packages/opencode/src/maestro/roster.ts:10-18` |
| Config binding | `O/packages/schema/src/config-maestro.ts:10-12` |
| Session evidence events | `O/packages/schema/src/session-event.ts:101-121,333-344` |
| Boundary exports | `O/packages/atlas-boundary/package.json` (`.`, `./materialize`) |
| Static Own loader (unchanged; not Memory) | `O/packages/opencode/src/maestro/atlas-source.ts:33,136,193,242-268` |

Required-new, by owner:

| WP | Items (clause) |
| --- | --- |
| A1 binding/IO | `AtlasBinding` composition outside `composeRuntime` (1, 4); `RecordRef` on admit/resolve (5); `BoundHeader` + `StoreState` from `rejected` (7, 13); `HeaderBound` (8); narrowed recall (12); `resolveFold` (15, with A2); scanner `could-not-run` → `scanner-unavailable`, `store-partial`/`store-unavailable` refusals (23); `reconcile(entry)` (25) |
| A2 pure semantics | `PrClosingFold` + PR projection (14); exact-record projection inside `resolveFold` (15); Orientation missing-source state (7); Atlas-owned initial `frecency` policy (22) |
| A3 installed boundary | Separate IO/native subpath, regenerated artifacts, `build.test.ts` file list extended (27; see Drift) |
| A4 host consumer | Member-aware V2 producer + V1 selected-member binding (9); degraded-value mapping (10); `AdmissionKey` event + lookup-before-select (17); receipt persistence (24); storage-root resolution (30) |
| H2 | V1 hook type change and tool binding (9, 28, 29), jointly with A4 |

### Consumers

- **A1**: clauses 1, 4, 5, 7, 8, 12, 13, 15, 23, 25, 26, 31.
- **A2**: clauses 7 (Orientation), 11, 14, 15, 22.
- **A3**: clauses 27, 28.
- **A4**: clauses 3, 9, 10, 16-20, 24, 30.
- **H2**: clauses 1-3, 9, 28, 29.
- **Q-memory**: every clause. It needs mandatory adverse controls for 2 (rename/new Session keep the owner), 5 (an identical resubmission is not a new checkpoint), 7 (unreadable ≠ empty), 10 (three outage states), 15 (oldest-first `spawnFold` cannot be selected), 16 (refused later write cannot win), 17 (retry/restart cannot re-admit), 21 (Charlie logbook refused), 23 (scanner third state), and 25 (lost response reconciled before retry).

### Non-goals

- Scope-aware rule selection, work-scope grammar, or scope-safe rule identity (pending D1).
- Cited-hit learning or ranking changes.
- Universal merged-history "latest", cross-clone or offline reconciliation, multi-process admission serialization (pending D8).
- Awareness seeding or curation, logbook caps beyond the existing door, Charlie logbook authoring or recall.
- Memory confidentiality: the store is shared plaintext [E `inject.ts:95-97`].
- CLI/MCP parity with the bound API: the generic transports are not consumed.
- Atomicity across Atlas storage and Session events.
- Guaranteed closing or final folds.
- Knowledge admission from `knowledgeDelta`.
- Any Charlie-side store, ranker, identity hash or JSONL parser.

### Open owner decisions

- **D1.** For first delivery, should Charlie's Rules be scope-aware? (If yes, Atlas wires applicable-set selection plus a work-scope grammar and scope-safe rule identity.) Or should the support claim be amended to "own top-12 ranked project rules, unscoped"?
- **D2.** Does the PR resume fold include `knowledgeDelta`, or only `decisions` + `reviewOutcomes`?
- **D3.** When no host receipt exists and several own checkpoints exist for the resumed unit, should resume refuse as `ambiguous` (a blocker returned to the caller), or admit the last-in-log-order record labelled as uncertain?
- **D4.** After compaction evicts an admitted resume fold, should the host re-push the same `RecordRef` once (as residency restore), or never re-push and leave it to Charlie's explicit recall?
- **D5.** Where does authoritative Memory storage live for a project with several task worktrees? Options: one shared storage root per project, outside any task worktree, or per-worktree logs with versioned carry. Is writing a tracked `.atlas/memory.jsonl` inside a source worktree acceptable, given that it changes Git dirt and governed-context currency?
- **D6.** What initial `frecency` does a Charlie-proposed project rule get? It must be an integer chosen by Atlas policy, never by the model.
- **D7.** Are Atlas storage writes subject to Maestro's per-task `writeRoots` / `neverTouch` profile, or are they harness-owned foundation storage outside the task profile?
- **D8.** Is single-writer-process admission (consistent with process-local Session drains) sufficient for first delivery, or must Atlas serialize state-dependent gates across processes?
- **D9.** Does the supported install ship or require a pre-write secret scanner (`gitleaks`)? The alternative is to accept that every Memory write on a host without one is refused `scanner-unavailable`. No approved toolkit engine covers this today.

## Drift since 76015a9

Atlas: HEAD unchanged (`b319723d5c`). Every Atlas anchor P2 cites was re-confirmed. Line shifts: `compose.ts` actor resolution is at `:170` (P2 cited the range `163-175`). The `wire.ts` refusal fold is at `:489-496` (P2 `491-495`). The remaining cited ranges match. P2's semantic findings are still true: first-match fold, task-only projection, scanner collapse, `rejected` discarded by the doors, refusal-detail loss in wire/MCP, and integer-only canonical numbers.

Vendored `O/foundation/atlas`: no change since `76015a9`. The twelve Memory-cluster files are formatter-equivalent to canonical, as described in the header.

Orchestra, anchors that matter for F3:

| Change | Effect on F3 |
| --- | --- |
| `O/packages/core/src/tool/registry.ts` (+113): every V2 tool call now runs through `ToolSafety.run`. It returns `Tool safety HOLD: native-placement-or-events-missing` without Location/events, and emits `Tool.Progress` with `structured.toolSafety`. | Native Atlas recall/emit tools are subject to the Maestro profile (clause 29). Atlas storage writes versus `writeRoots` becomes Open decision D7. Tool evidence now also carries safety observations next to the Atlas receipt (clause 24). |
| `O/packages/atlas-boundary/test/build.test.ts` (new) asserts byte-exact regeneration over a hard-coded list of four files (`boundary.js/.d.ts`, `materialize.js/.d.ts`). The new `.gitlab/atlas.sh` CI lane runs `check:generated`. | A3 must extend that file list for the new subpath. Otherwise the new artifacts are not covered by the byte-exact guard: the test would pass vacuously for them. |
| `O/packages/opencode/src/maestro/arsenal-completion.ts` (new): completion receipt `CheckOutcome` has no Memory field. | Confirms clause 19. The completion receipt is not a closing checkpoint, and memory status travels separately in F4. |
| `O/packages/core/src/session/runner/llm.ts` (+1, `usageKnown` at `:340`). | None. The cited seam lines `168-198` are unchanged. |
| `O/packages/schema/src/session-event.ts` (+`usageKnown` optional). | None. `ContextUpdated`/`Synthetic`/`Tool.*` anchors are unchanged. |
| Unchanged: `maestro/atlas-source.ts`, `atlas-boundary/package.json` exports, `session/llm/request.ts` (hook call now cited `:69-73`), `plugin/src/index.ts:291-296`, `schema/src/config-maestro.ts`, `maestro/{roster,context-tool-plan,governed-task-reservation,context-record}.ts`, `core/src/system-context/*`, `plugin/src/v2/*`. | P2 consumer anchors stand. |
