# Guards

Small declarative CI rules over the lines and paths a change adds. Run with `bun run check:guards [--base origin/dev]`.

- A rule is one TOML file in `rules/`; the file name is its id. A rule without positive and negative samples does not load, and the test runs every rule against its own samples.
- `on = "added-lines"` rules read only lines the change adds, so old code never fails. `on = "changed-paths"` rules fire on a changed path.
- Rules and `config.toml` are read from the merge-base with the target branch, not from the change, so a PR cannot relax its own guards. Only when the base has no rules yet does the runner read them from disk and print `BOOTSTRAP`.
- A line identical to one removed elsewhere in the same diff is treated as moved code. Renames are followed by git.
- Suppress one line with `guardrail-ignore: <rule id> <reason>`; without a reason it does not count. Path exemptions go in the rule's `exclude`.
- `GUARDRAIL_APPROVED=protected-paths` clears a changed-paths rule; CI sets it from an approver's label.
- A `changed-paths` rule can also filter on what git reports about the file: `modes` (100755, 120000, 160000), `min_bytes`, `binary` and `no_shebang`. Its samples are paths and check the path scope only; the golden test in `script/guards/guards.test.ts` covers the file filters.
- A `line-balance` rule fires on one file when lines matching `match` removed minus added reaches `min_net_removed`; removed lines that reappear elsewhere in the change (moved) and deleted files do not count. It is how assertion and test-case removal is caught.
- A `changed-paths` rule can also require a companion change: `requires_changed` lists globs (a lockfile) and the rule stands down when any of them changed; `touches` is a regex the added or removed lines of the path must match (a dependency edit, not any edit).
- `flags = "i"` makes `match` case-insensitive (the only flag). `skip_comments = ["//", "#"]` hides added lines that start with one of those prefixes, so a rule does not repeat a comment lookahead.
- `$name` in `paths`, `exclude` or `requires_changed` expands to the glob list `[sets] name` in `config.toml` (`$js_tests`, `$py_tests`, `$rs_tests` today). An undefined name stops the run.
- Moved code is counted: each removed line excuses one identical added line for a rule, not every identical line.
- `new_only = true` (added-lines, `match` needs a capture group) skips a line when a removed line in the same file has the same first group, so a version bump is not reported as a new dependency.
- `leaves_scope = true` (changed-paths) makes a rename or copy count when its old path is in scope and the new one is not, so a test renamed out of the test globs reads as a deletion (`test-file-deleted`); a rename that stays in scope is a move.
- Size limits stay in `script/godfile.ts`; this directory does not reimplement them.

- `--warn` reports gate findings without failing (setup errors still fail). On GitHub Actions each finding becomes an annotation (`::error` for a gate unless `--warn`, `::warning` otherwise). `--cwd <repo>` points the engine at another checkout.

- `--json` prints the whole report as one JSON object and no annotations: `{base, bootstrap, rules, files, findings, errors, approved, touchesGuards}`. Each finding carries `rule`, `severity`, `path`, `line`, `message`, `excerpt` and `match` (`[start, end)` inside `excerpt`, or null). Findings are sorted gate first, then path, then line. `errors` are `{kind, message}` with kind `no-repository | base-not-found | no-rules | rules-invalid | other`. The exit code is the same as without `--json`.
- `--rules` prints `{rules, errors}`: every rule read from the merge-base with `id`, `group`, `severity`, `kind`, `message`, `summary`, `positive`, `negative`, `paths` and `clearedBy` (`fix`, `ignore` or `approval`). `group` is required in every rule (one of `GROUPS` in `rule.ts`); `summary` is optional plain-language text for the app and is null until a rule has one.

- The app reaches both through the server: `GET /api/guardrail/rules` and `POST /api/guardrail/run` (body `{base?}`), served by `packages/core/src/guardrail.ts`, which runs this engine with `bun` and `--cwd` set to the location. A repository without `script/guards/run.ts` answers `no-engine`.

CI: `.github/workflows/guards.yml` runs on every PR: a gate finding fails the job, a warn finding is an annotation, from the base branch's copy of the engine when it has one, so the change cannot edit the code that judges it. A label `guardrail-approved:<rule id>`, applied by someone with write access, clears that changed-paths rule; plain `guardrail-approved` means protected-paths. Every new `guardrail-ignore` is reported by the warn rule `guardrail-ignore-added`.

Catalog (`bun run script/guards/catalog.ts > docs/guardrail/catalog.md`), evidence and the next rules: `docs/guardrail/`. Skills in `.orchestra/skills/`: `guardrail-usage`, `guardrail-customization`, `guardrail-ownership`, `guardrail-maintenance`.

## Adding a rule

1. Copy `rule.template.toml` to `rules/<id>.toml`.
2. Run `bun run script/guards/baseline.ts <id>`: it lists what the rule flags in the code that exists today. Each hit is a real defect or a false positive; put every false positive in `negative` and tighten the pattern. Real example: a bare `JSON` line is button text in JSX, so `heredoc-residue` does not look for it.
3. For a rule that needs a diff (line balance, deletions, lockfiles) run `bun run script/guards/history.ts -n 300 <id>`: it applies the rule to each of the last N commits and lists the hits with their commit. Read them like the baseline hits.
4. Fill `positive` and `negative` with real lines. The test runs them against the rule.
