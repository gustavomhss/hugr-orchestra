import { expect, test } from "bun:test"
import { createHash } from "crypto"
import { readdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { Deferred, Effect, Exit, Fiber } from "effect"
import { ChildProcess } from "effect/unstable/process"
import * as TestClock from "effect/testing/TestClock"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchToolkit } from "../../src/research-toolkit"
import { ReviewScopedTypecheck } from "../../src/review-toolkit/scoped-typecheck"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const linux = process.platform === "linux" && process.arch === "x64"

function input(source: string) {
  const bytes = Buffer.from(source)
  return { path: "input.ts", bytes, oid: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") }
}

const fixture = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()),
)

test("diagnostics require complete input-local compiler output and consistent exit", () => {
  const output = "input.ts(1,7): error TS2322: Type 'number' is not assignable to type 'string'.\n"
  expect(ReviewScopedTypecheck.diagnostics(output, 2, "")).toEqual([{ line: 1, column: 7, code: "TS2322" }])
  expect(ReviewScopedTypecheck.diagnostics("", 0, "")).toEqual([])
  expect(ReviewScopedTypecheck.diagnostics(output, 0, "")).toBeUndefined()
  expect(ReviewScopedTypecheck.diagnostics(output, 2, "warning")).toBeUndefined()
  expect(ReviewScopedTypecheck.diagnostics(output.replace("input.ts", "other.ts"), 2, "")).toBeUndefined()
  expect(ReviewScopedTypecheck.diagnostics(output + "error TS1234: global error\n", 2, "")).toBeUndefined()
})

it.live.skipIf(!linux)("an absent toolkit is observed without acquiring a compiler", () => Effect.gen(function* () {
  const directory = yield* fixture
  const before = yield* Effect.promise(() => readdir(directory.path))
  const result = yield* ReviewScopedTypecheck.run(input("const count: string = 'ok'\n")).pipe(
    Effect.provideService(ResearchToolkit.Root, directory.path),
  )
  expect(result.status).toBe("not-run")
  expect(yield* Effect.promise(() => readdir(directory.path))).toEqual(before)
}))

it.live.skipIf(!linux)("pinned confined TypeScript diagnoses an inert mismatch and accepts its correction", () => Effect.gen(function* () {
  expect(jail, "conformance-missing: sandbox").toBeTruthy()
  expectSpawn(import.meta.path)
  const directory = yield* fixture
  const provision = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provideService(ResearchToolkit.Root, directory.path))
  yield* provision(ResearchToolkit.ensure("typescript"))
  const broken = yield* provision(ReviewScopedTypecheck.run(input("export const count: string = 42\n")))
  const fixed = yield* provision(ReviewScopedTypecheck.run(input("export const count: string = '42'\n")))
  if (broken.status !== "fail" || fixed.status !== "pass") throw new Error(`scoped typecheck unavailable: ${JSON.stringify({ broken, fixed })}`)
  expect(broken.diagnostics).toContainEqual({ line: 1, column: 14, code: "TS2322" })
  expect(fixed.diagnostics).toEqual([])
  expect(fixed.recipe).toEqual(broken.recipe)
  expect(broken.recipe).toMatchObject({ template: "typescript-scoped-typecheck-v1", version: "6.0.3", target: "linux-x64" })
  expect(ReviewScopedTypecheck.diagnostics(broken.stdout, broken.exitCode, broken.stderr)).toEqual(broken.diagnostics)
  for (const source of [
    "import { x } from './outside'\nconst count: string = x\n",
    "/// <reference path='./outside.d.ts' />\nconst count: string = 'ok'\n",
    "// @ts-nocheck\nconst count: string = 42\n",
  ]) {
    expect((yield* provision(ReviewScopedTypecheck.run(input(source)))).status).toBe("not-run")
  }
  const foreign = input("const count: string = 'ok'\n")
  expect((yield* provision(ReviewScopedTypecheck.run({ ...foreign, oid: "0".repeat(40) }))).status).toBe("not-run")
}), 300_000)


it.effect.skipIf(!linux)("timeout and interruption release the real compiler scope and scratch", () => Effect.gen(function* () {
  expect(jail, "conformance-missing: sandbox").toBeTruthy()
  expectSpawn(import.meta.path)
  const directory = yield* fixture
  yield* ResearchToolkit.ensure("typescript").pipe(Effect.provideService(ResearchToolkit.Root, directory.path))
  const processes = yield* AppProcess.Service
  const source = input("const count: string = '42'\n")
  for (const mode of ["timeout", "interrupt"] as const) {
    const spawned = yield* Deferred.make<string>()
    const observed = AppProcess.Service.of({
      ...processes,
      spawn: (command) => processes.spawn(command).pipe(
        Effect.tap(() => Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command) || !command.options.cwd) return yield* Effect.die("missing compiler cwd")
          yield* Deferred.succeed(spawned, command.options.cwd)
          return yield* Effect.never
        })),
      ),
    })
    const fiber = yield* ReviewScopedTypecheck.run(source).pipe(
      Effect.provideService(ResearchToolkit.Root, directory.path),
      Effect.provideService(AppProcess.Service, observed),
      Effect.forkScoped,
    )
    const scratch = yield* Deferred.await(spawned)
    expect(path.basename(scratch).startsWith("lucy-typecheck-")).toBe(true)
    expect(existsSync(scratch)).toBe(true)
    if (mode === "timeout") {
      yield* TestClock.adjust("30 seconds")
      const result = yield* Fiber.join(fiber)
      expect(result.status).toBe("not-run")
    }
    if (mode === "interrupt") {
      const exit = yield* Fiber.interrupt(fiber)
      expect(Exit.hasInterrupts(exit)).toBe(true)
    }
    expect(existsSync(scratch)).toBe(false)
  }
}), 300_000)
