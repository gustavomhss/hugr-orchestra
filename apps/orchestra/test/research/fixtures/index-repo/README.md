# index-repo

A tiny monorepo for the code index capability tests. Nothing here is installed or built; tests copy it to a
temporary directory and, where they need SCIP, run the pinned indexers over the copy.

- `packages/core` is `@fixture/core`, whose `exports` map is `"./*": "./src/*.ts"` (JE-AC-X3).
- `packages/app` is `@fixture/app`; it reaches `util/alias-only.ts` only through the `@/` alias (JE-AC-X2) and
  `core/src/x.ts` only as `@fixture/core/x`.
- `packages/app/src/legacy.js` carries Flow syntax the indexer skips (JE-AC-X7).
- `py/` is a two-module Python program (JE-AC-X9): `helpers.double_it` is defined in one module and called in the other.

The directory is excluded from the package typecheck (`apps/orchestra/tsconfig.json`).
