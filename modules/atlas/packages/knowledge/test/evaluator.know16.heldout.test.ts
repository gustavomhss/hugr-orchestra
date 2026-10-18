// WP-5.16.KNOW · HELD-OUT GATE — the `-2` fixtures (held_out:true) from docs/requirements/goldens-knw.md,
// authored by COLD REVIEW against the EXISTING src (packages/knowledge/src/evaluator.ts). These were NOT
// visible to the builder. Same frozen `EvaluatorApi` seam + ratified `Check` union; no code exec, no IO.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey, asHash } from "@atlas/kernel"
import type { IndexNode } from "@atlas/index"
import type { AdvisoryNode, PredicateNode, Check } from "@atlas/knowledge"
import {
  admit,
  evaluate,
  makeEvaluator,
  verdictFor,
  type ProposedCheck,
  type VerdictFeed,
} from "../src/lifecycle/evaluator.js"

const leaf = (axis: IndexNode["axis"], key: string, objects: string[] = []): IndexNode => ({
  axis,
  level: "item",
  key,
  subtreeHash: asSubtreeHash(`st-${key}`),
  children: [],
  objects: objects.map(asHash),
})
const axisRoot = (axis: IndexNode["axis"], children: IndexNode[]): IndexNode => ({
  axis,
  level: "repo",
  key: `${axis}:root`,
  subtreeHash: asSubtreeHash(`root-${axis}`),
  children,
  objects: [],
})

// A dependency index that DOES contain an import edge auth->store (the invariant "no import" is violated).
const depWithImport = axisRoot("dependency", [leaf("dependency", "dep:auth->store")])
const spatialIndex = axisRoot("spatial", [leaf("spatial", "mod:auth", ["obj:token"]), leaf("spatial", "mod:store")])

const grounding = { entries: [] } as unknown as PredicateNode["grounding"]
const predicate = (check: Check): PredicateNode => ({
  kind: "predicate",
  id: asNodeKey("nk-pred"),
  tier: "T2",
  check,
  grounding,
  status: "NA",
  freshness: "FRESH",
  claims: [],
  authoring: "PREDICATED",
})
const advisory = (claimNorm: string): AdvisoryNode => ({
  kind: "advisory",
  id: asNodeKey(`nk-${claimNorm}`),
  tier: "T2",
  claimNorm,
  grounding,
  freshness: "FRESH",
  claims: [],
  authoring: "ADVISORY",
})

describe("WP-5.16.KNOW — HELD-OUT (-2 fixtures)", () => {
  it("SCN-KNOW-9a-2 — a chk-tail predicate and a cn-latency advisory both construct day-one", () => {
    const adv = advisory("cn-latency")
    const pred = predicate({ kind: "index-query", query: "exists|mod:auth" }) // the `chk-tail` predicate
    expect(adv.kind).toBe("advisory")
    expect(pred.kind).toBe("predicate")
    // predicate family is LIVE day-one — its check evaluates, not stubbed/deferred.
    expect(evaluate(pred.check, spatialIndex)).toBe("HOLDS")
  })

  it("SCN-KNOW-9b-2 — a 3-node advisory corpus (2 territories) runs emit→query→reconcile, no evaluator", () => {
    let evaluatorInvoked = false
    // `= {}`, not `= { evaluator: undefined }`: `evaluator?` is exactOptionalPropertyTypes-optional, so an
    // explicit-undefined value does not satisfy it. ABSENT is also the more faithful reading of "evaluator =
    // none", and it is runtime-identical here (the only use is the `if (store.evaluator)` guard below).
    const store: { readonly evaluator?: ReturnType<typeof makeEvaluator> } = {}
    const corpus: AdvisoryNode[] = []
    const emit = (n: AdvisoryNode): void => {
      corpus.push(n)
    }
    const query = (cn: string): AdvisoryNode[] => corpus.filter((n) => n.claimNorm === cn)
    const reconcile = (): boolean => {
      if (store.evaluator) {
        evaluatorInvoked = true
      }
      return true
    }
    // 3 advisory nodes across 2 territories (encoded in the claim body — evaluator-free path)
    emit(advisory("cn-tA-1"))
    emit(advisory("cn-tA-2"))
    emit(advisory("cn-tB-1"))
    expect(corpus).toHaveLength(3)
    expect(query("cn-tA-1")).toHaveLength(1)
    expect(reconcile()).toBe(true)
    expect(evaluatorInvoked).toBe(false)
  })

  it('SCN-KNOW-16a-2 — a dependency-axis check ("no import from X") evaluates to BROKEN from index alone', () => {
    // "no import from territory X" ⇒ the invariant is `absent|<edge>`; the index CONTAINS the edge ⇒ BROKEN.
    const verdict = evaluate({ kind: "index-query", query: "absent|dep:auth->store" }, depWithImport)
    expect(verdict).toBe("BROKEN")
    expect(["HOLDS", "BROKEN", "NA"]).toContain(verdict)
  })

  it("SCN-KNOW-16b-2 — a check needing a spawned test-runner subprocess is refused; no code runs", () => {
    const proposed: ProposedCheck = { kind: "code-exec", script: "vitest run --spawn packages/**" }
    const verdict = admit(proposed)
    expect(verdict.evaluable).toBe(false)
    if (!verdict.evaluable) expect(verdict.reason).toBe("code-exec")
  })

  it("SCN-KNOW-16c-2 — an endpoint-returns-200 runtime check stays advisory", () => {
    const proposed: ProposedCheck = { kind: "runtime", behavior: "the endpoint returns 200 when called" }
    const verdict = admit(proposed)
    expect(verdict.evaluable).toBe(false)
    const emitted = verdict.evaluable ? predicate(verdict.check) : advisory("cn-endpoint-200")
    expect(emitted.kind).toBe("advisory")
  })

  it("SCN-KNOW-16d-2 — a different structural check yields an identical verdict across three runs", () => {
    const evaluator = makeEvaluator()
    const check: Check = { kind: "index-query", query: "has-object|obj:token" }
    const r1 = evaluator.evaluate(check, spatialIndex)
    const r2 = evaluator.evaluate(check, spatialIndex)
    const r3 = evaluator.evaluate(check, spatialIndex)
    expect(r1).toBe(r2)
    expect(r2).toBe(r3)
    expect(r1).toBe("HOLDS") // obj:token hangs off mod:auth in the fixture index
  })

  it("SCN-KNOW-16e-2 — a second BROKEN verdict on a different node feeds atlas-reconcile", () => {
    const feed: VerdictFeed = verdictFor(
      asNodeKey("nk-pred-2"),
      { kind: "index-query", query: "exists|mod:missing" },
      spatialIndex,
    )
    expect(feed.verdict).toBe("BROKEN")
    const reconcileInput: VerdictFeed[] = []
    const feedReconcile = (f: VerdictFeed): void => {
      reconcileInput.push(f)
    }
    feedReconcile(feed)
    expect(reconcileInput).toContainEqual({ node: asNodeKey("nk-pred-2"), verdict: "BROKEN" })
  })
})
