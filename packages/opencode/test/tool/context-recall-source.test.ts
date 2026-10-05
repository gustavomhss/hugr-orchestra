import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Effect, Layer } from "effect"
import { Agent } from "@/agent/agent"
import { Archive } from "@/continuity/archive"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { ContextRecallTool } from "@/tool/context-recall"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const layer = LayerNode.compile(
  LayerNode.group([Session.node, SessionProjector.node, Agent.node, Truncate.node, Database.node, Archive.node]),
)
const seed = Effect.gen(function* () {
  const session = yield* Session.Service
  const chat = yield* session.create()
  const user = yield* session.updateMessage({
    id: MessageID.ascending(),
    sessionID: chat.id,
    role: "user",
    agent: "build",
    model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
    time: { created: 1 },
    system: "Historical field_scope applies only to this turn.",
  })
  const info = yield* ContextRecallTool
  const tool = yield* Tool.init(info)
  const ctx: Tool.Context = {
    sessionID: chat.id,
    messageID: user.id,
    agent: "build",
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
  return { session, chat, user, tool, ctx }
})

function response(output: string) {
  return JSON.parse(output) as {
    status: string
    source: { message_id: string; part_id?: string }
    content: string
    complete: boolean
    offset: number
    next_offset?: number
    total_chars: number
    matches: { source: { part_id?: string }; field: string; snippet: string; snippet_offset: number }[]
  }
}

const recover = Effect.fn("RecallSourceTest.recover")(function* (
  tool: Tool.InferDef<typeof ContextRecallTool>,
  ctx: Tool.Context,
  source: { message_id: MessageID; part_id?: PartID },
) {
  const pages: string[] = []
  let offset = 0
  while (true) {
    const result = yield* tool.execute({ ...source, offset, limit: 8000 }, ctx)
    expect(Buffer.byteLength(result.output, "utf8")).toBeLessThanOrEqual(8000)
    expect(result.output).not.toContain("QQQQ")
    const page = response(result.output)
    expect(page.source).toEqual(source)
    expect(page.offset).toBe(offset)
    pages.push(page.content)
    if (page.complete) {
      expect(page.next_offset).toBeUndefined()
      expect(pages.join("").length).toBe(page.total_chars)
      return JSON.parse(pages.join("")) as { info: Record<string, unknown>; parts: Record<string, unknown>[] }
    }
    expect(page.next_offset).toBe(offset + page.content.length)
    expect(page.next_offset).toBeGreaterThan(offset)
    offset = page.next_offset!
  }
})

describe("context_recall source recovery", () => {
  it.instance("recovers stored tool input and literal captured output through all pages by original IDs", () =>
    Effect.gen(function* () {
      const f = yield* seed
      const input = { filepath: "/recorded/only/config.json", huge: "😀\\\n".repeat(5000), nested: { enabled: false } }
      const output = JSON.stringify({ padding: "x".repeat(10000), receipt: { code: "RAW-LEAF-ZX19", exit: 1 } })
      const part = yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.user.id,
        type: "tool",
        tool: "read",
        callID: "recorded_call",
        state: {
          status: "completed",
          input,
          output,
          title: "receipt",
          time: { start: 1, end: 2 },
          metadata: { exit: 1, truncated: true, outputPath: "/volatile/captured.txt" },
        },
      })
      const source = { message_id: part.messageID, part_id: part.id }
      const record = (yield* recover(f.tool, f.ctx, source)).parts[0]
      expect(record.source).toEqual(source)
      expect(record.input).toEqual(input)
      expect(record.output).toBe(output)
      expect(JSON.parse(String(record.output)).receipt).toEqual({ code: "RAW-LEAF-ZX19", exit: 1 })
      expect(record.original_extent).toBe("truncated")
      expect(record.extent).toBe("stored_preview")
      expect(record.saved_file).toMatchObject({ availability: "unverified", lifetime: "volatile" })
      const system = yield* recover(f.tool, f.ctx, { message_id: f.user.id })
      expect(system.info.system).toBe(f.user.system)
      const pending = yield* f.session.updatePart({
        ...part,
        state: {
          status: "pending",
          input: { filepath: input.filepath },
          raw: '{"filepath":"/recorded/only/config.json"}',
        },
      })
      const pendingRecord = (yield* recover(f.tool, f.ctx, { message_id: pending.messageID, part_id: pending.id }))
        .parts[0]
      expect(pendingRecord.input).toEqual({ filepath: input.filepath })
      expect(pendingRecord.raw).toBe(pending.state.raw)
      expect(pendingRecord.availability).toBe("found")
      expect(pendingRecord.output_availability).toBe("unavailable")
      expect(pendingRecord.original_extent).toBe("unknown")
    }).pipe(Effect.provide(layer)),
  )

  it.instance("recovers agent, subtask and safe file-source metadata without media bytes", () =>
    Effect.gen(function* () {
      const f = yield* seed
      const agent = yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.user.id,
        type: "agent",
        name: "catalogued-agent",
      })
      const subtask = yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.user.id,
        type: "subtask",
        prompt: "Recorded delegation prompt",
        description: "Recorded task description",
        agent: "catalogued-agent",
        command: "recorded-command",
      })
      expect((yield* recover(f.tool, f.ctx, { message_id: agent.messageID, part_id: agent.id })).parts[0].name).toBe(
        agent.name,
      )
      expect(
        (yield* recover(f.tool, f.ctx, { message_id: subtask.messageID, part_id: subtask.id })).parts[0],
      ).toMatchObject({
        prompt: subtask.prompt,
        description: subtask.description,
        agent: subtask.agent,
        command: subtask.command,
        availability: "found",
        extent: "stored_record",
      })
      const sources: NonNullable<SessionV1.FilePart["source"]>[] = [
        { type: "file", path: "/recorded/source.png", text: { value: "not catalogued", start: 0, end: 14 } },
        {
          type: "symbol",
          path: "/recorded/module.ts",
          name: "ExactSymbol",
          kind: 12,
          range: { start: { line: 1, character: 2 }, end: { line: 3, character: 4 } },
          text: { value: "not catalogued", start: 0, end: 14 },
        },
        {
          type: "resource",
          clientName: "recorded-client",
          uri: `data:image/png;base64,${"Q".repeat(20000)}`,
          text: { value: "not catalogued", start: 0, end: 14 },
        },
        {
          type: "resource",
          clientName: "recorded-client",
          uri: `DATA:image/png;base64,${"Q".repeat(20000)}`,
          text: { value: "not catalogued", start: 0, end: 14 },
        },
        {
          type: "resource",
          clientName: "recorded-client",
          uri: "https://recorded.invalid/image.png",
          text: { value: "not catalogued", start: 0, end: 14 },
        },
      ]
      for (const scheme of ["data", "DATA"])
        for (const source of sources) {
          const file = yield* f.session.updatePart({
            id: PartID.ascending(),
            sessionID: f.chat.id,
            messageID: f.user.id,
            type: "file",
            mime: "image/png",
            filename: "recorded-image.png",
            url: `${scheme}:image/png;base64,${"Q".repeat(20000)}`,
            source,
          })
          expect(file.url).toContain("QQQQ") // Positive control: stored bytes exist before recall redaction.
          const stored = yield* f.session.getPart({ sessionID: f.chat.id, messageID: file.messageID, partID: file.id })
          expect(stored).toMatchObject({ type: "file", url: file.url, source })
          const expectedSource =
            source.type === "resource"
              ? {
                  type: "resource",
                  clientName: source.clientName,
                  uri: source.uri === "https://recorded.invalid/image.png" ? source.uri : "[inline attachment]",
                }
              : source.type === "symbol"
                ? { type: "symbol", path: source.path, name: source.name, range: source.range, kind: source.kind }
                : { type: "file", path: source.path }
          const document = yield* recover(f.tool, f.ctx, { message_id: file.messageID, part_id: file.id })
          const record = document.parts[0]
          expect(record).toMatchObject({
            source: { message_id: file.messageID, part_id: file.id },
            type: "file",
            mime: file.mime,
            filename: file.filename,
            availability: "metadata_only",
            extent: "media_metadata_only",
            original_extent: "unknown",
            inline: true,
          })
          expect(record.encoded_chars).toBe(file.url.length)
          expect(record.file_source).toEqual(expectedSource)
          expect(record.locator).toBeUndefined()
          expect(JSON.stringify(document).includes("QQQQ")).toBe(false)
          expect(record.resource_availability).toBe("unverified")
          const tool = yield* f.session.updatePart({
            id: PartID.ascending(),
            sessionID: f.chat.id,
            messageID: f.user.id,
            type: "tool",
            tool: "read",
            callID: "media_receipt",
            state: {
              status: "completed",
              input: {},
              output: "stored media receipt",
              title: "receipt",
              metadata: {},
              time: { start: 1, end: 2 },
              attachments: [file],
            },
          })
          const receipt = (yield* recover(f.tool, f.ctx, { message_id: tool.messageID, part_id: tool.id })).parts[0]
          expect(receipt.source).toEqual({ message_id: tool.messageID, part_id: tool.id })
          expect(receipt.output).toBe("stored media receipt")
          expect(receipt.attachments).toEqual([record])
        }
    }).pipe(Effect.provide(layer)),
  )

  it.instance("uses original UTF-16 match offsets and escapes literal regex metacharacters", () =>
    Effect.gen(function* () {
      const f = yield* seed
      const text = yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.user.id,
        type: "text",
        text: `${"İ".repeat(400)}NEEDLE suffix`,
      })
      const match = response((yield* f.tool.execute({ query: "needle" }, f.ctx)).output)
      expect(match.status).toBe("found")
      expect(match.matches[0].source.part_id).toBe(text.id)
      expect(match.matches[0].snippet_offset).toBe(320)
      expect(match.matches[0].snippet).toBe(text.text.slice(320))
      expect(match.matches[0].snippet).toContain("NEEDLE")
      expect(match.matches[0].snippet_offset + match.matches[0].snippet.indexOf("NEEDLE")).toBe(400)
      yield* f.session.updatePart({ ...text, text: "before.+after [literal](x) $^\\" })
      for (const query of [".+", "[literal](x)", "$^\\"]) {
        const literal = response((yield* f.tool.execute({ query }, f.ctx)).output)
        expect(literal.status).toBe("found")
        expect(literal.matches[0].snippet).toContain(query)
      }
      yield* f.session.updatePart({ ...text, text: "plain letters" })
      const absent = response((yield* f.tool.execute({ query: ".+" }, f.ctx)).output)
      expect(absent.status).toBe("not_found")
      expect(absent.matches).toEqual([])
    }).pipe(Effect.provide(layer)),
  )

  it.instance("searches recovered input, subtask, agent and media metadata fields", () =>
    Effect.gen(function* () {
      const f = yield* seed
      yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.user.id,
        type: "tool",
        tool: "read",
        callID: "search_input",
        state: { status: "pending", input: { filepath: "/recorded/InputOnly-42.txt" }, raw: "" },
      })
      yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.user.id,
        type: "subtask",
        prompt: "PromptOnly-42",
        description: "DescriptionOnly-42",
        agent: "SubtaskAgentOnly-42",
        command: "CommandOnly-42",
      })
      yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.user.id,
        type: "agent",
        name: "AgentOnly-42",
      })
      yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.user.id,
        type: "file",
        mime: "image/png",
        filename: "ImageOnly-42.png",
        url: `data:image/png;base64,${"Q".repeat(20000)}`,
      })
      for (const query of [
        "InputOnly-42",
        "PromptOnly-42",
        "DescriptionOnly-42",
        "SubtaskAgentOnly-42",
        "CommandOnly-42",
        "AgentOnly-42",
        "ImageOnly-42",
      ]) {
        const out = response((yield* f.tool.execute({ query }, f.ctx)).output)
        expect(out.status).toBe("found")
        expect(out.matches.length).toBeGreaterThan(0)
        expect(out.matches[0].snippet).toContain(query)
      }
      expect(response((yield* f.tool.execute({ query: "QQQQ" }, f.ctx)).output).status).toBe("not_found")
    }).pipe(Effect.provide(layer)),
  )
})
