import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect, Layer, Stream } from "effect"
import path from "path"
import {
  disposeAllInstances,
  provideInstance,
  testInstanceStoreLayer,
  TestInstance,
  tmpdirScoped,
} from "../fixture/fixture"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Git } from "../../src/git"
import { Vcs } from "@/project/vcs"
import { testEffect } from "../lib/effect"

const layer = LayerNode.compile(
  LayerNode.group([Vcs.node, Git.node, EventV2Bridge.node, FSUtil.node, CrossSpawnSpawner.node]),
)
const it = testEffect(Layer.mergeAll(layer, testInstanceStoreLayer))

// Local noon keeps every fixture commit on the intended calendar day in any timezone.
const at = (day: number, hour = 12) => new Date(2026, 0, day, hour).getTime()
const january = { since: at(1, 0), until: at(31, 23) }
const emptyTotals = { commits: 0, merges: 0, authors: 0, additions: 0, deletions: 0, filesChanged: 0 }

const git = Effect.fn("VcsActivityTest.git")(function* (cwd: string, args: string[], env?: Record<string, string>) {
  const result = yield* Git.Service.use((git) => git.run(args, { cwd, env }))
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString("utf8")}`)
  return result.text().trim()
})

const commit = Effect.fn("VcsActivityTest.commit")(function* (
  cwd: string,
  input: { message: string; time: number; email?: string; files?: Record<string, string | Uint8Array> },
) {
  yield* Effect.forEach(Object.entries(input.files ?? {}), (entry) =>
    Effect.promise(() => Bun.write(path.join(cwd, entry[0]), entry[1])),
  )
  yield* git(cwd, ["add", "-A"])
  yield* git(cwd, ["commit", "--no-gpg-sign", "--allow-empty", "-m", input.message], dated(input.time, input.email))
})

const dated = (time: number, email = "test@opencode.test") => ({
  GIT_AUTHOR_DATE: `@${Math.floor(time / 1000)} +0000`,
  GIT_COMMITTER_DATE: `@${Math.floor(time / 1000)} +0000`,
  GIT_AUTHOR_EMAIL: email,
})

const activity = Effect.fn("VcsActivityTest.activity")(function* (input: Vcs.ActivityInput) {
  const vcs = yield* Vcs.Service
  yield* vcs.init()
  return yield* vcs.activity(input)
})

describe("Vcs activity", () => {
  afterEach(async () => {
    await disposeAllInstances()
  })

  it.instance(
    "aggregates totals, top paths and recent commits",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const long = "x".repeat(130)
        yield* commit(test.directory, {
          message: "add a",
          time: at(10),
          email: "Ada@Example.com",
          files: { "a.txt": "1\n2\n3\n" },
        })
        yield* commit(test.directory, {
          message: "edit a, add b",
          time: at(11),
          email: "ada@example.com",
          files: { "a.txt": "1\n2\n", "b.txt": "x\n" },
        })
        yield* commit(test.directory, {
          message: `  ${long}  `,
          time: at(12),
          email: "bob@example.com",
          files: { "dir/c.txt": "y\nz\n" },
        })

        const result = yield* activity(january)

        expect(result.repository).toBe(true)
        expect(result.totals).toEqual({
          commits: 3,
          merges: 0,
          authors: 2,
          additions: 6,
          deletions: 1,
          filesChanged: 3,
        })
        expect(result.topPaths).toEqual([
          { path: "a.txt", changes: 4 },
          { path: "dir/c.txt", changes: 2 },
          { path: "b.txt", changes: 1 },
        ])
        expect(result.recent.map((item) => item.subject)).toEqual([long.slice(0, 120), "edit a, add b", "add a"])
        expect(result.recent.map((item) => item.time)).toEqual([at(12), at(11), at(10)])
        expect(result.recent.every((item) => /^[0-9a-f]{4,}$/.test(item.hash))).toBe(true)
        expect(result.truncated).toBe(false)
        expect(result.partial).toEqual({ commits: false, lines: false })
      }),
    { git: true },
  )

  it.instance(
    "buckets commits by local author day and skips idle days",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        yield* commit(test.directory, { message: "morning", time: at(10, 9), files: { "a.txt": "1\n" } })
        yield* commit(test.directory, { message: "evening", time: at(10, 18), files: { "a.txt": "1\n2\n3\n" } })
        yield* commit(test.directory, { message: "later", time: at(12), files: { "a.txt": "3\n" } })

        const result = yield* activity(january)

        expect(result.days).toEqual([
          { day: "2026-01-10", commits: 2, merges: 0, additions: 3, deletions: 0 },
          { day: "2026-01-12", commits: 1, merges: 0, additions: 0, deletions: 2 },
        ])
      }),
    { git: true },
  )

  it.instance(
    "counts binary files as changed with zero lines",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        yield* commit(test.directory, {
          message: "add binary",
          time: at(10),
          files: { "image.bin": new Uint8Array([0, 1, 2, 0, 255]), "notes.txt": "hello\n" },
        })

        const result = yield* activity(january)

        expect(result.totals).toMatchObject({ commits: 1, additions: 1, deletions: 0, filesChanged: 2 })
        expect(result.topPaths).toEqual([
          { path: "notes.txt", changes: 1 },
          { path: "image.bin", changes: 0 },
        ])
      }),
    { git: true },
  )

  it.instance(
    "counts merge commits separately from commit, line and path totals",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const main = yield* git(test.directory, ["symbolic-ref", "--short", "HEAD"])
        yield* git(test.directory, ["checkout", "-b", "side"])
        yield* commit(test.directory, { message: "side work", time: at(10), files: { "side.txt": "s\n" } })
        yield* git(test.directory, ["checkout", main])
        yield* commit(test.directory, { message: "main work", time: at(11), files: { "main.txt": "m\n" } })
        yield* git(test.directory, ["merge", "--no-ff", "--no-edit", "side"], dated(at(12)))

        const result = yield* activity(january)

        expect(result.totals).toEqual({
          commits: 2,
          merges: 1,
          authors: 1,
          additions: 2,
          deletions: 0,
          filesChanged: 2,
        })
        expect(result.days).toEqual([
          { day: "2026-01-10", commits: 1, merges: 0, additions: 1, deletions: 0 },
          { day: "2026-01-11", commits: 1, merges: 0, additions: 1, deletions: 0 },
          { day: "2026-01-12", commits: 0, merges: 1, additions: 0, deletions: 0 },
        ])
        expect(result.recent.map((item) => item.subject)).toEqual(["main work", "side work"])
      }),
    { git: true },
  )

  it.instance(
    "honours the since/until window and clamps it to 366 days",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const ancient = new Date(2024, 5, 1, 12).getTime()
        yield* commit(test.directory, { message: "ancient", time: ancient, files: { "a.txt": "0\n" } })
        yield* commit(test.directory, { message: "early", time: at(5), files: { "a.txt": "1\n" } })
        yield* commit(test.directory, { message: "middle", time: at(15), files: { "a.txt": "2\n" } })
        yield* commit(test.directory, { message: "late", time: at(25), files: { "a.txt": "3\n" } })

        const inner = yield* activity({ since: at(15), until: at(25) - 1 })
        expect(inner.recent.map((item) => item.subject)).toEqual(["middle"])
        expect(inner.totals.commits).toBe(1)

        const clamped = yield* activity({ since: 0, until: at(25) })
        expect(clamped.until).toBe(at(25))
        expect(clamped.since).toBe(at(25) - 366 * 24 * 60 * 60 * 1000)
        expect(clamped.recent.map((item) => item.subject)).toEqual(["late", "middle", "early"])
      }),
    { git: true },
  )

  it.instance(
    "caps the scan at 20000 commits and flags truncation",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const ref = yield* git(test.directory, ["symbolic-ref", "HEAD"])
        const head = yield* git(test.directory, ["rev-parse", "HEAD"])
        const stream = Array.from({ length: 20_001 }, (_, index) => {
          const seconds = Math.floor(at(15) / 1000) + index
          const message = `bulk ${index}`
          return [
            `commit ${ref}`,
            `author Bulk <bulk@opencode.test> ${seconds} +0000`,
            `committer Bulk <bulk@opencode.test> ${seconds} +0000`,
            `data ${message.length}`,
            message,
            ...(index === 0 ? [`from ${head}`] : []),
            "",
          ].join("\n")
        }).join("")
        const imported = yield* Git.Service.use((git) =>
          git.run(["fast-import", "--quiet"], {
            cwd: test.directory,
            stdin: Stream.make(new TextEncoder().encode(stream)),
          }),
        )
        expect(imported.exitCode).toBe(0)

        const result = yield* activity(january)

        expect(result.truncated).toBe(true)
        expect(result.partial.commits).toBe(true)
        expect(result.totals.commits).toBe(20_000)
        expect(result.recent[0]?.subject).toBe("bulk 20000")
      }),
    { git: true },
    30_000,
  )

  it.instance("reports a non-repository directory as an empty result", () =>
    Effect.gen(function* () {
      const result = yield* activity(january)

      expect(result).toEqual({
        repository: false,
        since: january.since,
        until: january.until,
        totals: emptyTotals,
        days: [],
        topPaths: [],
        recent: [],
        ahead: null,
        behind: null,
        truncated: false,
        partial: { commits: false, lines: false },
      })
    }),
  )

  it.live("returns zeros for a repository without commits", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* git(dir, ["init"])

      const result = yield* activity(january).pipe(provideInstance(dir))

      expect(result.repository).toBe(true)
      expect(result.totals).toEqual(emptyTotals)
      expect(result.days).toEqual([])
      expect(result.ahead).toBeNull()
      expect(result.behind).toBeNull()
      expect(result.truncated).toBe(false)
    }),
  )

  it.instance(
    "reports null ahead/behind when the default branch has no upstream",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        yield* git(test.directory, ["branch", "-M", "main"])
        yield* commit(test.directory, { message: "local", time: at(10), files: { "a.txt": "1\n" } })

        const result = yield* activity(january)

        expect(result.ahead).toBeNull()
        expect(result.behind).toBeNull()
      }),
    { git: true },
  )

  it.live("counts ahead/behind against the default branch upstream", () =>
    Effect.gen(function* () {
      const origin = yield* tmpdirScoped({ git: true })
      const parent = yield* tmpdirScoped()
      const clone = path.join(parent, "clone")
      yield* git(origin, ["branch", "-M", "main"])
      yield* git(parent, ["clone", "--quiet", origin, clone])
      yield* git(clone, ["config", "user.email", "test@opencode.test"])
      yield* git(clone, ["config", "user.name", "Test"])
      yield* commit(clone, { message: "local one", time: at(10), files: { "a.txt": "1\n" } })
      yield* commit(clone, { message: "local two", time: at(11), files: { "a.txt": "2\n" } })
      yield* commit(origin, { message: "remote", time: at(11), files: { "b.txt": "1\n" } })
      yield* git(clone, ["fetch", "--quiet", "origin"])

      const result = yield* activity(january).pipe(provideInstance(clone))

      expect(result.ahead).toBe(2)
      expect(result.behind).toBe(1)
    }),
  )
})
