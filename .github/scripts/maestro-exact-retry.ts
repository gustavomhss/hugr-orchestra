// TRUSTED IN-PROCESS ONLY. Import after the real app installs Database, the registered
// WorkflowHost.sessionHost, and the execution placement's Relay.Service. No CLI/layers/runner.
// The caller owns an otherwise idle, serialized settlement window, outside Relay's run lock.
// Its driver settles an ALREADY stored assistant through production; no model/approval work.
import { createHash } from "node:crypto"
import { lstat, readdir } from "node:fs/promises"
import { basename, join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { asc, eq, inArray } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { Database } from "../../packages/core/src/database/database"
import { EventV2 } from "../../packages/core/src/event"
import { EventTable } from "../../packages/core/src/event/sql"
import { Relay } from "../../packages/core/src/relay"
import { RelayWorkflowBinding } from "../../packages/core/src/relay-workflow-binding"
import { RelayWorkflowSession } from "../../packages/core/src/relay-workflow-session"
import { MessageTable, PartTable, SessionMessageTable, SessionTable } from "../../packages/core/src/session/sql"
import { ArmLoad } from "../../packages/relay/src/arm/load"
import { LedgerRead } from "../../packages/relay/src/ledger/read"
import { MaestroEvent } from "../../packages/schema/src/maestro-event"
import { RelayArm } from "../../packages/schema/src/relay-arm"
import { SessionMessage } from "../../packages/schema/src/session-message"

type DriverInput = {
  readonly current: RelayWorkflowSession.Current
  readonly host: RelayWorkflowSession.Host
  readonly pending: RelayArm.WorkflowCheckpoint | undefined
}
type DriverResult = {
  readonly settlement: RelayArm.WorkflowSettlement
  readonly evaluation: RelayArm.Evaluation
}

/** Named CaptureExactRetry Effect; missing driver is a prerequisite failure, not a CLI oracle.
 * Return the ORIGINAL settlement passed to production and that call's actual evaluation.
 * Do not resume a Session, fabricate CURRENT/checkpoints, run a provider, or change placement.
 * Captured objects stay private to this invocation; only redacted hashes/tuples leave it.
 */
export function withExactRetryProbe<E, R>(executionSessionID: string,
  actualSettlementDriver?: (input: DriverInput) => Effect.Effect<DriverResult, E, R>) {
  return Effect.gen(function* () {
    if (typeof actualSettlementDriver !== "function") return yield* hold("EXACT_RETRY_SETTLEMENT_DRIVER_REQUIRED")
    const databaseOption = yield* Effect.serviceOption(Database.Service)
    const hostsOption = yield* Effect.serviceOption(RelayWorkflowSession.Service)
    const relayOption = yield* Effect.serviceOption(Relay.Service)
    if (Option.isNone(databaseOption)) return yield* hold("EXACT_RETRY_REAL_DATABASE_REQUIRED")
    if (Option.isNone(hostsOption)) return yield* hold("EXACT_RETRY_REGISTERED_HOST_SERVICE_REQUIRED")
    if (Option.isNone(relayOption)) return yield* hold("EXACT_RETRY_PLACEMENT_RELAY_REQUIRED")
    const database = databaseOption.value
    const hosts = hostsOption.value
    const relay = relayOption.value
    const host = yield* hosts.host()
    if (!host) return yield* hold("EXACT_RETRY_REGISTERED_NATIVE_HOST_REQUIRED")
    const eventRows = () => database.db.select().from(EventTable)
      .where(eq(EventTable.aggregate_id, executionSessionID)).orderBy(asc(EventTable.seq)).all()
    const boundRows = (yield* eventRows()).filter((row) =>
      row.type === EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1))
    if (boundRows.length !== 1) return yield* hold("EXACT_RETRY_UNIQUE_STORED_BINDING_REQUIRED")
    const bound = yield* Schema.decodeUnknownEffect(MaestroEvent.Task.WorkflowBound.data)(boundRows[0].data)
      .pipe(Effect.mapError(() => failure("EXACT_RETRY_STORED_BINDING_INVALID")))
    if (bound.executionSessionID !== executionSessionID || bound.binding.executionSessionID !== executionSessionID)
      return yield* hold("EXACT_RETRY_EXECUTION_LINEAGE_MISMATCH")
    const current = yield* host.current(bound)
    if (current.token !== bound.token || !isDeepStrictEqual(current.binding, bound.binding) ||
      basename(relay.paths.root) !== bound.binding.definition.publication.projectID ||
      !isDeepStrictEqual(yield* relay.currentStep(current.token, current.binding), current.view))
      return yield* hold("EXACT_RETRY_NATIVE_PLACEMENT_MISMATCH")
    if (current.view.state !== "active") return yield* hold("EXACT_RETRY_ACTIVE_ORIGINAL_CURRENT_REQUIRED")
    const original = { position: current.view.position, attempt: current.view.attempt, ledgerSeq: current.view.ledgerSeq }
    const bindingBefore = fingerprint(bound)
    const currentBefore = fingerprint(current)
    const arm = join(relay.paths.arms, current.token)
    const pending = current.view.pending
    if (pending && (pending.phase !== "pending" || !isDeepStrictEqual(pending.binding, current.binding) ||
      !isDeepStrictEqual(pending.settlement.expected, original)))
      return yield* hold("EXACT_RETRY_PENDING_ORIGINAL_TUPLE_MISMATCH")
    const snapshot = (allowEmpty = false) => Effect.gen(function* () {
      if (yield* Effect.tryPromise({ try: () => lstat(join(arm, RelayArm.Files.runLock)).then(() => true,
        (error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return false; throw error }),
        catch: () => failure("EXACT_RETRY_LOCK_INSPECTION_FAILED") }))
        return yield* hold("EXACT_RETRY_IDLE_SETTLEMENT_WINDOW_REQUIRED")
      // Do not let Relay's lazy initialization create a key for this instrument.
      yield* ArmLoad.bytes(relay.paths.key)
      // Production audit is read-only chain/oracle comparison, not evaluate/check/regrade.
      const audit = yield* relay.audit(current.token).pipe(Effect.catchTag("LedgerRead.Missing", () =>
        allowEmpty && original.ledgerSeq === -1 ? Effect.succeed(undefined) : hold("EXACT_RETRY_SIGNED_LEDGER_UNAVAILABLE")))
      if (audit && !audit.chain_intact) return yield* hold("EXACT_RETRY_SIGNED_LEDGER_UNAVAILABLE")
      const ledger = yield* LedgerRead.entries(join(arm, RelayArm.Files.ledger)).pipe(Effect.catchTag("LedgerRead.Missing", () =>
        allowEmpty && original.ledgerSeq === -1 ? Effect.succeed([]) : hold("EXACT_RETRY_SIGNED_LEDGER_UNAVAILABLE")))
      if ((!ledger.length && !(allowEmpty && original.ledgerSeq === -1)) || ledger.some((entry) => entry.mac !== "hmac-sha256"))
        return yield* hold("EXACT_RETRY_NONEMPTY_KEYED_LEDGER_REQUIRED")
      const names = yield* Effect.tryPromise({ try: () => readdir(arm), catch: () => failure("EXACT_RETRY_ARM_READ_FAILED") })
      const files = yield* Effect.forEach(names.sort(), (name) => Effect.gen(function* () {
        const info = yield* Effect.tryPromise({ try: () => lstat(join(arm, name)), catch: () => failure("EXACT_RETRY_ARM_STAT_FAILED") })
        if (!info.isFile()) return yield* hold("EXACT_RETRY_IDLE_REGULAR_ARM_NAMESPACE_REQUIRED")
        return { name, sha256: digest(yield* ArmLoad.bytes(join(arm, name))) }
      }))
      const authorID = yield* ArmLoad.bytes(join(arm, RelayArm.Files.agentID))
      if (Buffer.from(authorID).toString("utf8") !== executionSessionID)
        return yield* hold("EXACT_RETRY_ARM_AUTHOR_ID_MISMATCH")
      const aggregates = [executionSessionID, current.binding.authoritySessionID]
      const events = yield* database.db.select().from(EventTable).where(inArray(EventTable.aggregate_id, aggregates))
        .orderBy(asc(EventTable.aggregate_id), asc(EventTable.seq)).all()
      const sessions = yield* database.db.select().from(SessionTable).where(inArray(SessionTable.id, aggregates)).orderBy(asc(SessionTable.id)).all()
      const modern = yield* database.db.select().from(SessionMessageTable).where(inArray(SessionMessageTable.session_id, aggregates))
        .orderBy(asc(SessionMessageTable.id)).all()
      const legacy = yield* database.db.select().from(MessageTable).where(inArray(MessageTable.session_id, aggregates)).orderBy(asc(MessageTable.id)).all()
      const parts = yield* database.db.select().from(PartTable).where(inArray(PartTable.session_id, aggregates)).orderBy(asc(PartTable.id)).all()
      const view = yield* relay.currentStep(current.token, current.binding)
      return { view, files, ledger, authorHash: digest(authorID), modern, legacy,
        projectionHash: fingerprint({ events, sessions, modern, legacy, parts }) }
    })
    const before = yield* snapshot(true)
    if (!isDeepStrictEqual(before.view, current.view)) return yield* hold("EXACT_RETRY_CAPTURE_CHANGED")
    // The driver is the only first-settlement affordance. This instrument never manufactures a pending fence.
    const driven = yield* actualSettlementDriver({ current, host, pending }).pipe(
      Effect.mapError(() => failure("EXACT_RETRY_PRODUCTION_DRIVER_FAILED")))
    if (fingerprint(current) !== currentBefore || fingerprint(bound) !== bindingBefore)
      return yield* hold("EXACT_RETRY_CAPTURE_MUTATED_BY_DRIVER")
    const checkpointFile = join(arm, `workflow_${RelayWorkflowBinding.digest(Buffer.from(driven.settlement.assistantMessageID))}.json`)
    const readCheckpoint = () => ArmLoad.bytes(checkpointFile).pipe(
      Effect.flatMap((bytes) => ArmLoad.decode(checkpointFile, bytes, RelayArm.WorkflowCheckpoint)))
    const stored = yield* readCheckpoint()
    if (stored.phase !== "settled" || !stored.evaluation || !isDeepStrictEqual(stored.binding, current.binding) ||
      !isDeepStrictEqual(stored.settlement, driven.settlement) || !isDeepStrictEqual(stored.settlement.expected, original) ||
      !isDeepStrictEqual(stored.evaluation, driven.evaluation) || pending && !isDeepStrictEqual(pending.settlement, stored.settlement))
      return yield* hold("EXACT_RETRY_ACTUAL_SETTLED_CHECKPOINT_REQUIRED")
    const assistant = before.modern.find((row) => row.id === stored.settlement.assistantMessageID && row.session_id === executionSessionID)
    const legacyAssistant = before.legacy.find((row) => row.id === stored.settlement.assistantMessageID && row.session_id === executionSessionID)
    const nativeMessage = assistant ? yield* Schema.decodeUnknownEffect(SessionMessage.Message)({ ...assistant.data, id: assistant.id, type: assistant.type }) : undefined
    if (nativeMessage ? nativeMessage.type !== "assistant" : !legacyAssistant || legacyAssistant.data.role !== "assistant")
      return yield* hold("EXACT_RETRY_PREEXISTING_NATIVE_ASSISTANT_REQUIRED")
    const assistantAuthor = nativeMessage?.type === "assistant" ? nativeMessage.agent : legacyAssistant?.data.agent
    if (!assistantAuthor) return yield* hold("EXACT_RETRY_NATIVE_ASSISTANT_AUTHOR_REQUIRED")
    const settled = yield* snapshot()
    const savedEvaluation = stored.evaluation
    if (!["advance", "complete"].includes(savedEvaluation.outcome) || savedEvaluation.ledgerSeq <= original.ledgerSeq ||
      settled.view.pending || settled.view.ledgerSeq !== savedEvaluation.ledgerSeq ||
      settled.view.position === original.position && settled.view.state !== "complete")
      return yield* hold("EXACT_RETRY_SUCCESSFUL_ACTUAL_TRANSITION_REQUIRED")
    const signed = settled.ledger.filter((entry) => entry.event === "workflow-disposition" &&
      isDeepStrictEqual(entry.evaluation, savedEvaluation) && isDeepStrictEqual(entry.checkpoint,
        { binding: stored.binding, settlement: stored.settlement, phase: "pending" }))
    if (signed.length !== 1 || signed[0].seq !== savedEvaluation.ledgerSeq || typeof signed[0].h !== "string")
      return yield* hold("EXACT_RETRY_SAVED_SIGNED_EVALUATION_REQUIRED")
    if ((yield* hosts.host()) !== host) return yield* hold("EXACT_RETRY_REGISTERED_HOST_CHANGED")
    // Critical: CURRENT and expected position/attempt/ledgerSeq remain ORIGINAL, not the advanced cursor.
    const replayed = yield* host.settle(current, stored.settlement)
    const after = yield* snapshot()
    const checkpointAfter = yield* readCheckpoint()
    const reboundRows = (yield* eventRows()).filter((row) => row.type === EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1))
    if (!isDeepStrictEqual(replayed, savedEvaluation) || !isDeepStrictEqual(checkpointAfter, stored) ||
      !isDeepStrictEqual(after.view, settled.view) || !isDeepStrictEqual(after.files, settled.files) ||
      !isDeepStrictEqual(after.ledger, settled.ledger) || after.projectionHash !== settled.projectionHash ||
      after.authorHash !== settled.authorHash || settled.authorHash !== before.authorHash ||
      !isDeepStrictEqual(reboundRows, boundRows) || fingerprint(current) !== currentBefore || (yield* hosts.host()) !== host)
      return yield* hold("EXACT_RETRY_DURABLE_IDEMPOTENCE_MISMATCH")
    return {
      schema: 1, scope: "trusted-in-process-original-tuple-exact-settlement-retry", effect: "CaptureExactRetry",
      executionSessionHash: fingerprint(executionSessionID), authoritySessionHash: fingerprint(current.binding.authoritySessionID),
      bindingHash: bindingBefore, assistantMessageHash: fingerprint(stored.settlement.assistantMessageID),
      assistantAuthorHash: fingerprint(assistantAuthor), armAuthorHash: after.authorHash,
      original, settled: tuple(settled.view), after: tuple(after.view), outcome: savedEvaluation.outcome,
      evaluationHash: fingerprint(savedEvaluation), signedReceiptHash: fingerprint(signed[0]),
      beforeLedgerHash: fingerprint(before.ledger), settledLedgerHash: fingerprint(settled.ledger), afterLedgerHash: fingerprint(after.ledger),
      beforeProjectionHash: before.projectionHash, settledProjectionHash: settled.projectionHash, afterProjectionHash: after.projectionHash,
      checkpointEqual: true, evaluationEqual: true, cursorEqual: true, ledgerEqual: true, projectionEqual: true, bindingEqual: true, authorEqual: true,
    }
  }).pipe(Effect.withSpan("CaptureExactRetry"),
    Effect.mapError((error) => error instanceof RelayWorkflowBinding.Held ? error : failure("EXACT_RETRY_ACQUISITION_FAILED")),
    Effect.catchDefect(() => hold("EXACT_RETRY_UNEXPECTED_FAILURE")))
}

function digest(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex") }
function fingerprint(value: unknown) { return digest(Buffer.from(JSON.stringify(value))) }
function tuple(view: RelayArm.WorkflowPosition) { return { position: view.position, attempt: view.attempt, ledgerSeq: view.ledgerSeq } }
function failure(reason: string) { return new RelayWorkflowBinding.Held({ reason }) }
function hold(reason: string) { return Effect.fail(failure(reason)) }
