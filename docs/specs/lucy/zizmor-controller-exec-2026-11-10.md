# Zizmor controller execution (2026-11-10)

The owner stopped the Astra route after the controller order was already issued.
This file records the lead's evidence. It is not an Astra acceptance and it does
not qualify the tip. The hold on releasing the tip stays.

## Candidate

- Branch: `native-severity`
- SHA: `c004bad92b77b54e6c133bb9a03bf2ef0b6461b7`
- Parent: `b71683ea9aa97cf50ee1092fc01558b7e3eb6532`
- Files against that parent: `zizmor-analyze.ts`, the dispatch in `analyze.ts`,
  `zizmor-analyze.test.ts`, and the zizmor paragraph in `docs/guides/review.md`
- Unchanged: catalog pin, classes, severity map, probation, `script/test-ci.ts`

## Evidence

Typecheck `42841853330`, success, headSha equal to the candidate, package
`@orchestra/core`.

Run `42844418163`, job `test (ubuntu-24.04)`, runner label `ubuntu-24.04`,
runner `GitHub Actions 1000047587`, bun, headSha
`8cd279d6bd81c492b5e96e2cc947956b73e8db5d`, branch
`ci-run-linux-mwauffff-8cd279d`.

`git diff-tree -r --name-status c004bad92b 8cd279d6` is only `A .ci-run.json`.
That file names package `core`, runner `bun`, and these tests: 
`zizmor-analyze.test.ts`, `zizmor-severity.test.ts`,
`native-informational-acceptance.test.ts`, `route.test.ts`,
`oxlint-catalog.test.ts`, `oxlint-analyze.test.ts`, timeout `120000`, empty env.

Result: 86 pass / 0 fail, 381 assertions, 421 omni spawns. The omni control
was declared by the zizmor and oxlint controller tests. This is
content-equivalent to the candidate. It is not an execution whose headSha is
the candidate.

A read-only review of the same SHA found the issued controller criteria met.
That review is not a substitute for this run. The run is the evidence.
