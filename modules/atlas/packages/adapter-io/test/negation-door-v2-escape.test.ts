// @atlas/adapter-io — test/negation-door-v2-escape.test.ts  (ADR-0016 · #99 — target-relative completeness)
//
// The v2 negation gate, proven at the COMPOSED door. #99b's shipped gate abstains whenever the scope S holds
// ANY unresolved reference (`holeSources() ∩ S ≠ ∅`) — sound, but ~0 recall on real code (a hole lives in ~92%
// of files). ADR-0016 replaces that blanket, WHEN the two v2 closure legs are wired, with the SOUND
// TARGET-RELATIVE gate: `¬escape(X) ∧ ¬dynamic-reach(S)`. This suite gives that gate TEETH:
//   · THE RECALL WIN — a scope with an UNRELATED hole, a non-escaping target, and no dynamic channel now ADMITS
//     (the blanket would abstain scope-open). This is the whole point of v2; it is what proves v2 ≠ fallback.
//   · escape-open — a target that ESCAPES abstains (mutant: ignore `targetEscapes` ⇒ this ADMITS a lie).
//   · scope-dynamic — a scope with an opaque `ns[key]()` channel abstains (the exact false-admit lucy found:
//     `import * as ns; ns[key]()` reaches X with NO emitted occurrence, ¬escape is trivially true, no
//     reverse-caller — all the occurrence-based clauses pass, and ADMIT would be a lie). Mutant: ignore
//     `dynamicReach` ⇒ this ADMITS the lie.
//   · HALF-GATE — wiring only ONE leg falls back to the sound blanket (the door never runs a half-gate).
//   · #220 still holds under v2 — a phantom target abstains target-unresolvable, not escape-open.
//
// The N0 feed + structural axes are the SAME identity-hashed fakes as negation-door.test.ts (`nodeHashOfPath =
// identity`), so `∩ S` is `underScope`. The v2 legs (`targetEscapes`/`dynamicReach`) are injected fakes too —
// this isolates the door's GATE logic from the escape ENGINE (which has its own agreement proof, escape-*.mjs).

import { describe, it, expect, afterEach } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import { negationKey } from "@atlas/knowledge"
import type { NegationNode, RelationKind } from "@atlas/knowledge"
import type { Axes, Axis, IndexNode, SymbolReverseApi } from "@atlas/index"
import type { Hash, Tier } from "@atlas/contracts"
import { createGovernedEmit } from "../src/governed-emit.js"
import { HOLDS, freshWorkspace, policyOf } from "./door-regression-support.js"
import { rehydrateProjection } from "../src/store.js"
import type { Workspace } from "./door-regression-support.js"

const S = "src/pay"
const TARGET = "scip:X#"
const KIND: RelationKind = "calls"
const EDGE_MODEL = "ts@0.4.0,py@0.6.6"

const nodeHashOfPath = (p: string): Hash => p as unknown as Hash

const inode = (key: string, children: IndexNode[] = []): IndexNode => ({
  axis: "spatial" as Axis,
  level: "file",
  key,
  subtreeHash: asSubtreeHash("sh-" + key),
  children,
  objects: [],
})

function axesWithScope(): Axes {
  const spatial = inode(".", [inode(S, [inode("src/pay/a.ts"), inode("src/pay/b.ts")]), inode("src/other.ts")])
  const empty = inode(".")
  return { spatial, territory: empty, dependency: empty, edges: [] }
}

function feed(callers: readonly string[], holes: readonly string[]): SymbolReverseApi {
  return {
    reverseCallers: (sym: string) => (sym === TARGET ? (callers as unknown as readonly Hash[]) : []),
    holeSources: () => holes as unknown as readonly Hash[],
    opaqueRefSources: () => [],
    resolves: (sym: string) => sym === TARGET,
    definesAt: (sym: string) => (sym === TARGET ? ("src/x.ts" as unknown as Hash) : undefined), // #196d — unused here; a def-site for the resolvable target
  }
}

function negation(opts: { target?: string; scope?: string; tier?: Tier } = {}): NegationNode {
  return {
    kind: "negation",
    id: "ignored" as unknown as NegationNode["id"],
    tier: opts.tier ?? "T2",
    relationKind: KIND,
    target: opts.target ?? TARGET,
    scope: opts.scope ?? S,
    grounding: { entries: [] },
    edgeModel: "ignored",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
  } as unknown as NegationNode
}

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

/** A door with the v2 closure legs wired. `escapeSites`/`dynChannels` are the fake verdicts of the two legs;
 *  `holes` still feeds the (unused-on-the-v2-path) blanket so a test can prove the blanket is NOT consulted. */
function v2Door(opts: {
  callers?: readonly string[]
  holes?: readonly string[]
  escapeSites?: readonly string[]
  dynChannels?: readonly string[]
  targetEscapes?: (t: string) => readonly string[] // override for the half-gate case (omit the leg)
  dynamicReach?: (s: string) => readonly string[]
}) {
  ws ??= freshWorkspace()
  return createGovernedEmit({
    store: ws.store,
    gate: HOLDS,
    policy: policyOf({ [S]: ["bob"] }),
    actor: "bob",
    ratifyToken: "billy",
    symbolReverse: () => feed(opts.callers ?? [], opts.holes ?? []),
    axes: axesWithScope(),
    nodeHashOfPath,
    edgeModel: EDGE_MODEL,
    targetEscapes: opts.targetEscapes ?? (() => opts.escapeSites ?? []),
    dynamicReach: opts.dynamicReach ?? (() => opts.dynChannels ?? []),
  })
}

const KEY = String(negationKey(KIND, TARGET, S))
const abstainedOf = (w: Workspace) => rehydrateProjection(w.store).abstained?.get(KEY)
const currentOf = (w: Workspace) => rehydrateProjection(w.store).current.get(KEY)

describe("#99 ADR-0016 — the target-relative negation gate (v2 escape + dynamic-reach)", () => {
  it(
    "THE RECALL WIN: a scope with an UNRELATED hole ADMITS when X does not escape and S has no dynamic " +
      "channel — the exact case the #99b blanket abstains (scope-open) and v2 recovers",
    () => {
      // `src/pay/a.ts` is a HOLE in S (an unresolved reference to SOMETHING — not to X). Under the #99b blanket
      // `holeSources() ∩ S ≠ ∅` this abstains scope-open (0 recall). Under v2: X does not escape (targetEscapes==[]),
      // S has no dynamic channel (dynamicReach==[]), and no caller of X in S ⇒ the negative is PROVEN closed ⇒ ADMIT.
      const out = v2Door({ holes: ["src/pay/a.ts"], escapeSites: [], dynChannels: [] }).emit(
        negation(),
        NaN as unknown as Hash,
      )
      expect(out.emitted).toBe(true) // v2 ADMITS where the blanket abstained — the recall lever
      expect(currentOf(ws!)?.family).toBe("negation")
      expect(abstainedOf(ws!)).toBeUndefined() // no abstention: the blanket was NOT consulted on the v2 path
    },
  )

  it(
    "escape-open: a target that ESCAPES ABSTAINS (durable, witness = the sites) — the index under-sees X, so " +
      '"uncalled in S" is unprovable. MUTANT (ignore targetEscapes) would ADMIT a lie',
    () => {
      const out = v2Door({ escapeSites: ["src/pay/a.ts#arg"], dynChannels: [] }).emit(
        negation(),
        NaN as unknown as Hash,
      )
      expect(out.emitted).toBe(false)
      const rec = abstainedOf(ws!)
      expect(rec?.reason).toBe("escape-open")
      expect(rec?.witness.underApproxSources).toEqual(["src/pay/a.ts#arg"])
      expect(currentOf(ws!)).toBeUndefined()
    },
  )

  it(
    "scope-dynamic (lucy CRITICAL): a scope with an opaque `ns[key]()` channel ABSTAINS — X is reachable at " +
      "runtime with NO emitted occurrence, so ¬escape + no-reverse-caller are NOT enough. MUTANT (ignore " +
      "dynamicReach) would ADMIT the exact false negative lucy found",
    () => {
      // The teeth of the false-admit channel: targetEscapes==[] (every KNOWN ref of X is safe) AND no caller in S,
      // so all occurrence-based clauses pass. Only dynamicReach catches the static `import * as ns; ns[key]()`.
      const out = v2Door({ escapeSites: [], dynChannels: ["src/pay/b.ts#ns[key]"] }).emit(
        negation(),
        NaN as unknown as Hash,
      )
      expect(out.emitted).toBe(false)
      const rec = abstainedOf(ws!)
      expect(rec?.reason).toBe("scope-dynamic")
      expect(rec?.witness.underApproxSources).toEqual(["src/pay/b.ts#ns[key]"])
      expect(currentOf(ws!)).toBeUndefined()
    },
  )

  it(
    "escape-open PRECEDES scope-dynamic — an escaping target abstains on X first (the more specific defect), " +
      "even when S also has a dynamic channel",
    () => {
      const out = v2Door({ escapeSites: ["src/pay/a.ts#arg"], dynChannels: ["src/pay/b.ts#eval"] }).emit(
        negation(),
        NaN as unknown as Hash,
      )
      expect(out.emitted).toBe(false)
      expect(abstainedOf(ws!)?.reason).toBe("escape-open")
    },
  )

  it(
    "a REAL caller in S still REFUTES under v2 (¬escape ∧ ¬dynamic ⇒ reverseCallers∩S is a COMPLETE " +
      '"reference to X in S") — a decision, not an abstention',
    () => {
      const out = v2Door({ callers: ["src/pay/b.ts"], escapeSites: [], dynChannels: [] }).emit(
        negation(),
        NaN as unknown as Hash,
      )
      expect(out.emitted).toBe(false)
      expect(out.rejected).toBeDefined()
      expect(abstainedOf(ws!)).toBeUndefined() // refutation writes no record
      expect(currentOf(ws!)).toBeUndefined()
    },
  )

  it(
    "#220 STILL HOLDS under v2: a PHANTOM target abstains target-unresolvable (NOT escape-open) — the phantom " +
      "guard runs BEFORE the closure legs, so a vacuous negative never reaches the escape check",
    () => {
      const PHANTOM = "scip:PHANTOM#"
      const out = v2Door({ escapeSites: ["whatever"], dynChannels: ["whatever"] }).emit(
        negation({ target: PHANTOM }),
        NaN as unknown as Hash,
      )
      expect(out.emitted).toBe(false)
      const rec = rehydrateProjection(ws!.store).abstained?.get(String(negationKey(KIND, PHANTOM, S)))
      expect(rec?.reason).toBe("target-unresolvable") // NOT escape-open — the phantom guard is more basic
    },
  )

  it(
    "HALF-GATE: wiring only `targetEscapes` (no `dynamicReach`) FALLS BACK to the sound blanket — the door " +
      "never runs a half-gate, so an unrelated hole in S abstains scope-open exactly as #99b",
    () => {
      ws ??= freshWorkspace()
      const door = createGovernedEmit({
        store: ws.store,
        gate: HOLDS,
        policy: policyOf({ [S]: ["bob"] }),
        actor: "bob",
        ratifyToken: "billy",
        symbolReverse: () => feed([], ["src/pay/a.ts"]),
        axes: axesWithScope(),
        nodeHashOfPath,
        edgeModel: EDGE_MODEL,
        targetEscapes: () => [], // ONLY one leg wired — the other absent
      })
      const out = door.emit(negation(), NaN as unknown as Hash)
      expect(out.emitted).toBe(false) // fell back to the blanket, which sees the hole
      expect(abstainedOf(ws!)?.reason).toBe("scope-open") // NOT admitted via a half-gate
    },
  )

  it(
    "the CLOSED-EMPTY case still ADMITS under v2 (no holes, no escape, no dynamic, no caller) — the grounding " +
      "is the SAME §3 directory anchor",
    () => {
      const out = v2Door({ escapeSites: [], dynChannels: [] }).emit(negation(), NaN as unknown as Hash)
      expect(out.emitted).toBe(true)
      const fact = ws!.store.get(out.emitted ? (out.id as Hash) : ("" as Hash)) as unknown as NegationNode
      expect(fact.grounding.entries[0]!.anchor.kind).toBe("directory")
      expect(String(fact.grounding.entries[0]!.anchor.subtreeHash)).toBe("sh-" + S)
      expect(fact.edgeModel).toBe(EDGE_MODEL)
    },
  )
})
