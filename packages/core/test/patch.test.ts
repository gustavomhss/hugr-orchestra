import { describe, expect, test } from "bun:test"
import { Patch } from "@orchestra/core/patch"

const patch = (...lines: string[]) => ["*** Begin Patch", ...lines, "*** End Patch"].join("\n")

describe("Patch", () => {
  test("parses add, update, and delete hunks", () => {
    expect(
      Patch.parse(
        "*** Begin Patch\n*** Add File: add.txt\n+added\n*** Update File: update.txt\n@@ section\n-old\n+new\n*** Delete File: delete.txt\n*** End Patch",
      ),
    ).toEqual([
      { type: "add", path: "add.txt", contents: "added" },
      {
        type: "update",
        path: "update.txt",
        chunks: [{ oldLines: ["old"], newLines: ["new"], changeContext: "section", endOfFile: undefined }],
        movePath: undefined,
      },
      { type: "delete", path: "delete.txt" },
    ])
  })

  test("strips a heredoc wrapper", () => {
    expect(Patch.parse("cat <<'EOF'\n*** Begin Patch\n*** Add File: add.txt\n+added\n*** End Patch\nEOF")).toEqual([
      { type: "add", path: "add.txt", contents: "added" },
    ])
  })

  test("derives fuzzy line updates while preserving BOM", () => {
    const update = Patch.derive("update.txt", [{ oldLines: ["  old   "], newLines: ["new"] }], "\uFEFFold\n")
    expect(update).toEqual({ content: "new\n", bom: true })
    expect(Patch.joinBom(update.content, update.bom)).toBe("\uFEFFnew\n")
  })

  test("matches EOF-anchored chunks from the end", () => {
    expect(
      Patch.derive(
        "update.txt",
        [{ oldLines: ["marker", "end"], newLines: ["marker changed", "end"], endOfFile: true }],
        "marker\nmiddle\nmarker\nend\n",
      ).content,
    ).toBe("marker\nmiddle\nmarker changed\nend\n")
  })

  test("parses the EOF marker inside update chunks", () => {
    expect(
      Patch.parse("*** Begin Patch\n*** Update File: update.txt\n@@\n-last\n+end\n*** End of File\n*** End Patch"),
    ).toEqual([
      {
        type: "update",
        path: "update.txt",
        movePath: undefined,
        chunks: [{ oldLines: ["last"], newLines: ["end"], changeContext: undefined, endOfFile: true }],
      },
    ])
  })

  test("rejects malformed hunk bodies and names the line", () => {
    expect(() => Patch.parse(patch("*** Add File: add.txt", "missing plus"))).toThrow(
      "Unexpected line 'missing plus' in *** Add File: add.txt",
    )
    expect(() => Patch.parse(patch("*** Update File: update.txt"))).toThrow("has no hunk lines")
    expect(() => Patch.parse(patch("*** Update File: update.txt", "@@", "-old", "new"))).toThrow(
      "Unexpected line 'new' in *** Update File: update.txt",
    )
    expect(() => Patch.parse(patch("*** Delete File: delete.txt", "unexpected body"))).toThrow(
      "Unexpected line 'unexpected body'",
    )
    expect(() => Patch.parse(patch("*** Update File: update.txt", "*** Move to:", "@@", "-old", "+new"))).toThrow(
      "*** Move to: needs a path",
    )
  })

  // ToolSafety checks apply_patch paths with this parser, so it must accept what the apply_patch tool applies
  test("reads a first hunk without an @@ line", () => {
    expect(Patch.parse(patch("*** Update File: a.txt", " one", "-two", "+TWO"))).toEqual([
      {
        type: "update",
        path: "a.txt",
        movePath: undefined,
        chunks: [{ oldLines: ["one", "two"], newLines: ["one", "TWO"], changeContext: undefined, endOfFile: undefined }],
      },
    ])
  })

  test("reads a bare Move to as a rename", () => {
    expect(Patch.parse(patch("*** Update File: before.txt", "*** Move to: after.txt"))).toEqual([
      { type: "update", path: "before.txt", movePath: "after.txt", chunks: [] },
    ])
  })

  test("ends the patch at its last End Patch marker", () => {
    // A context line that reads *** End Patch must not hide the file sections after it from ToolSafety
    const hunks = Patch.parse(
      patch("*** Update File: format.md", "@@", " *** End Patch", "-old", "+new", "*** Update File: secret.txt", "@@", "-a", "+b"),
    )
    expect(hunks.map((hunk) => hunk.path)).toEqual(["format.md", "secret.txt"])
  })

  test("reads an empty line between hunk lines as a blank context line", () => {
    expect(Patch.parse(patch("*** Update File: a.txt", "@@", " one", "", "-two", "+TWO"))).toEqual([
      {
        type: "update",
        path: "a.txt",
        movePath: undefined,
        chunks: [
          { oldLines: ["one", "", "two"], newLines: ["one", "", "TWO"], changeContext: undefined, endOfFile: undefined },
        ],
      },
    ])
  })

  test("writes an empty line between Add File lines into the file", () => {
    expect(Patch.parse(patch("*** Add File: notes.md", "+first", "", "+second"))).toEqual([
      { type: "add", path: "notes.md", contents: "first\n\nsecond" },
    ])
  })

  test("ignores empty lines around hunks and file sections", () => {
    expect(
      Patch.parse(
        patch(
          "",
          "*** Update File: a.txt",
          "",
          "@@ one",
          "",
          " two",
          "-three",
          "+THREE",
          "",
          "@@",
          "-four",
          "+FOUR",
          "",
          "*** End of File",
          "",
          "*** Add File: b.txt",
          "",
          "+b",
          "",
          "*** Delete File: c.txt",
          "",
        ),
      ),
    ).toEqual([
      {
        type: "update",
        path: "a.txt",
        movePath: undefined,
        chunks: [
          { oldLines: ["two", "three"], newLines: ["two", "THREE"], changeContext: "one", endOfFile: undefined },
          { oldLines: ["four"], newLines: ["FOUR"], changeContext: undefined, endOfFile: true },
        ],
      },
      { type: "add", path: "b.txt", contents: "b" },
      { type: "delete", path: "c.txt" },
    ])
  })

  test("keeps a lone space at the edge of a hunk as a blank context line", () => {
    expect(Patch.parse(patch("*** Update File: a.txt", " ", "-one", "+ONE", " ", "@@", " ", "-two", "+TWO"))).toEqual([
      {
        type: "update",
        path: "a.txt",
        movePath: undefined,
        chunks: [
          { oldLines: ["", "one", ""], newLines: ["", "ONE", ""], changeContext: undefined, endOfFile: undefined },
          { oldLines: ["", "two"], newLines: ["", "TWO"], changeContext: undefined, endOfFile: undefined },
        ],
      },
    ])
  })

  test("rejects an empty line between + lines of a hunk without context or removed lines", () => {
    // As context, the empty line would pin the hunk to a blank line of the file instead of appending it
    expect(() => Patch.parse(patch("*** Update File: a.txt", "@@", "+one", "", "+two"))).toThrow(
      "Empty line between + lines in *** Update File: a.txt: write an added blank line as +",
    )
  })

  test("anchors an End of File hunk to the last lines of the file", () => {
    expect(() =>
      Patch.derive("a.txt", [{ oldLines: ["last"], newLines: ["end"], endOfFile: true }], "alpha\nlast\nextra\n"),
    ).toThrow("Failed to find expected lines at the end of a.txt")
  })
})
