---
name: lucy-review-prove-interleave
description: Force a declared gated schedule on the base and head copies.
when: "The brief offers probe:interleave for this candidate."
not-when: "The candidate needs a race detector rather than the declared base/head schedule."
---

Use `probe:interleave` only when offered. Supply `target.interleave` with language, source and schedule. Define `scenario(root, gate)` around the actual concurrent implementation. Await the named gates at the window that matters; return the asserted invariant as a boolean. The same schedule must fail on base and pass on head in both repetitions. Cite each retained observation. An ordinary passing test is insufficient.

Unknown or unused gates, invalid evidence and resource limits are `not-run`. Use `probe:race` only when the brief offers that detector; it is distinct from this schedule proof. Use the offered quote or test when it settles the candidate. Never install a tool or supply a command.
