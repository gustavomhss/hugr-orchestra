# Guards

Small declarative CI rules over the lines and paths a change adds. Run with `bun run check:guards [--base origin/dev]`.

- A rule is one TOML file in `rules/`; the file name is its id. A rule without positive and negative samples does not load, and the test runs every rule against its own samples.
- `on = "added-lines"` rules read only lines the change adds, so old code never fails. `on = "changed-paths"` rules fire on a changed path.
- Rules and `config.toml` are read from the merge-base with the target branch, not from the change, so a PR cannot relax its own guards. Only when the base has no rules yet does the runner read them from disk and print `BOOTSTRAP`.
- A line identical to one removed elsewhere in the same diff is treated as moved code. Renames are followed by git.
- Suppress one line with `guardrail-ignore: <rule id> <reason>`; without a reason it does not count. Path exemptions go in the rule's `exclude`.
- `GUARDRAIL_APPROVED=protected-paths` clears a changed-paths rule; CI sets it from an approver's label.
- A `changed-paths` rule can also filter on what git reports about the file: `modes` (100755, 120000, 160000), `min_bytes`, `binary` and `no_shebang`. Its samples are paths and check the path scope only; the golden test in `packages/core/test/guards.test.ts` covers the file filters.
- A `line-balance` rule fires on one file when lines matching `match` removed minus added reaches `min_net_removed`; removed lines that reappear elsewhere in the change (moved) and deleted files do not count. It is how assertion and test-case removal is caught.
- Size limits stay in `script/godfile.ts`; this directory does not reimplement them.

Known gap: the runner script itself comes from the change under test. CI must run the engine from the base checkout for the base-branch rule to be fully tamper-proof; until that is wired, `protected-paths` (which covers `script/guards/**`) is what flags edits to the engine.

Catalog, evidence and the next rules: `docs/guardrail/`.

## Adding a rule

1. Copy `rule.template.toml` to `rules/<id>.toml`.
2. Run `bun run script/guards/baseline.ts <id>`: it lists what the rule flags in the code that exists today. Each hit is a real defect or a false positive; put every false positive in `negative` and tighten the pattern. Real example: a bare `JSON` line is button text in JSX, so `heredoc-residue` does not look for it.
3. For a rule that needs a diff (line balance, deletions, lockfiles) run `bun run script/guards/history.ts -n 300 <id>`: it applies the rule to each of the last N commits and lists the hits with their commit. Read them like the baseline hits.
4. Fill `positive` and `negative` with real lines. The test runs them against the rule.
