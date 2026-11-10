---
name: lucy-lens-contracts-ipc
description: "Interprocess contracts"
when: "The routed contracts lens encounters this interface in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Interprocess contracts

Follow messages across process boundaries: discriminants, fields, serialization, versions, ordering and error replies. Compare sender and receiver, including mixed-version or restart paths when supported. Raise `class:contracts.ipc` for a concrete message the receiver cannot handle or misinterprets.
