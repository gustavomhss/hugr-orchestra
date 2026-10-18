# Streams, cursors and batches

## Applicability

- An assigned cursor, batch, backfill or export whose consumption holds database resources.
- A response body or producer that keeps running after the handler returns, such as a streamed export that holds a transaction or a concurrency permit.

## Non-trigger

- A DTO map over rows that are already materialized.
- Choosing a throughput strategy, profiling memory, or adding a cache.

## Inputs

- The actual return type: array, cursor, rows or batch.
- Whether the handle is acquired by your code or borrowed from the caller.
- The consumer and transaction lifetime, batch size and concurrency.
- Cancellation and error behavior, and the supplied checkpoint or partial-progress semantics.

## Steps

1. Read in bounded batches through the selected driver's native cursor, rows or batch API.
2. On full drain, early stop, consumer failure or cancellation, close the cursor, rows or batch and check its error.
3. Close the cursor before ending the surrounding transaction, and before releasing the connection. A borrowed handle stays the caller's to release.
4. For a response body, keep the transaction, snapshot or permit owned by the body or producer until the body is consumed or dropped, not until the handler returns.
5. Map body errors through the channel the protocol allows after headers.

## Tools and outputs

- The native cursor, rows and batch APIs.
- Output: a bounded consumer or helper with explicit cleanup ownership, and early-stop and cancellation fixtures.

## Limits and checks

- A typed query that returns a list is materialized; wrapping it in an async iterator does not make it stream.
- An unread batch result can carry a later error; ignoring the close result hides it. A connection that cannot be restored must be discarded, not returned to the pool.
- A synchronous database API must finish its batch before any remote await; never hold a synchronous transaction open across an async consumer.
- Middleware that wraps the handler does not cover body consumption; dropping a permit when headers are sent releases capacity too early.
- Checks use a non-empty multi-batch fixture: full drain, early stop, consumer error and assigned cancellation, then confirm the next query or acquisition works. Releasing the client before closing the cursor must fail a cleanup-order check.
- Do not invent durable checkpoints. Streaming beyond the selected driver's capability, an unassigned dependency, or a lifetime that conflicts with the snapshot contract is a `packet` blocker.
