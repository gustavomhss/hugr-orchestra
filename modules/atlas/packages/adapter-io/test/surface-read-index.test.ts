// @atlas/adapter-io — test/surface-read-index.test.ts  (the Atlas UI surface: dependents from the code index)
//
// The shared `fix-scip` index: `src/util.ts` defines `greet`, `src/app.ts` references it and an undefined
// `missingHelper`. The one resolved edge folds to `src/util.ts → [src/app.ts]`; the unresolved one contributes nothing.

import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { readDependents } from "../src/surface/read-index.js"
import { makeFixScip } from "./harness/fix-scip.js"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function storeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-surface-index-"))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, ".atlas"), { recursive: true })
  return dir
}

describe("surface read-index — dependents from .atlas/index.scip", () => {
  it("folds the resolved depends-on edges to file → sorted users, and counts them", () => {
    const scip = makeFixScip()
    cleanups.push(scip.cleanup)
    const dir = storeDir()
    copyFileSync(scip.scipPath, join(dir, ".atlas", "index.scip"))
    expect(readDependents(dir)).toEqual({
      scip: true,
      dependents: { "src/util.ts": ["src/app.ts"] },
      dependentCount: { "src/util.ts": 1 },
    })
  })

  it("answers scip false and empty maps when there is no index file", () => {
    expect(readDependents(storeDir())).toEqual({ scip: false, dependents: {}, dependentCount: {} })
  })

  it("answers scip true and empty maps when the index file is unreadable", () => {
    const dir = storeDir()
    // The same garbage test/scip-corrupt-guard.test.ts proves `readScipOrEmpty` degrades on.
    writeFileSync(join(dir, ".atlas", "index.scip"), Buffer.from("this is not a scip protobuf \x00\xff\xfe garbage", "binary"))
    expect(readDependents(dir)).toEqual({ scip: true, dependents: {}, dependentCount: {} })
  })
})
