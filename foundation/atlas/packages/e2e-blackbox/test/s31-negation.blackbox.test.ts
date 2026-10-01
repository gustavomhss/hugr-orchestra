// @atlas/e2e-blackbox — test/s31-negation.blackbox.test.ts  (S31 — the SCOPED NEGATION + honest ABSTENTION)
//
// NARRATIVE (ADR-0015 D3 / #99b — "the honesty core"). Atlas learns to ground a NEGATIVE — "no unit CALLS the
// global symbol X within the closed directory scope S" — as a first-class fact, and, where the scope is NOT
// provably closed, to ABSTAIN with an explicit durable record instead of shipping a lie. The whole product
// limit #99 named ("Atlas cannot ground a negation") lives in ONE soundness fact from §0: a closed-world
// negative is sound ONLY IF the negated relation was computed COMPLETELY over S. Atlas's dependency graph is an
// UNDER-approximation (an unresolved/dynamic SCIP reference has no visible target), so a negative over an OPEN
// scope has no witness and the door MUST refuse it. This story proves the whole leg end-to-end THROUGH THE
// SHIPPED BINARIES — nothing here imports product runtime code into an assertion.
//
// THE THREE THINGS THIS STORY PINS, all observable over the built `atlas` CLI:
//   1. CLOSED-SCOPE ADMIT + READ. A directory `src/pay` where X has no caller and no unresolved reference is
//      CLOSED+EMPTY: `(¬calls, X, src/pay)` EMITS, and `atlas negations src/pay` finds the grounded negative,
//      surfacing its per-row §3 freshness verdict [FRESH] (N4 · billy F1).
//   2. DRIFT ON INSERTION. Inserting a real new file INTO `src/pay` moves the directory's subtreeHash (the
//      insertion-sensitive scope Merkle §3) ⇒ the negation reads [DRIFTED] — a per-UNIT hash would be blind.
//   3. THE #202 CLOSE — ABSTENTION FIRES. A scope `src/open` that is genuinely OPEN — a file under it carries a
//      SCIP `reference` to a symbol NO document defines (a REAL `unresolved` edge; symbol-reverse.ts's `else`
//      branch, INDEX-13) — makes `(¬calls, Y, src/open)` ABSTAIN: the door writes a durable AbstainedRecord
//      {reason:'scope-open', witness}, READABLE via `atlas negations src/open --abstained`. This is the exact
//      thing #202 says never happened (0/300 abstentions): the abstention path FIRES over the built product.
//
// HOW THE REAL OPEN SCOPE IS INDUCED (not a stubbed feed): the fixture's `.atlas/index.scip` — the real
// protobuf the product reads — carries a document under `src/open` whose occurrence set REFERENCES a global
// symbol that NO document DEFINES. The product's own `createSymbolReverse` (@atlas/index) classifies that
// reference `unresolved` and reports its document in `holeSources()`; the abstention door intersects that with
// the scope and abstains. The under-approximation is REAL, produced by the SCIP the harness builds, exactly as
// the CRITICAL fence in the N4 brief requires.
//
// PART A's edge-model drift (a negation admitted under E1 reading DRIFTED once the current edge model is E2) is
// NOT reachable through this subprocess harness: bumping the pinned extractor release means a different build of
// `@atlas/adapter-io` (`edgeModelVersion()` is the join of the pinned per-language tool versions, not repo
// state), which a subprocess over the SAME built binaries cannot vary. It is proven HONESTLY at the
// integration level in `packages/adapter-io/test/negation-edgemodel-freshness.test.ts` (real door, real read
// leg, the conjunct-drop mutant killed) — stated here rather than faked in-subprocess.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { negationPayload } from "./adversarial-fixtures.js"
import { ACTOR, RATIFIER, emitFact } from "./support.js"

// The CLOSED scope: X has no caller and no unresolved reference under it. `keep.ts` exists on disk so the
// directory resolves on the spatial rail; it carries no SCIP reference, so `src/pay` has no hole.
const PAY = "src/pay"
// The OPEN scope: `uses.ts` REFERENCES a symbol no document defines ⇒ a real `unresolved` edge ⇒ a hole in S.
const OPEN = "src/open"

// Where the DEFINED-but-uncalled target lives — outside the negated scope, so it resolves without being a caller.
const LIB = "src/lib"

// GLOBAL SCIP symbols (NOT `local ` — the honest, groundable case). X is the negation's target over the closed
// scope; it is DEFINED in `src/lib` (so it RESOLVES — #220) yet has no caller in `src/pay` (the honest,
// groundable scoped-negative). UNDEFINED is the reference with no definition anywhere that OPENS `src/open`; Y
// is the (irrelevant) target over the open scope — the abstention fires on scope-openness before Y is consulted.
// PHANTOM is a GLOBAL symbol NO document defines: `(¬calls, PHANTOM, src/pay)` is VACUOUSLY true, and #220 makes
// the door ABSTAIN `target-unresolvable` rather than ground a negative about a symbol Atlas cannot see.
const X = "scip . . `X`#"
const Y = "scip . . `Y`#"
const UNDEFINED = "scip . . `Undefined`#"
const PHANTOM = "scip . . `Phantom`#"

const FILES = {
  [`${PAY}/keep.ts`]: "export function keep() { return 1; }\n",
  [`${OPEN}/uses.ts`]: "export function uses() { return 2; }\n",
  [`${LIB}/def.ts`]: "export function X() { return 0; }\n",
}

// The real SCIP the product reads: `src/lib/def.ts` DEFINES `X` (so X RESOLVES — #220 — while having no caller
// in `src/pay`); `src/open/uses.ts` REFERENCES `UNDEFINED`, which NO document DEFINES ⇒ the product classifies
// it `unresolved` ⇒ `src/open` is OPEN. `src/pay/keep.ts` references nothing ⇒ CLOSED. Nothing defines PHANTOM.
const INDEX = [
  { path: `${LIB}/def.ts`, defines: [X] },
  { path: `${OPEN}/uses.ts`, references: [UNDEFINED] },
]

// Authorize the ACTOR to write BOTH scopes (KNOW-11). The abstention gate fires BEFORE authz, but a real
// operator owns the scope it asserts over, so the policy is honest.
const POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { [PAY]: [ACTOR], [OPEN]: [ACTOR] } },
})

let repo: FixtureRepo
let priorActor: string | undefined
let priorRatify: string | undefined

/** The durable projection sidecar as RAW BYTES — absent ⇒ nothing ever landed. */
function projectionBytes(): string {
  const p = join(repo.repoPath, ".atlas", "projection.json")
  return existsSync(p) ? readFileSync(p, "utf8") : "<<ABSENT>>"
}

/** The rendered `  negation <kind> <target> in <scope> [<freshness>] (<nodeKey>)` lines of a verdict. */
function negationLines(stdout: string): string[] {
  return stdout.split("\n").filter((l) => l.trimStart().startsWith("negation "))
}
/** The rendered `  abstained <kind> <target> in <scope> — <reason>` lines of a verdict. */
function abstainedLines(stdout: string): string[] {
  return stdout.split("\n").filter((l) => l.trimStart().startsWith("abstained "))
}

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // a non-T0 grounded negation auto-accepts; token is a safe default
  repo = makeFixtureRepo({ files: FILES, policy: POLICY, index: INDEX })
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S31 — a negation grounds over a CLOSED scope and is read back FRESH", () => {
  it("THE ADMIT: `(¬calls, X, src/pay)` over a closed+empty scope EMITS (exit 0) — the door proved S closed", () => {
    const run = emitFact(repo, negationPayload({ target: X, scope: PAY, relationKind: "calls" }))
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
    expect(run.stderr).toBe("")
    // it is DURABLE — one negation row landed (family:negation).
    const proj = JSON.parse(projectionBytes()) as { current: readonly [string, { family?: string }][] }
    expect(proj.current).toHaveLength(1)
    expect(proj.current[0]![1].family).toBe("negation")
  })

  it("THE READ: `atlas negations src/pay` finds the grounded negative, surfacing [FRESH] (N4 §3 verdict)", () => {
    const r = runAtlas(repo.repoPath, ["negations", PAY])
    expect(r.exitCode).toBe(0)
    const lines = negationLines(r.stdout)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(`negation calls ${X} in ${PAY}`)
    expect(lines[0]).toContain("[FRESH]") // the scope hash matches AND the edge model matches ⇒ FRESH
  })
})

describe("S31 — DRIFT ON INSERTION: a new caller entering the scope drifts the directory Merkle (§3)", () => {
  it("inserting a file INTO src/pay makes the negation read [DRIFTED] — insertion-sensitivity a per-unit hash lacks", () => {
    // A brand-new unit ENTERS the scope directory. A per-FILE subtreeHash would be monotone-blind to this; the
    // per-DIRECTORY hash is a branch over the NAMED child set, so it moves ⇒ the negation's grounding drifts.
    repo.commit({ [`${PAY}/newcaller.ts`]: "export function nc() { return 3; }\n" })
    const r = runAtlas(repo.repoPath, ["negations", PAY])
    expect(r.exitCode).toBe(0)
    const lines = negationLines(r.stdout)
    expect(lines).toHaveLength(1) // IDENTITY SURVIVES — target/scope did not move, so it is no false orphan
    expect(lines[0]).toContain(`negation calls ${X} in ${PAY}`)
    expect(lines[0]).toContain("[DRIFTED]") // the scope Merkle moved ⇒ re-verify the negative (honest trigger)
  })
})

describe("S31 — #220: a PHANTOM target (defined nowhere) ABSTAINS, never a vacuous admit", () => {
  it("emitting `(¬calls, PHANTOM, src/pay)` over a CLOSED scope ABSTAINS target-unresolvable (exit 2)", () => {
    // `src/pay` is closed+empty (same as the X admit), but PHANTOM is a GLOBAL symbol NO document defines, so
    // `reverseCallers(PHANTOM)` is [] BY CONSTRUCTION — indistinguishable from a genuinely-uncalled symbol. The
    // pre-#220 door reached the closed-empty ADMIT and ground "PHANTOM is not called in src/pay" — a negative
    // about a symbol Atlas cannot see. The fixed door ABSTAINS: it cannot prove the negative is MEANINGFUL.
    const run = emitFact(repo, negationPayload({ target: PHANTOM, scope: PAY, relationKind: "calls" }))
    expect(run.exitCode).toBe(2) // an abstention travels as a REFUSAL at the emit door, never a false success
    expect(run.stdout).toContain("abstained (target-unresolvable)")
    expect(run.stderr).toBe("") // fail-CLOSED refusal, never an uncaught throw
  })

  it("THE PROOF: `atlas negations src/pay --abstained` shows the durable target-unresolvable record", () => {
    const r = runAtlas(repo.repoPath, ["negations", PAY, "--abstained"])
    expect(r.exitCode).toBe(0)
    const lines = abstainedLines(r.stdout)
    expect(lines.some((l) => l.includes(`abstained calls ${PHANTOM} in ${PAY} — target-unresolvable`))).toBe(true)
  })
})

describe("S31 — THE #202 CLOSE: abstention FIRES over a genuinely OPEN scope", () => {
  it("emitting `(¬calls, Y, src/open)` over an OPEN scope ABSTAINS at the door (rejected, exit 2)", () => {
    // `src/open/uses.ts` carries a SCIP reference to a symbol no document defines ⇒ a REAL unresolved edge ⇒
    // the scope is UNDER-approximated ⇒ the door cannot prove absence ⇒ it ABSTAINS (not a silent drop).
    const run = emitFact(repo, negationPayload({ target: Y, scope: OPEN, relationKind: "calls" }))
    expect(run.exitCode).toBe(2) // an abstention travels as a REFUSAL at the emit door, never a false success
    expect(run.stdout).toContain("abstained (scope-open)")
    expect(run.stderr).toBe("") // fail-CLOSED refusal, never an uncaught throw
  })

  it("THE PROOF: `atlas negations src/open --abstained` shows the durable AbstainedRecord + reason (#202)", () => {
    const r = runAtlas(repo.repoPath, ["negations", OPEN, "--abstained"])
    expect(r.exitCode).toBe(0)
    const lines = abstainedLines(r.stdout)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(`abstained calls ${Y} in ${OPEN} — scope-open`) // READABLE, not a silent refuse
  })

  it("the AbstainedRecord is DURABLE with a populated WITNESS — the unresolved edge that opened the scope", () => {
    // Read the sidecar bytes directly: the abstention round-trips through the WireProjection `abstained` ledger
    // (sidecar-abstained.ts), carrying its reason and the witness docHashes that opened the scope. This is what
    // makes "the door declined to decide, and here is why" observable end to end (the exact 0/300 #202 close).
    const bytes = projectionBytes()
    const wire = JSON.parse(bytes) as {
      abstained?: readonly [
        string,
        {
          reason: string
          scope: string
          witness: { underApproxSources: readonly string[] }
        },
      ][]
    }
    expect(wire.abstained).toBeDefined()
    const rec = wire.abstained!.find(([, r]) => r.scope === OPEN)?.[1]
    expect(rec).toBeDefined()
    expect(rec!.reason).toBe("scope-open")
    expect(rec!.witness.underApproxSources.length).toBeGreaterThan(0) // the offending unresolved edge(s) ∩ S
  })
})
