import { expect } from "bun:test"
import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { McpOAuthPendingProvider, McpOAuthProvider, authStatus } from "@orchestra/core/mcp/oauth-provider"
import { testEffect } from "../lib/effect"
import { network, signIn, storage } from "./oauth-authority-fixture"

const it = testEffect(Layer.empty)

function entry(issuer: string, suffix: string) {
  return {
    issuer,
    tokens: { issuer, accessToken: `ACCESS_${suffix}`, refreshToken: `REFRESH_${suffix}` },
    clientInfo: {
      issuer,
      clientId: `client_${suffix}`,
      clientSecret: `CLIENT_SECRET_${suffix}`,
      source: "dynamic" as const,
    },
  }
}

it.live(
  "contract: two Auth services reject every stale A mutation after B replacement and consume Pending B's generation",
  () =>
    Effect.gen(function* () {
      const file = yield* storage
      const servers = yield* network
      const a = yield* file.first.checkout("remote", servers.url)
      yield* file.first.updateBinding(a, {
        ...entry(servers.a.url.origin, "A"),
        codeVerifier: "PKCE_A",
        oauthState: "STATE_A",
      })
      const beginB = yield* file.second.begin("remote", `${servers.resource.url.origin}/mcp-b`)
      expect(beginB.previousState).toBe("STATE_A")
      expect(yield* file.second.get("remote")).toMatchObject({
        tokens: undefined,
        clientInfo: undefined,
        codeVerifier: undefined,
        oauthState: undefined,
      })
      yield* file.second.updateBinding(beginB.binding, {
        ...entry(servers.b.url.origin, "B"),
        codeVerifier: "PKCE_B",
        oauthState: "STATE_B",
      })
      yield* file.second.commitBinding(beginB.binding, entry(servers.b.url.origin, "B"))
      const b = yield* file.second.checkout("remote", `${servers.resource.url.origin}/mcp-b`)
      expect(b.generation).not.toBe(beginB.binding.generation)
      const expected = yield* file.second.get("remote")
      for (const mutation of [
        file.first.updateBinding(a, { tokens: entry(servers.a.url.origin, "A").tokens }),
        file.first.updateBinding(a, { clientInfo: entry(servers.a.url.origin, "A").clientInfo }),
        file.first.updateBinding(a, { codeVerifier: "LATE_PKCE_A", oauthState: "LATE_STATE_A" }),
        file.first.invalidateBinding(a, "all"),
        file.first.invalidateBinding(a, "client"),
        file.first.invalidateBinding(a, "tokens"),
        file.first.consumeState(a, "STATE_A"),
        file.first.commitBinding(a, entry(servers.a.url.origin, "A")),
        file.first.commitBinding(beginB.binding, entry(servers.b.url.origin, "B")),
      ]) {
        expect((yield* mutation.pipe(Effect.exit))._tag).toBe("Failure")
        expect(yield* file.second.get("remote")).toEqual(expected)
      }
      expect(expected).toMatchObject({
        serverUrl: `${servers.resource.url.origin}/mcp-b`,
        tokens: { accessToken: "ACCESS_B" },
        codeVerifier: undefined,
        oauthState: undefined,
      })
    }),
)

it.live(
  "contract: consumeState rejects wrong/reused states without clearing PKCE, and logout/recreate defeats ABA",
  () =>
    Effect.gen(function* () {
      const file = yield* storage
      const servers = yield* network
      const first = yield* file.first.begin("remote", servers.url)
      yield* file.first.updateBinding(first.binding, {
        issuer: servers.a.url.origin,
        oauthState: "VALID",
        codeVerifier: "PKCE",
      })
      expect((yield* file.second.consumeState(first.binding, "WRONG").pipe(Effect.exit))._tag).toBe("Failure")
      expect(yield* file.first.readBinding(first.binding)).toMatchObject({ oauthState: "VALID", codeVerifier: "PKCE" })
      yield* file.second.consumeState(first.binding, "VALID")
      expect((yield* file.first.consumeState(first.binding, "VALID").pipe(Effect.exit))._tag).toBe("Failure")
      expect(yield* file.first.readBinding(first.binding)).toMatchObject({
        oauthState: undefined,
        codeVerifier: "PKCE",
      })
      yield* file.first.updateBinding(first.binding, { oauthState: "OWNER_STATE" })
      expect(yield* file.second.remove("remote")).toMatchObject({ previousState: "OWNER_STATE" })
      expect((yield* file.first.checkout("remote", servers.url).pipe(Effect.exit))._tag).toBe("Failure")
      const recreated = yield* file.second.begin("remote", servers.url)
      expect(recreated.binding.generation).not.toBe(first.binding.generation)
      yield* file.second.updateBinding(recreated.binding, {
        issuer: servers.b.url.origin,
        oauthState: "NEW_STATE",
        codeVerifier: "NEW_PKCE",
      })
      expect(
        (yield* file.first.updateBinding(first.binding, entry(servers.a.url.origin, "A")).pipe(Effect.exit))._tag,
      ).toBe("Failure")
      expect(yield* file.second.readBinding(recreated.binding)).toMatchObject({
        oauthState: "NEW_STATE",
        codeVerifier: "NEW_PKCE",
      })
    }),
)

it.live("contract: the same real Pending provider cannot commit twice", () =>
  Effect.gen(function* () {
    const file = yield* storage
    const servers = yield* network
    const signed = yield* Effect.promise(() =>
      signIn({ auth: file.first, url: servers.url, metadata: servers.metadata }),
    )
    const before = yield* file.second.get("remote")
    const second = yield* Effect.promise(() =>
      signed.pending.commit().then(
        () => undefined,
        (error: unknown) => error,
      ),
    )
    expect(second).toBeInstanceOf(Error)
    expect(yield* file.second.get("remote")).toEqual(before)
  }),
)

it.live(
  "contract: static pin A survives a dynamic B commit/invalidate, config edits are not approval, and explicit logout permits new bind",
  () =>
    Effect.gen(function* () {
      const file = yield* storage
      const servers = yield* network
      const config = { clientId: "static_A", clientSecret: "CONFIGURED_STATIC_SECRET" }
      yield* Effect.promise(() => signIn({ auth: file.first, url: servers.url, metadata: servers.metadata, config }))
      expect(JSON.stringify(yield* file.first.get("remote"))).not.toContain(config.clientSecret)
      servers.state.issuer = servers.b.url.origin
      yield* Effect.promise(() => signIn({ auth: file.second, url: servers.url, metadata: servers.metadata }))
      const current = yield* file.first.checkout("remote", servers.url)
      yield* file.first.invalidateBinding(current, "all")
      expect(yield* file.second.readBinding(current)).toMatchObject({
        staticClientBinding: { clientId: config.clientId, issuer: servers.a.url.href },
      })
      yield* Effect.promise(async () => {
        const before = servers.calls.filter((call) => call.server === "B" && call.path === "/token").length
        const staticAtB = new McpOAuthProvider(
          "remote",
          servers.url,
          config,
          { onRedirect: () => {} },
          file.first,
          current,
        )
        const result = await auth(staticAtB, { serverUrl: servers.url, resourceMetadataUrl: servers.metadata }).then(
          (value) => value,
          (error: unknown) => error,
        )
        expect(result).toBeInstanceOf(Error)
        if (result instanceof Error) expect(authStatus(result, true)).toEqual({ status: "needs_auth" })
        expect(servers.calls.filter((call) => call.server === "B" && call.path === "/token")).toHaveLength(before)
        expect(
          servers.calls.filter(
            (call) => call.server === "B" && `${call.body} ${call.authorization}`.includes(config.clientSecret),
          ),
        ).toEqual([])
        const changedID = new McpOAuthProvider(
          "remote",
          servers.url,
          { ...config, clientId: "changed_without_logout" },
          { onRedirect: () => {} },
          file.second,
          current,
        )
        expect(
          await changedID.clientInformation().then(
            (value) => value,
            (error: unknown) => error,
          ),
        ).toBeInstanceOf(Error)
      })
      for (const attempt of [
        { issuer: servers.a.url.origin, config: { ...config, clientId: "changed_without_logout" } },
        { issuer: servers.b.url.origin, config },
      ]) {
        servers.state.issuer = attempt.issuer
        const forbidden = yield* file.first.begin("remote", servers.url)
        expect(forbidden.staticClientBinding).toMatchObject({ clientId: config.clientId, issuer: servers.a.url.href })
        const pending = new McpOAuthPendingProvider(
          "remote",
          servers.url,
          attempt.config,
          { onRedirect: () => {} },
          file.first,
          forbidden.binding,
        )
        const refusal = yield* Effect.promise(() =>
          auth(pending, { serverUrl: servers.url, resourceMetadataUrl: servers.metadata }).then(
            (value) => value,
            (error: unknown) => error,
          ),
        )
        expect(refusal).toBeInstanceOf(Error)
      }
      servers.state.issuer = servers.b.url.origin
      yield* file.second.remove("remote")
      yield* Effect.promise(() => signIn({ auth: file.second, url: servers.url, metadata: servers.metadata, config }))
      expect(JSON.stringify(yield* file.first.get("remote"))).not.toContain(config.clientSecret)
    }),
)

it.live(
  "contract: observed AS comparison accepts default-port/one slash normalization but rejects another same-origin path",
  () =>
    Effect.gen(function* () {
      const file = yield* storage
      const flow = yield* file.first.begin("remote", "https://resource.invalid/mcp")
      yield* file.first.updateBinding(flow.binding, { issuer: "https://ISSUER.invalid:443/tenant/" })
      yield* file.first.commitBinding(flow.binding, entry("https://ISSUER.invalid:443/tenant/", "A"))
      const binding = yield* file.second.checkout("remote", "https://resource.invalid/mcp")
      const provider = new McpOAuthProvider(
        "remote",
        "https://resource.invalid/mcp",
        {},
        { onRedirect: () => {} },
        file.second,
        binding,
      )
      yield* Effect.promise(async () => {
        await provider.saveDiscoveryState({ authorizationServerUrl: "https://issuer.invalid/tenant" })
        expect(await provider.tokens()).toMatchObject({ access_token: "ACCESS_A" })
        const mismatch = await provider
          .saveDiscoveryState({ authorizationServerUrl: "https://issuer.invalid/other-tenant" })
          .then(
            () => undefined,
            (error: unknown) => error,
          )
        expect(mismatch).toBeInstanceOf(Error)
        if (mismatch instanceof Error) expect(authStatus(mismatch, true)).toEqual({ status: "needs_auth" })
      })
    }),
)

it.live(
  "contract: invalidate(client) removes dependent tokens; invalidate(tokens) preserves the current client identity",
  () =>
    Effect.gen(function* () {
      const file = yield* storage
      const servers = yield* network
      const binding = yield* file.first.checkout("remote", servers.url)
      yield* file.first.updateBinding(binding, entry(servers.a.url.origin, "A"))
      yield* file.second.invalidateBinding(binding, "tokens")
      expect(yield* file.first.readBinding(binding)).toMatchObject({
        tokens: undefined,
        clientInfo: { clientId: "client_A" },
      })
      yield* file.first.updateBinding(binding, { tokens: entry(servers.a.url.origin, "A").tokens })
      yield* file.second.invalidateBinding(binding, "client")
      expect(yield* file.first.readBinding(binding)).toMatchObject({ tokens: undefined, clientInfo: undefined })
    }),
)

it.live(
  "contract: real Flock contention keeps Auth B outside Auth A's held mutation before B publishes the latest generation",
  () =>
    Effect.gen(function* () {
      const file = yield* storage
      const servers = yield* network
      expect(file.first).not.toBe(file.second)
      const binding = yield* file.first.checkout("remote", servers.url)
      yield* file.first.updateBinding(binding, entry(servers.a.url.origin, "A"))
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const contended = yield* Deferred.make<void>()
      file.controls.firstRead = { entered, release }
      file.controls.secondContended = contended
      const a = yield* file.first.updateBinding(binding, { codeVerifier: "HELD_A" }).pipe(Effect.forkScoped)
      yield* Effect.gen(function* () {
        yield* Deferred.await(entered)
        file.controls.secondReads = 0
        const b = yield* file.second
          .begin("remote", `${servers.resource.url.origin}/new-resource`)
          .pipe(Effect.forkScoped)
        const sawRealContention = yield* Effect.raceFirst(
          Deferred.await(contended).pipe(Effect.as(true)),
          Fiber.join(b).pipe(Effect.as(false)),
        )
        expect(sawRealContention).toBe(true)
        expect(file.controls.secondReads).toBe(0)
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(a)
        const next = yield* Fiber.join(b)
        yield* file.second.updateBinding(next.binding, entry(servers.b.url.origin, "B"))
        yield* file.second.commitBinding(next.binding, entry(servers.b.url.origin, "B"))
        const beforeLateA = yield* file.second.get("remote")
        expect(
          (yield* file.first.updateBinding(binding, entry(servers.a.url.origin, "A")).pipe(Effect.exit))._tag,
        ).toBe("Failure")
        expect(yield* file.second.get("remote")).toEqual(beforeLateA)
        expect(beforeLateA).toMatchObject({
          serverUrl: `${servers.resource.url.origin}/new-resource`,
          tokens: { accessToken: "ACCESS_B" },
          codeVerifier: undefined,
        })
      }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)))
    }),
  30_000,
)
