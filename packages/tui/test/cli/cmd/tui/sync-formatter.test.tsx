/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { tmpdir } from "../../../fixture/fixture"
import { directory, json, mount, worktree } from "./sync-fixture"

describe("tui sync formatter", () => {
  test("bootstrap fills the formatter store from the V2 formatter status route", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, sync } = await mount((url) => {
      if (url.pathname !== "/api/formatter") return
      return json({
        location: { directory, project: { id: "proj_test", directory: worktree } },
        data: [
          { name: "prettier", extensions: [".ts", ".json"], enabled: true },
          { name: "ruff", extensions: [".py"], enabled: false },
        ],
      })
    }, tmp.path)

    try {
      expect(sync.data.formatter).toEqual([
        { name: "prettier", extensions: [".ts", ".json"], enabled: true },
        { name: "ruff", extensions: [".py"], enabled: false },
      ])
    } finally {
      app.renderer.destroy()
    }
  })
})
