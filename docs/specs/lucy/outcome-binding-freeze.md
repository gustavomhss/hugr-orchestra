# Host outcome admission boundary

This extends K10/K13 on the check integration `c2a69f8658` and precision store
`af084bbb36`; neither foundation alone closes this boundary.

`workflow/review-result.ts` Candidate gains optional `source` (an analyzer item's
fingerprint). It is a claim to bind, not evidence on its own. A source association
is admitted only for an item actually delivered to that lens, matching candidate
class, path and overlapping inclusive range. A claimed unknown, unread, other-lens,
wrong-class or wrong-location source contributes no native outcome authority.
Candidates without a source remain valid model-originated candidates.

Core `review/outcomes.ts` exports namespace `ReviewOutcomes`:

```ts
export type Decision = {
  readonly source: string; readonly class: string; readonly path: string
  readonly line: number; readonly endLine?: number
  readonly state: "confirmed" | "refuted" | "question"
}
export function reads(input: {
  readonly delivered: ReadonlyArray<ReviewItem.ToolItem>
  readonly decisions: ReadonlyArray<Decision>
  readonly catalog: ReviewCatalog.Catalog
}): ReadonlyArray<ReviewLedger.Read>
```

Every unique delivered primary pack/rule/fingerprint produces exactly one read.
Unread retained entries produce none. Secondary `sources` on a noise-deduplicated
item are audit metadata, not separately delivered primary items. Duplicate equal
deliveries deduplicate; conflicting identity data fail `outcome-source-conflict`.
Resolve the exact catalog rule, otherwise its pack's `*` mapping; bind generation
using the actual native rule id in that mapping. Missing pack/rule configuration
fails `outcome-source-unknown`, never invents a generation or drops a read.

Only decisions with an actual matching source/class/path/range count. A confirmed
and a refuted decision for the same read conflict: outcome is not-pursued. With no
conflict, at least one confirmed decision yields confirmed; otherwise at least one
refuted and no question yields refuted; all other cases yield not-pursued. This is
host-bound verifier disposition, not a mechanical proof of the finding's logic.
Sort resulting reads by JSON `[pack,rule,generation,fingerprint]`.

Fanout records initial capped analyzer items exactly when their prompt is admitted
through Port.run, and successful page results through a host-only `observeItems`
callback on BindInput. The callback is `(items: ReadonlyArray<ReviewItem.ToolItem>)
=> void`. Capture deliveries per lens Session so an invented other-lens source
cannot borrow another Session's data. Do not use LensReturn.items or model-authored
receipt items as a delivery oracle. A merged candidate retains the union of its
validated source associations. Only settled host-validated verifier decisions
contribute confirmed/refuted; unoffered histories, overflow and questions do not
become confirmations. Quick has no host verifier list, so its delivered native
items remain not-pursued; no confirmation is inferred from an untrusted Quick card.

The ran Result carries required `outcomes: ReadonlyArray<ReviewLedger.Read>`.
FinishAuthorization also carries outcomes for pre-publication governed recording.
Its outcomes property reads the current host collection, including Quick pages
delivered during the combined hunt/finish drain. Result outcomes are collected
after that drain returns, not frozen before its tool calls. Authorization also
has `seal: () => ReadonlyArray<ReviewLedger.Read>`: after a synchronous preliminary
items comparison, recordReview seals and rechecks the exact snapshot before any
receipt publication. Further page delivery fails `outcome-delivery-sealed` before
returning new items to the model. Repeated record calls reuse the sealed snapshot.
The getter and seal callback are host-local metadata, never serialized into facts
or model prompts. Card-only PRs seal only after their completed drain. There is no
extra provider turn or change to the Quick budget.
The governed `maestro_record_review` input's items must equal the host outcomes
projected to pack/rule/fingerprint/outcome, with order immaterial but no duplicates,
omissions or inventions. A legacy method cannot bypass an active scoped finish.
The finish prompt supplies these exact outcomes, not instructions to invent them.

PR immutable facts persist outcomes strictly. On first response and exact completed
retry, admit those facts through ReviewPrecisionStore only after card validation,
using review id `pr:${candidate}` and the host parent project id. Equivalent retry
reuses its durable order; a corrupt/missing original fact never causes provider
reexecution. Governed admission uses the immutable receipt id after recordReview
succeeds, project from the validated parent, and the host authorization outcomes;
no model supplies generation/project/admission order. Retry receipt publication
and precision admission reconcile independently without pretending two event
streams are one transaction; an incomplete precision admission is an explicit
failure, not a successful completed precision observation.

Source collection and outcome admission do not yet apply derived rule states to
execution. That separate route/analyzer seam must suppress dropped native rules,
keep demoted output artifact-only and expose probation labels without numbers.
