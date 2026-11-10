---
name: lucy-lens-contracts-data
description: "Data compatibility"
when: "The routed contracts lens encounters this interface in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Data compatibility

Follow persisted or exchanged data across old and new readers and writers, including migrations, defaults, nullability and rollback. Identify a concrete existing record or mixed-version scenario that breaks a stated schema or invariant. Raise `class:contracts.data` with both sides.
