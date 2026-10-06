import { describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Effect, Exit, Layer, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Archive } from "@/continuity/archive"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { ContextRecallTool, Parameters } from "@/tool/context-recall"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { ToolJsonSchema } from "@/tool/json-schema"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const layer = LayerNode.compile(
  LayerNode.group([Session.node, SessionProjector.node, Agent.node, Truncate.node, Database.node, Archive.node]),
)
const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const archiveModes = [{ reference: "a".repeat(64) }, { archive_query: "archive" }, { archive_list: true }] as const
const seed = Effect.gen(function* () {
  const session = yield* Session.Service
  const chat = yield* session.create()
  const user = yield* session.updateMessage({
    id: MessageID.ascending(),
    sessionID: chat.id,
    role: "user",
    agent: "build",
    model: ref,
    time: { created: 1 },
    system: "Historical system: keep exact ZX-19.",
  })
  const text = yield* session.updatePart({
    id: PartID.ascending(),
    sessionID: chat.id,
    messageID: user.id,
    type: "text",
    text: "Stored own receipt ZX-19.",
  })
  const assistant = yield* session.updateMessage({
    id: MessageID.ascending(),
    sessionID: chat.id,
    role: "assistant",
    parentID: user.id,
    agent: "build",
    mode: "build",
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: 2 },
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })
  const info = yield* ContextRecallTool
  const tool = yield* Tool.init(info)
  const asks: unknown[] = []
  const ctx: Tool.Context = {
    sessionID: chat.id,
    messageID: assistant.id,
    agent: "build",
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: (request) =>
      Effect.sync(() => {
        asks.push(request)
      }),
  }
  return { session, chat, user, assistant, text, tool, ctx, asks }
})

function reply(output: string) {
  return JSON.parse(output) as {
    status: string
    source: { message_id: string; part_id?: string }
    content: string
    complete: boolean
    next_offset?: number
    offset: number
    total_chars: number
    matches: { source: { message_id: string; part_id?: string }; snippet: string; provenance: { role: string } }[]
  }
}

describe("context_recall", () => {
  it.instance("recovers actual stored text and message-level user.system with original locators", () =>
    Effect.gen(function* () {
      const f = yield* seed
      expect(ToolJsonSchema.fromTool(f.tool)).toMatchObject({
        anyOf: [
          { additionalProperties: false, required: ["message_id"] },
          { additionalProperties: false, required: ["query"] },
          { additionalProperties: false, required: ["reference"] },
          { additionalProperties: false, required: ["archive_query"] },
          { additionalProperties: false, required: ["archive_list"] },
        ],
      })
      const part = reply((yield* f.tool.execute({ message_id: f.user.id, part_id: f.text.id }, f.ctx)).output)
      expect(part.status).toBe("found")
      expect(part.source).toEqual({ message_id: f.user.id, part_id: f.text.id })
      expect(part.content).toContain("Stored own receipt ZX-19.")
      const message = reply((yield* f.tool.execute({ message_id: f.user.id }, f.ctx)).output)
      expect(message.content).toContain("Historical system: keep exact ZX-19.")
      expect(JSON.parse(message.content).info).toEqual({ role: "user", time: { created: 1 }, system: f.user.system })
      expect(f.asks).toEqual(
        [0, 1].map(() => ({
          permission: "context_recall",
          patterns: [f.chat.id],
          always: [f.chat.id],
          metadata: {},
        })),
      )
    }).pipe(Effect.provide(layer)),
  )

  it.instance("denies foreign message and valid foreign part, despite forged extra context", () =>
    Effect.gen(function* () {
      const own = yield* seed
      const foreign = yield* seed
      const valid = reply(
        (yield* foreign.tool.execute({ message_id: foreign.user.id, part_id: foreign.text.id }, foreign.ctx)).output,
      )
      expect(valid.content).toContain("Stored own receipt ZX-19.")
      const ctx = {
        ...own.ctx,
        extra: { session_id: foreign.chat.id },
        messages: [{ info: foreign.user, parts: [foreign.text] }],
      }
      for (const params of [
        { message_id: foreign.user.id },
        { message_id: foreign.user.id, part_id: foreign.text.id },
        { message_id: own.user.id, part_id: foreign.text.id },
      ]) {
        const denied = reply((yield* own.tool.execute(params, ctx)).output)
        expect(denied.status).toBe("unavailable")
        expect(denied.content).toBeUndefined()
      }
      expect(reply((yield* own.tool.execute({ message_id: "msg_missing" }, own.ctx)).output).status).toBe("unavailable")
    }).pipe(Effect.provide(layer)),
  )

  it.instance("resolves memory aliases from this session's stored history only", () =>
    Effect.gen(function* () {
      const own = yield* seed
      const answer = yield* own.session.updatePart({
        id: PartID.ascending(), sessionID: own.chat.id, messageID: own.assistant.id, type: "tool", tool: "question",
        callID: "call_question", state: { status: "completed", input: { questions: [] }, output: "asked", title: "Asked",
          metadata: { answers: [["Ship it"]] }, time: { start: 3, end: 4 } },
      })
      yield* own.session.updatePart({ id: PartID.ascending(), sessionID: own.chat.id, messageID: own.assistant.id,
        type: "text", text: "Assistant reply ZX-20." })
      const lookup = (reference: string) => Effect.gen(function* () {
        return reply((yield* own.tool.execute({ reference }, own.ctx)).output)
      })
      expect((yield* lookup("u1")).source).toEqual({ message_id: own.user.id })
      expect((yield* lookup("u1")).content).toContain("Stored own receipt ZX-19.")
      expect((yield* lookup("a1")).content).toContain("Assistant reply ZX-20.")
      expect((yield* lookup("t1")).source).toEqual({ message_id: own.assistant.id, part_id: answer.id })
      expect((yield* lookup("u2")).source).toEqual({ message_id: own.assistant.id, part_id: answer.id })
      expect((yield* lookup("u2")).content).toContain("Ship it")
      // Numbering is a pure function of stored history: the same alias resolves the same way again.
      expect((yield* lookup("t1")).content).toBe((yield* lookup("t1")).content)
      const foreign = yield* seed
      const denied = reply((yield* foreign.tool.execute({ reference: "a1" }, foreign.ctx)).output)
      expect(denied.status).toBe("unavailable")
      expect((yield* lookup("t9")).status).toBe("unavailable")
    }).pipe(Effect.provide(layer)),
  )

  it.instance("keeps completed lifecycle, exit 1, truncation and volatile saved-file metadata distinct", () =>
    Effect.gen(function* () {
      const f = yield* seed
      const part = yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.assistant.id,
        type: "tool",
        tool: "shell",
        callID: "call_failure",
        state: {
          status: "completed",
          input: {},
          output: "Failed objective: exit 1 stored preview",
          title: "failed command",
          time: { start: 2, end: 3, compacted: 4 },
          metadata: { exit: 1, truncated: true, outputPath: "/gone/receipt.txt" },
        },
      })
      const out = reply((yield* f.tool.execute({ message_id: f.assistant.id, part_id: part.id }, f.ctx)).output)
      const recorded = JSON.parse(out.content).parts[0]
      expect(recorded.output).toBe(part.state.output)
      expect(recorded.lifecycle).toBe("completed")
      expect(recorded.metadata).toEqual({ exit: 1, truncated: true, outputPath: "/gone/receipt.txt" })
      expect(recorded.original_extent).toBe("truncated")
      expect(recorded.extent).toBe("stored_preview")
      expect(recorded.normal_model_context).toBe("omitted_by_compaction")
      expect(recorded.saved_file).toEqual({
        locator: "/gone/receipt.txt",
        availability: "unverified",
        lifetime: "volatile",
        route: "read",
      })
      const failed = yield* f.session.updatePart({
        ...part,
        state: {
          status: "error",
          input: {},
          error: "Exact failure: EACCES",
          metadata: { exit: 1 },
          time: { start: 2, end: 3 },
        },
      })
      expect(
        reply((yield* f.tool.execute({ message_id: failed.messageID, part_id: failed.id }, f.ctx)).output).content,
      ).toContain("Exact failure: EACCES")
      yield* f.session.updatePart({ ...part, state: { ...part.state, output: "" } })
      expect(
        reply((yield* f.tool.execute({ message_id: part.messageID, part_id: part.id }, f.ctx)).output).status,
      ).toBe("cleared")
    }).pipe(Effect.provide(layer)),
  )

  it.instance("bounds encoded response and paginates exact stored document", () =>
    Effect.gen(function* () {
      const f = yield* seed
      yield* f.session.updatePart({ ...f.text, text: '😀\\"\n'.repeat(4000) })
      const pages: string[] = []
      let offset = 0
      while (true) {
        const result = yield* f.tool.execute({ message_id: f.user.id, part_id: f.text.id, offset, limit: 8000 }, f.ctx)
        expect(Buffer.byteLength(result.output, "utf8")).toBeLessThanOrEqual(8000)
        const page = reply(result.output)
        pages.push(page.content)
        expect(page.offset).toBe(offset)
        if (page.complete) {
          expect(page.next_offset).toBeUndefined()
          break
        }
        expect(page.next_offset).toBe(offset + page.content.length)
        expect(page.next_offset).toBeGreaterThan(offset)
        offset = page.next_offset!
      }
      expect(JSON.parse(pages.join("")).parts[0].text).toBe('😀\\"\n'.repeat(4000))
      const tiny = reply((yield* f.tool.execute({ message_id: f.user.id, limit: 7 }, f.ctx)).output)
      expect(tiny.content.length).toBe(7)
      expect(tiny.complete).toBe(false)
      expect(tiny.next_offset).toBe(7)
      expect(reply((yield* f.tool.execute({ message_id: f.user.id, offset: 999999 }, f.ctx)).output).status).toBe(
        "unavailable",
      )
    }).pipe(Effect.provide(layer)),
  )

  it.instance("searches own records newest-first with snippets, provenance and explicit zero hits", () =>
    Effect.gen(function* () {
      const f = yield* seed
      const foreign = yield* seed
      yield* foreign.session.updatePart({ ...foreign.text, text: "FOREIGN_ONLY_42" })
      const latest = yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.assistant.id,
        type: "text",
        text: "Latest own ZX-19 receipt",
      })
      const out = reply((yield* f.tool.execute({ query: "ZX-19" }, f.ctx)).output)
      expect(out.status).toBe("found")
      expect(out.matches[0].source).toEqual({ message_id: f.assistant.id, part_id: latest.id })
      expect(out.matches[0].snippet).toBe("Latest own ZX-19 receipt")
      expect(out.matches[0].provenance.role).toBe("assistant")
      expect(out.matches.some((match) => match.source.message_id === f.user.id)).toBe(true)
      const bounded = reply((yield* f.tool.execute({ query: "ZX-19", limit: 1 }, f.ctx)).output)
      expect(bounded.matches.length).toBe(1)
      expect(bounded.complete).toBe(false)
      for (const query of ["no-such-record", "FOREIGN_ONLY_42"]) {
        const missing = reply((yield* f.tool.execute({ query }, f.ctx)).output)
        expect(missing.status).toBe("not_found")
        expect(missing.matches).toEqual([])
      }
    }).pipe(Effect.provide(layer)),
  )

  it.instance("recalls historical preview after file edit and returns inline media metadata only", () =>
    Effect.gen(function* () {
      const f = yield* seed
      const directory = yield* TestInstance
      const path = `${directory.directory}/observed.txt`
      yield* Effect.promise(() => Bun.write(path, "Original filesystem bytes"))
      const part = yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.assistant.id,
        type: "tool",
        tool: "read",
        callID: "read_old",
        state: {
          status: "completed",
          input: { filePath: path },
          output: "Original filesystem bytes",
          title: path,
          metadata: { truncated: true, outputPath: path },
          time: { start: 2, end: 3 },
        },
      })
      yield* Effect.promise(() => Bun.write(path, "Changed filesystem bytes"))
      const out = reply((yield* f.tool.execute({ message_id: part.messageID, part_id: part.id }, f.ctx)).output)
      expect(JSON.parse(out.content).parts[0].output).toBe("Original filesystem bytes")
      const media = yield* f.session.updatePart({
        id: PartID.ascending(),
        sessionID: f.chat.id,
        messageID: f.user.id,
        type: "file",
        mime: "image/png",
        filename: "original.png",
        url: `data:image/png;base64,${"Q".repeat(100000)}`,
      })
      const record = reply((yield* f.tool.execute({ message_id: media.messageID, part_id: media.id }, f.ctx)).output)
      expect(record.status).toBe("metadata_only")
      expect(JSON.parse(record.content).parts[0]).toMatchObject({
        mime: "image/png",
        encoded_chars: media.url.length,
        extent: "media_metadata_only",
      })
      expect(record.content.includes("QQQQ")).toBe(false)
    }).pipe(Effect.provide(layer)),
  )

  test("rejects mixed legacy/archive modes, unknown capabilities and invalid integer ranges", () => {
    const decode = Schema.decodeUnknownSync(Parameters)
    expect(decode({ message_id: "msg_known", part_id: "prt_known", offset: 0, limit: 1 })).toEqual({
      message_id: "msg_known",
      part_id: "prt_known",
      offset: 0,
      limit: 1,
    })
    expect(decode({ query: "exact receipt" })).toEqual({ query: "exact receipt" })
    for (const mode of archiveModes) expect(decode(mode)).toEqual(mode)
    for (const input of [
      {},
      { message_id: "msg_known", query: "both" },
      { query: "x", offset: 0 },
      { query: "" },
      { message_id: "msg_known", offset: -1 },
      { query: "x", limit: 0 },
      { query: "x", limit: 1.5 },
      { query: "x", limit: 8001 },
      { message_id: "msg_known", offset: "1" },
      ...[{ message_id: "msg_known" }, { query: "legacy" }].flatMap((legacy) =>
        archiveModes.map((archive) => ({ ...legacy, ...archive })),
      ),
      ...["session_id", "sessionID", "externalURL", "url", "filePath", "filepath", "command", "args", "commands"].map(
        (key) => ({ message_id: "msg_known", [key]: "forbidden" }),
      ),
    ]) {
      expect(() => decode(input)).toThrow()
    }
  })

  it.instance("tool execution rejects unknown fields and mixed modes before permission or storage reads", () =>
    Effect.gen(function* () {
      const f = yield* seed
      for (const input of [
        { message_id: f.user.id, session_id: f.chat.id },
        ...[{ message_id: f.user.id }, { query: "legacy" }].flatMap((legacy) =>
          archiveModes.map((archive) => ({ ...legacy, ...archive })),
        ),
      ]) {
        const out = yield* f.tool
          .execute(input as Tool.InferParameters<typeof ContextRecallTool>, f.ctx)
          .pipe(Effect.exit)
        expect(Exit.isFailure(out)).toBe(true)
      }
      expect(f.asks).toEqual([])
    }).pipe(Effect.provide(layer)),
  )

  it.instance("default registry exposes executable recall in normal model scope", () =>
    Effect.gen(function* () {
      const f = yield* seed
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const agent = yield* agents.get("build")
      if (!agent) throw new Error("build agent missing")
      const tools = yield* registry.tools({ ...ref, agent })
      const recall = tools.find((tool) => tool.id === "context_recall")
      if (!recall) throw new Error("context_recall missing from normal model tools")
      const out = reply((yield* recall.execute({ message_id: f.user.id, part_id: f.text.id }, f.ctx)).output)
      expect(out.content).toContain("Stored own receipt ZX-19.")
    }).pipe(
      Effect.provide(
        TestAppNodeBuilder.build(
          LayerNode.group([
            ToolRegistry.node,
            Session.node,
            SessionProjector.node,
            Agent.node,
            Truncate.node,
            Database.node,
            Archive.node,
          ]),
        ),
      ),
    ),
  )
})
