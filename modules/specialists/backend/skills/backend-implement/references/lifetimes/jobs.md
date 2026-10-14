# Job admission

## Applicability

A prescribed boundary between a database write and a job, such as "commit the order and enqueue its receipt together in the existing transaction".

## Non-trigger

- Choosing a queue or outbox architecture, or designing a dispatcher.
- Inferring external-effect uniqueness from a job key.

## Inputs

- Whether the selected queue supports transaction-bound insertion on the same database and handle.
- The queue schema, worker identifier and payload codec.
- The business operation identity and its conflict behavior; enqueue options.
- Who owns the commit, and who owns retries.

## Steps

1. Receive the caller's transaction handle.
2. Run the admission and business SQL through it. Decide new admission versus exact retry from the supplied identity semantics.
3. Insert the job only for a new admission, through the queue's transaction-bound API or SQL on the same handle.
4. Check both the business result and the queue result, then return to the transaction owner to commit or roll back.

## Tools and outputs

- The queue's native transaction-bound insert API or SQL, and a typed or validated payload.
- Output: the admission code, payload mapping and worker-boundary fixtures. Use the selected queue primitive; do not add a relay for a same-database path.

## Limits and checks

- After-commit enqueue is valid only when the owner assigns it with its failure handling: a crash between commit and enqueue leaves the write without its job. When joint commit is required, an after-commit helper is a `packet` blocker, not an interchangeable recipe.
- A pool-backed helper called inside the transaction callback does not join the transaction.
- Job keys are not permanent deduplication: they can be replaced while queued and vanish after completion. Workers may run a job again after its effect succeeded.
- Checks: with the worker paused, commit exposes both the write and the job and rollback exposes neither, observed from a second connection; the resumed worker sees the committed write. Drop the commit acknowledgment after the server commits, retry the same operation, and assert one admission and one job. A rollback-only test misses the after-commit gap.
- SQL shape, payload mapping and helper boundaries are yours. A missing atomic-enqueue capability, identity retention or failure policy is a `packet` blocker; do not switch the persistence or queue design.
