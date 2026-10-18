import { expect, test } from "bun:test"
import { CLAUDE_MODE_PATH, enableClaudeMode, setMaestroEngine } from "../claude-mode-entry"

const server = "http://127.0.0.1:4096" as Parameters<typeof enableClaudeMode>[0]["server"]

function fixture(input: { selected?: string; fails?: boolean } = {}) {
  const calls: unknown[] = []
  const options = {
    sync: {
      updateConfig: async (config: unknown) => {
        calls.push(["updateConfig", config])
        if (input.fails) throw new Error("write refused")
      },
    },
    home: {
      selection: () => ({ server, directory: input.selected }),
      setSelection: (selection: unknown) => calls.push(["setSelection", selection]),
    },
    server,
    directory: "/repo/session",
    close: () => calls.push(["close"]),
    navigate: (path: string) => calls.push(["navigate", path]),
  }
  return { calls, options }
}

test("the engine select writes only agent.maestro.engine through sync.updateConfig", async () => {
  const { calls, options } = fixture()
  await setMaestroEngine(options.sync, "claude-code")
  await setMaestroEngine(options.sync, "orchestra")
  expect(calls).toEqual([
    ["updateConfig", { agent: { maestro: { engine: "claude-code" } } }],
    ["updateConfig", { agent: { maestro: { engine: "orchestra" } } }],
  ])
})

test("enabling Claude mode writes the engine, closes the dialog, selects the profile and opens Providers", async () => {
  const { calls, options } = fixture()
  await enableClaudeMode(options)
  expect(calls).toEqual([
    ["updateConfig", { agent: { maestro: { engine: "claude-code" } } }],
    ["close"],
    ["setSelection", { server, directory: "/repo/session" }],
    ["navigate", CLAUDE_MODE_PATH],
  ])
})

test("enabling Claude mode keeps an existing Home profile selection", async () => {
  const { calls, options } = fixture({ selected: "/repo/home" })
  await enableClaudeMode(options)
  expect(calls.map((call) => (call as unknown[])[0])).toEqual(["updateConfig", "close", "navigate"])
})

test("a refused engine write leaves the dialog open and does not navigate", async () => {
  const { calls, options } = fixture({ fails: true })
  await expect(enableClaudeMode(options)).rejects.toThrow("write refused")
  expect(calls).toEqual([["updateConfig", { agent: { maestro: { engine: "claude-code" } } }]])
})
