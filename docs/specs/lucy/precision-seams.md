# Phase 4 precision: baseline facts and acceptance questions

Baseline: `750a23b8ed40af0ceef23f3323ae4910d470718a`. Readiness only;
no implementation, interface, data migration or temporal policy is frozen here.
Authority: `build-plan.md:322-325,337-341,688-695` and `design.md:752-763`.

## Approved requirements, literally anchored

- K10: "every item a model read" has `{ pack, rule, fingerprint, outcome }`;
  "Unread items are not listed" (`build-plan.md:322-325`).
- K13: "per project, with the all-project value as the prior for a project with
  no history"; "Only a catalog change to a rule (new version or config) returns
  a demoted rule to probation. Repository packs are always `active`" (337-341).
- `design.md:759-762`: at least 20 reads and at least half confirmed activates;
  "fewer than one in five of its last 20" demotes; a demoted window with no
  "unique confirmed finding" drops, sooner for high cost. `entries.ts:359-362`
  fixes window lengths 20 and high-cost 10. Four out of 20 is not below 0.2.
- `build-plan.md:688-693`: route reads derived status; noise drops demoted and
  dropped from model-facing results; probation is labeled; outcomes are K10
  inputs, and "no model sees a precision number". Artifact-only demoted items
  and dropped-not-run are distinguished by `design.md:759-761`.

## What the shipped baseline actually contains

1. `packages/core/src/review/catalog/index.ts:19-21,28-66,151-155`: Pack has
   version, backend, cost, template and status; Rule has pack/rule, class, lens,
   severity mapping, triage and static status. Ledger thresholds are catalog
   data. Rules have no explicit generation ID or per-rule version/config field.
   Catalog duplicate checks use `pack/rule` (`index.ts:223-225`); whole-catalog
   digest is computed at `index.ts:208` and changes for unrelated catalog edits.
2. `packages/core/src/review/route.ts:245-265` selects packs from catalog status;
   a path-required overlay returns its pack *before* the static dropped check.
   That is a pack-level routing seam, not evidence of rule-level non-execution.
   `review-toolkit/noise.ts:40-49,54-56,172-182,197-199` filters already-produced
   dropped items, retains demoted artifact-only, and orders active/probation.
   Filtering outputs alone cannot prove that a dropped rule did not execute.
3. `modules/maestro/coordination/src/v2/workflow/review-fanout.ts:489-495`
   maps reported read fingerprints to the first matching analyzer item's
   pack/rule/fingerprint and `pursued`; unmatched entries are discarded.
   At `:514` the lead is instructed to supply each outcome in the record call.
   This is **not** a host-derived outcome mapping or proof that every model read
   has a durable outcome. Quick has a separate path (`:273-293`).
4. `packages/schema/src/maestro-event.ts:7,11` imports/re-exports Review; actual
   definitions are `packages/schema/src/maestro-review.ts:108-115,119-141`.
   A K10 item records pack, native rule, fingerprint and outcome only; there is
   no candidate ID, explicit source-item-to-finding link, item time, tool version,
   effective rule configuration or per-rule generation. The receipt carries
   projectID, sessionID, validationRecordID, artifact base/head/digest, method,
   findings and optional routing/catalog digests and items. V2 remains decodable
   without those optional K10 fields; absence is not an empty completed review.
5. `modules/maestro/coordination/src/v2/tools/review-records.ts:280-287,349-380`
   binds the project to validated session, builds `ReceivedV2`, and publishes it.
   `:559-572` requires both digests and items for review-v2, normalizes the catalog
   prefix and strictly decodes item shape; it does not validate item provenance,
   uniqueness, coverage or outcomes against verifier records. `:367-377` derives
   a stable receipt ID and accepts exact content retry; conflict otherwise.
   Profiles `pr`, `artifact`, `audit`, `diligence`, `compliance` do not record
   receipts (`:532-555`): they cannot silently contribute K10 receipt history.
6. The event table (`packages/core/src/event/sql.ts:4-26`) has event ID, aggregate
   ID, per-aggregate seq, type and data, with unique `(aggregate_id, seq)`; it has
   no event timestamp column. Receipt aggregation is `sessionID`. Within one
   session, `review-records.ts:401-425` and `workflow/review.ts:161-195` read
   descending seq for a particular validation/tree; they are newest-receipt
   readers, not a chronological cross-project K13 stream with tie-breaking.
   No such cross-session reader is established by these anchors. Sequence values
   from distinct sessions cannot alone order one project's or all projects' data.
7. `packages/schema/src/session.ts:20-24,37-44` associates Session `projectID`,
   created/updated times and `Location.Ref`; `schema/src/location.ts:8-20` has
   directory, optional workspace ID and project identity on `Location.Info`.
   Receipt `projectID` is already explicit; neither directory nor Session created
   time is a demonstrated order of receipt creation across sessions.

## Adapter boundaries and unresolved evidence

Core has catalog/routing/noise seams; Maestro owns the receipt writer and the
existing session-scoped readers. The approved dependency direction is Schema to
Core/Protocol, then Core/Protocol to Server; Core cannot import Maestro to read
events. These facts do not freeze a new adapter or public API.

A catalog digest identifies the entire catalog, not the changed rule's generation.
The cited receipt contains no historical catalog body or guarantee of an archived
digest-to-catalog lookup. Pack version and effective per-rule configuration at
receipt time therefore cannot be reconstructed from that digest alone on these
anchors. A source item's fingerprint also does not by itself link the item to a
confirmed finding or define uniqueness across reviews. Time/order across sessions,
within-receipt ordering, legacy/missing binding behavior and receipt provenance
need an explicit lead-frozen rule backed by actual durable evidence; none is
inferred here. A rule's new version/config versus unrelated catalog change must
be distinguishable before a reprobation claim is made.

## Smallest acceptance questions before authoring

These are requirement questions for the lead, not choices made by this packet.
Each requires a positive control, a negative boundary, and deterministic replay.

- **Boundaries:** 19/20 reads, 9/10 and 10/20 confirmations; last 20 with 3 vs
  4 confirmed; demoted 19/20 and high-cost 9/10 post-transition reads. What is
  the window start, sliding/completed behavior and transition precedence?
- **Identity/retry:** same `(pack, rule, fingerprint, outcome)` repeated within
  one receipt versus exact retry of the receipt; conflicting repeated outcomes.
  What counts as one read, and what is the deterministic item order?
- **Uniqueness:** the same fingerprint confirmed across reviews and projects vs
  a genuinely distinct confirmation. What is "unique" and in which scope?
  Preserve replay after restart and duplicate native rule IDs in different packs.
- **Generation:** rule version/config alone changes vs unrelated catalog edit;
  distinguish old and new receipts without inventing historical catalogs. What
  evidence is authoritative, and what happens when it is unavailable?
- **Project/prior:** a project with no history vs its first local read; old V1/V2
  receipts without K10 fields vs an explicit empty `items` array. When does local
  history override the all-project prior, and how are missing histories handled?
- **Delivery:** host K10 read/outcome provenance, unread exclusion, `not-pursued`
  and `refuted`, repo always active, dropped execution rather than only filtering,
  demoted artifact retention, and no model-visible precision numbers. How is the
  existing model-supplied receipt input validated against host-observed reads?
- **Ordering:** equal/cross-session receipt positions and multiple items within
  a receipt, replayed in different storage retrieval orders. What durable ordering
  and tie-breaker satisfy the selected window semantics?

Future scoped CI is `bun run test:ci core test/review/ledger.test.ts
test/review/route.test.ts test/review-toolkit/noise.test.ts` after the lead's
freeze. No tests, CI, build, typecheck, binary, API or evaluation ran here.
One final bundled epic remains required; this packet is not phase 4 delivery.
