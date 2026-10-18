# Generated inputs

## Applicability

Assigned tests that use generated inputs over a supplied property or contract: schema-derived requests, property-based inputs, stateful action sequences, or parser round trips and fuzzing.

## Non-trigger

- Inventing properties or acceptance. Generators produce inputs, not oracles.
- An unbounded or mandatory fuzzing run the packet does not assign.

## Inputs

- Requirement IDs, target entrypoints or operations, and the schema revision.
- The input domain, preconditions, oracle and goldens.
- Fixture and fault semantics, and the runner with its working directory and budget.

## Steps

1. Select only the assigned operations and checks. Inferred links or relationships do not widen scope.
2. Generate inputs within the supplied domain, and add the prescribed explicit examples.
3. Reset real state, IDs, clocks and fault schedules for every trial and every shrink.
4. For stateful sequences, encode legal actions from the supplied protocol and check invariants at every step. Run the prescribed deterministic sequence too; a step budget does not guarantee a rule runs.
5. Await the property runner so failures reach the test runner.

## Tools and outputs

- The existing property, schema-driven or fuzzing library in the project's runner.
- Output: the tests, and a map from requirement to test, oracle, cases and observed result or reproducer.

## Limits and checks

- Schema conformance does not prove business rules, pagination completeness or schema correctness. A documented 401 can satisfy a response schema while the success path never ran; confirm the expected authenticated result.
- A paired encoder and decoder can share one mistake, and a reject-everything parser passes a conditional round trip. Independent goldens and prescribed malformed cases matter.
- Never hide a failing assertion behind an assumption, a guard or a caught exception.
- Zero selected tests, all-rejected inputs or unsatisfied preconditions are missing evidence. Some fuzz runners exit 0 when no target matched; check the selected target and executed cases, not the exit status alone.
- Keep the concrete failing value or trace with the versions and fixture recipe; a seed alone cannot restore external state.
