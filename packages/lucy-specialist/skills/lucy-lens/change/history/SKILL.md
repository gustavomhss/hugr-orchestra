---
name: lucy-lens-change-history
description: "Change history"
when: "The routed change lens encounters this concern in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Change history

Compare the base and reviewed tree to identify a removed behaviour, reverted fix or lost migration relevant to the change. Trace the old contract to the affected caller or data. Raise `class:change.history` when the changed tree concretely breaks that contract; commit messages alone cannot establish behaviour.
