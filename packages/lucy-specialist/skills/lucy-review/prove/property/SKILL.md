---
name: lucy-review-prove-property
description: Prove a stated law with a bounded property and retain a shrunk reproducer.
when: "The brief offers probe:property for this candidate."
not-when: "The option is not offered or the target is not a JavaScript or TypeScript integer law."
---

Use `probe:property` only when offered. State the law first. Supply `target.property` with its language, law, source, seed and cases. The source defines `property(value, root)`, returning a boolean; import the reviewed implementation through `root`. The host supplies signed integer cases and shrinks a failure toward zero. Cite the law, original input, shrunk input and retained URI. A passing sample does not prove a universal law.

Exceptions, invalid output and resource limits are `not-run`; they never confirm a finding. Other languages use only the quote, test or script options actually offered. Do not install anything or supply a command.
