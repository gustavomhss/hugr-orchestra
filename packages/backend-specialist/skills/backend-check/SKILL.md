---
name: backend-check
description: "Procedure for assigned test implementation and for checks that need a specialized fixture: real databases and services, prescribed transport faults, HTTP boundary fixtures, schema-derived, property or stateful inputs, and streaming or concurrency cases. Load with backend-implement when the packet assigns tests or a named check needs such a fixture. Not for ordinary checks, and never for writing tests the packet does not assign."
---

# Backend checks and assigned tests

This skill adds fixture and test procedure to `backend-implement`, which you load first. It sits under your system prompt and never widens it. The packet decides scope, design, write paths and checks; where this skill and the packet disagree, follow the packet.

Ordinary checks are part of `backend-implement`; do not load this skill to run them. When the packet assigns test implementation, read [assigned tests mode](../backend-implement/references/modes/tests.md) first.

## When this applies

- Applies: the packet assigns tests, or a named check needs a real service, a prescribed fault, an HTTP boundary fixture, generated inputs or a streaming or concurrency observation.
- Does not apply: running existing checks as they are; tests the packet does not assign, which you never write or change.
- Not yours: the oracle, the acceptance properties, which services and versions to use, the development environment, and diagnosing a failure the tests detect. Return a `packet` blocker that names the owner.

## Inputs beyond the common packet

- Scope and oracle: requirement or test IDs, the entrypoint and test file, and the expected result or status for every case, negative cases included.
- Services and libraries already selected, with versions, image or executable, connection settings and topology.
- Existing seams: the application factory, migration hook, connection or base-URL injection, and an independent observation query.
- Isolation and faults: state ownership, namespaces, fixture lifetime, a fixed seed or clock, cleanup order, and the exact fault only when one is prescribed.
- Commands with their working directory, deadlines and retry budget.
- Authorized files. Dependency changes only when the manifest and lockfile are in the write paths.

## Select the reference

- [Real services and databases](../backend-implement/references/checks/real-services.md)
- [Prescribed transport faults](../backend-implement/references/checks/faults.md)
- [HTTP boundary fixtures](../backend-implement/references/checks/http-fixtures.md)
- [Generated inputs](../backend-implement/references/checks/generated-inputs.md): schema-derived requests, properties, stateful sequences and parser round trips.
- Streaming and concurrency observations: the check rules in [cancellation](../backend-implement/references/lifetimes/cancellation.md), [streams](../backend-implement/references/lifetimes/streams.md), [job admission](../backend-implement/references/lifetimes/jobs.md) and [retries](../backend-implement/references/lifetimes/retries.md).

Framework test harness APIs live in the references your stack selects.

Stack references: [Go](../backend-implement/references/languages/go.md), [Python](../backend-implement/references/languages/python.md), [JavaScript/TypeScript](../backend-implement/references/languages/js-ts.md). Read only the packet's language.

## Common procedure

1. Reuse the supplied fixture first. Add a library only for a concrete missing mechanism, and only when its manifest is in the write paths.
2. Write cases against the actual implementation through its real boundary. Never copy production logic into the test.
3. Observe outcomes independently: committed state through a second connection, recorded requests through the fixture, not the application's own report.
4. When the packet prescribes controls, show that the healthy case passes and the known-violating case fails for its named reason.
5. Run the exact assigned command from its working directory.

## Honest evidence

- A forced skip, zero selected cases, an absent fixture, a fault hook that was never reached, or a generator that rejected every input is never a pass, whatever the exit code: record `acquisition-error` with the reason, unless the packet itself asked for the skip.
- A failing case that detects a production defect does not authorize an unassigned repair, and you never weaken a test or its acceptance to make it pass. Report the failure with its reproducer: the concrete input or trace, the fixture recipe and the versions.
- A prescribed proof or verifier run is a named check like any other: run exactly what the packet names and report what it showed.
- Your checks show what ran and what it observed. Whether the work is verified is decided by the host's own run, and acceptance by the caller; never claim either.

## Your choices and the caller's

Yours: assertions, examples, generators and fixture arrangement inside the supplied oracle; small SQL or JSON fixtures in authorized files.

Not yours: a missing oracle, a new service or environment, a defect that needs a new diagnosis or scope, and widening acceptance. Each is a `packet` blocker. A missing service or tool is a `check-unavailable` blocker that names it. Return the result as `backend-implement` describes.
