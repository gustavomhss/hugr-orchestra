---
name: lucy-lens-tests-oracles
description: "Test oracles"
when: "The routed lens is `lens:tests` and this concern appears in the slice."
not-when: "The change does not touch this concern; use the routed lens instead."
---

# Test oracles

Compare each assertion with the stated behaviour and the production path it should protect. Look for expected values copied from the implementation, mocks replacing the behaviour under review, and assertions that observe calls rather than effects. A concrete unguarded behaviour is `class:tests.weak-oracle`; do not assume a weak-looking assertion necessarily fails to catch the defect.
