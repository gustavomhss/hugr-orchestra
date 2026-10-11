export * as RawPayload from "./raw-payload"

import { Option, Schema } from "effect"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { userText } from "./alias"
import { getNodeValue, parseTree } from "jsonc-parser"
import type { Node } from "jsonc-parser"

const parse = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const line = (value: string) => value.replace(/\s+/g, " ").trim()
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)

/** C16's bounded reach: known source bytes and complete source objects, not prose quality or arbitrary base64-looking text. */
export function inventory(history: SessionV1.WithParts[]) {
  const media: string[] = []
  const blobs: string[] = []
  const objects = new Set<string>()
  const file = (part: SessionV1.FilePart) => {
    if (!/^(image\/|application\/pdf$)/.test(part.mime) || !part.url.startsWith("data:")) return
    media.push(part.url, part.url.slice(part.url.indexOf(",") + 1))
  }
  for (const message of history) {
    const ask = userText(message)
    if (ask.length >= 512) blobs.push(line(ask))
    for (const part of message.parts) {
      if (part.type === "file") file(part)
      if (part.type === "patch") objects.add(canonical({ hash: part.hash, files: part.files }))
      if (part.type !== "tool") continue
      objects.add(canonical(part)); objects.add(canonical(part.state))
      if (Object.keys(part.state.input).length) objects.add(canonical(part.state.input))
      objects.add(canonical({ tool: part.tool, callID: part.callID, input: part.state.input }))
      objects.add(canonical({ type: "tool-call", toolCallId: part.callID, toolName: part.tool, input: part.state.input }))
      objects.add(canonical({ type: "tool_use", id: part.callID, name: part.tool, input: part.state.input }))
      if (part.state.status !== "completed") continue
      part.state.attachments?.forEach(file)
      objects.add(canonical({ output: part.state.output }))
      objects.add(canonical({ type: "tool_result", tool_use_id: part.callID, content: part.state.output }))
      objects.add(canonical({ type: "tool-result", toolCallId: part.callID, toolName: part.tool, output: { type: "text", value: part.state.output } }))
      if (part.state.output.length >= 512) blobs.push(line(part.state.output))
      if (["read", "write", "edit", "apply_patch"].includes(part.tool))
        Object.entries(part.state.input).forEach(([key, value]) => {
          if (["content", "text", "patch", "patchText", "oldString", "newString"].includes(key) && typeof value === "string" && value.length >= 512)
            blobs.push(line(value))
        })
    }
  }
  return (value: string) => {
    if (media.some((bytes) => bytes.length > 0 && value.replace(/\s/g, "").includes(bytes.replace(/\s/g, "")))) return true
    if (blobs.some((bytes) => bytes.length > 0 && line(value).includes(bytes))) return true
    const json = parse(value)
    if (Option.isSome(json) && json.value !== null && typeof json.value === "object" && objects.has(canonical(json.value))) return true
    const known = (node: Node): boolean => {
      const parsed: unknown = getNodeValue(node)
      return parsed !== null && typeof parsed === "object" && objects.has(canonical(parsed)) || (node.children ?? []).some(known)
    }
    // Parse actual embedded JSON nodes; order/whitespace variations and wrappers do not change known source objects.
    for (let index = 0; index < value.length; index++) {
      if (value[index] !== "{" && value[index] !== "[") continue
      const tree = parseTree(value.slice(index))
      if (tree && known(tree)) return true
    }
    return false
  }
}
