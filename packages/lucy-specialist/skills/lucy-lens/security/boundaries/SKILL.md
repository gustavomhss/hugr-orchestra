---
name: lucy-lens-security-boundaries
description: "Security boundaries"
when: "The routed security lens encounters this concern in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Security boundaries

Trace an attacker-controlled or untrusted value from source through validation and authorization to a sensitive sink. A changed path that allows a concrete prohibited action is `class:security.boundary`; a structural analyzer hit alone is not proof or a trigger. Inspect intervening guards and report uncertainty.
