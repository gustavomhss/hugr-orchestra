import { describe, expect, test } from "bun:test"
import path from "path"
import { create, toBinary } from "@bufbuild/protobuf"
import { IndexSchema, PositionEncoding } from "@c4312/scip/scip_pb"
import { Scip } from "../../src/research-toolkit/code-index/scip"
import { tmpdir } from "../fixture/tmpdir"

// The SCIP reader counts every column in UTF-16 units. scip-go emits UTF-8 byte offsets without declaring them and
// rust-analyzer declares UTF-8; non-ASCII text before a symbol must not shift its range.
// Mutation control: in Scip.readScip, use the dump's ranges unconverted (`convert` returning its input); the UTF-8
// and UTF-32 cases go red.

const GO = `package main\n\nfunc run() int {\n\tlabel := "ünï→✓"; return helpers.DoubleIt(len(label))\n}\n`
const RUST = `pub fn run() -> i32 {\n    let label = "ünï→✓🚀"; helpers::double_it(label.len() as i32)\n}\n`

const dump = async (dir: string, tool: string, document: { path: string; range: number[]; encoding?: PositionEncoding; text?: string }) => {
  const file = path.join(dir, `${tool}.scip`)
  await Bun.write(file, toBinary(IndexSchema, create(IndexSchema, {
    metadata: { toolInfo: { name: tool, version: "0" } },
    documents: [{
      relativePath: document.path, language: "x", positionEncoding: document.encoding, text: document.text,
      occurrences: [{ range: document.range, symbol: `${tool} x x 0 pkg/Target().`, symbolRoles: 0 }],
    }],
  })))
  return file
}

const columns = (index: Scip.Index) => index.documents[0]!.occurrences.map((occ) => [occ.startLine, occ.startCol, occ.endCol])

describe("SCIP columns in UTF-16 units", () => {
  test("scip-go's undeclared UTF-8 byte offsets are converted against the Go source line", async () => {
    await using dir = await tmpdir()
    const file = await dump(dir.path, "scip-go", { path: "main.go", range: [3, 40, 48] })
    // 1-based start, exclusive end: `DoubleIt` starts at UTF-16 offset 34 on line 4.
    expect(columns(Scip.readScip(file, { prefix: "go", source: (name) => name === "go/main.go" ? GO : undefined }))).toEqual([[4, 35, 42]])
  })

  test("rust-analyzer's declared UTF-8 offsets are converted, an astral character counting two units", async () => {
    await using dir = await tmpdir()
    const file = await dump(dir.path, "rust-analyzer", {
      path: "src/lib.rs", range: [1, 44, 53], encoding: PositionEncoding.UTF8CodeUnitOffsetFromLineStart,
    })
    expect(columns(Scip.readScip(file, { source: () => RUST }))).toEqual([[2, 37, 45]])
  })

  test("UTF-32 offsets convert from the dump's own text, and UTF-16 offsets stay as emitted", async () => {
    await using dir = await tmpdir()
    const utf32 = await dump(dir.path, "utf32", { path: "src/lib.rs", range: [1, 35, 44], encoding: PositionEncoding.UTF32CodeUnitOffsetFromLineStart, text: RUST })
    expect(columns(Scip.readScip(utf32))).toEqual([[2, 37, 45]])
    // scip-typescript and scip-python count UTF-16 units already.
    const utf16 = await dump(dir.path, "scip-typescript", { path: "src/lib.rs", range: [1, 36, 45] })
    expect(columns(Scip.readScip(utf16, { source: () => RUST }))).toEqual([[2, 37, 45]])
  })
})
