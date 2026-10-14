# CAMPAIGN-10 re-cut — the authoring plan, corrected against the ARCH constitution

> **STATUS: CLOSED — the campaign is BUILT (audited 2026-08-29 against `master @ 92e9fa3`).**
> All 16 WPs are shipped and every "OPEN" row in the findings ledger below is closed in code.
> This document is kept as the historical re-cut record; **its ledger verdicts and correction #7 are
> stale and must not be read as current state.** The audited verdicts are:
>
> | ledger row          | audited verdict    | evidence                                                                                               |
> | ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
> | lucy-1 / lucy-2     | CLOSED             | union counted derivedly, no literal count — `surface-conformance-req-mcp-1e.test.ts`                   |
> | bobby-1             | CLOSED             | port declared `tools/src/anchors.ts:50`, implemented `adapter-io/src/grounding-computer.ts:178`        |
> | bobby-2             | CLOSED             | every planner leg bound — `adapter-io/src/compose.ts:27,190-476`                                       |
> | billy-1             | CLOSED             | structural advertised≡invocable test — `mcp-server/test/surface-conformance-req-mcp-1e.test.ts:97-138` |
> | dogfood-5 (AUTH-12) | CLOSED             | structured shape gate — `adapter-io/src/governed-emit-gates.ts:114-152`                                |
> | F4 (AUTH-14)        | CLOSED             | `tools/src/types.ts:116-121` (`EmitOut.nodeKey`), populated `adapter-io/src/governed-emit.ts:278`      |
> | F5 (CLI-6)          | CLOSED             | `cli/src/render.ts:317-335` renders all three `InitOut` fields                                         |
> | no-help (CLI-5)     | CLOSED             | `cli/src/cli.ts:231` — `help` / `--help` / `-h`, intercepted before `parse()`                          |
> | A5-stale-4          | CLOSED             | swept with correction #5/#6                                                                            |
> | arch-#8             | still out of scope | deferred AUTHORITY model (ARCH-9/11/12)                                                                |
>
> **Correction #7 is factually stale:** it claims EPIC-A5 is entirely unbuilt, that `author.ts` is still
> present, and that `READ_SURFACE` has no export site. All three are false at `92e9fa3` — `READ_SURFACE`
> is exported at `tools/src/handler.ts:78`, EPIC-A5 shipped (TOOLS/MCP/E2E), and `author.ts` became
> `adversarial-fixtures.ts` in `634e6ae`.
>
> **Remaining, explicitly NOT campaign work:** re-point the ~28 happy-path `adversarial-fixtures.ts`
> consumers onto the product `draft` door (hygiene follow-up), and `arch-#8` (deferred AUTHORITY model).

> **What this is.** The 16-WP CAMPAIGN-10 slice in `requirements/work-packages/wp-campaign-10.md` was frozen
> at `master @ 000b6ac`, _before_ ADR-0006 introduced the ARCH constitution (`ARCH-1..12`,
> `reference/atlas-architecture.md`) and its `layer-guard` gate. The constitution invalidated the plan's seam
> ownership and dependency head. This document is the re-cut demanded by task #85: it corrects the plan so
> every WP is buildable under `ARCH-2`, binds the doors that the frozen plan would have left unbound, and
> ledgers the cold-review findings. **It changes the plan's shape and DAG head only — not the campaign's
> intent, its epics, or its acceptance (delete `author.ts`).**
>
> **Truth precedence.** Where `wp-campaign-10.md` disagrees with `ADR-0006` / `reference/atlas-architecture.md`,
> the ADR and the architecture reference are truth and the WP card is stale (it predates them). This doc does
> not re-ratify the constitution; it re-cuts the plan _under_ it.

## The defect in one paragraph

The frozen plan makes **`WP-10.A1.ADAPTER`** (an `adapter-io` module) _own_ the `GroundingComputer` seam and
declares it "blocks every other WP in the campaign" (`wp-campaign-10.md:20-22, 30-31, 120`). That inverts
**ARCH-2** — `@atlas/tools` is the innermost port layer and MUST NOT depend on `@atlas/adapter-io`; every
outside capability MUST be a **port declared in `tools`** and satisfied by an adapter
(`atlas-architecture.md:64-69`, which names this exact plan as "the CAMPAIGN-10 defect… unbuildable"). A seam
_owned by_ adapter-io and _consumed by_ a tools-side leg cannot compile in the ring's dependency direction.
The same class produced a second defect: **no WP names `wire.ts`**, so the four planner doors would be built
and never bound into the composition root.

## The re-cut — seven corrections

1. **Flip seam ownership (fixes bobby-1 / ARCH-2).** `GroundingComputer` and `GateChain` become **ports
   declared in `@atlas/tools`**, implemented in `@atlas/adapter-io`. The port interface is the frozen artifact;
   the adapter is the consumer of the freeze, not its owner. This is exactly ADR-0004's _"one grounding
   computer"_ (AUTHOR-1) — the re-cut only relocates _where the contract lives_ to satisfy the ring.

2. **Flip the DAG head.** The prerequisite that "blocks the campaign" is no longer `A1.ADAPTER` — it is
   **`A1.TOOLS` freezing the `GroundingComputer` PORT**. Order becomes:
   `A1.TOOLS (freeze port) → A1.ADAPTER (implement) → A1.CLI (surface)`. The card's `deps:` lines that read
   `[ WP-10.A1.ADAPTER ]` as the root (`:136, :230`) flip to `[ WP-10.A1.TOOLS ]`. The coupling C1 the card
   protects (one derivation, sequenced) is _preserved_ — it is simply sequenced behind the port freeze, which
   is where ARCH-2 requires the contract to sit.

3. **Bind every door — `wire.ts` in the edit surface (fixes bobby-2 / ARCH-3).** Each WP that introduces a
   planner leg (`anchors`, `slots`, `draft`, `check`) MUST list `packages/adapter-io/src/wire.ts` in its
   `action_surface` and add the leg to the `composeRuntime` binding. A door not bound in `wire.ts` is dead on
   arrival; the WP is not done until `wire.ts` advertises it.

4. **Add the sixth seam.** The frozen plan froze five seams; the `GateChain` extraction (A3.ADAPTER) is a
   sixth port (`tools`-declared, `adapter-io`-implemented). It is listed as a first-class seam so the
   dependency `check → GateChain` is explicit, not implied.

5. **Reference the amended `INV-MCP-1` (fixes lucy-1/lucy-2).** ADR-0006 already superseded the "exactly five /
   no sixth tool" count with the **derived-surface property** (`GOVERNANCE_SURFACE` derived + budgeted, not a
   magic number). Every WP that touched the old count (notably EPIC-A5's advertise-the-union) must cite the
   amended `REQ-MCP-1a/1b`, not the retired count. No WP may re-assert "exactly five."

6. **Close advertised ≡ invocable (fixes billy-1 / ARCH-5).** `server.ts callTool` dispatches on
   `legs[tool]` with no membership check against the advertised surface. EPIC-A5's advertise-the-union WP MUST
   add the structural check that the advertised set and the invocable set are the _same_ set (a gate-spy or a
   membership assertion), so a future divergence fails a test, not a user.

7. **Correct the tracker.** Task **#82 ("CAMPAIGN-10.3 … 3 WPs") is mislabeled `completed`** — EPIC-A5 is
   entirely unbuilt: `packages/e2e-blackbox/test/author.ts` is still present, `READ_SURFACE` has no export site
   anywhere in `packages/**` (`server.ts:11`), and the union is advertised via a narrow read path, not a real
   surface. #82's _freeze/plan_ completed; its _build_ did not. It reopens as CAMPAIGN-10.3.

## The corrected DAG (unchanged epics, corrected edges)

```
EPIC-A1   A1.TOOLS(freeze GroundingComputer PORT) → A1.ADAPTER(impl) → A1.CLI(anchors + write-spy)
EPIC-A2-a A2-a.TOOLS(slots+draft, +wire.ts) → A2-a.CLI → A2-a.E2E(draft→emit round-trip)   [after A1.TOOLS,A1.ADAPTER]
EPIC-A2-b A2-b.TOOLS(route/CREATE-vs-UPDATE/supersede, +wire.ts) → A2-b.ADAPTER(retire-through-emit spy)
EPIC-A3   A3.ADAPTER(extract GateChain PORT, behaviour-preserving) → A3.TOOLS(check leg)     [after A2-a.TOOLS]
EPIC-A4   A4.TOOLS(widen EmitOut w/ read nodeKey) → A4.ADAPTER(populate receipt) → A4.CLI(help + full render)
EPIC-A5   A5.TOOLS(READ_SURFACE export) → A5.MCP(advertise union + membership check) → A5.E2E(byte-parity + DELETE author.ts)
```

No cycles. Campaign order stays `10.1 (A1,A2-a,A2-b) → 10.2 (A3,A4) → 10.3 (A5)`. Acceptance:
a human authors+emits a fact through product doors on both transports. [AMENDED 2026-08-25, owner-decided —
see ADR-0004 §Consequences] The acceptance is that product-door proof, NOT the physical deletion of
`author.ts` (which also carries a legitimate adversarial-fixture role that is kept).

## Cold-review findings ledger (#85)

There is **no single findings dossier**; the ~25 are distributed across ADR-0006, `atlas-architecture.md §4`,
the WP cards, and `authoring.md §5`. First-pass verdicts against `master @ e3ba705`:

| id                  | summary                                                                          | verdict                                                                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| arch-#4             | layer-guard read manifests only (planted import passed)                          | **RESOLVED** — gated by `layer-guard.mjs`                                                                                                                                                                                                                |
| arch-#9             | check conflicted with ARCH-10 wording                                            | **RESOLVED** — shipped as test (ADR-0007)                                                                                                                                                                                                                |
| arch-#10            | check already satisfied by target code                                           | **RESOLVED / moot**                                                                                                                                                                                                                                      |
| A5-stale-1/2/3      | two singular-write-door strings, unscanned repo root, missing anti-drift pattern | **RESOLVED (standalone)**                                                                                                                                                                                                                                |
| lucy-1              | INV-MCP-1 "exactly five" contradicts the 12-tool union                           | **RESOLVED 2026-09-03** — the ratified requirement layer was fanned out to the derived six/three surface (ADR-0006 Decision 2) in `req/lucy-1-derived-surface` (#305); register row TOOLS-1 updated; the invariant layer now names the shipped constants |
| lucy-2              | register completeness table checked only the non-conflicting invariant           | **RESOLVED 2026-09-03** — folded into correction #5 and closed with it: #305 fan-out touched the register's testable/number column for TOOLS-1/12/16 to the derived six/three, proving the column is live (a change to it moves the gate)                |
| bobby-1             | seam ownership inverts ARCH-2; 2 of 5 freezes unbuildable                        | **RESOLVED** — the `GroundingComputer`/`GateChain` ports are declared in `packages/tools/src/anchors.ts` / `governed-emit-gates.ts` and implemented in `@atlas/adapter-io`; ownership correction #1/#2 landed with CAMPAIGN-10                           |
| bobby-2             | no WP names `wire.ts`; four doors built and never bound                          | **RESOLVED** — `packages/adapter-io/src/compose.ts` binds the seam; `assembleHandler` (wire.ts) is the leg assembly, referenced by both `compose.ts:57` and each door's WP                                                                               |
| billy-1             | `callTool` has no membership check (advertised ≠ invocable)                      | **RESOLVED (structural)** — `surface-conformance-req-mcp-1e.test.ts` proves advertised ≡ invocable from the ONE surface source and that `callTool` carries no independent membership list                                                                |
| A5-stale-4          | `server.ts:63` "no more, no less" comment stale vs union                         | **RESOLVED** — `chore/code-comment-hygiene` (#303) corrected the `server.ts` comments to the union (six governance ∪ ten read); no stale count remains                                                                                                   |
| dogfood-5 (AUTH-12) | emit surfaces raw `TypeError`, no legible refusal                                | **RESOLVED** — `governed-emit-shape-gate.test.ts` turns the 2026-07-25 dogfood's raw `Cannot read properties of undefined` into a structured gate refusal; `atlas check` returns a named gate + remedy                                                   |
| F4 (AUTH-14)        | emit returns `contentHash`, read doors take `NodeKey` — loop unclosed            | **RESOLVED** — EPIC-A4: `atlas emit` prints BOTH `data.id` (contentHash → `atlas node` resolves) AND `data.nodeKey` (→ `link`); loop closed (`EmitOut` carries both, `governed-emit.ts:327`)                                                             |
| F5 (CLI-6)          | `render.ts:99-104` drops 2 of 3 `InitOut` fields                                 | **RESOLVED** — A4.CLI: `render.ts` init leg renders all three (territories + blastRadius + t0Candidates), pinned by SCN-CLI-6b-1                                                                                                                         |
| no-help (CLI-5)     | `atlas help` does not exist                                                      | **RESOLVED** — A4.CLI: top-level `atlas help` derived from the command map, exit 0, pinned by `help-cli.test.ts`                                                                                                                                         |

~13 now RESOLVED (each with its evidence above, dated where the closure is recent). The ledger's one
remaining OPEN row is `arch-#8`, which is out of scope — it belongs to the deferred AUTHORITY model
(below), tracked as ARCH-D3b/D4.

## Ratification gates — what the BUILD needs from the owner (DEFINE seat)

The re-cut design needs no ratification (it is forced by ARCH-2, already law). The **build** does. Per the
roadmap prerequisites, dispatch of CAMPAIGN-10.1 is blocked until:

- **ADR-0004** (authoring = planners, not write doors) — currently _Proposed_. Gates all of 10.1.
- **ADR-0005** (both-transports symmetry) — currently _Proposed_. Gates 10.3 only.
- **ADR-0006 Decision 1** (hierarchy clauses) — _Proposed pending DEFINE seat_. Decision 2 (the exposure
  amendment + ARCH-2 + layer-guard) is already owner-ratified and is what this re-cut leans on.

**Explicitly out of scope of this re-cut:** the AUTHORITY model (`ARCH-9/11/12`, tracked ARCH-D3/D4) — it
needs its own ADR and its own owner ratification, and `arch-#8` rides with it. CAMPAIGN-10 ships human
authoring on the _existing_ authority model; it does not extend authority.

## What happens next

1. Owner ratifies **ADR-0004** (10.1's gate). Recommendation on file: approve — it adds authoring without
   touching the write surface (5 tools / 2 write-paths stay), precedent is `doctor reground`.
2. On ratification, the lead folds these seven corrections into `wp-campaign-10.md` (the frozen card gets the
   flipped seams, DAG head, and `wire.ts` bindings), then dispatches **wave 1 = EPIC-A1**:
   `A1.TOOLS → A1.ADAPTER → A1.CLI`, sequential (the DAG head is a single chain), cold-reviewed per WP.
3. No build seat is dispatched before step 1.
