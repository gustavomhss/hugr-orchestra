import { expect } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionContinuity } from "@/continuity/service"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { ProviderTest } from "../fake/provider"
import { awaitWithTimeout, it } from "../lib/effect"
import { A, B, FIRST, SECOND, NONCE, RECEIPT, applyFirst, begin, complete, entered, environment, held, prepare, seed, terminal } from "./service-fixture"

// Memory no longer reads the archive in prepare (aliases recall stored messages), so the model lookup is the async boundary.
for (const phase of ["model"] as const) for (const action of ["unchanged", "invalidate", "forget", "advance", "replace"] as const) {
  it.instance(`prepare rechecks entry/generation/artifact after held ${phase}: ${action}`, () => Effect.gen(function* () {
    const first = yield* held(FIRST, { reference: NONCE })
    const second = yield* held(SECOND)
    const waiting = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const gate = { armed: false, model: 0 }
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
    const pause = (at: typeof phase) => Effect.gen(function* () {
      if (!gate.armed || at !== phase) return
      gate.armed = false
      gate[at]++
      yield* Deferred.succeed(waiting, undefined)
      yield* Deferred.await(release)
    })
    const model = ProviderTest.model({ id: ModelV2.ID.make("continuity-model"), providerID: ProviderV2.ID.make("test") })
    const getModel: Provider.Interface["getModel"] = (providerID, modelID) => Effect.gen(function* () {
      expect(providerID).toBe(model.providerID)
      expect(modelID).toBe(model.id)
      yield* pause("model")
      return model
    })
    yield* Effect.gen(function* () {
      const sessions = yield* Session.Service
      const continuity = yield* SessionContinuity.Service
      const sessionID = yield* seed(B, A, RECEIPT)
      const initial = yield* applyFirst(sessionID, first)
      // Start replacement before capturing prepare: its completion changes the
      // artifact without advancing the already-captured entry generation.
      const replacement = action === "replace" ? yield* Effect.gen(function* () {
        yield* complete(yield* begin(sessionID, "REPLACEMENT_STARTED"), "REPLACEMENT_REPLY", 50_000)
        return yield* entered(second)
      }) : undefined
      const native = yield* sessions.messages({ sessionID })
      const before = yield* prepare(sessionID)
      expect(before.system).toEqual(initial.system)
      expect(before.messages).toEqual(action === "replace" ? native.slice(-2) : [native.at(-2)!])
      gate.armed = true
      const preparing = yield* continuity.prepare({ sessionID, messages: native, canRecall: true }).pipe(Effect.forkChild)
      yield* awaitWithTimeout(Deferred.await(waiting), "Prepare did not reach the selected real async boundary", "15 seconds")
      expect(yield* Effect.sync(() => preparing.pollUnsafe())).toBeUndefined()
      if (action === "invalidate") {
        yield* continuity.invalidate(sessionID)
        const part = native[0].parts[0]
        if (part.type !== "text") throw new Error("Expected editable source")
        yield* sessions.updatePart({ ...part, text: "EDITED_DURING_PREPARE" })
      }
      if (action === "forget") yield* continuity.forget(sessionID)
      if (action === "advance") yield* begin(sessionID, "NEW_USER_DURING_PREPARE")
      if (replacement) {
        yield* Deferred.succeed(second.release, undefined)
        yield* terminal(replacement.jobID, "completed", "applied")
        expect((yield* prepare(sessionID)).system[0]).toContain(SECOND)
      }
      yield* Deferred.succeed(release, undefined)
      const result = yield* Fiber.join(preparing)
      expect(gate[phase]).toBe(1)
      if (action === "unchanged") {
        expect(result).toEqual(before)
        return
      }
      expect(result).toEqual({ messages: native, system: [] })
      expect(result.messages).toBe(native)
      const current = yield* sessions.messages({ sessionID })
      const next = yield* prepare(sessionID)
      if (action === "advance") {
        expect(next.system).toEqual(initial.system)
        expect(next.messages).toEqual([current.at(-1)!])
        return
      }
      if (action === "replace") {
        expect(next.system[0]).toContain(SECOND)
        expect(next.system[0]).not.toContain(FIRST)
        expect(next.messages).toEqual([current.at(-2)!])
        return
      }
      expect(next).toEqual({ messages: current, system: [] })
      if (action === "invalidate") expect(current[0].parts[0]).toMatchObject({ text: "EDITED_DURING_PREPARE" })
      yield* complete(yield* begin(sessionID, "REBUILD_AFTER_INVALIDATION"), "REBUILD_REPLY", action === "forget" ? 50_000 : 100)
      const rebuilt = yield* entered(second)
      yield* Deferred.succeed(second.release, undefined)
      yield* terminal(rebuilt.jobID, "completed", "applied")
      expect((yield* prepare(sessionID)).system[0]).toContain(SECOND)
    }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)), Effect.provide(environment([first, second], { getModel })))
  }), 60_000)
}
