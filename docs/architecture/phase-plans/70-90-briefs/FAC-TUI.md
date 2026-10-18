# Card FAC-TUI

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

The compat facade files under `src/compat/` already exist at BASE; you do not create or edit them.

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-fac-tui`
- Branch (already checked out): `ms-fac-tui`
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
cd /Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-fac-tui
export BASE=7181942eaa733b9cc3f4ff6aef79231d0d1c2f93
TEST_RE='(^|/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$'
VENDORED="@open""code-ai/client"   # the two halves are joined on purpose; never write the joined word into a file
LEG() { git grep -lE "[\"'](@orchestra/sdk|$VENDORED)(/[^\"']*)?[\"']" -- "$@" | grep -vE "$TEST_RE" | grep -v '/src/compat/'; }
OWNED() { git diff --name-only "$BASE"..HEAD | sort; }
SCOPED() { bun run check:boundaries --no-stale --json --scope "$@" 2>/dev/null | node -e 'const t=require("fs").readFileSync(0,"utf8");const r=JSON.parse(t.slice(t.indexOf("{")));console.log("new="+r.new.length,"stale="+r.stale.length)'; }
```

## Owned files (exactly these, nothing else)

- `packages/tui/src/component/dialog-console-org.tsx`
- `packages/tui/src/component/dialog-move-session.tsx`
- `packages/tui/src/component/dialog-provider.tsx`
- `packages/tui/src/component/dialog-workspace-create.tsx`
- `packages/tui/src/component/dialog-workspace-file-changes.tsx`
- `packages/tui/src/component/dialog-workspace-list.tsx`
- `packages/tui/src/component/prompt/autocomplete.tsx`
- `packages/tui/src/component/prompt/index.tsx`
- `packages/tui/src/context/data.tsx`
- `packages/tui/src/context/event.ts`
- `packages/tui/src/context/location.tsx`
- `packages/tui/src/context/project.tsx`
- `packages/tui/src/context/sdk.tsx`
- `packages/tui/src/context/sync.tsx`
- `packages/tui/src/feature-plugins/sidebar/context.tsx`
- `packages/tui/src/feature-plugins/system/diff-viewer.tsx`
- `packages/tui/src/feature-plugins/system/notifications.ts`
- `packages/tui/src/prompt/history.tsx`
- `packages/tui/src/routes/session/dialog-fork-from-timeline.tsx`
- `packages/tui/src/routes/session/dialog-timeline.tsx`
- `packages/tui/src/routes/session/index.tsx`
- `packages/tui/src/routes/session/permission.tsx`
- `packages/tui/src/routes/session/question.tsx`
- `packages/tui/src/routes/session/subagent-footer.tsx`
- `packages/tui/src/util/model.ts`
- `packages/tui/src/util/transcript.ts`

## Steps

0. Before editing: `LEG packages/tui/src | sort` -> prints exactly the owned files above (26 lines).
1. `bun run script/compat-facade.ts tui packages/tui/src --write` -> prints `compat-facade: 26 files changed`.

## Commit and push

```bash
git add -A
git commit -m "refactor(tui): route legacy SDK imports through the compat facade" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push fork ms-fac-tui
```

Open no pull request.

## Acceptance (run after the commit; each must print the expected value)

A1. `bun run script/compat-facade.ts tui packages/tui/src --check` -> exit 0, prints `compat-facade: 0 files would change`.
A2. `LEG packages/tui/src | wc -l` -> prints `0`.
A3. `git diff --numstat "$BASE"..HEAD | awk '{a+=$1;d+=$2} END {print a,d,NR}'` -> prints `27 27 26`.
A4. `OWNED | grep -cE "$TEST_RE"` -> prints `0`.
A5. `SCOPED packages/tui/src` -> prints `new=0 stale=26`.
A6. `OWNED` prints exactly the owned files listed above, one per line, sorted.

If an acceptance line fails, do not push a fix: report STOP with the exact output.

## Return (at most 10 lines, nothing else)

```
CARD FAC-TUI | branch ms-fac-tui | sha <commit sha>
diff: <files> files, +<added> -<deleted>
A1..A6: ok   (or: A<n> <command> -> <exact output>)
STATUS done | STOP: <exact output>
```
