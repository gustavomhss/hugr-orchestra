# Work Packages — HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card for a soundness fix found in cold review of already-shipped code, not
> authored fresh from a requirement. Conforms loosely to
> [`method/wp-template.md`](../../method/wp-template.md) where the template fits an already-executed
> hotfix; the `exec` fields (`outputs`/`provenance`/`trace_ref`) are FILLED, not empty, because this WP
> is DONE, not S4-frozen for later dispatch. Pointers are relative to this file
> (`docs/requirements/work-packages/`).

---

### WP-FIX-1.GROUND — `closureInterfaceUnchanged` multiset unsoundness (GROUND-11a)

epic: none (out-of-band hotfix, cold-review finding — not carried by any CAMPAIGN)
id: WP-FIX-1.GROUND
title: Fix length-plus-membership comparison in `grounding/src/freshness.ts` `closureInterfaceUnchanged`

intent: >
`closureInterfaceUnchanged` (the GROUND-11b interface-fold arm of the GROUND-11 transitive freshness
fold, `packages/grounding/src/freshness.ts`) compared a fact's pinned forward closure against its
current one as LENGTH-EQUALITY plus PER-MEMBER MAP LOOKUP: `pinned.length === current.length`, then
"every pinned member's `node` resolves in a `Map` built from `current`". That is a multiset comparison
implemented as length-plus-membership, which is UNSOUND whenever a `node` (dependency-axis `Hash`)
repeats in the closure: pinned `[A, A]` vs current `[A, B]` has equal length (2), and BOTH of pinned's
`A` entries resolve against current's single `A` entry in the map — the loop never inspects `B` at
all, so the fold reports the closure interface-UNCHANGED (contributing to an overall `FRESH` verdict)
despite the membership having genuinely changed (a real `A` dependency dropped out, replaced by `B`).
This is the same class of defect as two prior findings pinned in this repo's memory (a freshness/drift
oracle that structurally cannot witness a real change) — see `reference-model-vs-shipped-path` and
`probe-the-binary-not-the-suite`. Fixed by replacing the length-plus-lookup comparison with a genuine
multiset equality: count occurrences of each `(node, interfaceRState)` pair on both sides and require
the counts to match exactly (order-independent, duplicate-sound). `bodySubtreeHash` remains
DELIBERATELY excluded from the comparison key (GROUND-11b/11d: a body-only refactor must not drift a
caller).

CONSTRUCTIBILITY (traced this WP, against `origin/master` `38f3f4b`): `freshness()` / `ClosureMember` /
`FreshnessSnapshot` have NO production caller anywhere in the tree. The only WIRED drift oracle is
`driftDetect` (`src/drift.ts`, WP-4.10-a.GROUND) — it folds ONLY the local grounding-set anchors and
never reads a `closure` at all (its own docstring: "NOT the GROUND-11 forward-closure interface fold —
owned by WP-4.10-b.GROUND"). `knowledge`'s `bindFreshness` (`packages/knowledge/src/lifecycle/
  freshness.ts`) delegates to `driftDetect`, not to this fold. `freshness.ts`'s own file-header states
"the barrel is wired by the lead at SEAL" — SEAL has not happened. So a duplicate-`node` pinned closure
is **not constructible through any shipped path today**. The fix is still correct and required
regardless: the function must be sound over its DECLARED domain (`readonly ClosureMember[]`, no
no-duplicates precondition stated anywhere in its contract), not merely over the inputs its one
existing (test-only) caller happens to send. This is not a live fail-open in a wired oracle; it is a
latent one in an unwired fold that a future SEAL would otherwise inherit silently.

source_reqs: # ptr+digest — motivating requirement this fix restores soundness for

- source: ../req-grd.md#REQ-GROUND-11a # ptr+digest — "freshness folds own hash and closure interface"; the closure-interface comparison this defect made unsound

seam-freezes: [ ] (single-file fix, no cross-module obligation created)

anchor: `packages/grounding/src/freshness.ts:64-76` — the `closureInterfaceUnchanged` function (GROUND-11b
interface-fold arm), consumed by `freshness()` at `:85-90`

interface_contract: # free-form (unchecked, per repo convention — see id-integrity gate header)

- source: ../method-tags-grd.md#GROUND-11 (transitive freshness fold — own hash + closure interface, never callee body)

exclusions:

- `packages/grounding/src/drift.ts` — the SIBLING local single-entry oracle (WP-4.10-a.GROUND); reads
  only the local grounding-set, never the closure; not touched.
- `packages/grounding/src/ground.ts` / `span.ts` / `subtree.ts` / `gate.ts` — out of scope for this WP
  (other seats live in adjacent modules at time of writing); read-only reference only.
- `packages/adapter-io/**`, `packages/knowledge/**`, `packages/genesis/**`, `packages/cli/**` — out of
  scope (five other seats live at time of writing); confirmed by trace to have NO caller of this fold,
  so no consumer-side change is needed or made.
- asserting or documenting that duplicate `node`s "cannot occur" as a substitute fix — that is
  precisely the unstated assumption that produced the original bug; the fix corrects the comparison
  itself instead.
- any other campaign's WP card — this is a deliberately NEW file so as not to collide with concurrent
  edits to `wp-campaign-*.md`.

action: replace the `pinned.length === current.length` + `Map<Hash, InterfaceRState>` per-member lookup in
`closureInterfaceUnchanged` with a genuine multiset equality over `(node, interfaceRState)` pairs
(count occurrences on both sides via a `Map<string, number>` keyed by `${node} ${interfaceRState}`,
decrement-and-check); add a fitness-function test proving the `[A,A]` vs `[A,B]` masking case reads
DRIFTED, the symmetric direction, and that genuinely identical closures — including legitimate
duplicates on both sides, in-order and reordered — still read FRESH.

action_surface: `[ read(packages/grounding/**), edit(packages/grounding/src/freshness.ts),
  edit(packages/grounding/test/**, new file only),
  edit(docs/requirements/work-packages/wp-fix-sameclosure.md, new file only), run(tsc -b), run(test),
  run(gates) ]`

guardrails: writes confined to `packages/grounding/src/freshness.ts` (in-place edit, no signature change
to `freshness`/`describeFreshness`/exported types), one new test file under `packages/grounding/test/`,
and this card; forbidden zones = `packages/grounding/src/drift.ts`, `ground.ts`, `span.ts`, `subtree.ts`,
`gate.ts`, everything outside `packages/grounding/**`, every other `work-packages/*.md`.

acceptance:
Not a docs/requirements SCN — this WP has no pre-authored golden in `goldens-grd.md` because the defect
was found in cold review of shipped code, not decomposed fresh from S1. Acceptance is a purpose-built
regression/fitness test: `packages/grounding/test/wp-4.10-b-grd.multiset.test.ts` — 4 tests: - THE TEETH: pinned `[A, A]` vs current `[A, B]` (same length, membership genuinely changed) ⇒
DRIFTED — fails on the pre-fix length-plus-lookup comparison (proven RED below), passes on the fix. - the symmetric direction: pinned `[A, B]` vs current `[A, A]` ⇒ DRIFTED. - NEGATIVE DIRECTION (must not regress): genuinely identical closures, including a legitimate
duplicate `node` on BOTH sides, same order AND reordered, read FRESH. - a same-node-multiset case where one of two duplicate members' `interfaceRState` changed ⇒ DRIFTED
(guards against a count-only fix that drops `interfaceRState` from the comparison key, which would
violate GROUND-11c).
Proof of teeth: `packages/grounding/src/freshness.ts` was backed up byte-level (`cp`), the new test run
against the UNMODIFIED file and observed RED (1/4 failing — `expected 'FRESH' to be 'DRIFTED'` on the
`[A,A]`/`[A,B]` case, exactly as the defect predicts; the other 3 cases already passed on the old code
by construction, see report), then the fix applied, `diff -q` confirming the file changed, and the full
suite (this file + the pre-existing `wp-4.10-b-grd.test.ts` + `.heldout.test.ts`) run green (17/17).

deps: [ ] parallel_group: [P] (single-file, no dependency on any concurrent seat's WP)

exit_predicate: `wp-4.10-b-grd.multiset.test.ts` green (4/4) ∧ full `npm test` green (no regression in
any other suite, 301/301 files) ∧ `tsc -b` clean ∧ all six `harness/gates/*` exit 0.

context_refs: # closed list

- source: ../req-grd.md
- source: ../method-tags-grd.md

owner: GROUND territory · builder_id `charlie` (dispatched by the lead for a frozen-contract soundness fix)

outputs:

- `packages/grounding/src/freshness.ts` — `closureInterfaceUnchanged` body corrected to a genuine
  multiset comparison (+`memberKey` helper); 124 LOC total, well under the 400-LOC cap
- `packages/grounding/test/wp-4.10-b-grd.multiset.test.ts` — new file, 111 LOC, the fitness function
  described under `acceptance` above

provenance:

- branch `fix/sameclosure-multiset`, forked from `origin/master` at
  `38f3f4b1008266b127e7c33e4eeeb1d0d128950d`
- worktree-local commit (see the lead's own `git log` on the branch for the final sha — this WP does
  not self-report a commit sha it did not mint)

trace_ref: manual — cold-review brief (soundness fix, contract frozen by the lead) → this WP card + the
two file changes under `outputs`; no automated S0–S4 trace exists for an out-of-band hotfix

rationale:

- source: ../req-grd.md#REQ-GROUND-11a

---

## A finding this WP surfaces rather than a defect it introduces (constructibility, out of severity scope)

As traced under `intent` above: as of `origin/master` `38f3f4b`, the GROUND-11 transitive closure fold
(`freshness()`/`ClosureMember`/`FreshnessSnapshot`) is exported from the package barrel
(`packages/grounding/src/index.ts`) but has **no production caller**. The wired drift oracle
(`DriftApi.driftDetect`, `src/drift.ts`) implements only the LOCAL grounding-set leg (GROUND-1/2/3/5); the
GROUND-11b forward-closure interface leg this WP fixes is a sibling facet (WP-4.10-b.GROUND) that no
caller currently reaches with real `Axes`/`Rollup`-derived data — only this file's own unit tests
construct `ClosureMember` values. **This fix is therefore not closing a live fail-open in a wired oracle
today.** It is correcting the function's declared contract ahead of the SEAL step that will eventually
wire it, so that whichever caller lands there first does not inherit a multiset-unsound comparison
silently. Recommended follow-up (not actioned here, out of this WP's scope): when `freshness()` is wired
into `driftDetect` or a successor at SEAL, confirm whether the upstream INDEX-12 `rState`/dependency-axis
compute can ever emit a forward closure with a repeated `node` (e.g., a callee reached via two distinct
call sites) — if so, this fix is load-bearing from the moment of wiring, not merely a contract-correctness
improvement.
