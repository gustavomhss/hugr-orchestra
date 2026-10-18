# Work Package — the drift DETECTOR spans every grounding entry, not entry zero (amendment card, 2026-08-03)

> One card, standing alone because it amends a shipped seam rather than a campaign slice. Conforms to
> [`method/wp-template.md`](../../method/wp-template.md): every substantive field is a `ptr+digest`
> (digests are tooling-filled at freeze), `content_hash` is filled at freeze, the `exec` fields carry the
> run's outcome.

---

### WP-FIX-DRIFTAT-ENTRIES — the merge-gate DETECTOR spans every citation, closing the third instance

epic: EPIC-26-b
id: WP-FIX-DRIFTAT-ENTRIES
content_hash: <filled-at-freeze>
title: `driftAt` decided which facts reach the classifier from `entries[0]` alone — the worst of three entry-0 asymmetries, because it produced NO answer rather than a wrong one
intent: >
`WP-FIX-DOCTOR-ENTRIES` closed two copies of the mechanical-vs-semantic CLASSIFICATION question that both
read `entries[0]` alone (`doctor-source.ts`'s classifier, and a copy inlined at the composition root feeding
`bindReconcile`) — and named, without repairing, a THIRD instance one layer above: `git-drift.ts`'s `driftAt`
is the DETECTOR that decides which facts reach the classifier AT ALL, and it read
`f.grounding.entries[0]` and nothing else.

THIS IS THE WORST OF THE THREE, AND IT IS WORTH SAYING PRECISELY WHY. The other two gave a WRONG ANSWER — a
fact reached the classifier and was misjudged. This one gave NO ANSWER: a fact whose PRIMARY anchor was
intact and whose NON-PRIMARY citation had rotted away was never surfaced as a pair, so it was never detected,
never classified, never reported — `exitCode 0`, total invisibility, one layer above where the classifier fix
(WP-FIX-DOCTOR-ENTRIES) could reach by construction: it cannot misclassify a fact it never receives.

MEASURED, through the real `composeRuntime` handler, over a durable knowledge base holding four facts (the
same four-combination shape as WP-FIX-DOCTOR-ENTRIES's fixture, rebuilt standalone in
`git-drift-entries.test.ts`):
BEFORE exitCode 2 mechanical ['lead-mech'] semantic ['mixed'] reauthor 1
AFTER exitCode 2 mechanical ['sec-mech','lead-mech'] semantic ['sec-rot','mixed'] reauthor 2

`sec-mech` (primary fresh, secondary renamed) and `sec-rot` (primary fresh, secondary rewritten away) were
BOTH invisible before this card — neither in `mechanical` nor `semantic`, simply absent from `drift` — because
their PRIMARY anchor never drifted and `driftAt` never looked past it. `sec-rot` reaching the gate is the
headline change: a rotted non-primary citation now BLOCKS a merge that previously passed silently.
source_reqs: # ptr+digest

- source: ../requirements-adapters.md#REQ-ADAPTER-9f # ptr+digest
  seam-freezes: [ ]
  anchor: packages/adapter-io/src/git-drift.ts — `createDriftSource` / `driftAt` / `entryDrift`
  interface_contract: # ptr+digest
- source: ../../reference/atlas-adapters.md#adapt-git-2 # ptr+digest
- source: ../method-tags-adapters.md#INV-ADAPTER-9 # ptr+digest
  exclusions: >
  `DriftItem` is NOT widened — it stays one `anchorWas`/`anchorNow` pair (atlas-tools:24, frozen). The pair
  reported for a surfaced fact changes from "always `entries[0]`" to "the FIRST entry, in recorded order, that
  actually drifted" — so a human is shown an anchor that moved, never a primary that never moved. Classification
  is UNCHANGED: `isMechanicalAt` (doctor-source.ts, from WP-FIX-DOCTOR-ENTRIES) already spans every drifted
  entry and is untouched by this card — this WP widens DETECTION only, which is what decides which facts reach
  that classifier, not how they are judged once they arrive. `reconcile.ts`'s `exitCode = |semantic|>0 ? 2 : 0`
  law is UNTOUCHED.

`doctor-source.ts`'s `isMechanicalAt`/`driftedEntries` are DELIBERATELY NOT reused at this call site, and
this is a documented departure from the framing this card started with (see `provenance` below for the
measurement). They decide mechanical-vs-semantic by asking, PER ENTRY, whether it re-derives at ONE target
rev (`revIndex.reDerives`, a conjunction over a single `Axes` snapshot) — a CLASSIFICATION question over a
`RevIndex` seam. `driftAt` asks a structurally different DETECTION question — whether an entry's anchor
differs between TWO revs (`baseSha` vs `topicSha`) — over the injected `resolveAnchorAt`/`resolveBySubtreeAt`
pair `DriftSource`'s frozen deps carry, with no `RevIndex`/`reDerives` seam available to call through. So this
is not a third copy of one predicate to collapse; `driftAt`'s per-entry body (previously restricted to entry 0) is the SOLE existing implementation of this two-rev diff, widened in place via a new `entryDrift` helper
rather than duplicated.
inputs: # ptr+digest

- source: ../../reference/atlas-adapters.md#adapt-git-2 # ptr+digest
  action: >
  Loop `driftAt` over every grounding entry (not `entries[0]` alone); a fact is surfaced when ANY entry drifted
  (in-place content change, or a pure rename via the N10 content resolver). The pair reported is the FIRST
  drifted entry in recorded order — `break` after the first hit, one pair per fact, never all-or-nothing across
  a fact's own citations either. The per-entry verdict (`entryDrift`) is the EXISTING inline body, extracted and
  looped rather than duplicated.
  action_surface: [ read-repo, edit(packages/adapter-io/src/git-drift.ts), edit(packages/adapter-io/test/**), run-tests(adapter-io), typecheck ]
  guardrails: >
  No edit to `doctor-source.ts`, `compose.ts`, `wire.ts`, `rev-index.ts`, `reconcile.ts`, `packages/grounding/**`,
  `packages/knowledge/**`, `packages/genesis/**`, `packages/cli/**`, or the `index.ts` barrel. `DriftSource`'s
  public shape (`driftAt(mergeBase): readonly DriftPair[]`) and `DriftPair`/`DriftItem` are UNCHANGED. Every
  pre-existing `git-drift.test.ts` / `compose-recon.test.ts` / `compose-recon-n10.test.ts` fixture is
  single-entry and MUST stay green, unchanged (a single-entry loop is indistinguishable from the pre-widening
  body — its only entry IS entry 0).
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-adapters.md#SCN-ADAPTER-9f-1 # ptr+digest
- source: ../goldens-adapters.md#SCN-ADAPTER-9f-2 # ptr+digest
  deps: [ WP-FIX-DOCTOR-ENTRIES ] parallel_group: [S] — sequenced after the classification fix so detection and
  classification are never mid-flight on divergent assumptions about `isMechanicalAt`'s shape
  exit_predicate: >
  both acceptance SCNs green ∧ the new TEETH reproduce this file's OLD (pre-#185) numbers exactly, by restoring
  `git-drift.ts` byte-for-byte and watching them go red, then restoring the fix and diffing byte-identical ∧
  every pre-existing single-entry `DriftSource`/`atlas-reconcile` fixture is green UNCHANGED (the negative
  direction) ∧ `tsc -b` clean ∧ full `npm test` green ∧ every `harness/gates/**` gate green
  context_refs: # closed list
- source: ../requirements-adapters.md
- source: ../goldens-adapters.md
- source: ../method-tags-adapters.md
  owner: adapter-io / git-drift seat
  outputs: >
  packages/adapter-io/src/git-drift.ts (209 LOC) — `entryDrift` (the per-entry verdict, extracted from the
  pre-widening inline body over `entries[0]`, now looped over every entry by `driftAt`); the pair `driftAt`
  reports for a surfaced fact is the FIRST drifted entry, not `entries[0]` unconditionally.
  packages/adapter-io/test/git-drift-entries.test.ts (NEW, 259 lines, 4 tests) — the four-combination
  fixture (primary fresh/secondary renamed; primary fresh/secondary rewritten; primary renamed/secondary fresh;
  primary renamed AND secondary rewritten), driven end to end through the real `composeRuntime` handler; a TEETH
  test that truncates the SAME facts to `entries[0]` and reproduces the pre-#185 reach exactly (no duplicated
  predicate); and the single-entry negative-direction pin over the real fixture repo.
  packages/adapter-io/test/reconcile-entry-symmetry.test.ts (EDITED, 0 new tests) — the three existing tests
  TIGHTENED to the new numbers: the "clean" fixture is now genuinely rot-free (`['sec-mech','lead-mech']`,
  dropping `sec-rot` which — pre-#185 — was mislabelled "clean" only because the old detector could not see its
  rot); the "MEASURED GAP" test is retired in favour of a green "CLOSED (#185)" assertion that all four facts
  now surface.
  provenance: >
  WHAT THE FRAMING GOT WRONG, MEASURED. The brief instructed reusing `doctor-source.ts`'s exported
  entry-spanning classifier at this call site ("three copies of one rule … find it, consume it, do not write a
  third predicate"), with an explicit escape valve if it did not fit. It does not fit: `isMechanicalAt` decides
  mechanical-vs-semantic over a `RevIndex`'s `reDerives` (one rev, a conjunction over an `Axes` snapshot) —
  already correct and untouched by this card (frozen, per the brief itself) — while `driftAt` decides WHICH
  FACTS REACH THAT CLASSIFIER by diffing an entry's anchor across TWO revs (`baseSha`/`topicSha`) over
  `resolveAnchorAt`/`resolveBySubtreeAt`, a seam `DriftSource`'s frozen deps do not carry a `RevIndex` through.
  These are different questions over different seams; there was never a second copy of `isMechanicalAt`'s body
  living inside `driftAt` to collapse, because `driftAt`'s own per-entry logic (previously entry-0-only) was
  always the SOLE implementation of this particular diff. The correct move — confirmed by inspecting `wire.ts`
  and `rev-index.ts`, per the brief's own escape valve — was to widen that sole implementation in place, which
  is what this card does.

THE MERGE GATE, driven end to end through the real `composeRuntime` handler at `mergeBase = A`, over the
four-fact fixture: BEFORE (pre-#185 `driftAt`, entries[0]-only) — `exitCode 2`, `mechanical ['lead-mech']`,
`semantic ['mixed']`, `reauthorCount 1`, `drift.length 2`. AFTER (this card) — `exitCode 2`,
`mechanical ['sec-mech','lead-mech']`, `semantic ['sec-rot','mixed']`, `reauthorCount 2`, `drift.length 4`.
CONTROL, a genuinely rot-free knowledge base (`sec-mech` + `lead-mech` only, no `sec-rot`/`mixed`):
`exitCode 0`, `mechanical ['sec-mech','lead-mech']`, `semantic []` — BEFORE and AFTER, byte-identical (the
pre-#185 detector already surfaced `sec-mech` incorrectly-omitted from nothing since it was never present in
that control's seed either way — both sources report the SAME clean result for a store that never held rot).
RED/GREEN, `packages/adapter-io/src/git-drift.ts` restored byte-for-byte to the pre-#185 source, driving
BOTH files that assert the widened reach: 5 of 7 tests go RED (`git-drift-entries.test.ts` 2/4 — the
single-entry negative-direction pin and the entries[0]-truncation TEETH correctly stay GREEN on either
source, by construction; `reconcile-entry-symmetry.test.ts` 3/3). Restoring the fix makes all 7 green again;
`diff -q` against the pre-restore file is byte-identical.
Baseline measured rather than inferred: `origin/master` 2cbc5cc is 308 files / 2433 passed | 1 todo, exit 0
(verified in a separate detached worktree, `npx tsc -b` run first — the untouched worktree's stale/absent
`dist/` otherwise fails 259 unrelated e2e-blackbox files that spawn the built CLI, a measurement artifact of
the worktree, not a baseline defect). This branch is 309 files / 2437 passed | 1 todo, exit 0 (+1 file, +4
tests: `git-drift-entries.test.ts` is NEW; `reconcile-entry-symmetry.test.ts` gained 0 net tests — 3 edited
in place, none added or removed).
trace_ref: branch fix/driftat-spans-entries (worktree off origin/master 2cbc5cc)
rationale: # ptr

- source: ../invariant-register-adapters.md#INV-ADAPTER-9
