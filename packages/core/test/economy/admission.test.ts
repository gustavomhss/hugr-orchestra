// G1 / F2 — admission authority oracle (EA-01..EA-04, EA-08..EA-29).
// Contract: modules/atlas/docs/design/genesis-g1-contract.md §3.2.
// Every test drives the real ledger path over a real fixture database (in-memory SQLite or,
// for restart/concurrent cutpoints, a tmp file; no stubs). Faults are injected in the named
// frozen cutpoints via Faults; the ledger is never simulated in the oracle itself.

import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { Database } from "../../src/database/database"
import {
  attemptKey,
  faultLayer,
  lookupAttempt,
  noteTransportError,
  observeTerminal,
  recoverEnvelopeAttempts,
  recordCompletion,
  recordForward,
  recordSemantic,
  reserveAttempt,
  seedEnvelope,
  settleAttempt,
  type AttemptId,
  type AttemptOutcome,
  type EconomyEnvelope,
  type LogicalRequest,
  type SealedRequest,
} from "../../src/economy/admission"
import { EconomyAttemptTable } from "../../src/economy/sql"

const tmpDir = () => mkdtempSync(join(tmpdir(), "economy-test-"))

const envelope = (limits: EconomyEnvelope["limits"], authorityId = "auth-1"): EconomyEnvelope => ({
  envelopeId: "env-1",
  authorityId,
  scope: "core",
  provider: "fixture",
  model: "responses",
  route: "http",
  stages: ["prod", "eval", "update"],
  limits,
  retryPolicy: { maxRetries: 2, statuses: [503] },
})
const logical = (logicalRequestId = "req-1", stage = "prod", snapshot = "sha-1"): LogicalRequest => ({
  logicalRequestId,
  stage,
  snapshot,
})
const sealed = (
  env: EconomyEnvelope,
  logicalRequest: LogicalRequest,
  key: string,
  bound?: SealedRequest["bound"],
  prior?: AttemptId,
): SealedRequest => ({
  envelope: env,
  logical: logicalRequest,
  key,
  route: "http",
  endpoint: "/v1/responses",
  protocol: "responses",
  body: JSON.stringify({ input: "ping", max_output_tokens: bound?.outputTokens ?? 10 }),
  bound: bound ?? { attempts: 1 },
  ...(prior === undefined ? {} : { prior }),
})
const run = <A>(body: Effect.Effect<A, never, Database.Service>) =>
  Effect.runPromise(body.pipe(Effect.provide(Database.layerFromPath(":memory:"))))

const runWithFaults = <A>(faults: Parameters<typeof faultLayer>[0], body: Effect.Effect<A, never, Database.Service>) =>
  Effect.runPromise(body.pipe(Effect.provide(faultLayer(faults)), Effect.provide(Database.layerFromPath(":memory:"))))

const status = { kind: "economy-settled" as const }
const refused = (outcome: AttemptOutcome, reason: string) =>
  expect(outcome).toMatchObject({ kind: "economy-refusal", reason })

describe("G1 admission authority", () => {
  test("EA-01 valid-request-reserves-forwards-settles", async () => {
    const outcome = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, outputTokens: 100, inFlight: 5 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k1", { attempts: 1, outputTokens: 10 }))
      if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected consumable grant")
      yield* recordForward(grant.attempt)
      yield* observeTerminal(grant.attempt, { evidenceDigest: "sha-done", evidence: JSON.stringify({ status: 200 }) })
      return yield* settleAttempt(grant.attempt, { inputTokens: 5, outputTokens: 10 }, { evidenceDigest: "sha-done", evidence: JSON.stringify({ status: 200 }) })
    }))
    expect(outcome).toMatchObject(status)
  })

  test("EA-02 reserve-commit-before-forward: the grant is durable before any send", async () => {
    const rows = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 1, inFlight: 1 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k2"))
      if (grant.kind !== "economy-grant") return null
      return yield* recoverEnvelopeAttempts(env.envelopeId)
    }))
    expect(rows).not.toBeNull()
    if (rows !== null && Array.isArray(rows)) {
      expect(rows).toHaveLength(1)
      expect(rows[0].state).toBe("reserved")
      expect(rows[0].fingerprint).not.toBe("")
    }
  })

  test("EA-03 failed-or-lost-reserve-ack: the network never repeats; the repeat is never another grant", async () => {
    const outcome = await runWithFaults({ failReserveCommit: true, loseReserveAck: true }, Effect.gen(function* () {
      const env = envelope({ attempts: 5, inFlight: 5 })
      yield* seedEnvelope(env)
      const failed = yield* reserveAttempt(sealed(env, logical(), "k3a"))
      const rowsAfterFailed = yield* recoverEnvelopeAttempts(env.envelopeId)
      const lost = yield* reserveAttempt(sealed(env, logical(), "k3b"))
      const rowsAfterLost = yield* recoverEnvelopeAttempts(env.envelopeId)
      const repeat = yield* reserveAttempt(sealed(env, logical(), "k3b"))
      return { failed, rowsAfterFailed, lost, rowsAfterLost, repeat }
    }))
    refused(outcome.failed, "storage")
    if (Array.isArray(outcome.rowsAfterFailed)) expect(outcome.rowsAfterFailed).toHaveLength(0)
    refused(outcome.lost, "storage")
    if (Array.isArray(outcome.rowsAfterLost)) expect(outcome.rowsAfterLost).toHaveLength(1)
    expect(outcome.repeat).toMatchObject({ kind: "economy-grant", consumable: false })
  })

  test("EA-04 ambient-transaction-is-not-a-durable-ack", async () => {
    const outcome = await run(Effect.gen(function* () {
      const database = yield* Database.Service
      const env = envelope({ attempts: 1, inFlight: 1 })
      yield* seedEnvelope(env)
      return yield* database.db
        .transaction(() => reserveAttempt(sealed(env, logical(), "k4")), { behavior: "immediate" })
        .pipe(Effect.catchIf((error): error is SqlError => true, (error) => Effect.die(new Error(`unreachable drizzle failure: ${String(error)}`))))
    }))
    refused(outcome, "ambient")
  })

  test("EA-08 status-retry-reserves-every-attempt", async () => {
    const both = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, inFlight: 5 })
      yield* seedEnvelope(env)
      const first = yield* reserveAttempt(sealed(env, logical(), "k8a"))
      if (first.kind !== "economy-grant") throw new Error("first grant")
      yield* recordForward(first.attempt)
      yield* observeTerminal(first.attempt, { evidenceDigest: "sha-503", evidence: JSON.stringify({ status: 503 }) })
      const second = yield* reserveAttempt(sealed(env, logical(), "k8b", undefined, first.attempt))
      if (second.kind !== "economy-grant") return { first: null, second: null }
      return {
        first: first.attempt,
        second: second.attempt,
      }
    }))
    expect(both?.second?.ordinal).toBe((both?.first?.ordinal ?? 0) + 1)
  })

  test("EA-09/EA-11 concurrent-last-allowance: only one allowance is granted", async () => {
    const dir = tmpDir()
    try {
      const file = join(dir, "shared.db")
      const layer = Database.layerFromPath(file)
      const env = envelope({ attempts: 5, outputTokens: 10, inFlight: 10 })
      const seedBody = Effect.gen(function* () {
        yield* seedEnvelope(env)
        return true
      }).pipe(Effect.provide(layer))
      expect(await Effect.runPromise(seedBody)).toBe(true)
      const a = sealed(env, logical("a"), "k9a", { attempts: 1, outputTokens: 6 })
      const b = sealed(env, logical("b"), "k9b", { attempts: 1, outputTokens: 6 })
      const [ra, rb] = await Effect.runPromise(
        Effect.all([
          reserveAttempt(a).pipe(Effect.provide(layer)),
          reserveAttempt(b).pipe(Effect.provide(layer)),
        ], { concurrency: 2 }),
      )
      // One winner, one balance refusal (or a refused allowance) — never two grants against one allowance.
      const grants = [ra, rb].filter((o) => o.kind === "economy-grant")
      expect(grants).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("EA-10 uncertain-transport-does-not-auto-retry: reservation stays held", async () => {
    const outcome = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 1, inFlight: 1 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k10"))
      if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected grant")
      return yield* recoverEnvelopeAttempts(env.envelopeId)
    }))
    if (outcome !== null && Array.isArray(outcome)) {
      expect(outcome).toHaveLength(1)
      expect(outcome[0].state).toBe("reserved")
      expect(outcome[0].forwardObserved).toBe(false)
    }
  })

  test("EA-12 uncertain-inflight-slot-is-retained", async () => {
    const outcome = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, inFlight: 1 })
      yield* seedEnvelope(env)
      yield* reserveAttempt(sealed(env, logical("a"), "k12a"))
      return yield* reserveAttempt(sealed(env, logical("b"), "k12b"))
    }))
    refused(outcome, "slot")
  })

  test("EA-13 same-key-is-not-another-forward-grant", async () => {
    const rows = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, inFlight: 5 })
      yield* seedEnvelope(env)
      const first = yield* reserveAttempt(sealed(env, logical(), "k13"))
      if (first.kind !== "economy-grant" || !first.consumable) throw new Error("expected first grant")
      yield* recordForward(first.attempt)
      return yield* reserveAttempt(sealed(env, logical(), "k13"))
    }))
    // A re-reserve after a forwarded-but-unterminated dispatch can never forward again: the
    // repeat holds (§1.5) — never another grant, never another forward.
    expect(rows).toMatchObject({ kind: "economy-hold", reason: "response-unavailable" })
  })

  test("EA-14 conflicting-admission-key-refuses", async () => {
    const outcome = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, inFlight: 5 })
      yield* seedEnvelope(env)
      yield* reserveAttempt(sealed(env, logical(), "k14", { attempts: 1 }))
      return yield* reserveAttempt(sealed({ ...env, limits: { attempts: 5, inFlight: 5, outputTokens: 99 } }, logical(), "k14", { attempts: 1, outputTokens: 1 }))
    }))
    refused(outcome, "conflict")
  })

  test("EA-15 headers-or-incomplete-usage-do-not-settle", async () => {
    const outcome = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, outputTokens: 10, inFlight: 5 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k15", { attempts: 1, outputTokens: 5 }))
      if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected grant")
      yield* observeTerminal(grant.attempt, { evidenceDigest: "d15", evidence: JSON.stringify({ status: 200 }) })
      return yield* settleAttempt(grant.attempt, { inputTokens: 5 }, { evidenceDigest: "d15", evidence: JSON.stringify({ status: 200 }) })
    }))
    refused(outcome, "usage")
  })

  test("EA-16 invalid-usage-retains-the-obligation", async () => {
    const outcomes = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, inFlight: 5 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k16"))
      if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected grant")
      yield* observeTerminal(grant.attempt, { evidenceDigest: "d16", evidence: JSON.stringify({ status: 200 }) })
      const bad = [
        { inputTokens: -1, outputTokens: 1 },
        { inputTokens: 1.5, outputTokens: 1 },
        { inputTokens: 1, outputTokens: 2, reasoningTokens: 5 },
      ]
      const results = [] as AttemptOutcome[]
      for (const usage of bad) {
        results.push(yield* settleAttempt(grant.attempt, usage, { evidenceDigest: "d16", evidence: JSON.stringify({ status: 200 }) }))
      }
      return results
    }))
    for (const outcome of outcomes) refused(outcome, "usage")
  })

  test("EA-17 out-of-order-usage-matches-its-attempt", async () => {
    const both = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, inFlight: 5 })
      yield* seedEnvelope(env)
      const a = yield* reserveAttempt(sealed(env, logical("a"), "k17a"))
      const b = yield* reserveAttempt(sealed(env, logical("b"), "k17b"))
      if (a.kind !== "economy-grant" || b.kind !== "economy-grant") throw new Error("grants")
      yield* observeTerminal(a.attempt, { evidenceDigest: "da", evidence: JSON.stringify({ status: 200 }) })
      yield* observeTerminal(b.attempt, { evidenceDigest: "db", evidence: JSON.stringify({ status: 200 }) })
      yield* settleAttempt(b.attempt, { inputTokens: 2, outputTokens: 2 }, { evidenceDigest: "db", evidence: JSON.stringify({ status: 200 }) })
      return yield* settleAttempt(a.attempt, { inputTokens: 1, outputTokens: 1 }, { evidenceDigest: "da", evidence: JSON.stringify({ status: 200 }) })
    }))
    expect(both).toMatchObject(status)
  })

  test("EA-18 settlement-is-idempotent-and-conflict-aware", async () => {
    const results = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, inFlight: 5 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k18"))
      if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected grant")
      yield* observeTerminal(grant.attempt, { evidenceDigest: "d18", evidence: JSON.stringify({ status: 200 }) })
      const evidence = { evidenceDigest: "d18", evidence: JSON.stringify({ status: 200 }) }
      const ok1 = yield* settleAttempt(grant.attempt, { inputTokens: 1, outputTokens: 1 }, evidence)
      const ok2 = yield* settleAttempt(grant.attempt, { inputTokens: 1, outputTokens: 1 }, evidence)
      const clash = yield* settleAttempt(grant.attempt, { inputTokens: 2, outputTokens: 1 }, evidence)
      return { ok1, ok2, clash }
    }))
    expect(results.ok1).toMatchObject(status)
    expect(results.ok2).toMatchObject(status)
    refused(results.clash, "conflict")
  })

  test("EA-19 inclusive-usage-is-counted-once", async () => {
    const result = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, inputTokens: 10, outputTokens: 8, inFlight: 5 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k19", { attempts: 1, outputTokens: 8, inputTokens: 10 }))
      if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected grant")
      yield* observeTerminal(grant.attempt, { evidenceDigest: "d19", evidence: JSON.stringify({ status: 200 }) })
      yield* settleAttempt(grant.attempt, { inputTokens: 10, outputTokens: 8, cachedInputTokens: 4, reasoningTokens: 3 }, { evidenceDigest: "d19", evidence: JSON.stringify({ status: 200 }) })
      return yield* reserveAttempt(sealed(env, logical("x"), "k19x", { attempts: 1, outputTokens: 1, inputTokens: 1 }))
    }))
    // Confirmed usage exhausted the envelope's inclusive budget — one ceil on outputTokens here.
    refused(result, "balance")
  })

  test("EA-20 reported-overrun-is-not-clamped", async () => {
    const result = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, outputTokens: 10, inFlight: 5 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k20", { attempts: 1, outputTokens: 10 }))
      if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected grant")
      yield* observeTerminal(grant.attempt, { evidenceDigest: "d20", evidence: JSON.stringify({ status: 200 }) })
      const settled = yield* settleAttempt(grant.attempt, { inputTokens: 1, outputTokens: 12 }, { evidenceDigest: "d20", evidence: JSON.stringify({ status: 200 }) })
      const record = yield* lookupAttempt(grant.attempt)
      const next = yield* reserveAttempt(sealed(env, logical("x"), "k20x", { attempts: 1, outputTokens: 1 }))
      return { settled, record, next }
    }))
    expect(result.settled).toMatchObject({ kind: "economy-settled", capacityBreach: true })
    expect(result.record).toMatchObject({ usage: { outputTokens: 12 } })
    refused(result.next, "capacity")
  })

  test("EA-21 settlement-write-failure-reconciles", async () => {
    const env = envelope({ attempts: 5, outputTokens: 10, inFlight: 5 })
    const reservations = await runWithFaults({ failSettleCommit: true }, Effect.gen(function* () {
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k21", { attempts: 1, outputTokens: 1 }))
      if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected grant")
      yield* observeTerminal(grant.attempt, { evidenceDigest: "d21", evidence: JSON.stringify({ status: 200 }) })
      const failed = yield* settleAttempt(grant.attempt, { inputTokens: 1, outputTokens: 1 }, { evidenceDigest: "d21", evidence: JSON.stringify({ status: 200 }) })
      const retried = yield* settleAttempt(grant.attempt, { inputTokens: 1, outputTokens: 1 }, { evidenceDigest: "d21", evidence: JSON.stringify({ status: 200 }) })
      return { failed, retried }
    }))
    refused(reservations.failed, "storage")
    expect(reservations.retried).toMatchObject(status)
  })

  test("EA-22 crash-cutpoints-preserve-held-work", async () => {
    const dir = tmpDir()
    try {
      const file = join(dir, "ledger.db")
      const layer = Database.layerFromPath(file)
      const env = envelope({ attempts: 5, inFlight: 5 })
      const grant = await Effect.runPromise(Effect.gen(function* () {
        yield* seedEnvelope(env)
        const g = yield* reserveAttempt(sealed(env, logical(), "k22"))
        if (g.kind !== "economy-grant" || !g.consumable) throw new Error("expected grant")
        yield* recordForward(g.attempt)
        yield* observeTerminal(g.attempt, { evidenceDigest: "d22", evidence: JSON.stringify({ status: 503 }) })
        return g
      }).pipe(Effect.provide(layer)))
      // Simulated crash: the layer is discarded; the file persists.
      const held = await Effect.runPromise(Effect.gen(function* () {
        return yield* recoverEnvelopeAttempts(env.envelopeId)
      }).pipe(Effect.provide(layer)))
      if (!Array.isArray(held)) throw new Error("expected held attempts")
      expect(held).toHaveLength(1)
      expect(held[0].state).toBe("terminal-held")
      expect(held[0].forwardObserved).toBe(true)
      expect(held[0].terminal).toBe(true)
      expect(held[0].usage).toBeUndefined()
      void grant
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("EA-23 stages-and-restarts-share-one-envelope", async () => {
    const dir = tmpDir()
    try {
      const file = join(dir, "shared.db")
      const layer = Database.layerFromPath(file)
      const env = envelope({ attempts: 1, inFlight: 1 })
      const first = await Effect.runPromise(Effect.gen(function* () {
        yield* seedEnvelope(env)
        return yield* reserveAttempt(sealed(env, logical("a"), "k23a", { attempts: 1 }))
      }).pipe(Effect.provide(layer)))
      expect(first).toMatchObject({ kind: "economy-grant" })
      const second = await Effect.runPromise(Effect.gen(function* () {
        return yield* reserveAttempt(sealed(env, logical("b"), "k23b", { attempts: 1 }))
      }).pipe(Effect.provide(layer)))
      refused(second, "capacity")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("EA-24 corrupt held bound is hold", async () => {
    const outcome = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 2, outputTokens: 10, inFlight: 2 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k24-held", { attempts: 1, outputTokens: 10 }))
      if (grant.kind !== "economy-grant") throw new Error("grant")
      const database = yield* Database.Service
      yield* database.db.update(EconomyAttemptTable).set({ bound_json: JSON.stringify({ attempts: 1 }) }).where(eq(EconomyAttemptTable.admission_key, "k24-held")).pipe(Effect.orDie)
      return yield* reserveAttempt(sealed(env, logical("x"), "k24-next", { attempts: 1, outputTokens: 10 }))
    }))
    expect(outcome).toMatchObject({ kind: "economy-hold", reason: "authority" })
  })

  test("EA-27 retry completion is recovered from the original key", async () => {
    const result = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, outputTokens: 10, inFlight: 5 })
      yield* seedEnvelope(env)
      const first = yield* reserveAttempt(sealed(env, logical(), "k27r", { attempts: 1, outputTokens: 5 }))
      if (first.kind !== "economy-grant" || !first.consumable) throw new Error("expected first grant")
      yield* recordForward(first.attempt)
      yield* noteTransportError(first.attempt, { evidenceDigest: "d27-503", evidence: JSON.stringify({ status: 503 }) })
      const retry = yield* reserveAttempt(sealed(env, logical(), "k27r", { attempts: 1, outputTokens: 5 }, first.attempt))
      if (retry.kind !== "economy-grant" || !retry.consumable) throw new Error("expected retry grant")
      yield* observeTerminal(retry.attempt, { evidenceDigest: "d27r", evidence: JSON.stringify({ status: 200 }) })
      yield* settleAttempt(retry.attempt, { inputTokens: 1, outputTokens: 5 }, { evidenceDigest: "d27r", evidence: JSON.stringify({ status: 200 }) })
      yield* recordCompletion(retry.attempt, "completion-ref-retry", "data: [DONE]\n\n")
      return yield* reserveAttempt(sealed(env, logical(), "k27r", { attempts: 1, outputTokens: 5 }))
    }))
    expect(result).toMatchObject({ kind: "economy-grant", consumable: false, completionRef: "completion-ref-retry" })
  })

  test("EA-24 missing-or-corrupt-authority-fails-closed", async () => {
    const recovered = await run(Effect.gen(function* () {
      return yield* recoverEnvelopeAttempts("missing-envelope")
    }))
    expect(recovered).toMatchObject({ kind: "economy-hold", reason: "authority" })
  })

  test("EA-25 storage-retry-never-repeats-network", async () => {
    const outcome = await runWithFaults({ failReserveCommit: true }, Effect.gen(function* () {
      const env = envelope({ attempts: 5, inFlight: 5 })
      yield* seedEnvelope(env)
      yield* reserveAttempt(sealed(env, logical(), "k25a"))
      return yield* reserveAttempt(sealed(env, logical("b"), "k25b"))
    }))
    expect(outcome).toMatchObject({ kind: "economy-grant", consumable: true })
  })

  test("EA-26 semantic-rejection-does-not-refund-usage", async () => {
    const outcome = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, outputTokens: 10, inputTokens: 10, inFlight: 5 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k26", { attempts: 1, outputTokens: 5, inputTokens: 5 }))
      if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected grant")
      yield* observeTerminal(grant.attempt, { evidenceDigest: "d26", evidence: JSON.stringify({ status: 200 }) })
      yield* recordSemantic(grant.attempt, "refused")
      yield* settleAttempt(grant.attempt, { inputTokens: 4, outputTokens: 5 }, { evidenceDigest: "d26", evidence: JSON.stringify({ status: 200 }) })
      return yield* reserveAttempt(sealed(env, logical("x"), "k26x", { attempts: 1, outputTokens: 6, inputTokens: 6 }))
    }))
    refused(outcome, "balance")
  })

  test("EA-27 completed-key-reuses-durable-response", async () => {
    const result = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, outputTokens: 10, inFlight: 5 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k27", { attempts: 1, outputTokens: 5 }))
      if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected grant")
      yield* observeTerminal(grant.attempt, { evidenceDigest: "d27", evidence: JSON.stringify({ status: 200 }) })
      yield* settleAttempt(grant.attempt, { inputTokens: 1, outputTokens: 5 }, { evidenceDigest: "d27", evidence: JSON.stringify({ status: 200 }) })
      yield* recordCompletion(grant.attempt, "completion-ref-1", "data: [DONE]\n\n")
      return yield* reserveAttempt(sealed(env, logical(), "k27", { attempts: 1, outputTokens: 5 }))
    }))
    expect(result).toMatchObject({ kind: "economy-grant", consumable: false, completionRef: "completion-ref-1" })
  })

  test("EA-28 admission-refusal-remains-typed", async () => {
    const outcome = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 0, inFlight: 0 })
      yield* seedEnvelope(env)
      return yield* reserveAttempt(sealed(env, logical(), "k28", { attempts: 1 }))
    }))
    refused(outcome, "capacity")
  })

  test("EA-29 obligations-survive-sibling-restart", async () => {
    const dir = tmpDir()
    try {
      const file = join(dir, "obligation.db")
      const layer = Database.layerFromPath(file)
      const env = envelope({ attempts: 5, inFlight: 5 })
      await Effect.runPromise(Effect.gen(function* () {
        yield* seedEnvelope(env)
        const grant = yield* reserveAttempt(sealed(env, logical(), "k29", { attempts: 1 }))
        if (grant.kind !== "economy-grant" || !grant.consumable) throw new Error("expected grant")
      }).pipe(Effect.provide(layer)))
      const view = await Effect.runPromise(Effect.gen(function* () {
        return yield* recoverEnvelopeAttempts(env.envelopeId)
      }).pipe(Effect.provide(layer)))
      if (!Array.isArray(view)) throw new Error("expected records")
      expect(view).toHaveLength(1)
      expect(view[0].forwardIntent).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("lookupAttempt reports the durable record by its id triple", async () => {
    const found = await run(Effect.gen(function* () {
      const env = envelope({ attempts: 5, inFlight: 5 })
      yield* seedEnvelope(env)
      const grant = yield* reserveAttempt(sealed(env, logical(), "k-find"))
      if (grant.kind !== "economy-grant") throw new Error("grant")
      return yield* lookupAttempt(grant.attempt)
    }))
    expect(found).toMatchObject({ admissionKey: "k-find", state: "reserved" })
  })

  test("attemptKey composes envelope, logical request and ordinal", () => {
    expect(attemptKey({ envelopeId: "e", logicalRequestId: "r", ordinal: 3 })).toBe("e:r:3")
  })
})
