import { expect, test } from "bun:test"
import { FabricIdentityProfile } from "../src/identity-profile"

const clientID = "11111111-2222-4333-8444-555555555555"
const state = "SYNTHETIC_STATE_abcdefghijklmnopqrstuvwxyz0123456789"
const desktop = {
  deployment: "desktop" as const,
  clientID,
  redirectUri: "http://localhost:54321/api/fabric/oauth/callback",
}
const server = {
  deployment: "server" as const,
  clientID,
  origin: "https://orchestra.example.test",
  redirectUri: "https://orchestra.example.test/api/fabric/oauth/callback",
}

function profile(input: unknown = desktop) {
  const result = FabricIdentityProfile.admit(input)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error("Expected actual admitted host profile")
  return result.value
}

test("IDP01 host-only desktop and confidential server profiles remain distinct and immutable", () => {
  expect(profile()).toEqual({ ...desktop, origin: "http://localhost:54321" })
  const remote = profile(server)
  expect(remote).toEqual(server)
  expect(Object.isFrozen(remote)).toBe(true)
  for (const input of [
    { ...desktop, clientID: "not-an-app-registration" },
    { ...desktop, clientID: clientID + "\n" },
    { ...desktop, redirectUri: "http://127.0.0.1:54321/api/fabric/oauth/callback" },
    { ...desktop, redirectUri: "http://[::1]:54321/api/fabric/oauth/callback" },
    { ...desktop, redirectUri: "http://localhost:0/api/fabric/oauth/callback" },
    { ...desktop, redirectUri: "http://localhost/api/fabric/oauth/callback" },
    { ...desktop, redirectUri: "http://localhost:54321/other" },
    { ...server, origin: "http://orchestra.example.test" },
    { ...server, redirectUri: "https://other.example.test/api/fabric/oauth/callback" },
    { ...server, origin: "https://orchestra.example.test/other" },
    { ...server, origin: "https://orchestra.example.test/?" },
    { ...server, clientSecret: "SYNTHETIC_NOT_ALLOWED_IN_PROFILE" },
    { ...desktop, redirectUri: desktop.redirectUri + "?returnTo=https://evil.invalid" },
  ]) {
    expect(FabricIdentityProfile.admit(input)).toEqual({ ok: false, code: "invalid-input" })
  }
})

test("IDP02 callback matches actual profile origin/path and opaque state before exposing an internal code", () => {
  const target = profile()
  const valid = { url: `${target.redirectUri}?state=${state}&code=SYNTHETIC_AUTH_CODE`, expectedState: state }
  expect(FabricIdentityProfile.callback(target, valid)).toEqual({
    ok: true,
    value: { outcome: "code", code: "SYNTHETIC_AUTH_CODE" },
  })
  expect(FabricIdentityProfile.callback({ ...target }, valid)).toEqual({ ok: false, code: "denied" })
  for (const url of [
    valid.url.replace(":54321", ":54322"),
    valid.url.replace("localhost", "other.invalid"),
    valid.url.replace("/callback", "/other"),
    valid.url.replace("/api/", "/unexpected/../api/"),
    valid.url.replace(state, state + "x"),
    valid.url.replace("http://", "http://user:password@"),
    valid.url + "#fragment",
  ]) {
    const result = FabricIdentityProfile.callback(target, { ...valid, url })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_AUTH_CODE")
  }
})

test("IDP03 duplicate/conflicting/unknown callback parameters cannot choose a more permissive interpretation", () => {
  const target = profile()
  for (const query of [
    `state=${state}&state=other&code=secret`,
    `state=${state}&code=one&code=two`,
    `state=${state}&code=secret&error=access_denied`,
    `state=${state}&code=secret&returnTo=https://evil.invalid`,
    `code=secret`,
    `state=${state}`,
    `state=${state}&code=`,
    `state=${state}&code=%00secret`,
  ]) {
    const result = FabricIdentityProfile.callback(target, {
      url: `${target.redirectUri}?${query}`,
      expectedState: state,
    })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain("secret")
  }
})

test("IDP04 OAuth error is sanitized, never a redirect target, code or identity proof", () => {
  const target = profile(server)
  const result = FabricIdentityProfile.callback(target, {
    expectedState: state,
    url: `${target.redirectUri}?state=${state}&error=access_denied&error_description=PRIVATE_TOKEN&error_uri=https://evil.invalid&iss=https://untrusted.invalid`,
  })
  expect(result).toEqual({ ok: true, value: { outcome: "denied" } })
  expect(JSON.stringify(result)).not.toContain("PRIVATE")
  expect(JSON.stringify(result)).not.toContain("evil.invalid")
})

test("IDP05 callback budgets count UTF-8 bytes and state is mandatory host input", () => {
  const target = profile()
  const accepted = FabricIdentityProfile.callback(target, {
    expectedState: state,
    url: `${target.redirectUri}?state=${state}&code=${"a".repeat(8192)}`,
  })
  expect(accepted.ok).toBe(true)
  for (const input of [
    { expectedState: state, url: `${target.redirectUri}?state=${state}&code=${"ä".repeat(4097)}` },
    { expectedState: "short", url: `${target.redirectUri}?state=short&code=secret` },
    { expectedState: state + "\n", url: `${target.redirectUri}?state=${state}%0A&code=secret` },
    {
      expectedState: state,
      url: `${target.redirectUri}?state=${state}&code=secret&session_state=${"a".repeat(16384)}`,
    },
  ])
    expect(FabricIdentityProfile.callback(target, input).ok).toBe(false)
})
