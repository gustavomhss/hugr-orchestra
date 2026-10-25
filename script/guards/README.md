# Guards

Small declarative CI rules over the lines and paths a change adds. Run with `bun run check:guards [--base origin/dev]`.

- A rule is one TOML file in `rules/`; the file name is its id. A rule without positive and negative samples does not load, and the test runs every rule against its own samples.
- `on = "added-lines"` rules read only lines the change adds, so old code never fails. `on = "changed-paths"` rules fire on a changed path.
- Rules and `config.toml` are read from the merge-base with the target branch, not from the change, so a PR cannot relax its own guards. Only when the base has no rules yet does the runner read them from disk and print `BOOTSTRAP`.
- A line identical to one removed elsewhere in the same diff is treated as moved code. Renames are followed by git.
- Suppress one line with `guardrail-ignore: <rule id> <reason>`; without a reason it does not count. Path exemptions go in the rule's `exclude`.
- `GUARDRAIL_APPROVED=protected-paths` clears a changed-paths rule; CI sets it from an approver's label.
- Size limits stay in `script/godfile.ts`; this directory does not reimplement them.

- `--warn` reports gate findings without failing (setup errors still fail); on GitHub Actions each finding becomes a `::warning` annotation. `--cwd <repo>` points the engine at another checkout.

CI: the "Run guards" step in `.github/workflows/test.yml` runs in warn mode. When `dev` already has the engine it runs dev's copy against the change (`--cwd`), so the change cannot edit the code that judges it; the PR that introduces the engine uses its own copy. `protected-paths` also flags any edit to `script/guards/**`. Promote to gate by dropping `--warn` after a week of measured noise.

Catalog, evidence and the next rules: `docs/guardrail/`.
