# Work Packages — TRACEABILITY (out-of-band, not S4-campaign)

> Two standalone WP cards for requirements that were **delivered but never scheduled**. Like
> [`wp-surface-truth.md`](wp-surface-truth.md), these conform loosely to
> [`method/wp-template.md`](../../method/wp-template.md) where the template fits an already-executed WP: the
> `exec` fields (`outputs`/`provenance`/`trace_ref`) are FILLED, not empty, because this work is DONE.
>
> **Why these cards exist.** `id-integrity`'s ID-3 (ORPHAN) requires every REQ, and every non-`held-out`
> SCN, to be scheduled by ≥1 WP card through a structured `source_reqs:` / `acceptance:` pointer — prose does
> not schedule. Three requirements were added by ADR after their campaign's cards were frozen
> (`REQ-TOOLS-1e` by ADR-0003 + A-D3; `REQ-MCP-1d`/`REQ-MCP-1e` by ADR-0006), so no card ever carried them.
> They were nevertheless BUILT and are covered by real goldens and shipped tests. These cards close the
> traceability chain against what actually landed; they schedule **nothing new**.
>
> **What these cards are NOT.** They are not a device for turning a gate green. Each names the shipped
> artifact that satisfies its requirement, and each `acceptance:` pointer resolves to a golden or test that
> exists and runs today. If a pointer below ever stops resolving, the card is wrong and ID-2/ID-5 will say so.
> Pointers are relative to this file (`docs/requirements/work-packages/`).

---

### WP-TRACE-1.TOOLS — the governed `sameAs` door, asserted and retracted (ADR-0003, A-D3)

epic: none (out-of-band; ADR-0003 landed after CAMPAIGN-9's cards froze)
id: WP-TRACE-1.TOOLS
content_hash: <filled-at-freeze>
title: `atlas-link` asserts and retracts a `sameAs` equivalence through one fail-closed gate ladder, adding
no tool to `GOVERNANCE_SURFACE` and no door to `WRITE_PATHS`

intent: >
`REQ-TOOLS-1e` was added by ADR-0003 (assert) and amended by A-D3 / task #83 (retract) after every
CAMPAIGN card that could have carried it was frozen. The door shipped, its behaviour is pinned by
black-box stories and white-box teeth, and its surface-membership property is carried by the amended
TLS conformance goldens — but no WP card ever pointed at the requirement, so ID-3 reported it orphaned.
This card records the delivery. It changes no code.

source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-1e # ptr+digest — the governed sameAs write door, assert AND retract

seam-freezes: [ ] (nothing frozen here; the door's contract shipped with ADR-0003)

anchor: `packages/tools/src/handler.ts` — `atlas-link`'s membership in the closed `GOVERNANCE_SURFACE`;
the door's gate ladder lives in `packages/adapter-io/src/governed-link.ts`

interface_contract: # free-form (unchecked, per repo convention)

- source: ../../adr/ADR-0003-governed-write-doors.md (the door's ratified contract)

exclusions:

- Any behavioural change. This card is a traceability record over shipped behaviour; it edits no
  `packages/**` file and asserts no new property.
- The AUTHORITY model (`ARCH-9/11/12`) — `REQ-TOOLS-1e`'s KNOW-11 authorization rides the EXISTING
  authority model; extending authority is out of scope here as everywhere.

action: none — the work is delivered. This card exists to schedule the requirement against the artifacts
that already satisfy it, per ID-3.

action_surface: `[ read(**) ]` (no edit; a record, not a change)

guardrails: no `packages/**` edit · no golden authored (the coverage split below is the one recorded in
`goldens-tls.md`, quoted not invented)

repair_budget: N=0 · nothing to repair; if an acceptance pointer fails to resolve, the card is wrong and is
corrected at the pointer, never by widening the claim

acceptance: # ptr+digest = frozen goldens + shipped teeth

- source: ../goldens-tls.md#SCN-TOOLS-1a-1 # ptr+digest — surface membership (advertised)
- source: ../goldens-tls.md#SCN-TOOLS-1a-2 # ptr+digest — surface membership (invocable)
- source: ../goldens-tls.md#SCN-TOOLS-1b-1 # ptr+digest — WRITE_PATHS membership
- source: ../goldens-tls.md#SCN-TOOLS-1b-2 # ptr+digest — WRITE_PATHS membership, negative
  behavioural-teeth: >
  Per `goldens-tls.md`'s own ledger note on REQ-TOOLS-1e, coverage is SPLIT BY DESIGN: the door-ladder
  behaviour is carried by black-box `packages/e2e-blackbox/test/s16-sameas.blackbox.test.ts` (T1–T5) and
  `packages/e2e-blackbox/test/s25-sameas-retraction.blackbox.test.ts` (T1–T5) plus the white-box
  `wp-sameas` / `sameas-retraction` / `governed-link-retract` teeth. 1e deliberately adds NO
  reference-model conformance SCN — the ledger records this as "no fabricated golden", and this card
  does not invent one.

deps: [ ] parallel_group: [P]
exit_predicate: every acceptance pointer resolves (ID-2/ID-5 green) ∧ the named black-box stories exist and
run ∧ no `packages/**` file is modified by this card

context_refs:

- ../../adr/ADR-0003-governed-write-doors.md
- ../goldens-tls.md (the REQ-TOOLS-1e coverage-split ledger note)

owner: lead · builder_id: none (record, not a dispatch)

outputs: the shipped `atlas-link` door — `packages/adapter-io/src/governed-link.ts`, its
`GOVERNANCE_SURFACE` membership in `packages/tools/src/handler.ts`
provenance: ADR-0003 (assert) · A-D3 / task #83 (retract)
trace_ref: `s16-sameas` · `s25-sameas-retraction` · the `wp-sameas` / `governed-link-retract` white-box teeth

---

### WP-TRACE-2.MCP — advertised and invocable are one derived set (ADR-0006)

epic: none (out-of-band; ADR-0006 landed after CAMPAIGN-9's cards froze)
id: WP-TRACE-2.MCP
content_hash: <filled-at-freeze>
title: the advertised set and the invocable set are both DERIVED from the one closed `Tool` union and are
equal; computing them separately fails the surface-conformance gate

intent: >
ADR-0006 retired INV-MCP-1's "exactly five" count and replaced it with the derived-surface property,
adding `REQ-MCP-1d` (derived and equal) and `REQ-MCP-1e` (no independent drift). Both landed with the
governed-write-doors work and both have goldens — `SCN-MCP-1d-1` and `SCN-MCP-1e-1` — the latter with a
real structural test witness. No WP card carried either requirement, so ID-3 reported four orphans (two
REQ, two SCN). This card records the delivery. It changes no code.

source_reqs: # ptr+digest

- source: ../requirements-adapters.md#REQ-MCP-1d # ptr+digest — advertised and invocable derived and equal
- source: ../requirements-adapters.md#REQ-MCP-1e # ptr+digest — no independent drift

seam-freezes: [ ] (the union is the seam; it froze with ADR-0006)

anchor: `packages/mcp-server/src/server.ts` — `advertisedTools` derives from the closed union and `callTool`
dispatches from the SAME source; `packages/tools/src/handler.ts` — `GOVERNANCE_SURFACE` / `READ_SURFACE`,
the one union both sets are derived from

interface_contract: # free-form (unchecked, per repo convention)

- source: ../../adr/ADR-0006-architecture-hierarchy-and-tool-exposure.md (the derived-surface property that retired the count)

exclusions:

- Any behavioural change. A traceability record over shipped behaviour.
- Re-asserting "exactly five" anywhere. ADR-0006 retired that count for the UNION; the surviving
  `toHaveLength(5)` in `packages/mcp-server/test/wp-9.4.7-mcp.test.ts` is the base case with no optional
  legs injected (`advertisedTools` with no legs IS `GOVERNANCE_SURFACE`, which ADR-0006 kept at five),
  not the retired union count.

action: none — the work is delivered. This card exists to schedule the requirements and their goldens
against the artifacts that already satisfy them, per ID-3.

action_surface: `[ read(**) ]` (no edit; a record, not a change)

guardrails: no `packages/**` edit · no golden authored · no count re-asserted

repair_budget: N=0 · if an acceptance pointer fails to resolve, the card is corrected at the pointer

acceptance: # ptr+digest = frozen goldens

- source: ../goldens-adapters.md#SCN-MCP-1d-1 # ptr+digest — advertised equals invocable (happy)
- source: ../goldens-adapters.md#SCN-MCP-1e-1 # ptr+digest — both traced to the ONE source, never # computed separately (guard)
  witness: >
  `SCN-MCP-1e-1` has a shipped structural witness —
  `packages/mcp-server/test/surface-conformance-req-mcp-1e.test.ts` proves membership by composition
  (advertised ≡ invocable) with explicit mutation teeth, and extends the same proof to `READ_SURFACE`.
  This is the test that closed the `billy-1` cold-review finding.

deps: [ ] parallel_group: [P]
exit_predicate: every acceptance pointer resolves (ID-2/ID-5 green) ∧
`surface-conformance-req-mcp-1e.test.ts` exists and runs ∧ no `packages/**` file is modified by this card

context_refs:

- ../../adr/ADR-0006-architecture-hierarchy-and-tool-exposure.md
- ../goldens-adapters.md (the REQ-coverage ledger, amended 2026-08-12 when SCN-MCP-1e-1 closed REQ-MCP-1e)

owner: lead · builder_id: none (record, not a dispatch)

outputs: `advertisedTools` + `callTool` deriving from one union — `packages/mcp-server/src/server.ts`;
`GOVERNANCE_SURFACE` / `READ_SURFACE` — `packages/tools/src/handler.ts`
provenance: ADR-0006 (the ARCH constitution; the derived-surface property that retired the count)
trace_ref: `packages/mcp-server/test/surface-conformance-req-mcp-1e.test.ts`
