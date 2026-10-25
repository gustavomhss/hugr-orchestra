# Guardrail pilot catalog (75 rules)

Add-on to Orchestra CI. Not a product. Rules are declarative TOML run by one small engine.

## Engine contract

- Input: `git diff <merge-base>...HEAD`. Rules look at **added lines** (or at added/deleted/renamed paths). Old code never fails.
- Config and rules are read from the **base branch**, not the PR head. A PR cannot relax its own guards.
- Severity: `gate` blocks CI. `warn` prints an annotation. Rules that need judgment are `warn`; there are no profiles.
- Escape: `guardrail-ignore: <id> <reason>` on the line (reason required). Path rules are cleared per rule by an approver's label `guardrail-approved:<id>`; every new `guardrail-ignore` shows up as a `guardrail-ignore-added` warning. No exception ledger exists yet.
- Every rule ships with one positive and one negative fixture. No fixture, no rule.
- Languages in this repo: TypeScript (dominant), Rust, Python, GitHub Actions, SQL. The pilot covers only these.

## Research notes that shaped the catalog

- Agent cheating is real but rare per PR: a mined set of 327 agent PRs had about 8% with a maintainer complaint naming a cheat, about 2% under a strict re-audit ([DEV](https://dev.to/moonrunnerkc/ai-agents-cheat-on-pull-requests-i-mined-327-of-them-to-prove-it-43ij)). Transluce measured about 2% of 8,600 real sessions for success misrepresentation and for monitor evasion ([LessWrong](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1)). Secondary sources, not peer reviewed.
- Same author: structural detectors had poor precision (swallowed-error 0.40, fake-refactor 0.50, assertion-strip 0 of 5). So anything that needs judgment (T6, T13) is `warn` only. Gates are limited to patterns a regex or path check decides exactly.
- Patterns seen in the wild: test deletion, loosened matchers (`toEqual` to `toBeTruthy`), `@ts-ignore` / `eslint-disable` over the failing line, swallowed errors, removed mocks, tests-only "fixes".
- Rule ideas borrowed (patterns only, MIT/Apache sources, credit in THIRD_PARTY_NOTICES): [zizmor audits](https://docs.zizmor.sh/audits/), [pre-commit-hooks](https://cobalt.googlesource.com/pre-commit-hooks/+show/refs/heads/main/README.md), [Biome rules](https://biomejs.dev/linter/rules-sources), [squawk](https://github.com/sbdchd/squawk). Not copied: Semgrep registry rules (restrictive license), AGPL tools.
- Unverified: exact squawk rule names (`ban-drop-column`, `adding-not-nullable-field`) were not confirmed in research. Check `squawk --list-rules` before copying wording.

## What goes wrong when people work with AI (and which rules answer it)

Evidence is mostly vendor reports and incident write-ups; numbers are as reported, not independently verified.

### High frequency, low blast radius (every week)

| Mistake | Evidence | Rules |
|---|---|---|
| Agent makes the red test green by skipping, deleting or loosening it | [mined PRs](https://dev.to/moonrunnerkc/ai-agents-cheat-on-pull-requests-i-mined-327-of-them-to-prove-it-43ij) | T1-T8, T10-T12 |
| Silences the compiler/linter instead of fixing the cause (`@ts-ignore`, `eslint-disable`, `noqa`, `#[allow]`) | same | S1-S8 |
| Swallows errors (`catch {}`, `except: pass`); error paths about 2x more often in AI PRs | [CodeRabbit](https://coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report): 10.83 vs 6.45 issues per PR | S12, S13 |
| Copy-pastes instead of reusing; moved/refactored code fell from about 25% to under 10% of changed lines (2021 to 2024) | [GitClear](https://devclass.com/2025/02/20/ai-is-eroding-code-quality-states-new-in-depth-report/) | Z1, Z2 (size proxies only; duplication needs a dedicated tool, out of scope) |
| Leaves debug and scratch residue | folklore, universal | D1-D5, H12 |
| Giant PR nobody reviews | folklore, universal | Z2, V1 |
| "Fix" that only touches tests | [mined PRs](https://dev.to/moonrunnerkc/ai-agents-cheat-on-pull-requests-i-mined-327-of-them-to-prove-it-43ij) | T13 (warn) |

### Medium frequency, medium blast radius (every month)

| Mistake | Evidence | Rules |
|---|---|---|
| Secret committed or pasted into config; Claude Code co-authored public commits leaked at about 3.2% vs 1.5% baseline | [GitGuardian 2026](https://www.techradar.com/pro/security/over-29-million-secrets-were-leaked-on-github-in-2025-and-ai-really-isnt-helping) | H2, H3, X2, S14 |
| Secret shipped to the browser through a public env prefix | [Wiz](https://wiz.io/blog/common-security-risks-in-vibe-coded-apps) | S14 |
| Hallucinated package name pulled in; 19.7% of 2.23M samples had at least one (2025 study), 4.6-6.1% of suggested packages on 2026 frontier models | [USENIX study via CSA note](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/) | T14, P1, P2, P3 |
| TLS verification turned off to make a request work | pattern, widely reported | X1 |
| CI weakened to get green (`continue-on-error`, `if: false`, `--no-verify`, lower coverage threshold) | pattern, widely reported | C6, C7, C13, T12 |
| Hand-edit of generated files, then regeneration erases it | AGENTS.md rule | H13 |
| Instruction/config files rewritten (`AGENTS.md`, workflows, the guards themselves) | policy integrity | C14 |

### Low frequency, high blast radius (rare, expensive)

| Mistake | Evidence | Rules |
|---|---|---|
| Agent deletes production data and backups with a token it found lying around | Cursor running Opus 4.6 ([PocketOS, 2026](https://www.techspot.com/news/112207-ai-coding-agent-running-claude-wiped-startup-database.html)) and Replit ([2025](https://www.eweek.com/news/replit-ai-coding-assistant-failure/)); founder accounts, not independently verified | partial: D6, M1, M2, H2, X2. Real prevention is runtime permissions and token scoping, which a diff guard cannot give |
| Row-level security off, full DB exposed to the client (Supabase/Lovable class) | [Wiz](https://wiz.io/blog/common-security-risks-in-vibe-coded-apps) | M1, S14 |
| Workflow privilege escalation (`pull_request_target`, template injection, unpinned actions) | [zizmor audits](https://docs.zizmor.sh/audits/) | C1-C5, C8-C12 |
| Install-time code execution through `postinstall` or git dependencies | supply-chain class | P1, P2 |

### What a diff guard cannot catch (say so honestly)

- Agent claims success without running anything (Transluce: about 2% of sessions). Needs the CI result itself, not a diff rule.
- Gaming a test with special-cased inputs, fake refactors, hard-coded outputs. Low-precision even with AST detectors; kept out of gates.
- Runtime destruction (the PocketOS/Replit class). Belongs in permissions, scoped tokens and backups.
- Duplication and design rot. Belongs in a metrics tool, not a per-PR gate.

## Validation outcome (read `validation.md` and `sources.md`)

Scanned the last 300 commits of `origin/dev` (88k added lines). Per-rule patterns, hit counts and samples live in [validation.md](validation.md); licenses and borrowable patterns in [sources.md](sources.md). Those two files are authoritative where they differ from the tables below.

- 26 rules keep their gate, 0 false positives among them; H1 caught a real conflict marker committed in `10a1689bdb`.
- 20 rules need a tighter pattern or scope before shipping (T1, T2, T7, T14, S1, S3, S4, D2, D6, H6, H7, H10, H12, H13, C2, C7, C11, P3, V1, V2). Examples: `.fit()` matched `fit(`; `save-if: false` matched `if: false`; 90% of P3 hits were `exports`-only edits; V1/V2 must gate the PR title/head, not merge commits or `claude/` worktree branches.
- S12 (empty catch) is demoted to warn: the repo has 64 intentional best-effort `catch {}`.
- Cut for no surface: snapshots and coverage threshold. Cut as reimplementation: godfile size rules.
- Added from real history: E1, G1 (above), B1 and N1 (repo-specific).
- 16 rules have no signal yet (28 Rust and 93 Python added lines in the window; migrations live under `packages/core/src/database/migration/` and `apps/orchestra/migration/`, not `.sql` everywhere). They ship as warn until real hits exist; M1/M2 get rescoped to those paths.
- Engine prerequisites, before any line rule ships: rename/move detection (`-M`) with a skip for lines identical to a deleted line in the same PR, a shared generated-path exclusion (S3 drops from 145 raw hits to 19 real), and explicit handling of merge commits.
- Squawk names corrected: `ban-drop-column` exists; adding a NOT NULL column is `adding-required-field`; `adding-not-nullable-field` is the `SET NOT NULL` case.
- Not diff-catchable, handled elsewhere: type errors found after push (make `typecheck.yml` a required check), Windows path bugs (existing Windows lane).
- Workflow pack implemented (13 rules, `gha-*` plus `hook-bypass`). Not yet: C2 `gha-permissions-missing` and C11 `gha-checkout-credentials`, which need whole-file or YAML-step checks the line engine does not do. `bun run script/guards/baseline.ts` (scan of today's code) found four false positives the hand-written samples missed, now fixed: a `fit(372, 94)` helper, bare `JSON` button text, a `test.only(name, ...)` wrapper, a commented/echoed `curl | bash`. `heredoc-residue` no longer looks for `JSON`.
- Suppression and debug pack implemented (17 rules: S3-S8, S10-S14, D1-D6). `rs-unsafe-no-safety` (S9) is deferred: a line engine cannot see the previous line. The baseline scan tightened `wip-marker` (WIP is a product term here, so only a comment-leading WIP/XXX counts), `js-console-log` (CLI, gates and examples print on purpose) and made five rules skip comment lines.
- Hygiene pack implemented (11 rules: env-file, private-key, merge-artifacts, os-junk, agent-scratch, build-output, large-file, binary-added, symlink-added, submodule-added, exec-bit). `conflict-markers` is in the first slice. Deferred: `case-collision` (compares the whole tree, not the diff) and `generated-edited` (needs a map from each generated path to its generator). The engine now reads git mode, blob size, binary and shebang so changed-paths rules can filter on them. The baseline scan skipped test fixtures for `private-key` (six fake keys in secret-scrubbing tests) and showed real defects at HEAD: two SVGs and one script with the executable bit and no shebang, one symlink.
- Test pack implemented (9 rules: py-test-skipped, rs-test-ignored, test-file-deleted, test-assertions-removed, test-declaration-removed, js-loose-assertion, py-assert-trivial, rs-should-panic-bare, test-retry-added). The engine gained `line-balance` rules and per-file removed lines, and `history.ts` scans the last N commits. The scans cut `js-loose-assertion` down to assertions on literals (101 `toBeTruthy` calls in tests today make it the repo idiom), dropped `retries:` from `test-retry-added` (tests set it as an option of the code under test), and anchored three rules to a statement because tests here write sample test files as strings. Deferred: `fix-without-source` (needs the PR title) and `dep-new-added` (needs to tell a new dependency from a bump).
- Next candidates from prior art (`sources.md`): `migration-add-required-column`, `gha-secrets-tojson`, `gha-deprecated-commands`, `gha-unpinned-images`, `gha-hardcoded-credentials`, `path-illegal-windows-name`.

## Catalog

`G` = gate, `W` = warn. Source: own, A = AGENTS.md, Z = zizmor, P = pre-commit-hooks, B = Biome, Q = squawk, R = agent-cheating research.

### Test integrity (14)

| # | id | Catches | Sev | Src |
|---|---|---|---|---|
| T1 | js-test-focused | `.only`, `fit`, `fdescribe` | G | B |
| T2 | js-test-skipped | `.skip`, `xit`, `xdescribe` | G | B |
| T3 | py-test-skipped | unconditional `pytest.mark.skip`, `xfail` without a reason, `unittest.skip` (not `skipif` with a reason) | G | own |
| T4 | rs-test-ignored | `#[ignore]` on a test | G | own |
| T5 | test-file-deleted | deleted test file with no rename (cleared by `guardrail-approved:test-file-deleted`) | G | R |
| T6 | test-assertions-removed | removed `expect(`/`assert` outnumber added in a test file | W | R |
| T7 | js-loose-assertion | added `toBeTruthy`, `toBeDefined`, `expect(true)` | W | R |
| T8 | py-assert-trivial | `assert True`, `assert x or True` | G | own |
| T9 | rs-should-panic-bare | `#[should_panic]` without `expected =` | W | own |
| T10 | test-retry-added | `jest.retryTimes`, `pytest.mark.flaky`, retry flags | W | own |
| E1 | heredoc-residue | added line that is exactly `EOF`, `PY`, `HEREDOC` or `JSON` (or `<<'EOF'`) in `*.ts,tsx,js`; 3 real hits in 300 commits, 0 false positives (replaces T11) | G | history |
| G1 | generated-stale | public HttpApi/Protocol source changed with no change in the matching generated directory in the same PR (AGENTS.md: run `bun run generate`); gate for `packages/client`, warn for SDK/atlas (replaces T12) | G | history |
| T13 | fix-without-source | title says `fix` but only test files changed | W | R |
| T14 | dep-new-added | new dependency in a manifest (hallucinated or typosquatted package check: needs a justification line in the PR) | W | R |

### Suppressions and escape hatches (14)

| # | id | Catches | Sev | Src |
|---|---|---|---|---|
| S1 | ts-ignore | `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error` without reason | G | R |
| S2 | lint-disable | `eslint-disable*`, `biome-ignore` without reason | G | R |
| S3 | ts-any-added | `: any`, `as any` | W | B |
| S4 | ts-double-cast | `as unknown as T` | W | own |
| S5 | py-type-ignore | `# type: ignore`, `# pyright: ignore` without code | G | own |
| S6 | py-noqa-blanket | `# noqa` without a rule code | G | own |
| S7 | py-no-cover | `# pragma: no cover` | W | own |
| S8 | rs-allow-lint | `#[allow(...)]`, `#![allow(...)]` | W | own |
| S9 | rs-unsafe-no-safety | `unsafe` without a `// SAFETY:` comment | G | own |
| S10 | rs-unwrap-added | `.unwrap()` / `.expect(` outside tests | W | own |
| S11 | rs-todo-macros | `todo!()`, `unimplemented!()` | G | own |
| S12 | js-empty-catch | `catch {}` with an empty body | G | R |
| S13 | py-bare-except | bare `except:` or `except: pass` | G | R |
| S14 | client-env-secret | secret-looking name behind a public prefix (`NEXT_PUBLIC_*KEY`, `VITE_*SECRET`, `EXPO_PUBLIC_*TOKEN`) | G | R |

### Debug leftovers (6)

| # | id | Catches | Sev | Src |
|---|---|---|---|---|
| D1 | js-debugger | `debugger` statement | G | B |
| D2 | js-console-log | `console.log` in non-test, non-CLI source | W | B |
| D3 | py-breakpoint | `breakpoint()`, `pdb.set_trace`, `import pdb` | G | P |
| D4 | rs-dbg-macro | `dbg!(` | G | own |
| D5 | wip-marker | `DO NOT MERGE`, `WIP`, `XXX` in added lines | G | own |
| D6 | destructive-shell | `rm -rf`, `git push --force`, `git reset --hard`, `DROP DATABASE` added to scripts, CI or agent hooks | G | R |

### Repo hygiene (14)

| # | id | Catches | Sev | Src |
|---|---|---|---|---|
| H1 | conflict-markers | `<<<<<<<`, `=======`, `>>>>>>>` | G | P |
| H2 | env-file | `.env`, `.env.*` (allow `.env.example`) | G | own |
| H3 | private-key | `-----BEGIN ... PRIVATE KEY-----` | G | P |
| H4 | merge-artifacts | `.orig`, `.rej`, `.bak`, `.swp` | G | own |
| H5 | os-junk | `.DS_Store`, `Thumbs.db` | G | own |
| H6 | large-file | added file over N KB (default 500) | G | P |
| H7 | binary-added | binary file outside an allowed extension list | W | own |
| H8 | symlink-added | new symlink | W | P |
| H9 | submodule-added | new submodule | G | P |
| H10 | exec-bit | executable bit on a non-script | W | P |
| H11 | case-collision | paths that differ only by case | G | P |
| H12 | agent-scratch | agent leftovers: `*.log`, `tmp/`, `scratch*`, `notes-*.md`, transcripts, `.claude/worktrees/` | G | R |
| H13 | generated-edited | files marked generated changed without their generator (A: `src/generated*`) | G | A |
| H14 | build-output | `dist/`, `node_modules/`, `target/`, `__pycache__/` added | G | own |

### Repo-specific (2)

Size is not a rule here: the engine calls the existing `script/godfile.ts` (500/750, waivers in `godfile-waivers.json`) instead of reimplementing it.

| # | id | Catches | Sev | Src |
|---|---|---|---|---|
| B1 | import-direction | added import of `@orchestra/core` or `@orchestra/server` from `packages/client`, `packages/schema`, `packages/protocol` (AGENTS.md direction rule). Probe found 0 hits, so it is cheap and quiet. Home: `script/check-module-boundaries.ts` | G | A, history |
| N1 | legacy-name | case-insensitive `opencode` in added lines of non-doc, non-generated source, reusing the `rename-ledger` allowlist. Warn until vendored legacy types are gone, then gate (replaces file-growth) | W | history |

### CI and workflows (14)

| # | id | Catches | Sev | Src |
|---|---|---|---|---|
| C1 | gha-unpinned-uses | `uses:` not pinned to a 40-char SHA | G | Z |
| C2 | gha-permissions-missing | workflow with no `permissions:` | G | Z |
| C3 | gha-permissions-broad | `write-all` or write scopes at workflow level | G | Z |
| C4 | gha-pull-request-target | `pull_request_target` trigger | G | Z |
| C5 | gha-template-injection | `${{ github.event.*.title/body/head_ref }}` inside `run:` | G | Z |
| C6 | gha-continue-on-error | `continue-on-error: true` added | G | R |
| C7 | gha-job-disabled | `if: false` or `if: ${{ false }}` added | G | R |
| C8 | gha-insecure-commands | `ACTIONS_ALLOW_UNSECURE_COMMANDS` | G | Z |
| C9 | gha-env-write | `>> $GITHUB_ENV` / `GITHUB_PATH` with an expression | W | Z |
| C10 | gha-curl-pipe-sh | `curl ... | sh/bash` in `run:` | G | own |
| C11 | gha-checkout-credentials | `actions/checkout` without `persist-credentials: false` | W | Z |
| C12 | gha-secrets-inherit | `secrets: inherit` | W | Z |
| C13 | hook-bypass | `--no-verify`, `HUSKY=0`, `SKIP=` added in scripts or CI | G | R |
| C14 | protected-paths | changes to guardrail config/rules, `CODEOWNERS`, `.github/workflows/**`, `AGENTS.md` need an approval label | G | own |

### Security patterns (4)

| # | id | Catches | Sev | Src |
|---|---|---|---|---|
| X1 | tls-verify-off | `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `verify=False`, `danger_accept_invalid_certs` | G | own |
| X2 | secret-pattern | high-signal key shapes (`AKIA…`, `ghp_…`, `sk-…`), patterns borrowed from gitleaks | G | own |
| X3 | eval-dynamic | `eval(`, `new Function(` | W | B |
| X4 | unsafe-html | `dangerouslySetInnerHTML`, `.innerHTML =` | W | B |

Complements, does not replace, `check:spawn-imports` (process spawning stays there).

### Dependencies (3)

| # | id | Catches | Sev | Src |
|---|---|---|---|---|
| P1 | dep-git-source | git/URL dependency in `package.json`, `Cargo.toml`, `requirements*.txt` | G | own |
| P2 | dep-lifecycle-script | `preinstall`/`postinstall` added to `package.json` | G | own |
| P3 | lockfile-stale | manifest changed, lockfile not | G | own |

### Migrations (2)

| # | id | Catches | Sev | Src |
|---|---|---|---|---|
| M1 | migration-destructive | `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE` without `WHERE` in a migration | G | Q |
| M2 | migration-edited | an already-merged migration file is modified | G | own |

Note: the Migrations pack is 2 rules; row-level-security off is covered by M1's pattern list (`DISABLE ROW LEVEL SECURITY`).

### Conventions from AGENTS.md (2)

| # | id | Catches | Sev | Src |
|---|---|---|---|---|
| V1 | commit-title-format | PR title / commits not `type(scope): summary` with an allowed type | G | A |
| V2 | branch-name | branch with more than 3 words or a slash | G | A |

Total: 14 + 14 + 6 + 14 + 2 + 14 + 4 + 3 + 2 + 2 = **75** (the "Test integrity" and "Repo-specific" counts include E1, G1, B1, N1).

## Backlog (not in the pilot)

dep-wildcard-version, dep-new-added, dep-registry-override, migration-not-null-no-default, migration-index-nonconcurrent, js-eval variants, py-unsafe-deserialize, gha-workflow-run, Public API change, Required Documentation, Build Script. Add each when it has a precise failure condition and a fixture.

## Rollout

1. Engine + Z1 (port godfile), C14, T1, T2, S1, S2, H1 as the first slice.
2. Run in warn mode for one week on `dev` to measure noise. Any rule that fires on legit code is retuned or demoted before it becomes a gate.
3. Fill the remaining packs, one pack per PR, each rule with fixtures through `bun run test:ci`.

### Dependency pack (implemented)

dep-git-source, dep-lifecycle-script, dep-registry-override, lockfile-stale, cargo-lockfile-stale. Baseline: one real `github:` dependency (packages/app-shell) and two existing postinstall scripts. History over 300 commits: lockfile-stale found 2 real hits. Deferred: dep-new-added (needs to tell a new dependency from a bump).

### Migration pack (implemented)

migration-destructive (gate), migration-edited (gate), migration-add-required-column (warn). Baseline: 11 existing intentional DROP statements in shipped migrations (only new lines fire), 2 existing NOT NULL adds without DEFAULT. History over 300 commits: 0 hits, so no false alarms on normal work.

### Agent-mistake pack (implemented, from the cold review)

secret-token, local-abs-path (warn), llm-elision (warn), tls-verify-off, ts-strict-relaxed, local-tests-escape (warn), test-globalthis (warn), test-timeout-raised (warn). Baseline: secret-token 0 after excluding the secret-scrubbing fixtures; ts-strict-relaxed lists only default-on flags because `noUncheckedIndexedAccess: false` is the repo convention in 21 packages; local-abs-path skips tests and synthetic users (6 real hits, two with the owner's name); one existing `NODE_TLS_REJECT_UNAUTHORIZED=0` in a test. History over 300 commits: 0 hits for all eight. Still deferred: dep-new-added.

### Trim (after the cold review)

rs-allow-lint and rs-unwrap-added were removed: they fired on most Rust diffs, and clippy's restriction lints do the job better for teams that want it. protected-paths no longer lists `.github/workflows/**` and `.github/actions/**`; the gha-* rules judge those edits, and a blanket label turned approval into a rubber stamp.

### dep-new-added (implemented)

Warn on a package name that was not in the manifest before (`new_only` in the engine). Baseline treats every dependency as new (765 lines), so only the history is informative: 18 hits over 300 commits, each a real new dependency.
