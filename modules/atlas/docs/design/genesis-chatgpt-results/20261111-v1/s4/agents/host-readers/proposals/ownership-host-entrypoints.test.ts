// PREPARED, NOT RUN. Baseline: 1cde2ff7a71bcf7aecb5d030917b577165135d38.
// Proposed destination: modules/atlas/packages/adapter-io/test/ownership-host-entrypoints.test.ts.
// Mechanical integration controls over the actual composed check, emit and published reader.
// ownershipFixture reviews and authority are synthetic test fixtures, never campaign acceptance.
// S5 must rebind this proposal to the exact S1/S2/S3 integrated candidate before execution.
import { rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { ownershipFixture } from "./harness/ownership-fixture.js"

const prior = { actor: process.env.ATLAS_ACTOR, token: process.env.ATLAS_RATIFY_TOKEN }
const cleanups: (() => void)[] = []
const at = id({ kind: "s4-mechanical-fixture-revision", version: 1 })
const query = { scope: "core", need: "operational" as const, maxBytes: 4096 }

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  if (prior.actor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = prior.actor
  if (prior.token === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = prior.token
})

function fixture() {
  process.env.ATLAS_ACTOR = "alice"
  process.env.ATLAS_RATIFY_TOKEN = "fixture-explicit-ratifier"
  const value = ownershipFixture()
  cleanups.push(value.cleanup)
  return value
}

function publish(value: ReturnType<typeof ownershipFixture>, manifest: Hash, scope = "core", path = "src/util.ts") {
  const runtime = value.runtime()
  const carrier = value.carrier(manifest, scope, path)
  expect(runtime.check(carrier, at).wouldEmit).toBe(true)
  const emitted = runtime.handler.handle("atlas-emit", { node: carrier, at })
  expect(emitted.ok).toBe(true)
  expect(emitted.data).toMatchObject({ emitted: true })
}

function independent(value: ReturnType<typeof ownershipFixture>) {
  const artifact = value.artifact("## Independent\nUnchanged scope.\n", [
    { key: "file:api/service.py", version: value.current("file:api/service.py")! },
  ], { scope: "independent" })
  publish(value, artifact.manifestRef, "independent", "api/service.py")
  return artifact
}

function casPath(value: ReturnType<typeof ownershipFixture>, reference: Hash) {
  // The mutation targets the real on-disk CAS object; no alternate reader or gate is introduced.
  return join(value.repoPath, ".atlas", "cas", reference.slice(0, 2), reference)
}

function refuseCandidate(value: ReturnType<typeof ownershipFixture>, manifest: Hash, reason: string) {
  const runtime = value.runtime()
  const carrier = value.carrier(manifest, "core", "src/util.ts")
  const checked = runtime.check(carrier, at)
  const emitted = runtime.handler.handle("atlas-emit", { node: carrier, at })
  expect(checked.wouldEmit).toBe(false)
  const refusal = checked.gates.find((gate) => !gate.pass)?.reason
  expect(refusal?.split(":")[0]).toBe(reason)
  expect(emitted.ok).toBe(false)
  expect(emitted.data).toMatchObject({ emitted: false })
  expect(emitted.data).toHaveProperty("rejected", refusal)
}

describe("S4 composed ownership host entry points", () => {
  it("S4-HOST-01 serves exact published body bytes and identifies the same artifact in the index", () => {
    const value = fixture()
    const body = "## Use\r\nCafe\u0301 remains decomposed.\r\n"
    const accepted = value.artifact(body, [
      { key: "file:src/util.ts", version: value.current("file:src/util.ts")! },
      { key: "members:src", version: value.current("members:src")! },
    ])
    publish(value, accepted.manifestRef)
    const runtime = value.runtime()
    expect(runtime.ownership.read(query)).toMatchObject({
      kind: "ready", manifest: accepted.manifestRef, artifact: accepted.ref,
      result: accepted.resultRef, receipt: accepted.value.receipt, body, historical: false,
    })
    expect(runtime.ownership.index("core", "operational")).toMatchObject({
      kind: "index", manifest: accepted.manifestRef, artifact: accepted.ref,
      result: accepted.resultRef, receipt: accepted.value.receipt, bodiesReturned: false,
    })
  })

  it.each([
    { name: "S4-HOST-02 changed declared input", key: "file:src/util.ts", reason: "ownership-input-changed",
      mutate: (root: string) => writeFileSync(join(root, "src/util.ts"), "export const changed = true\n") },
    { name: "S4-HOST-03 new input under registered scope", key: "members:src", reason: "ownership-input-changed",
      mutate: (root: string) => writeFileSync(join(root, "src/added.ts"), "export const added = true\n") },
    { name: "S4-HOST-04 removed declared source", key: "file:src/util.ts", reason: "ownership-input-unavailable",
      mutate: (root: string) => rmSync(join(root, "src/util.ts")) },
  ])("$name holds the requested scope and keeps independent bytes usable", ({ key, reason, mutate }) => {
    const value = fixture()
    const accepted = value.artifact("## Use\nBefore mutation.\n", [{ key, version: value.current(key)! }])
    publish(value, accepted.manifestRef)
    const other = independent(value)
    expect(value.runtime().ownership.read(query)).toMatchObject({ kind: "ready", manifest: accepted.manifestRef })
    mutate(value.repoPath)
    const runtime = value.runtime()
    expect(runtime.ownership.read(query)).toMatchObject({ kind: "hold", reason })
    expect(runtime.ownership.index("core", "operational")).toMatchObject({ kind: "hold", reason })
    expect(runtime.ownership.read({ ...query, scope: "independent" })).toMatchObject({
      kind: "ready", manifest: other.manifestRef, artifact: other.ref, result: other.resultRef,
      body: "## Independent\nUnchanged scope.\n", historical: false,
    })
    expect(runtime.ownership.read({ ...query, historical: true })).toMatchObject({
      kind: "ready", manifest: accepted.manifestRef, historical: true, body: "## Use\nBefore mutation.\n",
    })
  })

  it("S4-HOST-05 refuses a missing artifact at check and emit, preserving the accepted carrier", () => {
    const value = fixture()
    const accepted = value.artifact("## Use\nAccepted.\n", [])
    publish(value, accepted.manifestRef)
    const missing = id({ kind: "s4-absent-artifact", case: "S4-HOST-05" })
    expect(value.store.get(missing)).toBeUndefined()
    const candidate = value.store.put({ ...accepted.manifest, entries: [{ key: "operations", artifact: missing }] })
    refuseCandidate(value, candidate, "ownership-missing")
    expect(value.runtime().ownership.read(query)).toMatchObject({ kind: "ready", manifest: accepted.manifestRef })
  })

  it("S4-HOST-06 refuses a broken need-to-entry index at check and emit", () => {
    const value = fixture()
    const accepted = value.artifact("## Use\nAccepted.\n", [])
    publish(value, accepted.manifestRef)
    const candidate = value.store.put({ ...accepted.manifest, roots: { operational: "absent-entry" } })
    refuseCandidate(value, candidate, "ownership-manifest-unverifiable")
    expect(value.runtime().ownership.read(query)).toMatchObject({ kind: "ready", manifest: accepted.manifestRef })
  })

  it("S4-HOST-07 refuses an incompatible required result without treating its SHA as ordered", () => {
    const value = fixture()
    const original = value.artifact("## Flow\nOriginal dependency.\n", [], { key: "flow", need: "flow" })
    const operations = value.artifact("## Use\nBound to original flow.\n", [], {
      dependencies: [{ key: "flow", result: original.resultRef }],
    })
    const manifest = { ...operations.manifest, entries: [...original.manifest.entries, ...operations.manifest.entries] }
    const accepted = value.store.put(manifest)
    publish(value, accepted)
    const changed = value.artifact("## Flow\nChanged dependency.\n", [], { key: "flow", need: "flow" })
    const candidate = value.store.put({ ...manifest, entries: [...changed.manifest.entries, ...operations.manifest.entries] })
    refuseCandidate(value, candidate, "ownership-dependency-changed")
    expect(value.runtime().ownership.read(query)).toMatchObject({ kind: "ready", manifest: accepted, result: operations.resultRef })
  })

  // A schema-version rejection is only partial invalid-generation preparation.
  // Mixed/incomplete accepted-generation controls require the exact S3 candidate.
  it("S4-HOST-08 refuses an unsupported manifest schema version at the governed publication door", () => {
    const value = fixture()
    const accepted = value.artifact("## Use\nAccepted.\n", [])
    publish(value, accepted.manifestRef)
    const candidate = value.store.put({ ...accepted.manifest, version: 2 })
    refuseCandidate(value, candidate, "ownership-manifest-unverifiable")
    expect(value.runtime().ownership.read(query)).toMatchObject({ kind: "ready", manifest: accepted.manifestRef })
  })

  it("S4-HOST-09 local object loss holds its closure while independent roots and scope stay readable", () => {
    const value = fixture()
    const flow = value.artifact("## Flow\nRequired base.\n", [], { key: "flow", need: "flow" })
    const operations = value.artifact("## Use\nRequires flow.\n", [], { dependencies: [{ key: "flow", result: flow.resultRef }] })
    const evidence = value.artifact("## Evidence\nIndependent root.\n", [], { key: "evidence", need: "evidence" })
    const manifest = value.store.put({ ...operations.manifest,
      entries: [...flow.manifest.entries, ...operations.manifest.entries, ...evidence.manifest.entries],
      roots: { operational: "operations", evidence: "evidence" },
    })
    publish(value, manifest)
    const other = independent(value)
    expect(value.runtime().ownership.read(query)).toMatchObject({ kind: "ready", manifest })
    rmSync(casPath(value, flow.ref))
    const runtime = value.runtime()
    expect(runtime.ownership.read(query)).toMatchObject({ kind: "hold", reason: "ownership-missing" })
    expect(runtime.ownership.index("core", "operational")).toMatchObject({ kind: "hold", reason: "ownership-missing" })
    expect(runtime.ownership.read({ ...query, need: "evidence" })).toMatchObject({
      kind: "ready", manifest, artifact: evidence.ref, body: "## Evidence\nIndependent root.\n",
    })
    expect(runtime.ownership.read({ ...query, scope: "independent" })).toMatchObject({ kind: "ready", manifest: other.manifestRef })
  })

  it("S4-HOST-10 shared manifest corruption holds every dependent read and index", () => {
    const value = fixture()
    const operations = value.artifact("## Use\nShared manifest.\n", [])
    const evidence = value.artifact("## Evidence\nShared manifest.\n", [], { key: "evidence", need: "evidence" })
    const manifest = value.store.put({ ...operations.manifest,
      entries: [...operations.manifest.entries, ...evidence.manifest.entries],
      roots: { operational: "operations", evidence: "evidence" },
    })
    publish(value, manifest)
    const other = independent(value)
    const before = value.runtime()
    for (const need of ["operational", "evidence"] as const) {
      expect(before.ownership.read({ ...query, need })).toMatchObject({ kind: "ready", manifest })
      expect(before.ownership.index("core", need)).toMatchObject({ kind: "index", manifest })
    }
    writeFileSync(casPath(value, manifest), "{invalid-json")
    const runtime = value.runtime()
    for (const need of ["operational", "evidence"] as const) {
      expect(runtime.ownership.read({ ...query, need })).toMatchObject({ kind: "hold", reason: "ownership-missing" })
      expect(runtime.ownership.index("core", need)).toMatchObject({ kind: "hold", reason: "ownership-missing" })
    }
    expect(runtime.ownership.read({ ...query, scope: "independent" })).toMatchObject({ kind: "ready", manifest: other.manifestRef })
  })
})
