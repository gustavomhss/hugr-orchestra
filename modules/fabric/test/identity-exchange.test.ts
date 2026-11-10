import { expect, test } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { AppProcess } from "@orchestra/core/process"
import { Location } from "@orchestra/core/location"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Effect, Exit, Fiber, Layer, Scope } from "effect"
import { FabricIdentityExchange } from "../src/identity-exchange"
import { FabricIdentityExchangeMaterial } from "../src/identity-exchange-material"
import { FabricIdentityTokenHttp } from "../src/identity-token-http"
import { FabricIdentityHttps } from "../src/identity-https"
import type { FabricIdentityExchangeContract } from "../src/identity-exchange-contract"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { FabricIdentitySecretTable } from "../src/identity-secret/sql"
import { FabricContextTable } from "../src/context/sql"
import { fixtures } from "./fixture/context"
import { layers } from "./fixture/identity-preparation"
import { contextualSetup, contextualRefusal } from "./fixture/identity-exchange"
import { keysPath, metadataPath } from "./fixture/identity-discovery"

const cases = fixtures()
const layer = (filename: string) => Layer.merge(layers(filename), LayerNode.compile(LayerNode.group([AppProcess.node])))

test("CXH01 real authorized callback, protected expectations, discovery and MSAL emit only a one-use opaque completion", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const db = yield* Database.Service
        const before = yield* db.db.select().from(FabricIdentityAttemptTable)
        const secrets = yield* db.db.select().from(FabricIdentitySecretTable)
        const completion = yield* s.run(s.host.exchange(s.selected))
        expect(JSON.stringify(completion)).toBe("{}")
        expect(Object.isFrozen(completion)).toBe(true)
        const handoff = { context: s.selected.context, attempt: s.selected.attempt, completion }
        const candidate = yield* s.run(s.host.consume(handoff))
        expect(candidate.proof.clientID).toBe(s.options.profile.clientID)
        expect(candidate.cache.serialized).toContain("SYNTHETIC_CXH_REFRESH")
        expect(s.f.observed.map((r) => r.path.split("?")[0])).toEqual([
          metadataPath,
          keysPath,
          "/organizations/oauth2/v2.0/token",
        ])
        expect(new URLSearchParams(s.f.observed[2]!.body).get("code")).toBe("SYNTHETIC_CALLBACK_CODE_FIRST")
        yield* contextualRefusal(s.run(s.host.consume(handoff)), "denied")
        expect(yield* db.db.select().from(FabricIdentityAttemptTable)).toEqual(before)
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(secrets)
        const receipts = JSON.stringify(yield* db.db.select().from(CapabilityRequestTable))
        for (const secret of ["SYNTHETIC_CXH_REFRESH", "SYNTHETIC_CALLBACK_CODE_FIRST", s.state.material.verifier])
          expect(receipts).not.toContain(secret)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("CXH02 call-time refs do not retain authority; missing invocation, wrong Location and ambient SQL refuse before egress", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        yield* s.run(s.host.exchange(s.selected))
        const input = yield* s.next()
        const operation = yield* s.run(Effect.sync(() => s.host.exchange(input)))
        const before = s.f.observed.length
        yield* contextualRefusal(
          operation.pipe(Effect.provideService(Location.Service, s.info.location)),
          "invocation_binding_missing",
        )
        yield* contextualRefusal(
          s.run(
            operation.pipe(
              Effect.provideService(Location.Service, {
                ...s.info.location,
                directory: s.info.location.project.directory,
              }),
            ),
          ),
          "denied",
        )
        const db = yield* Database.Service
        yield* db.db.transaction(() => contextualRefusal(s.run(operation), "unavailable"), { behavior: "immediate" })
        expect(s.f.observed).toHaveLength(before)
        const captured = { ...input, context: { ...input.context }, attempt: { ...input.attempt } }
        const scheduled = s.host.exchange(captured)
        captured.context.generation++
        captured.attempt.revision++
        yield* s.run(scheduled)
        expect(s.f.observed.filter((r) => r.method === "POST")).toHaveLength(2)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("CXH03 refused discovery preflight preserves the real callback ticket and never sends the code", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        yield* s.run(s.host.exchange(s.selected))
        const input = yield* s.next()
        s.f.state.metadata = { ...s.f.state.metadata, jwks_uri: "https://never-follow.invalid/keys" }
        const before = s.f.observed.length
        yield* contextualRefusal(s.run(s.host.exchange(input)), "denied")
        expect(s.f.observed.slice(before).map((r) => r.path)).toEqual([metadataPath])
        expect(yield* s.run(s.callbacks.consume(input))).toEqual({ code: "SYNTHETIC_CALLBACK_CODE_FIRST" })
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("CXH04 independent wire-triggered SQL revocation during keys or token response blocks provider or completion", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        yield* s.run(s.host.exchange(s.selected))
        const db = yield* Database.Service
        const original = (yield* db.db.select().from(FabricContextTable).get())!
        const revoke = yield* Effect.promise(async () => {
          const { Database } = await import("bun:sqlite")
          return () => {
            const store = new Database(f.filename)
            store
              .query("UPDATE fabric_context SET state='deleted', generation=generation+1 WHERE id=?")
              .run(original.id)
            store.close()
          }
        })
        for (const stage of ["keys", "token"]) {
          const input = yield* s.next()
          const seen = { fired: false }
          s.state.observe = (path, method) => {
            if (seen.fired || !(stage === "keys" ? path === keysPath : method === "POST")) return
            seen.fired = true
            revoke()
          }
          const posts = s.f.observed.filter((r) => r.method === "POST").length
          yield* contextualRefusal(s.run(s.host.exchange(input)), "expired")
          expect(seen.fired).toBe(true)
          expect(s.f.observed.filter((r) => r.method === "POST").length - posts).toBe(stage === "keys" ? 0 : 1)
          expect((yield* db.db.select().from(FabricContextTable).get())!.state).toBe("deleted")
          s.state.observe = () => {}
          yield* db.db.update(FabricContextTable).set(original)
          if (stage === "keys")
            expect(yield* s.run(s.callbacks.consume(input))).toEqual({ code: "SYNTHETIC_CALLBACK_CODE_FIRST" })
          if (stage === "token") yield* contextualRefusal(s.run(s.callbacks.consume(input)), "denied")
        }
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("CXH05 interrupting the actual token POST closes its client FD and never reconstructs the consumed code ticket", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        yield* s.run(s.host.exchange(s.selected))
        yield* s.f.waitIdle()
        const input = yield* s.next()
        s.state.observe = (_path, method) => {
          if (method === "POST") s.f.state.mode = "stall"
        }
        const count = s.f.observed.length
        const fiber = yield* Effect.forkScoped(s.run(s.host.exchange(input)))
        yield* s.f.waitRequest(count + 2)
        const port = s.f.clientPorts.at(-1)!
        const ends = s.f.state.peerEnds
        expect(yield* s.f.clientDescriptors(port)).toHaveLength(1)
        yield* Fiber.interrupt(fiber)
        yield* s.f.waitPeerEnd(ends)
        expect(yield* s.f.clientDescriptors(port)).toEqual([])
        s.f.finishPeers()
        yield* s.f.waitIdle()
        s.state.observe = () => {}
        s.f.state.mode = "normal"
        const posts = s.f.observed.filter((r) => r.method === "POST").length
        yield* contextualRefusal(s.run(s.host.exchange(input)), "denied")
        expect(s.f.observed.filter((r) => r.method === "POST")).toHaveLength(posts)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("CXH06 completion identity, current context and owning Scope constrain the backend-only candidate handoff", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const completion = yield* s.run(s.host.exchange(s.selected))
        yield* contextualRefusal(
          s.run(
            s.host.consume({
              context: s.selected.context,
              attempt: s.selected.attempt,
              completion: { ...completion } as FabricIdentityExchangeContract.Completion,
            }),
          ),
          "denied",
        )
        yield* contextualRefusal(
          s.run(
            s.host.consume({
              attempt: s.selected.attempt,
              context: { ...s.selected.context, generation: s.selected.context.generation + 1 },
              completion,
            }),
          ),
          "expired",
        )
        yield* s.run(s.host.consume({ context: s.selected.context, attempt: s.selected.attempt, completion }))
        const scope = yield* Scope.make()
        const host = yield* FabricIdentityExchange.make(s.options).pipe(Effect.provideService(Scope.Scope, scope))
        const input = yield* s.next()
        const pending = yield* s.run(host.exchange(input))
        yield* Scope.close(scope, yield* Effect.exit(Effect.void))
        yield* contextualRefusal(
          s.run(host.consume({ context: input.context, attempt: input.attempt, completion: pending })),
          "unavailable",
        )
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("CXH07 post-handshake admission retains the real frame and can refuse before any token body", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        yield* s.run(s.host.exchange(s.selected))
        yield* s.f.waitIdle()
        const input = yield* s.next()
        const reader = yield* FabricIdentityExchangeMaterial.make(s.options)
        const consumed = yield* s.run(s.callbacks.consume(input))
        const db = yield* Database.Service
        const original = (yield* db.db.select().from(FabricContextTable).get())!
        const revoke = yield* Effect.promise(async () => {
          const { Database } = await import("bun:sqlite")
          return () => {
            const store = new Database(f.filename)
            store
              .query("UPDATE fabric_context SET state='deleted', generation=generation+1 WHERE id=?")
              .run(original.id)
            store.close()
          }
        })
        const seen = { fired: false, admissions: 0 }
        s.state.secure = () => {
          seen.fired = true
          s.state.secure = () => {}
          revoke()
        }
        const requests = s.f.observed.length
        const connections = s.f.state.connections
        const admit = Effect.gen(function* () {
          seen.admissions++
          // No assumed cross-peer TLS event order: await the independent wire injection only at the second admission.
          if (seen.admissions === 2) yield* s.f.waitSecure(connections)
          yield* reader.read({ context: input.context, attempt: input.attempt })
        }).pipe(Effect.asVoid)
        yield* contextualRefusal(
          s.run(
            FabricIdentityTokenHttp.dispatch(
              FabricIdentityHttps.tokenEndpoint + "?client-request-id=" + s.state.material.correlationID,
              {
                body: new URLSearchParams({ code: consumed.code, grant_type: "authorization_code" }).toString(),
                correlationId: s.state.material.correlationID,
              },
              { network: s.f.network, timeoutMs: 10000, admit },
            ),
          ),
          "expired",
        )
        expect(seen.fired).toBe(true)
        expect(seen.admissions).toBe(2)
        expect(s.f.observed).toHaveLength(requests)
        expect(yield* s.f.clientDescriptors(s.f.clientPorts.at(-1)!)).toEqual([])
        yield* db.db.update(FabricContextTable).set(original)
        // The receiver delivered once even though subsequent TLS-time revocation correctly prevented body transmission.
        yield* contextualRefusal(s.run(s.callbacks.consume(input)), "denied")
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("CXH08 concurrent exchange of one actual callback ticket sends one POST and candidate consume has one winner", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const results = yield* s.run(
          Effect.all([Effect.exit(s.host.exchange(s.selected)), Effect.exit(s.host.exchange(s.selected))], {
            concurrency: 2,
          }),
        )
        const succeeded = results.filter(Exit.isSuccess)
        expect(succeeded).toHaveLength(1)
        expect(results.filter(Exit.isFailure)).toHaveLength(1)
        expect(s.f.observed.filter((r) => r.method === "POST")).toHaveLength(1)
        const completion = succeeded[0]!.value
        const input = { context: s.selected.context, attempt: s.selected.attempt, completion }
        const consumed = yield* s.run(
          Effect.all([Effect.exit(s.host.consume(input)), Effect.exit(s.host.consume(input))], { concurrency: 2 }),
        )
        expect(consumed.filter(Exit.isSuccess)).toHaveLength(1)
        expect(consumed.filter(Exit.isFailure)).toHaveLength(1)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("CXH09 completion capacity refuses before network or ticket consumption and a real handoff releases capacity", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const host = yield* FabricIdentityExchange.make({ ...s.options, maxEntries: 1 })
        const completion = yield* s.run(host.exchange(s.selected))
        const input = yield* s.next()
        const count = s.f.observed.length
        yield* contextualRefusal(s.run(host.exchange(input)), "limit")
        expect(s.f.observed).toHaveLength(count)
        yield* s.run(host.consume({ context: s.selected.context, attempt: s.selected.attempt, completion }))
        const next = yield* s.run(host.exchange(input))
        expect(Object.isFrozen(next)).toBe(true)
        expect(s.f.observed.filter((r) => r.method === "POST")).toHaveLength(2)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("CXH10 closing the owning host Scope aborts an in-flight real MSAL callback and cannot deliver a late completion", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const scope = yield* Scope.make()
        const host = yield* FabricIdentityExchange.make(s.options).pipe(Effect.provideService(Scope.Scope, scope))
        yield* s.run(host.exchange(s.selected))
        yield* s.f.waitIdle()
        const input = yield* s.next()
        s.state.observe = (_path, method) => {
          if (method === "POST") s.f.state.mode = "stall"
        }
        const count = s.f.observed.length
        const fiber = yield* Effect.forkScoped(s.run(host.exchange(input)))
        yield* s.f.waitRequest(count + 2)
        const port = s.f.clientPorts.at(-1)!
        const ends = s.f.state.peerEnds
        expect(yield* s.f.clientDescriptors(port)).toHaveLength(1)
        yield* Scope.close(scope, yield* Effect.exit(Effect.void))
        yield* s.f.waitPeerEnd(ends)
        expect(yield* s.f.clientDescriptors(port)).toEqual([])
        yield* contextualRefusal(Fiber.join(fiber), "unavailable")
        yield* contextualRefusal(s.run(host.exchange(input)), "unavailable")
        yield* contextualRefusal(s.run(s.callbacks.consume(input)), "denied")
        s.f.finishPeers()
        yield* s.f.waitIdle()
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})
