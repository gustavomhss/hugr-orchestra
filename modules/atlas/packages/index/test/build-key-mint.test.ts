// @atlas/index — test/build-key-mint.test.ts   (ANCHOR-IDENTITY · the node-key mint is the identity leg)
//
// A node key is not a label, it is an ADDRESS: `primaryAnchorId` computes a fact's identity as the
// segment-wise common prefix of its anchors' `::` chains, `deriveSubsumes` reads containment off the same
// chain, and `descentSteps` (resolve.ts) splits keys back apart on `/` and `::`. Every one of those is a
// DECODE, so the mint must be an injective ENCODE. It was not: `:` is legal in a POSIX filename and git
// tracks it, so two committed files named `x::alpha.ts` and `x::beta.ts` fabricated the ancestor `src/x` —
// a unit that does not exist — which `primaryAnchorId` then minted as a real, non-empty anchor.
//
// These are the mint's laws, at the mint. The end-to-end consequence (nodeKey collision through the real
// write door) is pinned in adapter-io/test/anchor-identity.test.ts.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { build, escapeKeyComponent, unescapeKeyComponent } from "../src/build.js"
import type { FileTree, IndexNode, ScipOutput } from "../src/types.js"

const NO_SCIP = { documents: [] } as unknown as ScipOutput
const axesOf = (tree: FileTree) => build(tree, NO_SCIP)
const keysOf = (n: IndexNode, out: string[] = []): string[] => {
  out.push(n.key)
  n.children.forEach((c) => keysOf(c, out))
  return out
}
const file = (path: string, content = "x"): FileTree => ({ path, children: [], content })

describe("the key escape is a lossless, injective ENCODE (not a sanitizer)", () => {
  it("escape/unescape round-trips ∀ strings", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(unescapeKeyComponent(escapeKeyComponent(s))).toBe(s)
      }),
    )
  })

  it("an escaped component can never contain `:` — so it can never sit on, or move, a `::` boundary", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(escapeKeyComponent(s).includes(":")).toBe(false)
      }),
    )
  })

  it("it is the IDENTITY on a normal component — no existing key moves", () => {
    for (const c of ["src", "billing.ts", "a-b_c.9", "módulo", "中文.ts", "x y"]) {
      expect(escapeKeyComponent(c)).toBe(c)
    }
  })
})

describe("the node-key mint refuses to fabricate structure", () => {
  it("a `::` inside a FILENAME does not fabricate an ancestor segment", () => {
    const axes = axesOf({
      path: ".",
      children: [{ path: "src", children: [file("src/x::alpha.ts"), file("src/x::beta.ts")] }],
    })
    const fileKeys = keysOf(axes.spatial).filter((k) => k.endsWith(".ts"))
    expect(fileKeys).toHaveLength(2)
    for (const k of fileKeys) {
      // teeth (breaks-on "the key is copied verbatim from FileTree.path — `src/x::alpha.ts` splits into
      // TWO segments, so the two files 'share' the ancestor `src/x`, which does not exist"):
      expect(k.split("::")).toHaveLength(1)
    }
    // …and consequently the two files share NO `::` prefix at all.
    const [a, b] = fileKeys as [string, string]
    expect(a.split("::")[0]).not.toBe(b.split("::")[0])
  })

  it("a DIRECTORY cannot claim a `::`-named child as its refinement unit (content gates the `::` branch)", () => {
    const axes = axesOf({ path: ".", children: [{ path: "a", children: [file("a::b.ts")] }] })
    // teeth (breaks-on "the mint tests only the path prefix — a content-free directory adopts a file as a
    // sub-file unit, and the file inherits an ancestry it does not have"):
    expect(keysOf(axes.spatial)).toContain("a%3A%3Ab.ts")
    expect(keysOf(axes.spatial)).not.toContain("a::b.ts")
  })

  it("a REFINEMENT unit minted by the adapter keeps its `::` chain (the escape is not blanket)", () => {
    const axes = axesOf({
      path: ".",
      children: [
        {
          path: "src",
          children: [
            {
              path: "src/m.ts",
              content: "export function f() {}",
              children: [{ path: "src/m.ts::function_declaration:0:f", children: [], content: "function f() {}" }],
            },
          ],
        },
      ],
    })
    expect(keysOf(axes.spatial)).toContain("src/m.ts::function_declaration:0:f")
  })

  it("a MALFORMED refinement local is escaped wholesale rather than trusted", () => {
    const axes = axesOf({
      path: ".",
      children: [
        {
          path: "m.ts",
          content: "x",
          // an adapter defect: the local carries a `::` of its own and a trailing `:`.
          children: [{ path: "m.ts::bad::local:", children: [], content: "y" }],
        },
      ],
    })
    const minted = keysOf(axes.spatial).find((k) => k.startsWith("m.ts::")) as string
    // teeth (breaks-on "the mint trusts the adapter's local — a fabricated boundary rides straight through"):
    expect(minted.split("::")).toHaveLength(2)
    expect(minted.split("::")[1]?.endsWith(":")).toBe(false)
  })

  it("∀ minted key: no segment contains `::`, none starts or ends with `:` (the join stays injective)", () => {
    const nameArb = fc
      .string({ minLength: 1, maxLength: 5 })
      .filter((s) => s === s.trim() && s.length > 0 && !s.includes("/"))
    fc.assert(
      fc.property(fc.uniqueArray(nameArb, { minLength: 1, maxLength: 4 }), (names) => {
        const axes = axesOf({ path: ".", children: [{ path: "src", children: names.map((n) => file(`src/${n}`)) }] })
        for (const k of keysOf(axes.spatial)) {
          for (const seg of k.split("::")) {
            expect(seg.startsWith(":")).toBe(false)
            expect(seg.endsWith(":")).toBe(false)
          }
        }
      }),
    )
  })

  it("NO-MOVEMENT: on a tree with no `:` and no `%`, every key is still exactly `node.path`", () => {
    const tree: FileTree = {
      path: ".",
      children: [
        file("README.md", "# hi\n"),
        { path: "src", children: [file("src/app.ts"), { path: "src/m0", children: [file("src/m0/deep.ts")] }] },
      ],
    }
    const paths: string[] = []
    const walk = (n: FileTree): void => {
      paths.push(n.path)
      n.children.forEach(walk)
    }
    walk(tree)
    // teeth (breaks-on "the escape is applied where it is not needed — every subtreeHash in the repo moves"):
    expect(keysOf(axesOf(tree).spatial)).toEqual(paths)
  })
})
