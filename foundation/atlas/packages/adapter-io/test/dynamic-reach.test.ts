// @atlas/adapter-io — test/dynamic-reach.test.ts  (ADR-0016 M2b — the `dynamicReach` assembler)
//
// TEETH for the door-local opaque-channel scan the negation door's v2 gate consumes. Over a synthetic
// `FileTree` it asserts:
//   · each of the FIVE channels surfaces as a witness — `import(nonliteral)`, `require(nonliteral)`,
//     `ns[nonliteral]` on a namespace-import binding, `eval(...)`, `new Function(...)`;
//   · a file with a LITERAL `import('./x')` / `require('./x')` (and a literal `ns['x']`) yields NO channel —
//     a statically-resolvable specifier is not a dynamic reach;
//   · `dynamicReach(scope)` unions ONLY the files UNDER `scope` (same `underScope` containment the door uses);
//   · FAIL-CLOSED — a TS file that will not parse is ITSELF a witness (never a silent skip);
//   · the SOUND degrade — `undefined` when the AST grammars are not warmed.
// MUTANT for each: delete the matching branch in `scanChannels` ⇒ the channel's `expect(...).toContain` flips.

import { describe, it, expect, beforeAll } from "vitest"
import type { FileTree } from "@atlas/index"
import { initAst } from "../src/ast.js"
import { buildDynamicReach } from "../src/escape/dynamic-reach.js"

const leaf = (path: string, content: string): FileTree => ({ path, children: [], content })
const dir = (path: string, children: FileTree[]): FileTree => ({ path, children })

// One file per channel, plus a literal-only file (no channel) and a non-TS file (skipped, not fail-closed).
const CH_IMPORT = "const k = spec;\nexport const a = import(k);\n" // import(nonliteral)
const CH_REQUIRE = "const m = req;\nexport const b = require(m);\n" // require(nonliteral)
const CH_NS = "import * as ns from './m';\nexport const c = ns[key]();\n" // ns[nonliteral]
const CH_EVAL = "export const d = eval(userInput);\n" // eval(...)
const CH_FUNCTION = "export const e = new Function('return 1');\n" // new Function(...)
const LITERAL_ONLY =
  "import * as ns from './m';\n" +
  "export const f = import('./x');\n" + // literal specifier ⇒ NOT a channel
  "export const g = require('./y');\n" + // literal specifier ⇒ NOT a channel
  "export const h = ns['known']();\n" // literal member ⇒ NOT a channel

function tree(): FileTree {
  return dir(".", [
    dir("src", [
      dir("pay", [
        leaf("src/pay/imp.ts", CH_IMPORT),
        leaf("src/pay/req.ts", CH_REQUIRE),
        leaf("src/pay/ns.ts", CH_NS),
        leaf("src/pay/ev.ts", CH_EVAL),
        leaf("src/pay/fn.ts", CH_FUNCTION),
        leaf("src/pay/clean.ts", LITERAL_ONLY),
      ]),
      dir("other", [leaf("src/other/dyn.ts", CH_EVAL)]), // a channel OUTSIDE src/pay
    ]),
    dir("api", [leaf("api/service.py", "def compute():\n    return 42\n")]), // non-TS ⇒ never a channel
  ])
}

describe("ADR-0016 M2b — buildDynamicReach (the five opaque-dispatch channels)", () => {
  beforeAll(async () => {
    await initAst()
  })

  it("each of the five channels surfaces as a witness under its file", () => {
    const dyn = buildDynamicReach(tree())!
    const all = dyn("src")
    expect(all.some((w) => w.startsWith("src/pay/imp.ts") && w.endsWith("import-nonliteral"))).toBe(true)
    expect(all.some((w) => w.startsWith("src/pay/req.ts") && w.endsWith("require-nonliteral"))).toBe(true)
    expect(all.some((w) => w.startsWith("src/pay/ns.ts") && w.endsWith("ns-escape"))).toBe(true)
    expect(all.some((w) => w.startsWith("src/pay/ev.ts") && w.endsWith("eval"))).toBe(true)
    expect(all.some((w) => w.startsWith("src/pay/fn.ts") && w.endsWith("new-Function"))).toBe(true)
  })

  it("a file with only LITERAL import/require/ns[...] specifiers yields NO channel", () => {
    const dyn = buildDynamicReach(tree())!
    // clean.ts contributes nothing — every one of its constructs has a statically-resolvable specifier.
    expect(dyn("src").some((w) => w.startsWith("src/pay/clean.ts"))).toBe(false)
  })

  it("dynamicReach(scope) unions ONLY files UNDER scope (the underScope containment the door uses)", () => {
    const dyn = buildDynamicReach(tree())!
    const inPay = dyn("src/pay")
    // src/other/dyn.ts has an eval channel but is NOT under src/pay ⇒ excluded.
    expect(inPay.some((w) => w.startsWith("src/other/"))).toBe(false)
    expect(inPay.length).toBeGreaterThan(0)
    // The wider scope DOES see it — so the exclusion above is containment, not absence.
    expect(dyn("src").some((w) => w.startsWith("src/other/dyn.ts") && w.endsWith("eval"))).toBe(true)
    // A scope with NO channel-bearing file returns [] ("scanned, found none"), never a silent skip.
    expect(dyn("api")).toEqual([])
  })

  it(
    "channel #3 HARDENED (cold-review): a namespace binding that ESCAPES as a value is a channel, in EVERY " +
      "form beyond the syntactic ns[k] — passed as an argument, computed-destructured — while a SAFE static " +
      "ns.member / ns[literal] access is NOT (recall preserved). MUTANT: revert to the ns[nonliteral]-only " +
      "subscript check ⇒ the arg/destructure forms return no channel (the false-admit lucy widened)",
    () => {
      const NS_ARG = "import * as ns from './m';\nexport const a = Reflect.get(ns, k);\n" // ns passed as arg
      const NS_DESTRUCT = "import * as ns from './m';\nconst { [k]: fn } = ns;\nexport const b = fn;\n" // computed
      const NS_SAFE = "import * as ns from './m';\nexport const c = ns.known();\nexport const d = ns['lit'];\n" // safe
      const t = dir(".", [
        dir("s", [leaf("s/arg.ts", NS_ARG), leaf("s/de.ts", NS_DESTRUCT), leaf("s/safe.ts", NS_SAFE)]),
      ])
      const dyn = buildDynamicReach(t)!
      const w = dyn("s")
      expect(w.some((x) => x.startsWith("s/arg.ts") && x.endsWith("ns-escape"))).toBe(true) // Reflect.get(ns,k)
      expect(w.some((x) => x.startsWith("s/de.ts") && x.endsWith("ns-escape"))).toBe(true) // const {[k]:fn}=ns
      expect(w.some((x) => x.startsWith("s/safe.ts"))).toBe(false) // ns.known() / ns['lit'] stay SAFE (recall)
    },
  )

  it(
    "channel #2/#4 HARDENED: require/eval reached via a MEMBER callee (module.require / globalThis.eval) is a " +
      'channel, not only the bare identifier form. MUTANT: match only `fn.type==="identifier"` ⇒ these escape',
    () => {
      const MEMBER = "export const a = module.require(spec);\nexport const b = globalThis.eval(src);\n"
      const dyn = buildDynamicReach(dir(".", [dir("s", [leaf("s/m.ts", MEMBER)])]))!
      const w = dyn("s")
      expect(w.some((x) => x.startsWith("s/m.ts") && x.endsWith("require-nonliteral"))).toBe(true)
      expect(w.some((x) => x.startsWith("s/m.ts") && x.endsWith("eval"))).toBe(true)
    },
  )

  it(
    "JS-FAMILY FAIL-CLOSED (cold-review #1): a .cjs/.mjs/.js/.jsx file under scope is a channel witness (this " +
      "door parses only TS, and a JS file CAN host every construct) — NOT silently skipped. A genuinely " +
      "other-language .py file is still skipped. MUTANT: `continue` on every non-TS path ⇒ the .cjs returns nothing",
    () => {
      const t = dir(".", [
        dir("s", [leaf("s/legacy.cjs", "module.exports = require(process.env.MOD);\n"), leaf("s/x.py", "pass\n")]),
      ])
      const dyn = buildDynamicReach(t)!
      const w = dyn("s")
      expect(w.some((x) => x.startsWith("s/legacy.cjs") && x.endsWith("js-unscanned"))).toBe(true) // fail-closed
      expect(w.some((x) => x.startsWith("s/x.py"))).toBe(false) // .py cannot host a JS channel ⇒ skipped
    },
  )

  it("FAIL-CLOSED: a TS file that will not parse is itself a channel witness (never a silent skip)", () => {
    // A deliberately broken TS file (unbalanced) — tree-sitter yields an error tree ⇒ parseTsDoc undefined ⇒
    // the assembler records the file as a channel rather than treating "did not scan" as "no channel".
    const broken = dir(".", [dir("src", [leaf("src/broken.ts", "export function (( {\n")])])
    const dyn = buildDynamicReach(broken)!
    expect(dyn("src").some((w) => w.startsWith("src/broken.ts") && w.endsWith("unparsed"))).toBe(true)
  })
})
