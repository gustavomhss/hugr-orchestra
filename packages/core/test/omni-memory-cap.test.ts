import { expect } from "bun:test"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { OmniSpawner } from "../src/omni-spawner"
import { AppProcess } from "../src/process"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

const MIB = 1024 * 1024

// Resident for real: Buffer.alloc with a non-zero fill touches every page.
const hog = ChildProcess.make(process.execPath, [
  "-e",
  "const held = Buffer.alloc(400 * 1024 * 1024, 1); setTimeout(() => console.log(held.length), 60000)",
])

const chain = (error: unknown): unknown[] =>
  error instanceof Error && error.cause !== undefined ? [error, ...chain(error.cause)] : [error]

it.live("a tree over maxRssBytes is killed and fails with MemoryExceeded (streamed through omni)", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const app = yield* AppProcess.Service
    // maxOutputBytes keeps the command off the native collector, so this is the spawn path.
    const error = yield* app.run(hog, { maxRssBytes: 150 * MIB, maxOutputBytes: MIB }).pipe(Effect.flip)
    expect(chain(error).some((cause) => cause instanceof OmniSpawner.MemoryExceeded)).toBe(true)
  }), 60_000,
)

it.live("a tree over maxRssBytes fails with MemoryExceeded (omni's native collector)", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const app = yield* AppProcess.Service
    const error = yield* app.run(hog, { maxRssBytes: 150 * MIB }).pipe(Effect.flip)
    expect(chain(error).some((cause) => cause instanceof OmniSpawner.MemoryExceeded)).toBe(true)
  }), 60_000,
)

it.live("a tree under maxRssBytes exits normally", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const app = yield* AppProcess.Service
    const idle = ChildProcess.make(process.execPath, ["-e", "setTimeout(() => console.log('done'), 800)"])
    const streamed = yield* app.run(idle, { maxRssBytes: 4096 * MIB, maxOutputBytes: MIB })
    const collected = yield* app.run(idle, { maxRssBytes: 4096 * MIB })
    expect([streamed.exitCode, collected.exitCode]).toEqual([0, 0])
    expect(collected.stdout.toString().trim()).toBe("done")
  }), 60_000,
)
