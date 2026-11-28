import { expect, test } from "bun:test"
import { EventEmitter, getEventListeners } from "node:events"
import { PassThrough } from "node:stream"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { LinuxWorkspaceAccess } from "./linux-workspace-access"

class FailedRun extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly killed: NodeJS.Signals[] = []
  kill(signal: NodeJS.Signals = "SIGTERM") { this.killed.push(signal); return true }
}

test("workspace error without close detaches every pipe and callback before the old timeout can cancel", async () => {
  expectSpawn(import.meta.path)
  const child = new FailedRun()
  const calls: string[] = []
  const input = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const controller = new AbortController()
  const access = LinuxWorkspaceAccess.create({
    prepare: async () => ({ endpoint: "fixture", workspaceID: "fixture", key: "fixture" }),
    verify: async () => {},
    command: (_connection, input) => {
      const operation = input.argv.find((value) => ["prepare", "clean", "cancel"].includes(value)) ?? "run"
      calls.push(operation)
      return {
        file: process.execPath,
        args: ["-e", operation === "prepare"
          ? "process.stdin.resume(); process.stdin.on('end', () => process.exit(0))"
          : "console.log(JSON.stringify({ exitCode: null, cancelled: false, timedOut: false }))"],
        env: { ...process.env },
      }
    },
    spawnRun: () => {
      queueMicrotask(() => child.emit("error", new Error("fixture-transport-failed")))
      return child
    },
  })
  await expect(access.run({ argv: ["fixture"], timeoutMs: 25 }, {
    signal: controller.signal, input, output: { stdout, stderr },
  })).rejects.toThrow("workspace-exec-failed")
  expect(input.listenerCount("data")).toBe(0)
  expect(child.stdout.listenerCount("data")).toBe(0)
  expect(child.stderr.listenerCount("data")).toBe(0)
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0)
  await Bun.sleep(300)
  expect(calls).toEqual(["prepare", "run", "clean"])
  expect(child.killed).toEqual([])
  child.emit("close", 0, null)
  controller.abort()
  await access.close()
  expect(calls).toEqual(["prepare", "run", "clean"])
})
