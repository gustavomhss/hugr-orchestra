// @atlas/adapter-io — test/harness/governed-fixtures.ts  (shared doubles for the governed emit door)
//
// The fakes + fact builders both governed-emit suites are written against. Extracted when the emit suite
// crossed the repo's 400-LOC ceiling: the alternative was to keep one file growing, and a 431-line test
// file is exactly the shape that stops being read. Behaviour-preserving — every double is moved verbatim.

import { id, asNodeKey, asSubtreeHash, asHash } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import { emptyStore, nodeKey } from "@atlas/knowledge"
import type { GroundedFact, StoreProjection, Candidate } from "@atlas/knowledge"
import type { TruthGate } from "@atlas/tools"
import type { DiskStore } from "../../src/store.js"
import type { AtlasPolicy } from "../../src/policy.js"

// ── fakes ────────────────────────────────────────────────────────────────────────────────────────────

/** A fake DiskStore over an in-memory CAS that RECORDS every `put`/`persistProjection` so the teeth can
 *  assert exactly what the governed path persisted (or, on a denied write, that NOTHING was persisted). */
export interface StoreSpy {
  readonly store: DiskStore
  readonly puts: () => readonly CasObject[]
  readonly persists: () => readonly StoreProjection[]
}
export function makeStoreSpy(): StoreSpy {
  const cas = new Map<string, CasObject>()
  const puts: CasObject[] = []
  const persists: StoreProjection[] = []
  const store: DiskStore = {
    put(obj) {
      puts.push(obj)
      const h = id(obj)
      cas.set(h as unknown as string, obj)
      return h
    },
    get(h) {
      return cas.get(h as unknown as string)
    },
    // The ATOMIC commit, faked over the same in-memory list. In-process and single-threaded, so there is no
    // race to lose — but the ORDER the real protocol enforces is reproduced exactly, because two teeth
    // depend on it: `put` runs BEFORE the projection is published (so a throwing `put` persists nothing),
    // and a decision with no `next` writes nothing at all (every governed refusal).
    commitProjection(decide) {
      const decision = decide(persists.length > 0 ? persists[persists.length - 1]! : emptyStore())
      if (decision.next === undefined) return { settled: true, out: decision.out }
      for (const obj of decision.put ?? []) store.put(obj as CasObject)
      persists.push(decision.next)
      return { settled: true, out: decision.out }
    },
    commitStaging(decide) {
      const decision = decide(emptyStore())
      return { settled: true, out: decision.out }
    },
    persistProjection(p) {
      persists.push(p)
    },
    loadProjection() {
      return persists.length > 0 ? persists[persists.length - 1] : undefined
    },
    // ADR-0008's STAGING door. This double never stages — `mine` is the only stager and it is not under
    // test here — but an incomplete literal is a type error. (`persistStaging`/`loadStaging` were deleted in
    // task #83: `commitStaging` is now the only staging door.)
  }
  return { store, puts: () => puts, persists: () => persists }
}

export const HOLDS_GATE: TruthGate = { gateHolds: () => "HOLDS" }
export const NA_GATE: TruthGate = { gateHolds: () => "NA" }

/** A policy granting actor `alice` write access to scope `core` — everyone else / every other scope denies. */
export const POLICY: AtlasPolicy = {
  t0Heuristic: { keywords: [] },
  authz: { scopes: { core: ["alice"] } },
}

/** A grounded advisory fact; `scope` present only when supplied (exactOptionalPropertyTypes-safe). `tier`
 *  defaults to the auto-accept `T2` — a `T0` fact exercises the KNOW-8 full-ratify gate. */
export function advisory(scope?: string, tier: GroundedFact["tier"] = "T2"): GroundedFact {
  const base = {
    kind: "advisory" as const,
    id: asNodeKey("nk-governed-1"),
    tier,
    claimNorm: "a governed claim body",
    grounding: {
      entries: [
        {
          anchor: {
            kind: "symbol" as const,
            qualifiedPath: "src/util.ts::greet",
            subtreeHash: asSubtreeHash("sh-greet"),
          },
          path: "src/util.ts",
        },
      ],
    },
    freshness: "FRESH" as const,
    claims: [],
    authoring: "ADVISORY" as const,
  }
  return scope === undefined ? base : { ...base, scope }
}

/** A grounded advisory with an OVERRIDABLE payload `id`, primary anchor, and claim body — so a test can
 *  hold the REAL identity (anchor+slot) fixed while VARYING the author-declared `id`, or spoof one.
 *  `tier` is likewise overridable (default `T2`) so a test can hold the identity fixed while varying the
 *  DECLARED governance class — the exact shape of the confused-deputy attack below. */
export function mkAdvisory(opts: {
  id: string
  anchor: string
  claimNorm: string
  scope?: string
  tier?: GroundedFact["tier"]
}): GroundedFact {
  const base = {
    kind: "advisory" as const,
    id: asNodeKey(opts.id),
    tier: opts.tier ?? ("T2" as const),
    claimNorm: opts.claimNorm,
    grounding: {
      entries: [
        {
          anchor: { kind: "symbol" as const, qualifiedPath: opts.anchor, subtreeHash: asSubtreeHash("sh-x") },
          path: "x",
        },
      ],
    },
    freshness: "FRESH" as const,
    claims: [],
    authoring: "ADVISORY" as const,
  }
  return opts.scope === undefined ? base : { ...base, scope: opts.scope }
}

/** A grounded PREDICATE fact (carries a `check`) — `route` sends ANY predicate to full-ratify (KNOW-18). */
export function predicate(scope: string, tier: GroundedFact["tier"] = "T2"): GroundedFact {
  return {
    kind: "predicate",
    id: asNodeKey("nk-governed-pred"),
    tier,
    check: { kind: "assertion", expr: "balance >= 0" },
    grounding: {
      entries: [
        {
          anchor: { kind: "symbol", qualifiedPath: "src/util.ts::guard", subtreeHash: asSubtreeHash("sh-guard") },
          path: "src/util.ts",
        },
      ],
    },
    status: "HOLDS",
    freshness: "FRESH",
    claims: [],
    authoring: "PREDICATED",
    scope,
  }
}

export const realKey = (f: GroundedFact): string => nodeKey(f as unknown as Candidate) as unknown as string

export const AT = asHash("deadbeef")
