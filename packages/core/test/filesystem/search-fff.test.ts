import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Context, Effect, Layer } from "effect"
// filesystem.ts imports search.ts and search.ts imports it back; loading filesystem first keeps the app's order.
import "@orchestra/core/filesystem"
import { FileSystemSearch } from "@orchestra/core/filesystem/search"
import { Location } from "@orchestra/core/location"
import { AbsolutePath, RelativePath } from "@orchestra/core/schema"
import { location } from "../fixture/location"
import { withTmp } from "../fixture/ripgrep-release"
import { it } from "../lib/effect"

// The fff-backed file search runs without fff's watcher, so it must still see files written after the first scan.
describe("FileSystemSearch with fff", () => {
  it.live("finds a file written after the first scan once the index is stale", () =>
    Effect.gen(function* () {
      const dir = yield* withTmp
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(dir, "src"), { recursive: true })
        await fs.writeFile(path.join(dir, "src", "first.ts"), "needle\n")
      })
      const context = yield* Layer.build(
        FileSystemSearch.fffLayer.pipe(
          Layer.provide(
            Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(dir) }))),
          ),
        ),
      )
      const service = Context.get(context, FileSystemSearch.Service)
      const paths = Effect.map(service.glob({ pattern: "**/*.ts" }), (found) => found.map((entry) => entry.path).sort())

      expect(yield* paths).toEqual([RelativePath.make("src/first.ts")])

      yield* Effect.promise(() => fs.writeFile(path.join(dir, "src", "second.ts"), "needle\n"))
      yield* Effect.sleep("2500 millis")
      expect(yield* paths).toEqual([RelativePath.make("src/first.ts"), RelativePath.make("src/second.ts")])
      const found = yield* service.grep({ pattern: "needle" })
      expect(found.map((match) => match.entry.path).sort()).toEqual([
        RelativePath.make("src/first.ts"),
        RelativePath.make("src/second.ts"),
      ])
    }),
  )
})
