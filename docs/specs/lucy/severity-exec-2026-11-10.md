# Severity normalizer execution (2026-11-10)

Implements Astra's block A from `severity-block-2026-11-10.md`. The hold on
`c0335bec17` is not lifted. This branch is not `native-oxlint-map`.

The earlier text of this file named `1d2762343e` and a typecheck that had not
finished. That text is superseded by this commit.

## Candidate

- Branch: `native-severity`
- SHA: `6726d91f5e9ceeb2a084b0a0a6ebd5eb2843de06`
- Parent of the normalizer: `c0335bec177976f801df1e148bbaad5eede95a2a`
- Not done: zizmor controller, catalog revert, `script/test-ci.ts`
- `git diff --name-only c0335bec17..6726d91f5e -- script/test-ci.ts packages/core/src/review/route.ts` is empty

Commits on the candidate, oldest first:

1. `1d2762343e` fix(review): resolve zizmor severity from the finding level
2. `fe9e0ee0d8` test(review): typecheck catalog lookups against per-level severity
3. `63cb03abef` fix(review): omit absent zizmor cwe so the catalog decodes
4. `6726d91f5e` test(review): expect the zizmor pack already on the tip

`63cb03abef` deletes `cwe: undefined` from the zizmor rule objects. It does not
change rule ids, classes, severities, or status. The schema's optional `cwe`
rejects an explicit undefined. `6726d91f5e` adds the pack the parent already
shipped to the frozen pack-list assertion. It does not change the catalog.

## What changed

`SarifResult` decodes `level`. `parseSarif` copies it to `Raw.nativeSeverity`.
`ReviewAnalyze.rules` is the production resolver: a `*` priority stays fixed; a
per-level map uses the finding level; there is no `Object.values` fallback. A
missing or unknown level for a per-level rule is `severity-unmapped`.
`ReviewSarif.bind` refuses that as a normalization failure and keeps the raw
result. The scan paths use `bind`, so the miss cannot become a pass.

## Evidence that matches the candidate

Run `42820105407`, job `test (ubuntu-24.04)`, runner label `ubuntu-24.04`,
runner `GitHub Actions 1000047201`, bun, headSha
`eade6564cbe7c0e43642697bcd98f512005b800b`, branch
`ci-run-linux-mwap2nog-eade656`.

`git diff-tree -r --name-status 6726d91f5e eade6564` is only `A .ci-run.json`.
That file names package `core`, runner `bun`, and the four test files below,
with timeout `120000` and empty env.

That run is content-equivalent to the candidate. It is not an execution whose
headSha is the candidate.

Result: 42 pass / 0 fail, 325 assertions, 284 omni spawns. Files:
`zizmor-severity.test.ts`, `catalog.test.ts`, `oxlint-catalog.test.ts`,
`oxlint-analyze.test.ts` (dropped `no-debugger` absent from raw, positive
control kept).

Typecheck of this SHA: `42818558524`, success, headSha
`6726d91f5e9ceeb2a084b0a0a6ebd5eb2843de06`, packages `@orchestra/core`.

## Runs that do not prove this candidate

- `42813688129` headSha `a6d04c4a9c` differs from `1d2762343e` only by
  `.ci-run.json`. It does not include the later commits.
- `42817011879` failed. Catalog decode rejected `cwe: undefined` at
  `rules[67]`. Fixed by `63cb03abef`, not by the severity map.
- `42818242270` failed one assertion: the pack list stopped at oxlint and did
  not name zizmor. Fixed by `6726d91f5e`, not by the severity map.
- Typecheck `42813972370` failed because the filter was `core`, not
  `@orchestra/core`. `42814161309` failed on the pre-fix catalog index types.
  `42814616726` passed on `fe9e0ee0d8` only.
