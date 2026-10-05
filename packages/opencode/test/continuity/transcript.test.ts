import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { transcript, chunks } from "@/continuity/transcript"
import { MessageID, PartID, SessionID } from "@/session/schema"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { payload, tool, user } from "./archive-fixture"

const sessionID = SessionID.make("ses_transcript")

describe("conversation Markdown", () => {
  test("keeps raw CRLF, Unicode and unsafe numeric output once, excludes private reasoning and worker system", () => {
    const text = "literal\r\nemoji 🧠 e\u0301 漢字\r\n```\n# forged header\n````\n"
    const raw = '{"integer":900719925474099312345,"decimal":0.10000000000000001}\r\n'
    const messages = [user(sessionID, "user", text), tool(sessionID, raw)]
    const info = messages[0].info
    if (info.role !== "user") throw new Error("expected user")
    info.system = "Turn-only constraint"
    Object.assign(info, { workerSystem: "WORKER_PRIVATE_SENTINEL" })
    messages[0].parts.push({ type: "reasoning", id: PartID.make("prt_reasoning"), sessionID,
      messageID: info.id, text: "REASONING_PRIVATE_SENTINEL", time: { start: 0 } })
    const md = transcript(messages)
    expect(md).toContain("## user message msg_user")
    expect(md).toContain("### Tool \"shell\" — prt_tool")
    expect(md).toContain(text)
    expect(md).toContain(raw)
    expect(md.split(raw)).toHaveLength(2)
    expect(md.split('"command": "inspect --exact"')).toHaveLength(2)
    expect(md).toContain("Turn-only constraint")
    expect(md).toContain("Exit: 7")
    expect(md).toContain("Availability: full")
    expect(md).toContain("/original/output.log")
    expect(md).not.toContain("WORKER_PRIVATE_SENTINEL")
    expect(md).not.toContain("REASONING_PRIVATE_SENTINEL")
    expect(md).toContain("`````text\n" + text + "\n`````")
    const archived = chunks(sessionID, messages)
    expect(archived.map(payload).join("\n\n")).toBe(md)
    for (const value of archived) {
      expect(value.id).toBe(createHash("sha256").update(Buffer.from(value.markdown)).digest("hex"))
      expect(value.bytes).toBe(Buffer.byteLength(value.markdown))
      expect(value.markdown).toContain(`Session: ${sessionID}`)
      expect(value.first).toBe(value.last)
    }
  })

  test("large Unicode payload reassembles exactly and appending messages cannot renumber old chunks", () => {
    const text = "x".repeat(32760) + "🧠漢字e\u0301\r\n".repeat(11000) + "```".repeat(40)
    const message = user(sessionID, "large", text)
    const values = chunks(sessionID, [message])
    expect(values.length).toBeGreaterThan(3)
    expect(values.map(payload).join("")).toBe(transcript([message]))
    expect(values.map(payload).join("")).toContain(text)
    expect(chunks(sessionID, [message, user(sessionID, "future")]).slice(0, values.length)).toEqual(values)
    const other = SessionID.make("ses_other")
    expect(chunks(other, [user(other, "large", text)])[0].id).not.toBe(values[0].id)
    expect(values[1].title).toContain(`continuation 2/${values.length}`)
  })

  test("media keeps original locators and metadata, never inline binary or source text base64", () => {
    const message = tool(sessionID)
    const part = message.parts[0]
    if (part.type !== "tool" || part.state.status !== "completed") throw new Error("expected tool")
    const media: SessionV1.FilePart = { id: PartID.make("prt_attachment"), messageID: message.info.id, sessionID,
      type: "file", mime: "image/png", filename: "chart.png", url: "data:image/png;base64,BINARY_SENTINEL",
      source: { type: "file", path: "/original/chart.png", text: { value: "BINARY_SENTINEL", start: 2, end: 8 } } }
    part.state.attachments = [media]
    const external = { ...media, id: PartID.make("prt_external"), url: "https://example.test/chart.png" }
    message.parts.push(external, { ...media, id: PartID.make("prt_resource"),
      source: { type: "resource", clientName: "images", uri: "data:image/png;base64,BINARY_SENTINEL",
        text: { value: "BINARY_SENTINEL", start: 0, end: 1 } } })
    const md = transcript([message])
    expect(md).toContain("/original/chart.png")
    expect(md).toContain("https://example.test/chart.png")
    expect(md).toContain("chart.png")
    expect(md).toContain("image/png")
    expect(md).toContain("Media metadata only")
    expect(md).not.toContain("BINARY_SENTINEL")
    expect(md).not.toContain("base64")
    expect(chunks(sessionID, [message]).map(payload).join("")).toBe(md)
  })

  test("pending, running, error, preview, cleared and unavailable retain their captured content", () => {
    const states: SessionV1.ToolState[] = [
      { status: "pending", input: {}, raw: '{"partial":' },
      { status: "running", input: {}, time: { start: 1 } },
      { status: "error", input: {}, error: "exact failure\r\n", time: { start: 1, end: 2 } },
      { status: "completed", input: {}, output: "preview capture", title: "preview", time: { start: 1, end: 2 }, metadata: { truncated: true } },
      { status: "completed", input: {}, output: "retained compacted marker", title: "cleared", time: { start: 1, end: 2, compacted: 0 }, metadata: {} },
      { status: "completed", input: {}, output: "retained unavailable marker", title: "unavailable", time: { start: 1, end: 2 }, metadata: { extent: "unavailable" } },
    ]
    const messages = states.map((state, index) => {
      const message = tool(sessionID, "", `state${index}`)
      const part = message.parts[0]
      if (part.type !== "tool") throw new Error("expected tool")
      part.state = state
      return message
    })
    const md = transcript(messages)
    for (const state of states) expect(md).toContain(`status: ${state.status}`)
    for (const text of ['{"partial":', "exact failure\r\n", "preview capture", "retained compacted marker", "retained unavailable marker"])
      expect(md).toContain(text)
    for (const extent of ["unknown", "preview", "cleared", "unavailable"]) expect(md).toContain(`Availability: ${extent}`)
  })

  test("validates whole batches, source ownership, duplicate identities and malformed Unicode", () => {
    expect(transcript([])).toBe("")
    expect(chunks(sessionID, [])).toEqual([])
    const message = user(sessionID)
    expect(() => chunks(SessionID.make("ses_foreign"), [message])).toThrow("archive-foreign-session")
    message.parts[0].messageID = MessageID.make("msg_foreign")
    expect(() => transcript([message])).toThrow("archive-foreign-part")
    message.parts[0].messageID = message.info.id
    expect(() => chunks(sessionID, [message, message])).toThrow("archive-duplicate-message")
    expect(() => chunks("../../escape" as SessionID, [])).toThrow("archive-invalid-identity")
    expect(() => chunks("ses_trailing\n" as SessionID, [])).toThrow("archive-invalid-identity")
    message.info.id = "msg_trailing\n" as MessageID
    expect(() => chunks(sessionID, [message])).toThrow("archive-invalid-identity")
    message.info.id = MessageID.make("msg_user")
    message.parts[0].id = "prt_../../escape" as PartID
    expect(() => chunks(sessionID, [message])).toThrow("archive-invalid-identity")
    expect(() => chunks(sessionID, [user(sessionID, "broken", "\ud800")])).toThrow("archive-invalid-unicode")
  })
})
