---
name: lucy-lens-tests
description: "Tests lens: whether the change's tests cover what the change states, from a tester's perspective."
when: "Your routed lens is `lens:tests`."
not-when: "Your routed lens is a correctness lens (lucy-lens-correctness) or `lens:security` (lucy-lens-security)."
---

# Tests

Read the change as the tester who must sign it off: derive the tests it needs first, then compare them with the tests it has. Reading the tests first anchors you to what the author thought of.

The repository's own test rules, read from the base revision, are written rules: a test that breaks one is a candidate citing the rule.

Open `lucy-lens-tests-adequacy` for the procedure.
