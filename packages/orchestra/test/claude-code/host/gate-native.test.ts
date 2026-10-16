import { describe, expect } from "bun:test"
import fs from "node:fs/promises"
import { realpathSync } from "node:fs"
import path from "node:path"
import { Deferred, Effect, Exit, Fiber, FileSystem } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { Account } from "@/account/account"
import { Auth } from "@/auth"
import { ClaudeHostGate } from "@/claude-code/host/gate"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { Database } from "@orchestra/core/database/database"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { Plugin } from "@/plugin"
import { WriteRoots } from "@/maestro/write-roots"
import { Npm } from "@orchestra/core/npm"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { AccountTest } from "../../fake/account"
import { AuthTest } from "../../fake/auth"
import { NpmTest } from "../../fake/npm"
import { TestInstance, provideInstance, tmpdirScoped } from "../../fixture/fixture"
import { seatShellRuns } from "../../fixture/seat-sandbox"
import { pollWithTimeout, testEffect } from "../../lib/effect"
import { expectSpawn } from "../../../../core/test/fixture/omni-expect"

// Actual gate, profile loader, Session, Permission and filesystem. Only account/network integrations are replaced;
// no SDK query, model, policy port or sandbox wrapper is scripted. Each git instance has its own project profile.
const it = testEffect(AppNodeBuilder.build(LayerNode.group([
  Session.node, SessionProjector.node, AppProcess.node, LocationServiceMap.node, Permission.node, Git.node,
   ArsenalObservations.node, AtlasKnowledge.node, Database.node, EventV2Bridge.node, CrossSpawnSpawner.node, FSUtil.node,
  Plugin.node, Config.node, Agent.node, RuntimeFlags.node,
]), [
  [Auth.node, AuthTest.empty],
  [Account.node, AccountTest.empty],
  [Npm.node, NpmTest.noop],
  [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
]))

const fixture = Effect.fnUntraced(function* (rules: PermissionV1.Ruleset = [], seat = "maestro") {
  const instance = yield* TestInstance
  const filesystem = yield* FSUtil.Service
  const profile = yield* ToolSafety.RuntimeProfile
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ agent: seat, permission: [
    { permission: "*", pattern: "*", action: "allow" }, ...rules,
  ] })
  yield* Effect.addFinalizer(() => sessions.remove(session.id).pipe(Effect.ignore))
  const gate = yield* ClaudeHostGate.live({ granted: { [seat]: ["process"] }, abort: new AbortController().signal }).pipe(
    Effect.provideService(FileSystem.FileSystem, filesystem),
  )
  yield* Effect.addFinalizer(() => gate.close)
  const actor = { sessionID: session.id, seat } satisfies ClaudeHostGate.Actor
  const decide = (name: string, input: Record<string, unknown>, id: string = crypto.randomUUID()) =>
    ClaudeHostGate.decide(gate, actor, name, input, id).pipe(Effect.provideService(ToolSafety.RuntimeProfile, profile))
  const preferences = Effect.fnUntraced(function* (neverTouch: string[], projectID = session.projectID) {
    const file = path.join(MaestroArsenal.stateDirectory(Global.Path.data, projectID), projectID, "profile", "preferences.json")
    yield* filesystem.ensureDir(path.dirname(file))
    yield* Effect.addFinalizer(() => filesystem.remove(file).pipe(Effect.ignore))
    yield* filesystem.writeJson(file, {
      scrutiny: "balanced", askBefore: [], neverTouch, riskTolerance: "medium", waiverAuthority: "human-only",
    })
  })
  return { directory: instance.directory, filesystem, session, sessions, gate, actor, decide, preferences }
})

function refused(decision: ClaudeHostGate.Decision, reason: string) {
  expect(decision.allow).toBe(false)
  if (!decision.allow) expect(decision.reason).toContain(reason)
}

const shell = process.platform !== "win32" && seatShellRuns() ? it.instance : it.instance.skip

describe("native gate real policy", () => {
  it.instance("an unrestricted maestro Bash needs no seat grant and keeps ordinary input", () => Effect.gen(function* () {
    const f = yield* fixture()
    expect(yield* f.decide("Bash", { command: "echo permitted" })).toEqual({ allow: true })
    expect(WriteRoots.read(f.session.permission)).toBeUndefined()
  }), { git: true })

  it.instance("a write-roots seat still requires its own bound grant", () => Effect.gen(function* () {
    const f = yield* fixture([], "backend")
    refused(yield* f.decide("Bash", { command: "echo permitted" }), "no bound write roots")
    yield* f.sessions.setPermission({ sessionID: f.session.id, permission: yield* WriteRoots.bind("backend", [], [
      { permission: "*", pattern: "*", action: "allow" as const },
    ]).pipe(Effect.provideService(FileSystem.FileSystem, f.filesystem)) })
    const decision = yield* f.decide("Bash", { command: "echo permitted" })
    if (!decision.allow) return refused(decision, "NATIVE_SHELL_SANDBOX_REQUIRED")
    expect(typeof decision.input?.command).toBe("string")
  }), { git: true }, 60_000)

  // No shell is started on unsupported platforms: a named HOLD is the required control there.
  for (const seat of ["maestro", "patty"]) {
    it.instance(`${seat} Bash loads project neverTouch before deciding confinement`, () => Effect.gen(function* () {
      const f = yield* fixture([], seat)
      yield* f.filesystem.writeFileString(path.join(f.directory, "protected.txt"), "sentinel")
      yield* f.preferences(["protected.txt"])
      const decision = yield* f.decide("Bash", { command: "printf changed > protected.txt" })
      if (!decision.allow) {
        refused(decision, "NATIVE_SHELL_SANDBOX_REQUIRED")
        return
      }
      expect(typeof decision.input?.command).toBe("string")
      expect(decision.input?.command).not.toBe("printf changed > protected.txt")
      const processes = yield* AppProcess.Service
      expectSpawn(import.meta.path)
      yield* processes.run(ChildProcess.make("/bin/sh", ["-c", String(decision.input?.command)], { cwd: f.directory }))
      expect(yield* f.filesystem.readFileString(path.join(f.directory, "protected.txt"))).toBe("sentinel")
      // A harmless ordinary write is still permitted under the same effective project profile.
      const permitted = yield* f.decide("Bash", { command: "printf permitted > permitted.txt" })
      expect(permitted.allow).toBe(true)
      if (!permitted.allow) return
      expect(typeof permitted.input?.command).toBe("string")
      const result = yield* processes.run(ChildProcess.make("/bin/sh", ["-c", String(permitted.input?.command)], { cwd: f.directory }))
      expect(result.exitCode).toBe(0)
      expect(yield* f.filesystem.readFileString(path.join(f.directory, "permitted.txt"))).toBe("permitted")
    }), { git: true }, 60_000)
  }

  it.instance("the same gate loads the actor Session's actual project profile", () => Effect.gen(function* () {
    const f = yield* fixture()
    const directory = yield* tmpdirScoped({ git: true })
    const other = yield* f.sessions.create({ agent: "maestro", permission: [
      { permission: "*", pattern: "*", action: "allow" },
    ] }).pipe(provideInstance(directory))
    yield* Effect.addFinalizer(() => f.sessions.remove(other.id).pipe(Effect.ignore))
    expect(other.projectID).not.toBe(f.session.projectID)
    yield* f.preferences(["protected.txt"], other.projectID)
    expect(yield* f.gate.confine(f.actor, "echo permitted", "primary", undefined)).toBeUndefined()
    const decision = yield* ClaudeHostGate.decide(f.gate, { sessionID: other.id, seat: "maestro" }, "Bash", { command: "echo permitted" }, "other")
    if (!decision.allow) return refused(decision, "NATIVE_SHELL_SANDBOX_REQUIRED")
    expect(typeof decision.input?.command).toBe("string")
    expect(decision.input?.command).not.toBe("echo permitted")
  }), { git: true }, 60_000)

  it.instance("required confinement ignores host unconfinedFallback when no supported jail exists", () => Effect.gen(function* () {
    const instance = yield* TestInstance
    const f = yield* fixture().pipe(Effect.provideService(ToolSafety.RuntimeProfile, {
      sandbox: { enabled: true, unconfinedFallback: true,
        allowedLoopbackEndpoints: [{ directory: instance.directory, host: "127.0.0.1", port: 12345 }] },
    }))
    const decision = yield* f.decide("Bash", { command: "printf held > held.txt" }).pipe(
      Effect.provideService(ToolSafetySandbox.Seatbelt, path.join(f.directory, "missing-sandbox-exec")),
      Effect.provideService(ToolSafetySandboxRuntime.Source, {
        directory: path.join(f.directory, "missing-runtime"), artifacts: [], dependencies: ["orchestra-missing-sandbox-dependency"],
      }),
    )
    refused(decision, "NATIVE_SHELL_SANDBOX_REQUIRED")
    expect(yield* f.filesystem.exists(path.join(f.directory, "held.txt"))).toBe(false)
  }), { git: true }, 60_000)

  for (const restriction of ["managedPaths", "writeRoots", "readRoots"] as const) {
    it.instance(`maestro Bash enforces host ${restriction} without an explicit requireSandbox flag`, () => Effect.gen(function* () {
      const instance = yield* TestInstance
      const profile = restriction === "readRoots" ? { sandbox: { enabled: false, readRoots: [instance.directory] } }
        : { [restriction]: [instance.directory] }
      const f = yield* fixture().pipe(Effect.provideService(ToolSafety.RuntimeProfile, profile))
      const decision = yield* f.decide("Bash", { command: "echo permitted" })
      if (!decision.allow) return refused(decision, "NATIVE_SHELL_SANDBOX_REQUIRED")
      expect(typeof decision.input?.command).toBe("string")
      expect(decision.input?.command).not.toBe("echo permitted")
    }), { git: true }, 60_000)
  }

  it.instance("Agent and Task use registry seat rules; other plugin routes keep their spelling", () => Effect.gen(function* () {
    const f = yield* fixture([
      { permission: "task", pattern: "*", action: "allow" },
      { permission: "task", pattern: "backend", action: "deny" },
      { permission: "task", pattern: "other-seat", action: "deny" },
      { permission: "task", pattern: "archie", action: "allow" },
    ])
    const args = { subagent_type: "orchestra:backend", description: "bounded work", prompt: "harmless" }
    for (const name of ["Agent", "Task"]) {
      refused(yield* f.decide(name, args), "rule which prevents")
      refused(yield* f.decide(name, { ...args, subagent_type: "backend" }), "rule which prevents")
      expect(yield* f.decide(name, { ...args, subagent_type: "orchestra:archie" })).toEqual({ allow: true })
      expect(yield* f.decide(name, { ...args, subagent_type: "other:backend" })).toEqual({ allow: true })
      expect(yield* f.decide(name, { ...args, subagent_type: "orchestra:other-seat" })).toEqual({ allow: true })
    }
    expect(args.subagent_type).toBe("orchestra:backend")
    // Check the real pending Permission request: its pattern is canonical, its provenance is the raw SDK route.
    yield* f.sessions.setPermission({ sessionID: f.session.id, permission: [
      { permission: "*", pattern: "*", action: "allow" }, { permission: "task", pattern: "archie", action: "ask" },
    ] })
    const permission = yield* Permission.Service
    const pending = yield* Effect.forkScoped(f.decide("Agent", { subagent_type: "orchestra:archie" }))
    const request = yield* pollWithTimeout(permission.list().pipe(Effect.map((requests) => requests[0])), "seat permission never asked")
    expect(request.patterns).toEqual(["archie"])
    expect(request.metadata.subagent_type).toBe("orchestra:archie")
    yield* permission.reply({ requestID: request.id, reply: "once" })
    expect(yield* Fiber.join(pending)).toEqual({ allow: true })
  }), { git: true })

  // The served Task exists only for Relay workflow dispatch; an ordinary dispatch through it would skip Agent's records.
  it.instance("the served task holds a call without workflow before any other check", () => Effect.gen(function* () {
    const f = yield* fixture()
    const gate = { ...f.gate, granted: { maestro: ["task"] } }
    const profile = yield* ToolSafety.RuntimeProfile
    const decide = (input: Record<string, unknown>) => ClaudeHostGate.decide(gate, f.actor, "mcp__orchestra__task", input,
      crypto.randomUUID()).pipe(Effect.provideService(ToolSafety.RuntimeProfile, profile))
    const args = { subagent_type: "backend", description: "bounded work", prompt: "harmless", writePaths: ["src/money.ts"] }
    refused(yield* decide(args), "WORKFLOW_TASK_SELECTION_MISSING")
    refused(yield* decide(args), "Dispatch any other work with Agent")
    const selected = yield* decide({ ...args, authorizationID: "evt_maestro_authorization_fixture",
      workflow: { documentID: "packet", planRevisionID: "evt_maestro_plan_revision_fixture", parameters: {} } })
    if (!selected.allow) expect(selected.reason).not.toContain("WORKFLOW_TASK_SELECTION_MISSING")
  }), { git: true })

  it.instance("file permission rules check the requested alias and its physical target", () => Effect.gen(function* () {
    const f = yield* fixture([
      { permission: "read", pattern: ".env", action: "deny" },
      { permission: "edit", pattern: ".env", action: "deny" },
      { permission: "read", pattern: "blocked-alias", action: "deny" },
    ])
    yield* f.filesystem.writeFileString(path.join(f.directory, ".env"), "harmless sentinel")
    yield* f.filesystem.writeFileString(path.join(f.directory, "permitted.txt"), "permitted")
    yield* f.filesystem.symlink(path.join(f.directory, ".env"), path.join(f.directory, "safe.txt"))
    yield* f.filesystem.symlink(path.join(f.directory, "permitted.txt"), path.join(f.directory, "blocked-alias"))
    for (const name of ["Read", "Write", "Edit", "MultiEdit", "NotebookEdit"]) {
      const input = (file: string) => name === "NotebookEdit" ? { notebook_path: file, new_source: "harmless" }
        : { file_path: file, content: "harmless" }
      refused(yield* f.decide(name, input("safe.txt")), "rule which prevents")
      expect(yield* f.decide(name, input("permitted.txt"))).toEqual({ allow: true })
    }
    refused(yield* f.decide("Read", { file_path: "blocked-alias" }), "rule which prevents")
    expect(yield* f.filesystem.readFileString(path.join(f.directory, ".env"))).toBe("harmless sentinel")
  }), { git: true })

  it.instance("external symlinks and new Write descendants cannot evade external_directory denial", () => Effect.gen(function* () {
    const f = yield* fixture()
    const outside = yield* f.filesystem.makeTempDirectoryScoped({ prefix: "native-gate-outside-" }).pipe(
      Effect.flatMap((directory) => f.filesystem.realPath(directory)),
    )
    yield* f.sessions.setPermission({ sessionID: f.session.id, permission: [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "external_directory", pattern: path.join(outside, "*").replaceAll("\\", "/"), action: "deny" },
    ] })
    yield* f.filesystem.writeFileString(path.join(outside, "sentinel.txt"), "outside sentinel")
    yield* Effect.promise(() => fs.symlink(outside, path.join(f.directory, "local-alias"), process.platform === "win32" ? "junction" : "dir"))
    refused(yield* f.decide("Read", { file_path: outside }), "rule which prevents")
    refused(yield* f.decide("Read", { file_path: path.join(outside, "sentinel.txt") }), "rule which prevents")
    refused(yield* f.decide("Read", { file_path: "local-alias" }), "rule which prevents")
    refused(yield* f.decide("Read", { file_path: "local-alias/sentinel.txt" }), "rule which prevents")
    refused(yield* f.decide("Write", { file_path: "local-alias/new/deep/file.txt", content: "harmless" }), "rule which prevents")
    expect(yield* f.decide("Write", { file_path: "permitted/new/deep/file.txt", content: "harmless" })).toEqual({ allow: true })
    expect(yield* f.filesystem.readFileString(path.join(outside, "sentinel.txt"))).toBe("outside sentinel")
  }), { git: true })

  it.instance("external permission requests preserve canonical roots and missing descendants through directory aliases", () => Effect.gen(function* () {
    const f = yield* fixture()
    const outside = yield* f.filesystem.makeTempDirectoryScoped({ prefix: "native-gate-request-" }).pipe(
      Effect.flatMap((directory) => f.filesystem.realPath(directory)),
    )
    yield* f.filesystem.writeFileString(path.join(outside, "sentinel.txt"), "outside sentinel")
    yield* Effect.promise(() => fs.symlink(outside, path.join(f.directory, "local-alias"), process.platform === "win32" ? "junction" : "dir"))
    yield* f.sessions.setPermission({ sessionID: f.session.id, permission: [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "external_directory", pattern: "*", action: "ask" },
    ] })
    const permission = yield* Permission.Service
    const physical = yield* f.filesystem.realPath(path.join(f.directory, "local-alias"))
    const expanded = process.platform === "win32" ? realpathSync.native(outside) : physical
    for (const call of [
      { name: "Read", file: "local-alias", physical, parent: physical, expanded },
      { name: "Read", file: "local-alias/sentinel.txt", physical: path.join(physical, "sentinel.txt"), parent: physical, expanded },
      { name: "Write", file: "local-alias/new/deep/file.txt", physical: path.join(physical, "new/deep/file.txt"), parent: path.join(physical, "new/deep"), expanded: path.join(expanded, "new/deep") },
    ]) {
      const pending = yield* Effect.forkScoped(f.decide(call.name, { file_path: call.file, content: "harmless" }))
      const request = yield* pollWithTimeout(permission.list().pipe(Effect.map((requests) => requests.find((request) => request.sessionID === f.session.id))), "external permission never asked")
      expect(request.permission).toBe("external_directory")
      expect(request.patterns).toEqual([...new Set([call.parent, call.expanded].map((parent) => path.join(parent, "*").replaceAll("\\", "/")))])
      expect(request.always).toEqual([path.join(call.parent, "*").replaceAll("\\", "/")])
      expect(request.metadata).toEqual({ filepath: call.physical, parentDir: call.parent })
      yield* permission.reply({ requestID: request.id, reply: "reject" })
      expect((yield* Fiber.join(pending)).allow).toBe(false)
    }
    expect(yield* f.decide("Write", { file_path: "permitted/new/deep/file.txt", content: "harmless" })).toEqual({ allow: true })
    expect(yield* f.filesystem.exists(path.join(outside, "new"))).toBe(false)
    expect(yield* f.filesystem.readFileString(path.join(outside, "sentinel.txt"))).toBe("outside sentinel")
  }), { git: true })

  const windows = process.platform === "win32" ? it.instance : it.instance.skip
  windows("external denies check opposite real Windows short/long spellings without widening grants", () => Effect.gen(function* () {
    const f = yield* fixture()
    const outside = yield* f.filesystem.makeTempDirectoryScoped({ prefix: "native gate real aliases-" })
    yield* f.filesystem.ensureDir(path.join(outside, "private directory"))
    const long = realpathSync.native(path.join(outside, "private directory"))
    yield* f.filesystem.writeFileString(path.join(long, "sentinel.txt"), "outside sentinel")
    // Probe the first uncontended 8.3 spelling, then prove its identity through the real filesystem.
    // A volume with short-name creation disabled does not prove this additional control.
    const short = path.join(path.dirname(long), "PRIVAT~1")
    const identity = yield* Effect.promise(() => fs.lstat(short, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    }))
    if (!identity) {
      console.info("Windows 8.3 opposite-spelling controls not exercised: volume did not create PRIVAT~1")
      return
    }
    const original = yield* Effect.promise(() => fs.lstat(long, { bigint: true }))
    expect(identity.ino).not.toBe(0n)
    expect(identity.ino).toBe(original.ino)
    expect(identity.dev).toBe(original.dev)
    expect(realpathSync.native(short)).toBe(long)
    expect(yield* f.filesystem.readFileString(path.join(short, "sentinel.txt"))).toBe("outside sentinel")
    console.info("Windows 8.3 permission control:", { short, long, effect: yield* f.filesystem.realPath(short), native: realpathSync.native(short) })
    yield* Effect.promise(() => fs.symlink(short, path.join(f.directory, "local-alias"), "junction"))
    yield* f.filesystem.ensureDir(`${long}-peer`)
    yield* f.filesystem.writeFileString(path.join(`${long}-peer`, "sentinel.txt"), "permitted peer")
    for (const pair of [{ denied: long, requested: short }, { denied: short, requested: long }]) {
      const rules: PermissionV1.Ruleset = [
        { permission: "*", pattern: "*", action: "allow" },
        { permission: "external_directory", pattern: path.join(pair.denied, "*").replaceAll("\\", "/"), action: "deny" },
      ]
      yield* f.sessions.setPermission({ sessionID: f.session.id, permission: rules })
      refused(yield* f.decide("Read", { file_path: pair.requested }), "rule which prevents")
      refused(yield* f.decide("Read", { file_path: path.join(pair.requested, "sentinel.txt") }), "rule which prevents")
      refused(yield* f.decide("Write", { file_path: path.join(pair.requested, "new/deep/file.txt"), content: "harmless" }), "rule which prevents")
      refused(yield* f.decide("Read", { file_path: "local-alias/sentinel.txt" }), "rule which prevents")
      expect(yield* f.decide("Read", { file_path: path.join(`${long}-peer`, "sentinel.txt") })).toEqual({ allow: true })
      expect(yield* f.decide("Write", { file_path: "permitted/new/deep/file.txt", content: "harmless" })).toEqual({ allow: true })
      expect((yield* f.sessions.get(f.session.id)).permission).toEqual([...rules])
    }
    expect(yield* f.filesystem.exists(path.join(long, "new"))).toBe(false)
    expect(yield* f.filesystem.readFileString(path.join(long, "sentinel.txt"))).toBe("outside sentinel")
  }), { git: true }, 60_000)

  windows("lexical junction denies keep direct peers permitted, including real short-junction requests", () => Effect.gen(function* () {
    const f = yield* fixture()
    const outside = yield* f.filesystem.makeTempDirectoryScoped({ prefix: "native gate junction aliases-" })
    yield* f.filesystem.ensureDir(path.join(outside, "permitted-peer"))
    const peer = realpathSync.native(path.join(outside, "permitted-peer"))
    yield* f.filesystem.writeFileString(path.join(peer, "sentinel.txt"), "permitted peer")
    const alias = path.join(outside, "blocked-alias")
    yield* Effect.promise(() => fs.symlink(peer, alias, "junction"))
    const shortAlias = path.join(realpathSync.native(outside), "BLOCKE~1")
    const junction = yield* Effect.promise(() => fs.lstat(alias, { bigint: true }))
    const alternate = yield* Effect.promise(() => fs.lstat(shortAlias, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    }))
    expect(junction.isSymbolicLink()).toBe(true)
    if (alternate) {
      expect(alternate.isSymbolicLink()).toBe(true)
      expect(alternate.ino).not.toBe(0n)
      expect(alternate.ino).toBe(junction.ino)
      expect(alternate.dev).toBe(junction.dev)
      expect(realpathSync.native(shortAlias)).toBe(peer)
    }
    if (!alternate) console.info("Windows short-junction wildcard control not exercised: volume did not create BLOCKE~1")
    for (const pattern of [path.join(outside, "blocked-*", "*"), path.join(alias, "*"),
      ...(alternate ? [path.join(shortAlias, "*")] : [])]) {
      yield* f.sessions.setPermission({ sessionID: f.session.id, permission: [
        { permission: "*", pattern: "*", action: "allow" },
        { permission: "external_directory", pattern: pattern.replaceAll("\\", "/"), action: "deny" },
      ] })
      for (const requested of [alias, ...(alternate ? [shortAlias] : [])]) {
        refused(yield* f.decide("Read", { file_path: requested }), "rule which prevents")
        refused(yield* f.decide("Read", { file_path: path.join(requested, "sentinel.txt") }), "rule which prevents")
        refused(yield* f.decide("Write", { file_path: path.join(requested, "new/deep/file.txt"), content: "harmless" }), "rule which prevents")
      }
      expect(yield* f.decide("Read", { file_path: peer })).toEqual({ allow: true })
      expect(yield* f.decide("Read", { file_path: path.join(peer, "sentinel.txt") })).toEqual({ allow: true })
      expect(yield* f.decide("Write", { file_path: path.join(peer, "new/deep/file.txt"), content: "harmless" })).toEqual({ allow: true })
    }
    expect(yield* f.filesystem.exists(path.join(peer, "new"))).toBe(false)
    expect(yield* f.filesystem.readFileString(path.join(peer, "sentinel.txt"))).toBe("permitted peer")
  }), { git: true }, 60_000)

  it.instance("new Write targets resolve existing directory aliases for edit patterns", () => Effect.gen(function* () {
    const f = yield* fixture([{ permission: "edit", pattern: "protected/*", action: "deny" }])
    yield* f.filesystem.ensureDir(path.join(f.directory, "protected"))
    yield* Effect.promise(() => fs.symlink(path.join(f.directory, "protected"), path.join(f.directory, "allowed-alias"), process.platform === "win32" ? "junction" : "dir"))
    refused(yield* f.decide("Write", { file_path: "allowed-alias/new/deep/file.txt", content: "harmless" }), "rule which prevents")
    expect(yield* f.decide("Write", { file_path: "permitted/new/deep/file.txt", content: "harmless" })).toEqual({ allow: true })
    refused(yield* f.decide("Read", { file_path: "permitted/missing.txt" }), "NotFound")
  }), { git: true })

  it.instance("native file checks keep ToolSafety physical write roots in force", () => Effect.gen(function* () {
    const f = yield* fixture([], "backend")
    yield* f.filesystem.ensureDir(path.join(f.directory, "docs"))
    yield* f.filesystem.ensureDir(path.join(f.directory, "src"))
    yield* f.sessions.setPermission({ sessionID: f.session.id, permission: yield* WriteRoots.bind("backend", ["docs"], [
      { permission: "*", pattern: "*", action: "allow" as const },
    ]).pipe(Effect.provideService(FileSystem.FileSystem, f.filesystem)) })
    expect(WriteRoots.read((yield* f.sessions.get(f.session.id)).permission)).toEqual([
      yield* f.filesystem.realPath(path.join(f.directory, "docs")),
    ])
    yield* Effect.promise(() => fs.symlink(path.join(f.directory, "src"), path.join(f.directory, "docs", "alias"), process.platform === "win32" ? "junction" : "dir"))
    refused(yield* f.decide("Write", { file_path: "docs/alias/new.txt", content: "harmless" }), "write-outside-physical-roots")
    refused(yield* f.decide("Write", { file_path: "docs-peer/new/deep/file.txt", content: "harmless" }), "write-outside-physical-roots")
    expect(yield* f.decide("Write", { file_path: "docs/permitted/new.txt", content: "harmless" })).toEqual({ allow: true })
  }), { git: true })

  it.instance("non-NotFound canonicalization failures deny instead of treating a target as new", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.filesystem.symlink(path.join(f.directory, "loop"), path.join(f.directory, "loop"))
    expect((yield* f.decide("Write", { file_path: "loop/new.txt", content: "harmless" })).allow).toBe(false)
    expect((yield* f.decide("Read", { file_path: "loop" })).allow).toBe(false)
    yield* f.filesystem.symlink(path.join(f.directory, "missing.txt"), path.join(f.directory, "dangling"))
    refused(yield* f.decide("Write", { file_path: "dangling", content: "harmless" }), "dangling symlink")
    expect(yield* f.decide("Write", { file_path: "new.txt", content: "harmless" })).toEqual({ allow: true })
  }), { git: true })

  shell("concurrent native Bash calls retain separate scopes and release only their own scratch", () => Effect.gen(function* () {
    const f = yield* fixture().pipe(Effect.provideService(ToolSafety.RuntimeProfile, {
      requireSandbox: true, sandbox: { enabled: true, scratch: true },
    }))
    const start = yield* Deferred.make<void>()
    const first = yield* Effect.forkScoped(Deferred.await(start).pipe(Effect.andThen(f.decide("Bash", { command: "printf '%s' \"$TMPDIR\"" }, "first"))))
    const second = yield* Effect.forkScoped(Deferred.await(start).pipe(Effect.andThen(f.decide("Bash", { command: "printf '%s' \"$TMPDIR\"" }, "second"))))
    yield* Deferred.succeed(start, undefined)
    const decisions = yield* Effect.all([Fiber.join(first), Fiber.join(second)])
    const processes = yield* AppProcess.Service
    const scratch = yield* Effect.forEach(decisions, (decision) => Effect.gen(function* () {
      expect(decision.allow).toBe(true)
      if (!decision.allow || typeof decision.input?.command !== "string") throw new Error("missing jailed Bash")
      expectSpawn(import.meta.path)
      const result = yield* processes.run(ChildProcess.make("/bin/sh", ["-c", decision.input.command], { cwd: f.directory }))
      expect(result.exitCode).toBe(0)
      return result.stdout.toString()
    }))
    expect(scratch[0]).not.toBe(scratch[1])
    yield* f.gate.release("first")
    expect(yield* f.filesystem.exists(scratch[0])).toBe(false)
    expect(yield* f.filesystem.exists(scratch[1])).toBe(true)
    yield* f.gate.close
    expect(yield* f.filesystem.exists(scratch[1])).toBe(false)
    yield* f.gate.release("second")
    const duplicate = yield* Effect.all(["a", "b"].map(() => f.gate.confine(f.actor, "echo permitted", "duplicate", undefined).pipe(Effect.exit)), { concurrency: "unbounded" })
    expect(duplicate.filter(Exit.isSuccess)).toHaveLength(1)
    expect(duplicate.filter(Exit.isFailure)).toHaveLength(1)
    yield* f.gate.release("duplicate")
  }), { git: true }, 60_000)
})
