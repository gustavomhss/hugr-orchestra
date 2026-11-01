---
name: guardrail-customization
description: Use when changing how Guardrail judges this repo without writing a new rule - a rule's severity, `paths`/`exclude`, `generated`, `[sets]` in `script/guards/config.toml`, `new_only`, `requires_changed` - or when asked to turn a guard off or make it configurable locally. Lists what is changeable, the PR procedure, and what is deliberately not configurable
---

# Customizing Guardrail

Everything is a file under `script/guards/`, changed through a pull request. Nothing is configurable per user, per machine or at runtime: a setting that one person can flip locally is a guard that does not guard. Ownership: `guardrail-ownership`. Adding rules and the test loop: `guardrail-maintenance`. Running: `guardrail-usage`.

Rules and `config.toml` are read from the merge-base, so a customization applies to pull requests opened after it merges, never to the pull request that makes it.

## What you can change

| Want | Change | Where |
|---|---|---|
| Stricter or softer rule | `severity = "gate"` or `"warn"` | the rule's `.toml` |
| Rule reads more or fewer files | `paths`, `exclude` globs (Bun.Glob syntax) | the rule's `.toml` |
| Rule applies even to generated code | `generated = "include"` | the rule's `.toml` |
| Skip a path for all line rules | add a glob to `exclude` | `config.toml` |
| Skip generated or vendored code | add a glob to `generated` | `config.toml` |
| Reuse one glob list across rules | add `[sets] name = [...]`, use `$name` in `paths`, `exclude`, `requires_changed` | `config.toml` |
| Fewer false positives on a line rule | tighten `match`, add the look-alike to `negative`, `flags = "i"`, `skip_comments = ["//", "#"]` | the rule's `.toml` |
| Only newly named things (version bumps ignored) | `new_only = true` with a capture group in `match` | the rule's `.toml` |
| Path rule limited to some git changes | `statuses`, `modes`, `min_bytes`, `binary`, `no_shebang` | the rule's `.toml` |
| Path rule that stands down when a companion file moves | `requires_changed`, `touches` | the rule's `.toml` |
| Test removal counted | `line-balance` with `min_net_removed` | the rule's `.toml` |
| Renames out of scope count | `leaves_scope = true` (path rules) | the rule's `.toml` |
| Turn a rule off | delete its file, with the reason in the PR | `rules/` |
| Who approves | repository write access decides who can apply `guardrail-approved:<rule id>` | GitHub, not this repo |

Option semantics and which rule kind accepts which option: `script/guards/README.md` and the comments in `rule.template.toml`. The parser rejects an option on the wrong rule kind.

## Procedure for any customization

1. Make the change in the rule file or `config.toml`.
2. If it narrows a rule (`exclude`, `generated`, a looser `match`), say in the pull request what real case it frees and why that case is legitimate. A narrowing is a weakening and a reviewer should see it as one.
3. Run `bun run script/guards/baseline.ts <id>` to see today's hits, and `bun run script/guards/history.ts -n 300 <id>` for diff-shaped rules.
4. Update the samples so the rule still fires on `positive` and stays quiet on `negative`; a looser rule needs a new negative sample that proves the loosening.
5. Regenerate the catalog: `bun run script/guards/catalog.ts > docs/guardrail/catalog.md`.
6. The change trips `protected-paths`; an approver applies `guardrail-approved` to the pull request.

## Deliberately not configurable

- No local override file, environment switch or flag that disables a rule or lowers a severity. `--warn` exists only to look, and CI never uses it.
- No per-pull-request relaxation: a change cannot edit the rules that judge it.
- No silent ignores: an inline ignore needs a reason and is reported; a path rule needs an approval label.
- Size limits are not rules here; they live in `script/godfile.ts`.

## Extending the engine

A new rule kind or option is an engine change, not a customization: it goes through `guardrail-maintenance` ("Engine option"), with a scenario in `guards.test.ts` and a documented line in `README.md`. Prefer a `warn` rule over a new option when a regex almost does the job.
