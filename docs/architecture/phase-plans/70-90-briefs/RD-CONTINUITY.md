# Card RD-CONTINUITY

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

The file does not exist yet. Write it with exactly the content given; do not add, drop or reword facts.

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rd-continuity`
- Branch (already checked out): `ms-rd-continuity`
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
cd /Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rd-continuity
export BASE=7181942eaa733b9cc3f4ff6aef79231d0d1c2f93
TEST_RE='(^|/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$'
VENDORED="@open""code-ai/client"   # the two halves are joined on purpose; never write the joined word into a file
LEG() { git grep -lE "[\"'](@orchestra/sdk|$VENDORED)(/[^\"']*)?[\"']" -- "$@" | grep -vE "$TEST_RE" | grep -v '/src/compat/'; }
OWNED() { git diff --name-only "$BASE"..HEAD | sort; }
SCOPED() { bun run check:boundaries --no-stale --json --scope "$@" 2>/dev/null | node -e 'const t=require("fs").readFileSync(0,"utf8");const r=JSON.parse(t.slice(t.indexOf("{")));console.log("new="+r.new.length,"stale="+r.stale.length)'; }
```

## Owned files (exactly these, nothing else)

- `removed-v1/src/continuity/README.md`

## Steps

1. Create the file with this exact content (the quoted heredoc writes it byte for byte):

```bash
cat > 'removed-v1/src/continuity/README.md' <<'README_EOF'
# Continuity domain

## Purpose and ownership

- Session continuity: admission, archive and archive search, checkpoints, checklist and review seals, fork, masking, transcripts and triggers.
- Prompts: `removed-v1/src/continuity/prompt.txt` and `removed-v1/src/continuity/review-prompt.txt`.
- Product-owned files outside this folder: `removed-v1/src/tool/context-compact.ts`, `removed-v1/src/tool/context-recall.ts`, `removed-v1/src/tool/context-recall-archive.ts`, `removed-v1/src/session/prompt-continuity.ts`.
- Target: modules/continuity (a future path).

## Public entry points and consumers

- Consumers: claude-code and maestro (allowed product edges).
- Session, tool and server importers are declared exceptions under rule R11.

## Dependencies and boundaries

- May import the platform.
- Never imports maestro, claude-code, acp or janitor.

## Assets, schemas and generated files

- `removed-v1/src/continuity/archive-format.ts` defines the on-disk archive format, a compatibility contract.

## Persistence, identity and lifetime

- Archive files are user data: their paths and format must not change in a reorganization.

## Commands

- `bun run test:ci orchestra test/continuity/<file>`

## Contracts and verification limits

- None beyond the archive format above.
README_EOF
```

## Commit and push

```bash
git add 'removed-v1/src/continuity/README.md'
git commit -m "docs(orchestra): add continuity domain README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push fork ms-rd-continuity
```

Open no pull request.

## Acceptance (run after the commit; each must print the expected value)

A1. `grep -c "^## " 'removed-v1/src/continuity/README.md'` -> prints `7`.
A2. `grep -ci "open""code" 'removed-v1/src/continuity/README.md'` -> prints `0`.
A3. `SCOPED removed-v1/src/continuity/README.md` -> prints `new=0 stale=1` (this also proves every backticked repository path in the file exists).
A4. `OWNED` prints exactly the owned files listed above, one per line, sorted.

If an acceptance line fails, do not push a fix: report STOP with the exact output.

## Return (at most 10 lines, nothing else)

```
CARD RD-CONTINUITY | branch ms-rd-continuity | sha <commit sha>
diff: <files> files, +<added> -<deleted>
A1..A4: ok   (or: A<n> <command> -> <exact output>)
STATUS done | STOP: <exact output>
```
