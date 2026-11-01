import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Scip } from "../src/research-toolkit/code-index/scip"
import { Role } from "../src/research-toolkit/code-index/types"
import { tmpdir } from "./fixture/tmpdir"

// T-X1. The dumps in fixture/scip-alias are real scip-typescript 0.4.0 output for a two-package Bun workspace shaped
// like this repo: `orchestra` maps `@/*` to `./src/*` in tsconfig `paths` and imports `@orchestra/core/greet`, which
// `@orchestra/core` exports through `"./*": "./src/*.ts"`. Each was produced by `scip-typescript index --output
// <name>.scip` run in its package directory after `bun install`. Sources:
//   core/src/greet.ts      export interface Greeter { greet(name: string): string } ... export function greet(name) {..}
//   orchestra/src/util/tool.ts  export function helper() { return 1 }
//   orchestra/src/main.ts  imports helper from "@/util/tool" and { greet, type Greeter } from "@orchestra/core/greet";
//                          run() calls greet(String(helper())); class Loud implements Greeter, its greet() calls greet
//                          inside a local arrow; `twice` is an arrow calling greet twice on line 15.

const fixture = path.join(import.meta.dir, "fixture", "scip-alias")
const core = "scip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/"
const orchestra = "scip-typescript npm orchestra 1.0.0 src/"

describe("research toolkit SCIP reader", () => {
  test("scip-typescript resolves the tsconfig `@/` alias and the `@orchestra/*` workspace export to source symbols", () => {
    const main = Scip.readScip(path.join(fixture, "orchestra.scip")).documents.find((doc) => doc.path === "src/main.ts")
    const refs = main?.occurrences.filter((occ) => occ.startLine === 1 || occ.startLine === 2).map((occ) => occ.symbol)
    // `@/util/tool` lands on the orchestra source file, not on an unresolved module.
    expect(refs).toContain(orchestra + "util/`tool.ts`/helper().")
    // `@orchestra/core/greet` lands on core's src/greet.ts, the very symbol core's own shard defines.
    expect(refs).toContain(core + "greet().")
    const defined = Scip.readScip(path.join(fixture, "core.scip")).documents.flatMap((doc) =>
      doc.occurrences.filter((occ) => occ.role & Role.definition).map((occ) => occ.symbol),
    )
    expect(defined).toContain(core + "greet().")
  })

  test("projects ranges to 1-based closed lines and columns and keeps enclosing ranges and relationships", () => {
    const index = Scip.readScip(path.join(fixture, "core.scip"), { prefix: "packages/core" })
    expect(index.indexer).toEqual({ name: "scip-typescript", version: "0.4.0" })
    expect(index.malformed).toBe(0)
    const doc = index.documents[0]
    expect(doc.path).toBe("packages/core/src/greet.ts")
    // SCIP [4, 16, 21] with enclosing [4, 0, 6, 1]: `greet` on line 5, columns 17-21 of `export function greet(`.
    expect(doc.occurrences.find((occ) => occ.symbol === core + "greet()." && occ.role === Role.definition)).toEqual({
      symbol: core + "greet().",
      role: Role.definition,
      startLine: 5,
      startCol: 17,
      endLine: 5,
      endCol: 21,
      enclosingRange: { startLine: 5, startCol: 1, endLine: 7, endCol: 1 },
    })
    const loud = Scip.readScip(path.join(fixture, "orchestra.scip"))
      .documents.flatMap((d) => d.symbols)
      .find((info) => info.symbol === orchestra + "`main.ts`/Loud#")
    expect(loud?.relationships).toEqual([
      { symbol: core + "Greeter#", implementation: true, typeDefinition: false, reference: false, definition: false },
    ])
  })

  test("memoizes per path, mtime and size, and a rewrite busts the memo", async () => {
    await using dir = await tmpdir()
    const file = path.join(dir.path, "index.scip")
    await fs.copyFile(path.join(fixture, "core.scip"), file)
    expect(Scip.decodeScipCached(file)).toBe(Scip.decodeScipCached(file))
    await fs.copyFile(path.join(fixture, "orchestra.scip"), file)
    expect(Scip.readScip(file).documents.map((doc) => doc.path)).toEqual(["src/util/tool.ts", "src/main.ts"])
  })

  // The indexer writes every shard run to a fresh temp path, so a memo with no bound kept one dead decode per run.
  // Gate the bound, not the absence of caching: the newest dumps still memoize, the rest are dropped.
  test("keeps at most MEMO_LIMIT decodes however many distinct dumps are read", async () => {
    await using dir = await tmpdir()
    const files = await Promise.all(
      Array.from({ length: Scip.MEMO_LIMIT + 5 }, async (_, index) => {
        const file = path.join(dir.path, `run-${index}`, "index.scip")
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.copyFile(path.join(fixture, "core.scip"), file)
        return file
      }),
    )
    const decoded = files.map((file) => Scip.decodeScipCached(file))
    // Hits do not evict, so read the newest window first, then the entries just outside it.
    const newest = files.slice(-Scip.MEMO_LIMIT)
    newest.toReversed().forEach((file, index) => {
      expect(Scip.decodeScipCached(file)).toBe(decoded[files.length - 1 - index])
    })
    expect(Scip.decodeScipCached(files[files.length - Scip.MEMO_LIMIT - 1])).not.toBe(decoded[files.length - Scip.MEMO_LIMIT - 1])
    expect(Scip.decodeScipCached(files[0])).not.toBe(decoded[0])
  })

  test("a recently read dump outlives an older one", async () => {
    await using dir = await tmpdir()
    const files = await Promise.all(
      Array.from({ length: Scip.MEMO_LIMIT + 1 }, async (_, index) => {
        const file = path.join(dir.path, `run-${index}.scip`)
        await fs.copyFile(path.join(fixture, "core.scip"), file)
        return file
      }),
    )
    const decoded = files.slice(0, Scip.MEMO_LIMIT).map((file) => Scip.decodeScipCached(file))
    expect(Scip.decodeScipCached(files[0])).toBe(decoded[0])
    Scip.decodeScipCached(files[Scip.MEMO_LIMIT])
    expect(Scip.decodeScipCached(files[0])).toBe(decoded[0])
    expect(Scip.decodeScipCached(files[1])).not.toBe(decoded[1])
  })

  test("forgetScip drops a single-use dump's decode", async () => {
    await using dir = await tmpdir()
    const file = path.join(dir.path, "index.scip")
    await fs.copyFile(path.join(fixture, "core.scip"), file)
    const decoded = Scip.decodeScipCached(file)
    Scip.forgetScip(file)
    expect(Scip.decodeScipCached(file)).not.toBe(decoded)
  })

  test("refuses a non-regular file and degrades a missing or corrupt dump to an empty index", async () => {
    await using dir = await tmpdir()
    const corrupt = path.join(dir.path, "corrupt.scip")
    await Bun.write(corrupt, new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x0f]))
    expect(() => Scip.decodeScipCached(dir.path)).toThrow("not a regular file")
    const empty = { indexer: undefined, documents: [], malformed: 0 }
    expect(Scip.readScipOrEmpty(dir.path)).toEqual(empty)
    expect(Scip.readScipOrEmpty(path.join(dir.path, "missing.scip"))).toEqual(empty)
    expect(Scip.readScipOrEmpty(corrupt)).toEqual(empty)
    expect(Scip.readScipIndexerName(corrupt)).toBeUndefined()
    expect(Scip.readScipIndexerName(path.join(fixture, "core.scip"))).toBe("scip-typescript")
  })

  test("names the last descriptor of a symbol", () => {
    expect(Scip.descriptorName(core + "greet().")).toBe("greet")
    expect(Scip.descriptorName(core + "Greeter#greet().")).toBe("greet")
    expect(Scip.descriptorName(orchestra + "`main.ts`/Loud#greet().(name)")).toBe("name")
    expect(Scip.descriptorName(orchestra + "`main.ts`/twice.")).toBe("twice")
    expect(Scip.descriptorName(core)).toBeUndefined()
    expect(Scip.descriptorName("local 4")).toBeUndefined()
  })
})
