import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  ConfidentialClientApplication,
  CryptoProvider,
  PublicClientApplication,
  version,
  type Configuration,
  type ICachePlugin,
  type INetworkModule,
} from "@azure/msal-node"

const tenant = "11111111-2222-4333-8444-555555555555"
const clientID = "66666666-7777-4888-8999-aaaaaaaaaaaa"
const authority = `https://login.microsoftonline.com/${tenant}`
const scope = "https://api.fabric.microsoft.com/Workspace.Read.All"

/** No real identity endpoint is reachable through this instrument. The control calls it and measures the refusal. */
export function blockedNetwork() {
  const calls: Array<{ method: string; url: string }> = []
  const client: INetworkModule = {
    sendGetRequestAsync: async (url) => {
      calls.push({ method: "GET", url })
      throw new Error("MSAL_CONFORMANCE_NETWORK_BLOCKED")
    },
    sendPostRequestAsync: async (url) => {
      calls.push({ method: "POST", url })
      throw new Error("MSAL_CONFORMANCE_NETWORK_BLOCKED")
    },
  }
  return { client, calls }
}

function configuration(network: INetworkModule, cachePlugin?: ICachePlugin): Configuration {
  return {
    auth: {
      clientId: clientID,
      authority,
      cloudDiscoveryMetadata: JSON.stringify({
        tenant_discovery_endpoint: `${authority}/v2.0/.well-known/openid-configuration`,
        metadata: [
          {
            preferred_network: "login.microsoftonline.com",
            preferred_cache: "login.microsoftonline.com",
            aliases: ["login.microsoftonline.com", "login.windows.net", "sts.windows.net"],
          },
        ],
      }),
      // Explicit synthetic metadata, not a fetch or an attestation about Microsoft's live endpoints.
      authorityMetadata: JSON.stringify({
        authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
        token_endpoint: `${authority}/oauth2/v2.0/token`,
        issuer: `${authority}/v2.0`,
        jwks_uri: `${authority}/discovery/v2.0/keys`,
        end_session_endpoint: `${authority}/oauth2/v2.0/logout`,
      }),
    },
    cache: { ...(cachePlugin ? { cachePlugin } : {}) },
    system: {
      networkClient: network,
      disableInternalRetries: true,
      loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} },
    },
  }
}

export const vectors = {
  async "MSQ01 actual pinned library generates RFC7636 PKCE, with the same standard S256 oracle"() {
    assert.equal(version, "7.1.0")
    const provider = new CryptoProvider()
    const first = await provider.generatePkceCodes()
    const second = await provider.generatePkceCodes()
    for (const codes of [first, second]) {
      assert.match(codes.verifier, /^[A-Za-z0-9._~-]{43,128}$/)
      assert.match(codes.challenge, /^[A-Za-z0-9_-]{43}$/)
      assert.equal(codes.challenge, createHash("sha256").update(codes.verifier).digest("base64url"))
    }
    assert.notEqual(first.verifier, second.verifier)
    assert.notEqual(provider.createNewGuid(), provider.createNewGuid())
    // A uniqueness observation is not a statistical proof of entropy or a provider qualification.
  },

  async "MSQ02 network instrument refuses both verbs and observes actual MSAL discovery attempts"() {
    const network = blockedNetwork()
    await assert.rejects(
      network.client.sendGetRequestAsync("https://control.invalid/get"),
      /MSAL_CONFORMANCE_NETWORK_BLOCKED/,
    )
    await assert.rejects(
      network.client.sendPostRequestAsync("https://control.invalid/post"),
      /MSAL_CONFORMANCE_NETWORK_BLOCKED/,
    )
    assert.deepEqual(
      network.calls.map((call) => call.method),
      ["GET", "POST"],
    )
    // Public-cloud endpoint metadata is bundled by MSAL and may avoid discovery altogether.
    // A synthetic known host forces the actual discovery path through this same refusing client.
    const host = "msal-network-control.example.invalid"
    const app = new PublicClientApplication({
      auth: { clientId: clientID, authority: `https://${host}/${tenant}`, knownAuthorities: [host] },
      system: {
        networkClient: network.client,
        disableInternalRetries: true,
        loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} },
      },
    })
    await assert.rejects(app.getAuthCodeUrl({ redirectUri: "http://localhost:54321/callback", scopes: [scope] }))
    assert.ok(
      network.calls.length > 2,
      "MSAL itself must exercise the same refusing client, not only a direct control call",
    )
    assert.ok(
      network.calls
        .slice(2)
        .every((call) => call.method === "GET" && new URL(call.url).hostname === host),
    )
  },

  async "MSQ03 real authorization URL preserves explicit PKCE, state, nonce and separate synthetic profiles"() {
    const network = blockedNetwork()
    const base = configuration(network.client)
    const publicApp = new PublicClientApplication(base)
    const secret = "SYNTHETIC_CONFIDENTIAL_CLIENT_SECRET_NOT_A_CREDENTIAL"
    const confidentialApp = new ConfidentialClientApplication({ ...base, auth: { ...base.auth, clientSecret: secret } })
    const codes = await new CryptoProvider().generatePkceCodes()
    for (const profile of [
      { app: publicApp, redirect: "http://localhost:54321/callback" },
      { app: confidentialApp, redirect: "https://fabric.example.test/oauth/callback" },
    ]) {
      const state = new CryptoProvider().createNewGuid()
      const nonce = new CryptoProvider().createNewGuid()
      const output = await profile.app.getAuthCodeUrl({
        redirectUri: profile.redirect,
        scopes: [scope],
        state,
        nonce,
        codeChallenge: codes.challenge,
        codeChallengeMethod: "S256",
        prompt: "select_account",
      })
      const url = new URL(output)
      assert.equal(url.origin, "https://login.microsoftonline.com")
      assert.equal(url.pathname, `/${tenant}/oauth2/v2.0/authorize`)
      assert.equal(url.searchParams.get("client_id"), clientID)
      assert.equal(url.searchParams.get("redirect_uri"), profile.redirect)
      assert.equal(url.searchParams.get("state"), state)
      assert.equal(url.searchParams.get("nonce"), nonce)
      assert.equal(url.searchParams.get("code_challenge"), codes.challenge)
      assert.equal(url.searchParams.get("code_challenge_method"), "S256")
      assert.equal(url.searchParams.get("response_type"), "code")
      assert.ok(url.searchParams.get("scope")?.split(" ").includes(scope))
      assert.ok(!output.includes(secret) && !output.includes(codes.verifier))
    }
    assert.deepEqual(network.calls, [])
    // This tests library request construction, not host redirect allowlisting, callback validation, consent or login.
  },

  async "MSQ04 real cache roundtrips opaque bytes and malformed deserialize poisons an instance rather than permitting blind serialize"() {
    const network = blockedNetwork()
    const app = new PublicClientApplication(configuration(network.client))
    const cache = app.getTokenCache()
    assert.deepEqual(await cache.getAllAccounts(), [])
    const serialized = cache.serialize()
    assert.ok(serialized.length > 0)
    const fresh = new PublicClientApplication(configuration(network.client)).getTokenCache()
    fresh.deserialize(serialized)
    assert.equal(fresh.serialize(), serialized)
    assert.equal(await fresh.getAccountByHomeId("synthetic-missing-account"), null)
    assert.throws(() => fresh.deserialize("SYNTHETIC_NOT_JSON_CACHE"))
    assert.throws(() => fresh.serialize())
    // An adapter must discard this failed instance, never serialize after a failed read and overwrite durable cache.
    const restored = new PublicClientApplication(configuration(network.client)).getTokenCache()
    restored.deserialize(serialized)
    assert.equal(restored.serialize(), serialized)
    assert.deepEqual(network.calls, [])
  },

  async "MSQ05 actual cache finally-hooks run after a failed before-hook, including cacheHasChanged=true"() {
    const network = blockedNetwork()
    const seen = { deny: false, before: 0, after: [] as boolean[] }
    const plugin: ICachePlugin = {
      beforeCacheAccess: async () => {
        seen.before++
        if (seen.deny) throw new Error("SYNTHETIC_CACHE_READ_REFUSED")
      },
      afterCacheAccess: async (context) => {
        seen.after.push(context.cacheHasChanged)
      },
    }
    const cache = new PublicClientApplication(configuration(network.client, plugin)).getTokenCache()
    assert.deepEqual(await cache.getAllAccounts(), [])
    assert.deepEqual(seen.after, [false])
    seen.deny = true
    await assert.rejects(cache.getAllAccounts(), /SYNTHETIC_CACHE_READ_REFUSED/)
    await assert.rejects(
      cache.removeAccount({
        homeAccountId: "synthetic.missing",
        localAccountId: "synthetic-local",
        tenantId: tenant,
        environment: "login.microsoftonline.com",
        username: "synthetic@example.invalid",
      }),
      /SYNTHETIC_CACHE_READ_REFUSED/,
    )
    assert.equal(seen.before, 3)
    assert.deepEqual(seen.after, [false, false, true])
    assert.deepEqual(network.calls, [])
    // This observes the upstream hazard; it does not claim that a production cache/CAS adapter already handles it.
  },
}
