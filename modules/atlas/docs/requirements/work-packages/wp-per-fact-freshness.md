# Work Package — per-fact freshness on the read path, and the pack's two bands

> A remediation WP that DOES author ids, because it ships a ratified amendment rather than a repair: two new
> requirements (`REQ-TOOLS-6e`, `REQ-TOOLS-6f`) and seven new goldens. It also CARRIES `REQ-TOOLS-6d`, whose
> prohibition clause it amends — that id has been an `ID-3` orphan in the `id-integrity` ratchet since
> ADR-0002 added it after S4, and this card is the WP that ledger was waiting for, so its entry is removed.

### WP-per-fact-freshness — re-derive drift per fact on the read path, and split the pack into two bands

id: WP-per-fact-freshness
content_hash: <filled-at-freeze>
title: `atlas-query` serves a per-fact `Freshness` verdict (the existing GROUND-1 `driftDetect` over the
already-built axes) and a separately capped advisory band, WITHOUT weakening ADR-0002's `stale` watermark
intent: >
`atlas query` had exactly ONE freshness signal, and by ADR-0002's own Consequences it is repo-GLOBAL: any
HEAD advance flips `stale:true` for every row. MEASURED on the real 199-fact graph mined from Atlas at
`8ada771b`, read at `origin/master` `44026ae`, through the built binary and the built `dist/` modules: at
`origin/master` the shipped signal flags 199/199 rows where 14 actually drifted, and one commit touching
only `README.md` — a file NO fact is anchored at — flips all 199 to `true` while the per-fact oracle flags
ZERO. A signal that fires on every commit anywhere trains its reader to ignore it, and an ignored freshness
flag is how the 14 genuinely-rotten rows come to be read like the 185 sound ones.
The fix is not a new mechanism. `driftDetect` (GROUND-1, `packages/grounding/src/drift.ts`) is the SAME
oracle the write door's truth-gate already runs, over the SAME `Axes` the composition root already builds
once per process. It was simply never called on the read path, because `REQ-TOOLS-6d` forbade it — a clause
ratified against a GIT cost (`ADR-0002`: "a per-query HEAD-vs-`builtAt` tree diff", "a git-worktree
checkout ... on every query") that this mechanism does not have: no git call, no worktree, 78-89 ms cold /
~11 ms warm for all 199 facts. The owner ratified the amendment on 2026-08-03.
`stale` is UNTOUCHED, deliberately. It answers "is this view behind HEAD?" and is honest-conservative by
design; the per-fact verdict answers "did THIS fact's cited unit move?". A pack now says both.
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-6d # ptr+digest — prohibition clause AMENDED here (owner-ratified 2026-08-03)
- source: ../req-tls.md#REQ-TOOLS-6e # ptr+digest — AUTHORED here
- source: ../req-tls.md#REQ-TOOLS-6f # ptr+digest — AUTHORED here
  anchor: # value
  target: packages/contracts/src/pack.ts (`PackInvariant.freshness`, `Pack.advisory`, `Pack.advisoryDropped`),
  packages/tools/src/bands.ts (NEW — `ADVISORY_CAP`, `atLeastT1`, `isAdvisory`, `packTokens`, `splitBands`),
  packages/tools/src/query.ts (`createQuery` mints two bands), packages/tools/src/handler.ts (the
  `atlas-query` guidance row a user sees on every invocation), packages/adapter-io/src/pack-shape.ts
  (`FreshnessOracle`, `resolveFreshness`, `factToInvariant`, `mintPack`),
  packages/adapter-io/src/projection-query-index.ts (the oracle reaches the scope readback),
  packages/adapter-io/src/wire.ts (the oracle is BOUND to `driftDetect` over `config.axes`),
  packages/adapter-io/src/retrieval-model.ts + own-source.ts (the other two feeds),
  packages/cli/src/render.ts (both bands + the per-row verdict reach the user door).
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-6 # ptr+digest
- source: ../../reference/atlas-grounding.md # ptr+digest — GROUND-1: the oracle is `subtreeHash`
  exclusions: # value
- `Pack.stale` is NOT recomputed, NOT weakened and NOT made to depend on the per-fact signal. ADR-0002's
  watermark reasoning stays correct and in force; the amendment is purely additive (pinned SCN-TOOLS-6e-3).
- `reference/atlas-tools.md#tools-6` — the INVARIANT's own prose — is NOT edited. It is ADR-0013's declared
  surface and the lead reconciles that branch at merge; the divergence is RECORDED in `req-tls.md` beside
  `REQ-TOOLS-6b` rather than straddled silently. The requirements-corpus restatements (`method-tags-tls.md`,
  `properties-tls.md`, `goldens-tls.md`, `invariant-register.md`) ARE amended, because
  `spec-conformance-guard`'s AMENDMENT-FAN-OUT leg refuses an amendment that reaches only one file — this
  WP planned to leave them and the gate said no, which is the gate doing its job. Re-freezing the 19
  `@sha256:` pins in `properties-tls.md` (b86f0afa → aa329ac9) is the consequence of that fan-out.
- `atlas own` is NOT widened. It still bounds `T2` out of the briefing entirely (`own-source.ts` applies
  `atLeastT1` unchanged); only its per-row freshness now comes from the oracle. Verified in s28.
  **[SUPERSEDED 2026-08-03 by `wp-own-two-bands.md` / `REQ-RETR-12m`.]** This exclusion was the defect. It
  left the two read doors bounding the same store differently, and on the real 199-fact mined graph — where
  every fact is `T2` — `atlas own` served 0/199 while `atlas query` served them. The s28 assertion that
  "verified" it was verifying the exclusion, not a property. The amendment above now reaches `own`: same
  membership predicates, a sub-cap inside the unchanged `OWN_CAP`, governing band untouched.
- `packages/retrieval/src/pack.ts` (a LEDGERED reference model whose `fill()` no shipped door reaches) is
  made to COMPILE and no more: it projects its existing per-candidate `stale` boolean into the 3-state
  verdict and reports an empty advisory band with an honest `0` ledger. Amending it would move no shipped
  byte; the under-implementation is stated in the file rather than left for a reader to infer.
- `atLeastT1` is left DUPLICATED between `@atlas/tools` and `pack-shape.ts`. The stated reason for the
  duplication is measured to be wrong (the DAG forbids `tools → adapter-io`, not the sharing direction
  actually needed) and that is recorded in the file; de-duplicating a live governance predicate is a
  separate change.
  action: # value (zero-decision recipe)
  Add `freshness: Freshness` (REQUIRED) to `PackInvariant` and `advisory` / `advisoryDropped` to `Pack`.
  Add `packages/tools/src/bands.ts` with `ADVISORY_CAP = 2000` and `splitBands`, both band predicates stated
  as tier MEMBERSHIP. Point `createQuery` and `mintPack` at it. Add a `FreshnessOracle` seam to
  `pack-shape.ts` with a TOTAL `resolveFreshness` (absent oracle OR a throw ⇒ `DRIFTED`), thread it through
  `projection-query-index.ts` / `retrieval-model.ts` / `own-source.ts`, and BIND it in `wire.ts` to
  `driftDetect(fact.grounding, config.axes)`. Render both bands + the per-row verdict + the drop ledger in
  `render.ts`, and amend the `atlas-query` guidance row in `handler.ts`. Amend `REQ-TOOLS-6d`'s prohibition
  clause and ADR-0002 (append an AMENDMENT section; reverse nothing).
  action_surface: # value
  [ Read, Edit, Write, Bash (build / vitest / the six named gates / the measurement harness) ]
  guardrails: # value
- the advisory band is `isTier(t) && t === 'T2'`, NEVER `!atLeastT1` — an off-lattice tier is in NEITHER
- `stale` keeps its exact two legs (stored `DRIFTED` fold + N11 per-row watermark) and reads no verdict
- no second freshness enum: the field is the canonical `Freshness`, the type `driftDetect` already returns
- no second token estimator: the advisory cap is measured with the pack's existing char-count proxy
- no git call on the read path — the axes are the ones already built, never rebuilt per query
- a truncated advisory band reports its dropped count (#130), and a refused off-lattice row is NOT counted
  as dropped
  repair_budget: # value
  N: 1
  acceptance: # ptr+digest — AUTHORED here
- source: ../goldens-tls.md#SCN-TOOLS-6e-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-6e-2 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-6e-3 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-6e-4 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-6f-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-6f-2 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-6f-3 # ptr+digest
  deps: [ WP-7.26-b.TOOLS, WP-4.10-a.GROUND ] parallel_group: —
  exit_predicate: # value
  A fact anchored at a CHANGED unit reads `DRIFTED` on its own pack row while a fact at an unchanged unit
  reads `FRESH`, through the shipped seam over a real git tree and the real `driftDetect` ∧ the pack-level
  `stale` is byte-unchanged in its computation ∧ a row carrying `tier:'T3'` is in NEITHER band ∧ the advisory
  band truncates deterministically and reports the drop ∧ the governing band is unchanged for a graph with no
  `T2` row ∧ `tsc -b`, full `vitest`, and all six named gates exit 0.
  context_refs: # closed list
- source: ../../adr/ADR-0002-freshness-watermark.md
- source: ../goldens-tls.md
  verification: # value — how exit_predicate was actually checked, not just declared
  MEASURED FIRST, on the real 199-fact graph (mined at `8ada771b`), three trees, through the built binary
  (`packages/cli/dist/src/bin.js`) for the pack and the built `dist/` modules for the per-fact distribution:
  A tree at `8ada771b` — pack `stale: false` · 199 FRESH · 0 DRIFTED
  B tree at `origin/master` 44026ae — pack `stale: true` · 185 FRESH · 14 DRIFTED (TP 14, FP 0, FN 0)
  C A + one commit touching only `README.md` — pack `stale: true` · 199 FRESH · 0 DRIFTED
  Row C is the design case and it behaves as designed. `driftDetect` cost over all 199 facts: 78-89 ms on
  the first call in a fresh process (what the CLI pays), ~11 ms warm-median over 12 repeats, no git I/O, over
  axes already built (2.3-2.7 s, a cost `composeRuntime` already pays). End-to-end `atlas query packages`:
  4.9-5.6 s before, 5.0-6.2 s after — the added pass is inside the command's own run-to-run noise.
  AFTER, through the built binary on the same three trees: the 199 facts that were entirely INVISIBLE now
  arrive as `advisory T2 <id> [FRESH|DRIFTED]: …` rows, 6 served under the 2000-token cap with
  `advisoryDropped: 193` printed beside them, `tokenEstimate: 1715`, and `stale` unchanged from before
  (A false / B true / C true).
  RED→GREEN, both directions, by `cp` backup: with `projection-query-index.ts` restored to its pre-change
  bytes, `SCN-TOOLS-6e-1` fails `expected undefined to be 'DRIFTED'`; restored by `cp` and verified
  byte-identical with `diff -q`, it passes.
  ID LOAD-BEARING, measured rather than asserted — and the result is PARTIAL, stated as such. Deleting the
  `source_reqs` + `acceptance` lists makes `id-integrity` exit 1 with FIVE new `ID-3` orphans:
  `SCN-TOOLS-6e-2`, `SCN-TOOLS-6e-4`, `SCN-TOOLS-6f-1`, `SCN-TOOLS-6f-2`, `SCN-TOOLS-6f-3`. The other five
  (`REQ-TOOLS-6d`, `REQ-TOOLS-6e`, `REQ-TOOLS-6f`, `SCN-TOOLS-6e-1`, `SCN-TOOLS-6e-3`) do NOT go orphan,
  because ID-3's `wpRefs` scan matches ANY `REQ-`/`SCN-` token anywhere in a card body and this card names
  them in its own PROSE. So the structured lists are load-bearing for 5 of the 10 ids and the prose carries
  the rest; the card was restored by `cp` and verified byte-identical with `diff -q` (gate back to exit 0).
