---
name: lucy-lens-tests-smells
description: "Test smells"
when: "The routed lens is `lens:tests` and this concern appears in the slice."
not-when: "The change does not touch this concern; use the routed lens instead."
---

# Test smells

Read changed tests for removed assertions, unconditional success, skipped paths, hidden errors and fixtures that prevent the interesting branch. Link each concern to an actual stated behaviour: a test that cannot distinguish its failure is `class:tests.weak-oracle`; a removed unique case is `class:tests.missing`. Style alone is not a candidate.
