// @orchestra/core — src/economy/admission.ts (G1 / F2)
//
// Shared physical-attempt admission authority over `Database.Service` (contract:
// modules/atlas/docs/design/genesis-g1-contract.md §1–§4, Astra decision 2026-11-09).
//
// Frozen semantics implemented here:
// - Bootstrap admission (§2.1): `seedEnvelope` registers an immutable envelope; `reserve`
//   never creates one — unexpected absence is a HOLD (CE-8), never an empty-budget fallback.
// - Ambient transaction refusal (§4.2): admission inside an ambient transaction is refused
//   before any forward; detection goes through `Database.Interface.inTransaction`.
// - Indivisible reserve (§1.4): identity check, authoritative envelope, occupied-vector
//   decision, insert and COMMIT happen in one `behavior: "immediate"` transaction; the
//   consumable grant exists only after the transaction resolves. A repeat of the same key
//   under the same sealed identity reconciles — it never obtains another forward.
// - Occupied vector (§1.3): settled attempts contribute confirmed usage, unresolved
//   attempts contribute their reserved bound; `attempts` is its own dimension; a possibly
//   forwarded attempt keeps its position even after settlement.
// - Sealed request identity (§4.1): fingerprint covers body digest, endpoint, protocol,
//   route, snapshot, bound, envelope and policy — one digest for reserve and send.
// - Retry lineage (§1.5): every attempt after the first is authorized only by the frozen
//   policy plus the recorded evidence of the named predecessor attempt.
// - Terminal held (§1.5): sufficient terminal evidence releases the in-flight slot while
//   keeping the reservation economically held; usage settlement happens separately.
// - Settlement (§1.6): idempotent on the full evidence (digest, breakdown, provenance);
//   conflicting settlement is refused, not rewritten; confirmed usage above the bound is
//   stored whole and blocks new admissions (capacity breach); semantic refusal never
//   refunds physical usage.
// - Storage boundary (§2.2): corruption predictions are converted to typed outcomes; the
//   envelope's storage authority identity is verified, never recreated.

import { Database } from "../database/database"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { and, eq } from "drizzle-orm"
import { createHash } from "crypto"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { EconomyAttemptTable, EconomyEnvelopeTable } from "./sql"

export type Tx = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export interface EconomyEnvelope {
  readonly envelopeId: string
  readonly authorityId: string
  readonly scope: string
  readonly provider: string
  readonly model: string
  readonly route: string
  readonly stages: readonly string[]
  readonly limits: {
    readonly attempts: number
    readonly outputTokens?: number
    readonly inputTokens?: number
    readonly inFlight: number
  }
  readonly retryPolicy: { readonly maxRetries: number; readonly statuses: readonly number[] }
}

export interface LogicalRequest {
  readonly logicalRequestId: string
  readonly stage: string
  readonly snapshot: string
}

export interface AttemptId {
  readonly envelopeId: string
  readonly logicalRequestId: string
  readonly ordinal: number
}

export type AttemptKey = string

export interface AttemptUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cachedInputTokens?: number
  readonly reasoningTokens?: number
}

export interface AttemptBound {
  readonly attempts: number
  readonly outputTokens?: number
  readonly inputTokens?: number
}

/** Sealed immutable request: one bytes copy behind fingerprint, reserve and send (§4.1). */
export interface SealedRequest {
  readonly envelope: EconomyEnvelope
  readonly logical: LogicalRequest
  readonly key: string
  readonly route: string
  readonly endpoint: string
  readonly protocol: string
  readonly body: string
  readonly bound: AttemptBound
  readonly prior?: AttemptId
}

export interface TerminalEvidence {
  readonly evidenceDigest: string
  readonly evidence: string
}

export interface AttemptRecord extends AttemptId {
  readonly admissionKey: string
  readonly fingerprint: string
  readonly bodyDigest: string
  readonly snapshot: string
  readonly route: string
  readonly endpoint: string
  readonly protocol: string
  readonly predecessor?: AttemptKey
  readonly state: "reserved" | "terminal-held" | "settled"
  readonly forwardIntent: boolean
  readonly forwardObserved: boolean
  readonly terminal: boolean
  readonly slotReleased: boolean
  readonly bound: AttemptBound
  readonly usage?: AttemptUsage
  readonly evidenceDigest?: string
  readonly evidence?: string
  readonly completionRef?: string
  readonly semantic?: "accepted" | "refused"
}

export interface EconomyGrant {
  readonly kind: "economy-grant"
  readonly attempt: AttemptId
  readonly key: string
  /** Only the creator that received the durable ack may forward once. */
  readonly consumable: boolean
  /** Durable completion of an earlier identical request, when stored (EA-27). */
  readonly completionRef?: string
}

export interface EconomyHold {
  readonly kind: "economy-hold"
  readonly reason: "authority" | "response-unavailable"
  readonly evidence: readonly string[]
}

export type EconomyRefusalReason =
  | "ambient" | "authority" | "capacity" | "balance" | "slot" | "bound" | "route" | "policy"
  | "predecessor" | "conflict" | "usage" | "identity" | "storage"

export interface EconomyRefusal {
  readonly kind: "economy-refusal"
  readonly reason: EconomyRefusalReason
  readonly evidence: readonly string[]
}

/** Failure channel shape reachable inside ledger transactions (refusal or hold sentinels). */
export type EconomyAborted = EconomyRefusal | EconomyHold

export type AttemptOutcome = {
  readonly kind: "economy-grant"
  readonly attempt: AttemptId
  readonly key: string
  readonly consumable: boolean
  readonly completionRef?: string
} | {
  readonly kind: "economy-hold"
  readonly reason: EconomyHold["reason"]
  readonly evidence: readonly string[]
} | {
  readonly kind: "economy-settled"
  readonly attempt: AttemptId
  readonly capacityBreach?: boolean
} | {
  readonly kind: "economy-refusal"
  readonly reason: EconomyRefusalReason
  readonly evidence: readonly string[]
}

const grant = (attempt: AttemptId, key: string, consumable: boolean, completionRef?: string): AttemptOutcome =>
  ({ kind: "economy-grant", attempt, key, consumable, ...(completionRef === undefined ? {} : { completionRef }) })

const refusal = (reason: EconomyRefusalReason, evidence: readonly string[]): EconomyAborted =>
  ({ kind: "economy-refusal", reason, evidence })

const settled = (attempt: AttemptId, capacityBreach?: boolean): AttemptOutcome =>
  ({ kind: "economy-settled", attempt, ...(capacityBreach === true ? { capacityBreach: true } : {}) })

const hold = (reason: EconomyHold["reason"], evidence: readonly string[]): EconomyAborted =>
  ({ kind: "economy-hold", reason, evidence })

/** Injected failure at the frozen ack/commit cutpoints; consumed once, per facility. */
export interface EconomyFaultFlags {
  readonly failReserveCommit?: boolean
  readonly loseReserveAck?: boolean
  readonly failSettleCommit?: boolean
  readonly loseSettleAck?: boolean
}

interface FaultAdapter {
  readonly take: (key: keyof EconomyFaultFlags) => Effect.Effect<boolean>
}

export class Faults extends Context.Reference<FaultAdapter>("@orchestra/EconomyFaults", {
  defaultValue: () => ({ take: () => Effect.succeed(false) }),
}) {}

export const faultLayer = (flags: EconomyFaultFlags) => {
  const mutable = { ...flags }
  return Layer.succeed(Faults, {
    take: (key) =>
      Effect.sync(() => {
        const active = mutable[key] === true
        mutable[key] = false
        return active
      }),
  })
}

export const attemptKey = (attempt: AttemptId): AttemptKey => `${attempt.envelopeId}:${attempt.logicalRequestId}:${attempt.ordinal}`

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

/**
 * Fingerprint over the sealed bytes and every economically relevant identity (§1.2):
 * final body digest, inputs, provider/model, endpoint, protocol/transport, envelope
 * configuration and policy, bound, logical identity.
 */
export const sealRequest = (request: SealedRequest): { fingerprint: string; bodyDigest: string } => {
  const bodyDigest = sha256(request.body)
  const fingerprint = sha256(JSON.stringify({
    envelopeId: request.envelope.envelopeId,
    authorityId: request.envelope.authorityId,
    scope: request.envelope.scope,
    provider: request.envelope.provider,
    model: request.envelope.model,
    route: request.envelope.route,
    stages: [...request.envelope.stages],
    limits: request.envelope.limits,
    retryPolicy: request.envelope.retryPolicy,
    logicalRequestId: request.logical.logicalRequestId,
    snapshot: request.logical.snapshot,
    stage: request.logical.stage,
    dispatchRoute: request.route,
    endpoint: request.endpoint,
    protocol: request.protocol,
    bodyDigest,
  }))
  return { fingerprint, bodyDigest }
}

/**
 * Per-attempt bounds sealed from the final request bytes (§1.2). A dimension the envelope
 * admits is mandatory; bound exposure beyond an envelope dimension is refused.
 */
export const validateBound = (bound: AttemptBound, envelope: EconomyEnvelope, evidence: readonly string[]): AttemptOutcome | undefined => {
  for (const dimension of ["outputTokens", "inputTokens"] as const) {
    const value = bound[dimension]
    if (value === undefined) {
      if (envelope.limits[dimension] !== undefined) return refusal("bound", [...evidence, dimension])
      continue
    }
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      return refusal("bound", [...evidence, dimension])
    }
    if (envelope.limits[dimension] !== undefined && value > envelope.limits[dimension]) {
      return refusal("bound", [...evidence, dimension])
    }
  }
  return undefined
}

const policyDigest = (envelope: EconomyEnvelope) => `${envelope.scope}:${envelope.provider}:${envelope.model}:${envelope.route}`

interface EnvelopeRow {
  envelope_id: string
  authority_id: string
  storage_id: string
  policy_digest: string
  scope: string
  provider: string
  model: string
  route: string
  stages_json: string
  limits_json: string
  retry_json: string
  blocked: number
}

const envelopeMatches = (row: EnvelopeRow, storageID: string, envelope: EconomyEnvelope): boolean =>
  row.authority_id === envelope.authorityId && row.storage_id === storageID &&
  row.policy_digest === policyDigest(envelope) &&
  row.scope === envelope.scope && row.provider === envelope.provider && row.model === envelope.model &&
  row.route === envelope.route &&
  row.stages_json === JSON.stringify(envelope.stages) &&
  row.limits_json === JSON.stringify(envelope.limits) &&
  row.retry_json === JSON.stringify(envelope.retryPolicy)

const isStorageError = (error: unknown) => error instanceof SqlError || error instanceof EffectDrizzleQueryError
// Attempt 1 reconciles on the host key; each named retry attempt reconciles on its derived
// key (`${key}#${ordinal}`), so a retry never folds onto the committed first attempt.
const derivedAdmissionKey = (key: string, ordinal: number): AttemptKey =>
  ordinal === 1 ? key : `${key}#${ordinal}`
const isAbort = (error: unknown): error is EconomyAborted =>
  typeof error === "object" && error !== null && "kind" in error &&
  ((error as EconomyRefusal).kind === "economy-refusal" || (error as EconomyHold).kind === "economy-hold")

const toRecord = (row: typeof EconomyAttemptTable.$inferSelect): AttemptRecord => ({
  envelopeId: row.envelope_id,
  logicalRequestId: row.logical_request_id,
  ordinal: row.ordinal,
  admissionKey: row.admission_key,
  fingerprint: row.fingerprint,
  bodyDigest: row.body_digest,
  snapshot: row.snapshot,
  route: row.route,
  endpoint: row.endpoint,
  protocol: row.protocol,
  ...(row.predecessor === null ? {} : { predecessor: row.predecessor }),
  state: row.state as AttemptRecord["state"],
  forwardIntent: row.forward_intent === 1,
  forwardObserved: row.forward_observed === 1,
  terminal: row.terminal === 1,
  slotReleased: row.slot_released === 1,
  bound: JSON.parse(row.bound_json) as AttemptBound,
  ...(row.usage_json === null ? {} : { usage: JSON.parse(row.usage_json) as AttemptUsage }),
  ...(row.evidence_digest === null ? {} : { evidenceDigest: row.evidence_digest }),
  ...(row.evidence_json === null ? {} : { evidence: row.evidence_json }),
  ...(row.completion_ref === null ? {} : { completionRef: row.completion_ref }),
  ...(row.semantic === null ? {} : { semantic: row.semantic as AttemptRecord["semantic"] }),
})

const attemptWhere = (attempt: AttemptId) =>
  and(
    eq(EconomyAttemptTable.envelope_id, attempt.envelopeId),
    eq(EconomyAttemptTable.logical_request_id, attempt.logicalRequestId),
    eq(EconomyAttemptTable.ordinal, attempt.ordinal),
  )

const envelopeWhere = (envelopeId: string) => eq(EconomyEnvelopeTable.envelope_id, envelopeId)
const foundEnvelopeWhere = (envelopeId: string) => eq(EconomyAttemptTable.envelope_id, envelopeId)

/**
 * Bootstrap step: register an immutable envelope on this storage authority (§2.1). The
 * authority identity (storage ID) is recorded here and verified at every admission; a
 * divergent or existing run-time document is refused so a lost ledger can never become a
 * new budget (CE-8).
 */
export const seedEnvelope = (envelope: EconomyEnvelope): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    if (database.storageID === undefined) return refusal("authority", ["storage-identity-missing"])
    return yield* database.db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            const existing = yield* tx.select().from(EconomyEnvelopeTable).where(envelopeWhere(envelope.envelopeId)).get()
            if (existing !== undefined) {
              return envelopeMatches(existing, database.storageID!, envelope)
                ? settled({ envelopeId: envelope.envelopeId, logicalRequestId: "", ordinal: 0 })
                : refusal("conflict", ["envelope", envelope.envelopeId])
            }
            yield* tx.insert(EconomyEnvelopeTable).values({
              envelope_id: envelope.envelopeId,
              authority_id: envelope.authorityId,
              storage_id: database.storageID!,
              policy_digest: policyDigest(envelope),
              scope: envelope.scope,
              provider: envelope.provider,
              model: envelope.model,
              route: envelope.route,
              stages_json: JSON.stringify(envelope.stages),
              limits_json: JSON.stringify(envelope.limits),
              retry_json: JSON.stringify(envelope.retryPolicy),
              blocked: 0,
            })
            return settled({ envelopeId: envelope.envelopeId, logicalRequestId: "", ordinal: 0 })
          }),
        { behavior: "immediate" },
      )
      .pipe(
        Effect.catchIf(isStorageError, (error) => Effect.succeed(refusal("storage", [envelope.envelopeId, "seed", String(error)]))),
      )
  })

/**
 * Indivisible reserve for one physical attempt (§1.4). The consumable grant exists only
 * after the outer-level COMMIT resolves; every failure path comes back typed.
 */
export const reserveAttempt = (request: SealedRequest): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    if (database.storageID === undefined) return hold("authority", ["storage-identity-missing"])
    if (database.inTransaction !== undefined && (yield* database.inTransaction)) return refusal("ambient", [request.key])
    const boundRefusal = validateBound(request.bound, request.envelope, [request.key])
    if (boundRefusal !== undefined) return boundRefusal
    const { fingerprint, bodyDigest } = sealRequest(request)
    const faults = yield* Faults
    const outcome = yield* database.db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            const envelopeRow = yield* tx.select().from(EconomyEnvelopeTable).where(envelopeWhere(request.envelope.envelopeId)).get()
            if (envelopeRow === undefined) return yield* Effect.fail(hold("authority", ["envelope-missing", request.envelope.envelopeId]))
            if (!envelopeMatches(envelopeRow, database.storageID!, request.envelope)) {
              return yield* Effect.fail(refusal("conflict", ["envelope", request.envelope.envelopeId]))
            }
            if (envelopeRow.blocked === 1) return yield* Effect.fail(refusal("capacity", [request.envelope.envelopeId]))
            const logicalRows = yield* tx.select().from(EconomyAttemptTable)
              .where(and(eq(EconomyAttemptTable.envelope_id, request.envelope.envelopeId), eq(EconomyAttemptTable.logical_request_id, request.logical.logicalRequestId)))
              .all()
            // Ordinal is the predecessor-linked ordinal (attempt 1 when no prior is declared);
            // retries reconcile on their derived commitment, never on the first attempt's.
            const ordinal = request.prior === undefined ? 1 : request.prior.ordinal + 1
            const admissionKey = derivedAdmissionKey(request.key, ordinal)
            const existing = yield* tx.select().from(EconomyAttemptTable)
              .where(and(eq(EconomyAttemptTable.envelope_id, request.envelope.envelopeId), eq(EconomyAttemptTable.admission_key, admissionKey)))
              .get()
            if (existing !== undefined) {
              const record = toRecord(existing)
              const identical =
                record.fingerprint === fingerprint && record.logicalRequestId === request.logical.logicalRequestId
              if (!identical) return yield* Effect.fail(refusal("conflict", [admissionKey]))
              if (record.completionRef !== undefined) {
                return grant(attemptIdOf(record), request.key, false, record.completionRef)
              }
              if (record.forwardObserved) return yield* Effect.fail(hold("response-unavailable", [admissionKey, attemptKey(attemptIdOf(record))]))
              return grant(attemptIdOf(record), request.key, false)
            }
            const rows = yield* tx.select().from(EconomyAttemptTable).where(foundEnvelopeWhere(request.envelope.envelopeId)).all()
            const occupied = { outputTokens: 0, inputTokens: 0 }
            let inFlight = 0
            for (const row of rows) {
              const bound = JSON.parse(row.bound_json) as AttemptBound
              if (row.state === "settled") {
                const usage = row.usage_json === null ? undefined : JSON.parse(row.usage_json) as AttemptUsage
                occupied.outputTokens += usage?.outputTokens ?? 0
                occupied.inputTokens += usage?.inputTokens ?? 0
              } else {
                occupied.outputTokens += bound.outputTokens ?? 0
                occupied.inputTokens += bound.inputTokens ?? 0
              }
              if (row.slot_released === 0) inFlight += 1
            }
            if (rows.length + 1 > request.envelope.limits.attempts) {
              return yield* Effect.fail(refusal("capacity", ["attempts", request.key]))
            }
            if (
              request.envelope.limits.outputTokens !== undefined &&
              occupied.outputTokens + (request.bound.outputTokens ?? 0) > request.envelope.limits.outputTokens
            ) return yield* Effect.fail(refusal("balance", [request.key, "outputTokens"]))
            if (
              request.envelope.limits.inputTokens !== undefined &&
              occupied.inputTokens + (request.bound.inputTokens ?? 0) > request.envelope.limits.inputTokens
            ) return yield* Effect.fail(refusal("balance", [request.key, "inputTokens"]))
            if (inFlight + 1 > request.envelope.limits.inFlight) return yield* Effect.fail(refusal("slot", [request.key]))
            if (request.prior === undefined) {
              if (logicalRows.length > 0) return yield* Effect.fail(refusal("conflict", ["logical-occupied", request.key]))
            } else {
              const predecessor = yield* tx.select().from(EconomyAttemptTable)
                .where(and(eq(EconomyAttemptTable.envelope_id, request.prior.envelopeId), eq(EconomyAttemptTable.logical_request_id, request.prior.logicalRequestId), eq(EconomyAttemptTable.ordinal, request.prior.ordinal)))
                .get()
              if (predecessor === undefined) {
                return yield* Effect.fail(refusal("predecessor", [attemptKey(request.prior), "missing"]))
              }
              if (predecessor.envelope_id !== request.envelope.envelopeId) {
                return yield* Effect.fail(refusal("conflict", [attemptKey(request.prior)]))
              }
              // A retry is the same identity re-sent (EA-06) — never a different request.
              if (predecessor.fingerprint !== fingerprint) {
                return yield* Effect.fail(refusal("conflict", [attemptKey(request.prior), "identity-drift"]))
              }
              if (predecessor.forward_observed !== 1 || predecessor.terminal !== 1) {
                return yield* Effect.fail(refusal("predecessor", [attemptKey(request.prior), "not-terminal"]))
              }
              if (logicalRows.length + 1 > request.envelope.retryPolicy.maxRetries + 1) {
                return yield* Effect.fail(refusal("policy", [request.key, "max-retries"]))
              }
            }
            if (yield* faults.take("failReserveCommit")) {
              // Frozen cutpoint: refuse before this transaction commits; nothing is written.
              return yield* Effect.fail(refusal("storage", [request.key, "commit-failed"]))
            }
            yield* tx.insert(EconomyAttemptTable).values({
              envelope_id: request.envelope.envelopeId,
              logical_request_id: request.logical.logicalRequestId,
              ordinal,
              admission_key: admissionKey,
              fingerprint,
              body_digest: bodyDigest,
              body_snapshot: request.body,
              snapshot: request.logical.snapshot,
              route: request.route,
              endpoint: request.endpoint,
              protocol: request.protocol,
              ...(request.prior === undefined ? {} : { predecessor: attemptKey(request.prior) }),
              state: "reserved",
              forward_intent: 1,
              forward_observed: 0,
              terminal: null,
              slot_released: 0,
              bound_json: JSON.stringify(request.bound),
              usage_json: null,
              evidence_digest: null,
              evidence_json: null,
              completion_ref: null,
              semantic: null,
            })
            return grant({ envelopeId: request.envelope.envelopeId, logicalRequestId: request.logical.logicalRequestId, ordinal }, request.key, true)
          }),
        { behavior: "immediate" },
      )
      .pipe(
        Effect.catchIf(isStorageError, (error) => Effect.succeed(refusal("storage", [request.key, "reserve", String(error)]))),
        Effect.catchIf(isAbort, (error) => Effect.succeed(error as AttemptOutcome)),
      )
    if (outcome.kind === "economy-grant" && outcome.consumable && (yield* faults.take("loseReserveAck"))) {
      return refusal("storage", [request.key, "ack-lost"])
    }
    return outcome
  })

const attemptIdOf = (record: AttemptRecord): AttemptId =>
  ({ envelopeId: record.envelopeId, logicalRequestId: record.logicalRequestId, ordinal: record.ordinal })

const canonicalUsage = (usage: AttemptUsage | undefined): string =>
  JSON.stringify(Object.fromEntries(Object.entries(usage ?? {}).filter((entry) => entry[1] !== undefined)))

const validUsage = (usage: AttemptUsage, evidence: readonly string[]): AttemptOutcome | undefined => {
  for (const [name, value] of Object.entries(usage)) {
    if (value === undefined) continue
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      return refusal("usage", [...evidence, name])
    }
  }
  if (usage.cachedInputTokens !== undefined && usage.inputTokens === undefined) return refusal("usage", [...evidence, "inputTokens"])
  if (usage.reasoningTokens !== undefined && usage.outputTokens === undefined) return refusal("usage", [...evidence, "outputTokens"])
  if (usage.cachedInputTokens !== undefined && usage.cachedInputTokens > (usage.inputTokens ?? 0)) {
    return refusal("usage", [...evidence, "cachedInputTokens"])
  }
  if (usage.reasoningTokens !== undefined && usage.reasoningTokens > (usage.outputTokens ?? 0)) {
    return refusal("usage", [...evidence, "reasoningTokens"])
  }
  return undefined
}

export const observeTerminal = (
  attempt: AttemptId,
  evidence: TerminalEvidence,
): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, (record) => {
    if (record.terminal) {
      return record.evidenceDigest === evidence.evidenceDigest && record.evidence === evidence.evidence
        ? Effect.succeed({ patch: {}, result: settled(attempt) })
        : Effect.succeed({ patch: {}, result: refusal("conflict", [attemptKey(attempt)]) })
    }
    return Effect.succeed({
      patch: {
        state: record.state === "settled" ? "settled" : "terminal-held",
        terminal: 1,
        slot_released: 1,
        evidence_digest: evidence.evidenceDigest,
        evidence_json: evidence.evidence,
      },
      result: settled(attempt),
    })
  })

/**
 * Idempotent settlement (§1.6). Requires established remote terminus, complete usage for
 * the bound dimensions, valid numbers, and full-evidence identity awareness.
 */
export const settleAttempt = (
  attempt: AttemptId,
  usage: AttemptUsage,
  evidence: TerminalEvidence,
): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, (record) => {
    if (record.state === "settled") {
      const identical =
        canonicalUsage(record.usage) === canonicalUsage(usage) &&
        record.evidenceDigest === evidence.evidenceDigest &&
        record.evidence === evidence.evidence
      return Effect.succeed({ patch: {}, result: identical ? settled(attempt) : refusal("conflict", [attemptKey(attempt)]) })
    }
    if (!record.terminal) return Effect.succeed({ patch: {}, result: refusal("usage", [attemptKey(attempt), "terminal-missing"]) })
    const invalid = validUsage(usage, [attemptKey(attempt)])
    if (invalid !== undefined) return Effect.succeed({ patch: {}, result: invalid })
    if (record.bound.outputTokens !== undefined && usage.outputTokens === undefined) {
      return Effect.succeed({ patch: {}, result: refusal("usage", [attemptKey(attempt), "outputTokens", "incomplete"]) })
    }
    if (record.bound.inputTokens !== undefined && usage.inputTokens === undefined) {
      return Effect.succeed({ patch: {}, result: refusal("usage", [attemptKey(attempt), "inputTokens", "incomplete"]) })
    }
    const breach =
      (record.bound.outputTokens !== undefined && usage.outputTokens !== undefined && usage.outputTokens > record.bound.outputTokens) ||
      (record.bound.inputTokens !== undefined && usage.inputTokens !== undefined && usage.inputTokens > record.bound.inputTokens)
    return Effect.succeed({
      patch: {
        state: "settled",
        usage_json: canonicalUsage(usage),
        evidence_digest: evidence.evidenceDigest,
        evidence_json: evidence.evidence,
        slot_released: 1,
      },
      result: settled(attempt, breach),
      ...(breach ? { blocked: true } : {}),
    })
  }, { faultKey: "failSettleCommit", afterCommitFault: "loseSettleAck" })

export const recordCompletion = (
  attempt: AttemptId,
  completionRef: string,
): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, (record) =>
    record.completionRef === undefined
      ? Effect.succeed({ patch: { completion_ref: completionRef }, result: settled(attempt) })
      : Effect.succeed({ patch: {}, result: record.completionRef === completionRef ? settled(attempt) : refusal("conflict", [attemptKey(attempt)]) }),
  )

/**
 * Semantic outcome is preserved apart from the physical usage (EA-26); no refund path
 * exists — confirmed usage and held obligations stay as they were.
 */
export const recordSemantic = (
  attempt: AttemptId,
  semantic: "accepted" | "refused",
): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, () => Effect.succeed({ patch: { semantic }, result: settled(attempt) }))

/** Durable observation of a physical dispatch (§4.4); never inferred from other states. */
export const recordForward = (attempt: AttemptId): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, (record) =>
    Effect.succeed({ patch: record.forwardObserved ? {} : { forward_observed: 1 }, result: settled(attempt) }),
  )

type WriteRequest = {
  readonly patch: Record<string, unknown>
  readonly result: AttemptOutcome
  readonly blocked?: boolean
}

const attemptWrite = (
  attempt: AttemptId,
  decide: (record: AttemptRecord) => Effect.Effect<WriteRequest>,
  options?: { readonly faultKey?: keyof EconomyFaultFlags; readonly afterCommitFault?: keyof EconomyFaultFlags },
): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const faults = yield* Faults
    if (database.inTransaction !== undefined && (yield* database.inTransaction)) return refusal("ambient", [attemptKey(attempt)])
    const outcome = yield* database.db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            if (options?.faultKey !== undefined && (yield* faults.take(options.faultKey))) {
              // Frozen cutpoint: refuse before any statement or commit of this transaction.
              return yield* Effect.fail(refusal("storage", [attemptKey(attempt), options.faultKey]))
            }
            const row = yield* tx.select().from(EconomyAttemptTable).where(attemptWhere(attempt)).get()
            if (row === undefined) return yield* Effect.fail(refusal("usage", [attemptKey(attempt), "missing"]))
            const decision = yield* decide(toRecord(row))
            if (Object.keys(decision.patch).length > 0) {
              yield* tx.update(EconomyAttemptTable).set(decision.patch).where(attemptWhere(attempt))
            }
            if (decision.blocked === true) {
              yield* tx.update(EconomyEnvelopeTable).set({ blocked: 1 }).where(envelopeWhere(attempt.envelopeId))
            }
            return decision.result
          }),
        { behavior: "immediate" },
      )
      .pipe(
        Effect.catchIf(isStorageError, (error) => Effect.succeed(refusal("storage", [attemptKey(attempt), "write", String(error)]))),
        Effect.catchIf(isAbort, (error) => Effect.succeed(error as AttemptOutcome)),
      )
    if (options?.afterCommitFault !== undefined && outcome.kind === "economy-settled" && (yield* faults.take(options.afterCommitFault))) {
      return refusal("storage", [attemptKey(attempt), options.afterCommitFault])
    }
    return outcome
  })

/** Recovery reads the whole held ledger; a missing authority stays a HOLD (EA-24). */
export const recoverEnvelopeAttempts = (
  envelopeId: string,
): Effect.Effect<ReadonlyArray<AttemptRecord> | AttemptOutcome, never, Database.Service> =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    if (database.inTransaction !== undefined && (yield* database.inTransaction)) return refusal("ambient", [envelopeId])
    return yield* database.db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            const envelopeRow = yield* tx.select().from(EconomyEnvelopeTable).where(envelopeWhere(envelopeId)).get()
            if (envelopeRow === undefined) return hold("authority", ["envelope-missing", envelopeId])
            const rows = yield* tx.select().from(EconomyAttemptTable).where(foundEnvelopeWhere(envelopeId)).all()
            return rows.map(toRecord)
          }),
        { behavior: "immediate" },
      )
      .pipe(
        Effect.catchIf(isStorageError, (error) => Effect.succeed(hold("authority", ["corrupt", String(error), envelopeId]))),
      )
  })

export const lookupAttempt = (
  attempt: AttemptId,
): Effect.Effect<AttemptRecord | AttemptOutcome, never, Database.Service> =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    if (database.inTransaction !== undefined && (yield* database.inTransaction)) return refusal("ambient", [attemptKey(attempt)])
    return yield* database.db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            const row = yield* tx.select().from(EconomyAttemptTable).where(attemptWhere(attempt)).get()
            return row === undefined ? refusal("usage", [attemptKey(attempt), "missing"]) : toRecord(row)
          }),
        { behavior: "immediate" },
      )
      .pipe(
        Effect.catchIf(isStorageError, (error) => Effect.succeed(hold("authority", ["corrupt", String(error), attemptKey(attempt)]))),
      )
  })
