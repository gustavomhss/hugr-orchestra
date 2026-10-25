---
name: guardrail-usage
description: How to run Guardrail on a change, read its output, fix a finding, and get past one legitimately (ignore comment or approval label)
---

# Using Guardrail

Guardrail checks the lines and paths your change adds against 73 rules (`docs/guardrail/catalog.md`). Run it before you push; CI runs the same engine on every pull request. Ownership: `guardrail-ownership`. Changing rules: `guardrail-customization`.

## Run it

```bash
bun run check:guards --base origin/dev
```

- `--base <ref>` is the target branch; the engine compares against the merge-base. If it says it cannot resolve a merge-base, fetch the branch (`git fetch origin dev`) or pass another `--base`.
- `--warn` reports gate findings without failing, to see everything first. Setup errors still fail.
- `--cwd <repo>` runs against another checkout. `GUARDRAIL_APPROVED=<rule id>,<rule id>` simulates approvals.
- It reads committed and working-tree changes against the merge-base. New untracked files count only once they are tracked or staged (`git add -N <file>`).

## Read the output

```
GATE src/app.ts:12 [ts-ignore] <message>
WARN docs/a.md [binary-added] <message>
guards: 73 rules, 5 changed paths, 1 gate and 1 warn findings, 0 errors.
```

- `GATE` fails the pull request. `WARN` is advice and never blocks.
- `path:line` is a line you added. A bare `path` is a path rule (or a line-balance rule): the file as a whole.
- The text after `[rule]` is the whole explanation: what is wrong and what to do. Follow it.
- `ERROR ...` or `0 rules` means the run proved nothing and fails. That is a setup problem (rules unreadable, base unresolved), not a clean change.
- `BOOTSTRAP` means the base has no rules yet and the rules were read from your change. It only happens when the guards are first introduced.

## Get a clean run

1. **Fix it.** Always the first answer: remove the `console.log`, restore the test, add the lockfile, take the secret out and rotate it.
2. **Line rule, genuine exception:** write on that line `guardrail-ignore: <rule id> <reason>` in the language's comment syntax. The reason is required; without one the ignore does not count. Reviewers see every new ignore through the warn rule `guardrail-ignore-added`.
3. **Path rule** (protected paths, deleted test, binary, large file, lockfile): an ignore comment cannot help. Ask someone with write access to apply the label `guardrail-approved:<rule id>` on the pull request. Plain `guardrail-approved` clears only `protected-paths`. An approval clears exactly one rule.
4. **False positive:** do not ignore it; report it so the rule is tightened (`guardrail-maintenance`). Say which line and which rule.

Do not apply an approval label to your own pull request to get past a gate; it is a reviewer's decision.

## Things that surprise people

- Old code never fails. Only lines you add count, and a line you moved (removed elsewhere in the same change) does not.
- Generated and vendored files are skipped by line rules; `script/guards/**` is excluded from line rules but protected as a path.
- Editing `script/guards/**` trips `protected-paths`, and your changed rules only apply after merge, because rules come from the base.
- Renaming a test out of the test globs counts as deleting it (`test-file-deleted`).
- A clean result means the guards found nothing, not that the change is correct.

## In CI

`.github/workflows/guards.yml` runs on every pull request, from the base branch's copy of the engine. A gate finding fails the job and shows as an annotation on the line; a warn finding is an annotation only. Relabeling the pull request reruns it.
