import { expect, test } from "bun:test"
import { MessageID, SessionID } from "@/session/schema"
import { isCurrent } from "./model"

test("rejects a stale fork snapshot", () => {
  const snapshot = {
    sessionID: SessionID.make("ses_test"),
    boundary: MessageID.make("msg_before"),
    tailStart: MessageID.make("msg_tail"),
  }
  expect(isCurrent(snapshot, MessageID.make("msg_after"))).toBe(false)
})
