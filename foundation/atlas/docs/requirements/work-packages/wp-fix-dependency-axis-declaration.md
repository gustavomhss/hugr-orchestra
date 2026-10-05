# Work Packages — HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card for a DECLARATION landed by measurement against the real repository, not
> authored fresh from a requirement — no behaviour changes. Conforms loosely to
> [`method/wp-template.md`](../../method/wp-template.md) where the template fits an already-executed
> hotfix; the `exec` fields (`outputs`/`provenance`/`trace_ref`) are FILLED, not empty, because this WP
> is DONE, not S4-frozen for later dispatch. Pointers are relative to this file
> (`docs/requirements/work-packages/`).

---

### WP-FIX-2.INDEX — the dependency axis's exception to spec §3.5 was never stated, only built (#191)

epic: none (out-of-band hotfix, dispatched by the lead with the mechanism pre-measured — not carried by
any CAMPAIGN)
id: WP-FIX-2.INDEX
title: Declare, in `docs/spec/atlas.md` §3.5, `docs/reference/atlas-index.md`, and
`packages/index/src/build.ts`, that the dependency axis is exempt from the leaf-to-root re-hash /
"unaffected subtree keeps its hash" model — it ADDRESSES (its `subtreeHash` is a path identity), it
does not COMMIT (that identity carries no content and cannot witness drift)

intent: >
`docs/spec/atlas.md` §3.5 states the structural index's re-hash model with no stated exception: "A
change re-hashes only the affected path from leaf to root; every unaffected subtree keeps its hash, so
facts anchored there stay `FRESH`." The dependency axis IS an exception, proven in the code that already
ships it: `packages/index/src/build.ts` `dependencyAxis` keys every node's `subtreeHash` as
`asSubtreeHash(nodeHashOfPath(path))` — the node's own IDENTITY, a constant of the PATH, never folded
over the file's bytes (contrast `hierarchy()`'s `rollupHash`, which folds `key + content + children` for
the `spatial`/`territory` axes). The build.ts docstring already says so, in capitals
(`[NOT A FRESHNESS ORACLE]`) — but only the code said it. The spec did not, and `docs/reference/
  atlas-index.md`'s "Shared rollup mechanics" + INDEX-2 restated the SAME unqualified rule "on the relevant
axis" with no carve-out either.

That single unwritten sentence produced two independently-discovered defects: **#98** (security, closed)
— the drift oracle was defeatable by anchor choice, a fact anchored on the dependency axis was
permanently `FRESH`; and **#189** (quality, closed 2026-08-04) — 72.3% of resolved dependency edges were
fabricated, and the (non-content-committing) hash sealed them reproducibly. The repo's
`spec-conformance-guard` catches CONTRADICTION between restatements of an amended invariant family; it
has no mechanism to catch an OMISSION that was never contradicted, only silently absent. This WP is the
transcription of an already-true, already-shipped fact — a declaration, not a fix. No production
behaviour changes.

THE FROZEN SENTENCE (verbatim, register-adapted per target — the claim itself unchanged): "The
dependency axis ADDRESSES; it does not COMMIT. A dependency-axis node's `subtreeHash` is the identity of
its path (`id({file: path})`) and carries no content, so §3.5's leaf-to-root re-hashing does not apply
to it: the axis is not a freshness oracle, and an anchor on it is not a grounding."

source_reqs: # ptr+digest — the new requirement this WP mints and schedules

- source: ../req-idx.md#REQ-INDEX-17a # ptr+digest — new: "dependency axis addresses, does not commit"

seam-freezes: [ ] (docs + one comment block; no cross-module obligation created; NO source/test behaviour
changed in `packages/index/src/build.ts` — only its docstring gained a citation)

anchor: `docs/spec/atlas.md:174-177` (new §3.5 bullet) · `docs/reference/atlas-index.md:145-149,157-158,
  259-266` (Shared rollup mechanics caveat + INDEX-2 pointer + new INDEX-17 invariant + Acceptance-13) ·
`packages/index/src/build.ts:207-213` (docstring citation added to the pre-existing `[NOT A FRESHNESS
  ORACLE]` comment on `dependencyAxis`)

interface_contract: # free-form (unchecked, per repo convention — see id-integrity gate header)

- source: ../method-tags-idx.md#INDEX-2 (the rollup model this WP scopes an exception to)
- source: ../method-tags-idx.md#INDEX-13 (never-fabricate posture #189 extends — the same failure class
  this declaration closes the spec-side gap for)

exclusions:

- `packages/grounding/src/drift.ts` — ALREADY carries the enforcement (`resolveCurrent` does not scan the
  dependency axis; `findByKey` refuses a node whose `subtreeHash` IS its own key) shipped by #98's fix;
  read-only reference in this WP's intent/comment, no edit — outside the lead's declared 3-target surface
  and this WP's `action_surface`.
- `docs/requirements/method-tags-idx.md`, `docs/requirements/properties-idx.md`,
  `docs/requirements/invariant-register.md` — NOT touched. `REQ-INDEX-17a` is scheduled (via
  `source_reqs:` above) and witnessed (via `acceptance:` below) without an `INV-INDEX-17`/`PROP-INDEX-17`
  block or register row; `id-integrity` ID-3 requires only that a defined REQ be SCHEDULED by a WP and a
  non-held-out SCN be in a WP's `acceptance:` list — neither requires an INV/PROP/register entry, and
  several existing `req-idx.md` REQs (e.g. the whole INDEX-4/-5/-6/-7/-8/-9/-10 families) carry no
  INV/PROP coverage either. Adding one here would touch the `properties-idx.md` per-block `@sha256:`
  digest tripwire machinery for a declaration-only WP — real scope creep, declined.
- `docs/design/atlas.md`, `docs/explanation/grounding.md`, `docs/explanation/knowledge.md`,
  `docs/reference/atlas-knowledge.md` — re-verified (not merely trusted): all four state the ANCHOR-KIND
  rule (symbol/block/file vs. line-ranges), never the axis-level rollup rule this WP declares. Correctly
  excluded by the lead; not promoted.
- any other campaign's WP card — this is a deliberately NEW file so as not to collide with concurrent
  edits to `wp-campaign-*.md`.

action: land the frozen declaration (verbatim claim, register-adapted) in the three named targets; mint
`REQ-INDEX-17a` (`req-idx.md`) sourced from the new `INDEX-17` invariant in `atlas-index.md`; add one
golden `SCN-INDEX-17a-1` (`goldens-idx.md`) witnessed by a NEW regression test in
`packages/index/test/build.test.ts` that edits a file's content and asserts the `spatial`-axis
`subtreeHash` MOVES while the `dependency`-axis leaf's `subtreeHash` does NOT (pinned equal to
`asSubtreeHash(nodeHashOfPath(path))` before AND after); update the goldens-idx.md coverage ledger
(57→58 REQ, 25→26 guard, gen histogram) to stay honest; write this card.

action_surface: `[ read(packages/**), read(docs/**),
  edit(docs/spec/atlas.md, §3.5 only),
  edit(docs/reference/atlas-index.md, Shared-rollup-mechanics + INDEX-2 pointer + new INDEX-17 + Acceptance-13 only),
  edit(packages/index/src/build.ts, dependencyAxis docstring only — no code line changed),
  edit(packages/index/test/build.test.ts, new test only),
  edit(docs/requirements/req-idx.md, new REQ-INDEX-17a only),
  edit(docs/requirements/goldens-idx.md, new SCN-INDEX-17a-1 + ledger counts only),
  edit(docs/requirements/work-packages/wp-fix-dependency-axis-declaration.md, new file only),
  run(tsc -b), run(vitest run), run(gates) ]`

guardrails: writes confined to the 3 declared targets + the REQ/golden/WP triad + one new test; forbidden
zones = `packages/grounding/**` (behaviour already correct, out of declared surface),
`docs/design/**`/`docs/explanation/**`/other `docs/reference/*.md` (re-verified non-targets), every other
`work-packages/*.md`, `method-tags-idx.md`/`properties-idx.md`/`invariant-register.md` (declined —
see exclusions). No code path in `packages/index/src/build.ts` changed — docstring only.

acceptance:

- source: ../goldens-idx.md#SCN-INDEX-17a-1 # ptr+digest — the new golden this WP adds and satisfies
  Proof of teeth: the new test in `packages/index/test/build.test.ts` was run FIRST against a hand-reverted
  copy of `dependencyAxis` that folds `node.content` the way `hierarchy()`'s `rollupHash` does (the
  counterfactual the declaration forbids) and observed RED (the dependency-axis leaf's `subtreeHash` moved
  on the content edit); the real, unmodified source was restored via `cp` (never `git checkout`/`restore`
  in this worktree) and `diff -q` confirmed byte-identical restoration before the full suite re-run.

deps: [ ] parallel_group: [P] (docs + one comment + one test file, no dependency on any concurrent seat's WP)

exit_predicate: `packages/index/test/build.test.ts` green (all live cases, including `SCN-INDEX-17a-1`) ∧
full `npx vitest run` reconciled exactly against the `origin/master` baseline (see the return card for
the literal delta) ∧ `npx tsc -b` clean ∧ all six `harness/gates/*` exit 0, and `spec-conformance-guard`
does not fire AMENDMENT-FAN-OUT (no `AMENDED` marker was written anywhere — `REQ-INDEX-17a` is new
content, not an amendment to `REQ-INDEX-2c` or any other existing family).

context_refs: # closed list

- source: ../req-idx.md
- source: ../method-tags-idx.md

owner: INDEX territory · builder_id `charlie` (dispatched by the lead for a measured documentation
declaration, task #191)

outputs:

- `docs/spec/atlas.md` — one new §3.5 bullet (the frozen sentence); 431 LOC total
- `docs/reference/atlas-index.md` — Shared-rollup-mechanics caveat, INDEX-2 pointer, new INDEX-17
  invariant, new Acceptance-13; 267 LOC total
- `packages/index/src/build.ts` — `dependencyAxis` docstring gains a citation of both; no code line
  changed; 249 LOC total, well under the 400-LOC cap
- `packages/index/test/build.test.ts` — `SCN-INDEX-17a-1` regression case added
- `docs/requirements/req-idx.md` — `REQ-INDEX-17a` added
- `docs/requirements/goldens-idx.md` — `SCN-INDEX-17a-1` golden + coverage-ledger counts updated
- `docs/requirements/work-packages/wp-fix-dependency-axis-declaration.md` — this card

provenance:

- branch `docs/dependency-axis-declaration`, forked from `origin/master` at
  `0befe4ca3c91d00554fccbbb2b1a096503a572f4` (`0befe4c`)
- worktree-local commit (see the lead's own `git log` on the branch for the final sha — this WP does
  not self-report a commit sha it did not mint)

trace_ref: manual — lead brief (task #191: the frozen sentence, the 3-target fan-out map, the 4 verified
non-targets) → this WP card + the file changes under `outputs`; no automated S0–S4 trace exists for an
out-of-band declaration hotfix

rationale:

- source: ../req-idx.md#REQ-INDEX-17a

---

## What the lead's framing got wrong, and what it got right (measured, not asserted)

**Got right, re-verified rather than trusted:** the 3-target fan-out map (`docs/spec/atlas.md` §3.5,
`docs/reference/atlas-index.md`, `packages/index/src/build.ts`) and the 4-document non-target exclusion
list (`docs/design/atlas.md:141`, `docs/explanation/grounding.md:24`, `docs/explanation/knowledge.md:33`,
`docs/reference/atlas-knowledge.md:38`). All four excluded documents were re-read: each states the
ANCHOR-KIND rule (a citation anchors to a symbol/block/file's subtree hash, never to line-ranges) — a
claim about what a `Grounding.entries[].anchor` points AT. None of them states the axis-level rollup rule
("each level's `subtreeHash`… every unaffected subtree keeps its hash") that is the actual subject of
§3.5 and this declaration. The lead's classification holds unchanged.

**Got wrong / underspecified — DoD item 2's own machinery pulled in more files than the 3-target table
lists.** The brief's fan-out table names exactly 3 targets for the DECLARATION; DoD item 2 separately
requires "the requirement + golden in the repo's own id scheme, plus a WP card." Those are not the same
constraint, and satisfying the second mechanically required touching `docs/requirements/req-idx.md`,
`docs/requirements/goldens-idx.md`, and this new `work-packages/*.md` file — three files outside the
3-target table. Read narrowly, "the fan-out surface is deliberately NARROW" could be misread as forbidding
this. It does not: the brief's own fan-out table is scoped to where "the declaration" (the prose sentence)
lands, and the id-scheme machinery is a SEPARATE, explicitly-required DoD item that has its own
conventional home (the `req-<m>.md`/`goldens-<m>.md`/`work-packages/` triad, the same one every `wp-fix-*`
predecessor in this repo uses). Flagging this rather than silently picking one reading, since the brief
warns "a declaration landing in the wrong document is worse than none" and I want the lead able to check
the boundary I drew.

**A second, smaller correction to my own first-pass plan (self-caught before landing):** my first draft
would have minted a NEW invariant `INDEX-17` in `docs/reference/atlas-index.md` covering the full frozen
sentence, then split it into TWO requirements (`REQ-INDEX-17a`/`17b`) so I could word each half in
"shall"-normative-clause style. I collapsed this to ONE requirement (`REQ-INDEX-17a`) covering the whole
sentence, because the "not a freshness oracle" half (`packages/grounding/src/drift.ts`) is already-shipped
production behaviour from #98 with no in-scope test I could honestly attach a NEW golden to without
touching `drift.ts` — outside the declared 3-target surface. Minting `REQ-INDEX-17b` and leaving it either
un-witnessed or witnessed by a golden I did not actually write would have been exactly the "invented
citation to satisfy the gate" the brief explicitly forbids ("a recent seat declined exactly this and was
right to"). One requirement, one golden I actually wrote and ran RED→GREEN, is the honest scope.
