---
name: lucy-lens-security-supply-chain
description: "Supply-chain security"
when: "The routed security lens encounters this concern in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Supply-chain security

Inspect changed dependency sources, integrity checks, version selection and install-time execution. Follow a concrete untrusted artifact or dependency to the point it gains authority. Raise `class:security.supply-chain` when the changed lines and an existing trust expectation show the exposure; unknown upstream behaviour is a question.
