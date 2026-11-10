---
name: lucy-lens-contracts-third-party
description: "Third-party contracts"
when: "The routed contracts lens encounters this interface in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Third-party contracts

Trace the changed integration to its declared external API, configuration and supported versions. Compare request and response assumptions with available authoritative interface documentation or pinned types. Raise `class:contracts.third-party` for a concrete mismatch; unavailable or version-ambiguous external facts are questions.
