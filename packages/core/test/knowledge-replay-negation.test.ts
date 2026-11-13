import { expect } from "bun:test"
import { existsSync } from "node:fs"
import { Effect, Schema } from "effect"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { testEffect } from "./lib/effect"
import { expectSpawn } from "./fixture/omni-expect"
import { KnowledgeReplayNegation } from "./fixture/knowledge-replay-negation"

const it = testEffect(LayerNode.compile(AppProcess.node))

it.live("CONTROL L4 negation: actual promoted-input seal-preservation replays without a row seal", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const proc = yield* AppProcess.Service
  const result = yield* Effect.acquireUseRelease(
    Effect.tryPromise(() => KnowledgeReplayNegation.make()),
    (fixture) => Effect.gen(function* () {
      const run = yield* proc.run(fixture.command, {
        timeout: "60 seconds", maxOutputBytes: 64 * 1024, maxErrorBytes: 64 * 1024,
      })
      expect(run.exitCode, run.stderr.toString("utf8")).toBe(0)
      expect(run.stdoutTruncated).toBe(false)
      expect(run.stderrTruncated).toBe(false)
      const proof = Schema.decodeUnknownSync(Schema.fromJsonString(KnowledgeReplayNegation.Proof))(run.stdout.toString("utf8"))
      expect(proof.pid).not.toBe(process.pid)
      expect(proof.pid).toBeGreaterThan(0)
      expect(proof.kind).toBe("promoted-input seal-preservation")
      expect(proof.builderMintedSeal).toBe(false)
      expect(proof.promoted).toBe(1)
      expect(proof.source).toEqual(proof.replayed)
      expect(proof.replayed).toEqual(proof.second)
      expect(proof.fact).toEqual(proof.restored)
      expect(proof.source).toMatchObject({ family: "negation", tier: "T2", scope: "packages/other/src",
        primaryAnchor: "packages/other/src", relationKind: "calls",
        endpointB: "scip-typescript npm @atlas/other 0.0.0 src/companion.ts/helper()." })
      expect(proof.fact.seal).toBe("proven")
      expect(proof.rowSealAbsent).toEqual([true, true, true])
      expect(proof.reverified).toEqual([1, 1, 1])
      expect(proof.publicNegations).toEqual([1, 1, 1])
      expect(proof.before).toEqual({ current: 0, cas: 0, sidecarsAbsent: true })
      expect(proof.rejected).toEqual([0, 0, 0])
      expect(proof.fixtureSCIPSHA256).toBe(fixture.manifest.fixtureSCIPSHA256)
      expect(proof.childCleanup).toBe(true)
      expect(fixture.manifest.parser.version).toBe("0.23.2")
      expect(fixture.manifest.parser.resolved).toContain("web-tree-sitter")
      return { root: fixture.root, childCleanup: proof.childCleanup }
    }),
    (fixture) => Effect.sync(fixture.dispose),
  )
  expect(result.childCleanup).toBe(true)
  expect(existsSync(result.root)).toBe(false)
}), 90_000)
