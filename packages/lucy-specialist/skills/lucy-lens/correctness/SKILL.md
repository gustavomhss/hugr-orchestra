---
name: lucy-lens-correctness
description: "Correctness lenses: logic and contracts, edge cases, concurrency windows, failure paths."
when: "Your routed lens is one of `lens:correctness-logic`, `lens:correctness-edges`, `lens:correctness-concurrency` or `lens:correctness-reliability`."
not-when: "Your routed lens is `lens:tests` (open lucy-lens-tests) or `lens:security` (open lucy-lens-security)."
---

# Correctness

Four lenses, each its own pass over the same slice. Open only the one your route names; the others run in other Sessions.

A correctness candidate names the property it breaks in one sentence, so the verifier can test that property and nothing else.
