import { expect } from "bun:test"
import { existsSync } from "node:fs"
import { Effect, Schema } from "effect"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { testEffect } from "./lib/effect"
import { expectSpawn } from "./fixture/omni-expect"
import { KnowledgeReplayBinding } from "./fixture/knowledge-replay-binding"

const it = testEffect(LayerNode.compile(AppProcess.node))

it.live("CONTROL L4 replay binding: an actually derived SCIP relation survives fresh replay and a second boot", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const proc = yield* AppProcess.Service
  const result = yield* Effect.acquireUseRelease(
    Effect.tryPromise(() => KnowledgeReplayBinding.make()),
    (fixture) => Effect.gen(function* () {
      const run = yield* proc.run(fixture.command, {
        timeout: "60 seconds", maxOutputBytes: 64 * 1024, maxErrorBytes: 64 * 1024,
      })
      expect(run.exitCode, run.stderr.toString("utf8")).toBe(0)
      expect(run.stdoutTruncated).toBe(false)
      expect(run.stderrTruncated).toBe(false)
      const proof = Schema.decodeUnknownSync(Schema.fromJsonString(KnowledgeReplayBinding.Proof))(run.stdout.toString("utf8"))
      expect(proof.pid).not.toBe(process.pid)
      expect(proof.pid).toBeGreaterThan(0)
      expect(proof.exportsChecked).toBe(12)
      expect(proof.derived).toEqual({ resolved: 1, proven: 1, persisted: 1, refused: 0 })
      expect(proof.before).toEqual({ held: 0, casAbsent: true, sidecarsAbsent: true })
      expect(proof.source).toEqual(proof.replayed)
      expect(proof.replayed).toEqual(proof.second)
      expect(proof.source).toMatchObject({
        family: "relation", claims: ["src/app.ts\0depends-on\0src/util.ts"],
        primaryAnchor: "src/app.ts", endpointA: "src/app.ts", endpointB: "src/util.ts",
        relationKind: "depends-on", tier: "T2", scope: "src", seal: "proven",
      })
      expect(proof.reverified).toEqual([1, 1, 1])
      expect(proof.nodeCounts).toEqual([1, 1, 1])
      expect(proof.restoredHash).toBe(proof.source.contentHash)
      expect(proof.logRejected).toEqual([0, 0])
      expect(proof.childCleanup).toBe(true)
      expect(fixture.manifest.parser.version).toBe("0.23.2")
      expect(fixture.manifest.parser.resolved).toContain("web-tree-sitter")
      expect(fixture.manifest.parser.resolved.startsWith("/") || /^[A-Za-z]:[\\/]/.test(fixture.manifest.parser.resolved)).toBe(true)
      return { root: fixture.root, proof }
    }),
    (fixture) => Effect.sync(fixture.dispose),
  )
  // AppProcess.run has joined its scoped readers and natural exit before the owned tree is removed.
  expect(result.proof.childCleanup).toBe(true)
  expect(existsSync(result.root)).toBe(false)
}), 90_000)
