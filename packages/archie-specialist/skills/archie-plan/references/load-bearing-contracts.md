# Load-bearing contract authoring

Read when a public type/error, wire/event format, schema or migration shape crosses current slice ownership and changing it would force a consumer to change. Independent local edits do not need a contract ceremony. Author the smallest exact seam; Maestro/owner decides adoption and revisions.

## Inputs

Use supplied/authorized observed producer and consumer sites, selected read/write slices, exact declarations, behavior/error evidence, baseline/source identity and acceptance/oracle references. Current static Own facts and explicit drill pointers govern canonical units; stale or absent governed identity is `HOLD`. Missing acquisition is a blocker, not a guessed declaration.

## Procedure

1. Identify why the seam is load-bearing **now**: producer, consumers and which change would force coordinated edits. Propose freezing only that surface. Leave private helpers/algorithms and local choices free; avoid speculative future APIs.
2. Quote exact existing declarations with path, symbol/anchor, source revision and supplied digest if available. Put a proposed changed interface in a separate exact code sketch. Preserve names, parameter/return types, effect/error channels and exported types; do not paraphrase a signature or present proposed text as observed source.
3. Specify behavior beyond syntax: accepted/rejected inputs, invariants, error outcomes, wire/serialization/version/default/null semantics, ordering/idempotence and migration/compatibility assumptions where relevant. Mark unknowns explicitly rather than filling every field speculatively.
4. Name provider and every known consumer, acceptance IDs, expected material/output, and seam oracle/evidence. Identify acquisition coverage so an incomplete consumer list cannot appear complete.
5. If installed/authorized, describe then use `contract-freezer` for supplied canonical declared-surface drift and `anchor-gen` for bounded exact shared-surface briefing. Generated bindings/anchors are proposal artifacts, not owner approval or arbitrary AST acquisition.
6. `seam-checker` may compare supplied declarations. Request actual compiler, negative/error-path and integration/golden evidence from host. A matching declaration/hash catches declared drift, not all behavioral incompatibility. Do not duplicate implementation into a second oracle and call agreement independent evidence.
7. On drift, return exact finding, affected producer/consumers, proposed revision and re-verification needs to Maestro. Refresh identities after changed source. Scope/context/approval changes remain host governed lifecycle; a frozen hash cannot replace `PlanRevision`, GROUNDED facts, exact approval or Task authorization.

## Contract packet

Use the existing project format, keeping observed and proposed declarations distinct:

```text
contract: author proposal version; status proposed; parent/reason when revising
surface: source path + exact symbol/anchor + source identity + declaration excerpt
change: exact proposed declaration sketch + behavior/error/wire deltas
parties: producer; consumers; acquisition coverage/unknowns
obligations: acceptance IDs; live invariants; serialization/version/compatibility assumptions
materials: exact input/output refs; source/digest basis; bounded per-consumer anchors
verification: seam oracle refs; supplied actual status/evidence; required missing host checks
handoff: proposed adoption/revision options; affected consumers; blockers/unblock owner
```

Keep deep declarations in assigned artifacts with bounded anchors/pointers per consumer. A full proposal remains available to the host even when a brief carries only needed excerpts. Stale excerpts do not become facts through repetition; retain their source identity and refresh or hold.

## Scaffolding and verification boundary

`stub-gen` and `symbol-flow-check` are outside upstream's frozen authoring subset. Do not acquire/apply scaffolding, run backend integration or claim compiler flows through them. An interface skeleton may be authored as proposal text within assigned artifacts. If host supplies real scaffolding/evidence, label stub behavior and unresolved production obligations; compiling a stub is not production proof.

Propose resolved check commands/cwd only from actual host/project evidence. For a public Protocol/Server HttpApi change, carry the project's client regeneration obligation; legacy SDK regeneration likewise follows project rules. Execution workers/host run those steps under actual write authority. Generated gates/policies/checks do not register an oracle or create enforcement.

Return `FAIL` for cited signature drift/consumer compile error/behavioral mismatch/failing check; `UNKNOWN` for missing acquisition/compiler/runner; `HOLD` for stale governed identity or missing authority. Report unresolved stubs explicitly. An author-local consistency check is not independent seam acceptance.

## Source method and limits

Source pin: `abf7a72c77fcaeee1206400a8270b2581ae9839c`.

- [maestro-contract](../../../../orchestra/playbooks/maestro-contract/SKILL.md), “Procedure” 1–6, “Success / fail” and “Output schema”: minimal load-bearing surface, exact source-bound anchors, real seam evidence, stub honesty and drift handoff. Upstream receives authoring procedures, not source scaffold/edit/compiler/governance powers.
- [maestro-decompose](../../../../orchestra/playbooks/maestro-decompose/SKILL.md), “Procedure” 4: write-to-read edges are dependencies; shared writes need re-slicing/sequencing.
- [WP-card method](../../../../../foundation/atlas/docs/method/wp-template.md), “The driftless law” and “Honest limitation”: pointer/source identity and provenance are useful; neither hashes nor exact sketches prove correctness. Its promised resolver/attestations and zero-decision framing are not runtime guarantees here.
