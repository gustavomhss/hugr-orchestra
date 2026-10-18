# Backend specialist assets

Authored skill trees for the native `backend` seat: six entry skills with their complete references,
recipes and companions. This is an asset module, not a separately published package.

`Seats.skillSource("backend")` in Orchestra resolves `skills/` here. Orchestra's Bun/Node builders and
the modern CLI producer read the same seat content. Relative file names and exact UTF-8 bytes define
the embedded payload and existing content-addressed cache identity; do not normalize or trim them.

Core owns toolkit acquisition, process execution and recipe generation. Its `script/toolkit-pack.ts`
reads this module and maintains recipe companions. Moving assets does not move that engine or change
readiness, permissions or configured skill precedence.

Keep module documentation beside `skills/`, not inside it: every skill-tree file is shipped content.
Run focused checks from the repository root through existing stable selectors:

```sh
bun run test:ci orchestra test/skill/backend-skills.test.ts test/skill/backend-families.test.ts
bun run test:ci core test/backend-toolkit-packs.test.ts
```

The source contract lives in [specs/backend-specialist](../../../specs/backend-specialist).
Orchestra and Core own package typechecks; compiled payload tests and delivery lanes qualify their
respective runtimes.
