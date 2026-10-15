// @atlas/persist — test/transcript-door-fitness.ts  (PERSIST-10a — the REDACT-AT-THE-DOOR fitness function)
//
// ── THE CONTROL THIS ENFORCES, AND WHY A BEHAVIOURAL TEST IS NOT ENOUGH ─────────────────────────────────
// `transcript-store.ts` moved redaction from the CALLER to the DOOR, and its header states the property in
// as many words: "there is no path into `objects` that does not pass through `scrub`". That property was
// PROVEN BY READING THE CLOSURE. Nothing enforced it.
//
// `transcript-store-redaction.test.ts` is excellent and it does not close this: every case there drives the
// EXISTING surface (`put`/`fetch`), so it proves that `put` scrubs. It cannot prove that `put` is the ONLY
// way in. The day someone adds a second insertion path — a `restore(ref, body)`, a bulk loader, a
// disk-backed rehydrate, a `hydrate(entries)` for tests — the T0 reopens SILENTLY: every existing test
// still passes, because none of them calls the new door. And the store is put/fetch with NO delete, so
// anything admitted raw is permanent and content-addressed into git-propagated history.
//
// The whole point of moving redaction to the door was that it stops depending on a person remembering. A
// control that depends on the next author remembering to test their new insertion path is the same
// convention one level up. So the property is enforced STRUCTURALLY, over the module's own AST:
//
//   RULE 1  NO ESCAPE      — the backing Map may never leave the closure. Every reference to it must be a
//                            property access ON it. `return { objects }` or `raw: () => objects` hands a
//                            caller `.set` directly and is a hole no behavioural test would see.
//   RULE 2  NO REMOVAL     — `.delete` / `.clear` are refused. The store's contract is immutable + no
//                            delete (PERSIST-10); a removal path is a different module, not a tweak here.
//   RULE 3  SCRUB DOMINATES — every `.set(k, v)` must have a `v` that PROVABLY flows from `scrub(...)`.
//
// FAIL-CLOSED BY CONSTRUCTION. Rule 3 resolves flow through a flat map of const initializers, which is
// adequate for a single-closure module under the 400-LOC ceiling and is deliberately CONSERVATIVE: an
// identifier whose origin cannot be resolved is a VIOLATION, never a pass. So the failure mode of this
// analyser is a false ALARM on a legitimate refactor (which a human then reads and either fixes or widens),
// never a false CLEAR on a raw insertion. That asymmetry is the whole design; it is the same stance
// `layer-guard.mjs` takes when its canonical input goes unparseable.
//
// Grounding: architecture fitness functions (Ford/Parsons/Kua; ArchUnit → ArchUnitTS), the local precedent
// being `harness/gates/layer-guard.mjs`. This one lives in the test tree rather than `harness/gates/`
// because it guards ONE module's internal invariant rather than a repo-wide architectural law, and because
// running it in the suite means it fires on the author's machine at the moment they add the path.

import ts from "typescript"

/** One broken rule, with enough detail to act on without opening the analyser. */
export interface Violation {
  readonly rule: "NO-ESCAPE" | "NO-REMOVAL" | "SCRUB-DOMINATES"
  readonly detail: string
  readonly line: number
}

/** The redaction seam every admitted byte must pass through. */
const REDACTOR = "scrub"
/** Map methods that CHANGE what is stored. `has`/`get`/`size`/iteration are reads and are unrestricted. */
const REMOVERS = new Set(["delete", "clear"])

/** Depth cap on the const-initializer walk — a cycle would otherwise not terminate, and a chain this long
 *  is unreadable anyway. Exceeding it is a VIOLATION (fail-closed), not a silent pass. */
const MAX_FLOW_DEPTH = 8

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  node.forEachChild((c) => walk(c, visit))
}

/** Does this expression CONTAIN a direct call to the BARE `scrub(...)` seam? (`Uint8Array.from(scrub(b))`
 *  does.) A method named `scrub` on some other object — `this.scrub(x)`, `codec.scrub(x)` — deliberately
 *  does NOT count: it is not the audited import, and accepting it would let any object named `scrub`
 *  satisfy the rule. */
function containsRedactorCall(node: ts.Node): boolean {
  let found = false
  walk(node, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === REDACTOR) found = true
  })
  return found
}

/**
 * Does `expr` provably flow from `scrub(...)`? Directly, or through a chain of resolvable const
 * initializers. An identifier with no resolvable initializer (a PARAMETER, an import, a mutable rebinding)
 * terminates the walk as NOT-PROVEN — which is the fail-closed answer, and is exactly the shape of every
 * mutant this rule exists to catch: `objects.set(h, body)` where `body` is the caller's raw argument.
 */
function flowsFromRedactor(
  expr: ts.Expression,
  inits: ReadonlyMap<string, ts.Expression>,
  sf: ts.SourceFile,
  depth = 0,
): boolean {
  if (depth > MAX_FLOW_DEPTH) return false
  if (containsRedactorCall(expr)) return true
  let proven = false
  walk(expr, (n) => {
    if (proven || !ts.isIdentifier(n)) return
    // Skip the property side of `a.b` — `from` in `Uint8Array.from(x)` is not a value we can resolve.
    if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return
    const init = inits.get(n.text)
    if (init !== undefined && flowsFromRedactor(init, inits, sf, depth + 1)) proven = true
  })
  return proven
}

/**
 * Audit a transcript-store module for the three rules above. Pure: source text in, violations out — so the
 * analyser can be pointed at the REAL shipped file AND at deliberately-broken variants of it in the same
 * suite, which is the only way its own teeth can be shown rather than asserted.
 */
export function auditTranscriptDoor(source: string, fileName = "transcript-store.ts"): readonly Violation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const violations: Violation[] = []

  // PASS 1 — every `const x = <init>`, plus which of those are backing Maps.
  const inits = new Map<string, ts.Expression>()
  const maps = new Set<string>()
  const mapNames = new Set<ts.Node>()
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || n.initializer === undefined) return
    inits.set(n.name.text, n.initializer)
    const init = n.initializer
    const isMap = ts.isNewExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "Map"
    if (isMap) {
      maps.add(n.name.text)
      mapNames.add(n.name)
    }
  })
  if (maps.size === 0) {
    violations.push({
      rule: "NO-ESCAPE",
      detail:
        "no backing `new Map(...)` found — this analyser is BLIND against the module it was pointed at. " +
        "The storage shape changed; the rules must be re-aimed before this file can be trusted again.",
      line: 1,
    })
    return violations
  }

  // PASS 2 — every reference to a backing map.
  walk(sf, (n) => {
    if (!ts.isIdentifier(n) || !maps.has(n.text) || mapNames.has(n)) return
    const parent = n.parent
    // RULE 1 — the only legal use is `map.<something>`; anything else lets the Map itself out.
    if (!ts.isPropertyAccessExpression(parent) || parent.expression !== n) {
      violations.push({
        rule: "NO-ESCAPE",
        detail: `\`${n.text}\` is referenced as a VALUE, not as \`${n.text}.<method>\` — the backing map escapes the closure, and a holder of it can \`.set\` raw bytes with no redaction`,
        line: lineOf(sf, n),
      })
      return
    }
    const method = parent.name.text
    // RULE 2 — no removal path.
    if (REMOVERS.has(method)) {
      violations.push({
        rule: "NO-REMOVAL",
        detail: `\`${n.text}.${method}(...)\` — the transcript store is immutable with NO delete (PERSIST-10); a removal path is a separate, governed change`,
        line: lineOf(sf, n),
      })
      return
    }
    if (method !== "set") return // has/get/size/keys/... are reads
    // RULE 3 — the inserted VALUE must provably flow from `scrub`.
    const call = parent.parent
    if (!ts.isCallExpression(call) || call.arguments.length < 2) {
      violations.push({
        rule: "SCRUB-DOMINATES",
        detail: `\`${n.text}.set\` is used in a shape this analyser cannot read (not a 2-argument call) — refused fail-closed rather than assumed safe`,
        line: lineOf(sf, n),
      })
      return
    }
    const value = call.arguments[1]!
    if (!flowsFromRedactor(value, inits, sf)) {
      violations.push({
        rule: "SCRUB-DOMINATES",
        detail: `\`${n.text}.set(_, ${value.getText(sf)})\` — the stored value is not provably derived from \`${REDACTOR}(...)\`, so this is a path into the immutable, undeletable, git-propagated record that can admit a raw credential`,
        line: lineOf(sf, n),
      })
    }
  })

  return violations
}
