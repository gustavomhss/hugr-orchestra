import { expect } from "bun:test"
import path from "node:path"
import { DateTime, Effect, Layer, Schema } from "effect"
import { LLMEvent, Usage } from "@orchestra/llm"
import { EventTable } from "@orchestra/core/event/sql"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { AgentV2 } from "@orchestra/core/agent"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionEvent } from "@orchestra/core/session/event"
import { createLLMEventPublisher } from "@orchestra/core/session/runner/publish-llm-event"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionMessage } from "@orchestra/core/session/message"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { FSUtil } from "@orchestra/core/fs-util"
import { Flag } from "@orchestra/core/flag/flag"
import { Option } from "effect"
import { Permission } from "@/permission"
import { MessageID, PartID } from "@/session/schema"
import { Tool } from "@/tool/tool"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { Snapshot } from "@/snapshot"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { Agent } from "@/agent/agent"
import { Service } from "@/tool/registry"
import { and, eq } from "drizzle-orm"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

it.live(
  "production default registers V1 and V2 Arsenal; real read outcomes feed governed Session audit and priced usage",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
      await Bun.write(path.join(tmp.path, "observed.txt"), "actual native read\n")
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const instance = yield* instances.load({ directory: tmp.path })
          const applications = yield* ApplicationTools.Service
          expect(
            [...applications.entries().keys()]
              .filter((name) => Object.values(MaestroArsenal.names).some((native) => native === name))
              .sort(),
          ).toEqual(Object.values(MaestroArsenal.names).sort())
          const sessions = yield* Session.Service
          const session = yield* sessions
            .create({ title: "native Arsenal bridge", agent: "maestro" })
            .pipe(Effect.provideService(InstanceRef, instance))
          const store = yield* SessionStore.Service
          const projected = yield* store.get(session.id)
          if (!projected) throw new Error("actual Session projection missing")
          const locations = yield* LocationServiceMap.Service
          const database = yield* Database.Service
          const events = yield* EventV2.Service
          const snapshot = yield* Snapshot.Service
          const revision = yield* snapshot.track().pipe(Effect.provideService(InstanceRef, instance))
          expect(revision).toMatch(/^[a-f0-9]{40}$/)
          const publisher = createLLMEventPublisher(events, {
            sessionID: session.id,
            agent: "maestro",
            snapshot: revision,
            model: ModelV2.Ref.make({ providerID: ProviderV2.ID.make("requesty"), id: ModelV2.ID.make("xai/grok-4") }),
          })
          const readCall = LLMEvent.toolCall({ id: "read-recorded", name: "read", input: { path: "observed.txt" } })
          yield* publisher.publish(readCall)
          const started = yield* database.db
            .select()
            .from(EventTable)
            .where(
              and(
                eq(EventTable.aggregate_id, session.id),
                eq(EventTable.type, EventV2.versionedType(SessionEvent.Step.Started.type, 1)),
              ),
            )
            .get()
            .pipe(Effect.orDie)
          if (!started) throw new Error("native step event missing")
          const step = Schema.decodeUnknownSync(SessionEvent.Step.Started.data)(started.data)
          const observed = yield* Effect.gen(function* () {
            const registry = yield* ToolRegistry.Service
            return yield* registry.materialize().pipe(
              Effect.flatMap((materialized) =>
                materialized.settle({
                  sessionID: session.id,
                  agent: AgentV2.ID.make("maestro"),
                  assistantMessageID: step.assistantMessageID,
                  call: { type: "tool-call", id: readCall.id, name: readCall.name, input: readCall.input },
                }),
              ),
            )
          }).pipe(Effect.provide(locations.get(projected.location)))
          expect(observed.result).toMatchObject({
            type: "json",
            value: { content: "actual native read\n", encoding: "utf8" },
          })
          yield* publisher.publish(
            LLMEvent.toolResult({
              id: readCall.id,
              name: readCall.name,
              result: observed.result,
              output: observed.output,
            }),
          )
          yield* publisher.publish(
            LLMEvent.stepFinish({
              index: 0,
              reason: "tool-calls",
              usage: new Usage({
                inputTokens: 19,
                nonCachedInputTokens: 13,
                outputTokens: 11,
                reasoningTokens: 3,
                cacheReadInputTokens: 4,
                cacheWriteInputTokens: 2,
              }),
            }),
          )
          const settlement = publisher.stepSettlement()
          if (!settlement) throw new Error("actual usage settlement missing")
          expect(settlement.usageKnown).toBe(true)
          yield* events.publish(SessionEvent.Step.Ended, {
            sessionID: session.id,
            timestamp: yield* DateTime.now,
            assistantMessageID: step.assistantMessageID,
            finish: settlement.finish,
            tokens: settlement.tokens,
            usageKnown: settlement.usageKnown,
            snapshot: revision,
            // The existing V2 runner currently records zero cost; the observer must use known rates instead.
            cost: 0,
          })
          const result = yield* Effect.gen(function* () {
            const registry = yield* ToolRegistry.Service
            const materialized = yield* registry.materialize()
            const invoke = (name: string, input: unknown) =>
              materialized.settle({
                sessionID: session.id,
                agent: AgentV2.ID.make("maestro"),
                assistantMessageID: step.assistantMessageID,
                call: { type: "tool-call", id: `governance-${name}`, name, input },
              })
            const description = yield* invoke(MaestroArsenal.names.describe, { name: "governance" })
            expect(description.result).toMatchObject({ type: "text" })
            return yield* invoke(MaestroArsenal.names.execute, {
              name: "governance",
              arguments: { operation: "status", observations: { complete: false }, prices: [] },
            })
          }).pipe(Effect.provide(locations.get(projected.location)))
          expect(result.result).toMatchObject({ type: "text" })
          const envelope = Schema.decodeUnknownSync(
            Schema.Struct({
              content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })),
            }),
          )(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.output?.structured))
          const report = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(envelope.content[0].text)
          expect(report).toMatchObject({
            audit: {
              actions: [
                {
                  tool: "read",
                  outcome: "succeeded",
                  provenance: { sessionID: session.id, projectID: session.projectID, revision },
                },
                { tool: MaestroArsenal.names.describe, outcome: "succeeded" },
              ],
            },
            usage: { status: "KNOWN", totalTokens: 30 },
            source: "host-session-observations",
          })
          const legacyAgents = yield* Agent.Service
          const legacy = yield* Service
          const maestro = yield* legacyAgents.get("maestro").pipe(Effect.provideService(InstanceRef, instance))
          const definitions = yield* legacy
            .tools({
              agent: maestro,
              providerID: ProviderV2.ID.make("requesty"),
              modelID: ModelV2.ID.make("xai/grok-4"),
            })
            .pipe(Effect.provideService(InstanceRef, instance))
          expect(
            definitions.filter((definition) =>
              Object.values(MaestroArsenal.names).some((name) => name === definition.id),
            ),
          ).toHaveLength(3)
          const observations = yield* ArsenalObservations.Service
          const actual = yield* observations.read({
            sessionID: session.id,
            operation: "usage",
            placement: { directory: tmp.path, projectID: session.projectID },
          })
          expect(actual.observations).toMatchObject({ usage: [{ input: 13, output: 11, cacheRead: 4, cacheWrite: 2 }] })
          const prices = Schema.decodeUnknownSync(
            Schema.Array(
              Schema.Struct({
                input: Schema.Number,
                output: Schema.Number,
                cacheRead: Schema.Number,
                cacheWrite: Schema.Number,
                source: Schema.String,
                asOf: Schema.String,
              }),
            ),
          )(actual.prices)
          expect(prices[0]).toMatchObject({ input: 3, output: 15, cacheRead: 0.75, cacheWrite: 3 })
          expect(prices[0].source).toMatch(/^models-dev:local-file#sha256=[a-f0-9]{64}$/)
          const fs = yield* FSUtil.Service
          const stamp = yield* fs.stat(Schema.decodeUnknownSync(Schema.String)(Flag.ORCHESTRA_MODELS_PATH))
          expect(prices[0].asOf).toBe(Option.getOrThrow(stamp.mtime).toISOString())
        }),
      )
    }),
)

it.live(
  "legacy native execution uses durable step/tool projections; fabricated safety metadata cannot mint provenance",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true })
      await Bun.write(path.join(tmp.path, "legacy.txt"), "legacy actual read\n")
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const instance = yield* instances.load({ directory: tmp.path })
          return yield* Effect.gen(function* () {
            const sessions = yield* Session.Service
            const agents = yield* Agent.Service
            const permission = yield* Permission.Service
            const registry = yield* Service
            const snapshot = yield* Snapshot.Service
            const session = yield* sessions.create({ title: "legacy observations", agent: "maestro" })
            const agent = yield* agents.get("maestro")
            const user = yield* sessions.updateMessage({
              id: MessageID.ascending(),
              role: "user",
              sessionID: session.id,
              agent: "maestro",
              model: { providerID: ProviderV2.ID.make("requesty"), modelID: ModelV2.ID.make("xai/grok-4") },
              time: { created: Date.now() },
            })
            const assistant = yield* sessions.updateMessage({
              id: MessageID.ascending(),
              role: "assistant",
              sessionID: session.id,
              parentID: user.id,
              mode: "maestro",
              agent: "maestro",
              providerID: ProviderV2.ID.make("requesty"),
              modelID: ModelV2.ID.make("xai/grok-4"),
              path: { cwd: tmp.path, root: tmp.path },
              cost: 0,
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              time: { created: Date.now() },
            })
            const revision = yield* snapshot.track()
            expect(revision).toMatch(/^[a-f0-9]{40}$/)
            yield* sessions.updatePart({
              id: PartID.ascending(),
              type: "step-start",
              messageID: assistant.id,
              sessionID: session.id,
              snapshot: revision,
            })
            const running = {
              id: PartID.ascending(),
              type: "tool" as const,
              sessionID: session.id,
              messageID: assistant.id,
              callID: "legacy-read",
              tool: "read",
              state: {
                status: "running" as const,
                input: { filePath: path.join(tmp.path, "legacy.txt") },
                time: { start: Date.now() },
              },
            }
            yield* sessions.updatePart(running)
            const definitions = yield* registry.tools({
              agent,
              providerID: assistant.providerID,
              modelID: assistant.modelID,
            })
            const read = definitions.find((definition) => definition.id === "read")
            const describe = definitions.find((definition) => definition.id === MaestroArsenal.names.describe)
            const execute = definitions.find((definition) => definition.id === MaestroArsenal.names.execute)
            if (!read || !describe || !execute) throw new Error("production native definitions missing")
            const context: Tool.Context = {
              sessionID: session.id,
              messageID: assistant.id,
              agent: agent.name,
              agentID: agent.id,
              callID: running.callID,
              abort: new AbortController().signal,
              messages: [],
              metadata: (input) =>
                sessions
                  .updatePart({ ...running, state: { ...running.state, metadata: input.metadata, title: input.title } })
                  .pipe(Effect.asVoid),
              ask: (input) =>
                permission.ask({ ...input, sessionID: session.id, ruleset: agent.permission }).pipe(Effect.orDie),
            }
            const output = yield* read.execute(running.state.input, context)
            expect(output.output).toContain("legacy actual read")
            yield* sessions.updatePart({
              ...running,
              state: {
                status: "completed",
                input: running.state.input,
                output: output.output,
                title: output.title,
                metadata: { ...output.metadata, toolSafety: { outcome: "held" }, revision: "0".repeat(40) },
                time: { start: running.state.time.start, end: Date.now() },
              },
            })
            yield* describe.execute({ name: "governance" }, { ...context, callID: "legacy-describe" })
            const result = yield* execute.execute(
              { name: "governance", arguments: { operation: "audit", observations: { complete: false } } },
              { ...context, callID: "legacy-audit" },
            )
            const envelope = Schema.decodeUnknownSync(
              Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) }),
            )(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.output))
            expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(envelope.content[0].text)).toMatchObject({
              actions: [
                {
                  tool: "read",
                  outcome: "succeeded",
                  provenance: { sessionID: session.id, projectID: session.projectID, revision },
                },
                { tool: MaestroArsenal.names.describe, outcome: "succeeded" },
              ],
            })
          }).pipe(Effect.provideService(InstanceRef, instance))
        }),
      )
    }),
)

it.live(
  "empty history exposes UNKNOWN/HOLD status; historical revisions and placement remain explicit",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const instance = yield* instances.load({ directory: tmp.path })
          const sessions = yield* Session.Service
          const session = yield* sessions
            .create({ title: "historical missing", agent: "maestro" })
            .pipe(Effect.provideService(InstanceRef, instance))
          const observations = yield* ArsenalObservations.Service
          const input = {
            sessionID: session.id,
            operation: "status" as const,
            placement: { directory: tmp.path, projectID: session.projectID },
          }
          expect(yield* observations.read(input)).toMatchObject({
            observations: { usage: [], actions: [] },
            coverage: { historyComplete: false, usageComplete: false, reasons: ["USAGE_MISSING"] },
            integrity: { observationsVerified: false, scope: "event-window-only" },
          })
          // Request an actual not-yet-captured event window; never fabricate unsealed history.
          expect(yield* observations.read({ ...input, auditWindow: { fromSeq: 1, toSeq: 1 } })).toMatchObject({
            coverage: { historyComplete: false, usageComplete: false },
            integrity: { observationsVerified: false, window: { status: "UNKNOWN", historyComplete: false } },
          })
          const store = yield* SessionStore.Service
          const visible = yield* sessions.create({ title: "empty current status", agent: "maestro" }).pipe(Effect.provideService(InstanceRef, instance))
          const projected = yield* store.get(visible.id)
          if (!projected) throw new Error("actual empty-history Session missing")
          const locations = yield* LocationServiceMap.Service
          const empty = yield* Effect.gen(function* () {
            const registry = yield* ToolRegistry.Service
            const materialized = yield* registry.materialize()
            const invoke = (name: string, args: unknown) => materialized.settle({ sessionID: visible.id, agent: AgentV2.ID.make("maestro"), assistantMessageID: SessionMessage.ID.create(), call: { type: "tool-call", id: "empty-" + name, name, input: args } })
            const described = yield* invoke(MaestroArsenal.names.describe, { name: "governance" })
            if (described.result.type !== "text") throw new Error("EMPTY_STATUS_DESCRIBE_FAILED: " + JSON.stringify(described))
            expect(described.result.type).toBe("text")
            return yield* invoke(MaestroArsenal.names.execute, { name: "governance", arguments: { operation: "status" } })
          }).pipe(Effect.provide(locations.get(projected.location)))
          expect(empty.result.type).toBe("text")
          const envelope = Schema.decodeUnknownSync(Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) }))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(empty.output?.structured))
          expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(envelope.content[0].text)).toMatchObject({
            source: "host-session-observations",
            coverage: { historyComplete: false, usageComplete: false, reasons: ["USAGE_MISSING"] },
            usage: { status: "HOLD", costUSD: null },
            integrity: { observationsVerified: false, scope: "event-window-only" },
          })
          expect(
            yield* observations
              .read({ ...input, placement: { ...input.placement, directory: path.dirname(tmp.path) } })
              .pipe(Effect.flip),
          ).toMatchObject({ message: "OBSERVATION_SESSION_PLACEMENT_MISMATCH" })
          const events = yield* EventV2.Service
          const publisher = createLLMEventPublisher(events, {
            sessionID: session.id,
            agent: "maestro",
            model: ModelV2.Ref.make({ id: ModelV2.ID.make("xai/grok-4"), providerID: ProviderV2.ID.make("requesty") }),
          })
          const call = LLMEvent.toolCall({ id: "missing-revision", name: "read", input: {} })
          yield* publisher.publish(call)
          yield* publisher.publish(
            LLMEvent.toolResult({
              id: call.id,
              name: call.name,
              result: { type: "json", value: { marker: "historical payload" } },
              output: { structured: { revision: "0".repeat(40), toolSafety: { outcome: "success" } }, content: [] },
            }),
          )
          expect(yield* observations.read(input)).toMatchObject({
            observations: { actions: [{ provenance: { revisionUnavailable: "not-captured" } }] },
          })
          const unavailable = yield* sessions
            .create({ title: "unavailable native revision", agent: "maestro" })
            .pipe(Effect.provideService(InstanceRef, instance))
          const forged = createLLMEventPublisher(events, {
            sessionID: unavailable.id,
            agent: "maestro",
            snapshot: "0".repeat(40),
            model: ModelV2.Ref.make({ id: ModelV2.ID.make("xai/grok-4"), providerID: ProviderV2.ID.make("requesty") }),
          })
          yield* forged.publish(LLMEvent.toolCall({ id: "unavailable-revision", name: "read", input: {} }))
          yield* forged.publish(
            LLMEvent.toolResult({
              id: "unavailable-revision",
              name: "read",
              result: { type: "text", value: "historical outcome" },
            }),
          )
          expect(yield* observations.read({ ...input, sessionID: unavailable.id })).toMatchObject({
            observations: { actions: [{ provenance: { revisionUnavailable: "not-captured" } }] },
          })
        }),
      )
    }),
)

it.live(
  "replayed native outcome corpus hits the observation sentinel; the 2048th record is named overflow, not a partial green report",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
      await Bun.write(path.join(tmp.path, "bounded.txt"), "bounded\n")
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const instance = yield* instances.load({ directory: tmp.path })
          const sessions = yield* Session.Service
          const session = yield* sessions
            .create({ title: "observation bound", agent: "maestro" })
            .pipe(Effect.provideService(InstanceRef, instance))
          const store = yield* SessionStore.Service
          const projected = yield* store.get(session.id)
          if (!projected) throw new Error("Session projection missing")
          const locations = yield* LocationServiceMap.Service
          const snapshots = yield* Snapshot.Service
          const revision = yield* snapshots.track().pipe(Effect.provideService(InstanceRef, instance))
          const events = yield* EventV2.Service
          const publisher = createLLMEventPublisher(events, {
            sessionID: session.id,
            agent: "maestro",
            snapshot: revision,
            model: ModelV2.Ref.make({ id: ModelV2.ID.make("xai/grok-4"), providerID: ProviderV2.ID.make("requesty") }),
          })
          const messageID = yield* publisher.startAssistant()
          const observations = yield* ArsenalObservations.Service
          const input = {
            sessionID: session.id,
            operation: "audit" as const,
            placement: { directory: tmp.path, projectID: session.projectID },
          }
          yield* Effect.gen(function* () {
            const registry = yield* ToolRegistry.Service
            const materialized = yield* registry.materialize()
            const call = LLMEvent.toolCall({ id: "bounded-original", name: "read", input: { path: "bounded.txt" } })
            yield* publisher.publish(call)
            const result = yield* materialized.settle({
              sessionID: session.id,
              agent: AgentV2.ID.make("maestro"),
              assistantMessageID: messageID,
              call: { type: "tool-call", id: call.id, name: call.name, input: call.input },
            })
            expect(result.result.type).toBe("json")
            yield* publisher.publish(
              LLMEvent.toolResult({ id: call.id, name: call.name, result: result.result, output: result.output }),
            )
            const database = yield* Database.Service
            const originals = yield* database.db
              .select()
              .from(EventTable)
              .where(eq(EventTable.aggregate_id, session.id))
              .orderBy(EventTable.seq)
              .all()
              .pipe(Effect.orDie)
            const called = originals.find((row) => row.type === EventV2.versionedType(SessionEvent.Tool.Called.type, 1))
            const succeeded = originals.find(
              (row) => row.type === EventV2.versionedType(SessionEvent.Tool.Success.type, 1),
            )
            if (!called || !succeeded) throw new Error("actual native source events missing")
            const replay = (index: number) =>
              [called, succeeded].map((row, offset) => ({
                ...row,
                id: EventV2.ID.create(),
                seq: originals.length + index * 2 + offset,
                data: { ...row.data, callID: `imported-${index}` },
              }))
            // Exercise imported/replayed history at the durable storage boundary using actual native event payloads.
            yield* database.db
              .insert(EventTable)
              .values(
                Array.from({ length: ArsenalObservations.MAX_OBSERVATIONS - 2 }, (_, index) => replay(index)).flat(),
              )
              .run()
              .pipe(Effect.orDie)
            const actual = yield* observations.read(input)
            const capture = Schema.decodeUnknownSync(Schema.Struct({ actions: Schema.Array(Schema.Unknown) }))(
              actual.observations,
            )
            expect(capture.actions).toHaveLength(ArsenalObservations.MAX_OBSERVATIONS - 1)
            yield* database.db
              .insert(EventTable)
              .values(replay(ArsenalObservations.MAX_OBSERVATIONS - 2))
              .run()
              .pipe(Effect.orDie)
          }).pipe(Effect.provide(locations.get(projected.location)))
          const overflow = yield* observations.read(input).pipe(Effect.result)
          expect(overflow._tag).toBe("Failure")
          if (overflow._tag !== "Failure") throw new Error("observation overflow was accepted")
          expect(overflow.failure).toMatchObject({ message: "OBSERVATION_RECORD_OVERFLOW" })
        }),
      )
    }),
  120000,
)
