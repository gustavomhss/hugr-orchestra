# Severity normalizer execution (2026-11-10)

Implements Astra's block A from `severity-block-2026-11-10.md`. The hold on
`c0335bec17` is not lifted. This commit is not on `native-oxlint-map`.

## Candidate

- Branch: `native-severity`
- SHA: `1d2762343e8e38699798d7f488a9fd7aa407f931`
- Parent: `c0335bec177976f801df1e148bbaad5eede95a2a`
- Not done: zizmor controller, catalog revert, `script/test-ci.ts`

## What changed

`SarifResult` now decodes `level`. `parseSarif` copies it to `Raw.nativeSeverity`.
`ReviewAnalyze.rules` is the controller resolver: a `*` priority stays fixed; a per-level
map uses the finding level; there is no `Object.values` fallback. A missing or unknown
level for a per-level rule is `severity-unmapped`. `ReviewSarif.bind` refuses that as a
normalization failure and keeps the raw result. The scan paths use `bind`, so the miss
cannot become a pass.

## Evidence

Run `42813688129`, Ubuntu 24.04, bun, headSha `a6d04c4a9c229c1c84b6d3424f107a3852300021`,
branch `ci-run-linux-mwangji9-a6d04c4`.

`git diff-tree -r --name-status 1d2762343e a6d04c4a9c` is only `A .ci-run.json`.

That run is content-equivalent to the candidate. It is not an execution whose headSha
is the candidate.

Result: 20 pass / 0 fail, 162 assertions, 284 omni spawns. Includes
`zizmor-severity.test.ts`, `native-informational-acceptance.test.ts`, `sarif.test.ts`,
and `oxlint-analyze.test.ts` (dropped `no-debugger` absent from raw, positive control kept).

Typecheck of this SHA: workflow run `42813972370` (dispatched, not yet a result in this receipt).
