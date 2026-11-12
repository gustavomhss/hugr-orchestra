import { constants } from "node:fs"
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { ReviewRustsecDb } from "../../src/review-toolkit/rustsec-db"
import { ReviewRustsecRefresh } from "../../src/review-toolkit/rustsec-refresh"
import { tmpdir } from "../fixture/tmpdir"

const readable = Boolean(constants.O_NOFOLLOW && constants.O_NONBLOCK)
const unavailable = { ok: false, status: "acquisition-error", reason: "rustsec database unavailable: nofollow-unavailable" } as const
const ADVISORY = "https://github.com/RustSec/advisory-db.git"
const BIN = "/opt/cargo-audit"
const HASH = "cd".repeat(20)
const COMMITTED = "2024-05-06T07:08:09Z"
const OLD_GEN = "gen-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OLD_REV = "ab".repeat(20)
const OLD_WHEN = "2020-01-02T03:04:05Z"
const LEAK = "LEAKED_PRIVATE_CARGO_CONFIG"
const GEN = /^gen-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const WHEN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

type Call = { argv: readonly string[]; cwd: string; env: Record<string, string> }
type Ran = { exitCode: number | null; stdout?: string; failure?: string }

const meta = () => JSON.stringify({ generation: OLD_GEN, revision: OLD_REV, committedAt: OLD_WHEN, refreshedAt: OLD_WHEN })

const seed = async (root: string) => {
  const db = path.join(root, OLD_GEN, "db")
  await mkdir(path.join(db, ".git"), { recursive: true })
  await mkdir(path.join(db, "crates"), { recursive: true })
  await writeFile(path.join(db, "crates", "marker"), "OLD_DB_BYTES")
  await writeFile(path.join(root, OLD_GEN, "manifest.json"), meta())
  await writeFile(path.join(root, "current.json"), meta())
  await mkdir(path.join(root, "project", ".cargo"), { recursive: true })
  await writeFile(path.join(root, "project", ".cargo", "audit.toml"), LEAK)
  return db
}

const located = () => Effect.succeed({ executable: BIN } as const)

const provide = (root: string, spawn: (input: Call) => Effect.Effect<Ran>) =>
  ReviewRustsecRefresh.refresh(spawn).pipe(
    Effect.provideService(ReviewRustsecDb.Root, root),
    Effect.provideService(ReviewRustsecRefresh.Locate, located),
  )

const run = (root: string, spawn: (input: Call) => Effect.Effect<Ran>) =>
  Effect.runPromise(Effect.scoped(provide(root, spawn)))

const closed = (call: Call, db: string) => {
  expect(call.argv).toEqual([BIN, "audit", "update-db", "--db", db, "--url", ADVISORY])
  expect(call.argv.join(" ")).not.toContain("--stale")
  expect(call.cwd).not.toBe(path.dirname(path.dirname(db)))
  expect(call.env.HOME).toBe(call.cwd)
  expect(call.env.CARGO_HOME).toBe(call.cwd)
  expect(call.env.RUSTUP_HOME).toBe(call.cwd)
  expect(call.env.XDG_CONFIG_HOME).toBe(call.cwd)
  expect(call.env.XDG_CACHE_HOME).toBe(call.cwd)
  expect(call.env.TMPDIR).toBe(call.cwd)
  expect(Object.keys(call.env).some((key) => key.startsWith("RUSTSEC_") || (key.startsWith("CARGO_") && key !== "CARGO_HOME") || (key.startsWith("RUSTUP_") && key !== "RUSTUP_HOME"))).toBe(false)
  expect(JSON.stringify(call)).not.toContain(LEAK)
  expect(call.argv.join(" ")).not.toContain("project")
}

const materialize = async (db: string) => {
  await mkdir(path.join(db, ".git"), { recursive: true })
  await mkdir(path.join(db, "crates"), { recursive: true })
  await writeFile(path.join(db, "crates", "marker"), "NEW_DB_BYTES")
}

test("update-db then exact git log publishes one new generation and keeps the old bytes", async () => {
  await using dir = await tmpdir()
  const old = await seed(dir.path)
  const calls: Call[] = []
  const result = await run(dir.path, (input) => Effect.promise(async () => {
      calls.push(input)
      const db = input.argv[4]
      if (calls.length === 1) {
        await materialize(db)
        return { exitCode: 0 }
      }
      return { exitCode: 0, stdout: `${HASH}\n${COMMITTED}\n` }
    }))
  expect(calls).toHaveLength(2)
  const db = calls[0].argv[4]
  closed(calls[0], db)
  expect(calls[1].argv).toEqual(["git", "-C", db, "log", "-1", "--format=%H%n%cI"])
  expect(calls[1].cwd).toBe(calls[0].cwd)
  expect(calls[1].env).toEqual(calls[0].env)
  expect(db.startsWith(dir.path)).toBe(true)
  expect(db).not.toContain(OLD_GEN)
  expect(path.basename(path.dirname(db))).toMatch(GEN)
  if (!result.ok) throw new Error(result.reason)
  expect(result.state.dir).toBe(db)
  expect(result.state.revision).toBe(HASH)
  expect(result.state.committedAt).toBe(COMMITTED)
  expect(result.state.refreshedAt).toMatch(WHEN)
  const seen = await Effect.runPromise(ReviewRustsecDb.current().pipe(Effect.provideService(ReviewRustsecDb.Root, dir.path)))
  expect(seen).toEqual(readable ? { ok: true, state: result.state } : unavailable)
  const pointer = JSON.parse(await readFile(path.join(dir.path, "current.json"), "utf8"))
  expect(pointer).toEqual(JSON.parse(await readFile(path.join(dir.path, path.basename(path.dirname(db)), "manifest.json"), "utf8")))
  expect(pointer.generation).toBe(path.basename(path.dirname(db)))
  expect(await readFile(path.join(old, "crates", "marker"), "utf8")).toBe("OLD_DB_BYTES")
  expect(await readFile(path.join(db, "crates", "marker"), "utf8")).toBe("NEW_DB_BYTES")
  await expect(readdir(calls[0].cwd)).rejects.toThrow()
})

test("nonzero exit, callback failure, and bad git metadata keep the old pointer bytes", async () => {
  await using dir = await tmpdir()
  const modes = ["exit-1", "exit-null", "failure", "metadata", "bad-date", "bad-time", "bad-offset", "git-exit"] as const
  for (const mode of modes) {
    const root = path.join(dir.path, mode)
    await mkdir(root)
    await seed(root)
    const before = await readFile(path.join(root, "current.json"))
    const calls: Call[] = []
    const result = await run(root, (input) => Effect.promise(async () => {
        calls.push(input)
        if (mode === "failure") return { exitCode: null, failure: "spawn-failed" }
        if (mode === "exit-1") return { exitCode: 1 }
        if (mode === "exit-null") return { exitCode: null }
        if (calls.length === 1) {
          await materialize(input.argv[4])
          return { exitCode: 0 }
        }
        if (mode === "git-exit") return { exitCode: 2, stdout: `${HASH}\n${COMMITTED}\n` }
        if (mode === "bad-date") return { exitCode: 0, stdout: `${HASH}\n2024-02-31T07:08:09Z\n` }
        if (mode === "bad-time") return { exitCode: 0, stdout: `${HASH}\n2024-05-06T99:08:09Z\n` }
        if (mode === "bad-offset") return { exitCode: 0, stdout: `${HASH}\n2024-05-06T07:08:09+99:99\n` }
        return { exitCode: 0, stdout: "not-a-commit\n" }
      }))
    const reason = mode === "failure" ? "spawn-failed" : (mode === "metadata" || mode.startsWith("bad-")) ? "rustsec metadata invalid" : mode === "git-exit" ? "exit 2" : mode === "exit-null" ? "signal" : "exit 1"
    expect(result).toEqual({ ok: false, reason })
    expect(await readFile(path.join(root, "current.json"))).toEqual(before)
    expect(calls[0].argv[4]).not.toContain(OLD_GEN)
    expect(await readdir(calls[0].cwd).then(() => false, () => true)).toBe(true)
    expect(await readdir(path.dirname(calls[0].argv[4])).then(() => false, () => true)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(LEAK)
  }
})

test("interruption after the callback is entered keeps the old pointer and removes staging", async () => {
  await using dir = await tmpdir()
  await seed(dir.path)
  const before = await readFile(path.join(dir.path, "current.json"))
  const calls: Call[] = []
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const hold = yield* Deferred.make<void>()
    const fiber = yield* provide(dir.path, (input) => Effect.gen(function* () {
      calls.push(input)
      yield* Deferred.succeed(entered, undefined)
      yield* Deferred.await(hold)
      return { exitCode: 0 }
    })).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    yield* Fiber.interrupt(fiber)
  })))
  expect(calls).toHaveLength(1)
  expect(calls[0].argv[1]).toBe("audit")
  expect(await readFile(path.join(dir.path, "current.json"))).toEqual(before)
  expect(await readdir(calls[0].cwd).then(() => false, () => true)).toBe(true)
  expect(await readdir(path.dirname(calls[0].argv[4])).then(() => false, () => true)).toBe(true)
  expect((await readdir(dir.path)).filter((name) => name.startsWith("gen-"))).toEqual([OLD_GEN])
})

test("a concurrent reader keeps the old generation while refresh publishes the next", async () => {
  await using dir = await tmpdir()
  const old = await seed(dir.path)
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const calls: Call[] = []
    const fiber = yield* provide(dir.path, (input) => Effect.promise(async () => {
        calls.push(input)
        if (calls.length === 1) {
          await materialize(input.argv[4])
          return { exitCode: 0 }
        }
        return { exitCode: 0, stdout: `${HASH}\n${COMMITTED}\n` }
      }).pipe(Effect.tap(() => calls.length === 1 ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))) : Effect.void))).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const during = yield* ReviewRustsecDb.current()
    expect(during).toEqual(readable ? { ok: true, state: { dir: old, revision: OLD_REV, committedAt: OLD_WHEN, refreshedAt: OLD_WHEN } } : unavailable)
    expect(yield* Effect.promise(() => readFile(path.join(old, "crates", "marker"), "utf8"))).toBe("OLD_DB_BYTES")
    yield* Deferred.succeed(release, undefined)
    const published = yield* Fiber.join(fiber)
    if (!published.ok) throw new Error(published.reason)
    expect(published.state.dir).not.toBe(old)
    const after = yield* ReviewRustsecDb.current()
    expect(after).toEqual(readable ? { ok: true, state: published.state } : unavailable)
    expect(yield* Effect.promise(() => readFile(path.join(old, "crates", "marker"), "utf8"))).toBe("OLD_DB_BYTES")
    expect(yield* Effect.promise(() => readFile(path.join(published.state.dir, "crates", "marker"), "utf8"))).toBe("NEW_DB_BYTES")
  }).pipe(Effect.provideService(ReviewRustsecDb.Root, dir.path))))
})

test("default locate on an unqualified host does not spawn and writes no database", async () => {
  await using dir = await tmpdir()
  let calls = 0
  const spawn = () => {
    calls += 1
    return Effect.die("spawned")
  }
  const hosted = process.platform === "linux" && process.arch === "x64"
  const effect = ReviewRustsecRefresh.refresh(spawn).pipe(Effect.provideService(ReviewRustsecDb.Root, dir.path))
  const result = await Effect.runPromise(Effect.scoped(hosted
    ? effect.pipe(Effect.provideService(BackendToolkit.Target, { unsupported: "rustsec-unit-unqualified" }))
    : effect))
  expect(calls).toBe(0)
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error("unqualified host published a database")
  expect(result.reason).toContain("native-runtime-unqualified")
  expect(await readdir(dir.path).catch(() => [])).toEqual([])
})


test("interruption after pointer rename cannot delete the published generation", async () => {
  await using dir = await tmpdir()
  const old = await seed(dir.path)
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const renamed = yield* Deferred.make<ReviewRustsecDb.State>()
    const release = yield* Deferred.make<void>()
    const requested = yield* Deferred.make<void>()
    const calls: Call[] = []
    const fiber = yield* provide(dir.path, (input) => Effect.promise(async () => {
      calls.push(input)
      if (calls.length === 1) {
        await materialize(input.argv[4])
        return { exitCode: 0 }
      }
      return { exitCode: 0, stdout: `${HASH}\n${COMMITTED}\n` }
    })).pipe(
      Effect.provideService(ReviewRustsecRefresh.AfterPointerRename, (state) => Deferred.succeed(renamed, state).pipe(Effect.andThen(Deferred.await(release)))),
      Effect.forkChild,
    )
    const state = yield* Deferred.await(renamed)
    const stop = yield* Deferred.succeed(requested, undefined).pipe(Effect.andThen(Fiber.interrupt(fiber)), Effect.forkChild)
    yield* Deferred.await(requested)
    yield* Effect.yieldNow
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(stop)
    const pointer = yield* Effect.promise(() => readFile(path.join(dir.path, "current.json"), "utf8").then(JSON.parse))
    expect(pointer).toMatchObject({ revision: HASH, generation: path.basename(path.dirname(state.dir)) })
    expect(yield* Effect.promise(() => readFile(path.join(state.dir, "crates", "marker"), "utf8"))).toBe("NEW_DB_BYTES")
    expect(yield* Effect.promise(() => readFile(path.join(old, "crates", "marker"), "utf8"))).toBe("OLD_DB_BYTES")
    expect(yield* Effect.promise(() => readdir(calls[0].cwd).then(() => false, () => true))).toBe(true)
  })))
})


test("a successful fetch without git or crates never publishes its generation", async () => {
  await using dir = await tmpdir()
  for (const missing of [".git", "crates"]) {
    const root = path.join(dir.path, missing.replace(".", ""))
    await seed(root)
    const before = await readFile(path.join(root, "current.json"))
    const calls: Call[] = []
    const result = await run(root, (input) => Effect.promise(async () => {
      calls.push(input)
      if (calls.length === 1) {
        await materialize(input.argv[4])
        await rm(path.join(input.argv[4], missing), { recursive: true })
        return { exitCode: 0 }
      }
      return { exitCode: 0, stdout: `${HASH}\n${COMMITTED}\n` }
    }))
    expect(result).toEqual({ ok: false, reason: "rustsec metadata invalid" })
    expect(await readFile(path.join(root, "current.json"))).toEqual(before)
    expect(await readdir(path.dirname(calls[0].argv[4])).then(() => false, () => true)).toBe(true)
  }
})

test("an absent host binary reason is returned unchanged before filesystem or spawn", async () => {
  await using dir = await tmpdir()
  const calls: Call[] = []
  const result = await Effect.runPromise(ReviewRustsecRefresh.refresh((input) => { calls.push(input); return Effect.succeed({ exitCode: 0 }) }).pipe(
    Effect.provideService(ReviewRustsecDb.Root, dir.path),
    Effect.provideService(ReviewRustsecRefresh.Locate, () => Effect.succeed({ absent: "cargo-audit absent: recorded-failure" })),
  ))
  expect(result).toEqual({ ok: false, reason: "cargo-audit absent: recorded-failure" })
  expect(calls).toEqual([])
  expect(await readdir(dir.path)).toEqual([])
})
