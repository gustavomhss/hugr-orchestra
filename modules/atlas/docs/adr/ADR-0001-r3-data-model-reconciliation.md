# ADR-0001 — R3 data-model reconciliation (DEFINE-flagged field surfacing)

- **Status:** Accepted (2026-07-19)
- **Owner-authorized:** yes ("Faço a reconciliação R3 agora (lead)")
- **Spec author:** bobby (architectural seat), grounded against reqs + goldens + ref FLAG text, refute-first.

## Context

The frozen scaffold deliberately refused to invent five ref-FLAGged fields (R3 in `docs/roadmap/wave-plan.md:65`),
failing closed at BIND. `WP-5.14` (authz) and `WP-5.15` (fast-path) parked on them; `WP-7.32` parks on a
sixth (persist `VersionDeltaEntry.provenance`). Main is green; **~17 merged `GroundedFact` object-literals
(src + test)** and the fast-path's "pure + total" discipline constrain the shapes.

## Decision

1. **Surface `owner?: string`, `scope?: string`, `predicateSlot?: PredicateSlot` — OPTIONALLY — on
   `AdvisoryNode` + `PredicateNode`** (`packages/knowledge/ref/types.ts`). Grounded by REQ-KNOW-11a
   (owner/scope), REQ-KNOW-15b/4g (predicateSlot); the `string`/closed-`PredicateSlot` pins already exist.
   **Optional** preserves the ~17 merged literals; the KNOW-11 "every fact MUST carry owner+scope" is
   enforced **behaviorally** by the `WP-5.14` emit/authz facet + conformance goldens, not by the type.
2. **Change `FastpathApi.route(candidate)` → `route(candidate, ctx: RatifyContext)`** with
   `RatifyContext = { contested: boolean; lowRisk: boolean }` (`packages/knowledge/ref/fastpath.ts`).
   Both are store/threshold-derived verdicts the `WP-5.15` ratifier computes UPSTREAM — **not** `Candidate`
   fields — mirroring the ratified `writeDecision(candidate, cfg)` precedent (`router.ts`). `route` still
   computes the candidate-intrinsic conjuncts (grounded/T2/advisory) itself and stays pure + total.
3. **Do NOT add `provenance` to the kernel `Event`.** (Refuted: not ref-FLAGged, not in R3, would
   reintroduce the `actor`/`at` fields fspec-merge deliberately dropped, and inverts layering — the kernel
   must not know about WPs.) The PERSIST-14-c _membership_ contract is already met by
   `VersionDeltaEntry.provenance: unknown` (opaque-by-design). Any typing is a **persist-local** `WP-7.32`
   decision at its seal, sourced by the event→commit→PERSIST-3-trailer join.
4. **Leave the door-2 `lowRisk` threshold as OPEN-DEFINE** (`ref/hits.ts` `DecayConfig.threshold`) — a
   genuine DEFINE residue; the boolean _verdict_ is a `RatifyContext` input, the _threshold value_ is not
   invented here.

## Consequences

- Main stays green: all additions optional / zero-caller (verified — `tsc -p knowledge` clean, 68 merged
  knowledge tests pass; the `route`/`RatifyContext`/`authz` symbols have no in-tree caller).
- The `[FLAG]`s in `types.ts` (no stored owner/scope/slot), `fastpath.ts` (contested + lowRisk seam) are
  **discharged**. `authz.ts`'s `fact.scope` FLAG resolves once `WP-5.14` builds against the surfaced field.
- Type-level does **not** enforce KNOW-11 presence — the behavioral gate does (documented, intentional).
- `route`'s 2-arg form obliges the `WP-5.15` ratifier to compute `contested`/`lowRisk`.
- The `lowRisk` threshold remains a DEFINE residue, recorded honestly (owner to pin when calibration data exists).

## Alternatives rejected

- **Required owner/scope/predicateSlot** — reopens ~17 literals incl. a `src` file, turns main red.
- **`contested`/`lowRisk` as `Candidate` fields** — refuted by `fastpath.ts` FLAG (store/threshold-derived,
  not candidate-intrinsic).
- **A store-port into `route`** — makes `route` IO-coupled/impure, violating pure + total.
- **`Event.provenance` on the kernel** — see Decision 3.

## Unblocks

`WP-5.14.KNOW` (authz owner/scope) · `WP-5.15.KNOW` (fast-path via `RatifyContext`). `WP-7.32.PERSIST`
provenance remains a persist-local decision (not this ADR).
