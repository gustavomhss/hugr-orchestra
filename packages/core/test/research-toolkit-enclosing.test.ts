import { describe, expect, test } from "bun:test"
import path from "path"
import { Enclosing } from "../src/research-toolkit/code-index/enclosing"
import { Scip } from "../src/research-toolkit/code-index/scip"
import { Role } from "../src/research-toolkit/code-index/types"

// T-X4. Sources of the fixture dumps are described in research-toolkit-scip.test.ts.

const fixture = path.join(import.meta.dir, "fixture", "scip-alias")
const core = "scip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/"
const main = "scip-typescript npm orchestra 1.0.0 src/`main.ts`/"

function document(name: string, file: string) {
  const doc = Scip.readScip(path.join(fixture, name)).documents.find((item) => item.path === file)
  if (!doc) throw new Error(`fixture ${name} has no ${file}`)
  return doc
}

function enclosingAt(doc: Enclosing.Document, symbol: string, line: number) {
  return doc.occurrences.flatMap((occ, i) => (occ.symbol === symbol && occ.startLine === line ? [doc.enclosing[i]] : []))
}

describe("research toolkit SCIP ⋈ structural join", () => {
  test("each reference gets the innermost definition around it", () => {
    const doc = Enclosing.join(document("orchestra.scip", "src/main.ts"))
    expect(enclosingAt(doc, core + "greet().", 5)).toEqual([main + "run()."])
    // Inside a local arrow inside a method: the method is the innermost definition with a range.
    expect(enclosingAt(doc, core + "greet().", 11)).toEqual([main + "Loud#greet()."])
    expect(enclosingAt(doc, core + "greet().", 15)).toEqual([main + "twice.", main + "twice."])
    // A heritage clause sits inside the class's range.
    expect(enclosingAt(doc, core + "Greeter#", 8)).toEqual([main + "Loud#"])
  })

  test("a definition never encloses itself; its container does", () => {
    const doc = Enclosing.join(document("orchestra.scip", "src/main.ts"))
    expect(enclosingAt(doc, main + "Loud#greet().", 9)).toEqual([main + "Loud#"])
    expect(enclosingAt(doc, main + "Loud#", 8)).toEqual([main])
    // The file module and its first child both start at 1:1; the child cannot hold the module.
    const greet = Enclosing.join(document("core.scip", "src/greet.ts"))
    expect(enclosingAt(greet, core, 1)).toEqual([undefined])
    expect(enclosingAt(greet, core + "Greeter#", 1)).toEqual([core])
  })

  test("structural definitions fill the ranges scip-typescript leaves out, joined on name line and name", () => {
    const doc = document("core.scip", "src/greet.ts")
    const member = core + "Greeter#greet()."
    expect(Enclosing.join(doc).definitions.map((def) => def.symbol)).not.toContain(member)
    const joined = Enclosing.join(doc, {
      definitions: [
        { name: "greet", startLine: 2, endLine: 2, nameLine: 2 },
        // Same line, wrong name: must not join.
        { name: "other", startLine: 2, endLine: 3, nameLine: 2 },
      ],
    })
    expect(joined.definitions.find((def) => def.symbol === member)).toMatchObject({
      source: "tree-sitter",
      range: { startLine: 2, endLine: 2 },
    })
    expect(enclosingAt(joined, member + "(name)", 2)).toEqual([member])
  })

  test("references inside an import statement carry the import role", () => {
    const doc = Enclosing.join(document("orchestra.scip", "src/main.ts"), { imports: [{ startLine: 1, endLine: 2 }] })
    const roles = doc.occurrences.filter((occ) => occ.startLine <= 2 && !(occ.role & Role.definition)).map((occ) => occ.role)
    expect(roles.length).toBeGreaterThan(0)
    expect(roles.every((role) => role & Role.import)).toBe(true)
    expect(doc.occurrences.filter((occ) => occ.startLine > 2).some((occ) => occ.role & Role.import)).toBe(false)
  })
})
