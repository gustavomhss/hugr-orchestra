import { expect, test } from "bun:test"
import { MessageID, SessionID } from "@/session/schema"
import { isCurrent } from "./model"

test("a snapshot applies while its boundary is still in the history", () => {
  const snapshot = {
    sessionID: SessionID.make("ses_test"),
    boundary: MessageID.make("msg_before"),
    tailStart: MessageID.make("msg_tail"),
  }
  const message = (id: string) => ({ info: { id: MessageID.make(id) } })
  expect(isCurrent(snapshot, [message("msg_tail"), message("msg_after")])).toBe(false)
  expect(isCurrent(snapshot, [message("msg_tail"), message("msg_before"), message("msg_after")])).toBe(true)
})
