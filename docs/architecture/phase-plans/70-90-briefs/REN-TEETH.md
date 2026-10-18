# Card REN-TEETH

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

This file is the rename guard's own test. The script below builds the old product name from two halves, so you never type it; the edited file may contain it (that file is exempt).

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-ren-teeth`
- Branch (already checked out): `ms-ren-teeth`
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
cd /Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-ren-teeth
export BASE=7181942eaa733b9cc3f4ff6aef79231d0d1c2f93
TEST_RE='(^|/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$'
VENDORED="@open""code-ai/client"   # the two halves are joined on purpose; never write the joined word into a file
LEG() { git grep -lE "[\"'](@orchestra/sdk|$VENDORED)(/[^\"']*)?[\"']" -- "$@" | grep -vE "$TEST_RE" | grep -v '/src/compat/'; }
OWNED() { git diff --name-only "$BASE"..HEAD | sort; }
SCOPED() { bun run check:boundaries --no-stale --json --scope "$@" 2>/dev/null | node -e 'const t=require("fs").readFileSync(0,"utf8");const r=JSON.parse(t.slice(t.indexOf("{")));console.log("new="+r.new.length,"stale="+r.stale.length)'; }
```

## Owned files (exactly these, nothing else)

- `packages/core/test/rename-guard.test.ts`

## Steps

1. Apply the three edits with this exact script (run from the worktree root):

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("packages/core/test/rename-guard.test.ts")
s = p.read_text()
t = "open" + "code"
edits = [
    ('import path from "node:path"\n', 'import path from "node:path"\nimport { readFileSync } from "node:fs"\n'),
    ("        .filter((entry) => !tracked.some((file) => entry.path.test(file)))\n",
     "        .filter((entry) => !tracked.some((file) => entry.path.test(file) && (/" + t + "/i.test(file) || /" + t + "/i.test(readFileSync(path.join(root, file), \"latin1\")))))\n"),
]
for old, new in edits:
    assert s.count(old) == 1, "EDIT_ANCHOR_NOT_UNIQUE: " + old.strip()
    s = s.replace(old, new)
end = s.rstrip().rfind("})")
s = s[:end] + '''
  test("recorded HTTP cassettes stay covered by a kept path", () => {
    expect(keptPaths.find((entry) => entry.path.test("apps/orchestra/test/fixtures/recordings/session/native-zen-tool-loop.json"))).toBeDefined()
  })
''' + s[end:]
p.write_text(s)
print("edited")
PY
```

   It prints `edited`. If it prints `EDIT_ANCHOR_NOT_UNIQUE`, stop.

## Commit and push

```bash
git add 'packages/core/test/rename-guard.test.ts'
git commit -m "test(core): require kept rename paths to cover a real occurrence" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push fork ms-ren-teeth
```

Open no pull request.

## Acceptance (run after the commit; each must print the expected value)

A1. `git diff --numstat "$BASE"..HEAD | awk '{print $1,$2,$3}'` -> prints exactly one line: `6 1 packages/core/test/rename-guard.test.ts`.
A2. `node -e 'const ts=require("typescript");const s=require("fs").readFileSync("packages/core/test/rename-guard.test.ts","utf8");const r=ts.transpileModule(s,{reportDiagnostics:true,compilerOptions:{module:99,target:99}});console.log("diagnostics="+r.diagnostics.length)'` -> prints `diagnostics=0` (syntax only).
A3. `git diff "$BASE"..HEAD | grep -c '^+.*readFileSync'` -> prints `2`.
A4. `OWNED` prints exactly the owned files listed above, one per line, sorted.

If an acceptance line fails, do not push a fix: report STOP with the exact output.

## Return (at most 10 lines, nothing else)

```
CARD REN-TEETH | branch ms-ren-teeth | sha <commit sha>
diff: <files> files, +<added> -<deleted>
A1..A4: ok   (or: A<n> <command> -> <exact output>)
STATUS done | STOP: <exact output>
```
