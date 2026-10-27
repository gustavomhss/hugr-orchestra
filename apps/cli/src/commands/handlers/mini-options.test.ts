import { describe, expect, test } from "bun:test"
import { Option } from "effect"
import { miniOptions } from "./mini-options"
import { miniArgs } from "./run"
import { prepare } from "./attach"

const base = { mini: true, "no-replay": false, "replay-limit": Option.none<number>(), demo: false }

describe("mini replay and demo flags", () => {
  test("--no-replay hides the history and is passed on", () => {
    expect(miniOptions({ ...base, "no-replay": true })).toEqual({ replay: false })
    expect(miniOptions(base)).toEqual({})
    expect(() => miniOptions({ ...base, mini: false, "no-replay": true })).toThrow("--no-replay requires --mini")
  })

  test("--replay-limit needs --mini and a positive integer", () => {
    expect(miniOptions({ ...base, "replay-limit": Option.some(5) })).toEqual({ replayLimit: 5 })
    expect(() => miniOptions({ ...base, mini: false, "replay-limit": Option.some(5) })).toThrow("--replay-limit requires --mini")
    expect(() => miniOptions({ ...base, "replay-limit": Option.some(0) })).toThrow("--replay-limit must be a positive integer")
  })

  test("--demo needs --mini", () => {
    expect(miniOptions({ ...base, demo: true })).toEqual({ demo: true })
    expect(() => miniOptions({ ...base, mini: false, demo: true })).toThrow("--demo requires --mini")
  })

  test("run --mini and attach --mini hand the choices to the TUI", async () => {
    expect(miniArgs({ message: "/fmt mix", continue: false, fork: false, auto: false, replay: false, replayLimit: 3, demo: true })).toMatchObject({
      mini: true,
      prompt: "/fmt mix",
      replay: false,
      replayLimit: 3,
      demo: true,
    })
    const attached = await prepare({ url: "http://127.0.0.1:1", continue: false, fork: false, mini: true, replay: false, replayLimit: 2 })
    expect(attached.args).toMatchObject({ mini: true, replay: false, replayLimit: 2 })
  })
})
