---
name: lucy-lens-correctness-concurrency
description: "Concurrency lens: read for windows (a check or read, a scheduling point, then an act) and classify each by the race taxonomy."
when: "Your routed lens is `lens:correctness-concurrency`, usually because `overlay:concurrency` was routed."
not-when: "A single actor with no scheduling point between read and act (lucy-lens-correctness-logic); a failure that is retried or timed out (lucy-lens-correctness-reliability)."
---

# Concurrency

## Applicability

Code where two actors can touch the same state: async functions, workers, goroutines, threads, timers, wake and drain loops, event handlers, retries, and processes sharing a file, a row or a lock.

## How to look

Read for **windows**. A window is three things in order:

1. **A check or a read** of shared state: a flag, a map lookup, a row, a file's existence, a status.
2. **A scheduling point** after it: an `await`, a `yield`, a callback, a lock release, an I/O call, a channel send or receive, a fork, a `Deferred` wait, a process boundary.
3. **An act** that depends on what was read: a write, a start, a delete, a send.

Another actor can run inside the window and make the read stale. For each changed unit:

- Name the shared state and every actor that can reach it: a second request, a second wake, a retry, a timer, a dispose.
- Mark the scheduling points between each read and the act that uses it.
- Write the trigger as a numbered interleaving of named actors, at most four ordered accesses: "1. A reads idle. 2. A awaits. 3. B reads idle. 4. A and B both start a drain." Most real concurrency bugs need no more than four.
- Look at what the change removed as well: a lock, a single-flight guard or a serial loop turned into `Promise.all`.

## Classes

- `class:concurrency.atomicity`: a read and a dependent write meant to be one step are split by a scheduling point.
- `class:concurrency.order`: an action assumes another already happened, and nothing enforces the order.
- `class:concurrency.toctou`: a check on a file, a path or a resource, then a use after the resource could change.
- `class:concurrency.double-execution`: the same work starts twice: two wakes, a retry racing the original, a handler registered twice.
- `class:concurrency.use-after-dispose`: work continues on a resource another actor closed, cancelled or released.
- `class:concurrency.reentrancy`: a callback or an event re-enters the unit while it is mid-update.
- `class:concurrency.stale-read`: a value cached or captured before a scheduling point is used after it as if current.
- `class:concurrency.aba`: a value changes and changes back, so a comparison passes while the state behind it moved.

## Limits

- A window with only one possible actor is not a candidate. Name the second actor and how it gets there.
- Do not try to make the race happen; a verifier proves it.
- Language facts (what is atomic, which calls yield) come from your `team-stack` node, not from memory.
