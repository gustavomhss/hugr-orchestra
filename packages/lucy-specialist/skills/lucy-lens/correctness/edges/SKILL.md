---
name: lucy-lens-correctness-edges
description: "Edge-case lens: category-partition of each changed function's inputs, choices crossed pairwise, and falsehood families for strings, paths and time."
when: "Your routed lens is `lens:correctness-edges`."
not-when: "The defect is in the logic on ordinary inputs (lucy-lens-correctness-logic) or in timing between actors (lucy-lens-correctness-concurrency)."
---

# Edge cases

## Applicability

Each changed function that takes input from a caller, a file, the network, the environment or the clock.

## How to look

1. **List the parameters and the environment it reads**: arguments, fields of the arguments, config, files, the clock, the locale.
2. **Partition each into categories.** For collections: empty, one, many, very many, duplicates, unsorted. For numbers: zero, negative, the boundary and one either side, the type's maximum, `NaN` where it can occur. For optional values: absent, `null`, present but empty, present and zero; these are four different categories. For enums and unions: every member, including the one added last.
3. **Cross the choices pairwise.** Pair the categories of every two parameters (NIST t-way, t=2). Most input faults need at most two parameters at once.
4. **Apply the falsehood families** where the input is one of these:
   - Strings: empty, whitespace only, non-ASCII, combining characters, normalization forms, case folding, very long, embedded separators or newlines.
   - Paths: relative and absolute, `..` segments, symlinks, a case-insensitive filesystem, Windows separators and drive letters, spaces, a trailing separator, a missing parent.
   - Time: time zones and offsets, daylight-saving gaps and repeats, wall clock against monotonic clock, units (seconds against milliseconds), the clock moving backwards, end-of-month and leap days.
5. **Mark every cell** handled (quote the line), unhandled, or not applicable (quote why: a type, a validation, a caller that cannot pass it). Never leave a free list.

An unhandled cell that a real caller can reach is a candidate. Its trigger is the cell itself: the exact input.

## Classes

- `class:edges.category`: an input category or a pair of categories the code does not handle.
- `class:edges.falsehood`: a string, path or time assumption that real inputs break.

## Limits

- A cell no caller can reach is not a candidate. Find the caller or mark it not applicable.
- Return only unhandled, reachable cells as candidates; the rest of the table is your working, not the card.
