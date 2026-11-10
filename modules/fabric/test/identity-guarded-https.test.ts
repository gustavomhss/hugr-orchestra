import { expect, test } from "bun:test"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { Effect, Fiber } from "effect"
import { FabricIdentityTokenHttp } from "../src/identity-token-http"
import { FabricIdentityHttps } from "../src/identity-https"
import { discoveryFixture } from "./fixture/identity-discovery"
import { tokenRefusal } from "./fixture/identity-token"

const layer = LayerNode.compile(LayerNode.group([AppProcess.node]))
const correlationID = "66666666-7777-4888-8999-aaaaaaaaaaaa"
const request = { body: "grant_type=authorization_code&code=SYNTHETIC_GHT_CODE", correlationId: correlationID }
const url = FabricIdentityHttps.tokenEndpoint + "?client-request-id=" + correlationID

test("GHT01 installed HTTP parser over the admitted real TLS socket enforces response framing, media and byte limits", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const f = yield* discoveryFixture({ keys: [] }, { token: async () => ({ ok: true }) })
        const options = { network: f.network, timeoutMs: 10000, admit: Effect.void }
        expect((yield* FabricIdentityTokenHttp.dispatch(url, request, options)).body).toEqual({ ok: true })
        expect(f.observed[0]!.body).toBe(request.body)
        for (const mode of [
          "status",
          "redirect",
          "type",
          "encoding",
          "json",
          "overflow",
          "partial",
          "headers",
          "utf8",
        ]) {
          f.state.mode = mode
          const before = f.observed.length
          yield* Effect.promise(() =>
            tokenRefusal(FabricIdentityTokenHttp.dispatch(url, request, options), "unavailable"),
          )
          expect(f.observed.length - before).toBe(1)
        }
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("GHT02 untrusted or wrong-name certificates cannot receive a token body on the guarded socket", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const f = yield* discoveryFixture({ keys: [] }, { token: async () => ({ ok: true }) })
        const options = { network: f.network, timeoutMs: 10000, admit: Effect.void }
        yield* FabricIdentityTokenHttp.dispatch(url, request, options)
        const before = f.observed.length
        yield* Effect.promise(() =>
          tokenRefusal(
            FabricIdentityTokenHttp.dispatch(url, request, { ...options, network: f.untrusted }),
            "unavailable",
          ),
        )
        f.wrongCertificate()
        yield* Effect.promise(() =>
          tokenRefusal(
            FabricIdentityTokenHttp.dispatch(url, request, { ...options, network: f.wrongHost }),
            "unavailable",
          ),
        )
        expect(f.observed).toHaveLength(before)
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("GHT03 native deadline and interruption close the actual client FD before server-side cooperation", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const f = yield* discoveryFixture({ keys: [] }, { token: async () => ({ ok: true }) })
        const options = { network: f.network, timeoutMs: 500, admit: Effect.void }
        yield* FabricIdentityTokenHttp.dispatch(url, request, options)
        yield* f.waitIdle()
        f.state.mode = "stall"
        yield* Effect.promise(() =>
          tokenRefusal(FabricIdentityTokenHttp.dispatch(url, request, options), "unavailable"),
        )
        expect(yield* f.clientDescriptors(f.clientPorts.at(-1)!)).toEqual([])
        f.finishPeers()
        yield* f.waitIdle()
        const count = f.observed.length
        const fiber = yield* Effect.forkScoped(
          FabricIdentityTokenHttp.dispatch(url, request, { ...options, timeoutMs: 10000 }),
        )
        yield* f.waitRequest(count)
        const port = f.clientPorts.at(-1)!
        const ends = f.state.peerEnds
        expect(yield* f.clientDescriptors(port)).toHaveLength(1)
        yield* Fiber.interrupt(fiber)
        yield* f.waitPeerEnd(ends)
        expect(yield* f.clientDescriptors(port)).toEqual([])
        f.finishPeers()
        yield* f.waitIdle()
      }),
    ).pipe(Effect.provide(layer)),
  )
})
