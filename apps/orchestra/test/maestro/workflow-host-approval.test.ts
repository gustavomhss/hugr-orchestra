import { expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { AppProcess } from "@orchestra/core/process"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Event } from "@orchestra/schema/event"
import { ProjectID } from "@orchestra/schema/project-id"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { EventV2Bridge } from "@/event-v2-bridge"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { workflowRevisionBody } from "@/maestro/plan-revision"
import { WorkflowBinding } from "@/maestro/workflow-binding"
import { InstanceStore } from "@/project/instance-store"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

// The live run lost its approval to an instruction sent after `aprovo` and got only the bare code back at dispatch.
it.live("a workflow dispatch without a current owner approval names the approval result and the turn rule", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await AppRuntime.runPromise(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "maestro" })
        const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
        const user = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: session.id,
          agent: "maestro", model, time: { created: 1 } })
        const definition = Schema.decodeUnknownSync(RelayArm.WorkflowDefinition)({
          publication: { projectID: session.projectID, documentID: "packet", activeVersionID: "version-1",
            immutableVersionBodyChecksum: "1".repeat(64), livePublicationChecksum: "2".repeat(64) },
          materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: "3".repeat(64), byteLength: 128 },
          resolvedSkills: [], parameters: {}, writePaths: ["src/money.ts"],
        })
        const field = { value: "Convert money exactly.", source: "maestro" as const }
        const revision = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(workflowRevisionBody({
          sessionID: session.id, admissionMessageID: user.id, methodVersion: "draft-plan-v3", goal: field,
          acceptance: [field], scope: [field], constraints: [], reviewRequirement: field, contextRequirement: "PENDING",
          assumptions: [], risks: [], status: "PROPOSED", createdAt: 1,
        }, definition))
        const events = yield* EventV2Bridge.Service
        yield* events.publish(MaestroEvent.PlanRevision.RecordedV3, revision, { id: EventV2.ID.make(revision.id) })
        const workflow = { documentID: "packet", planRevisionID: Event.ID.make(revision.id), parameters: {} }
        const assistant: SessionV1.Assistant = { id: MessageID.ascending(), role: "assistant", parentID: user.id,
          sessionID: session.id, mode: "maestro", agent: "maestro", cost: 0,
          path: { cwd: session.directory, root: session.directory },
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: model.modelID, providerID: model.providerID, time: { created: 2 } }
        yield* sessions.updateMessage(assistant)
        const input = { subagent_type: "backend", prompt: "Implement packet", writePaths: ["src/money.ts"], workflow,
          authorizationID: "evt_maestro_authorization_fixture" }
        yield* sessions.updatePart({ id: PartID.ascending(), sessionID: session.id, messageID: assistant.id,
          type: "tool", tool: "task", callID: "call_dispatch", state: { status: "running", input, time: { start: 2 } } })

        const runtime = yield* ArsenalBindings.make
        const held = yield* runtime.withSession(session.id, Effect.gen(function* () {
          const host = yield* WorkflowBinding.NativeHost
          if (!host) throw new Error("actual native workflow host missing")
          return yield* host.approve({ sessionID: session.id, assistantMessageID: assistant.id, callID: "call_dispatch",
            directory: session.directory, projectID: session.projectID, writePaths: ["src/money.ts"],
            subagentType: "backend", prompt: "Implement packet", workflow }, definition, "dispatch")
        })).pipe(Effect.flip)
        expect(held).toBeInstanceOf(RelayWorkflowBinding.Held)
        expect(held.reason).toBe("WORKFLOW_DIRECT_APPROVAL_MISSING")
        expect(held.message).toStartWith(
          "Tool safety HOLD: WORKFLOW_DIRECT_APPROVAL_MISSING. maestro_record_approval reports HOLD: presentation-not-current.")
        expect(held.message).toContain("record approval, grant authorization, arm and dispatch in the turn that answers it")
      }).pipe(Effect.provideService(InstanceRef, instance))
    }).pipe(Effect.scoped, Effect.provide(LayerNode.compile(LayerNode.group([
      filesystem, AppProcess.node, CrossSpawnSpawner.node, AtlasKnowledge.node,
    ])))))
  }), 90000)

// The owner approves the plan with the global acceptance checks in it: the native host supplies them to materialization.
it.live("the native workflow host attaches the global acceptance checks to every workflow plan", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await AppRuntime.runPromise(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "maestro" })
        const runtime = yield* ArsenalBindings.make
        const port = yield* runtime.withSession(session.id, Effect.gen(function* () {
          const host = yield* WorkflowBinding.NativeHost
          if (!host) throw new Error("actual native workflow host missing")
          return yield* host.publication({ directory: session.directory, projectID: ProjectID.make(session.projectID) })
        }))
        expect(port.acceptance).toEqual([
          { id: "package-verification", host_check: "package-verification" },
          { id: "cold-review", host_check: "cold-review" },
        ])
      }).pipe(Effect.provideService(InstanceRef, instance))
    }).pipe(Effect.scoped, Effect.provide(LayerNode.compile(LayerNode.group([
      filesystem, AppProcess.node, CrossSpawnSpawner.node, AtlasKnowledge.node,
    ])))))
  }), 90000)
