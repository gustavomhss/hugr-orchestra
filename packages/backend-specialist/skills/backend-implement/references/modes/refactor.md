# Prescribed refactor mode

## Applicability

The packet prescribes a structural change, such as a move, extraction or rename between named seams, and the external behavior to preserve: wire format, data results and resource lifetimes.

## Non-trigger

- Choosing the architecture or the target seam yourself.
- A requested change that alters accepted inputs or outputs. That is not preservation; return a `packet` blocker quoting both sides.
- A framework major upgrade, such as Fastify 4 to 5. That is a separate [migration or compatibility](migration.md) assignment.

## Inputs

- The shared packet fields.
- The old and target seams, and the relevant consumers supplied as context.
- The wire, data and lifetime invariants to preserve.

## Steps

1. Move, extract or rename within the supplied boundaries.
2. Adapt the callers the packet assigns. An unassigned caller that needs a change is a `packet` blocker.
3. When symbol identity matters, use a binding-aware rename. Syntax matching alone does not prove symbol identity.
4. Run the compiler and the preservation checks.

## Tools and outputs

- Native edits, or a structural transform the packet already selected.
- Output: the requested structural delta, with the same contract outcomes as before.

## Limits and checks

- Do not silently tighten validation or redesign a public interface while moving code.
- Successful compilation is not preservation evidence. Run the supplied seam and preservation checks.
- Example: moving handler logic into a supplied service seam on the existing Fastify major keeps plugin and schema visibility, parsed values and error handling; the original request, response and error cases keep their outcomes, and unrelated files stay outside the delta.
