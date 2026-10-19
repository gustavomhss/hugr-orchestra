import { describe, expect } from "bun:test"
import path from "node:path"
import { Deferred, Effect, Fiber } from "effect"
import { Flag } from "@orchestra/core/flag/flag"
import { pollWithTimeout, testEffect } from "../../lib/effect"
import { expectSpawn } from "../../../../../packages/core/test/fixture/omni-expect"
import { ProcessFixture } from "./process-fixture"

const it = testEffect(ProcessFixture.layer)

// Adoption needs the real Omni spawner, as the shell tool's does.
const live = Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? it.instance.skip : it.instance
const fixture = ProcessFixture.fixture

describe("process MCP tool", () => {
  live(
    "start keeps a long-running command in the Processes panel's registry; tail follows it; stop ends it",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const command = yield* f.node(
          "server.cjs",
          `
      console.log("ready")
      let tick = 0
      setInterval(() => console.log("tick " + tick++), 100)
    `,
        )
        expectSpawn(import.meta.path)
        const started = yield* f.call({ action: "start", command, wait: 1_000 })
        expect(started.output).toContain("ready")
        expect(started.metadata.exit).toBeNull()
        const id = started.metadata.id
        expect(typeof id).toBe("string")
        expect(started.metadata.pid).toBeGreaterThan(0)
        // The shell permission decides the command, as for the shell tool, and the card received the early output live.
        expect(f.asks.some((ask) => ask.permission === "bash")).toBe(true)
        expect(f.streamed.some((output) => typeof output === "string" && output.includes("ready"))).toBe(true)

        // The Processes panel's own data source (session.processes) lists it with its tree.
        const panel = yield* f.processes.list(f.session.id)
        expect(panel.map((item) => item.id)).toEqual([id])
        expect(panel[0].processes.length).toBeGreaterThan(0)

        const listed = yield* f.call({ action: "list" })
        expect(listed.output).toContain(id)

        // Output written after the command went to the background reaches tail.
        const tail = yield* pollWithTimeout(
          f
            .call({ action: "tail", id, bytes: 256 })
            .pipe(Effect.map((result) => (result.output.includes("tick") ? result : undefined))),
          "tail never showed background output",
          "15 seconds",
        )
        expect(tail.metadata.running).toBe(true)
        expect(Buffer.byteLength(tail.output)).toBeLessThanOrEqual(256)

        const stopped = yield* f.call({ action: "stop", id })
        expect(stopped.metadata.stopped).toBe(true)
        expect(yield* f.processes.list(f.session.id)).toEqual([])
        expect((yield* f.call({ action: "tail", id })).metadata.running).toBe(false)
        expect((yield* f.call({ action: "stop", id })).metadata.stopped).toBe(false)
      }),
    60_000,
  )

  live(
    "a command that ends inside the wait returns its exit code and leaves nothing behind",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        expectSpawn(import.meta.path)
        const done = yield* f.call({
          action: "start",
          command: yield* f.node("done.cjs", `console.log("built")`),
          wait: 10_000,
        })
        expect(done.metadata.exit).toBe(0)
        expect(done.output).toContain("built")
        const failed = yield* f.call({
          action: "start",
          command: yield* f.node("fail.cjs", `console.log("broken"); process.exit(3)`),
          wait: 10_000,
        })
        expect(failed.metadata.exit).toBe(3)
        expect(failed.output).toContain("exit code 3")
        expect(yield* f.processes.list(f.session.id)).toEqual([])
      }),
    60_000,
  )

  live(
    "concurrent starts return only their own adopted PIDs",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const commands = yield* Effect.forEach(["first", "second"], (name) =>
          f.node(
            `${name}.cjs`,
            `
      console.log(${JSON.stringify(name)} + " pid=" + process.pid)
      setInterval(() => {}, 100)
    `,
          ),
        )
        expectSpawn(import.meta.path)
        const started = yield* Effect.forEach(
          commands,
          (command) => f.call({ action: "start", command, wait: 1_000 }),
          { concurrency: "unbounded" },
        )
        expect(new Set(started.map((result) => result.metadata.id)).size).toBe(2)
        const panel = yield* f.processes.list(f.session.id)
        started.forEach((result, index) => {
          expect(result.output).toContain(index === 0 ? "first pid=" : "second pid=")
          const runtimePID = Number(/pid=(\d+)/.exec(result.output)?.[1])
          expect(runtimePID).toBeGreaterThan(0)
          const entry = panel.find((item) => item.id === result.metadata.id)
          expect(entry?.pid).toBe(result.metadata.pid)
          expect(entry?.processes.map((item) => item.pid)).toContain(runtimePID)
        })
        yield* f.call({ action: "stop", id: started[0].metadata.id })
        expect((yield* f.processes.list(f.session.id)).map((item) => item.id)).toEqual([started[1].metadata.id])
      }),
    60_000,
  )

  live(
    "a concurrent command that finishes never claims the other start's process",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const ready = yield* Deferred.make<void>()
        const release = path.join(f.directory, "release")
        const command = yield* f.node(
          "short.cjs",
          `
      console.log("waiting")
      const timer = setInterval(() => {
        if (!require("node:fs").existsSync(${JSON.stringify(release)})) return
        clearInterval(timer)
      }, 20)
    `,
        )
        const ctx = f.context()
        expectSpawn(import.meta.path)
        const short = yield* Effect.forkScoped(
          f.call(
            { action: "start", command, wait: 20_000 },
            {
              ctx: {
                ...ctx,
                metadata: (input) =>
                  ctx
                    .metadata(input)
                    .pipe(
                      Effect.andThen(
                        typeof input.metadata?.output === "string" && input.metadata.output.includes("waiting")
                          ? Deferred.succeed(ready, undefined)
                          : Effect.void,
                      ),
                      Effect.asVoid,
                    ),
              },
            },
          ),
        )
        yield* Effect.raceFirst(
          Deferred.await(ready),
          Fiber.join(short).pipe(Effect.andThen(Effect.die(new Error("short command ended before readiness")))),
        ).pipe(Effect.timeout("10 seconds"))
        const long = yield* f.call({
          action: "start",
          wait: 500,
          command: yield* f.node("long.cjs", "setInterval(() => {}, 100)"),
        })
        yield* f.fs.writeFileString(release, "finish")
        const finished = yield* Fiber.join(short)
        expect(finished.metadata.exit).toBe(0)
        expect(finished.metadata.id).toBeUndefined()
        expect(finished.metadata.pid).toBeUndefined()
        expect((yield* f.processes.list(f.session.id)).map((item) => item.id)).toEqual([long.metadata.id])
      }),
    60_000,
  )

  it.instance(
    "tail and stop need an id, start needs a command",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        for (const params of [{ action: "tail" }, { action: "stop" }, { action: "start" }] as const)
          expect(
            yield* f.call(params).pipe(
              Effect.exit,
              Effect.map((exit) => exit._tag),
            ),
          ).toBe("Failure")
        expect((yield* f.call({ action: "list" })).output).toContain("No background processes")
      }),
    60_000,
  )
})
