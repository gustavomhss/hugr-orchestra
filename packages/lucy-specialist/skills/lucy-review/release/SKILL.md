---
name: lucy-review-release
description: "Review a supplied release candidate and the host's retained evidence."
when: "The routing record names the release profile."
not-when: "An ordinary code review or a request to certify a publisher or platform."
---

Read the host rows for tool:release-provenance, tool:release-signing, tool:release-updater, tool:release-sbom and tool:release-notes. Cite their retained raw URI and captured identity; never infer that a supplied path passed.

The host captures candidate bytes once before choosing the review identity. A changed candidate needs a fresh release request with its proofs. This profile keeps the code review's evidence bar. Quick and Standard keep their usual lenses; Deep also routes the release lens.

Missing evidence is `not-run`, not a pass. An explicit owner acceptance may cover unavailable evidence; an acquisition error or failed release proof blocks approval. Notes prove presence only. Behavioural eval remains not examined, reason `owner-permission`.
