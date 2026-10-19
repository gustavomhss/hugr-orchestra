# <ID> · <title>

Model: `opencode-go/beam-free` | `opencode-go/deepseek-v4.1-flash`
Lane: <lane> · Depends on: <IDs or none>
Worktree: the lane worktree given by the runner. Work only there.

## Goal
One sentence: what exists after this task that did not before.

## Read first
Exact files (and line ranges) the worker reads before writing. Nothing else is needed.
- `path/to/file.ts:10-40`: why it matters (the pattern to copy, the type to use).

## Change
Numbered steps. Every step names the file, the anchor (an exact line of current code to find), and the exact edit.
Exact names, signatures, types, copy strings and import paths. Code blocks with the code to write, or, when it is a port, the
source to port line by line and the target. No step says "decide", "choose", "as appropriate" or "if needed".

1. Create `path/new.ts` with:
   ```ts
   // exact content, or exact skeleton plus the porting rule
   ```
2. In `path/existing.ts`, after the line `export const FOO = ...`, add:
   ```ts
   ...
   ```

## Touch only
The full list of files this task may create or modify. Anything else is out of bounds.

## Done when
- Checks the worker can see without running tests: greps, file exists, export present.
- Acceptance the lead runs afterwards: `bun run test:ci <package> <files>` or `gh workflow run typecheck.yml --ref <branch>`.

## Do not
- Run tests, typecheck, builds or installs on this machine.
- Edit generated files (`src/generated*`, `boundary/src/generated/*`) unless this task says to regenerate.
- Commit, push or switch branches. The lead commits.
- Make a choice the brief does not make. If something does not match the brief (an anchor line is missing, a type differs), stop and
  report exactly what differs.
