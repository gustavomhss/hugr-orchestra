import { describe, expect } from "bun:test"
import { createHash } from "crypto"
import fs from "fs/promises"
import path from "path"
import { Cause, Context, Effect, Exit, Fiber, Layer, Option } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
// filesystem.ts imports search.ts and search.ts imports it back; loading filesystem first keeps the app's order.
import "@orchestra/core/filesystem"
import { FileSystemSearch } from "@orchestra/core/filesystem/search"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { AbsolutePath } from "@orchestra/core/schema"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const executable = process.platform === "win32" ? "rg.exe" : "rg"
const ROOT = "ripgrep-test"

type Handler = (request: number) => Response | Promise<Response>

/** A release server whose handler sees the 1-based request number; `requests` counts every request it got. */
const serve = (handler: Handler) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const counter = { requests: 0 }
      const server = Bun.serve({ port: 0, fetch: () => handler(++counter.requests) })
      return { counter, server, url: new URL("/archive", server.url).href }
    }),
    (input) => Effect.promise(() => input.server.stop(true)),
  )

const withTmp = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
).pipe(Effect.map((tmp) => tmp.path))

/** A real archive in this platform's release format, holding ROOT/rg (rg.exe on Windows). */
const archive = Effect.fnUntraced(function* (dir: string) {
  const source = path.join(dir, "source")
  yield* Effect.promise(() => fs.mkdir(path.join(source, ROOT), { recursive: true }))
  yield* Effect.promise(() => fs.writeFile(path.join(source, ROOT, executable), "fake ripgrep"))
  const extension = process.platform === "win32" ? ("zip" as const) : ("tar.gz" as const)
  const file = path.join(dir, `archive.${extension}`)
  // Windows releases are zips, which the System32 bsdtar writes from the name; elsewhere a gzipped tarball.
  yield* Effect.promise(() =>
    process.platform === "win32"
      ? Bun.$`${path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")} -a -cf ${file} ${ROOT}`
          .cwd(source)
          .quiet()
      : Bun.$`tar -czf ${file} ${ROOT}`.cwd(source).quiet(),
  )
  const bytes = yield* Effect.promise(() => Bun.file(file).bytes())
  return { bytes, extension, sha256: createHash("sha256").update(bytes).digest("hex") }
})

/** A service with no rg on PATH that installs into `directory` from `url`; it lives as long as the test scope. */
const binary = Effect.fnUntraced(function* (
  directory: string,
  release: Omit<RipgrepBinary.Release, "root">,
  options: Partial<RipgrepBinary.Options> = {},
) {
  const context = yield* Layer.build(
    LayerNode.compile(
      RipgrepBinary.nodeWith({
        system: () => undefined,
        directory,
        release: { ...release, root: ROOT },
        // CI sets ORCHESTRA_DISABLE_RIPGREP_DOWNLOAD; these tests download only from their local server.
        download: true,
        connectTimeout: "2 seconds",
        attemptTimeout: "5 seconds",
        attempts: 3,
        retryDelay: "10 millis",
        wait: "10 seconds",
        cooldown: "1 minute",
        ...options,
      }),
    ),
  )
  return Context.get(context, RipgrepBinary.Service)
})

const failure = <A>(exit: Exit.Exit<A, RipgrepBinary.Unavailable>) => {
  if (Exit.isSuccess(exit)) throw new Error(`expected a failure, got ${String(exit.value)}`)
  const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
  if (!error) throw new Error(`expected a typed failure, got ${String(exit.cause)}`)
  return error
}

describe("RipgrepBinary", () => {
  it.live("retries a 504 and installs the verified archive", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const server = yield* serve((request) =>
        request === 1 ? new Response("gateway timeout", { status: 504 }) : new Response(built.bytes),
      )
      const service = yield* binary(path.join(dir, "bin"), { url: server.url, ...built })

      const resolved = yield* service.filepath
      expect(resolved).toBe(path.join(dir, "bin", executable))
      expect(yield* Effect.promise(() => fs.readFile(resolved, "utf8"))).toBe("fake ripgrep")
      expect(server.counter.requests).toBe(2)
      // Resolved once, then reused without another request.
      expect(yield* service.filepath).toBe(resolved)
      expect(server.counter.requests).toBe(2)
    }),
  )

  it.live("bounds an attempt that never answers and stops after the configured attempts", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const server = yield* serve(() => new Promise<Response>(() => {}))
      const service = yield* binary(
        path.join(dir, "bin"),
        { url: server.url, sha256: "0".repeat(64), extension: "tar.gz" },
        { connectTimeout: "150 millis", attempts: 2 },
      )

      const started = Date.now()
      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain("no response within")
      expect(error.retry).toBe(true)
      expect(server.counter.requests).toBe(2)
      expect(Date.now() - started).toBeLessThan(5_000)
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
      const service = yield* binary(
        path.join(dir, "bin"),
        { url: server.url, sha256: "0".repeat(64), extension: "tar.gz" },
        { attemptTimeout: "300 millis", attempts: 1 },
      )

      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain("did not finish within")
      expect(server.counter.requests).toBe(1)
    }),
  )

  it.live("returns to the caller after `wait` while the download finishes in the background", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const server = yield* serve(async () => {
        await Bun.sleep(800)
        return new Response(built.bytes)
      })
      const service = yield* binary(path.join(dir, "bin"), { url: server.url, ...built }, { wait: "100 millis" })

      const started = Date.now()
      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain("still downloading")
      expect(Date.now() - started).toBeLessThan(700)

      // The interrupted wait did not cancel the download; a later caller joins and gets it.
      const resolved = yield* service.filepath.pipe(
        Effect.retry({ while: (error) => error.message.includes("still downloading"), times: 50 }),
      )
      expect(resolved).toBe(path.join(dir, "bin", executable))
      expect(server.counter.requests).toBe(1)
    }),
  )

  it.live("an interrupted caller does not cancel the download it started", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const server = yield* serve(async () => {
        await Bun.sleep(400)
        return new Response(built.bytes)
      })
      const service = yield* binary(path.join(dir, "bin"), { url: server.url, ...built })

      // A request that starts the download and is then cancelled, as an aborted tool call is.
      const caller = yield* Effect.forkChild(service.filepath)
      yield* Effect.sleep("100 millis")
      yield* Fiber.interrupt(caller)

      expect(yield* service.filepath).toBe(path.join(dir, "bin", executable))
      expect(server.counter.requests).toBe(1)
    }),
  )

  it.live("shares one download across concurrent callers and across instances", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const server = yield* serve(async () => {
        await Bun.sleep(200)
        return new Response(built.bytes)
      })
      const release = { url: server.url, ...built }
      // Two instances over one directory stand for two processes; the host lock lets one of them download.
      const first = yield* binary(path.join(dir, "bin"), release)
      const second = yield* binary(path.join(dir, "bin"), release)

      const resolved = yield* Effect.all(
        Array.from({ length: 8 }, (_, index) => (index % 2 ? first : second).filepath),
        { concurrency: "unbounded" },
      )
      expect(new Set(resolved)).toEqual(new Set([path.join(dir, "bin", executable)]))
      expect(server.counter.requests).toBe(1)
    }),
  )

  it.live("refuses an archive that fails its integrity check, once for all callers, installing nothing", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const built = yield* archive(dir)
      const server = yield* serve(async () => {
        await Bun.sleep(200)
        return new Response(built.bytes)
      })
      const service = yield* binary(path.join(dir, "bin"), { ...built, url: server.url, sha256: "f".repeat(64) })

      // Concurrent callers join the one download; without that, each would take the host lock in turn, find no
      // install, and download again.
      const errors = (yield* Effect.all(Array.from({ length: 4 }, () => Effect.exit(service.filepath)), {
        concurrency: "unbounded",
      })).map(failure)
      for (const error of errors) {
        expect(error.message).toContain("integrity check")
        expect(error.retry).toBe(false)
      }
      expect(server.counter.requests).toBe(1)
      const left = yield* Effect.promise(() => fs.readdir(path.join(dir, "bin")))
      expect(left.filter((name) => name.includes("rg") || name.startsWith("ripgrep-"))).toEqual([])
    }),
  )

  it.live("does not retry a 404", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const server = yield* serve(() => new Response("missing", { status: 404 }))
      const service = yield* binary(path.join(dir, "bin"), {
        url: server.url,
        sha256: "0".repeat(64),
        extension: "tar.gz",
      })

      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain("HTTP 404")
      expect(server.counter.requests).toBe(1)
    }),
  )

  it.live("repeats a failed download's error until the cooldown passes, then tries again", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const server = yield* serve(() => new Response("unavailable", { status: 503 }))
      const service = yield* binary(
        path.join(dir, "bin"),
        { url: server.url, sha256: "0".repeat(64), extension: "tar.gz" },
        { attempts: 1, cooldown: "400 millis" },
      )

      expect(failure(yield* Effect.exit(service.filepath)).message).toContain("HTTP 503")
      expect(failure(yield* Effect.exit(service.filepath)).message).toContain("HTTP 503")
      expect(server.counter.requests).toBe(1)
      yield* Effect.sleep("500 millis")
      expect(failure(yield* Effect.exit(service.filepath)).message).toContain("HTTP 503")
      expect(server.counter.requests).toBe(2)
    }),
  )

  it.live("with downloads disabled, fails at once naming the flag and makes no request", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const server = yield* serve(() => new Response("never asked"))
      const service = yield* binary(
        path.join(dir, "bin"),
        { url: server.url, sha256: "0".repeat(64), extension: "tar.gz" },
        { download: false },
      )

      const error = failure(yield* Effect.exit(service.filepath))
      expect(error.message).toContain(RipgrepBinary.DISABLE_DOWNLOAD)
      expect(server.counter.requests).toBe(0)
      expect(RipgrepBinary.defaults({ [RipgrepBinary.DISABLE_DOWNLOAD]: "1" }).download).toBe(false)
      expect(RipgrepBinary.defaults({ [RipgrepBinary.DISABLE_DOWNLOAD]: "true" }).download).toBe(false)
      expect(RipgrepBinary.defaults({}).download).toBe(true)
    }),
  )

  // The CI workflows put rg on PATH and set the flag (.github/actions/ripgrep); this fails if a lane, or Turbo's env
  // filtering, loses it, which would let a test process download again.
  it.live("in CI, the default service refuses to download", () =>
    Effect.sync(() => {
      if (!process.env.CI) return
      expect(process.env[RipgrepBinary.DISABLE_DOWNLOAD]).toBe("1")
      expect(RipgrepBinary.defaults().download).toBe(false)
    }),
  )

  it.live("prefers rg on PATH over any download", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const system = path.join(dir, executable)
      yield* Effect.promise(() => fs.writeFile(system, "system ripgrep"))
      const server = yield* serve(() => new Response("never asked"))
      const service = yield* binary(
        path.join(dir, "bin"),
        { url: server.url, sha256: "0".repeat(64), extension: "tar.gz" },
        { system: () => system },
      )

      expect(yield* service.filepath).toBe(system)
      expect(server.counter.requests).toBe(0)
    }),
  )

  it.live("pins a sha256 for every published platform", () =>
    Effect.sync(() => {
      const keys = ["arm64-darwin", "x64-darwin", "arm64-linux", "x64-linux", "arm64-win32", "ia32-win32", "x64-win32"]
      for (const key of keys) {
        const release = RipgrepBinary.release(key)
        expect(release?.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(release?.url).toBe(
          `https://github.com/BurntSushi/ripgrep/releases/download/${RipgrepBinary.VERSION}/${release?.root}.${release?.extension}`,
        )
      }
      expect(new Set(keys.map((key) => RipgrepBinary.release(key)?.sha256)).size).toBe(keys.length)
      expect(RipgrepBinary.release("riscv64-linux")).toBeUndefined()
    }),
  )

  it.live("an unavailable ripgrep fails a search with its reason, and a Location still opens", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const unavailable = RipgrepBinary.nodeWith({
        system: () => undefined,
        directory: path.join(dir, "bin"),
        download: false,
      })
      const ripgrep = LayerNode.compile(Ripgrep.node, [[RipgrepBinary.node, unavailable]])

      const exit = yield* Effect.exit(
        Ripgrep.Service.use((service) => service.grep({ cwd: dir, pattern: "needle", limit: 10 })).pipe(
          Effect.provide(ripgrep),
        ),
      )
      const error = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined
      expect(error?._tag).toBe("Ripgrep.Error")
      expect(error?.message).toContain(RipgrepBinary.DISABLE_DOWNLOAD)

      const search = FileSystemSearch.ripgrepLayer.pipe(
        Layer.provide(
          Layer.mergeAll(
            ripgrep,
            LayerNode.compile(FSUtil.node),
            Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(dir) }))),
          ),
        ),
      )
      const found = yield* FileSystemSearch.Service.use((service) => service.find({ query: "anything" })).pipe(
        Effect.provide(search),
      )
      expect(found).toEqual([])
    }),
  )
})
