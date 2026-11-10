---
name: lucy-lens-correctness-resources
description: "Resource lifetime"
when: "The routed lens is `lens:correctness-resources`."
not-when: "The change does not touch this concern; use the routed lens instead."
---

# Resource lifetime

Trace acquisition to every release, transfer and cancellation path. Compare ownership across success, early return, exceptions and repeated calls. Look for resources retained past their intended lifetime, double release, or cleanup skipped on failure. Name the resource, owner, trigger and observable consequence; raise `class:resources.lifetime` only with the relevant changed lines. A long-lived resource alone is not a leak.
