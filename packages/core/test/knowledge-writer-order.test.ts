import { afterAll, beforeAll, expect } from "bun:test"
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import path from "node:path"
import { Effect, Fiber } from "effect"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { KnowledgeWriterOrder } from "./fixture/knowledge-writer-order"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
let harness: Awaited<ReturnType<typeof KnowledgeWriterOrder.make>>
beforeAll(async () => { harness = await KnowledgeWriterOrder.make() }, 60_000)
afterAll(() => harness?.dispose())

for (const clocks of ["inverted", "equal"] as const) {
  it.live(`L5 independent writers: late G1 log preserves G2 with ${clocks} clocks`, Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const proc = yield* AppProcess.Service
    const f = harness.fresh()
    const ordered = [harness.fact("first candidate"), harness.fact("second candidate")]
      .sort((a, b) => a.row.contentHash < b.row.contentHash ? 1 : a.row.contentHash > b.row.contentHash ? -1 : 0)
    expect(ordered[0].row.contentHash > ordered[1].row.contentHash,
      "equal-clock control must favor G1 by the actual canonical hash").toBe(true)
    const first = ordered[0].row
    const second = ordered[1].row
    expect(first.nodeKey).toBe(second.nodeKey)
    expect(first.primaryAnchor).toBe(second.primaryAnchor)
    expect(first.slot).toBe(second.slot)
    const firstAt = "2026-11-13T12:00:00.000Z"
    const secondAt = clocks === "inverted" ? "2026-11-13T10:00:00.000Z" : firstAt
    const g1 = harness.participant(f, "G1", ordered[0].fact, first, firstAt)
    const g2 = harness.participant(f, "G2", ordered[1].fact, second, secondAt, first)

    yield* Effect.gen(function* () {
      const left = yield* proc.run(g1.command, { timeout: "30 seconds", maxOutputBytes: 4096, maxErrorBytes: 16_384 })
        .pipe(Effect.forkScoped)
      const committed = yield* KnowledgeWriterOrder.waitForFile(f.committed)
      expect(committed.row).toEqual(first)
      expect(committed.pid).not.toBe(process.pid)
      expect(existsSync(g1.logged)).toBe(false)
      expect(harness.api.rehydrateProjection(harness.api.createDiskStore(f.cas)).current.get(first.nodeKey)).toEqual(first)
      const right = yield* proc.run(g2.command, { timeout: "30 seconds", maxOutputBytes: 4096, maxErrorBytes: 16_384 })
        .pipe(Effect.forkScoped)
      const logged = yield* KnowledgeWriterOrder.waitForFile(g2.logged)
      expect(logged.row).toEqual(second)
      expect(logged.before).toEqual(first)
      expect(logged.pid).not.toBe(committed.pid)
      expect(logged.pid).not.toBe(process.pid)
      expect(existsSync(g1.logged)).toBe(false)
      expect(harness.entries(f.repo, first.nodeKey).map((entry) => entry.row)).toEqual([second])
      yield* Effect.sync(() => KnowledgeWriterOrder.release(f.release))
      const exits = yield* Effect.all([Fiber.join(left), Fiber.join(right)])
      exits.forEach((result) => {
        expect(result.exitCode, result.stderr.toString()).toBe(0)
        expect(result.stdoutTruncated).toBe(false)
        expect(result.stderrTruncated).toBe(false)
      })
      const late = yield* KnowledgeWriterOrder.waitForFile(g1.logged)
      expect(late).toEqual({ pid: committed.pid, row: first, before: null })

      const disk = harness.api.createDiskStore(f.cas)
      const current = harness.api.rehydrateProjection(disk).current.get(first.nodeKey)
      const fold = harness.api.readKnowledge(f.repo)
      const entries = harness.entries(f.repo, first.nodeKey)
      // Controlled reproof isolates causal ordering; it does not exercise an actual index or L4 authorization.
      const localReplay = harness.api.replayKnowledge(f.repo, disk, KnowledgeWriterOrder.policy, () => true)
      const afterReplay = harness.api.rehydrateProjection(disk).current.get(first.nodeKey)
      const localAgain = harness.api.replayKnowledge(f.repo, disk, KnowledgeWriterOrder.policy, () => true)
      const afterLocalAgain = harness.api.rehydrateProjection(disk).current.get(first.nodeKey)

      const clone = path.join(f.control, "clone")
      mkdirSync(path.join(clone, ".atlas"), { recursive: true })
      for (const directory of ["members", "blobs"])
        cpSync(path.join(f.repo, ".atlas", directory), path.join(clone, ".atlas", directory), { recursive: true })
      expect(readdirSync(path.join(clone, ".atlas")).sort()).toEqual(["blobs", "members"])
      const fresh = harness.api.createDiskStore(path.join(clone, ".atlas", "cas"))
      expect(harness.api.rehydrateProjection(fresh).current.size).toBe(0)
      const cloneReplay = harness.api.replayKnowledge(clone, fresh, KnowledgeWriterOrder.policy, () => true)
      const cloneRow = harness.api.rehydrateProjection(fresh).current.get(first.nodeKey)
      const cloneAgain = harness.api.replayKnowledge(clone, fresh, KnowledgeWriterOrder.policy, () => true)

      // Gather all replay observations first: the identical pre-fix fixture must fail on product ordering, not setup.
      expect(current).toEqual(second)
      expect(fold.rejected).toBe(0)
      expect(fold.rows.get(first.nodeKey)?.row).toEqual(second)
      expect(entries).toEqual([
        expect.objectContaining({ seat: "backend", row: second, at: secondAt, base: JSON.stringify(first) }),
        expect.objectContaining({ seat: "backend", row: first, at: firstAt }),
      ])
      expect(entries[1].base).toBeUndefined()
      expect(localReplay).toEqual({ applied: 0, staged: 0, missing: 0, rejected: 0 })
      expect(afterReplay).toEqual(second)
      expect(localAgain).toEqual({ applied: 0, staged: 0, missing: 0, rejected: 0 })
      expect(afterLocalAgain).toEqual(second)
      expect(cloneReplay).toEqual({ applied: 1, staged: 0, missing: 0, rejected: 0 })
      expect(cloneRow).toEqual(second)
      expect(fresh.get(second.contentHash)).toEqual(ordered[1].fact)
      expect(cloneAgain).toEqual({ applied: 0, staged: 0, missing: 0, rejected: 0 })
      expect(harness.api.rehydrateProjection(fresh).current.get(first.nodeKey)).toEqual(second)
      expect(harness.api.readKnowledge(clone).rows.get(first.nodeKey)?.row).toEqual(second)
    }).pipe(
      Effect.ensuring(Effect.sync(() => KnowledgeWriterOrder.release(f.release))),
      Effect.scoped,
    )
  }), 60_000)
}
