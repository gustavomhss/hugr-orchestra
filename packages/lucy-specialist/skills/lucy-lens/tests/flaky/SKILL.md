---
name: lucy-lens-tests-flaky
description: "Flaky tests"
when: "The routed lens is `lens:tests` and this concern appears in the slice."
not-when: "The change does not touch this concern; use the routed lens instead."
---

# Flaky tests

Follow timing, ordering, shared state, random inputs and external dependencies to the asserted result. Identify a concrete scheduling or state trigger that could make the test fail for the same correct behaviour, or pass while a required behaviour fails. Use `class:tests.weak-oracle` only for the latter with a stated behaviour; otherwise report a question or coverage concern, not a fabricated class.
