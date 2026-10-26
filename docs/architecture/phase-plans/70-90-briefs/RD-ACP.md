# Card RD-ACP

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

The file does not exist yet. Write it with exactly the content given; do not add, drop or reword facts.

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rd-acp`
- Branch (already checked out): `ms-rd-acp`
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
- Remote: `fork`

## Hard rules

1. Work only inside the worktree. Never write, create or delete anything outside it.
2. Never run `bun install`, `bun typecheck`, `bun test`, `bun run test:ci`, `turbo`, `tsgo`, `tsc`, `bunx`, or any build.
3. Allowed commands: `git status|diff|grep|add|commit|push`, `node -e` one-liners, `python3 -` when a step gives the script, the `bun run script/<tool>.ts` commands below, and `bun run check:boundaries --no-stale --json --scope ...` (through the `SCOPED` helper).
4. Edit only the owned files listed below. Never edit `script/boundary-ledger.json`, `script/module-architecture.json`, any other `package.json`, `.github/**`, `turbo.json`, `nix/**`, `bun.lock`, or generated directories.
5. Never write the old upstream product name in any letter case, and never write a seat display name. Write in English.
6. Stop line: if any output differs from the expected value, stop. Do not fix or improvise. Report the exact output.

## Setup (paste once, in one shell, before the steps)

```bash
cd /Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rd-acp
export BASE=7181942eaa733b9cc3f4ff6aef79231d0d1c2f93
TEST_RE='(^|/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$'
VENDORED="@open""code-ai/client"   # the two halves are joined on purpose; never write the joined word into a file
LEG() { git grep -lE "[\"'](@orchestra/sdk|$VENDORED)(/[^\"']*)?[\"']" -- "$@" | grep -vE "$TEST_RE" | grep -v '/src/compat/'; }
OWNED() { git diff --name-only "$BASE"..HEAD | sort; }
SCOPED() { bun run check:boundaries --no-stale --json --scope "$@" 2>/dev/null | node -e 'const t=require("fs").readFileSync(0,"utf8");const r=JSON.parse(t.slice(t.indexOf("{")));console.log("new="+r.new.length,"stale="+r.stale.length)'; }
```

## Owned files (exactly these, nothing else)

- `removed-v1/src/acp/README.md`

## Steps

1. Create the file with this exact content (the quoted heredoc writes it byte for byte):

```bash
cat > 'removed-v1/src/acp/README.md' <<'README_EOF'
# Agent Client Protocol domain

## Purpose and ownership

- Agent Client Protocol adapter: `service.ts`, `session.ts`, `agent.ts`, `tool.ts`, `permission.ts`, `event.ts`, `usage.ts`, `profile.ts`, `content.ts`, `config-option.ts`, `directory.ts`, `error.ts`.
- Entered from `removed-v1/src/cli`.
- Target: modules/acp (a future path).

## Public entry points and consumers

- Consumer: the CLI (composition).

## Dependencies and boundaries

- May import the platform and contracts.
- Adds no Session orchestration of its own.

## Assets, schemas and generated files

- None.

## Persistence, identity and lifetime

- Session state lives in core.

## Commands

- `bun run test:ci orchestra test/acp/<file>`

## Contracts and verification limits

- None.
README_EOF
```

## Commit and push

```bash
git add 'removed-v1/src/acp/README.md'
git commit -m "docs(orchestra): add acp domain README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push fork ms-rd-acp
```

Open no pull request.

## Acceptance (run after the commit; each must print the expected value)

A1. `grep -c "^## " 'removed-v1/src/acp/README.md'` -> prints `7`.
A2. `grep -ci "open""code" 'removed-v1/src/acp/README.md'` -> prints `0`.
A3. `SCOPED removed-v1/src/acp/README.md` -> prints `new=0 stale=1` (this also proves every backticked repository path in the file exists).
A4. `OWNED` prints exactly the owned files listed above, one per line, sorted.

If an acceptance line fails, do not push a fix: report STOP with the exact output.

## Return (at most 10 lines, nothing else)

```
CARD RD-ACP | branch ms-rd-acp | sha <commit sha>
diff: <files> files, +<added> -<deleted>
A1..A4: ok   (or: A<n> <command> -> <exact output>)
STATUS done | STOP: <exact output>
```
