---
name: lucy-lens-experience-interaction
description: "Interaction behaviour"
when: "The routed experience lens encounters this concern in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Interaction behaviour

Trace the user action through loading, success, error, cancellation and repeat actions where the change touches them. Compare the reachable state with the stated journey; raise `class:experience.interaction` for a concrete user action that produces the wrong result or traps progress.
