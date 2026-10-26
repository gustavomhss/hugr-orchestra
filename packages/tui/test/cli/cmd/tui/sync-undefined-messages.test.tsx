/** @jsxImportSource @opentui/solid */
/**
 * Reproducer for #26560 — TUI crashes with
 *   `TypeError: undefined is not an object (evaluating 'f.data.map')`
 * when entering a session whose messages endpoint returns a non-2xx.
 * The failure path is `sync.tsx#sync.session.sync` reading
 * the messages route result when it errors; the earlier runtime rendered the Session with no messages.
 */
import { describe, expect, test } from "bun:test"
import { tmpdir } from "../../../fixture/fixture"
import { json, mount } from "./sync-fixture"
import { v2Session } from "../../../fixture/tui-sdk"

const sessionID = "ses_undef"

describe("tui sync (#26560)", () => {
  test("entering a session whose messages endpoint errors does not crash sync", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")

    const sessionPayload = v2Session({ id: sessionID, title: "broken" })
    const { app, sync } = await mount((url) => {
      if (url.pathname === `/api/session/${sessionID}`) return json({ data: sessionPayload })
      if (url.pathname === `/api/session/${sessionID}/message`) return json({}, { status: 500 })
      if (url.pathname === `/api/session/${sessionID}/todo`) return json({ data: [] })
      if (url.pathname === "/api/session") return json({ data: [sessionPayload], cursor: {} })
      return undefined
    }, tmp.path)

    try {
      expect(await sync.session.sync(sessionID)).toBeUndefined()
      expect(sync.data.message[sessionID]).toEqual([])
    } finally {
      app.renderer.destroy()
    }
  })
})
