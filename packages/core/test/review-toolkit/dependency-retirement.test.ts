import { expect } from "bun:test"
import path from "path"
import { lstat, mkdir, readdir, readFile, readlink, stat, symlink, writeFile } from "fs/promises"
import { Cause, Effect, Exit, Fiber, Scheduler } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { FSUtil } from "../../src/fs-util"
import { AppProcess } from "../../src/process"
import { DependencyShadow } from "../../src/research-toolkit/probe/dependency-shadow"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { testEffect } from "../lib/effect"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
// Windows hardlink identity is not green proof. Skip is not a pass.
const retirement = process.platform === "win32" ? it.live.skip : it.live
const title = (name: string) => process.platform === "win32"
  ? `${name} unsupported: snapshot-dependency-retirement-unavailable windows; not green proof`
  : name

class TrackingScheduler implements Scheduler.Scheduler {
  readonly executionMode = "async" as const
  readonly dispatchers: Array<Scheduler.SchedulerDispatcher> = []
  shouldYield() {
    return false
  }
  makeDispatcher() {
    const dispatcher = new Scheduler.MixedScheduler("async", (task) => {
      queueMicrotask(task)
      return () => undefined
    }).makeDispatcher()
    this.dispatchers.push(dispatcher)
    return dispatcher
  }
  flushAll() {
    for (const dispatcher of this.dispatchers) dispatcher.flush()
  }
}

function gatePair() {
  let openGate: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    openGate = () => {
      resolve()
    }
  })
  let enteredOk: () => void = () => {}
  let enteredNo: (error: Error) => void = (_error) => {}
  const enteredWait = new Promise<void>((resolve, reject) => {
    enteredOk = () => {
      resolve()
    }
    enteredNo = (error) => {
      reject(error)
    }
  })
  let settledOk: () => void = () => {}
  const settledWait = new Promise<void>((resolve) => {
    settledOk = () => {
      resolve()
    }
  })
  const state = {
    entered: false,
    nativeDone: false,
    root: "",
    scratch: "",
    enteredWait,
    settledWait,
    failEntered: (error: Error) => {
      enteredNo(error)
      settledOk()
    },
    open: () => openGate(),
    beforePublish: async (snapshot: string) => {
      state.root = snapshot
      state.scratch = path.dirname(snapshot)
      state.entered = true
      enteredOk()
      await gate
    },
    settled: () => {
      state.nativeDone = true
      settledOk()
    },
  }
  return state
}

async function seal(root: string) {
  const lines: string[] = []
  const walk = async (prefix: string) => {
    const entries = await readdir(path.join(root, prefix), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === ".git") continue
      const relative = path.join(prefix, entry.name)
      const abs = path.join(root, relative)
      const info = await lstat(abs)
      if (info.isSymbolicLink()) {
        lines.push(`l ${relative} ${(info.mode & 0o777).toString(8)} ${await readlink(abs)}`)
        continue
      }
      if (info.isDirectory()) {
        lines.push(`d ${relative} ${(info.mode & 0o777).toString(8)}`)
        await walk(relative)
        continue
      }
      lines.push(`f ${relative} ${(info.mode & 0o777).toString(8)} ${(await readFile(abs)).toString("base64")}`)
    }
  }
  await walk("")
  return lines.sort()
}

async function repoWithDep(root: string) {
  await mkdir(path.join(root, "node_modules", "dep"), { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "retire@example.com")
  await git(root, "config", "user.name", "Retire")
  await writeFile(path.join(root, ".gitignore"), "node_modules\n")
  await writeFile(path.join(root, "package.json"), "{}\n")
  await writeFile(path.join(root, "README.md"), "reviewed\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await writeFile(path.join(root, "node_modules", "dep", "index.js"), "ordinary\n")
  await mkdir(path.join(root, "node_modules", ".bin"), { recursive: true })
  await symlink(path.join("..", "dep", "index.js"), path.join(root, "node_modules", ".bin", "dep"))
}

async function missingScratch(scratch: string) {
  const present = await lstat(scratch).then(() => true, (error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false
    throw error
  })
  if (present) throw new Error("snapshot-dependency-retirement-scratch-present")
}

const owned = () => Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
)

retirement(title("publish join holds retirement until native projectGraph settles"), () => {
  const cleanup: { open: () => void; settled: Promise<void> } = { open: () => {}, settled: Promise.resolve() }
  return Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const root = path.join(dir.path, "repo")
    yield* Effect.promise(() => repoWithDep(root))
    const before = yield* Effect.promise(() => seal(root))
    expect(before.some((line) => line.startsWith(`l ${path.join("node_modules", ".bin", "dep")} `) && line.endsWith(" ../dep/index.js"))).toBe(true)
    const rendezvous = gatePair()
    cleanup.open = rendezvous.open
    cleanup.settled = rendezvous.settledWait
    const scheduler = new TrackingScheduler()
    let retired = ""
    // ensuring is the retirement observer. ReviewScratch still removes its own scratch; this callback is not that rm.
    const work = Effect.scoped(Effect.gen(function* () {
      // Initial yield creates the real worker dispatcher before public create. Handshake only, not an absence proof.
      yield* Effect.yieldNow
      return yield* ReviewScratch.create({ worktree: root, tree: true })
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        retired = rendezvous.nativeDone ? "done" : "pending"
      })),
    )).pipe(
      Effect.provideService(DependencyShadow.BeforePublish, rendezvous.beforePublish),
      Effect.provideService(DependencyShadow.SettledObserver, rendezvous.settled),
      Effect.provideService(Scheduler.Scheduler, scheduler),
      Effect.provideService(Scheduler.PreventSchedulerYield, true),
    )
    const fiber = yield* work.pipe(Effect.forkChild({ startImmediately: true }))
    fiber.addObserver(() => {
      if (!rendezvous.entered) rendezvous.failEntered(new Error("snapshot-dependency-retirement-not-entered"))
    })
    yield* Effect.promise(() => rendezvous.enteredWait)
    // Dispatcher count is only the creation handshake, not an absence proof.
    if (scheduler.dispatchers.length === 0) return yield* Effect.die(new Error("snapshot-dependency-retirement-handshake: no dispatcher"))
    fiber.interruptUnsafe()
    let control = false
    for (const dispatcher of scheduler.dispatchers) dispatcher.scheduleTask(() => {
      control = true
    }, 0)
    scheduler.flushAll()
    expect(control).toBe(true)
    expect(retired).toBe("")
    expect(rendezvous.nativeDone).toBe(false)
    expect(yield* Effect.promise(() => readFile(path.join(rendezvous.root, "README.md"), "utf8"))).toBe("reviewed\n")
    rendezvous.open()
    yield* Effect.promise(() => rendezvous.settledWait)
    scheduler.flushAll()
    const exit = yield* Fiber.join(fiber).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    expect(retired).toBe("done")
    yield* Effect.promise(() => missingScratch(rendezvous.scratch))
    expect(yield* Effect.promise(() => seal(root))).toEqual(before)
  }).pipe(Effect.ensuring(Effect.promise(async () => {
    cleanup.open()
    await cleanup.settled
  })))
}, 120_000)

retirement(title("non-interrupted publish still hardlinks an ordinary dependency through the same hook"), () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const root = path.join(dir.path, "repo")
    yield* Effect.promise(() => repoWithDep(root))
    const before = yield* Effect.promise(() => seal(root))
    expect(before.some((line) => line.startsWith(`l ${path.join("node_modules", ".bin", "dep")} `) && line.endsWith(" ../dep/index.js"))).toBe(true)
    let nativeDone = false
    yield* Effect.scoped(Effect.gen(function* () {
      const copy = yield* ReviewScratch.create({ worktree: root, tree: true })
      const shadow = path.join(copy.root, "node_modules", "dep", "index.js")
      expect((yield* Effect.promise(() => lstat(path.join(copy.root, "node_modules")))).isSymbolicLink()).toBe(false)
      expect((yield* Effect.promise(() => stat(shadow))).ino).toBe((yield* Effect.promise(() => stat(path.join(root, "node_modules", "dep", "index.js")))).ino)
      expect(yield* Effect.promise(() => readlink(path.join(copy.root, "node_modules", ".bin", "dep")))).toBe("../dep/index.js")
      expect(copy.dependencyRoots.some((item) => FSUtil.contains(item, shadow))).toBe(true)
    }).pipe(
      Effect.provideService(DependencyShadow.BeforePublish, async () => undefined),
      Effect.provideService(DependencyShadow.SettledObserver, () => {
        nativeDone = true
      }),
    ))
    expect(nativeDone).toBe(true)
    expect(yield* Effect.promise(() => seal(root))).toEqual(before)
  }), 120_000,
)
