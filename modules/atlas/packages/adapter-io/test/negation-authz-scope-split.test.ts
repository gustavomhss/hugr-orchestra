// @atlas/adapter-io — test/negation-authz-scope-split.test.ts  (F3 · WP-96-N — the authz/identity split)
//
// THE REACHABILITY PROOF for the F3 split (owner-ratified 2026-08-11, amends #99b/ADR-0015 D3). A MINED
// negation carries its WITNESS directory as identity (the real scoped-negative it was proven closed over) AND
// a SEPARATE `authzScope = atlas:mined`, because the orchestrator holds `atlas:mined`, not authority over an
// arbitrary source directory. This suite drives the FULL promote leg (stage → `createGovernedPromote` →
// `emitNegation`), over the SAME fakes the door suite uses (N0 feed + axes injected; the "hash" of a path IS
// the path), and proves the three faces the split has to show:
//   (1) SPLIT WORKS — a mined negation (witness `src/pay`, `authzScope: atlas:mined`) by a miner authorized
//       ONLY in `atlas:mined` PROMOTES over a real, non-empty, CLOSED scope, and is QUERYABLE via `negationsOf`.
//   (2) PRE-SPLIT FAILURE — the SAME negation WITHOUT `authzScope` (authz falls back to the witness `src/pay`,
//       which the miner does not own) is REJECTED_UNAUTHORIZED. This is the exact wall F3 removes.
//   (3) ABSTENTION CONTRAST — the split changes authz ONLY: over an OPEN scope the door still ABSTAINS
//       (scope-open), and over an unresolved scope scope-empty — it never fabricates a negative to satisfy authz.
// Plus BACK-COMPAT: a HUMAN negation (no `authzScope`) authorizes on its witness scope exactly as #99b shipped.

import { describe, it, expect, afterEach } from "vitest"
import { asSubtreeHash, asHash } from "@atlas/kernel"
import { negationsOf } from "@atlas/knowledge"
import type { CurrentNode, NegationNode, RelationKind, StoreProjection } from "@atlas/knowledge"
import type { Axes, Axis, IndexNode, SymbolReverseApi } from "@atlas/index"
import type { Hash } from "@atlas/contracts"
import { createGovernedEmit } from "../src/governed-emit.js"
import type { GovernedEmitDeps } from "../src/governed-emit.js"
import { createGovernedPromote } from "../src/governed-promote.js"
import { rehydrateProjection } from "../src/store.js"
import { freshWorkspace, policyOf, reasonOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

const AT = asHash("cafe")
const S = "src/pay" //         the CLOSED witness scope directory the mined negative ranges over (identity)
const MINED_SCOPE = "atlas:mined" // the orchestrator's authz grant (mirrors cli/src/mine-staging.ts MINED_SCOPE)
const TARGET = "scip:X#" //    a GLOBAL SCIP symbol (NOT `local ` — the honest, groundable case)
const KIND: RelationKind = "calls"
const MINER = "atlas:mined-bot"

const nodeHashOfPath = (p: string): Hash => p as unknown as Hash // identity: docHash of a path IS the path

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
    resolves: (sym: string) => sym === TARGET, // #220 — TARGET is the in-index-defined symbol under test
    definesAt: (sym: string) => (sym === TARGET ? ("src/x.ts" as unknown as Hash) : undefined), // #196d — unused by the negation door; a def-site for the resolvable target
  }
}

/** A negation fact AS `decideStaging` (mine-decide.ts) produces it: witness `scope` preserved (identity),
 *  `authzScope` present ONLY on the mined path. `grounding`/`edgeModel`/`id` are placeholders the door rebuilds. */
function negationFact(opts: { authzScope?: string; scope?: string } = {}): NegationNode {
  return {
    kind: "negation",
    id: "ignored" as unknown as NegationNode["id"],
    tier: "T2",
    relationKind: KIND,
    target: TARGET,
    scope: opts.scope ?? S,
    grounding: { entries: [] },
    edgeModel: "ignored",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
    ...(opts.authzScope !== undefined ? { authzScope: opts.authzScope } : {}),
  } as unknown as NegationNode
}

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

/** Stage ONE negation fact onto the store's staging sidecar exactly as `mine` does — bytes into CAS first,
 *  then a row naming their address — so the promote leg reads it back and rehydrates the WHOLE fact from CAS. */
function stage(w: Workspace, fact: NegationNode): void {
  const contentHash = w.store.put(fact as never) as unknown as string
  w.store.commitStaging<undefined>((p) => ({
    out: undefined,
    next: {
      current: new Map<string, CurrentNode>([
        ...p.current,
        ["nk-staged", { nodeKey: "nk-staged", family: "negation", contentHash, claims: [] } as unknown as CurrentNode],
      ]),
      cas: new Set<string>([...p.cas, contentHash]),
    } as unknown as StoreProjection,
    put: [],
  }))
}

/** The promote leg over a door bound to `actor`/`policy`, with the negation completeness deps wired (the
 *  COMPOSE-wired shape) so `emitNegation` decides on merits rather than fail-closing `scope-empty`. */
function promoteWith(
  w: Workspace,
  actor: string,
  scopes: Record<string, readonly string[]>,
  callers: readonly string[],
  holes: readonly string[],
) {
  const emit = createGovernedEmit({
    store: w.store,
    gate: { gateHolds: () => "HOLDS" } as unknown as GovernedEmitDeps["gate"],
    policy: policyOf(scopes),
    actor,
    origin: "promoted",
    ratifyToken: "billy",
    symbolReverse: () => feed(callers, holes),
    axes: axesWithScope(),
    nodeHashOfPath,
    edgeModel: "ts@0.4.0",
  }).emit
  return createGovernedPromote({ store: w.store, emit }).promote(AT as unknown as Hash)
}

describe("F3 (WP-96-N) — negation authz/identity split, proven through the promote leg", () => {
  it("(1) SPLIT WORKS — a MINED negation (authzScope: atlas:mined) over a real CLOSED witness scope PROMOTES and is QUERYABLE", () => {
    ws = freshWorkspace()
    stage(ws, negationFact({ authzScope: MINED_SCOPE })) // witness scope src/pay + authz atlas:mined

    // The miner is authorized ONLY in `atlas:mined` — it holds NO authority over `src/pay`.
    const out = promoteWith(ws, MINER, { [MINED_SCOPE]: [MINER] }, [], [])

    expect(out.read).toBe(true)
    expect(out.candidates).toBe(1)
    expect(out.promoted).toBe(1) // ADMITTED — authz passed on authzScope, scope closed+non-empty ⇒ grounded

    // It is a real, queryable NegationNode over its WITNESS scope (identity preserved), NOT atlas:mined.
    const found = negationsOf(rehydrateProjection(ws.store), "src")
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ target: TARGET, relationKind: KIND, scope: S })
  })

  it("(2) PRE-SPLIT FAILURE — the SAME negation WITHOUT authzScope is REJECTED_UNAUTHORIZED (authz falls back to the foreign witness scope)", () => {
    ws = freshWorkspace()
    stage(ws, negationFact()) // NO authzScope — the pre-split shape

    const out = promoteWith(ws, MINER, { [MINED_SCOPE]: [MINER] }, [], [])

    expect(out.candidates).toBe(1)
    expect(out.promoted).toBe(0)
    expect(reasonOf(out.rows[0]!.rejected)).toBe("unauthorized") // the wall F3 removes: miner ∉ src/pay
    expect(negationsOf(rehydrateProjection(ws.store), "src")).toHaveLength(0)
  })

  it("(3a) ABSTENTION CONTRAST — a MINED negation over an OPEN scope still ABSTAINS scope-open (authz never fabricates a negative)", () => {
    ws = freshWorkspace()
    stage(ws, negationFact({ authzScope: MINED_SCOPE }))

    // `src/pay/a.ts` is a HOLE in S — the scope is OPEN, so the negative cannot be proven closed.
    const out = promoteWith(ws, MINER, { [MINED_SCOPE]: [MINER] }, [], ["src/pay/a.ts"])

    expect(out.promoted).toBe(0)
    expect(out.rows[0]!.rejected ?? "").toContain("scope-open") // the honest abstention, on the WITNESS scope
    expect(negationsOf(rehydrateProjection(ws.store), "src")).toHaveLength(0)
  })

  it("(3b) ABSTENTION CONTRAST — a MINED negation over an UNRESOLVED scope ABSTAINS scope-empty (not admitted to satisfy authz)", () => {
    ws = freshWorkspace()
    stage(ws, negationFact({ authzScope: MINED_SCOPE, scope: "no/such/dir" }))

    const out = promoteWith(ws, MINER, { [MINED_SCOPE]: [MINER] }, [], [])

    expect(out.promoted).toBe(0)
    expect(out.rows[0]!.rejected ?? "").toContain("scope-empty")
  })

  it("BACK-COMPAT — a HUMAN negation (no authzScope) authorizes on its WITNESS scope exactly as #99b shipped", () => {
    ws = freshWorkspace()
    stage(ws, negationFact()) // no authzScope

    // Authorize the actor in the WITNESS scope src/pay (the #99b human-emit shape) — it ADMITS unchanged.
    const out = promoteWith(ws, "alice", { [S]: ["alice"] }, [], [])

    expect(out.promoted).toBe(1)
    expect(negationsOf(rehydrateProjection(ws.store), "src")).toHaveLength(1)
  })
})
