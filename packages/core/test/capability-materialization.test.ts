import { describe, expect } from "bun:test"
import { createHash } from "crypto"
import { mkdir } from "fs/promises"
import path from "path"
import { Context, Deferred, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { RelayHookInstall } from "@orchestra/core/relay-hook-install"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetyProfile } from "@orchestra/core/tool-safety-profile"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(
  Layer.unwrap(
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      yield* Effect.promise(() => Promise.all(["work", "data"].map((name) => mkdir(path.join(tmp.path, name)))))
      const directory = AbsolutePath.make(path.join(tmp.path, "work"))
      return AppNodeBuilder.build(
        LayerNode.group([
          ApplicationTools.node,
          ToolRegistry.nativeNode,
          FSUtil.node,
          Global.node,
          Location.node,
          EventV2.node,
        ]),
        [
          [Global.node, Global.layerWith({ data: path.join(tmp.path, "data"), home: tmp.path })],
          [
            Location.node,
            Layer.succeed(
              Location.Service,
              Location.Service.of({
                directory,
                project: { id: Project.ID.make("materialization-project"), directory },
              }),
            ),
          ],
          [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
          [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
        ],
      )
    }),
  ),
)

const identity = {
  sessionID: SessionSchema.ID.make("ses_materialization"),
  agent: AgentV2.ID.make("general"),
  assistantMessageID: SessionMessage.ID.make("msg_materialization"),
}
const call = (name: string, text = name): ToolRegistry.ExecuteInput => ({
  ...identity,
  call: { type: "tool-call", id: `call-${name}`, name, input: { text } },
})
const make = () =>
  Tool.make({
    description: "Echo text",
    input: Schema.Struct({ text: Schema.String }),
    output: Schema.String,
    execute: ({ text }) => Effect.succeed(text),
  })

describe("captured capability materialization", () => {
  it.live("projects advertisement in registry order without widening whole-tool eligibility", () =>
    Effect.gen(function* () {
      const applications = yield* ApplicationTools.Service
      const registry = yield* ToolRegistry.Service
      yield* applications.register({ first: make(), hidden: make() })
      yield* registry.register({ first: make(), second: make(), write: Tool.withPermission(make(), "edit") })
      const rules = [{ action: "edit", resource: "*", effect: "deny" as const }]
      const full = yield* registry.materialize(rules)
      const projected = yield* registry.materialize(rules, {
        advertisedNames: ["second", "write", "missing", "first", "second"],
      })
      expect(full.definitions.map((tool) => tool.name)).toEqual(["first", "hidden", "second"])
      expect(projected.definitions.map((tool) => tool.name)).toEqual(["first", "second"])
      expect(projected.definition("hidden")).toBe(full.definition("hidden"))
      expect(projected.definition("first")).toBe(projected.definitions[0])
      expect(projected.definition("first")?.inputSchema).toBe(full.definition("first")?.inputSchema)
      expect(projected.definition("first")?.outputSchema).toBe(full.definition("first")?.outputSchema)
      expect(projected.definition("write")).toBeUndefined()
      expect(projected.definition("missing")).toBeUndefined()
      expect((yield* projected.settle(call("hidden"))).result).toEqual({ type: "text", value: "hidden" })
      expect((yield* projected.settle(call("write"))).result).toEqual({ type: "error", value: "Unknown tool: write" })
      const unrestricted = yield* registry.materialize()
      expect((yield* unrestricted.settle(call("write"))).result).toEqual({
        type: "text",
        value: "write",
      })
    }),
  )

  it.live("advertises none for an empty selection and preserves omitted options", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      yield* registry.register({ echo: make() })
      const full = yield* registry.materialize()
      const omitted = yield* registry.materialize(undefined, {})
      const empty = yield* registry.materialize(undefined, { advertisedNames: [] })
      const names = ["echo"]
      const selected = yield* registry.materialize(undefined, { advertisedNames: names })
      names.length = 0
      expect(omitted.definitions).toEqual(full.definitions)
      expect(empty.definitions).toEqual([])
      expect(empty.definition("echo")).toBe(full.definitions[0])
      expect(selected.definitions).toEqual(full.definitions)
      expect((yield* empty.settle(call("echo"))).result).toEqual({ type: "text", value: "echo" })
    }),
  )

  it.live("captures metadata once and rejects late additions and removed registrations", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const scope = yield* Scope.make()
      yield* registry.register({ echo: make() }).pipe(Scope.provide(scope))
      const captured = yield* registry.materialize(undefined, { advertisedNames: [] })
      const metadata = captured.definition("echo")
      expect(metadata?.name).toBe("echo")
      expect((yield* captured.settle(call("echo"))).result).toEqual({ type: "text", value: "echo" })
      yield* registry.register({ later: make() })
      expect(captured.definition("later")).toBeUndefined()
      expect((yield* captured.settle(call("later"))).result).toEqual({ type: "error", value: "Unknown tool: later" })
      const current = yield* registry.materialize()
      expect(current.definition("later")?.name).toBe("later")
      expect((yield* current.settle(call("later"))).result).toEqual({ type: "text", value: "later" })
      yield* Scope.close(scope, Exit.void)
      expect(captured.definition("echo")).toBe(metadata)
      expect((yield* captured.settle(call("echo"))).result).toEqual({ type: "error", value: "Stale tool call: echo" })
    }),
  )

  it.live("rejects same-scope replacement even when the canonical tool object is reused", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const echo = make()
      yield* registry.register({ echo, stable: make() })
      const captured = yield* registry.materialize(undefined, { advertisedNames: [] })
      yield* registry.register({ echo })
      const current = yield* registry.materialize()
      expect(current.definition("echo")).toBe(captured.definition("echo"))
      expect((yield* captured.settle(call("echo"))).result).toEqual({ type: "error", value: "Stale tool call: echo" })
      expect((yield* captured.settle(call("stable"))).result).toEqual({ type: "text", value: "stable" })
      expect((yield* current.settle(call("echo"))).result).toEqual({ type: "text", value: "echo" })
    }),
  )

  it.live("keeps application and Location overlay identities stale when prior registrations are revealed", () =>
    Effect.gen(function* () {
      const applications = yield* ApplicationTools.Service
      const registry = yield* ToolRegistry.Service
      yield* applications.register({ echo: make(), stable: make() })
      const application = yield* registry.materialize(undefined, { advertisedNames: [] })
      const localScope = yield* Scope.make()
      yield* registry.register({ echo: make() }).pipe(Scope.provide(localScope))
      const local = yield* registry.materialize(undefined, { advertisedNames: [] })
      expect((yield* application.settle(call("echo"))).result).toEqual({
        type: "error",
        value: "Stale tool call: echo",
      })
      const overlayScope = yield* Scope.make()
      yield* registry.register({ echo: make() }).pipe(Scope.provide(overlayScope))
      const overlay = yield* registry.materialize(undefined, { advertisedNames: [] })
      expect((yield* local.settle(call("echo"))).result).toEqual({ type: "error", value: "Stale tool call: echo" })
      yield* Scope.close(overlayScope, Exit.void)
      expect((yield* overlay.settle(call("echo"))).result).toEqual({ type: "error", value: "Stale tool call: echo" })
      expect((yield* local.settle(call("echo"))).result).toEqual({ type: "text", value: "echo" })
      yield* Scope.close(localScope, Exit.void)
      expect((yield* local.settle(call("echo"))).result).toEqual({ type: "error", value: "Stale tool call: echo" })
      expect((yield* application.settle(call("echo"))).result).toEqual({ type: "text", value: "echo" })
      expect((yield* overlay.settle(call("stable"))).result).toEqual({ type: "text", value: "stable" })
    }),
  )

  it.live("keeps in-flight hidden leaves and parallel invocation contexts independent", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const Issuer = Context.Reference<string>("materialization-test/Issuer", { defaultValue: () => "unbound" })
      const first = yield* Deferred.make<void>()
      const second = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const contexts: Tool.Context[] = []
      const scope = yield* Scope.make()
      yield* registry
        .register({
          echo: Tool.make({
            description: "Invocation-local issuer",
            input: Schema.Struct({ text: Schema.String }),
            output: Schema.String,
            execute: (_, context) =>
              Effect.gen(function* () {
                contexts.push(context)
                const issuer = yield* Issuer
                yield* Deferred.succeed(issuer === "first" ? first : second, undefined)
                yield* Deferred.await(release)
                return `${issuer}:${yield* Issuer}`
              }),
          }),
        })
        .pipe(Scope.provide(scope))
      const captured = yield* registry.materialize(undefined, { advertisedNames: [] })
      const firstInput = call("echo")
      const secondInput = {
        ...call("echo"),
        agent: AgentV2.ID.make("backend"),
        sessionID: SessionSchema.ID.make("ses_second"),
        assistantMessageID: SessionMessage.ID.make("msg_second"),
        call: { ...call("echo").call, id: "call-second" },
      }
      const a = yield* captured.settle(firstInput).pipe(Effect.provideService(Issuer, "first"), Effect.forkChild)
      const b = yield* captured.settle(secondInput).pipe(Effect.provideService(Issuer, "second"), Effect.forkChild)
      yield* Deferred.await(first)
      yield* Deferred.await(second)
      yield* Scope.close(scope, Exit.void)
      yield* registry.register({ echo: make() })
      expect((yield* captured.settle(call("echo"))).result).toEqual({ type: "error", value: "Stale tool call: echo" })
      yield* Deferred.succeed(release, undefined)
      expect((yield* Fiber.join(a)).result).toEqual({ type: "text", value: "first:first" })
      expect((yield* Fiber.join(b)).result).toEqual({ type: "text", value: "second:second" })
      expect(contexts).toContainEqual({ ...identity, toolCallID: firstInput.call.id })
      expect(contexts).toContainEqual({
        sessionID: secondInput.sessionID,
        agent: secondInput.agent,
        assistantMessageID: secondInput.assistantMessageID,
        toolCallID: secondInput.call.id,
      })
    }),
  )

  it.live("settles hidden leaves through real output retention, codecs and safety", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const fs = yield* FSUtil.Service
      yield* registry.register({ echo: make() })
      const captured = yield* registry.materialize(undefined, { advertisedNames: [] })
      const text = "x".repeat(ToolOutputStore.MAX_BYTES + 1)
      const bounded = yield* captured.settle(call("echo", text))
      expect(bounded.outputPaths).toHaveLength(1)
      expect(yield* fs.readFileString(bounded.outputPaths?.[0] ?? "missing-retained-output")).toBe(text)
      expect(bounded.result.type).toBe("text")
      if (bounded.result.type !== "text" || typeof bounded.result.value !== "string") throw new Error("Expected text")
      expect(bounded.result.value).toContain("Context pressure:")
      expect(Buffer.byteLength(bounded.result.value)).toBeLessThanOrEqual(ToolOutputStore.MAX_BYTES)
      expect(
        (yield* captured.settle({ ...call("echo"), call: { ...call("echo").call, input: { text: 1 } } })).result,
      ).toMatchObject({ type: "error", value: expect.stringContaining("Invalid tool input") })
      expect(
        (yield* captured.settle(call("echo", "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----")))
          .result,
      ).toMatchObject({ type: "error", value: expect.stringContaining("Tool safety HOLD: recognized-secret-output") })
    }),
  )

  it.live("preserves installed prompt and Session lifecycle hooks with no advertised tools", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const fs = yield* FSUtil.Service
      const global = yield* Global.Service
      const location = yield* Location.Service
      const stateDirectory = MaestroArsenal.stateDirectory(global.data, location.project.id)
      yield* fs.ensureDir(stateDirectory)
      const snapshot = {
        schema: "relay.hook.v1",
        name: "Block prompt",
        binding: "host-required",
        installed: false,
        nodes: [
          {
            id: "event",
            name: "Prompt",
            type: RelayHook.NodeType.trigger,
            position: [0, 0],
            parameters: { operation: "prompt", timing: "before" },
          },
          {
            id: "block",
            name: "Block",
            type: RelayHook.NodeType.block,
            position: [0, 0],
            parameters: { message: "Prompt held by installed hook" },
          },
        ],
        connections: [{ from: "event", port: 0, to: "block" }],
      }
      const snapshots = [
        snapshot,
        ...["session-start", "session-idle"].map((operation) => ({
          ...snapshot,
          name: `Record ${operation}`,
          nodes: snapshot.nodes.map((node) =>
            node.id === "event"
              ? { ...node, parameters: { operation, timing: "after" } }
              : { ...node, type: RelayHook.NodeType.record, parameters: { message: `Observed ${operation}` } },
          ),
        })),
      ]
      yield* Effect.forEach(snapshots, (snapshot) =>
        RelayHookInstall.install({
          data: global.data,
          projectID: location.project.id,
          document: snapshot.name,
          version: "v1",
          snapshot,
          principal: "user:test",
          sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
        }),
      )
      const loader = ToolSafetyProfile.makeLoader(fs, {
        directory: location.directory,
        stateDirectory,
        projectID: location.project.id,
      })
      const captured = yield* registry.materialize(undefined, { advertisedNames: [] })
      expect(captured.definitions).toEqual([])
      const event = { sessionID: identity.sessionID, agent: identity.agent }
      yield* registry
        .session({ ...event, operation: "session-start" })
        .pipe(Effect.provideService(ToolSafety.RuntimeProfileLoader, loader))
      const denied = yield* registry
        .session({ ...event, operation: "prompt", text: "hello" })
        .pipe(Effect.provideService(ToolSafety.RuntimeProfileLoader, loader), Effect.flip)
      expect(denied).toBeInstanceOf(ToolSafety.Denied)
      expect(denied.message).toContain("Prompt held by installed hook")
      yield* registry
        .session({ ...event, operation: "session-idle" })
        .pipe(Effect.provideService(ToolSafety.RuntimeProfileLoader, loader))
      const events = yield* EventV2.Service
      const decisions = yield* events.durable({ aggregateID: identity.sessionID }).pipe(
        Stream.filter((event) => event.type === RelayHook.Decided.type),
        Stream.map((event) => Schema.decodeUnknownSync(RelayHook.Decided.data)(event.data).trigger),
        Stream.take(3),
        Stream.runCollect,
        Effect.timeout("5 seconds"),
      )
      expect(decisions).toEqual(["session-start.after", "prompt.before", "session-idle.after"])
    }),
  )
})
