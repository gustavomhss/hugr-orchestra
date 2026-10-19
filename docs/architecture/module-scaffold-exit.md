# Module scaffold (70–90): exit criteria

This replaces §7 "Milestone exit" of the 70–90 phase plan, which lives outside this branch. The numbers come from the P5
rehearsal: every tool-driven card (EXP×8, FAC×8, RB-BLOCKS) and the 19 RN/RD READMEs applied in merge order on top of
the P4 head, then `bun run check:boundaries --prune`.

The milestone closes when all of these hold:

- `bun run check:boundaries` (strict) exits 0 with `0 new, 0 stale`.
- No code wildcard is left in a registered manifest: R6a has 0 rows. `packages/plugin/package.json` is untouched.
- All 29 package READMEs carry the generated contract block and all 11 domain READMEs exist: R8 has 0 rows.
- R3 has exactly 14 rows:
  - `packages/app-shell/src/app.tsx` → `@/pages/layout` (the legacy layout; removal is tier 3);
  - 12 rows in 6 core V2 files (`session.ts`, `session/projector.ts`, `session/sql.ts`, `config.ts`,
    `config/plugin/agent.ts` and the Zen provider plugin) that import `packages/core/src/v1`; they close only when
    the V2 core stops reading v1 modules, which is 70-C' or later work, not a compat-facade card;
  - `apps/desktop/src/main/env.d.ts` → `apps/orchestra` built types (legacy package reached by relative path).
- R1 has exactly 2 rows: the core compat facade `packages/core/src/compat/sdk-v2-types.ts` and the same
  `apps/desktop/src/main/env.d.ts` edge (the `app` layer does not list `app`).
- The ledger shrinks from 735 to 487 entries: R1 2, R3 14, R4 8, R5 218, R6b 2, R7 145, R11 98.
- The batch B typecheck dispatch (T3) and the epic CI are green.

Differences from the plan's §7, and why:

- R3 does not reach 1 and R1 does not reach 1, for the core → v1 and `env.d.ts` rows above. The plan's baseline
  estimate missed both.
- R7 is 145, not about 213: §4.2 registers no relay folder modules, so the 42 relay rows the 80–90 input counted
  cannot occur.
- R5 is counted per specifier (218 rows in 133 files), not per file.
