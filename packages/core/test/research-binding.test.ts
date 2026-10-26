import { describe, expect } from "bun:test"
import { Effect, Layer, Scope } from "effect"
import { eq } from "drizzle-orm"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { randomUUID } from "node:crypto"
import { Research } from "@orchestra/schema/research"
import { Project } from "@orchestra/schema/project"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionLegacyTranscript } from "../src/session/legacy-transcript"
import { SessionMessage } from "@orchestra/schema/session-message"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { Agent } from "@orchestra/schema/agent"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { ProjectTable } from "@orchestra/core/project/sql"
import { MessageTable, PartTable, SessionTable } from "@orchestra/core/session/sql"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import type { Tool } from "@orchestra/core/tool/tool"
import { testEffect } from "./lib/effect"

type Services = Database.Service | EventV2.Service | ResearchRecords.Service | ResearchArtifacts.Service | Global.Service
export type Fixture = {
  readonly binding: Research.Binding
  readonly root: string
  readonly context: Tool.Context
  readonly call: (callID?: string) => Effect.Effect<Tool.Context>
}

// Shared native fixture stays in the three WP-owned test leaves; no application test infrastructure is changed.
export const researchFixture = <A, E>(run: (fixture: Fixture) => Effect.Effect<A, E, Services | Scope.Scope>) =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "research-core-"))),
      (root) => Effect.promise(() => fs.rm(root, { recursive: true, force: true })),
    )
    const layer = AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, ResearchRecords.node, ResearchArtifacts.node, Global.node]), [
      [Database.node, Database.layerFromPath(path.join(root, "native.db"))], [Global.node, Global.layerWith({ data: root })],
    ])
    return yield* Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const projectID = Project.ID.make(`research-${randomUUID()}`)
      const authoritySessionID = SessionID.create()
      const executionSessionID = SessionID.create()
      const directory = AbsolutePath.make(root)
      yield* database.db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).run().pipe(Effect.orDie)
      yield* database.db.insert(SessionTable).values([
        { id: authoritySessionID, project_id: projectID, directory, slug: "authority", title: "Authority", version: "test", agent: "maestro" },
        { id: executionSessionID, parent_id: authoritySessionID, project_id: projectID, directory, slug: "execution", title: "Research", version: "test", agent: "jimmy" },
      ]).run().pipe(Effect.orDie)
      yield* events.publish(MaestroEvent.Task.Bound, {
        taskId: `tsk_${randomUUID()}`, projectID, memberID: "jimmy", executionSessionID, authoritySessionID, source: "host",
      })
      const binding = yield* ResearchBinding.resolve(executionSessionID, projectID)
      const assistant = SessionLegacyTranscript.Assistant.make({
        id: SessionLegacyTranscript.MessageID.ascending(), sessionID: executionSessionID, role: "assistant", time: { created: 1 },
        parentID: SessionLegacyTranscript.MessageID.ascending(), modelID: Model.ID.make("fixture"), providerID: Provider.ID.make("fixture"),
        mode: "jimmy", agent: "jimmy", path: { cwd: root, root }, cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      })
      yield* database.db.insert(MessageTable).values({ id: assistant.id, session_id: executionSessionID, data: assistant }).run().pipe(Effect.orDie)
      const call = (callID: string = randomUUID()) => Effect.gen(function* () {
        const part = SessionLegacyTranscript.ToolPart.make({
          id: SessionLegacyTranscript.PartID.ascending(), sessionID: executionSessionID, messageID: assistant.id,
          type: "tool", callID, tool: "research_record", state: { status: "pending", input: {}, raw: "" },
        })
        yield* database.db.insert(PartTable).values({ id: part.id, session_id: executionSessionID, message_id: assistant.id, data: part }).run().pipe(Effect.orDie)
        return { sessionID: executionSessionID, assistantMessageID: SessionMessage.ID.make(assistant.id), agent: Agent.ID.make("jimmy"), toolCallID: callID }
      })
      return yield* run({ binding, root, context: yield* call(), call })
    }).pipe(Effect.provide(layer))
  })

export function callFrame<A, E, R>(binding: Research.Binding, context: Tool.Context, effect: Effect.Effect<A, E, R>) {
  return CapabilityInvocation.withContext({
    issuer: "app", owner: { projectID: binding.projectID, location: { directory: binding.directory }, sessionID: context.sessionID, agentID: context.agent },
    invocation: { sessionID: context.sessionID, agentID: context.agent, assistantMessageID: context.assistantMessageID, callID: context.toolCallID },
    rootToolName: "research_record", effectiveRules: [{ action: "research_record", resource: "*", effect: "allow" }], nativeDenyFloor: [],
  }, effect)
}

const it = testEffect(Layer.empty)
describe("research native binding", () => {
  it.live("retained child binding and actual invocation admit; missing frame and forged claims fail", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const valid = yield* callFrame(fixture.binding, fixture.context, ResearchBinding.require(fixture.binding, fixture.context))
      expect(valid).toEqual(fixture.binding)
      const missing = yield* ResearchBinding.require(fixture.binding, fixture.context).pipe(Effect.flip)
      expect(missing.code).toBe("binding_missing")
      const forged = { ...fixture.binding, taskId: "copied-title" }
      expect((yield* callFrame(fixture.binding, fixture.context, ResearchBinding.require(forged, fixture.context)).pipe(Effect.flip)).code).toBe("binding_mismatch")
      const unpersisted = { ...fixture.context, toolCallID: "forged-call" }
      expect((yield* callFrame(fixture.binding, unpersisted, ResearchBinding.require(fixture.binding, unpersisted)).pipe(Effect.flip)).code).toBe("binding_mismatch")
      expect((yield* ResearchBinding.resolve(fixture.binding.executionSessionID, Project.ID.make("foreign-project")).pipe(Effect.flip)).code).toBe("not_found")
    }),
  ))

  it.live("caller seat/label cannot substitute for retained native owner; deleted Session loses access", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const foreign = { ...fixture.context, agent: Agent.ID.make("backend") }
      expect((yield* callFrame(fixture.binding, foreign, ResearchBinding.require(fixture.binding, foreign)).pipe(Effect.flip)).code).toBe("binding_mismatch")
      yield* database.db.update(SessionTable).set({ agent: "configured-lookalike" }).where(eq(SessionTable.id, fixture.binding.executionSessionID)).run().pipe(Effect.orDie)
      expect((yield* ResearchBinding.resolve(fixture.binding.executionSessionID, fixture.binding.projectID).pipe(Effect.flip)).code).toBe("not_found")
      yield* database.db.update(SessionTable).set({ agent: "jimmy" }).where(eq(SessionTable.id, fixture.binding.executionSessionID)).run().pipe(Effect.orDie)
      expect(yield* ResearchBinding.resolve(fixture.binding.executionSessionID, fixture.binding.projectID)).toEqual(fixture.binding)
      yield* database.db.delete(SessionTable).where(eq(SessionTable.id, fixture.binding.executionSessionID)).run().pipe(Effect.orDie)
      expect((yield* ResearchBinding.resolve(fixture.binding.executionSessionID, fixture.binding.projectID).pipe(Effect.flip)).code).toBe("not_found")
    }),
  ))
})
