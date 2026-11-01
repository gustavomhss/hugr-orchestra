# Planning specialist assets

Authored skill trees for the native `archie` seat (product, architecture, specification and planning): `archie-plan`,
`archie-work-package` and `archie-workflow`, each a tree of `SKILL.md` nodes. This is an asset module, not a published
package, and holds no code.

## Who uses it

- `Seats.skillSource("archie")` (`modules/maestro/coordination/src/seats/seat.ts`) resolves `skills/` here. The seat
  definition in `modules/maestro/coordination/src/seats/archie.ts` lists the three roots in `seat.skills`.
- Source runs read the tree in place. Compiled builds embed it through `seatSkillsModule`
  (`modules/maestro/coordination/src/seat-skills-module.ts`), and `modules/maestro/coordination/src/seat-skill-root.ts` extracts it at run time.
  Relative file names and exact UTF-8 bytes define the payload and its cache digest, so do not normalize or trim files.
- For what the seat does, see [the agents guide](../../../docs/guides/agents.md).

## Rules

- Keep documentation next to `skills/`, never inside it: every file under `skills/` ships.
- Tree rules (node names, `when` and `not-when`, depth and fan-out) are in
  [docs/specs/seat-framework/skill-tree.md](../../../docs/specs/seat-framework/skill-tree.md).
- Seat configuration, dispatch authority and runtime lifetime are owned by the coordination module and Core, not by this
  data tree. Specs and source attribution are in [docs/specs/upstream-specialist](../../../docs/specs/upstream-specialist).

## Commands

From the repository root:

```sh
bun run test:ci maestro test/seat-framework.test.ts test/seat-skills-build.test.ts
```
