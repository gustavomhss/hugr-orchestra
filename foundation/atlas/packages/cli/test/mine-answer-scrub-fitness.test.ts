// @atlas/cli — test/mine-answer-scrub-fitness.test.ts  (#195 b / #121 — SCRUB DOMINATES the new CAS put site)
//
// The DoD item leg (b) carries: "extend the scrubber-coverage fitness function (#121) to the new put() call
// site." #121's own analyser (`@atlas/persist` `auditTranscriptDoor`) is structurally bound to the transcript
// store's backing `Map` — its rules are `map.set(k, v)` shapes — so it cannot be LITERALLY pointed at a CAS
// `store.put()` / `id()` site. This is its SIBLING, in the same spirit and citing the same law: a STRUCTURAL,
// fail-closed AST audit of `mine-answer.ts` proving the object that becomes the stored CAS bytes (`answerRef`'s
// preimage, and the returned `obj`) PROVABLY flows from `scrub(...)`. A behavioural test proves `scrub` runs on
// ONE input; only this proves there is no path in that skips it — which is the property billy hunts (a
// secret-bearing answer reaching CAS unscrubbed). Fail-closed: an origin that cannot be resolved is a VIOLATION,
// never a pass, so the analyser's failure mode is a false ALARM on a refactor, never a false CLEAR on a leak.

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import ts from "typescript"

const SCRUB = "scrub"
const CAS_ID = "id"

interface ScrubViolation {
  readonly rule: "NO-SCRUB" | "CAS-ID-NOT-SCRUBBED" | "STORED-OBJECT-NOT-SCRUBBED"
  readonly detail: string
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  node.forEachChild((c) => walk(c, visit))
}

/** Does `expr` provably flow from a bare `scrub(...)` call — directly, or through a chain of resolvable const
 *  initializers? A parameter / import / unresolvable identifier terminates the walk as NOT-PROVEN (fail-closed),
 *  which is exactly the shape of the leak this rule catches: `obj = rawAnswer` where `rawAnswer` is the raw arg. */
function flowsFromScrub(expr: ts.Expression, inits: ReadonlyMap<string, ts.Expression>, depth = 0): boolean {
  if (depth > 8) return false
  let direct = false
  walk(expr, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === SCRUB) direct = true
  })
  if (direct) return true
  let proven = false
  walk(expr, (n) => {
    if (proven || !ts.isIdentifier(n)) return
    if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return // skip `.member`
    const init = inits.get(n.text)
    if (init !== undefined && flowsFromScrub(init, inits, depth + 1)) proven = true
  })
  return proven
}

/** Audit a mine-answer module: (1) it calls `scrub`; (2) every `id(x)` preimage (⇒ `answerRef`) flows from
 *  scrub; (3) the returned `obj` property (⇒ the stored CAS bytes) flows from scrub. Pure: source in, violations
 *  out — so it points at the REAL shipped file AND at deliberately broken variants in one suite. */
export function auditAnswerScrub(source: string, fileName = "mine-answer.ts"): readonly ScrubViolation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const violations: ScrubViolation[] = []
  const inits = new Map<string, ts.Expression>()
  walk(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer !== undefined)
      inits.set(n.name.text, n.initializer)
  })

  let hasScrub = false
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === SCRUB) hasScrub = true
  })
  if (!hasScrub)
    violations.push({
      rule: "NO-SCRUB",
      detail: "no bare `scrub(...)` call — the credential control at the CAS boundary is gone",
    })

  // (2) the CAS id preimage — the value that BECOMES `answerRef` — must be scrubbed.
  walk(sf, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === CAS_ID &&
      n.arguments.length >= 1
    ) {
      const arg = n.arguments[0]!
      if (!flowsFromScrub(arg, inits)) {
        violations.push({
          rule: "CAS-ID-NOT-SCRUBBED",
          detail: `id(${arg.getText(sf)}) — the CAS id (answerRef) is minted over bytes not provably from \`scrub(...)\``,
        })
      }
    }
  })

  // (3) the returned `obj` — the bytes actually stored via the pass's `put` array — must be scrubbed.
  walk(sf, (n) => {
    if (!ts.isReturnStatement(n) || n.expression === undefined || !ts.isObjectLiteralExpression(n.expression)) return
    for (const p of n.expression.properties) {
      let name: string | undefined
      let value: ts.Expression | undefined
      if (ts.isShorthandPropertyAssignment(p)) {
        name = p.name.text
        value = p.name
      } else if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
        name = p.name.text
        value = p.initializer
      }
      if (name === "obj" && value !== undefined && !flowsFromScrub(value, inits)) {
        violations.push({
          rule: "STORED-OBJECT-NOT-SCRUBBED",
          detail: `the stored CAS object \`obj = ${value.getText(sf)}\` is not provably from \`scrub(...)\``,
        })
      }
    }
  })

  return violations
}

const REAL = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/mine-answer.ts"), "utf8")

describe("mine-answer.ts — SCRUB DOMINATES the new CAS put call site (#121 sibling)", () => {
  it("the SHIPPED file is clean — the CAS object provably flows from scrub", () => {
    expect(auditAnswerScrub(REAL)).toStrictEqual([])
  })

  it("TEETH: a variant that stores the RAW answer (id + obj = rawAnswer) is caught on both the id and the store", () => {
    const mutant = `
      import { scrub } from '@atlas/persist';
      import { id } from '@atlas/kernel';
      export function answerReceipt(rawAnswer: string) {
        const scrubbed = scrub(Buffer.from(rawAnswer, 'utf8')); // computed but IGNORED
        const obj = rawAnswer; // BUG: the raw answer becomes the stored bytes
        const answerRef = id(obj) as unknown as string;
        return { obj, answerRef };
      }`
    const rules = auditAnswerScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["CAS-ID-NOT-SCRUBBED", "STORED-OBJECT-NOT-SCRUBBED"])
  })

  it("TEETH: a variant with NO scrub at all is caught (fail-closed on the missing control)", () => {
    const mutant = `
      import { id } from '@atlas/kernel';
      export function answerReceipt(rawAnswer: string) {
        const obj = rawAnswer;
        const answerRef = id(obj) as unknown as string;
        return { obj, answerRef };
      }`
    const rules = auditAnswerScrub(mutant)
      .map((v) => v.rule)
      .sort()
    expect(rules).toStrictEqual(["CAS-ID-NOT-SCRUBBED", "NO-SCRUB", "STORED-OBJECT-NOT-SCRUBBED"])
  })
})
