# External retries and effect identity

## Applicability

A prescribed outbound effect, such as a payment refund, with a supplied retry identity and policy.

## Non-trigger

- A read-only mapping; it does not import a payment retry policy.
- Designing compensation or reconciliation, or adding blanket retries to every exception.

## Inputs

- The provider API and the SDK version.
- The business operation key and its account scope, and the immutable request.
- The provider's idempotency retention and the outcome after it expires.
- The job and SDK retry budgets, deadlines and cancellation, and which errors are retryable or terminal.
- The prescribed unknown-outcome result.

## Steps

1. Map the assigned input into the SDK call, passing the supplied stable business key as the idempotency key.
2. Reuse that same key across job attempts and processes. Never mint a new key for a retry of the same operation.
3. Set the SDK's retry and timeout options to fit the jointly supplied budget.
4. Map the returned identifier and status into the assigned result. A returned object is not necessarily a terminal success.
5. Follow the supplied branch for unknown outcomes.

## Tools and outputs

- The selected SDK, and fault fixtures that drop responses after the provider accepted the request.
- Output: the adapter and its error mapping. Not a new workflow platform.

## Limits and checks

- Provider idempotency, SDK transport retries and application retries have separate lifetimes and limits. An SDK may still retry a reset connection with retries set to zero; check the selected SDK reference before promising an exact attempt count.
- SDK defaults and per-request generated keys do not establish cross-job business identity.
- A timeout, connection loss or cancellation does not prove the effect failed. A database rollback cannot undo the provider's acceptance.
- Checks: drop the response after the provider accepts, rebuild the adapter, repeat with the same key and parameters, and assert the same provider identifier and state. A changed payload under the same key and the expired-key branch follow the supplied policy.
- SDK plumbing, error mapping and fixtures are yours. A missing retry identity, ambiguous-outcome branch, or SDK behavior incompatible with the supplied attempt budget is a `packet` blocker. Do not design an automatic resend for a provider without documented deduplication.
