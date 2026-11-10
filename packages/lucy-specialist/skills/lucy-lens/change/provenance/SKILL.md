---
name: lucy-lens-change-provenance
description: "Change provenance"
when: "The routed change lens encounters this concern in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# Change provenance

Compare changed generated or vendored material with its declared source, version or reproducibility rule in the base. Identify the specific mismatch and its effect on the reviewed artifact. Raise `class:change.provenance` only when the relevant rule and mismatch are visible; authorship claims and transcripts are not evidence.
