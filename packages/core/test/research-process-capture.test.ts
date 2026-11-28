import { expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { ResearchProcess } from "../src/research-toolkit/process"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const held = () => Effect.acquireRelease(Effect.promise(tmpdir), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))

const command = (cwd: string, stdout: string, stderr = "") => ({
  command: process.execPath,
  args: ["--no-env-file", "-e", `process.stdout.write(${JSON.stringify(stdout)});process.stderr.write(${JSON.stringify(stderr)})`],
  cwd,
  env: ResearchProcess.environment(),
  timeoutMs: 10_000,
  maxBytes: 4096,
  maxRssBytes: 512 * 1024 * 1024,
})

it.live("default and explicit tail capture preserve final bytes and total stream counts", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const dir = yield* held()
  const stdout = "STDOUT-BEGIN:" + "0123456789".repeat(20) + ":STDOUT-END"
  const stderr = "STDERR-BEGIN:" + "abcdefghij".repeat(16) + ":STDERR-END"
  const input = { ...command(dir.path, stdout, stderr), tailBytes: 19 }
  expect(Buffer.byteLength(stdout)).toBeGreaterThan(input.tailBytes)
  expect(Buffer.byteLength(stderr)).toBeGreaterThan(input.tailBytes)
  expect(Buffer.byteLength(stdout)).toBeLessThan(input.maxBytes)
  expect(Buffer.byteLength(stderr)).toBeLessThan(input.maxBytes)
  // A variable with the future optional field remains structurally assignable to the unchanged baseline API.
  const explicit = { ...input, capture: "tail" as const }
  const ordinary = yield* ResearchProcess.run(input)
  const selected = yield* ResearchProcess.run(explicit)
  for (const result of [ordinary, selected]) {
    expect(result.exitCode).toBe(0)
    expect(result.failure).toBeUndefined()
    expect(result.timedOut || result.overflow || result.memoryExceeded).toBe(false)
    expect(result.stdout.bytes).toBe(Buffer.byteLength(stdout))
    expect(result.stderr.bytes).toBe(Buffer.byteLength(stderr))
    expect(result.stdout.truncated).toBe(true)
    expect(result.stderr.truncated).toBe(true)
    expect(result.stdout.data).toEqual(Buffer.from(stdout).subarray(-input.tailBytes))
    expect(result.stderr.data).toEqual(Buffer.from(stderr).subarray(-input.tailBytes))
  }
  expect(selected.stdout).toEqual(ordinary.stdout)
  expect(selected.stderr).toEqual(ordinary.stderr)
}), 60_000)

it.live("head capture preserves the prefix when real output crosses maxBytes", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const dir = yield* held()
  const stdout = "HEAD-CONTROL:" + "0123456789".repeat(99) + ":TAIL-CONTROL"
  const input = command(dir.path, stdout)
  const control = yield* ResearchProcess.run(input)
  expect(control.exitCode).toBe(0)
  expect(control.failure).toBeUndefined()
  expect(control.timedOut || control.overflow || control.memoryExceeded).toBe(false)
  expect(control.stdout).toEqual({ data: Buffer.from(stdout), bytes: Buffer.byteLength(stdout), truncated: false })
  expect(control.stderr).toEqual({ data: Buffer.alloc(0), bytes: 0, truncated: false })
  const limited = { ...input, maxBytes: 64, capture: "head" as const }
  expect(Buffer.byteLength(stdout)).toBeGreaterThan(limited.maxBytes)
  const result = yield* ResearchProcess.run(limited)
  expect(result.failure).toBeUndefined()
  expect(result.timedOut || result.memoryExceeded).toBe(false)
  expect(result.overflow).toBe(true)
  expect(result.stdout.bytes).toBeGreaterThan(limited.maxBytes)
  expect(result.stdout.bytes).toBeLessThanOrEqual(Buffer.byteLength(stdout))
  expect(result.stdout.truncated).toBe(true)
  expect(result.stdout.data.byteLength).toBe(limited.maxBytes)
  expect(result.stdout.data.toString("utf8")).toBe(Buffer.from(stdout).subarray(0, limited.maxBytes).toString("utf8"))
  expect(result.stderr).toEqual({ data: Buffer.alloc(0), bytes: 0, truncated: false })
  // Each ResearchProcess call closes its native scope; a later real child still completes normally.
  const after = yield* ResearchProcess.run(command(dir.path, "AFTER-OVERFLOW"))
  expect(after.exitCode).toBe(0)
  expect(after.failure).toBeUndefined()
  expect(after.timedOut || after.overflow || after.memoryExceeded).toBe(false)
  expect(after.stdout.data.toString("utf8")).toBe("AFTER-OVERFLOW")
}), 60_000)
