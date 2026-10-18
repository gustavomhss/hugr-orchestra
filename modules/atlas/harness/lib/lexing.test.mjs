// harness/lib/lexing.test.mjs — the teeth for the ONE comment stripper.
//
// `stripComments` moved out of `reachability.mjs` when `layer-guard.mjs` became its second consumer, and
// its fixtures moved with it. They were previously in `reachability-lexing.test.mjs`, which stays exactly
// as it was: that file is the regression battery for READING TYPESCRIPT AT ALL, established by EXECUTING
// each fixture in node, and it outlived three scanners. This file is narrower — it pins the one function
// both gates now share, including the two properties `layer-guard` depends on STRUCTURALLY rather than
// cosmetically: length-preservation (its composition-root scan brace-matches by index) and
// line-preservation (it anchors leg keys on `^\s*`).

import { describe, it, expect } from "vitest"
import { stripComments } from "./lexing.mjs"

// Every case below is either a shape that broke one of the three hand-written scanners, or a property a
// caller depends on structurally. Nothing here is decorative.
describe("stripComments — the ONE stripper, reused instead of rewritten", () => {
  const s = (t) => stripComments(t, "f.ts")

  // THE HOLE THIS FILE'S HEADER CALLS (1), now in the form that broke layer-guard: a glob in a line comment
  // is slash-then-star, the naive BLOCK-before-LINE order reads it as an opener, and the import below is
  // deleted. On master this hid 11 real import statements across 7 files.
  it("a glob in a LINE comment does not open a phantom block comment", () => {
    const out = s('// nothing in packages/*/src calls this\nimport { x } from "@atlas/adapter-io";\n/* later */\n')
    expect(out).toContain('import { x } from "@atlas/adapter-io";')
    expect(out).not.toContain("packages")
  })

  it("a real BLOCK comment is still removed", () => {
    expect(s('/* import { q } from "@atlas/cli"; */\nconst a = 1;\n')).not.toContain("@atlas/cli")
  })

  it("a regex literal containing slash-star is not a comment opener", () => {
    const out = s('const S = /a\\/*b/;\nimport { x } from "@atlas/adapter-io";\n')
    expect(out).toContain("@atlas/adapter-io")
    expect(out).toContain("/a\\/*b/")
  })

  it("a comment inside a TEMPLATE literal is text, not a comment", () => {
    expect(s("const T = `\n// kept\n/* kept */\n`;\n")).toContain("// kept")
  })

  it("a `//` inside a STRING is not a comment", () => {
    expect(s('const u = "http://example.com";\n')).toContain("http://example.com")
  })

  it("a comment with no code after it — the EOF trivia case — is still removed", () => {
    expect(s("const a = 1;\n// tail @atlas/cli\n")).not.toContain("@atlas/cli")
  })

  // STRUCTURAL, not cosmetic: layer-guard slices the composition root at offsets computed on the RAW text
  // and then brace-matches by index. Deleting comments instead of blanking them shifts every offset after
  // the first one, and the slice lands somewhere else entirely.
  it("preserves length and line count exactly", () => {
    const src = "/* a */ const x = 1; // b\n/**\n * c\n */\nconst y = 2;\n"
    const out = s(src)
    expect(out.length).toBe(src.length)
    expect(out.split("\n").length).toBe(src.split("\n").length)
    expect(out).toContain("const x = 1;")
    expect(out).toContain("const y = 2;")
  })
})
