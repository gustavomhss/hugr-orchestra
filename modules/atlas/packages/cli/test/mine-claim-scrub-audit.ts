// @atlas/cli — test/mine-claim-scrub-audit.ts  (T0 — the SHARED structural AST audit for decideStaging's scrub sites)
//
// EXTRACTED from mine-claim-scrub-fitness.test.ts at the 400-LOC ceiling (billy #96-wave F2 grew the file past
// it). The PURE analyser machinery lives here — fail-closed AST audits proving each per-kind scrub branch of
// decideStaging's factScrubbed ternary stamps an identity-bearing body/leg that provably flows from the matching
// scrub, and that the identity key is minted from the same scrubbed fact. Two SIBLING suites consume it:
// mine-claim-scrub-fitness.test.ts (advisory + predicate) and mine-claim-scrub-fitness-rel-neg.test.ts
// (relation + negation). No vitest here — this is a helper module (like mine-fixtures.ts), not a suite.
//
// DELIBERATELY TEXTUAL and NOT the load-bearing control: a sequence expression that computes-then-discards the
// scrub reads GREEN here. The REAL teeth are the runtime stored-CAS-byte assertions in
// mine-predicate-check-scrub.test.ts / wp-96-identity-scrub.test.ts. The AST audit and the runtime tests are
// COMPLEMENTARY — the leak escapes only if BOTH are removed.

import ts from "typescript"

const CLAIM_SCRUB = "scrubClaimNorm"
const CHECK_SCRUB = "scrubCheck"
const UNIT_SCRUB = "scrubUnit" // the relation/negation identity-leg scrub (billy #96-wave Finding 2)

interface ClaimScrubViolation {
  readonly rule:
    | "NO-SCRUB"
    | "NO-ADVISORY-SITE"
    | "CLAIM-NOT-SCRUBBED"
    | "NO-SCRUB-CHECK"
    | "NO-PREDICATE-SITE"
    | "CHECK-NOT-SCRUBBED"
    | "NODEKEY-NOT-FROM-SCRUBBED-FACT"
    // ── relation/negation identity-leg rules (billy #96-wave Finding 2) ─────────────────────────────────
    | "NO-SCRUB-UNIT"
    | "NO-RELATION-SITE"
    | "ENDPOINT-NOT-SCRUBBED"
    | "NO-NEGATION-SITE"
    | "NEGATION-LEG-NOT-SCRUBBED"
    | "IDENTITY-NOT-FROM-SCRUBBED-FACT"
  readonly detail: string
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  node.forEachChild((c) => walk(c, visit))
}

/** Does `expr` provably flow from a bare `<scrubName>(...)` call — directly, or through a chain of resolvable
 *  const initializers? Fail-closed on a parameter / import / unresolvable identifier, same shape as the #121
 *  original.
 *
 *  DELIBERATELY TEXTUAL, and NOT the load-bearing control (billy WP-219 review #1). This audit walks for a
 *  `scrubName(...)` call in the initializer; a sequence expression `(scrubCheck(x), x)` computes the scrub and
 *  then discards it, and this walk reports GREEN on that mutant. The REAL teeth are the runtime
 *  stored-CAS-byte assertions in `mine-predicate-check-scrub.test.ts` (`stored.check.expr`/`dec.put`/`row.claims`
 *  `.not.toContain(SECRET)`), which go RED on exactly that mutant. The AST audit and the runtime test are
 *  COMPLEMENTARY: the leak escapes only if BOTH are removed. Do not over-trust this audit in isolation. */
function flowsFromScrub(
  expr: ts.Expression,
  inits: ReadonlyMap<string, ts.Expression>,
  scrubName: string,
  depth = 0,
): boolean {
  if (depth > 8) return false
  let direct = false
  walk(expr, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === scrubName) direct = true
  })
  if (direct) return true
  let proven = false
  walk(expr, (n) => {
    if (proven || !ts.isIdentifier(n)) return
    if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return // skip `.member`
    const init = inits.get(n.text)
    if (init !== undefined && flowsFromScrub(init, inits, scrubName, depth + 1)) proven = true
  })
  return proven
}

/** Does `expr` provably SPREAD identifier `name` — directly (`{ ...name }`) or through a chain of resolvable
 *  const initializers that themselves spread it? The nodeKey-preimage teeth: the object handed to `nodeKey`
 *  must trace back to the scrubbed `f`, never to a raw pre-scrub source. Fail-closed. */
function spreadsIdentifier(
  expr: ts.Expression,
  name: string,
  inits: ReadonlyMap<string, ts.Expression>,
  depth = 0,
): boolean {
  if (depth > 8) return false
  let found = false
  walk(expr, (n) => {
    if (found || !ts.isSpreadAssignment(n) || !ts.isIdentifier(n.expression)) return
    if (n.expression.text === name) found = true
    else {
      const init = inits.get(n.expression.text)
      if (init !== undefined && spreadsIdentifier(init, name, inits, depth + 1)) found = true
    }
  })
  return found
}

/** Find the object-literal `<propName>:` (or shorthand) property assignment inside an expression, if any. */
function namedProperty(expr: ts.Expression, propName: string): ts.Expression | undefined {
  let found: ts.Expression | undefined
  walk(expr, (n) => {
    if (found !== undefined || !ts.isObjectLiteralExpression(n)) return
    for (const p of n.properties) {
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === propName) found = p.initializer
      else if (ts.isShorthandPropertyAssignment(p) && p.name.text === propName) found = p.name
    }
  })
  return found
}

interface BranchSpec {
  readonly kind: string // the discriminant value, e.g. 'advisory' / 'predicate'
  readonly property: string // the claim-body property, e.g. 'claimNorm' / 'check'
  readonly scrubName: string // the scrub the property must flow from
  readonly notScrubbedRule: "CLAIM-NOT-SCRUBBED" | "CHECK-NOT-SCRUBBED"
  readonly noSiteRule: "NO-ADVISORY-SITE" | "NO-PREDICATE-SITE"
}

/** Does `expr` contain a `.kind === '<kind>'` guarded ternary, and if so, does ITS `whenTrue` branch's
 *  `<property>` flow from `<scrubName>(...)`? Fail-closed: no such guarded ternary at all ⇒ `noSiteRule`
 *  (the per-kind scrub gate is entirely gone, not merely unresolved). */
function auditKindBranch(
  expr: ts.Expression,
  inits: ReadonlyMap<string, ts.Expression>,
  spec: BranchSpec,
): ClaimScrubViolation[] {
  const violations: ClaimScrubViolation[] = []
  let sawKindTernary = false
  walk(expr, (n) => {
    if (!ts.isConditionalExpression(n)) return
    const cond = n.condition
    const guardsKind =
      ts.isBinaryExpression(cond) &&
      cond.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ((ts.isPropertyAccessExpression(cond.left) && cond.left.name.text === "kind") ||
        (ts.isPropertyAccessExpression(cond.right) && cond.right.name.text === "kind")) &&
      (cond.getText().includes(`'${spec.kind}'`) || cond.getText().includes(`"${spec.kind}"`))
    if (!guardsKind) return
    sawKindTernary = true
    const body = namedProperty(n.whenTrue, spec.property)
    if (body === undefined) {
      violations.push({
        rule: spec.notScrubbedRule,
        detail: `${spec.kind} branch ${n.whenTrue.getText()} stamps no resolvable \`${spec.property}\` property`,
      })
    } else if (!flowsFromScrub(body, inits, spec.scrubName)) {
      violations.push({
        rule: spec.notScrubbedRule,
        detail: `${spec.kind} ${spec.property} = ${body.getText()} does not provably flow from \`${spec.scrubName}(...)\``,
      })
    }
  })
  if (!sawKindTernary)
    violations.push({
      rule: spec.noSiteRule,
      detail: `no \`kind === '${spec.kind}'\` guarded ternary found — the per-kind scrub gate is gone`,
    })
  return violations
}

/** Collect the initializers of every `const <id> = <expr>` in the file (the resolution table). */
function collectInits(sf: ts.SourceFile): Map<string, ts.Expression> {
  const inits = new Map<string, ts.Expression>()
  walk(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer !== undefined)
      inits.set(n.name.text, n.initializer)
  })
  return inits
}

/** The spread sources of `const f = { ...X, ... } as Fact` — the expressions `id(f)` transitively hashes. */
function factSpreadSources(sf: ts.SourceFile, inits: ReadonlyMap<string, ts.Expression>): ts.Expression[] | undefined {
  let fInit: ts.Expression | undefined
  walk(sf, (n) => {
    if (fInit !== undefined) return
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "f" && n.initializer !== undefined)
      fInit = n.initializer
  })
  if (fInit === undefined) return undefined
  const spreadSources: ts.Expression[] = []
  walk(fInit, (n) => {
    if (ts.isSpreadAssignment(n) && ts.isIdentifier(n.expression)) {
      const init = inits.get(n.expression.text)
      if (init !== undefined) spreadSources.push(init)
    }
  })
  return spreadSources
}

function hasScrubCall(sf: ts.SourceFile, scrubName: string): boolean {
  let has = false
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === scrubName) has = true
  })
  return has
}

/**
 * Audit the ADVISORY claim leg of `mine-decide.ts`: (1) it calls `scrubClaimNorm`; (2) the fact object `id(f)`
 * hashes into CAS has an advisory `claimNorm` that provably flows from `scrubClaimNorm(...)`.
 */
export function auditClaimScrub(source: string, fileName = "mine-decide.ts"): readonly ClaimScrubViolation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const violations: ClaimScrubViolation[] = []
  const inits = collectInits(sf)

  if (!hasScrubCall(sf, CLAIM_SCRUB))
    violations.push({
      rule: "NO-SCRUB",
      detail: `no bare \`${CLAIM_SCRUB}(...)\` call — the credential control on the claim is gone`,
    })

  const spreadSources = factSpreadSources(sf, inits)
  if (spreadSources === undefined) {
    violations.push({
      rule: "NO-ADVISORY-SITE",
      detail: "no `const f = ...` found — the fact object `id(f)` hashes into CAS could not be located",
    })
    return violations
  }
  if (spreadSources.length === 0) {
    violations.push({
      rule: "NO-ADVISORY-SITE",
      detail: "`f`'s initializer spreads no resolvable identifier — could not trace back to the claim-scrub site",
    })
    return violations
  }
  const spec: BranchSpec = {
    kind: "advisory",
    property: "claimNorm",
    scrubName: CLAIM_SCRUB,
    notScrubbedRule: "CLAIM-NOT-SCRUBBED",
    noSiteRule: "NO-ADVISORY-SITE",
  }
  for (const src of spreadSources) violations.push(...auditKindBranch(src, inits, spec))
  return violations
}

/**
 * Audit the PREDICATE check leg (WP-219): (1) it calls `scrubCheck`; (2) the fact `id(f)` hashes has a
 * predicate `check` that provably flows from `scrubCheck(...)`; (3) the object handed to `nodeKey(...)`
 * provably spreads `f` — so the SAME scrubbed check feeds BOTH CAS and the node-identity preimage. Pure.
 */
export function auditCheckScrub(source: string, fileName = "mine-decide.ts"): readonly ClaimScrubViolation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const violations: ClaimScrubViolation[] = []
  const inits = collectInits(sf)

  if (!hasScrubCall(sf, CHECK_SCRUB))
    violations.push({
      rule: "NO-SCRUB-CHECK",
      detail: `no bare \`${CHECK_SCRUB}(...)\` call — the credential control on the predicate check is gone`,
    })

  const spreadSources = factSpreadSources(sf, inits)
  if (spreadSources === undefined) {
    violations.push({
      rule: "NO-PREDICATE-SITE",
      detail: "no `const f = ...` found — the fact object `id(f)` hashes into CAS could not be located",
    })
    return violations
  }
  if (spreadSources.length === 0) {
    violations.push({
      rule: "NO-PREDICATE-SITE",
      detail: "`f`'s initializer spreads no resolvable identifier — could not trace back to the check-scrub site",
    })
    return violations
  }
  const spec: BranchSpec = {
    kind: "predicate",
    property: "check",
    scrubName: CHECK_SCRUB,
    notScrubbedRule: "CHECK-NOT-SCRUBBED",
    noSiteRule: "NO-PREDICATE-SITE",
  }
  for (const src of spreadSources) violations.push(...auditKindBranch(src, inits, spec))

  // The identity leg: EVERY `nodeKey(arg)` argument must provably spread `f` (the scrubbed fact), so the
  // check that feeds node identity is the SAME scrubbed bytes CAS sees — never a raw pre-scrub source.
  let sawNodeKey = false
  let nodeKeyFromF = false
  walk(sf, (n) => {
    if (
      !ts.isCallExpression(n) ||
      !ts.isIdentifier(n.expression) ||
      n.expression.text !== "nodeKey" ||
      n.arguments.length === 0
    )
      return
    sawNodeKey = true
    const arg = n.arguments[0]!
    const argExpr = ts.isIdentifier(arg) ? (inits.get(arg.text) ?? arg) : arg
    if (spreadsIdentifier(argExpr, "f", inits)) nodeKeyFromF = true
  })
  if (!sawNodeKey)
    violations.push({
      rule: "NODEKEY-NOT-FROM-SCRUBBED-FACT",
      detail: "no `nodeKey(...)` call found — the predicate identity leg could not be located",
    })
  else if (!nodeKeyFromF)
    violations.push({
      rule: "NODEKEY-NOT-FROM-SCRUBBED-FACT",
      detail:
        "the `nodeKey(...)` argument does not provably spread `f` — the check feeding node identity may be a raw, un-scrubbed source",
    })
  return violations
}

/** A `kind === '<kind>'` guarded ternary whose whenTrue branch stamps SEVERAL identity-leg properties, each of
 *  which must flow from `<scrubName>(...)`. The multi-property sibling of {@link auditKindBranch} (relation has
 *  TWO legs `endpointA`/`endpointB`, negation has `target`/`scope`). Pushes the noSiteRule ONCE (not per leg) so
 *  a deleted branch is one violation, and one `notScrubbedRule` per leg that does not provably flow from scrub. */
function auditLegsBranch(
  expr: ts.Expression,
  inits: ReadonlyMap<string, ts.Expression>,
  kind: string,
  properties: readonly string[],
  scrubName: string,
  notScrubbedRule: "ENDPOINT-NOT-SCRUBBED" | "NEGATION-LEG-NOT-SCRUBBED",
  noSiteRule: "NO-RELATION-SITE" | "NO-NEGATION-SITE",
): ClaimScrubViolation[] {
  const violations: ClaimScrubViolation[] = []
  let sawKindTernary = false
  walk(expr, (n) => {
    if (!ts.isConditionalExpression(n)) return
    const cond = n.condition
    const guardsKind =
      ts.isBinaryExpression(cond) &&
      cond.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ((ts.isPropertyAccessExpression(cond.left) && cond.left.name.text === "kind") ||
        (ts.isPropertyAccessExpression(cond.right) && cond.right.name.text === "kind")) &&
      (cond.getText().includes(`'${kind}'`) || cond.getText().includes(`"${kind}"`))
    if (!guardsKind) return
    sawKindTernary = true
    for (const property of properties) {
      const body = namedProperty(n.whenTrue, property)
      if (body === undefined) {
        violations.push({
          rule: notScrubbedRule,
          detail: `${kind} branch stamps no resolvable \`${property}\` property`,
        })
      } else if (!flowsFromScrub(body, inits, scrubName)) {
        violations.push({
          rule: notScrubbedRule,
          detail: `${kind} ${property} = ${body.getText()} does not provably flow from \`${scrubName}(...)\``,
        })
      }
    }
  })
  if (!sawKindTernary)
    violations.push({
      rule: noSiteRule,
      detail: `no \`kind === '${kind}'\` guarded ternary found — the per-kind scrub gate is gone`,
    })
  return violations
}

/** The IDENTITY-consistency teeth shared by relation + negation: unlike the predicate `nodeKey(view)` leg, a
 *  relation/negation key is minted by `mintIdentity(<fact>, …)` reading the fact DIRECTLY (`f.endpointA`, …).
 *  So the split a mutant could introduce is passing a RAW pre-scrub object to `mintIdentity` while `id()` hashes
 *  the scrubbed `f`. This proves `mintIdentity`'s first argument is the SAME identifier `id(...)` hashes — so
 *  CAS bytes and the identity key derive from one scrubbed fact. Fail-closed: either call missing ⇒ violation. */
function auditIdentityFromScrubbedFact(sf: ts.SourceFile): ClaimScrubViolation[] {
  const argIdent = (call: ts.CallExpression): string | undefined =>
    call.arguments.length > 0 && ts.isIdentifier(call.arguments[0]!) ? call.arguments[0]!.text : undefined
  let idArg: string | undefined
  let mintArg: string | undefined
  let sawId = false
  let sawMint = false
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return
    if (n.expression.text === "id") {
      sawId = true
      idArg = argIdent(n)
    }
    if (n.expression.text === "mintIdentity") {
      sawMint = true
      mintArg = argIdent(n)
    }
  })
  if (!sawId || !sawMint) {
    return [
      {
        rule: "IDENTITY-NOT-FROM-SCRUBBED-FACT",
        detail: "no `id(...)` and `mintIdentity(...)` pair found — the identity leg could not be located",
      },
    ]
  }
  if (idArg === undefined || mintArg === undefined || idArg !== mintArg) {
    return [
      {
        rule: "IDENTITY-NOT-FROM-SCRUBBED-FACT",
        detail: `mintIdentity's fact argument (${mintArg ?? "?"}) is not the same identifier id(...) hashes (${idArg ?? "?"}) — the key may be minted from a raw, un-scrubbed fact`,
      },
    ]
  }
  return []
}

/**
 * Audit the RELATION identity legs (billy #96-wave F2): (1) it calls `scrubUnit`; (2) the relation branch of
 * `factScrubbed` stamps `endpointA` AND `endpointB`, each provably flowing from `scrubUnit(...)`; (3) the key is
 * minted from the SAME scrubbed fact `id()` hashes (`mintIdentity(f, …)`). Pure.
 */
export function auditRelationScrub(source: string, fileName = "mine-decide.ts"): readonly ClaimScrubViolation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const violations: ClaimScrubViolation[] = []
  const inits = collectInits(sf)
  if (!hasScrubCall(sf, UNIT_SCRUB))
    violations.push({
      rule: "NO-SCRUB-UNIT",
      detail: `no bare \`${UNIT_SCRUB}(...)\` call — the credential control on the identity legs is gone`,
    })

  const spreadSources = factSpreadSources(sf, inits)
  if (spreadSources === undefined || spreadSources.length === 0) {
    violations.push({
      rule: "NO-RELATION-SITE",
      detail: "`f` could not be traced back to the relation identity-leg scrub site",
    })
    return violations
  }
  for (const src of spreadSources)
    violations.push(
      ...auditLegsBranch(
        src,
        inits,
        "relation",
        ["endpointA", "endpointB"],
        UNIT_SCRUB,
        "ENDPOINT-NOT-SCRUBBED",
        "NO-RELATION-SITE",
      ),
    )
  violations.push(...auditIdentityFromScrubbedFact(sf))
  return violations
}

/**
 * Audit the NEGATION identity legs (billy #96-wave F2): (1) it calls `scrubUnit`; (2) the negation branch stamps
 * `target` AND `scope`, each provably flowing from `scrubUnit(...)`; (3) the `negationKey` is minted from the
 * SAME scrubbed fact `id()` hashes. Pure.
 */
export function auditNegationScrub(source: string, fileName = "mine-decide.ts"): readonly ClaimScrubViolation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const violations: ClaimScrubViolation[] = []
  const inits = collectInits(sf)
  if (!hasScrubCall(sf, UNIT_SCRUB))
    violations.push({
      rule: "NO-SCRUB-UNIT",
      detail: `no bare \`${UNIT_SCRUB}(...)\` call — the credential control on the identity legs is gone`,
    })

  const spreadSources = factSpreadSources(sf, inits)
  if (spreadSources === undefined || spreadSources.length === 0) {
    violations.push({
      rule: "NO-NEGATION-SITE",
      detail: "`f` could not be traced back to the negation identity-leg scrub site",
    })
    return violations
  }
  for (const src of spreadSources)
    violations.push(
      ...auditLegsBranch(
        src,
        inits,
        "negation",
        ["target", "scope"],
        UNIT_SCRUB,
        "NEGATION-LEG-NOT-SCRUBBED",
        "NO-NEGATION-SITE",
      ),
    )
  violations.push(...auditIdentityFromScrubbedFact(sf))
  return violations
}
