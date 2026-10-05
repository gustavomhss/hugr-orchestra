# Work Package — HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card for an EXPERIMENT with a build attached, dispatched by the lead with the
> frontier magnitudes pre-measured against the real repository. Conforms to
> [`method/wp-template.md`](../../method/wp-template.md); the five-part gate structure below is
> [`DECOMPOSITION-PROTOCOL.md`](../../DECOMPOSITION-PROTOCOL.md) — axioms are inherited premises, rules are
> the procedure, **invariants gate per-item**, **completeness criteria gate the set**, quality standard is
> the cold-review bar. The `exec` fields (`outputs`/`provenance`/`trace_ref`) are FILLED, not empty,
> because this WP is DONE. Pointers are relative to this file (`docs/requirements/work-packages/`).

---

### WP-FIX-2.GEN — the structural frontier emits sub-file sites (#182)

epic: none (out-of-band, dispatched by the lead with the frontier magnitudes pre-measured)
id: WP-FIX-2.GEN
title: `structuralFrontier` emits `symbol`/`block` sites; the source reader and the evidence span narrow to
the unit

intent: >
`packages/genesis/src/seeds.ts` emitted exactly one `kind` literal and it was `'file'`, so ONE FACT PER
FILE was a ceiling BY CONSTRUCTION. Measured on master `e4882a3` against the real repository through the
built `dist`: the frontier offers **520** sites, all `kind:'file'`, `droppedNoPath` 0 — while
`foldAstUnits`, already on the production path (`adapter-io/src/compose.ts`), had already parsed, keyed
and Merkle-hashed **5283 sub-file units** (3798 `item` + 1485 `block`) that were offered to nobody.
Ratio 10.2×.

This card is an EXPERIMENT with a build attached. The hypothesis — at equal budget, a symbol-granular
frontier yields more distinct and more narrowly-grounded facts than a file-granular one — is NOT
established. The deliverable is a measurement with a stated falsifier, not a feature, and the frontier
therefore ships OPT-IN (`ATLAS_FRONTIER=symbol`) so a behaviour that may be reverted is not the one
every unrelated caller silently gets meanwhile.

## axioms (inherited premises — given, not re-litigated)

- **A1.** `StructRef.kind` already admits `'symbol' | 'block'` and [`../../../packages/contracts/src/struct.ts`](../../../packages/contracts/src/struct.ts)
  already specifies the `::`-chained path form for them. The contract was written for this; the producer
  never caught up. **No change to a frozen data model is in scope.**
- **A2.** Cost is hard-capped by `budget.ceiling` (`genesis/src/extract.ts`, one bounded call per visited
  site, default `min(frontier_size, 200)`). **Adding sites is cost-NEUTRAL at fixed budget.** It changes
  what the budget is spent on, never how much.
- **A3.** `#159` landed the span carrier: `bindSpan` computes the digest from bytes it holds and refuses a
  caller-supplied one. That discipline is the model for S3.
- **A4.** `#189` landed: SCIP `local` symbols are document-scoped and contribute no edge. The dependency
  axis's endpoints are DOCUMENTS, so no sub-file unit has a PPR of its own.

## rules (the procedure — followed, not chosen)

**S1 — the frontier emits sub-file sites.** `structuralFrontier` gains `symbol`/`block` seeds, cut from the
spatial axis's `::` nodes, for the files that already reach the frontier.

The within-file order is the load-bearing decision and **MUST NOT be a hash.** Units inheriting their
file's score all tie, so the tie-break — not the score — decides what gets mined. That is `#188` moved onto
the WRITE path. Order is `(exported desc, size desc, path asc)`, stated in code as a **prior**, never as
measured importance; the hash appears ONLY as the final total-order tie-break, with a comment saying that
reaching it means the priors discriminated nothing.

**S2 — a unit-granular `SourceReader`, resolved through the tree, not the filesystem.** The reader for a
sub-file site returns the `content` of the folded-tree node whose path IS `site.qualifiedPath` — the same
bytes `foldAstUnits` sliced, the same bytes the unit's `subtreeHash` folded over. Unresolvable key ⇒ `null`
⇒ the existing `source-unreadable` refusal. Fail-closed, and structural: the reader cannot return more than
the unit because the unit's bytes are the only thing it holds.

**S3 — the span narrows, and NO interior offset crosses a boundary.** `evidenceSpan` keeps its exact shape,
`mintSpan(bytes, 0, bytes.length)`; S2 changed what `bytes` ARE, so the span addresses the unit. The
ticket's "convert UTF-16 offsets to byte offsets" is **deliberately not done**: `ast.ts`
`src.slice(node.startIndex, node.endIndex)` is correct as written — those are UTF-16 indices into a JS
string, which is what `String.slice` wants — and carrying the sliced BYTES instead of the OFFSETS means no
conversion is needed anywhere. **The frozen rule: units of position are never transported; bytes are.**

**S4 — the model-backed A/B — is a different seat's card.** Arm FILE stays reachable from the SAME binary.

## invariants (per-item, mechanically checkable — GATE)

- **I1.** Every emitted sub-file seed's `qualifiedPath` resolves to a node in the folded tree.
- **I2.** For an `item` that is a strict subset of its file, `evidenceSpan(cand).contentHash` **equals** the
  digest of the unit's bytes and **differs from** the digest of the file's bytes — exact values, never a
  substring, never a length.
- **I3.** No production module reads a tree-sitter `startIndex`/`endIndex` across a module boundary.
- **I4.** The comparator is a strict total order and the hash is reachable only as the last term.
- **I5.** Every file in `packages/**` and `harness/**` stays ≤400 LOC.
- **I6.** Arm FILE reproduces the shipped 520-site frontier exactly, byte-for-byte on the seed list.

## completeness criteria (set-level closure — GATE)

- **C1.** Every gate in `harness/gates/` runs BY NAME with its own exit code, read directly, never piped.
- **C2.** Both `kind`s are covered by an acceptance case: one `item` site and one `block` site.
- **C3.** Every new probe or checker is calibrated in BOTH directions before any finding rests on it.
- **C4.** Any mutation assertion proves the pattern MATCHED before running the suite.
- **C5.** Every count that justifies a decision prints its matched items, not just the number.
- **C6.** Anything touching paths, cwd, env or spawned processes is probed in the BUILT `dist`.

## quality standard (per-unit bar — COLD-REVIEW)

Prose in the code states what is honestly unavailable rather than implying a signal exists. The ordering
prior is labelled a prior. A refusal says which of its conditions fired. The S2 granularity guarantee holds
**by construction**, not by care.

anchor:

- [`../../../packages/genesis/src/seeds.ts`](../../../packages/genesis/src/seeds.ts) — the frontier; the `kind:'file'` literal it used to be alone in emitting
- [`../../../packages/genesis/src/unit-order.ts`](../../../packages/genesis/src/unit-order.ts) — the sub-file vocabulary and the non-hash order (split at the LOC ceiling)
- [`../../../packages/adapter-io/src/unit-source.ts`](../../../packages/adapter-io/src/unit-source.ts) — the unit-granular `SourceReader`
- [`../../../packages/adapter-io/src/ast.ts`](../../../packages/adapter-io/src/ast.ts) — `unwrapExport`, where export-ness used to be discarded
- [`../../../packages/cli/src/mine-frontier.ts`](../../../packages/cli/src/mine-frontier.ts) — the A/B arm selector

interface_contract:

- source: [`../method-tags-gen.md#INV-GEN-2`](../method-tags-gen.md#INV-GEN-2) # bounded spend, one call per site
- source: [`../../reference/atlas-grounding.md`](../../reference/atlas-grounding.md) # the span carrier landed by #159

source_reqs:

- source: [`../req-gen.md#REQ-GEN-2b`](../req-gen.md#REQ-GEN-2b) # spend highest-first — the order this WP keeps total and non-arbitrary
- source: [`../req-gen.md#REQ-GEN-2d`](../req-gen.md#REQ-GEN-2d) # the hard budget ceiling — the reason this card is cost-neutral

exclusions:

- `packages/tools/**`, `harness/gates/adr-citation-guard.mjs` — a LIVE seat owns branch
  `fix/surface-truth`. Read-only, and untouched.
- `packages/index/src/**` — the SCIP `range` carrier is deliberately OUT of scope. **Untouched; the
  consequence is recorded under "the exclusion that cost the most" below.**
- `deriveEdges`, the dependency axis, PPR, and the governed write door — untouched.
- The model-backed A/B run — a different seat's card.

action: implement S1, S2, S3; add the acceptance cases; leave arm FILE reachable.

guardrails: worktree-only, byte-level `cp` backup/restore (never `git checkout`/`restore`/`stash`/`reset`),
no real-looking credential in any fixture, commit only — never push, never PR, never merge.

repair_budget: N=3 · early-stop { repeated-identical-failure, no-change-diff, semantic-dup-edit }.
**Consumed: 1** (the `resolveSiteKey`/`siteOrderKeys` over-broad `::` rule, fixed in one round).

acceptance (DoD) — each proven RED first by targeted mutation with the pattern-match proved:

- existing: SCN-GEN-2b-1 / SCN-GEN-2d-1 stay green (descending order preserved, ceiling still caps spend)
- NEW: an `item` site's evidence span addresses the unit, not the file (I2)
- NEW: a `block` site mints and resolves end to end (C2)
- NEW: the within-file order is `(exported, size, path)` and is a strict total order (I4)
- NEW: an unresolvable unit key refuses rather than falling back to the file (S2 fail-closed)

deps: [ ] parallel_group: [P] (disjoint from `fix/surface-truth`)

exit_predicate: all acceptance goldens green ∧ `tsc -b` clean ∧ the suite reconciled against the
`origin/master` baseline ∧ every gate exit 0 ∧ I1-I6 and C1-C6 each individually evidenced.

owner: GENESIS + ADAPTERS territory · builder_id: `charlie`

outputs:

- `packages/genesis/src/unit-order.ts` (new) · `packages/genesis/src/seeds.ts` · `packages/genesis/src/rank.ts`
- `packages/adapter-io/src/unit-source.ts` (new) · `packages/adapter-io/src/ast.ts` · `packages/adapter-io/src/skeleton-source.ts` · `packages/adapter-io/src/index.ts`
- `packages/cli/src/mine-frontier.ts` (new) · `packages/cli/src/mine.ts` · `packages/cli/src/mine-staging.ts` · `packages/cli/src/mine-proposer.ts` · `packages/cli/src/mine-worker.ts`
- `packages/genesis/test/unit-frontier.test.ts` (new, 15 cases) · `packages/adapter-io/test/unit-source.test.ts` (new, 12 cases) · `packages/adapter-io/test/symbol-frontier.test.ts` (new, 5 cases)
- `packages/e2e-blackbox/test/s26-symbol-arm.blackbox.test.ts` (new, 3 cases) — the BUILT-BINARY guard on
  the proposer pool; see the cold-review section below for why a unit test could not carry it

provenance:

- **HOW TO READ EVERY ABSOLUTE NUMBER BELOW — the provenance, because without it they do not reproduce.**
  Atlas here measures ITSELF, so the magnitudes are a function of the working tree at the moment of
  measurement, and of the SCIP dump the dependency axis is derived from. That dump is
  `.atlas/index.scip`: **it is NOT committed** — `.gitignore:20` ignores `.atlas/*` except `policy.json`
  — it is a LOCAL artifact generated at master `e4882a3` and copied into the worktree, and it names
  exactly **520 documents**, which is why arm FILE is exactly 520 sites. Any file created after
  `e4882a3` is therefore absent from the dump, has no dependency edge, reaches no frontier slot, and
  contributes no seed — while its units DO exist in the walked tree. Re-running against a REGENERATED
  dump would raise the seed counts; `scip-typescript` is not installed here, so it was not regenerated.
- MEASURED through the built `dist` at the tree of THIS COMMIT (both arms, one binary): arm FILE **520**
  sites, all `kind:'file'` — byte-identical to the no-options default and to the master baseline. Arm
  SYMBOL **5816** sites = 520 `file` + 3805 `symbol` + 1491 `block`. Units in the walked tree **5376**;
  unit bytes min 7 · median 114 · max 17435; exported 1336, private 4040.
- THE CHECKABLE INVARIANT, which is what a reader should verify rather than the constants: every unit in
  the tree that the frontier does NOT emit belongs to a file the dump does not name. MEASURED —
  `unitsInTree 5376 − unitsEmitted 5296 = 80`, and the units under files absent from the frontier total
  **exactly 80**, across 7 files, every one of them created by this task and every one reporting
  `inScipDump: false, existsInWalkedTree: true`. The identity holds by matched item, not by arithmetic
  coincidence. (An earlier revision of this card recorded 5830/5310/1329/3981 measured on a mid-task
  snapshot; those figures did not reproduce at the shipped commit and are superseded here.)
- THE HEADLINE FOR S4, and it is a CONFOUND, not a result: at budget 200 arm SYMBOL touches **16**
  distinct files (16 `file` + 174 `symbol` + 10 `block` sites) against arm FILE's **200**. A unit
  inherits its file's PPR and therefore sorts adjacent to it, so the budget is spent depth-first. Any
  deficit arm SYMBOL shows in "distinct facts" is attributable to a 12.5× coverage collapse before it is
  attributable to granularity. Named here rather than discovered after 200 model calls.
- 11 targeted mutants, every pattern proved MATCHED (occurrences = 1) and every file proved changed
  before the run: **11/11 KILLED**, every restore byte-identical, unmutated control 32/32 green.
- BUILT-BINARY probe (subprocess, real worker pool, `echo` stand-in model — no live model): arm FILE
  exit 0 / 2 sites, all `kind:'file'`; arm SYMBOL exit 0 / 6 sites, all `seeded`; `ATLAS_FRONTIER=symbols`
  (a typo) reads as arm FILE rather than as a third behaviour.
- The worker grammar warm-up is load-bearing and was calibrated by removing it and REBUILDING: arm
  SYMBOL then exits **1** with the first symbol site `interrupted` and 4 of 6 sites `unvisited`, while
  arm FILE stays exit 0 and the entire unit suite stays green.

trace_ref: branch `feat/symbol-sites`, forked from master `e4882a3`.

rationale:

- source: [`../req-gen.md#REQ-GEN-2b`](../req-gen.md#REQ-GEN-2b)

---

## Deliberately out of scope, named rather than silently dropped

**The SCIP `range` carrier.** `packages/index/src/types.ts` `ScipOccurrence = {symbol, role}` drops SCIP's
`range`, so a symbol cannot be joined to an AST unit by position. Joining by NAME instead would be the
spelling-based join `#189` and `#153` punished, and is forbidden. A per-symbol reference count is the
principled rank signal and stays deferred until the experiment says symbol sites are worth ranking properly.

## The exclusion that cost the most, recorded because it will recur

The card requires the within-file order to be `(exported desc, size desc, path asc)` **and** excludes
`packages/index/src/**`. Those two are in tension, and the tension is the card's own subject:

- `IndexNode` carries **no `content`**, so a unit's byte SIZE is unrecoverable from the spatial axis.
- `unwrapExport` discards export-ness before the tree is built, so SURFACE-ness is unrecoverable too — and
  it cannot be recovered from the unit's own bytes either, because the item's slice starts INSIDE the
  export statement (measured: the exported item's `content` begins `function greet`, not `export function`).

So the frontier had both priors named for it and neither available. Rather than edit the excluded package,
both now ride an explicit injected seam — `UnitPriorSource`, declared in `genesis` and implemented by
`adapter-io`'s `foldAstUnitsWithPriors`, which returns the priors BESIDE the tree from the SAME parse and
hangs them on the skeleton source that already folded it. Cost: **zero extra parse**, one new port, and one
duck-typed read at the composition edge (`unitPriorOf`) so the frozen `SkeletonSource` port is not widened.

The cheaper design is two optional non-hashed fields on `IndexNode` (`bytes`, `exported`), set from data
`hierarchy` already holds, entering no `foldNodeHash` preimage and moving no `subtreeHash`. It was built,
measured working, and then REVERTED to honour the exclusion. If the owner ever lifts it, that is a ~6-line
change that deletes this seam — **and `rank.ts` `canonNode` must be updated in the same commit**, because
it rebuilds `IndexNode` field by field and would silently erase both fields between the producer and the
only consumer that reads them. That erasure is a sixth instance of the class this card is about.

## `ATLAS_FRONTIER` is deliberately absent from the reference docs (cold review F7)

`ATLAS_ACTOR` appears in 10+ places under `docs/reference/`; `ATLAS_FRONTIER` appears in none, and that is
a decision rather than an omission. `ATLAS_ACTOR` is a SUPPORTED operator input with governance meaning —
it selects the identity a write is judged as, and an operator must be able to look it up. `ATLAS_FRONTIER`
selects a CANDIDATE POOL for one experiment whose stated outcome may be "revert the frontier"; it feeds no
gate, changes no authority, and is read in exactly one file. Documenting it beside `ATLAS_ACTOR` would
publish it as a supported surface and make removing it a breaking change to a documented contract — the
opposite of what an opt-in experiment should cost to withdraw. It is therefore documented HERE, on the card
that owns its lifetime, and in the header of `packages/cli/src/mine-frontier.ts` where it is read. **If S4
keeps the symbol arm, promoting it to the reference docs is part of keeping it; if S4 sinks it, the seam
and this card go together.**

## What the cold review found, and what it changed (one fix round)

- **F1 — a genuine surviving mutant.** Reversing the `path asc` leg of `byUnitPrior` applied cleanly and
  the full suite still passed, while the real repository's emitted order moved on 488 of 5816 records. The
  leg was unreachable in the fixture because every unit there had a distinct `bytes`. Closed by adding a
  PAIR (`ALPHA`/`OMEGA`) that ties on both `exported` and `bytes`, so `path` is the only leg that can
  separate them, plus a case asserting it on BOTH order-producing paths. The mutant, and the matching one
  on `compareSiteOrder`, are now KILLED.
- **F2 — a docstring stating the opposite of its code.** `rank.ts` `MineDeps.frontier` said sub-file seeds
  were ON by default; they are OFF. Fixed, and the wording now POINTS at the single declaration in
  `FrontierOptions` rather than restating it — a second copy of a default is how the first one drifts. The
  other five places a default is claimed were audited and are correct.
- **F3 — the `initAst()` worker fix was load-bearing and unguarded.** Deleting it leaves `tsc -b` at 0 and
  all 32 unit goldens green while arm SYMBOL exits 1 with its first symbol site INTERRUPTED. A unit test
  cannot reach the worker pool, so the guard is a built-binary subprocess story (`s26`). Re-verified in
  both directions after it was written: with the line deleted `s26` exits **1** and the 32 unit goldens
  still exit **0**; restored, `s26` exits 0.
- **F4 — absolute magnitudes that did not reproduce.** Settled above by MEASUREMENT rather than
  reconstruction: the reconciliation identity is checked by matched item, and the dump's provenance (local,
  gitignored, generated at `e4882a3`, 520 documents) is now stated.
- **F6 — a vacuity trap.** `digestOf` minted `mintSpan(bytes, 0, 1)`, which returns `undefined` whenever
  offset 1 splits a code point, making `String(undefined?.contentHash)` the literal `'undefined'` on BOTH
  sides of the assertion. Confirmed live-capable (`mintSpan(encode('☕x'), 0, 1) === undefined`) and fixed
  to `0, bytes.length`, which now THROWS on an unspannable fixture rather than silently asserting nothing.
- **F5 is NOT fixed here** and is carded separately by the lead: `UnitPriorSource`'s memo is instance-scoped
  and keyed by path, never refreshed per rev, so it would answer for any rev's units after one HEAD call.
  Proved unreachable on the shipped path; keying by `subtreeHash` is a design change, not a fix round.

## The fifth instance of one class

`ast.ts` receives offsets and keeps only the slice. `ScipOccurrence` drops `range`. Genesis computes `ppr`
and drops it at the fact boundary (`#188`). `deriveEdges` computes per-symbol reference structure and
collapses it to document endpoints. `unwrapExport` computes export-ness and discards it. Five independent
producers, one shape: **position and importance are computed, used locally, and dropped at a type
boundary.** That is a design fact about this codebase and it belongs in an ADR, not in five bug reports.
