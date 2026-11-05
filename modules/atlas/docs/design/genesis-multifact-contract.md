# Bounded multi-fact completion contract

Status: frozen design for implementation and acceptance, not a shipped-feature claim.
Baseline: `67b627220c1a2522132d8f22c8d8d00e8146bd3e`.
The existing per-claim CAS carrier is already remotely verified; it does not by itself implement this contract.

## Response and parser boundary

- Exactly one provider completion per visited site; existing site budgets, ranking and marginal-value policy stay.
- Line-format dependency/count/definition responses keep their existing single-line grammar and splice rejection.
- Block-format advisory/semantic responses keep exactly one `atlas-fact` fence. Inside it accept either the
  legacy single object or `{ "facts": [<fact>, ...] }`, with one to four objects. Keep the existing 8 KiB
  UTF-8 block-body limit. Reject oversized, empty, mixed single/collection, malformed or duplicate normalized
  claim collections rather than truncating them. Multiple fences, including an unclosed extra opener, refuse.
- A fact has a nonempty trimmed `claim` and optional `slot`/`derivation`. Semantic slot/derivation validation
  remains the existing semantic parser's responsibility; an invalid item is an individual tagged abstention,
  never an advisory downgrade. Every surviving item goes through the ordinary mechanical admission gate.
- `rawAnswer` for new block-format completions means the canonical **accepted proposal envelope**, containing
  only those three allowed fields per object. Discard surrounding scratch and unknown JSON fields; never
  retain chain-of-thought as the receipt. Every item from a collection shares that one envelope/answerRef.
  Historical CAS receipts remain unchanged and are explicitly legacy-format evidence.

The additive completion field is:

```ts
readonly claims?: readonly {
  readonly claim: string
  readonly slot?: unknown
  readonly derivation?: unknown
}[]
```

Keep `CompletionResult.claim` as the first claim for legacy direct callers; the production proposer and
host-answer path must explicitly consume the complete collection, never silently take only its first item.
The optional fourth `ClaimParser` parameter is `{ slot: unknown; derivation: unknown }`; legacy three-argument
parsers remain compatible. Add one shared completion-to-proposal mapper used by both production entry paths.

## Driver and worker boundary

`SiteProposer.propose` additionally accepts:

```ts
{ readonly proposals: readonly (SeedProposal | { readonly abstain: string })[] }
```

Legacy single/null/tagged-abstain results remain unchanged. The collection is bounded to four at the driver
boundary too; an empty/oversized collection is a tagged abstention, not a truncation. The extraction driver
calls the proposer once, admits items independently in response order, and advances the site budget/window
once. A site is productive if any item is admitted. Worker/pool transports carry the shared return type
without another hand-maintained union. Parent-thread mechanical admission and single-writer staging stay.

## Durable claims, judgment and publication

- Same place/slot keeps one NodeKey. Distinct claims keep distinct factRef grounds and optional answerRef in
  `claimEvidenceByClaim`; never make claims part of advisory place identity merely to avoid fixing readers.
- Distinguish provider calls, visited sites, independently admitted claims and durable candidate rows in
  reports. A repeated source-path Fact.id is not an independent-claim or durable-row identity.
- Judge every sampled individual claim using its own CAS fact, not just the representative row contentHash.
  A multi-claim sample ID is `nodeKey:factRef`, with the parent nodeKey and factRef recorded separately;
  single-claim legacy IDs stay their nodeKey. Malformed/missing individual receipts refuse before judging.
- Hold at place granularity: if a sampled claim is false/unverifiable or any claim is quarantined, the whole
  place stays staged. Keep all claims/receipts; no silent removal of a true sibling or selective publication
  of a rejected claim. Promotion plans deduplicate parent NodeKeys and reconcile exact sample IDs.
- Promotion validates all row receipts before presenting any claim. Each claim still goes through the same
  governed emit/authz/truth/ratification door. Carry receipt context only through trusted promoted-origin
  options, verified against actual CAS and normalized claim; authored payloads cannot forge this carrier.
  A row reports promoted only when all its presented claims settled. A partial refusal is reported honestly
  and fails publishing; do not claim cross-claim transactionality that the existing emit door does not have.
- Persist all promoted claims and their original receipts in the governed row. Existing Own projection can
  retain one place-level entry with its joined claims, but must not lose individual durable grounds.
- Publication negative checks cover parent NodeKeys and all individual factRefs, not only the latest pointer.

## Acceptance ownership

1. Adapter: singular compatibility; one bounded array; two distinct semantic derivations; shared canonical
   receipt; scratch exclusion; malformed/duplicate/oversized/spliced inputs; sound line grammar unchanged.
2. Driver/transport: one provider call and one site spend for two admissions; independent item refusals;
   marginal-window behavior; batch bounds; compiled worker transport; real disk CAS reload at one place.
3. Governed promotion: both claims/receipts survive; legacy behavior unchanged; bad receipt/quarantine/hold
   blocks the place; each admitted claim is ratified; authored receipt forgery cannot populate the carrier;
   partial durable settlement is not reported as full-row success.
4. Judge/publish: per-claim preparation, same-parent sampling IDs, fail-closed receipt reads, conservative
   whole-place holds, deduplicated promotion, exact judge/sample correspondence and all-receipt leak checks.

These are test-first work packages with disjoint write ownership. Cold suite review, remote behavioral red,
implementation/mutation verification and an actual bounded subscription run precede a completion claim.
