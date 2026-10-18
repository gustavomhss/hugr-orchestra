# Assigned tests mode

## Applicability

The packet explicitly assigns test implementation: the production behavior or properties, the oracle, the target cases and the fixture or runtime.

## Non-trigger

- Running existing checks alone does not select this mode.
- Tests the packet does not assign: never write or change them.

## Inputs

- The shared packet fields.
- The behavior or properties under test and the oracle.
- The target cases, the fixture or runtime, and any generation or replay budget.

## Steps

1. Write the cases against the actual implementation, not a copy of its logic.
2. Wire the existing fixture or property library the packet selects.
3. Run the prescribed healthy and detecting controls with the existing test runner.

## Tools and outputs

- The existing test runner and the fixture or property library the packet selects.
- Output: the tests and fixtures, and the actual results for the selected cases.

## Limits and checks

- Assertions, examples and generators inside the supplied oracle are yours.
- Healthy behavior must pass and the supplied broken or control behavior must be detected. An unavailable control stays unverified.
- A test that detects a production failure does not authorize an unassigned production repair, and you never weaken a test or its acceptance to make it pass. Report the detecting evidence.
- A missing oracle, or a defect that needs a new diagnosis or scope, is a `packet` blocker.
- Pick a fixture that can observe the property: a transaction-managed fixture can hide commit behavior, and a buffered HTTP test cannot prove live disconnect timing.
