import { expect } from "bun:test"
import path from "node:path"
import { createServer } from "node:net"
import { pathToFileURL } from "node:url"
import { Deferred, Effect, Fiber } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { SandboxParents } from "../src/sandbox-parents"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const fact = await Effect.runPromise(ToolSafetySandbox.status())
// Unsupported/unavailable hosts measure HOLD separately, never count it as confinement conformance.
const confined = fact.shellWrites === "enforced" ? it.live : it.live.skip
if (fact.shellWrites === "unenforced") console.info(`Confinement tests skipped: ${fact.shellSandbox.reason}`)
const fixture = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "sr-" }).pipe(Effect.flatMap(fs.realPath))
  const node = yield* ToolSafetySandbox.available("node")
  if (!node) throw new Error("BLOCKED: Node unavailable")
  const wrap = (script: string, profile?: ToolSafety.Profile, native = directory, cwd = directory) =>
    ToolSafetySandbox.wrap(ChildProcess.make(node, ["-e", script], { cwd })).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, { directory: native }),
    )
  return { fs, processes, directory, node, wrap }
})

it.live("parent plan validates all roots before exclusive mkdir and never creates the ambiguous leaf", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.directory, "generated", "nested", "out.ts")
    const forbidden = path.join(f.directory, "protected")
    const denied = yield* Effect.flip(SandboxParents.plan(f.fs, f.directory, [target, path.join(forbidden, "missing", "out")], [forbidden]))
    expect(denied.reason).toBe("sandbox-parent-protected-path")
    expect(yield* f.fs.exists(path.dirname(target))).toBe(false)
    const parents = yield* SandboxParents.plan(f.fs, f.directory, [target], [forbidden])
    expect(parents).toEqual([path.join(f.directory, "generated"), path.dirname(target)])
    yield* SandboxParents.prepare(f.fs, f.directory, parents)
    expect(yield* f.fs.isDir(path.dirname(target))).toBe(true)
    expect(yield* f.fs.exists(target)).toBe(false)
    yield* f.fs.writeFileString(target, "existing")
    expect(yield* SandboxParents.plan(f.fs, f.directory, [target], [])).toEqual([])
    expect(yield* f.fs.readFileString(target)).toBe("existing")
    const occupied = yield* Effect.flip(SandboxParents.prepare(f.fs, f.directory, parents))
    expect(occupied.reason).toBe("sandbox-parent-exclusive-mkdir")
    expect(yield* f.fs.readFileString(target)).toBe("existing")
  }),
)

it.live("parent plan rejects symlink escape, dangling symlink, non-directory, ambiguous and external roots", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const outside = yield* f.fs.makeTempDirectoryScoped({ prefix: "sr-out-" }).pipe(Effect.flatMap(f.fs.realPath))
    yield* f.fs.symlink(outside, path.join(f.directory, "escape"))
    yield* f.fs.symlink(path.join(outside, "absent"), path.join(f.directory, "dangling"))
    yield* f.fs.writeFileString(path.join(f.directory, "file"), "untouched")
    yield* Effect.forEach([
      { root: path.join(f.directory, "escape", "missing", "out"), reasons: ["sandbox-parent-symlink-denied"] },
      { root: path.join(f.directory, "dangling", "missing", "out"), reasons: ["sandbox-parent-symlink-denied"] },
      // Windows realpath reports a file ancestor as NotFound; POSIX reports ENOTDIR before the component walk.
      { root: path.join(f.directory, "file", "missing", "out"), reasons: ["sandbox-parent-path-acquisition", "sandbox-parent-not-directory"] },
      { root: path.join(f.directory, "*", "out"), reasons: ["sandbox-parent-path-ambiguous"] },
      { root: path.join(outside, "missing", "out"), reasons: ["sandbox-parent-outside-native-placement"] },
    ], (entry) => Effect.gen(function* () {
      const held = yield* Effect.flip(SandboxParents.plan(f.fs, f.directory, [path.join(f.directory, "first", "out"), entry.root], []))
      expect(entry.reasons).toContain(held.reason)
      expect(yield* f.fs.exists(path.join(f.directory, "first"))).toBe(false)
      expect(yield* f.fs.exists(path.join(outside, "missing"))).toBe(false)
    }), { discard: true })
    expect(yield* f.fs.readFileString(path.join(f.directory, "file"))).toBe("untouched")
  }),
)

it.live("later multi-root mkdir failure rolls back only owned empty directories and preserves foreign bytes", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const a = path.join(f.directory, "a")
    const b = path.join(f.directory, "b")
    const targets = yield* SandboxParents.plan(f.fs, f.directory, [path.join(a, "deep", "out"), path.join(b, "deep", "out")], [])
    // Another host actor occupies the second root after planning. None of its directories belong to preparation.
    yield* f.fs.makeDirectory(path.join(b, "deep"), { recursive: true })
    yield* f.fs.writeFileString(path.join(b, "deep", "owner"), "unfamiliar")
    const failed = yield* Effect.flip(SandboxParents.prepare(f.fs, f.directory, targets))
    expect(failed.reason).toBe("sandbox-parent-exclusive-mkdir")
    expect(yield* f.fs.exists(a)).toBe(false)
    expect(yield* f.fs.readFileString(path.join(b, "deep", "owner"))).toBe("unfamiliar")

    // Inject a real foreign write at the filesystem yield before the second root's exclusive mkdir.
    const occupied = yield* Effect.flip(SandboxParents.prepare({
      ...f.fs,
      realPath: (target) => f.fs.realPath(target).pipe(Effect.tap(() => Effect.gen(function* () {
        if (target === f.directory && (yield* f.fs.exists(path.join(a, "deep"))))
          yield* f.fs.writeFileString(path.join(a, "deep", "owner"), "new unfamiliar bytes")
      }))),
    }, f.directory, targets))
    expect(occupied.reason).toBe("sandbox-parent-exclusive-mkdir")
    expect(yield* f.fs.readFileString(path.join(a, "deep", "owner"))).toBe("new unfamiliar bytes")
    expect(yield* f.fs.readFileString(path.join(b, "deep", "owner"))).toBe("unfamiliar")
  }),
)

it.live("failed preparation preserves a replacement directory with a different identity", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.directory, "owned")
    const moved = path.join(f.directory, "moved")
    const failed = yield* Effect.flip(SandboxParents.prepare({
      ...f.fs,
      realPath: (entry) => f.fs.realPath(entry).pipe(Effect.tap(() => Effect.gen(function* () {
        if (entry !== target) return
        yield* f.fs.rename(target, moved)
        yield* f.fs.makeDirectory(target)
        yield* f.fs.realPath(path.join(f.directory, "absent-control"))
      }))),
    }, f.directory, [target]))
    expect(failed.reason).toBe("sandbox-parent-placement-acquisition")
    expect(yield* f.fs.isDir(target)).toBe(true)
    expect(yield* f.fs.isDir(moved)).toBe(true)
  }),
)

it.live("interrupted multi-root preparation rolls back its own empty directories", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const ready = yield* Deferred.make<void>()
    const targets = yield* SandboxParents.plan(f.fs, f.directory, [path.join(f.directory, "a", "deep", "out"), path.join(f.directory, "b", "out")], [])
    const fiber = yield* SandboxParents.prepare({
      ...f.fs,
      realPath: (target) => f.fs.realPath(target).pipe(Effect.tap(() => Effect.gen(function* () {
        if (target !== f.directory || !(yield* f.fs.exists(path.join(f.directory, "a", "deep")))) return
        yield* Deferred.succeed(ready, undefined)
        yield* Effect.never
      }))),
    }, f.directory, targets).pipe(Effect.forkScoped)
    yield* Deferred.await(ready).pipe(Effect.timeout("5 seconds"))
    expect(yield* f.fs.isDir(path.join(f.directory, "a", "deep"))).toBe(true)
    yield* Fiber.interrupt(fiber)
    expect(yield* f.fs.exists(path.join(f.directory, "a"))).toBe(false)
    expect(yield* f.fs.exists(path.join(f.directory, "b"))).toBe(false)
  }),
)
