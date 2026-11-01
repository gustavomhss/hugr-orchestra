import { describe, expect } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { Duration, Effect, Layer } from "effect"
import { GitCli } from "@orchestra/core/git-cli"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { git } from "./fixture/git"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

// The real git service over the real process layer, counting every git process it starts.
const counted = (window: Duration.Input) => {
  const spawned = { count: 0 }
  const processes = Layer.effect(
    AppProcess.Service,
    Effect.gen(function* () {
      const real = yield* AppProcess.Service
      return AppProcess.Service.of({
        ...real,
        run: (command, options) => {
          spawned.count++
          return real.run(command, options)
        },
      })
    }),
  ).pipe(Layer.provide(LayerNode.compile(AppProcess.node)))
  return { spawned, layer: GitCli.layerWith(window).pipe(Layer.provide(processes)) }
}

const repository = Effect.acquireRelease(
  Effect.promise(async () => {
    const dir = await tmpdir()
    await git(dir.path, "init", "-q")
    // The Windows runner's git turns LF into CRLF on checkout, which would change what the files hold.
    await git(dir.path, "config", "core.autocrlf", "false")
    return dir
  }),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
)

const write = (dir: string, file: string, content: string | Uint8Array) =>
  Effect.promise(() => fs.writeFile(path.join(dir, file), content))

// What the previous implementation asked git for, as the oracle for the in-process count.
const numstat = (dir: string, file: string) =>
  Effect.promise(async () => {
    const parts = (await $`git -c core.autocrlf=false diff --no-index --numstat -- /dev/null ${file}`.cwd(dir).nothrow().text()).split("\t")
    return {
      file,
      additions: parts[0] === "-" ? 0 : Number.parseInt(parts[0] ?? "0", 10),
      deletions: parts[1] === "-" ? 0 : Number.parseInt(parts[1] ?? "0", 10),
    }
  })

describe("GitCli", () => {
  it.live(
    "counts untracked files in-process as git does, without starting a process",
    () =>
      Effect.gen(function* () {
        const dir = yield* repository
        const fixture = counted(GitCli.CACHE_WINDOW)
        const files = {
          "no-newline.txt": "a\nb\nc",
          "crlf.txt": "a\r\nb\r\n",
          "blank.txt": "\n\n",
          "single.txt": "only line\n",
          "empty.txt": "",
          "binary.bin": Uint8Array.from([120, 0, 121, 10]),
          // A NUL past the first 8000 bytes does not make git treat the file as binary.
          "late-nul.txt": Buffer.concat([Buffer.from("a\n".repeat(5000)), Buffer.from([0, 10])]),
        }
        yield* Effect.forEach(Object.entries(files), (entry) => write(dir.path, entry[0], entry[1]))

        const gitService = yield* GitCli.Service.pipe(Effect.provide(fixture.layer))
        yield* Effect.forEach(Object.keys(files), (file) =>
          Effect.gen(function* () {
            expect(yield* gitService.statUntracked(dir.path, file)).toEqual(yield* numstat(dir.path, file))
          }),
        )
        // The oracle ran git outside the counted service, so only the service's own spawns show here.
        expect(fixture.spawned.count).toBe(0)
        expect(yield* gitService.statUntracked(dir.path, "missing.txt")).toBeUndefined()
      }).pipe(Effect.scoped),
    30_000,
  )

  it.live(
    "runs git once for concurrent cached reads and again after the window",
    () =>
      Effect.gen(function* () {
        const dir = yield* repository
        const fixture = counted(Duration.millis(400))
        yield* write(dir.path, "one.txt", "1\n")

        const gitService = yield* GitCli.Service.pipe(Effect.provide(fixture.layer))
        const both = yield* Effect.all([gitService.statusCached(dir.path), gitService.statusCached(dir.path)], {
          concurrency: 2,
        })
        expect(both[0]).toEqual(both[1])
        expect(both[0].map((item) => item.file)).toEqual(["one.txt"])
        expect(fixture.spawned.count).toBe(1)

        // Inside the window a new file stays hidden and no process starts.
        yield* write(dir.path, "two.txt", "2\n")
        expect((yield* gitService.statusCached(dir.path)).map((item) => item.file)).toEqual(["one.txt"])
        expect(fixture.spawned.count).toBe(1)

        yield* Effect.sleep(Duration.millis(600))
        expect((yield* gitService.statusCached(dir.path)).map((item) => item.file)).toEqual(["one.txt", "two.txt"])
        expect(fixture.spawned.count).toBe(2)

        // The uncached read always asks git.
        yield* gitService.status(dir.path)
        expect(fixture.spawned.count).toBe(3)
      }).pipe(Effect.scoped),
    30_000,
  )

  it.live(
    "keeps one cache entry per directory and drops it when a patch is applied",
    () =>
      Effect.gen(function* () {
        const first = yield* repository
        const second = yield* repository
        const fixture = counted(Duration.seconds(30))
        yield* write(first.path, "a.txt", "a\n")

        const gitService = yield* GitCli.Service.pipe(Effect.provide(fixture.layer))
        expect((yield* gitService.statusCached(first.path)).map((item) => item.file)).toEqual(["a.txt"])
        expect(yield* gitService.statusCached(second.path)).toEqual([])
        expect(fixture.spawned.count).toBe(2)

        yield* write(first.path, "b.txt", "b\n")
        expect(yield* gitService.statusCached(first.path)).toHaveLength(1)
        // Applying a patch changes the working tree, so the next read is current even inside the window.
        yield* gitService.applyPatch(first.path, "")
        expect(yield* gitService.statusCached(first.path)).toHaveLength(2)
      }).pipe(Effect.scoped),
    30_000,
  )
})
