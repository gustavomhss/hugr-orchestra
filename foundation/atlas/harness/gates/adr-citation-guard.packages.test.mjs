// harness/gates/adr-citation-guard.packages.test.mjs — the TEETH of the CODE corpus (#192).
//
// The sibling twin `adr-citation-guard.test.mjs` owns the `docs/**` legs. This file owns the second corpus
// the guard gained in #192: `packages/**/*.ts`, the A4 fixture exclusion, and the two anti-vacuity refusals
// that came with them (A-4, A-5).
//
// WHY IT IS A SEPARATE FILE AND NOT MORE OF THE FIRST. The combined twin measured 414 lines against the
// repo's 400-LOC ceiling (`godfile-guard.mjs`, which walks `harness/**/*.mjs` too). Splitting by CORPUS is
// the seam the subject already has — the gate reads two trees and refuses on each independently — so the
// split is along the same line the code is, not an arbitrary cut to get under a number.
//
// The exclusion is checked in BOTH directions on purpose. A rule that only ever excludes is indistinguishable
// from a rule that excludes everything, and the danger here is not a fixture that gets scanned: it is a real
// citation that hides in a file whose NAME merely suggests it is a fixture. Two files in the live tree
// (`packages/cli/test/mine-fixtures.ts`, `packages/adapter-io/test/harness/governed-fixtures.ts`) carry real
// `ADR-0008` citations, so a name-based rule would have bought this exclusion by dropping them.
//
// Exit codes come from `execFileSync`'s thrown `status`, never a shell pipeline.

import { describe, it, expect, afterAll } from "vitest"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  adr,
  cleanDocs,
  excludedCount,
  pkgFile,
  refusal,
  reported,
  runGate,
  scratchPool,
} from "../lib/adr-citation-fixtures.mjs"

const GATE = join(dirname(fileURLToPath(import.meta.url)), "adr-citation-guard.mjs")

const pool = scratchPool()
const scratch = () => pool.scratch()
const run = (root) => runGate(GATE, root)
afterAll(() => pool.cleanup())

describe("adr-citation-guard — the CODE corpus (#192): packages/**/*.ts is actually swept", () => {
  it("a dangling citation in packages/**/src IS found — the hole #192 closed", () => {
    const root = scratch()
    cleanDocs(root)
    pkgFile(root, "tools/src/handler.ts", "// see ADR-0042 for the rationale\nexport const x = 1;\n")
    const { code, out } = run(root)
    expect(code).toBe(1)
    // reported with its packages-relative path and its LINE, exactly as a docs citation would be
    expect(reported(out)).toEqual(["packages/tools/src/handler.ts:1 → ADR-0042"])
  })

  it("a dangling citation in a packages TEST file is found too — tests are not exempt", () => {
    const root = scratch()
    cleanDocs(root)
    pkgFile(root, "tools/test/handler.test.ts", 'describe("ADR-0043 behaviour", () => {});\n')
    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(reported(out)).toEqual(["packages/tools/test/handler.test.ts:1 → ADR-0043"])
  })

  it("a RESOLVING citation in code is not reported, and the code leg is counted in the banner", () => {
    const root = scratch()
    cleanDocs(root)
    pkgFile(root, "tools/src/handler.ts", "// ADR-0001 governs this door\nexport const x = 1;\n")
    const { code, out } = run(root)
    expect(code, out).toBe(0)
    expect(out).toMatch(/\(\d+ docs\/\*\*\/\*\.md \+ 1 packages\/\*\*\/\*\.ts\)/) // the file WAS in the sweep
  })

  it("`.d.ts` is NOT read (generated), so a citation inside one cannot fail the build", () => {
    const root = scratch()
    cleanDocs(root)
    pkgFile(root, "tools/src/gen.d.ts", "// ADR-0042\nexport declare const x: number;\n")
    pkgFile(root, "tools/src/real.ts", "export const x = 1;\n")
    const { code, out } = run(root)
    expect(code, out).toBe(0)
    expect(out).toMatch(/\+ 1 packages\/\*\*\/\*\.ts\)/) // only `real.ts` — the `.d.ts` was never a corpus member
  })

  it("`dist/` and `node_modules/` are never descended", () => {
    const root = scratch()
    cleanDocs(root)
    pkgFile(root, "tools/dist/leaked.ts", "// ADR-0042\n")
    pkgFile(root, "tools/node_modules/dep/index.ts", "// ADR-0043\n")
    pkgFile(root, "tools/src/real.ts", "export const x = 1;\n")
    const { code, out } = run(root)
    expect(code, out).toBe(0)
    expect(out).toMatch(/\+ 1 packages\/\*\*\/\*\.ts\)/)
  })
})

describe("adr-citation-guard — the A4 fixture exclusion, in BOTH directions", () => {
  it("EXCLUDES exactly `packages/<pkg>/test/fixtures/**` — a refusal fixture may name an absent ADR", () => {
    const root = scratch()
    cleanDocs(root)
    pkgFile(root, "tools/src/real.ts", "export const x = 1;\n")
    pkgFile(root, "tools/test/fixtures/dangling.ts", 'export const FAKE = "ADR-0042";\n')
    const { code, out } = run(root)
    expect(code, out).toBe(0)
    // and it SAYS so — an exclusion nobody can see is a hiding place
    expect(excludedCount(out)).toBe(1)
    expect(out).toContain("packages/tools/test/fixtures/dangling.ts")
  })

  it("does NOT exclude a file merely NAMED `*-fixtures.ts` (a filename is not a path segment)", () => {
    // The measured trap: `packages/cli/test/mine-fixtures.ts` and
    // `packages/adapter-io/test/harness/governed-fixtures.ts` carry REAL ADR-0008 citations in the live
    // tree, so a name-based rule would have dropped two real citations to buy this exclusion.
    const root = scratch()
    cleanDocs(root)
    pkgFile(root, "cli/test/mine-fixtures.ts", 'export const FAKE = "ADR-0042";\n')
    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(reported(out)).toEqual(["packages/cli/test/mine-fixtures.ts:1 → ADR-0042"])
    expect(excludedCount(out)).toBe(0)
  })

  it("does NOT exclude `src/`, at any depth, even under a directory literally named `fixtures`", () => {
    const root = scratch()
    cleanDocs(root)
    pkgFile(root, "tools/src/fixtures/sneaky.ts", 'export const FAKE = "ADR-0042";\n')
    const { code, out } = run(root)
    expect(code).toBe(1) // `test` is not in this path — production code can never opt out
    expect(reported(out)).toEqual(["packages/tools/src/fixtures/sneaky.ts:1 → ADR-0042"])
  })

  it("does NOT exclude a NESTED fixtures dir (`test/harness/fixtures/`) — the segment shape is exact", () => {
    const root = scratch()
    cleanDocs(root)
    pkgFile(root, "tools/src/real.ts", "export const x = 1;\n")
    pkgFile(root, "tools/test/harness/fixtures/deep.ts", 'export const FAKE = "ADR-0042";\n')
    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(reported(out)).toEqual(["packages/tools/test/harness/fixtures/deep.ts:1 → ADR-0042"])
  })
})

describe("adr-citation-guard — anti-vacuity for the CODE corpus", () => {
  it("A-4 — packages/ missing, with a complete and clean docs half", () => {
    const root = scratch()
    adr(root, "0001", "exists")
    writeFileSync(join(root, "docs", "note.md"), "ADR-0001 is cited here.\n")
    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(refusal(out)).toBe("A-4") // NOT a silent pass on a corpus half that does not exist
  })

  it("A-5 — packages/ exists but the *.ts walk is EMPTY", () => {
    const root = scratch()
    adr(root, "0001", "exists")
    writeFileSync(join(root, "docs", "note.md"), "ADR-0001 is cited here.\n")
    mkdirSync(join(root, "packages", "tools", "src"), { recursive: true })
    writeFileSync(join(root, "packages", "tools", "package.json"), "{}\n") // present, but not a corpus member
    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(refusal(out)).toBe("A-5")
  })

  it("A-5 — the EXCLUSION emptying the corpus is a refusal, not a vacuous pass", () => {
    // The failure mode a post-exclusion check exists to stop: if the fixture door ever widened until it
    // swallowed every code file, a pre-exclusion check would print OK over a sweep of nothing.
    const root = scratch()
    adr(root, "0001", "exists")
    writeFileSync(join(root, "docs", "note.md"), "ADR-0001 is cited here.\n")
    pkgFile(root, "tools/test/fixtures/only.ts", 'export const FAKE = "ADR-0042";\n')
    const { code, out } = run(root)
    expect(code).toBe(1)
    expect(refusal(out)).toBe("A-5")
    expect(out).toMatch(/1 found, 1 excluded/) // the refusal shows BOTH numbers, so the cause is legible
  })

  it("all SIX refusal codes are distinct and reachable (no branch is dead)", () => {
    const mk = (build) => {
      const r = scratch()
      build(r)
      return r
    }
    const goodDocs = (r) => {
      adr(r, "0001", "exists")
      writeFileSync(join(r, "docs", "note.md"), "ADR-0001 here.\n")
    }
    const roots = [
      mk(() => {}), //                                                                A-0 docs/ missing
      mk((r) => {
        mkdirSync(join(r, "docs"), { recursive: true })
        writeFileSync(join(r, "docs", "x.md"), "x\n")
      }), //                                                                          A-2 docs/adr/ missing
      mk((r) => mkdirSync(join(r, "docs", "adr"), { recursive: true })), //            A-1 docs walk empty
      mk((r) => {
        mkdirSync(join(r, "docs", "adr"), { recursive: true })
        writeFileSync(join(r, "docs", "x.md"), "x\n")
      }), //                                                                          A-3 empty ADR index
      mk(goodDocs), //                                                                A-4 packages/ missing
      mk((r) => {
        goodDocs(r)
        mkdirSync(join(r, "packages"), { recursive: true })
      }), //                                                                          A-5 code walk empty
    ]
    expect(roots.map((r) => refusal(run(r).out))).toEqual(["A-0", "A-2", "A-1", "A-3", "A-4", "A-5"])
  })
})
