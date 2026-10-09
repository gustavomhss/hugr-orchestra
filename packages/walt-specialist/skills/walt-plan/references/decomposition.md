# Decomposition and acceptance coverage

Read for substantial multi-part authoring, acceptance ownership, shared-write risks or a proposed parallel partition. Produce a proposal for Maestro's review/routing; do not dispatch, choose actual scheduling or certify acceptance.

## Inputs

Use verbatim demand, supplied baseline/current delta, acceptance and project checks, exact read/write paths, producer/consumer facts, host acquisition coverage and governing facts. Current host-supplied static Own facts dominate maps/search for canonical governed units. Follow only supplied explicit drill pointers within assigned reads; missing/stale/ambiguous/held Own state is `HOLD`, never guessed authority.

## Coverage and criteria

1. Enumerate requested outcomes with stable acceptance IDs and demand references. Give every item an accountable evidence owner and an oracle reference; distinguish already-covered preserved behavior from new behavior requiring new proof.
2. Reuse existing checks where they apply. Record host-observed baseline-passing preservation separately from meaningful failing baseline/red-to-green proof. If no runnable baseline/oracle was supplied, mark `UNKNOWN` and request it; a proposed command is not a run. Untestable semantic items are `judged` with a named decision owner and pending judgment, not auto-green.
3. For each epic, WP or governed unit/card, use exactly these headings. A child cites parent criteria and writes only additions/changes under them; parent closure requires children **and their seams** to satisfy the applicable criteria.

```markdown
## Completeness Criteria
## Success Criteria
## Invariants
## Quality Standards
## Definition of Done
```

Completeness states the coverage boundary/closure predicate. Success states observable intended results. Invariants are obligations still live during/after work, not historical baseline failures. Quality names the review/engineering bar; Definition of Done names required evidence and accountable independent acceptance. Examples, user/call/payload journeys or counterexamples belong only where they make a criterion checkable. Small independent Tasks keep these criteria implicit and use existing checks; no compiler, arm, step sequence or review ceremony is mandatory merely because a Task exists.

4. For substantial multi-package demand, prepare a cold coverage-review request containing **only verbatim demand and named acceptance items**, including oracle and judged/decision owner. Ask the host to obtain independent critique for missing behavior, negative/edge cases, recovery, vague items and overreach. Do not send the author's rationale/partition/code or review your own acceptance as independent judgment. Author responses/revisions for Maestro to resolve; unavailable review stays `UNKNOWN`. Two unchanged gap-free rounds can bound broad discovery, not prove completeness or burden small work.

## Slice by responsibility

Build cohesive slices around one useful responsibility/outcome and its acceptance ownership, not line ranges or one micro-WP per invariant. Each slice records objective, exact allowed writes, required reads/materials with source identities, owned acceptance IDs, exclusions, output artifacts, constraints, implementation latitude and evidence obligations.

Remove shared registries/manifests from proposed worker ownership when project structure permits; name the integration owner/handoff. Shared non-append writes require a proposed sequence or re-slice. Append-only union still requires integration review and cannot justify a blanket conflict-free claim. Do not silently widen the assigned write set.

Keep separate edge classes:

- **Hard dependency:** a predecessor must produce material/evidence before the consumer can work.
- **Contract dependency:** slices share a load-bearing interface; consumers may work against an owner-decided exact contract, but integration still needs producer/seam evidence.
- **Write-to-read dependency:** another slice changes material this slice consumes; record direction/freshness and required recheck, not a write conflict.
- **Write conflict:** overlapping incompatible writes require sequencing, narrower ownership or re-slicing. Disjoint writes do not eliminate semantic/runtime conflicts.

Use [load-bearing contracts](load-bearing-contracts.md) for cross-slice seams. Trace each acceptance item to its slice and check; expose orphan items, duplicated closure ownership, cycles, stale inputs and scope-creep slices. Shared acceptance may have contributors, but name one closure owner. Architecture forks become proposed choices/blockers for Maestro, never worker-created scope expansion.

Size by cohesive concepts, uncertainty, working-set size and review cost. Split oversized nodes; combine tiny tightly coupled nodes when handoff costs dominate. Recommend sequencing/parallel candidates based on actual edges, not a schedule. Host supplies actual model, budget, placement, provider limits and oracle runners; unknown metadata stays unknown.

## Pure operations and evidence

Use [walt-plan's authorized sequence/subset](../SKILL.md#authorized-structural-helpers) only when installed and authorized:

| Operation | Authoring purpose | Evidence limit |
| --- | --- | --- |
| `sliceability` | Graph-based slicing advice from supplied facts | Not a dispatch decision or complete acquisition |
| `plan-compiler` | Assemble supplied symbols/partitions/edges into `partitionPlan` | No acquired facts, durable `PlanRevision` or authority |
| `conflict-map` | Compare actual supplied write sets/read dependencies | Partial input cannot prove absence of all conflicts |
| `plan-check` | Diagnose supplied acceptance ownership, references and partition | Structural results do not certify semantic completeness |
| `enrich-plan` | Attach proposed accountable metadata with supplied basis | Cannot select actual host assignment/model/budget |
| `plan-to-dag` | Expose dependency layers/cycles | A graph is not a scheduler |

Host-only acquisition/compiler diagnostics must be supplied when needed. This subset grants no `move-in`, `repo-mapper`, `decompose` or `symbol-flow-check`. Missing acquisition, partial extraction, malformed input, compiler failure or unavailable runner gets a named failure/blocker; do not turn it into an empty success. Keep operation, described schema/effects, input identity/coverage, result status and evidence pointer separate from interpretation.

Explicit governed mode still needs host native admission, verified catalog scope/Own IDs, GROUNDED context, validation, independent review, exact direct-user approval binding and authorization before Task. `partitionPlan`, frozen hashes, author paths and generated policies cannot record or replace that lifecycle.

## Proposed output and stop conditions

Return baseline/source refs and evidence coverage; acceptance map `{id, demandRef, oracleRef, baselineStatus, judgedOwner, closureOwner}`; parent criteria refs; coverage-review request/findings; optional `partitionPlan` pointer; slices/read-write sets/latitude; typed dependency and conflict edges; named diagnostics; proposed ordering/options; assumptions and blockers.

Distinguish supplied check statuses: `PASS` means actual cited check passed within its stated reach; `FAIL` means actual failure; `HOLD` means missing/stale governed state; `UNKNOWN` means missing acquisition/oracle/review/tool. None certifies overall author acceptance. Return unresolved cycles, conflicts, missing ownership or material decisions for revision before host execution.

## Source method and limits

Source pin: `abf7a72c77fcaeee1206400a8270b2581ae9839c`.

- [maestro-decompose](../../../../orchestra/playbooks/maestro-decompose/SKILL.md), “Procedure” 1–7: five headings, baseline/coverage, responsibility slicing, dependencies vs conflicts, sizing and `partitionPlan` boundary.
- [Cold coverage review](../../../../orchestra/playbooks/maestro-decompose/suite-review.md): demand-only independent critique and uncertainty limits. Upstream authors the request/revision; host coordinates the reviewer and acceptance judgment.
- [Decomposition protocol](../../../../../foundation/atlas/docs/DECOMPOSITION-PROTOCOL.md), C/S4: lossless vertical epic splits and seam ownership. Its historical mandatory module/state-machine rules are not universal authoring rules; no source dispatch/acquisition powers transfer.
