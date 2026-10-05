# Work Packages — SECURITY/CORRECTNESS HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card reversing a prior out-of-band hotfix, not authored fresh from a requirement.
> Conforms loosely to [`method/wp-template.md`](../../method/wp-template.md) where the template fits an
> already-executed hotfix; the `exec` fields (`outputs`/`provenance`/`trace_ref`) are FILLED, not empty,
> because this WP is DONE. Pointers are relative to this file (`docs/requirements/work-packages/`). Sibling
> of `wp-fix-enforce-owner.md` (same series, `WP-SEC-*.KNOW`) — this card REVERSES that one.

---

### WP-SEC-3.KNOW — `owner` removed from KNOW-11a; reverts the `authz()` owner leg added by #178/PR#105

epic: none (out-of-band correctness/spec hotfix, owner-ratified — not carried by any CAMPAIGN)
id: WP-SEC-3.KNOW
title: Amend REQ-KNOW-11a to drop `owner`; revert the `isOwner`/`authz()` write-branch fold-in from PR#105;
delete the `owner` field from `GroundedFact`

intent: >
#178/PR#105 (`fix(knowledge): enforce KNOW-11a owner fence in authz() write branch`, master `44026ae`)
folded an `isOwner(fact.owner)` leg into `authz()`'s write branch, closing a real gap AGAINST THE
REQUIREMENT AS WRITTEN ("every fact MUST carry an `owner` + `scope`"). That WP's own "Measurement" and
"What the framing got wrong" sections (kept, not deleted — see `wp-fix-enforce-owner.md`, banner added by
this WP) reported two facts back to the tech lead rather than acting on them: (1) nothing supplies `owner`
on ANY shipped write path — `atlas emit`/`atlas mine` both stamp `scope`, never `owner`, measured on the
BUILT binary against a real fixture + real `policy.json` + an authorized actor; (2) `authz()`/`inScope` —
the exact function #178 targeted — have ZERO production callers; the live write door
(`adapter-io/src/governed-emit.ts`, gate "2. AUTHZ") gates through a separate `actorInScope`
reimplementation in `adapter-io/src/policy.ts`, keyed on `scope` alone, tracked as #186. Owner-ratified
2026-08-03: `owner` is REMOVED from KNOW-11a's MUST. `scope` stands as the SOLE ownership anchor.
Producer identity is already carried on every claim by `provenance.source` (`ClaimProvenance`, KNOW-14,
MUST-required) — `owner` was a second, optional, unpopulated answer to a question the contract already
answers, and was never a gate input (`inScope(actor, fact.scope)` is keyed on `scope`, never `owner`).
This is NOT the "loosening a ratified requirement to match the code" move the tech lead forbade earlier
the same day: that rule protects requirements expressing a SAFETY PROPERTY. `scope` is one — it decides
whether a write passes, untouched here. `owner` was a LABEL, not a control.

source_reqs: # ptr+digest — motivating requirements this amendment targets

- source: ../req-knw.md#REQ-KNOW-11a # ptr+digest — AMENDED by this WP: "every fact carries a scope" (owner dropped)
- source: ../req-knw.md#REQ-KNOW-11b # ptr+digest — "read is universal"; untouched
- source: ../req-knw.md#REQ-KNOW-11c # ptr+digest — "out-of-scope write rejected"; untouched, re-proven

seam-freezes: [ ] (single-facet revert inside `packages/knowledge/src/write/` + its frozen type; no
cross-module obligation created — `adapter-io/**` is untouched, see exclusions)

anchor: `packages/knowledge/src/write/authz.ts` (the `isOwner` guard removed, `authz()`'s write branch
reverted to `inScope(actor, fact.scope)` alone), `packages/knowledge/src/write/template.ts` (comment-only
repair), `packages/knowledge/src/types.ts:112-130,147-161` (the `owner?: string` field deleted from both
`AdvisoryNode` and `PredicateNode`)

interface_contract: # free-form (unchecked, per repo convention — see id-integrity gate header)

- source: ../method-tags-knw.md#INV-KNOW-11 (scope-owned write, universal read — AMENDED)

exclusions (all FROZEN by the dispatching brief, not re-decided here):

- `inScope(actor, scope)` — FROZEN scope-only signature; untouched by #178 and untouched again here.
- `packages/adapter-io/**` — the live write door (`governed-emit.ts` gate "2. AUTHZ", `policy.ts`
  `actorInScope`) never read `owner` before #178, was never touched by #178, and is not touched here;
  #186 (its own tracked item) is out of this WP's scope.
- `packages/cli/**` — `atlas emit`/`atlas mine` already never stamped `owner`; unaffected, unedited.
- `docs/requirements/goldens-knw.md` §"Enumerated universe B" / `template.ts`'s `RequiredAdvisoryField`
  (the KNOW-10 template-required-fields list, which ALSO names `owner` as one of "7" fields) — a
  SEPARATE, pre-existing, already-[FLAG]-noted gap (that list was never actually checked at runtime by
  `hasRequiredFields()`, which only checks {claimText, claimNorm, provenance, grounding}). Adjacent to
  this amendment, not caused by it, and out of the KNOW-11 family this WP owns — left untouched and
  reported below rather than silently fixed.

action: (1) amend `req-knw.md#REQ-KNOW-11a` (drop `owner`, `AMENDED 2026-08-03` marker + reasoning) and fan
the amendment out — per `spec-conformance-guard`'s AMENDMENT-FAN-OUT check — to every other canonical
restatement of the `KNOW-11` family: `goldens-knw.md` (SCN-KNOW-11a-1/-2 text corrected: "carries a
scope", owner assertion dropped), `method-tags-knw.md` (INV-KNOW-11 up-property corrected), `properties-
  knw.md` (PROP-KNOW-11 law/arbitrary corrected), `invariant-register.md` (KNOW-11 row title + verdict
amended); (2) revert `authz.ts`: delete `isOwner`, revert `authz()`'s write branch to
`inScope(actor, fact.scope)`, rewrite the header/interface comments to describe the CURRENT (scope-only)
fence and to narrate the #178→#187 history rather than pretend #178 never happened; (3) rewrite
`template.ts`'s comment (rule 3 of the dispatching brief) to say the fence is `scope` alone via `inScope`,
and that producer identity lives in `provenance.source`; (4) delete `wp-fix-enforce-owner.test.ts` (the
test that pinned the reverted `isOwner`/owner-leg) and correct `wp-5.14-know.lifecycle.test.ts`'s
SCN-KNOW-11a-1 implementation (drop the `owner` fixture leg + the `expect(fact.owner).toBeDefined()`
assertion — the exact scenario text change in (1) applied to its code twin) and
`packages/e2e/test/s05-write-governance.e2e.test.ts`'s fixture (drop `owner`); adapt
`packages/adapter-io/test/compose.test.ts`'s spoof-guard golden (SCN-CR-F3-git) to attach `owner` as an
explicit FOREIGN property via a cast, since it is no longer a declared field — the teeth get STRONGER
(the gate must ignore a property the schema does not even name), not weaker; (5) grep the whole repo
(source, tests, `dist/`) for reads of `fact.owner` — measured, not assumed — confirm the ONLY reads were
the two just removed, then delete `owner?: string` from `AdvisoryNode`/`PredicateNode` in `types.ts`;
(6) add a NEW test file, `wp-owner-not-required.test.ts`, re-pinning the `isScope` coercion table and the
scope-fence proofs so scope coverage does not shrink because the owner half left; (7) add a banner atop
`wp-fix-enforce-owner.md` (kept, not deleted) narrating the reversal and pointing here.

action_surface: `[ read(packages/knowledge/**), read(packages/adapter-io/**), read(packages/e2e/**),
  edit(packages/knowledge/src/write/authz.ts), edit(packages/knowledge/src/write/template.ts),
  edit(packages/knowledge/src/types.ts), edit(packages/knowledge/test/wp-5.14-know.lifecycle.test.ts),
  edit(packages/knowledge/test/**, new file only), delete(packages/knowledge/test/wp-fix-enforce-owner.test.ts),
  edit(packages/e2e/test/s05-write-governance.e2e.test.ts), edit(packages/adapter-io/test/compose.test.ts),
  edit(docs/requirements/req-knw.md), edit(docs/requirements/goldens-knw.md),
  edit(docs/requirements/method-tags-knw.md), edit(docs/requirements/properties-knw.md),
  edit(docs/requirements/invariant-register.md), edit(docs/requirements/work-packages/wp-fix-enforce-owner.md),
  edit(docs/reference/atlas-knowledge.md), edit(docs/requirements/work-packages/wp-owner-not-required.md, new file only),
  run(vitest run), run(tsc -b), run(gates) ]`

guardrails: writes confined to the KNOW-11 family across `docs/requirements/*-knw.md` +
`invariant-register.md` + `docs/reference/atlas-knowledge.md` (the KNOW-11 row only), the exact files this
WP names above; `inScope`'s byte-for-byte signature unchanged; no other requirement family touched; no
`work-packages/*.md` other than the two named; no requirement id deleted (only amended) — verified by
`id-integrity` staying green with no new orphan.

acceptance:
Golden coverage — SCN-KNOW-11a-1/-2 CORRECTED (not invented): both dropped their "carries owner" clause,
both marked `AMENDED 2026-08-03`, both still assert "carries a scope" and the fail-closed teeth. SCN-KNOW-
11b-1/-2 (universal read) and SCN-KNOW-11c-1/-2 (out-of-scope write rejected) are UNCHANGED and re-proven
by both the pre-existing suite (`wp-5.14-know.lifecycle.test.ts`, `s05-write-governance.e2e.test.ts`,
`packages/e2e-blackbox/test/s2-guardrails.blackbox.test.ts` SCN-S2b) and the new file below.
Purpose-built regression/fitness test: `packages/knowledge/test/wp-owner-not-required.test.ts` — - a printed coercion table for `isScope` (re-run, unchanged, pinned as tightly as `isOwner`'s was) over
`{undefined, null, '', 0, false, {}, [], ['core'], {toString:()=>'core'}, <valid string>}`; - a write with a well-formed scope by an in-scope actor SUCCEEDS; - a write with an ABSENT scope is REFUSED (fail-closed, `isScope`'s path untouched); - a write with a MALFORMED (empty-string) scope is REFUSED; - a write by an OUT-OF-SCOPE actor is REFUSED even though the fact is well-formed; - READ IS UNIVERSAL: a read of a scope-less fact succeeds for any actor, including `''`, and a scoped
fact reads the same for a caller outside its scope.
Proof of the revert: `authz.ts`/`types.ts` no longer define `isOwner` or an `owner` field anywhere in the
repo (grepped source + tests + `dist/`, post-build); `npx tsc -b` exits 0 with the field gone (excess-
property surfaces would have failed the build had any construction site relied on it structurally); full
`npx vitest run` green with the exact same test-count discipline the reverted WP itself required.

deps: [ ] parallel_group: [P] (single-facet revert, no dependency on any concurrent seat's WP)

exit_predicate: `npx tsc -b` exit 0 ∧ full `npx vitest run` green (306 files / 2405 passed + 1 pre-existing
todo, 0 failures) ∧ all six named `harness/gates/*` exit 0 (godfile-guard, layer-guard,
reference-model-guard, spec-conformance-guard, id-integrity, command-doc-guard) ∧ every source file
touched ≤400 LOC.

context_refs: # closed list

- source: ../req-knw.md
- source: ../method-tags-knw.md
- source: ../goldens-knw.md
- source: ../properties-knw.md
- source: ../invariant-register.md
- source: ./wp-fix-enforce-owner.md

owner: KNOW territory · builder_id `charlie` (dispatched by the lead for an owner-ratified spec amendment, #187)

outputs:

- `docs/requirements/req-knw.md` — REQ-KNOW-11a amended (owner dropped, `AMENDED 2026-08-03` + reasoning)
- `docs/requirements/goldens-knw.md` — SCN-KNOW-11a-1/-2 corrected + marked AMENDED
- `docs/requirements/method-tags-knw.md` — INV-KNOW-11 up-property corrected + marked AMENDED
- `docs/requirements/properties-knw.md` — PROP-KNOW-11 law/arbitrary corrected + marked AMENDED
- `docs/requirements/invariant-register.md` — KNOW-11 row title + verdict amended
- `docs/reference/atlas-knowledge.md` — KNOW-11 row corrected (mirrors the KNOW-3 amendment pattern)
- `packages/knowledge/src/write/authz.ts` — `isOwner` removed, `authz()` write branch reverted to
  `inScope(actor, fact.scope)`; comments rewritten (98 LOC, well under the 400-LOC cap)
- `packages/knowledge/src/write/template.ts` — comment-only repair (117 LOC)
- `packages/knowledge/src/types.ts` — `owner?: string` deleted from `AdvisoryNode`/`PredicateNode`
- `packages/knowledge/test/wp-fix-enforce-owner.test.ts` — DELETED (the test that pinned the reverted code)
- `packages/knowledge/test/wp-5.14-know.lifecycle.test.ts` — `owner` fixture leg + assertion dropped
- `packages/e2e/test/s05-write-governance.e2e.test.ts` — `owner` fixture leg dropped
- `packages/adapter-io/test/compose.test.ts` — spoof-guard fixture adapted to attach `owner` as an
  explicit foreign property (cast), not a declared field
- `packages/knowledge/test/wp-owner-not-required.test.ts` — new file, the fitness function above
- `docs/requirements/work-packages/wp-fix-enforce-owner.md` — REVERTED banner added, body kept verbatim

provenance:

- branch `spec/owner-not-required`, forked from `origin/master` at `44026ae`
- worktree-local commit (see the lead's own `git log` on the branch for the final sha — this WP does not
  self-report a commit sha it did not mint)

trace_ref: manual — dispatching brief (owner-ratified 2026-08-03, "spec/owner-not-required") → this WP card

- the file changes under `outputs`; no automated S0–S4 trace exists for an out-of-band spec amendment

rationale:

- source: ../req-knw.md#REQ-KNOW-11a
- source: ../goldens-knw.md (SCN-KNOW-11a-1)
- source: ./wp-fix-enforce-owner.md (the reverted WP, kept as historical record)

---

## Rule-4 measurement (owner field: keep or delete?) — reported, mechanical

Grepped the whole repo — `packages/**/src`, `packages/**/test`, and (post-`tsc -b`) `packages/**/dist` — for
every `.owner` / `fact.owner` token, then hand-classified each hit against `GroundedFact` (the only type
this rule concerns) versus every unrelated `owner` field in the corpus: `TerritoryView.owner` /
`TerritorySeed.owner` (`packages/knowledge/src/types.ts`, `ratify/init.ts`) — territory ownership, a
different type entirely; `MemoryEntry.owner` (`packages/memory/src/inject.ts`, `respawn.ts` and their
tests) — per-seat memory scoping, a different substrate (Memory, not Knowledge); `policy.anchors`'
prefix→owner map (`packages/adapter-io/src/policy.ts`) — which SCOPE owns an anchor prefix, not a fact
field; `pack.shape.owner` (`packages/cli/src/own.ts`, `packages/retrieval/src/own.ts`) — the Territory
projection again.

The ONLY reads of `GroundedFact.owner` anywhere in the repo were: (1) `authz.ts`'s `isOwner(fact.owner)`,
the exact leg #178/PR#105 added and this WP reverts; (2) the assertion inside `wp-fix-enforce-owner.test.ts`
pinning it (deleted with the file); (3) `expect(fact.owner).toBeDefined()` inside
`wp-5.14-know.lifecycle.test.ts`'s SCN-KNOW-11a-1 implementation — a PRE-EXISTING (pre-#178) golden-scenario
transcription that itself asserted the pre-amendment "carries owner + scope" text, corrected here in lock
step with the golden's own text correction (not a silent deletion — the golden changed, so did its code
twin). Two further sites WRITE (never read) an `owner:` property into an `AdvisoryNode`/`PredicateNode`
literal without ever asserting on it — `s05-write-governance.e2e.test.ts`'s fixture and
`compose.test.ts`'s `groundedFact` spoof-guard helper — neither counts as a "read" and both are corrected
above (the field is dropped from the former since it added no signal; kept in the latter as an explicit
non-schema foreign property, because that test's entire POINT is that the gate ignores it, which is a
STRONGER claim once `owner` isn't even a declared field).

**Branch taken: "nothing reads it ⇒ delete the field."** All three reads above are gone once this WP lands
(two removed outright, one corrected to no longer assert on a field that no longer exists), so the field is
deleted from `types.ts` rather than kept-but-unused. No third shape was found — the `TerritoryView`/
`MemoryEntry`/`policy.anchors` hits are all genuinely distinct fields on distinct types, not aliases or
re-exports of `GroundedFact.owner`, confirmed by reading each file's own type declaration, not by name
matching alone.

## What the tech lead's framing got wrong, with the measurement that says so

Nothing in the dispatching brief was wrong on the facts it stated — the brief's own "THE DECISION AND HOW
IT WAS REACHED" section already correctly reports the two measurements (`owner` unsupplied on every shipped
path; `authz()` uncalled in production) that motivate this WP, because those measurements were made by the
PRIOR seat (`wp-fix-enforce-owner.md`) and handed up before this brief was written. What this WP's OWN
measurement adds, not previously stated: the `owner`-carrying test fixtures that write but never assert on
`owner` (`s05-write-governance.e2e.test.ts`, `compose.test.ts`) were not enumerated in the brief's rule-4
search guidance ("search for any READ") — a naive grep for the bare token `owner` inside those two files
would have over-counted them as reads requiring the "keep the field" branch. Distinguishing WRITE-only
fixture noise from actual `expect(...)`/assertion reads was necessary to reach the correct branch, and is
the one piece of due diligence this WP had to do beyond what the brief's phrasing alone would mechanically
produce.

## Adjacent, pre-existing, NOT touched (reported per the exclusions above)

`docs/requirements/goldens-knw.md` §"Enumerated universe B" and `template.ts`'s `RequiredAdvisoryField` type
still list `owner` as one of the "7" KNOW-10 template-required fields for an advisory fact — a SEPARATE
family (KNOW-10, not KNOW-11) that was never actually enforced at runtime even before this WP
(`hasRequiredFields()` only ever checked `{claimText, claimNorm, provenance, grounding}`, a gap the
existing `template.ts` BIND note already flags). This WP does not touch it: it is a KNOW-10 concern, this
WP owns only the KNOW-11 family, and the dispatching brief's frozen decisions name KNOW-11a specifically.
Flagged for the tech lead's own backlog, not fixed here.
