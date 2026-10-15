// @atlas/adapter-io — test/compose.test.ts  (COMPOSE-A — the runtime composition root, end-to-end)
//
// `composeRuntime(repoPath)` stands up the FULLY GOVERNED, DURABLE handler over a real repo: the real
// GROUND truth-gate (built once over the index Axes at the root), the real KNOW-11 authz policy, the real
// KNOW-15 durable write path, and the `ATLAS_ACTOR` identity (fail-closed when unset). This exercises the
// whole governed leg through the assembled handler — emit in-scope persists + re-derives; emit out-of-scope
// is denied; init/query still resolve. Teeth: the out-of-scope denial + the durable re-read bite the authz
// and durability legs (drop either and a golden flips).

import { describe, it, expect } from "vitest"
import { reasonOf } from "./door-regression-support.js"
import { mkdirSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build } from "@atlas/index"
import type { StructRef } from "@atlas/contracts"
import { asNodeKey, asHash } from "@atlas/kernel"
import type { GroundedFact } from "@atlas/knowledge"
import type { EmitOut, Tool } from "@atlas/tools"
import { composeRuntime, gitUserEmail } from "../src/compose.js"
import { createDiskStore } from "../src/store.js"
import { walkFileTree } from "../src/fs.js"
import { readScip } from "../src/scip.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"

const POLICY_JSON = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { core: ["alice"] } },
})

/** Materialize a governed repo: the fix-repo git tree + a `.atlas/policy.json` granting `alice` scope
 *  `core` + a `.atlas/index.scip` so the composition root's index build has a real dump. */
function makeGovernedRepo() {
  const repo = makeFixRepo()
  const scip = makeFixScip()
  const atlasDir = join(repo.repoPath, ".atlas")
  mkdirSync(atlasDir, { recursive: true })
  writeFileSync(join(atlasDir, "policy.json"), POLICY_JSON)
  copyFileSync(scip.scipPath, join(atlasDir, "index.scip"))
  return {
    repoPath: repo.repoPath,
    cleanup: () => {
      scip.cleanup()
      repo.cleanup()
    },
  }
}

/** A grounded advisory fact whose anchor resolves FRESH against the built index root (so the real gate
 *  serves HOLDS), scoped to `scope`. An optional `owner` label is carried on the fact WITHOUT affecting
 *  authorization (the KNOW-11 gate keys on the actor + `scope`, never a payload-carried owner label) —
 *  used by the spoof-guard golden to prove the actor is NOT sourced from the fact. `owner` is NOT a
 *  declared `GroundedFact` field (#187, owner-ratified 2026-08-03, removed it from the KNOW-11a fence —
 *  see `req-knw.md#REQ-KNOW-11a`); it is attached here as an arbitrary FOREIGN property via an explicit
 *  cast, which is the stronger form of this teeth — the gate must ignore it even though nothing in the
 *  schema even names it. */
function groundedFact(repoPath: string, scope: string, owner?: string): GroundedFact {
  const axes = build(walkFileTree(repoPath), readScip(join(repoPath, ".atlas", "index.scip")))
  const root = axes.spatial // the repo-level unit — non-empty subtreeHash, resolves to itself (FRESH)
  const anchor: StructRef = { kind: "repo", qualifiedPath: root.key, subtreeHash: root.subtreeHash }
  const fact = {
    kind: "advisory",
    id: asNodeKey(`nk-${scope}`),
    tier: "T2",
    claimNorm: `a grounded claim for ${scope}`,
    grounding: { entries: [{ anchor, path: "." }] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope,
    ...(owner !== undefined ? { owner } : {}), // foreign property, not schema — see doc comment above
  }
  return fact as GroundedFact
}

/** A governed repo whose LOCAL git identity is `email` and whose policy grants scope `core` to `member`
 *  ONLY — so an actor resolved from git config (ATLAS_ACTOR unset) or the env can be checked against it. */
function makeGovernedRepoAs(email: string, member: string) {
  const repo = makeFixRepo()
  const scip = makeFixScip()
  const atlasDir = join(repo.repoPath, ".atlas")
  mkdirSync(atlasDir, { recursive: true })
  writeFileSync(
    join(atlasDir, "policy.json"),
    JSON.stringify({
      nearDup: { claimNormThreshold: 1 },
      t0Heuristic: { keywords: [] },
      authz: { scopes: { core: [member] } },
    }),
  )
  copyFileSync(scip.scipPath, join(atlasDir, "index.scip"))
  // LOCAL git identity (repo-local config wins over any global) — the git-derived actor source.
  execFileSync("git", ["config", "user.email", email], { cwd: repo.repoPath, stdio: "pipe" })
  return {
    repoPath: repo.repoPath,
    cleanup: () => {
      scip.cleanup()
      repo.cleanup()
    },
  }
}

const AT = asHash("cafe")
const EMIT = "atlas-emit" as Tool
const INIT = "atlas-init" as Tool
const QUERY = "atlas-query" as Tool

describe("COMPOSE-A — composeRuntime end-to-end (governed durable handler)", () => {
  it("SCN-CR-1 — an in-scope grounded emit PERSISTS durably + is re-derivable from CAS", () => {
    const { repoPath, cleanup } = makeGovernedRepo()
    const prev = process.env.ATLAS_ACTOR
    process.env.ATLAS_ACTOR = "alice"
    try {
      const { handler } = composeRuntime(repoPath)
      const node = groundedFact(repoPath, "core")
      const v = handler.handle(EMIT, { node, at: AT })
      expect(v.ok).toBe(true)
      const out = v.data as EmitOut
      expect(out.emitted).toBe(true)
      expect(out.id).toBeDefined()

      // TEETH — durable: re-open the CAS at the composition root's cas path and read the fact back.
      const store = createDiskStore(join(repoPath, ".atlas", "cas"))
      expect(store.get(out.id!)).toEqual(node)
      // the projection sidecar was persisted too (the KNOW-15 durable write).
      expect(store.loadProjection()).toBeDefined()
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR
      else process.env.ATLAS_ACTOR = prev
      cleanup()
    }
  })

  it("SCN-CR-2 — an out-of-scope emit is DENIED (authz), and init/query still resolve", () => {
    const { repoPath, cleanup } = makeGovernedRepo()
    const prev = process.env.ATLAS_ACTOR
    process.env.ATLAS_ACTOR = "alice"
    try {
      const { handler } = composeRuntime(repoPath)
      // alice holds `core`, not `secret` → the KNOW-11 authz gate denies, nothing persists.
      const v = handler.handle(EMIT, { node: groundedFact(repoPath, "secret"), at: AT })
      const out = v.data as EmitOut
      expect(out.emitted).toBe(false)
      expect(reasonOf(out.rejected)).toBe("unauthorized") // EQUALITY: the WRITE's own scope, never the incumbent's

      // the other governance legs are still wired + resolving (not "not wired at this seam").
      // `'.'` — the whole repo. (Was the absolute `repoPath`, which only ever "worked" because
      // `territories()` ignored its argument; the index is keyed by repo-RELATIVE paths.)
      const initV = handler.handle(INIT, { path: "." })
      expect(initV.rejected ?? "").not.toContain("not wired at this seam")
      expect(initV.ok).toBe(true)
      const queryV = handler.handle(QUERY, { scope: "." })
      expect(queryV.rejected ?? "").not.toContain("not wired at this seam")
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR
      else process.env.ATLAS_ACTOR = prev
      cleanup()
    }
  })

  it("SCN-CR-3 — unset ATLAS_ACTOR ⇒ every write denied (fail-closed composition)", () => {
    const { repoPath, cleanup } = makeGovernedRepo()
    const prev = process.env.ATLAS_ACTOR
    delete process.env.ATLAS_ACTOR
    try {
      const { handler } = composeRuntime(repoPath)
      const v = handler.handle(EMIT, { node: groundedFact(repoPath, "core"), at: AT })
      const out = v.data as EmitOut
      expect(out.emitted).toBe(false)
      expect(reasonOf(out.rejected)).toBe("unauthorized") // EQUALITY: the WRITE's own scope, never the incumbent's
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR
      else process.env.ATLAS_ACTOR = prev
      cleanup()
    }
  })
})

describe("COMPOSE-HARDENING — F3 git-derived actor + F5 shared SCIP guard", () => {
  it("SCN-CR-F5 — composeRuntime on a git repo WITHOUT .atlas/index.scip does not throw; query resolves", () => {
    // F5: the shared `readScipOrEmpty` (scip.ts) degrades a MISSING dump to the empty index — no throw.
    const repo = makeFixRepo() // a real git repo, NO `.atlas/index.scip`, NO policy
    const prev = process.env.ATLAS_ACTOR
    delete process.env.ATLAS_ACTOR
    try {
      let rt: ReturnType<typeof composeRuntime> | undefined
      expect(() => {
        rt = composeRuntime(repo.repoPath)
      }).not.toThrow()
      const q = rt!.handler.handle(QUERY, { scope: "." })
      expect(q.rejected ?? "").not.toContain("not wired at this seam")
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR
      else process.env.ATLAS_ACTOR = prev
      repo.cleanup()
    }
  })

  it("SCN-CR-F3-git — ATLAS_ACTOR UNSET ⇒ actor resolves from git config (in-scope emit AUTHORIZED); the fact payload NEVER sources the actor (spoof-guard)", () => {
    const { repoPath, cleanup } = makeGovernedRepoAs("alice@x", "alice@x")
    const prev = process.env.ATLAS_ACTOR
    delete process.env.ATLAS_ACTOR // no env actor ⇒ derive from `git config user.email` = alice@x
    try {
      const { handler } = composeRuntime(repoPath)
      // scope=core is granted to alice@x (the git actor); owner=attacker@x is a NON-member label on the
      // fact. Correct behaviour: AUTHORIZED on the git-derived actor. TEETH: a mutant that sourced the
      // actor from the node/payload (e.g. `node.owner`) would read attacker@x ∉ core ⇒ this golden RED.
      const node = groundedFact(repoPath, "core", "attacker@x")
      const v = handler.handle(EMIT, { node, at: AT })
      const out = v.data as EmitOut
      expect(out.emitted).toBe(true)
      expect(out.id).toBeDefined()
      // the actor was passed EXPLICITLY into the WIRE config — composeRuntime writes NO global env
      // (ATLAS_ACTOR stays exactly as the caller left it: unset here).
      expect(process.env.ATLAS_ACTOR).toBeUndefined()
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR
      else process.env.ATLAS_ACTOR = prev
      cleanup()
    }
  })

  it("SCN-CR-F3-envwins — ATLAS_ACTOR SET overrides git config (env identity used, not git)", () => {
    // policy grants core to bob@x ONLY; the LOCAL git identity is alice@x. With ATLAS_ACTOR=bob@x the emit
    // is AUTHORIZED — proving the ENV actor (bob@x) was used. If git overrode env, alice@x ∉ core ⇒ denied.
    const { repoPath, cleanup } = makeGovernedRepoAs("alice@x", "bob@x")
    const prev = process.env.ATLAS_ACTOR
    process.env.ATLAS_ACTOR = "bob@x"
    try {
      const { handler } = composeRuntime(repoPath)
      const v = handler.handle(EMIT, { node: groundedFact(repoPath, "core"), at: AT })
      expect((v.data as EmitOut).emitted).toBe(true) // bob@x (env) used, not alice@x (git)
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR
      else process.env.ATLAS_ACTOR = prev
      cleanup()
    }
  })

  it("SCN-CR-F3-failclosed — a git actor NOT in any policy scope is DENIED (fail-closed preserved)", () => {
    const { repoPath, cleanup } = makeGovernedRepoAs("mallory@x", "alice@x") // core → alice@x only
    const prev = process.env.ATLAS_ACTOR
    delete process.env.ATLAS_ACTOR // git actor = mallory@x ∉ core
    try {
      const { handler } = composeRuntime(repoPath)
      const v = handler.handle(EMIT, { node: groundedFact(repoPath, "core"), at: AT })
      const out = v.data as EmitOut
      expect(out.emitted).toBe(false)
      expect(reasonOf(out.rejected)).toBe("unauthorized") // EQUALITY: the WRITE's own scope, never the incumbent's
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR
      else process.env.ATLAS_ACTOR = prev
      cleanup()
    }
  })

  it("SCN-CR-F3-total — gitUserEmail is TOTAL (a non-repo / absent path ⇒ undefined, never throws)", () => {
    // A guaranteed-absent path ⇒ the `git` execFile fails (invalid cwd). TEETH: a mutant that let that
    // failure propagate instead of returning undefined would throw here ⇒ this golden RED.
    const gone = mkdtempSync(join(tmpdir(), "atlas-gone-"))
    rmSync(gone, { recursive: true, force: true })
    expect(() => gitUserEmail(gone)).not.toThrow()
    expect(gitUserEmail(gone)).toBeUndefined()
  })
})
