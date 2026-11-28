import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { AppProcess } from "@orchestra/core/process"
import { isAtlasGeneratedRequest } from "./fixture/atlas-generated-request"
import { expectSpawn } from "./fixture/omni-expect"

const root = path.resolve(import.meta.dir, "../../..")
const file = Bun.file(path.join(root, ".ci-run.json"))
const request = await file.exists()
  ? Option.getOrUndefined(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(await file.text()))
  : undefined

// Exact opt-in only. Full Core lanes and substring filters must never launch the standalone Atlas suite.
test.skipIf(!selected(request))("hosted standalone Atlas quality lane", async () => {
  expectSpawn(import.meta.path)
  expect(process.platform).toBe("linux")
  expect(process.env.RUNNER_OS).toBe("Linux")
  expect(process.env.CI).toBe("true")
  expect(process.env.GITHUB_RUN_ID).toMatch(/^[1-9][0-9]*$/)
  const snapshot = process.env.GITHUB_SHA
  if (snapshot === undefined) throw new Error("Hosted snapshot identity is missing")
  expect(snapshot).toMatch(/^[a-f0-9]{40}$/)
  const started = performance.now()
  await Effect.runPromise(Effect.gen(function* () {
    const proc = yield* AppProcess.Service
    const failures: string[] = []
    const temporary = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "atlas-quality-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    )
    const command = (stage: string, program: string, args: readonly string[], cwd: string, maximumMs = 120_000, env: Record<string, string> = {}, required = true) =>
      Effect.gen(function* () {
        const remaining = Math.min(maximumMs, 870_000 - (performance.now() - started))
        if (remaining <= 0) return yield* Effect.die(new Error("Atlas qualification budget exhausted"))
        yield* Effect.promise(() => Bun.write(Bun.stdout, `atlas quality stage: ${stage}\n`))
        const result = yield* proc.run(ChildProcess.make(program, args, {
          cwd, env: { CI: "true", GITHUB_ACTIONS: "true", ...env }, extendEnv: true,
        }), { timeout: remaining, maxOutputBytes: 4 * 1024 * 1024, maxErrorBytes: 4 * 1024 * 1024 })
        // Preserve actual nested suite summaries and failures; qualification never accepts truncated output.
        yield* Effect.promise(() => Bun.write(Bun.stdout, result.stdout))
        yield* Effect.promise(() => Bun.write(Bun.stderr, result.stderr))
        expect(result.stdoutTruncated, stage).toBe(false)
        expect(result.stderrTruncated, stage).toBe(false)
        expect(result.outputTruncated ?? false, stage).toBe(false)
        if (required) expect(result.exitCode, stage).toBe(0)
        if (!required && result.exitCode !== 0) failures.push(stage)
        return result.stdout.toString("utf8")
      })
    expect((yield* command("snapshot", "git", ["rev-parse", "HEAD"], root, 15_000)).trim()).toBe(snapshot)
    // The Own snapshot gate proves Git ancestry. test:ci checkouts are shallow, unlike the epic Atlas lane.
    if ((yield* command("history", "git", ["rev-parse", "--is-shallow-repository"], root, 15_000)).trim() === "true")
      yield* command("history-fetch", "git", ["fetch", "--no-tags", "--unshallow", "origin"], root, 120_000)
    const atlas = path.join(root, "modules/atlas")
    yield* command("install", "npm", ["ci", "--no-audit", "--no-fund"], atlas, 240_000)
    yield* command("typecheck", "npm", ["run", "typecheck"], atlas, 240_000)
    // Match the standalone workflow's manual-dispatch EARS baseline, without its unrelated Core matrix.
    const baseline = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(
      yield* command("baseline", "node", ["../../script/atlas-baseline.mjs", snapshot], atlas, 30_000, {
        GITHUB_ENV: path.join(temporary, "github-env"),
      }),
    )
    const base = Schema.decodeUnknownSync(Schema.Struct({ base: Schema.String }))(baseline).base
    expect(base).toMatch(/^[a-f0-9]{40}$/)
    yield* Effect.forEach([
      "godfile-guard", "layer-guard", "reference-model-guard", "spec-conformance-guard", "id-integrity",
      "command-doc-guard", "wiring-guard", "adr-citation-guard", "req-clause-guard", "ears-coamend-guard",
      "doc-transcript-guard", "service-gate-guard", "own-snapshot-guard",
    ], (guard) => command(guard, "npm", ["run", guard], atlas, 60_000,
      guard === "ears-coamend-guard" ? { EARS_COAMEND_BASE: base } : {}, false), { concurrency: 1, discard: true })
    yield* command("vitest", "npm", ["run", "test", "--", "--reporter=dot"], atlas, 480_000, {}, false)
    expect(failures, "Atlas guards and Vitest must all pass").toEqual([])
  }).pipe(Effect.scoped, Effect.provide(AppNodeBuilder.build(AppProcess.node))))
  expect(performance.now() - started).toBeLessThan(900_000)
}, 900_000)

function selected(value: unknown) {
  if (typeof value !== "object" || value === null || !("args" in value) || !Array.isArray(value.args) ||
    value.args[0] !== "./test/atlas-quality.test.ts") return false
  // Reuse the qualified producer's closed request shape; only this distinct filename selects this lane.
  return isAtlasGeneratedRequest({ ...value, args: ["./test/atlas-generated-artifact.test.ts", ...value.args.slice(1)] })
}
