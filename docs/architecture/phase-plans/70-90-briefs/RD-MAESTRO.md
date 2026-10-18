# Card RD-MAESTRO

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

The file does not exist yet. Write it with exactly the content given; do not add, drop or reword facts.

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rd-maestro`
- Branch (already checked out): `ms-rd-maestro`
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
cd /Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rd-maestro
export BASE=7181942eaa733b9cc3f4ff6aef79231d0d1c2f93
TEST_RE='(^|/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$'
VENDORED="@open""code-ai/client"   # the two halves are joined on purpose; never write the joined word into a file
LEG() { git grep -lE "[\"'](@orchestra/sdk|$VENDORED)(/[^\"']*)?[\"']" -- "$@" | grep -vE "$TEST_RE" | grep -v '/src/compat/'; }
OWNED() { git diff --name-only "$BASE"..HEAD | sort; }
SCOPED() { bun run check:boundaries --no-stale --json --scope "$@" 2>/dev/null | node -e 'const t=require("fs").readFileSync(0,"utf8");const r=JSON.parse(t.slice(t.indexOf("{")));console.log("new="+r.new.length,"stale="+r.stale.length)'; }
```

## Owned files (exactly these, nothing else)

- `apps/orchestra/src/maestro/README.md`

## Steps

1. Create the file with this exact content (the quoted heredoc writes it byte for byte):

```bash
cat > 'apps/orchestra/src/maestro/README.md' <<'README_EOF'
# Maestro domain

## Purpose and ownership

- Maestro coordination: seats and roster, governance, admission and approval records, proposal settlement, Arsenal bindings, Atlas memory and Task orchestration.
- Product-owned files outside this folder: `apps/orchestra/src/tool/maestro-*.ts` (10 files) and `apps/orchestra/src/tool/atlas-*.ts` (2 files).
- Target after the 70-C' cut: modules/maestro (a future path).

## Public entry points and consumers

- Consumers: claude-code (an allowed product edge).
- Platform-legacy importers are declared exceptions under rule R11 in `script/boundary-ledger.json`.

## Dependencies and boundaries

- May import the platform, `@orchestra/maestro-arsenal`, `@orchestra/atlas-boundary` and continuity.
- Never imports claude-code, acp or janitor.

## Assets, schemas and generated files

- The prompt `packages/core/src/agent/prompt/maestro.txt` is core-owned and path-pinned.

## Persistence, identity and lifetime

- No tables of its own; records go through core Session and event storage.

## Commands

- `bun run test:ci orchestra test/maestro/<file>`

## Contracts and verification limits

- Seats are referred to by id (AGENTS.md, "Agent Names"); default display names live only in `apps/orchestra/src/maestro/roster.ts`.
README_EOF
```

## Commit and push

```bash
git add 'apps/orchestra/src/maestro/README.md'
git commit -m "docs(orchestra): add maestro domain README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push fork ms-rd-maestro
```

Open no pull request.

## Acceptance (run after the commit; each must print the expected value)

A1. `grep -c "^## " 'apps/orchestra/src/maestro/README.md'` -> prints `7`.
A2. `grep -ci "open""code" 'apps/orchestra/src/maestro/README.md'` -> prints `0`.
A3. `SCOPED apps/orchestra/src/maestro/README.md` -> prints `new=0 stale=1` (this also proves every backticked repository path in the file exists).
A4. `OWNED` prints exactly the owned files listed above, one per line, sorted.

If an acceptance line fails, do not push a fix: report STOP with the exact output.

## Return (at most 10 lines, nothing else)

```
CARD RD-MAESTRO | branch ms-rd-maestro | sha <commit sha>
diff: <files> files, +<added> -<deleted>
A1..A4: ok   (or: A<n> <command> -> <exact output>)
STATUS done | STOP: <exact output>
```
