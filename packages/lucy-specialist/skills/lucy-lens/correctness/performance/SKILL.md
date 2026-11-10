---
name: lucy-lens-correctness-performance
description: "Performance cost"
when: "The routed lens is `lens:correctness-performance`."
not-when: "The change does not touch this concern; use the routed lens instead."
---

# Performance cost

Follow input size and frequency through loops, allocations, queries, network calls and serialization. Compare the changed path with its prior bound and stated workload; identify the input that makes the extra work observable. Raise `class:performance.cost` with the operation, scaling and consequence, not merely a theoretical complexity label. An unknown workload or unmeasured runtime effect is a question, not a confirmed regression.
