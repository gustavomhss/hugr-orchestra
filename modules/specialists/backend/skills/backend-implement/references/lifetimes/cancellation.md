# Cancellation and completion

## Applicability

Assigned cancellation, deadline or completion behavior for work the request or job owns: child tasks, producers, timers, subscriptions and the I/O they perform.

## Non-trigger

- Every `async` function or incidental concurrency primitive.
- A known cancellation defect without a supplied diagnosis: that is diagnosis, and belongs to its owner.

## Inputs

- The work and resource owner.
- The cancellation and completion contract: who may cancel, what must stop, what must be released, and within which bound.
- Deadlines, and the partial-result behavior after cancellation.

## Steps

1. Pass the real request or job context into every I/O call and child task.
2. Bind child work to its owner, so the owner's end reaches it.
3. On cancel or deadline, stop producers, timers and subscriptions, and release owned resources.
4. Where completion matters, wait for the work to actually stop; do not stop at sending the signal.
5. Map the cancelled outcome to the supplied result.

## Tools and outputs

- The runtime's existing context, scope or token primitives.
- Output: the lifetime wiring and cleanup.

## Limits and checks

- A cancel signal does not wait for work to finish; Go's `CancelFunc` is one example.
- A framework timeout is not forced termination, and may not produce the response envelope the contract requires.
- Cancelling the transport does not roll back effects already committed.
- A cancel that arrives while waiting on domain I/O needs an explicit bridge into that I/O.
- Checks observe stopped work and released resources within the supplied bound, for example by cancelling after the first item and while production is blocked. Observing only the cancel call proves nothing.
- Synchronization and cleanup placement within the ownership design are yours. A missing completion owner or cleanup obligation is a `packet` blocker.
