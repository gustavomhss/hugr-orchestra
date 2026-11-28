import { expect } from "bun:test"
import { existsSync } from "node:fs"
import { Effect, Schema } from "effect"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { testEffect } from "./lib/effect"
import { expectSpawn } from "./fixture/omni-expect"
import { KnowledgeReplayAdvisory } from "./fixture/knowledge-replay-advisory"

const it = testEffect(LayerNode.compile(AppProcess.node))
const ReplayReport = Schema.Struct({
  applied: Schema.Number, staged: Schema.Number, missing: Schema.Number, rejected: Schema.Number,
})

for (const mode of KnowledgeReplayAdvisory.modes) {
  it.live(`L4 actual admitted advisory replay: ${mode}`, Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const proc = yield* AppProcess.Service
    const result = yield* Effect.acquireUseRelease(
      Effect.tryPromise(() => KnowledgeReplayAdvisory.make(mode)),
      (fixture) => Effect.gen(function* () {
        const run = yield* proc.run(fixture.command, {
          timeout: "60 seconds", maxOutputBytes: 64 * 1024, maxErrorBytes: 64 * 1024,
        })
        expect(run.exitCode, run.stderr.toString("utf8")).toBe(0)
        expect(run.stdoutTruncated).toBe(false)
        expect(run.stderrTruncated).toBe(false)
        const proof = Schema.decodeUnknownSync(Schema.fromJsonString(KnowledgeReplayAdvisory.Proof))(run.stdout.toString("utf8"))
        expect(proof.pid).not.toBe(process.pid)
        expect(proof.pid).toBeGreaterThan(0)
        expect(proof.mode).toBe(mode)
        expect(proof.factIDs).toEqual(mode.startsWith("history") ? ["src/app.ts", "src/app.ts"] : ["src/app.ts"])
        expect(proof.key).toMatch(/^[a-f0-9]{64}$/)
        expect(proof.key).not.toBe("src/app.ts")
        expect(proof.sourceReverified).toBe(1)
        expect(proof.source).toMatchObject({ family: "advisory", nodeKey: proof.key,
          primaryAnchor: "src/app.ts", slot: "dependency", scope: "src", tier: "T2", seal: "proven" })
        expect(proof.claims).toHaveLength(mode.startsWith("history") ? 2 : 1)
        expect(new Set(proof.claims).size).toBe(proof.claims.length)
        expect(proof.callerReceipts).toBe(mode.startsWith("history"))
        if (mode.startsWith("history")) {
          expect(proof.source.provenanceByClaim).toEqual(Object.fromEntries(proof.claims.map((claim, index) => [
            claim, { source: `fixture-caller-receipt-${index}`, trusted: true },
          ])))
        }
        if (mode === "single-legacy") expect(proof.source.provenanceByClaim).toBeUndefined()
        const active = mode === "single-legacy" || mode === "history" || mode === "local-noop"
        const absent = mode === "current-missing" || mode === "structural-invalid"
        expect(proof.snapshots).toHaveLength(2)
        proof.snapshots.forEach((snapshot) => {
          expect(snapshot.current).toBe(active ? 1 : 0)
          expect(snapshot.staging).toBe(active || absent ? 0 : mode === "history-key" ? 2 : 1)
          if (!absent) expect(snapshot.row).toEqual(proof.candidate)
          if (absent) expect(snapshot.row).toBeUndefined()
          if (mode === "history-key") {
            const support = proof.supportCandidate
            if (support === undefined) throw new Error("History-key proof is missing its separate support candidate")
            expect(snapshot.rows).toEqual([proof.candidate, support]
              .sort((a, b) => String(a.nodeKey).localeCompare(String(b.nodeKey))))
          }
          if (mode !== "history-key") expect(snapshot.rows).toEqual(absent ? [] : [proof.candidate])
        })
        expect(proof.snapshots[1]).toEqual(proof.snapshots[0])
        expect(proof.currentBlobPresent).toBe(mode !== "current-missing")
        if (mode === "history-missing-blob") expect(proof.historicalBlobPresent).toBe(false)
        if (mode === "history-missing-blob" || mode === "current-missing" || mode === "structural-invalid") {
          const reports = run.stderr.toString("utf8").split("\n")
            .filter((line) => line.startsWith("atlas: knowledge replay "))
            .map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(ReplayReport))(line.slice("atlas: knowledge replay ".length)))
          expect(reports).toHaveLength(mode === "history-missing-blob" ? 1 : 2)
          reports.forEach((report) => expect(report).toEqual({
            applied: 0, staged: mode === "history-missing-blob" ? 1 : 0,
            missing: mode === "current-missing" ? 1 : 0, rejected: mode === "structural-invalid" ? 1 : 0,
          }))
        }
        expect(proof.childCleanup).toBe(true)
        expect(fixture.manifest.parser.version).toBe("0.23.2")
        return { root: fixture.root, proof }
      }),
      (fixture) => Effect.sync(fixture.dispose),
    )
    expect(result.proof.childCleanup).toBe(true)
    expect(existsSync(result.root)).toBe(false)
  }), 90_000)
}
