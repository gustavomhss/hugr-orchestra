import { expect } from "bun:test"
import { DateTime, Effect, Layer } from "effect"
import { LLMEvent, Usage } from "@opencode-ai/llm"
import { EventV2 } from "@opencode-ai/core/event"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { createLLMEventPublisher } from "@opencode-ai/core/session/runner/publish-llm-event"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { InstanceRef } from "@/effect/instance-ref"
import { Session } from "@/session/session"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { Global } from "@opencode-ai/core/global"
import { tmpdir } from "../fixture/fixture"
import { prepareArsenalSDK } from "./arsenal-fixture"
import { Service } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { MessageID } from "@/session/schema"
import { MaestroArsenal } from "@opencode-ai/core/tool/maestro-arsenal"
import { Schema } from "effect"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

it.live("failed or unreported provider usage cannot certify settled-prefix spend; ordinary current Session coverage stays visible", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
    await prepareArsenalSDK(tmp.path, Global.Path.config)
    await AppRuntime.runPromise(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      return yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "maestro" })
        const events = yield* EventV2.Service
        const observations = yield* ArsenalObservations.Service
        const input = { sessionID: session.id, operation: "status" as const, placement: { directory: tmp.path, projectID: session.projectID } }
        expect(yield* observations.read(input)).toMatchObject({ coverage: { scope: "settled-prefix", usageComplete: false, reasons: ["USAGE_MISSING"] } })
        const model = ModelV2.Ref.make({ providerID: ProviderV2.ID.make("requesty"), id: ModelV2.ID.make("xai/grok-4") })
        const first = createLLMEventPublisher(events, { sessionID: session.id, agent: "maestro", model })
        const messageID = yield* first.startAssistant()
        yield* first.publish(LLMEvent.stepFinish({ index: 0, reason: "stop", usage: new Usage({ inputTokens: 3, nonCachedInputTokens: 3, outputTokens: 2, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 }) }))
        const settled = first.stepSettlement()
        if (!settled) throw new Error("Real publisher settlement missing")
        expect(settled.usageKnown).toBe(true)
        yield* events.publish(SessionEvent.Step.Ended, { sessionID: session.id, assistantMessageID: messageID, timestamp: yield* DateTime.now, finish: settled.finish, tokens: settled.tokens, usageKnown: settled.usageKnown, cost: 0 })
        expect(yield* observations.read(input)).toMatchObject({ coverage: { usageComplete: true, settledUsageSteps: 1 } })
        const failed = createLLMEventPublisher(events, { sessionID: session.id, agent: "maestro", model })
        yield* failed.startAssistant()
        yield* failed.failAssistant("actual failed provider turn")
        expect(yield* observations.read(input)).toMatchObject({ coverage: { usageComplete: false, providerSteps: 2, settledUsageSteps: 1, reasons: ["USAGE_PROVIDER_STEP_FAILED"] } })
        const missing = createLLMEventPublisher(events, { sessionID: session.id, agent: "maestro", model })
        const missingID = yield* missing.startAssistant()
        yield* missing.publish(LLMEvent.stepFinish({ index: 0, reason: "stop" }))
        const unknown = missing.stepSettlement()
        if (!unknown) throw new Error("Missing-usage settlement missing")
        expect(unknown.usageKnown).toBe(false)
        yield* events.publish(SessionEvent.Step.Ended, { sessionID: session.id, assistantMessageID: missingID, timestamp: yield* DateTime.now, finish: unknown.finish, tokens: unknown.tokens, usageKnown: unknown.usageKnown, cost: 0 })
        expect(yield* observations.read(input)).toMatchObject({ coverage: { usageComplete: false, providerSteps: 3, settledUsageSteps: 1, reasons: ["USAGE_PROVIDER_COUNTS_UNAVAILABLE", "USAGE_PROVIDER_STEP_FAILED"] }, observations: { usage: [{ input: 3, output: 2 }] } })
        const registry = yield* Service
        const definitions = yield* registry.all()
        const describe = definitions.find((item) => item.id === MaestroArsenal.names.describe)
        const execute = definitions.find((item) => item.id === MaestroArsenal.names.execute)
        if (!describe || !execute) throw new Error("Native governance tools missing")
        const agents = yield* Agent.Service
        const actor = yield* agents.get("maestro")
        const permission = yield* Permission.Service
        const context: Tool.Context = { sessionID: session.id, messageID: MessageID.ascending(), agent: "maestro", callID: "usage-coverage", abort: new AbortController().signal, messages: [], metadata: () => Effect.void, ask: (request) => permission.ask({ ...request, sessionID: session.id, ruleset: actor.permission }).pipe(Effect.orDie) }
        yield* describe.execute({ name: "governance" }, context)
        const result = yield* execute.execute({ name: "governance", arguments: { operation: "status" } }, context)
        const envelope = Schema.decodeUnknownSync(Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) }))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.output))
        expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(envelope.content[0].text)).toMatchObject({ coverage: { usageComplete: false, scope: "settled-prefix" }, usage: { status: "HOLD", costUSD: null, scope: "settled-prefix" } })
        const historical = yield* sessions.create({ agent: "maestro" })
        const old = createLLMEventPublisher(events, { sessionID: historical.id, agent: "maestro", model })
        const oldID = yield* old.startAssistant()
        yield* old.publish(LLMEvent.stepFinish({ index: 0, reason: "stop", usage: new Usage({ inputTokens: 3, nonCachedInputTokens: 3, outputTokens: 2, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 }) }))
        const measured = old.stepSettlement()
        if (!measured) throw new Error("Actual historical-control settlement missing")
        expect(measured.usageKnown).toBe(true)
        // Historical wire data omitted availability; measured counts alone cannot mint it retroactively.
        yield* events.publish(SessionEvent.Step.Ended, { sessionID: historical.id, assistantMessageID: oldID, timestamp: yield* DateTime.now, finish: measured.finish, tokens: measured.tokens, cost: 0 })
        expect(yield* observations.read({ ...input, sessionID: historical.id })).toMatchObject({ coverage: { usageComplete: false, historyComplete: false, settledUsageSteps: 0, reasons: ["USAGE_AVAILABILITY_NOT_CAPTURED", "USAGE_MISSING"] } })
        const historyContext = { ...context, sessionID: historical.id, messageID: MessageID.make(oldID), callID: "historical-coverage" }
        yield* describe.execute({ name: "governance" }, historyContext)
        const held = yield* execute.execute({ name: "governance", arguments: { operation: "status" } }, historyContext)
        const oldEnvelope = Schema.decodeUnknownSync(Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) }))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(held.output))
        expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(oldEnvelope.content[0].text)).toMatchObject({ coverage: { usageComplete: false, historyComplete: false }, usage: { status: "HOLD", costUSD: null } })

      }).pipe(Effect.provideService(InstanceRef, instance))
    }))
  }),
  90000,
)
