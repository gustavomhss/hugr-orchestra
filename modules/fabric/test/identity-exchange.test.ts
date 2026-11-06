import { expect, test } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { AppProcess } from "@orchestra/core/process"
import { Location } from "@orchestra/core/location"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Effect, Fiber, Layer, Scope } from "effect"
import { FabricIdentityExchange } from "../src/identity-exchange"
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
        const candidate = yield* s.run(s.host.consume({ ...s.selected, completion }))
        expect(candidate.proof.clientID).toBe(s.options.profile.clientID)
        expect(candidate.cache.serialized).toContain("SYNTHETIC_CXH_REFRESH")
        expect(s.f.observed.map((r) => r.path.split("?")[0])).toEqual([
          metadataPath,
          keysPath,
          "/organizations/oauth2/v2.0/token",
        ])
        expect(new URLSearchParams(s.f.observed[2]!.body).get("code")).toBe("SYNTHETIC_CALLBACK_CODE_FIRST")
        yield* contextualRefusal(s.run(s.host.consume({ ...s.selected, completion })), "denied")
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
              ...s.selected,
              completion: { ...completion } as FabricIdentityExchangeContract.Completion,
            }),
          ),
          "denied",
        )
        yield* contextualRefusal(
          s.run(
            s.host.consume({
              ...s.selected,
              context: { ...s.selected.context, generation: s.selected.context.generation + 1 },
              completion,
            }),
          ),
          "expired",
        )
        yield* s.run(s.host.consume({ ...s.selected, completion }))
        const scope = yield* Scope.make()
        const host = yield* FabricIdentityExchange.make(s.options).pipe(Effect.provideService(Scope.Scope, scope))
        const input = yield* s.next()
        const pending = yield* s.run(host.exchange(input))
        yield* Scope.close(scope, yield* Effect.exit(Effect.void))
        yield* contextualRefusal(s.run(host.consume({ ...input, completion: pending })), "unavailable")
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})
