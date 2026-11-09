// @orchestra/core — src/economy/admission.ts (G1 / F2)
//
// Physical-attempt admission authority. Contract:
// modules/atlas/docs/design/genesis-g1-contract.md (Astra decision 2026-11-09, snapshot
// 02b732601442b2ae2ec204eb0137a09654f8290b). GREEN: file-backed SQLite ledger with indivisible
// reserve/settle transactions (§1.3–§1.6); forwarding happens only after COMMIT + ack.

import { Database } from "bun:sqlite"

/** Immutable admission envelope (contract §1.1): one shared balance for every stage. */
export interface EconomyEnvelope {
  readonly envelopeId: string
  readonly authorityId: string
  readonly policyDigest: string
  readonly scope: string
  readonly provider: string
  readonly model: string
  readonly allowedRoutes: readonly string[]
  readonly stages: readonly string[]
  readonly limits: {
    readonly attempts: number
    readonly outputTokens?: number
    readonly inputTokens?: number
    readonly inFlight: number
  }
  readonly retryPolicy: { readonly maxRetries: number; readonly statuses: readonly number[] }
}

/** Logical request identity (host-stable across restarts). */
export interface LogicalRequest {
  readonly logicalRequestId: string
  readonly stage: string
  readonly snapshot: string
}

/** Physical attempt identity (envelope + logical request + ordinal, with predecessor link). */
export interface AttemptId {
  readonly envelopeId: string
  readonly logicalRequestId: string
  readonly ordinal: number
  readonly predecessor?: AttemptId
}

export type EconomyRefusalReason =
  | "balance" | "slot" | "bound" | "capability" | "route" | "policy"
  | "conflict" | "storage" | "usage" | "ambient" | "identity" | "overrun"

export interface EconomyRefusal {
  readonly kind: "economy-refusal"
  readonly reason: EconomyRefusalReason
  readonly evidence: readonly string[]
}

export interface EconomyGrant {
  readonly kind: "economy-grant"
  readonly attempt: AttemptId
  readonly key: string
  /** A repeat of an existing key reconciles the record but grants no new send (§1.4). */
  readonly consumable: boolean
}

export type AdmissionResult = EconomyGrant | EconomyRefusal

export interface ReserveRequest {
  readonly envelope: EconomyEnvelope
  readonly logical: LogicalRequest
  readonly key: string
  readonly prior?: AttemptId
  readonly route: string
  /** Sealed per-attempt bounds from the final request bytes (§1.2). */
  readonly bound?: { readonly outputTokens?: number; readonly inputTokens?: number }
}

export interface Settlement {
  readonly attempt: AttemptId
  readonly usage: {
    readonly inputTokens?: number
    readonly outputTokens?: number
    readonly cachedInputTokens?: number
    readonly reasoningTokens?: number
  }
  readonly evidenceDigest: string
  readonly terminal: boolean
}

interface BoundJson {
  attempts: 1
  outputTokens?: number
  inputTokens?: number
}

interface UsageJson {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
}

const schema = `
CREATE TABLE IF NOT EXISTS economy_envelope (
  envelope_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  policy_digest TEXT NOT NULL,
  scope TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  limits_json TEXT NOT NULL,
  retry_json TEXT NOT NULL,
  blocked INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS economy_attempt (
  envelope_id TEXT NOT NULL,
  logical_request_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  predecessor_key TEXT,
  admission_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  slot_released INTEGER NOT NULL,
  forwarded INTEGER NOT NULL,
  bound_json TEXT NOT NULL,
  usage_json TEXT,
  evidence_digest TEXT
);
CREATE INDEX IF NOT EXISTS economy_attempt_envelope ON economy_attempt(envelope_id);
`

let ledgerDb: Database | null = null
let ledgerPath = ""

export const configureLedger = (path: string): void => {
  ledgerDb?.close()
  ledgerDb = null
  ledgerPath = path
}

export const resetLedgerTestState = (): void => {
  ambientDepth = 0
  fault = {}
}

export const injectLedgerFault = (next: { failNextCommitBeforeAck?: boolean; loseNextAck?: boolean; failNextSettleWrite?: boolean }): void => {
  fault = { ...fault, ...next }
}

let ambientDepth = 0
let fault: { failNextCommitBeforeAck?: boolean; loseNextAck?: boolean; failNextSettleWrite?: boolean } = {}

/** Test hook: run `fn` inside an ambient (outer) transaction context (§4.2). */
export const withAmbientTransaction = <T>(fn: () => T): T => {
  ambientDepth += 1
  try {
    return fn()
  } finally {
    ambientDepth -= 1
  }
}

const db = (): Database => {
  if (ledgerDb !== null) return ledgerDb
  const path = ledgerPath || process.env.ECONOMY_DB || "/tmp/economy-ledger.db"
  ledgerDb = new Database(path)
  ledgerDb.exec("PRAGMA journal_mode = WAL")
  ledgerDb.exec("PRAGMA synchronous = NORMAL")
  ledgerDb.exec("PRAGMA busy_timeout = 5000")
  ledgerDb.exec("PRAGMA foreign_keys = ON")
  ledgerDb.exec(schema)
  ledgerDb.exec("CREATE TABLE IF NOT EXISTS economy_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)")
  ledgerDb.prepare("INSERT OR IGNORE INTO economy_meta (k, v) VALUES ('economy_authority', ?)").run("g1")
  return ledgerDb
}

const refusal = (reason: EconomyRefusalReason, evidence: readonly string[]): EconomyRefusal => ({ kind: "economy-refusal", reason, evidence })

export const reserveAttempt = async (request: ReserveRequest): Promise<AdmissionResult> => {
  if (ambientDepth > 0) return Promise.resolve(refusal("ambient", [request.key]))
  const h = db()
  const env = request.envelope
  const attemptsLimit = env.limits.outputTokens
  if (attemptsLimit !== undefined && (!Number.isInteger(attemptsLimit) || !Number.isFinite(attemptsLimit) || attemptsLimit <= 0))
    return Promise.resolve(refusal("bound", [request.key]))
  const inputLimit = env.limits.inputTokens
  if (inputLimit !== undefined && (!Number.isInteger(inputLimit) || !Number.isFinite(inputLimit) || inputLimit <= 0))
    return Promise.resolve(refusal("bound", [request.key]))
  if (!env.allowedRoutes.includes(request.route)) return Promise.resolve(refusal("route", [request.route]))
  if (!env.stages.includes(request.logical.stage)) return Promise.resolve(refusal("policy", [request.logical.stage]))
  if ((attemptsLimit !== undefined && request.bound?.outputTokens === undefined) || (inputLimit !== undefined && request.bound?.inputTokens === undefined))
    return Promise.resolve(refusal("bound", [request.key]))
  const bound: BoundJson = {
    attempts: 1,
    ...(request.bound?.outputTokens === undefined ? {} : { outputTokens: request.bound.outputTokens }),
    ...(request.bound?.inputTokens === undefined ? {} : { inputTokens: request.bound.inputTokens }),
  }
  if (bound.outputTokens !== undefined && (!Number.isInteger(bound.outputTokens) || !Number.isFinite(bound.outputTokens) || bound.outputTokens <= 0))
    return Promise.resolve(refusal("bound", [request.key]))
  if (bound.inputTokens !== undefined && (!Number.isInteger(bound.inputTokens) || !Number.isFinite(bound.inputTokens) || bound.inputTokens <= 0))
    return Promise.resolve(refusal("bound", [request.key]))
  if (attemptsLimit !== undefined && bound.outputTokens !== undefined && bound.outputTokens > attemptsLimit)
    return Promise.resolve(refusal("bound", [request.key]))
  if (inputLimit !== undefined && bound.inputTokens !== undefined && bound.inputTokens > inputLimit)
    return Promise.resolve(refusal("bound", [request.key]))
  const key = request.key
  const priorKey = request.prior === undefined ? undefined : request.prior.logicalRequestId
  h.exec("BEGIN IMMEDIATE")
  try {
    h.prepare("INSERT OR IGNORE INTO economy_envelope (envelope_id, authority_id, policy_digest, scope, provider, model, limits_json, retry_json, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)")
      .run(env.envelopeId, env.authorityId, env.policyDigest, env.scope, env.provider, env.model, JSON.stringify(env.limits), JSON.stringify(env.retryPolicy))
    const storedEnv = h.prepare("SELECT * FROM economy_envelope WHERE envelope_id = ?").get(env.envelopeId) as { blocked: number; authority_id: string } | null
    if (storedEnv === null) throw new Error("envelope missing")
    if (storedEnv.authority_id !== env.authorityId) {
      h.exec("ROLLBACK")
      return refusal("identity", [env.envelopeId, "authority"])
    }
    if (storedEnv.blocked === 1) {
      h.exec("ROLLBACK")
      return refusal("storage", [env.envelopeId, "blocked"])
    }
    const existing = h.prepare("SELECT economy_attempt.*, economy_envelope.policy_digest AS stored_policy, economy_envelope.provider AS stored_provider, economy_envelope.model AS stored_model, economy_envelope.scope AS stored_scope FROM economy_attempt JOIN economy_envelope USING (envelope_id) WHERE economy_attempt.admission_key = ?").get(key) as { logical_request_id: string; state: string; bound_json: string; stored_policy: string; stored_provider: string; stored_model: string; stored_scope: string } | null
    if (existing !== null) {
      if (existing.stored_policy !== env.policyDigest || existing.stored_provider !== env.provider || existing.stored_model !== env.model || existing.stored_scope !== env.scope) {
        h.exec("ROLLBACK")
        return refusal("conflict", [key])
      }
      if (existing.logical_request_id !== request.logical.logicalRequestId || (existing.bound_json as unknown as string) !== JSON.stringify(bound)) {
        h.exec("ROLLBACK")
        return refusal("conflict", [key])
      }
      const ordinalRow = h.prepare("SELECT ordinal FROM economy_attempt WHERE admission_key = ?").get(key) as { ordinal: number }
      h.exec("COMMIT")
      return { kind: "economy-grant", attempt: { envelopeId: env.envelopeId, logicalRequestId: request.logical.logicalRequestId, ordinal: ordinalRow.ordinal }, key, consumable: false }
    }
    const active = h.prepare("SELECT state, slot_released, bound_json, usage_json FROM economy_attempt WHERE envelope_id = ?").all(env.envelopeId) as Array<{ state: string; slot_released: number; bound_json: string; usage_json: string | null }>
    let occupiedOutput = 0
    let occupiedInput = 0
    let inFlight = 0
    for (const row of active) {
      const b = JSON.parse(row.bound_json) as BoundJson
      const u = row.usage_json === null ? undefined : JSON.parse(row.usage_json) as UsageJson
      if (row.state === "settled") {
        occupiedOutput += u?.outputTokens ?? 0
        occupiedInput += u?.inputTokens ?? 0
      } else {
        occupiedOutput += b.outputTokens ?? 0
        occupiedInput += b.inputTokens ?? 0
        if (row.slot_released === 0) inFlight += 1
      }
    }
    if (attemptsLimit !== undefined && occupiedOutput + (bound.outputTokens ?? 0) > attemptsLimit) {
      h.exec("ROLLBACK")
      return refusal("balance", [key])
    }
    if (inputLimit !== undefined && occupiedInput + (bound.inputTokens ?? 0) > inputLimit) {
      h.exec("ROLLBACK")
      return refusal("balance", [key])
    }
    if (inFlight + 1 > env.limits.inFlight) {
      h.exec("ROLLBACK")
      return refusal("slot", [key])
    }
    const ordinalRow = h.prepare("SELECT COALESCE(MAX(ordinal), 0) AS m FROM economy_attempt WHERE envelope_id = ? AND logical_request_id = ?").get(env.envelopeId, request.logical.logicalRequestId) as { m: number }
    const ordinal = ordinalRow.m + 1
    h.prepare("INSERT INTO economy_attempt (envelope_id, logical_request_id, ordinal, predecessor_key, admission_key, state, slot_released, forwarded, bound_json, usage_json, evidence_digest) VALUES (?, ?, ?, ?, ?, 'reserved', 0, 0, ?, NULL, NULL)")
      .run(env.envelopeId, request.logical.logicalRequestId, ordinal, priorKey ?? null, key, JSON.stringify(bound))
    if (fault.failNextCommitBeforeAck === true) {
      fault = { ...fault, failNextCommitBeforeAck: false }
      h.exec("ROLLBACK")
      return refusal("storage", [key, "commit-failed"])
    }
    h.exec("COMMIT")
    if (fault.loseNextAck === true) {
      fault = { ...fault, loseNextAck: false }
      return refusal("storage", [key, "ack-lost"])
    }
    return { kind: "economy-grant", attempt: { envelopeId: env.envelopeId, logicalRequestId: request.logical.logicalRequestId, ordinal }, key, consumable: true }
  } catch (err) {
    try { h.exec("ROLLBACK") } catch { /* already closed */ }
    if (err !== null && typeof err === "object" && (err as { kind?: unknown }).kind === "economy-refusal") throw err
    return refusal("storage", [key])
  }
}

const numeric = (value: number | undefined): boolean =>
  value !== undefined && typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0

export const settleAttempt = async (settlement: Settlement): Promise<{ kind: "settled" } | EconomyRefusal> => {
  const h = db()
  const { inputTokens, outputTokens, cachedInputTokens, reasoningTokens } = settlement.usage
  const attemptKey = `${settlement.attempt.envelopeId}:${settlement.attempt.logicalRequestId}:${settlement.attempt.ordinal}`
  h.exec("BEGIN IMMEDIATE")
  try {
    const row = h.prepare("SELECT * FROM economy_attempt JOIN economy_envelope USING (envelope_id) WHERE economy_attempt.envelope_id = ? AND economy_attempt.logical_request_id = ? AND economy_attempt.ordinal = ?")
      .get(settlement.attempt.envelopeId, settlement.attempt.logicalRequestId, settlement.attempt.ordinal) as { state: string; usage_json: string | null; evidence_digest: string | null; bound_json: string; limits_json: string } | null
    if (row === null) {
      h.exec("ROLLBACK")
      return refusal("storage", [attemptKey])
    }
    const bound = JSON.parse(row.bound_json) as BoundJson
    const limits = JSON.parse(row.limits_json) as { outputTokens?: number; inputTokens?: number }
    if (row.state === "settled") {
      if (row.evidence_digest === settlement.evidenceDigest && settlement.terminal) {
        const prev = row.usage_json === null ? undefined : JSON.parse(row.usage_json) as UsageJson
        const same = prev !== undefined && prev.inputTokens === (inputTokens ?? prev.inputTokens) && prev.outputTokens === (outputTokens ?? prev.outputTokens)
        h.exec("COMMIT")
        return same ? { kind: "settled" } : refusal("conflict", [attemptKey])
      }
      h.exec("ROLLBACK")
      return refusal("conflict", [attemptKey])
    }
    if (!settlement.terminal) {
      h.exec("ROLLBACK")
      return refusal("usage", [attemptKey, "not-terminal"])
    }
    const wantsOutput = limits.outputTokens !== undefined
    const wantsInput = limits.inputTokens !== undefined
    if (wantsOutput && !numeric(outputTokens)) {
      h.exec("ROLLBACK")
      return refusal("usage", [attemptKey, "output-usage"])
    }
    if (wantsInput && !numeric(inputTokens)) {
      h.exec("ROLLBACK")
      return refusal("usage", [attemptKey, "input-usage"])
    }
    for (const [name, value] of [["inputTokens", inputTokens], ["outputTokens", outputTokens], ["cachedInputTokens", cachedInputTokens], ["reasoningTokens", reasoningTokens]] as const) {
      if (value !== undefined && !numeric(value)) {
        h.exec("ROLLBACK")
        return refusal("usage", [attemptKey, name])
      }
    }
    if ((cachedInputTokens ?? 0) > (inputTokens ?? 0) || (reasoningTokens ?? 0) > (outputTokens ?? 0)) {
      h.exec("ROLLBACK")
      return refusal("usage", [attemptKey, "subset"])
    }
    const usage: UsageJson = {
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      cachedInputTokens: cachedInputTokens ?? 0,
      reasoningTokens: reasoningTokens ?? 0,
    }
    const complete = (!wantsInput || inputTokens !== undefined) && (!wantsOutput || outputTokens !== undefined)
    if (!complete) {
      h.exec("ROLLBACK")
      return refusal("usage", [attemptKey, "incomplete"])
    }
    const overOutput = row.usage_json === null && outputTokens !== undefined && limits.outputTokens !== undefined && outputTokens > limits.outputTokens
    const overInput = row.usage_json === null && inputTokens !== undefined && limits.inputTokens !== undefined && inputTokens > limits.inputTokens
    if (fault.failNextSettleWrite === true) {
      fault = { ...fault, failNextSettleWrite: false }
      h.exec("ROLLBACK")
      return refusal("storage", [attemptKey, "settle-write-failed"])
    }
    h.prepare("UPDATE economy_attempt SET state = 'settled', usage_json = ?, evidence_digest = ? WHERE envelope_id = ? AND logical_request_id = ? AND ordinal = ?")
      .run(JSON.stringify(usage), settlement.evidenceDigest, settlement.attempt.envelopeId, settlement.attempt.logicalRequestId, settlement.attempt.ordinal)
    if (overOutput || overInput) h.prepare("UPDATE economy_envelope SET blocked = 1 WHERE envelope_id = ?").run(settlement.attempt.envelopeId)
    void bound
    h.exec("COMMIT")
    return overOutput || overInput ? { kind: "settled" } : { kind: "settled" }
  } catch (err) {
    try { h.exec("ROLLBACK") } catch { /* already closed */ }
    if (err !== null && typeof err === "object" && (err as { kind?: unknown }).kind === "economy-refusal") throw err
    return refusal("storage", [attemptKey])
  }
}

export const recoverAttempts = (envelopeId: string): Promise<readonly AttemptId[]> => {
  const h = db()
  const rows = h.prepare("SELECT logical_request_id, ordinal, predecessor_key FROM economy_attempt WHERE envelope_id = ? ORDER BY rowid").all(envelopeId) as Array<{ logical_request_id: string; ordinal: number; predecessor_key: string | null }>
  return Promise.resolve(rows.map((row) => ({
    envelopeId,
    logicalRequestId: row.logical_request_id,
    ordinal: row.ordinal,
    ...(row.predecessor_key === null ? {} : { predecessor: { envelopeId, logicalRequestId: row.predecessor_key, ordinal: row.ordinal - 1 } }),
  })))
}
