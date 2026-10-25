import { describe, expect, test } from "bun:test"
import { replayWindow } from "../../src/context/replay"

const messages = [10, 20, 30, 40].map((created) => ({ id: `m${created}`, time: { created } }))

describe("replayWindow", () => {
  test("shows everything outside mini mode", () => {
    expect(replayWindow(messages, { replay: false, limit: 1, openedAt: 100 })).toEqual(messages)
  })

  test("--no-replay hides the messages that existed when the screen opened", () => {
    expect(replayWindow(messages, { mini: true, replay: false, openedAt: 30 }).map((m) => m.id)).toEqual(["m30", "m40"])
    expect(replayWindow(messages, { mini: true, openedAt: 100 })).toEqual(messages)
  })

  test("--replay-limit keeps the newest N, after --no-replay filtering", () => {
    expect(replayWindow(messages, { mini: true, limit: 2, openedAt: 0 }).map((m) => m.id)).toEqual(["m30", "m40"])
    expect(replayWindow(messages, { mini: true, replay: false, limit: 1, openedAt: 20 }).map((m) => m.id)).toEqual(["m40"])
  })
})
