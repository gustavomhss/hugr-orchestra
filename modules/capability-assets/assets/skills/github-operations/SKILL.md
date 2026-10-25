---
name: github-operations
description: Work GitHub end to end with the gh CLI - auth, issues, PR lifecycle and landing, issue-to-PR delivery, code review, CI/check logs, releases, and repo management. Use when a task touches GitHub issues, pull requests, checks, reviews, releases, or remotes.
---

# GitHub Operations

Use `gh` for GitHub, `git` for local commits/branches/push/pull, and code-reading tools for deep reviews.
Each workflow lives complete in a reference file: ALWAYS read the matching reference before starting that
workflow; the body below routes and holds the cross-cutting discipline.

## Tools

- Run `gh`/`git` through `bash`. Use `process_control` (`start`/`log`/`wait`/`stop`) for long waits such as
  `gh run watch` or `gh pr checks --watch`.
- When a GitHub connection exists in connected platform tools, prefer `service_find` -> `service_describe`
  -> `service_call` for API reads and writes; fall back to `gh` when there is none.
- Poll CI with bounded waits via `process_control wait` or `schedule_manage` for later re-checks; never
  busy-loop in `bash`.
- Install `gh`: `brew install gh` (macOS) or https://cli.github.com. Scripts need `GH_OPS_DIR` set to this
  playbook's directory.

## Routing

| Task | Read first |
|---|---|
| Auth broken / new machine / token or SSH setup / gh login | `references/auth.md` |
| Create, triage, label, assign, close issues | `references/issues.md` |
| Branch, commit, open PR, watch CI, merge | `references/pr-workflow.md` |
| Carry an ISSUE to a verified PR (full delivery loop) | `references/issue-to-pr.md` |
| Review someone's PR: diffs, inline comments, verdict | `references/code-review.md` |
| Clone/create/fork repos, remotes, releases | `references/repo-management.md` |

Supporting assets: `scripts/gh-env.sh` and `scripts/git-credential-token.py` (auth helpers),
`templates/` (PR bodies, bug report, feature request), `references/ci-troubleshooting.md`,
`references/conventional-commits.md`, `references/github-api-cheatsheet.md`,
`references/review-output-template.md`.

## Auth

```bash
gh auth status        # preflight once per session
gh auth login         # the user completes this themselves (browser or their own token)
```

If `gh auth status` fails, go to `references/auth.md` first. Authentication happens through the CLI's own
login, SSH, or `GITHUB_TOKEN` exported by the user in their environment. Never ask for, echo, or write a
token in chat, files, or command lines. If `gh` auth exists under another HOME, point `GH_CONFIG_DIR` at it.

## Core discipline

- Prefer `gh` over raw REST; use `gh api` only for endpoints the porcelain lacks (see the cheatsheet).
- URLs work directly: `gh pr view https://github.com/owner/repo/pull/55`.
- Use `--json` + `--jq` for structured output. Use `--body-file` for comments and bodies containing
  backticks, shell snippets, env names, or user text.
- Read full context before writing: `gh issue view N --comments` / `gh pr view N --comments`; decisions
  live in threads, not titles.
- Sweep for duplicates before creating anything: `gh pr list --search` / `gh issue list --search`.
- Never report CI green without reading `gh pr checks` yourself; never claim merged without verifying
  `state,mergedAt`.

## Quick reference

```bash
# PRs
gh pr list --repo owner/repo --json number,title,state,author,url
gh pr view 55 --repo owner/repo --json title,body,author,files,commits,reviews,reviewDecision
gh pr checks 55 --repo owner/repo
gh pr diff 55 --repo owner/repo
gh pr create --repo owner/repo --title "feat: title" --body-file pr.md

# Issues
gh issue list --repo owner/repo --state open --json number,title,labels,url
gh issue view 42 --repo owner/repo --json title,body,comments,labels,state
gh issue create --repo owner/repo --title "Bug: ..." --body-file issue.md
gh issue comment 42 --repo owner/repo --body-file comment.md
gh issue close 42 --repo owner/repo --comment "Fixed in ..."

# CI runs
gh run list --repo owner/repo --limit 10
gh run view <run-id> --repo owner/repo --json status,conclusion,headSha,url
gh run view <run-id> --repo owner/repo --log-failed
gh run rerun <run-id> --repo owner/repo --failed

# API
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'
gh api --cache 1h repos/owner/repo --jq '{stars: .stargazers_count, forks: .forks_count}'
```

## Landing ownership

When the user asks to land or merge a PR, the terminal outcome is the PR's verified GitHub state, not the
end of a review, a worker turn, or a CI observation.

- Keep the job active until `gh pr view N --json state,mergedAt,mergeCommit` proves `state` is `MERGED`.
- Treat review findings, merge conflicts, failed checks, and requested changes in scope as continuation
  work: patch, rerun the required gates, and re-evaluate the exact updated head.
- A pending check is a wait state, not completion. Use the repository's supported wait or merge workflow
  (`gh pr merge --auto` only when authorized); do not claim success from partial green checks.
- Merge with the reviewed head SHA (`gh pr merge N --match-head-commit <sha>`) so a late push cannot
  slip in. Honor required reviews/checks and merge queues; never bypass branch protection.
- Stop as blocked only when continuing needs new authority, unavailable credentials, or a product
  decision that cannot be inferred safely. Report the exact blocker and leave the PR unmerged.

## Confirm with the user first

Force push, deleting a repo/branch on the remote, closing or merging someone else's PR, changing branch
protection or repo visibility, publishing a release, and any bypass of rules. State the exact command and
effect, then wait for a clear yes. Never force push to a shared or default branch.

## Verification

- The workflow's own reference defines done for that task.
- Every claim about remote state (CI, merge, release, issue state) is backed by a fresh `gh` read, never
  memory.

Adapted from NousResearch/hermes-agent@134e08ca6d272c9b9610ce5889e2ecff9c73adf0 skills/software-development/github (MIT).
Adapted from openclaw/openclaw@2a305612539ccbb63a19b2030a05158dddd42a64 skills/github/SKILL.md (MIT).
