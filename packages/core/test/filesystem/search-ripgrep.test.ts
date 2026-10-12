import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Context, Effect, Layer } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
// filesystem.ts imports search.ts and search.ts imports it back; loading filesystem first keeps the app's order.
import "@orchestra/core/filesystem"
import { FileSystemSearch } from "@orchestra/core/filesystem/search"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { AbsolutePath, RelativePath } from "@orchestra/core/schema"
import { location } from "../fixture/location"
import { archive, executable, failure, gate, options, serve, until, withTmp } from "../fixture/ripgrep-release"
import { it } from "../lib/effect"

// The ripgrep-backed file search: a Location opens without waiting for ripgrep, and a search without it fails with
// the reason instead of returning nothing.
describe("FileSystemSearch with ripgrep", () => {
  const search = (directory: string, binaryNode: ReturnType<typeof RipgrepBinary.nodeWith>) =>
    FileSystemSearch.ripgrepLayer.pipe(
      Layer.provide(
        Layer.mergeAll(
          LayerNode.compile(Ripgrep.node, [[RipgrepBinary.node, binaryNode]]),
          LayerNode.compile(FSUtil.node),
          Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(directory) }))),
        ),
      ),
    )

  it.live("opens a Location without waiting for ripgrep, then finds files once it is installed", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const project = path.join(dir, "project")
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(project, "src"), { recursive: true })
        await fs.writeFile(path.join(project, "src", "needle.ts"), "needle\n")
      })
      const built = yield* archive(dir)
      const held = gate()
      const server = yield* serve(async () => {
        await held.promise
        return new Response(built.bytes)
      })
      const node = RipgrepBinary.nodeWith(options(path.join(dir, "bin"), built.release(server.url)))

      // Building the layer returns while the download is held; had it waited for the index, it would never return.
      const context = yield* Layer.build(search(project, node))
      const service = Context.get(context, FileSystemSearch.Service)
      yield* until(() => server.counter.requests === 1)
      held.open()

      const found = yield* service.find({ query: "needle", type: "file" })
      expect(found.map((entry) => entry.path)).toEqual([RelativePath.make("src/needle.ts")])
    }),
  )

  it.live("fails a search with ripgrep's reason, and recovers once rg is available", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const project = path.join(dir, "project")
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(project, "src"), { recursive: true })
        await fs.writeFile(path.join(project, "src", "needle.ts"), "needle\n")
      })
      const real = Bun.which(executable)
      const system: { path?: string } = {}
      const node = RipgrepBinary.nodeWith({
        system: () => system.path,
        directory: path.join(dir, "bin"),
        download: false,
      })
      const service = Context.get(yield* Layer.build(search(project, node)), FileSystemSearch.Service)

      for (const attempt of [
        service.find({ query: "needle" }).pipe(Effect.asVoid),
        service.glob({ pattern: "**/*.ts" }).pipe(Effect.asVoid),
        service.grep({ pattern: "needle" }).pipe(Effect.asVoid),
      ]) {
        const error = failure(yield* Effect.exit(attempt))
        expect(error._tag).toBe("FileSystem.SearchError")
        expect(error.message).toContain(RipgrepBinary.DISABLE_DOWNLOAD)
      }

      // rg appears on PATH: the next find rebuilds the failed index instead of staying empty.
      system.path = real ?? undefined
      const found = yield* service.find({ query: "needle", type: "file" })
      expect(found.map((entry) => entry.path)).toEqual([RelativePath.make("src/needle.ts")])
    }),
  )

  it.live("an unavailable ripgrep fails a Ripgrep search with its reason", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      const unavailable = RipgrepBinary.nodeWith({
        system: () => undefined,
        directory: path.join(dir, "bin"),
        download: false,
      })
      const exit = yield* Effect.exit(
        Ripgrep.Service.use((service) => service.grep({ cwd: dir, pattern: "needle", limit: 10 })).pipe(
          Effect.provide(LayerNode.compile(Ripgrep.node, [[RipgrepBinary.node, unavailable]])),
        ),
      )
      const error = failure(exit)
      expect(error._tag).toBe("Ripgrep.Error")
      expect(error.message).toContain(RipgrepBinary.DISABLE_DOWNLOAD)
    }),
  )
})
