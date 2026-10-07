export * as ArsenalObservations from "./arsenal-observations"

import path from "node:path"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { and, asc, eq, like, or } from "drizzle-orm"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { ToolFailure } from "@orchestra/llm"
import { Catalog } from "@orchestra/core/catalog"
import { Database } from "@orchestra/core/database/database"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { EventV2 } from "@orchestra/core/event"
import { EventSequenceTable, EventTable } from "@orchestra/core/event/sql"
import { Flag } from "@orchestra/core/flag/flag"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { ModelV2 } from "@orchestra/core/model"
import { ModelsDev } from "@orchestra/core/models-dev"
import { PluginV2 } from "@orchestra/core/plugin"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionMessage } from "@orchestra/core/session/message"
import { Snapshot } from "@orchestra/core/snapshot"
import { Hash } from "@orchestra/core/util/hash"
import { SessionV1 } from "@orchestra/core/v1/session"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"

export const MAX_OBSERVATIONS = 2048
const MAX_EVENTS = 32_768
const MAX_PRICING_BYTES = 16 * 1024 * 1024
const patterns = [
  "session.created",
  "session.updated",
  "message.updated",
  "message.part.updated",
  "session.next.moved",
  "session.next.step",
  "session.next.tool",
]

export interface Input {
  readonly sessionID: SessionSchema.ID
  readonly operation: "audit" | "usage" | "status"
  readonly placement: { readonly directory: string; readonly projectID: string }
  readonly auditWindow?: Omit<EventV2.SealWindowInput, "aggregateID">
}

export interface Interface {
  readonly read: (input: Input) => Effect.Effect<MaestroArsenal.GovernanceEvidence, ToolFailure>
  readonly emit: (input: {
    sessionID: SessionSchema.ID
    assistantMessageID: string
    callID: string
    placement: Input["placement"]
    fact: NativeFact
  }) => Effect.Effect<void, ToolFailure>
}

const ID = Schema.NonEmptyString.check(Schema.isMaxLength(4096))
export const NativeFact = Schema.Struct({
  source: Schema.Literal("native-host"),
  version: Schema.Literal(1),
  kind: Schema.Literals(["safety", "completion-arm", "completion-check"]),
  tool: ID,
  outcome: Schema.optional(Schema.Literals(["started", "success", "failure", "cancelled", "held"])),
  token: Schema.optional(ID),
  planID: Schema.optional(ID),
  reason: Schema.optional(ID),
  capture: Schema.optional(Schema.Unknown),
  runner: Schema.optional(Schema.Unknown),
})
export type NativeFact = typeof NativeFact.Type
const Capture = Schema.Struct({
  complete: Schema.Literal(true),
  results: Schema.Array(
    Schema.Struct({
      name: ID,
      status: Schema.Literals(["pass", "fail", "skip", "missing", "acquisition-error"]),
      exitCode: Schema.optional(Schema.Int),
      provenance: Schema.Struct({
        source: Schema.Literal("host-check"),
        projectID: ID,
        sessionID: ID,
        eventID: ID,
        revision: Schema.String,
        revisionKind: Schema.optional(Schema.Literal("git")),
      }),
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(MAX_OBSERVATIONS)),
})

export class Service extends Context.Service<Service, Interface>()("@orchestra/MaestroArsenalObservations") {}

type Provenance = {
  source: "session-event"
  projectID: string
  sessionID: string
  eventID: string
  revision?: string
  revisionKind?: "source"
  revisionUnavailable?: "not-captured"
}
type Usage = {
  provider: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  provenance: Provenance
}
type Action = { tool: string; outcome: "succeeded" | "failed" | "denied"; provenance: Provenance }
type Row = typeof EventTable.$inferSelect
type Step = { model: ModelV2.Ref; snapshot?: string; settled?: boolean }

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const sessions = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const filesystem = yield* FSUtil.Service
    const models = yield* ModelsDev.Service
    const events = yield* EventV2.Service
    return Service.of({
      emit: Effect.fn("ArsenalObservations.emit")(function* (input) {
        const session = yield* sessions.get(input.sessionID)
        if (
          !session ||
          session.projectID !== input.placement.projectID ||
          path.resolve(session.location.directory) !== path.resolve(input.placement.directory)
        )
          return yield* new ToolFailure({ message: "NATIVE_OBSERVATION_PLACEMENT_MISMATCH" })
        const fact = yield* Schema.decodeUnknownEffect(NativeFact)(input.fact).pipe(
          Effect.mapError(() => new ToolFailure({ message: "NATIVE_OBSERVATION_INVALID" })),
        )
        const snapshot = yield* Effect.gen(function* () {
          const snapshots = yield* Snapshot.Service
          return yield* snapshots.capture()
        }).pipe(Effect.provide(locations.get(session.location)))
        const record = {
          ...fact,
          sessionID: input.sessionID,
          projectID: session.projectID,
          directory: input.placement.directory,
          ...(snapshot
            ? { revision: snapshot, revisionKind: "source" as const }
            : { revisionUnavailable: "not-captured" as const }),
        }
        if (Buffer.byteLength(JSON.stringify(record), "utf8") > 128 * 1024)
          return yield* new ToolFailure({ message: "NATIVE_OBSERVATION_OVERFLOW" })
        yield* events.publish(
          SessionEvent.Tool.Progress,
          {
            sessionID: input.sessionID,
            assistantMessageID: SessionMessage.ID.make(input.assistantMessageID),
            callID: input.callID,
            timestamp: yield* DateTime.now,
            structured: { nativeArsenal: record },
            content: [],
          },
          { location: session.location },
        )
      }),
      read: Effect.fn("ArsenalObservations.read")(function* (supplied) {
        const input = Object.freeze({
          ...supplied,
          placement: Object.freeze({ ...supplied.placement }),
          auditWindow: supplied.auditWindow && Object.freeze({ ...supplied.auditWindow }),
        })
        const session = yield* sessions.get(input.sessionID)
        if (!session) return yield* new ToolFailure({ message: "OBSERVATION_SESSION_MISSING" })
        if (
          session.projectID !== input.placement.projectID ||
          path.resolve(session.location.directory) !== path.resolve(input.placement.directory)
        )
          return yield* new ToolFailure({ message: "OBSERVATION_SESSION_PLACEMENT_MISMATCH" })
        const rows = yield* database.db
          .select()
          .from(EventTable)
          .where(
            and(
              eq(EventTable.aggregate_id, input.sessionID),
              or(...patterns.map((pattern) => like(EventTable.type, `${pattern}.%`))),
            ),
          )
          .orderBy(asc(EventTable.seq))
          .limit(MAX_EVENTS + 1)
          .all()
          .pipe(Effect.mapError(() => new ToolFailure({ message: "OBSERVATION_EVENT_ACQUISITION_FAILED" })))
        if (rows.length > MAX_EVENTS) return yield* new ToolFailure({ message: "OBSERVATION_EVENT_OVERFLOW" })
        const integrity: MaestroArsenal.GovernanceEvidence["integrity"] =
          input.operation === "usage"
            ? undefined
            : {
                projectID: session.projectID,
                sessionID: session.id,
                scope: "event-window-only",
                observationsVerified: false,
                ...(yield* Effect.gen(function* () {
                  const window = input.auditWindow ?? (yield* database.db
                    .select({ seq: EventSequenceTable.seq })
                    .from(EventSequenceTable)
                    .where(eq(EventSequenceTable.aggregate_id, session.id))
                    .get()
                    .pipe(
                      Effect.map((head) => ({
                        fromSeq: Math.max(0, (head?.seq ?? 0) - 2047),
                        toSeq: Math.max(0, head?.seq ?? 0),
                      })),
                      Effect.mapError(() => new EventV2.SealWindowError({
                        code: "ACQUISITION_FAILED",
                        message: "Session event high-water acquisition failed",
                      })),
                    ))
                  return { window: yield* events.verifySealWindow({ ...window, aggregateID: session.id }) }
                }).pipe(Effect.catchTag("EventV2.SealWindowError", (error) => Effect.succeed({
                  acquisition: {
                    status: "UNKNOWN" as const,
                    decision: "HOLD" as const,
                    code: error.code,
                    message: error.message,
                  },
                })))),
              }
        const collected = yield* Effect.try({
          try: () => collect(rows, input),
          catch: (error) => {
            if (error instanceof ToolFailure) return error
            throw error
          },
        })
        const observations = collected.observations
        yield* Effect.gen(function* () {
          const snapshots = yield* Snapshot.Service
          const revisions = [
            ...new Set(
              [...observations.usage, ...observations.actions].flatMap((item) =>
                item.provenance.revision ? [item.provenance.revision] : [],
              ),
            ),
          ]
          yield* Effect.forEach(revisions, (revision) =>
            snapshots
              .files({
                from: Snapshot.ID.make(revision),
                to: Snapshot.ID.make(revision),
              })
              .pipe(
                Effect.catch(() =>
                  Effect.sync(() => {
                    ;[...observations.usage, ...observations.actions]
                      .filter((item) => item.provenance.revision === revision)
                      .forEach((item) => {
                        item.provenance = {
                          source: "session-event",
                          sessionID: item.provenance.sessionID,
                          projectID: item.provenance.projectID,
                          eventID: item.provenance.eventID,
                          revisionUnavailable: "not-captured",
                        }
                      })
                  }),
                ),
              ),
          )
        }).pipe(Effect.provide(locations.get(session.location)))
        const evidence = yield* Effect.gen(function* () {
          if (!observations.usage.length && !observations.actions.length) return { observations, prices: [] }
          const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
          const snapshot = yield* Effect.try({
            try: () =>
              Arsenal.validateHostSnapshot(
                {
                  directory: session.location.directory,
                  stateDirectory: MaestroArsenal.stateDirectory(Global.Path.data, session.projectID),
                  projectID: session.projectID,
                  authorize: () => Promise.reject(new Error("Snapshot validation cannot acquire effects")),
                },
                session.id,
                observations,
              ),
            catch: () => new ToolFailure({ message: "OBSERVATION_TRUSTED_SNAPSHOT_INVALID" }),
          })
          if (input.operation === "audit") return { observations: snapshot }
          const prices = yield* pricing(filesystem, models, observations.usage).pipe(
            Effect.provide(locations.get(session.location)),
          )
          return { observations: snapshot, prices }
        })
        const current = yield* sessions.get(input.sessionID)
        if (
          !current ||
          current.projectID !== session.projectID ||
          !isDeepStrictEqual(current.location, session.location)
        )
          return yield* new ToolFailure({ message: "OBSERVATION_PLACEMENT_CHANGED_DURING_READ" })
        return { ...evidence, integrity, coverage: collected.coverage, runners: collected.runners }
      }),
    })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, SessionStore.node, LocationServiceMap.node, FSUtil.node, ModelsDev.node, EventV2.node],
})

function collect(rows: readonly Row[], input: Input) {
  const assistants = new Map<string, ModelV2.Ref>()
  const steps = new Map<string, Step>()
  const calls = new Map<string, { tool: string; step: Step }>()
  const terminal = new Set<string>()
  const usage: Usage[] = []
  const actions: Action[] = []
  const safety = new Map<string, { fact: NativeFact; source: Provenance }>()
  const outcomes = new Map<string, Action>()
  const checks = new Map<string, typeof Capture.Type>()
  const unavailable = new Set<string>()
  const counts = { providerSteps: 0 }
  const runners: unknown[] = []
  rows.forEach((row) => {
    if (row.data.sessionID !== input.sessionID) fail("OBSERVATION_EVENT_SESSION_MISMATCH")
    switch (row.type) {
      case EventV2.versionedType(SessionV1.Event.Created.type, 1):
      case EventV2.versionedType(SessionV1.Event.Updated.type, 1): {
        const data = decode(SessionV1.Event.Created.data, row.data)
        if (
          data.info.id !== input.sessionID ||
          data.info.projectID !== input.placement.projectID ||
          path.resolve(data.info.directory) !== path.resolve(input.placement.directory)
        )
          fail("OBSERVATION_HISTORICAL_PLACEMENT_MISMATCH")
        return
      }
      case EventV2.versionedType(SessionV1.Event.MessageUpdated.type, 1): {
        const data = decode(SessionV1.Event.MessageUpdated.data, row.data)
        if (data.info.sessionID !== input.sessionID) fail("OBSERVATION_MESSAGE_SESSION_MISMATCH")
        if (data.info.role !== "assistant") return
        if (path.resolve(data.info.path.cwd) !== path.resolve(input.placement.directory))
          fail("OBSERVATION_ASSISTANT_PLACEMENT_MISMATCH")
        assistants.set(data.info.id, ModelV2.Ref.make({ id: data.info.modelID, providerID: data.info.providerID }))
        if (data.info.error) unavailable.add("USAGE_PROVIDER_STEP_FAILED")
        return
      }
      case EventV2.versionedType(SessionV1.Event.PartUpdated.type, 1): {
        const data = decode(SessionV1.Event.PartUpdated.data, row.data)
        const part = data.part
        if (part.sessionID !== input.sessionID) fail("OBSERVATION_PART_SESSION_MISMATCH")
        if (part.type === "step-start") {
          const model = assistants.get(part.messageID)
          if (!model) fail("OBSERVATION_ASSISTANT_MODEL_MISSING")
          steps.set(part.messageID, { model, snapshot: part.snapshot })
          counts.providerSteps++
          return
        }
        if (part.type === "step-finish") {
          const key = `legacy-usage:${part.id}`
          if (terminal.has(key)) return
          const step = steps.get(part.messageID)
          if (!step) fail("OBSERVATION_STEP_BINDING_MISSING")
          step.settled = true
          unavailable.add("USAGE_AVAILABILITY_NOT_CAPTURED")
          terminal.add(key)
          bound(usage.length)
          return
        }
        if (part.type !== "tool") return
        const key = `legacy-tool:${part.id}`
        if (terminal.has(key)) return
        if (part.state.status === "pending" || part.state.status === "running") {
          const step = steps.get(part.messageID)
          if (step && !calls.has(key)) calls.set(key, { tool: part.tool, step })
          bound(calls.size)
          return
        }
        const call = calls.get(key)
        if (!call || call.tool !== part.tool) fail("OBSERVATION_TOOL_CALL_BINDING_MISSING")
        const action = recordAction(
          part.tool,
          part.state.status === "completed" ? "succeeded" : "failed",
          provenance(row, input, call.step.snapshot),
        )
        actions.push(action)
        outcomes.set(`${part.messageID}:${part.callID}`, action)
        terminal.add(key)
        bound(actions.length)
        return
      }
      case EventV2.versionedType(SessionEvent.Moved.type, 1): {
        const data = decode(SessionEvent.Moved.data, row.data)
        if (path.resolve(data.location.directory) !== path.resolve(input.placement.directory))
          fail("OBSERVATION_HISTORICAL_PLACEMENT_MISMATCH")
        return
      }
      case EventV2.versionedType(SessionEvent.Step.Started.type, 1): {
        const data = decode(SessionEvent.Step.Started.data, row.data)
        if (steps.has(data.assistantMessageID)) fail("OBSERVATION_DUPLICATE_STEP_START")
        steps.set(data.assistantMessageID, { model: data.model, snapshot: data.snapshot })
        counts.providerSteps++
        return
      }
      case EventV2.versionedType(SessionEvent.Step.Ended.type, 2): {
        const data = decode(SessionEvent.Step.Ended.data, row.data)
        const key = `next-usage:${data.assistantMessageID}`
        if (terminal.has(key)) fail("OBSERVATION_DUPLICATE_STEP_SETTLEMENT")
        const step = steps.get(data.assistantMessageID)
        if (!step) fail("OBSERVATION_STEP_BINDING_MISSING")
        step.settled = true
        if (data.usageKnown === true) usage.push(recordUsage(step.model, data.tokens, provenance(row, input, data.snapshot ?? step.snapshot)))
        if (data.usageKnown !== true) unavailable.add(data.usageKnown === false ? "USAGE_PROVIDER_COUNTS_UNAVAILABLE" : "USAGE_AVAILABILITY_NOT_CAPTURED")
        terminal.add(key)
        bound(usage.length)
        return
      }
      case EventV2.versionedType(SessionEvent.Tool.Called.type, 1): {
        const data = decode(SessionEvent.Tool.Called.data, row.data)
        const step = steps.get(data.assistantMessageID)
        if (!step) fail("OBSERVATION_STEP_BINDING_MISSING")
        const key = `next-tool:${data.assistantMessageID}:${data.callID}`
        if (calls.has(key)) fail("OBSERVATION_DUPLICATE_TOOL_CALL")
        calls.set(key, { tool: data.tool, step })
        bound(calls.size)
        return
      }
      case EventV2.versionedType(SessionEvent.Tool.Success.type, 1):
      case EventV2.versionedType(SessionEvent.Tool.Failed.type, 1): {
        const success = row.type === EventV2.versionedType(SessionEvent.Tool.Success.type, 1)
        const data = success
          ? decode(SessionEvent.Tool.Success.data, row.data)
          : decode(SessionEvent.Tool.Failed.data, row.data)
        const key = `next-tool:${data.assistantMessageID}:${data.callID}`
        if (terminal.has(key)) fail("OBSERVATION_DUPLICATE_TOOL_SETTLEMENT")
        const call = calls.get(key)
        if (!call) fail("OBSERVATION_TOOL_CALL_BINDING_MISSING")
        // The durable failure schema does not preserve a typed permission-denial cause.
        // Neither arbitrary output metadata nor error prose can certify a denied outcome.
        const action = recordAction(
          call.tool,
          success ? "succeeded" : "failed",
          provenance(row, input, call.step.snapshot),
        )
        actions.push(action)
        outcomes.set(`${data.assistantMessageID}:${data.callID}`, action)
        terminal.add(key)
        bound(actions.length)
        return
      }
      case EventV2.versionedType(SessionEvent.Step.Failed.type, 2): {
        const data = decode(SessionEvent.Step.Failed.data, row.data)
        const step = steps.get(data.assistantMessageID)
        if (!step) fail("OBSERVATION_STEP_BINDING_MISSING")
        step.settled = true
        unavailable.add("USAGE_PROVIDER_STEP_FAILED")
        return
      }
      case EventV2.versionedType(SessionEvent.Tool.Input.Started.type, 1):
        decode(SessionEvent.Tool.Input.Started.data, row.data)
        return
      case EventV2.versionedType(SessionEvent.Tool.Input.Ended.type, 1):
        decode(SessionEvent.Tool.Input.Ended.data, row.data)
        return
      case EventV2.versionedType(SessionEvent.Tool.Progress.type, 1):
        {
          const data = decode(SessionEvent.Tool.Progress.data, row.data)
          if (data.structured.toolSafety) {
            const fact = decode(
              Schema.Struct({
                tool: ID,
                sessionID: ID,
                callID: ID,
                directory: ID,
                projectID: ID,
                outcome: Schema.Literals(["started", "success", "failure", "cancelled", "held"]),
                reason: Schema.optional(ID),
              }),
              data.structured.toolSafety,
            )
            if (
              fact.sessionID !== input.sessionID ||
              fact.callID !== data.callID ||
              fact.projectID !== input.placement.projectID ||
              path.resolve(fact.directory) !== path.resolve(input.placement.directory)
            )
              fail("NATIVE_OBSERVATION_PLACEMENT_MISMATCH")
            if (fact.outcome === "started") return
            const step = steps.get(data.assistantMessageID)
            safety.set(`${data.assistantMessageID}:${data.callID}`, {
              fact: { ...fact, source: "native-host", version: 1, kind: "safety" },
              source: provenance(row, input, step?.snapshot),
            })
            bound(safety.size)
            return
          }
          const value = data.structured.nativeArsenal
          if (!value) return
          const fact = decode(NativeFact, value)
          const placement = decode(Schema.Struct({ projectID: ID, directory: ID }), value)
          if (
            placement.projectID !== input.placement.projectID ||
            path.resolve(placement.directory) !== path.resolve(input.placement.directory)
          )
            fail("NATIVE_OBSERVATION_PLACEMENT_MISMATCH")
          if (fact.kind === "safety" && fact.outcome !== "started") {
            const recorded = decode(Schema.Struct({ revision: Schema.optional(Schema.String) }), value)
            safety.set(`${data.assistantMessageID}:${data.callID}`, {
              fact,
              source: provenance(row, input, recorded.revision),
            })
            bound(safety.size)
          }
          if (fact.kind === "completion-check") {
            const capture = decode(Capture, fact.capture)
            if (
              capture.results.some(
                (result) =>
                  result.provenance.projectID !== input.placement.projectID ||
                  result.provenance.sessionID !== input.sessionID,
              )
            )
              fail("NATIVE_OBSERVATION_CHECK_PLACEMENT_MISMATCH")
            checks.set(`${data.assistantMessageID}:${data.callID}`, capture)
            bound(checks.size)
            if (fact.runner !== undefined) runners.push({ callID: data.callID, eventID: row.id, evidence: fact.runner })
            bound(runners.length)
          }
        }
        return
      default:
        fail("OBSERVATION_EVENT_VERSION_UNSUPPORTED")
    }
  })
  safety.forEach((record, key) => {
    const call = calls.get(`next-tool:${key}`)
    const existing = outcomes.get(key)
    if (existing) {
      if (existing.tool !== record.fact.tool) fail("NATIVE_OBSERVATION_TOOL_MISMATCH")
      // Transcript completion records delivery, not successful native execution.
      if (record.fact.outcome === "held" || record.fact.outcome === "failure" || record.fact.outcome === "cancelled") {
        existing.outcome = record.fact.outcome === "held" ? "denied" : "failed"
        existing.provenance = record.source
      }
      return
    }
    const outcome =
      record.fact.outcome === "held"
        ? "denied"
        : call
          ? undefined
          : record.fact.outcome === "success"
            ? "succeeded"
            : record.fact.outcome === "failure" || record.fact.outcome === "cancelled"
              ? "failed"
              : undefined
    if (outcome) actions.push(recordAction(record.fact.tool, outcome, record.source))
    bound(actions.length)
  })
  if (!counts.providerSteps || !usage.length) unavailable.add("USAGE_MISSING")
  if ([...steps.values()].some((step) => !step.settled)) unavailable.add("USAGE_PROVIDER_STEP_UNSETTLED")
  const results = [...checks].flatMap(([call, capture]) =>
    capture.results.map((result) => ({ ...result, name: `${call}/${result.name}` })),
  )
  if (results.length) bound(results.length)
  return {
    observations: { complete: true, usage, actions, ...(results.length ? { checks: { complete: true, results } } : {}) },
    // A family-filtered fold cannot prove aggregate history; integrity states its own exact window.
    coverage: { scope: "settled-prefix" as const, historyComplete: false, usageComplete: unavailable.size === 0 && usage.length === counts.providerSteps, reasons: [...unavailable].sort(), providerSteps: counts.providerSteps, settledUsageSteps: usage.length },
    runners,
  }
}

function decode<A>(schema: Schema.Decoder<A>, value: unknown): A {
  return Option.getOrElse(Schema.decodeUnknownOption(schema)(value), () => fail("OBSERVATION_EVENT_PAYLOAD_INVALID"))
}

function provenance(row: Row, input: Input, revision: string | undefined): Provenance {
  if (revision && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) fail("OBSERVATION_HISTORICAL_REVISION_INVALID")
  if ([row.id, input.sessionID, input.placement.projectID].some((id) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id)))
    fail("OBSERVATION_IDENTITY_INVALID")
  return {
    source: "session-event",
    projectID: input.placement.projectID,
    sessionID: input.sessionID,
    eventID: row.id,
    ...(revision ? { revision, revisionKind: "source" as const } : { revisionUnavailable: "not-captured" as const }),
  }
}

function recordUsage(
  model: ModelV2.Ref,
  tokens: (typeof SessionEvent.Step.Ended.data.Type)["tokens"],
  source: Provenance,
): Usage {
  if (
    [
      tokens.input,
      tokens.output,
      tokens.reasoning,
      tokens.cache.read,
      tokens.cache.write,
      tokens.output + tokens.reasoning,
    ].some((count) => !Number.isSafeInteger(count) || count < 0)
  )
    fail("OBSERVATION_USAGE_COUNTER_INVALID")
  // Both native projections separate visible output from reasoning; both are billable output.
  return {
    provider: model.providerID,
    model: model.id,
    input: tokens.input,
    output: tokens.output + tokens.reasoning,
    cacheRead: tokens.cache.read,
    cacheWrite: tokens.cache.write,
    provenance: source,
  }
}

function recordAction(tool: string, outcome: Action["outcome"], source: Provenance): Action {
  if (!tool || tool.length > 4096) fail("OBSERVATION_TOOL_NAME_INVALID")
  return { tool, outcome, provenance: source }
}

function bound(count: number) {
  if (count >= MAX_OBSERVATIONS) fail("OBSERVATION_RECORD_OVERFLOW")
}

function fail(message: string): never {
  throw new ToolFailure({ message })
}

const pricing = Effect.fn("ArsenalObservations.pricing")(function* (
  fs: FSUtil.Interface,
  models: ModelsDev.Interface,
  usage: readonly Usage[],
) {
  const catalog = yield* Catalog.Service
  const plugins = yield* PluginV2.Service
  const keys = [...new Map(usage.map((item) => [JSON.stringify([item.provider, item.model]), item])).values()]
  if (keys.length >= 512) return yield* new ToolFailure({ message: "OBSERVATION_PRICING_MODEL_OVERFLOW" })
  if (!keys.length) return []
  yield* plugins.wait(PluginV2.ID.make("config-provider"))
  const url = Flag.ORCHESTRA_MODELS_URL || ModelsDev.DEFAULT_SOURCE
  const file =
    Flag.ORCHESTRA_MODELS_PATH ??
    path.join(
      Global.Path.cache,
      url === ModelsDev.DEFAULT_SOURCE ? "models.json" : `models-${Hash.fast(url)}.json`,
    )
  const before = yield* fs.stat(file).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!before || before.type !== "File" || before.size > MAX_PRICING_BYTES || Option.isNone(before.mtime)) return []
  const text = yield* fs.readFileString(file).pipe(Effect.catch(() => Effect.succeed(undefined)))
  const after = yield* fs.stat(file).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!text || !after || after.size !== before.size || !isDeepStrictEqual(after.mtime, before.mtime)) return []
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(decoded)) return []
  const disk = Schema.decodeUnknownOption(
    Schema.Record(Schema.String, Schema.Struct({ models: Schema.Record(Schema.String, Schema.Unknown) })),
  )(decoded.value)
  if (Option.isNone(disk)) return []
  const current = yield* models.get()
  const source = `models-dev:${Flag.ORCHESTRA_MODELS_PATH ? "local-file" : `${url}/api.json`}#sha256=${createHash("sha256").update(text).digest("hex")}`
  const asOf = before.mtime.value.toISOString()
  const prices = yield* Effect.forEach(keys, (key) =>
    Effect.gen(function* () {
      const providerID = ProviderV2.ID.make(key.provider)
      const base = Catalog.parseVirtualID(providerID)?.base ?? providerID
      const selected = Schema.decodeUnknownOption(ModelsDev.Model)(disk.value[base]?.models[key.model])
      if (Option.isNone(selected)) return
      const cost = selected.value.cost
      if (
        !cost ||
        cost.cache_read === undefined ||
        cost.cache_write === undefined ||
        cost.tiers?.length ||
        cost.context_over_200k
      )
        return
      if (
        ![cost.input, cost.output, cost.cache_read, cost.cache_write].every(
          (rate) => Number.isFinite(rate) && rate >= 0,
        )
      )
        return
      if (!isDeepStrictEqual(cost, current[base]?.models[key.model]?.cost)) return
      const info = yield* catalog.model.get(providerID, ModelV2.ID.make(key.model))
      if (
        !info ||
        info.cost.length !== 1 ||
        info.cost[0].tier ||
        info.cost[0].input !== cost.input ||
        info.cost[0].output !== cost.output ||
        info.cost[0].cache.read !== cost.cache_read ||
        info.cost[0].cache.write !== cost.cache_write
      )
        return
      return {
        provider: key.provider,
        model: key.model,
        input: cost.input,
        output: cost.output,
        cacheRead: cost.cache_read,
        cacheWrite: cost.cache_write,
        currency: "USD" as const,
        source,
        asOf,
      }
    }),
  )
  return prices.filter((price) => price !== undefined)
})
