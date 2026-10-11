import { describe, expect } from "bun:test"
import { CapabilityChannels } from "@orchestra/core/capability/channel/index"
import { Output } from "@orchestra/core/capability/channel/schema"
import { Failure } from "@orchestra/core/capability/channel/http"
import { CapabilityConnections } from "@orchestra/core/capability/connection/index"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import { CapabilityArtifactTable, CapabilityJobTable } from "@orchestra/core/capability/sql"
import { Database } from "@orchestra/core/database/database"
import { Tool } from "@orchestra/core/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { Cause, Context, Effect, Exit, Schema, Tracer } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { sql } from "drizzle-orm"
import { it, token, type Name, fixture, doubleFailure } from "./fixture/capability-channel"

describe("CapabilityChannels real REST leaves", () => {
  it.live("RPC double failure retains original then observer Causes with duplicate identities and annotations", () => doubleFailure("rpc"))
  it.live("retention double failure retains original then observer Causes and durable ACK without redispatch", () => doubleFailure("retention"))
  it.live("expected RPC double failure retains actual HTTP 500 before failed observation", () => doubleFailure("rpc", true))
  it.live("expected retention double failure retains actual quota failure before failed settlement", () => doubleFailure("retention", true))

  it.live("mutation pre-dispatch real SQL plus defect/interrupt remains failure with durable state and no vendor mutation", () => Effect.gen(function* () {
    yield* Effect.forEach(["slack", "discord"] satisfies ("slack" | "discord")[], (provider) =>
      Effect.forEach(["channel_send", "channel_update"] satisfies Name[], (root) =>
        Effect.forEach(["pure", "defect", "interrupt", "both"], (mode) => Effect.gen(function* () {
          const f = yield* fixture(provider, { root })
          const defect = new Error("mutation SQL companion defect")
          const annotations = Context.makeUnsafe(new Map([["mutation-sql-probe", "retained"]]))
          const captured: Cause.Cause<SqlError>[] = []
          const exits: Exit.Exit<unknown, unknown>[] = []
          // Real Connection callback and writer run first. Fault only the credential recheck after durable submitting.
          const transaction: typeof f.database.db.transaction = (use, options) => f.database.db.transaction((tx) => Effect.gen(function* () {
            const result = yield* use(tx)
            const row = yield* tx.select().from(CapabilityJobTable).where(
              sql`json_extract(${CapabilityJobTable.owner}, '$.sessionID') = ${f.context.sessionID}`,
            ).get().pipe(Effect.orDie)
            if (row?.state !== "submitting") return result
            const failed = yield* tx.run("INSERT INTO missing_mutation_sql_probe VALUES (1)").pipe(Effect.exit)
            expect(Exit.isFailure(failed)).toBe(true)
            if (Exit.isSuccess(failed)) return yield* Effect.die("MUTATION_SQL_FAULT_DID_NOT_FIRE")
            expect(failed.cause.reasons).toHaveLength(1)
            const reason = failed.cause.reasons[0]
            if (!Cause.isFailReason(reason) || !(reason.error instanceof EffectDrizzleQueryError) || !Cause.isCause(reason.error.cause))
              return yield* Effect.die("MISSING_MUTATION_SQL_DRIVER_CAUSE")
            const reasons = reason.error.cause.reasons.filter((entry): entry is Cause.Reason<SqlError> =>
              entry._tag !== "Fail" || entry.error instanceof SqlError)
            expect(reasons).toHaveLength(reason.error.cause.reasons.length)
            if (reasons.length !== reason.error.cause.reasons.length) return yield* Effect.die("UNEXPECTED_MUTATION_SQL_CAUSE")
            expect(reasons.filter(Cause.isFailReason)).toHaveLength(1)
            const cause = Cause.annotate(Cause.combine(Cause.fromReasons(reasons), Cause.fromReasons<never>([
              ...(mode === "defect" || mode === "both" ? [Cause.makeDieReason(defect)] : []),
              ...(mode === "interrupt" || mode === "both" ? [Cause.makeInterruptReason(321)] : []),
            ])), annotations)
            captured.push(cause)
            return yield* Effect.failCause(cause)
          }), options)
          const db = new Proxy(f.database.db, { get: (database, key) => key === "transaction"
            ? transaction : Reflect.get(database, key, database) })
          const connections = yield* CapabilityConnections.make.pipe(Effect.provideService(Database.Service, { ...f.database, db }))
          const channels = yield* CapabilityChannels.make({ ...f.makeOptions, connections })
          const tracer = Tracer.make({ span: (options) => new class extends Tracer.NativeSpan {
            override end(time: bigint, exit: Exit.Exit<unknown, unknown>) {
              super.end(time, exit)
              if (this.name === "CapabilityChannels.mutate") exits.push(exit)
            }
          }(options) })
          const input = root === "channel_send" ? { provider, text: "never dispatched" }
            : { provider, action: "edit", messageID: f.messageID, text: "never dispatched" }
          const call = () => f.run(Tool.settle(channels.tools[root],
            { type: "tool-call", id: f.context.toolCallID, name: root, input }, f.context))
          const exit = yield* call().pipe(Effect.withTracer(tracer), Effect.exit)
          expect(captured).toHaveLength(1)
          expect(exits).toHaveLength(1)
          expect(Exit.isFailure(exit)).toBe(true)
          const mutation = exits[0]
          expect(Exit.isFailure(mutation)).toBe(true)
          if (Exit.isSuccess(exit) || Exit.isSuccess(mutation)) return yield* Effect.die("MUTATION_SQL_FAULT_BECAME_SUCCESS")
          expect(mutation.cause.reasons.map((reason) => reason._tag)).toEqual(captured[0].reasons.map((reason) => reason._tag))
          mutation.cause.reasons.forEach((reason, index) => {
            if (mode === "pure") {
              expect(Cause.isFailReason(reason)).toBe(true)
              if (Cause.isFailReason(reason)) expect(reason.error).toMatchObject({ code: "connection_unavailable" })
              return
            }
            const original = captured[0].reasons[index]
            if (Cause.isFailReason(reason) && Cause.isFailReason(original)) expect(reason.error).toBe(original.error)
            if (Cause.isDieReason(reason)) expect(reason.defect).toBe(defect)
            if (Cause.isInterruptReason(reason)) expect(reason.fiberId).toBe(321)
            expect(reason.annotations.get("mutation-sql-probe")).toBe("retained")
          })
          expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(mutation.cause.reasons.map((reason) => reason._tag))
          exit.cause.reasons.forEach((reason) => {
            if (Cause.isFailReason(reason)) {
              expect(reason.error).toBeInstanceOf(Tool.Failure)
              expect(reason.error.message).toBe(mode === "pure" ? "connection_unavailable" : "artifact_storage_failed")
            }
            if (Cause.isDieReason(reason)) expect(reason.defect).toBe(defect)
            if (Cause.isInterruptReason(reason)) expect(reason.fiberId).toBe(321)
            if (mode !== "pure") expect(reason.annotations.get("mutation-sql-probe")).toBe("retained")
          })
          const rows = (yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie))
            .filter((row) => row.owner.sessionID === f.context.sessionID)
          expect(rows).toHaveLength(1)
          expect(rows[0]).toMatchObject({ state: mode === "pure" ? "failed" : "unknown",
            provider_id: root === "channel_send" ? null : f.messageID })
          expect(f.state.mutations).toBe(0)
          expect(f.requests.every((request) => request.method === "GET" || request.path === "/api/auth.test" || request.path === "/api/conversations.info")).toBe(true)
          expect(yield* f.database.db.select().from(CapabilityArtifactTable).all().pipe(Effect.orDie)).toEqual([])
          const requests = f.requests.length
          const replay = yield* call().pipe(Effect.flatMap((value) => Schema.decodeUnknownEffect(Output)(value.structured)))
          expect(replay.result.status).toBe("unknown")
          expect(replay.jobRef?.id).toBe(rows[0].id)
          expect(f.requests).toHaveLength(requests)
          expect(f.state.mutations).toBe(0)
          expect(captured).toHaveLength(1)
        }))))
  }), 30000)

  it.live("Discord references distinguish actual replies from thread starters, crossposts and forwards", () => Effect.gen(function* () {
    const f = yield* fixture("discord", { root: "channel_read" })
    const cases = [
      { id: "301", type: 21, reference: { type: 0, messageID: "999", channelID: "888", guildID: "777" } },
      { id: "302", type: 0, reference: { type: 0, messageID: "999", channelID: "888", guildID: "777" } },
      { id: "303", type: 19, reference: { type: 1, messageID: "999", channelID: "888", guildID: "777" } },
      { id: "304", type: 19, reference: { type: 0, messageID: "101", channelID: "10", guildID: "1" } },
    ]
    cases.forEach((message) => f.messages.set(message.id, { ...message, text: "reference", ownEmoji: [] }))
    const page = yield* f.output({ provider: "discord", action: "history" })
    expect(page.result.status).toBe("completed")
    cases.forEach((message) => expect(page.acquisition?.messages.find((item) => item.id === message.id)?.replyTo)
      .toBe(message.id === "304" ? "101" : undefined))
    expect(page.acquisition?.messages.find((item) => item.id === "301")?.text).toBe("")
    expect(f.requests.some((request) => /888|999|777/.test(request.path))).toBe(false)
    f.messages.set("305", { id: "305", text: "wrong reply", ownEmoji: [], type: 19,
      reference: { type: 0, messageID: "999", channelID: "888" } })
    expect((yield* f.call({ provider: "discord", action: "message", messageID: "305" }).pipe(Effect.flip)).message).toBe("target_denied")
    f.messages.delete("305")
    f.state.wrongChannel = true
    expect((yield* f.call({ provider: "discord", action: "message", messageID: "301" }).pipe(Effect.flip)).message).toBe("target_denied")
    const thread = yield* fixture("discord", { root: "channel_read", boundThread: true })
    thread.messages.clear()
    thread.messages.set("20", { id: "20", text: "", ownEmoji: [], type: 21,
      reference: { type: 0, messageID: "20", channelID: "10", guildID: "1" } })
    const starter = yield* thread.output({ provider: "discord", action: "history" })
    expect(starter.acquisition?.messages).toEqual([{ id: "20", text: "", threadID: "20", reactions: [] }])
    expect(thread.requests.some((request) => request.path === "/api/v10/channels/10/messages/20")).toBe(false)
  }))

  it.live("Discord history requires effective VIEW_CHANNEL and READ_MESSAGE_HISTORY before empty HTTP acquisition", () => Effect.gen(function* () {
    yield* Effect.forEach(["1024", "65536"], (permissions) => Effect.gen(function* () {
      const f = yield* fixture("discord", { root: "channel_read" })
      f.remotePermissions.roles[0].permissions = permissions
      f.state.emptyHistory = true
      expect((yield* f.call({ provider: "discord", action: "history" }).pipe(Effect.flip)).message).toBe("target_denied")
      expect(f.requests.some((request) => request.path.endsWith("/messages"))).toBe(false)
      expect((yield* f.database.db.select().from(CapabilityArtifactTable).all().pipe(Effect.orDie))).toHaveLength(0)
    }))
    const positive = yield* fixture("discord", { root: "channel_read" })
    positive.messages.clear()
    const output = yield* positive.output({ provider: "discord", action: "history" })
    expect(output.result).toMatchObject({ status: "completed", verification: "observed" })
    expect(output.acquisition?.messages).toEqual([])
    expect(positive.requests.some((request) => request.path === "/api/v10/guilds/1/members/99")).toBe(true)
    const malformed = yield* fixture("discord", { root: "channel_read" })
    malformed.remotePermissions.memberRoles = ["404"]
    expect((yield* malformed.call({ provider: "discord", action: "history" }).pipe(Effect.flip)).message).toBe("acquisition_failed")
    malformed.remotePermissions.memberRoles = ["2"]
    malformed.remotePermissions.omitOverwrites = true
    expect((yield* malformed.call({ provider: "discord", action: "history" }).pipe(Effect.flip)).message).toBe("acquisition_failed")
  }), 30000)

  it.live("Discord everyone, aggregate role and member overwrites respect hierarchy and administrator/owner bypass", () => Effect.gen(function* () {
    yield* Effect.forEach(["everyone-deny", "role-aggregate", "member-deny", "member-allow", "administrator", "owner"], (mode) => Effect.gen(function* () {
      const f = yield* fixture("discord", { root: "channel_read" })
      f.messages.clear()
      f.remotePermissions.overwrites.push({ id: "1", type: 0, deny: "65536", allow: "0" })
      if (mode === "role-aggregate" || mode === "member-deny") {
        f.remotePermissions.memberRoles = ["2", "3"]
        f.remotePermissions.overwrites.push({ id: "2", type: 0, deny: "65536", allow: "0" }, { id: "3", type: 0, deny: "0", allow: "65536" })
      }
      if (mode === "member-deny") f.remotePermissions.overwrites.push({ id: "99", type: 1, deny: "1024", allow: "0" })
      if (mode === "member-allow") {
        f.remotePermissions.overwrites[0].deny = "66560"
        f.remotePermissions.overwrites.push({ id: "2", type: 0, deny: "66560", allow: "0" }, { id: "99", type: 1, deny: "0", allow: "66560" })
      }
      if (mode === "administrator" || mode === "owner") {
        f.remotePermissions.roles[0].permissions = "0"
        f.remotePermissions.roles[1].permissions = mode === "administrator" ? "8" : "0"
        f.remotePermissions.ownerID = mode === "owner" ? "99" : "98"
        f.remotePermissions.overwrites.push({ id: "99", type: 1, deny: "66560", allow: "0" })
      }
      if (mode === "everyone-deny" || mode === "member-deny") {
        expect((yield* f.call({ provider: "discord", action: "history" }).pipe(Effect.flip)).message).toBe("target_denied")
        return
      }
      expect((yield* f.output({ provider: "discord", action: "history" })).result.status).toBe("completed")
      if (mode === "role-aggregate") {
        f.remotePermissions.overwrites.reverse()
        expect((yield* f.output({ provider: "discord", action: "history" })).result.status).toBe("completed")
      }
    }))
  }), 30000)

  it.live("Discord thread history inherits parent permissions and private membership or MANAGE_THREADS", () => Effect.gen(function* () {
    yield* Effect.forEach(["parent-deny", "not-member", "member", "moderator", "timed-out-moderator"], (mode) => Effect.gen(function* () {
      const f = yield* fixture("discord", { root: "channel_read", boundThread: true })
      f.remotePermissions.threadType = 12
      f.remotePermissions.privateMember = mode === "member" || mode === "parent-deny"
      f.messages.clear()
      if (mode === "parent-deny") f.remotePermissions.overwrites.push({ id: "1", type: 0, deny: "65536", allow: "0" })
      if (mode === "moderator" || mode === "timed-out-moderator") f.remotePermissions.roles[1].permissions = (1n << 34n).toString()
      if (mode === "timed-out-moderator") f.remotePermissions.timeoutUntil = new Date(Date.now() + 60000).toISOString()
      if (mode === "parent-deny" || mode === "not-member" || mode === "timed-out-moderator") {
        expect((yield* f.call({ provider: "discord", action: "history" }).pipe(Effect.flip)).message).toBe("target_denied")
        expect(f.requests.some((request) => request.path.endsWith("/messages"))).toBe(false)
        return
      }
      const output = yield* f.output({ provider: "discord", action: "history" })
      expect(output.result.status).toBe("completed")
      expect(output.acquisition?.channelID).toBe("20")
      expect(f.requests.some((request) => request.path.endsWith("/thread-members/99"))).toBe(mode === "member")
    }))
  }), 30000)

  it.live("Slack limited history cannot prove absence or verified deletion; ordinary root deletion remains verified", () => Effect.gen(function* () {
    const limited = yield* fixture("slack", { root: "channel_read" })
    limited.state.limitedHistory = true
    expect((yield* limited.call({ provider: "slack", action: "message", messageID: limited.messageID }).pipe(Effect.flip)).message).toBe("acquisition_failed")
    limited.state.emptyHistory = true
    expect((yield* limited.call({ provider: "slack", action: "history" }).pipe(Effect.flip)).message).toBe("acquisition_failed")
    yield* Effect.forEach([true, false], (isLimited) => Effect.gen(function* () {
      const f = yield* fixture("slack", { root: "channel_update" })
      f.state.limitedAfterMutation = isLimited
      const output = yield* f.output({ provider: "slack", action: "delete", messageID: f.messageID })
      expect(output.result.status).toBe(isLimited ? "partial" : "completed")
      if (output.result.status === "partial") expect(output.result.unresolvedEffects).toContain("postcondition_readback")
      expect(f.messages.has(f.messageID)).toBe(false)
      expect(f.state.mutations).toBe(1)
      const rows = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
      expect(rows.filter((row) => row.owner.sessionID === f.context.sessionID)[0]?.state).toBe(isLimited ? "submitted" : "completed")
    }))
  }), 30000)

  it.live("Slack exact reply lookup without thread is unsupported unless bounded history actually contains it", () => Effect.gen(function* () {
    const f = yield* fixture("slack", { root: "channel_read" })
    expect((yield* f.call({ provider: "slack", action: "message", messageID: "102.000001" }).pipe(Effect.flip)).message).toBe("unsupported_operation")
    const reply = f.messages.get("102.000001")
    if (!reply) return yield* Effect.die("SLACK_FIXTURE_REPLY_MISSING")
    reply.broadcast = true
    const visible = yield* f.output({ provider: "slack", action: "message", messageID: reply.id })
    expect(visible.acquisition?.messages[0]?.id).toBe(reply.id)
    const targeted = yield* fixture("slack", { root: "channel_update", boundThread: true })
    const deleted = yield* targeted.output({ provider: "slack", action: "delete", messageID: targeted.messageID })
    expect(deleted.result).toMatchObject({ status: "completed", verification: "verified" })
    expect(targeted.messages.has(targeted.messageID)).toBe(false)
    const unsupported = yield* fixture("slack", { root: "channel_update" })
    expect((yield* unsupported.call({ provider: "slack", action: "delete", messageID: "102.000001" }).pipe(Effect.flip)).message).toBe("unsupported_operation")
    expect(unsupported.messages.has("102.000001")).toBe(true)
    expect(unsupported.state.mutations).toBe(0)
  }), 30000)

  it.live("Slack requires error on ok:false and unknown charged mutation errors remain unknown without retry", () => Effect.gen(function* () {
    const malformed = yield* fixture("slack", { root: "channel_read" })
    malformed.state.slackReadMissingError = true
    expect((yield* malformed.call({ provider: "slack", action: "history" }).pipe(Effect.flip)).message).toBe("channel_invalid_response")
    yield* Effect.forEach(["unknown", "malformed", "definitive"], (mode) => Effect.gen(function* () {
      const f = yield* fixture("slack")
      f.state.slackMutationError = mode === "unknown" ? "unrecognized_private_feedback" : mode === "definitive" ? "no_text" : ""
      f.state.slackMutationMissingError = mode === "malformed"
      if (mode === "definitive") {
        expect((yield* f.call({ provider: "slack", text: "attempt" }).pipe(Effect.flip)).message).toBe("channel_provider")
        expect(f.messages.has("201.000001")).toBe(false)
      }
      if (mode !== "definitive") {
        const first = yield* f.output({ provider: "slack", text: "attempt" })
        expect(first.result.status).toBe("unknown")
        expect(f.messages.get("201.000001")?.text).toBe("attempt")
        expect(JSON.stringify(first)).not.toContain("unrecognized_private_feedback")
        const before = f.requests.length
        expect((yield* f.output({ provider: "slack", text: "attempt" })).jobRef).toEqual(first.jobRef)
        expect(f.requests).toHaveLength(before)
      }
      expect(f.state.mutations).toBe(1)
      const rows = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
      expect(rows.filter((row) => row.owner.sessionID === f.context.sessionID)[0]?.state).toBe(mode === "definitive" ? "failed" : "unknown")
    }))
  }), 30000)

  it.live("Slack send and thread send persist intent before HTTP; verify independent readback and retained JSON", () => Effect.gen(function* () {
    const f = yield* fixture("slack")
    const output = yield* f.output({ provider: "slack", text: "hello", threadID: f.threadID })
    expect(output.result).toMatchObject({ status: "completed", verification: "verified" })
    expect(f.submittedStates).toEqual(["submitting"])
    expect(f.messages.get(output.messageID ?? "")).toMatchObject({ text: "hello", threadID: f.threadID })
    expect(f.requests.filter((request) => request.path === "/api/chat.postMessage")).toHaveLength(1)
    expect(f.requests.some((request) => request.path === "/api/conversations.replies" && request.query.get("oldest") === output.messageID)).toBe(true)
    const rows = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ state: "completed", provider_id: output.messageID, operation: "channel.send" })
    if (output.result.status !== "completed") return yield* Effect.die("EXPECTED_COMPLETED")
    const evidence = yield* f.run(f.artifacts.read(f.context, output.result.artifactRefs[0]))
    expect(JSON.parse(new TextDecoder().decode(evidence.data))).toMatchObject({ acknowledgment: { postcondition: "verified" },
      acquisition: { messages: [{ id: output.messageID, text: "hello", threadID: f.threadID }] } })
    expect(JSON.stringify(output)).not.toContain(token)
    expect(new TextDecoder().decode(evidence.data)).not.toContain("url_private")
    expect(f.requests.every((request) => request.authorization === `Bearer ${token}`)).toBe(true)
    const fresh = yield* CapabilityChannels.make(f.makeOptions)
    expect(Object.keys(fresh.tools)).toEqual(["channel_read", "channel_send", "channel_update"])
    const restored = yield* CapabilityJobs.make
    expect((yield* restored.readHost({ owner: f.binding.owner, producer: f.binding.invocation, rootToolName: f.binding.rootToolName }, output.jobRef ?? { id: Capability.JobID.create() })).receipt.state).toBe("completed")
  }))

})
