import { describe, expect } from "bun:test"
import { join } from "node:path"
import { CapabilityChannels } from "@orchestra/core/capability/channel/index"
import { Evidence, Output } from "@orchestra/core/capability/channel/schema"
import { Failure } from "@orchestra/core/capability/channel/http"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import { CapabilityArtifactTable, CapabilityJobTable } from "@orchestra/core/capability/sql"
import { SessionEvent } from "@orchestra/core/session/event"
import { Tool } from "@orchestra/core/tool/tool"
import { Cause, Deferred, Effect, Fiber, Schema } from "effect"
import { sql } from "drizzle-orm"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { it, rules, token, fixture } from "./fixture/capability-channel"

describe("CapabilityChannels real REST leaves", () => {
  it.live("Interruption stays interruption and durable submitted attempt becomes unknown; persisted root defect survives", () => Effect.gen(function* () {
    const f = yield* fixture("discord", { timeoutMs: 5000 })
    f.state.mode = "timeout"
    const fiber = yield* f.call({ provider: "discord", text: "interrupt" }).pipe(Effect.forkChild)
    yield* Deferred.await(f.received)
    yield* Fiber.interrupt(fiber)
    const exit = yield* Fiber.await(fiber)
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    expect((yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie))[0]).toMatchObject({ state: "unknown" })
    yield* f.events.publish(SessionEvent.Tool.Failed, { sessionID: f.context.sessionID,
      assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID,
      error: { type: "unknown", message: "settled" }, provider: { executed: false }, timestamp: CapabilityPolicyFixture.timestamp })
    expect((yield* f.call({ provider: "discord", text: "settled" }).pipe(Effect.flip)).message).toBe("invocation_binding_mismatch")
    yield* f.database.db.run(sql`UPDATE session_message SET data = '{}' WHERE id = ${f.context.assistantMessageID}`).pipe(Effect.orDie)
    const defect = yield* f.call({ provider: "discord", text: "corrupt root" }).pipe(Effect.exit)
    expect(defect._tag).toBe("Failure")
    if (defect._tag === "Failure") expect(Cause.hasDies(defect.cause)).toBe(true)
  }))

  it.live("Stable admission rejects conflicting intent and submitted payloads; reused intent never dispatches", () => Effect.gen(function* () {
    const intent = yield* fixture("discord")
    const payload = { provider: "discord", text: "admitted", replyTo: "999" }
    expect((yield* intent.call(payload).pipe(Effect.flip)).message).toBe("target_denied")
    const rows = yield* intent.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
    expect(rows[0]).toMatchObject({ state: "intent", provider_id: null })
    expect(rows[0]?.request_hash).toMatch(/^[0-9a-f]{64}$/)
    const requests = intent.requests.length
    intent.messages.set("999", { id: "999", text: "now present", ownEmoji: [] })
    const retry = yield* intent.output(payload)
    expect(retry.jobRef?.id).toBe(rows[0]?.id)
    expect(intent.state.mutations).toBe(0)
    expect(intent.requests).toHaveLength(requests)
    const conflicts: Schema.Json[] = [
      { ...payload, text: "changed" }, { ...payload, replyTo: "998" }, { ...payload, threadID: "20" },
    ]
    yield* Effect.forEach(conflicts, (input) => intent.call(input).pipe(Effect.flip,
      Effect.tap((error) => Effect.sync(() => expect(error.message).toBe("outcome_unknown")))))
    expect(intent.requests).toHaveLength(requests)
    expect((yield* intent.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie))).toHaveLength(1)
    const submitted = yield* fixture("discord")
    submitted.state.readbackError = true
    const first = yield* submitted.output({ provider: "discord", text: "accepted" })
    expect(first.result.status).toBe("partial")
    const before = submitted.requests.length
    expect((yield* submitted.call({ provider: "discord", text: "conflict" }).pipe(Effect.flip)).message).toBe("outcome_unknown")
    const second = yield* submitted.output({ provider: "discord", text: "accepted" })
    expect(second.result).toEqual(first.result)
    expect(second.messageID).toBe(first.messageID)
    expect(submitted.requests).toHaveLength(before)
    expect(submitted.state.mutations).toBe(1)
  }), 30000)

  it.live("Concurrent fresh/reused channel admissions perform one preflight and one HTTP mutation", () => Effect.gen(function* () {
    yield* Effect.forEach(["slack", "discord"] as const, (provider) => Effect.gen(function* () {
      const f = yield* fixture(provider)
      const other = yield* CapabilityChannels.make(f.makeOptions)
      f.state.gatePreflight = true
      yield* Effect.addFinalizer(() => Deferred.succeed(f.releasePreflight, undefined))
      const reused = yield* Deferred.make<void>()
      const completed: Output[] = []
      const input = { provider, text: "one charge" }
      const pending = yield* Effect.all([
        f.output(input),
        f.run(Tool.settle(other.tools.channel_send, { type: "tool-call", id: f.context.toolCallID,
          name: "channel_send", input }, f.context)).pipe(Effect.flatMap((output) => Schema.decodeUnknownEffect(Output)(output.structured))),
        f.output(input),
      ].map((effect) => effect.pipe(Effect.tap((output) => Effect.sync(() => {
        completed.push(output)
        if (completed.filter((value) => value.result.status === "unknown").length === 2)
          Deferred.doneUnsafe(reused, Effect.void)
      })))), { concurrency: "unbounded" }).pipe(Effect.forkChild)
      yield* Effect.raceFirst(Deferred.await(f.preflightEntered), Fiber.join(pending).pipe(
        Effect.andThen(Effect.die("CHANNEL_FRESH_PREFLIGHT_NOT_ENTERED"))))
      yield* Effect.raceFirst(Deferred.await(reused), Fiber.join(pending).pipe(
        Effect.andThen(Effect.die("CHANNEL_REUSED_ADMISSIONS_DID_NOT_COMPLETE"))))
      expect(f.requests.map((request) => request.path)).toEqual([
        provider === "slack" ? "/api/auth.test" : "/api/v10/users/@me",
      ])
      expect(f.state.mutations).toBe(0)
      const admitted = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
      expect(admitted.filter((row) => row.owner.sessionID === f.context.sessionID)).toMatchObject([
        { state: "intent", provider_id: null },
      ])
      yield* Deferred.succeed(f.releasePreflight, undefined)
      const outputs = yield* Fiber.join(pending)
      expect(outputs.map((output) => output.result.status).sort()).toEqual(["completed", "unknown", "unknown"])
      expect(new Set(outputs.map((output) => output.jobRef?.id)).size).toBe(1)
      expect(f.requests.filter((request) => provider === "slack" ? request.path === "/api/chat.postMessage"
        : request.method === "POST" && request.path === "/api/v10/channels/10/messages")).toHaveLength(1)
      expect(f.state.mutations).toBe(1)
      const known = outputs.find((output) => output.result.status === "completed")
      if (!known) return yield* Effect.die("CHANNEL_CONCURRENT_COMPLETION_MISSING")
      expect(f.messages.get(known.messageID ?? "")?.text).toBe("one charge")
      const before = f.requests.length
      expect(yield* f.output(input)).toEqual(known)
      expect(f.requests).toHaveLength(before)
    }))
  }), 30000)

  it.live("Update action, message and emoji belong to payload identity even when first intent remains pending", () => Effect.gen(function* () {
    const f = yield* fixture("discord", { root: "channel_update" })
    f.messages.delete(f.messageID)
    const original = { provider: "discord", action: "reaction_add", messageID: f.messageID, emoji: "👍" }
    expect((yield* f.call(original).pipe(Effect.flip)).message).toBe("target_denied")
    const before = f.requests.length
    const conflicts: Schema.Json[] = [
      { ...original, action: "reaction_remove" }, { ...original, messageID: "102" }, { ...original, emoji: "👎" },
    ]
    yield* Effect.forEach(conflicts, (input) => f.call(input).pipe(Effect.flip,
      Effect.tap((error) => Effect.sync(() => expect(error.message).toBe("outcome_unknown")))))
    expect(f.requests).toHaveLength(before)
    expect(f.state.mutations).toBe(0)
    expect((yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie))).toHaveLength(1)
  }))

  it.live("Exact completed delete retries reconcile after message is gone without HTTP or new evidence", () => Effect.gen(function* () {
    yield* Effect.forEach(["slack", "discord"] as const, (provider) => Effect.gen(function* () {
      const f = yield* fixture(provider, { root: "channel_update" })
      const input = { provider, action: "delete", messageID: f.messageID }
      const first = yield* f.output(input)
      expect(first.result.status).toBe("completed")
      expect(f.messages.has(f.messageID)).toBe(false)
      const before = f.requests.length
      const second = yield* f.output({ ...input, connectionID: f.connection.id, targetID: f.target.id })
      expect(second).toEqual(first)
      expect(f.requests).toHaveLength(before)
      expect(f.state.mutations).toBe(1)
      expect((yield* f.database.db.select().from(CapabilityArtifactTable).all().pipe(Effect.orDie))
        .filter((row) => row.owner.sessionID === f.context.sessionID)).toHaveLength(1)
    }))
    const thread = yield* fixture("discord", { boundThread: true })
    const first = yield* thread.output({ provider: "discord", text: "bound thread" })
    const second = yield* thread.output({ provider: "discord", text: "bound thread", threadID: thread.threadID,
      targetID: thread.target.id, connectionID: thread.connection.id })
    expect(second).toEqual(first)
    expect(thread.state.mutations).toBe(1)
  }), 30000)

  it.live("ACK ID containing credential stays durable host metadata; model and evidence omit it as partial", () => Effect.gen(function* () {
    const f = yield* fixture("discord", { credential: { type: "key", key: "20" } })
    const output = yield* f.output({ provider: "discord", text: "accepted" })
    expect(output.result).toMatchObject({ status: "partial", unresolvedEffects: ["provider_id_projection"] })
    expect(output.messageID).toBeUndefined()
    expect(output.acquisition).toBeUndefined()
    expect(f.acknowledgedIDs).toEqual(["201"])
    const rows = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
    expect(rows[0]).toMatchObject({ state: "completed", provider_id: "201" })
    if (output.result.status !== "partial") return yield* Effect.die("EXPECTED_PARTIAL_PROJECTION")
    const retained = yield* f.run(f.artifacts.read(f.context, output.result.artifactRefs[0]))
    expect(new TextDecoder().decode(retained.data)).not.toContain("201")
    expect(JSON.parse(new TextDecoder().decode(retained.data))).toMatchObject({ acknowledgment: { providerIDProjection: "omitted" } })
    const retry = yield* f.output({ provider: "discord", text: "accepted" })
    expect(retry.result).toEqual(output.result)
    expect(retry.messageID).toBeUndefined()
    expect(f.state.mutations).toBe(1)
  }))

  it.live("Replay provider IDs require authorized original evidence after credential rotation", () => Effect.gen(function* () {
    yield* Effect.forEach([true, false], (hidden) => Effect.gen(function* () {
      const acceptedID = "812345678901234567"
      const f = yield* fixture("discord", { acceptedID, credential: { type: "key", key: hidden ? acceptedID : token } })
      const input = { provider: "discord", text: "privacy replay" }
      const first = yield* f.output(input)
      expect(first.result.status).toBe(hidden ? "partial" : "completed")
      expect(first.messageID).toBe(hidden ? undefined : acceptedID)
      if (first.result.status !== "partial" && first.result.status !== "completed") return yield* Effect.die("CHANNEL_PRIVACY_RECEIPT_MISSING")
      const ref = first.result.artifactRefs[0]
      const evidence = yield* f.run(f.artifacts.read(f.context, ref))
      expect(JSON.parse(new TextDecoder().decode(evidence.data))).toMatchObject({ acknowledgment: {
        providerIDProjection: hidden ? "omitted" : "visible", ...(hidden ? {} : { messageID: acceptedID }),
      } })
      yield* f.credentials.update(f.selected.id, { value: { type: "key", key: "fixture-rotated-secret" } })
      const before = f.requests.length
      const authorized = yield* f.output(input)
      expect(authorized).toEqual(first)
      yield* CapabilityPolicyFixture.setRules([...rules, { action: "artifact.read", resource: "*", effect: "deny" }])
      expect(yield* f.run(f.artifacts.read(f.context, ref)).pipe(Effect.flip)).toMatchObject({ code: "target_denied" })
      const replay = yield* f.call(input)
      const output = yield* Schema.decodeUnknownEffect(Output)(replay.structured)
      expect(output.result).toMatchObject({ status: "partial", artifactRefs: [] })
      if (output.result.status !== "partial") return yield* Effect.die("CHANNEL_PRIVACY_PARTIAL_MISSING")
      expect(output.result.unresolvedEffects).toContain("provider_id_projection")
      expect(output.messageID).toBeUndefined()
      expect(output.acquisition).toBeUndefined()
      expect(JSON.stringify(replay)).not.toContain(acceptedID)
      expect(output.jobRef).toEqual(first.jobRef)
      const rows = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
      expect(rows.filter((row) => row.owner.sessionID === f.context.sessionID)).toMatchObject([
        { state: "completed", provider_id: acceptedID },
      ])
      expect(f.requests).toHaveLength(before)
      expect(f.state.mutations).toBe(1)
    }))
  }), 30000)

  it.live("Replay visible evidence must match the persisted accepted provider ID", () => Effect.gen(function* () {
    const f = yield* fixture("discord")
    const input = { provider: "discord", text: "matching proof" }
    const first = yield* f.output(input)
    if (first.result.status !== "completed" || !first.jobRef) return yield* Effect.die("CHANNEL_VISIBLE_RECEIPT_MISSING")
    const ref = first.result.artifactRefs[0]
    const record = yield* f.run(f.artifacts.read(f.context, ref))
    const original = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Evidence))(new TextDecoder().decode(record.data))
    const changed = yield* f.run(f.artifacts.update(f.context, ref, { data: new TextEncoder().encode(JSON.stringify({
      ...original, acknowledgment: { ...original.acknowledgment, messageID: "999" },
    })), mime: record.metadata.mime, kind: record.metadata.kind, verification: record.metadata.verification,
      metadata: record.metadata.metadata }))
    const proof: CapabilityJobs.ProducerProof = { owner: f.binding.owner, producer: f.binding.invocation, rootToolName: f.binding.rootToolName }
    const saved = yield* f.jobs.readHost(proof, first.jobRef)
    yield* f.jobs.observeHost(proof, first.jobRef, { expectedGeneration: saved.receipt.generation, state: "completed",
      observation: { ...saved.receipt.observation, artifactRefs: [changed] } })
    const before = f.requests.length
    const output = yield* f.output(input)
    expect(output.messageID).toBeUndefined()
    expect(output.result).toMatchObject({ status: "partial", unresolvedEffects: ["provider_id_projection"] })
    expect((yield* f.jobs.readHost(proof, first.jobRef)).providerID).toBe(first.messageID)
    expect(f.requests).toHaveLength(before)
    expect(f.state.mutations).toBe(1)
  }))

  it.live("Real post-ACK CAS races reconcile current generation or return retained partial, never ToolFailure", () => Effect.gen(function* () {
    yield* Effect.forEach(["ack", "final"] as const, (stage) => Effect.gen(function* () {
      const f = yield* fixture("discord")
      f.state.cas = "running"
      f.state.casStage = stage
      const output = yield* f.output({ provider: "discord", text: "CAS success" })
      expect(f.state.casDone).toBe(true)
      expect(output.result.status).toBe("completed")
      expect(output.messageID).toBe("201")
      const rows = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
      expect(rows.filter((row) => row.owner.sessionID === f.context.sessionID)[0]).toMatchObject({ state: "completed", provider_id: "201" })
      expect(f.state.mutations).toBe(1)
    }))
    const failed = yield* fixture("discord")
    failed.state.cas = "failed"
    const output = yield* failed.output({ provider: "discord", text: "CAS conflict" })
    expect(output.result).toMatchObject({ status: "partial", unresolvedEffects: ["job-observation"] })
    expect(output.messageID).toBe("201")
    expect(output.jobRef).toBeDefined()
    if (output.result.status !== "partial") return yield* Effect.die("EXPECTED_PARTIAL_OBSERVATION")
    expect(output.result.artifactRefs).toHaveLength(1)
    const evidence = yield* failed.run(failed.artifacts.read(failed.context, output.result.artifactRefs[0]))
    expect(JSON.parse(new TextDecoder().decode(evidence.data))).toMatchObject({ acquisition: { messages: [{ id: "201", text: "CAS conflict" }] } })
    const before = failed.requests.length
    const retry = yield* failed.output({ provider: "discord", text: "CAS conflict" })
    expect(retry).toEqual(output)
    expect(failed.requests).toHaveLength(before)
    expect(failed.state.mutations).toBe(1)
  }), 30000)
})
