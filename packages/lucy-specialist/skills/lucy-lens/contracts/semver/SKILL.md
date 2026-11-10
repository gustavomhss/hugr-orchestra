---
name: lucy-lens-contracts-semver
description: "Version compatibility"
when: "The routed contracts lens encounters this interface in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Version compatibility

Compare the release or version change with the repository’s published compatibility policy and the public surface actually changed. Look for consumers relying on removed or changed promises. Raise `class:contracts.semver` only against an identified policy and concrete incompatible change; version conventions alone do not establish a violation.
