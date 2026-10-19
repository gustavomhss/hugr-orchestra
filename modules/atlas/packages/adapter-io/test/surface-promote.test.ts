// @atlas/adapter-io — test/surface-promote.test.ts  (D36: the surface's `promote` selects by nodeKey and skips held rows)
//
// Three staged rows whose CAS bytes are absent: the promote leg PRESENTS each selected row and files it as that
// row's own refusal, so `rows` names exactly what the pass presented and staging keeps every row for the next case.

import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { id } from "@atlas/kernel"
import { emptyStore, upsert } from "@atlas/knowledge"
import { appendReview, reviewLogPath } from "../src/review-log.js"
import { createDiskStore } from "../src/store.js"
import { openSurface } from "../src/surface/index.js"
import { makeFixRepo } from "./harness/fix-repo.js"

const prior = process.env.ATLAS_ACTOR
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  if (prior === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = prior
})

const NOW = "2026-10-18T10:00:00.000Z"

/** A fix repo with `nk-a`, `nk-b` and `nk-c` staged (review-store.test.ts's staging commit). */
function stagedRepo(): string {
  const repo = makeFixRepo()
  cleanups.push(repo.cleanup)
  mkdirSync(join(repo.repoPath, ".atlas"), { recursive: true })
  const next = ["nk-a", "nk-b", "nk-c"].reduce(
    (projection, key) => upsert(projection, { nodeKey: key, contentHash: id({ claim: key }), family: "advisory", claimNorm: key }).store,
    emptyStore(),
  )
  createDiskStore(join(repo.repoPath, ".atlas", "cas")).commitStaging(() => ({ out: 0, next }))
  return repo.repoPath
}

function ok<T extends { readonly state: string }>(value: T): Extract<T, { readonly state: "ok" }> {
  if (value.state !== "ok") throw new Error(`expected state ok, got ${value.state}`)
  return value as Extract<T, { readonly state: "ok" }>
}

const presented = (out: { readonly rows: readonly { readonly nodeKey: string }[] }) => out.rows.map((r) => r.nodeKey).sort()

describe("openSurface().promote — select by nodeKey, never a held row", () => {
  it("with nodeKeys presents only those rows; with none (or an empty list) every row", () => {
    const repoPath = stagedRepo()
    process.env.ATLAS_ACTOR = "alice"
    const surface = openSurface(repoPath)
    const one = ok(surface.promote({ nodeKeys: ["nk-b"] }))
    expect([one.read, one.candidates, presented(one)]).toEqual([true, 1, ["nk-b"]])
    expect(presented(ok(surface.promote({})))).toEqual(["nk-a", "nk-b", "nk-c"])
    expect(presented(ok(surface.promote({ nodeKeys: [] })))).toEqual(["nk-a", "nk-b", "nk-c"])
    const unknown = ok(surface.promote({ nodeKeys: ["nk-a", "nk-zz"] }))
    expect([presented(unknown), unknown.unknown]).toEqual([["nk-a"], ["nk-zz"]])
  })

  it("skips a held row with and without nodeKeys", () => {
    const repoPath = stagedRepo()
    process.env.ATLAS_ACTOR = "alice"
    appendReview(repoPath, { kind: "hold", nodeKey: "nk-b", at: NOW, by: "alice" })
    const surface = openSurface(repoPath)
    const all = ok(surface.promote({}))
    expect([presented(all), all.held]).toEqual([["nk-a", "nk-c"], ["nk-b"]])
    const named = ok(surface.promote({ nodeKeys: ["nk-b"] }))
    expect([named.candidates, named.rows, named.held]).toEqual([0, [], ["nk-b"]])
  })

  it("refuses the pass when the review log has a line that does not verify", () => {
    const repoPath = stagedRepo()
    appendReview(repoPath, { kind: "hold", nodeKey: "nk-b", at: NOW, by: "alice" })
    appendFileSync(reviewLogPath(repoPath), "{torn\n")
    expect(openSurface(repoPath).promote({})).toEqual({
      state: "ok",
      read: false,
      refusal: "unreadable",
      candidates: 0,
      promoted: 0,
      refused: 0,
      rows: [],
    })
  })
})
