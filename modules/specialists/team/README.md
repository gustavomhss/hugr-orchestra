# Shared seat skill trees

Skill trees that more than one seat uses, authored once. Every root here is named `team-<topic>`, and a seat grants
one by listing it in `seat.skills`. Today that is `team-stack`, the language and framework tree, which the backend
seat lists. This is an asset module, not a separately published package.

Orchestra's `Seats.sharedSource()` resolves `skills/` here. Compiled builds embed it with the seat trees
(`script/seat-skills.ts`). The tree rules (node names, `when` and `not-when`, depth and fan-out) are in
[docs/specs/seat-framework/skill-tree.md](../../../docs/specs/seat-framework/skill-tree.md).

Keep documentation outside `skills/`; every companion enters the shipped payload.

From the repository root:

```sh
bun run test:ci maestro test/seat-framework.test.ts test/v2-skills.test.ts
```
