import { isDeepStrictEqual } from "node:util"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Option, Schema } from "effect"
import type { SessionID } from "@/session/schema"
import { ClaudeHostMcp } from "./mcp"

const GrantID = Schema.String.check(Schema.isPattern(/^grt_[A-Za-z0-9]+$/))
const Result = Schema.Struct({ grantID: GrantID })
const Metadata = Schema.Struct({ grantID: GrantID, seat: Schema.String, writeRoots: Schema.Array(Schema.String) })
const Dispatch = Schema.Struct({
  executor: Schema.Literal("claude-code-host"), toolName: Schema.Literals(["Agent", "Task"]),
  toolUseID: Schema.String, agentID: Schema.String, grantID: GrantID, subagentType: Schema.String,
  seat: Schema.String, writeRoots: Schema.Array(Schema.String), background: Schema.Boolean,
})

/** Historical evidence only. The caller supplies the exclusive retained view, never the full post-cut history. */
export function read(input: {
  sessionID: SessionID
  history: readonly SessionV1.WithParts[]
  live: readonly ClaudeHostMcp.Grant[]
}): readonly string[] {
  const calls = input.history.flatMap((message) => message.info.sessionID === input.sessionID && message.info.role === "assistant"
    ? message.parts.filter((part): part is SessionV1.ToolPart => part.type === "tool" &&
      part.sessionID === input.sessionID && part.messageID === message.info.id) : [])
  return calls.flatMap((part, index) => {
    // Native/model tool results cannot issue this capability: require the host MCP producer and successful completion.
    if (part.tool !== ClaudeHostMcp.GRANT || part.metadata?.claudeCodeTool !== `mcp__orchestra__${ClaudeHostMcp.GRANT}` ||
      part.metadata?.providerExecuted === true || part.state.status !== "completed") return []
    const parameters = Schema.decodeUnknownOption(ClaudeHostMcp.GrantParameters)(part.state.input)
    const metadata = Schema.decodeUnknownOption(Metadata)(part.state.metadata)
    const result = Schema.decodeUnknownOption(Schema.fromJsonString(Result))(part.state.output)
    if (Option.isNone(parameters) || Option.isNone(metadata) || metadata.value.seat !== parameters.value.seat ||
      Option.isSome(result) && result.value.grantID !== metadata.value.grantID) return []
    // Only a cleared compacted output may fall back to host metadata, and it can never authorize another dispatch.
    if (Option.isNone(result) && (part.state.output !== "" || part.state.time.compacted === undefined)) return []
    const grant = { grantID: metadata.value.grantID, sessionID: input.sessionID, seat: parameters.value.seat,
      writePaths: parameters.value.writePaths, writeRoots: metadata.value.writeRoots, purpose: parameters.value.purpose }
    const dispatches = calls.slice(index + 1).flatMap((call) => {
      if ((call.tool !== "Agent" && call.tool !== "Task") || call.metadata?.providerExecuted !== true ||
        call.metadata?.claudeCodeTool !== call.tool || typeof call.state.input.prompt !== "string" ||
        ClaudeHostMcp.referenced(call.state.input.prompt) !== grant.grantID ||
        call.state.input.subagent_type !== `orchestra:${grant.seat}`) return []
      const evidence = Schema.decodeUnknownOption(Dispatch)(call.state.status === "pending" ? undefined : call.state.metadata?.claudeCodeDispatch)
      const consumed = call.state.status === "completed" && Option.isSome(evidence) &&
        evidence.value.toolName === call.tool && evidence.value.toolUseID === call.callID && evidence.value.agentID.length > 0 &&
        evidence.value.grantID === grant.grantID && evidence.value.seat === grant.seat &&
        evidence.value.subagentType === call.state.input.subagent_type && isDeepStrictEqual(evidence.value.writeRoots, grant.writeRoots) &&
        call.state.metadata?.parentSessionId === input.sessionID && typeof call.state.metadata?.sessionId === "string" &&
        call.metadata?.sessionId === call.state.metadata.sessionId
      if (!consumed && call.state.status === "error") return []
      return [{ source: { message_id: call.messageID, part_id: call.id }, callID: call.callID,
        lifecycle: call.state.status, state: consumed ? "consumed" : "unresolved", input: call.state.input,
        ...(call.state.status === "completed" ? { output: call.state.output } : {}),
        // context_recall returns input/output/lifecycle, but deliberately excludes dispatch/placement metadata.
        ...(consumed && Option.isSome(evidence) ? { host_metadata: { ...evidence.value, sessionId: call.state.status === "completed" ? call.state.metadata.sessionId : undefined } } : {}),
        recall_fields: ["input", "lifecycle", ...(call.state.status === "completed" ? ["output"] : [])], host_metadata_recallable: false }]
    })
    const live = input.live.filter((entry) => entry.grantID === grant.grantID)
    const registered = live.length ? ClaudeHostMcp.grants(input.sessionID).get(grant.grantID) : undefined
    const agrees = live.length === 1 && registered !== undefined && isDeepStrictEqual(live[0], registered) &&
      isDeepStrictEqual({ grantID: registered.grantID, sessionID: registered.sessionID, seat: registered.seat,
        writePaths: registered.writePaths, writeRoots: registered.writeRoots, purpose: registered.purpose }, grant) &&
      registered.time >= part.state.time.start && registered.time <= part.state.time.end
    const state = dispatches.some((call) => call.state === "consumed") ? "consumed"
      : dispatches.length ? "unresolved_dispatch" : Option.isNone(result) ? "unavailable_result"
      : agrees ? "unbound" : live.length ? "inconsistent_live_entry" : "invalidated"
    return [JSON.stringify({ ...grant, source: { message_id: part.messageID, part_id: part.id },
      availability: state === "unbound" ? "available" : "unavailable", state, usable: state === "unbound",
      reason: state === "unbound" ? "Exact unbound live registry entry agrees with retained issuance."
        : state === "consumed" ? "Bound to a surviving host-observed Agent dispatch; cannot be reused."
        : state === "unresolved_dispatch" ? "Dispatch evidence is unresolved; no usable capability or recovery is inferred."
        : state === "unavailable_result" ? "Issued result was cleared; host metadata survives but context_recall cannot recover the grant ID."
        : state === "inconsistent_live_entry" ? "Supplied live entry does not agree with the actual registry and retained issuance."
        : "No matching live ownership remains (release, restart or consumption without retained evidence); reissue before dispatch.",
      issuance: { input: part.state.input, output: part.state.output, lifecycle: part.state.status,
        host_metadata: metadata.value, recall_fields: ["input", "output", "lifecycle"], host_metadata_recallable: false },
      dispatches })]
  })
}

export * as ClaudeHostGrantHistory from "./grant-history"
