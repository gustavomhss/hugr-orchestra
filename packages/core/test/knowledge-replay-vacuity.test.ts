import { expect } from "bun:test"
import { existsSync } from "node:fs"
import { Effect, Schema } from "effect"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { testEffect } from "./lib/effect"
import { expectSpawn } from "./fixture/omni-expect"
import { KnowledgeReplayVacuity } from "./fixture/knowledge-replay-vacuity"

const it = testEffect(LayerNode.compile(AppProcess.node))

for (const mode of KnowledgeReplayVacuity.modes) {
  it.live(`L4 producer-derived test-vacuity fresh replay: ${mode}`, Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const proc = yield* AppProcess.Service
    const result = yield* Effect.acquireUseRelease(
      Effect.tryPromise(() => KnowledgeReplayVacuity.make(mode)),
      (fixture) => Effect.gen(function* () {
        const run = yield* proc.run(fixture.command, {
          timeout: "60 seconds", maxOutputBytes: 128 * 1024, maxErrorBytes: 64 * 1024,
        })
        expect(run.exitCode, run.stderr.toString("utf8")).toBe(0)
        expect(run.stdoutTruncated).toBe(false)
        expect(run.stderrTruncated).toBe(false)
        expect(run.outputTruncated ?? false).toBe(false)
        const proof = Schema.decodeUnknownSync(Schema.fromJsonString(KnowledgeReplayVacuity.Proof))(run.stdout.toString("utf8"))
        expect(proof.pid).not.toBe(process.pid)
        expect(proof.pid).toBeGreaterThan(0)
        expect(proof.mode).toBe(mode)
        expect(proof.produced).toBe(1)
        expect(proof.sourceGate).toBe(true)
        expect(proof.sourceReverified).toBe(1)
        expect(proof.witnessPreserved).toBe(true)
        expect(proof.source).toMatchObject({ family: "test-vacuity", testName: "swallows the rejection",
          shape: "assertion-only-in-catch", primaryAnchor: "src/vacuous.test.ts", unitKey: "src/vacuous.test.ts",
          claims: ["assertion-only-in-catch test 'swallows the rejection' @ src/vacuous.test.ts"],
          scope: "src", tier: "T2", seal: "proven" })
        expect(proof.before).toEqual({ current: 0, cas: 0, sidecarsAbsent: true })
        expect(proof.boots).toHaveLength(2)
        proof.boots.forEach((boot) => {
          expect(boot.current).toBe(mode === "positive" ? 1 : 0)
          expect(boot.staging).toBe(mode === "positive" ? 0 : 1)
          expect(boot.cas).toBe(1)
          expect(boot.row).toEqual(proof.candidate)
          expect(boot.reverified).toBe(mode === "positive" ? 1 : 0)
          expect(boot.rejected).toBe(0)
          expect(boot.served).toBe(mode === "positive" ? 1 : 0)
        })
        expect(proof.boots[1]).toEqual(proof.boots[0])
        if (mode === "positive") expect(proof.candidate).toEqual(proof.source)
        if (mode !== "positive") {
          expect(proof.candidate).not.toEqual(proof.source)
          expect(proof.candidate.contentHash).not.toBe(proof.source.contentHash)
          expect(proof.candidate[mode]).not.toBe(proof.source[mode])
        }
        expect(proof.childCleanup).toBe(true)
        expect(fixture.manifest.parser.version).toBe("0.23.2")
        expect(fixture.manifest.astWarmup).toBe(true)
        expect(fixture.manifest.grammars.map((grammar) => grammar.name)).toEqual([
          "tree-sitter-typescript.wasm", "tree-sitter-tsx.wasm",
        ])
        expect(fixture.manifest.grammars.every((grammar) => /^[a-f0-9]{64}$/.test(grammar.sha256))).toBe(true)
        return { root: fixture.root, proof }
      }),
      (fixture) => Effect.sync(fixture.dispose),
    )
    expect(result.proof.childCleanup).toBe(true)
    expect(existsSync(result.root)).toBe(false)
  }), 90_000)
}
