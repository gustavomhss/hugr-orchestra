---
name: lucy-lens-change-health
description: "Repository health"
when: "The routed change lens encounters this concern in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Repository health

Examine changed suppressions, exclusions and maintenance controls against the base rule they protect. Identify the path now left unguarded and its concrete consequence. Raise `class:change.health` for a demonstrable weakening; unavailable checks are coverage, not a passing health verdict.
