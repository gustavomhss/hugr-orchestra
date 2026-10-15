// @atlas/adapter-io — test/door-regression-support.ts  (DOOR-LEVEL regression fixtures)
//
// Shared plumbing for the `door-regression-*` suites. Each of those suites drives the REAL governed doors
// (`createGovernedEmit` / `createGovernedLink`) over a REAL `createDiskStore` rooted in a temp dir — no
// store double anywhere. That is the whole point of this family: each defect it covers was reproduced at
// the pure-reducer layer, and a reducer-level fix that is never exercised through the COMPOSED path (mint
// the identity, rehydrate the sidecar off disk, read the incumbent fact back out of CAS, persist) has not
// been shown to hold where it actually has to hold. The projection is re-read from disk between steps, so
// no assertion leans on a value the product would otherwise have had to re-derive for itself.
//
// The truth-gate is the ONE seam left as a double (`HOLDS`): re-deriving a citation needs a real repo plus
// a built index, and it is orthogonal to every defect here — all of them live downstream of the truth door.

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { asHash, asNodeKey, asSubtreeHash, id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import { nodeKey } from "@atlas/knowledge"
import type { Candidate, GroundedFact, PredicateSlot } from "@atlas/knowledge"
import type { TruthGate } from "@atlas/tools"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import type { AtlasPolicy } from "../src/policy.js"

/** The vestigial `at` sha the frozen `EmitApi.emit(node, at)` takes (the gate re-derives off the index). */
export const AT = asHash("deadbeef")

/** The truth-gate seam, held open: every defect in this family lives DOWNSTREAM of the truth door. */
export const HOLDS: TruthGate = { gateHolds: gateAlwaysHolds }
function gateAlwaysHolds(): "HOLDS" {
  return "HOLDS"
}

/** A live temp CAS root plus its store; `dispose()` removes the whole workspace. */
export interface Workspace {
  readonly casPath: string
  readonly store: DiskStore
  dispose(): void
}

/** A fresh on-disk workspace: `<tmp>/cas` is the CAS root, so the projection sidecar lands beside it. */
export function freshWorkspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), "atlas-door-regression-"))
  const casPath = join(root, "cas")
  function dispose(): void {
    rmSync(root, { recursive: true, force: true })
  }
  return { casPath, store: createDiskStore(casPath), dispose }
}

/** An admin policy over an explicit scope-to-actors map (the KNOW-11 authz source of truth). */
export function policyOf(scopes: Record<string, readonly string[]>): AtlasPolicy {
  return { t0Heuristic: { keywords: [] }, authz: { scopes } }
}

/**
 * THE DISCRIMINANT of a refusal — the reason NAME, i.e. everything before the first `:`.
 *
 * WHY THIS EXISTS, AND IT IS NOT STYLE. Every refusal constant carries a paragraph of rationale, and those
 * paragraphs QUOTE EACH OTHER BY NAME on purpose: `unverifiable target`'s text says, in as many words, that
 * "a caller without that authority gets `unauthorized for target` in BOTH byte-states". That sentence is
 * exactly right as documentation and it makes `expect(rejected).toContain('unauthorized for target')`
 * VACUOUS IN ONE DIRECTION — the `unverifiable target` string satisfies it too. So a mutant that downgrades
 * `unauthorized for target` into `unverifiable target` (which is the ORACLE this whole ADR-0007 line of work
 * exists to prevent) is INVISIBLE to a substring assertion. Measured, not theorised: it survived the
 * mutation battery until this helper replaced the `toContain` calls.
 *
 * Comparing the discriminant for EQUALITY closes it: the name is the contract, the prose is commentary, and
 * a reason can never be mistaken for the one it merely mentions.
 */
export function reasonOf(rejected: string | undefined): string {
  return (rejected ?? "").split(":")[0]!
}

/** The REAL product identity of a fact — the same `nodeKey(candidateView)` the emit door mints. Never
 *  hand-forged, so no assertion here can pin an identity the product does not actually compute. */
export function keyOf(fact: GroundedFact): string {
  // A RelationNode (ADR-0015 D2) carries no `predicateSlot`; narrow it away. (This helper builds an intrinsic
  // Candidate view — a relation's identity is `relationKey`, not `nodeKey`, so relation facts don't reach here.)
  const slot = fact.kind === "advisory" || fact.kind === "predicate" ? fact.predicateSlot : undefined
  const view = { ...fact, slot } as unknown as Candidate
  return nodeKey(view) as unknown as string
}

/** The REAL content address of a fact — the `id(node)` the door puts into CAS and stores on the node. */
export function hashOf(fact: GroundedFact): string {
  return id(fact as CasObject) as unknown as string
}

/** One grounding entry at `anchor`, shaped exactly as the fixtures the shipped suites author. */
function groundingAt(anchor: string): GroundedFact["grounding"] {
  const anchorRef = { kind: "symbol" as const, qualifiedPath: anchor, subtreeHash: asSubtreeHash("sh-door") }
  return { entries: [{ anchor: anchorRef, path: "x" }] }
}

/** Options both fact builders share. `gen` varies ONLY the author-supplied payload `id` — a field the door
 *  documents it never routes on — so two generations share one `nodeKey` and differ in `contentHash`, which
 *  is exactly the shape of a re-evidence write. `scope` is `unknown`-typed ON PURPOSE: one suite must hand
 *  the door a JSON-reachable NON-string scope, i.e. the value the type system claims cannot arrive. */
export interface FactOpts {
  readonly anchor: string
  readonly scope?: unknown
  readonly tier?: GroundedFact["tier"]
  readonly slot?: PredicateSlot
  readonly gen?: number
}

/** Attach `scope` only when supplied, so an omitted scope stays ABSENT (exactOptionalPropertyTypes). */
function withScope(base: object, scope: unknown): GroundedFact {
  if (scope === undefined) return base as unknown as GroundedFact
  return { ...base, scope } as unknown as GroundedFact
}

/** A grounded ADVISORY fact (no `check`) at `opts.anchor`. */
export function advisoryFact(opts: FactOpts & { claimNorm: string }): GroundedFact {
  const base = {
    kind: "advisory" as const,
    id: asNodeKey("gen-" + String(opts.gen ?? 1)),
    tier: opts.tier ?? ("T2" as const),
    claimNorm: opts.claimNorm,
    grounding: groundingAt(opts.anchor),
    freshness: "FRESH" as const,
    claims: [],
    authoring: "ADVISORY" as const,
    predicateSlot: opts.slot ?? ("invariant" as const),
  }
  return withScope(base, opts.scope)
}

/** A grounded PREDICATE fact — it carries a `check`, so `route` sends it to full ratification, and a second
 *  generation with the SAME `check` mints the SAME `nodeKey`, which is what makes a write a SUPERSEDE. */
export function predicateFact(opts: FactOpts & { expr: string }): GroundedFact {
  const base = {
    kind: "predicate" as const,
    id: asNodeKey("gen-" + String(opts.gen ?? 1)),
    tier: opts.tier ?? ("T2" as const),
    check: { kind: "assertion" as const, expr: opts.expr },
    grounding: groundingAt(opts.anchor),
    status: "HOLDS" as const,
    freshness: "FRESH" as const,
    claims: [],
    authoring: "PREDICATED" as const,
    predicateSlot: opts.slot ?? ("invariant" as const),
  }
  return withScope(base, opts.scope)
}
