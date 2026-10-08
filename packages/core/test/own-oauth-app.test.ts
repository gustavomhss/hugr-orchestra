import { expect, test } from "bun:test"
import { OwnOAuthApp } from "../src/auth/oauth-app"

const apps = [
  ["openai", "ORCHESTRA_OPENAI_CLIENT_ID", "app_EMoamEEZ73f0CkXaXp7hrann"],
  ["copilot", "ORCHESTRA_COPILOT_CLIENT_ID", "Ov23li8tweQw6odWQebz"],
  ["xai", "ORCHESTRA_XAI_CLIENT_ID", "b1a00492-073a-47ea-816f-4c329264a828"],
  ["digitalocean", "ORCHESTRA_DIGITALOCEAN_CLIENT_ID", "b1a6c5158156caac821fd1b30253ca8acb52454a48fa744420e41889cb589f82"],
] as const

test.each(apps)("requires explicit registration for %s", (provider, envKey) => {
  const previous = process.env[envKey]
  using restore = { [Symbol.dispose]() {
    if (previous === undefined) { delete process.env[envKey]; return }
    process.env[envKey] = previous
  } }
  for (const value of [undefined, "", " \t "]) {
    if (value === undefined) delete process.env[envKey]
    else process.env[envKey] = value
    if (provider === "digitalocean" && value === undefined) expect(OwnOAuthApp.requireClientID(provider)).toBe("8927d6fd39836377289fc753b996b8bb7a9f71870f0a2b01ddf1f45d7d9bc3cb")
    else expect(() => OwnOAuthApp.requireClientID(provider)).toThrow(OwnOAuthApp.MissingRegistrationError)
  }
  for (const app of apps) {
    process.env[envKey] = ` ${app[2]} `
    expect(() => OwnOAuthApp.requireClientID(provider)).toThrow(OwnOAuthApp.ThirdPartyRegistrationError)
    expect(() => OwnOAuthApp.requireClientID(provider)).toThrow(new RegExp(`^${provider}: ${envKey}$`))
  }
  process.env[envKey] = " fixture-owned-client "
  expect(OwnOAuthApp.requireClientID(provider)).toBe("fixture-owned-client")
  process.env[envKey] = "fixture-other-client"
  expect(OwnOAuthApp.requireClientID(provider)).toBe("fixture-other-client")
})
