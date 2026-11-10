---
name: lucy-lens-tests-strategy
description: "Test strategy"
when: "The routed lens is `lens:tests` and this concern appears in the slice."
not-when: "The change does not touch this concern; use the routed lens instead."
---

# Test strategy

Start with the change intent and derive behaviour, failure paths and caller contracts before reading tests. Match each to an actual assertion and relevant boundary. An uncovered stated behaviour is `class:tests.missing`; an assertion unable to distinguish failure is `class:tests.weak-oracle`. Do not require a particular test layer or coverage percentage without a base rule.
