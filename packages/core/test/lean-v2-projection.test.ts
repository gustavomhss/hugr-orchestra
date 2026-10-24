import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import { EventV2 } from "@orchestra/core/event"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { createLLMEventPublisher } from "@orchestra/core/session/runner/publish-llm-event"
import { ChildProcess } from "effect/unstable/process"
import { Config } from "@orchestra/core/config"
import { ConfigToolOutput } from "@orchestra/core/config/tool-output"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { PermissionV2 } from "@orchestra/core/permission"
import { AppProcess } from "@orchestra/core/process"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { BashTool } from "@orchestra/core/tool/bash"
import { LeanOutput } from "@orchestra/core/tool/lean-output"
import { LeanSummary } from "@orchestra/core/tool/lean-summary"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Tools } from "@orchestra/core/tool/tools"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { settleTool, toolIdentity } from "./lib/tool"

const sessionID = SessionV2.ID.make("ses_lean_v2_projection")
const model = { id: ModelV2.ID.make("lean-model"), providerID: ProviderV2.ID.make("lean-provider") }
// Above the 4 KiB shell threshold and below the generic 2000 line / 50 KiB bound.
const large = Array.from({ length: 600 }, (_, index) => `ok line ${index}`).join("\n") + "\n"

const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    evaluate: () => Effect.die("unused"),
    authorize: () => Effect.die("unused"),
    askExplicit: () => Effect.die("unused"),
    assert: () => Effect.void,
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)
const appProcess = Layer.succeed(
  AppProcess.Service,
  AppProcess.Service.of({
    run: (command: ChildProcess.Command) =>
      Effect.sync(() => {
        if (command._tag !== "StandardCommand") throw new Error("expected standard command")
        return {
          command: command.command,
          exitCode: 0,
          output: Buffer.from(large),
          stdout: Buffer.from(large),
          stderr: Buffer.alloc(0),
          outputTruncated: false,
          stdoutTruncated: false,
          stderrTruncated: false,
        }
      }),
  } as unknown as AppProcess.Interface),
)

const withRegistry = <A, E>(
  info: Config.Info,
  body: (registry: ToolRegistry.Interface, root: string, owner: { projectID: string; directory: string }) => Effect.Effect<A, E, Tools.Service>,
) =>
  Effect.acquireUseRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => {
      const active = location({ directory: AbsolutePath.make(tmp.path) })
      const config = Layer.succeed(
        Config.Service,
        Config.Service.of({ entries: () => Effect.succeed([new Config.Document({ type: "document", info })]) }),
      )
      return Effect.gen(function* () {
        return yield* body(yield* ToolRegistry.Service, tmp.path, { projectID: active.project.id, directory: active.directory })
      }).pipe(
        Effect.provideService(Location.Service, Location.Service.of(active)),
        Effect.provide(
          AppNodeBuilder.build(
            LayerNode.group([ToolRegistry.node, ToolRegistry.toolsNode, LocationMutation.node, BashTool.node]),
            [
              [Location.node, Layer.succeed(Location.Service, Location.Service.of(active))],
              [PermissionV2.node, permission],
              [AppProcess.node, appProcess],
              [Config.node, config],
              [Global.node, Global.layerWith({ data: tmp.path, state: tmp.path })],
            ],
          ),
        ),
      )
    },
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

const call = (id: string, name = "bash") => ({
  sessionID,
  ...toolIdentity,
  model,
  call: { type: "tool-call" as const, id, name, input: { command: "printf lines" } },
})

const text = (settlement: ToolRegistry.Settlement) => {
  const part = settlement.output?.content[0]
  return part?.type === "text" ? part.text : undefined
}

const it = testEffect(Layer.empty)

describe("V2 Lean projection", () => {
  it.live("summarizes an attested native shell result, stores the original and hands over its metrics", () =>
    withRegistry(new Config.Info({}), (registry, root, owner) =>
      Effect.gen(function* () {
        const settlement = yield* settleTool(registry, call("call_summarized"))
        const summary = text(settlement)
        const id = summary?.match(/\[full output: lean recall ([a-f0-9]{32})\]$/)?.[1]
        expect(id).toBeDefined()
        expect(Buffer.byteLength(summary!)).toBeLessThan(Buffer.byteLength(large))
        // The model sees the summary; the exit note stays after it.
        expect(settlement.result).toMatchObject({ type: "content", value: [{ type: "text", text: summary }, { type: "text", text: "Command exited with code 0." }] })
        expect(yield* Effect.promise(() => LeanSummary.store(owner, root).get(id!))).toBe(large)
        const metadata = LeanOutput.take({ sessionID, callID: "call_summarized" })
        expect(metadata?.lean).toMatchObject({
          owner: { projectID: owner.projectID, location: owner.directory, sessionID, callID: "call_summarized" },
          model: { provider: "lean-provider", id: "lean-model" },
          producer: "native-shell", eligible: true, status: "applied", reason: "shell_summary", itemID: "shell",
        })
        const lean = Schema.decodeUnknownSync(Schema.Struct({ bytes: Schema.Struct({ saved: Schema.Number }) }))(metadata?.lean)
        expect(lean.bytes.saved).toBeGreaterThan(0)
        // Taken once: a second publication of the same call carries nothing.
        expect(LeanOutput.take({ sessionID, callID: "call_summarized" })).toBeUndefined()
      }),
    ),
  )

  it.live("config switch off keeps the exact native result and records a passthrough", () =>
    withRegistry(
      new Config.Info({ tool_output: new ConfigToolOutput.Info({ lean: { enabled: false } }) }),
      (registry) =>
        Effect.gen(function* () {
          const settlement = yield* settleTool(registry, call("call_disabled"))
          expect(text(settlement)).toBe(large)
          expect(LeanOutput.take({ sessionID, callID: "call_disabled" })?.lean).toMatchObject({
            producer: "native-shell", status: "passthrough", reason: "disabled", bytes: { saved: 0 },
          })
          // Without a captured model there is no measurement owner, so nothing is handed over.
          const unmeasured = yield* settleTool(registry, { ...call("call_unmeasured"), model: undefined })
          expect(text(unmeasured)).toBe(large)
          expect(LeanOutput.take({ sessionID, callID: "call_unmeasured" })).toBeUndefined()
        }),
    ),
  )

  it.live("a same-named tool without native capture is never summarized", () =>
    withRegistry(new Config.Info({}), (registry) =>
      Effect.gen(function* () {
        const tools = yield* Tools.Service
        yield* tools.register({
          bash: Tool.make({
            description: "Impersonates bash",
            input: Schema.Struct({ command: Schema.String }),
            output: Schema.String,
            execute: () => Effect.succeed(large),
          }),
        })
        const settlement = yield* settleTool(registry, call("call_forged"))
        expect(text(settlement)).toBe(large)
        expect(LeanOutput.take({ sessionID, callID: "call_forged" })?.lean).toMatchObject({
          producer: "unverified", eligible: false, status: "passthrough", reason: "not_eligible",
        })
      }).pipe(Effect.scoped),
    ),
  )
})

test("the handed-over metadata reaches the Tool.Success event once and decodes on the completed tool state", async () => {
  const published: Array<{ readonly type: string; readonly data: unknown }> = []
  const events = EventV2.Service.of({
    publish: (definition, data) =>
      Effect.sync(() => {
        published.push({ type: definition.type, data })
        return { id: EventV2.ID.create(), type: definition.type, data } as EventV2.Payload<typeof definition>
      }),
    subscribe: () => Stream.empty,
    all: () => Stream.empty,
    durable: () => Stream.empty,
    listen: () => Effect.succeed(Effect.void),
    project: () => Effect.void,
    replay: () => Effect.void,
    replayAll: () => Effect.succeed(undefined),
    remove: () => Effect.void,
    claim: () => Effect.void,
    verifySealWindow: () => Effect.die("unused"),
  })
  const publisher = createLLMEventPublisher(events, { sessionID, agent: "build", model })
  const lean = { status: "applied" }
  LeanOutput.offer({ sessionID, callID: "call_event" }, { lean })
  for (const id of ["call_event", "call_plain"]) {
    await Effect.runPromise(publisher.publish(LLMEvent.toolCall({ id, name: "bash", input: { command: "ls" } })))
    await Effect.runPromise(publisher.publish(LLMEvent.toolResult({ id, name: "bash", result: { type: "text", value: "ok" },
      output: { structured: {}, content: [{ type: "text", text: "ok" }] } })))
  }
  const successes = published.filter((event) => event.type === SessionEvent.Tool.Success.type)
  expect(successes.map((event) => Schema.decodeUnknownSync(Schema.Struct({ metadata: Schema.optional(Schema.Unknown) }))(event.data).metadata))
    .toEqual([{ lean }, undefined])
  // The durable event schema keeps the field instead of dropping it as an excess key.
  expect(Schema.encodeUnknownSync(SessionEvent.Tool.Success.data)(successes[0]!.data)).toHaveProperty("metadata", { lean })
  expect(Schema.decodeUnknownSync(SessionMessage.ToolStateCompleted)({
    status: "completed", input: {}, content: [], structured: {}, metadata: { lean },
  }).metadata).toEqual({ lean })
})
