---
name: lucy-lens-security-release
description: "Inspect the release evidence's exact byte bindings and limits."
when: "Your routed lens is lens:security-release."
not-when: "The host did not route this release lens."
---

Read tool:release-provenance and tool:release-signing: the caller supplies an Ed25519 fingerprint policy. A pass binds candidate bytes under that policy; it does not establish publisher identity, notarization or a SLSA level.

Read tool:release-updater for the supplied entry's literal filename and byte digest. Read tool:release-sbom for cryptographic co-signature of the supplied attachment and candidate hashes. Syft remains the generator; this binding proves neither that its source describes the artifact nor complete runtime coverage. Read tool:release-notes for presence only.

A mismatch is evidence, not a request to rerun an arbitrary command. Cite the host raw URI and narrow claim. Missing or unsupported evidence stays `not-run`; behavioural eval is not examined, reason `owner-permission`. Never certify the release.
