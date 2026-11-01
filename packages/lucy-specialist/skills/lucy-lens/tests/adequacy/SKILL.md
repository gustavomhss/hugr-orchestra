---
name: lucy-lens-tests-adequacy
description: "Test adequacy: derive the tests the change needs, compare with the tests it has, and flag missing tests and assertions without teeth."
when: "Your routed lens is `lens:tests`, or the change adds, edits or deletes a test."
not-when: "The question is whether production code is wrong (a correctness lens), not whether a test would catch it."
---

# Test adequacy

## Applicability

Every change with behaviour a test could observe, and every change that adds, edits or deletes a test.

## How to look

1. **Derive the needed tests** before reading the change's tests. One per behaviour the intent or acceptance states. One per error path the change adds. One per changed contract a caller depends on. Each with the line that states it.
2. **Compare.** For each needed test, find the test that covers it, by name and assertion, not by file name. No such test is a `class:tests.missing` candidate.
3. **Read each new or changed test for teeth.** It must fail if the production change were reverted. Suspect it when it:
   - asserts only that nothing threw, or that a value is defined;
   - asserts a snapshot or a value it computed with the same code under test;
   - replaces the unit under test, or the dependency whose behaviour the change is about, with a double that returns the expected answer;
   - asserts that a double was called instead of the effect it causes;
   - copies the implementation's logic into the test to compute the expectation;
   - was loosened by the change: an assertion removed, a range widened, a case skipped.
   Each is a `class:tests.weak-oracle` candidate naming the production hunk it fails to guard. Whether it really has no teeth is proven downstream by fail-before/pass-after.
4. **Read deleted tests.** A deleted test whose behaviour still exists and has no other test is `class:tests.missing`, with the deleted test's base-revision lines as the quote.

## Severity

A missing test for a stated behaviour is P1. A test without teeth for a stated behaviour is P1. A missing test for an unstated edge is P2.

## Limits

- Do not ask for tests the change does not need. Coverage percentage is not a rule.
- A test that cannot run here is not a missing test; it is coverage for the lead.
- Do not judge whether the production code is right; that is another lens.
