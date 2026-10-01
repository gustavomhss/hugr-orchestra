# Work Packages — SECURITY HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card for a security fix that landed outside the S0–S4 decomposition machine —
> the defect was found in cold review of already-shipped code, not authored fresh from a requirement.
> Conforms loosely to [`method/wp-template.md`](../../method/wp-template.md) where the template fits an
> already-executed hotfix; the `exec` fields (`outputs`/`provenance`/`trace_ref`) are FILLED, not empty,
> because this WP is DONE, not S4-frozen for later dispatch. Pointers are relative to this file
> (`docs/requirements/work-packages/`).

---

### WP-SEC-1.KNOW — `isGrounded` fail-open→fail-closed (GROUND-2 coercion escape)

epic: none (out-of-band security hotfix, cold-review finding — not carried by any CAMPAIGN)
id: WP-SEC-1.KNOW
title: Fix `String()`-coercion fail-open in `knowledge/src/ratify/fastpath.ts` `isGrounded`

intent: >
`isGrounded` (KNOW-18a's grounded conjunct, gating `route`'s auto-accept at
`knowledge/src/ratify/fastpath.ts:126`/`:137`) coerced its input with `String(e.anchor.subtreeHash)`
before checking `.length > 0`. `String()` on a hostile value is fail-OPEN: `String(undefined)` →
`"undefined"`, `String(null)` → `"null"`, `String(0)` → `"0"`, `String(false)` → `"false"`,
`String({})` → `"[object Object]"` — every one of those non-empty strings PASSED the check. Since
`SubtreeHash`'s brand (`@atlas/contracts` `hash.ts:20`, `string & {brand}`) evaporates at runtime, and
every anchor reaching a write door may have come through `JSON.parse`, an SDK-parsed MCP argument, or a
CAS blob — none of which enforce the brand — a candidate whose anchor carried `undefined`/`null`/`0`/
`false`/`{}` as its "hash" read as GROUNDED and could auto-accept with NO human ratification. This
directly violates REQ-KNOW-2 ("ungrounded facts fail closed") and REQ-GROUND-2a/2b (the real-grounding
predicate this function transcribes) at the one call site where the violation has the highest cost: the
door that skips the human.

source_reqs: # ptr+digest — motivating requirements this fix restores compliance with

- source: ../req-knw.md#REQ-KNOW-2 # ptr+digest — "ungrounded facts fail closed"; already consumed by WP-5.13-b(campaign-4) elsewhere in the corpus, cited here as the requirement this defect violated
- source: ../req-grd.md#REQ-GROUND-2a # ptr+digest — "definition of a real grounding" (≥1 entry ∧ every entry non-empty); the predicate `isGrounded` transcribes
- source: ../req-grd.md#REQ-GROUND-2b # ptr+digest — "ungrounded is never FRESH"; the sibling fail-closed obligation

seam-freezes: [ ] (single-file fix, no cross-module obligation created)

anchor: `packages/knowledge/src/ratify/fastpath.ts:108-121` — the `isGrounded` function, first conjunct of
`route`'s auto-accept decision (`:126`, `:137`)

interface_contract: # free-form (unchecked, per repo convention — see id-integrity gate header)

- source: ../method-tags-knw.md#KNOW-18 (grounded ∧ low-risk ∧ T2 ∧ advisory ⇒ auto-accept)
- source: ../method-tags-grd.md#GROUND-2 (real-grounding predicate — SEALED reference `GroundApi['isGrounded']`, `@atlas/grounding` `src/drift.ts:73-74`)

exclusions:

- a redesign of `route`'s signature or of `RatifyContext` — both are FROZEN (owner-authorized brief); not
  touched, not reopened.
- value-importing `isGrounded` from `@atlas/grounding` into `packages/knowledge/src/**` — `knowledge`
  imports ONLY types from `@atlas/grounding` (five type-imports, zero value-imports, a uniform pattern);
  the local predicate is corrected IN PLACE instead.
- `packages/grounding/**` — out of scope for this WP (another seat is live in `grounding/src/freshness.ts`
  at time of writing); the SEALED `isGrounded` (`drift.ts:73-74`) is read-only reference, never edited here.
- `packages/adapter-io/**` — out of scope (three seats live there at time of writing).
- any other campaign's WP card — this is a deliberately NEW file so as not to collide with concurrent
  edits to `wp-campaign-*.md`.

action: replace the `String(e.anchor.subtreeHash).length > 0` coercion in `isGrounded` with
`typeof e.anchor.subtreeHash === 'string' && e.anchor.subtreeHash.length > 0`; add a fitness-function test
that drives BOTH the local `knowledge` predicate and the SEALED `@atlas/grounding` `GroundApi['isGrounded']`
over one shared coercion table and asserts agreement, so the two can never diverge silently again.

action_surface: `[ read(packages/knowledge/**), edit(packages/knowledge/src/ratify/fastpath.ts),
  edit(packages/knowledge/test/**, new file only), edit(docs/requirements/work-packages/wp-fix-isgrounded.md,
  new file only), run(test:knowledge), run(gates) ]`

guardrails: writes confined to `packages/knowledge/src/ratify/fastpath.ts` (in-place edit, no signature
change), one new test file under `packages/knowledge/test/`, and this card; `route`'s and `RatifyContext`'s
signatures byte-for-byte unchanged; no value-import added from `@atlas/grounding`; forbidden zones =
`packages/grounding/**`, `packages/adapter-io/**`, every other `work-packages/*.md`.

acceptance:
Not a docs/requirements SCN — this WP has no pre-authored golden in `goldens-knw.md`/`goldens-grd.md`
because the defect was found in cold review of shipped code, not decomposed fresh from S1. Acceptance is
a purpose-built regression/fitness test:
`packages/knowledge/test/fastpath-isgrounded-parity.test.ts` — 20 assertions: - a printed before/after coercion table (old `String()`-coerced vs new `typeof`-guarded vs the sealed
`@atlas/grounding` reference) over `{undefined, null, '', 0, false, {}, [], <valid hash string>}`; - the local (knowledge) and sealed (`@atlas/grounding`) predicates each driven `it.each` over that table; - an entries-empty `Grounding`, and a multi-entry `Grounding` with one bad entry (`.every`, never
`.some`, sinks the whole grounding) — both implementations; - a full-parity sweep asserting local ≡ sealed wherever the sealed impl does not itself throw (see the
PINNED FINDING below).
Proof of teeth: the fix was reverted to the exact pre-fix byte sequence (`cp` from a byte-verified backup,
`diff -q` confirming identical), the new test file was run and went RED (7/20 failing,
`expected true to be false` on every hostile-value row), then the fix was restored (`cp` from a
byte-verified backup of the FIXED file, `diff -q` confirming identical) and the suite went green again.

deps: [ ] parallel_group: [P] (single-file, no dependency on any concurrent seat's WP)

exit_predicate: `fastpath-isgrounded-parity.test.ts` green (20/20) ∧ full `npm test` green (no regression
in any other suite) ∧ `tsc -b` clean ∧ all six `harness/gates/*` exit 0.

context_refs: # closed list

- source: ../req-knw.md
- source: ../req-grd.md
- source: ../method-tags-knw.md
- source: ../method-tags-grd.md

owner: KNOW territory · builder_id `charlie` (dispatched by the lead for a frozen-contract security fix)

outputs:

- `packages/knowledge/src/ratify/fastpath.ts` — `isGrounded` body corrected (155 LOC total, +14/-3 net
  vs the pre-fix file; well under the 400-LOC cap)
- `packages/knowledge/test/fastpath-isgrounded-parity.test.ts` — new file, 172 LOC, the fitness function
  described under `acceptance` above

provenance:

- branch `fix/isgrounded-fail-open`, forked from `origin/master` at `38f3f4b1008266b127e7c33e4eeeb1d0d128950d`
- worktree-local commit (see the lead's own `git log` on the branch for the final sha — this WP does not
  self-report a commit sha it did not mint)

trace_ref: manual — cold-review brief (SECURITY fix, contract frozen by the lead) → this WP card + the two
file changes under `outputs`; no automated S0–S4 trace exists for an out-of-band hotfix

rationale:

- source: ../req-knw.md#REQ-KNOW-2
- source: ../req-grd.md#REQ-GROUND-2a

---

## A finding this WP pins rather than fixes (out of this WP's scope)

The SEALED reference `GroundApi['isGrounded']` (`@atlas/grounding` `src/drift.ts:73-74`, body
`g.entries.every((e) => e.anchor.subtreeHash.length > 0)`, no `typeof` guard) is safe against the fail-OPEN
bug this WP fixes — it never treats a non-string as grounded — but it is **not** safe against `undefined`/
`null` specifically: `(undefined).length` / `(null).length` **throw** a `TypeError`, even though
`GroundApi.isGrounded`'s own docstring (`@atlas/grounding` `types.ts:79-80`) states "Pure + total". The
fitness test in this WP observes and pins that throw (`SEALED_THROWS_ON` in the test file) rather than
papering over it, because `packages/grounding/**` is out of scope here (another seat is live in
`freshness.ts`). Net effect: the LOCAL fixed `isGrounded` in `knowledge` is now strictly SAFER than its own
sealed reference — it never throws on any input, fixed or hostile, while the sealed one does on two of the
eight coercion-table rows. Recommended follow-up (not actioned here): add the same `typeof` guard to
`@atlas/grounding` `src/drift.ts:73-74` under its own WP, once `freshness.ts` is no longer live.
