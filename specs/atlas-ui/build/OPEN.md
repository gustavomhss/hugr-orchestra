# Open items

## Approved by the owner (2026-10-19)

These touch rules in AGENTS.md that only the owner changes. All three are approved; A06b and B-R9-01b add the allow-list rows, and the lead adds the CI Cadence sentence when merging lane B-O (see ORDER.md).

1. **Spawn allow-list: `modules/atlas/boundary/src/generated/surface.js` (A06b).**
   - The surface bundle imports `child_process` through Atlas's git helper and secret scanner.
   - It is the same case as the existing `native-memory.js` row.
   - Without the row, the alternative is to inject git through Orchestra's process service. That changes D1 and A02–A05.
2. **Spawn allow-list: `modules/atlas/packages/cli/src/repair-run.ts` (B-R9-01b).**
   - `atlas repair` runs `node`, `git` and `gh`.
   - Without the row, `repair` only prints the commands for a maintainer to run.
3. **CI cadence exception (B-R9-02, B-R10-01).**
   - `atlas-worklist.yml` runs on push to `dev`, and `atlas-guard.yml` runs on every pull request. Today the rule is that pushes and unlabeled PRs run nothing.
   - `atlas-guard` exits at once unless the PR touches files an ownership skill covers.
   - On approval, add one sentence to AGENTS.md "CI Cadence", worded in `issues/b-o.md` item 10.

## Accepted by the lead

Everything else in `issues/*.md` is accepted as written. Each brief already assumes the fix its issue proposes.

- `issues/a-u-views-2.md` item 15 ("A15c has no brief") is stale: A15c exists.
- The decisions those issues extend are recorded at the end of [DECISIONS.md](DECISIONS.md) (D3b, D7b, D9b, D10b, D11b).
