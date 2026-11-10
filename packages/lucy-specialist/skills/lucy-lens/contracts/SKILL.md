---
name: lucy-lens-contracts
description: "Contract review"
when: "The routed lens is `lens:contracts`."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Contract review

Follow changed public promises across producer and consumer. Open a child only when its concern appears: `lucy-lens-contracts-api`, `lucy-lens-contracts-semver`, `lucy-lens-contracts-data`, `lucy-lens-contracts-third-party`, or `lucy-lens-contracts-ipc`. Quote the contract and the changed line, identify the affected caller and concrete trigger. A merely possible incompatibility without a known contract is a question.
