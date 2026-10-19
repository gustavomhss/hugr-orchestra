import { describe, expect, test } from "bun:test"
import path from "path"
import { Callers } from "../src/research-toolkit/code-index/callers"
import { Enclosing } from "../src/research-toolkit/code-index/enclosing"
import { Scip } from "../src/research-toolkit/code-index/scip"
import { Role } from "../src/research-toolkit/code-index/types"

// T-X3. Sources of the fixture dumps are described in research-toolkit-scip.test.ts.

const fixture = path.join(import.meta.dir, "fixture", "scip-alias")
const greet = "scip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/greet()."
const main = "scip-typescript npm orchestra 1.0.0 src/`main.ts`/"

function shards() {
  return [
    ...Scip.readScip(path.join(fixture, "core.scip"), { prefix: "packages/core" }).documents,
    ...Scip.readScip(path.join(fixture, "orchestra.scip"), { prefix: "packages/orchestra" }).documents,
  ].map((doc) => Enclosing.join(doc, doc.path.endsWith("main.ts") ? { imports: [{ startLine: 1, endLine: 2 }] } : {}))
}

function doc(file: string, occurrences: Scip.Occurrence[]) {
  return Enclosing.join({ path: file, language: "typescript", occurrences, symbols: [] })
}

function at(symbol: string, line: number, role: number = Role.reference): Scip.Occurrence {
  return { symbol, role, startLine: line, startCol: 1, endLine: line, endCol: 5 }
}

describe("research toolkit reverse callers", () => {
  test("groups references across workspace shards by enclosing definition, with call lines as sites", () => {
    const view = Callers.create(shards(), { indexerName: "scip-typescript" })
    expect(view.resolves(greet)).toBe(true)
    expect(view.definesAt(greet)).toEqual({ path: "packages/core/src/greet.ts", line: 5 })
    // The import on line 2 names greet without calling it, so it joins no group.
    expect(view.callers(greet).map((caller) => [caller.path, caller.enclosing, caller.range?.startLine, caller.sites])).toEqual([
      ["packages/orchestra/src/main.ts", main + "run().", 4, [5]],
      ["packages/orchestra/src/main.ts", main + "Loud#greet().", 9, [11]],
      ["packages/orchestra/src/main.ts", main + "twice.", 15, [15]],
    ])
  })

  test("a phantom or local symbol has no callers and does not resolve", () => {
    const view = Callers.create(shards(), { indexerName: "scip-typescript" })
    expect(view.callers("scip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/missing().")).toEqual([])
    expect(view.resolves("scip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/missing().")).toBe(false)
    expect(view.resolves("local 2")).toBe(false)
    expect(view.definesAt("local 2")).toBeUndefined()
  })

  test("a local reference with no local definition in its document is opaque, only under scip-typescript", () => {
    const docs = [
      doc("a.ts", [at("local 1", 1, Role.definition), at("local 1", 2), at("local 7", 3)]),
      // `local 7` is defined here, which must not vouch for a.ts.
      doc("b.ts", [at("local 7", 1, Role.definition)]),
    ]
    const view = Callers.create(docs, { indexerName: "scip-typescript" })
    expect(view.opaque()).toEqual([{ path: "a.ts", line: 3 }])
    expect(view.resolution(docs[0].occurrences[1])).toEqual({ kind: "local" })
    expect(view.resolution(docs[0].occurrences[2])).toEqual({ kind: "opaque" })
    expect(Callers.create(docs, { indexerName: "scip-python" }).opaque()).toEqual([])
    expect(Callers.create(docs).opaque()).toEqual([])
  })

  test("a published-types reference canonicalizes onto its source definition; an unknown global is a hole", () => {
    const source = "scip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/greet()."
    const published = "scip-typescript npm @orchestra/core 1.0.0 dist/src/`greet.d.ts`/greet()."
    expect(Callers.canonicalizeSymbol(published)).toBe(source)
    const docs = [
      doc("core/greet.ts", [at(source, 5, Role.definition)]),
      doc("app/use.ts", [at(published, 3), at("scip-typescript npm typescript 5.9.3 lib/`lib.es5.d.ts`/String#", 4)]),
    ]
    const view = Callers.create(docs, { indexerName: "scip-typescript" })
    expect(view.resolution(docs[1].occurrences[0])).toEqual({ kind: "resolved", symbol: source })
    expect(view.callers(source).map((caller) => [caller.path, caller.sites])).toEqual([["app/use.ts", [3]]])
    expect(view.holes()).toEqual([{ path: "app/use.ts", line: 4 }])
  })
})
