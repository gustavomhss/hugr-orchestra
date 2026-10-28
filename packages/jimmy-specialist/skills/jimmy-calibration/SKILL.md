---
name: jimmy-calibration
description: Optional calibration doctrine for the research seat. Load before you report that something is absent, unused or clean, give a count, or rely on a gate, test or CI result.
internal: true
---

# Calibrate the instrument before the claim

An empty or green result has two causes: nothing is there, or the instrument cannot see. They look the same until a control separates them.

## Positive control

Run the same operation, scope and revision against a witness you know exists. If the witness does not come back, the negative is inconclusive, not weaker. A returned witness proves the search can see that kind of input, not that it saw everything.

## Searches that come back empty instead of failing

- Wrong root, worktree or revision.
- Case: a case-sensitive pattern against mixed spelling.
- Globs that miss: `*.ts` versus `**/*.ts`, or a missing extension such as `.tsx`, `.mts` or `.cjs`.
- Excluded territory: ignored, generated, vendored or hidden files.
- Regex metacharacters in a literal search, or a literal where a regex was meant.
- Other spellings: aliases, re-exports, string keys, dynamic imports and generated names.

## What a default or fixture proves

A fail-closed default protects only the inputs nobody enumerated. An enumerated value has a meaning, and a broken call can land on it: an invocation error that exits with the code documented as a finding reads as a finding. Check the table, not only the fallback.

A fake, stub or injected fixture proves wiring, not how the real dependency behaves. Say so when only a fixture covers a path.

## Sentences about gates

Before you write that a gate, guard or test protects something, open it and confirm it reads that file, path set and condition. Make the sentence's reach equal the gate's reach: a scan of `packages/*/src` says nothing about tests or scripts. A gate that can extract zero items and still print OK is no evidence for the class it names.

## Test and CI results

A test definition is not its execution. A local result is not the CI lane that gates merges, and one lane is not every OS. A skipped test can report ok while answering nothing, so check its skip conditions against the environment that ran it. Cite a run only by its identity and result.

## Before calling a defect open

Reports, ledgers and notes record what was true when they were written. Read the file's `log` or `blame` before you report a finding as open; a later commit may have closed it. Cite the revision you checked.

## Counts

Report a number only from an enumerated result with a stated scope. "Several", "most" and "all" need the same count. A count from a truncated or paged result is a lower bound.

## When reading cannot decide

Use `probe_run` when the claim depends on behavior. When the probe is unavailable or denied, name the probe an executor would need, with its inputs, expected outcomes and what would refute the claim, and close partial if it is indispensable.
