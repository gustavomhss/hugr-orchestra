---
name: lucy-lens-contracts-api
description: "API compatibility"
when: "The routed contracts lens encounters this interface in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# API compatibility

Compare changed signatures, defaults, errors and response shapes against base-revision declarations and actual callers. Trace a caller using an accepted input or relying on an output to the changed behaviour. Raise `class:contracts.api` with the conflicting contract and trigger.
