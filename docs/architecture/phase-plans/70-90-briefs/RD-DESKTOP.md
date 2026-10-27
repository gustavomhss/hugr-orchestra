# Card RD-DESKTOP

You execute one mechanical card. Do exactly the steps below, in order. Do not research, improve, reformat or fix anything else.

The file does not exist yet. Write it with exactly the content given; do not add, drop or reword facts.

- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rd-desktop`
- Branch (already checked out): `ms-rd-desktop`
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
cd /Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-rd-desktop
export BASE=7181942eaa733b9cc3f4ff6aef79231d0d1c2f93
TEST_RE='(^|/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$'
VENDORED="@open""code-ai/client"   # the two halves are joined on purpose; never write the joined word into a file
LEG() { git grep -lE "[\"'](@orchestra/sdk|$VENDORED)(/[^\"']*)?[\"']" -- "$@" | grep -vE "$TEST_RE" | grep -v '/src/compat/'; }
OWNED() { git diff --name-only "$BASE"..HEAD | sort; }
SCOPED() { bun run check:boundaries --no-stale --json --scope "$@" 2>/dev/null | node -e 'const t=require("fs").readFileSync(0,"utf8");const r=JSON.parse(t.slice(t.indexOf("{")));console.log("new="+r.new.length,"stale="+r.stale.length)'; }
```

## Owned files (exactly these, nothing else)

- `apps/desktop/src/main/README.md`

## Steps

1. Create the file with this exact content (the quoted heredoc writes it byte for byte):

```bash
cat > 'apps/desktop/src/main/README.md' <<'README_EOF'
# Desktop main process domain map

## Purpose and ownership

- **MCP Dock** (logical module, target modules/app-dock (a future path)): `app-dock*`, `ipc-app-dock*` and `linux-workspace*` here, plus `removed-v1/src/plugin/app-dock*.ts`, `removed-v1/src/plugin/linux-workspace*.ts` and `packages/app-shell/src/app-dock-linux.ts`.
- WSL (`wsl/`), Omni (`omni-*`), windows and menu, updater, stores and the draft store, the background CLI, and the janitor binding.

## Public entry points and consumers

- Entry `apps/desktop/src/main/index.ts`; preload `apps/desktop/src/preload`; renderer `apps/desktop/src/renderer`.

## Dependencies and boundaries

- The main process may import core (a Node app); the renderer uses `@orchestra/app`.

## Assets, schemas and generated files

- Linux runtime resources live in `apps/desktop/resources`.

## Persistence, identity and lifetime

- `drafts.sqlite`, the profile and window stores, and app IDs are user data.

## Commands

- `bun run test:ci desktop <files>`
- Proofs in `apps/desktop/scripts` (`*-proof.ts`) run outside Bun test discovery.

## Contracts and verification limits

- `apps/desktop/src/main/app-dock-rpc.ts` and `apps/desktop/src/main/linux-workspace-rpc.ts` have different authorities: never unify them.
- `apps/desktop/src/main/app-dock-runtime.ts`, `apps/desktop/src/main/app-dock-runtime-docker.ts`, `apps/desktop/src/main/linux-workspace-access.ts`, `apps/desktop/src/main/linux-workspace-omni.ts`, `apps/desktop/src/main/background-cli.ts` and `apps/desktop/src/main/shell-env.ts` are listed in `script/spawn-allowlist.json`.
- `.github/workflows/native.yml` names MCP Dock paths, so do not move them.
README_EOF
```

## Commit and push

```bash
git add 'apps/desktop/src/main/README.md'
git commit -m "docs(desktop): add desktop-main domain README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push fork ms-rd-desktop
```

Open no pull request.

## Acceptance (run after the commit; each must print the expected value)

A1. `grep -c "^## " 'apps/desktop/src/main/README.md'` -> prints `7`.
A2. `grep -ci "open""code" 'apps/desktop/src/main/README.md'` -> prints `0`.
A3. `SCOPED apps/desktop/src/main/README.md` -> prints `new=0 stale=1` (this also proves every backticked repository path in the file exists).
A4. `OWNED` prints exactly the owned files listed above, one per line, sorted.

If an acceptance line fails, do not push a fix: report STOP with the exact output.

## Return (at most 10 lines, nothing else)

```
CARD RD-DESKTOP | branch ms-rd-desktop | sha <commit sha>
diff: <files> files, +<added> -<deleted>
A1..A4: ok   (or: A<n> <command> -> <exact output>)
STATUS done | STOP: <exact output>
```
