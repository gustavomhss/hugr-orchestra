export * as AppDockTools from "./application-tools"

import { Effect, JsonSchema, Layer, Schema, SchemaRepresentation } from "effect"
import { tool, type Hooks, type ToolContext } from "@orchestra/plugin"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import type { Host } from "@orchestra/core/host"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionStore } from "@orchestra/core/session"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { Tool } from "@orchestra/core/tool/tool"
import { createAppDockHooks } from "./app-dock"
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
      const input = SchemaRepresentation.toSchema(
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
    nodes: [
      makeGlobalNode({
        name: "app-dock/tools",
        layer,
        deps: [ApplicationTools.node, SessionStore.node, LocationServiceMap.node],
      }),
    ],
  }
}
