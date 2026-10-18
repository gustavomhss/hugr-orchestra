// WP-5.16.KNOW · RED/GREEN — the pure predicate check-engine (EPIC-16, KNOW-9/16) against the FROZEN
// `EvaluatorApi` seam (types.ts) over the ratified `Check` union (types.ts).
// Transcribes the visible `-1` goldens SCN-KNOW-9a-1 / 9b-1 / 16a-1 / 16b-1 / 16c-1 / 16d-1 / 16e-1
// (docs/requirements/goldens-knw.md). Held-out `-2` fixtures are NOT referenced here.
//
// BUILD-AHEAD: the sibling facets ship zero runtime yet, so the store (REQ-KNOW-9b) and reconcile
// (REQ-KNOW-16e) seams are supplied as FIXTURE shims honoring their frozen interfaces
// (`StoreApi.evaluator?`, the reconcile verdict-carrier). The evaluator itself is real — no code exec,
// no clock, no IO. No raw hashing (sealed-kernel brand constructors only).

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

// ── fixtures ──────────────────────────────────────────────────────────────────

/** A leaf index node under a given axis. */
const leaf = (axis: IndexNode["axis"], key: string, objects: string[] = []): IndexNode => ({
  axis,
  level: "item",
  key,
  subtreeHash: asSubtreeHash(`st-${key}`),
  children: [],
  objects: objects.map(asHash),
})

/** A pinned index-state root (one axis) carrying the given leaf children. */
const axisRoot = (axis: IndexNode["axis"], children: IndexNode[]): IndexNode => ({
  axis,
  level: "repo",
  key: `${axis}:root`,
  subtreeHash: asSubtreeHash(`root-${axis}`),
  children,
  objects: [],
})

// A structural (spatial) index with a module the check will probe.
const spatialIndex = axisRoot("spatial", [leaf("spatial", "mod:auth", ["obj:token"]), leaf("spatial", "mod:store")])
// A dependency-axis index that does NOT contain the probed edge → the check breaks.
const depIndex = axisRoot("dependency", [leaf("dependency", "dep:auth->store")])

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

describe("WP-5.16.KNOW — predicate check-engine (deterministic index-query, no code execution)", () => {
  // ── REQ-KNOW-9a / 9b — both families day-one; advisory standalone without an evaluator ──

  it("SCN-KNOW-9a-1 — both node families are constructible day-one (predicate not deferred)", () => {
    const adv = advisory("cn-latency")
    const pred = predicate({ kind: "index-query", query: "exists|mod:auth" })
    expect(adv.kind).toBe("advisory")
    expect(pred.kind).toBe("predicate")
    // the predicate family is LIVE, not stubbed — its check evaluates day-one.
    expect(evaluate(pred.check, spatialIndex)).toBe("HOLDS")
  })

  it("SCN-KNOW-9b-1 — the store operates on advisory alone with `evaluator = none`", () => {
    // a minimal store shim honoring the FROZEN `StoreApi.evaluator?` optionality: the advisory
    // emit→query→reconcile cycle must complete WITHOUT ever wiring/invoking an evaluator.
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
        store.evaluator.evaluate({ kind: "assertion", expr: "x" }, spatialIndex)
      }
      return true
    }
    emit(advisory("cn-a"))
    emit(advisory("cn-b"))
    expect(query("cn-a")).toHaveLength(1)
    expect(reconcile()).toBe(true)
    expect(evaluatorInvoked).toBe(false) // advisory never hard-requires the evaluator
  })

  // ── REQ-KNOW-16a — a check evaluates to HOLDS/BROKEN/NA from index state alone ──

  it("SCN-KNOW-16a-1 — a structural index-query yields exactly one of HOLDS/BROKEN/NA", () => {
    const holds = evaluate({ kind: "index-query", query: "exists|mod:auth" }, spatialIndex)
    const broken = evaluate({ kind: "index-query", query: "exists|mod:missing" }, spatialIndex)
    const na = evaluate({ kind: "index-query", query: "unrecognized-op|x" }, spatialIndex)
    expect(holds).toBe("HOLDS")
    expect(broken).toBe("BROKEN")
    expect(na).toBe("NA")
    expect(["HOLDS", "BROKEN", "NA"]).toContain(holds)
    // a dependency-axis edge that is absent from the index breaks (verdict is index-state-determined).
    expect(evaluate({ kind: "index-query", query: "exists|dep:auth->cache" }, depIndex)).toBe("BROKEN")
  })

  // ── REQ-KNOW-16b — a check requiring code execution is not evaluated ──

  it("SCN-KNOW-16b-1 — a code-execution check is refused; no code runs, no sandbox spawns", () => {
    const proposed: ProposedCheck = { kind: "code-exec", script: "rm -rf / && run-tests" }
    const verdict = admit(proposed)
    expect(verdict.evaluable).toBe(false)
    if (!verdict.evaluable) expect(verdict.reason).toBe("code-exec")
    // the refused proposal never becomes a `Check`, so `evaluate` is never reachable for it —
    // the evaluator has NO shell-out path (it only reads the passed IndexNode).
  })

  // ── REQ-KNOW-16c — a runtime-requiring check stays advisory ──

  it("SCN-KNOW-16c-1 — a runtime-requiring check keeps the fact advisory", () => {
    const proposed: ProposedCheck = { kind: "runtime", behavior: "the endpoint returns 200 when called" }
    const verdict = admit(proposed)
    expect(verdict.evaluable).toBe(false)
    // emit consumes the refusal: a non-evaluable check ⇒ the fact is kept advisory, not a predicate.
    const emitted = verdict.evaluable ? predicate(verdict.check) : advisory("cn-runtime")
    expect(emitted.kind).toBe("advisory")
  })

  // ── REQ-KNOW-16d — the evaluator is pure (same index ⇒ same verdict) ──

  it("SCN-KNOW-16d-1 — two runs on the same index state yield the identical verdict (no clock/IO)", () => {
    const evaluator = makeEvaluator()
    const check: Check = { kind: "assertion", expr: "child-count|spatial:root|2" }
    const first = evaluator.evaluate(check, spatialIndex)
    const second = evaluator.evaluate(check, spatialIndex)
    expect(first).toBe(second)
    expect(first).toBe("HOLDS") // spatial:root has exactly the 2 fixture children
  })

  // ── REQ-KNOW-16e — the verdict feeds atlas-reconcile ──

  it("SCN-KNOW-16e-1 — a BROKEN verdict is passed to atlas-reconcile (the input carries it)", () => {
    const feed: VerdictFeed = verdictFor(
      asNodeKey("nk-pred"),
      { kind: "index-query", query: "exists|mod:missing" },
      spatialIndex,
    )
    expect(feed.verdict).toBe("BROKEN")
    // a reconcile shim (frozen consumer, not implemented here) receives the feed — the BROKEN
    // verdict reaches the merge gate rather than being computed-and-dropped.
    const reconcileInput: VerdictFeed[] = []
    const feedReconcile = (f: VerdictFeed): void => {
      reconcileInput.push(f)
    }
    feedReconcile(feed)
    expect(reconcileInput).toContainEqual({ node: asNodeKey("nk-pred"), verdict: "BROKEN" })
  })
})
