import type { MessageID, SessionID } from "@/session/schema"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { MemoryArtifact, MemorySnapshot } from "./memory-types"
import { createHash } from "node:crypto"
import { isSafe } from "./trigger"
import { validReview } from "./review-seal"

export type Snapshot = {
  sessionID: SessionID
  boundary: MessageID
  tailStart?: MessageID
}

export type ContinuityContext = Snapshot & {
  text: string
  artifact?: MemoryArtifact
}

// The decoder owns transport validation. These checks establish compatibility,
// ownership and coverage, never semantic accuracy of the historical memory.
export function hasArtifact(
  context: ContinuityContext,
): context is ContinuityContext & { artifact: MemoryArtifact } {
  const artifact = context.artifact
  return (
    (artifact?.version === 4 || artifact?.version === 5) && Array.isArray(artifact.items) && Number.isSafeInteger(artifact.next) &&
    nonempty(context.sessionID) &&
    artifact.parentID === context.sessionID &&
    nonempty(artifact.producerID) && artifact.producerID !== context.sessionID &&
    nonempty(artifact.boundary) && artifact.boundary === context.boundary &&
    (artifact.version === 4 ? nonempty(artifact.tailStart) && artifact.tailStart === context.tailStart &&
      nonempty(artifact.coveredThrough) && artifact.coveredThrough !== artifact.tailStart && artifact.coveredThrough !== artifact.boundary
      : context.tailStart === undefined && artifact.tailStart === undefined && artifact.coveredThrough === artifact.boundary && singleLine(artifact.now?.doing) &&
        singleLine(artifact.now?.next) && Array.isArray(artifact.now?.src) && artifact.now.src.length > 0 &&
        artifact.now.src.every((alias) => /^[uat][1-9][0-9]*$/.test(alias)) && Array.isArray(artifact.covered) &&
        artifact.covered.length > 0 && artifact.covered.at(-1)?.id === artifact.boundary &&
        artifact.covered.every((source) => nonempty(source.id) && /^[a-f0-9]{64}$/.test(source.digest)) && validReview(artifact)) &&
    nonempty(artifact.text)
  )
}

export const singleLine = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && !/[\r\n\u2028\u2029]/.test(value)

export function fingerprint(message: SessionV1.WithParts) {
  // Durable semantic records, not provider bookkeeping/cost that can arrive after step completion.
  const info = message.info
  const data = { id: info.id, role: info.role, sessionID: info.sessionID,
    user: info.role === "user" ? { system: info.system } : undefined,
    assistant: info.role === "assistant" ? { parentID: info.parentID, finish: info.finish, error: info.error, providerID: info.providerID, modelID: info.modelID,
      completed: info.time.completed !== undefined, summary: info.summary, structured: info.structured, agent: info.agent, mode: info.mode } : undefined,
    parts: message.parts.map(semanticPart) }
  return createHash("sha256").update(JSON.stringify(data, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value)).digest("hex")
}

function metadata(value: unknown, read = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  // Timing and read's loaded-rule cache affect delivery bookkeeping, not historical meaning.
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "timing" && !(read && key === "loaded")))
}

export function semanticPart(part: SessionV1.Part): unknown {
  const base = { id: part.id, type: part.type, sessionID: part.sessionID, messageID: part.messageID }
  if (part.type === "step-start") return { ...base, snapshot: part.snapshot }
  if (part.type === "step-finish") return { ...base, snapshot: part.snapshot, reason: part.reason }
  if (part.type === "tool") {
    const state = part.state
    return { ...base, callID: part.callID, tool: part.tool, callMetadata: metadata(part.metadata), status: state.status, input: state.input,
      ...state.status === "completed" ? { output: state.output, title: state.title, resultMetadata: metadata(state.metadata, part.tool === "read"), attachments: state.attachments?.map(semanticPart) } : {},
      ...state.status === "error" ? { error: state.error, resultMetadata: metadata(state.metadata, part.tool === "read") } : {},
      ...state.status === "pending" ? { raw: state.raw } : {} }
  }
  if (part.type === "text" || part.type === "reasoning") return { ...base, text: part.text, metadata: metadata(part.metadata),
    ...part.type === "text" ? { ignored: part.ignored, synthetic: part.synthetic } : {} }
  if (part.type === "file") return { ...base, mime: part.mime, url: part.url, filename: part.filename, source: part.source }
  return Object.fromEntries(Object.entries(part).filter(([key]) => key !== "time").map(([key, value]) => [key, key === "metadata" ? metadata(value) : value]))
}

export function completedPrefix(messages: SessionV1.WithParts[]) {
  // Terminal failures are durable observations inside the prefix; only its final boundary must be a safe success.
  return messages.every((message) => (message.info.role !== "assistant" || message.info.time.completed !== undefined &&
    (!!message.info.error || ["stop", "end_turn", "tool-calls"].includes(message.info.finish ?? ""))) &&
    !message.parts.some((part) => part.type === "tool" && ["pending", "running"].includes(part.state.status)))
}

export function completeIndex(context: ContinuityContext, messages: SessionV1.WithParts[]) {
  if (!hasArtifact(context) || context.artifact.version !== 5 || !ownedHistory(context.sessionID, messages)) return undefined
  const covered = context.artifact.covered
  if (covered.length > messages.length || !completedPrefix(messages.slice(0, covered.length)) || covered.some((source, index) => source.id !== messages[index].info.id || source.digest !== fingerprint(messages[index]))) return undefined
  const boundary = messages[covered.length - 1]?.info
  if (!boundary || boundary.role !== "assistant" || !isSafe(boundary)) return undefined
  return covered.length
}

export function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function ownedHistory(sessionID: SessionID, messages: SessionV1.WithParts[]) {
  return nonempty(sessionID) && new Set(messages.map((message) => message.info.id)).size === messages.length &&
    messages.every((message) => nonempty(message.info.id) && message.info.sessionID === sessionID &&
      (message.info.role === "user" || message.info.role === "assistant") &&
      message.parts.every((part) => part.sessionID === sessionID && part.messageID === message.info.id &&
        (part.type !== "tool" || part.state.status !== "completed" || (part.state.attachments ?? []).every((attachment) =>
          attachment.sessionID === sessionID && attachment.messageID === message.info.id))))
}

export function tailIndex(context: ContinuityContext, messages: SessionV1.WithParts[]) {
  if (!hasArtifact(context) || !ownedHistory(context.sessionID, messages)) return
  if (context.artifact.version !== 4) return completeIndex(context, messages)
  const index = messages.findIndex((message) => message.info.id === context.tailStart)
  const boundary = messages.findIndex((message) => message.info.id === context.boundary)
  const covered = messages.findIndex((message) => message.info.id === context.artifact.coveredThrough)
  // An absent covered prefix is valid only if the history starts at the native tail.
  // The tail may start inside a turn: a long turn is cut between its steps.
  if (index < 0 || boundary < index || covered !== index - 1) return
  return index
}

export function validSnapshot(captured: MemorySnapshot) {
  const messages = [...captured.head, ...captured.tail]
  if (captured.complete === true) {
    const covered = captured.covered
    if (!covered?.length || !captured.head.length || captured.tail.length || captured.tailStart !== undefined ||
       !ownedHistory(captured.sessionID, covered) || !ownedHistory(captured.sessionID, captured.head) || !completedPrefix(covered) || captured.boundary !== covered.at(-1)?.info.id ||
      captured.head.at(-1)?.info.id !== captured.boundary ||
       covered.some((message) => message.info.role === "assistant" && message.info.time.completed === undefined ||
         message.parts.some((part) => part.type === "tool" && ["pending", "running"].includes(part.state.status)))) return false
    const boundary = covered.at(-1)?.info
    if (!boundary || boundary.role !== "assistant" || !isSafe(boundary)) return false
    const prior = captured.previous
    const start = prior?.version === 5 ? prior.covered.length : 0
    if (prior && !hasArtifact({ sessionID: captured.sessionID, boundary: prior.boundary, tailStart: prior.tailStart, text: prior.text, artifact: prior })) return false
    if (captured.head.length !== covered.length - start || captured.head.some((message, index) => fingerprint(message) !== fingerprint(covered[start + index]))) return false
    if (prior?.version === 5 && (prior.coveredThrough !== prior.boundary || prior.covered.some((source, index) =>
      source.id !== covered[index]?.info.id || source.digest !== fingerprint(covered[index])))) return false
    return true
  }
  if (!captured.head.length || !captured.tail.length || !ownedHistory(captured.sessionID, messages) ||
    captured.tailStart !== captured.tail[0].info.id ||
    captured.boundary !== captured.tail.at(-1)?.info.id) return false
  if (!captured.previous) return true
  return tailIndex({ sessionID: captured.sessionID, boundary: captured.previous.boundary,
    tailStart: captured.previous.tailStart, text: captured.previous.text, artifact: captured.previous }, messages) === 0
}

/** A snapshot stays applicable while its boundary is still in the history; later steps only extend the native tail. */
export function isCurrent(snapshot: Snapshot & { complete?: true; covered?: SessionV1.WithParts[] }, history: readonly { info: { id: MessageID }; parts?: SessionV1.Part[] }[]) {
  if (snapshot.complete) return snapshot.covered && completedPrefix(snapshot.covered) && snapshot.covered.every((message, index) => {
    const current = history[index]
    return current?.parts && completedPrefix([current as SessionV1.WithParts]) && current.info.id === message.info.id && fingerprint(current as SessionV1.WithParts) === fingerprint(message)
  }) === true
  return history.some((message) => message.info.id === snapshot.boundary)
}
