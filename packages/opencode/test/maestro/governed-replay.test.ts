import { afterEach, describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Cause, Effect, Exit, Schema } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Session } from "@/session/session"
import type { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { MaestroPresentApprovalTool } from "../../src/tool/maestro-approval"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { recordAdmission } from "../../src/maestro/admission-record"
import { presentApprovalFromSession, recordApproval } from "../../src/maestro/approval-record"
import { renderPresentation } from "../../src/maestro/approval"
import { taskHash } from "../../src/maestro/task-hash"
import { and, eq } from "drizzle-orm"
import { createHash } from "node:crypto"
import { Git } from "@/git"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { AppProcess } from "@opencode-ai/core/process"
import { TestInstance, tmpdirScoped } from "../fixture/fixture"


import { ref, layer, dispatch } from "./governed-fixture"
import path from "node:path"
import { realpath } from "node:fs/promises"
import { WriteRoots } from "@/maestro/write-roots"
afterEach(async () => { await disposeAllInstances() })
const it = testEffect(layer)
it.instance("completion-bearing governed replay requires actual terminal worker history", () =>
  Effect.gen(function* () {
    const { chat, assistant, sessions, input, first, context, promptCount } = yield* dispatch()
    // This legacy governed replay has requireCompletedReplay=false. A completion receipt must still require a terminal worker.
    const instance = yield* TestInstance
    const stateDirectory = yield* tmpdirScoped()
    const fs = yield* FSUtil.Service
    const stateFile = `${stateDirectory}/${chat.projectID}/completion/replay.json`
    yield* fs.makeDirectory(`${stateDirectory}/${chat.projectID}/completion`, { recursive: true })
    yield* fs.writeFileString(stateFile, JSON.stringify({ schema: 1, projectID: chat.projectID,
      contract: { sessionID: chat.id, label: "terminal replay", chain: [{ id: "gate", checks: [{ id: "file", hostCheck: "file" }] }] },
    }))
    yield* fs.writeFileString(`${instance.directory}/worker-check`, "accepted")
    const implementation = yield* Effect.tryPromise({
      try: async (): Promise<unknown> => import(process.env.ARSENAL_COMPLETION_TEST_MODULE ?? "@opencode-ai/maestro-arsenal"),
      catch: () => new Error("D_COMPLETION_FIXTURE_EXPORT_UNAVAILABLE"),
    }).pipe(Effect.map((value) => value && typeof value === "object" && "Arsenal" in value ? value.Arsenal : value),
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ evaluateCompletion: Schema.declare<ArsenalCompletion.Host["evaluateCompletion"]>(
        (value): value is ArsenalCompletion.Host["evaluateCompletion"] => typeof value === "function",
      ) }))))
    const captures: ArsenalCompletion.Capture[] = []
    const host: ArsenalCompletion.Host = {
      resolve: (dispatch) => Effect.succeed({ ...dispatch, planID: input.governed.planRevisionID, token: "replay", stateDirectory, ownedPaths: ["worker-check"] }),
      checks: new Map([["file", () => fs.readFileString(`${instance.directory}/worker-check`).pipe(
        Effect.map((text) => ({ status: text === "accepted" ? "pass" as const : "fail" as const, exitCode: text === "accepted" ? 0 : 1 })),
      )]]),
      evaluateCompletion: implementation.evaluateCompletion,
      observe: (_binding, capture) => Effect.sync(() => { captures.push(capture) }),
    }
    const configured = yield* TaskTool.pipe(Effect.provideService(ArsenalCompletion.NativeHost, host))
    const checked = yield* configured.init()
    const noWorker = yield* Effect.exit(checked.execute(input, context))
    expect(Exit.isFailure(noWorker)).toBe(true)
    if (Exit.isFailure(noWorker)) expect(Cause.pretty(noWorker.cause)).toContain("completion-worker-not-finished")
    expect(captures).toHaveLength(0)
    const childUser = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: first.metadata.sessionId,
      agent: "general", model: ref, time: { created: Date.now() } })
    const worker: SessionV1.Assistant = { ...assistant, id: MessageID.ascending(), sessionID: first.metadata.sessionId,
      parentID: childUser.id, agent: "general", mode: "general", finish: "tool-calls", time: { created: Date.now() + 1 } }
    yield* sessions.updateMessage(worker)
    const unfinished = yield* Effect.exit(checked.execute(input, context))
    expect(Exit.isFailure(unfinished)).toBe(true)
    if (Exit.isFailure(unfinished)) expect(Cause.pretty(unfinished.cause)).toContain("completion-worker-not-finished")
    expect(captures).toHaveLength(0)
    yield* sessions.updateMessage({ ...worker, finish: "stop" })
    expect((yield* checked.execute(input, context)).metadata.completion).toMatchObject({ verified: true })
    expect(captures).toHaveLength(1)
    yield* sessions.updateMessage({ ...worker, id: MessageID.ascending(), finish: undefined, time: { created: Date.now() + 2 } })
    const newer = yield* Effect.exit(checked.execute(input, context))
    expect(Exit.isFailure(newer)).toBe(true)
    if (Exit.isFailure(newer)) expect(Cause.pretty(newer.cause)).toContain("completion-worker-not-finished")
    expect(captures).toHaveLength(1)

    expect(promptCount()).toBe(1)
  }),
  { git: true },
  60000,
)

it.instance("governed replay binds the backend seat's write roots through the reservation", () =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const directory = yield* Effect.promise(() => realpath(instance.directory))
    const { sessions, def, input, first, context } = yield* dispatch({ subagentType: "backend", writePaths: ["src"] })
    const bound = [path.join(directory, "src")]
    expect(WriteRoots.read((yield* sessions.get(first.metadata.sessionId)).permission)).toEqual(bound)
    expect(first.metadata).toMatchObject({ workResult: { writeRoots: ["src"] } })
    for (const writePaths of [["docs"], ["src", "docs"], [], undefined]) {
      const replay = yield* Effect.exit(def.execute({ ...input, writePaths }, context))
      expect(Exit.isFailure(replay)).toBe(true)
      if (Exit.isFailure(replay)) expect(Cause.pretty(replay.cause)).toContain("reservation-write-roots-mismatch")
    }
    expect(WriteRoots.read((yield* sessions.get(first.metadata.sessionId)).permission)).toEqual(bound)
    expect((yield* def.execute(input, context)).metadata).toMatchObject({ workResult: { writeRoots: ["src"] } })
  }),
  { git: true },
  60000,
)
