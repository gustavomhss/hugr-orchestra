import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import * as Effect from "effect/Effect"
import { ServeShutdown } from "./serve-shutdown"

describe("serve shutdown signals", () => {
  test("SIGBREAK ends the wait on Windows and every listener is removed", async () => {
    const emitter = new EventEmitter()
    const seen: string[] = []
    const done = Effect.runPromise(ServeShutdown.untilSignal(emitter, "win32", (signal) => void seen.push(signal)))
    await Bun.sleep(10)
    expect(emitter.listenerCount("SIGBREAK")).toBe(1)
    emitter.emit("SIGBREAK")
    await done
    expect(seen).toEqual(["SIGBREAK"])
    expect(ServeShutdown.signals("win32").map((signal) => emitter.listenerCount(signal))).toEqual([0, 0, 0, 0])
  })

  test("SIGBREAK is not watched off Windows", () => {
    expect(ServeShutdown.signals("linux")).not.toContain("SIGBREAK")
    expect(ServeShutdown.signals("win32")).toContain("SIGBREAK")
  })

  test("SIGHUP ends the wait on every platform", async () => {
    const emitter = new EventEmitter()
    const done = Effect.runPromise(ServeShutdown.untilSignal(emitter, "linux", () => {}))
    await Bun.sleep(10)
    emitter.emit("SIGHUP")
    await done
  })

  test("exit codes follow the shell convention", () => {
    expect(ServeShutdown.exitCode("SIGINT")).toBe(130)
    expect(ServeShutdown.exitCode("SIGTERM")).toBe(143)
  })

  test("evidence is written only under DEBUG logging, in the shape the Windows campaign reads", () => {
    const input = { pid: 7, signal: "SIGBREAK", status: "started", elapsedMs: 3 } as const
    expect(ServeShutdown.evidence({ ...input, level: undefined })).toBeUndefined()
    const line = ServeShutdown.evidence({ ...input, level: "DEBUG" })!
    expect(line.startsWith("CLI_SHUTDOWN ")).toBe(true)
    expect(JSON.parse(line.slice("CLI_SHUTDOWN ".length))).toEqual({
      event: "cli.shutdown",
      level: "DEBUG",
      pid: 7,
      signal: "SIGBREAK",
      status: "started",
      elapsedMs: 3,
    })
  })
})
