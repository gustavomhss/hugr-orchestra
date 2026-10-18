# probe-repo

A fixture with one planted defect and one planted type error, for the probe capability tests.

- `src/clamp.ts`: `clamp(10, 0, 10)` returns 9 (JE-AC-P1). `repro.ts` prints `DEFECT ...` when the defect is present;
  `test/clamp.fixture.ts` is the failing test that shows it, run by path.
- `src/typed.ts`: TS2322 at 3:14, and TS6133 for `leftover` when unused locals are checked (JE-AC-P4).

The directory is excluded from the package typecheck (`packages/orchestra/tsconfig.json`). Tests copy it to a
temporary directory and, for P1, commit it so a probe can snapshot the commit.
