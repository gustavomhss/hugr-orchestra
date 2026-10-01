// harness/lib/reachability-lexing.test.mjs — the LEXING regression battery.
//
// Split out of reachability.test.mjs, which the semantics of reachability already fill. This file is about
// one thing: reading TypeScript correctly. Three successive hand-written scanners each shipped a FAIL-OPEN
// here — a genuinely dead module vanishing from the ledger while the gate printed OK — and each fix was
// right about its case and wrong about its class:
//
//   1. block comments stripped before line comments (a `//` line containing the pair `/` `*`)
//   2. one `${` depth counter (a `}` from an object literal ended the template early)
//   3. regex literals (a backtick, a `/*`, or a `}` inside one)
//
// `reachability.mjs` now delegates lexing to the TypeScript compiler, so none of these is its problem any
// more. The fixtures stay anyway: they OUTLIVED the scanner they were written against, and they are the
// regression suite for whatever parses this tree next. Ground truth for every one was established by
// EXECUTING it in node — whether an `import` line is code or inert text is a fact, not an opinion.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { referenceModels, productionModules, analyse } from "./reachability.mjs"

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

describe("fail-open holes a cold review invented, now closed", () => {
  // F1 — a multi-line TEMPLATE literal puts its embedded text at column 0, satisfying the `^\s*import`
  // anchor. This exact fixture made a genuinely dead `model.ts` VANISH from the output: the phantom edge
  // made it look live, and the gate would have said OK while a reference model went unregistered.
  it("a multi-line template containing an import line does NOT manufacture an edge", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": 'export const HELP = `\nimport { build } from "./model.js";\n`;\n',
    })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  // The FIRST version of this test was VACUOUS — a cold review deleted the interpolation tracking
  // outright and all 23 tests stayed green, because its import line sat OUTSIDE the inner template and the
  // blanking parity happened to work out either way. The import must land INSIDE the inner template: then
  // an untracked `${` lets the inner backtick close the OUTER template and the line becomes live code.
  it("a template nested inside an interpolation does not close its parent early", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": 'export const H = `a ${`\nimport { build } from "./model.js";\n`} b`;\n',
    })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  // F-1, round 2: the first fix used ONE counter that incremented on `${` and decremented on ANY `}`, so a
  // brace from an object literal inside an interpolation drove it to zero and the next backtick closed the
  // outer template. The same fail-open, reachable by a different route. Nesting is a stack now.
  it("a brace from an object literal inside an interpolation does not end the template", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": 'export const H = `a ${ `b ${({}).x}` } c\nimport { build } from "./model.js";\n`;\n',
    })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  it("a block body inside an interpolation does not end the template either", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": 'export const H = `a ${ (() => { return `z`; })() } c\nimport { build } from "./model.js";\n`;\n',
    })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  // The two above still pass if `}` is made to pop the interpolation unconditionally: an extra backtick
  // later re-syncs the parity by accident. To DISCRIMINATE, the object brace must come first and the
  // import must sit inside a template opened AFTER it — then a premature pop leaves the import at top
  // level as real code. Same shape for a brace hidden in a string, which is why strings are consumed
  // inside interpolations rather than blanked character by character.
  it("a premature `}` cannot expose a later nested template as top-level code", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": 'export const H = `a ${ {}.k + `\nimport { build } from "./model.js";\n` } b`;\n',
    })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  it("a `}` inside a STRING inside an interpolation does not close it", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": 'export const H = `a ${ "}" + `\nimport { build } from "./model.js";\n` } b`;\n',
    })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  // ESCAPES are load-bearing in BOTH literal kinds and had no test at all; each mutant below survived the
  // whole suite. An unhandled escape lets a literal end early, and whatever follows is read as code.
  it("an ESCAPED backtick does not close a template", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": 'export const H = `a \\` b\nimport { build } from "./model.js";\n`;\n',
    })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  it("an ESCAPED quote does not close a quoted string", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      // If the string ends early at `\"`, the stray backtick opens a template that swallows the REAL
      // import on the next line and `model.ts` is wrongly reported dead.
      "caller.ts": 'export const S = "a \\" ` b";\nimport { build } from \'./model.js\';\nexport const n = build();\n',
    })
    expect(paths()).not.toContain("packages/a/src/model.ts")
  })

  it("blanking templates does not blind the scanner to REAL imports around them", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": "export const H = `multi\nline`;\nimport { build } from './model.js';\nexport const n = build();\n",
    })
    expect(paths()).not.toContain("packages/a/src/model.ts")
  })

  // F2 — `export default` was invisible: the module had zero value exports, was never a subject, and so a
  // default-exported reference model could never trip leg (1). The gate's whole stated job is "nothing
  // stops a fifth one"; a default-exported fifth one walked straight through.
  it("a DEFAULT-exported dead module is a reference model", () => {
    pkg("a", { "model.ts": "export default function build(): number {\n  return 1;\n}\n" })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  // `export default function f()` and `export default <expression>` are DIFFERENT AST nodes — a modifier
  // on a declaration versus an ExportAssignment. Covering only the first left the second unpinned: the
  // mutant that deletes it survived the whole suite and left the real tree green.
  it("`export default <expression>` is a value export too", () => {
    pkg("a", { "model.ts": "const impl = { run: () => 1 };\nexport default impl;\n" })
    expect(find("packages/a/src/model.ts")?.values).toBe(1)
  })

  it("a NAMESPACE import takes the whole module, values included", () => {
    pkg("a", {
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
      "caller.ts": "import * as m from './model.js';\nexport const n = m.build();\n",
    })
    expect(paths()).not.toContain("packages/a/src/model.ts")
  })

  it("a DEFAULT-exported module that IS default-imported is live", () => {
    pkg("a", {
      "model.ts": "export default function build(): number {\n  return 1;\n}\n",
      "caller.ts": "import build from './model.js';\nexport const n = build();\n",
    })
    // Asserted on the ROW, not on absence from the list: without the `export default` pattern the module
    // has no value exports at all, is not a subject, and "absent from the list" would pass vacuously.
    const row = analyse(join(root, "packages")).find((r) => r.path === "packages/a/src/model.ts")
    expect(row?.valueExports).toEqual(["default"])
    expect(row?.valueCallers).toEqual([join(root, "packages/a/src/caller.ts")])
  })

  // A RENAMING re-export used to break the chain: the barrel forwards `make`, the target declares `build`,
  // and following the chain without translating the name lost the edge and reported a called module dead.
  it("a renaming re-export still credits the declaring module", () => {
    pkg("a", {
      "index.ts": "export { build as make } from './model.js';\n",
      "model.ts": "export function build(): number {\n  return 1;\n}\n",
    })
    pkg("b", { "use.ts": "import { make } from '@atlas/a';\nexport const n = make();\n" })
    expect(paths()).not.toContain("packages/a/src/model.ts")
  })
})

describe("LEXING — the class of hole that killed three hand-written revisions", () => {
  // Ground truth for every fixture below was established by EXECUTING it in node: whether the `import`
  // line is real code or inert text is a fact about the language, not a matter of opinion about a regex.
  const MODEL = "export function build(): number {\n  return 1;\n}\n"
  const IMP = 'import { build } from "./model.js";'

  // A regex literal is the third lexing hole. `` /`/g `` opened an unterminated template frame in the
  // hand scanner and swallowed the REAL import below it — a live module reported dead.
  it("a regex literal containing a backtick does not open a template", () => {
    pkg("a", { "model.ts": MODEL, "caller.ts": "export const B = /`/g;\n" + IMP + "\nexport const n = build();\n" })
    expect(paths()).not.toContain("packages/a/src/model.ts")
  })

  it("a regex literal containing `/*` does not open a block comment", () => {
    pkg("a", { "model.ts": MODEL, "caller.ts": "export const S = /a\\/*b/;\n" + IMP + "\nexport const n = build();\n" })
    expect(paths()).not.toContain("packages/a/src/model.ts")
  })

  // …and the FAIL-OPEN direction: a regex containing `}` inside an interpolation reopened the exact hole
  // the previous fix had just closed. Here the import IS inert text, so the module is genuinely dead.
  it("a regex containing `}` inside an interpolation does not end the template", () => {
    pkg("a", {
      "model.ts": MODEL,
      "caller.ts": 'export const H = `a ${ "x".replace(/}/g, "") + `\n' + IMP + "\n` } b`;\n",
    })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  // These three were answered CORRECTLY by the hand scanner but pinned by NO fixture — each mutant
  // survived the whole suite while leaving the real tree at 54, so the gate stayed green on a fail-open.
  it("a LINE comment inside an interpolation hides its `}`", () => {
    pkg("a", { "model.ts": MODEL, "caller.ts": "export const H = `a ${ 1 // }\n+ `\n" + IMP + "\n` } b`;\n" })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  it("a BLOCK comment inside an interpolation hides its `}`", () => {
    pkg("a", { "model.ts": MODEL, "caller.ts": "export const H = `a ${ 1 /* } */ + `\n" + IMP + "\n` } b`;\n" })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  it("a backtick inside an interpolation opens a NESTED template", () => {
    pkg("a", { "model.ts": MODEL, "caller.ts": "export const H = `a ${ `}` } b\n" + IMP + "\n`;\n" })
    expect(paths()).toContain("packages/a/src/model.ts")
  })

  // The never-pop mutant was caught only by the real tree (54→60) and by no fixture, because no fixture
  // put a LIVE import after a completed interpolation. This one does.
  it("an interpolation that ENDS lets the code after it be read normally", () => {
    pkg("a", {
      "model.ts": MODEL,
      "caller.ts": "export const H = `a ${ 1 } b`;\n" + IMP + "\nexport const n = build();\n",
    })
    expect(paths()).not.toContain("packages/a/src/model.ts")
  })
})

describe("the fail-closed tripwire", () => {
  // Every historical fail-open worked by making a module look export-less: it fell out of the subject set
  // and the gate printed OK. Two tripwires now stand between that and a silent drop, and BOTH are keyed on
  // the AST rather than on raw text — the previous text-keyed version let LAYOUT decide whether a drop was
  // loud, and false-positived on three legal shapes that compile clean.
  it("THROWS on an export form no branch recognises — whatever the layout", () => {
    pkg("a", { "model.ts": "export function build(): number {\n  return 1;\n}\n" })
    // `export import X = ns.Y` emits `export var X` and matches no branch. On its own line the OLD
    // text-keyed tripwire caught it; on a shared line it did not, and the module vanished silently.
    writeFileSync(
      join(root, "packages/a/src/eq.ts"),
      "namespace I { export const v = 1; }\nconst k = 2; export import A = I.v;\nvoid k;\n",
    )
    expect(() => paths()).toThrow(/UNRECOGNISED EXPORT/)
  })

  it("THROWS on source the parser could not read", () => {
    pkg("a", { "model.ts": "export function build(): number {\n  return 1;\n}\n" })
    writeFileSync(join(root, "packages/a/src/broken.ts"), "export\n")
    expect(() => paths()).toThrow(/UNPARSEABLE/)
  })

  // The text-keyed tripwire fired on all three of these. Each compiles clean and exports nothing; a gate
  // that dies on `export {};` is a gate someone deletes.
  it("does NOT fire on `export {};` — the idiomatic module marker", () => {
    pkg("a", { "m.ts": "export {};\nconst x = 1;\nvoid x;\n" })
    expect(() => paths()).not.toThrow()
  })

  it("does NOT fire on a commented-out export", () => {
    pkg("a", { "m.ts": "/*\nexport const gone = 1;\n*/\nconst x = 1;\nvoid x;\n" })
    expect(() => paths()).not.toThrow()
  })

  it("does NOT fire on a template literal holding a line-initial `export`", () => {
    pkg("a", { "m.ts": "const T = `\nexport const inTemplate = 1;\n`;\nvoid T;\n" })
    expect(() => paths()).not.toThrow()
  })
})
