import { NodeFileSystem } from "@effect/platform-node"
import { expect } from "bun:test"
import path from "node:path"
import { createServer } from "node:net"
import { lstatSync, type BigIntStats } from "node:fs"
import { pathToFileURL } from "node:url"
import { Cause, Deferred, Effect, Exit, Fiber, FileSystem, Layer } from "effect"
import { systemError } from "effect/PlatformError"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { filesystem } from "../src/effect/app-node-platform"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { SandboxParents } from "../src/sandbox-parents"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"
import { jail, sandboxHost } from "./lib/sandbox-host"

// The last test exits the process on Windows so a stuck scope release cannot hold the step.
// onFailure runs when that promise rejects, including a scope release outside the user effect.
let failed = false
const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])), () => {
  failed = true
})
// Unsupported/unavailable hosts measure HOLD separately, never count it as confinement conformance.
// These probes run node, which Windows' AppContainer jail does not take (pwsh and cmd only, tool-safety-appcontainer.test.ts).
const confined = sandboxHost.shellWrites === "enforced" && sandboxHost.shellSandbox.kind !== "appcontainer" ? it.live : it.live.skip
if (sandboxHost.shellWrites === "unenforced") console.info(`Confinement tests skipped: ${sandboxHost.shellSandbox.reason}`)
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

it.live("child environment scrubs ORCHESTRA_AUTH_CONTENT without changing owner input", () =>
  Effect.gen(function* () {
    const owner = { ORCHESTRA_AUTH_CONTENT: '{"provider":"credential"}', GOMODCACHE: "owner-mod", GOCACHE: "owner-build", SAFE: "yes" }
    const before = { ...owner }
    const child = ToolSafetySandbox.environment(owner)
    expect(child).toEqual({ GOMODCACHE: "owner-mod", GOCACHE: "owner-build", SAFE: "yes" })
    expect(owner).toEqual(before)
  }),
)

it.live("default wrap does not prepare output parents, including with a model-style environment hint", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", ""], {
      cwd: f.directory, env: { ORCHESTRA_PREPARE_PARENTS: "true" },
    })).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: ["pending/deep/out.ts"], sandbox: { enabled: true, scratch: true, unconfinedFallback: true } }),
      Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
    )
    expect(command._tag).toBe("StandardCommand")
    expect(yield* f.fs.exists(path.join(f.directory, "pending"))).toBe(false)
  }),
)

it.live("Go cache flag semantics use the final matching flag, including quoted boolean spellings", () =>
  Effect.sync(() => {
    const flags = ["0", "f", "F", "false", "FALSE", "False"].flatMap((value) =>
      ["-", "--"].flatMap((prefix) => ["", "'", '"'].map((quote) => `${quote}${prefix}modcacherw=${value}${quote}`)),
    )
    const writable = ["-modcacherw", "--modcacherw", ...["1", "t", "T", "true", "TRUE", "True"].map((value) => `"--modcacherw=${value}"`)]
    flags.forEach((flag) => {
      expect(ToolSafetySandbox.readonlyGoCache(flag)).toBe(true)
      writable.forEach((value) => {
        expect(ToolSafetySandbox.readonlyGoCache(`${flag}\t${value}`)).toBe(false)
        expect(ToolSafetySandbox.readonlyGoCache(`${value}\r\n${flag}`)).toBe(true)
      })
    })
    const malformed = ["", "-trimpath", '-ldflags="-modcacherw=false"', "-modcacherw='false'", '"-modcacherw=false', "-modcacherw=FALSELY", "-modcacherw=invalid -modcacherw=false", "-modcacherw=false -modcacherw=invalid"]
    malformed.forEach((value) => {
      expect(ToolSafetySandbox.readonlyGoCache(value)).toBe(false)
    })
  }),
)

confined("confined final Go read-only cache flags HOLD before scratch or parent writes", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const acquisitions: string[] = []
    const fs: FSUtil.Interface = {
      ...f.fs,
      makeTempDirectoryScoped: (options) => f.fs.makeTempDirectoryScoped({ ...options, directory: f.directory }).pipe(Effect.tap(() => Effect.sync(() => acquisitions.push("scratch")))),
      makeDirectory: (target, options) => f.fs.makeDirectory(target, options).pipe(Effect.tap(() => Effect.sync(() => acquisitions.push(target)))),
    }
    yield* Effect.forEach(["0", "f", "F", "false", "FALSE", "False"].flatMap((value) =>
      ["-", "--"].flatMap((prefix) => ["", "'", '"'].map((quote) => `-trimpath\t${quote}${prefix}modcacherw=${value}${quote}\r\n-buildvcs=false`))), (GOFLAGS) => Effect.gen(function* () {
      const env = { GOFLAGS }
      const result = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", "require('fs').writeFileSync('spawned','bad')"], {
        cwd: f.directory, env, extendEnv: false,
      }), { prepareParents: true }).pipe(
        Effect.provideService(FSUtil.Service, fs),
        Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: ["pending/deep/out"], sandbox: { enabled: true, scratch: true, unconfinedFallback: true } }),
        Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
        Effect.result,
      )
      expect(result._tag).toBe("Failure")
      if (result._tag !== "Failure") throw new Error("Read-only Go cache request was overridden")
      expect(result.failure).toBeInstanceOf(ToolSafety.Denied)
      expect(result.failure.reason).toBe("sandbox-go-readonly-cache-unsupported")
      expect(env.GOFLAGS).toBe(GOFLAGS)
      expect(acquisitions).toEqual([])
      expect(yield* f.fs.exists(path.join(f.directory, "pending"))).toBe(false)
      expect(yield* f.fs.exists(path.join(f.directory, "spawned"))).toBe(false)
    }), { discard: true })
  }),
)

it.live("disabled scratch sandbox returns ordinary commands with caller Go cache flags unchanged", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const env = { GOFLAGS: "-trimpath '-modcacherw=false'" }
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", "console.log(process.env.GOFLAGS)"], {
      cwd: f.directory, env, extendEnv: false,
    }), { prepareParents: true }).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, { writeRoots: ["pending/deep/out"], sandbox: { enabled: false, scratch: true } }),
      Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
    )
    expect(command._tag).toBe("StandardCommand")
    if (command._tag !== "StandardCommand") throw new Error("Unexpected ordinary pipeline")
    expect(command.command).toBe(f.node)
    expect(command.options.env).toEqual(env)
    const result = yield* f.processes.run(command)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString().trim()).toBe(env.GOFLAGS)
    expect(yield* f.fs.exists(path.join(f.directory, "pending"))).toBe(false)
  }),
)

// This is an ordinary-fallback proof, not confinement. Supported hosts have separate confined assertions above.
const unavailable = sandboxHost.shellWrites === "unenforced" || sandboxHost.shellSandbox.kind === "appcontainer" ? it.live : it.live.skip
unavailable("unavailable sandbox names its required HOLD, then fallback keeps caller Go flags ordinary", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const env = { GOFLAGS: "-modcacherw=false" }
    const input = ChildProcess.make(f.node, ["-e", "console.log(process.env.GOFLAGS)"], { cwd: f.directory, env, extendEnv: false })
    const profile = { requireSandbox: true, writeRoots: ["pending/deep/out"], sandbox: { enabled: true, scratch: true } }
    const baseline = yield* Effect.flip(ToolSafetySandbox.wrap(input, { prepareParents: true }).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
    ))
    expect(baseline.reason).toBe(process.platform === "win32" ? "sandbox-platform-unavailable" : "required-process-sandbox-unavailable")
    const command = yield* ToolSafetySandbox.wrap(input, { prepareParents: true }).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, { ...profile, sandbox: { ...profile.sandbox, unconfinedFallback: true } }),
      Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
    )
    expect(command._tag).toBe("StandardCommand")
    if (command._tag !== "StandardCommand") throw new Error("Unexpected fallback pipeline")
    expect(command.command).toBe(f.node)
    expect(command.options.env).toEqual(env)
    const result = yield* f.processes.run(command)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString().trim()).toBe(env.GOFLAGS)
    expect(yield* f.fs.exists(path.join(f.directory, "pending"))).toBe(false)
  }),
)

it.live("ordinary children preserve quoted or malformed Go flags unchanged", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.forEach(["-modcacherw", "--modcacherw=true", '-ldflags="-modcacherw=false"', "-modcacherw='false'", '"-modcacherw=false', "-modcacherw=FALSELY"], (GOFLAGS) => Effect.gen(function* () {
      // These flags are unconflicted or Go-owned syntax errors. An unsandboxed child receives them unchanged.
      const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", ""], { cwd: f.directory, env: { GOFLAGS }, extendEnv: false })).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, { sandbox: { enabled: false, scratch: true } }),
      )
      expect(command._tag).toBe("StandardCommand")
      if (command._tag !== "StandardCommand") throw new Error("Unexpected pipeline")
      expect(command.options.env?.GOFLAGS).toBe(GOFLAGS)
    }), { discard: true })
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

it.live("sandbox parent identities retain file ID and creation-time precision", () => Effect.sync(() => {
  const original = { dev: 1n, ino: 9007199254740992n, birthtimeNs: 1794471187150926600n }
  const replacement = { ...original, ino: original.ino + 1n }
  // Distinct NTFS directories can share creation time; rounded file IDs must not identify them as one.
  expect(Number(original.ino)).toBe(Number(replacement.ino))
  expect(SandboxParents.sameIdentity(original, replacement)).toBe(false)
  const later = { ...original, birthtimeNs: original.birthtimeNs + 1n }
  expect(Number(original.birthtimeNs)).toBe(Number(later.birthtimeNs))
  expect(SandboxParents.sameIdentity(original, later)).toBe(false)
  expect(SandboxParents.sameIdentity(original, { ...original })).toBe(true)
  expect(SandboxParents.sameIdentity(original, { ...original, dev: 2n })).toBe(false)
  const captured = { dev: 1422631540n, ino: 37154696926115890n, birthtimeNs: 1794487583363679600n }
  const capturedReplacement = { ...captured, ino: 37154696926115891n }
  expect(Number(captured.ino)).toBe(Number(capturedReplacement.ino))
  expect(SandboxParents.sameIdentity(captured, capturedReplacement)).toBe(false)
  expect(SandboxParents.sameIdentity(captured, { ...captured })).toBe(true)
  const unknown = { ...original, ino: 0n }
  expect(SandboxParents.sameIdentity(unknown, { ...unknown })).toBe(false)
  expect(SandboxParents.sameIdentity(unknown, original)).toBe(false)
  expect(SandboxParents.sameIdentity(original, unknown)).toBe(false)
}))

type ReplacementObservation = {
  state: "not_observed" | "present" | "absent" | "observation_failed"
  code?: string
  dev?: string
  ino?: string
  birthtimeNs?: string
}

function replacementState() {
  return {
    stage: "fixture",
    renameCompleted: false,
    replacementCompleted: false,
    controlCompleted: false,
    owned: undefined as string | undefined,
    moved: undefined as string | undefined,
    ownedIsDir: null as boolean | null,
    verification: "not-started",
    original: { state: "not_observed" } as ReplacementObservation,
    replacement: { state: "not_observed" } as ReplacementObservation,
  }
}

function replacementErrorCode(error: unknown) {
  try {
    if (error !== null && typeof error === "object" && "code" in error && typeof error.code === "string")
      return error.code.slice(0, 64)
  } catch {
    // A diagnostic getter failure uses unknown and must not replace the original Effect failure.
  }
  return "unknown"
}

function replacementObservation(entry: string | undefined,
  lookup: (entry: string) => Pick<BigIntStats, "dev" | "ino" | "birthtimeNs"> = (entry) => lstatSync(entry, { bigint: true }),
): ReplacementObservation {
  if (!entry) return { state: "not_observed" }
  try {
    const info = lookup(entry)
    return { state: "present", dev: String(info.dev).slice(0, 80), ino: String(info.ino).slice(0, 80), birthtimeNs: String(info.birthtimeNs).slice(0, 80) }
  } catch (error) {
    const code = replacementErrorCode(error)
    return { state: code === "ENOENT" ? "absent" : "observation_failed", code }
  }
}

function replacementSetup(fs: FSUtil.Interface, directory: string, state: ReturnType<typeof replacementState>) {
  return Effect.gen(function* () {
    state.stage = "rename"
    yield* fs.rename(path.join(directory, "owned"), path.join(directory, "moved")).pipe(Effect.orDie)
    state.renameCompleted = true
    state.stage = "replacement-mkdir"
    yield* fs.makeDirectory(path.join(directory, "owned")).pipe(Effect.orDie)
    state.replacementCompleted = true
    // Observe only after the rename/mkdir gap; these lookups still perturb timing.
    state.original = replacementObservation(path.join(directory, "moved"))
    state.replacement = replacementObservation(path.join(directory, "owned"))
    state.stage = "control-query"
    yield* fs.realPath(path.join(directory, "absent-control"))
    state.controlCompleted = true
  })
}

function verifyReplacementDirectories(fs: FSUtil.Interface, target: string, moved: string, state: ReturnType<typeof replacementState>) {
  return Effect.gen(function* () {
    state.verification = "owned-stat"
    state.ownedIsDir = (yield* fs.stat(target)).type === "Directory"
    expect(state.ownedIsDir).toBe(true)
    state.verification = "moved-stat"
    expect((yield* fs.stat(moved)).type).toBe("Directory")
    state.verification = "complete"
  })
}

function retainReplacementFailure<A, E, R>(effect: Effect.Effect<A, E, R>, state: ReturnType<typeof replacementState>,
  sink: (message: string) => void = (message) => console.error(message),
  observe: typeof replacementObservation = replacementObservation,
) {
  return effect.pipe(Effect.onExit((exit) => Exit.isFailure(exit) ? Effect.sync(() => {
    const snapshot = (entry: string | undefined): ReplacementObservation => {
      try { return observe(entry) } catch (error) {
        return { state: "observation_failed", code: replacementErrorCode(error) }
      }
    }
    let message = '{"sandboxReplacement":{"report":"formatting_failed"}}'
    try {
      // Later observations identify neither the actor nor the original isDir stat error.
      const report = JSON.stringify({ sandboxReplacement: {
        stage: state.stage, renameCompleted: state.renameCompleted, replacementCompleted: state.replacementCompleted,
        controlCompleted: state.controlCompleted, ownedIsDir: state.ownedIsDir, verification: state.verification,
        captured: { original: state.original, replacement: state.replacement },
        current: { owned: snapshot(state.owned), moved: snapshot(state.moved) },
      } })
      message = Buffer.byteLength(report) <= 4096 ? report : '{"sandboxReplacement":{"report":"size_limit"}}'
    } catch {
      // Keep the bounded fallback if diagnostic formatting fails; preserve the original Effect failure.
    }
    try { sink(message) } catch {
      // A diagnostic sink failure must never replace the original Effect failure.
    }
  }) : Effect.void))
}

it.live("failed preparation preserves a replacement directory with a different identity", () => {
  const state = replacementState()
  return retainReplacementFailure(Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.directory, "owned")
    const moved = path.join(f.directory, "moved")
    state.owned = target
    state.moved = moved
    const failed = yield* Effect.flip(SandboxParents.prepare({
      ...f.fs,
      realPath: (entry) => f.fs.realPath(entry).pipe(Effect.tap(() =>
        entry === target ? replacementSetup(f.fs, f.directory, state) : Effect.void,
      )),
    }, f.directory, [target]))
    expect(failed.reason).toBe("sandbox-parent-placement-acquisition")
    yield* verifyReplacementDirectories(f.fs, target, moved, state)
  }), state)
})

for (const stage of ["rename", "replacement-mkdir"] as const) {
  it.live(`replacement ${stage} failures preserve the setup error instead of becoming placement denial`, () => Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.directory, "owned")
    const state = replacementState()
    const primary = systemError({
      _tag: "PermissionDenied", module: "FileSystem", method: stage === "rename" ? "rename" : "makeDirectory", pathOrDescriptor: target,
      cause: Object.assign(new Error(`controlled ${stage} failure`), { code: "EACCES" }),
    })
    const injected: FSUtil.Interface = {
      ...f.fs,
      rename: (from, to) => stage === "rename" ? Effect.fail(primary) : f.fs.rename(from, to),
      makeDirectory: (entry, options) => stage === "replacement-mkdir" ? Effect.fail(primary) : f.fs.makeDirectory(entry, options),
    }
    const exit = yield* SandboxParents.prepare({
      ...f.fs,
      realPath: (entry) => f.fs.realPath(entry).pipe(Effect.tap(() => entry === target ? replacementSetup(injected, f.directory, state) : Effect.void)),
    }, f.directory, [target]).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error("Controlled replacement setup failure succeeded")
    const defects = exit.cause.reasons.filter(Cause.isDieReason)
    expect(defects).toHaveLength(1)
    expect(defects[0].defect).toBe(primary)
    expect(exit.cause.reasons.some(Cause.isFailReason)).toBe(false)
    expect(state.stage).toBe(stage)
    expect(state.renameCompleted).toBe(stage === "replacement-mkdir")
    expect(state.replacementCompleted).toBe(false)
    expect(state.controlCompleted).toBe(false)
  }))
}

it.live("replacement verification preserves the actual stat error while both native directories remain", () => Effect.gen(function* () {
  const f = yield* fixture
  const target = path.join(f.directory, "owned")
  const moved = path.join(f.directory, "moved")
  yield* f.fs.makeDirectory(target)
  yield* f.fs.makeDirectory(moved)
  const state = replacementState()
  state.owned = target
  state.moved = moved
  const primary = systemError({
    _tag: "PermissionDenied", module: "FileSystem", method: "stat", pathOrDescriptor: target,
    cause: Object.assign(new Error("controlled verification stat failure"), { code: "EACCES" }),
  })
  const observed = { calls: 0 }
  const underlying = Layer.effect(FileSystem.FileSystem, Effect.map(FileSystem.FileSystem, (native) => ({
    ...native,
    stat: (entry: string) => entry !== target ? native.stat(entry) : Effect.sync(() => { observed.calls++ }).pipe(Effect.andThen(Effect.fail(primary))),
  }))).pipe(Layer.provide(NodeFileSystem.layer))
  const exit = yield* Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    yield* verifyReplacementDirectories(fs, target, moved, state)
  }).pipe(Effect.provide(Layer.fresh(LayerNode.compile(FSUtil.node, [[filesystem, underlying]]))), Effect.exit)
  expect(observed.calls).toBe(1)
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error("Controlled stat error was ignored")
  const failures = exit.cause.reasons.filter(Cause.isFailReason)
  expect(failures).toHaveLength(1)
  expect(failures[0].error).toBe(primary)
  expect(exit.cause.reasons.some(Cause.isDieReason)).toBe(false)
  expect(state.verification).toBe("owned-stat")
  expect(state.ownedIsDir).toBe(null)
  expect(lstatSync(target).isDirectory()).toBe(true)
  expect(lstatSync(moved).isDirectory()).toBe(true)
}))

it.live("replacement evidence preserves defects and reports before scope teardown even if the reporter throws", () => Effect.gen(function* () {
  for (const throwing of [false, true]) {
    const events: string[] = []
    const sentinelAlive: boolean[] = []
    const primary = new Error("original replacement assertion")
    const state = replacementState()
    const exit = yield* Effect.gen(function* () {
      const f = yield* fixture
      state.owned = f.directory
      yield* Effect.addFinalizer(() => Effect.sync(() => { events.push("teardown") }))
      yield* retainReplacementFailure(Effect.sync(() => { events.push("assertion"); throw primary }), state, () => {
        events.push("report")
        sentinelAlive.push(lstatSync(f.directory).isDirectory())
        if (throwing) throw new Error("reporter failure")
      }, (entry) => {
        events.push("observation")
        return replacementObservation(entry)
      })
    }).pipe(Effect.scoped, Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(primary)
    expect(events).toEqual(["assertion", "observation", "observation", "report", "teardown"])
    expect(sentinelAlive).toEqual([true])
    expect(replacementObservation(state.owned).state).toBe("absent")
  }
}))

it.live("replacement observations distinguish absent from unknown without masking the primary failure", () => Effect.gen(function* () {
  const primary = new Error("original failure")
  for (const code of ["ENOENT", "EACCES"]) {
    const error = Object.assign(new Error("lookup"), { code })
    expect(replacementObservation("owned", () => { throw error })).toEqual({ state: code === "ENOENT" ? "absent" : "observation_failed", code })
    let report = ""
    const exit = yield* retainReplacementFailure(Effect.die(primary), replacementState(), (message) => { report = message }, () => { throw error }).pipe(Effect.exit)
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(primary)
    expect(JSON.parse(report).sandboxReplacement.current.owned).toEqual({ state: "observation_failed", code })
    expect(Buffer.byteLength(report)).toBeLessThanOrEqual(4096)
  }
  const hostile = Object.defineProperty({}, "code", { get() { throw new Error("hostile getter") } })
  expect(replacementObservation("owned", () => { throw hostile })).toEqual({ state: "observation_failed", code: "unknown" })
  const cyclic: { code: string; self?: unknown } = { code: "EIO" }
  cyclic.self = cyclic
  expect(replacementObservation("owned", () => { throw cyclic })).toEqual({ state: "observation_failed", code: "EIO" })
}))

it.live("replacement setup completion distinguishes failures before rename, before mkdir and after mkdir", () => Effect.gen(function* () {
  for (const stage of ["rename", "replacement-mkdir", "control-query"]) {
    const f = yield* fixture
    yield* f.fs.makeDirectory(path.join(f.directory, "owned"))
    const state = replacementState()
    const primary = new Error(stage)
    const exit = yield* replacementSetup({
      ...f.fs,
      rename: (from, to) => stage === "rename" ? Effect.die(primary) : f.fs.rename(from, to),
      makeDirectory: (entry, options) => stage === "replacement-mkdir" ? Effect.die(primary) : f.fs.makeDirectory(entry, options),
      realPath: () => Effect.die(primary),
    }, f.directory, state).pipe(Effect.exit)
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(primary)
    expect(state.stage).toBe(stage)
    expect(state.renameCompleted).toBe(stage !== "rename")
    expect(state.replacementCompleted).toBe(stage === "control-query")
    expect(state.controlCompleted).toBe(false)
  }
}))

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

const listen = (endpoint: string | number) => Effect.acquireRelease(
  Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
    const server = createServer((socket) => socket.end(typeof endpoint === "string" ? path.basename(endpoint) : "tcp"))
    server.once("error", reject)
    if (typeof endpoint === "string") server.listen(endpoint, () => resolve(server))
    else server.listen(endpoint, "127.0.0.1", () => resolve(server))
  })),
  (server) => Effect.promise(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))),
)

it.live("invalid Unix socket grants HOLD before preparing output parents or unconfined fallback", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const file = path.join(f.directory, "ordinary-file")
    yield* f.fs.writeFileString(file, "untouched")
    yield* Effect.forEach(["*.sock", "missing.sock", "ordinary-file"], (name) => Effect.gen(function* () {
      const held = yield* Effect.flip(f.wrap("", { requireSandbox: true, writeRoots: ["must/not/out"], sandbox: {
        enabled: true, scratch: true, unconfinedFallback: true, allowedUnixSockets: [{ directory: f.directory, path: path.join(f.directory, name) }],
      } }))
      expect(held.reason).toMatch(/^sandbox-unix-socket-/)
      expect(yield* f.fs.exists(path.join(f.directory, "must"))).toBe(false)
    }), { discard: true })
    expect(yield* f.fs.readFileString(file)).toBe("untouched")
  }),
)

it.live("malformed Unix grants are typed HOLD even with sandbox disabled and fallback enabled", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.forEach([null, {}, "socket", [null], [false], [{}], [{ directory: 7, path: "/socket" }], [{ directory: f.directory, path: 7 }]], (value) => Effect.gen(function* () {
      const profile = { writeRoots: ["must/not/out"], sandbox: { enabled: false, unconfinedFallback: true,
        allowedUnixSockets: [{ directory: f.directory, path: path.join(f.directory, "missing.sock") }] } }
      Reflect.set(profile.sandbox, "allowedUnixSockets", value)
      const result = yield* f.wrap("", profile).pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag !== "Failure") throw new Error("Malformed socket grant was not held")
      expect(result.failure).toBeInstanceOf(ToolSafety.Denied)
      expect(result.failure.reason).toBe(Array.isArray(value) ? "sandbox-unix-socket-invalid-entry" : "sandbox-unix-socket-invalid-grants")
      expect(yield* f.fs.exists(path.join(f.directory, "must"))).toBe(false)
    }), { discard: true })
  }),
)

it.live("other native location does not acquire an absent foreign socket", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const elsewhere = path.join(f.directory, "elsewhere")
    yield* f.fs.makeDirectory(elsewhere)
    const profile = { requireSandbox: true, writeRoots: [], sandbox: { enabled: true, unconfinedFallback: true,
      allowedUnixSockets: [{ directory: f.directory, path: path.join(f.directory, "absent-parent", "missing.sock") }] } }
    const result = yield* f.wrap("", profile, elsewhere).pipe(Effect.result)
    if (process.platform === "darwin") {
      expect(result._tag).toBe("Success")
      return
    }
    expect(result._tag).toBe("Failure")
    if (result._tag !== "Failure") throw new Error("Unsupported socket policy did not HOLD")
    expect(result.failure.reason).toBe(process.platform === "linux"
      ? "sandbox-unix-socket-exact-policy-unsupported" : "sandbox-unix-socket-platform-unsupported")
    expect(yield* f.fs.exists(path.join(f.directory, "absent-parent"))).toBe(false)
  }),
)

it.live.skipIf(sandboxHost.shellWrites === "enforced" && sandboxHost.shellSandbox.kind !== "appcontainer")("unavailable process sandbox HOLDs without preparing parents", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const held = yield* Effect.flip(f.wrap("", { requireSandbox: true, writeRoots: ["unavailable/deep/out"] }))
    expect(held.reason).toMatch(/^(?:required-process-sandbox-unavailable|sandbox-platform-unavailable)$/)
    expect(yield* f.fs.exists(path.join(f.directory, "unavailable"))).toBe(false)
  }),
)

confined("confined generator prepares nested file parents; sibling denied and caches scratch-scoped", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const profile = { requireSandbox: true, writeRoots: ["gen/nested/out.ts"], sandbox: { enabled: true, scratch: true } }
    const env = { GOCACHE: path.join(f.directory, "owner-build"), GOMODCACHE: path.join(f.directory, "owner-mod") }
    yield* Effect.forEach(Object.values(env), (directory) => f.fs.makeDirectory(directory), { discard: true })
    yield* Effect.forEach(Object.values(env), (directory) => f.fs.writeFileString(path.join(directory, "sentinel"), "owner"), { discard: true })
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", "const f=require('fs'),p=require('path');f.mkdirSync('gen/nested',{recursive:true});f.writeFileSync('gen/nested/out.ts','generated');let denied=false;try{f.writeFileSync('gen/nested/sibling','bad')}catch(e){denied=['EACCES','EPERM','EROFS'].includes(e.code)};f.writeFileSync(p.join(process.env.GOMODCACHE,'probe'),'module');f.writeFileSync(p.join(process.env.GOCACHE,'probe'),'build');const ownerDenied=[process.env.OWNER_BUILD,process.env.OWNER_MOD].every(dir=>{try{f.writeFileSync(p.join(dir,'sentinel'),'changed');return false}catch(e){if(!['EPERM','EACCES','EROFS'].includes(e.code))throw e;return true}});console.log(JSON.stringify({denied,ownerDenied,go:process.env.GOCACHE,mod:process.env.GOMODCACHE,tmp:process.env.TMPDIR}))"], {
      cwd: f.directory, env: { ...env, OWNER_BUILD: env.GOCACHE, OWNER_MOD: env.GOMODCACHE },
    }), { prepareParents: true }).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
    )
    expect(yield* f.fs.isDir(path.join(f.directory, "gen", "nested"))).toBe(true)
    // srt binds only existing write roots, so the missing file root waits as an empty placeholder; seatbelt needs none.
    if (jail === "srt") expect(yield* f.fs.readFileString(path.join(f.directory, "gen", "nested", "out.ts"))).toBe("")
    if (jail !== "srt") expect(yield* f.fs.exists(path.join(f.directory, "gen", "nested", "out.ts"))).toBe(false)
    const result = yield* f.processes.run(command, { timeout: "5 seconds" })
    expect(result.exitCode).toBe(0)
    const out = JSON.parse(result.stdout.toString())
    expect(out.denied).toBe(true)
    expect(out.ownerDenied).toBe(true)
    expect(out.go).toBe(path.join(out.tmp, "go-build"))
    expect(out.mod).toBe(path.join(out.tmp, "go-mod"))
    expect(yield* f.fs.readFileString(path.join(out.mod, "probe"))).toBe("module")
    expect(yield* f.fs.readFileString(path.join(out.go, "probe"))).toBe("build")
    yield* Effect.forEach(Object.values(env), (directory) => Effect.gen(function* () {
      expect(yield* f.fs.readFileString(path.join(directory, "sentinel"))).toBe("owner")
    }), { discard: true })
    expect(env).toEqual({ GOCACHE: path.join(f.directory, "owner-build"), GOMODCACHE: path.join(f.directory, "owner-mod") })
    expect(yield* f.fs.readFileString(path.join(f.directory, "gen", "nested", "out.ts"))).toBe("generated")
    expect(yield* f.fs.exists(path.join(f.directory, "gen", "nested", "sibling"))).toBe(false)
  }), 30_000,
)

confined("a missing file root the command never writes leaves nothing behind", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const result = yield* Effect.scoped(Effect.gen(function* () {
      const command = yield* f.wrap("process.stdout.write('idle')", { requireSandbox: true, writeRoots: ["unused.txt"] })
      const written = yield* f.wrap("require('fs').writeFileSync('written.txt','')", { requireSandbox: true, writeRoots: ["written.txt"] })
      return [yield* f.processes.run(command, { timeout: "5 seconds" }), yield* f.processes.run(written, { timeout: "5 seconds" })]
    }))
    expect(result.map((item) => item.exitCode)).toEqual([0, 0])
    expect(yield* f.fs.exists(path.join(f.directory, "unused.txt"))).toBe(false)
    // An empty write still counts as the command's own file.
    expect(yield* f.fs.readFileString(path.join(f.directory, "written.txt"))).toBe("")
  }), 30_000,
)

confined("real Go downloads and builds in removable scoped scratch, preserving owner flags and caches", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const go = yield* ToolSafetySandbox.available("go")
    if (!go) throw new Error("BLOCKED: real Go unavailable")
    const proxy = path.join(f.directory, "proxy", "example.com", "scratch", "@v")
    yield* f.fs.makeDirectory(proxy, { recursive: true })
    yield* f.fs.writeFileString(path.join(proxy, "v1.0.0.mod"), "module example.com/scratch\n\ngo 1.20\n")
    yield* f.fs.writeFileString(path.join(proxy, "v1.0.0.info"), JSON.stringify({ Version: "v1.0.0", Time: "2020-01-01T00:00:00Z" }))
    // Offline module proxy ZIP: go.mod plus scratch.go exporting Value = 42; no network/cache seeding needed.
    yield* f.fs.writeFile(path.join(proxy, "v1.0.0.zip"), Buffer.from("UEsDBBQAAAAAAIYJSF2hrap0JAAAACQAAAAhAAAAZXhhbXBsZS5jb20vc2NyYXRjaEB2MS4wLjAvZ28ubW9kbW9kdWxlIGV4YW1wbGUuY29tL3NjcmF0Y2gKCmdvIDEuMjAKUEsDBBQAAAAAAIYJSF3Re78jIgAAACIAAAAlAAAAZXhhbXBsZS5jb20vc2NyYXRjaEB2MS4wLjAvc2NyYXRjaC5nb3BhY2thZ2Ugc2NyYXRjaAoKY29uc3QgVmFsdWUgPSA0MgpQSwECFAMUAAAAAACGCUhdoa2qdCQAAAAkAAAAIQAAAAAAAAAAAAAAgAEAAAAAZXhhbXBsZS5jb20vc2NyYXRjaEB2MS4wLjAvZ28ubW9kUEsBAhQDFAAAAAAAhglIXdF7vyMiAAAAIgAAACUAAAAAAAAAAAAAAIABYwAAAGV4YW1wbGUuY29tL3NjcmF0Y2hAdjEuMC4wL3NjcmF0Y2guZ29QSwUGAAAAAAIAAgCiAAAAyAAAAAAA", "base64"))
    yield* f.fs.writeFileString(path.join(f.directory, "go.mod"), "module fixture\n\ngo 1.20\n\nrequire example.com/scratch v1.0.0\n")
    yield* f.fs.writeFileString(path.join(f.directory, "main.go"), 'package main\nimport "example.com/scratch"\nfunc main() { println(scratch.Value) }\n')
    const owner = { GOCACHE: path.join(f.directory, "owner-build"), GOMODCACHE: path.join(f.directory, "owner-mod") }
    yield* Effect.forEach(Object.values(owner), (directory) => f.fs.makeDirectory(directory), { discard: true })
    yield* Effect.forEach(Object.values(owner), (directory) => f.fs.writeFileString(path.join(directory, "sentinel"), "owner"), { discard: true })
    const env = { ...owner, GOPROXY: pathToFileURL(path.join(f.directory, "proxy")).href, GOSUMDB: "off", GOTOOLCHAIN: "local", GOTELEMETRY: "off", GOENV: "off", CGO_ENABLED: "0", GOFLAGS: "-trimpath -buildvcs=false -modcacherw=false -modcacherw", GOPRIVATE: "", GONOPROXY: "", GONOSUMDB: "" }
    const before = { ...env }
    const scratch = yield* Effect.scoped(Effect.gen(function* () {
      const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", `const c=require('child_process');for(const args of [['mod','download','example.com/scratch'],['build','-mod=mod','-o','gen/deep/out','.']]){const r=c.spawnSync(${JSON.stringify(go)},args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||String(r.error));}console.log(JSON.stringify({go:process.env.GOCACHE,mod:process.env.GOMODCACHE,tmp:process.env.TMPDIR,flags:process.env.GOFLAGS}))`], {
        cwd: f.directory, env,
      }), { prepareParents: true }).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: ["gen/deep/out", "go.sum"], sandbox: { enabled: true, scratch: true } }),
        Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
      )
      expect(command._tag).toBe("StandardCommand")
      if (command._tag !== "StandardCommand") throw new Error("Unexpected Go pipeline")
      expect(command.options.env?.GOFLAGS).toBe(`${env.GOFLAGS} -modcacherw`)
      const result = yield* f.processes.run(command, { timeout: "120 seconds" })
      if (result.exitCode !== 0) throw new Error(`Real Go control failed: ${result.stderr.toString()}`)
      const out = JSON.parse(result.stdout.toString())
      expect(out.flags).toBe(`${env.GOFLAGS} -modcacherw`)
      expect(out.go).toBe(path.join(out.tmp, "go-build"))
      expect(out.mod).toBe(path.join(out.tmp, "go-mod"))
      expect((yield* f.fs.readDirectory(out.go)).some((entry) => /^[a-f0-9]{2}$/.test(entry))).toBe(true)
      expect(yield* f.fs.readFileString(path.join(out.mod, "example.com", "scratch@v1.0.0", "scratch.go"))).toContain("const Value = 42")
      if (typeof out.tmp !== "string") throw new Error("Go child did not report its scratch directory")
      return out.tmp
    }))
    expect(yield* f.fs.exists(scratch)).toBe(false)
    expect(env).toEqual(before)
    expect(yield* f.fs.exists(path.join(f.directory, "gen", "deep", "out"))).toBe(true)
    yield* Effect.forEach(Object.values(owner), (directory) => Effect.gen(function* () {
      expect(yield* f.fs.readDirectory(directory)).toEqual(["sentinel"])
      expect(yield* f.fs.readFileString(path.join(directory, "sentinel"))).toBe("owner")
    }), { discard: true })
  }), 150_000,
)

// Last in the file. On Windows, cleanup after this proof does not return (run 43242689800). The exit
// is after every other test in the file, and the file runs alone, so it skips no other proof.
it.live("exact Unix socket grant uses native placement; unsupported enforcement HOLD even with fallback", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const one = path.join(f.directory, "one.sock")
    const two = path.join(f.directory, "two.sock")
    const profile = { requireSandbox: true, writeRoots: [], sandbox: { enabled: true, unconfinedFallback: true,
      allowedUnixSockets: [{ directory: f.directory, path: one }] } } satisfies ToolSafety.Profile
    if (process.platform === "win32") {
      const held = yield* Effect.flip(f.wrap("", profile))
      expect(held.reason).toBe("sandbox-unix-socket-platform-unsupported")
      console.info("Windows: exact Unix socket enforcement unsupported; HOLD measured, no conformance claim")
      process.exit(failed ? 1 : 0)
    }
    yield* listen(one)
    yield* listen(two)
    const tcp = yield* listen(0)
    const address = tcp.address()
    if (!address || typeof address === "string") throw new Error("TCP positive control unavailable")
    const script = `Promise.all(${JSON.stringify([one, two, { host: "127.0.0.1", port: address.port }])}.map(p=>new Promise(r=>{const c=require('net').connect(p);let out='';c.on('data',d=>out+=d);c.on('end',()=>r(out));c.on('error',e=>r(e.code));c.setTimeout(1000,()=>{c.destroy();r('TIMEOUT')})}))).then(r=>console.log(JSON.stringify(r)))`
    const baseline = yield* f.processes.run(yield* f.wrap(script), { timeout: "5 seconds" })
    expect(baseline.exitCode).toBe(0)
    expect(JSON.parse(baseline.stdout.toString())).toEqual(["one.sock", "two.sock", "tcp"])
    if (process.platform === "linux") {
      const held = yield* Effect.flip(f.wrap(script, profile))
      expect(held.reason).toBe("sandbox-unix-socket-exact-policy-unsupported")
      console.info("Linux SRT 0.0.78: exact Unix socket paths unsupported; working socket/TCP controls and HOLD measured")
      return
    }
    const command = yield* f.wrap(script, profile)
    profile.sandbox.allowedUnixSockets[0].path = two
    const allowed = yield* f.processes.run(command, { timeout: "5 seconds" })
    expect(allowed.exitCode).toBe(0)
    expect(JSON.parse(allowed.stdout.toString())).toEqual(["one.sock", "EPERM", "EPERM"])
    const elsewhere = path.join(f.directory, "elsewhere")
    yield* f.fs.makeDirectory(elsewhere)
    const mismatch = yield* f.processes.run(yield* f.wrap(script, profile, elsewhere, f.directory), { timeout: "5 seconds" })
    expect(JSON.parse(mismatch.stdout.toString())).toEqual(["EPERM", "EPERM", "EPERM"])
    const denied = yield* f.processes.run(yield* f.wrap(script, { requireSandbox: true, writeRoots: [] }), { timeout: "5 seconds" })
    expect(JSON.parse(denied.stdout.toString())).toEqual(["EPERM", "EPERM", "EPERM"])
  }), 30_000,
)
