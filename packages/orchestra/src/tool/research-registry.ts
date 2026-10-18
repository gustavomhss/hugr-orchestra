export * as ResearchRegistry from "./research-registry"

// The native discovery seat's part of the tool registry: its own tools, which tools it sees, and the wrapper that
// charges every builtin call to the research dispatch it runs in, with its sources captured and retained.
import { Effect, Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchRecords } from "@orchestra/core/research/records"
import type { Agent } from "@/agent/agent"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { nativeProfiles } from "@/maestro/roster"
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { ResearchSeatTools } from "@/research/seat-tools"
import { ResearchSourceCapture } from "@/research/source-capture"
import { AtlasContextTool } from "./atlas-context"
import { CodeLocateTool } from "./code-locate"
import { CodeQueryTool } from "./code-query"
import { CodeSearchTool } from "./code-search"
import { InquiryTool } from "./inquiry"
import { ProbeRunTool } from "./probe-run"
import { ResearchCaptureTool } from "./research-capture"
import { ResearchRecordTool } from "./research-record"
import { ResearchViewTool } from "./research-view"
import { Tool } from "./tool"

// Every tool this registry initializes. A tool reaches the seat only once its id is in ResearchSeatTools.OWN (JD-2): the
// seat's permission profile derives from OWN, and no other agent ever sees any of them.
export const IDS: readonly string[] = [AtlasContextTool, ResearchRecordTool, ResearchViewTool, ResearchCaptureTool,
  CodeQueryTool, CodeLocateTool, CodeSearchTool, ProbeRunTool, InquiryTool].map((tool) => tool.id)

export const nodes = [ResearchRecords.node, ResearchExecution.node] as const

// Dispatches whose inquiry closed, by execution Session and dispatch call: every later tool call of that dispatch is
// denied (J5.5), re-entries included. A resumed Task is a new dispatch and starts open.
const closed = new Set<string>()

export const make = Effect.gen(function* () {
  const atlas = yield* AtlasContextTool
  const record = yield* ResearchRecordTool
  const view = yield* ResearchViewTool
  const acquire = yield* ResearchCaptureTool
  const query = yield* CodeQueryTool
  const locate = yield* CodeLocateTool
  const search = yield* CodeSearchTool
  const probe = yield* ProbeRunTool
  const inquiry = yield* InquiryTool
  const execution = yield* ResearchExecution.Service
  const capture = yield* ResearchSourceCapture.make
  return {
    /** The discovery tools, initialized as builtins. */
    init: Effect.all([Tool.init(atlas), Tool.init(record), Tool.init(view), Tool.init(acquire), Tool.init(query),
      Tool.init(locate), Tool.init(search), Tool.init(probe), Tool.init(inquiry)]),
    /** One builtin call, charged to its dispatch under the call key its context carries. */
    charge: <P extends Schema.Decoder<unknown>, E, R>(definition: Tool.Def<P>, args: Schema.Schema.Type<P>, context: Tool.Context,
      run: (effect: Effect.Effect<Tool.ExecuteResult>) => Effect.Effect<Tool.ExecuteResult, E, R>) =>
      Effect.gen(function* () {
        const frame = yield* ResearchExecution.Current
        if (frame && closed.has(dispatch(frame.allowance)))
          return yield* new Research.Error({ code: "inquiry_state", message: "inquiry closed: this dispatch admits no further tool calls" })
        const result = yield* execution.tool(context.sessionID, callKey(context), definition.id,
          capture.withCapture(context, definition.id, run(definition.execute(args, context).pipe(
            Effect.flatMap((result) => capture.retain(context, definition.id, result, args)))), args))
        if (frame && closes(definition.id, args)) closed.add(dispatch(frame.allowance))
        return result
      }),
  }
})

// A host that charges a call before it runs (Claude Code PreToolUse, keyed by its tool-use id) puts that key in the
// context, so execution reconciles the same charge. Otherwise the call id is unique only within its message.
function callKey(context: Tool.Context) {
  if (!context.callID) return ""
  return typeof context.extra?.callKey === "string" ? context.extra.callKey : `${context.messageID}:${context.callID}`
}

function dispatch(allowance: Research.Allowance) {
  return `${allowance.binding.executionSessionID}\0${allowance.dispatchCallID}`
}

function closes(id: string, args: unknown) {
  if (id !== InquiryTool.id) return false
  const input = Schema.decodeUnknownOption(Research.InquiryInput)(args)
  return input._tag === "Some" && input.value.action === "close"
}

export function discovery(agent: Agent.Info) {
  return agent.native === true && agent.id === ResearchSeatTools.SEAT
}

/**
 * Research tools belong to native discovery; every native Atlas owner also holds the builtin Atlas context door.
 * Discovery never sees a configured plugin tool, nor a
 * tool its immutable native floor denies: a path-scoped skill-root edit deny can mask the wildcard discovery deny in its
 * ordinary permissions.
 */
export function hidden(agent: Agent.Info, id: string, plugin: boolean) {
  if (!plugin && id === AtlasContextTool.id) return !AtlasMemory.supports(agent)
  if (plugin && agent.id === ResearchSeatTools.SEAT) return true
  if (!discovery(agent)) return IDS.includes(id)
  return Permission.disabled([id], Permission.fromConfig(nativeProfiles[ResearchSeatTools.SEAT])).has(id)
}
