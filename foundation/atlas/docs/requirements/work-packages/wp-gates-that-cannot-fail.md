# Work Packages — HARNESS INTEGRITY (out-of-band, not S4-campaign)

> A single standalone WP card for four defects in `harness/gates/` — the directory every other claim in
> this repository stands on. Found by cold review of the harness itself, not decomposed from a requirement.
> Conforms loosely to [`method/wp-template.md`](../../method/wp-template.md) where the template fits an
> already-executed fix; the `exec` fields are FILLED, not empty, because this WP is DONE. Pointers are
> relative to this file (`docs/requirements/work-packages/`).
>
> **`source_reqs:` below is deliberately EMPTY, and that is the honest value.** No requirement in this
> corpus governs `harness/**`: the harness is not the product, it is the machinery that gates the product
> (`harness/README.md`), and the S1 blocks cover `packages/**` only. Citing a REQ here to make the field
> look populated would be _inventing a citation to satisfy a gate_ — the exact move the ID-3 narrowing in
> this very card exists to make impossible. The first card written under the narrowed rule declines to
> cheat it.

---

### WP-HARNESS-1.GATES — the gates that could not fail, and the gate that could not see

epic: none (out-of-band harness-integrity fix — carried by no CAMPAIGN)
id: WP-HARNESS-1.GATES
title: `harness/gates/` means one thing; `godfile-guard` walks what it claims to; ID-3 reads structure, not prose

intent: >
Four measured defects in `harness/gates/`, causally chained — closing any one forces the next.
(1) THREE files in `harness/gates/` looked like gates and could not fail: `node <file>` ran to
completion, exit 0, having asserted nothing (`lexing.mjs`, `drift-patterns.mjs`, `reachability.mjs`).
None was dead code — each has a vitest twin and `reference-model-guard` genuinely stands on
`reachability.mjs` — so what was false was the LOCATION: listing the directory gave 9 "gates", reading
`ci.yml` gave 6, and the difference read like coverage.
(2) `godfile-guard` ran `git ls-files packages`, so it was blind to UNTRACKED files (a 900-line module
never `git add`ed scored a green gate — the worst direction to fail in, because a file is most likely to
be oversized the day it is written) and never walked `harness/**` (every gate enforcing the repo's bars
was itself unbarred).
(3) `layer-guard.mjs` sat at exactly 400 of the 400-LOC ceiling, so the moment the walk widened it had
zero headroom for any future edit.
(4) `id-integrity`'s ID-3 counted a BARE PROSE MENTION of a REQ/SCN id in a WP card as "scheduled", so
documenting an orphan silenced the ratchet tracking it. A ratchet a sentence can switch off is the same
class of defect as a gate that cannot fail, which is why all four are one card.

source_reqs: # ptr+digest — EMPTY BY MEASUREMENT, see the note above

# No REQ in docs/requirements/** governs harness/**. Verified: `grep -l "godfile\|LOC ceiling\|fitness

# function" docs/requirements/\*.md` returns nothing, and req-{gen,grd,idx,knw,krn,mem,pst,ret,tls}.md +

# requirements-{adapters,authoring}.md are all scoped to packages/\*\*. This WP therefore schedules no REQ,

# and under its own narrowed ID-3 it correctly claims to schedule none.

seam-freezes: [ "the RULE for harness/gates/ owned-by harness/README.md, enforced-by harness/gates/gate-directory.test.mjs" ]

anchor: `harness/gates/gate-directory.test.mjs` (NEW — the fitness function for the directory itself) ·
`harness/lib/` (NEW — `lexing.mjs`, `drift-patterns.mjs`, `reachability.mjs`, `workspace-scan.mjs`) ·
`harness/gates/godfile-guard.mjs` (the widened walk) · `harness/gates/id-integrity.mjs` (ID-3) ·
`harness/gates/layer-guard.mjs` (the split) · `CODEOWNERS` + [`governance/policy-lock.md`](../../governance/policy-lock.md)

interface_contract: # free-form (unchecked, per repo convention — see id-integrity gate header)

- source: ../../reference/atlas-architecture.md (ARCH-1..7 — the contract layer-guard enforces, unchanged by the split)
- source: ../../governance/policy-lock.md (the admin-lock, which now must cover harness/lib/ as well)

exclusions:

- giving the three moved modules "teeth" so they could stay in `harness/gates/` — they are libraries;
  a fake `process.exit(1)` would be the same lie one level in.
- deleting them — their logic is real, exercised, and load-bearing for `reference-model-guard`.
- changing WHAT `layer-guard` accepts or rejects. The split is behaviour-preserving; a gate refactor that
  moves the verdict is a defect, not a cleanup.
- inventing a structured citation for any newly-orphaned id, which would reproduce the ID-3 defect from
  the other side. (Moot in the event: the narrowing orphaned nothing new — see `acceptance`.)
- retuning how `godfile-guard` COUNTS a line while widening WHAT it counts. Two changes at once and no
  one could say which moved a file across the bar. The `split('\n')` convention is left exactly as found.
- `packages/**` — untouched by this WP apart from one temporary, reverted, `cp`-backed layer inversion
  used to prove the split preserved behaviour.

action: >
Establish the rule "`harness/gates/` holds files that CAN FAIL and are run BY NAME in CI; everything a
gate imports lives in `harness/lib/`" and enforce it empirically. Move the three non-gates (with their
twins) to `harness/lib/`; extend the admin-lock to cover it. Extract layer-guard's SCANNING half to
`harness/lib/workspace-scan.mjs` (a split by role, not by size). Widen `godfile-guard` to tracked ∪
untracked over `packages/**` + `harness/**`, and make it FAIL rather than pass when it cannot build its
file list. Narrow ID-3 so only a structured `source_reqs:`/`acceptance:` pointer schedules an id.

action_surface: `[ read-repo, edit(harness/**), edit(CODEOWNERS), edit(docs/governance/policy-lock.md),
  edit(docs/requirements/work-packages/wp-gates-that-cannot-fail.md, new file only), run(gates), run(test), typecheck ]`

guardrails: no change to any gate's VERDICT on the current tree (asserted byte-for-byte, both directions);
`package-lock.json` untouched; `packages/**` sources byte-identical at exit; no gate given a bypass, no
ratchet entry added or removed; every moved file's importers updated in the same commit.

acceptance: >
Not a docs/requirements SCN — this WP has no pre-authored golden, because the defects were found in cold
review of the harness, not decomposed from S1. Acceptance is four RED→GREEN proofs plus a
no-regression assertion, each measured, none inferred:

1. **#172** — `harness/gates/gate-directory.test.mjs`, 13 assertions. The probe is EMPIRICAL, not a grep
   for `process.exit(1)` (which passes the moment someone writes an unreachable one): `harness/` is
   copied into an otherwise-empty tree and every `harness/gates/*.mjs` is run there, where it has no
   `docs/`, no `packages/` and no git. A gate MUST exit non-zero; a library exits 0 silently.
   RED on the pre-fix layout: **4 failures** (the ci.yml-name equality, plus `lexing`, `drift-patterns`
   and `reachability` each scoring exit 0). GREEN after: 13/13.
2. **#141** — `harness/gates/godfile-guard.test.mjs`, 7 cases on a REAL throwaway git repo. RED on the
   pre-fix guard, measured against a fixture holding one untracked 450-line `.ts` under `packages/` and
   one 450-line `.mjs` under `harness/`: pre-fix printed `OK — 1 source file(s)`, **exit 0**; post-fix
   names both and exits 1. Boundary pinned `> CAP`, not `>= CAP`.
3. **#173** — behaviour preservation, three ways: `layer-guard`'s stdout+stderr is BYTE-IDENTICAL before
   and after the split on (a) the real tree, (b) a tree carrying a deliberate `tools → adapter-io`
   inversion — 4 violations, same text, same order — and (c) a missing root. Its own 23 fixture tests
   pass unchanged. 399 → 290 lines, `workspace-scan.mjs` 157.
4. **#171** — 5 new cases in `harness/gates/id-integrity.test.mjs`. RED on the pre-fix gate: **3
   failures** (prose mention, markdown link outside a scheduling block, structured pointer in a
   NON-scheduling field — each used to count as scheduling). The two positive controls pass on both
   implementations, which is the point: a tightening that also breaks the legitimate cases is not a fix.
5. **NEGATIVE DIRECTION** — all six gates' verdicts on the current tree are unchanged where they should
   be. `id-integrity` in particular is byte-identical: the ID-3 narrowing orphans **0 new ids** on this
   corpus (4 ID-3 violations before, the same 4 after, all four already in the shrink-only ledger),
   because every id any card schedules at all, it schedules structurally. `godfile-guard`'s output
   changes by construction (508 → 529 files: 508 packages + 21 harness) and finds **0 offenders**.

exit_predicate: `npx tsc -b` exit 0 ∧ full `npx vitest run` green with 0 failures ∧ all six named
`harness/gates/*` gates exit 0 when run BY NAME from their paths ∧ every source file ≤400 LOC including
the harness files newly visible to the guard ∧ each of the four defects has a test that FAILS on the
pre-fix code ∧ no gate's verdict on the current tree regresses.

context_refs: # closed list

- source: ../../governance/policy-lock.md
- source: ../../reference/atlas-architecture.md
- source: ../../adr/ADR-0006-architecture-hierarchy-and-tool-exposure.md

deps: [ ] parallel_group: [P] — harness-only, no in-campaign predecessor
owner: seat `fix/gates-that-cannot-fail`
repair_budget: 1 round (per the standing one-fix-round-per-review rule)

outputs:

- `harness/lib/` — NEW: `lexing.mjs`, `drift-patterns.mjs`, `reachability.mjs` (moved, with their four
  twin test files) + `workspace-scan.mjs` (extracted from `layer-guard.mjs`).
- `harness/gates/gate-directory.test.mjs` — NEW: the fitness function for the gates directory.
- `harness/gates/godfile-guard.test.mjs` — NEW: the LOC ceiling's own teeth.
- `harness/gates/godfile-guard.mjs` — tracked ∪ untracked, `packages/**` + `harness/**`, fail-closed on a
  file list it cannot build, `GODFILE_GUARD_ROOT` override so the fixture can reach it.
- `harness/gates/id-integrity.mjs` — ID-3 reads structure, not prose. `harness/gates/layer-guard.mjs` — split.
- `CODEOWNERS` + `docs/governance/policy-lock.md` — the admin-lock extended to `/harness/lib/`.
- `harness/README.md` — the rule, stated; and one doc overclaim corrected (see below).

provenance: cold review of `harness/gates/` (tasks #141, #171, #172, #173), 2026-08-03.

trace_ref: >
THREE THINGS THE BRIEF ASSERTED THAT THE MEASUREMENT CONTRADICTS, recorded because the card is the
durable copy. (a) "#172 — TWO files that cannot fail": there are **three** (`lexing.mjs`,
`drift-patterns.mjs`, `reachability.mjs`), counted by running each. (b) "#173 — layer-guard goes red the
moment godfile-guard walks `harness/**`": it does **not**. The guard counts `split('\n').length`, which
reads 400 for that file, and the test is `> CAP` — 400 > 400 is false, so it sat exactly ON the cap and
passed. The split was still right (a file at the cap cannot take its next edit, and this WP had edits for
it), but the causal chain was one line short of real. (c) "#171 will go red on existing cards, and that
is the point": it goes red on **zero**. Nothing had to be classified and no baseline had to be ratcheted.
The narrowing is worth having anyway — it closes the escape for every card written after it, and the
seat-level measurement that motivated it (5 of 10 ids surviving after their structured citations were
stripped) is real — but on this corpus today it is a no-op, and "this will go red" was not a measurement.

A FOURTH finding, not in the brief: the extraction to `harness/lib/` would have moved gate logic OUT of
the CODEOWNERS admin-lock, silently. `stripComments` returning `''` makes `layer-guard` observe zero
imports and print OK, and after the move that file sat on an unowned path. `/harness/lib/` was added in
the same commit. **A refactor that relocates owned content is an ownership change even when it is a
behaviour no-op** — the same lesson `policy-lock.md` already records one level up, arriving again.

A FIFTH: `harness/README.md` told the reader to verify the one-way dependency with
`grep -rn "@atlas/" harness/   # must return nothing`. It returns **60** lines and had for a long time —
prose, layer-guard's own import-specifier regex, and the fixtures its teeth are written against. The
invariant itself HOLDS (0 real import statements); the stated verification was an overclaim. It is now
narrowed to import positions and mechanized in `gate-directory.test.mjs`, so it is checked on every
`npm test` rather than by whoever remembers to paste a grep.
