# Card RB-BLOCKS

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rb-blocks`
- Branch (already checked out): `ms-rb-blocks`
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
cd /Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rb-blocks
export BASE=7181942eaa733b9cc3f4ff6aef79231d0d1c2f93
TEST_RE='(^|/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$'
VENDORED="@open""code-ai/client"   # the two halves are joined on purpose; never write the joined word into a file
LEG() { git grep -lE "[\"'](@orchestra/sdk|$VENDORED)(/[^\"']*)?[\"']" -- "$@" | grep -vE "$TEST_RE" | grep -v '/src/compat/'; }
OWNED() { git diff --name-only "$BASE"..HEAD | sort; }
SCOPED() { bun run check:boundaries --no-stale --json --scope "$@" 2>/dev/null | node -e 'const t=require("fs").readFileSync(0,"utf8");const r=JSON.parse(t.slice(t.indexOf("{")));console.log("new="+r.new.length,"stale="+r.stale.length)'; }
```

## Owned files (exactly these, nothing else)

- `apps/cli/README.md`
- `apps/desktop/README.md`
- `removed-v1/README.md`
- `apps/web/README.md`
- `modules/capability-assets/README.md`
- `modules/maestro/arsenal/README.md`
- `modules/relay/README.md`
- `native/omni/bindings/node/README.md`
- `packages/app-shell/README.md`
- `packages/client/README.md`
- `packages/codemode/README.md`
- `packages/core/README.md`
- `packages/effect-drizzle-sqlite/README.md`
- `packages/llm/README.md`
- `packages/plugin/README.md`
- `packages/protocol/README.md`
- `packages/schema/README.md`
- `packages/sdk-next/README.md`
- `packages/server/README.md`
- `tooling/http-recorder/README.md`
- `tooling/httpapi-codegen/README.md`

## Steps

1. `bun run script/module-readme.ts app capability-assets cli client codemode core desktop effect-drizzle-sqlite http-recorder httpapi-codegen llm maestro-arsenal omni/bindings/node orchestra plugin protocol relay schema sdk-next server web --write` -> the last line is `module-readme: 21 READMEs checked, 21 written`.

## Commit and push

```bash
git add -A
git commit -m "docs: add generated module contract blocks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push fork ms-rb-blocks
```

Open no pull request.

## Acceptance (run after the commit; each must print the expected value)

A1. `bun run script/module-readme.ts app capability-assets cli client codemode core desktop effect-drizzle-sqlite http-recorder httpapi-codegen llm maestro-arsenal omni/bindings/node orchestra plugin protocol relay schema sdk-next server web --check` -> exit 0, last line `module-readme: 21 READMEs checked, 0 differ`.
A2. `git diff "$BASE"..HEAD --numstat | awk '$2!=0'` -> prints nothing (only additions).
A3. `git diff --numstat "$BASE"..HEAD | awk '{a+=$1;d+=$2} END {print a,d,NR}'` -> prints `304 0 21`.
A4. `git diff "$BASE"..HEAD | grep '^+' | grep -ci "open""code"` -> prints `0`.
A5. `SCOPED apps/cli/README.md apps/desktop/README.md removed-v1/README.md apps/web/README.md modules/capability-assets/README.md modules/maestro/arsenal/README.md modules/relay/README.md native/omni/bindings/node/README.md packages/app-shell/README.md packages/client/README.md packages/codemode/README.md packages/core/README.md packages/effect-drizzle-sqlite/README.md packages/llm/README.md packages/plugin/README.md packages/protocol/README.md packages/schema/README.md packages/sdk-next/README.md packages/server/README.md tooling/http-recorder/README.md tooling/httpapi-codegen/README.md` -> prints `new=0 stale=21`.
A6. `OWNED` prints exactly the owned files listed above, one per line, sorted.

If an acceptance line fails, do not push a fix: report STOP with the exact output.

## Return (at most 10 lines, nothing else)

```
CARD RB-BLOCKS | branch ms-rb-blocks | sha <commit sha>
diff: <files> files, +<added> -<deleted>
A1..A6: ok   (or: A<n> <command> -> <exact output>)
STATUS done | STOP: <exact output>
```
