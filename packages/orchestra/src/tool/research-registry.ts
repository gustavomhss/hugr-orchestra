export * as ResearchRegistry from "./research-registry"

// The native discovery seat's part of the tool registry: its own tools, which tools it sees, and the wrapper that
// charges every builtin call to the research dispatch it runs in, with its sources captured and retained.
import { Effect } from "effect"
import { ResearchRecords } from "@orchestra/core/research/records"
import type { Agent } from "@/agent/agent"
import { nativeProfiles } from "@/maestro/roster"
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { ResearchSourceCapture } from "@/research/source-capture"
import { AtlasContextTool } from "./atlas-context"
import { ResearchCaptureTool } from "./research-capture"
import { ResearchRecordTool } from "./research-record"
import { ResearchViewTool } from "./research-view"
import { Tool } from "./tool"

const IDS: readonly string[] = [AtlasContextTool.id, ResearchRecordTool.id, ResearchViewTool.id, ResearchCaptureTool.id]

export const nodes = [ResearchRecords.node, ResearchExecution.node] as const

export const make = Effect.gen(function* () {
  const atlas = yield* AtlasContextTool
  const record = yield* ResearchRecordTool
  const view = yield* ResearchViewTool
  const acquire = yield* ResearchCaptureTool
  const execution = yield* ResearchExecution.Service
  const capture = yield* ResearchSourceCapture.make
  return {
    /** The discovery tools, initialized as builtins. */
    init: Effect.all([Tool.init(atlas), Tool.init(record), Tool.init(view), Tool.init(acquire)]),
    /** One builtin call; `run` is the registry's own safety runtime around the tool's execution. */
    charge: <E, R>(definition: Tool.Def, args: unknown, context: Tool.Context,
      run: (effect: Effect.Effect<Tool.ExecuteResult>) => Effect.Effect<Tool.ExecuteResult, E, R>) =>
      execution.tool(context.sessionID, context.callID ? `${context.messageID}:${context.callID}` : "", definition.id,
        capture.withCapture(context, definition.id, run(definition.execute(args as never, context).pipe(
          Effect.flatMap((result) => capture.retain(context, definition.id, result)))), args)),
  }
})

export function discovery(agent: Agent.Info) {
  return agent.native === true && agent.id === "jimmy"
}

/**
 * The discovery tools belong to the native discovery seat only. Discovery never sees a configured plugin tool, nor a
 * tool its immutable native floor denies: a path-scoped skill-root edit deny can mask the wildcard discovery deny in its
 * ordinary permissions.
 */
export function hidden(agent: Agent.Info, id: string, plugin: boolean) {
  if (plugin && agent.id === "jimmy") return true
  if (!discovery(agent)) return IDS.includes(id)
  return Permission.disabled([id], Permission.fromConfig(nativeProfiles.jimmy)).has(id)
}
