// Frozen genesis-multifact contract: real disk CAS/upsert/promote/emit, injected truth verdict ONLY.
// HOLDS_GATE does not prove actual source grounding; the bounded campaign owns that evidence.
import { afterEach, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { asHash, id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { upsert } from "@atlas/knowledge"
import type { CurrentNode, GroundedFact, WriteRequest } from "@atlas/knowledge"
import type { EmitOut } from "@atlas/tools"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { createGovernedPromote, REJECTED_QUARANTINED } from "../src/governed-promote.js"
import type { PromoteOut } from "../src/governed-promote.js"
import { HOLDS_GATE } from "./harness/governed-fixtures.js"
import { CURATOR, CURATOR_POLICY, minedFact, realKey } from "./harness/promote-fixtures.js"
import { reasonOf } from "./door-regression-support.js"

const AT = asHash("deadbeef")
const CLAIMS = ["cache reads update recency", "cache misses preserve recency"] as const
const dirs: string[] = []
type Receipt = NonNullable<WriteRequest["claimEvidenceByClaim"]>[string]
type EmitOptions = { readonly replace?: true; readonly claimReceipt?: Receipt }
// Future options are a TYPE boundary only: the function invoked remains the real baseline emit.
type ReceiptEmit = (node: GroundedFact, at: Hash, opts?: EmitOptions) => EmitOut

afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function staged(opts: { answer?: boolean; quarantine?: number; legacy?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "atlas-promote-claims-"))
  dirs.push(dir)
  const cas = join(dir, "cas")
  const store = createDiskStore(cas)
  const facts = CLAIMS.slice(0, opts.legacy ? 1 : 2).map((claimNorm, i) => {
    const fact = minedFact({ anchor: "src/cache.ts::get", claimNorm })
    if (fact.kind !== "advisory") throw new Error("expected an advisory fixture")
    return {
      ...fact, predicateSlot: "gotcha" as const, seal: "justified" as const,
      derivation: i === 0 ? "the hit branch calls touch before returning" : "the miss returns before touch",
      ...(opts.quarantine === i ? { quarantine: "abstained-proof" as const } : {}),
    }
  })
  const answer = JSON.stringify({ facts: facts.map((f) => ({ claim: f.claimNorm, slot: f.predicateSlot, derivation: f.derivation })) })
  const answerRef = opts.answer === false ? undefined : String(store.put(answer))
  const receipts = facts.map((f) => ({ factRef: String(store.put(f as unknown as CasObject)), ...(answerRef === undefined ? {} : { answerRef }) }))
  const evidence = Object.fromEntries(facts.map((f, i) => [f.claimNorm, receipts[i]!]))
  const key = realKey(facts[0]!)
  expect(facts.map(realKey)).toEqual(facts.map(() => key))
  expect(store.commitStaging((projection) => ({
    out: true,
    next: facts.reduce((p, f, i) => upsert(p, {
      nodeKey: key, contentHash: receipts[i]!.factRef, family: "advisory", claimNorm: f.claimNorm,
      primaryAnchor: "src/cache.ts::get", slot: f.predicateSlot, scope: f.scope!, tier: f.tier,
      ...(opts.legacy ? {} : { claimEvidenceByClaim: { [f.claimNorm]: receipts[i]! } }),
    }).store, projection),
  }))).toEqual({ settled: true, out: true })
  const read = store.commitStaging((p) => ({ out: p }))
  if (!read.settled) throw new Error(`staging fixture refused: ${read.refusal}`)
  expect([...read.out.current.keys()]).toEqual([key])
  expect(read.out.current.get(key)!.claims).toEqual(facts.map((f) => f.claimNorm))
  if (!opts.legacy) expect(read.out.current.get(key)!.claimEvidenceByClaim).toEqual(evidence)
  return { store, cas, facts, key, receipts, evidence, answer }
}

function doors(store: DiskStore, opts: { ratifyToken?: string; refuseClaim?: string; origin?: "authored" | "promoted" } = {}) {
  const gateCalls: GroundedFact[] = []
  const presented: { node: GroundedFact; opts?: EmitOptions }[] = []
  const emit = createGovernedEmit({
    store, actor: CURATOR, policy: CURATOR_POLICY, origin: opts.origin ?? "promoted",
    ...(opts.ratifyToken === undefined ? {} : { ratifyToken: opts.ratifyToken }),
    gate: { gateHolds: (node, at) => {
      gateCalls.push(node)
      return node.kind === "advisory" && node.claimNorm === opts.refuseClaim ? "NA" : HOLDS_GATE.gateHolds(node, at)
    } },
  }).emit as unknown as ReceiptEmit
  const promoter = createGovernedPromote({ store, emit: (node, at, options?: EmitOptions) => {
    presented.push({ node, ...(options === undefined ? {} : { opts: options }) })
    return emit(node, at, options)
  } })
  return { ...promoter, emit, gateCalls, presented }
}

function counts(out: PromoteOut, promoted: number, refused: number) {
  expect(out).toMatchObject({ read: true, candidates: promoted + refused, promoted, refused })
  expect(out.rows).toHaveLength(out.candidates)
  expect(out.rows.filter((r) => r.settled)).toHaveLength(promoted)
  expect(out.promoted + out.refused).toBe(out.candidates)
}

function amend(fx: ReturnType<typeof staged>, change: (row: CurrentNode) => CurrentNode) {
  expect(fx.store.commitStaging((p) => ({
    out: true, next: { ...p, current: new Map([[fx.key, change(p.current.get(fx.key)!)]]) },
  }))).toEqual({ settled: true, out: true })
}

it("ratifies both distinct CAS claims into one row, preserving receipts across disk reload and repeated promotion", () => {
  const fx = staged()
  expect(fx.receipts[0]!.factRef).not.toBe(fx.receipts[1]!.factRef)
  expect(fx.facts[0]!.derivation).not.toBe(fx.facts[1]!.derivation)
  const door = doors(fx.store, { ratifyToken: CURATOR })
  counts(door.promote(AT), 1, 0)
  expect(door.gateCalls).toEqual(fx.facts)
  expect(door.presented.map((p) => p.opts?.claimReceipt)).toEqual(fx.receipts)
  const reopened = createDiskStore(fx.cas)
  const before = reopened.loadProjection()!
  expect([...before.current.keys()]).toEqual([fx.key])
  expect(before.current.get(fx.key)!.claims).toEqual([...CLAIMS])
  expect(before.current.get(fx.key)!.claimEvidenceByClaim).toEqual(fx.evidence)
  fx.receipts.forEach((r, i) => {
    expect(reopened.get(asHash(r.factRef))).toEqual(fx.facts[i])
    expect(reopened.get(asHash(r.answerRef!))).toBe(fx.answer)
  })
  const again = doors(reopened, { ratifyToken: CURATOR })
  counts(again.promote(AT), 1, 0)
  expect(again.gateCalls).toEqual(fx.facts)
  expect(createDiskStore(fx.cas).loadProjection()!.current).toEqual(before.current)
  counts(doors(reopened).promote(AT), 0, 1) // token withdrawal cannot silently self-commit on replay
  expect(createDiskStore(fx.cas).loadProjection()!.current).toEqual(before.current)
})

it("without a ratifier refuses the entire row and leaves no projected facts", () => {
  const fx = staged()
  const out = doors(fx.store).promote(AT)
  counts(out, 0, 1)
  expect(reasonOf(out.rows[0]!.rejected)).toBe("unratified")
  expect(createDiskStore(fx.cas).loadProjection()?.current.size ?? 0).toBe(0)
})

it("a held place presents neither claim even when explicitly selected", () => {
  const fx = staged()
  const door = doors(fx.store, { ratifyToken: CURATOR })
  const out = door.promote(AT, { only: [fx.key], held: new Set([fx.key]) })
  counts(out, 0, 0)
  expect(out.held).toEqual([fx.key])
  expect(door.presented).toEqual([])
  expect(door.gateCalls).toEqual([])
  expect(fx.store.loadProjection()).toBeUndefined()
})

it.each([0, 1])("quarantined claim %i blocks its whole place before either claim gate", (quarantine) => {
  const fx = staged({ quarantine })
  const door = doors(fx.store, { ratifyToken: CURATOR })
  const out = door.promote(AT)
  counts(out, 0, 1)
  expect(out.rows[0]!.rejected).toBe(REJECTED_QUARANTINED)
  expect(door.presented).toEqual([])
  expect(door.gateCalls).toEqual([])
  expect(fx.store.loadProjection()).toBeUndefined()
  expect(fx.store.commitStaging((p) => ({ out: p.current.get(fx.key) }))).toMatchObject({
    settled: true, out: { claims: [...CLAIMS], claimEvidenceByClaim: fx.evidence },
  })
})

it.each(["missing carrier", "missing receipt", "bad factRef", "absent fact", "wrong claim", "bad answerRef", "absent answer"])(
  "preflights ALL receipts: a second claim with %s prevents even the first claim gate", (fault) => {
    const fx = staged()
    const absent = String(id("never stored"))
    amend(fx, (row) => {
      if (fault === "missing carrier") {
        const { claimEvidenceByClaim: _removed, ...legacy } = row
        return legacy // a multi-claim place may NOT fall back to its representative contentHash
      }
      const receipts: Record<string, Receipt> = { ...fx.evidence }
      const second = fx.receipts[1]!
      if (fault === "missing receipt") delete receipts[CLAIMS[1]]
      if (fault === "bad factRef") receipts[CLAIMS[1]] = { ...second, factRef: "../outside" }
      if (fault === "absent fact") receipts[CLAIMS[1]] = { ...second, factRef: absent }
      if (fault === "wrong claim") receipts[CLAIMS[1]] = fx.receipts[0]!
      if (fault === "bad answerRef") receipts[CLAIMS[1]] = { ...second, answerRef: "../outside" }
      if (fault === "absent answer") receipts[CLAIMS[1]] = { ...second, answerRef: absent }
      return { ...row, claimEvidenceByClaim: receipts }
    })
    const door = doors(fx.store, { ratifyToken: CURATOR })
    const out = door.promote(AT)
    counts(out, 0, 1)
    expect(out.rows[0]!.rejected).toBeTruthy()
    expect(door.presented).toEqual([])
    expect(door.gateCalls).toEqual([])
    expect(createDiskStore(fx.cas).loadProjection()).toBeUndefined()
  },
)

it("an optional absent answer still preserves both original fact receipts", () => {
  const fx = staged({ answer: false })
  const door = doors(fx.store, { ratifyToken: CURATOR })
  counts(door.promote(AT), 1, 0)
  expect(door.gateCalls).toEqual(fx.facts)
  expect(createDiskStore(fx.cas).loadProjection()!.current.get(fx.key)!.claimEvidenceByClaim).toEqual(fx.evidence)
  fx.receipts.forEach((r) => expect(Object.hasOwn(r, "answerRef")).toBe(false))
})

it("legacy single-claim carrierless staging keeps the existing ratification and idempotence behavior", () => {
  const fx = staged({ legacy: true })
  counts(doors(fx.store).promote(AT), 0, 1)
  const door = doors(fx.store, { ratifyToken: CURATOR })
  counts(door.promote(AT), 1, 0)
  expect(door.gateCalls).toEqual(fx.facts)
  const before = createDiskStore(fx.cas).loadProjection()!.current
  expect(before.get(fx.key)!.claims).toEqual([CLAIMS[0]])
  counts(door.promote(AT), 1, 0)
  expect(createDiskStore(fx.cas).loadProjection()!.current).toEqual(before)
})

it("a real second truth-gate refusal leaves first settlement durable but reports ZERO promoted rows", () => {
  const fx = staged()
  const door = doors(fx.store, { ratifyToken: CURATOR, refuseClaim: CLAIMS[1] })
  const out = door.promote(AT)
  counts(out, 0, 1)
  expect(out.rows[0]).toMatchObject({ nodeKey: fx.key, settled: false })
  expect(reasonOf(out.rows[0]!.rejected)).toBe("ungrounded")
  expect(door.gateCalls).toEqual(fx.facts)
  // No cross-claim transactionality: the successful first emit is not rolled back or hidden.
  const row = createDiskStore(fx.cas).loadProjection()!.current.get(fx.key)!
  expect(row.claims).toEqual([CLAIMS[0]])
  expect(row.claimEvidenceByClaim).toEqual({ [CLAIMS[0]]: fx.receipts[0] })
  expect(fx.store.commitStaging((p) => ({ out: p.current.get(fx.key) }))).toMatchObject({
    settled: true, out: { claims: [...CLAIMS], claimEvidenceByClaim: fx.evidence },
  })
})

it.each(["options", "bad options", "payload", "both"])("authored %s cannot forge the durable receipt carrier", (source) => {
  const fx = staged()
  const receipt = source === "bad options" ? { factRef: String(id("never stored")) } : fx.receipts[0]!
  const fact = fx.facts[0]!
  const payload = source === "options" || source === "bad options" ? fact : {
    ...fact, claimReceipt: receipt, claimEvidenceByClaim: { [fact.claimNorm]: receipt },
  }
  const out = doors(fx.store, { origin: "authored" }).emit(payload, AT,
    source === "payload" ? undefined : { claimReceipt: receipt })
  expect(out.emitted).toBe(true) // ignored context, not a new authored ratification requirement
  const reloaded = createDiskStore(fx.cas)
  const row = reloaded.loadProjection()!.current.get(fx.key)!
  expect(row.claimEvidenceByClaim).toBeUndefined()
  expect(reloaded.get(asHash(row.contentHash))).not.toHaveProperty("claimReceipt")
  expect(reloaded.get(asHash(row.contentHash))).not.toHaveProperty("claimEvidenceByClaim")
})

it.each(["absent fact", "wrong claim", "absent answer"])("promoted emit itself validates %s in trusted options", (fault) => {
  const fx = staged()
  const absent = String(id("never stored"))
  const receipt = fault === "absent fact" ? { ...fx.receipts[0]!, factRef: absent }
    : fault === "wrong claim" ? fx.receipts[1]!
    : { ...fx.receipts[0]!, answerRef: absent }
  const door = doors(fx.store, { ratifyToken: CURATOR })
  expect(door.emit(fx.facts[0]!, AT, { claimReceipt: receipt }).emitted).toBe(false)
  expect(createDiskStore(fx.cas).loadProjection()).toBeUndefined()
})

it("promoted payload-only evidence is not a trusted receipt option", () => {
  const fx = staged()
  const out = doors(fx.store, { ratifyToken: CURATOR }).emit({
    ...fx.facts[0]!, claimEvidenceByClaim: fx.evidence, claimReceipt: fx.receipts[0],
  } as GroundedFact, AT)
  expect(out.emitted).toBe(true)
  expect(createDiskStore(fx.cas).loadProjection()!.current.get(fx.key)!.claimEvidenceByClaim).toBeUndefined()
})
