# Card EXP-CORE

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-exp-core`
- Branch (already checked out): `ms-exp-core`
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
cd /Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-exp-core
export BASE=7181942eaa733b9cc3f4ff6aef79231d0d1c2f93
TEST_RE='(^|/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$'
VENDORED="@open""code-ai/client"   # the two halves are joined on purpose; never write the joined word into a file
LEG() { git grep -lE "[\"'](@orchestra/sdk|$VENDORED)(/[^\"']*)?[\"']" -- "$@" | grep -vE "$TEST_RE" | grep -v '/src/compat/'; }
OWNED() { git diff --name-only "$BASE"..HEAD | sort; }
SCOPED() { bun run check:boundaries --no-stale --json --scope "$@" 2>/dev/null | node -e 'const t=require("fs").readFileSync(0,"utf8");const r=JSON.parse(t.slice(t.indexOf("{")));console.log("new="+r.new.length,"stale="+r.stale.length)'; }
```

## Owned files (exactly these, nothing else)

- `packages/core/package.json`

## Steps

1. `bun run script/explicit-exports.ts core --write` -> prints `explicit-exports: core written with 300 keys (...)`.
2. `git diff --stat` -> shows only `packages/core/package.json` (numstat in the rehearsal: `295 1 1` as added, deleted, files).

## Commit and push

```bash
git add 'packages/core/package.json'
git commit -m "refactor(core): declare explicit package exports" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push fork ms-exp-core
```

Open no pull request.

## Acceptance (run after the commit; each must print the expected value)

A1. `bun run script/explicit-exports.ts core --check` -> exit 0, prints `explicit-exports: core is explicit`.
A2. `bun run script/explicit-exports.ts core --verify-resolution $BASE` -> prints `checked=300 same=300 changed=0 lost=0 ignored=7` and exits 0.
A3. `node -e 'const e=require("./packages/core/package.json").exports;const w=Object.keys(e).filter(k=>k.includes("*"));console.log(w.length,w.join(" "))'` -> prints `0`.
A4. `node -e 'console.log(Object.keys(require("./packages/core/package.json").exports).length)'` -> prints `300`.
A5. `node -e 'const a=JSON.parse(require("child_process").execSync("git show '$BASE':packages/core/package.json"));const b=require("./packages/core/package.json");delete a.exports;delete b.exports;console.log(JSON.stringify(a)===JSON.stringify(b)?"same":"DIFF")'` -> prints `same`.
A6. `SCOPED packages/core/package.json` -> prints `new=0 stale=1`.
A7. `OWNED` prints exactly the owned files listed above, one per line, sorted.

If an acceptance line fails, do not push a fix: report STOP with the exact output.

## Return (at most 10 lines, nothing else)

```
CARD EXP-CORE | branch ms-exp-core | sha <commit sha>
diff: <files> files, +<added> -<deleted>
A1..A7: ok   (or: A<n> <command> -> <exact output>)
STATUS done | STOP: <exact output>
```
