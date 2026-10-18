export * as ResearchTools from "./binding"

import { Effect } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Project } from "@orchestra/schema/project"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionMessage } from "@orchestra/schema/session-message"
import { Research } from "@orchestra/schema/research"
import { AbsolutePath } from "@orchestra/schema/schema"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { Agent } from "@/agent/agent"
import { Tool } from "@/tool/tool"
import { InstanceState } from "@/effect/instance-state"
import { nativeProfiles } from "@/maestro/roster"
import { Permission } from "@/permission"
import { Database } from "@orchestra/core/database/database"

export function run<A, E, R>(ctx: Tool.Context, name: string, use: (binding: Research.Binding, context: Parameters<typeof ResearchBinding.require>[1]) => Effect.Effect<A, E, R>, ask = true) {
  return Effect.gen(function* () {
    if (ctx.agentID !== "jimmy" || !ctx.callID)
      return yield* new Research.Error({ code: "binding_missing", message: "Native discovery invocation is required" })
    const agents = yield* Agent.Service
    const agent = yield* agents.get(ctx.agentID)
    if (!agent?.native || agent.id !== "jimmy")
      return yield* new Research.Error({ code: "binding_mismatch", message: "Discovery owner is not native" })
    if (ask) yield* ctx.ask({ permission: name, patterns: ["jimmy"], always: ["jimmy"], metadata: {} })
    const placement = yield* InstanceState.context
    const context = {
      sessionID: SessionID.make(ctx.sessionID), agent: AgentV2.ID.make("jimmy"),
      assistantMessageID: SessionMessage.ID.make(ctx.messageID), toolCallID: ctx.callID,
    }
    const binding = yield* ResearchBinding.resolve(context.sessionID, Project.ID.make(placement.project.id))
    if (binding.directory !== placement.directory || binding.worktree !== (placement.worktree === "/" ? placement.directory : placement.worktree))
      return yield* new Research.Error({ code: "binding_mismatch", message: "Discovery invocation differs from its retained Location" })
    return yield* CapabilityInvocation.withContext({
      issuer: "app",
      owner: {
        projectID: binding.projectID, location: { directory: AbsolutePath.make(binding.directory) },
        sessionID: context.sessionID, agentID: context.agent,
      },
      invocation: { sessionID: context.sessionID, agentID: context.agent, assistantMessageID: context.assistantMessageID, callID: context.toolCallID },
      rootToolName: name,
      effectiveRules: (ctx.permission ?? agent.permission).map((rule) => ({ action: rule.permission, resource: rule.pattern, effect: rule.action })),
      nativeDenyFloor: Permission.fromConfig(nativeProfiles.jimmy).map((rule) => ({ action: rule.permission, resource: rule.pattern, effect: rule.action })),
    }, ResearchBinding.require(binding, context).pipe(Effect.flatMap(() => use(binding, context))))
  })
}

export const make = Effect.gen(function* () {
  const agents = yield* Agent.Service
  const database = yield* Database.Service
  return <A, E, R>(ctx: Tool.Context, name: string, use: (binding: Research.Binding, context: Parameters<typeof ResearchBinding.require>[1]) => Effect.Effect<A, E, R>, ask = true) =>
    run(ctx, name, use, ask).pipe(Effect.provideService(Agent.Service, agents), Effect.provideService(Database.Service, database))
})
