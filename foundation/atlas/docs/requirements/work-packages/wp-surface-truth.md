# Work Packages — HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card for two defects found by inspection of the shipped surface, not authored fresh
> from a requirement. Conforms loosely to [`method/wp-template.md`](../../method/wp-template.md) where the
> template fits an already-executed hotfix; the `exec` fields (`outputs`/`provenance`/`trace_ref`) are
> FILLED, not empty, because this WP is DONE, not S4-frozen for later dispatch. Pointers are relative to this
> file (`docs/requirements/work-packages/`).

---

### WP-FIX-3.TOOLS — the MCP surface states what the tool returns, and the ADR guard walks the code (#193, #192)

epic: none (out-of-band hotfix, dispatched by the lead — not carried by any CAMPAIGN)
id: WP-FIX-3.TOOLS
title: `atlas-query`'s published MCP `description` promised one `tier>=T1` band while the tool returns two;
and `adr-citation-guard` did not walk `packages/**`

intent: >
Two defects, one theme: a surface asserting something the code does not do.

**#193 — the product lie.** `packages/tools/src/handler.ts` published `atlas-query` as _"bounded read
projection — resolves a scope to the merged covering pack of tier>=T1 invariants, stale-flagged
(TOOLS-6)"_. That string is the `description` field of the tool's published schema, which every MCP client
renders verbatim to a calling agent, and it is the ONLY thing about this door a caller who cannot read the
source ever sees. Since ADR-0013 (owner-ratified 2026-08-03, shipped in PR #107) the tool returns TWO
bands: `invariants` (governing, `tier≥T1`, ratified) and `advisory` (`T2` — machine proposals no ratifier
saw) under its own `ADVISORY_CAP`, plus an `advisoryDropped` truncation ledger. So the agent was told it
receives ratified invariants ONLY, and was handed unratified proposals in the same response. That is what
clause 3 of ADR-0013 exists to prevent, failing at the first place a reader looks.

The defect is a PARTIAL correction, which is why nothing caught it: the sibling
`GUIDANCE['atlas-query'].invariant` — 66 lines above the schema in the same file — WAS rewritten for the
two-band world in the same change, as were `packages/cli/src/own.ts` and the CLI renderer
(`packages/cli/src/render.ts`, which gives the advisory band its own `advisory` verb and prints
`advisoryDropped`). Every neighbouring surface told the truth; the one an MCP agent actually reads did
not, and NO test asserted on it.

**#192 — the gate blind spot.** `harness/gates/adr-citation-guard.mjs` (PR #115) requires every
`ADR-<NNNN>` citation under `docs/` to resolve to a real `docs/adr/ADR-<NNNN>-*.md`. Its own header
declared code carriers out of scope "by construction". That declaration WAS the blind spot: re-derived
with the gate's own regex over the tree at master `e4882a3`, of 520 `.ts` files under `packages/**`,
**123 cite an ADR by name, 26 of those cite `ADR-0013`, and 12 distinct ADR ids are cited from code** — a
larger citing population than the `docs/` tree that motivated the gate. Atlas modules explain themselves
in prose comments that reference decisions by id, so a deleted or renamed ADR strands more pointers in the
code than in the documentation. This is the same hole that let the public repo cite an ADR it did not
contain. (On THIS branch both figures are one higher — 124 / 27 — because the #193 story added a citer;
the numbers above are pinned to `e4882a3` and are a dated snapshot of one named tree, never a live
invariant. See the framing-error section: the first version of this card stated the pair `124 / 26`,
which describes neither tree.)

source_reqs: # ptr+digest — the ratified requirements this fix restores compliance with

- source: ../req-tls.md#REQ-TOOLS-6f # ptr+digest — "the pack is two separately bounded bands"; the description contradicted it
- source: ../req-tls.md#REQ-TOOLS-6b # ptr+digest — "pack bounded to tier≥T1"; read to confirm how #107/#179 amended it (its own scope note defers INV-TOOLS-6)

seam-freezes: [ ] (a prose field and a gate's walk; no interface, signature or pack shape changed)

anchor: `packages/tools/src/handler.ts:143` — the `atlas-query` `SCHEMAS` entry `description` (the lead's
line number and quoted wording both VERIFIED exact against the shipped source before any edit);
`packages/tools/src/handler.ts:77` — the sibling `GUIDANCE` `invariant` that was already correct, used as
the register to match; `harness/gates/adr-citation-guard.mjs` — the walk extended

interface_contract: # free-form (unchecked, per repo convention — see id-integrity gate header)

- source: ../method-tags-tls.md#TOOLS-6 (the pack's bounding contract)

exclusions:

- `packages/genesis/src/**`, `packages/adapter-io/src/**` — a LIVE seat owns branch `feat/symbol-sites`
  and is editing `genesis/src/seeds.ts`, `adapter-io/src/prompt.ts`, `adapter-io/src/ast.ts`. Read-only
  reference only (to CONFIRM the two-band behaviour in `pack-shape.ts`/`own-bands.ts`); no edit, no
  import added.
- Any behavioural change to the query tool. This card changed PROSE and a GATE, never the pack's
  behaviour. The code was confirmed CORRECT against `REQ-TOOLS-6f` before the description was touched, so
  the "the behaviour is the defect" branch — which would have been a different card — was never entered.

action: (1) verify the anchor line and quoted wording against the shipped source; (2) rewrite the
`description` to name both returned bands by their payload field names and mark the second unratified;
(3) pin it with an off-the-wire black-box story driving the BUILT `atlas-mcp` binary over real MCP stdio;
(4) sweep every other user-facing surface string mentioning the pack's tier bound and classify each as
fixed or doc-lag; (5) extend `adr-citation-guard.mjs` to a second corpus `packages/**/*.ts` with the A4
fixture exclusion, two new anti-vacuity refusals (A-4, A-5) and a printed exclusion ledger; (6) split the
gate's twin by corpus to stay under the 400-LOC ceiling, extracting the shared scratch-tree plumbing to
`harness/lib/`; (7) watch the extended gate fail then pass, in both the planted-citation and the
exclusion-discrimination directions.

action_surface: `[ read(**), edit(packages/tools/src/handler.ts),
  edit(packages/e2e-blackbox/test/s26-query-description.blackbox.test.ts, new file only),
  edit(harness/gates/adr-citation-guard.mjs),
  edit(harness/gates/adr-citation-guard.test.mjs),
  edit(harness/gates/adr-citation-guard.packages.test.mjs, new file only),
  edit(harness/lib/adr-citation-fixtures.mjs, new file only),
  edit(docs/requirements/goldens-tls.md, new golden only),
  edit(docs/requirements/work-packages/wp-surface-truth.md, new file only),
  run(tsc -b), run(vitest run), run(node harness/gates/*.mjs) ]`

guardrails: writes confined to the one `description` string (no schema property, no leg, no `Pack` field
touched), one new e2e-blackbox story, the ADR gate plus its twins and their new shared library, one new
golden, and this card; byte-level `cp` backup + `diff -q` restore for every temporary mutation (never
`git checkout`/`restore`/`stash`/`reset` in a worktree holding uncommitted work); forbidden zones =
`packages/genesis/src/**` and `packages/adapter-io/src/**` (live seat `feat/symbol-sites`), every other
seat's worktree, and the scratchpad root. COMMIT ONLY — no push, no PR, no merge.

acceptance:

- source: ../goldens-tls.md#SCN-TOOLS-6f-4 # ptr+digest — the new golden this WP adds and satisfies
  Proof of teeth (#193): the fixed `description` was reverted to the retired string in `src/`, `tsc -b`
  re-run so `dist/` carried it, and the new story observed RED — 3 of its 5 legs failed (the byte-for-byte
  equality leg and both semantic legs) while the two legs that assert on BEHAVIOUR stayed GREEN, which is
  the lie itself reproduced: the payload still had two bands while the published description denied it. The
  fix was then restored by `cp` with `diff -q` confirming byte-identical restoration, rebuilt, and all 5
  legs returned green.
  Proof of teeth (#192): a citation to id `9999` (which `docs/adr/` does not contain — spelled in full in
  the probe, and deliberately NOT spelled in full anywhere in this card, because this file is itself in the
  gate's `docs/` corpus and naming an absent ADR here would fail the very gate being described) was planted
  in `packages/tools/src/handler.ts` — a `packages/**` file the previous walk could not see — and the gate
  exited **1**, naming `packages/tools/src/handler.ts:373` with that id; the plant was removed by `cp`
  restore and the gate exited **0**. The A4 exclusion was then measured in BOTH directions: the same
  dangling id inside `packages/tools/test/fixtures/` exits **0** and is reported as `1 file(s) excluded`
  naming the file, while the same id in `packages/tools/test/sneaky-fixtures.ts` — a name that merely
  CONTAINS "fixtures" — exits **1**. All probes removed before commit, proven by `git status` and a
  tree-wide grep for the planted id returning nothing.

deps: [ ] parallel_group: [P] (disjoint from `feat/symbol-sites`)

exit_predicate: the new golden `SCN-TOOLS-6f-4` evidenced off the wire from the built server ∧ `npx tsc -b`
clean ∧ full `npx vitest run` reconciled exactly against the `origin/master` baseline (see the return card
for the literal delta) ∧ every gate in `harness/gates/` exit 0, each run BY NAME with its code read
directly and never through a pipe.

context_refs: # closed list

- source: ../req-tls.md
- source: ../method-tags-tls.md
- source: ../../adr/ADR-0013-the-pack-has-two-bands-governing-and-advisory.md
- source: ../../method/wp-template.md

owner: TOOLS territory · builder_id `charlie` (dispatched by the lead for two measured surface defects)

outputs:

- `packages/tools/src/handler.ts` — the `atlas-query` `description` rewritten to name both bands, mark the
  advisory one unratified, and name `advisoryDropped` + both freshness signals; 372 LOC total, under the
  400-LOC cap
- `packages/e2e-blackbox/test/s26-query-description.blackbox.test.ts` — new black-box story (S26.4a/b/c, 5
  legs) driving the BUILT `atlas-mcp` server over real MCP stdio; 189 LOC
- `harness/gates/adr-citation-guard.mjs` — second corpus `packages/**/*.ts`, the A4 fixture exclusion,
  refusals A-4 + A-5, and an exclusion ledger printed on BOTH the pass and the fail path; 282 LOC
- `harness/gates/adr-citation-guard.test.mjs` — the `docs/**` twin, rewired to the shared library; 197 LOC
- `harness/gates/adr-citation-guard.packages.test.mjs` — new twin for the code corpus, the A4 exclusion in
  both directions, and A-4/A-5; 203 LOC
- `harness/lib/adr-citation-fixtures.mjs` — new shared scratch-tree plumbing for the two twins (a LIBRARY:
  imports run no sweep and print nothing, the contract `gate-directory.test.mjs` enforces); 93 LOC
- `docs/requirements/goldens-tls.md` — `SCN-TOOLS-6f-4` golden added under the existing REQ-TOOLS-6f
- `docs/requirements/work-packages/wp-surface-truth.md` — this card

provenance:

- branch `fix/surface-truth`, forked from master `e4882a3`
- `211e42c` — #193: the description fix + the off-the-wire pin
- the #192 commit carries this card and is minted after it; its sha is in the lead's `git log` on the
  branch. This WP does not self-report a sha it had not minted at the time of writing.

trace_ref: manual — lead brief, then a superseding WP card (`WP-CARD.md`, delivered mid-execution after the
lead judged the original prose dispatch malformed) → this card + the file changes under `outputs`; no
automated S0–S4 trace exists for an out-of-band hotfix

rationale:

- source: ../req-tls.md#REQ-TOOLS-6f

---

## What the lead's framing got wrong, and what it got right (measured, not asserted)

**Got right, verified rather than taken on faith.** The anchor `packages/tools/src/handler.ts:143` is exact,
and the quoted wording is byte-exact. The sibling `invariant` string is at line 77 — 66 lines above, exactly
as stated. `REQ-TOOLS-6f` is ratified and the invariant-register row for TOOLS-6 carries the AMENDED
two-band language, so axiom A1 holds: **the code is right and the prose was wrong**, and the "behaviour is
the defect" branch was correctly excluded. The count of `packages/**` files citing `ADR-0013` is **26** on
master `e4882a3`, exactly as the lead said — and it is the gate's OWN header that was stale, claiming 25.

**Got wrong — the fixture exclusion (A4) is aimed at a corpus that does not contain its motivating case.**
A4 is binding and was implemented, but the fixtures that justify it are not in the tree it now guards. The
synthetic ids that exist to exercise a refusal (`0042`, `0043`, `0077`, `0099`, written in full there and
deliberately not here) live in `harness/gates/adr-citation-guard.test.mjs`. `harness/` is in NEITHER corpus, so those were never at risk
from this extension. Under `packages/**` there is today **no** file naming a non-existent ADR, and **no**
fixture directory of any kind: the only fixture-ish paths are `packages/cli/test/mine-fixtures.ts` and
`packages/adapter-io/test/harness/governed-fixtures.ts`, and **both carry REAL `ADR-0008` citations**. So
the obvious reading of "exclude test fixtures" — a name-based rule — would have bought the exclusion by
silently dropping two real citations, which is precisely the failure the lead warned against in the same
breath. Implemented instead as a reserved, currently-EMPTY, whole-segment path
(`packages/<pkg>/test/fixtures/**`) whose excluded set is printed on every run, so it cannot become a
silent hiding place. It is a declared door, not a swept area, and the gate says so in its own success line.

**Got wrong — "the guard's LOC" was the wrong file to check.** I5 asked for `adr-citation-guard.mjs`'s LOC
before starting; at 173 it had ample headroom and finished at 282. The file that actually breached the
ceiling was its TWIN: adding the code-corpus teeth to `adr-citation-guard.test.mjs` took it to **414**,
over the 400 cap, because the new corpus needs its own anti-vacuity fixtures AND both directions of the
exclusion. Resolved by splitting along the seam the subject already has — one twin per corpus — and lifting
the shared scratch-tree plumbing into `harness/lib/`, per the directory's own stated rule that everything a
gate imports lives there.

**Got wrong — the sweep's scope was stated as "the description", but the two-band amendment left a
transcript trail.** Fixing the description is a one-string change; the SET of user-facing strings mentioning
the pack's tier bound (C2) is larger, and eight files under `docs/` still show `atlas query` transcripts
carrying the PRE-#107 `next:`/`invariant:` guidance lines and a `data:` block with no `advisoryDropped` row
— output the shipped CLI no longer produces. Those are listed, not fixed, per rule 3. Two apparent hits in
ADR-0013 itself are NOT lag: they are the "before" evidence in its Context section and are correct as
written.

**One consequence the framing did not anticipate, found by the new test.** The exclusion ledger was
originally printed only on the gate's SUCCESS path while the header promised "pass or fail". The
code-corpus twin caught it (`excludedCount` read `NaN` off a failing run), and the CODE was fixed to match
the documented claim rather than the claim softened — a reader staring at a dangling-citation report is
exactly the reader who needs to know which files were not read.

---

## What COLD REVIEW caught that I had not (APPROVE, two doc-only findings — one fix round, both closed)

**F1 — I shipped a mismatched pair of counts, which is the exact defect class this card is about.** The
first version of this card and of the gate header both read _"124 `.ts` files … 26 of them cite ADR-0013"_.
Re-derived independently with the gate's own regex, reading blobs from the object store at each named rev:
master `e4882a3` is **123 / 26** over 520 scanned files, and this branch's HEAD is **124 / 27** over 521 —
the set difference being exactly one file, `packages/e2e-blackbox/test/s26-query-description.blackbox.test.ts`,
the story #193 added. `124 / 26` describes NEITHER tree: I read the "any ADR" half off my working copy and
the "ADR-0013" half off master. `12 distinct ids` was correct on both. Both sites now state the master
figures, labelled with the tree, and say plainly that a count in a comment is a dated snapshot — which is
the durable form of the same lesson the header already teaches about the previous "25".

**F2 — a second `packages/**`carrier of the retired single-band promise, in my own territory.** The C2
sweep was scoped to`docs/`by assumption after the`packages/\*_`grep for the description string came back
clean; the promise also existed in a different spelling.`packages/tools/src/types.ts:78`, the JSDoc on the
exported `QueryOut` type, read _"the merged covering bounded pack (`≤ ~2K`, `tier≥T1`, stale-flagged)"\* —
hover-rendered for every consumer of `@atlas/tools`, on the very type the fixed door returns. Rewritten to
the two-band reality in the same register as the description.

The widened sweep over `packages/**` was then run and enumerated. Only that one file was a carrier.
`packages/tools/src/query.ts:13-20` and `packages/tools/src/bands.ts:29` already say "governing band"
explicitly; `packages/tools/src/handler.ts:144` and the #193 story quote the retired sentence deliberately,
as the thing being refused; `packages/retrieval/src/pack.ts` is a DIFFERENT consumer (`PACK_CAP`, which
`atlas query` never reaches) and carries two explicit `[ADR-0013 — REFERENCE MODEL, NOT AMENDED]` markers,
so its `tier≥T1` language is accurate for it. `packages/tools/test/wp-6.19-tools.test.ts:9,65` names "the
pack" where it means the governing band, but every assertion in it is on `pack.invariants` and its subject
is `REQ-TOOLS-6b`, which after the amendment IS the governing band — a loose test title, not a false
surface, and left alone rather than reached for in a one-round fix.

**The 400-LOC figure, measured rather than reconstructed.** The pre-split combined twin was preserved
byte-exact (19,366 bytes) and re-measured with the repo's own metric (`split('\n').length`,
`godfile-guard.mjs:74`): **414**, not a reconstruction. Confirmed empirically by running `godfile-guard`
against a throwaway fixture repo containing exactly that file — `EXIT=1`, `414  harness/gates/
adr-citation-guard.test.mjs`, over the 400 ceiling by 14. A reconstruction from the two FINAL files lands
lower because neither final header existed pre-split: the packages twin gained a ~20-line header explaining
the split, and the docs twin's local helper block was replaced by a 16-line import block.
