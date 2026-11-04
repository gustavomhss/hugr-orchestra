---
name: lucy-lens-correctness-logic
description: "Logic and contracts lens: invariants, pre- and postconditions, callers of a changed contract, error paths, and questions that force an answer."
when: "Your routed lens is `lens:correctness-logic`."
not-when: "The defect needs two actors or a scheduling point (lucy-lens-correctness-concurrency), or it is about how a failure is handled, retried or timed out (lucy-lens-correctness-reliability)."
---

# Logic and contracts

## Applicability

Every changed function, method, handler, reducer or query. This lens asks whether the code does what its contract and the intent say, on the inputs it is meant to handle.

## How to look

1. **Extract the invariants.** For each changed unit, write what must hold before it runs, after it returns and across calls: a count that matches a list, a status that only moves forward, an id that is unique, a field set together with another. Take them from the context sheet, the types, the tests and the surrounding code. Each one has its line.
2. **Check every exit against them.** Walk each return, throw, early exit and `continue`. An exit that leaves an invariant broken is a candidate.
3. **Read the contract from both sides.** For a changed signature, return shape, default, error type or ordering guarantee, find its callers with code search and read how each one uses it. A caller that still relies on the old behaviour is a candidate on the caller's line, with the changed line as its cause.
4. **Read the error paths.** For each operation that can fail, name who receives the failure and what state is left. A failure turned into a success value, a partial update returned as complete, or an error swallowed so the caller cannot tell, is a candidate.
5. **Ask questions that force an answer.** Not "is this right?" but: what does this return for the empty case? Which caller passes `null` here? What happens on the second call? What does the old code do on this input that the new code does not? Answer each from the code, with its line, or leave it as a question.

## Classes

- `class:logic.invariant`: an exit or an update that leaves a stated or extracted invariant broken.
- `class:logic.contract`: a changed contract that a caller, an implementation or the intent still expects in its old form, or a result that does not meet the postcondition the code or intent states.
- `class:logic.error-path`: a failure that is lost, misreported or leaves inconsistent state.

## Limits

- An invariant you invented with no line behind it is not a rule. Say where it comes from, or drop it.
- Input categories nobody enumerated belong to the edges lens; report them there only if your route includes it.
