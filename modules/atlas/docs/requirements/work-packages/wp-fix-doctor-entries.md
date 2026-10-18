# Work Package — the doctor's drift classifier and repair span every grounding entry (amendment card, 2026-08-03)

> One card, standing alone because it amends a shipped seam rather than a campaign slice. Conforms to
> [`method/wp-template.md`](../../method/wp-template.md): every substantive field is a `ptr+digest`
> (digests are tooling-filled at freeze), `content_hash` is filled at freeze, the `exec` fields carry the
> run's outcome.

---

### WP-FIX-DOCTOR-ENTRIES — classification and repair range over the same set detection does

epic: EPIC-26-b
id: WP-FIX-DOCTOR-ENTRIES
content_hash: <filled-at-freeze>
title: The drift classifier was asymmetric — detection spanned every citation, classification and repair spanned entry zero
intent: >
`packages/adapter-io/src/doctor-source.ts` DETECTED drift over the whole grounding (`reDerives` →
`driftDetect`, a conjunction over every citation) and then CLASSIFIED and REPAIRED `entries[0]` alone. A fact
that drifted because a SECONDARY citation went stale therefore resolved its primary anchor at HEAD, read
`mechanical`, and emitted a "repair" that swapped the primary anchor to effectively where it already was —
stamped `freshness: 'FRESH'` by a template that had re-derived nothing. MEASURED on the fixture built for this
card, pre-fix: `class=mechanical  anchorWas=src/a-primary.ts  anchorNow=src/a-primary.ts` — a move from a path
to itself — with the stale citation untouched in the emitted candidate.

THE SEVERITY IS BOUNDED, AND THE BOUND IS MEASURED RATHER THAN ASSUMED. `governed-emit.ts` gate 1 re-derives
the WHOLE grounding through `buildGate` and refuses a non-HOLDS node (`REJECTED_UNGROUNDED`, nothing
persisted); it recomputes freshness from the index and never reads the node's own `freshness` field, so the
overstated stamp is inert at the door. Measured verdict on the pre-fix candidate: `NA` — refused. The live
defect was therefore a MISCLASSIFICATION plus a repair plan that could not land, NOT a false FRESH reaching
the projection. (Non-authoritative handle.)

AMENDED 2026-08-03, SCOPE WIDENED BY THE OWNER AFTER THE FIRST ROUND MEASURED IT. The same entry-0 question
was asked from a SECOND copy, inlined at the composition root and fed to `bindReconcile`. That copy is not
advisory: `atlas-reconcile` is a MERGE GATE (`exitCode = |semantic| > 0 ? 2 : 0`), and the copy carrying the
exit code was not the copy anyone was reading. MEASURED end to end through the shipped `composeRuntime`
handler, over a durable knowledge base holding a fact whose primary was renamed and whose SECONDARY citation
had been rewritten away: `semantic: []`, `exitCode: 0` — a clean merge over a dead citation. There is now
exactly ONE classification body (`isMechanicalAt`, doctor-source.ts); the composition root consumes it, and
the same run reports `semantic: ['mixed']`, `reauthorCount: 1`, `exitCode: 2`.

BLAST RADIUS — this is a merge gate moving, and it is not silent: a repository whose grounding is
MULTI-ENTRY and whose non-primary citation has ROTTED will begin FAILING `atlas reconcile` (exit 2,
re-author) where it used to pass. Single-entry groundings, and multi-entry groundings whose drifted
citations all re-derive somewhere, are UNCHANGED (exit 0) — pinned in both directions.
source_reqs: # ptr+digest

- source: ../requirements-adapters.md#REQ-ADAPTER-9c # ptr+digest
- source: ../requirements-adapters.md#REQ-ADAPTER-9d # ptr+digest
- source: ../requirements-adapters.md#REQ-ADAPTER-9e # ptr+digest
  seam-freezes: [ ]
  anchor: packages/adapter-io/src/doctor-source.ts — `isMechanicalAt` / `drift` / `plan` / `regroundTemplate`; packages/adapter-io/src/compose.ts — the `classifier.reconcile` binding
  interface_contract: # ptr+digest
- source: ../../reference/atlas-adapters.md#adapt-git-2 # ptr+digest
- source: ../method-tags-adapters.md#INV-ADAPTER-9 # ptr+digest
  exclusions: >
  `driftDetect` (@atlas/grounding) is NOT touched — detection was already total over the grounding and is the
  oracle the per-entry verdict DECOMPOSES (a single-entry restriction of the same call, which is sound because
  `driftDetect` is a conjunction over entries). The emit door is NOT touched: it was already right, and it is
  what bounds this defect. `DriftItem` is NOT widened — it carries one `anchorWas`/`anchorNow` pair
  (atlas-tools:24, frozen), so the item reports the first drifted entry's move while the repair covers all of
  them; making the classifier's output shape richer would be a contract change, not a fix. `retireTemplate` is
  unchanged (a retire tags `authoring: 'SUPERSEDED'` and asserts no freshness of its own).

THE COMPOSITION ROOT IS NOW IN SCOPE and its copy is DELETED rather than repaired — a second CORRECT copy is
still two copies, free to diverge again, and divergence is the defect. `primaryAnchor` is deleted with it: it
existed only to feed that inlined predicate, and an export with no production caller is exactly the reference
model this repo refuses. NOT this WP: splitting `compose.ts` (it stands at 328 of the 400-line cap after the
change — no split was needed and none was attempted).

NOT THIS WP, AND IT IS A REAL REMAINING GAP — THE THIRD INSTANCE OF THE SAME ASYMMETRY. `git-drift.ts`
`driftAt`, the DETECTOR that decides which facts reach the gate at all, reads `f.grounding.entries[0]` and
nothing else. MEASURED over the four fixture facts: only the two whose PRIMARY drifted are surfaced as pairs;
a fact whose primary is intact is never presented to the classifier, whatever became of its other citations.
So the end-to-end hole for a secondary-ONLY drift lives in DETECTION and is untouched by this card, while the
hole this card closes is the one for facts whose primary drifted AND whose secondary rotted — detected, and
previously waved through. Named and measured here, deliberately not repaired: widening the detector's reach
is a change to what `reconcile` reports on, and belongs to whoever sequences it.
inputs: # ptr+digest

- source: ../../reference/atlas-adapters.md#adapt-git-2 # ptr+digest
  action: >
  Classify over the entries that actually drifted (semantic iff ANY of them re-derives nowhere at the target
  rev — the fail-closed direction, because a re-ground that leaves one citation broken is a plan that cannot
  land); re-anchor every drifted entry in the reground candidate; derive `freshness` from whether the repair
  established every entry instead of stamping it; and make that classification ONE exported body, consumed by
  the doctor surface and by the composition root's `bindReconcile` binding alike.
  action_surface: [ read-repo, edit(packages/adapter-io/src/doctor-source.ts), edit(packages/adapter-io/src/compose.ts), edit(packages/adapter-io/test/**), run-tests(adapter-io), typecheck ]
  guardrails: >
  No edit to `sidecar.ts`, `git-history.ts`, `git-drift.ts`, `packages/grounding/**`, `packages/knowledge/**`,
  `packages/genesis/**`, `packages/cli/**`, or the `index.ts` barrel. Exactly ONE new export
  (`isMechanicalAt`), with a production caller by construction — it is the reason the export exists; one
  export DELETED (`primaryAnchor`, whose only caller was the copy this card removes). `regroundTemplate`'s
  second parameter becomes positional-per-entry, and its one call site is updated in the same package. No
  behaviour change on the primary-drift case, at either the doctor surface or the merge gate.
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-adapters.md#SCN-ADAPTER-9c-1 # ptr+digest
- source: ../goldens-adapters.md#SCN-ADAPTER-9d-1 # ptr+digest
- source: ../goldens-adapters.md#SCN-ADAPTER-9e-1 # ptr+digest
- source: ../goldens-adapters.md#SCN-ADAPTER-9e-2 # ptr+digest
  deps: [ ] parallel_group: [P] — single-file amendment, no in-flight predecessor
  exit_predicate: >
  all acceptance SCNs green ∧ the new teeth FAIL on the pre-fix source (proven by restoring it byte-for-byte and
  watching them go red) ∧ the primary-drift case is GREEN on both the pre-fix and the fixed source, at the
  doctor surface AND at the merge gate ∧ `tsc -b` clean ∧ full `npm test` green ∧ every `harness/gates/**` gate
  green
  context_refs: # closed list
- source: ../requirements-adapters.md
- source: ../goldens-adapters.md
- source: ../method-tags-adapters.md
  owner: adapter-io / doctor seat
  outputs: >
  packages/adapter-io/src/doctor-source.ts (277 LOC) — `restrictTo` (the single-entry restriction of the
  detection oracle), `driftedEntries` (every drifted entry + where its content lives at the rev),
  `classifyDrift` (the ONE semantic-first verdict) and its exported projection `isMechanicalAt`, per-entry
  repair, derived freshness.
  packages/adapter-io/src/compose.ts (328 LOC) — the inlined entry-0 predicate deleted; `classifier.reconcile`
  now binds the shared `isMechanicalAt`.
  packages/adapter-io/test/doctor-entry-symmetry.test.ts (NEW, 8 tests) — the two-citation demonstration, the
  rotted-secondary fail-closed case, the unchanged primary-drift case, the derived-freshness contract, and the
  emit-door measurement (the pre-fix candidate is transcribed verbatim in the test so the door's verdict on it
  is measured in the same run).
  packages/adapter-io/test/reconcile-entry-symmetry.test.ts (NEW, 3 tests) — the merge gate driven END TO END
  through the real `composeRuntime` handler (both directions), plus the `driftAt` reach measurement.
  provenance: >
  BEFORE (pre-fix source, restored byte-for-byte): sec-mech → class=mechanical was=src/a-primary.ts
  now=src/a-primary.ts, plan entries=[src/a-primary.ts, src/b-secondary.ts], freshness=FRESH, door=NA.
  sec-rot → class=mechanical, action=reground, door=NA. lead-mech → class=mechanical was=src/d-lead.ts
  now=src/y-lead-moved.ts, entries=[src/y-lead-moved.ts, src/e-stable.ts], door=HOLDS.
  AFTER: sec-mech → class=mechanical was=src/b-secondary.ts now=src/z-secondary-moved.ts,
  entries=[src/a-primary.ts, src/z-secondary-moved.ts], freshness=FRESH, door=HOLDS. sec-rot → class=semantic,
  action=retire, keyed on src/c-rotten.ts. lead-mech → IDENTICAL to the pre-fix line above.

THE MERGE GATE, driven end to end through the real `composeRuntime` handler at `mergeBase = A`:
BEFORE (the entry-0 copy at the composition root) — `exitCode 0`, `mechanical ['lead-mech','mixed']`,
`semantic []`, `reauthorCount 0`. AFTER (the shared classifier) — `exitCode 2`,
`mechanical ['lead-mech']`, `semantic ['mixed']`, `reauthorCount 1`.
CONTROL, the same repository minus the rotted-secondary fact: `exitCode 0`, `mechanical ['lead-mech']`,
`semantic []` — BEFORE and AFTER, byte-identical.
DETECTOR REACH (`driftAt`, unchanged by this card): of the four seeded facts, exactly `['lead-mech','mixed']`
are surfaced as pairs; `sec-mech` and `sec-rot` — whose primaries are intact — are surfaced not at all.
trace_ref: branch fix/doctor-entries-symmetry (worktree off master 38f3f4b)
rationale: # ptr

- source: ../invariant-register-adapters.md#INV-ADAPTER-9
