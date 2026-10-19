// @atlas/adapter-io — test/surface-review-write.test.ts  (D31: the Atlas UI surface's seven review writes)
//
// Each write over a real repository: the empty answer, the missing-actor refusal, hold/release against real staging,
// propose and decide through the REAL composed emit door (surface-index.test.ts's governed fixture), a drafted and a
// person's interview answer over a real store, a memory decision through a PATH scanner, and a territory declaration.

import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { StructRef } from "@atlas/contracts"
import { build } from "@atlas/index"
import { asNodeKey, id } from "@atlas/kernel"
import { emptyStore, upsert } from "@atlas/knowledge"
import type { PredicateSlot } from "@atlas/knowledge"
import { walkFileTree } from "../src/fs.js"
import { createDurableMemory } from "../src/memory-store.js"
import { appendReview, readReview } from "../src/review-log.js"
import { readScip } from "../src/scip.js"
import { createDiskStore } from "../src/store.js"
import { openSurface } from "../src/surface/index.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"

const prior = { actor: process.env.ATLAS_ACTOR, token: process.env.ATLAS_RATIFY_TOKEN }
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  restore("ATLAS_ACTOR", prior.actor)
  restore("ATLAS_RATIFY_TOKEN", prior.token)
  vi.unstubAllEnvs()
})

function restore(name: "ATLAS_ACTOR" | "ATLAS_RATIFY_TOKEN", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

const NOW = "2026-10-18T10:00:00.000Z"
const NO_ACTOR = "no write actor: set ATLAS_ACTOR (or git user.email) to who acts; nothing was written"

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A temporary directory with an empty `.atlas/`, so the surface answers `ok`. */
function atlasDir(): string {
  const dir = tempDir("atlas-surface-write-")
  mkdirSync(join(dir, ".atlas"), { recursive: true })
  return dir
}

/** review-store.test.ts: stage one advisory row per key through the store's own staging commit. */
function stage(dir: string, keys: readonly string[]): void {
  const next = keys.reduce(
    (projection, key) => upsert(projection, { nodeKey: key, contentHash: id({ claim: key }), family: "advisory", claimNorm: key }).store,
    emptyStore(),
  )
  createDiskStore(join(dir, ".atlas", "cas")).commitStaging(() => ({ out: 0, next }))
}

/** surface-index.test.ts `governedRepo`: the fix repo and SCIP index, with `core` granted to alice. */
function governedRepo(): string {
  const repo = makeFixRepo()
  const scip = makeFixScip()
  cleanups.push(scip.cleanup, repo.cleanup)
  mkdirSync(join(repo.repoPath, ".atlas"), { recursive: true })
  writeFileSync(
    join(repo.repoPath, ".atlas", "policy.json"),
    JSON.stringify({ nearDup: { claimNormThreshold: 1 }, t0Heuristic: { keywords: [] }, authz: { scopes: { core: ["alice"] } } }),
  )
  copyFileSync(scip.scipPath, join(repo.repoPath, ".atlas", "index.scip"))
  return repo.repoPath
}

/** surface-index.test.ts `groundedFact`: an advisory anchored at the repository root, which the real truth gate holds. */
function groundedFact(repoPath: string, scope: string): unknown {
  const axes = build(walkFileTree(repoPath), readScip(join(repoPath, ".atlas", "index.scip")))
  const anchor: StructRef = { kind: "repo", qualifiedPath: axes.spatial.key, subtreeHash: axes.spatial.subtreeHash }
  return {
    kind: "advisory",
    id: asNodeKey(`nk-${scope}`),
    tier: "T2",
    claimNorm: `a grounded claim for ${scope}`,
    grounding: { entries: [{ anchor, path: "." }] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope,
  }
}

/** surface-review.test.ts `questionRepo`: a T2 invariant in packages/a (a tier question for k1). */
function questionRepo(): string {
  const repo = makeFixRepo()
  cleanups.push(repo.cleanup)
  mkdirSync(join(repo.repoPath, ".atlas"), { recursive: true })
  writeFileSync(
    join(repo.repoPath, ".atlas", "policy.json"),
    '{"t0Heuristic":{"keywords":[]},"authz":{"scopes":{"packages/b":["alice"]}}}',
  )
  const store = createDiskStore(join(repo.repoPath, ".atlas", "cas"))
  const slot: PredicateSlot = "invariant"
  const contentHash = store.put({ kind: "advisory", tier: "T2", claimNorm: "x holds", authoring: "ADVISORY" } as never) as string
  store.persistProjection(
    upsert(emptyStore(), {
      nodeKey: "k1",
      contentHash,
      family: "advisory",
      claimNorm: "x holds",
      primaryAnchor: "packages/a/src/x.ts::f",
      slot,
      tier: "T2",
    }).store,
  )
  return repo.repoPath
}

function ok<T extends { readonly state: string }>(value: T): Extract<T, { readonly state: "ok" }> {
  if (value.state !== "ok") throw new Error(`expected state ok, got ${value.state}`)
  return value as Extract<T, { readonly state: "ok" }>
}

describe("openSurface — the review writes", () => {
  it("answers empty from every write when the repository has no .atlas directory", () => {
    const surface = openSurface(tempDir("atlas-surface-write-empty-"))
    expect([
      surface.hold({ nodeKey: "nk-a" }),
      surface.release({ nodeKey: "nk-a" }),
      surface.propose({ nodeKey: "nk-a", toTier: "T1", reason: "r" }),
      surface.decide({ proposalId: "p", verdict: "rejected", reason: "r" }),
      surface.answer({ questionId: "q", answer: "a" }),
      surface.memoryDecide({ proposalId: "p", verdict: "discarded" }),
      surface.territory({ name: "api", owner: "backend", tier: "T1", globs: ["packages/api/**"] }),
    ]).toEqual(Array.from({ length: 7 }, () => ({ state: "empty" })))
  })

  it("refuses every review-log write without an actor, and writes nothing", () => {
    const dir = atlasDir()
    process.env.ATLAS_ACTOR = ""
    const surface = openSurface(dir)
    const out = [
      surface.hold({ nodeKey: "nk-a" }),
      surface.release({ nodeKey: "nk-a" }),
      surface.propose({ nodeKey: "nk-a", toTier: "T1", reason: "r" }),
      surface.decide({ proposalId: "p", verdict: "rejected", reason: "r" }),
      surface.answer({ questionId: "q", answer: "a" }),
      surface.memoryDecide({ proposalId: "p", verdict: "discarded" }),
    ]
    for (const write of out) expect(write).toMatchObject({ state: "ok", ok: false, rejected: NO_ACTOR })
    expect(readReview(dir).records).toEqual([])
  })

  it("holds and releases a staged candidate with the CLI's refusals", () => {
    const dir = atlasDir()
    stage(dir, ["nk-a"])
    process.env.ATLAS_ACTOR = "alice"
    const surface = openSurface(dir)
    const held = ok(surface.hold({ nodeKey: "nk-a" }))
    expect([held.ok, typeof held.data?.id]).toEqual([true, "string"])
    expect(held.guidance.invariant).toContain("REVIEW-LOG (D14)")
    expect(ok(surface.review()).held).toEqual(["nk-a"])
    expect(ok(surface.hold({ nodeKey: "nk-a" })).rejected).toBe("'nk-a' is already held — nothing was written")
    expect(ok(surface.hold({ nodeKey: "nk-zz" })).rejected).toBe(
      "hold: no staged candidate has nodeKey 'nk-zz' — `atlas promote` prints each staged row's nodeKey",
    )
    expect(ok(surface.release({ nodeKey: "nk-a" })).ok).toBe(true)
    expect(ok(surface.release({ nodeKey: "nk-a" })).rejected).toBe("release: 'nk-a' is not held — `atlas hold` holds a staged candidate")
    expect(readReview(dir).records.map((r) => [r.kind, r.by])).toEqual([
      ["hold", "alice"],
      ["release", "alice"],
    ])
  })

  it("proposes a current fact, refuses a ratification without a token, and ratifies with one through the composed door", () => {
    const repoPath = governedRepo()
    process.env.ATLAS_ACTOR = "alice"
    delete process.env.ATLAS_RATIFY_TOKEN
    const surface = openSurface(repoPath)
    const emitted = ok(surface.emit({ fact: groundedFact(repoPath, "core"), at: "cafe" })).data
    expect(emitted?.emitted).toBe(true)
    // The governed door keys the node by its anchor and slot, not by the fact's own id.
    const key = emitted?.nodeKey ?? ""
    expect(ok(surface.propose({ nodeKey: "nk-none", toTier: "T1", reason: "r" })).rejected).toBe(
      "propose: no current fact has nodeKey 'nk-none'",
    )
    const proposed = ok(surface.propose({ nodeKey: key, toTier: "T1", reason: "reviewed" }))
    const proposalId = proposed.data?.id ?? ""
    expect(ok(surface.propose({ nodeKey: key, toTier: "T1", reason: "again" })).rejected).toBe(
      `propose: '${key}' already has an open T1 proposal ${proposalId}`,
    )
    const unratified = ok(surface.decide({ proposalId, verdict: "ratified", reason: "looks right" }))
    expect(unratified.ok).toBe(false)
    expect(unratified.rejected).toContain("no decision was written and the proposal stays open")
    const ratified = ok(surface.decide({ proposalId, verdict: "ratified", reason: "looks right", token: "t1" }))
    expect(ratified.rejected).toBeUndefined()
    expect(ratified.ok).toBe(true)
    expect(process.env.ATLAS_RATIFY_TOKEN).toBeUndefined()
    expect(ok(surface.review()).proposals).toEqual([])
    expect(ok(surface.propose({ nodeKey: key, toTier: "T1", reason: "r" })).rejected).toBe(
      `propose: '${key}' is already T1; a proposal must raise the tier`,
    )
    const core = ok(surface.propose({ nodeKey: key, toTier: "T0", reason: "core rule" }))
    const rejected = ok(surface.decide({ proposalId: core.data?.id ?? "", verdict: "rejected", reason: "not core" }))
    expect([rejected.ok, rejected.guidance.next]).toEqual([
      true,
      `proposal ${core.data?.id ?? ""} rejected; the fact keeps its tier and the rejection stays in the log`,
    ])
  })

  it("a drafted answer keeps the question open; a person's T1 answer opens the proposal", () => {
    const repoPath = questionRepo()
    process.env.ATLAS_ACTOR = "alice"
    const surface = openSurface(repoPath)
    const tier = ok(surface.review()).interview.batch.find((q) => q.kind === "tier")
    if (tier === undefined) throw new Error("expected a tier question")
    const drafted = ok(surface.answer({ questionId: tier.id, answer: "T1", drafted: { model: "anthropic/claude", why: "a hot invariant" } }))
    expect([drafted.ok, drafted.guidance.next]).toEqual([true, "drafted; the question stays open until a person answers it"])
    const afterDraft = ok(surface.review())
    expect([afterDraft.proposals, afterDraft.interview.batch.find((q) => q.id === tier.id)?.draft?.model]).toEqual([[], "anthropic/claude"])
    const answered = ok(surface.answer({ questionId: tier.id, answer: "T1" }))
    expect(answered.ok).toBe(true)
    const after = ok(surface.review())
    expect(after.proposals.map((p) => [p.nodeKey, p.toTier, p.by])).toEqual([["k1", "T1", "alice"]])
    expect(after.interview.batch.some((q) => q.id === tier.id)).toBe(false)
    expect(ok(surface.answer({ questionId: "q-none", answer: "x" })).rejected).toBe(
      "answer: no open question matches 'q-none' — `atlas interview` lists the open batch (an answered question drops out)",
    )
  })

  it("indexes a memory proposal as its member, discards another, and refuses one that is not open", () => {
    const dir = atlasDir()
    const bin = tempDir("atlas-surface-write-bin-")
    writeFileSync(join(bin, "gitleaks"), "#!/bin/sh\n/bin/cat >/dev/null\nexit 0\n")
    chmodSync(join(bin, "gitleaks"), 0o755)
    vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`)
    process.env.ATLAS_ACTOR = "gus"
    const rule = { kind: "memory-proposal", member: "backend", scope: "packages/api", at: NOW, by: "backend" } as const
    const first = appendReview(dir, { ...rule, rule: "run go vet before the handler tests" })
    const second = appendReview(dir, { ...rule, rule: "never mock the database" })
    const surface = openSurface(dir)
    expect(ok(surface.memoryDecide({ proposalId: first.id, verdict: "indexed" })).ok).toBe(true)
    expect(ok(surface.memoryDecide({ proposalId: second.id, verdict: "discarded" })).ok).toBe(true)
    const rules = createDurableMemory(dir).read().store
    expect(rules.map((r) => [r.owner, (r.entry as { rule: string }).rule])).toEqual([["backend", "run go vet before the handler tests"]])
    expect(ok(surface.review()).memoryProposals).toEqual([])
    expect(ok(surface.memoryDecide({ proposalId: "nope", verdict: "indexed" })).rejected).toBe("no open memory proposal has id 'nope'")
  })

  it("declares a territory with a ratify token and no actor, with the CLI's refusals", () => {
    const dir = atlasDir()
    process.env.ATLAS_ACTOR = ""
    delete process.env.ATLAS_RATIFY_TOKEN
    const surface = openSurface(dir)
    const api = { name: "api", owner: "backend", tier: "T1", globs: ["packages/api/**"] } as const
    expect(ok(surface.territory({ ...api, globs: [] })).rejected).toBe("territory requires <name> and at least one <glob>")
    expect(ok(surface.territory(api)).rejected).toContain("set ATLAS_RATIFY_TOKEN")
    expect(ok(surface.territory({ ...api, tier: "T0", token: "lucy" })).rejected).toBe(
      "territory: a T0 territory needs ATLAS_RATIFY_TOKEN=billy; nothing was written",
    )
    expect(ok(surface.territory({ ...api, token: "lucy" })).rejected).toContain("no TERRITORY-CATALOG.json exists yet")
    const declared = ok(surface.territory({ ...api, token: "lucy", projectId: "proj-1" }))
    expect([declared.ok, declared.data?.id]).toEqual([true, join(dir, "TERRITORY-CATALOG.json")])
    expect(declared.guidance.invariant).toContain("TERRITORY (D22)")
    expect(existsSync(join(dir, "TERRITORY-CATALOG.json"))).toBe(true)
    expect(process.env.ATLAS_RATIFY_TOKEN).toBeUndefined()
  })
})
