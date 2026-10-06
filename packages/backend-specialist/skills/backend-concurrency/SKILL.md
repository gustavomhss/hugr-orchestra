---
name: backend-concurrency
description: "Lifetime obligations for an assigned backend change: task and resource ownership, cancellation and completion, bounded streams and workers, job admission, external retries with effect identity, and assigned observability signals. Load with backend-implement when the packet assigns lifetime, admission, retry or backpressure behavior. Not for choosing delivery guarantees, a queue, a retry policy or a throughput strategy."
---

# Backend concurrency and lifetimes

This skill adds lifetime obligations to `backend-implement`, which you load first. It sits under your system prompt and never widens it. The packet decides scope, design, write paths and checks; where this skill and the packet disagree, follow the packet.

## When this applies

- Applies: assigned task or resource lifetime, cancellation, completion, admission, retry, backpressure, a stream body, or signals placed at lifecycle points.
- Does not apply: every `async` function, an incidental queue dependency, or a result that is already materialized. Profiling, adding a cache, choosing a throughput strategy and investigating an outage belong to other owners.
- Not yours: delivery guarantees, effect identity, the completion owner, queue or outbox architecture, retry and compensation policy. Return a `packet` blocker that names the owner.

## Inputs beyond the common packet

- The owner of each piece of work and each resource; the cancellation and completion contract; bounds and deadlines.
- The selected async runtime, queue and their versions, with acknowledgment, retry and idempotency semantics.
- For effects: the business operation identity, the immutable payload, the same-key-different-payload rule, retention and the outcome after expiry, retry budgets across the job runtime and the SDK, and the unknown-outcome branch.
- For streams and batches: the actual return type, whether the handle is acquired or borrowed, the consumer and transaction lifetime, batch size and concurrency, and partial-progress semantics.

## Select the reference

- [Cancellation and completion](../backend-implement/references/lifetimes/cancellation.md)
- [Streams, cursors and batches](../backend-implement/references/lifetimes/streams.md), including response bodies that outlive the handler.
- [Job admission](../backend-implement/references/lifetimes/jobs.md)
- [External retries and effect identity](../backend-implement/references/lifetimes/retries.md)
- [Observability signals](../backend-implement/references/cards/observability.md), when the packet assigns logs, metrics or traces.

Runtime APIs such as contexts, task scopes, `Send` bounds or thread-bound transactions live in the language and framework references your stack selects.

Stack references: [Go](../backend-implement/references/languages/go.md), [Python](../backend-implement/references/languages/python.md), [JavaScript/TypeScript](../backend-implement/references/languages/js-ts.md). Read only the packet's language.

## Common procedure

1. From the packet, name the owner of every piece of work and every resource.
2. Propagate the lifetime: pass the real request or job context into I/O, and bind child work to its owner.
3. Implement the supplied admission, bound and retry boundaries with existing primitives.
4. Place cleanup and completion for every exit: success, error, early stop, disconnect and deadline. Stop producers.
5. Report completion only when the work completed.

Facts that change the code:

- A cancellation request does not wait for the work to stop.
- A handler returning, or headers being sent, is not body completion. Resources the body needs live until it is consumed or dropped.
- An enqueue that returned is not a completed job, and queue uniqueness is not external-effect uniqueness.
- A timeout or a lost connection does not prove the effect failed. A database rollback cannot undo an external acceptance.

## Your choices and the caller's

Yours: local synchronization, cleanup placement, bounded queue or channel design, the cancellation bridge, loop and helper shape, SDK plumbing, error mapping and fixture hooks.

Not yours: a missing delivery guarantee, effect identity, completion owner, partial-progress rule or unknown-outcome branch; a new dependency; switching the persistence or queue design; a new retry policy. Each is a `packet` blocker.

## Checks

- Assigned checks observe completion, release and the business-effect count, not only that cancel was called or enqueue returned.
- A fault must happen at the named boundary. A lost-response case proves the fault came after acceptance or commit; a fault hook that was never reached is incomplete evidence, not a pass.
- Unit doubles check mapping only. They cannot show transaction membership, durability or provider idempotency, and a buffered HTTP test cannot show live disconnect timing.
- Report only what you ran. Return the result as `backend-implement` describes.
