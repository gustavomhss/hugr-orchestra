---
name: lucy-lens-change-merge
description: "Merge integration"
when: "The routed change lens encounters this concern in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Merge integration

Follow both sides of an integration seam in the reviewed tree, especially conflict resolutions, exports, registrations and shared configuration. Identify a concrete mismatch introduced by the merge and its caller or trigger. Raise `class:change.merge`; a conflict marker or history claim without an actual consequence is not enough.
