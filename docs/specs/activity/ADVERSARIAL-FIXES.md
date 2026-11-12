# Adversarial planning corrections

The initial planning receipts below are historical. The continuation receipt at
the end records later implementation/test reviews and supersedes their old
readiness/count statements; PLAN.md and RECOVERY.md own current status.

Reviewed input: `d89a662b4ba4eff96367cea5a78b5f672b077f60`.
Scope: the plan, acceptance oracles and dispatch inputs. Runtime code remains
unchanged. These fixes do not claim the future registry/UI implementation exists.

## Finding closure

| Finding                                                                       | Correction                                                                                                                                                                             | Required future runtime proof                                                                                                              |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Same-path remove/reinsert was invisible through directory/strategy-only reads | Add producer WP-R0, persisted registrationID, transactional renewal/backfill and internal incarnation-aware reads. W1/W2 depend on R0. Path/time/rowid cannot stand in for that token. | G01–G04; W03/W04/W06 recreate without any observer query in the deletion gap and reject the held old read.                                 |
| An older same-instance response could overwrite a completed manual reading    | Canonical full snapshotRevision, exact decimal comparison and monotonic client acceptance, with serialized server reconciliation/publication and explicit context replacement.         | W04/W06/W09/W10/W12 hold GET 0, deliver POST 1 then GET 0; reverse cross-row POST snapshots; equal/large revisions and scoped error tests. |
| PLAN referred to an absent acceptance-map.json                                | Reference the actual acceptance-map.tsv.                                                                                                                                               | Local artifact-reference and map consistency checks.                                                                                       |

The normative decisions are in FIRST-WAVE-CONTRACT.md; PLAN.md assigns their
implementation and evidence to four WPs / eight tasks. Every WP and task keeps
all six mandatory quality fields. The first wave now contains G01–G04 plus
W01–W12: sixteen bounded acceptance items. Original A/S coverage stays distinct.

Original reviewed files and receipt remain historical. The current map contains
367 A + 16 S + 4 G + 12 W = 399 unique IDs, with unchanged product case text
and explicit pending/proposed executable evidence. No case is marked passing.

## Verification and independent re-review

Two new independent adversarial reviewers inspected the corrected documents
and the relevant real producer/migration code. Both returned APPROVE for the
corrections/preparation only, with no concrete P1/P2 findings. One checked
persisted incarnation, actual create/remove transaction callers, backfill/fresh
schema feasibility and delayed-read retirement. The other checked same-instance
response order, full snapshots, exact revisions, context replacement and scoped
errors. The lead inspected the changes and signs off on preparation only.

Arsenal plan_check returned ok=true for G01–G04/W01–W12, with no missing,
duplicate, orphan, dangling, write-conflict or atomicity findings. conflict_map
returned six CONFLICT_FREE pairs; dependencies include R0 → W1/W2, W1 → W2/W3
and W2 → W3. Source integration order is R0 → W1 → W2 → W3.

The local document consistency check passed: 399 exact unique oracle/map rows,
six mandatory fields on all four WP and eight task records, sixteen first-wave
items each owned once, actual TSV reference and readiness=false. This check is
not a product test suite. Completion guards passed (78 rules, 80 changed paths,
zero gate/warn findings and errors); targeted formatting and diff checks passed.
No runtime tests or typechecks were needed for these documentation-only changes.
The known missing Relay stop hook remains disclosed; review enforcement was
manual, not mechanical.

Implementation readiness remains false: exact anchor code, compilable stubs,
executable tests, hosted red baselines and final write-set approval are still
required. No owner database/schema migration or running-app restart occurred.

## Implementation continuation review — 2026-11-12

An independent cold cross-layer adversarial review at
b8ec973feb8b20b28e461b434d7f21dbfc095f8e inspected the actual persisted registry
source, Core serialized validation/state, canonical Schema/Protocol seam and
HTTP composition. It returned APPROVE with no concrete P1/P2 counterexample in
that bounded source scope. The reviewer checked unobserved incarnation changes,
fresh pre/post queries, immutable cumulative snapshots, capacity/failure recovery,
opaque-ID/authenticated targeting and sanitized errors. This is source review,
not hosted W2 green or an endorsement of unimplemented UI/actions/collectors.

W3 acceptance reviews separately found vacuous lifetime-reset assertions and
a missing same-ID stale-completion case. The tests now establish a complete
attempt and failed row before replacement, then prove both clear; another case
holds a replacement action busy/failed while retired completions arrive. Copy
assertions now explicitly verify entry count, gap count and age in both locales.
The separate rendered steps include zero versus unread partial and empty/filter/
failure/owner distinctions. Both disjoint coverage scopes received two fresh
consecutive clean reviews; independent quality review approved each bounded unit.

Current structure is four WPs/nine tasks, all with six required fields, and 399
unique acceptance rows. R0 and W1 alone are complete. W2's reviewed implementation
awaits its unchanged hosted green; W3's unavailable anchors await hosted red.
Guardrails have zero gates and one existing reviewed R0 warning. No local product
test, owner app/server restart or owner database migration occurred. Relay remains
manual because its stop hook is unconfigured.
