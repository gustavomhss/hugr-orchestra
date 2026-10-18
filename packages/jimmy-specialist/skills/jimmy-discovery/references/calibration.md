# Calibrate the instrument before the claim

Read before reporting an absence (“none”, “no consumers”, “clean”, “unused”), a count, an open defect or any test/CI result. An empty or green result has two causes: nothing is there, or the instrument cannot see. They look identical until a control separates them. [Evidence](evidence.md) defines bounded negatives; this guide names the ways they fail.

## Measure the positive control

Run the same operation, root, filters and revision against a witness you know exists, and retain the hit. A control you assumed would fire is not a control: example tokens, fixtures and allowlisted values often do not. If the witness is not returned, the negative is inconclusive, not weaker. A returned witness proves sensitivity for that kind of input, not completeness.

## Searches that return empty instead of failing

- Wrong root, worktree or revision; a path outside the bound workspace.
- Case: a case-sensitive pattern against mixed spelling, or a case-folding assumption about paths.
- Globs that miss: `*.ts` versus `**/*.ts`, a missing extension (`.tsx`, `.mts`, `.cjs`), a directory glob that matches only names.
- Excluded territory: ignored, generated, vendored, hidden or size-limited files the tool skips by default.
- Patterns beginning with `-`, unescaped regex metacharacters, or a literal search where a regex was intended.
- Spelling variants: aliases, re-exports, string keys, dynamic imports, generated names.
- Partial capture: truncated output, top-K results, a paginated page read as the whole, a timed-out or partially indexed LSP response.

Record each that applies in `coverage` as examined, excluded or failed.

## What a default or fixture proves

A fail-closed default protects only inputs that were not enumerated. An enumerated value has a meaning, and a broken call can land on it: an invocation error that exits with the code documented as a finding is read as a finding. Check the enumerated table, not only the fallback.

A fake, stub or injected fixture proves wiring. It does not prove how the real dependency behaves. Report fixture-only coverage as such.

## Sentences about gates

A claim that a gate, guard or test protects something switches the reader's doubt off. Before writing it, open the gate and confirm it reads that file, path set and condition. Make the sentence's reach equal the gate's reach: a scan of `packages/*/src` says nothing about tests or scripts. A gate that can extract zero items and print OK is not evidence for the class it names.

## Test and CI results

A test definition is not its execution. A local result is not the CI lane that gates merges, and one lane is not every OS. A skipped or conditionally disabled test can report ok while answering nothing; check skip conditions against the environment that ran it. A step that was added but never observed green is not evidence. Cite actual run identity and result only when supplied or retained.

## Before calling a defect open

Committed reports, ledgers and notes record what was true when written. Read the accused file's `log` or `blame` through history capture before reporting a finding as open; a later commit may have closed it. Cite the revision you checked.

## Count before claiming

Report a number only from an enumerated, retained result whose scope is stated. “Several”, “most” or “all” need the same count. A count from a truncated or paginated read is a lower bound.

## When execution is needed

This seat cannot run tests, dispatch CI, mutate code or execute probes. When a claim depends on one, name the probe an executor would need: exact inputs, environment, the expected red and green outcomes, the control, and what would refute the claim. Close partial when that probe is indispensable.

## Pre-report checklist

- Did a measured positive control pass with the same operation and scope?
- Are roots, case, globs, exclusions and truncation stated in coverage?
- Does a gate or test claim match what the gate actually reads and ran?
- Is a fixture-only or local-only result labelled as such?
- Did history show the accused defect still open at the cited revision?
- Is every count enumerated, and does each sentence's reach equal its evidence?
