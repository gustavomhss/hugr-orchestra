// @atlas/cli — test/mine-cold-grammar.test.ts  (#243 — the cold-grammar footgun, EXPLAINED not gated)
//
// The footgun: `createSkeletonSource`'s AST refinement is a silent no-op until `initAst()` (adapter-io)
// resolves, and `subtreeHash` hashes the SUBTREE — so a `file` node's own hash differs between a cold pass
// (file-level only) and a warm one (item/block children folded in). A caller that mines COLD and later reads
// those citations back through a WARM re-derivation (every `atlas promote` path — always via `bin.ts`) gets
// a 100%-refused store with no diagnostic pointing at the cause (#237 lineage).
//
// A mechanical `!astWarmed()` throw was tried at the `mine.ts` composition point and REVERTED (see the WP
// return card) — it cannot distinguish that caller from the many hermetic tests in this suite that mine cold
// and never promote what they stage, and broke six of them. The REAL guarantee is structural: `bin.ts`
// awaits `initAst()` before composing ANYTHING, so `mine` and `promote` — both driven only through `bin.ts`
// in production — can never disagree. This file pins THAT ordering directly against `bin.ts`'s own source.
//
// TEETH: reorder `bin.ts` so `composeRuntime`/`main` runs before `await initAst()` (or delete the await) and
// this goes red.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { astWarmed } from "@atlas/adapter-io"

const HERE = dirname(fileURLToPath(import.meta.url))
const BIN_SRC_RAW = readFileSync(join(HERE, "..", "src", "bin.ts"), "utf8")
// Strip `//` line-comments — the module header PROSE names both `composeRuntime(process.cwd())` and
// `initAst()` before either appears as real code, which would otherwise satisfy an index-order check for
// the wrong reason (prose, not control flow).
const BIN_SRC = BIN_SRC_RAW.split("\n")
  .map((line) => line.replace(/\/\/.*$/, ""))
  .join("\n")

describe("#243 — cold-grammar footgun: bin.ts awaits initAst() before composing anything", () => {
  it("`await initAst()` appears in the source, textually BEFORE `composeRuntime(` — the ordering that makes mine/promote agree", () => {
    const awaitIdx = BIN_SRC.indexOf("await initAst()")
    // The CALL, not the import line — `composeRuntime(process.cwd())` is the actual composition.
    const composeIdx = BIN_SRC.indexOf("composeRuntime(process.cwd())")
    expect(awaitIdx).toBeGreaterThan(-1)
    expect(composeIdx).toBeGreaterThan(-1)
    expect(awaitIdx).toBeLessThan(composeIdx)
  })

  it("`astWarmed()` is exported off the public @atlas/adapter-io surface — the self-check any DIRECT (non-bin.ts) caller of `mine`/`promote` can run for itself", () => {
    expect(typeof astWarmed).toBe("function")
  })
})
