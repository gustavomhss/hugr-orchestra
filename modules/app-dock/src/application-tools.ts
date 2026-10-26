export * as AppDockTools from "./application-tools"

import { Effect, JsonSchema, Layer, Schema, SchemaRepresentation, Stream } from "effect"
import { tool, type Hooks, type ToolContext } from "@orchestra/plugin"
import { AgentV2 } from "@orchestra/core/agent"
import { makeGlobalNode, makeLocationNode } from "@orchestra/core/effect/app-node"
import { EventV2 } from "@orchestra/core/event"
import type { Host } from "@orchestra/core/host"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { PermissionV2 } from "@orchestra/core/permission"
import { PluginV2 } from "@orchestra/core/plugin"
import { SessionStore } from "@orchestra/core/session"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { Tool } from "@orchestra/core/tool/tool"
import { SessionEvent } from "@orchestra/schema/session-event"
import { createAppDockHooks } from "./app-dock"
import { LINUX_DESCRIPTION, LINUX_PROMPT } from "./app-dock-linux"
import { createLinuxWorkspaceHooks } from "./linux-workspace"
import type { Transport } from "./transport"

// K2: the Dock and Linux workspace tools on V2. The hook tools stay the single implementation; each runs here with a
// V1-shaped context whose `ask` goes through the Session's own V2 permission queue.

type Resolve = (context: Tool.Context) => Effect.Effect<{ readonly directory: string; readonly ask: ToolContext["ask"] }, Tool.Failure>

/** The hook tools of both Dock plugins as core Tools; `resolve` places each call in its Session's Location. */
export function applicationTools(port: Transport, resolve: Resolve): Record<string, Tool.AnyTool> {
  const hooks: Hooks["tool"] = { ...createAppDockHooks(port).tool, ...createLinuxWorkspaceHooks(port).tool }
  return Object.fromEntries(
    Object.entries(hooks ?? {}).map(([name, definition]) => {
      const args = tool.schema.object(definition.args)
      const input = SchemaRepresentation.toSchema<Schema.Codec<unknown, unknown, never, never>>(
        SchemaRepresentation.fromJsonSchemaDocument(
          JsonSchema.fromSchemaDraft2020_12(tool.schema.toJSONSchema(args, { target: "draft-2020-12", io: "input" }) as JsonSchema.JsonSchema),
        ),
      )
      return [
        name,
        Tool.make({
          description: definition.description,
          input,
          output: Schema.String,
          execute: (value, context) =>
            resolve(context).pipe(
              Effect.flatMap((placement) =>
                Effect.tryPromise({
                  try: (abort) =>
                    definition.execute(args.parse(value), {
                      sessionID: context.sessionID,
                      messageID: context.assistantMessageID,
                      callID: context.toolCallID,
                      agent: context.agent,
                      agentID: context.agent,
                      directory: placement.directory,
                      worktree: placement.directory,
                      abort,
                      metadata: () => undefined,
                      ask: placement.ask,
                    }),
                  catch: (error) => new Tool.Failure({ message: error instanceof Error ? error.message : String(error) }),
                }),
              ),
              Effect.map((result) => (typeof result === "string" ? result : result.output)),
            ),
        }),
      ]
    }),
  )
}

/** Registers the tools for the process; loaded only when the desktop handed this child a Dock channel. */
export function contribution(port: Transport): Host.Contribution {
  const layer = Layer.effectDiscard(
    Effect.gen(function* () {
      const tools = yield* ApplicationTools.Service
      const sessions = yield* SessionStore.Service
      const locations = yield* LocationServiceMap.Service
      yield* tools
        .register(
          applicationTools(port, (context) =>
            Effect.gen(function* () {
              const session = yield* sessions.get(context.sessionID)
              if (!session) return yield* new Tool.Failure({ message: "App Dock session is unavailable." })
              const permissions = yield* PermissionV2.Service.pipe(Effect.provide(locations.get(session.location)))
              return {
                directory: session.location.directory,
                ask: (request: Parameters<ToolContext["ask"]>[0]) =>
                  Effect.runPromise(
                    permissions.authorize({
                      sessionID: context.sessionID,
                      agent: context.agent,
                      action: request.permission,
                      resources: request.patterns,
                      save: request.always,
                      metadata: request.metadata,
                      source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
                    }),
                  ),
              }
            }).pipe(Effect.mapError((error) => (error instanceof Tool.Failure ? error : new Tool.Failure({ message: "App Dock placement failed." })))),
          ),
        )
        .pipe(Effect.orDie)
    }),
  )
  return {
    id: "app-dock",
    locationNodes: [scopeNode],
    nodes: [
      makeGlobalNode({
        name: "app-dock/tools",
        layer,
        deps: [ApplicationTools.node, SessionStore.node, LocationServiceMap.node],
      }),
      reaper(port),
    ],
  }
}

/**
 * Closes a deleted Session's Linux workspace: the desktop aborts the Session's pending calls and stops the processes and
 * terminals it owns. `SessionV2.remove` publishes `session.next.deleted` for the Session and each child it cascades to.
 */
export function reaper(port: Transport) {
  return makeGlobalNode({
    name: "app-dock/linux-reaper",
    layer: Layer.effectDiscard(
      Effect.gen(function* () {
        const events = yield* EventV2.Service
        yield* events.subscribe(SessionEvent.Deleted).pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => port.postMessage({ type: "linux.session.close", sessionID: event.data.sessionID })),
          ),
          Effect.forkScoped({ startImmediately: true }),
        )
      }),
    ),
    deps: [EventV2.node],
  })
}

/**
 * The Linux workspace tools, and the Dock tools that act only on native controls, belong to the `linux` subagent alone.
 * Every other agent gets these denials ahead of its own rules, so its own rules still win; the `linux` agent holds only
 * the workspace tools.
 */
export function scope(draft: AgentV2.Draft) {
  const linux = AgentV2.ID.make("linux")
  draft
    .list()
    .filter((agent) => agent.id !== linux)
    .forEach((agent) =>
      draft.update(agent.id, (mutable) => {
        mutable.permissions.unshift(
          ...["linux_*", "ui_*", "dock_find", "dock_action"].map((action) => ({ action, resource: "*", effect: "deny" as const })),
        )
      }),
    )
  draft.update(linux, (agent) => {
    agent.system ??= LINUX_PROMPT
    agent.description ??= LINUX_DESCRIPTION
    agent.mode = "subagent"
    // The `linux` and `dock` rules the owner configured (pushed onto every agent before this runs) survive as they are,
    // so an ask or deny stays one; with none configured they default to allow, as V1 does.
    const configured = (action: string) => {
      const rules = agent.permissions.filter((rule) => rule.action === action)
      return rules.length > 0 ? rules : [{ action, resource: "*", effect: "allow" as const }]
    }
    agent.permissions = [
      { action: "*", resource: "*", effect: "deny" },
      ...["linux_*", "ui_*", "todowrite"].map((action) => ({ action, resource: "*", effect: "allow" as const })),
      ...configured("linux"),
      ...configured("dock"),
    ]
  })
}

const scopeNode = makeLocationNode({
  name: "app-dock/linux-scope",
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      yield* plugins.wait(PluginV2.ID.make("config-agent"))
      yield* plugins.ensure(PluginV2.ID.make("app-dock/linux-scope"), () => agents.transform(scope).pipe(Effect.asVoid))
    }),
  ),
  deps: [PluginV2.node, AgentV2.node],
})

