import { expect } from "bun:test"
import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import { Effect, Layer } from "effect"
import { McpOAuthPendingProvider, McpOAuthProvider, authStatus } from "@orchestra/core/mcp/oauth-provider"
import { testEffect } from "../lib/effect"
import { network, signIn, storage } from "./oauth-authority-fixture"

const it = testEffect(Layer.empty)

it.live(
  "issuer roundtrip reconstructs a provider with a new checkout and retains both SDK credential stamps in an encrypted file",
  () =>
    Effect.gen(function* () {
      const file = yield* storage
      const servers = yield* network
      yield* Effect.promise(() => signIn({ auth: file.first, url: servers.url, metadata: servers.metadata }))
      const binding = yield* file.second.checkout("remote", servers.url)
      const provider = new McpOAuthProvider("remote", servers.url, {}, { onRedirect: () => {} }, file.second, binding)
      yield* Effect.promise(async () => {
        expect(await provider.tokens()).toMatchObject({ issuer: servers.a.url.href, access_token: "ACCESS_A" })
        expect(await provider.clientInformation()).toMatchObject({ issuer: servers.a.url.href, client_id: "client_A" })
      })
      const raw = yield* Effect.promise(() => Bun.file(file.file).text())
      expect(JSON.parse(raw)).toStartWith("enc:v1:")
      expect(raw).not.toContain("REFRESH_A")
    }),
)

it.live("positive control: legitimate manual OAuth A then normal pinned SDK refresh stays at A", () =>
  Effect.gen(function* () {
    const file = yield* storage
    const servers = yield* network
    const signed = yield* Effect.promise(() =>
      signIn({ auth: file.first, url: servers.url, metadata: servers.metadata }),
    )
    const before = servers.calls.filter((call) => call.server === "A" && call.path === "/token").length
    expect(
      yield* Effect.promise(() =>
        auth(signed.provider, { serverUrl: servers.url, resourceMetadataUrl: servers.metadata }),
      ),
    ).toBe("AUTHORIZED")
    expect(servers.calls.filter((call) => call.server === "A" && call.path === "/token")).toHaveLength(before + 1)
    expect(servers.calls.filter((call) => call.server === "B" && call.path === "/token")).toEqual([])
  }),
)

for (const forgedMetadataIssuer of [false, true]) {
  it.live(
    `real SDK after legitimate A never sends ACCESS_A/refresh/client secret in body or Authorization to B (${forgedMetadataIssuer ? "forged metadata.issuer" : "new discovered AS"})`,
    () =>
      Effect.gen(function* () {
        const file = yield* storage
        const servers = yield* network
        const signed = yield* Effect.promise(() =>
          signIn({ auth: file.first, url: servers.url, metadata: servers.metadata }),
        )
        servers.state.issuer = servers.b.url.origin
        if (forgedMetadataIssuer) servers.state.metadataIssuer = servers.a.url.origin
        const outcome = yield* Effect.promise(() =>
          auth(signed.provider, { serverUrl: servers.url, resourceMetadataUrl: servers.metadata }).then(
            (value) => value,
            (error: unknown) => error,
          ),
        )
        const b = servers.calls.filter((call) => call.server === "B")
        expect(
          b.filter((call) => /ACCESS_A|CLIENT_SECRET_A|REFRESH_A/.test(`${call.body} ${call.authorization}`)),
        ).toEqual([])
        expect(b.filter((call) => call.authorization !== null)).toEqual([])
        expect(b.filter((call) => call.path === "/token")).toEqual([])
        expect(outcome).toBeInstanceOf(Error)
        if (outcome instanceof Error) expect(authStatus(outcome, true)).toEqual({ status: "needs_auth" })
      }),
  )
}

it.live(
  "a pinned automatic Bearer getter blocks downgraded legacy data before discovery and leaves the other valid sealed connection untouched",
  () =>
    Effect.gen(function* () {
      const file = yield* storage
      const servers = yield* network
      const legacy = yield* Effect.promise(() =>
        signIn({ auth: file.first, url: servers.url, metadata: servers.metadata, name: "legacy" }),
      )
      yield* Effect.promise(() =>
        signIn({ auth: file.second, url: servers.url, metadata: servers.metadata, name: "healthy" }),
      )
      const data = yield* file.first.all()
      yield* file.seed({
        ...data,
        legacy: {
          ...data.legacy,
          tokens: { accessToken: "LEGACY_ACCESS", refreshToken: "LEGACY_REFRESH" },
          clientInfo: { clientId: "legacy_client", source: "dynamic" },
        },
      })
      const before = yield* Effect.promise(() => Bun.file(file.file).text())
      const calls = servers.calls.length
      const outcome = yield* Effect.promise(() =>
        legacy.provider.tokens().then(
          (value) => value,
          (error: unknown) => error,
        ),
      )
      expect(outcome).toBeInstanceOf(Error)
      if (outcome instanceof Error) expect(authStatus(outcome, true)).toEqual({ status: "needs_auth" })
      expect(servers.calls).toHaveLength(calls)
      expect(yield* file.second.get("healthy")).toEqual(data.healthy)
      expect(yield* Effect.promise(() => Bun.file(file.file).text())).toBe(before)
    }),
)

it.live(
  "static manual SDK bind persists independent staticClientBinding metadata without copying the configured secret",
  () =>
    Effect.gen(function* () {
      const file = yield* storage
      const servers = yield* network
      const config = { clientId: "static_A", clientSecret: "STATIC_CONFIG_SECRET" }
      const signed = yield* Effect.promise(() =>
        signIn({ auth: file.first, url: servers.url, metadata: servers.metadata, config }),
      )
      const stored = yield* file.second.readBinding(signed.binding)
      expect(stored).toMatchObject({ staticClientBinding: { clientId: config.clientId, issuer: servers.a.url.href } })
      expect(JSON.stringify(stored)).not.toContain(config.clientSecret)
    }),
)

for (const configured of [false, true]) {
  it.live(
    `${configured ? "configured" : "dynamic"} Pending pins observed AS before exchange and never sends A's code or secret to B`,
    () =>
      Effect.gen(function* () {
        const file = yield* storage
        const servers = yield* network
        const flow = yield* file.first.begin("remote", servers.url)
        const provider = new McpOAuthPendingProvider(
          "remote",
          servers.url,
          configured ? { clientId: "static_A", clientSecret: "STATIC_CONFIG_SECRET" } : {},
          { onRedirect: () => {} },
          file.first,
          flow.binding,
        )
        yield* Effect.promise(async () => {
          expect(await auth(provider, { serverUrl: servers.url, resourceMetadataUrl: servers.metadata })).toBe(
            "REDIRECT",
          )
          servers.state.issuer = servers.b.url.origin
          const result = await auth(provider, {
            serverUrl: servers.url,
            resourceMetadataUrl: servers.metadata,
            authorizationCode: "CODE_FROM_A",
          }).then(
            (value) => value,
            (error: unknown) => error,
          )
          expect(
            servers.calls.filter(
              (call) =>
                call.server === "B" &&
                /CODE_FROM_A|ACCESS_A|REFRESH_A|CLIENT_SECRET_A|STATIC_CONFIG_SECRET/.test(
                  `${call.body} ${call.authorization}`,
                ),
            ),
          ).toEqual([])
          expect(servers.calls.filter((call) => call.server === "B" && call.path === "/token")).toEqual([])
          expect(result).toBeInstanceOf(Error)
        })
      }),
  )
}

it.live("invalid stamp types are isolated to one sealed entry without rewriting its healthy neighbor", () =>
  Effect.gen(function* () {
    const file = yield* storage
    const servers = yield* network
    const invalid = yield* Effect.promise(() =>
      signIn({ auth: file.first, url: servers.url, metadata: servers.metadata, name: "invalid" }),
    )
    yield* Effect.promise(() =>
      signIn({ auth: file.second, url: servers.url, metadata: servers.metadata, name: "healthy" }),
    )
    const data = yield* file.first.all()
    const healthy = JSON.stringify(data.healthy)
    for (const value of ["invalid", 42, {}]) {
      for (const broken of [
        { ...data.invalid, issuer: value },
        { ...data.invalid, tokens: { ...data.invalid.tokens, issuer: value } },
        { ...data.invalid, clientInfo: { ...data.invalid.clientInfo, issuer: value } },
        { ...data.invalid, clientInfo: { ...data.invalid.clientInfo, source: value } },
        { ...data.invalid, generation: value },
        { ...data.invalid, staticClientBinding: value },
      ]) {
        yield* file.seed({ ...data, invalid: broken })
        const before = yield* Effect.promise(() => Bun.file(file.file).text())
        const calls = servers.calls.length
        const result = yield* Effect.promise(() =>
          invalid.provider.tokens().then(
            (tokens) => tokens,
            (error: unknown) => error,
          ),
        )
        expect(result).toBeInstanceOf(Error)
        if (result instanceof Error) expect(authStatus(result, true)).toEqual({ status: "needs_auth" })
        expect(servers.calls).toHaveLength(calls)
        expect(JSON.stringify(yield* file.second.get("healthy"))).toBe(healthy)
        expect(yield* Effect.promise(() => Bun.file(file.file).text())).toBe(before)
      }
    }
  }),
)
