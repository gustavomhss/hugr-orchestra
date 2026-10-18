# Card RN-SESSIONUI

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

The file does not exist yet. Write it with exactly the content given; do not add, drop or reword facts.

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rn-sessionui`
- Branch (already checked out): `ms-rn-sessionui`
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
cd /Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rn-sessionui
export BASE=7181942eaa733b9cc3f4ff6aef79231d0d1c2f93
TEST_RE='(^|/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$'
VENDORED="@open""code-ai/client"   # the two halves are joined on purpose; never write the joined word into a file
LEG() { git grep -lE "[\"'](@orchestra/sdk|$VENDORED)(/[^\"']*)?[\"']" -- "$@" | grep -vE "$TEST_RE" | grep -v '/src/compat/'; }
OWNED() { git diff --name-only "$BASE"..HEAD | sort; }
SCOPED() { bun run check:boundaries --no-stale --json --scope "$@" 2>/dev/null | node -e 'const t=require("fs").readFileSync(0,"utf8");const r=JSON.parse(t.slice(t.indexOf("{")));console.log("new="+r.new.length,"stale="+r.stale.length)'; }
```

## Owned files (exactly these, nothing else)

- `packages/session-ui/README.md`

## Steps

1. Create the file with this exact content (the quoted heredoc writes it byte for byte):

```bash
cat > 'packages/session-ui/README.md' <<'README_EOF'
# @orchestra/session-ui

Solid components that render Sessions: messages, parts, diffs and review.

## Purpose and ownership

- Solid components that render Sessions: messages, parts, diffs and review.
- Owner role: UI maintainer.

## Public entry points and consumers

- Explicit `exports` keys plus the asset wildcard `./v2/*.css`.
- Consumers: `packages/app-shell` and `apps/storybook`.
- The CSS entry `@orchestra/session-ui/styles` is imported by `packages/app-shell/src/index.css`.

## Dependencies and boundaries

- Layer `ui`: may use the ui, schema, client and contract layers, and only the `browserSafe` core helpers.
- The legacy SDK and the vendored upstream client tarball listed in `script/rename-ledger.ts` are reached only through `packages/session-ui/src/compat`.

## Assets, schemas and generated files

- CSS and v2 styles live under `packages/session-ui/src`.

## Persistence, identity and lifetime

- UI state only.

## Commands

- `bun typecheck`
- `bun run test:ci session-ui <files>`

## Contracts and verification limits

- Keep `packages/session-ui/AGENTS.md`.
README_EOF
```
2. `bun run script/module-readme.ts session-ui --write` -> last line `module-readme: 1 READMEs checked, 1 written`. This appends the generated contract block.

## Commit and push

```bash
git add 'packages/session-ui/README.md'
git commit -m "docs(session-ui): add @orchestra/session-ui README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push fork ms-rn-sessionui
```

Open no pull request.

## Acceptance (run after the commit; each must print the expected value)

A1. `bun run script/module-readme.ts session-ui --check` -> exit 0, last line `module-readme: 1 READMEs checked, 0 differ`.
A2. `grep -c "^## " 'packages/session-ui/README.md'` -> prints `8`.
A3. `grep -ci "open""code" 'packages/session-ui/README.md'` -> prints `0`.
A4. `SCOPED packages/session-ui/README.md` -> prints `new=0 stale=1` (this also proves every backticked repository path in the file exists).
A5. `OWNED` prints exactly the owned files listed above, one per line, sorted.

If an acceptance line fails, do not push a fix: report STOP with the exact output.

## Return (at most 10 lines, nothing else)

```
CARD RN-SESSIONUI | branch ms-rn-sessionui | sha <commit sha>
diff: <files> files, +<added> -<deleted>
A1..A5: ok   (or: A<n> <command> -> <exact output>)
STATUS done | STOP: <exact output>
```
