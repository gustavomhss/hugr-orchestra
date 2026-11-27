import { expect } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { constants, tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { Deferred, Effect, Fiber, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"

const it = testEffect(LayerNode.compile(AppProcess.node))
const entrypoint = fileURLToPath(new URL("../src/index.ts", import.meta.url))
const hostname = "127.0.0.1"
const reservePort = Effect.acquireRelease(
  Effect.sync(() => Bun.serve({ hostname, port: 0, reusePort: false, fetch: () => new Response("reserved") })),
  (listener) => Effect.promise(async () => { await listener.stop(true) }),
)

it.live("the source CLI dispatches an installation request and awaits slow disposal", () =>
  Effect.gen(function* () {
    const app = yield* AppProcess.Service
    const port = yield* reservePort.pipe(Effect.map((listener) => listener.port!), Effect.scoped)
    const fixture = yield* installationFixture(port)
    const listening = `server listening on ${fixture.origin}`
    expectSpawn(import.meta.path)
    const child = yield* app.spawn(fixture.command)
    const output = yield* child.all.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.takeUntil((line) => line.includes(listening)),
      Stream.mkString,
      Effect.timeout("60 seconds"),
    )
    expect(output).toContain(listening)
    const response = yield* Effect.tryPromise(async (signal) => {
      const response = await fetch(`${fixture.origin}/installation/probe?q=synthetic`, {
        method: "POST", body: "installation test", signal,
      })
      return { status: response.status, body: await response.json() }
    }).pipe(Effect.timeout("10 seconds"))
    expect(response).toEqual({
      status: 200,
      body: { origin: fixture.origin, method: "POST", query: "?q=synthetic", body: "installation test" },
    })

    const signal = process.platform === "win32" ? "SIGBREAK" : "SIGTERM"
    if (process.platform === "win32") {
      // Windows hosts cannot deliver a graceful SIGTERM to an arbitrary child.
      const status = yield* Effect.tryPromise(async (signal) => {
        const response = await fetch(`${fixture.origin}/installation/stop`, { method: "POST", signal })
        return response.status
      }).pipe(Effect.timeout("10 seconds"))
      expect(status).toBe(202)
    } else {
      expect(process.kill(child.pid, signal)).toBe(true)
    }

    expect(yield* child.exitCode.pipe(Effect.timeout("15 seconds"))).toBe(128 + (constants.signals[signal] ?? 0))
    expect(yield* fixture.events).toEqual([
      `factory ${fixture.origin} database=false credentials=false`,
      "dispose start",
      "dispose end",
    ])
  }), 120_000)

it.live("the source CLI disposes exactly once when its explicit port is occupied", () =>
  Effect.gen(function* () {
    const app = yield* AppProcess.Service
    const listener = yield* reservePort
    const fixture = yield* installationFixture(listener.port!)
    expectSpawn(import.meta.path)
    const result = yield* app.run(fixture.command, {
      timeout: "60 seconds",
      maxOutputBytes: 64 * 1024,
      maxErrorBytes: 64 * 1024,
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout.toString("utf8") + result.stderr.toString("utf8")).toMatch(/EADDRINUSE|port .*in use/i)
    expect(result.stdout.toString("utf8")).not.toContain("server listening on")
    expect(yield* fixture.events).toEqual([
      `factory ${fixture.origin} database=false credentials=false`,
      "dispose start",
      "dispose end",
    ])
  }), 120_000)

it.live("the source CLI disposes an installation signaled during factory acquisition before binding", () =>
  Effect.gen(function* () {
    const app = yield* AppProcess.Service
    const port = yield* reservePort.pipe(Effect.map((listener) => listener.port!), Effect.scoped)
    const fixture = yield* installationFixture(port, true)
    const factoryReady = yield* Deferred.make<void>()
    const shutdownStarted = yield* Deferred.make<void>()
    const signal = process.platform === "win32" ? "SIGBREAK" : "SIGHUP"
    expectSpawn(import.meta.path)
    const child = yield* app.spawn(fixture.command)
    const output = yield* child.all.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.tap((line) => {
        if (line.includes("installation factory awaiting release")) return Deferred.succeed(factoryReady, undefined)
        if (line.includes("CLI_SHUTDOWN ") && line.includes(`"signal":"${signal}"`) && line.includes('"status":"started"'))
          return Deferred.succeed(shutdownStarted, undefined)
        return Effect.void
      }),
      Stream.mkString,
      Effect.forkScoped,
    )
    const waitFor = (marker: Deferred.Deferred<void>, label: string) => Effect.raceFirst(
      Deferred.await(marker),
      Fiber.join(output).pipe(Effect.flatMap((text) => Effect.fail(new Error(`Source CLI exited before ${label}: ${text}`)))),
    ).pipe(Effect.timeout("45 seconds"))

    yield* waitFor(factoryReady, "factory acquisition")
    expect(yield* fixture.events).toEqual([`factory ${fixture.origin} database=false credentials=false`])
    if (process.platform === "win32") {
      // The private marker asks the blocked child factory to deliver the event to its actual process listeners.
      yield* Effect.promise(() => Bun.write(fixture.signal, ""))
    } else {
      expect(process.kill(child.pid, signal)).toBe(true)
    }
    yield* waitFor(shutdownStarted, "shutdown acknowledgement")
    expect(yield* child.isRunning).toBe(true)
    yield* Effect.promise(() => Bun.write(fixture.release, ""))

    expect(yield* child.exitCode.pipe(Effect.timeout("15 seconds"))).toBe(128 + (constants.signals[signal] ?? 0))
    expect(yield* Fiber.join(output).pipe(Effect.timeout("5 seconds"))).not.toContain("server listening on")
    expect(yield* Effect.promise(() => Bun.file(fixture.database).exists())).toBe(false)
    expect(yield* fixture.events).toEqual([
      `factory ${fixture.origin} database=false credentials=false`,
      "dispose start",
      "dispose end",
    ])
  }), 120_000)

function installationFixture(port: number, waitForRelease = false) {
  return Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(path.join(tmpdir(), "orchestra-installation-serve-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    )
    const home = path.join(directory, "home")
    const tmp = path.join(directory, "tmp")
    yield* Effect.promise(() => Promise.all([mkdir(home), mkdir(tmp)]))
    const module = path.join(directory, "installation.ts")
    const events = path.join(directory, "events.txt")
    const database = path.join(directory, "installation.sqlite")
    const release = path.join(directory, "factory-release")
    const signal = path.join(directory, "factory-signal")
    const origin = `http://${hostname}:${port}`
    yield* Effect.promise(() => Bun.write(module, `
      import { appendFile } from "node:fs/promises"

      export default async ({ origin }: { origin: string }) => {
        const events = ${JSON.stringify(events)}
        const databaseExists = await Bun.file(process.env.ORCHESTRA_DB!).exists()
        const credentials = Boolean(process.env.ORCHESTRA_SERVER_PASSWORD || process.env.ORCHESTRA_SERVER_USERNAME)
        await appendFile(events, "factory " + origin + " database=" + databaseExists + " credentials=" + credentials + "\\n")
        ${waitForRelease ? `
          console.log("installation factory awaiting release")
          if (process.platform === "win32") {
            while (!(await Bun.file(${JSON.stringify(signal)}).exists())) await Bun.sleep(20)
            process.emit("SIGBREAK")
          }
          while (!(await Bun.file(${JSON.stringify(release)}).exists())) await Bun.sleep(20)
        ` : ""}
        return {
          mount: "/installation",
          async handler(request: Request) {
            const url = new URL(request.url)
            if (request.method === "POST" && url.pathname === "/installation/stop" && process.platform === "win32") {
              setTimeout(() => process.emit("SIGBREAK"), 250)
              return new Response(null, { status: 202 })
            }
            if (url.pathname !== "/installation/probe") return undefined
            return Response.json({ origin, method: request.method, query: url.search, body: await request.text() })
          },
          async dispose() {
            await appendFile(events, "dispose start\\n")
            await Bun.sleep(2250)
            await appendFile(events, "dispose end\\n")
          },
        }
      }
    `))
    const inherited = ["PATH", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT"]
    const command = ChildProcess.make(process.execPath, [
      entrypoint, "serve", "--hostname", hostname, "--port", String(port), "--installation", module,
    ], {
      cwd: directory,
      extendEnv: false,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => inherited.includes(key.toUpperCase()))),
        HOME: home,
        USERPROFILE: home,
        APPDATA: path.join(home, "config"),
        LOCALAPPDATA: path.join(home, "data"),
        XDG_CONFIG_HOME: path.join(home, "config"),
        XDG_DATA_HOME: path.join(home, "data"),
        XDG_STATE_HOME: path.join(home, "state"),
        XDG_CACHE_HOME: path.join(home, "cache"),
        TMPDIR: tmp,
        TMP: tmp,
        TEMP: tmp,
        ORCHESTRA_TEST_HOME: home,
        ORCHESTRA_CONFIG_DIR: path.join(home, "orchestra-config"),
        ORCHESTRA_DB: database,
        ...(waitForRelease ? { ORCHESTRA_LOG_LEVEL: "DEBUG" } : {}),
        ORCHESTRA_CREDENTIAL_KEY_FILE: path.join(directory, "synthetic.key"),
        ORCHESTRA_SERVER_PASSWORD: "synthetic-installation-test-password",
        ORCHESTRA_INHERIT_CREDENTIALS: "0",
        ORCHESTRA_DISABLE_MODELS_FETCH: "1",
        ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
      },
    })
    return {
      command,
      origin,
      database,
      release,
      signal,
      events: Effect.promise(async () => (await Bun.file(events).text()).trimEnd().split("\n")),
    }
  })
}
