import { describe, expect } from "bun:test"
import path from "path"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { Tool } from "../src/tool/tool"
import { ToolRegistry } from "../src/tool/registry"
import { ToolOutputStore } from "../src/tool-output-store"
import { Location } from "../src/location"
import { AbsolutePath } from "../src/schema"
import { SessionSchema } from "../src/session/schema"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { settleTool, toolIdentity } from "./lib/tool"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([ToolSafety.node, ToolRegistry.node, AppProcess.node, FSUtil.node]), [
  [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
]))
const invocation = { tool: "bash", args: {}, sessionID: "ses_safety", callID: "call_safety" }
const identity = { ...toolIdentity, sessionID: SessionSchema.ID.make("ses_safety") }

describe("native tool safety", () => {
  it.live("denied registry command has zero filesystem effect; near match executes real process", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
      const registry = yield* ToolRegistry.Service
      const fs = yield* FSUtil.Service
      const processes = yield* AppProcess.Service
      const shell = process.platform === "win32" ? process.env.COMSPEC ?? "cmd.exe" : "/bin/sh"
      yield* registry.register({ bash: Tool.make({
        description: "fixture shell",
        input: Schema.Struct({ command: Schema.String }),
        output: Schema.String,
        execute: (args) => processes.run(ChildProcess.make(args.command, [], { cwd: tmp.path, shell }), { combineOutput: true })
          .pipe(Effect.map((result) => result.stdout.toString()), Effect.mapError(() => new Tool.Failure({ message: "fixture process failed" }))),
      }) })
      const denied = yield* settleTool(registry, { ...identity, call: {
        type: "tool-call", name: "bash", id: "denied", input: { command: process.platform === "win32"
          ? "git commit --no-verify & type nul > denied" : "git commit --no-verify; touch denied" },
      } })
      expect(denied.result).toEqual({ type: "error", value: "Tool safety HOLD: known-gate-bypass\nHooks and verification gates cannot be skipped (`--no-verify`, `-n`, `HUSKY=0`, `--no-hooks`), so the command did not run. Fix what the hook reports and rerun without the bypass; words such as `-n` or `-json` in a `git commit` message also match, so reword them." })
      expect(yield* fs.exists(path.join(tmp.path, "denied"))).toBe(false)
      expect((yield* settleTool(registry, { ...identity, call: {
        type: "tool-call", name: "bash", id: "allowed", input: { command: process.platform === "win32"
          ? 'echo "--no-verify" & type nul > allowed' : "printf '%s' '--no-verify'; touch allowed" },
      } })).result.type).toBe("text")
      expect(yield* fs.stat(path.join(tmp.path, "allowed"))).toMatchObject({ type: "File" })
    }),
  )

  it.live("physical write roots reject symlink escape and patch move before writes", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
      const fs = yield* FSUtil.Service
      const registry = yield* ToolRegistry.Service
      yield* fs.makeDirectory(path.join(tmp.path, "owned"))
      yield* fs.makeDirectory(path.join(tmp.path, "outside"))
      yield* fs.symlink(path.join(tmp.path, "outside"), path.join(tmp.path, "owned", "escape"))
      yield* registry.register({ write: Tool.make({
        description: "fixture write",
        input: Schema.Struct({ filePath: Schema.String }),
        output: Schema.String,
        execute: (args) => fs.writeFileString(path.join(tmp.path, args.filePath), "written")
          .pipe(Effect.as("written"), Effect.mapError(() => new Tool.Failure({ message: "fixture write failed" }))),
      }) })
      const execute = (filePath: string) => settleTool(registry, { ...identity, call: {
        type: "tool-call", name: "write", id: filePath, input: { filePath },
      } }).pipe(
        Effect.provideService(Location.Service, location(Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }))),
        Effect.provideService(ToolSafety.RuntimeProfile, { writeRoots: ["owned"] }),
      )
      expect((yield* execute("owned/escape/blocked")).result).toEqual({ type: "error", value: "Tool safety HOLD: write-outside-physical-roots\nThe project's safety profile allows writes only inside its write roots and this path is outside them, so nothing was written. Write inside those roots, or ask the owner." })
      expect(yield* fs.exists(path.join(tmp.path, "outside", "blocked"))).toBe(false)
      expect((yield* execute("owned/allowed")).result.type).toBe("text")
      expect(yield* fs.readFileString(path.join(tmp.path, "owned", "allowed"))).toBe("written")
      const safety = yield* ToolSafety.Service
      expect((yield* Effect.flip(safety.before({ ...invocation, tool: "apply_patch", directory: tmp.path,
        projectID: "project", args: { patchText: "*** Begin Patch\n*** Update File: owned/allowed\n*** Move to: outside/moved\n@@\n-written\n+moved\n*** End Patch" },
      }).pipe(Effect.provideService(ToolSafety.RuntimeProfile, { writeRoots: ["owned"] })))).reason).toBe("write-outside-physical-roots")
    }),
  )

  it.live("corpus slices, missing transcript stats and explicit config authorization keep distinct outcomes", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
      const fs = yield* FSUtil.Service
      const safety = yield* ToolSafety.Service
      const registry = yield* ToolRegistry.Service
      yield* fs.writeFileString(path.join(tmp.path, "corpus"), "defensive source")
      yield* registry.register({ read: Tool.make({
        description: "fixture read",
        input: Schema.Struct({ filePath: Schema.String, limit: Schema.optional(Schema.Number) }),
        output: Schema.String,
        execute: (args) => fs.readFileString(path.join(tmp.path, args.filePath)).pipe(
          Effect.mapError(() => new Tool.Failure({ message: "fixture read failed" })),
        ),
      }) })
      const read = (limit?: number) => settleTool(registry, { ...identity, call: {
        type: "tool-call", name: "read", id: "read-corpus", input: { filePath: "corpus", limit },
      } }).pipe(
        Effect.provideService(Location.Service, location(Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }))),
        Effect.provideService(ToolSafety.RuntimeProfile, { corpusFiles: ["corpus"] }),
      )
      expect((yield* read()).result).toEqual({ type: "error", value: "Tool safety HOLD: defense-corpus-bulk-read\nThe project's safety profile allows this file to be read only in slices, so nothing was read. Pass `limit` as a whole number from 1 to 400 and page with `offset`." })
      expect((yield* read(40)).result).toEqual({ type: "text", value: "defensive source" })
      const check = (tool: string, args: unknown, profile: ToolSafety.Profile) => safety.before({
        ...invocation, tool, args, directory: tmp.path, projectID: "project",
      }).pipe(Effect.provideService(ToolSafety.RuntimeProfile, profile))
      expect((yield* Effect.flip(check("read", { filePath: "corpus" }, { corpusFiles: ["corpus"] }))).reason).toBe("defense-corpus-bulk-read")
      yield* check("read", { filePath: "corpus", limit: 40 }, { corpusFiles: ["corpus"] })
      expect((yield* Effect.flip(check("read", { filePath: "missing", limit: 40 }, { corpusFiles: ["missing"] }))).reason).toBe("corpus-stat-acquisition")
      expect((yield* Effect.flip(check("read", { filePath: "missing" }, { transcriptFiles: ["missing"] }))).reason).toBe("transcript-stat-acquisition")
      expect((yield* Effect.flip(check("write", { filePath: "opencode.json" }, { protectedWrites: ["opencode.json"] }))).reason).toBe("protected-instruction-or-config-write")
      yield* check("write", { filePath: "opencode.json" }, { protectedWrites: ["opencode.json"], allowedConfigEdits: ["opencode.json"] })
      // A root may be a file or a path not created yet; it resolves through its nearest existing ancestor.
      expect((yield* Effect.flip(check("write", { filePath: "owned/file" }, { writeRoots: ["missing-root"] }))).reason).toBe("write-outside-physical-roots")
      yield* check("write", { filePath: "missing-root/deep/new" }, { writeRoots: ["missing-root"] })
      yield* check("write", { filePath: "corpus" }, { writeRoots: ["corpus"] })
      expect((yield* Effect.flip(check("write", { filePath: "corpus-sibling" }, { writeRoots: ["corpus"] }))).reason).toBe("write-outside-physical-roots")
      expect((yield* Effect.flip(check("write", { filePath: "owned/file" }, { writeRoots: [] }))).reason).toBe("write-outside-physical-roots")
      expect((yield* Effect.flip(check("opaque_process", { command: "true" }, { requireSandbox: true }))).reason).toBe("required-process-sandbox-unbound")
    }),
  )

  it.live("actual success, failure and interruption emit bounded observations without arguments", () =>
    Effect.gen(function* () {
      const safety = yield* ToolSafety.Service
      const observations: ToolSafety.Observation[] = []
      const observe = (observation: ToolSafety.Observation) => Effect.sync(() => { observations.push(observation) })
      yield* safety.run(invocation, Effect.succeed("ok"), observe)
      yield* Effect.exit(safety.run(invocation, Effect.fail(new Error("private diagnostic")), observe))
      const ready = yield* Deferred.make<void>()
      const fiber = yield* safety.run(invocation, Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never)), observe).pipe(Effect.forkChild)
      yield* Deferred.await(ready)
      yield* Fiber.interrupt(fiber)
      expect(observations.map((item) => item.outcome)).toEqual(["started", "success", "started", "failure", "started", "cancelled"])
      expect(JSON.stringify(observations)).not.toContain("private diagnostic")
      expect(observations.every((item) => !("args" in item))).toBe(true)
    }),
  )

  it.live("recognized secret blocked before managed output retention, ordinary output survives", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      yield* registry.register({ output: Tool.make({
        description: "fixture output",
        input: Schema.String,
        output: Schema.String,
        execute: Effect.succeed,
      }) })
      const secret = "gh" + "p_" + "x".repeat(40)
      const result = yield* settleTool(registry, { ...identity, call: { type: "tool-call", name: "output", id: "secret", input: secret } })
      expect(result).toEqual({ result: { type: "error", value: "Tool safety HOLD: recognized-secret-output\nThe tool ran, but its output contained a credential-shaped value (a private key, or an AWS, GitHub, Stripe or OpenAI key), so the output was discarded. Do not print secrets or try to reveal them another way; to check that one is set, test it without printing its value." } })
      expect((yield* settleTool(registry, { ...identity, call: { type: "tool-call", name: "output", id: "plain", input: "ordinary output" } })).result.type).toBe("text")
    }),
  )
})
