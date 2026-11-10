# Severity recheck after the refusal (2026-11-10)

Astra refused `6726d91f5e` in the browser thread. The hold is not lifted.
This file does not replace `severity-block-2026-11-10.md`. It records the
fix of the three counterexamples and the evidence for the new candidate.

## Refused candidate

- SHA: `6726d91f5e9ceeb2a084b0a0a6ebd5eb2843de06`
- Run that proved that tree, not this one: `42820105407`, headSha `eade6564cbe7c0e43642697bcd98f512005b800b`
- Verdict: RECUSA. Blocking counterexample: `level: "toString"` indexed an inherited function.

## New candidate

- Branch: `native-severity`
- SHA: `7f5ace4007744365874b9ad6dce655ba282923b6`
- Parent: `6726d91f5e9ceeb2a084b0a0a6ebd5eb2843de06`
- Not done: zizmor controller, catalog revert, `script/test-ci.ts`

## What this commit changes

`ReviewAnalyze.rules` resolves a level only through `ownSeverity`: `Object.hasOwn`
and a value that is exactly `P0`, `P1`, `P2` or `P3`. An inherited name is
`severity-unmapped`. The three-level regression uses one snippet,
`persisted credential`. The negative regression includes `undefined`,
`critical`, `toString` and `constructor`. The oxlint catalog test again
compares against independent literals, not `oxlint.pack` or `oxlint.rules`.

## Evidence that matches this candidate

Typecheck `42822045452`, success, headSha
`7f5ace4007744365874b9ad6dce655ba282923b6`, packages `@orchestra/core`.

Run `42822565653`, job `test (ubuntu-24.04)`, runner label `ubuntu-24.04`,
runner `GitHub Actions 1000047229`, bun, headSha
`4cd2169400b95d0c799979f0051ff93ddca4e65e`, branch
`ci-run-linux-mwapnvbj-4cd2169`.

`git diff-tree -r --name-status 7f5ace4007 4cd21694` is only `A .ci-run.json`.
That file names package `core`, runner `bun`, the four test files, timeout
`120000`, and empty env.

Result: 42 pass / 0 fail, 337 assertions, 284 omni spawns. This is
content-equivalent to the candidate. It is not an execution whose headSha is
the candidate. It does not lift the hold.
