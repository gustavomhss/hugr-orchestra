> ⚠️ **REVERTED 2026-08-03 by WP-OWNER-NOT-REQUIRED (#187, owner-ratified).** The code change this card
> describes (`isOwner` folded into `authz()`'s write branch) landed as PR#105 (master `44026ae`) and was
> REVERTED, not merely superseded — `packages/knowledge/src/write/authz.ts` no longer defines `isOwner` or
> checks `fact.owner`, and `packages/knowledge/src/types.ts` no longer declares an `owner` field on
> `GroundedFact` at all. The "Measurement" and "What the framing got wrong" sections below are KEPT verbatim
> because they are exactly the evidence that produced the reversal: nothing supplies `owner` on any shipped
> write path, and `authz()`/`inScope` have zero production callers of their own (the live door gates via a
> separate `actorInScope`, `adapter-io/src/policy.ts`). See
> [`wp-owner-not-required.md`](./wp-owner-not-required.md) for the reversal itself, and
> [`req-knw.md#REQ-KNOW-11a`](../req-knw.md#REQ-KNOW-11a) for the amended requirement. This file is kept, not
> deleted, as the historical record — the decision documented here was correct GIVEN what was known at cold
> review; it changed only after this WP's own measurement was read further downstream.

# Work Packages — SECURITY/CORRECTNESS HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card for a defect found in adversarial cold review, not authored fresh from a
> requirement. Conforms loosely to [`method/wp-template.md`](../../method/wp-template.md) where the
> template fits an already-executed hotfix; the `exec` fields (`outputs`/`provenance`/`trace_ref`) are
> FILLED, not empty, because this WP is DONE, not S4-frozen for later dispatch. Pointers are relative to
> this file (`docs/requirements/work-packages/`). Mirrors the shape of the sibling out-of-band card
> `wp-fix-isgrounded.md` (same wave, same convention).

---

### WP-SEC-2.KNOW — `owner` fence added to the `authz()` write branch (#178 KNOW-11a false-comment defect)

epic: none (out-of-band correctness hotfix, cold-review finding — not carried by any CAMPAIGN)
id: WP-SEC-2.KNOW
title: Fold an `isOwner` guard into `packages/knowledge/src/write/authz.ts`'s `authz()` write branch

intent: >
REQ-KNOW-11a requires every fact to carry `owner` + `scope`. `scope` was genuinely enforced
(`isScope`/`inScope`, fail-closed on absent/malformed scope). `owner` was enforced by NOTHING, and two
files each pointed at the other as the enforcer: `template.ts:12-13` said owner/scope were "enforced
fail-closed by the sibling authz facet, NOT re-checked here"; `authz.ts:11-13` said `owner` "is NOT part
of the frozen `inScope(actor, fact.scope)` predicate … so it is not re-checked here". Both statements
were true about the OTHER file and false about the write decision as a whole: `owner?: string` (R3,
types.ts) was optional on the type AND unchecked at runtime, so `authz('write', actor, fact)` returned
`true` for a well-formed-scope fact with `owner` absent, empty, or of any non-string shape. This directly
contradicts REQ-KNOW-11a's normative clause ("Every fact MUST carry an `owner` + `scope`") and the R3
data-model note (types.ts:105-110) that the MUST "stays enforced BEHAVIORALLY by the WP-5.14 emit/authz
facet" — a promise this WP is the first to actually deliver, for `authz.ts`'s own write decision.

source_reqs: # ptr+digest — motivating requirements this fix restores compliance with

- source: ../req-knw.md#REQ-KNOW-11a # ptr+digest — "every fact carries owner and scope" (the leg this fix closes)
- source: ../req-knw.md#REQ-KNOW-11b # ptr+digest — "read is universal"; the leg this fix must NOT touch (pinned by a new test)
- source: ../req-knw.md#REQ-KNOW-11c # ptr+digest — "out-of-scope write rejected"; the pre-existing leg this fix must not weaken or bypass

seam-freezes: [ ] (single-facet fix inside `packages/knowledge/src/write/`, no cross-module obligation created)

anchor: `packages/knowledge/src/write/authz.ts:44-73` (new `isOwner` guard + the `authz()` write branch it
is folded into) and `packages/knowledge/src/write/template.ts:10-18` (the false-comment repair)

interface_contract: # free-form (unchecked, per repo convention — see id-integrity gate header)

- source: ../method-tags-knw.md#KNOW-11 (owner-scoped write, universal read)

exclusions (all FROZEN by the dispatching brief, not re-decided here):

- `packages/knowledge/src/types.ts` — `owner?: string` stays OPTIONAL on the frozen `GroundedFact`; the
  2026-07-19 owner-authorized R3 data-model reconciliation is not reopened.
- `inScope(actor, scope)` — its FROZEN signature stays scope-only; `owner` is folded into `authz()`
  directly, as a SEPARATE leg, never merged into `inScope`.
- the READ leg of `authz()` — untouched; a read never inspects `owner`/`scope` (KNOW-11b, pinned by a
  new test: an owner-less, scope-less fact still reads successfully for any actor, including `''`).
- `packages/knowledge/test/wp-5.14-know.lifecycle.test.ts` — the sibling frozen-golden suite; not edited
  (another seat may own it). All new coverage lives in a NEW file.
- `packages/adapter-io/**`, `packages/cli/**` — see the MEASUREMENT finding below; explicitly NOT wired
  into the live write door by this WP (doing so would trip the dispatching brief's own stop condition —
  see "What the framing got wrong", reported alongside this WP, not actioned here).

action: add `isOwner(v): v is string` to `authz.ts`, byte-for-byte mirroring `isScope`'s discipline
(`typeof v === 'string' && v.length > 0`, checked BEFORE any coercion); fold it into `authz()`'s write
branch as `isOwner(fact.owner) && inScope(actor, fact.scope)`; correct the header comment (which claimed
owner was "not re-checked here") and `template.ts`'s comment (which claimed authz already enforced it) to
say precisely where each half of the KNOW-11a fence now lives.

action_surface: `[ read(packages/knowledge/**), edit(packages/knowledge/src/write/authz.ts),
  edit(packages/knowledge/src/write/template.ts), edit(packages/knowledge/test/**, new file only),
  edit(docs/requirements/work-packages/wp-fix-enforce-owner.md, new file only), run(test:knowledge),
  run(gates) ]`

guardrails: writes confined to `packages/knowledge/src/write/authz.ts` (in-place edit, no signature
change to the exported `AuthzApi`/`authz`/`inScope`/`isScope`), `packages/knowledge/src/write/template.ts`
(comment-only edit), one new test file under `packages/knowledge/test/`, and this card; `inScope`'s and
`AuthzApi.authz`'s signatures byte-for-byte unchanged; `types.ts` untouched; forbidden zones =
`packages/knowledge/src/types.ts`, `packages/adapter-io/**`, `packages/cli/**`, every other
`work-packages/*.md`, `wp-5.14-know.lifecycle.test.ts`.

acceptance:
Golden coverage — pre-existing, cited (never invented): SCN-KNOW-11a-1 ("a fact emitted through
`knowledge/ref/authz.ts` … carries both an `owner` and a `scope`") is the golden this WP is the first
change to make LOAD-BEARING for the `owner` half — before this fix `authz()`'s write branch never
inspected `fact.owner` at all, so a scope-only fact satisfied the write gate despite the golden's own
"carries both" clause. SCN-KNOW-11b-1 (universal read) and SCN-KNOW-11c-1 (out-of-scope write rejected)
are the two legs this fix must NOT regress — both re-asserted by the new test file below.
Purpose-built regression/fitness test: `packages/knowledge/test/wp-fix-enforce-owner.test.ts` — 16
assertions: - a printed coercion table for `isOwner` over
`{undefined, null, '', 0, false, {}, [], ['seat/forge'], {toString:()=>'seat/forge'}, <valid string>}`
— only the valid non-empty string passes; - `authz('write', …)` with well-formed owner AND scope still succeeds (not a refuse-everything guard); - THE GAP: `authz('write', …)` with well-formed scope, actor genuinely in scope, but `owner` ABSENT now
fails closed (was `true` pre-fix — this is the RED→GREEN assertion); - `owner: ''` (present but malformed) also fails closed; - READ STAYS UNIVERSAL: `authz('read', …)` on an owner-less AND scope-less fact still succeeds, for a
named actor and for `''`; - a well-formed owner does not override the scope leg — a wrong-scope actor is still denied.
Proof of teeth: `authz.ts` was reverted to the exact pre-fix byte sequence (`cp` from a byte-verified
backup of `origin/master`'s copy, `diff -q` confirming identical), the new test file was run and went RED
(13/16 failing — 10 `isOwner is not a function` + the GAP/malformed-owner assertions asserting `true`
where `false` was expected), then the fix was restored (`cp` from a byte-verified backup of the FIXED
file, `diff -q` confirming byte-identical) and the suite went green again (16/16).

deps: [ ] parallel_group: [P] (single-facet, no dependency on any concurrent seat's WP)

exit_predicate: `wp-fix-enforce-owner.test.ts` green (16/16) ∧ full `npx vitest run` green (302 files /
2397 passed + 1 pre-existing todo, 0 failures) ∧ `npx tsc -b` exit 0 ∧ all six named `harness/gates/*`
exit 0 (godfile-guard, layer-guard, reference-model-guard, spec-conformance-guard, id-integrity,
command-doc-guard).

context_refs: # closed list

- source: ../req-knw.md
- source: ../method-tags-knw.md
- source: ../goldens-knw.md

owner: KNOW territory · builder_id `charlie` (dispatched by the lead for a frozen-decision defect fix, #178)

outputs:

- `packages/knowledge/src/write/authz.ts` — `isOwner` guard added + folded into `authz()`'s write branch;
  header/interface comments corrected (89 LOC total, well under the 400-LOC cap)
- `packages/knowledge/src/write/template.ts` — comment-only repair, precisely locating both halves of the
  KNOW-11a fence (118 LOC total, well under the cap)
- `packages/knowledge/test/wp-fix-enforce-owner.test.ts` — new file, the fitness function above

provenance:

- branch `fix/enforce-owner`, forked from `origin/master` at `56f0440` (worktree HEAD at checkout)
- worktree-local commit (see the lead's own `git log` on the branch for the final sha — this WP does not
  self-report a commit sha it did not mint)

trace_ref: manual — cold-review brief (#178, frozen decisions from the tech lead) → this WP card + the
three file changes under `outputs`; no automated S0–S4 trace exists for an out-of-band hotfix

rationale:

- source: ../req-knw.md#REQ-KNOW-11a
- source: ../goldens-knw.md (SCN-KNOW-11a-1)

---

## Measurement this WP is gated on (per the dispatching brief) — reported, not fixed here

**Is `owner` supplied by the shipped write path?** Measured on the BUILT binary (`packages/cli/dist/src/
bin.js emit`), against a real fixture git repo, with a properly-grounded fact (grounding re-derived FRESH
against the real `@atlas/index` build — not a hand-waved fixture) and a genuinely-authorized actor
(`.atlas/policy.json` scope membership, `ATLAS_ACTOR`): the write SUCCEEDED (`status: ok`), and the
persisted bytes — BOTH the CAS object and the projection row — carry `scope`/`tier` but **no `owner` field
at all**. Structurally corroborated two more ways: `packages/cli/src/mine.ts` (`atlas mine`) stamps
`scope: MINED_SCOPE` on every mined candidate but never stamps `owner`, and its own header says explicitly
"no KNOW-11 authz" for that path (writes land in staging, never through a governed door); and the product's
OWN black-box test-authoring helper (`packages/e2e-blackbox/test/author.ts`, `groundedAdvisoryFact`/
`groundedSymbolFact`) constructs `GroundedFact` literals with `scope` but never `owner`. **Conclusion: owner
is NOT supplied anywhere in the shipped authoring/write surface, measured, not inferred.**

## What the framing got wrong (found while measuring, not assumed)

`packages/knowledge/src/write/authz.ts`'s `authz()`/`authzApi`/`inScope` — the EXACT function the
dispatching brief names as the fold-in target (`authz.ts:61`) — has **zero production callers anywhere in
this repository**. The shipped write door (`packages/adapter-io/src/governed-emit.ts`, gate "2. AUTHZ") does
not call `@atlas/knowledge`'s `authz`/`inScope` at all; it calls a separate, structurally-parallel
reimplementation, `actorInScope` in `packages/adapter-io/src/policy.ts`. Grepped and confirmed: `isScope`
(the standalone guard) genuinely IS wired into the live write door (`governed-emit.ts`, `governed-emit-
incumbent.ts`, `governed-link.ts` all import and call it directly) — but `inScope`, `authz`, and `authzApi`
are referenced by nothing outside `packages/knowledge/src/index.ts`'s barrel re-export and the one frozen
test file. The repo's own `reference-model-guard`/`reachability.mjs` did not flag this, but not because it
is wrong: its own header names exactly this blind spot — "a dead export added to a module that is otherwise
LIVE is not caught" — and `authz.ts` is otherwise-live only because `isScope` (a DIFFERENT export from the
same file) has real callers, which masks `authz`/`inScope`/`isOwner` (now) being individually uncalled.

Net effect: this WP is a real, tested, correct fix for the LOCAL packages/knowledge contract — `template.ts`
no longer overstates what `authz.ts` does, and `authz.ts` no longer understates what it should. But it
changes NOTHING about what `atlas emit`/`atlas promote`/the MCP `atlas-emit` tool actually accept or persist
today; every one of them continues to accept and store an owner-less fact unchanged after this patch. Given
the dispatching brief's own stop condition (§"MEASURE BEFORE YOU IMPLEMENT" — "if owner is NOT supplied…
STOP AND REPORT. Do not invent an owner value"), and given the MEASUREMENT above shows owner actually is not
supplied by ANY shipped path, wiring the equivalent guard into the REAL door
(`actorInScope`/`governed-emit.ts` gate 2) would immediately fail-close `atlas emit`/`atlas promote` for
every caller today — exactly the outcome that stop condition exists to prevent, one file further downstream
than the brief's own text anticipated. That decision — whether/how to require an `owner` value from a real
caller (a human, an agent, a curator identity at promote time) before wiring enforcement into the live door
— is the tech lead's, not this seat's, and is left open rather than guessed.
