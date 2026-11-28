---
name: lucy-audit-variant
description: "Variant analysis."
when: "An audit has a confirmed seed finding and the brief permits variant analysis."
not-when: "There is no confirmed seed, or the relevant search capability is not available."
---

# Variant analysis

A confirmed finding supplied by the host is the seed. Identify the exact pattern and trigger shown by its evidence, then generalize one element in a single `code_search` attempt. Use `paths:["**"]`, `offset:0`, `limit:200` and `context:0`. This same search must match the known seed at its primary path and line. Do not run a preliminary seed-only search. Auxiliary `code_locate` or `code_query` calls cannot replace the search witness. A similar spelling is only a candidate until independent verification examines its context, including a guard or caller that could make it safe.

Return exactly one `review-variant` JSON block with `seedFindingID`, `patternChange` and `candidates`. Each candidate contains only `path`, `line`, optional `endLine`, `severity`, `trigger` and `quote`. Use new locations returned by the search and ranges of at most 400 lines. The host derives identities, the complete match denominator and every disposition from the captured source and native evidence; do not supply counts, classes, proof or noise claims.

The host permits at most three generations within the original request deadline. It stops when noise is at least half the new matches, including exactly half, or when any new match remains uncertain or unexamined. A continued generation uses a newly confirmed finding from the immediately preceding generation. Diligence and artifact reports have zero generations; Quick has no independent verifier and does not expand seeds.

A surviving candidate needs independent verification and captured evidence before confirmation. The host records uncertain matches as questions and omitted, unreadable or budget-limited matches as not examined. Work only within the Session's supplied capabilities and captured source.
