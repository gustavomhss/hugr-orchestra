import { describe, expect } from "bun:test"
import { YAML } from "bun"
import fs from "fs/promises"
import path from "path"
import { Context, Effect, Fiber, Layer } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import {
  archive,
  executable,
  failure,
  gate,
  options,
  placeholder,
  repository,
  serve,
  until,
  withTmp,
} from "./fixture/ripgrep-release"
import { it } from "./lib/effect"

/** A service with no rg on PATH that installs into `directory`; it lives as long as the test scope. */
const binary = Effect.fnUntraced(function* (
  directory: string,
  release: RipgrepBinary.Release,
  overrides: Partial<RipgrepBinary.Options> = {},
) {
  const context = yield* Layer.build(
    LayerNode.compile(RipgrepBinary.nodeWith({ ...options(directory, release), ...overrides })),
  )
  return Context.get(context, RipgrepBinary.Service)
})

/** Entries an install may leave in its directory: the executable, temp directories and staged copies. */
const leftovers = (directory: string) =>
  Effect.promise(() => fs.readdir(directory).catch(() => [] as string[])).pipe(
    Effect.map((names) =>
      names.filter((name) => name === executable || name.startsWith("ripgrep-") || name.startsWith(".ripgrep-staged-")),
    ),
  )

describe("RipgrepBinary", () => {
  it.live("retries a 504 and installs the verified archive", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const server = yield* serve((request) =>
        request === 1 ? new Response("gateway timeout", { status: 504 }) : new Response(built.bytes),
      )
      const service = yield* binary(path.join(dir, "bin"), built.release(server.url))

      const resolved = yield* service.filepath
      expect(resolved).toBe(path.join(dir, "bin", executable))
      expect(new Uint8Array(yield* Effect.promise(() => fs.readFile(resolved)))).toEqual(
        new Uint8Array(built.executable),
      )
      expect(server.counter.requests).toBe(2)
      // Resolved once, then reused without another request.
      expect(yield* service.filepath).toBe(resolved)
      expect(server.counter.requests).toBe(2)
    }),
  )

  it.live("makes `attempts` requests in total, the first included", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const server = yield* serve(() => new Response("unavailable", { status: 503 }))
      const service = yield* binary(path.join(dir, "bin"), placeholder(server.url), { attempts: 3 })

      expect(failure(yield* Effect.exit(service.filepath)).message).toContain("HTTP 503")
      expect(server.counter.requests).toBe(3)
    }),
  )

  it.live("bounds an attempt that never answers", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const held = gate()
      const server = yield* serve(() => held.promise.then(() => new Response("released", { status: 503 })))
      // Finalizers run last-in first-out: answer the held requests before the server stops, so teardown never waits on
      // a handler that cannot settle (Windows stalled there until the test timeout).
      yield* Effect.addFinalizer(() => Effect.sync(held.open))
      const service = yield* binary(path.join(dir, "bin"), placeholder(server.url), {
        connectTimeout: "150 millis",
        attempts: 2,
      })

      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain("no response within")
      expect(error.retry).toBe(true)
      expect(server.counter.requests).toBe(2)
    }),
  )

  it.live("bounds an attempt whose body stalls", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const server = yield* serve(
        () =>
          new Response(
            new ReadableStream({
              start: (controller) => controller.enqueue(new Uint8Array([1, 2, 3])),
            }),
          ),
      )
      const service = yield* binary(path.join(dir, "bin"), placeholder(server.url), {
        attemptTimeout: "300 millis",
        attempts: 1,
      })

      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain("did not finish within")
      expect(server.counter.requests).toBe(1)
    }),
  )

  it.live("returns to the caller after `wait` while the download finishes in the background", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const held = gate()
      const server = yield* serve(async () => {
        await held.promise
        return new Response(built.bytes)
      })
      const service = yield* binary(path.join(dir, "bin"), built.release(server.url), { wait: "100 millis" })

      // The server answers only when the gate opens, so this caller can only return through its `wait` bound.
      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain("still downloading")
      expect(error.retry).toBe(true)

      held.open()
      const resolved = yield* service.filepath.pipe(
        Effect.retry({ while: (error) => error.message.includes("still downloading"), times: 100 }),
      )
      expect(resolved).toBe(path.join(dir, "bin", executable))
      expect(server.counter.requests).toBe(1)
    }),
  )

  it.live("an interrupted caller does not cancel the download it started", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const held = gate()
      const server = yield* serve(async () => {
        await held.promise
        return new Response(built.bytes)
      })
      const service = yield* binary(path.join(dir, "bin"), built.release(server.url))

      // A request that starts the download and is cancelled while it runs, as an aborted tool call is.
      const caller = yield* Effect.forkChild(service.filepath)
      yield* until(() => server.counter.requests === 1)
      yield* Fiber.interrupt(caller)
      held.open()

      expect(yield* service.filepath).toBe(path.join(dir, "bin", executable))
      expect(server.counter.requests).toBe(1)
    }),
  )

  it.live("shares one download across concurrent callers and across instances", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const held = gate()
      const server = yield* serve(async () => {
        await held.promise
        return new Response(built.bytes)
      })
      const release = built.release(server.url)
      // Two instances over one directory stand for two processes; the host lock lets one of them download.
      const first = yield* binary(path.join(dir, "bin"), release)
      const second = yield* binary(path.join(dir, "bin"), release)

      const callers = yield* Effect.forkChild(
        Effect.all(
          Array.from({ length: 8 }, (_, index) => (index % 2 ? first : second).filepath),
          { concurrency: "unbounded" },
        ),
      )
      yield* until(() => server.counter.requests === 1)
      held.open()
      expect(new Set(yield* Fiber.join(callers))).toEqual(new Set([path.join(dir, "bin", executable)]))
      expect(server.counter.requests).toBe(1)
    }),
  )

  it.live("refuses an archive that fails its integrity check, once for all callers, installing nothing", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const held = gate()
      const server = yield* serve(async () => {
        await held.promise
        return new Response(built.bytes)
      })
      const service = yield* binary(path.join(dir, "bin"), { ...built.release(server.url), sha256: "f".repeat(64) })

      // Concurrent callers join the one download; without that, each would take the host lock in turn, find no
      // install, and download again.
      const callers = yield* Effect.forkChild(
        Effect.all(
          Array.from({ length: 4 }, () => Effect.exit(service.filepath)),
          { concurrency: "unbounded" },
        ),
      )
      yield* until(() => server.counter.requests === 1)
      held.open()
      for (const error of (yield* Fiber.join(callers)).map(failure)) {
        expect(error.message).toContain("integrity check")
        expect(error.retry).toBe(false)
      }
      expect(server.counter.requests).toBe(1)
      expect(yield* leftovers(path.join(dir, "bin"))).toEqual([])
    }),
  )

  it.live("never installs an executable that does not run here", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir, "not an executable for any platform")
      const server = yield* serve(() => new Response(built.bytes))
      const service = yield* binary(path.join(dir, "bin"), built.release(server.url))

      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain("does not run on")
      expect(server.counter.requests).toBe(1)
      expect(yield* leftovers(path.join(dir, "bin"))).toEqual([])
    }),
  )

  it.live("sweeps what a dead install left behind before installing", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const bin = path.join(dir, "bin")
      const built = yield* archive(dir)
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(bin, "ripgrep-dead", "out"), { recursive: true })
        await fs.writeFile(path.join(bin, `.ripgrep-staged-ripgrep-dead-${executable}`), "partial copy")
        await fs.writeFile(path.join(bin, "unrelated"), "kept")
      })
      const server = yield* serve(() => new Response(built.bytes))
      const service = yield* binary(bin, built.release(server.url))

      expect(yield* service.filepath).toBe(path.join(bin, executable))
      expect(yield* leftovers(bin)).toEqual([executable])
      expect(yield* Effect.promise(() => fs.readFile(path.join(bin, "unrelated"), "utf8"))).toBe("kept")
    }),
  )

  it.live("reports a defect with its own message, not as an interruption", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const server = yield* serve(() => new Response(built.bytes))
      const release = built.release(server.url)
      // A dependency that throws mid-install, as a failed system call surfacing as a defect would.
      const throwing = {
        url: release.url,
        sha256: release.sha256,
        extension: release.extension,
        get root(): string {
          throw new Error("EACCES: permission denied")
        },
      }
      const service = yield* binary(path.join(dir, "bin"), throwing)

      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain("EACCES: permission denied")
      expect(error.message).not.toContain("interrupted")
    }),
  )

  it.live("does not retry a 404", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const server = yield* serve(() => new Response("missing", { status: 404 }))
      const service = yield* binary(path.join(dir, "bin"), placeholder(server.url))

      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain("HTTP 404")
      expect(server.counter.requests).toBe(1)
    }),
  )

  // On the TestClock: the cooldown is decided by the clock, never by how long a step took.
  it.effect("repeats a failed download's error until the cooldown passes, then tries again", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const server = yield* serve(() => new Response("unavailable", { status: 503 }))
      const service = yield* binary(path.join(dir, "bin"), placeholder(server.url), {
        attempts: 1,
        cooldown: "1 minute",
      })

      expect(failure(yield* Effect.exit(service.filepath)).message).toContain("HTTP 503")
      expect(failure(yield* Effect.exit(service.filepath)).message).toContain("HTTP 503")
      expect(server.counter.requests).toBe(1)
      yield* TestClock.adjust("59 seconds")
      expect(failure(yield* Effect.exit(service.filepath)).message).toContain("HTTP 503")
      expect(server.counter.requests).toBe(1)
      yield* TestClock.adjust("2 seconds")
      expect(failure(yield* Effect.exit(service.filepath)).message).toContain("HTTP 503")
      expect(server.counter.requests).toBe(2)
    }),
  )

  it.live("with downloads disabled, fails at once naming the flag and makes no request", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const server = yield* serve(() => new Response("never asked"))
      const service = yield* binary(path.join(dir, "bin"), placeholder(server.url), { download: false })

      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain(RipgrepBinary.DISABLE_DOWNLOAD)
      expect(server.counter.requests).toBe(0)
      expect(RipgrepBinary.defaults({ [RipgrepBinary.DISABLE_DOWNLOAD]: "1" }).download).toBe(false)
      expect(RipgrepBinary.defaults({ [RipgrepBinary.DISABLE_DOWNLOAD]: "true" }).download).toBe(false)
      expect(RipgrepBinary.defaults({}).download).toBe(true)
    }),
  )

  // The CI workflows put rg on PATH and set the flag (.github/actions/ripgrep); this fails if a lane, or Turbo's env
  // filtering, loses either, which would let a test process download again.
  it.live("in CI, rg resolves on PATH and the default service refuses to download", () =>
    Effect.sync(() => {
      if (!process.env.CI) return
      expect(process.env[RipgrepBinary.DISABLE_DOWNLOAD]).toBe("1")
      expect(RipgrepBinary.defaults().download).toBe(false)
      const system = RipgrepBinary.defaults().system()
      expect(system && path.basename(system).toLowerCase()).toBe(executable)
    }),
  )

  it.live("prefers rg on PATH over any download", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const system = path.join(dir, executable)
      yield* Effect.promise(() => fs.writeFile(system, "system ripgrep"))
      const server = yield* serve(() => new Response("never asked"))
      const service = yield* binary(path.join(dir, "bin"), placeholder(server.url), { system: () => system })

      expect(yield* service.filepath).toBe(system)
      expect(server.counter.requests).toBe(0)
    }),
  )

  it.live("pins a sha256 for every supported platform and none for platforms without a working build", () =>
    Effect.sync(() => {
      expect([...RipgrepBinary.keys()].sort()).toEqual([
        "arm64-darwin",
        "arm64-linux",
        "arm64-linux-musl",
        "arm64-win32",
        "x64-darwin",
        "x64-linux",
        "x64-win32",
      ])
      for (const key of RipgrepBinary.keys()) {
        const release = RipgrepBinary.release(key)
        expect(release?.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(release?.url).toBe(
          `https://github.com/BurntSushi/ripgrep/releases/download/${RipgrepBinary.VERSION}/${release?.root}.${release?.extension}`,
        )
      }
      // arm64 has distinct glibc and musl releases; x64's static musl build serves both.
      expect(RipgrepBinary.key({ arch: "arm64", platform: "linux", musl: true })).toBe("arm64-linux-musl")
      expect(RipgrepBinary.release("arm64-linux-musl")?.root).toBe(
        `ripgrep-${RipgrepBinary.VERSION}-aarch64-unknown-linux-musl`,
      )
      expect(RipgrepBinary.key({ arch: "x64", platform: "linux", musl: true })).toBe("x64-linux")
      expect(RipgrepBinary.key({ arch: "arm64", platform: "linux", musl: false })).toBe("arm64-linux")
      expect(RipgrepBinary.key({ arch: "arm64", platform: "darwin", musl: false })).toBe("arm64-darwin")
      expect(RipgrepBinary.release("ia32-win32")).toBeUndefined()
    }),
  )

  it.live("the CI action pins the same version and archives as RipgrepBinary", () =>
    Effect.promise(async () => {
      const action = YAML.parse(await Bun.file(path.join(repository, ".github/actions/ripgrep/action.yml")).text()) as {
        runs: { steps: { name: string; run?: string }[] }
      }
      const script = action.runs.steps.find((step) => step.name === "Select ripgrep release")?.run ?? ""
      expect(script).toContain(`version=${RipgrepBinary.VERSION}\n`)
      const runner: Record<string, string> = {
        "Linux-X64": "x64-linux",
        "Linux-ARM64": "arm64-linux",
        "macOS-ARM64": "arm64-darwin",
        "macOS-X64": "x64-darwin",
        "Windows-X64": "x64-win32",
        "Windows-ARM64": "arm64-win32",
      }
      const rows = [
        ...script.matchAll(/^\s*([A-Za-z]+-[A-Z0-9]+)\) platform=([^;]+); ext=([^;]+); sha=([0-9a-f]+) ;;$/gm),
      ]
      // GitHub runner OS/CPU keys select glibc on arm64 Linux; musl is a separate packaged CLI target.
      expect(rows.map((row) => row[1]).sort()).toEqual(Object.keys(runner).sort())
      for (const row of rows) {
        const release = RipgrepBinary.release(runner[row[1]!])
        expect({ root: `ripgrep-${RipgrepBinary.VERSION}-${row[2]}`, extension: row[3], sha256: row[4] }).toEqual<
          Record<string, string | undefined>
        >({
          root: release?.root,
          extension: release?.extension,
          sha256: release?.sha256,
        })
      }
    }),
  )

  it.live("the Linux sandbox runtime installs RipgrepBinary's archive, or uses rg on PATH when downloads are off", () =>
    Effect.sync(() => {
      const release = RipgrepBinary.release("arm64-linux")!
      const downloading = ToolSafetySandboxRuntime.source({
        arch: "arm64",
        platform: "linux",
        download: true,
        ripgrep: release,
      })
      expect(downloading?.artifacts.filter((artifact) => artifact.target === "ripgrep")).toEqual([
        {
          url: release.url,
          integrity: `sha256-${Buffer.from(release.sha256, "hex").toString("base64")}`,
          root: release.root,
          target: "ripgrep",
        },
      ])
      expect(downloading?.ripgrep).toBeUndefined()
      expect(downloading?.dependencies).not.toContain("rg")

      for (const source of [
        ToolSafetySandboxRuntime.source({ arch: "arm64", platform: "linux", download: false, ripgrep: release }),
        ToolSafetySandboxRuntime.source({ arch: "arm64", platform: "linux", download: true, ripgrep: undefined }),
      ]) {
        expect(source?.artifacts.some((artifact) => artifact.url.includes("BurntSushi"))).toBe(false)
        expect(source?.ripgrep).toBe("path")
        expect(source?.dependencies).toContain("rg")
        expect(source?.directory).not.toBe(downloading?.directory)
      }
      expect(
        ToolSafetySandboxRuntime.source({ arch: "arm64", platform: "darwin", download: true, ripgrep: release }),
      ).toBeUndefined()
    }),
  )
})
