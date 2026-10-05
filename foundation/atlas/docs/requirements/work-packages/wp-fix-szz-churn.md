# WP-FIX-SZZ-CHURN — the SZZ leg is deleted, not merely bounded

Standalone defect-fix card (not part of a numbered campaign; frozen fields follow the campaign-9/10
card shape so it is checkable by the same gates, scoped to a targeted correction rather than a fresh
build). Owner: `packages/adapter-io/src/git-history.ts` frontier admission (ADAPT-GIT-1), already built
under WP-9.3.6-a.HISTORY — this card does not re-scope that WP, it corrects one admission leg inside it.

AMENDED (same defect, #181, second commit): the first pass retuned the leg to `szz >= HOTSPOT_MIN_SZZ = 2`
(symmetric to `HOTSPOT_MIN_CHURN`). Cold review then proved that threshold provably dead — see `action`
below — so the leg is DELETED, not retuned. This card records the final, shipped shape.

---

### WP-FIX-SZZ-CHURN — the SZZ leg is deleted: every threshold is either redundant with churn or a bypass

epic: EPIC-6-a
id: WP-FIX-SZZ-CHURN
content_hash: <filled-at-freeze>
title: `frontier()` drops the SZZ leg entirely — `churn >= HOTSPOT_MIN_CHURN || coupling >= COUPLING_MIN_SUPPORT`
intent: >
The GEN-11 personalization frontier (`packages/adapter-io/src/git-history.ts` `frontier()`) admitted a
file via THREE legs — churn, SZZ, coupling. The SZZ leg admitted on `szz.get(f) >= 1`: a SINGLE
`fix:`-subject commit touching a file, short-circuiting `HOTSPOT_MIN_CHURN = 2` entirely. In a
conventional-commits repo this collapsed the frontier toward "every file ever touched by a `fix:`
commit" — reinstating the file-count-proportional LLM spend REQ-GEN-3a/3b forbid (`frontierBudget` IS
the ranked-site count, genesis/rank.ts:370). A first pass retuned the bar to `szz >= HOTSPOT_MIN_SZZ = 2`,
symmetric to `HOTSPOT_MIN_CHURN`. That was then PROVEN wrong, not merely suboptimal: the single-pass walk
bumps `churn` unconditionally per touching commit and `szz` only inside that SAME commit's `isFix`
branch, so `szz(f) <= churn(f)` holds for every file by construction — a `szz >= T` leg is REDUNDANT for
any `T >= HOTSPOT_MIN_CHURN` (churn already admits whatever it would) and a BYPASS of the recurrence bar
for any `T < HOTSPOT_MIN_CHURN` (the original defect). There is no threshold that adds a file churn
wouldn't. The leg is deleted; `signals().szzBugCommits` (a per-site SIGNAL, not a frontier admission
gate) is unchanged. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../req-gen.md#REQ-GEN-3a # ptr+digest
- source: ../req-gen.md#REQ-GEN-3b # ptr+digest
- source: ../requirements-adapters.md#REQ-ADAPTER-8a # ptr+digest
  seam-freezes: [ ]
  anchor: packages/adapter-io/src/git-history.ts — frontier() (no SZZ leg) + signals().szzBugCommits (→ HistorySource, ADAPT-GIT-1)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-adapters.md#adapt-git-1 # ptr+digest
- source: ../method-tags-adapters.md#INV-ADAPTER-8 # ptr+digest
  exclusions: >
  No change to `HOTSPOT_MIN_CHURN` or `COUPLING_MIN_SUPPORT`. No change to `signals().szzBugCommits` or
  `FIX_SUBJECT` (still counts every `fix:`-subject commit touching a site — an unbounded per-site SIGNAL,
  never a frontier ADMISSION gate; those are deliberately different questions, and remain so). No
  reintroduction of an SZZ frontier term at any threshold — the arithmetic proof in `git-history.ts` shows
  none can do anything a churn-only bar doesn't already do. No attempt to build REAL (blame-based,
  bug-introducing-commit) SZZ here — named as a capability gap, not implemented. Does not touch
  `sidecar.ts`, `doctor-source.ts`, or any package outside `adapter-io`.
  inputs: # ptr+digest
- source: ../../reference/atlas-adapters.md#adapt-git-1 # ptr+digest
  action: >
  Delete the SZZ disjunct from `frontier()`'s `inFrontier` predicate and delete the (by-then-dead)
  `HOTSPOT_MIN_SZZ` constant with it; delete the now-unused `szz` Map and `isFix` branch from the
  single-pass walk. Replace the deleted constant's comment with the arithmetic proof (`szz(f) <= churn(f)`
  by construction ⇒ every threshold is redundant-or-bypass) AND the honest scope note (this was never real
  SZZ — message-matching a file's own commits can only ever describe a churn subset of THAT file, never
  the blame-derived, largely-disjoint set real Śliwerski–Zimmermann–Zeller selects). Verify EMPIRICALLY,
  not just algebraically: the admitted frontier at `szz >= HOTSPOT_MIN_SZZ` must be byte-identical (full
  sorted member list, not just count) to the frontier after deletion, on both a real repo (Atlas itself)
  and a synthetic conventional-commits fixture. Extend the regression suite
  (`test/git-history-frontier-szz.test.ts`) with a case pinning the property directly (a churn=1 file whose
  one commit is a `fix:` is excluded, alongside a churn=2 control admitted) and re-verify red against the
  original pre-#181 (`szz >= 1`) source.
  action_surface: [ read-repo, edit(packages/adapter-io/src/git-history.ts), edit(packages/adapter-io/test/git-history-frontier-szz.test.ts), run(test:adapter-io), typecheck ]
  guardrails: >
  Edit only `packages/adapter-io/src/git-history.ts` and `packages/adapter-io/test/**` (new files only —
  the shared `git-sbx`/`fix-repo` harnesses are FROZEN fixtures other WPs consume and are not redefined
  here). No dead code shipped — the exact defect class this repo spends effort deleting elsewhere (dead
  exports, reference models, unread guidance constants). Do not touch other modules/core.
  repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
  acceptance: # ptr+digest = frozen goldens (pre-existing, still hold)
- source: ../goldens-adapters.md#SCN-ADAPTER-8a-1 # ptr+digest — signals still equal real-git oracle
- source: ../goldens-adapters.md#SCN-ADAPTER-8b-1 # ptr+digest — frontier still byte-identical across runs
- source: ../goldens-adapters.md#SCN-ADAPTER-8c-1 # ptr+digest — still mints no fact

# New regression coverage (not a frozen golden — a defect-closing suite):

# packages/adapter-io/test/git-history-frontier-szz.test.ts — pins the admitted frontier over a fixture

# with a known 1-fix file (excluded) and a known 2-fix file (admitted), plus a direct property pin

# (churn=1 + fix: subject ⇒ excluded, churn=2 control ⇒ admitted); fails against the pre-#181 source.

deps: [ ] parallel_group: [P] — targeted correction inside an already-built WP, no in-campaign predecessor
exit_predicate: >
all acceptance SCNs green ∧ new regression suite green against the final source AND red against the
original pre-#181 predicate ∧ pre-deletion (`szz >= HOTSPOT_MIN_SZZ`) and post-deletion frontiers are
byte-identical (full member list) on Atlas itself and a synthetic conventional-commits repo ∧ full
adapter-io suite green (no regression) ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs: # closed list

- source: ../../reference/atlas-adapters.md
- source: ../requirements-adapters.md
- source: ../goldens-adapters.md
- source: ../method-tags-adapters.md
- source: ../req-gen.md
  owner: charlie · builder_id: <assigned-at-dispatch>
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register-adapters.md#INV-ADAPTER-8
