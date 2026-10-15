# Diagnosed repair mode

## Applicability

The packet supplies the cause, the correction direction and the regression case or baseline evidence. You implement the correction; someone else owns the diagnosis.

## Non-trigger

- "The endpoint is broken, find out why": return a `packet` blocker that names the missing diagnosis and fix direction and who owns them. Give no cause hypothesis and make no edit for that part.
- New behavior with no defect: use [feature](feature.md) mode. Do not demand a diagnosis for a feature.

## Inputs

- The shared packet fields.
- The diagnosis and fix direction.
- The detecting case, or the supplied baseline evidence.
- Fix constraints and the behavior to preserve.

## Steps

1. Confirm the diagnosis and fix direction are present. If either is missing, return the blocker above.
2. Apply the correction at the seam the diagnosis names.
3. Regenerate artifacts only when the generator inputs actually change.
4. Run the same detecting case and the preservation checks.

## Tools and outputs

- The existing test runner and the domain recipe, not exploratory probes.
- Output: the correction tied to the diagnosed defect, the regression outcome and the preserved cases.

## Limits and checks

- Never invent red-to-green history. Capture a pre-fix result only when the packet assigns it; otherwise cite the supplied evidence.
- If what you observe contradicts the diagnosis, or a wider failure appears that the diagnosis does not explain, stop. Return a `packet` blocker with the observed output, addressed to the diagnosis owner, with no new hypothesis.
- Example: the diagnosis says a handwritten route bypasses already-generated validation. Bind the existing generated router to the real handler, keep authorization where it is, and implement the required error envelope. The supplied invalid payload is rejected before the domain call; valid and unauthorized cases keep their outcomes.
