import fs from "node:fs/promises"
import path from "node:path"
import { LLMClient, LLMEvent } from "@orchestra/llm"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { ConfigCompaction } from "@orchestra/core/config/compaction"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { PermissionV2 } from "@orchestra/core/permission"
import { ReferenceGuidance } from "@orchestra/core/reference/guidance"
import { Relay } from "@orchestra/core/relay"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema, SessionStore, SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionMessage } from "@orchestra/core/session/message"
import { Prompt } from "@orchestra/core/session/prompt"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SkillV2 } from "@orchestra/core/skill"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { Context, DateTime, Deferred, Effect, Layer, Option, Schema, Stream } from "effect"
import { systemContextLayer } from "@orchestra/core/test/session-runner-harness"
import { MaestroWorkflowHostV2 } from "../../src/v2/workflow/host"
import { WorkflowRecordsV2 } from "../../src/v2/workflow/records"
import { WorkflowRelayV2 } from "../../src/v2/workflow/relay"
import { repo } from "./lucy-pr-entry"
import { worktree } from "./v2-governance"

type Controls = {
  readonly beforeRebind?: Effect.Effect<void>
  readonly afterRebind?: Effect.Effect<void>
  readonly provider?: Effect.Effect<void>
}

export const gate = () => {
  const entered = Deferred.makeUnsafe<void>()
  const released = Deferred.makeUnsafe<void>()
  return {
    entered: Deferred.await(entered).pipe(Effect.timeout("5 seconds")),
    hold: Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(released))),
    release: Deferred.succeed(released, undefined),
  }
}

/** One graph: the actual global host/coordinator, one SQL database, and its lazy real Relay/runner Location. */
export function open<A, E>(controls: Controls, body: (fixture: Fixture) => Effect.Effect<A, E>) {
  return Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    yield* repo(directory).pipe(Effect.provide(AppNodeBuilder.build(GitCli.node)))
    const calls = { provider: [] as string[], tools: [] as string[], completed: [] as string[], interrupted: [] as string[], rebind: 0 }
    const host: ExecutionHost.Interface = {
      id: "claude-code",
      stateKey: "holderTransfer",
      describeModel: () => Effect.succeed({ status: "ready" }),
      stream: (turn) => Stream.unwrap(Effect.gen(function* () {
        calls.provider.push(turn.session.id)
        yield* (controls.provider ?? Effect.void).pipe(
          Effect.onInterrupt(() => Effect.sync(() => { calls.interrupted.push(turn.session.id) })),
        )
        yield* turn.execute({ id: `probe-${calls.provider.length}`, name: "transfer_probe", input: {} })
        calls.completed.push(turn.session.id)
        return Stream.make(
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.textStart({ id: "answer" }),
          LLMEvent.textDelta({ id: "answer", text: "Completed the controlled provider turn." }),
          LLMEvent.textEnd({ id: "answer" }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
        )
      })),
    }
    const tools = makeLocationNode({
      name: "test/workflow-transfer/tools",
      layer: Layer.effectDiscard(ToolRegistry.Service.use((registry) => registry.register({
        transfer_probe: Tool.make({
          description: "Count an actual runner tool execution.",
          input: Schema.Struct({}),
          output: Schema.Struct({ counted: Schema.Boolean }),
          toModelOutput: () => [{ type: "text", text: "counted" }],
          execute: (_, context) => Effect.sync(() => {
            calls.tools.push(context.sessionID)
            return { counted: true }
          }),
        }),
      })).pipe(Effect.orDie)),
      deps: [ToolRegistry.node],
    })
    const implementation = Relay.node.implementation
    if (!Layer.isLayer(implementation)) return yield* Effect.die("Relay node has no Layer implementation")
    const observed = implementation.pipe(Layer.flatMap((context) => {
      const actual = Context.getUnsafe(context, Relay.Service)
      return Layer.succeed(Relay.Service, Relay.Service.of({
        ...actual,
        rebind: (input) => Effect.gen(function* () {
          calls.rebind++
          yield* (controls.beforeRebind ?? Effect.void)
          const result = yield* actual.rebind(input)
          yield* (controls.afterRebind ?? Effect.void)
          return result
        }),
      }))
    }))
    const graph = AppNodeBuilder.build(LayerNode.group([
      Database.node, EventV2.node, SessionStore.node, LocationServiceMap.node,
      SessionV2.node, SessionExecution.node, MaestroWorkflowHostV2.node,
    ]), [
      [Database.node, Database.layerFromPath(path.join(directory, "session.sqlite"))],
      [SessionExecution.node, SessionExecutionLocal.node],
      [Relay.node, { ...Relay.node, implementation: observed }],
      [ExecutionHost.node, Layer.succeed(ExecutionHost.Service, ExecutionHost.of([host]))],
      [LayerNodePlatform.llmClient, Layer.succeed(LLMClient.Service, LLMClient.Service.of({
        prepare: () => Effect.die("Unexpected LLM preparation"),
        generate: () => Effect.die("Unexpected LLM generation"),
        stream: () => Stream.die("Expected the controlled execution host"),
      }))],
      [SessionRunnerModel.node, SessionRunnerModel.layerWith(() => Effect.die("Hosted turn must not resolve a model"))],
      [Snapshot.node, Snapshot.noopLayer],
      [SkillGuidance.node, Layer.succeed(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
      [ReferenceGuidance.node, Layer.succeed(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
      [SkillV2.node, Layer.mock(SkillV2.Service, { list: () => Effect.succeed([]) })],
      [SystemContextRegistry.node, systemContextLayer],
      [PermissionV2.node, Layer.mock(PermissionV2.Service, { assert: () => Effect.void, authorize: () => Effect.void, cancelSession: () => Effect.void })],
      [Config.node, Layer.succeed(Config.Service, { entries: () => Effect.succeed([new Config.Document({
        type: "document", info: new Config.Info({ compaction: new ConfigCompaction.Info({ auto: false }) }),
      })]) })],
      [Global.node, Global.layerWith({ home: directory, config: path.join(directory, ".global"), data: path.join(directory, ".data") })],
    ], [tools])
    return yield* Effect.gen(function* () {
      const fixture = yield* setup(directory)
      return yield* body({ ...fixture, calls })
    }).pipe(Effect.provide(graph))
  }))
}

function setup(directory: string) {
  return Effect.gen(function* () {
    const sessions = yield* SessionV2.Service
    const execution = yield* SessionExecution.Service
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const store = yield* SessionStore.Service
    const workflow = yield* MaestroWorkflowHostV2.Service
    const locations = yield* LocationServiceMap.Service
    const authority = yield* sessions.create({ agent: AgentV2.ID.make("maestro"), location: Location.Ref.make({ directory: AbsolutePath.make(directory) }) })
    const context = yield* locations.contextEffect(authority.location)
    const relay = Context.get(context, Relay.Service)
    const agents = Context.get(context, AgentV2.Service)
    yield* agents.transform((draft) => draft.update(AgentV2.ID.make("backend"), (agent) => { agent.engine = "claude-code" }))
    const child = () => sessions.create({ agent: AgentV2.ID.make("backend"), parentID: authority.id, location: authority.location })
    const old = yield* child()
    const next = yield* child()
    const last = yield* child()
    const authoring = yield* AuthoringStore.open(relay.paths.root, authority.projectID)
    const plan = yield* AuthoringGraph.project("Holder transfer acceptance", {
      retry_budget: 0,
      work_packages: [{ id: "work", instructions: "Perform the controlled provider turn.", checklist: [{ id: "review", host_check: "cold-review" }] }],
    })
    const saved = yield* authoring.save({ body: plan })
    yield* authoring.publish(saved.id, saved.versionId)
    const published: RelayWorkflowBinding.PublicationPort = {
      projectID: authority.projectID,
      acceptance: WorkflowRelayV2.ACCEPTANCE_CONTROLS,
      use: (read) => read(authoring),
      skills: () => Effect.die("No workflow skill selected"),
    }
    const acquired = yield* RelayWorkflowBinding.acquire({ port: published, projectID: authority.projectID, documentID: saved.id, parameters: {}, writePaths: ["src"] })
    const token = Schema.decodeUnknownSync(RelayArm.Token)("holder-transfer")
    // Publish the native arm observation the host consumes; actual arm creation is performed by admit below.
    yield* events.publish(SessionEvent.Tool.Progress, {
      sessionID: authority.id, assistantMessageID: SessionMessage.ID.make("msg_arm_transfer"), callID: "call_arm_transfer", timestamp: yield* DateTime.now,
      structured: { nativeArsenal: { source: "native-host", version: 1, kind: "completion-arm", tool: "maestro_arsenal_execute", token, projectID: authority.projectID, directory } }, content: [],
    })
    const bound = (id: SessionSchema.ID): Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowBound.data> => ({
      executionSessionID: id, authorityMessageID: SessionMessage.ID.make(`msg_authority_${id}`), authorityCallID: `call_${id}`, token,
      binding: { definition: acquired.definition, planRevisionID: EventV2.ID.make("evt_transfer_plan"), executionSessionID: id, authoritySessionID: authority.id, logicalTaskID: `task_${id}` },
    })
    yield* workflow.admit(bound(old.id), false)
    const prompt = (id: SessionSchema.ID) => sessions.prompt({ sessionID: id, prompt: Prompt.make({ text: "Run the controlled provider turn." }), resume: false })
    const moves = () => database.db.select().from(EventV2.EventTable).all().pipe(Effect.orDie, Effect.map((rows) => rows.filter((row) => row.type === EventV2.versionedType(MaestroEvent.Task.WorkflowRebound.type, 1))))
    const bytes = () => Effect.promise(async () => {
      const arm = path.join(relay.paths.arms, token)
      return Object.fromEntries(await Promise.all((await fs.readdir(arm)).sort().map(async (name) => [name, (await fs.readFile(path.join(arm, name))).toString("base64")])))
    })
    const held = () => relay.holder(token).pipe(Effect.map(Option.getOrUndefined))
    const recorded = () => WorkflowRecordsV2.holders(database.db, token)
    return { directory, sessions, execution, database, events, store, workflow, relay, old, next, last, token, bound, prompt, moves, bytes, held, recorded }
  })
}

type Fixture = Effect.Success<ReturnType<typeof setup>> & {
  readonly calls: { provider: string[]; tools: string[]; completed: string[]; interrupted: string[]; rebind: number }
}
