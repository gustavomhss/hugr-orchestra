// @atlas/adapter-io — test/surface-index.test.ts  (the Atlas UI surface: `openSurface` end to end)
//
// The REAL composition root over the shared fix-repo + fix-scip fixture with a policy granting `core` to `alice`
// (compose.test.ts `makeGovernedRepo`): every method's empty answer, an emit that lands and the snapshot that then
// serves it, a refused emit that writes nothing, a draft with its dry run, the doors' refusals, the read legs, and the
// ratify token reaching the composed door for exactly one call.

import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { StructRef } from "@atlas/contracts"
import { build } from "@atlas/index"
import { asNodeKey } from "@atlas/kernel"
import { walkFileTree } from "../src/fs.js"
import { readScip } from "../src/scip.js"
import { openSurface } from "../src/surface/index.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip, SYM_GREET } from "./harness/fix-scip.js"

const prior = { actor: process.env.ATLAS_ACTOR, token: process.env.ATLAS_RATIFY_TOKEN }
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  restore("ATLAS_ACTOR", prior.actor)
  restore("ATLAS_RATIFY_TOKEN", prior.token)
})

function restore(name: "ATLAS_ACTOR" | "ATLAS_RATIFY_TOKEN", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

/** compose.test.ts `makeGovernedRepo`, with the policy's scopes as a parameter. */
function governedRepo(scopes: Readonly<Record<string, readonly string[]>> = { core: ["alice"] }): string {
  const repo = makeFixRepo()
  const scip = makeFixScip()
  cleanups.push(scip.cleanup, repo.cleanup)
  mkdirSync(join(repo.repoPath, ".atlas"), { recursive: true })
  writeFileSync(
    join(repo.repoPath, ".atlas", "policy.json"),
    JSON.stringify({ nearDup: { claimNormThreshold: 1 }, t0Heuristic: { keywords: [] }, authz: { scopes } }),
  )
  copyFileSync(scip.scipPath, join(repo.repoPath, ".atlas", "index.scip"))
  return repo.repoPath
}

/** compose.test.ts `groundedFact`: an advisory anchored at the repository root, which the real truth gate holds. */
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

/** Narrow a surface result to its `state: "ok"` member, failing the test on any other state. */
function ok<T extends { readonly state: string }>(value: T): Extract<T, { readonly state: "ok" }> {
  if (value.state !== "ok") throw new Error(`expected state ok, got ${value.state}`)
  return value as Extract<T, { readonly state: "ok" }>
}

const head = (repoPath: string): string =>
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim()

const DRAFT = { anchor: "src/util.ts", slot: "invariant", claim: "greet returns a greeting" }

describe("openSurface — the Atlas screen's API over the composed runtime", () => {
  it("answers empty from every method when the repository has no .atlas directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-surface-empty-"))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    const surface = openSurface(dir)
    expect([
      surface.snapshot(),
      surface.reasoning("abc"),
      surface.own("src"),
      surface.health(),
      surface.promote({}),
      surface.draft(DRAFT),
      surface.emit({ fact: {}, at: "cafe" }),
      surface.link({ a: "x", b: "y" }),
      surface.verify({ kind: "dependency", target: SYM_GREET, scope: "src" }),
    ]).toEqual(Array.from({ length: 9 }, () => ({ state: "empty" })))
  })

  it("emits a grounded fact through the composed door, and the next snapshot serves it", () => {
    const repoPath = governedRepo()
    process.env.ATLAS_ACTOR = "alice"
    const surface = openSurface(repoPath)
    const before = ok(surface.snapshot())
    expect(before.facts).toEqual([])
    const emitted = ok(surface.emit({ fact: groundedFact(repoPath, "core"), at: "cafe" }))
    expect([emitted.ok, emitted.data?.emitted]).toEqual([true, true])
    const after = ok(surface.snapshot())
    expect(after.facts.map((fact) => [fact.hash, fact.promoted, fact.scope])).toEqual([[emitted.data?.id, true, "core"]])
    expect(after.candidates).toEqual([])
    expect(after.gen).toBeGreaterThan(before.gen)
    expect(after.head).toBe(head(repoPath).slice(0, 8))
    expect([after.scip, after.dependents]).toEqual([true, { "src/util.ts": ["src/app.ts"] }])
    expect([after.own, after.memory, after.orientation, after.territories]).toEqual([null, {}, [], []])
  })

  it("returns the door's refusal for an emit outside the actor's scope, and writes nothing", () => {
    const repoPath = governedRepo()
    process.env.ATLAS_ACTOR = "alice"
    const surface = openSurface(repoPath)
    const refused = ok(surface.emit({ fact: groundedFact(repoPath, "secret"), at: "cafe" }))
    expect(refused.data?.emitted).toBe(false)
    expect(typeof refused.data?.rejected).toBe("string")
    expect(ok(surface.snapshot()).facts).toEqual([])
  })

  it("drafts a fact at a file anchor and dry-runs the emit gates at the draft's own rev", () => {
    const repoPath = governedRepo()
    const out = ok(openSurface(repoPath).draft(DRAFT))
    expect(out.ok).toBe(true)
    expect(out.data?.draft.operation).toBe("CREATE")
    expect(out.data?.draft.rev).toBe(head(repoPath))
    expect(out.data?.check?.gates[0]?.gate).toBe("shape")
  })

  it("refuses a draft slot outside the closed vocabulary, a link between unknown facts and an unknown verify kind", () => {
    const surface = openSurface(governedRepo())
    const slot = ok(surface.draft({ ...DRAFT, slot: "not-a-slot" }))
    expect([slot.ok, slot.data]).toEqual([false, undefined])
    expect(slot.rejected).toContain("unknown slot 'not-a-slot'")
    const link = ok(surface.link({ a: "nk-x", b: "nk-y" }))
    expect([link.ok, typeof link.rejected]).toEqual([false, "string"])
    const kind = ok(surface.verify({ kind: "transition", target: SYM_GREET, scope: "src" }))
    expect(kind.ok).toBe(false)
    expect(kind.rejected).toContain("unknown kind 'transition'")
  })

  it("answers verify, promote, own, health and reasoning from the store and the index", () => {
    process.env.ATLAS_ACTOR = "alice"
    const surface = openSurface(governedRepo())
    const verified = ok(surface.verify({ kind: "dependency", target: SYM_GREET, scope: "src" }))
    expect([verified.ok, verified.data?.kind, verified.data?.target, verified.data?.scope]).toEqual([
      true,
      "dependency",
      SYM_GREET,
      "src",
    ])
    expect(["proven", "refuted", "abstain"]).toContain(verified.data?.verdict)
    const promoted = ok(surface.promote({}))
    expect([promoted.read, promoted.candidates, promoted.promoted, promoted.refused, promoted.rows]).toEqual([true, 0, 0, 0, []])
    const own = ok(surface.own("src"))
    expect([own.scope, own.tool, own.readRefusal]).toEqual(["src", "own_src", null])
    const health = ok(surface.health())
    expect([health.actor, health.provenance, health.readRefusal, health.cas.sound]).toEqual(["alice", "trusted", null, true])
    expect(health.index.scip).toEqual({ kind: "present", documents: 2 })
    expect([health.proofs.sealedProven, health.hotSet]).toEqual([0, 0])
    expect(surface.reasoning("abc")).toEqual({ state: "missing", id: "abc" })
  })

  it("hands a write's ratify token to the composed door for that one call, then restores the variable", () => {
    process.env.ATLAS_ACTOR = "alice"
    const surface = openSurface(governedRepo({ core: ["alice"], src: ["alice"] }))
    const ratify = (token: string | undefined) =>
      ok(surface.draft(token === undefined ? DRAFT : { ...DRAFT, token })).data?.check?.gates.find(
        (gate) => gate.gate === "ratify",
      )?.pass
    delete process.env.ATLAS_RATIFY_TOKEN
    expect(ratify(undefined)).toBe(false)
    expect(ratify("t1")).toBe(true)
    expect(process.env.ATLAS_RATIFY_TOKEN).toBeUndefined()
    process.env.ATLAS_RATIFY_TOKEN = "before"
    expect(ratify("t2")).toBe(true)
    expect(process.env.ATLAS_RATIFY_TOKEN).toBe("before")
  })
})
