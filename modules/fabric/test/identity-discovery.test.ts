import { expect, test } from "bun:test"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect, Exit, Fiber } from "effect"
import { FabricIdentityDiscovery } from "../src/identity-discovery"
import { tokenFixture, tokenRefusal, objectID } from "./fixture/identity-token"
import { discoveryFixture, keysPath, metadata, metadataPath } from "./fixture/identity-discovery"
import { expectSpawn } from "../../../packages/core/test/fixture/omni-expect"

const layer = LayerNode.compile(LayerNode.group([AppProcess.node]))

test("JWK01 real TLS fixed-destination discovery publishes a verifier only after both intact responses", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* Effect.promise(tokenFixture)
        const f = yield* discoveryFixture({ keys: [{ ...s.key, issuer: metadata.issuer }] })
        const service = yield* FabricIdentityDiscovery.make({ profile: s.host, agent: f.agent })
        const verifier = yield* service.load()
        const at = Date.now()
        const token = yield* Effect.promise(() =>
          s.sign({ iat: Math.floor(at / 1000), nbf: Math.floor(at / 1000), exp: Math.floor(at / 1000) + 3600 }),
        )
        const proof = yield* verifier.verify({ ...s.input, token, createdAt: at })
        expect(proof.objectID).toBe(objectID)
        expect(verifier.owns(proof)).toBe(true)
        expect(f.observed.map((request) => request.path)).toEqual([metadataPath, keysPath])
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
        const service = yield* FabricIdentityDiscovery.make({ profile: s.host, agent: f.agent })
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
        const service = yield* FabricIdentityDiscovery.make({ profile: s.host, agent: f.agent })
        yield* service.load()
        for (const mode of ["redirect", "key-redirect", "status", "type", "encoding", "json", "overflow", "partial"]) {
          f.state.mode = mode
          const before = f.observed.length
          const result = yield* Effect.exit(service.load())
          expect(Exit.isFailure(result)).toBe(true)
          if (!Exit.isFailure(result) || result.cause.reasons[0]?._tag !== "Fail")
            throw new Error("Expected typed discovery failure")
          expect(JSON.stringify(result.cause.reasons[0].error)).not.toContain("PRIVATE")
          expect(f.observed.slice(before).map((request) => request.path)).toEqual(
            mode === "key-redirect" ? [metadataPath, keysPath] : [metadataPath],
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
        const good = yield* FabricIdentityDiscovery.make({ profile: s.host, agent: f.agent })
        yield* good.load()
        expect(f.observed).toHaveLength(2)
        const untrusted = yield* FabricIdentityDiscovery.make({ profile: s.host, agent: f.untrusted })
        yield* Effect.promise(() => tokenRefusal(untrusted.load(), "unavailable"))
        expect(f.observed).toHaveLength(2)
        f.wrongCertificate()
        const wrong = yield* FabricIdentityDiscovery.make({ profile: s.host, agent: f.wrongHost })
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
        const service = yield* FabricIdentityDiscovery.make({ profile: s.host, agent: f.agent, timeoutMs: 500 })
        yield* service.load()
        f.state.keys = { keys: [s.key] }
        yield* Effect.promise(() => tokenRefusal(service.load(), "denied"))
        f.state.mode = "stall"
        const closed = f.state.closed
        yield* Effect.promise(() => tokenRefusal(service.load(), "unavailable"))
        yield* f.waitClosed(closed)
        expect(f.state.closed).toBeGreaterThan(closed)
        const count = f.observed.length
        const fiber = yield* Effect.forkScoped(service.load())
        yield* f.waitRequest(count)
        const after = f.state.closed
        yield* Fiber.interrupt(fiber)
        yield* f.waitClosed(after)
        yield* Effect.promise(() =>
          tokenRefusal(FabricIdentityDiscovery.make({ profile: s.host, timeoutMs: 99 }), "invalid-input"),
        )
      }),
    ).pipe(Effect.provide(layer)),
  )
})
