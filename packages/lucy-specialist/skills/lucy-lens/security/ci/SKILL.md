---
name: lucy-lens-security-ci
description: "CI security"
when: "The routed security lens encounters this concern in the slice."
not-when: "The routed lens or changed hunk does not concern this topic."
---

# CI security

Follow untrusted contribution content through workflow triggers, credentials, permissions, artifacts and executable steps. Name the actor, event and privilege reached; compare the changed configuration with its base trust boundary. Raise `class:security.ci` for a concrete crossing, not simply because a workflow exists.
