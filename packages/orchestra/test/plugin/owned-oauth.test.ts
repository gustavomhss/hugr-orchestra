import { expect, test } from "bun:test"
import { CodexAuthPlugin } from "../../src/plugin/openai/codex"
import { CopilotAuthPlugin } from "../../src/plugin/github-copilot/copilot"
import { XaiAuthPlugin } from "../../src/plugin/xai"
import { DigitalOceanAuthPlugin } from "../../src/plugin/digitalocean"

test.each([
  ["OPENAI", CodexAuthPlugin], ["COPILOT", CopilotAuthPlugin],
  ["XAI", XaiAuthPlugin], ["DIGITALOCEAN", DigitalOceanAuthPlugin],
] as const)("%s registration is checked at OAuth authorization, not plugin initialization", async (provider, plugin) => {
  const key = `ORCHESTRA_${provider}_CLIENT_ID`
  const previous = process.env[key]
  delete process.env[key]
  if (provider === "DIGITALOCEAN") process.env[key] = ""
  using restore = { [Symbol.dispose]() {
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  } }
  const hooks = await plugin({} as never)
  const method = hooks.auth?.methods.find((method) => method.type === "oauth")
  if (!method || method.type !== "oauth") throw new Error("Missing OAuth method")
  await expect(method.authorize({})).rejects.toThrow(key)
  if (hooks.auth?.loader) expect(await hooks.auth.loader(async () => ({ type: "api", key: "fixture-key" }), {} as never)).toEqual({})
})
