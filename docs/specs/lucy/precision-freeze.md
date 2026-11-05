# Precision generation and replay contract

Construction base: `e2883a8e515ab3f4ec302e5a5ed66b20c4a53513`.
The reducer is Core-owned, synchronous and independent of Maestro. Durable host
observation admission is a separate integration obligation, not inferred from old
model-authored receipt items or from the existence of this reducer.

## Frozen pure boundary

`packages/core/src/review/ledger.ts` exports namespace `ReviewLedger`:

```ts
export type Read = {
  readonly pack: string; readonly rule: string; readonly generation: string
  readonly fingerprint: string
  readonly outcome: "confirmed" | "refuted" | "not-pursued"
}
export type Batch = {
  readonly id: string; readonly project: string; readonly order: number
  readonly reads: ReadonlyArray<Read>
}
export type Query = {
  readonly project: string; readonly pack: string; readonly rule: string
  readonly generation: string; readonly repository: boolean
  readonly cost: "low" | "medium" | "high"
  readonly thresholds: ReviewCatalog.Catalog["route"]["ledger"]
}
export function generation(pack: ReviewCatalog.Catalog["packs"][number],
  rule: ReviewCatalog.Catalog["rules"][number]): string
export function status(batches: ReadonlyArray<Batch>, query: Query):
  "probation" | "active" | "demoted" | "dropped"
```

Generation is SHA-256 of canonical JSON binding pack id/tool/version/pin/backend,
template/output/network/scratchWrites and the full rule except derived `status`.
Use recursively sorted object keys; arrays retain their order. This binds the
effective host rule configuration in current catalog data. An unrelated rule,
overlay, threshold, lens budget or derived status change does not reset a rule.
Effective configuration not represented in that catalog tuple must be added to
it before claiming that change reprobates the rule. Never infer old generations
from a whole-catalog digest or assume a legacy receipt has current generation.

## Admission and deterministic ordering

Batch order is a positive safe integer allocated at durable host observation
admission by one global sequence, not Session creation time or per-Session seq.
Within a batch, sort reads by lexical JSON `[pack,rule,generation,fingerprint]`.
One source item counts once per batch, even if multiple lenses saw it. Equivalent
batch id retries deduplicate; conflicting id contents or conflicting outcomes for
one source item fail `precision-conflict`. Distinct batch ids cannot share an
order; invalid/empty identity, generation or non-positive/unsafe order fails
`precision-invalid`. Retrieval order cannot affect replay. Explicit empty reads
is valid; a missing generation/outcome binding is not an empty valid batch.

All outcomes are host derived from delivered analyzer identities and settled
verifier results; model-authored receipt items alone are not admission evidence.
Unread retained items never contribute. No historical unbound data is relabeled.

## Windows and state transitions

Repository packs always return active. For other rules, consider only the exact
pack/rule/generation. If the project has any such local reads, use only that
project; otherwise use all projects as prior. Its first local read starts its own
probation window rather than inheriting sample counts from other projects.

Start probation. After at least `activate.read` samples, activate iff confirmations
divided by reads is at least `activate.confirmed`; before activation, a complete
`demote.window` with confirmed share strictly below `demote.confirmedBelow` demotes.
Activation wins if configurable thresholds overlap. Active demotes when its most
recent complete demotion window crosses that strict lower bound. Exactly 4/20
does not demote at 0.2. Do not drop in the same step that enters demotion.

Once demoted, do not reactivate in that generation. Starting after the demoting
read, evaluate completed non-overlapping drop windows: `drop.highCostWindow` for
high cost, otherwise `drop.window`. Drop if the complete window contains no newly
confirmed fingerprint not previously confirmed in this generation and scope.
A window with a new confirmation stays demoted and begins the next window.
Repeated confirmations of an old fingerprint do not rescue a window. Local
uniqueness is fingerprint; all-project uniqueness is `[project,fingerprint]`.
Dropped stays dropped until a different generation starts its own probation.

Thresholds must be positive integer windows, finite shares in [0,1]; invalid
thresholds fail `precision-invalid`. No sample count or precision number is part
of the model-facing API; the reducer exports derived status only.

## Acceptance

19/20 and 9/20 versus 10/20; 3/20 versus 4/20; ordinary 19/20 and high-cost 9/10
post-demotion windows; old repeated confirmations versus a new fingerprint;
batch/order/outcome conflicts and exact retry; shuffled storage order; unrelated
catalog edits versus rule version/config changes; duplicate native ids in distinct
packs; local-first-read versus global prior; repository active; invalid thresholds.
Future route/analyzer admission, dropped-rule execution suppression, durable
global ordering and K10 source binding must each be tested at their actual seam.
