import { expect, test } from "bun:test"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect, Exit, Fiber } from "effect"
import { FabricIdentityDiscovery } from "../src/identity-discovery"
import { FabricIdentityHttps } from "../src/identity-https"
import { tokenFixture, tokenRefusal, objectID } from "./fixture/identity-token"
import { discoveryFixture, keysPath, metadata, metadataPath } from "./fixture/identity-discovery"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"

const layer = LayerNode.compile(LayerNode.group([AppProcess.node]))

test("JWK01 real TLS fixed-destination discovery publishes a verifier only after both intact responses", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* Effect.promise(tokenFixture)
        const f = yield* discoveryFixture({
          keys: [{ ...s.key, issuer: metadata.issuer, cloud_instance_name: "microsoftonline.com" }],
        })
        const wireMetadata = yield* FabricIdentityHttps.read("metadata", { network: f.network, timeoutMs: 10000 })
        expect(f.state.connections).toBe(1)
        expect(f.observed.map((request) => request.path)).toEqual([metadataPath])
        expect(JSON.parse(wireMetadata)).toEqual(metadata)
        const wireKeys = JSON.parse(yield* FabricIdentityHttps.read("keys", { network: f.network, timeoutMs: 10000 }))
        expect(wireKeys).toEqual({
          keys: [{ ...s.key, issuer: metadata.issuer, cloud_instance_name: "microsoftonline.com" }],
        })
        const start = f.observed.length
        const service = yield* FabricIdentityDiscovery.make({ profile: s.host, network: f.network })
        const verifier = yield* service.load()
        const at = Date.now()
        const token = yield* Effect.promise(() =>
          s.sign({ iat: Math.floor(at / 1000), nbf: Math.floor(at / 1000), exp: Math.floor(at / 1000) + 3600 }),
        )
        const proof = yield* verifier.verify({ ...s.input, token, createdAt: at })
        expect(proof.objectID).toBe(objectID)
        expect(verifier.owns(proof)).toBe(true)
        expect(f.observed.slice(start).map((request) => request.path)).toEqual([metadataPath, keysPath])
        expect(f.state.connections).toBe(4)
        for (const request of f.observed) {
          expect(request.method).toBe("GET")
          expect(request.headers.host).toBe("login.microsoftonline.com")
          expect(request.headers.authorization).toBeUndefined()
          expect(request.headers.cookie).toBeUndefined()
          expect(request.clientCertificate).toBe(false)
        }
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("JWK02 metadata cannot retarget JWKS, issuer, token or authorization destinations", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* Effect.promise(tokenFixture)
        const f = yield* discoveryFixture({ keys: [{ ...s.key, issuer: metadata.issuer }] })
        const service = yield* FabricIdentityDiscovery.make({ profile: s.host, network: f.network })
        yield* service.load()
        for (const changes of [
          { jwks_uri: "https://never-follow.invalid/keys" },
          { issuer: "https://evil.invalid" },
          { token_endpoint: "https://evil.invalid/token" },
          { authorization_endpoint: "https://evil.invalid/auth" },
          { id_token_signing_alg_values_supported: ["HS256"] },
        ]) {
          f.state.metadata = { ...metadata, ...changes }
          const before = f.observed.length
          yield* Effect.promise(() => tokenRefusal(service.load(), "denied"))
          expect(f.observed.slice(before).map((request) => request.path)).toEqual([metadataPath])
        }
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("JWK03 redirects, status, media, encoding, invalid JSON, actual chunk overflow and partial responses fail closed", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* Effect.promise(tokenFixture)
        const f = yield* discoveryFixture({ keys: [{ ...s.key, issuer: metadata.issuer }] })
        const service = yield* FabricIdentityDiscovery.make({ profile: s.host, network: f.network })
        yield* service.load()
        for (const mode of [
          "redirect",
          "key-redirect",
          "status",
          "type",
          "encoding",
          "json",
          "overflow",
          "key-overflow",
          "partial",
          "headers",
          "utf8",
        ]) {
          f.state.mode = mode
          const before = f.observed.length
          const result = yield* Effect.exit(
            mode === "overflow" || mode === "key-overflow" || mode === "utf8"
              ? FabricIdentityHttps.read(mode === "key-overflow" ? "keys" : "metadata", {
                  network: f.network,
                  timeoutMs: 10000,
                }).pipe(Effect.asVoid)
              : service.load().pipe(Effect.asVoid),
          )
          expect(Exit.isFailure(result)).toBe(true)
          if (!Exit.isFailure(result) || result.cause.reasons[0]?._tag !== "Fail")
            throw new Error("Expected typed discovery failure")
          expect(JSON.stringify(result.cause.reasons[0].error)).not.toContain("PRIVATE")
          expect(f.observed.slice(before).map((request) => request.path)).toEqual(
            mode === "key-redirect" ? [metadataPath, keysPath] : mode === "key-overflow" ? [keysPath] : [metadataPath],
          )
        }
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("JWK04 TLS trust and hostname verification refuse the same real server that passes the positive control", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* Effect.promise(tokenFixture)
        const f = yield* discoveryFixture({ keys: [{ ...s.key, issuer: metadata.issuer }] })
        const good = yield* FabricIdentityDiscovery.make({ profile: s.host, network: f.network })
        yield* good.load()
        expect(f.observed).toHaveLength(2)
        const untrusted = yield* FabricIdentityDiscovery.make({ profile: s.host, network: f.untrusted })
        yield* Effect.promise(() => tokenRefusal(untrusted.load(), "unavailable"))
        expect(f.observed).toHaveLength(2)
        f.wrongCertificate()
        const wrong = yield* FabricIdentityDiscovery.make({ profile: s.host, network: f.wrongHost })
        yield* Effect.promise(() => tokenRefusal(wrong.load(), "unavailable"))
        expect(f.observed).toHaveLength(2)
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("JWK05 invalid keys never publish an old verifier; timeout and interruption close actual sockets", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* Effect.promise(tokenFixture)
        const f = yield* discoveryFixture({ keys: [{ ...s.key, issuer: metadata.issuer }] })
        const service = yield* FabricIdentityDiscovery.make({ profile: s.host, network: f.network, timeoutMs: 500 })
        yield* service.load()
        f.state.keys = { keys: [s.key] }
        yield* Effect.promise(() => tokenRefusal(service.load(), "denied"))
        for (const key of [
          { ...s.key, issuer: metadata.issuer, cloud_instance_name: "evil.invalid" },
          {
            ...s.key,
            issuer: metadata.issuer,
            cloud_instance_name: "microsoftonline.com",
            d: "PRIVATE_KEY_MUST_NOT_BE_LAUNDERED",
          },
        ]) {
          f.state.keys = { keys: [key] }
          yield* Effect.promise(() => tokenRefusal(service.load(), "denied"))
        }
        yield* f.waitIdle()
        f.state.mode = "stall"
        const closed = f.state.closed
        yield* Effect.promise(() => tokenRefusal(service.load(), "unavailable"))
        expect(yield* f.clientDescriptors(f.clientPorts.at(-1)!)).toEqual([])
        f.finishPeers()
        yield* f.waitClosed(closed)
        expect(f.state.closed).toBeGreaterThan(closed)
        const count = f.observed.length
        const fiber = yield* Effect.forkScoped(service.load())
        yield* f.waitRequest(count)
        const after = f.state.closed
        const peerEnds = f.state.peerEnds
        const port = f.clientPorts.at(-1)!
        expect(yield* f.clientDescriptors(port)).toHaveLength(1)
        yield* Fiber.interrupt(fiber)
        yield* f.waitPeerEnd(peerEnds)
        expect(yield* f.clientDescriptors(port)).toEqual([])
        // The fixture retained its writable TLS half; release it only after the independent client-fd oracle passes.
        f.finishPeers()
        yield* f.waitClosed(after)
        yield* Effect.promise(() =>
          tokenRefusal(FabricIdentityDiscovery.make({ profile: s.host, timeoutMs: 99 }), "invalid-input"),
        )
      }),
    ).pipe(Effect.provide(layer)),
  )
})
