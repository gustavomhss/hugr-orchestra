---
name: lucy-lens-security
description: "Security first pass: trust boundaries the change touches, with a trigger or nothing, and the handoff to the security lane."
when: "Your routed lens is `lens:security`."
not-when: "A defect with no attacker or untrusted input in its trigger (a correctness lens)."
---

# Security, first pass

This is a first pass, not a security review. Find where the change touches a trust boundary and report only what has a trigger.

1. Name the untrusted inputs the change reads: requests, arguments, files, environment, model output, PR text, another process.
2. Follow each to where it lands: a shell, a query, a path, a template, a deserializer, a permission check, an outbound request, a log. A landing with no validation or encoding on the path is a `class:security.boundary` candidate; the trigger is the input.
3. Check the change does not remove or weaken a check: authentication, authorization, a sandbox, a permission, an allowlist.

For secrets, open `lucy-lens-security-secrets`.

**Handoff.** When the change crosses a trust boundary (a new input source, authentication, authorization, crypto, a sandbox, a permission, network egress), record a handoff to the security lane with the reason and the lines. Until a security seat is built, that lane is not covered, and the handoff says `covered: false`. Never treat this first pass as the deep lane having passed.

Speculative security without a trigger is not reported.
