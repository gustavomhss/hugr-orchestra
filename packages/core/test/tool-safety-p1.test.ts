import { expect } from "bun:test"
import path from "path"
import { Cause, Effect, Exit, Layer, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { Config } from "../src/config"
import { EventV2 } from "../src/event"
import { Location } from "../src/location"
import { PermissionV2 } from "../src/permission"
import { AbsolutePath } from "../src/schema"
import { SessionSchema } from "../src/session/schema"
import { BashTool } from "../src/tool/bash"
import { ReadToolFileSystem } from "../src/tool/read-filesystem"
import { Tool } from "../src/tool/tool"
import { ToolRegistry } from "../src/tool/registry"
import { ToolOutputStore } from "../src/tool-output-store"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { OutputInspector } from "../src/output-inspector"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { toolIdentity, settleTool } from "./lib/tool"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([FSUtil.node, AppProcess.node, ToolSafety.node])))
const liveSandbox = ["darwin", "linux"].includes(process.platform) && (await Effect.runPromise(ToolSafetySandbox.available())) ? it.live : it.live.skip
const fixture = Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
const secret = "gh" + "p_" + "Q".repeat(40)
// Base64 keeps fixture JS quoting identical under both cmd.exe and POSIX shells.
const nodeCommand = (script: string) => `"${process.execPath}" -e "eval(Buffer.from('${Buffer.from(script).toString("base64")}','base64').toString())"`

it.live("raw process hook sees credentials after memory cap; unbound provider process remains unaffected", () =>
  Effect.gen(function* () {
    const processes = yield* AppProcess.Service
    const command = ChildProcess.make(process.execPath, ["-e", `process.stdout.write('ordinary\\n'.repeat(150000)+${JSON.stringify(secret)})`])
    const ordinary = yield* processes.run(command, { maxOutputBytes: 64 })
    expect(ordinary.exitCode).toBe(0)
    expect(ordinary.stdoutTruncated).toBe(true)
    const inspector = OutputInspector.make()
    const rejected = yield* Effect.flip(processes.run(command, { maxOutputBytes: 64, inspect: (chunk) => {
      const reason = inspector.push(chunk)
      if (reason) throw new ToolSafety.Denied({ reason })
    } }))
    expect(rejected.cause).toBeInstanceOf(ToolSafety.Denied)
    const split = OutputInspector.make()
    expect(split.push("ordinary "+secret.slice(0, 15))).toBeUndefined()
    expect(split.push(secret.slice(15)+"Q".repeat(10000)+" ")).toBe("recognized-secret-output")
    expect(split.push("safe")).toBe("recognized-secret-output")
    const near = OutputInspector.make()
    expect(near.push("AKIA"+"A".repeat(17)+" ")).toBeUndefined()
    expect(near.push("x"+secret+" ")).toBeUndefined()
    expect(near.finish()).toBeUndefined()
  }),
)

it.live("Core reader scans full acquired line before cropping, including chunk-crossing credential", () =>
  Effect.gen(function* () {
    const tmp = yield* fixture
    const fs = yield* FSUtil.Service
    const file = path.join(tmp.path, "large.txt")
    yield* fs.writeFileString(file, "ordinary "+"x".repeat(70000)+"\n")
    const control = yield* ReadToolFileSystem.read(fs, file, file, { limit: 1 })
    expect("type" in control && control.content.length < 3000).toBe(true)
    for (const prefix of [1980, 65520]) {
      yield* fs.writeFileString(file, "x".repeat(prefix)+" "+secret+"\n"+"ordinary\n".repeat(10000))
      const denied = yield* Effect.flip(ReadToolFileSystem.read(fs, file, file, { limit: 1 }))
      expect(denied).toBeInstanceOf(ToolSafety.Denied)
    }
  }),
)

it.live("real Core Bash denies post-capture credential; native outcomes classify exit, timeout and secret Error", () =>
  Effect.gen(function* () {
    const tmp = yield* fixture
    const active = location({ directory: AbsolutePath.make(tmp.path) })
    const sessionID = SessionSchema.ID.make(`ses_p1_${Date.now()}`)
    yield* Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const events = yield* EventV2.Service
      const run = (id: string, command: string, timeout?: number) => settleTool(registry, {
        sessionID, ...toolIdentity, call: { type: "tool-call", name: "bash", id, input: { command, timeout } },
      })
      expect((yield* run("ok", nodeCommand("process.stdout.write('ordinary')"))).output?.structured).toMatchObject({ exit: 0 })
      const script = `process.stdout.write('ordinary\\n'.repeat(150000)+${JSON.stringify(secret)})`
      const denied = yield* run("secret", nodeCommand(script))
      expect(denied.result.type).toBe("error")
      expect(denied.result).toEqual({ type: "error", value: "Tool safety HOLD: recognized-secret-output" })
      expect(denied.outputPaths).toBeUndefined()
      expect((yield* run("exit", nodeCommand("process.exit(17)"))).output?.structured).toMatchObject({ exit: 17 })
      expect((yield* run("timeout", nodeCommand("setTimeout(() => {}, 5000)"), 10)).output?.structured).toMatchObject({ timeout: true })
      yield* registry.register({ exploding: Tool.make({ description: "failing acquisition", input: Schema.Struct({}), output: Schema.String,
        execute: () => Effect.die(new Error(secret)),
      }) })
      const error = yield* settleTool(registry, { sessionID, ...toolIdentity,
        call: { type: "tool-call", name: "exploding", id: "error", input: {} },
      })
      expect(error.result).toEqual({ type: "error", value: "Tool safety HOLD: recognized-secret-output" })
      yield* registry.register({ cancelled: Tool.make({ description: "native interruption", input: Schema.Struct({}), output: Schema.String,
        execute: () => Effect.interrupt,
      }) })
      const cancelled = yield* Effect.exit(settleTool(registry, { sessionID, ...toolIdentity,
        call: { type: "tool-call", name: "cancelled", id: "cancel", input: {} },
      }))
      expect(Exit.isFailure(cancelled) && Cause.hasInterrupts(cancelled.cause)).toBe(true)
      const evidence = yield* Stream.runCollect(events.durable({ aggregateID: sessionID }).pipe(Stream.take(12))).pipe(Effect.timeout("3 seconds"))
      const decode = Schema.decodeUnknownSync(Schema.Struct({ structured: Schema.Struct({ toolSafety: Schema.Struct({ outcome: Schema.String }) }) }))
      expect(evidence.map((event) => decode(event.data).structured.toolSafety.outcome)).toEqual([
        "started", "success", "started", "held", "started", "failure", "started", "failure", "started", "held",
        "started", "cancelled",
      ])
      expect(JSON.stringify(evidence)).not.toContain(secret)
    }).pipe(Effect.provide(AppNodeBuilder.build(LayerNode.group([ToolRegistry.nativeNode, BashTool.node, EventV2.node]), [
      [Location.node, Layer.succeed(Location.Service, active)],
      [PermissionV2.node, Layer.mock(PermissionV2.Service, { assert: () => Effect.void })],
      [Config.node, Layer.mock(Config.Service, { entries: () => Effect.succeed([]) })],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ])))
  }),
)

it.live("secret Error messages sanitize failure and defects while preserving interruption", () =>
  Effect.gen(function* () {
    for (const effect of [Effect.fail(new Error(secret)), Effect.die(new Error(secret))]) {
      const exit = yield* Effect.exit(ToolSafety.sanitizeFailure(effect))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.pretty(exit.cause)).toContain("recognized-secret-output")
        expect(Cause.pretty(exit.cause)).not.toContain(secret)
      }
    }
    const interrupted = yield* Effect.exit(ToolSafety.sanitizeFailure(Effect.interrupt))
    expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true)
  }),
)

liveSandbox("LIVE sandbox relative policies stay project-bound when child cwd changes", () =>
  Effect.gen(function* () {
    const tmp = yield* fixture
    const fs = yield* FSUtil.Service
    const processes = yield* AppProcess.Service
    const owned = path.join(tmp.path, "owned")
    yield* fs.makeDirectory(owned)
    yield* fs.makeDirectory(path.join(owned, "owned"))
    yield* fs.writeFileString(path.join(tmp.path, "private"), "private-fixture")
    yield* fs.writeFileString(path.join(tmp.path, "instructions"), "original")
    const run = (cwd: string, command: string) => Effect.scoped(Effect.gen(function* () {
      const wrapped = yield* ToolSafetySandbox.wrap(ChildProcess.make("/bin/sh", ["-c", command], { cwd }))
      return yield* processes.run(wrapped, { timeout: "5 seconds", maxOutputBytes: 1024, maxErrorBytes: 1024 })
    })).pipe(Effect.provideService(ToolSafety.NativeContext, { directory: tmp.path, projectID: "project" }),
      Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: ["owned"], neverTouch: ["private"], protectedWrites: ["instructions"] }))
    expect((yield* processes.run(ChildProcess.make("/bin/sh", ["-c", "cat ../private"], { cwd: owned }))).stdout.toString()).toBe("private-fixture")
    expect((yield* run(tmp.path, "cat private")).exitCode).not.toBe(0)
    const denied = yield* run(owned, "cat ../private")
    expect(denied.exitCode).not.toBe(0)
    expect(denied.stdout.toString()).not.toContain("private-fixture")
    expect((yield* run(owned, "touch allowed")).exitCode).toBe(0)
    expect(yield* fs.exists(path.join(owned, "allowed"))).toBe(true)
    expect((yield* run(owned, "touch ../escaped")).exitCode).not.toBe(0)
    expect(yield* fs.exists(path.join(tmp.path, "escaped"))).toBe(false)
    const protect = (cwd: string) => Effect.scoped(Effect.gen(function* () {
      const wrapped = yield* ToolSafetySandbox.wrap(ChildProcess.make("/bin/sh", ["-c", `printf changed > '${tmp.path}/instructions'`], { cwd }))
      return yield* processes.run(wrapped)
    })).pipe(Effect.provideService(ToolSafety.NativeContext, { directory: tmp.path }),
      Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: ["."], protectedWrites: ["instructions"] }))
    expect((yield* protect(tmp.path)).exitCode).not.toBe(0)
    expect((yield* protect(owned)).exitCode).not.toBe(0)
    expect(yield* fs.readFileString(path.join(tmp.path, "instructions"))).toBe("original")
  }),
)
