import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { openSurface } from "../src/generated/surface.js"

// The generated surface bundle, loaded the way the host loads it: this proves the bundle imports (including its
// external `web-tree-sitter`), answers empty without a store, and reads a store from its files.

test("the bundled surface answers empty for a directory with no Atlas store", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "atlas-surface-empty-"))
  try {
    const surface = openSurface(dir)
    expect(surface.snapshot()).toEqual({ state: "empty" })
    expect(surface.reasoning("abc")).toEqual({ state: "empty" })
    expect(surface.verify({ kind: "dependency", target: "x", scope: "src" })).toEqual({ state: "empty" })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("the bundled surface reads a store from its files outside git", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "atlas-surface-store-"))
  try {
    await mkdir(path.join(dir, ".atlas"), { recursive: true })
    const row = {
      nodeKey: "k1",
      family: "advisory",
      contentHash: "a".repeat(64),
      claims: ["a claim"],
      primaryAnchor: "src/a.ts",
      tier: "T2",
      scope: "atlas:mined",
    }
    await writeFile(
      path.join(dir, ".atlas", "projection.json"),
      JSON.stringify({ current: [["k1", row]], cas: ["a".repeat(64)], gen: 2 }),
    )
    const snapshot = openSurface(dir).snapshot()
    if (snapshot.state !== "ok") throw new Error(`expected a store, got ${snapshot.state}`)
    expect(snapshot.gen).toBe(2)
    expect(snapshot.facts.map((fact) => [fact.key, fact.claim, fact.derivedAt, fact.anchor])).toEqual([
      ["k1", "a claim", "", null],
    ])
    expect([snapshot.head, snapshot.scip, snapshot.casAudit]).toEqual([
      "",
      false,
      { objects: 0, referenced: 1, missing: 1, orphan: 0 },
    ])
    expect([snapshot.own, snapshot.memory, snapshot.orientation, snapshot.territories]).toEqual([null, {}, [], []])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
