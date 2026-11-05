import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { asHash } from "@atlas/kernel"
import type { EmitOut } from "@atlas/tools"
import { createGovernedEmit } from "../src/governed-emit.js"
import { runGateChain } from "../src/governed-emit-gates.js"
import { createOwnershipAccess } from "../src/ownership-access.js"
import { createDiskStore } from "../src/store.js"
import { ownershipFixture } from "./harness/ownership-fixture.js"

const prior = { actor: process.env.ATLAS_ACTOR, token: process.env.ATLAS_RATIFY_TOKEN }
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  if (prior.actor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = prior.actor
  if (prior.token === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = prior.token
})

function fixture() {
  process.env.ATLAS_ACTOR = "alice"
  delete process.env.ATLAS_RATIFY_TOKEN
  const f = ownershipFixture()
  cleanups.push(f.cleanup)
  return f
}

const query = { scope: "core", need: "operational" as const, maxBytes: 4096 }
const at = asHash("ownership-test-revision")

describe("Session-input pilot governed ownership publication", () => {
  it("RP-2 raw CAS bytes cannot publish; a refused provenance boundary cannot read them", () => {
    const f = fixture()
    const a = f.artifact("## Use\nRead the receipt.\n", [])
    f.store.put(f.carrier(a.manifestRef))
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "hold", reason: "ownership-unpublished" })
    const access = createOwnershipAccess({ access: { store: f.store, refusal: "tracked-staging", reverified: undefined }, current: f.current })
    expect(access.read(query)).toEqual({ kind: "hold", reason: "ownership-untrusted", evidence: ["tracked-staging"] })
  })

  it("RP-3/4 composed check and actual emit refuse without a token, then publish and reopen through the same runtime", () => {
    const f = fixture()
    const a = f.artifact("## Use\nRead the receipt.\n", [{ key: "file:src/util.ts", version: f.current("file:src/util.ts")! }])
    const carrier = f.carrier(a.manifestRef)
    const runtime = f.runtime()
    expect(runtime.check(carrier, at).wouldEmit).toBe(false)
    const refused = runtime.handler.handle("atlas-emit", { node: carrier, at })
    expect(refused.ok).toBe(true)
    expect(refused.data).toMatchObject({ emitted: false })
    process.env.ATLAS_RATIFY_TOKEN = "fixture-explicit-ratifier"
    const authorized = f.runtime()
    expect(authorized.check(carrier, at).wouldEmit).toBe(true)
    const emitted = authorized.handler.handle("atlas-emit", { node: carrier, at })
    expect(emitted.ok).toBe(true)
    expect(emitted.data).toMatchObject({ emitted: true })
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "ready", manifest: a.manifestRef, result: a.resultRef, body: "## Use\nRead the receipt.\n" })
    expect(f.runtime().ownership.index("core", "operational")).toMatchObject({ kind: "index", key: "operations", bodiesReturned: false })
    const reopened = createDiskStore(join(f.repoPath, ".atlas", "cas"))
    expect(reopened.get((emitted.data as EmitOut).id!)).toEqual(carrier)
  })

  it("RP-3 a valid token does not authorize another actor, and malformed/stale attachments agree between check and emit", () => {
    const f = fixture()
    const a = f.artifact("fixture", [{ key: "file:src/util.ts", version: "wrong-input-version" }])
    const carrier = f.carrier(a.manifestRef)
    // Door-only seam here deliberately supplies a truth double to isolate gate ordering/parity.
    const deps = {
      store: f.store, gate: { gateHolds: () => "HOLDS" as const },
      policy: { t0Heuristic: { keywords: [] }, authz: { scopes: { core: ["alice"] } } },
      actor: "alice", ratifyToken: "fixture-explicit-ratifier", ownershipInput: f.current,
    }
    const cases = [
      { node: carrier, actor: "stranger", reason: "unauthorized" },
      { node: carrier, actor: "alice", reason: "ownership-input-changed" },
      { node: { ...carrier, predicateSlot: "gotcha" as const }, actor: "alice", reason: "ownership-attachment-slot" },
      { node: { ...carrier, claimNorm: "not the carrier claim" }, actor: "alice", reason: "ownership-attachment-claim" },
    ]
    cases.forEach((test) => {
      const configured = { ...deps, actor: test.actor }
      const check = runGateChain(test.node, at, configured)
      const emitted = createGovernedEmit(configured).emit(test.node, at)
      expect(check.wouldEmit).toBe(false)
      expect(emitted.emitted).toBe(false)
      expect(check.firstFailure?.reason).toBe(emitted.rejected)
      expect(emitted.rejected?.split(":")[0]).toBe(test.reason)
    })
  })

  it("RP-5 source drift holds an already published manifest; historical reads stay labelled", () => {
    const f = fixture()
    const a = f.artifact("## Use\nRead the receipt.\n", [{ key: "file:src/util.ts", version: f.current("file:src/util.ts")! }])
    process.env.ATLAS_RATIFY_TOKEN = "fixture-explicit-ratifier"
    expect(f.runtime().handler.handle("atlas-emit", { node: f.carrier(a.manifestRef), at }).data).toMatchObject({ emitted: true })
    writeFileSync(join(f.repoPath, "src", "util.ts"), "export const changed = true\n")
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
    expect(f.runtime().ownership.read({ ...query, historical: true })).toMatchObject({ kind: "ready", historical: true })
  })
})
