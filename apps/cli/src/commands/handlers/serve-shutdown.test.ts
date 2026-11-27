import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { Effect, Fiber } from "effect"
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

  for (const [platform, signal] of [["linux", "SIGHUP"], ["win32", "SIGBREAK"], ["linux", "SIGTERM"]] as const) {
    test(`${signal} during installation acquisition waits for disposal and keeps listening during cleanup`, async () => {
      const emitter = new EventEmitter()
      const events: string[] = []
      const acquiring = Promise.withResolvers<void>()
      const acquired = Promise.withResolvers<void>()
      const disposing = Promise.withResolvers<void>()
      const disposed = Promise.withResolvers<void>()
      const runtime = () => void events.push("runtime")
      emitter.on(signal, runtime)
      const lifetime = Effect.scoped(Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.promise(async () => {
            events.push("factory")
            acquiring.resolve()
            await acquired.promise
          }),
          () => Effect.promise(async () => {
            events.push("dispose:start")
            disposing.resolve()
            await disposed.promise
            events.push("dispose:done")
          }),
        )
        events.push("bind")
        return yield* Effect.never
      }))
      const fiber = Effect.runFork(ServeShutdown.withSignals(emitter, platform, (first) => void events.push(first), lifetime))
      try {
        await acquiring.promise
        expect(ServeShutdown.signals(platform).map((name) => emitter.listenerCount(name)))
          .toEqual(ServeShutdown.signals(platform).map((name) => name === signal ? 2 : 1))
        emitter.emit(signal)
        expect(events).toEqual(["factory", signal, "runtime"])
        acquired.resolve()
        await disposing.promise
        expect(ServeShutdown.signals(platform).map((name) => emitter.listenerCount(name)))
          .toEqual(ServeShutdown.signals(platform).map((name) => name === signal ? 2 : 1))
        emitter.emit(signal)
        expect(emitter.emit("SIGINT")).toBe(true)
        expect(events).toEqual(["factory", signal, "runtime", "dispose:start", "runtime"])
        disposed.resolve()
        await Effect.runPromise(Fiber.join(fiber))
        expect(events.at(-1)).toBe("dispose:done")
        expect(ServeShutdown.signals(platform).map((name) => emitter.listenerCount(name)))
          .toEqual(ServeShutdown.signals(platform).map((name) => name === signal ? 1 : 0))
      } finally {
        acquired.resolve()
        disposed.resolve()
        await Effect.runPromise(Fiber.interrupt(fiber))
      }
    })
  }

  test("removes installation signal listeners after startup failure", async () => {
    const emitter = new EventEmitter()
    const seen: NodeJS.Signals[] = []
    const failure = new Error("bind failed")
    const result = await Effect.runPromise(ServeShutdown.withSignals(
      emitter, "win32", (signal) => void seen.push(signal), Effect.fail(failure),
    ).pipe(Effect.flip))
    expect(result).toBe(failure)
    expect(emitter.eventNames()).toEqual([])
    expect(seen).toEqual([])
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
