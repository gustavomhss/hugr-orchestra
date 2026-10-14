import { Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import type { SessionMessage } from "../../../schema/src/session-message"
import { WireRequest } from "./distribution-provider-wire"

// Independent oracle for this proof's bounded bash command, not the production
// ToolOutput/Session-history mapper. File bytes establish exact stdout; completed
// durable output must carry exit 0, no truncation/timeout, and both text blocks.
export function requireSuccessfulBashResult(request: typeof WireRequest.Type, tool: SessionMessage.AssistantTool, stdout: string) {
  if (tool.name !== "bash" || tool.state.status !== "completed") throw new Error("PROVIDER_DURABLE_BASH_NOT_COMPLETED")
  if (!isDeepStrictEqual(tool.state.structured, { exit: 0, truncated: false }))
    throw new Error("PROVIDER_DURABLE_BASH_STRUCTURED_MISMATCH")
  if (!isDeepStrictEqual(tool.state.content, [
    { type: "text", text: stdout },
    { type: "text", text: "Command exited with code 0." },
  ])) throw new Error("PROVIDER_DURABLE_BASH_CONTENT_MISMATCH")
  const results = request.messages.filter((message) => message.role === "tool" && message.tool_call_id === tool.id)
  if (results.length !== 1) throw new Error("PROVIDER_WIRE_BASH_TOOL_RESULT_CARDINALITY")
  // stdout already ends in a newline. The second newline separates the complete
  // stdout block from exit status; nonce-only text cannot satisfy this contract.
  if (results[0].content !== `${stdout}\nCommand exited with code 0.`)
    throw new Error("PROVIDER_WIRE_BASH_TOOL_RESULT_MISMATCH")
  return { callID: tool.id, stdout, exit: 0, truncated: false, wireContent: results[0].content }
}

export async function calibrateSuccessfulBashResult(requestJSON: string, tool: SessionMessage.AssistantTool, stdout: string, nonce: string) {
  // Preserve every field of the actual captured request, including fields not
  // used by WireRequest's view. Only a detached oracle copy is ever changed.
  const request = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(WireRequest)), {
    onExcessProperty: "preserve",
  })(requestJSON)
  const before = requireSuccessfulBashResult(request, tool, stdout)
  const copy = structuredClone(request)
  const mutation = { ...copy, messages: copy.messages.map((message) =>
    message.role === "tool" && message.tool_call_id === tool.id ? { ...message, content: nonce } : message,
  ) }
  const rejected = await Promise.resolve().then(() => requireSuccessfulBashResult(mutation, tool, stdout)).then(
    () => { throw new Error("PROVIDER_NONCE_ONLY_WIRE_MUTATION_ACCEPTED") },
    (error: unknown) => {
      if (!(error instanceof Error) || error.message !== "PROVIDER_WIRE_BASH_TOOL_RESULT_MISMATCH") throw error
      return error.message
    },
  )
  const restored = { ...mutation, messages: mutation.messages.map((message, index) =>
    message.role === "tool" && message.tool_call_id === tool.id ? structuredClone(request.messages[index]) : message,
  ) }
  if (!isDeepStrictEqual(restored, request)) throw new Error("PROVIDER_WIRE_MUTATION_RESTORE_MISMATCH")
  const after = requireSuccessfulBashResult(restored, tool, stdout)
  if (!isDeepStrictEqual(before, after)) throw new Error("PROVIDER_WIRE_MUTATION_RESTORE_NOT_ACCEPTED")
  return { boundary: "copied-captured-request-only", before, mutation, rejected, restored, after }
}
