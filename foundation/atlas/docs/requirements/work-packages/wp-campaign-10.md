# Work Packages — CAMPAIGN-10 (state S4) · the authoring surface

> **STATUS: ALL 16 WPs BUILT — campaign closed** (audited 2026-08-29 against `master @ 92e9fa3`; the
> audit checked each WP's own acceptance predicate against shipped code, not against this card).
> The cards below are the historical freeze and are **stale as a plan**: the seam ownership and DAG head
> they carry were superseded by [`../../design/campaign-10-recut.md`](../../design/campaign-10-recut.md)
> (itself now closed), and the campaign shipped under the re-cut. Read this file as a record of what was
> specified, never as a list of work outstanding.
>
> Shipped: A1.{TOOLS,ADAPTER,CLI} · A2-a.{TOOLS,CLI,E2E} · A2-b.{TOOLS,ADAPTER} · A3.{ADAPTER,TOOLS} ·
> A4.{TOOLS,ADAPTER,CLI} · A5.{TOOLS,MCP,E2E}.

> The authoring surface: **planner doors** over the built ring. One **WP-card** per (epic × module),
> conforming to [`method/wp-template.md`](../../method/wp-template.md). Every substantive field is a
> `ptr+digest` (the digest is tooling-filled at freeze — the pointer carries a `# ptr+digest` marker, no
> fabricated hashes); `content_hash` is `<filled-at-freeze>`; the `exec` fields
> (`outputs`/`provenance`/`trace_ref`) are present-but-empty. `intent` is the one prose carve-out
> (non-authoritative, executor-invisible).
>
> **Campaign coverage:** 6 leaf epics · **16 WPs** · **73 REQs** (AUTH 57 + CLI 6 + MCP 10) · REQ→WP = a
> total function (each REQ owned by exactly one WP; orphans/doubles = **0**, verified mechanically).
> **Seam-freezes = 6 (RE-CUT):** GroundingComputer PORT (declared A1.TOOLS → implemented A1.ADAPTER, consumed
> A2-a.TOOLS) · the authoring data model (A1.TOOLS → adapter-io, cli, mcp) · GateChain PORT (declared A3.TOOLS →
> implemented A3.ADAPTER) · EmitOut receipt widening (A4.TOOLS → A4.ADAPTER) · READ_SURFACE (A5.TOOLS → A5.MCP,
> harness). Every WP that introduces a planner leg also lists `packages/adapter-io/src/wire.ts` in its edit
> surface (ARCH-3: a door not bound in the composition root is dead). See `design/campaign-10-recut.md`.
>
> **No WP edits the governed write surface.** `GOVERNANCE_SURFACE` and `WRITE_PATHS` are read-only for this
> entire campaign; the one WP that touches `governed-emit.ts` (**WP-10.A3.ADAPTER**) is a _behaviour-preserving
> refactor_ — the gate chain is extracted, not changed — and is sequenced and reviewed as such.
>
> **Prerequisite gate (RE-CUT 2026-08-24, `design/campaign-10-recut.md`):** **WP-10.A1.TOOLS blocks every other
> WP in the campaign** — it declares the `GroundingComputer` PORT (in `@atlas/tools`), which `WP-10.A1.ADAPTER`
> then implements. This satisfies **ARCH-2** (the ring's innermost port layer owns the contract; adapters
> satisfy it) and still resolves coupling **C1** (`design/authoring.md` §3.3): the derivation stays singular,
> now sequenced behind the PORT freeze rather than an adapter-io module freeze. A WP that computes a grounding
> before the PORT is frozen re-introduces the coupling. _(The pre-re-cut card made A1.ADAPTER the owner — that
> inverts ARCH-2 and is unbuildable; see the arch reference.)_

---

## CAMPAIGN-10.1 — authoring becomes possible

### EPIC-A1 — see where I can ground

### WP-10.A1.ADAPTER — ADAPTER slice of EPIC-A1

epic: EPIC-A1
id: WP-10.A1.ADAPTER
content_hash: <filled-at-freeze>
title: The one grounding computer, exposed as a seam, with anchor listing over it
intent: >
Extract the single derivation the emit truth-gate already performs into a named seam that BOTH the gate and
the new planners call, warm-up included, and derive the anchor unit set (with declared language holes) over
it. This is the whole campaign's foundation: if this seam is not singular, every draft the product produces
is rejected by the product's own gate. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-1a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-1b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-1c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-1d # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-1e # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-3a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-3b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-3e # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-3f # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-3g # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-4a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-4b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-4c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-4d # ptr+digest
  seam-freezes: [ "GroundingComputer PORT is declared-by A1.TOOLS; this WP IMPLEMENTS it in adapter-io and rewires the gate to call the port (ARCH-2). No contract ownership here." ]
  anchor: packages/adapter-io/src/ — a new grounding-computer module IMPLEMENTING the tools-declared `GroundingComputer` port: the built-`Axes` derivation + its grammar warm-up; `governed-emit.ts` and the planner legs both reach it through the port
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-1 # ptr+digest
- source: ../../reference/atlas-authoring.md#author-3 # ptr+digest
- source: ../../reference/atlas-authoring.md#author-4 # ptr+digest
- source: ../method-tags-authoring.md#INV-AUTH-1 # ptr+digest
  exclusions: >
  No tool leg, no result types, no CLI command, no MCP advertisement. No change to what the truth gate
  DECIDES — the derivation is extracted, never altered. No new tree-sitter grammar (A-D5: the Rust hole is
  declared, not closed).
  inputs: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-1a-1 # ptr+digest
  action: Extract the existing derivation into one exported seam that performs its own warm-up; rewire the truth gate to call it; implement anchor listing (units + declared holes) over the same seam; prove single-site by enumeration and prove agreement by differential test.
  action_surface: [ read-repo, edit(packages/adapter-io/src/**), run(test:adapter-io), typecheck ]
  guardrails: >
  Edit only under packages/adapter-io/src. Exactly ONE derivation site may exist when done. Do NOT change any
  gate's decision, any refusal string, or any write path. Do not touch packages/tools, packages/cli,
  packages/mcp-server, or any core package.
  repair_budget: 3 — early-stop on repeated differential failure, on a second derivation site appearing, or on any gate-decision diff
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-1a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-1b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-1c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-1d-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-1e-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-3a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-3b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-3e-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-3f-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-3g-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-4a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-4b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-4c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-4d-1 # ptr+digest
- source: ../properties-authoring.md#PROP-AUTH-1 # ptr+digest
  deps: [ WP-10.A1.TOOLS ] · parallel_group: —
  exit_predicate: all acceptance goldens green ∧ PROP-AUTH-1 green ∧ derivation sites == 1 ∧ the pre-existing emit/reconcile suites are byte-unchanged
  context_refs: [ reference/atlas-authoring.md, method-tags-authoring.md#INV-AUTH-1/3/4, adr/ADR-0004 ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../design/authoring.md#33-coupling-found--and-how-it-is-resolved # ptr

### WP-10.A1.TOOLS — TOOLS slice of EPIC-A1

epic: EPIC-A1
id: WP-10.A1.TOOLS
content_hash: <filled-at-freeze>
title: The anchors leg, the authoring data model, and the write-freedom membership proof
intent: >
Add the `anchors` leg to the one handler, freeze this surface's result shapes in the tools data model
(AnchorUnit / AnchorsOut / LanguageHole / SlotsOut / DraftOut / CheckOut / GateName), publish the schema,
and assert that no authoring door is a member of either governed constant. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-2b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-2c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-2e # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-3c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-3d # ptr+digest
  seam-freezes: [ "the GroundingComputer PORT interface, declared-by A1.TOOLS, implemented-by adapter-io (ARCH-2)", "the authoring data model owned-by A1.TOOLS, consumed-by adapter-io, cli, mcp-server" ]
  anchor: packages/tools/src/types.ts (the new result records) + the `GroundingComputer` port interface + a new anchors leg beside init/query/emit/reconcile
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-3 # ptr+digest
- source: ../../reference/atlas-authoring.md#author-2 # ptr+digest
  exclusions: >
  No derivation logic (WP-10.A1.ADAPTER owns it). No membership in GOVERNANCE_SURFACE or WRITE_PATHS — both
  constants are READ-ONLY in this campaign. No CLI, no MCP advertisement (EPIC-A5).
  inputs: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-3 # ptr+digest
  action: Declare the `GroundingComputer` PORT interface in tools (implemented later by adapter-io); freeze the authoring result records in the tools data model; add the anchors leg routing through that port; carry rev + the honest-empty reason on the Verdict; assert non-membership in both governed constants.
  action_surface: [ read-repo, edit(packages/tools/src/**), run(test:tools), typecheck ]
  guardrails: >
  Edit only under packages/tools/src. GOVERNANCE_SURFACE and WRITE_PATHS are read-only. Import core shapes,
  never redefine them. No hand-authored MCP schema — the handler owns the published schema (TOOLS-3).
  repair_budget: 3 — early-stop on a governed-constant edit or a redefined core shape
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-2b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-2c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-2e-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-3c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-3d-1 # ptr+digest
  deps: [ ] · parallel_group: —
  exit_predicate: all acceptance goldens green ∧ both governed constants byte-unchanged ∧ the spec-conformance guard still passes
  context_refs: [ reference/atlas-authoring.md, adr/ADR-0004, adr/ADR-0003 ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../reference/atlas-authoring.md#author-2 # ptr

### WP-10.A1.CLI — CLI slice of EPIC-A1

epic: EPIC-A1
id: WP-10.A1.CLI
content_hash: <filled-at-freeze>
title: `atlas anchors` and the write-spy harness every later planner reuses
intent: >
Route the `anchors` command through the parser/marshaller/render chain, and build the write-spy store
harness that proves a planner writes zero bytes — the harness EPIC-A2/A3 reuse. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-2a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-2d # ptr+digest
  seam-freezes: [ ]
  anchor: packages/cli/src/{map,parse,marshal,render}.ts — the `anchors` command, its marshaller, and its render block
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-2 # ptr+digest
  exclusions: >
  No derivation, no result-shape authoring. No help door (EPIC-A4). No new render behaviour for other legs
  (EPIC-A4 owns the full-record render).
  inputs: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-2a-1 # ptr+digest
  action: Add the `anchors` command end to end; implement the write-spy store (put/persistProjection/cache writes throw) and run every planner under it, asserting zero calls and a byte-identical store census.
  action_surface: [ read-repo, edit(packages/cli/src/**), edit(packages/cli/test/**), run(test:cli), typecheck ]
  guardrails: >
  Edit only under packages/cli. Preserve parser totality (never throw, never process.exit). Do not change any
  existing command's behaviour or render bytes.
  repair_budget: 3 — early-stop on a totality regression or a changed existing render
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-2a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-2d-1 # ptr+digest
- source: ../properties-authoring.md#PROP-AUTH-2 # ptr+digest
  deps: [ WP-10.A1.TOOLS ] · parallel_group: —
  exit_predicate: all acceptance goldens green ∧ PROP-AUTH-2 green ∧ every pre-existing CLI golden byte-unchanged
  context_refs: [ reference/atlas-authoring.md#author-2, goldens-authoring.md ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../design/authoring.md#1-define--the-job-the-pain-the-outcomes # ptr

### EPIC-A2-a — the main path: draft an advisory fact that round-trips

### WP-10.A2-a.TOOLS — TOOLS slice of EPIC-A2-a

epic: EPIC-A2-a
id: WP-10.A2-a.TOOLS
content_hash: <filled-at-freeze>
title: The slots and draft legs — identity minted, grounding derived, rev stamped
intent: >
`slots` derives the closed vocabulary from the union itself (so a 13th member cannot leave the door stale);
`draft` composes a fact whose identity is minted by the product formula and whose grounding comes from the
frozen seam, stamped with the rev it was computed at. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-5a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-5b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-5c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-5d # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-5e # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-6a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-6b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-6c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-6e # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-7a # ptr+digest
  seam-freezes: [ ]
  anchor: packages/tools/src/ — new `slots` and `draft` legs; the draft leg consumes the frozen GroundingComputer and the product `nodeKey` formula
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-5 # ptr+digest
- source: ../../reference/atlas-authoring.md#author-6 # ptr+digest
- source: ../../reference/atlas-authoring.md#author-7 # ptr+digest
  exclusions: >
  No route disclosure, no CREATE/UPDATE, no supersede (EPIC-A2-b). No CLI. No new derivation. The `id`
  minted here is the product formula's — never invented.
  inputs: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-6 # ptr+digest
  action: Derive the slot set from the PredicateSlot union with a total mapping (a new member must fail the type-check, not a test); implement `draft` computing every non-authored field; assert the drafted field set against the emit door's own read-set.
  action_surface: [ read-repo, edit(packages/tools/src/**), run(test:tools), typecheck ]
  guardrails: >
  Edit only under packages/tools/src. Never transcribe the slot union into a literal array. Never invent an
  `id`. Derive the door's read-set from the door, not by restating it.
  repair_budget: 3 — early-stop on a transcribed slot list or an invented identity
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-5a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-5b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-5c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-5d-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-5e-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-6a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-6b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-6c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-6e-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-7a-1 # ptr+digest
  deps: [ WP-10.A1.ADAPTER, WP-10.A1.TOOLS ] · parallel_group: —
  exit_predicate: all acceptance goldens green ∧ adding a 13th slot member fails the type-check
  context_refs: [ reference/atlas-authoring.md#author-5/6/7, method-tags-authoring.md#INV-AUTH-5 ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../reference/atlas-authoring.md#author-6 # ptr

### WP-10.A2-a.CLI — CLI slice of EPIC-A2-a

epic: EPIC-A2-a
id: WP-10.A2-a.CLI
content_hash: <filled-at-freeze>
title: `atlas slots` and `atlas draft` — three inputs, and a rev-mismatch that names itself
intent: >
The author types an anchor, a slot, and a claim; everything else is computed. When a draft is emitted at
the wrong rev, the reason says so instead of blaming the claim. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-6d # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-6f # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-7b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-7c # ptr+digest
  seam-freezes: [ ]
  anchor: packages/cli/src/{map,parse,marshal,render}.ts — the `slots` and `draft` commands and the rev-mismatch reason surfacing
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-6 # ptr+digest
  exclusions: >
  No new leg logic. No help door. No lifecycle flags (`--supersede` is EPIC-A2-b).
  inputs: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-6d-1 # ptr+digest
  action: Add both commands; accept exactly anchor + slot + claim (plus optional tier/scope); surface the rev-mismatch refusal distinctly from a generic drift refusal.
  action_surface: [ read-repo, edit(packages/cli/src/**), run(test:cli), typecheck ]
  guardrails: >
  Edit only under packages/cli. Never require an `id` or a `subtreeHash` from the user. Preserve parser totality.
  repair_budget: 3
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-6d-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-6f-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-7b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-7c-1 # ptr+digest
  deps: [ WP-10.A2-a.TOOLS ] · parallel_group: —
  exit_predicate: all acceptance goldens green ∧ no CLI invocation requires a computed field
  context_refs: [ reference/atlas-authoring.md#author-6/7 ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../design/authoring.md#22-the-four-risks-cagan--written-not-asserted # ptr

### WP-10.A2-a.E2E — E2E slice of EPIC-A2-a

epic: EPIC-A2-a
id: WP-10.A2-a.E2E
content_hash: <filled-at-freeze>
title: The round-trip property — the campaign's acceptance criterion
intent: >
Prove, black-box, that a fact drafted by the product at rev R and emitted at rev R on an unchanged repo is
accepted — over the fixture's WHOLE unit set, not one hand-picked anchor. If this fails, the surface has not
delivered its outcome. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-8a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-8b # ptr+digest
  seam-freezes: [ ]
  anchor: packages/e2e-blackbox/test/ — a new story driving the subprocess CLI only; plus the `fix-author` two-commit fixture
  interface_contract: # ptr+digest
- source: ../properties-authoring.md#PROP-AUTH-8 # ptr+digest
  exclusions: >
  No product-library imports in any assertion (the harness stays black-box). No MCP arm (EPIC-A5). No
  authoring helper — the story must use ONLY product doors.
  inputs: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-8a-1 # ptr+digest
  action: Build the `fix-author` fixture (two commits, ts + rs + a non-code file); drive `anchors → slots → draft → emit` as subprocesses over every unit in the fixture's real unit set × the slot union; assert every emit is accepted.
  action_surface: [ read-repo, edit(packages/e2e-blackbox/**), run(test:e2e-blackbox) ]
  guardrails: >
  Edit only under packages/e2e-blackbox. NO import of @atlas/\* in any assertion path. Every step is a
  subprocess invocation of the shipped bin.
  repair_budget: 3 — early-stop if closing the story would require importing a product library
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-8a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-8b-1 # ptr+digest
- source: ../properties-authoring.md#PROP-AUTH-8 # ptr+digest
  deps: [ WP-10.A2-a.CLI ] · parallel_group: —
  exit_predicate: PROP-AUTH-8 green over the fixture's full unit set ∧ zero @atlas/\* imports in the story
  context_refs: [ properties-authoring.md#PROP-AUTH-8, goldens-authoring.md#fixture-universe ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../adr/ADR-0004-authoring-planner-doors.md # ptr

### EPIC-A2-b — the lifecycle paths: route, update, retire

### WP-10.A2-b.TOOLS — TOOLS slice of EPIC-A2-b

epic: EPIC-A2-b
id: WP-10.A2-b.TOOLS
content_hash: <filled-at-freeze>
title: Route disclosure, CREATE-vs-UPDATE, and the supersede draft variant
intent: >
A draft says which route it will take before any write, distinguishes a new node from an update of an
existing one by the real nodeKey, and can express a retire without any new door. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-9a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-9b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-9c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-10a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-10b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-10c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-13a # ptr+digest
  seam-freezes: [ ]
  anchor: packages/tools/src/ — the draft leg extended with route disclosure, occupancy lookup, and the supersede variant
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-9 # ptr+digest
- source: ../../reference/atlas-authoring.md#author-10 # ptr+digest
- source: ../../reference/atlas-authoring.md#author-13 # ptr+digest
  exclusions: >
  No new write door of any kind. No change to the route decision function — the draft CALLS it. No gate
  changes.
  inputs: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-9 # ptr+digest
  action: Call the existing route function and report its outcome plus the authorizing channel; look occupancy up by the minted nodeKey against the rehydrated projection; add the supersede variant carrying the superseded authoring state.
  action_surface: [ read-repo, edit(packages/tools/src/**), run(test:tools), typecheck ]
  guardrails: >
  Edit only under packages/tools/src. Never re-derive the ratification policy — call the route function.
  Occupancy is keyed on the nodeKey, never on the CAS contentHash.
  repair_budget: 3 — early-stop on a hard-coded route rule or a contentHash-keyed occupancy check
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-9a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-9b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-9c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-10a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-10b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-10c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-13a-1 # ptr+digest
  deps: [ WP-10.A2-a.TOOLS ] · parallel_group: —
  exit_predicate: all acceptance goldens green ∧ the reworded-claim witness (SCN-AUTH-10c-1) reports UPDATE
  context_refs: [ reference/atlas-authoring.md#author-9/10/13 ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../reference/atlas-authoring.md#author-13 # ptr

### WP-10.A2-b.ADAPTER — ADAPTER slice of EPIC-A2-b

epic: EPIC-A2-b
id: WP-10.A2-b.ADAPTER
content_hash: <filled-at-freeze>
title: Retire persists only through the governed door, with no gate skipped
intent: >
A superseded fact is not a special case at the store layer: it goes through the same emit door and the same
gates as any other fact, and the write-path set does not grow. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-13b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-13c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-13d # ptr+digest
  seam-freezes: [ ]
  anchor: packages/adapter-io/src/governed-emit.ts — the gate-invocation spy harness; the write-path set assertion
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-13 # ptr+digest
  exclusions: >
  No change to any gate's decision. No retire-specific short-circuit. No new door.
  inputs: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-13d-1 # ptr+digest
  action: Add a gate-invocation spy; assert a retire emit invokes every gate a grounded-fact emit invokes; assert the write-path set is set-equal to the two governed doors.
  action_surface: [ read-repo, edit(packages/adapter-io/test/**), run(test:adapter-io), typecheck ]
  guardrails: >
  Test-only edits under packages/adapter-io unless a real bypass is found, in which case fix at the root and
  report it. Never add a retire path outside the emit door.
  repair_budget: 2
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-13b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-13c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-13d-1 # ptr+digest
  deps: [ WP-10.A2-b.TOOLS ] · parallel_group: —
  exit_predicate: all acceptance goldens green ∧ WRITE_PATHS byte-unchanged
  context_refs: [ reference/atlas-authoring.md#author-13, adr/ADR-0003 ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../adr/ADR-0004-authoring-planner-doors.md # ptr

---

## CAMPAIGN-10.2 — authoring becomes legible

### EPIC-A3 — know before I write

### WP-10.A3.ADAPTER — ADAPTER slice of EPIC-A3

epic: EPIC-A3
id: WP-10.A3.ADAPTER
content_hash: <filled-at-freeze>
title: The emit gate chain, extracted as composable side-effect-free gates, plus a real shape gate
intent: >
`check` can only provably agree with the door if it runs the door's own gates. Extract them — order
preserved, decisions unchanged — and add the structured shape gate that replaces the raw TypeError.
**This is the one WP that touches the governed write path, and it is behaviour-preserving.**
(Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-11a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-12a # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-12c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-12d # ptr+digest
  seam-freezes: [ "GateChain contract owned-by A3.ADAPTER, consumed-by A3.TOOLS (check) and the existing governed-emit door" ]
  anchor: packages/adapter-io/src/governed-emit.ts — the shape/truth/authz/ratify chain extracted behind one ordered, pure gate list
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-11 # ptr+digest
- source: ../../reference/atlas-authoring.md#author-12 # ptr+digest
  exclusions: >
  **No gate decision may change.** No new gate semantics — the shape gate makes an existing implicit failure
  EXPLICIT and structured; it must not refuse anything the door previously accepted. No check leg (A3.TOOLS).
  inputs: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-11 # ptr+digest
  action: Extract the four gates into an ordered list of pure predicates each returning {gate, pass, reason, remedy}; rewire the door to fold that list; add the shape gate ahead of truth; prove every pre-existing emit golden is byte-unchanged.
  action_surface: [ read-repo, edit(packages/adapter-io/src/governed-emit.ts), run(test:adapter-io), run(test:e2e-blackbox), typecheck ]
  guardrails: >
  Behaviour-preserving ONLY. Every pre-existing emit/governance golden must be byte-identical after the
  refactor — that is the gate on this WP. Never reorder the gates. Never widen or narrow what any gate accepts.
  repair_budget: 2 — early-stop on ANY pre-existing golden diff
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-11a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-12a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-12c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-12d-1 # ptr+digest
- source: ../properties-authoring.md#PROP-AUTH-12 # ptr+digest
  deps: [ WP-10.A1.ADAPTER ] · parallel_group: —
  exit_predicate: all acceptance goldens green ∧ PROP-AUTH-12 green ∧ **every pre-existing governance golden byte-unchanged**
  context_refs: [ reference/atlas-authoring.md#author-11/12, adr/ADR-0003 ]
  owner: charlie (FORGE); billy (FORTRESS) reviews — this WP touches the governed write path
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../reference/atlas-authoring.md#author-11 # ptr

### WP-10.A3.TOOLS — TOOLS slice of EPIC-A3

epic: EPIC-A3
id: WP-10.A3.TOOLS
content_hash: <filled-at-freeze>
title: The `check` leg — the dry-run that provably equals the door
intent: >
Fold the frozen GateChain over a candidate fact without any store handle, and report per-gate pass/reason/
remedy. Its verdict equals the door's by construction, and the parity property proves it.
(Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-11b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-11c # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-12b # ptr+digest
  seam-freezes: [ ]
  anchor: packages/tools/src/ — a new `check` leg folding the frozen GateChain; `CheckOut` / `GateName` already frozen in A1.TOOLS
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-11 # ptr+digest
  exclusions: >
  No gate re-implementation — fold the frozen chain. No store handle of any kind (AUTHOR-2). No CLI.
  inputs: # ptr+digest
- source: ../properties-authoring.md#PROP-AUTH-11 # ptr+digest
  action: Implement `check` as a fold of the frozen GateChain with no store handle; ensure every gate result carries a non-empty remedy; run the parity property against the real door over a boundary-straddling corpus including multi-gate failures.
  action_surface: [ read-repo, edit(packages/tools/src/**), run(test:tools), typecheck ]
  guardrails: >
  Edit only under packages/tools/src. `check` must not receive a store write handle. Never approximate a gate.
  repair_budget: 3 — early-stop on any parity divergence
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-11b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-11c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-12b-1 # ptr+digest
- source: ../properties-authoring.md#PROP-AUTH-11 # ptr+digest
  deps: [ WP-10.A3.ADAPTER ] · parallel_group: —
  exit_predicate: PROP-AUTH-11 green including the multi-gate-failure arm (verdict AND first-refusing-gate agree)
  context_refs: [ properties-authoring.md#PROP-AUTH-11 ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../reference/atlas-authoring.md#author-11 # ptr

### EPIC-A4 — the loop closes and nothing is hidden

### WP-10.A4.TOOLS — TOOLS slice of EPIC-A4

epic: EPIC-A4
id: WP-10.A4.TOOLS
content_hash: <filled-at-freeze>
title: Widen the emit receipt with the identity the read doors consume
intent: >
`EmitOut` currently returns only the CAS address; the read and link doors take a nodeKey. Widen the receipt
so it serves BOTH consumers — additively, breaking nothing. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-14a # ptr+digest
  seam-freezes: [ "EmitOut receipt widening owned-by A4.TOOLS, consumed-by A4.ADAPTER (tools is upstream of adapter-io)" ]
  anchor: packages/tools/src/types.ts — `EmitOut` gains the read identity alongside the existing CAS id
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-14 # ptr+digest
  exclusions: >
  Additive only — the existing CAS `id` field must remain (drift/doctor read it back). No population logic
  (A4.ADAPTER). No render (A4.CLI).
  inputs: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-14 # ptr+digest
  action: Widen `EmitOut` with the read identity as an additive field; document that the receipt serves the CAS read-back and the per-node/link doors.
  action_surface: [ read-repo, edit(packages/tools/src/types.ts), run(test:tools), typecheck ]
  guardrails: >
  Purely additive. Never remove or repurpose the existing CAS `id`. Import identity types, never redefine them.
  repair_budget: 2
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-14a-1 # ptr+digest
  deps: [ WP-10.A1.TOOLS ] · parallel_group: [P] with EPIC-A3
  exit_predicate: acceptance green ∧ the existing CAS id field present and byte-unchanged in every emit golden
  context_refs: [ reference/atlas-authoring.md#author-14 ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../design/authoring-surface-study.md#lens-6--resource--crud # ptr

### WP-10.A4.ADAPTER — ADAPTER slice of EPIC-A4

epic: EPIC-A4
id: WP-10.A4.ADAPTER
content_hash: <filled-at-freeze>
title: Populate the widened receipt from the minted nodeKey, serving both consumers
intent: >
The door already mints the nodeKey it routes on; return it. Prove the receipt resolves through the per-node
read door AND still serves the CAS read-back. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-AUTH-14b # ptr+digest
- source: ../requirements-authoring.md#REQ-AUTH-14c # ptr+digest
  seam-freezes: [ ]
  anchor: packages/adapter-io/src/governed-emit.ts — the success return, populated from the already-minted nodeKey
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#author-14 # ptr+digest
  exclusions: >
  No gate change. No new mint — reuse the nodeKey the door already computes for routing.
  inputs: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-14b-1 # ptr+digest
  action: Return the already-minted nodeKey on the success path; assert the receipt alone resolves through the per-node read door and that the CAS read-back still works.
  action_surface: [ read-repo, edit(packages/adapter-io/src/governed-emit.ts), run(test:adapter-io), typecheck ]
  guardrails: >
  Do not re-mint. Do not alter any gate. Every pre-existing emit golden must stay green.
  repair_budget: 2
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-14b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-AUTH-14c-1 # ptr+digest
  deps: [ WP-10.A4.TOOLS ] · parallel_group: [P] with EPIC-A3
  exit_predicate: acceptance green ∧ both consumers (per-node read door, CAS read-back) succeed from one receipt
  context_refs: [ reference/atlas-authoring.md#author-14 ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../reference/atlas-authoring.md#author-14 # ptr

### WP-10.A4.CLI — CLI slice of EPIC-A4

epic: EPIC-A4
id: WP-10.A4.CLI
content_hash: <filled-at-freeze>
title: A help door derived from the command map, and a render that drops nothing
intent: >
There is no help in the product today, and `atlas init` shows one of its three fields. Derive help from the
parser's own command map and the composition root's env reads, and make every leg render its whole record.
(Non-authoritative handle.) — **STATUS 2026-09-03: SHIPPED.** `atlas help` exists (top-level, derived from
the command map, exit 0); `atlas init` renders all three of its fields (`territory`, `blastRadius`,
`t0Candidate`). Closed by `help-cli.test.ts` + SCN-CLI-6b-1.
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-CLI-5a # ptr+digest
- source: ../requirements-authoring.md#REQ-CLI-5b # ptr+digest
- source: ../requirements-authoring.md#REQ-CLI-5c # ptr+digest
- source: ../requirements-authoring.md#REQ-CLI-5d # ptr+digest
- source: ../requirements-authoring.md#REQ-CLI-6a # ptr+digest
- source: ../requirements-authoring.md#REQ-CLI-6b # ptr+digest
  seam-freezes: [ ]
  anchor: packages/cli/src/{map,parse,render}.ts — a help door derived from `COMMAND_LEG` + `ARITY`; the render extended to cover every leg's full record
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#entry-cli-5 # ptr+digest
- source: ../../reference/atlas-authoring.md#entry-cli-6 # ptr+digest
  exclusions: >
  No new leg. No change to any leg's DATA — only to what is rendered. Help must be derived, never
  hand-listed.
  inputs: # ptr+digest
- source: ../goldens-authoring.md#SCN-CLI-5a-1 # ptr+digest
  action: Derive help from the parser's command map and arity table plus the composition root's env-read set; extend the render so every leg's result-record fields appear (the `init` leg's blastRadius + t0Candidates are the regression witness).
  action_surface: [ read-repo, edit(packages/cli/src/**), run(test:cli), run(test:e2e-blackbox), typecheck ]
  guardrails: >
  Edit only under packages/cli. Help is DERIVED from the command map — a hand-listed command set fails this
  WP. Existing rendered lines may be ADDED to, never removed or reordered.
  repair_budget: 3 — early-stop on a hand-listed help or a removed render line
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-CLI-5a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-CLI-5b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-CLI-5c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-CLI-5d-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-CLI-6a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-CLI-6b-1 # ptr+digest
  deps: [ WP-10.A4.ADAPTER ] · parallel_group: [P] with EPIC-A3
  exit_predicate: acceptance green ∧ adding a command to the parser without touching help FAILS SCN-CLI-5c-1
  context_refs: [ reference/atlas-authoring.md#entry-cli-5/6 ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../design/authoring.md#22-the-four-risks-cagan--written-not-asserted # ptr

---

## CAMPAIGN-10.3 — authoring becomes transport-symmetric

### EPIC-A5 — the agent gets the same doors as the human

### WP-10.A5.TOOLS — TOOLS slice of EPIC-A5

epic: EPIC-A5
id: WP-10.A5.TOOLS
content_hash: <filled-at-freeze>
title: The `READ_SURFACE` constant — disjoint, write-free, and CI-pinned
intent: >
A second frozen constant beside `GOVERNANCE_SURFACE` and `WRITE_PATHS`, holding the planners plus the
already-built read doors, with disjointness and zero-write-authority asserted mechanically — and pinned by
the spec-conformance guard so the property cannot silently rot. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-MCP-3b # ptr+digest
- source: ../requirements-authoring.md#REQ-MCP-3c # ptr+digest
- source: ../requirements-authoring.md#REQ-MCP-3d # ptr+digest
- source: ../requirements-authoring.md#REQ-MCP-3g # ptr+digest
  seam-freezes: [ "READ_SURFACE owned-by A5.TOOLS, consumed-by A5.MCP and harness/gates/spec-conformance-guard.mjs" ]
  anchor: packages/tools/src/handler.ts — `READ_SURFACE` beside the two existing constants; harness/gates/spec-conformance-guard.mjs — the new pins
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#entry-mcp-3 # ptr+digest
- source: ../properties-authoring.md#PROP-MCP-3 # ptr+digest
  exclusions: >
  GOVERNANCE_SURFACE and WRITE_PATHS stay byte-unchanged. No MCP advertisement (A5.MCP). No new door.
  inputs: # ptr+digest
- source: ../../adr/ADR-0005-mcp-read-surface.md # ptr+digest
  action: Add `READ_SURFACE`; assert both disjointness predicates and both cardinalities; run every member under the write-spy; extend the spec-conformance guard's CODE-SURFACE PIN with the new constant and the two disjointness checks; correct the stale `server.ts` "no more, no less" comment. (The two stale singular-write-door strings in handler.ts, the unscanned repo root, and the missing anti-drift pattern were closed standalone — they had no dependency on this campaign.)
  action_surface: [ read-repo, edit(packages/tools/src/**), edit(harness/gates/spec-conformance-guard.mjs), run(test:tools), run(spec-conformance-guard), typecheck ]
  guardrails: >
  The two governed constants are READ-ONLY. The anti-drift regex must match the CONCEPT, not a literal phrase
  (the singular-form pattern and the repo-root sweep were added standalone; this card no longer owns them).
  repair_budget: 3
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-MCP-3b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-MCP-3c-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-MCP-3d-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-MCP-3g-1 # ptr+digest
- source: ../properties-authoring.md#PROP-MCP-3 # ptr+digest
  deps: [ WP-10.A3.TOOLS, WP-10.A4.CLI ] · parallel_group: —
  exit_predicate: PROP-MCP-3 green ∧ both governed constants byte-unchanged
  context_refs: [ adr/ADR-0005-mcp-read-surface.md, properties-authoring.md#PROP-MCP-3 ]
  owner: charlie (FORGE); billy (FORTRESS) reviews the surface pin
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../adr/ADR-0005-mcp-read-surface.md # ptr

### WP-10.A5.MCP — MCP slice of EPIC-A5

epic: EPIC-A5
id: WP-10.A5.MCP
content_hash: <filled-at-freeze>
title: Advertise the union, and bring doctor / node / diff onto MCP with it
intent: >
The server advertises `GOVERNANCE_SURFACE ∪ READ_SURFACE`, which simultaneously delivers the four new
planners to the agent seat and closes the pre-existing CLI-only asymmetry of the three built read doors.
(Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-MCP-3a # ptr+digest
- source: ../requirements-authoring.md#REQ-MCP-3e # ptr+digest
- source: ../requirements-authoring.md#REQ-MCP-3f # ptr+digest
  seam-freezes: [ ]
  anchor: packages/mcp-server/src/server.ts — `advertisedTools` maps the union; routing for the read legs
  interface_contract: # ptr+digest
- source: ../../reference/atlas-authoring.md#entry-mcp-3 # ptr+digest
  exclusions: >
  No hand-authored schema — every description/inputSchema comes from `handler.schema(tool)` (TOOLS-3). No
  write routing from any read leg. No change to the governance legs' behaviour.
  inputs: # ptr+digest
- source: ../../adr/ADR-0005-mcp-read-surface.md # ptr+digest
  action: Map the advertised list over the union; route each read leg through the one handler; verify under the write-spy that no read leg reaches a write path.
  action_surface: [ read-repo, edit(packages/mcp-server/src/**), run(test:mcp-server), typecheck ]
  guardrails: >
  Edit only under packages/mcp-server. Schemas come from the handler, never hand-authored here. A read leg
  that acquires a write path fails this WP.
  repair_budget: 3
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-MCP-3a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-MCP-3e-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-MCP-3f-1 # ptr+digest
  deps: [ WP-10.A5.TOOLS ] · parallel_group: —
  exit_predicate: acceptance green ∧ every advertised tool publishes a handler-owned schema
  context_refs: [ adr/ADR-0005-mcp-read-surface.md ]
  owner: charlie (FORGE)
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../adr/ADR-0005-mcp-read-surface.md # ptr

### WP-10.A5.E2E — E2E slice of EPIC-A5

epic: EPIC-A5
id: WP-10.A5.E2E
content_hash: <filled-at-freeze>
title: Transport parity, the agent authoring story — and the RETIREMENT of `author.ts`'s authoring role
intent: >
Prove byte-parity across CLI and MCP for the `draft` authoring door, and drive the full authoring story
over MCP alone through product doors. [AMENDED 2026-08-25, owner-decided] The campaign's real acceptance is
this product-door PROOF, not the physical deletion of `author.ts`: WP measurement showed that file also
serves a legitimate, permanent ADVERSARIAL-fixture role (facts the product must refuse, which no product
door can produce by design) that must be kept. Re-pointing the ~28 happy-path consumers off it is hygiene
follow-up. See ADR-0004 §Consequences [AMENDED]. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../requirements-authoring.md#REQ-MCP-4a # ptr+digest
- source: ../requirements-authoring.md#REQ-MCP-4b # ptr+digest
- source: ../requirements-authoring.md#REQ-MCP-4c # ptr+digest
  seam-freezes: [ ]
  anchor: packages/e2e-blackbox/test/ — a parity story over both transports; two new @atlas-free stories (`s-mcp-authoring`, `s-mcp-4-draft-parity`) drive product doors only. [AMENDED] `author.ts` is KEPT for its adversarial-fixture role; re-pointing happy-path consumers off it is hygiene follow-up
  interface_contract: # ptr+digest
- source: ../properties-authoring.md#PROP-MCP-4 # ptr+digest
  exclusions: >
  No product-library imports in any assertion of the NEW stories. No new product behaviour — this WP proves.
  [AMENDED] It does NOT delete author.ts: measurement showed author.ts also carries a legitimate,
  irreplaceable adversarial-fixture role (see ADR-0004 §Consequences [AMENDED]).
  inputs: # ptr+digest
- source: ../properties-authoring.md#PROP-MCP-4 # ptr+digest
  action: Drive the `draft` authoring door over the subprocess CLI and the stdio MCP harness with valid, malformed, and PARTIALLY-POPULATED inputs, asserting byte-identical Verdicts; author and emit a fact over MCP alone. [AMENDED] The new stories import NOTHING from @atlas/_; author.ts is retained for its adversarial-fixture role (re-point of happy-path consumers is hygiene follow-up).
  action_surface: [ read-repo, edit(packages/e2e-blackbox/**), run(test:e2e-blackbox) ]
  guardrails: >
  Edit only under packages/e2e-blackbox. The two NEW stories carry a self-guard asserting zero @atlas/_
  import specifiers. [AMENDED] author.ts is NOT deleted — its adversarial-fixture role has no product-door
  replacement by design; re-pointing the ~28 happy-path consumers is tracked hygiene follow-up.
  repair_budget: 3
  acceptance: # ptr+digest
- source: ../goldens-authoring.md#SCN-MCP-4a-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-MCP-4b-1 # ptr+digest
- source: ../goldens-authoring.md#SCN-MCP-4c-1 # ptr+digest
- source: ../properties-authoring.md#PROP-MCP-4 # ptr+digest
  deps: [ WP-10.A5.MCP, WP-10.A2-a.E2E ] · parallel_group: —
  exit_predicate: PROP-MCP-4 green (including the partially-populated arm SCN-MCP-4c-1) ∧ the MCP-only authoring story green (`s-mcp-authoring`) ∧ the two new stories import zero `@atlas/*` ∧ the full black-box suite green. [AMENDED 2026-08-25] author.ts deletion is NOT an exit condition (owner-decided) — its adversarial-fixture role is kept; happy-path re-point is hygiene follow-up.
  context_refs: [ properties-authoring.md#PROP-MCP-4, adr/ADR-0004 §Consequences ]
  owner: charlie (FORGE); lucy (MICROSCOPE) cold-reviews the two new acceptance-bearing stories
  outputs: [ ] · provenance: [ ] · trace_ref: —
  rationale: ../../adr/ADR-0004-authoring-planner-doors.md # ptr

---

## Completeness (S4 predicates)

| predicate                                                     | verdict                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| every WP names ≥1 REQ                                         | ✅ 16/16                                                                                                  |
| every WP is scoped to exactly one module within one epic      | ✅ 16/16                                                                                                  |
| every REQ is owned by **exactly one** WP                      | ✅ **73/73 — 0 orphan, 0 double** (verified by set-difference against `requirements-authoring.md`)        |
| every cross-module obligation has a seam-freeze (no smearing) | ✅ 5 seams, each with a named owner and named consumers                                                   |
| every epic is fully covered by its WPs                        | ✅ A1 21=14+5+2 · A2-a 16=10+4+2 · A2-b 10=7+3 · A3 7=4+3 · A4 9=1+2+6 · A5 10=4+3+3                      |
| the card is driftless (pointer+digest per the template)       | ✅ every substantive field is a `ptr+digest`; digests are `<filled-at-freeze>` — **no fabricated hashes** |
| each slice is independently buildable + testable              | ⚠️ judgment — **COLD-REVIEW pending**                                                                     |

**DoD: NOT MET** — GATE green as recorded, **COLD-REVIEW pending**. These cards are freeze candidates.
