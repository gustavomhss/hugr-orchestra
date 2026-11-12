import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Mcp } from "@orchestra/core/mcp"
import { McpOAuthCallback } from "@orchestra/core/mcp/oauth-callback"
import { testEffect } from "../lib/effect"
import { callbackAddress, manager, network, signIn, storage } from "./oauth-authority-fixture"

const it = testEffect(Layer.empty)

it.live("begin then cancellation never restores credentials from the legitimate connected manager", () =>
  Effect.gen(function* () {
    const file = yield* storage
    const servers = yield* network
    const redirectUri = yield* Effect.promise(callbackAddress)
    yield* Effect.addFinalizer(() => Effect.promise(() => McpOAuthCallback.stop()))
    yield* Effect.promise(() => signIn({ auth: file.first, url: servers.url, metadata: servers.metadata }))
    const current = yield* manager({ auth: file.first, directory: file.directory, url: servers.url, redirectUri })
    yield* current.ready()
    expect((yield* current.list()).find((entry) => entry.name === "remote")?.status.status).toBe("connected")
    const started = yield* current.startAuth("remote")
    expect(started.authorizationUrl).not.toBe("")
    expect((yield* file.second.get("remote"))?.tokens).toBeUndefined()
    expect((yield* current.list()).find((entry) => entry.name === "remote")?.status.status).toBe("needs_auth")
    McpOAuthCallback.cancelPending("remote", started.oauthState)
    expect((yield* file.second.get("remote"))?.tokens).toBeUndefined()
  }),
)

it.live(
  "two real managers/Auth services: B survives delayed A whether A is refused early or only its captured callback loses authority",
  () =>
    Effect.gen(function* () {
      const file = yield* storage
      const servers = yield* network
      const redirectUri = yield* Effect.promise(callbackAddress)
      yield* Effect.addFinalizer(() => Effect.promise(() => McpOAuthCallback.stop()))
      const aFinishedState = Promise.withResolvers<void>()
      const bCommitted = Promise.withResolvers<void>()
      // These observers delegate the frozen operations; no unfenced production writer is required by the fixture.
      const firstAuth = {
        ...file.first,
        readBinding: (...args: Parameters<typeof file.first.readBinding>) =>
          file.first.readBinding(...args).pipe(
            Effect.tapError(() =>
              Effect.sync(() => {
                aFinishedState.resolve()
              }),
            ),
          ),
        updateBinding: (...args: Parameters<typeof file.first.updateBinding>) =>
          file.first.updateBinding(...args).pipe(
            Effect.tapError(() =>
              Effect.sync(() => {
                aFinishedState.resolve()
              }),
            ),
          ),
        consumeState: (...args: Parameters<typeof file.first.consumeState>) =>
          file.first.consumeState(...args).pipe(
            Effect.onExit(() =>
              Effect.sync(() => {
                aFinishedState.resolve()
              }),
            ),
          ),
      }
      const secondAuth = {
        ...file.second,
        commitBinding: (...args: Parameters<typeof file.second.commitBinding>) =>
          file.second.commitBinding(...args).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                bCommitted.resolve()
              }),
            ),
          ),
      }
      const first = yield* manager({ auth: firstAuth, directory: file.directory, url: servers.url, redirectUri })
      const second = yield* manager({ auth: secondAuth, directory: file.directory, url: servers.url, redirectUri })
      yield* first.ready()
      yield* second.ready()
      const entered = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      servers.state.registrationA = { entered, release }
      yield* Effect.promise(async () => {
        const pendingA = Effect.runPromise(first.startAuth("remote").pipe(Effect.result))
        console.info("H7 manager phase: awaiting A registration")
        await entered.promise
        console.info("H7 manager phase: A registration held")
        servers.state.issuer = servers.b.url.origin
        const b = await Effect.runPromise(second.startAuth("remote"))
        console.info("H7 manager phase: B started")
        const beforeA = await Effect.runPromise(file.second.get("remote"))
        release.resolve()
        const outcomeA = await pendingA
        console.info("H7 manager phase: A settled", outcomeA._tag)
        expect(new URL(b.authorizationUrl).searchParams.get("state")).toBe(b.oauthState)
        if (outcomeA._tag === "Failure") {
          expect(outcomeA.failure).toBeInstanceOf(Mcp.AuthError)
          aFinishedState.resolve()
        }
        if (outcomeA._tag === "Success") {
          const a = outcomeA.success
          expect(new URL(a.authorizationUrl).searchParams.get("state")).toBe(a.oauthState)
          const answer = await fetch(`${redirectUri}?state=${encodeURIComponent(a.oauthState)}&code=CODE_A`)
          expect([200, 400]).toContain(answer.status)
          if (answer.status === 400) aFinishedState.resolve()
        }
        await aFinishedState.promise
        console.info("H7 manager phase: A authority observed")
        const afterA = await Effect.runPromise(file.second.get("remote"))
        expect(afterA).toEqual(beforeA)
        expect(servers.calls.filter((call) => call.path === "/token" && call.body.includes("CODE_A"))).toEqual([])
        expect(
          servers.calls.filter(
            (call) =>
              call.server === "B" && /ACCESS_A|REFRESH_A|CLIENT_SECRET_A/.test(`${call.body} ${call.authorization}`),
          ),
        ).toEqual([])
        expect((await Effect.runPromise(second.list())).find((entry) => entry.name === "remote")?.status.status).toBe(
          "needs_auth",
        )
        expect((await fetch(`${redirectUri}?state=${encodeURIComponent(b.oauthState)}&code=CODE_B`)).status).toBe(200)
        console.info("H7 manager phase: B callback delivered")
        await bCommitted.promise
        console.info("H7 manager phase: B committed")
        expect((await Effect.runPromise(file.second.get("remote")))?.tokens?.accessToken).toBe("ACCESS_B")
        expect(servers.calls.filter((call) => call.path === "/token" && call.body.includes("CODE_B"))).toHaveLength(1)
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            release.resolve()
          }),
        ),
      )
    }),
  30_000,
)

it.live("positive control: oauth:false connects publicly without OAuth discovery or auth writes", () =>
  Effect.gen(function* () {
    const file = yield* storage
    const servers = yield* network
    servers.state.public = true
    const current = yield* manager({
      auth: file.first,
      directory: file.directory,
      url: servers.url,
      redirectUri: "http://127.0.0.1:19876/mcp/oauth/callback",
      oauth: false,
    })
    yield* current.ready()
    expect((yield* current.list()).find((entry) => entry.name === "remote")?.status.status).toBe("connected")
    expect(servers.calls.filter((call) => call.server !== "R")).toEqual([])
    expect(servers.calls.every((call) => call.authorization === null)).toBe(true)
    expect(yield* Effect.promise(() => Bun.file(file.file).exists())).toBe(false)
  }),
)
