---
name: lucy-lens-change-structure
description: "Change structure"
when: "The routed change lens encounters this concern in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Change structure

Compare changed boundaries and dependencies with the base architecture rules and callers. Look for a misplaced dependency, coupled change or orphaned integration that breaks a stated invariant. Raise `class:change.structure` with the relevant rule and changed path; unfamiliar organization is not itself a defect.

For `class:change.duplication`, examine both clone paths and the changed range. A clone becomes a finding only with evidence of harmful divergence or a written repository constraint requiring unification. Cite that evidence; repeated text alone remains a candidate.
