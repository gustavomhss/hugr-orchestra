# Work Package — the `own` briefing is two bands, as the query pack has been since ADR-0013

> Task **#190**. A remediation WP that DOES author ids, because it ships a ratified amendment rather than a
> repair: one new requirement (`REQ-RETR-12m`) and four new goldens (`SCN-RETR-12m-1..4`). It also SUPERSEDES
> a recorded exclusion in `wp-per-fact-freshness.md` — "`atlas own` is NOT widened" — which is the sentence
> the defect was hiding behind.

### WP-own-two-bands — extend the two-band model from `atlas query` to `atlas own`

id: WP-own-two-bands
content*hash: <filled-at-freeze>
title: `own*<scope>`serves the`T2`rows it was refusing, in a separately capped ADVISORY band INSIDE the
  unchanged`OWN*CAP`, without moving one byte of the governing band
intent: >
  Two read doors over ONE store disagreed about what the store contains. MEASURED through the built binary
  (`packages/cli/dist/src/bin.js`) against Atlas's own 199-fact mined store, at the tree the graph was mined
  from:
    atlas own   packages/adapter-io/src/policy.ts  ->  0 invariant(s), 0 gotcha(s)
    atlas query packages/adapter-io/src/policy.ts  ->  advisory T2 b977326… [FRESH]: "`scopeOwnsAnchor`…"
  Every mined fact is`T2`, so `own*<scope>`served 0 of 199 — by specification, not by bug.
  The specification had expired.`own-source.ts`applied`atLeastT1`to BOTH fact sections, justified in its
  own docstring as: "the alternative is a read door that serves a`T2`… that`atlas query`is correctly
  declining to show. A second read door with a laxer bound is a route around the first one." ADR-0013
  (owner-ratified 2026-08-03) made`query`serve`T2`in a separately capped advisory band, so`query`   declines nothing of the sort; the live gate was justified by a behaviour that had been deleted.
  `REQ-TOOLS-6f`as landed reads "The`atlas-query`pack shall…" — the amendment was scoped to one door.
  The fix invents no design. It applies the SHAPE`query` already has, through the SAME predicates
  (`@atlas/tools`src/bands.ts`atLeastT1`/`isAdvisory`, both MEMBERSHIP), and the ONLY new number is a
sub-cap derived from the ratio ADR-0013 already ratified.
source_reqs: # ptr+digest

- source: ../req-ret.md#REQ-RETR-12m # ptr+digest — AUTHORED here
- source: ../req-ret.md#REQ-RETR-12f # ptr+digest — CARRIED unamended: the total budget does not grow
- source: ../req-tls.md#REQ-TOOLS-6f # ptr+digest — the query-scoped clause this one fans out from
  anchor: # value
  target: packages/adapter-io/src/own-bands.ts (NEW — `Row`, `governingInvariants`, `governingGotchas`,
  `advisoryBand`; the module that owns WHICH stored facts a briefing may show),
  packages/adapter-io/src/own-source.ts (the feed hands over a labelled band; the false rationale in its
  docstring is corrected), packages/retrieval/src/own.ts (`OWN_ADVISORY_CAP`, the advisory fill, `ownEpic`),
  packages/retrieval/src/own-model.ts (NEW — the facet's data model, split out by role so the composer
  stays under the 400-line ceiling; `OwnSources.advisory`, `OwnPackPlus.advisory` / `.advisoryDropped`),
  packages/cli/src/own.ts (the advisory verb, the drop ledger and the guidance a user actually reads).
  interface_contract: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-12 # ptr+digest
- source: ../../adr/ADR-0002-freshness-watermark.md # ptr+digest — where the two-band decision is recorded
  exclusions: # value
- `OWN_CAP` is NOT raised. The advisory band is a SUB-cap inside the same 1500, filled LAST, so
  `tokenEstimate ≤ OWN_CAP` holds unchanged and `REQ-RETR-12f` needs no amendment.
- The GOVERNING band is not touched: same predicate, same order, same greedy best-fit budget. Pinned by a
  binary probe on a `T1`-only store where the ONLY diff is the three new band-declaring lines.
- `reference/atlas-retrieval.md#retr-12` — the INVARIANT's own prose — is NOT edited. Amending a ratified
  invariant is ADR-0013's declared surface, exactly as `wp-per-fact-freshness.md` recorded for
  `atlas-tools.md#tools-6`; the REQ-vs-INV divergence is REGISTERED in `req-ret.md` instead.
- `MINED_SCOPE` (`cli/src/mine.ts`) is NOT touched. It is a governance fence ("a mined fact has no actor,
  so nobody owns it"), not a retrieval key — `own` already selects by `primaryAnchor`. Changing it would
  move the authz surface (#187 / KNOW-11a), which is a different decision.
- The `atLeastT1` pre-filter inside `terrain.tier` is REMOVED rather than amended, and it moves no output
  byte: `terrainTier` starts at `'T2'` and only lowers, and `tierRank` ranks an unrecognized class LAST, so
  the filter could never change the answer. A no-op restatement of a governing predicate is what a reader
  mistakes for the predicate itself.
  action: # value (zero-decision recipe)
  Add `packages/adapter-io/src/own-bands.ts` with the three band builders, importing `atLeastT1`/`isAdvisory`
  from `@atlas/tools` (legal: the DAG allows `adapter-io → tools`). Add a REQUIRED `advisory` axis to
  `OwnSources` and `advisory` / `advisoryDropped` to `OwnPackPlus`. Add `OWN_ADVISORY_CAP = OWN_CAP / 2` and
  a CAP-WINS advisory fill placed LAST in `composeOwn`, overflowing into the existing `pullReachable` tail.
  Split the facet's declarations into `own-model.ts` (role split — the composer would otherwise exceed 400
  lines). Render the band under its own `advisory` verb in `cli/src/own.ts`, with `advisoryDropped` beside it
  and the advisory caveat in the guidance line. Author `REQ-RETR-12m` + `SCN-RETR-12m-1..4` and fan the
  amendment out across the RETR-12 restatements, `req-tls.md`, ADR-0002 and `reference/commands/own.md`.
  action_surface: # value
  [ Read, Edit, Write, Bash (build / vitest / the six named gates / the binary probes) ]
  guardrails: # value
- the advisory band is `isTier(t) && t === 'T2'`, NEVER `!atLeastT1` — an off-lattice tier is in NEITHER
- the tier predicates are IMPORTED, never restated: a third copy of a governing predicate is a third bound
- `OWN_CAP` does not grow, and the advisory band is filled only from what the governing band left
- no second token estimator: the sub-cap is measured with the `claim.length` proxy the briefing already uses
- a truncated advisory band reports its dropped count AND names every cut row in `pullReachable` (#130)
- every advisory row carries its own `Freshness`, fail-closed `DRIFTED` when the oracle cannot answer
  repair_budget: # value
  N: 1
  acceptance: # ptr+digest — AUTHORED here
- source: ../goldens-ret.md#SCN-RETR-12m-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12m-2 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12m-3 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12m-4 # ptr+digest
  deps: [ WP-per-fact-freshness ] parallel_group: —
  exit_predicate: # value
  `atlas own <path>` serves, on an `advisory` verb, the same fact `atlas query <path>` serves from the same
  store through the same binary ∧ a `T1`-only scope renders byte-identically apart from the band-declaring
  lines ∧ an off-lattice tier is in NEITHER band and is NOT counted as dropped ∧ the advisory sub-cap
  truncates deterministically, reports the drop and names every cut row in `pullReachable` ∧ `tokenEstimate`
  never exceeds `OWN_CAP` ∧ `tsc -b`, full `vitest` and all six named gates exit 0.
  context_refs: # closed list
- source: ./wp-per-fact-freshness.md
- source: ../goldens-ret.md
  verification: # value — how exit_predicate was actually checked, not just declared
  MEASURED FIRST and AFTER through the BUILT binary, against a COPY of the real 199-fact store, over a fixed
  probe tree at the mine sha `38f3f4b` (the same tree for both runs, so only the code differs):
  P1 own packages/adapter-io/src/policy.ts 0 inv / 0 gotcha / — advisory · tokenEstimate 188
  AFTER 0 inv / 0 gotcha / 1 advisory · tokenEstimate 435 — and the
  row is `advisory T2 b977326… [FRESH]`, the very row `atlas query` serves for that path.
  P2 own packages/adapter-io (44 anchored facts, the cap binds)
  BEFORE 0 inv / 0 gotcha · tokenEstimate 59 · 0 pull-reachable
  AFTER 0 inv / 0 gotcha / 2 advisory · tokenEstimate 709 · advisoryDropped 42 · 42 pull-reachable
  rows. The SUB-cap bound it, not `OWN_CAP`: the served band costs 650 of 750 while 791 of the total
  budget was still free.
  P3 tokenEstimate 188→435 and 59→709, both `≤ OWN_CAP` 1500.
  P4 the same invocation twice ⇒ `diff` exit 0, sha256 identical (`a7846a75…`).
  P5 a `T1`-ONLY store, built by emitting three `T1` facts through the binary: the BEFORE and AFTER
  briefings differ in exactly three lines — the `invariant:` band statement, the `, 0 advisory`
  counter and `advisoryDropped: 0`. Every `inv`/`gotcha`/`role`/`tier`/`finer`/`available` row and
  `tokenEstimate 118` are byte-identical. The governing band did not regress.
  RED→GREEN, twice, by `cp` backup and `diff -q` restore (never `git checkout` in a worktree holding
  uncommitted work):
  R1 SURGICAL — the pre-fix bound (`atLeastT1`) reinstated at the one line it now lives on in
  `own-bands.ts`: 4 of 6 tests fail, the first with `expected [ 'k:T0', 'k:T1' ] to deeply equal
[ 'k:T2', 'k:T2g' ]` — the defect's exact signature. Restored, `diff -q` clean, 6/6 green.
  R2 WHOLE-FILE — `own-source.ts` restored to its `d41aff4` bytes: 4 of 6 fail, now with BOTH bands empty
  (`expected [] to deeply equal …`), because the missing `advisory` axis makes the composer throw and
  RETR-9 returns the empty briefing. A different failure mode from R1, stated rather than blurred.
  Restored, `diff -q` clean, 6/6 green, `tsc -b` back to 0.
  ID LOAD-BEARING, measured rather than asserted, and the measurement CORRECTED the prediction. Deleting the
  `source_reqs` + `acceptance` blocks makes `id-integrity` exit 1 with FIVE new `ID-3` orphans — every id
  authored here: `REQ-RETR-12m` and `SCN-RETR-12m-1..4`. The prediction was three, copied from
  `wp-per-fact-freshness.md`'s note that ID-3's scan "matches ANY `REQ-`/`SCN-` token anywhere in a card
  body", which is no longer true: PR #108 narrowed ID-3 to STRUCTURED fields only, so naming an id in prose
  schedules nothing. That older card's verification block is stale on this point and is left as the record it
  is. The structured lists here are load-bearing for 5 of 5. The card was restored by `cp` and verified
  byte-identical with `diff -q`; the gate is back to exit 0.
