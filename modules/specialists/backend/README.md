# Backend specialist assets

Authored skill trees for the native `backend` seat (backend execution): seven roots, `backend-implement`, `backend-api`,
`backend-data`, `backend-concurrency`, `backend-refactor`, `backend-check` and `backend-codegen`, each a tree of
`SKILL.md` nodes. The language and framework tree is the shared `team-stack` in `modules/specialists/team`. This is an
asset module, not a published package, and holds no code.

## Who uses it

- `Seats.skillSource("backend")` (`modules/maestro/coordination/src/seats/seat.ts`) resolves `skills/` here. The seat
  definition in `modules/maestro/coordination/src/seats/backend.ts` lists the roots in `seat.skills`.
- Source runs read the tree in place. Compiled builds embed it through `seatSkillsModule`
  (`modules/maestro/coordination/src/seat-skills-module.ts`), and `modules/maestro/coordination/src/seat-skill-root.ts` extracts it at run time.
  Relative file names and exact UTF-8 bytes define the payload and its cache digest, so do not normalize or trim files.
- `packages/core/script/toolkit-pack.ts` reads and writes the recipe nodes under `backend-codegen`. Core owns toolkit
  acquisition, process execution and recipe generation; this module only holds the files. Moving assets changes none
  of that, nor the seat's readiness, permissions or skill precedence.
- For what the seat does, see [the agents guide](../../../docs/guides/agents.md).

## Rules

- Keep documentation next to `skills/`, never inside it: every file under `skills/` ships.
- Tree rules are in [docs/specs/seat-framework/skill-tree.md](../../../docs/specs/seat-framework/skill-tree.md). The
  source contract is [docs/specs/backend-specialist](../../../docs/specs/backend-specialist).

## Commands

From the repository root:

```sh
bun run test:ci core test/skill/backend-families.test.ts test/backend-toolkit-packs.test.ts
bun run test:ci maestro test/seat-framework.test.ts test/seat-skills-build.test.ts
```
