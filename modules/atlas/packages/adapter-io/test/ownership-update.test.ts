import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { asHash } from "@atlas/kernel"
import type { OwnershipManifest } from "@atlas/knowledge"
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

describe("RP-5 real-entry incremental reconstruction", () => {
  it("renewal preserves downstream identity, changed results hold, and invalid navigation does not poison independent reads", () => {
    process.env.ATLAS_ACTOR = "alice"
    process.env.ATLAS_RATIFY_TOKEN = "fixture-explicit-ratifier"
    const f = ownershipFixture()
    cleanups.push(f.cleanup)
    const at = asHash("ownership-update-test")
    const input = () => [{ key: "file:src/util.ts", version: f.current("file:src/util.ts")! }]
    const base = f.artifact("## Behavior\nAdmission is not completion.\n", input(), { key: "base", need: "flow" })
    const skill = f.artifact("## Use\nCheck admission first.\n", [], { dependencies: [{ key: "base", result: base.resultRef }] })
    const independent = f.artifact("## Boundary\nIndependent.\n", [], { key: "independent", need: "ownership" })
    const manifest = (parent: typeof base, child = skill): OwnershipManifest => ({
      kind: "ownership-manifest", version: 1, scope: "core",
      entries: [parent, child, independent].map((a) => ({ key: a.value.key, artifact: a.ref })),
      roots: { operational: child.value.key, ownership: independent.value.key },
    })
    const publish = (value: OwnershipManifest) => {
      const ref = f.store.put(value)
      const result = f.runtime().handler.handle("atlas-emit", { node: f.carrier(ref), at })
      expect(result.ok).toBe(true)
      return result.data
    }
    const query = { scope: "core", need: "operational" as const, maxBytes: 4096 }
    expect(publish(manifest(base))).toMatchObject({ emitted: true })
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "ready", artifact: skill.ref })

    // A private fixture source changes. No Session product code or accepted producer body is edited.
    writeFileSync(join(f.repoPath, "src", "util.ts"), "export const newFixture = true\n")
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
    expect(f.runtime().ownership.read({ ...query, need: "ownership" })).toMatchObject({ kind: "ready", artifact: independent.ref })

    // Explicit synthetic revalidation: same meaning, new input receipt; not a real semantic judge claim.
    const renewed = f.artifact("## Behavior\nAdmission is not completion.\n", input(), { key: "base", need: "flow" })
    expect(renewed.resultRef).toBe(base.resultRef)
    expect(renewed.value.receipt).not.toBe(base.value.receipt)
    expect(publish(manifest(renewed))).toMatchObject({ emitted: true })
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "ready", artifact: skill.ref, result: skill.resultRef, receipt: skill.value.receipt })

    const changed = f.artifact("## Behavior\nDifferent supported meaning.\n", input(), { key: "base", need: "flow" })
    expect(changed.resultRef).not.toBe(base.resultRef)
    expect(publish(manifest(changed))).toMatchObject({ emitted: false, rejected: "ownership-dependency-changed: operations, base" })
    // The failed candidate cannot replace the current publication.
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "ready", artifact: skill.ref })

    const revalidated = f.artifact("## Use\nCheck admission first.\n", [], { dependencies: [{ key: "base", result: changed.resultRef }] })
    expect(revalidated.resultRef).toBe(skill.resultRef)
    expect(revalidated.value.receipt).not.toBe(skill.value.receipt)
    expect(publish(manifest(changed, revalidated))).toMatchObject({ emitted: true })
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "ready", artifact: revalidated.ref })

    const authorityChanged = f.artifact("## Behavior\nDifferent supported meaning.\n", input(), { key: "base", need: "flow", basis: "different authority" })
    expect(authorityChanged.resultRef).not.toBe(changed.resultRef)
    expect(publish(manifest(authorityChanged, revalidated))).toMatchObject({ emitted: false, rejected: "ownership-dependency-changed: operations, base" })
  })
})
