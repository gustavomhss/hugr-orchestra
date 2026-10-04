import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { SessionID } from "@/session/schema"
import type { ArchiveChunk } from "./memory-types"
import { chunk, fenced, identity, split } from "./archive-format"

export * as Transcript from "./transcript"

export function transcript(messages: SessionV1.WithParts[]): string {
  validate(messages, messages[0]?.info.sessionID)
  return messages.map(render).join("\n\n")
}

export function chunks(sessionID: SessionID, messages: SessionV1.WithParts[]): ArchiveChunk[] {
  identity(sessionID, "ses")
  validate(messages, sessionID)
  return messages.flatMap((message) => {
    const pieces = split(render(message))
    return pieces.map((payload, index) => chunk(sessionID, message.info.id, message.info.role, index + 1, pieces.length, payload))
  })
}

function validate(messages: SessionV1.WithParts[], sessionID?: SessionID) {
  if (sessionID !== undefined) identity(sessionID, "ses")
  const ids = new Set<string>()
  const parts = new Set<string>()
  for (const message of messages) {
    identity(message.info.id, "msg")
    if (message.info.sessionID !== sessionID) throw new Error("archive-foreign-session")
    if (ids.has(message.info.id)) throw new Error("archive-duplicate-message")
    ids.add(message.info.id)
    if (message.info.role !== "user" && message.info.role !== "assistant") throw new Error("archive-invalid-role")
    if (message.info.role === "assistant") identity(message.info.parentID, "msg")
    for (const part of message.parts) {
      own(part, message)
      if (parts.has(part.id)) throw new Error("archive-duplicate-part")
      parts.add(part.id)
      if (part.type === "tool" && part.state.status === "completed")
        for (const attachment of part.state.attachments ?? []) own(attachment, message)
    }
  }
}

function own(part: SessionV1.Part, message: SessionV1.WithParts) {
  identity(part.id, "prt")
  if (part.sessionID !== message.info.sessionID || part.messageID !== message.info.id)
    throw new Error("archive-foreign-part")
}

function render(message: SessionV1.WithParts) {
  const info = message.info
  const sections = [`## ${info.role} message ${info.id}`, `Session: ${info.sessionID}`]
  if (info.role === "user" && info.system !== undefined)
    sections.push(`### Turn context (historical)\n\n${fenced(info.system)}`)
  if (info.role === "assistant") {
    sections.push(`Agent: ${JSON.stringify(info.agent)}; finish: ${JSON.stringify(info.finish ?? "unfinished")}`)
    if (info.summary) sections.push("Native compaction summary.")
    if (info.error) sections.push(`### Message error: ${info.error.name}\n\n${fenced(json(info.error.data), "json")}`)
    if (info.structured !== undefined) sections.push(`### Structured output\n\n${fenced(json(info.structured), "json")}`)
  }
  for (const part of message.parts) {
    if (part.type === "reasoning") continue
    const heading = `### ${part.type} — ${part.id}`
    switch (part.type) {
      case "text":
        sections.push(`${heading}\n\n${qualifiers(part.metadata, "full")}` +
          `${part.ignored ? "\nIgnored in model context." : ""}${part.synthetic ? "\nSynthetic text." : ""}\n\n${fenced(part.text)}`)
        break
      case "tool":
        sections.push(tool(part))
        break
      case "file":
        sections.push(`${heading}\n\n${media(part)}`)
        break
      case "subtask":
        sections.push(`${heading}\n\nAgent: ${JSON.stringify(part.agent)}\n\nDescription:\n${fenced(part.description)}` +
          `\n\nPrompt:\n${fenced(part.prompt)}${part.command !== undefined ? `\n\nCommand:\n${fenced(part.command)}` : ""}`)
        break
      case "agent":
        sections.push(`${heading}\n\n${fenced(part.name)}${part.source ? `\n\nSource:\n${fenced(part.source.value)}` : ""}`)
        break
      case "retry":
        sections.push(`${heading}\n\nAttempt: ${part.attempt}; error: ${part.error.name}\n\n${fenced(json(part.error.data), "json")}`)
        break
      case "compaction":
        sections.push(`${heading}\n\nNative compaction; automatic: ${part.auto}; overflow: ${part.overflow ?? false}` +
          `${part.tail_start_id ? `; retained tail: ${part.tail_start_id}` : ""}.`)
        break
      case "patch":
        sections.push(`${heading}\n\n${fenced(json({ hash: part.hash, files: part.files }), "json")}`)
        break
      case "snapshot":
        sections.push(`${heading}\n\n${fenced(part.snapshot)}`)
        break
      case "step-start":
        sections.push(`${heading}\n\nStep started.${part.snapshot ? `\n\nSnapshot:\n${fenced(part.snapshot)}` : ""}`)
        break
      case "step-finish":
        sections.push(`${heading}\n\nFinish reason:\n${fenced(part.reason)}` +
          `${part.snapshot ? `\n\nSnapshot:\n${fenced(part.snapshot)}` : ""}`)
        break
      default:
        throw new Error("archive-unsupported-part")
    }
  }
  const result = sections.join("\n\n")
  if (!result.isWellFormed()) throw new Error("archive-invalid-unicode")
  return result
}

function tool(part: SessionV1.ToolPart) {
  const state = part.state
  const meta: unknown = "metadata" in state ? state.metadata : undefined
  const compacted = state.status === "completed" && state.time.compacted !== undefined
  const sections = [
    `### Tool ${JSON.stringify(part.tool)} — ${part.id}`,
    `Call: ${JSON.stringify(part.callID)}; status: ${state.status}`,
    qualifiers(meta, "unknown", compacted),
    `Input:\n${fenced(json(state.input), "json")}`,
  ]
  if ("time" in state) sections.push(`Lifecycle:\n${fenced(json(state.time), "json")}`)
  if ("title" in state && state.title !== undefined) sections.push(`Title:\n${fenced(state.title)}`)
  if (state.status === "pending") sections.push(`Raw input (pending):\n${fenced(state.raw)}`)
  if (state.status === "running" || state.status === "pending") sections.push("Output unavailable: tool has not completed.")
  // Never parse output as JSON: even unsafe numeric lexemes must survive exactly.
  if (state.status === "completed") {
    sections.push(`Captured output${compacted ? " (compacted; retained bytes only)" : ""}:\n${fenced(state.output)}`)
    for (const attachment of state.attachments ?? []) sections.push(`Attachment ${attachment.id}:\n${media(attachment)}`)
  }
  if (state.status === "error") sections.push(`Captured error:\n${fenced(state.error)}`)
  return sections.join("\n\n")
}

function qualifiers(value: unknown, fallback: string, compacted = false) {
  const meta = value !== null && typeof value === "object" ? value as Record<string, unknown> : {}
  const extent = compacted ? "cleared" : meta.extent === "cleared" || meta.extent === "unavailable" ? meta.extent :
    meta.truncated === true ? "preview" : ["full", "preview", "unknown"].includes(String(meta.extent)) ? meta.extent :
    meta.truncated === false ? "full" : fallback
  return `Availability: ${extent}; captured bytes retained; original completeness is not inferred.` +
    `${typeof meta.truncated === "boolean" ? ` Truncated: ${meta.truncated}.` : ""}` +
    `${typeof meta.exit === "number" ? ` Exit: ${meta.exit}.` : ""}` +
    `${typeof meta.outputPath === "string" ? `\nOriginal output locator: ${JSON.stringify(locator(meta.outputPath))}` : ""}`
}

function locator(value: string) {
  return /^\s*data:/i.test(value) ? "[inline media omitted; retained session is canonical]" : value
}

function media(part: SessionV1.FilePart) {
  const source = part.source
  return `Media metadata only; binary content remains in the canonical session/source.\n${fenced(json({
    mime: part.mime, filename: part.filename, url: locator(part.url),
    ...(source && { source: {
      type: source.type,
      ...(source.type === "resource" ? { clientName: source.clientName, uri: locator(source.uri) } : { path: locator(source.path) }),
      ...(source.type === "symbol" && { name: source.name, range: source.range, kind: source.kind }),
      selection: { start: source.text.start, end: source.text.end },
    } }),
  }), "json")}`
}

function json(value: unknown): string {
  const result = JSON.stringify(value, null, 2)
  if (result === undefined) throw new Error("archive-invalid-json")
  return result
}
