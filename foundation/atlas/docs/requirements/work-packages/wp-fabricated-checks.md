# Work Packages — HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card for a soundness fix dispatched by the lead against two defects Atlas mined
> out of its own source. Conforms loosely to [`method/wp-template.md`](../../method/wp-template.md) where
> the template fits an already-executed hotfix; the `exec` fields (`outputs` / `provenance` / `trace_ref`)
> are FILLED, not empty, because this WP is DONE, not S4-frozen for later dispatch. Pointers are relative
> to this file (`docs/requirements/work-packages/`).

---

### WP-FIX-6.KNOW — Atlas fabricated a verification field, and the door that should have rejected it never read one (#200)

epic: none (out-of-band hotfix, dispatched by the lead from two facts Atlas mined about its own source —
not carried by any CAMPAIGN)
id: WP-FIX-6.KNOW
title: `soundCheck` emitted an assertion never passed to `verify`, and `admit` switched on `kind` without
ever inspecting `expr`

intent: >
Two defects that the lead framed as composing into one. They are both real, and they do NOT compose the
way the brief said — see the framing section. Fixed separately, with the composition made true by
construction (a test that runs the producer's output through the consumer's door).

**(1) FABRICATION, `packages/genesis/src/admit-harness.ts:206,230` (pre-fix line numbers CONFIRMED).**
`admitPredicate`'s GEN-12k branch built its emitted node around
`soundCheck(slot) = {kind:'assertion', expr: \`type-checker/LSP diagnostics: ${slot}\`}`. That string was
  never passed to `PredicateApi.verify`and never subjected to`PredicateApi.teeth`— the two mechanisms the
  synthesized-check branch twelve lines below runs unconditionally — and the node shipped`status: 'HOLDS'`  plus the`machine-checked likely invariant`label on the strength of it. It is also unreadable by the
  evaluator that later re-runs it: the assertion grammar is`child-count|<key>|<n>`/`subtree-hash|<key>|
<hash>`over one`IndexNode`, and that string names no operator, so `evaluate`answers`NA` on every index
state, forever.

Fixed by REMOVING the check rather than improving it, and the choice is forced rather than stylistic:
REQ-GEN-12k wants the SOUND compiler oracle; KNOW-16's `Check` can express nothing but INDEX STATE; a
type-checker diagnostic is not index state; and `PredicateNode.check` is REQUIRED, not optional. So the
predicate family cannot honestly hold this fact, and substituting an expression that merely parses
(`exists|<the site>`) would be the same fabrication in a costume that also gets past the door. The branch
now emits an ADVISORY carrying `predicateSlot`, which has NO `status` field at all — `HOLDS` is not
unset here, it is UNREPRESENTABLE. `ABSENT means UNKNOWN, never a fabricated placeholder`.

**(2) BLIND ADMISSION, `packages/knowledge/src/lifecycle/evaluator.ts:62-76` (CONFIRMED).** `admit()`
switched on `kind` and returned any `{kind:'assertion', expr}` as evaluable whatever the `expr` said. It
now PARSES the body against the shipped five-operator grammar and refuses what does not parse, naming the
expected form and quoting what it read. The door and the interpreter were re-pointed at ONE split and ONE
operator table, so a stricter door cannot narrow the language by drifting from it.

The mined claim that "a malformed check is admitted and reaches the `reconcile` merge gate as a genuine
`BROKEN`" is TRUE, but not of the fabricated string, and it took measuring to find which inputs do it —
see the framing section. Two of them are now the anti-vacuity evidence for refusal (2).

## axioms (given — not re-litigated)

- **A1.** `Check` is exactly two legs. UNCHANGED — `packages/knowledge/src/types.ts` is not in the diff.
- **A2.** Five operators over ONE `IndexNode`. NOT EXTENDED — no operator added, no `IndexNode` field read
  that was not read before.
- **A3.** Fail-closed. An unparseable body is REFUSED at the door, never admitted and never downgraded.
- **A4.** CONFIRMED and SHARPENED against the shipped composition root — see the framing section: the
  ordinary mining path emits no check because `makeAdmitGate` proposes ADVISORIES ONLY, so `admitPredicate`
  is never entered at all, and `soundCheck` had ZERO production callers by two independent constructions.

source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-16a # ptr+digest — "a check MUST be a deterministic query over the Atlas index … evaluated mechanically to HOLDS/BROKEN/NA"; a body that names no operator is not one, and admitting it is what let a verdict nobody computed reach the merge gate
- source: ../req-gen.md#REQ-GEN-12k # ptr+digest — "for a type-expressible slot the check MUST prefer the type-checker / LSP diagnostics over a synthesized query"; the sound oracle still decides, it just no longer mints a `Check` it cannot express

seam-freezes: [ ] (no cross-module obligation created; the `Check` union and `EvaluatorApi` are untouched)

anchor:

- `packages/genesis/src/admit-harness.ts` — `admitPredicate` GEN-12k branch, `attest` (new), `buildSound`
  (new, replaces `soundCheck`), `buildPredicate` (signature narrowed to `VerifiedCheck`)
- `packages/knowledge/src/lifecycle/evaluator.ts` — `admit`, `whyUnparseable` (new), the shared
  `splitQuery` / `splitAssertion` / `QUERY_FORMS` / `ASSERTION_FORMS`

interface_contract: # free-form (unchecked, per repo convention)

- source: ../method-tags-knw.md#KNOW-16 (deterministic index-query, no code execution)
- source: ../method-tags-gen.md#GEN-12 (mechanical admission: HOLDS-and-flips-BROKEN; vacuous dropped)

exclusions:

- `packages/knowledge/src/ratify/**` — LIVE seat (`fix/failopen-and-mergebase`). Read-only.
- `packages/knowledge/src/write/**` — LIVE seat (`fix/dead-authz-and-slotgate`). Read-only. `router.ts`
  was READ (its `normalizeCheck` folds a check body into the predicate `nodeKey`) and not edited.
- `packages/tools/src/reconcile.ts`, `packages/adapter-io/src/git-drift.ts` — live seat. Read-only.
- `packages/adapter-io/src/governed-emit.ts` — NOT in the action surface. It is the SHIPPED write door
  and its `isCheck` validates the check's SHAPE only; the grammar leg belongs there too and is left as a
  named follow-up rather than smuggled in. See the framing section.
- Any new evaluator grammar / AST-predicate work (A2).

action: (single round) Defect 2 first — `admit` parses the body against the shipped grammar via a new
module-private `whyUnparseable`, with `Admission` widened by a third leg
(`{evaluable:false, reason:'malformed-check', expected}`) and `evalQuery` / `evalAssertion` re-pointed at
the shared `splitQuery` / `splitAssertion` so door and interpreter read one language; then defect 1 —
`soundCheck` DELETED, the GEN-12k branch emits `buildSound(...)` (an `AdvisoryNode` with
`predicateSlot`), the verify+teeth conjunction funnelled into a single `attest` that is the only
constructor of the new branded `VerifiedCheck`, and `buildPredicate` narrowed to accept nothing else.

action_surface: `[ read(**), edit(packages/genesis/src/admit-harness.ts),
  edit(packages/knowledge/src/lifecycle/evaluator.ts), edit(packages/genesis/test/**),
  edit(packages/knowledge/test/**), edit(docs/requirements/goldens-knw.md, new golden only),
  edit(docs/requirements/work-packages/wp-fabricated-checks.md, new file only),
  run(tsc -b), run(vitest run), run(node harness/gates/*.mjs) ]`

guardrails: writes confined to the two source files above, two NEW test files, the two `SCN-GEN-12k`
test tails (extra-golden assertions only — neither golden's TEXT is edited), one new golden, and this
card. Mutation used `cp`-backup / `cp`-restore with `diff -q`, never `git checkout` / `restore` /
`stash` / `reset`. COMMIT ONLY — no push, no PR, no merge.

## invariants (per-item — GATE)

- **I1.** An `assertion` whose `expr` does not parse is REFUSED, with the reason naming the expected form.
  RED-first: `packages/knowledge/test/evaluator.admit-grammar.test.ts` run against the UNFIXED source —
  5 failed | 2 passed (the 2 passing are the I3 pins, which must be green on both sides).
- **I2.** No node reaches the store with `status:'HOLDS'` on a check that was not evaluated. TWO
  enforcements, both proved firing: (a) STRUCTURAL — the sound-oracle branch emits an `AdvisoryNode`, which
  has no `status` field, so the claim is unrepresentable rather than merely unset; (b) TYPE — `attest` is
  the only constructor of `VerifiedCheck` and `buildPredicate` accepts nothing else. Mutant M5 (restore the
  fabrication without a cast) is KILLED by `tsc -b` exit 2, `error TS2345: Argument of type '{ kind:
"assertion"; expr: string; }' is not assignable to parameter of type 'VerifiedCheck'`.
- **I3.** The five shipped operators still parse and still evaluate identically — pinned by twelve
  operator/verdict pairs written and observed GREEN against the unfixed source before the door existed,
  plus a `|`-in-the-key case proving the door splits exactly as the interpreter does.
- **I4.** No change to `Check` and no new operator. `packages/knowledge/src/types.ts` is not in the diff.
- **I5.** Every touched file ≤400 LOC — largest is `admit-harness.ts` at 346; `godfile-guard` exit 0.
- **I6.** Six mutants run, five KILLED and one SURVIVOR reported rather than hidden (M4 — see below).

acceptance:

- source: ../goldens-knw.md#SCN-KNOW-16a-3 # ptr+digest — the new golden this WP adds and satisfies
  Proof of teeth (each: `cp`-backup → substitute → `occurrences === 1` ASSERTED → file proved changed by
  byte-length delta → suite run, exit code read directly → `cp`-restore proved byte-identical):
- **M1** assertion-text refusal removed → tsc 0, vitest **1** — 4 failed | 3 passed. KILLED.
- **M2** index-query refusal removed → tsc 0, vitest **1** — 1 failed | 6 passed. KILLED.
- **M3** fabrication restored, cast past the brand → tsc 0, vitest **1** — 4 failed, including BOTH
  `SCN-GEN-12k-1` and `SCN-GEN-12k-2`. KILLED.
- **M5** fabrication restored WITHOUT the cast → `tsc -b` exit **2**, TS2345. KILLED by the type.
- **M6** `attest`'s HOLDS conjunct removed → vitest **1** — SCN-GEN-12c-1/-2, 12d-1/-2. KILLED.
- **M7** `attest`'s teeth conjunct removed → vitest **1** — SCN-GEN-12b-1/-2, 12j-1/-2 and the e2e
  vacuous-predicate story. KILLED.
- **M4** the `VerifiedCheck` brand removed from `buildPredicate`'s signature ALONE → tsc 0, vitest 0,
  191 passed. **SURVIVED, and correctly so**: `VerifiedCheck` is assignable to `Check`, so widening the
  parameter changes no behaviour by itself. M4 is not a refusal; it is the precondition that makes M5 a
  compile error, and reporting it as a kill would be the overclaim this WP exists to remove.

deps: [ ] parallel_group: [P] (two files, no dependency on any concurrent seat)

exit_predicate: `npx tsc -b` clean ∧ full `npx vitest run` reconciled literally against the `origin/master`
baseline (326 files / 2608 passed + 1 todo → 328 files / 2619 passed + 1 todo; +2 files, +11 tests, 0
regressions) ∧ every gate in `harness/gates/` exit 0 read directly, by name.

context_refs: # closed list

- source: ../req-knw.md
- source: ../req-gen.md
- source: ../goldens-knw.md
- source: ../goldens-gen.md

owner: KNOWLEDGE + GENESIS territory · builder_id `charlie`

outputs:

- `packages/knowledge/src/lifecycle/evaluator.ts` — `admit` parses the body; `whyUnparseable`,
  `QUERY_FORMS` / `ASSERTION_FORMS`, `splitQuery` / `splitAssertion`, `COUNT` added; `evalQuery` /
  `evalAssertion` re-pointed at the shared splits; 266 LOC. Exported VALUE count UNCHANGED at 4, so the
  `reference-model-guard` ledger row for this module is untouched (see the framing section).
- `packages/genesis/src/admit-harness.ts` — `soundCheck` deleted; `buildSound` + `attest` +
  `VerifiedCheck` added; `buildPredicate` narrowed; 346 LOC.
- `packages/knowledge/test/evaluator.admit-grammar.test.ts` — new, 191 LOC (SCN-KNOW-16a-3).
- `packages/genesis/test/admit-harness.no-fabricated-check.test.ts` — new, 175 LOC, including the
  cross-package composition case.
- `packages/genesis/test/wp-8.28-b-gen.test.ts` / `.heldout.test.ts` — the two `SCN-GEN-12k` tails
  retargeted (extra-golden assertions only; both golden TEXTS unchanged).
- `docs/requirements/goldens-knw.md` — `SCN-KNOW-16a-3` added under the existing REQ-KNOW-16a.
- `docs/requirements/work-packages/wp-fabricated-checks.md` — this card.

provenance:

- branch `fix/fabricated-checks`, forked from `origin/master` at `a6b4a5a`
- worktree-local commit; this card does not self-report a sha it did not mint

trace_ref: manual — lead brief (two defects Atlas mined about its own source, framed as composing) → this
card + the changes under `outputs`; no automated S0–S4 trace exists for an out-of-band hotfix

rationale:

- source: ../req-knw.md#REQ-KNOW-16a

---

## What the lead's framing got wrong, and what it got right

**Got right.** Both line numbers (`admit-harness.ts:206,230`; `evaluator.ts:62-76`, and the grammar at
`98-129`) are exact on `a6b4a5a`. Both defects are real and both were verified against the shipped code
before either was touched, not taken from the mined text. `soundCheck`'s expression genuinely never reaches
`verify` or `teeth` and genuinely cannot be read by the evaluator. `admit` genuinely never looked at `expr`.
The instruction to do defect 2 first was right for a reason the brief did not give: parsing the body first
is what makes it _provable_ that the producer's remaining output is readable by the consumer, which is the
last test in the new genesis file.

**Wrong 1 — the two defects do not compose the way the brief says.** "A fabricated check enters as `HOLDS`;
when the evaluator really runs it, it can flip to `BROKEN` and block a merge" is false _of the fabricated
string_. `evalAssertion` splits on `|`, finds no operator, and returns `NA` — not `BROKEN` — on every index
state, forever. `NA` never reaches the merge gate as a break; via `bindStatus` it is a downgrade, which is
the fail-safe direction. The fabricated check is a permanent, silent nothing.

The BROKEN scenario is nonetheless real, and it belongs to inputs the brief did not name. Measured, and now
pinned as the anti-vacuity evidence for refusal (2): `child-count|<key>|` → `Number('')` is `0` → **HOLDS**
on any node that happens to have no children; `child-count|<key>|three` → `Number('three')` is `NaN` and
`n === NaN` is false → **BROKEN**, always, on any index state. Those two are verdicts nobody computed, and
the second is exactly the merge-blocking `BROKEN` the brief described — reached by a different door than the
one it pointed at. Both are now refused. (The first is why the count is `/^\d+$/` and not `Number(v) >= 0`:
the latter accepts `''`, `'2.5'`, `'0x2'` and `'1e3'`.)

**Wrong 2 — `soundCheck` has no production caller, and neither does `admit`.** A4 asked which arm fires
`soundCheck`. The answer is NONE, by two independent constructions, both of which are written down in the
tree already:

1. `makeAdmitGate` (`packages/cli/src/mine-gate.ts:69-88`) — the ONLY production caller of `admit` — builds
   `{kind:'advisory', …}` proposals exclusively, so `admitPredicate` is never entered.
2. `buildMineAdmission` (`packages/adapter-io/src/compose-mine-admission.ts:75`) — the ONLY production
   construction of `AdmitDeps` — pins `typeOracle.expressible: () => false`, so even if `admitPredicate`
   _were_ entered, the GEN-12k branch could not be taken. That file says so in its own header: "THE
   PREDICATE LEGS ARE STRUCTURALLY UNREACHABLE FROM THIS GATE".

And `packages/knowledge/src/lifecycle/evaluator.ts` is a **declared reference model** — it is row 189 of
the `reference-model-guard` LEDGER, `{values: 4, shipped: null}`, meaning all four of its value exports
(`admit`, `evaluate`, `makeEvaluator`, `verdictFor`) have zero production callers. Re-measured with the
gate's own analyser after this change: still 4, still zero. So **fix (2) hardens a specification artifact,
not the shipped path**, and this card says so rather than letting the next reviewer discover it. That is
legal and precedented — `attach.ts` and `write/archive.ts` carry the identical note from task #136 — but
it must not be sold as shipped hardening. Fix (1) _is_ on a module with a production caller
(`admit-harness.ts` → `mine-gate.ts`), but on a branch of it that production cannot reach today.

**Wrong 3 — `admit` is not the door the SHIPPED path would need, and the brief did not name the one that
is.** `atlas emit` validates a check at `packages/adapter-io/src/governed-emit.ts` (`isCheck` / `familyOf`,
refusal `malformed family`), and that door checks the check's SHAPE — `kind` present, body a string — and
nothing about its grammar. So `{kind:'assertion', expr:'type-checker/LSP diagnostics: contract'}` passes the
real write door today and still would after this change. Adding the grammar leg there is the follow-up that
actually closes this class on the shipped path; `governed-emit.ts` is outside this card's action surface, so
it is named here rather than smuggled in. **Refusing at the producer was the right call for defect 1** — the
fabrication was a bypass of two mechanisms that the sibling branch runs unconditionally, and deleting the
bypass is a fix at the only place that could ever have made the node truthful.

**Wrong 4 (minor) — `Check` is not "optional on `AdvisoryNode`".** The brief's parenthetical for the honest
-absence option said so; `AdvisoryNode` has no `check` member at all. The distinction mattered: it is why
the fix is a change of node FAMILY rather than dropping a field, and why `predicateSlot` had to be carried
across so the KNOW-15b identity leg and KNOW-4g grouping survive.

**Wrong 5 (minor) — the mined facts cannot be cited by index.** The brief cites "facts [130] and [144] of
the RUN2 corpus". In `RUN2/CONTAMINATED/staging.200.json` those indices carry claims about `cost-policy.ts`
and `reconcile.ts`, and many rows in that file have claim text visibly mismatched with their
`primaryAnchor` and truncated fragments concatenated together (`"…\nly emit a node asserting HOLDS that was
never checked.\nemit a node stamped HOLDS."`). The directory is named `CONTAMINATED` for a reason. The
substance the brief describes IS in the corpus — index 105, anchored at `packages/genesis/src/index.ts`,
states the malformed-check refusal cleanly — but the row numbers do not survive, so this card verified both
defects against the source and cites the source.
