# Guardrail prior art: licenses, patterns, new candidates

Research date 2026-10-24. Read-only, primary sources only (LICENSE files and the tools' own docs). Anything not confirmed from a primary source is marked **UNVERIFIED**. Patterns below are described in our own words; regex shapes are illustrative, not copied. Borrowing ideas is fine under every license below; copying text, regexes or fixtures verbatim needs the notice in THIRD_PARTY_NOTICES.

## Licence verdicts

| Tool | License (as read) | LICENSE URL read | Borrowable? |
|---|---|---|---|
| zizmor | MIT, "Copyright (c) 2024 William Woodruff" | https://github.com/zizmorcore/zizmor/blob/main/LICENSE | Yes (notice if text copied) |
| pre-commit-hooks | MIT wording, no title in the file; "pre-commit dev team: Anthony Sottile, Ken Struys" | https://raw.githubusercontent.com/pre-commit/pre-commit-hooks/main/LICENSE | Yes |
| gitleaks | MIT, Zachary Rice | https://raw.githubusercontent.com/gitleaks/gitleaks/master/LICENSE | Yes |
| ruff | MIT, Charles Marsh (2022). The file also bundles third-party notices (autoflake, Flake8, Pyright, pyupgrade) | https://raw.githubusercontent.com/astral-sh/ruff/main/LICENSE | Yes, ideas only. Rules ported from flake8 plugins carry their own upstream licenses; do not copy rule text |
| clippy | Dual MIT OR Apache-2.0, "The Rust Project Contributors" (LICENSE-MIT) and Apache 2.0 (LICENSE-APACHE) | https://raw.githubusercontent.com/rust-lang/rust-clippy/master/LICENSE-MIT and .../LICENSE-APACHE | Yes |
| biome | MIT, "Biome Developers and Contributors (2023-present)", earlier Rome Tools, Inc. Other license files in the repo not checked: **UNVERIFIED** | https://raw.githubusercontent.com/biomejs/biome/main/LICENSE-MIT | Yes, ideas only (many rules derive from ESLint plugins) |
| squawk | Dual MIT / Apache-2.0 (LICENSE-MIT, LICENSE-APACHE exist; MIT text names no holder). `/LICENSE` is a 404 | https://raw.githubusercontent.com/sbdchd/squawk/master/LICENSE-MIT and .../LICENSE-APACHE | Yes |
| actionlint | MIT, rhysd (2021) | https://raw.githubusercontent.com/rhysd/actionlint/main/LICENSE.txt | Yes |

### NOT borrowable

| Tool | License (as read) | Verdict |
|---|---|---|
| trufflehog | GNU AGPL v3 | Do not borrow text, regexes or code. https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/LICENSE |
| MegaLinter | GNU AGPL v3 | Do not borrow. https://raw.githubusercontent.com/oxsecurity/megalinter/main/LICENSE |
| Semgrep registry / semgrep-rules | "Semgrep Rules License v. 1.0" (named on the repo page; contributions are licensed to Semgrep, Inc.). The text of the license (semgrep.dev/legal/rules-license) was not read, so its restrictions are **UNVERIFIED** | Treat as not borrowable. https://github.com/semgrep/semgrep-rules |

## zizmor (docs: https://docs.zizmor.sh/audits/, /usage/, /configuration/)

41 audits are listed. Catalog rule to audit:

| Our id | zizmor audit | Detection shape |
|---|---|---|
| C1 | unpinned-uses | `uses:` ref that is not a full commit hash |
| C2, C3 | excessive-permissions | missing `permissions:` or broad workflow/job scopes |
| C4 | dangerous-triggers | `pull_request_target`; the audit also covers `workflow_run` and `issue_comment` |
| C5 | template-injection | `${{ }}` expansion in a `run:` or script context |
| C8 | insecure-commands | env `ACTIONS_ALLOW_UNSECURE_COMMANDS` set |
| C9 | github-env | writes to the GITHUB_ENV / GITHUB_PATH files |
| C11 | artipacked | checkout leaving credentials on disk (no `persist-credentials: false`) |
| C12 | secrets-inherit | `secrets: inherit` on a reusable-workflow call |

Audits not yet in the catalog (new candidates, ids proposed):

| Proposed id | zizmor audit | Condition on added lines | Sev |
|---|---|---|---|
| gha-secrets-tojson | overprovisioned-secrets, unredacted-secrets | `toJSON(secrets)` or `fromJSON(` applied to a `secrets.*` value | G |
| gha-obfuscation | obfuscation | no-op wrappers such as `fromJSON(toJSON(` in an expression | G |
| gha-hardcoded-credentials | hardcoded-container-credentials | `container:`/`services:` `credentials:` password that is a literal, not `${{ secrets.* }}` | G |
| gha-unpinned-images | unpinned-images | `image:`/`container:` with no tag or `:latest` (digest pin is the pedantic tier) | G for latest/no tag |
| gha-trusted-publishing | use-trusted-publishing | publish step (npm publish, cargo publish, pypi action) driven by a long-lived token secret instead of OIDC. Relevant: we publish `@humanguardrail/cli` | W |
| gha-bot-conditions | bot-conditions | `if:` comparing `github.actor` to a `...[bot]` name (spoofable) | W |
| gha-unsound-condition | unsound-condition (actionlint "constant conditions" is the sibling) | `if:` written as a YAML block scalar (`|`/`>`) around `${{ }}`, which makes it always true | G |
| gha-unsound-contains | unsound-contains | `contains(<string-valued context>, ...)` where substring match is a bypass | W |
| gha-unsound-ternary | unsound-ternary | `a && '' || b` style pseudo-ternary with a falsy literal in the true branch | W |
| gha-ref-version-comment | ref-version-mismatch | SHA-pinned `uses:` with no trailing version comment (missing is pedantic in zizmor) | W |
| gha-misfeature | misfeature | `shell: cmd`, non-standard shells, `pip-install` input on setup-python | W |
| gha-secrets-outside-env | secrets-outside-env (auditor) | `secrets.*` used in a job with no `environment:` | W |
| gha-self-hosted | self-hosted-runner (pedantic) | `runs-on` naming `self-hosted` | W |
| gha-concurrency-missing | concurrency-limits (pedantic) | workflow without `concurrency:` | W |
| gha-adhoc-packages | adhoc-packages | `run:` doing a bare package install outside a lockfile (`npm install <pkg>`, `pip install <pkg>`, `gem install`) | W |
| gha-dependabot-exec | dependabot-execution | `insecure-external-code-execution: allow` in dependabot config | G |
| gha-workflow-run | dangerous-triggers (workflow_run part) | `workflow_run` trigger (already in our backlog) | W |

Not diff-decidable offline (need network): archived-uses, impostor-commit, known-vulnerable-actions, ref-confusion, stale-action-refs, typosquat-uses (low confidence offline; high when a token confirms). Skip. Others skipped as low value: anonymous-definition, self-repository, superfluous-actions, github-app, cache-poisoning, insecure-url-scheme (pre-commit only), undocumented-permissions, dependabot-cooldown.

Design ideas:
- Personas: regular (default), pedantic, auditor. Maps to our profiles: gate = regular, warn = pedantic, auditor = informational. https://docs.zizmor.sh/usage/
- Inline ignore `# zizmor: ignore[rule1,rule2] <explanation>`: explanation supported, **not required** (we require it). Must be a real YAML comment inside the finding's span.
- Path ignores in config: `rules.<id>.ignore` with `file[:line[:col]]`. https://docs.zizmor.sh/configuration/
- `--no-ignores` (v1.25.0+) turns off every ignore, an audit mode. We should have the same to measure how much is being suppressed.
- `disable: true` per rule is called a last resort because disabled rules do not show up in suppressed counts. Lesson: our ledger should always count suppressed findings.
- `--min-severity` and `--min-confidence` as two separate axes.
- No baseline file and no unused-ignore report documented (UNVERIFIED beyond the pages read).

## pre-commit-hooks (https://raw.githubusercontent.com/pre-commit/pre-commit-hooks/main/README.md)

| Our id | Hook | Detection shape |
|---|---|---|
| H1 | check-merge-conflict | conflict marker lines |
| H3 | detect-private-key | private key material in file text |
| H6 | check-added-large-files | size over `--maxkb` (default 500) |
| H8 | check-symlinks, destroyed-symlinks | symlink; or symlink turned into a regular file holding its target path |
| H9 | forbid-new-submodules | new submodule |
| H10 | check-executables-have-shebangs, check-shebang-scripts-are-executable | exec bit vs `#!` first line |
| H11 | check-case-conflict | two paths equal ignoring case |
| D3 | debug-statements | debugger import or `breakpoint()` in Python |
| X2 | detect-aws-credentials | AWS secrets as configured by the AWS CLI |

New candidates:

| Proposed id | Hook | Condition | Sev |
|---|---|---|---|
| path-illegal-windows-name | check-illegal-windows-names | added path with a reserved device name (CON, NUL, COM1...), a forbidden character, or trailing dot/space. We run a Windows lane | G |
| symlink-broken | check-symlinks | added symlink whose target is not in the tree | G |
| symlink-destroyed | destroyed-symlinks | a path that was a symlink becomes a regular file | W |
| exec-without-shebang | check-executables-have-shebangs | added file with exec bit and no `#!` first line (inverse of our H10) | W |
| shebang-not-executable | check-shebang-scripts-are-executable | added file starting with `#!` without exec bit | W |
| config-parse-error | check-json, check-toml, check-yaml | added/changed `.json`, `.toml`, `.yml` that does not parse | G |
| line-ending-mixed | mixed-line-ending | added lines with CRLF in a file that otherwise uses LF | W |
| bom-added | fix-byte-order-marker | UTF-8 BOM at file start | W |
| vcs-permalink | check-vcs-permalinks | added doc/comment URL to a hosting site pointing at a branch (`/blob/main/`) instead of a commit hash | W |

Design ideas: every hook takes per-hook args (`--maxkb`, `--branch`, `--pattern`) and a `files` filter, so thresholds live in config, not code. `--enforce-all` checks every listed file, not only the changed ones: a good "full scan" mode for the engine. `no-commit-to-branch` has the same intent as our V2 but on the commit side.

## gitleaks (https://raw.githubusercontent.com/gitleaks/gitleaks/master/README.md, config at .../config/gitleaks.toml)

| Our id | Rule shape (own words) |
|---|---|
| X2, H3 | A rule has an id, a regex with a chosen capture group for the secret, a cheap `keywords` pre-filter, an optional minimum entropy, an optional path restriction and `allowlists` (by commit, path, regex or stopword; AND/OR). `aws-access-token`: fixed 4-char prefix family (`AKIA`, `ASIA`, `ABIA`, `ACCA`, `A3T?`) plus 16 chars of a restricted alphabet, entropy floor, allowlist for values ending in `EXAMPLE`. `github-pat`: literal `ghp_` plus 36 alphanumerics, entropy floor. `private-key`: PEM BEGIN line containing `PRIVATE KEY`, body of at least 64 chars, matching END line, case-insensitive. The default file is generated (header says auto-generated, generator `cmd/generate/config/main.go`) and includes Anthropic key rules (`anthropic-api-key`, `anthropic-admin-api-key`) |

No new rule ids beyond X2's pattern list. Improvement for X2: require the `EXAMPLE`-style stopword allowlist and an entropy floor so fixtures do not fail.

Design ideas (https://github.com/gitleaks/gitleaks, README):
- Inline `gitleaks:allow` comment, plus `--ignore-gitleaks-allow` to disable inline escapes. Useful strict mode.
- `.gitleaksignore` of finding fingerprints (marked experimental in the README).
- Baseline: rerun with `--baseline-path <old report>` so only new findings count. Fits our "old code never fails" rule, but we get it free from diffing.
- `[extend]` with `useDefault`, `disabledRules`, and id-matched override of single attributes, depth limited to two.
- README says the project is feature complete (security patches only) with a successor, Betterleaks. Do not depend on its rule file staying current.

## ruff (docs: https://docs.astral.sh/ruff/rules/, https://docs.astral.sh/ruff/linter/#error-suppression)

| Our id | Ruff rule(s) (code, name as listed) | Shape |
|---|---|---|
| S5 | PGH003 blanket-type-ignore | `# type: ignore` with no bracketed code |
| S6 | PGH004 blanket-noqa | `# noqa` with no code |
| S13 | E722 bare-except; S110 try-except-pass | `except:` with no type; `except ...: pass` |
| D3 | T100 debugger | debugger import/call |
| T3 | (PT skip rules not confirmed in the pages read) UNVERIFIED | |
| T8 | B011 assert-false | `assert False` |

New candidates:

| Proposed id | Ruff rule | Condition | Sev |
|---|---|---|---|
| py-print | T201 print, T203 p-print | `print(` / `pprint(` in non-test Python | W |
| py-exec-eval | S102 exec-builtin, S307 suspicious-eval-usage | `exec(` / `eval(` calls | W |
| py-pickle | S301 suspicious-pickle-usage | `pickle.load(s)` | W |
| py-hardcoded-password | S105/S106/S107 | string literal assigned to a name/arg like `password`, `secret`, `token` | W |
| py-request-no-timeout | S113 request-without-timeout | `requests.get/post(...)` call with no `timeout=` | W |
| py-pytest-fail-no-message | PT016 pytest-fail-without-message | `pytest.fail()` with no message | W |
| py-pytest-raises-broad | PT011 pytest-raises-too-broad | `pytest.raises(ValueError)` etc. without `match=` | W |
| todo-without-link | FIX001-FIX004 (fixme, todo, xxx, hack) and TD003 missing-todo-link | added `TODO`/`FIXME`/`HACK` comment with no issue reference. Complements D5 (which only has WIP/XXX/DO NOT MERGE) | W |
| py-naive-datetime | DTZ001, DTZ005 | `datetime.now()` / `datetime(...)` without tz | W |

Ruff-only codes noted but not used: ERA001 commented-out-code (precision doubtful), S101 assert (we are not a Python app), S501 (covered by X1).

Design ideas:
- RUF100 `unused-noqa`: report suppressions that suppress nothing. Needs the engine to know which ignores matched. Page does not say if enabled by default; UNVERIFIED. https://docs.astral.sh/ruff/rules/unused-noqa/
- Range suppressions: `# ruff: disable[CODE]` / `# ruff: enable[CODE]`; ranges must name codes (no blanket); a missing enable is itself flagged (RUF104).
- `# ruff: noqa` file-level; `per-file-ignores` in config for path exceptions.
- `--add-noqa` inserts suppressions on every current hit: a bulk adoption tool. We do not need it (diff only), but it confirms the "ledger for legacy" path.
- Docs do not say whether a justification is required: reason-required is our own stricter choice.

## clippy (https://github.com/rust-lang/rust-clippy; lint sources under clippy_lints/src)

| Our id | Clippy lint | Detection (confirmed from lint source docs unless noted) |
|---|---|---|
| D4 | dbg_macro (restriction) | use of `dbg!` |
| S11 | todo, unimplemented (restriction); also panic and unreachable (restriction) in `panic_unimplemented.rs` | uses of those macros |
| S9 | undocumented_unsafe_blocks (restriction) | `unsafe` block or `unsafe impl` without a comment containing `SAFETY:` (case-insensitive). Accepted places: directly above with only comments between, a block comment opening the line, same-line comment on the previous line, or the first comment inside the block. Optional: above attributes, above a `let/const/static` |
| S8 | allow_attributes, allow_attributes_without_reason (both restriction, allow by default) | `#[allow]` instead of `#[expect]`; `allow` without `reason = ...` |
| S10 | unwrap_used, expect_used | names from memory, file not read: **UNVERIFIED** |
| (new) | print_stdout, print_stderr, exit | names and groups from memory (the `write.rs` and `exit.rs` source URLs returned 404): **UNVERIFIED** |

New candidates:

| Proposed id | Source | Condition | Sev |
|---|---|---|---|
| rs-panic-macro | panic (restriction) | `panic!(` / `unreachable!(` outside tests | W |
| rs-allow-no-reason | allow_attributes_without_reason | `#[allow(...)]` without `reason =`. Suggest tightening S8 to this: `allow` with a reason passes, without fails | W (or G once clean) |
| rs-print-macro | print_stdout / print_stderr (UNVERIFIED) | `println!`, `eprintln!` in library crates | W |

Design ideas:
- `allow` to `expect`: the compiler reports an `expect` that no longer fires, so unused suppression reporting comes free in Rust. Put that in the S8 message. https://github.com/rust-lang/rust-clippy (allow_attributes docs)
- `clippy.toml` `disallowed-macros` entries can be a plain path or a table with `path`, `reason`, `allow-invalid`. The reason is shown in the diagnostic. Model for our `destructive-shell` and `spawn` bans: a list with a per-entry message. https://raw.githubusercontent.com/rust-lang/rust-clippy/master/clippy_lints/src/disallowed_macros.rs
- The `restriction` group is opt-in, off by default: same idea as our profiles (gates only by default).

## biome (https://biomejs.dev/linter/javascript/rules/, https://biomejs.dev/analyzer/suppressions/)

| Our id | Biome rule | Shape |
|---|---|---|
| T1 | noFocusedTests | `.only`, `fdescribe`, `fit` in tests |
| T2 | noSkippedTests | `.skip`, `xit`, `xdescribe` |
| S1 | noTsIgnore | `@ts-ignore` only. It does not cover `@ts-expect-error`; that is our extra |
| S3 | noExplicitAny | explicit `any` in a type position |
| S12 | noEmptyBlockStatements | empty `{}` block (covers catch) |
| D1 | noDebugger | `debugger` statement |
| D2 | noConsole | `console.*` call |
| X3 | noGlobalEval | `eval(` |
| X4 | noDangerouslySetInnerHtml, noDangerouslySetInnerHtmlWithChildren | the JSX prop |

New candidates:

| Proposed id | Biome rule | Condition | Sev |
|---|---|---|---|
| js-implied-eval | noImpliedEval | `setTimeout("...")` / `setInterval("...")` with a string first argument | G |
| js-misplaced-assertion | noMisplacedAssertion | `expect(` outside a `test/it` callback | W |
| js-exports-in-test | noExportsInTest | `export` in a test file | W |
| js-non-null-assert | noNonNullAssertion | postfix `!` assertion | W (regex precision poor; prefer skipping) |

Design ideas:
- Suppression syntax `biome-ignore <category>/<group>/<rule>: <note>`, where the example form always carries a note, but the docs do not say it is mandatory. Range form `biome-ignore-start` / `biome-ignore-end` (every start needs an end), file form `biome-ignore-all` valid only at the top. https://biomejs.dev/analyzer/suppressions/
- Unused suppression reporting under category `suppression/unused`, including a misplaced `-all` comment. Good model for our "ignore that matched nothing" warning.

## squawk (rules: https://squawkhq.com/docs/rules, per-rule pages, CLI: https://squawkhq.com/docs/cli)

**Verified rule names** (the file list under docs/docs in the repo and the per-rule pages agree):

- Dropping columns: `ban-drop-column` (flags dropping a column or composite attribute; it may break existing clients). Confirmed.
- Adding a NOT NULL column to an existing table: **`adding-required-field`**, not `adding-not-nullable-field`. Its page flags `ALTER TABLE ... ADD COLUMN ... boolean NOT NULL` with no default (fails on populated tables, breaks old writers). Safe forms: add nullable and backfill, or add with a non-volatile default.
- `adding-not-nullable-field` exists but is a different case: `ALTER COLUMN ... SET NOT NULL` on an existing column (page says new-column case moved to `adding-required-field`).
- The catalog note that `squawk --list-rules` exists is **wrong as far as the CLI reference shows**: the page documents no such flag. Rules are listed on the docs site and as files in the repo.

| Our id / backlog | Squawk rule | Shape |
|---|---|---|
| M1 | ban-drop-table, ban-drop-column, ban-drop-database, ban-truncate-cascade | the statements in question. Plain `TRUNCATE` and `DELETE` without `WHERE` are **not** in the file list, so those two M1 patterns are our own |
| M1 (RLS) | ban-alter-row-level-security, ban-drop-policy | names are in the file list; what they match was not read: **UNVERIFIED** that `DISABLE ROW LEVEL SECURITY` is exactly covered |
| backlog migration-not-null-no-default | adding-required-field | see above |
| backlog migration-index-nonconcurrent | require-concurrent-index-creation, require-concurrent-index-deletion | `CREATE INDEX` / `DROP INDEX` without `CONCURRENTLY` |

New candidates (all on added lines of migration `.sql` files):

| Proposed id | Squawk rule | Condition | Sev |
|---|---|---|---|
| migration-add-required-column | adding-required-field | `ADD COLUMN ... NOT NULL` with no `DEFAULT` | G |
| migration-set-not-null | adding-not-nullable-field | `ALTER COLUMN ... SET NOT NULL` | W |
| migration-index-nonconcurrent | require-concurrent-index-creation / -deletion | `CREATE [UNIQUE] INDEX` without `CONCURRENTLY` (backlog item, now sourced) | W |
| migration-index-in-transaction | ban-concurrent-index-creation-in-transaction | `CONCURRENTLY` in a file that also has `BEGIN`/is wrapped in a transaction | G |
| migration-constraint-not-valid | constraint-missing-not-valid | `ADD CONSTRAINT ... FOREIGN KEY/CHECK` without `NOT VALID` | W |
| migration-rename | renaming-column, renaming-table | `RENAME COLUMN` / `RENAME TO` | W |
| migration-change-type | changing-column-type | `ALTER COLUMN ... TYPE` | W |
| migration-drop-not-null | ban-drop-not-null | `DROP NOT NULL` | W |
| migration-no-timeouts | require-lock-timeout, require-statement-timeout | migration file never sets `lock_timeout` / `statement_timeout` | W |
| migration-serial-pk | adding-serial-primary-key-field, prefer-identity | `ADD COLUMN ... SERIAL PRIMARY KEY` | W |

(Postgres-only; our SQL dialect for migrations should be confirmed before turning these into gates.)

Design ideas:
- Suppression comments: `-- squawk-ignore <rule>[, rule]` for the next statement, `-- squawk-ignore-file <rule>` for the file (no names means all). No reason syntax documented, no unused-ignore reporting documented. https://squawkhq.com/docs/cli
- `.squawk.toml`: `excluded_rules`, `included_rules` (excluded wins), `pg_version`, `assume_in_transaction`, `excluded_paths`. Config is found by walking upward. A `pg_version` knob is a good model: the same statement is safe or unsafe by version (non-volatile default is fine on Postgres 11+).
- Every rule's page names the unsafe pattern and the safe alternative (nullable + backfill + validate). Our rule messages should carry the fix, not only the complaint.

## actionlint (https://raw.githubusercontent.com/rhysd/actionlint/main/docs/checks.md; page truncated at 100000 chars, the tail was read in a second call)

| Our id | Check | Shape |
|---|---|---|
| C5 | Script injection by potentially untrusted inputs | untrusted event fields (PR title, comment body, etc.) used in `run:` or github-script, including via `.*` object filters; fix is to pass through env |
| C7 | Constant conditions at `if:` | `if: false`, or `${{ }}` with extra text around it so it is a constant |

New candidates:

| Proposed id | Check | Condition | Sev |
|---|---|---|---|
| gha-deprecated-commands | Deprecated workflow commands | `::set-output`, `::save-state`, `::add-path`, `::set-env` in `run:` | G |
| gha-hardcoded-credentials | Hardcoded credentials | literal password in `container:`/`services:` `credentials:` | G (same as zizmor candidate) |
| gha-cron-too-frequent | CRON syntax check | `schedule` cron firing more often than a floor (every minute) | W |
| gha-id-naming | ID naming convention | job/step ids not starting with letter or `_`, or with chars other than alnum, `-`, `_` | W (low value) |
| gha-matrix-dup | Matrix values | duplicate matrix values / `exclude` that matches nothing | W (needs YAML parse) |

Several actionlint checks (types, contexts, `needs`, reusable workflows, runner labels) need a real workflow parser. Out of scope for a diff-line engine; run actionlint itself in CI instead of porting (it is MIT, so using the binary is allowed). I did not read actionlint's own ignore mechanism: **UNVERIFIED**.

## New rule candidates (consolidated, ranked)

Top by value for this repo (TypeScript, GitHub Actions, npm publishing, Windows lane, SQL migrations):

| # | id | Condition | Sev | Source |
|---|---|---|---|---|
| 1 | migration-add-required-column | `ADD COLUMN ... NOT NULL` with no `DEFAULT` | G | squawk `adding-required-field` |
| 2 | gha-secrets-tojson | `toJSON(secrets)` / `fromJSON` of a secret | G | zizmor overprovisioned-secrets, unredacted-secrets |
| 3 | gha-deprecated-commands | `::set-output`, `::save-state`, `::add-path`, `::set-env` | G | actionlint |
| 4 | gha-unpinned-images | container/service image with no tag or `:latest` | G | zizmor unpinned-images |
| 5 | gha-hardcoded-credentials | literal registry password in `credentials:` | G | zizmor, actionlint |
| 6 | path-illegal-windows-name | added path invalid on Windows | G | pre-commit check-illegal-windows-names |
| 7 | migration-constraint-not-valid | FK/CHECK added without `NOT VALID` | W | squawk |
| 8 | gha-trusted-publishing | token-based publish instead of OIDC | W | zizmor use-trusted-publishing |
| 9 | gha-unsound-condition | `if:` as block scalar around `${{ }}` (always true) | G | zizmor, actionlint |
| 10 | config-parse-error | changed `.json`/`.toml`/`.yml` does not parse | G | pre-commit check-json/toml/yaml |

Next tier: gha-workflow-run (W), migration-index-nonconcurrent (W), migration-index-in-transaction (G), js-implied-eval (G), todo-without-link (W), rs-allow-no-reason (tighten S8), gha-bot-conditions (W), symlink-broken (G), exec-without-shebang (W), py-request-no-timeout (W), vcs-permalink (W).

## Design ideas worth stealing (consolidated)

1. **Suppression with a reason, enforced.** Only clippy's `allow_attributes_without_reason` and biome's example form push for a note; zizmor, ruff and squawk do not require one. Our "reason required" is stricter than all of them, which is a feature. Reject `guardrail-ignore: <id>` with an empty reason as its own gate.
2. **Unused-suppression reporting.** ruff RUF100, biome `suppression/unused`, Rust `#[expect]`. Cheap for us: track which ignore lines matched a finding; unmatched ones raise a warn. (Diff-only: only newly added ignores are checked.)
3. **Personas / tiers.** zizmor regular/pedantic/auditor, clippy restriction group, squawk `included_rules`. Map to our gate / warn / informational.
4. **Suppression-count visibility.** zizmor's `disable` hides rules from suppressed counts and is called a last resort. Always print suppressed counts per rule. Offer a `--no-ignores` audit run (zizmor).
5. **Baselines.** gitleaks `--baseline-path` and fingerprints, ruff `--add-noqa`. We already skip old code by diffing; for the path ledger, store owner + reason + expiry (no tool above does expiry: our own idea).
6. **Cheap pre-filter then precise match.** gitleaks keywords before regex, entropy floor and stopword allowlists (`EXAMPLE`) to cut fixture noise.
7. **Per-entry message in banned-item lists.** clippy `disallowed-*` entries carry a `reason`; squawk pages pair each ban with the safe alternative. Put a `fix` field in every rule TOML.
8. **Version-aware rules.** squawk `pg_version`: same SQL is fine or not by Postgres version. Add a `target` setting for migration rules.
9. **Config discovery and layering.** squawk walks upward for `.squawk.toml`; gitleaks `[extend]` with `disabledRules` and id-matched overrides, depth two. Our rule is stricter by design (config from the base branch only, so a PR cannot relax it).
10. **Inline escapes can be globally disabled.** gitleaks `--ignore-gitleaks-allow`. Useful for a "strict" run on protected paths such as `.github/workflows/**`.
11. **Range suppressions must name rules and must close.** ruff and biome both reject blanket ranges and flag unclosed ones. If we ever add ranges, copy that.
12. **Exact-match "full scan" mode.** pre-commit `--enforce-all`; useful for the weekly noise measurement in the rollout plan.

## Catalog corrections to make

- Replace the "Unverified" note: squawk names are now verified. `ban-drop-column` is real. Adding a NOT NULL column is `adding-required-field`; `adding-not-nullable-field` is the `SET NOT NULL` rule. `squawk --list-rules` is not in the CLI docs; use https://squawkhq.com/docs/rules.
- S1 source label: Biome's `noTsIgnore` covers only `@ts-ignore`; the `@ts-nocheck` and reasonless `@ts-expect-error` parts are our own.
- M1 source label: `TRUNCATE` (without CASCADE) and `DELETE` without `WHERE` are not squawk rules.
- Catalog line 19 says "MIT/Apache sources": true for all eight tools above (zizmor, pre-commit-hooks, gitleaks, ruff, biome, actionlint MIT; clippy and squawk MIT OR Apache-2.0). trufflehog and MegaLinter are AGPL-3.0; Semgrep registry is under Semgrep Rules License v1.0.
