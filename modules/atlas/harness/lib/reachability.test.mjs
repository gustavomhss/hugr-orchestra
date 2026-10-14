// harness/lib/reachability.test.mjs — the reference-model analyser's OWN teeth.
//
// The SEMANTICS of reachability: what counts as a caller, what a barrel does, and the value-vs-type split
// the whole gate turns on. The LEXING battery — regex literals, nested interpolations, comments hiding a
// brace, and the fail-closed tripwire — lives in reachability-lexing.test.mjs, because that is a different
// question (can we read TypeScript at all) with a different and much worse failure history.
//
// Two rules this file learned the hard way:
//
//   A fixture that cannot tell the fix from the bug is worse than none. One nested-template test here
//   passed under a mutant that deleted the very tracking it claimed to cover, because its import line sat
//   where the blanking parity worked out either way.
//
//   "Every branch has a killing mutant" is a claim, and it was FALSE when this file last asserted it —
//   three mutants survived the whole suite while leaving the real tree green, each a live fail-open. It is
//   not asserted here any more. What IS true is that every mutant run against this analyser is named in
//   the task record, including the ones that survived and the fixtures added to kill them.
//
// The fixture is a miniature workspace: `packages/<pkg>/src/**`, resolved exactly as the real tree is
// (`'./x.js'` → sibling `x.ts`, `'@atlas/pkg'` → that package's `src/index.ts`).

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { referenceModels, productionModules } from "./reachability.mjs"

let root

const pkg = (name, sources) => {
  const dir = join(root, "packages", name, "src")
  mkdirSync(dir, { recursive: true })
  for (const [file, body] of Object.entries(sources)) {
    const p = join(dir, file)
    mkdirSync(join(p, ".."), { recursive: true })
    writeFileSync(p, body)
  }
}
const models = () => referenceModels(join(root, "packages"))
const paths = () => models().map((m) => m.path)
const find = (p) => models().find((m) => m.path === p)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "reachability-"))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("value vs type reachability — the distinction the gate turns on", () => {
  it("a module VALUE-imported by another production module is NOT a reference model", () => {
    pkg("a", {
      "live.ts": "export function used(): number {\n  return 1;\n}\n",
      "caller.ts": "import { used } from './live.js';\nexport const n = used();\n",
    })
    expect(paths()).not.toContain("packages/a/src/live.ts")
  })

  it("a module reached ONLY by `import type` IS a reference model, but marked TYPE-REACHABLE", () => {
    pkg("a", {
      "model.ts": "export type Port = () => void;\nexport function build(): Port {\n  return () => undefined;\n}\n",
      "caller.ts": "import type { Port } from './model.js';\nexport const p: Port = () => undefined;\n",
    })
    const row = find("packages/a/src/model.ts")
    expect(row).toBeDefined()
    // Its declarations are a live contract; deleting it would break a real seam. That is why the ledger
    // records the flag rather than treating the module as unreferenced.
    expect(row.typeReachable).toBe(true)
    expect(row.values).toBe(1)
  })

  it("an INLINE `import { type X }` is type-only too — verbatimModuleSyntax spells it that way", () => {
    pkg("a", {
      "model.ts": "export type Port = () => void;\nexport function build(): Port {\n  return () => undefined;\n}\n",
      "caller.ts": "import { type Port } from './model.js';\nexport const p: Port = () => undefined;\n",
    })
    expect(find("packages/a/src/model.ts")?.typeReachable).toBe(true)
  })

  it("a module nothing references at all is a reference model that is NOT type-reachable", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": "export const n = 1;\n",
    })
    expect(find("packages/a/src/model.ts")?.typeReachable).toBe(false)
  })

  it("flipping ONE import from type-only to value moves the module out of the ledger entirely", () => {
    const model = "export function build(): number {\n  return 1;\n}\n"
    pkg("a", {
      "model.ts": model,
      "caller.ts": "import type { X } from './other.js';\nexport type Y = X;\n",
      "other.ts": "export type X = 1;\nexport const z = 1;\n",
    })
    writeFileSync(
      join(root, "packages/a/src/caller.ts"),
      "import type { build } from './model.js';\nexport type B = typeof build;\n",
    )
    expect(find("packages/a/src/model.ts")?.typeReachable).toBe(true)
    writeFileSync(
      join(root, "packages/a/src/caller.ts"),
      "import { build } from './model.js';\nexport const n = build();\n",
    )
    expect(find("packages/a/src/model.ts")).toBeUndefined()
  })
})

describe("the defects found while building it, each of which misreported a real module", () => {
  // DEFECT 1 — `\}\s*(?!from)` backtracks and always succeeds, so a barrel absorbed every re-exported
  // name as its own definition and the real defining module went dark. Reproduced end-to-end here: the
  // credit for the value import MUST land on `model.ts`, not on the barrel it travelled through.
  it("a named re-export credits the DEFINING module, not the barrel", () => {
    pkg("a", {
      "index.ts": "export { build } from './model.js';\n",
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
    })
    pkg("b", { "use.ts": "import { build } from '@atlas/a';\nexport const n = build();\n" })
    expect(paths()).not.toContain("packages/a/src/model.ts")
  })

  // DEFECT 2 — the barrel itself must never count as a CALLER. `export * from './model.js'` is a
  // forwarder; if it counted, every module in the repo would be trivially "used" and the check would
  // evaporate. This is the exact hiding place the whole finding was sitting in.
  it("`export * from` does NOT make the barrel a caller", () => {
    pkg("a", {
      "index.ts": "export * from './model.js';\n",
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
    })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  // DEFECT 3 — a module exporting only TYPES has no runtime surface at all, so "no value caller" says
  // nothing about it. Counting them buried the real findings under ~15 `types.ts` files.
  it("a type-only module is not a subject", () => {
    pkg("a", { "types.ts": "export type A = 1;\nexport interface B {\n  x: A;\n}\n" })
    expect(paths()).toEqual([])
  })
})

describe("limits the hand-written revisions had, which the real parser simply does not", () => {
  // Both of these were pinned here as KNOWN LIMITS asserting the WRONG-but-known answer. Moving to the
  // TypeScript API fixed them for free, and these two tests failing was how that was noticed.
  it("`export const A = 1, B = 2` counts as TWO value exports", () => {
    pkg("a", { "model.ts": "export const A = 1,\n  B = 2;\n" })
    expect(find("packages/a/src/model.ts")?.values).toBe(2)
  })

  it("a destructuring export counts every binding it introduces", () => {
    pkg("a", { "model.ts": "const src = { p: 1, q: 2 };\nexport const { p, q } = src;\n" })
    expect(find("packages/a/src/model.ts")?.values).toBe(2)
  })

  it("`export * as ns from` resolves to the whole target module", () => {
    pkg("a", {
      "index.ts": "export * as model from './model.js';\n",
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
    })
    pkg("b", { "use.ts": "import { model } from '@atlas/a';\nexport const n = model.build();\n" })
    expect(paths()).not.toContain("packages/a/src/model.ts") // genuinely called, and now seen to be
  })
})

describe("export and import FORMS — the six legs a mutation sweep found uncovered", () => {
  // These are not exotic. They are shapes the parser already handled correctly and the SUITE did not pin,
  // which is the more dangerous state: a regression in any of them is silent, and three of them starve
  // the fail-closed tripwire by leaving `exports.size > 0` or by misfiling a value as a type.
  const MODEL = "export function build(): number {\n  return 1;\n}\n"

  // M01 — a side-effect import binds nothing and must credit nothing.
  it("a side-effect-only import is NOT a caller", () => {
    pkg("a", { "model.ts": MODEL, "caller.ts": "import './model.js';\nexport const x = 1;\n" })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  // M10 — the per-element `type` flag on a RE-EXPORT, which degrades the binding to a type on the way
  // through. Without it a type-only forward would credit a value caller and hide a reference model.
  it("`export { type X } from` forwards a TYPE, not a value", () => {
    pkg("a", {
      "index.ts": "export { type Port, build } from './model.js';\n",
      "model.ts": "export type Port = () => void;\nexport function build(): number {\n  return 1;\n}\n",
    })
    pkg("b", { "use.ts": "import { Port } from '@atlas/a';\nexport type P = Port;\n" })
    const row = find("packages/a/src/model.ts")
    expect(row).toBeDefined() // `build` still has no value caller
    expect(row.typeReachable).toBe(true) // and the forwarded `Port` is a TYPE use
  })

  // M11 — the LOCAL `export { … }` list had ZERO coverage in either direction.
  it("a local `export { a, type B }` declares a value and a type", () => {
    pkg("a", {
      "model.ts": "function build(): number {\n  return 1;\n}\ntype Port = () => void;\nexport { build, type Port };\n",
    })
    const row = find("packages/a/src/model.ts")
    expect(row?.values).toBe(1) // `build` only — `Port` is a type
    expect(row?.names).toEqual(["build"])
  })

  it("a local `export { … }` is reachable by name from another module", () => {
    pkg("a", {
      "model.ts": "function build(): number {\n  return 1;\n}\nexport { build };\n",
      "caller.ts": "import { build } from './model.js';\nexport const n = build();\n",
    })
    expect(paths()).not.toContain("packages/a/src/model.ts")
  })

  // M16 — an enum is a runtime object. Filing it as a type drops the module out of the subject set.
  it("an `export enum` is a VALUE export", () => {
    pkg("a", { "model.ts": "export enum Colour {\n  Red = 1,\n}\n" })
    expect(find("packages/a/src/model.ts")?.values).toBe(1)
  })

  // M18 — `export namespace` emits an object too.
  it("an `export namespace` is a VALUE export", () => {
    pkg("a", { "model.ts": "export namespace N {\n  export const v = 1;\n}\n" })
    expect(find("packages/a/src/model.ts")?.values).toBe(1)
  })

  // M20 — `export type * from` degrades EVERY name it forwards, including values.
  it("`export type * from` degrades a forwarded VALUE to a type binding", () => {
    pkg("a", { "index.ts": "export type * from './model.js';\n", "model.ts": MODEL })
    pkg("b", { "use.ts": "import { build } from '@atlas/a';\nexport type B = typeof build;\n" })
    const row = find("packages/a/src/model.ts")
    expect(row).toBeDefined()
    expect(row.typeReachable).toBe(true)
  })
})

describe("scope", () => {
  it("barrels and entrypoints are never subjects — neither can have an in-tree caller", () => {
    pkg("a", { "index.ts": "export const x = 1;\n", "bin.ts": "export const y = 1;\n" })
    expect(paths()).toEqual([])
  })

  it("test-only packages are excluded — being consumed only by tests is their correct state", () => {
    pkg("e2e-blackbox", { "harness.ts": "export function runAtlas(): number {\n  return 1;\n}\n" })
    expect(paths()).toEqual([])
  })

  it("tests, declarations and build output are not production modules", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "model.test.ts": "import { build } from './model.js';\nexport const n = build();\n",
      "legacy.d.ts": "export declare function gone(): void;\n",
    })
    expect(productionModules(join(root, "packages"))).toHaveLength(1)
    // A test calling it does NOT make it shipped — that is the entire point of the finding.
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  it("`.claude` is never walked — it holds one full worktree copy PER SEAT", () => {
    pkg("a", { "model.ts": "export function build(): number {\n  return 1;\n}\n" })
    mkdirSync(join(root, "packages/a/src/.claude/worktrees/other/packages/a/src"), { recursive: true })
    writeFileSync(
      join(root, "packages/a/src/.claude/worktrees/other/packages/a/src/model.ts"),
      "export function build(): number {\n  return 2;\n}\n",
    )
    expect(productionModules(join(root, "packages"))).toHaveLength(1)
  })

  // DEFECT 4 — the one this task's OWN banners triggered. `packages/*/src` written inside a `//` line
  // contains the byte pair `/` `*`; block-stripping before line-stripping opened a phantom comment that ran
  // to the next real `*` `/` and ate the entire import list below it. Three modules lost their measured
  // type-reachability in that run and the gate reported them misclassified.
  it("`/*` inside a LINE comment does not swallow the imports beneath it", () => {
    pkg("a", {
      "model.ts": "export type Port = () => void;\nexport function build(): Port {\n  return () => undefined;\n}\n",
      "caller.ts":
        "// Nothing in packages/*/src calls this.\n" +
        "import type { Port } from './model.js';\n" +
        "/** a real block comment, closing here. */\nexport const p: Port = () => undefined;\n",
    })
    expect(find("packages/a/src/model.ts")?.typeReachable).toBe(true)
  })

  it("`/*` inside a STRING literal does not open a comment either", () => {
    pkg("a", {
      "model.ts": "export type Port = () => void;\nexport function build(): Port {\n  return () => undefined;\n}\n",
      "caller.ts":
        "export const GLOB = 'packages/*/src';\n" +
        "import type { Port } from './model.js';\n" +
        "/** closes here. */\nexport const p: Port = () => undefined;\n",
    })
    expect(find("packages/a/src/model.ts")?.typeReachable).toBe(true)
  })

  it("a comment that NAMES an export is not an import — prose must not create edges", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": "// This module deliberately does not call `build` from './model.js'.\nexport const n = 1;\n",
    })
    expect(paths()).toContain("packages/a/src/model.ts")
  })
})
