import { test } from "bun:test"
import { layer } from "#sqlite"
import { proveReadonlyVacuum } from "./fixture/database-vacuum-proof"

for (const mode of ["wal", "delete"] as const) {
  for (const rollback of [false, true]) {
    test(`readonly Bun VACUUM INTO under writer IMMEDIATE: ${mode}, rollback=${rollback}`, async () => {
      await proveReadonlyVacuum(layer, mode, rollback)
    }, 20_000)
  }
}
