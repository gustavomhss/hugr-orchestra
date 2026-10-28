import { expect, test } from "bun:test"
import { CLAUDE_MODE_PATH, enableClaudeMode, setMaestroEngine } from "../claude-mode-entry"
import { readAccount, sendCode, startSignIn, type ClaudeProviders } from "./claude-mode-account"

const server = "http://127.0.0.1:4096" as Parameters<typeof enableClaudeMode>[0]["server"]

function providers(input: Partial<ClaudeProviders> = {}): ClaudeProviders {
  return {
    claudeCodeAccount: async () => ({ signedIn: false }),
    claudeCodeLogin: async () => ({ url: "https://claude.com/cai/oauth/authorize?state=s" }),
    claudeCodeLoginCode: async () => true,
    ...input,
  }
}

function fixture(input: { selected?: string; fails?: boolean; signedIn?: boolean; accountFails?: boolean } = {}) {
  const calls: unknown[] = []
  const options = {
    sync: {
      updateConfig: async (config: unknown) => {
        calls.push(["updateConfig", config])
        if (input.fails) throw new Error("write refused")
      },
    },
    providers: providers({
      claudeCodeAccount: async () => {
        if (input.accountFails) throw new Error("offline")
        return { signedIn: input.signedIn === true }
      },
    }),
    home: {
      selection: () => ({ server, directory: input.selected }),
      setSelection: (selection: unknown) => calls.push(["setSelection", selection]),
    },
    server,
    directory: "/repo/session",
    returnTo: "/repo/session/abc",
    close: () => calls.push(["close"]),
    navigate: (path: string, intent: unknown) => calls.push(["navigate", path, intent]),
  }
  return { calls, options }
}

const engineWrite = ["updateConfig", { agent: { maestro: { engine: "claude-code" } } }]

test("the engine select writes only agent.maestro.engine through sync.updateConfig", async () => {
  const { calls, options } = fixture()
  await setMaestroEngine(options.sync, "claude-code")
  await setMaestroEngine(options.sync, "orchestra")
  expect(calls).toEqual([
    ["updateConfig", { agent: { maestro: { engine: "claude-code" } } }],
    ["updateConfig", { agent: { maestro: { engine: "orchestra" } } }],
  ])
})

test("signed out: Claude mode leaves the engine alone and hands the switch to the Providers sign-in", async () => {
  const { calls, options } = fixture()
  expect(await enableClaudeMode(options)).toBe(false)
  expect(calls).toEqual([
    ["close"],
    ["setSelection", { server, directory: "/repo/session" }],
    ["navigate", CLAUDE_MODE_PATH, { returnTo: "/repo/session/abc", engine: true }],
  ])
  expect(calls.some((call) => JSON.stringify(call).includes("updateConfig"))).toBe(false)
})

test("an account that cannot be read counts as signed out, so the engine stays put", async () => {
  const { calls, options } = fixture({ accountFails: true })
  await enableClaudeMode(options)
  expect(calls.some((call) => JSON.stringify(call).includes("updateConfig"))).toBe(false)
  expect(calls.at(-1)).toEqual(["navigate", CLAUDE_MODE_PATH, { returnTo: "/repo/session/abc", engine: true }])
})

test("signed in: the engine switches at once, the dialog closes and the person stays on the task", async () => {
  const { calls, options } = fixture({ signedIn: true })
  expect(await enableClaudeMode(options)).toBe(true)
  expect(calls).toEqual([engineWrite, ["close"], ["setSelection", { server, directory: "/repo/session" }]])
})

test("enabling Claude mode keeps an existing Home profile selection", async () => {
  const { calls, options } = fixture({ selected: "/repo/home" })
  await enableClaudeMode(options)
  expect(calls.map((call) => (call as unknown[])[0])).toEqual(["close", "navigate"])
})

test("a refused engine write while signed in leaves the dialog open and does not close it", async () => {
  const { calls, options } = fixture({ fails: true, signedIn: true })
  await expect(enableClaudeMode(options)).rejects.toThrow("write refused")
  expect(calls).toEqual([engineWrite])
})

test("the account reads the server's sign-in status and treats an unreachable server as unknown", async () => {
  expect(
    await readAccount(
      providers({ claudeCodeAccount: async () => ({ signedIn: true, email: "owner@example.com", subscription: "max" }) }),
    ),
  ).toEqual({ signedIn: true, email: "owner@example.com", subscription: "max" })
  expect(
    await readAccount(
      providers({
        claudeCodeAccount: async () => {
          throw new Error("offline")
        },
      }),
    ),
  ).toBeUndefined()
})

test("starting a sign-in returns the fallback URL, or the server's own failure", async () => {
  expect(await startSignIn(providers())).toEqual({ url: "https://claude.com/cai/oauth/authorize?state=s" })
  const refusal = { name: "ServiceUnavailableError", message: "Claude Code is not available on this server" }
  expect(
    await startSignIn(
      providers({
        claudeCodeLogin: async () => {
          throw refusal
        },
      }),
    ),
  ).toEqual({ error: refusal })
})

test("a pasted code reaches the running sign-in, and a refused one is a failure", async () => {
  const sent: unknown[] = []
  expect(
    await sendCode(
      providers({
        claudeCodeLoginCode: async (input) => {
          sent.push(input)
          return true
        },
      }),
      "good#state",
    ),
  ).toEqual({ delivered: true })
  expect(sent).toEqual([{ code: "good#state" }])
  // No sign-in is running on the server: the code went nowhere, so the form must not clear as if it had.
  expect(await sendCode(providers({ claudeCodeLoginCode: async () => false }), "good#state")).toEqual({
    error: undefined,
  })
  expect(
    await sendCode(
      providers({
        claudeCodeLoginCode: async () => {
          throw new Error("offline")
        },
      }),
      "x",
    ),
  ).toMatchObject({ error: expect.any(Error) })
})
