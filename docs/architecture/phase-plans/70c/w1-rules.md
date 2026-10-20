# W1 card rules (shared by every W1 executor)

Plan: docs/architecture/phase-plans/70c/plan.md in this branch (§4.1 rules, §4.3 your card rows, §4.6 ledgers).
Absolute path: /Users/gustavoschneiter/Documents/HuGR/_worktrees/monolith-plan/docs/architecture/phase-plans/70c/plan.md

Setup (replace <branch>):
  git -C /Users/gustavoschneiter/Documents/HuGR/orchestra-canonical fetch fork b1-prep
  git -C /Users/gustavoschneiter/Documents/HuGR/orchestra-canonical worktree add -b <branch> /Users/gustavoschneiter/Documents/HuGR/_worktrees/<branch> fork/b1-prep
  cd there; bun install

Hard rules:
- Never run typecheck, tsc, tsgo, bun test or builds on this Mac. W1 acceptance is static only; tests run later in CI-B1.
- Never write to /tmp. Scratch goes in the worktree (uncommitted) or the session scratchpad.
- Never edit: script/boundary-ledger.json, script/module-architecture.json, script/module-registry.json,
  script/spawn-allowlist.json, any package.json "exports", bun.lock, nix/*. You MAY add "test"/"typecheck" scripts to the
  new module package.json when your card brings source/tests in (W0 deviation 2: app-dock and janitor need both;
  maestro/coordination and engine-adapters/claude-code need "test"; continuity none). Copy the script shape from an
  existing modules/* package (e.g. modules/maestro/arsenal/package.json).
- Use git mv. Do not edit importers outside your move set; do not rewrite `@/` specifiers inside moved files (the lead's
  codemod does it in I1). Exception: the card-local edits your row lists.
- Every `.github/scripts/*` pin goes to P1, not to you.
- Write script/moves/<card>.json: { "moves": [{ "from": "<old path>", "to": "<new path>" }] } (one file per card).
- Static acceptance per card: `bun script/move-relink.ts --check script/moves/<card>.json` exits 0 (report the pins it
  prints) and `bun run check:boundaries --scope <new package path> --no-stale` exits 0 or shows only rows your brief names.
- Seats: refer by id/role, never default display names (the backend default label lives only in roster.ts).
- AGENTS.md style. One commit per card: `refactor(<area>): move <thing> into <module>` ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `git push fork <branch>`. No PR.
- If reality differs from the row (file missing, extra importer you must touch, V1 import in a "neutral" file), STOP that
  card and report; do not improvise.

Report (short): per card commit SHA, move count, pins printed by --check, check:boundaries result, any stop.
