---
name: lucy-lens-correctness-reliability
description: "Reliability lens: failure paths first, then retries, timeouts and partial progress that cannot be rolled back."
when: "Your routed lens is `lens:correctness-reliability`."
not-when: "The error path returns a wrong value on ordinary input (lucy-lens-correctness-logic), or the failure needs two actors in a window (lucy-lens-correctness-concurrency)."
---

# Reliability

## Applicability

Code that calls something that can fail: I/O, the network, a database, a child process, a parser, a provider. Most catastrophic failures in production systems come from error-handling code a simple test would have exercised, so read the failure path before the happy path.

## How to look

1. **List every operation in the slice that can fail.** For each, find where its failure goes.
2. **Read the handler.** Candidates: an empty `catch`; log and continue where the caller needed to know; a catch-all that turns every error into one type, so a retryable error looks fatal or the reverse; an error mapped to a success value; cleanup that runs on success only; a handler that throws a second error and hides the first.
3. **Read the retries.** Is there a bound? Is the retried operation safe to repeat, or does it repeat a side effect? Does it retry errors that will never succeed? Do two layers both retry, multiplying the attempts?
4. **Read the timeouts.** Does each external call have one? Does a timeout leave the operation running behind it? Is a timeout treated as proof the effect did not happen?
5. **Read partial progress.** A sequence of writes that fails halfway: does it leave visible half-state, and does anything undo or resume it? A changed default, flag or migration step: can it be turned back without data loss?

## Classes

- `class:reliability.error-handling`: a failure that is swallowed, misclassified, reported as success, or skips its cleanup.
- `class:reliability.retry`: a retry without a bound, a retry of a non-repeatable effect, or a retry of a permanent failure.
- `class:reliability.timeout`: an external call with no deadline, or a timeout whose outcome is assumed.
- `class:reliability.rollback`: partial progress with no undo or resume, or a change that cannot be turned back.

## Limits

- The trigger is the specific failure: which call fails, how, and at which step. "If anything fails" is not a trigger.
- A retry or timeout policy that a written rule or the intent fixes is not yours to redesign; report only where the code breaks it.
