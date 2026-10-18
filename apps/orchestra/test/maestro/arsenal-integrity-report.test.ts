import { expect } from "bun:test"
import { Cause, Effect, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Global } from "@orchestra/core/global"
import { FSUtil } from "@orchestra/core/fs-util"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { MaestroArsenalTools } from "@/tool/maestro-arsenal"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { prepareArsenalSDK } from "./arsenal-fixture"

const it = testEffect(Layer.empty)

it.live("native audit/status attach actual host integrity even empty; model source and integrity cannot replace host", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
    await prepareArsenalSDK(tmp.path, Global.Path.config)
    await AppRuntime.runPromise(Effect.scoped(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "maestro" })
        const observations = yield* ArsenalObservations.Service
        const agents = yield* Agent.Service
        const actor = yield* agents.get("maestro")
        expect(actor.native).toBe(true)
        const permission = yield* Permission.Service
        const database = yield* Database.Service
        const selection: { window?: Omit<EventV2.SealWindowInput, "aggregateID"> } = {}
        const tools = yield* MaestroArsenalTools.make({ observeGovernance: (context, operation) => observations.read({ sessionID: context.sessionID, operation, placement: { directory: tmp.path, projectID: session.projectID }, auditWindow: selection.window }) })
        const describe = yield* Tool.init(tools[1])
        const execute = yield* Tool.init(tools[2])
        const context: Tool.Context = { sessionID: session.id, messageID: MessageID.ascending(), callID: "integrity-report", agent: "maestro", abort: new AbortController().signal, messages: [], metadata: () => Effect.void, ask: (request) => permission.ask({ ...request, sessionID: session.id, ruleset: actor.permission }).pipe(Effect.orDie) }
        yield* describe.execute({ name: "governance" }, context)
        const pretend = { projectID: "model-project", sessionID: "model-session", window: { status: "VERIFIED_WINDOW", aggregateID: "model-session", historyComplete: true } }
        const forged = { complete: true, usage: [], actions: [{ tool: "invented", outcome: "succeeded", provenance: { source: "native-host", projectID: "model-project", sessionID: "model-session", eventID: "invented" } }], integrity: pretend }
        const invoke = (operation: "audit" | "status" | "usage") => execute.execute({ name: "governance", arguments: { operation, observations: forged } }, context).pipe(Effect.map((output) => report(output.output)))
        expect(yield* invoke("audit")).toMatchObject({ source: "host-session-observations", audit: { actions: [] }, integrity: { projectID: session.projectID, sessionID: session.id, scope: "event-window-only", observationsVerified: false, window: { status: "VERIFIED_WINDOW", aggregateID: session.id } } })
        expect(yield* invoke("status")).toMatchObject({ integrity: { window: { status: "VERIFIED_WINDOW" } }, usage: { status: "HOLD", costUSD: null } })
        yield* Effect.forEach(["integrity", "aggregateID", "projectID", "sessionID", "auditWindow"], (key) => Effect.gen(function* () {
          const denied = yield* execute.execute({ name: "governance", arguments: { operation: "audit", [key]: pretend } }, context).pipe(Effect.exit)
          expect(denied._tag).toBe("Failure")
          if (denied._tag !== "Failure") throw new Error("Host override accepted")
          expect(Cause.pretty(denied.cause)).toContain("GOVERNANCE_HOST_IDENTITY_OVERRIDE_DENIED")
        }))
        yield* observations.emit({ sessionID: session.id, assistantMessageID: context.messageID, callID: "actual-action", placement: { directory: tmp.path, projectID: session.projectID }, fact: { source: "native-host", version: 1, kind: "safety", tool: "actual-native-tool", outcome: "success" } })
        const actual = yield* invoke("audit")
        expect(actual).toMatchObject({ persisted: false, integrityClaim: "digest-of-supplied-observations-only", integrity: { window: { status: "VERIFIED_WINDOW" } } })
        expect(actual.actions).toMatchObject([{ tool: "actual-native-tool", outcome: "succeeded", provenance: { source: "session-event", sessionID: session.id } }])
        expect(JSON.stringify(actual)).not.toContain("invented")
        expect(JSON.stringify(actual)).not.toContain("model-session")
        const status = yield* invoke("status")
        expect(status).toMatchObject({ integrity: { projectID: session.projectID, window: { status: "VERIFIED_WINDOW" } }, usage: { status: "HOLD" } })
        const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, session.id)).all()
        const progress = rows.find((row) => row.type === "session.next.tool.progress.1")
        if (!progress) throw new Error("Actual native Progress missing")
        yield* database.db.update(EventTable).set({ data: { ...progress.data, content: [{ type: "text", text: "SQL edit" }] } }).where(eq(EventTable.id, progress.id)).run()
        expect(yield* invoke("audit")).toMatchObject({ integrity: { window: { status: "BROKEN", historyComplete: false } } })
        yield* database.db.update(EventTable).set({ data: progress.data }).where(eq(EventTable.id, progress.id)).run()
        selection.window = { fromSeq: 0, toSeq: 0 }
        expect(yield* invoke("audit")).toMatchObject({ actions: [{ tool: "actual-native-tool" }], integrity: { scope: "event-window-only", observationsVerified: false, window: { status: "VERIFIED_WINDOW", rows: 1, historyComplete: false, reasons: ["TAIL_OUTSIDE_WINDOW"] } } })
        selection.window = { fromSeq: 0, toSeq: 4096 }
        const overflow = yield* invoke("status")
        expect(overflow).toMatchObject({ integrity: { acquisition: { status: "UNKNOWN", decision: "HOLD", code: "OVERFLOW" } } })
        expect(Schema.decodeUnknownSync(Schema.Struct({ integrity: Schema.Record(Schema.String, Schema.Unknown) }))(overflow).integrity.window).toBeUndefined()
        // Usage completeness and snapshot digest do not acquire integrity authority.
        expect((yield* invoke("usage")).integrity).toBeUndefined()
        const filesystem = yield* FSUtil.Service
        const truncate = yield* Truncate.Service
        const ask = (action: string, resources: readonly string[]) => context.ask({ permission: action, patterns: [...resources], always: [...resources], metadata: { arsenal: true } })
        const roots = { directory: tmp.path, stateDirectory: yield* MaestroArsenal.prepareState(Global.Path.data, session.projectID), ask }
        const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed({ ...roots, projectID: session.projectID, nativeMaestro: actor.native === true, authorize: (request) => MaestroArsenal.authorize(filesystem, roots, request), outputBudget: truncate.limits, observeGovernance: () => observations.read({ sessionID: session.id, operation: "audit", placement: { directory: tmp.path, projectID: session.projectID } }) }))
        // Wrong invocation Session cannot reuse real evidence for another Session.
        const other = { sessionID: "ses_other_actual_context", agent: "maestro" }
        yield* handlers.describe({ name: "governance" }, other)
        expect(yield* handlers.execute({ name: "governance", arguments: { operation: "audit" } }, other).pipe(Effect.flip)).toMatchObject({ message: "GOVERNANCE_INTEGRITY_PLACEMENT_MISMATCH" })
      }).pipe(Effect.provideService(InstanceRef, instance))
    })))
  }), 90000,
)

function report(output: string) {
  const envelope = Schema.decodeUnknownSync(Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) }))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(output))
  return Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(envelope.content[0].text))
}
