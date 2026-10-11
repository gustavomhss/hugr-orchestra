import { expect, test } from "bun:test"
import { Schema } from "effect"
import { SessionV1 } from "@orchestra/core/v1/session"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { ProviderTest } from "../fake/provider"

test("hook reminders follow original parts without changing stored text or attachments", async () => {
  const model = ProviderTest.model()
  const sessionID = SessionID.make("ses_reminders")
  const messageID = MessageID.make("msg_reminders")
  const message: SessionV1.WithParts = {
    info: { id: messageID, sessionID, role: "user",
      time: { created: 0 }, agent: "user", model: { providerID: model.providerID, modelID: model.id },
      promptContext: { reminders: ["first\r\n🧠", "second"] } },
    parts: [
      { id: PartID.make("prt_text"), messageID, sessionID, type: "text", text: " original\r\ntext " },
      { id: PartID.make("prt_image"), messageID, sessionID, type: "file", mime: "image/png", filename: "img.png",
        url: "data:image/png;base64,Zm9v" },
    ],
  }
  Schema.decodeUnknownSync(SessionV1.User)(message.info)
  const before = structuredClone(message)
  expect(await MessageV2.toModelMessages([message], model)).toEqual([{ role: "user", content: [
    { type: "text", text: " original\r\ntext " },
    { type: "file", mediaType: "image/png", filename: "img.png", data: "data:image/png;base64,Zm9v" },
    { type: "text", text: "Hook reminder:\nfirst\r\n🧠" },
    { type: "text", text: "Hook reminder:\nsecond" },
  ] }])
  expect(message).toEqual(before)
  expect(await MessageV2.toModelMessages([{ ...message, parts: [] }], model)).toEqual([])
  expect(await MessageV2.toModelMessages([{ ...message,
    parts: [{ id: PartID.make("prt_ignored"), messageID, sessionID, type: "text", text: "ignored", ignored: true }],
  }], model)).toEqual([])
  expect(await MessageV2.toModelMessages([message], model, { stripMedia: true })).toEqual([{ role: "user", content: [
    { type: "text", text: " original\r\ntext " },
    { type: "text", text: "[Attached image/png: img.png]" },
    { type: "text", text: "Hook reminder:\nfirst\r\n🧠" },
    { type: "text", text: "Hook reminder:\nsecond" },
  ] }])
  expect(message).toEqual(before)
})
