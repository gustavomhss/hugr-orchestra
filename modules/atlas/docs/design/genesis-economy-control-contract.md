# G1 — economic admission and physical-attempt controls

Status: **offline contract preparation, not conformance or implementation acceptance**.
Parent: [retained global completion plan](genesis-global-completion-plan.md), AC-08, GO-I6 and DOD-5.
Historical inventory: `genesis-campaign-results/accounting-inventory-summary-v1.json`.

## Existing seams, inspected rather than inferred

- `modules/atlas/packages/adapter-io/src/llm.ts` defines the existing `ModelClient`/`LlmBudget` seam.
  `createSiteProposer` makes one logical completion call; `createCommandClient` enforces timeout, but
  explicitly cannot enforce `costCap` from subprocess output. The budget type's stronger summary comment
  is not evidence of a monetary bound. Do not reopen old per-file mining or select this as a conforming
  hard-currency route merely because it accepts that argument.
- `packages/llm/src/route/executor.ts` supplies `RequestExecutor.Service`. Its default layer wraps
  `executeOnce` in status retries. Counting one outer `execute` does not count its physical attempts.
  A scoped execution may inject this existing service or instrument the actual underlying transport;
  it must not change the application's global retry policy or create a competing provider client.
- `packages/llm/src/protocols/openai-responses.ts` lowers `generation.maxTokens` to
  `max_output_tokens` and maps total/cache/reasoning usage. Reading those expressions proves lowering
  and mapping exist, not the selected model's real limit semantics or settled monetary charges.
- The preserved campaign helper journals a logical dispatch before admission and refuses duplicate
  labels. Its `providerInternalAttempts` is explicitly unreconciled. That journal is useful evidence,
  not a pre-existing physical-attempt reservation system.

## Boundary to preserve

Economic authorization/reservations belong to the campaign or host execution boundary, not the LLM
package's provider-neutral schema/protocol. Keep the same canonical request/usage types and the existing
executor service. A scoped executor must still expose normal typed failures; it must not turn quota,
admission or transport refusal into a successful empty model answer.

Use the existing durable checkpoint/journal ownership where applicable. Do not create a second
publication store, silently reset allowances between stages, or infer economic approval from a review PASS.
Original unresolved requests and unknown physical use remain original records, never overwritten by a
new retry, a new authorization or a synthetic conformance response.

## Required executable controls before a production guarantee

1. **Reserve before forwarding:** one approved envelope covers producer, evaluator, retry and concurrent
   requests. Every physical attempt reserves its applicable conservative bound before network forwarding.
   The request ID, exact body/input identity, provider/model, route configuration and promised bound are
   durable before it can execute. A failed journal acknowledgement prevents forwarding.
2. **Actual retry location:** synthetic retryable status and transport failures demonstrate whether an
   injected scoped executor makes one physical attempt or reserves each retry separately. A wrapper
   outside the default retry loop cannot satisfy this control just by recording one logical request.
3. **Concurrency:** two simultaneous admissions against one remaining allowance cannot both forward.
   Each accepted attempt has a unique durable reservation; no independent stage-local budget reset.
4. **Limit lowering:** fixture-first request preparation verifies the selected route carries the approved
   output bound in its native body. Unsupported or missing capability refuses before forwarding.
   Distinguish inclusive reasoning/output limits from separate metering; do not double-count subsets.
5. **Settlement:** confirmed actual usage settles only its matching reservation. Missing terminal usage,
   timeout after possible forwarding, or an interrupted request retains an unresolved reservation.
   Missing usage is not zero, and uncertain forwarded work is not automatically replayed.
6. **Restart/reuse:** restoring durable state preserves spent/unsettled reservations. Exact retry of an
   admission key reconciles identity without another reservation/forward; conflicting key reuse refuses.
7. **Teeth:** removing pre-forward reservation, retry accounting, the concurrency constraint or the
   required output-bound check must make its named acceptance oracle fail. A valid unchanged fixture
   must still pass. Tests use synthetic providers and the actual executor/adapter path, not a copied
   ledger or a fake function that merely reports the desired call count.

## Authorization and honest limits

No numerical model/output/currency envelope is invented by this contract. Derive input bounds from
the actual scoped packets and output obligations; request owner approval for the exact provider/model,
stages, retries and concurrency. Currency guarantees require a verified price/capability contract; a
token limit or one logical call is not a hard monetary cap.

The owner's separately approved G2.1 suite review permits one logical request to the existing Terra 2,
with no coordinator redispatch. Its authorization explicitly disclosed unresolved physical-attempt and
currency guarantees. Record that review and its usage separately; it does not certify this G1 mechanism,
settle old billing, create an allowance for another review or waive global AC-08.

These controls are not claimed authored/executed tests yet. Freeze the actual scoped integration
contract and test runner before implementation. Live conformance, if genuinely required after synthetic
controls, needs a separate bounded authorization and fixture recording; never silently set `RECORD=true`
or enter credentials. Do not restart the owner runtime to install an experimental observer.
