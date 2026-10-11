import { expect } from "bun:test"
import { Effect } from "effect"
import { fileURLToPath } from "node:url"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { Flag } from "../src/flag/flag"
import { Omni } from "../src/omni"
import { AppProcess } from "../src/process"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

it.live("fresh AppProcess and spawner select Omni by default and preserve explicit legacy rollback", () =>
  Effect.gen(function* () {
    const app = yield* AppProcess.Service
    const before = Omni.snapshot()
    for (const value of [undefined, "0", "1", "strict"] as const) {
      const env = { ...process.env }
      if (value === undefined) delete env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
      if (value !== undefined) env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER = value
      const result = yield* app.run(ChildProcess.make(process.execPath, ["-e", `
const { Effect } = await import(${JSON.stringify(import.meta.resolve("effect"))})
const { ChildProcess } = await import(${JSON.stringify(import.meta.resolve("effect/unstable/process"))})
const { LayerNode } = await import(${JSON.stringify(import.meta.resolve("../src/effect/layer-node"))})
const { Flag } = await import(${JSON.stringify(import.meta.resolve("../src/flag/flag"))})
const { Omni } = await import(${JSON.stringify(import.meta.resolve("../src/omni"))})
const { AppProcess } = await import(${JSON.stringify(import.meta.resolve("../src/process"))})
Omni.configure(${JSON.stringify({ addon: Omni.locate().addon, supervisor: Omni.locate().supervisor })})
const output = await Effect.runPromise(Effect.gen(function* () {
  const app = yield* AppProcess.Service
  const collected = yield* app.run(ChildProcess.make(process.execPath, ["-e", "process.stdout.write('collected')"]))
  const streamed = yield* app.string(ChildProcess.make(process.execPath, ["-e", "process.stdout.write('streamed')"]))
  return { code: collected.exitCode, collected: collected.stdout.toString(), streamed }
}).pipe(Effect.provide(LayerNode.compile(AppProcess.node))))
console.log(JSON.stringify({ mode: Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER, output, counts: Omni.snapshot() }))
`], { env }))
      expect(result.exitCode).toBe(0)
      expect(JSON.parse(result.stdout.toString())).toEqual({
        mode: value === "0" ? "off" : value === "strict" ? "strict" : "on",
        output: { code: 0, collected: "collected", streamed: "streamed" },
        counts: { spawns: value === "0" ? 0 : 2, delegations: 0 },
      })
    }
    expect(Omni.snapshot().spawns - before.spawns).toBe(Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? 0 : 4)
  }), 60_000,
)

it.live("a compiled target without native support keeps unset default on legacy", () =>
  Effect.gen(function* () {
    const app = yield* AppProcess.Service
    const built = yield* Effect.promise(() => Bun.build({
      entrypoints: ["omni-mode.gen.ts"], target: "bun",
      define: { OMNI_ENABLED: "false" },
      files: { "omni-mode.gen.ts": `import { omniSpawner } from ${JSON.stringify(fileURLToPath(new URL("../src/flag/flag.ts", import.meta.url)).replaceAll("\\", "/"))}; console.log(JSON.stringify([omniSpawner(undefined), omniSpawner("1"), omniSpawner("0")]))` },
    }))
    expect(built.success).toBe(true)
    expect(built.outputs).toHaveLength(1)
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(path.join(tmpdir(), "omni-mode-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    )
    const file = path.join(directory, "unsupported.mjs")
    yield* Effect.promise(() => Bun.write(file, built.outputs[0]))
    const result = yield* app.run(ChildProcess.make(process.execPath, [file]))
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.toString())).toEqual(["off", "off", "off"])
  }), 30_000,
)
