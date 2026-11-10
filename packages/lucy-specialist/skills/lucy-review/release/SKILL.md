---
name: lucy-review-release
description: "Release-candidate review. Deep is not built; this node does not run the build lane."
when: "The routing record names the release profile."
not-when: "The request is an ordinary code review or asks to certify a release."
---

A release candidate is reviewed for provenance, signing, updater, SBOM and notes. This node does not claim those checks ran.
