import { expect } from "bun:test"
import { Effect, Schema, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import { SessionSchema } from "@orchestra/core/session"
import type { Controls, Ctx } from "./lucy-engagement"
import { reply, stage, text } from "./lucy-engagement"
import { canonical, digest, manifest, readAll, type Report } from "./lucy-engagement-artifacts"

export type Call = { readonly id: string; readonly name: string; readonly input: unknown }
export const code: Call = { id: "history_code_control", name: "code_search",
  input: { pattern: "sharedValue", paths: ["**/*"] } }
export const request = (requestID: string, profile = "audit") => ({
  kind: "engagement", requestID, profile, timeBoxMinutes: 5, paths: ["src"],
  brief: "Audit the exact captured source and its repository history. Use forensics for bounded historical observations; do not rate people.",
})

/** Only provider transport is scripted; calls settle in the real registered native Session runner. */
export function script(calls: readonly Call[] | (() => readonly Call[]), before: Effect.Effect<void> = Effect.void,
  options: { readonly at?: "entry" | "lens" | "verify"; readonly quote?: boolean } = {}) {
  const started = new Set<string>()
  const stream: NonNullable<Controls["stream"]> = (log, modelRequest) => {
    if (stage(log.text) !== (options.at ?? "entry") || started.has(log.sessionID))
      return text(reply(log, modelRequest, { quote: options.quote ?? false }))
    started.add(log.sessionID)
    return Stream.unwrap(before.pipe(Effect.map(() => Stream.fromIterable([
      LLMEvent.stepStart({ index: 0 }),
      ...(typeof calls === "function" ? calls() : calls).flatMap((call) => [
        LLMEvent.toolInputStart({ id: call.id, name: call.name }),
        LLMEvent.toolInputDelta({ id: call.id, name: call.name, text: JSON.stringify(call.input) }),
        LLMEvent.toolInputEnd({ id: call.id, name: call.name }),
        LLMEvent.toolCall(call),
      ]),
      LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
      LLMEvent.finish({ reason: "tool-calls" }),
    ]))))
  }
  return { stream, started }
}

export const native = (host: Ctx, sessionID: string) => host.sessions.context(SessionSchema.ID.make(sessionID)).pipe(
  Effect.map((messages) => messages.flatMap((message) => message.type !== "assistant" ? [] :
    message.content.flatMap((part) => part.type !== "tool" ? [] : [{
      sessionID, assistantMessageID: message.id, toolCallID: part.id, name: part.name, providerExecuted: part.provider?.executed,
      input: part.state.input, state: part.state,
      text: "content" in part.state ? part.state.content.flatMap((content) =>
        content.type === "text" ? [content.text] : []).join("\n") : "",
    }]))),
)

export const completed = (host: Ctx, sessionID: string, id: string) => Effect.gen(function* () {
  const item = (yield* native(host, sessionID)).find((call) => call.toolCallID === id)
  expect(item, id).toBeDefined()
  if (!item) throw new Error("native tool event absent: " + id)
  expect(item.state.status, item.text).toBe("completed")
  expect(item.providerExecuted).not.toBe(true)
  return item
})

export const History = Schema.Struct({
  schema: Schema.Literal("review-engagement-history-v1"), historyID: Schema.String,
  sourceSha256: Schema.String, anchorCommit: Schema.String,
  op: Schema.Literals(["show", "log", "pickaxe", "blame"]), path: Schema.String,
  selection: Schema.Struct({ endCommit: Schema.String, startCommit: Schema.optional(Schema.String) }),
  complete: Schema.Boolean, truncated: Schema.Boolean,
  notExamined: Schema.Array(Schema.Struct({ item: Schema.String, reason: Schema.String })),
  text: Schema.String,
})
export type History = typeof History.Type

export const history = (host: Ctx, report: Report, id: string) => Effect.gen(function* () {
  const source = report.source
  expect(source, "history report must carry the captured source").toBeDefined()
  if (!source) throw new Error("history report has no captured source")
  const event = yield* completed(host, report.sessionID, id)
  const value = Schema.decodeUnknownSync(History)(JSON.parse(event.text), { onExcessProperty: "error" })
  expect(event.text).toBe(canonical(value))
  expect(Buffer.byteLength(event.text)).toBeLessThanOrEqual(32768)
  expect(value.historyID).toMatch(/^[0-9a-f]{64}$/)
  expect(value.sourceSha256).toBe(source.sha256)
  expect(value.anchorCommit).toBe(source.commit)
  const identity = { schema: "review-engagement-history-operation-v1", inputHash: report.inputHash,
    sourceSha256: value.sourceSha256, sessionID: event.sessionID,
    assistantMessageID: event.assistantMessageID, toolCallID: event.toolCallID, name: "review_history" }
  expect(value.historyID).toBe(digest(canonical(identity)))
  return { value, event }
})

const Descriptor = Schema.Struct({ artifactID: Schema.String, sha256: Schema.String, bytes: Schema.Number,
  mime: Schema.String, kind: Schema.String, complete: Schema.Boolean, uri: Schema.optional(Schema.String) })
const Retained = Schema.Struct({
  schema: Schema.Literal("review-engagement-evidence-v2"), reportID: Schema.String,
  inputHash: Schema.String, sourceSha256: Schema.String,
  operations: Schema.Array(Schema.Unknown), hostProofs: Schema.Array(Schema.Unknown),
  artifacts: Schema.Array(Descriptor), history: Schema.Array(Schema.Struct({
    historyID: Schema.String, artifactID: Schema.String,
  })),
})
const Proof = Schema.Struct({
  schema: Schema.Literal("review-engagement-history-proof-v1"),
  historyID: Schema.String, inputHash: Schema.String, sourceSha256: Schema.String, anchorCommit: Schema.String,
  budget: Schema.Struct({ startedAt: Schema.Number, deadlineAt: Schema.Number }),
  sessionID: Schema.String, assistantMessageID: Schema.String, toolCallID: Schema.String,
  name: Schema.Literal("review_history"), input: Schema.Unknown, result: History,
  nativeSettlement: Schema.Struct({ status: Schema.Literal("completed"), messageID: Schema.String }),
})

/** Independent reader: never import a future production history schema or manufacture producer receipts. */
export const retained = (host: Ctx, report: Report) => Effect.gen(function* () {
  const source = report.source
  expect(source, "history report must carry the captured source").toBeDefined()
  if (!source) throw new Error("history report has no captured source")
  const index = (yield* manifest(host, report.reportID)).value
  const body = yield* readAll(host, index, index.manifest)
  const raw: unknown = JSON.parse(body.bytes.toString("utf8"))
  expect(body.bytes.toString("utf8")).toBe(canonical(raw))
  const value = Schema.decodeUnknownSync(Retained)(raw)
  expect(value.history.length).toBeGreaterThan(0)
  expect(new Set(value.history.map((item) => item.historyID)).size).toBe(value.history.length)
  expect(value.reportID).toBe(report.reportID)
  expect(value.inputHash).toBe(report.inputHash)
  expect(value.sourceSha256).toBe(source.sha256)
  expect(index.counts.operations).toBe(value.operations.length + value.history.length)
  expect(index.counts.artifacts).toBe(value.artifacts.length)
  expect(index.counts.hostProofs).toBe(value.hostProofs.length)
  expect(value.artifacts.length).toBeLessThanOrEqual(256)
  expect(value.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0)).toBeLessThanOrEqual(64 * 1024 * 1024)
  const proofs = yield* Effect.forEach(value.history, (reference) => Effect.gen(function* () {
    const artifact = value.artifacts.find((item) => item.artifactID === reference.artifactID)
    expect(artifact?.kind).toBe("history")
    if (!artifact) throw new Error("retained history body has no descriptor")
    const { artifactID, ...descriptor } = artifact
    expect(artifactID).toBe(digest(canonical(descriptor)))
    const read = yield* readAll(host, index, artifact)
    const proof = Schema.decodeUnknownSync(Proof)(JSON.parse(read.bytes.toString("utf8")), { onExcessProperty: "error" })
    expect(read.bytes.toString("utf8")).toBe(canonical(proof))
    expect(proof.historyID).toBe(reference.historyID)
    expect(proof.result.historyID).toBe(reference.historyID)
    expect(proof.inputHash).toBe(report.inputHash)
    expect(proof.sourceSha256).toBe(source.sha256)
    expect(proof.anchorCommit).toBe(source.commit)
    expect(proof.budget).toEqual(report.budget)
    expect(proof.sessionID).toBe(report.sessionID)
    const event = yield* completed(host, proof.sessionID, proof.toolCallID)
    expect(event.name).toBe("review_history")
    expect(proof.assistantMessageID).toBe(event.assistantMessageID)
    expect(proof.nativeSettlement.messageID).toBe(event.assistantMessageID)
    expect(proof.input).toEqual(event.input)
    expect(proof.historyID).toBe(digest(canonical({ schema: "review-engagement-history-operation-v1",
      inputHash: report.inputHash, sourceSha256: source.sha256, sessionID: event.sessionID,
      assistantMessageID: event.assistantMessageID, toolCallID: event.toolCallID, name: "review_history" })))
    const input = Schema.decodeUnknownSync(Schema.Struct({ op: Schema.Literals(["show", "log", "pickaxe", "blame"]), path: Schema.String,
      rev: Schema.optional(Schema.String), range: Schema.optional(Schema.String) }))(event.input)
    expect(proof.result.sourceSha256).toBe(source.sha256)
    expect(proof.result.anchorCommit).toBe(source.commit)
    expect(proof.result.op).toBe(input.op)
    expect(proof.result.path).toBe(input.path)
    expect(source.files.some((file) => file.path === input.path)).toBe(true)
    expect(proof.result.selection).toEqual(input.range === undefined
      ? { endCommit: input.rev === undefined || input.rev === "HEAD" ? source.commit : input.rev }
      : { startCommit: input.range.split("..")[0], endCommit: input.range.split("..")[1] })
    const model = Schema.decodeUnknownSync(History)(JSON.parse(event.text), { onExcessProperty: "error" })
    expect(model.historyID).toBe(proof.historyID)
    if (!model.truncated) expect(proof.result).toEqual(model)
    return { artifact, proof, bytes: read.bytes }
  }))
  return { index, value, proofs, bytes: body.bytes }
})

