import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { layer } from "../../src/database/sqlite.node"
import { proveReadonlyVacuum } from "./database-vacuum-proof"

export async function runProof() {
  assert.equal("bun" in process.versions, false)
  assert.equal(typeof DatabaseSync, "function")
  const results = []
  for (const mode of ["wal", "delete"] as const) {
    for (const rollback of [false, true]) results.push(await proveReadonlyVacuum(layer, mode, rollback))
  }
  return results
}
