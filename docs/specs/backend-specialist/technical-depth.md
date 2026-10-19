# Technical depth: ownership, effects, state and learning

Status: source-backed team/foundation engineering reference, 2026-10-03. Upstream code and test assertions were inspected; runtime probes and comparative benchmarks were not executed. The owner's subsequent role correction supersedes the earlier proposal to expose these as the backend specialist's investigative procedures.

Investigation, diagnosis, architecture and verification owners use the reasoning/probe procedures below to prepare work. Host/Atlas maintainers own infrastructure changes. The backend specialist receives only the resulting implementation requirements, assigned code targets and prescribed checks that its packet needs. It does not select an investigation or diagnose these failure classes itself.

Technical knowledge remains valuable when implementing a specified fix. It does not authorize taking over the preceding research/design/diagnosis or the following independent review. These cards are not the backend specialist's runtime workflow inventory; [capabilities.md](capabilities.md) defines that narrower inventory.

Native persistence, cache, compaction and execution already belong to the harness. Maestro defines team scope and permissions; native mechanisms enforce them. The infrastructure patterns below are references for those existing owners, not systems the backend specialist must create.

## Versioned evidence

| Subject | Verified baseline | What was inspected |
| --- | --- | --- |
| OpenClaw 2.0 launch | `v2026.8.1`, `ea806575e6450e4d1efdfc72c19f04be982a1b9b` | Official 2.0 identity; selected launch SQLite/admission and terminal-observation paths |
| OpenClaw later release | `v2026.9.8`, `fc23bc864e4553c2d215e479eeec47b67a0bf943` | Selected memory, tools, plugin, skill and failure paths |
| OpenClaw source snapshot | `06da0de86c0a27dc1e92995f9d0a2428880ce90c` | Runtime ownership/recovery and selected later changes; not interchangeable with either release |
| Hermes release | Package `v0.21.5`, tag `v2026.9.24`, `f97608f178d1ffeca59860195ab7da295f7c8e5f` | Selected release/main comparisons |
| Hermes source snapshot | `d795726f78e532ca31655f74656b4be63a907581` | Runtime, Memory/skills, tools, middleware, compression and failures |
| Hermes self-evolution companion | `0a929e3aa20e15cf04dc7c28492a7d41a5139125` | Separate offline skill-optimization prototype; not Hermes runtime quality evidence |

[Official release documentation](https://docs.openclaw.ai/releases/2026.8.1) explicitly calls `v2026.8.1` “OpenClaw 2.0.” Current release/main comparisons are file- and mechanism-specific; timestamps or equal package version strings do not establish source equivalence or ancestry.

Detailed call paths, source links and evidence limits: [R21](research/21-openclaw-runtime.md), [R22](research/22-openclaw-memory.md), [R23](research/23-openclaw-tools.md), [R24](research/24-hermes-runtime.md), [R25](research/25-hermes-memory.md), [R26](research/26-hermes-tools.md), [R27](research/27-agent-failures.md), [R28](research/28-backend-depth.md).

## What the comparison changes

OpenClaw contributes strong examples of durable input custody, current-owner checks, precise tool contracts and complete skill-resource bundles. Hermes contributes progressive procedures, explicit memory mutation, scoped child handles, provider-aware prompt caching and programmatic tool aggregation. Both also expose important distinctions that friendly API names or diagrams can hide.

| Distinction | Source example | Integration/implementation constraint |
| --- | --- | --- |
| Scheduling finished versus memory persisted | OpenClaw's exhausted flush returns `outcome: exhausted` while persisting a success-looking cycle latch | Only the actual Atlas admission receipt can establish a saved memory |
| Child ended versus work accepted | Hermes child lifecycle can map usable budget-exhausted output to `SUCCEEDED`, losing truncation/exit detail | Preserve terminal reason, partial output and verification independently |
| Input acknowledged versus durably owned | Hermes late-steer report places `accepted: true` after the final consumer drained | Admission and consumption need native evidence; an ephemeral assignment is insufficient |
| Catalog availability versus execution authority | Hermes RPC helper broadens an empty enabled-tool intersection to its full sandbox whitelist | Explicit empty capability scope remains empty at execution |
| Outer program success versus nested outcomes | Composed scripts can catch tool failures and return normally | Retain leaf outcomes, possible effects and costs independently of the aggregate |
| Context reduction versus economic improvement | Hermes micro-compaction adds model calls and can invalidate warm cache suffixes | Compare total accepted-task cost and latency, including auxiliary work |
| Learned text versus improved installed skill | Companion self-evolution path optimizes a text metric without a proven export/reload acceptance bridge | Evaluate the exact exported bundle through the actual host before adopting it |

These are bounded source observations, not whole-product reliability rankings or newly executed exploit demonstrations.

## T1 — Final arguments, leaf authority and semantic outcomes

**Trigger:** tool middleware, delegated execution, CLI/MCP adapters, programmatic aggregation or a result transformer changes.

**Invariant:** the effective operation and resources are checked at the host-owned execution boundary. Description, visibility, wrapper approval and a prior argument set cannot authorize a different leaf action.

**Procedure:** trace declaration → selected registration → argument normalization/rewrites → runtime validation → leaf permission/currentness → effect → semantic outcome → projection/delivery. Preserve the issuing member and actual authority/execution Session binding through every nested call. A later agent switch does not replace the identity that issued the call.

Use existing native settlement and resource services. Already-started calls follow their captured registration and the host's cancellation/revocation lifecycle; stale undispatched calls reject. Schema compatibility alone must not transfer an invocation's authority to a replacement registration. Keep unspecified configuration distinct from an explicitly empty allowlist. Observers consume evidence; display transformations cannot turn failure into execution success.

**Adverse schedule:** approve a read of A, rewrite final arguments to a write of B, then invoke through direct, MCP and composed paths. The denied write must not happen. Also let a real effect succeed and make output validation fail afterward: retain the known/possible effect and block dependent consumers; do not claim rollback.

**Healthy/control pair:** the permitted exact operation succeeds through each claimed adapter; removing the final leaf check or dropping the uncertainty field makes the adverse case observable. A test that merely rejects every invocation is insufficient.

**Small path:** a static native tool with an existing validated handler needs that handler and policy, not a new middleware framework. Sources: [R23 T2–T5](research/23-openclaw-tools.md), [R26 §§2–5](research/26-hermes-tools.md).

## T2 — Useful programmatic aggregation with visible child work

**Trigger:** the model repeatedly fetches pages/items, performs mechanical joins/counts, or rereads large tool results.

**Invariant:** a compact model-facing answer preserves relevant completeness, authorization and outcome evidence. Fewer outer calls do not conceal more work or failed effects.

**Procedure:** gather authorized bounded structured data; filter/join/deduplicate with immutable keys; return the requested result plus source coverage, cursor state, failures and recoverable evidence references. Prefer deterministic computation for deterministic work. Keep every leaf invocation on the native permission/settlement path with parent/child correlation and cancellation.

Reuse existing `packages/codemode` when its host exposure fits. The inspected V1 `CodeModeTool` currently assembles MCP tools; this does not establish arbitrary native-tool composition or V2 parity. Its library exposes execution limits, while the inspected adapter supplies none. Any backend specialist use must supply an explicit host policy for time, admitted subcalls and output, alongside producer-side resource limits.

**Adverse schedule:** source A returns one page, B denies, C times out after possible write; the script catches errors and returns a count. The result cannot be presented as an exact complete total or as all operations successful. Retry must not replay C blindly.

**Healthy/control pair:** complete bounded sources produce the correct deterministic join; a missing page or swallowed child failure changes completeness/outcome. Compare direct and composed paths with the same task, including leaf requests, auxiliary inference, bytes, runtime and provider tokens.

**Small path:** use direct native calls for a small catalog or a single operation. No extra interpreter, tool gateway or Python RPC kernel. “Intermediate results stay out of the parent prompt” is not “zero cost.” Sources: [R23 economy](research/23-openclaw-tools.md), [R26 §§4–6](research/26-hermes-tools.md).

## T3 — Generation-qualified cancellation and cleanup

**Trigger:** timeout, worker replacement, stream interruption, shared in-flight work or a delayed finalizer.

**Invariant:** cancellation targets its captured owner; stale work cannot publish into or release a successor. Stopping a waiter does not prove its producer terminated.

**Procedure:** identify producer, subscribers, execution handle, resource lease and publication owner. Preserve handles until actual completion/cleanup. Check captured generation or registration identity at the authoritative publication/removal point, not only before a long await. If work genuinely has multiple consumers, one consumer leaving must not destroy another's valid result.

**Adverse schedule:** A times out, B replaces it, then A emits a late result and runs `finally`. B must retain its slot/resources/output. For shared work, cancel one of two waiters, then the last: the first cancellation preserves useful work; the last retains cleanup responsibility until the producer finishes.

**Healthy/control pair:** B completes and resources become reusable; name-only cleanup or dropping the producer handle on timeout must make the controlled interleaving fail. Observe actual worker/resource state, not just a rejected promise.

**Language detail:** Tokio handle drop detaches; started `spawn_blocking` is not stopped by abort. Go cancellation does not join. Python executor work may outlive a cancelled await. Node `finished` cancellation and pipeline destruction have different effects. Use the actual runtime's ownership facilities.

**Small path:** one awaited operation and its existing scope are usually enough. Subscriber accounting belongs only where work is shared. Sources and versioned runtime references: [R28 R3](research/28-backend-depth.md).

## T4 — Liveness evidence is not a write fence

**Trigger:** a backend already uses leases, worker takeover, lock reclaim or stale-owner recovery.

**Invariant:** distinguish `live`, `dead` and `unknown`; protected writes reject displaced ownership at the destination. TTL expiry alone does not stop an old process from acting.

**Procedure:** establish which host/boot/PID namespace makes evidence comparable, whether PID reuse is possible, and who can reclaim. Recheck ownership transactionally. For participating writes in one database, use the existing lease/epoch and locking or conditional-write mechanism at the business mutation. Remote stale-owner exclusion requires a participating ownership/version condition at the protected resource. Idempotency separately protects replay of the same intent; it does not fence an older distinct operation.

**Adverse schedule:** A pauses; lease expires; B claims; A resumes mutation or release. Use distinct operation keys for A and B against the same resource: correct deduplication alone must not let A overwrite B's newer state. The old owner must not corrupt B. Separately, recreate a container with a changed hostname: unknown evidence must not be mislabeled either definitely alive or definitely dead.

**Healthy/control pair:** supported dead-owner recovery works, a qualified live owner stays protected, B's valid write succeeds and A's stale write fails. Removing the destination check must expose the difference.

**Small path:** process-local coordination or a normal database transaction remains sufficient for ordinary work. This procedure does not introduce clustered Session execution or a second coordinator into the backend specialist. OpenClaw's heartbeat constants are its policy, not portable proof or the backend specialist defaults. Sources: [R21 ownership](research/21-openclaw-runtime.md), [R27 O1](research/27-agent-failures.md), [R28 R1](research/28-backend-depth.md).

## T5 — Recover state with its real storage owner

**Trigger:** SQLite backup, database-file replacement, migration recovery or “read-only” forensic inspection.

**Invariant:** preserve committed state, physical generation and lock custody. Busy/unavailable verification is not proof of corruption or permission to overwrite live data.

**Procedure:** distinguish a live backup from forensic capture and authorized restore. Use the driver's supported online backup for ordinary backup. Account for WAL/journal state. Coordinate restore with existing maintenance ownership, and never replace a file underneath live handles merely because a foreign-holder detector returned unknown.

Under SQLite's documented Unix/POSIX locking conditions, opening and closing an unrelated raw descriptor on the database inode can disturb locks held by SQLite in the same process. Managed-language ownership and a read-only intention do not eliminate that OS behavior. Keep low-level inspection inside the storage owner's supported path.

**Adverse schedule:** commit a sentinel only present in WAL, then copy only the main file; or let a foreign process hold the database while a platform cannot enumerate holders. A valid-looking restored database must not hide lost committed rows or overwrite the live generation.

**Healthy/control pair:** supported backup contains committed related rows; legitimate offline restore works; main-file-only copying or treating unknown ownership as empty must be detected. Artifact-preservation byte checks use a quiescent fixture; they cannot assume live writers leave bytes unchanged.

Lock custody needs its own control: establish SQLite's held lock, run a same-process diagnostic raw open/read/close, and have a separate process attempt conflicting acquisition. Observe exclusion directly rather than relying on intact rows. Qualify the fixture by actual platform, VFS and SQLite defenses; a purported bad variant that remains protected has not demonstrated the detector's sensitivity.

**Small path:** ordinary CRUD does not need raw file probes. Reuse the current backup/repair command. This SQLite lesson is not an instruction to replace Atlas's JSONL/CAS storage. Sources: [SQLite WAL](https://sqlite.org/wal.html), [corruption mechanisms](https://sqlite.org/howtocorrupt.html), [backup locking](https://sqlite.org/backup.html#file_and_database_connection_locking), [R28 R2](research/28-backend-depth.md).

## T6 — Retry according to effect phase, not error wording

**Trigger:** network reconnect, SDK retry, lost reply, process crash around commit, or an error after successful persistence.

**Invariant:** `not dispatched`, `definitively refused`, `possibly applied` and `known committed` require different recovery. An ancillary failure after commit cannot silently reclassify the business effect as unapplied.

**Procedure:** preserve structured phase and stable intent identity through adapters. Retry eligible proven pre-dispatch failures under the existing budget owner. After possible dispatch, reconcile actual state or use the provider's verified idempotency contract. Record response delivery, logging and cleanup separately from business commit.

**Adverse schedule:** server commits; reply disappears; reconnect resends. Another case commits locally, then a permission-hardening/logging step fails and triggers the whole transaction wrapper again. The effect must not be duplicated by recovery.

**Healthy/control pair:** pre-dispatch reconnect performs the intended effect once; post-dispatch uncertainty remains visible and reconciles; normal commit succeeds. Inspect destination state and actual intent identity. A local call counter or HTTP status alone is not proof of remote outcome.

**Small path:** a naturally idempotent conditional update can remain simple. No generic outbox/payment engine is required for harmless reads. Orchestra's advisory inbox wake remains separate from automatic post-crash provider continuation. Sources: [R19 retries](research/19-data-api.md), [R26 MCP](research/26-hermes-tools.md), [R28 R4](research/28-backend-depth.md).

## T7 — Cache freshness, authority and context residency separately

**Trigger:** cached schemas, tool availability, Atlas recall, skill reread suppression, live configuration or compaction.

**Invariant:** a cache hit must still mean current applicable content. An old in-flight fill cannot republish after invalidation; “already read” is valid only while the content is still available in the active model context.

**Procedure:** identify semantic inputs, source revision, policy scope, registration generation and renderer version. Propagate inner expiry into derived caches or revalidate at the proper boundary. For an asynchronous fill, capture the current generation and publish only if it is still current under the cache owner's synchronization. A TTL alone does not prove source freshness or permission validity.

Keep active-context residency separate from source identity. Compaction can remove a skill body without changing its file hash; later access must reload needed content rather than return an “already shown” stub. Rename changes presentation, not persistent member/source identity. Deferred work retains its original project/profile binding rather than reading ambient settings from another task.

**Adverse schedule:** start old probe A, change configuration and invalidate, then let A finish. Also keep an outer schema cache hot while its inner availability TTL expires. After compaction, request exact skill detail previously evicted.

**Healthy/control pair:** stale fill cannot become current; actual dependency expiry triggers the needed check; unchanged fresh data remains reusable; evicted detail can be recovered. Verify real cache paths rather than disabling caching in the fixture.

**Small path:** remove an unnecessary cache or invalidate one existing entry before building generic cache machinery. Atlas and the native host remain the cache owners. Sources: [R22 recall](research/22-openclaw-memory.md), [R25 disclosure/caching](research/25-hermes-memory.md), [R27 H1](research/27-agent-failures.md), [R28 R5](research/28-backend-depth.md).

## T8 — Bound admission, live resources and bytes independently

**Trigger:** concurrency, large exports, worker pools, connection pools or streaming consumers change.

**Invariant:** a limit on idle objects or worker threads does not automatically bound queued work, peak open resources or payload memory.

**Procedure:** place admission before expensive allocation. Scope permits to the actual shared resource, retain them through real cleanup, and count opening/closing resources when relevant. Bound pending work, per-item/page size and buffered bytes separately. Inspect fallback paths for nested acquisition or lock-order deadlock.

**Adverse schedule:** many callers see an empty idle queue and each opens a connection; only the return path enforces its size. A bounded object queue also fails when each object carries arbitrarily large bytes. An output display cap applied after full capture does not bound producer memory.

**Healthy/control pair:** force overlapping opens, slow consumption, early disconnect and partial-open failure; observe actual resource population and bytes alongside logical counters. Later healthy work must still run. Moving the permit after acquisition or making a shared budget instance-local exposes the defect.

**Small path:** serial iteration and bounded paging often suffice. Do not add a worker farm to make a small operation look sophisticated. Relevant language differences and source examples: [R28 R6](research/28-backend-depth.md).

## T9 — Coherent registrations and complete skill bundles

**Trigger:** plugin reload, schema caching, skill installation, helper-script changes or a public-label rename.

**Invariant:** the advertised contract, selected implementation and teardown owner belong to one coherent generation. Skill identity covers executed/supporting resources, not just `SKILL.md`.

**Procedure:** validate replacement before publishing through the existing registry. Capture registration identity for dispatch and compare-and-remove cleanup. Preserve exact wire/schema semantics across live and cached discovery, including SDK aliases. Hash/version the complete selected skill bundle's paths, bytes and relevant executable metadata; record external tool/dependency versions separately.

**Adverse schedule:** A registers, B replaces it, then A's disposer deletes by name. Another case changes a helper script but retains the same entry Markdown. A cached SDK field fallback can also turn a required-argument schema into an empty object.

**Healthy/control pair:** B still executes after A cleanup; malformed replacement preserves the valid registration; live/cached schemas preserve required nested fields; helper changes alter artifact identity. Bundle hash equality is not proof external dependencies or execution environment are unchanged.

**Small path:** static routes and text-only skills need their existing registration/asset path. No new plugin marketplace, registry or snapshot service. Sources: [R23 T1/T6](research/23-openclaw-tools.md), [R26 registry](research/26-hermes-tools.md), [R28 R7](research/28-backend-depth.md).

## T10 — Learn from evidence; evaluate what will actually ship

**Trigger:** repeated useful workflow, explicit user correction, proposed project rule, skill revision or offline prompt optimization.

**Invariant:** a captured procedure, frequently viewed rule or high text score does not establish improved engineering behavior. A correction must revise exact applicability; failed succession is not repaired by appending another competing instruction.

**Procedure:** retain origin, task outcome, relevant versions, scope and source references. Keep failures as task evidence until a reliable lesson is established. Use Atlas for Knowledge/Memory and evidence lineage; keep executable skills in package/repository assets. Distinguish source validity from retrieval frequency and active-context residency. Inactivity can invite review without proving a rare recovery rule wrong.

For offline improvement, freeze baseline, task groups, grader and budget; generate a candidate; export the complete candidate artifact; reload it through the actual host; evaluate that exact version on held-out groups and existing regressions. Keep failed trials and total cost. Related sessions/project examples must not leak across training/holdout merely because individual rows were randomly split.

The inspected Hermes companion `evolve_skill` path uses `skill_fitness_metric`, a lexical expected-word-overlap proxy, and lacks a proven bridge from optimizer changes to the exported/reloaded skill. Its separately defined LLM judge does not change which metric that path calls. This is evidence about that prototype snapshot, not a judgment of all Hermes learning or an executed exploit.

**Adverse schedule:** a wrong answer repeats rubric words and scores highly; an optimized in-memory module differs from the saved skill; a helper resource is omitted on export; a failed environment attempt becomes “never use this tool” even after the environment is repaired.

**Healthy/control pair:** a candidate improves real outcome after installation/reload without losing preserved behavior; alternative valid solutions pass; keyword-rich wrong outputs, missing holdouts, skipped checks and export drift cannot certify improvement. Verify actual database/API/process behavior when that is the claim.

**Small path:** an explicit scoped correction and its evidence can be enough. Do not add a periodic curator, forced archive quota, live self-modifying agent or optimization framework without demonstrated need. Sources: [R22 promotion](research/22-openclaw-memory.md), [R25 and R25A](research/25-hermes-memory.md), [R20 evaluation](research/20-evaluation.md).

## Outcome projection: preserve separate facts

Use these distinctions in existing records and adapters when the operation needs them; this is not a new universal task state machine:

```text
admission: input durably accepted / refused / unknown
execution: pending / running / ended / interrupted / failed
effect: not started / possible / confirmed, with the relevant boundary
result persistence: recorded / failed / unknown
delivery or parent consumption: pending / acknowledged / unknown, when observable
coverage: complete / partial / unavailable
verification and task acceptance: their existing independent decisions
```

Preserve original terminal reason and source references. A process exit, yielded turn, partial child summary, suppressed retry latch, caught tool error or a delivery acknowledgment each establishes only its own fact. Retry delivery of a retained result instead of rerunning expensive completed work.

This applies only through the supported host path. V2 already has a durable inbox contract; initial V1 integration must prove its own accepted-input/late-follow-up behavior rather than borrow V2's guarantees or add a private queue. Post-crash provider continuation remains explicit host design.

## Construction impact and efficiency

The architecture still uses one implementation specialist package, thin adapters, native host execution and shared Atlas. Responsible owners use this research to specify work and checks at existing boundaries:

- **First slice:** exact identity/context, actual memory receipts, truthful nested/partial outcomes, current resource scope and meaningful backend tests.
- **When composition is added:** existing CodeMode, bounded subcalls/output/producer work, final leaf policy and per-child evidence.
- **When caching or reload changes:** generation/freshness/residency and stale-disposer tests.
- **When storage recovery or learning is added:** actual owner maintenance, exact exported-artifact evaluation and explicit unsupported cases.

Host/evaluation owners measure model usage, leaf calls, resource occupancy, latency and repair costs. The backend specialist executes only its assigned implementation and checks. Discovery metadata, imports, capability probes, transport startup and execution remain different costs; none grants the backend specialist an investigative role.

## Evidence and review boundary

Primary links in the reports pin source versions and identify inspected tests. The lead independently checked the official 2.0 release title, release/commit metadata, Hermes's empty-intersection helper, OpenClaw's flush-exhaustion assertion, the Hermes skill-optimization metric/caller, and Orchestra's existing CodeMode limit/adapter surface.

No runtime gain, complete security audit or competitive ranking follows from those reads. The proposed controls are the next implementation/evaluation work, not already-passing backend specialist tests. This extension preserves the owner's architecture-first scope.
