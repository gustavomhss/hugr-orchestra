import { expect } from "bun:test"
import { join } from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { CapabilityChannels } from "@orchestra/core/capability/channel/index"
import { Output } from "@orchestra/core/capability/channel/schema"
import { Failure } from "@orchestra/core/capability/channel/http"
import { CapabilityConnections } from "@orchestra/core/capability/connection/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import { CapabilityArtifactTable, CapabilityJobTable } from "@orchestra/core/capability/sql"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionStore } from "@orchestra/core/session/store"
import { Tool } from "@orchestra/core/tool/tool"
import { Integration } from "@orchestra/schema/integration"
import { Capability } from "@orchestra/schema/capability"
import { Cause, Context, Deferred, Effect, Exit, Layer, Schema, Scope, Tracer } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { sql } from "drizzle-orm"
import { CapabilityPolicyFixture } from "../fixture/capability-policy"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

export const it = testEffect(Layer.unwrap(Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  return AppNodeBuilder.build(LayerNode.group([
    Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node,
    PermissionSaved.node, AgentV2.node, Location.node, FSUtil.node, Global.node, Credential.node,
  ]), [
    [Database.node, Database.layerFromPath(join(tmp.path, "channels.sqlite"))],
    [Location.node, Layer.succeed(Location.Service, Location.Service.of(CapabilityPolicyFixture.placement))],
    [Global.node, Global.layerWith({ data: tmp.path, home: tmp.path })],
    [Credential.node, Credential.layerFrom(undefined)],
  ])
})))
export const rules: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]
export const token = "fixture-selected-secret"
export const newerToken = "fixture-newer-secret"
export type Name = "channel_read" | "channel_send" | "channel_update"
export type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
export type StoredMessage = { id: string; text: string; threadID?: string; replyTo?: string; ownEmoji: string[]; broadcast?: boolean;
  type?: number; reference?: { type?: number; messageID?: string; channelID?: string; guildID?: string } }
export const Body = Schema.Struct({ text: Schema.optionalKey(Schema.String), content: Schema.optionalKey(Schema.String),
  channel: Schema.optionalKey(Schema.String), ts: Schema.optionalKey(Schema.String), timestamp: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String), thread_ts: Schema.optionalKey(Schema.String),
  message_reference: Schema.optionalKey(Schema.Struct({ message_id: Schema.String, channel_id: Schema.String, fail_if_not_exists: Schema.Boolean })),
})

export function fixture(provider: "slack" | "discord", options: {
  root?: Name; boundThread?: boolean; credential?: Credential.Value; endpoint?: string; quota?: number; timeoutMs?: number; maxResponseBytes?: number; acceptedID?: string
} = {}) {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture({ name: options.root ?? "channel_send" })
    yield* CapabilityPolicyFixture.setRules(rules)
    const binding = { ...f.binding, rootToolName: options.root ?? "channel_send", effectiveRules: rules }
    const credentials = yield* Credential.Service
    const integrationID = Integration.ID.make(`fixture-${provider}`)
    const selected = yield* credentials.create({ integrationID, value: options.credential ?? { type: "key", key: token }, label: "selected" })
    yield* credentials.create({ integrationID, value: { type: "key", key: newerToken }, label: "newer same endpoint" })
    const connections = yield* CapabilityConnections.make
    const jobs = yield* CapabilityJobs.make
    const global = yield* Global.Service
    const artifacts = yield* CapabilityArtifacts.make({ root: join(global.data, "evidence"), quota: options.quota })
    const connection = yield* connections.create({ provider, integrationID, credentialID: selected.id,
      subjectID: provider === "slack" ? "U1" : "99", endpoint: options.endpoint ?? (provider === "slack" ? "https://slack.com/api" : "https://discord.com/api/v10"),
      scopeHash: "a".repeat(64) })
    const channelID = provider === "slack" ? "C1" : "10"
    const threadID = provider === "slack" ? "100.000001" : "20"
    const messageID = provider === "slack" ? "101.000001" : "101"
    const target = yield* connections.createTarget(connection, { environment: "fixture", resource: {
      channelID, ...(provider === "slack" ? { teamID: "T1" } : { guildID: "1" }),
      ...(options.boundThread ? { threadID } : {}),
    } })
    const bind = { target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["read", "channel.send", "channel.update"] }
    yield* connections.bind(bind)
    const messages = new Map<string, StoredMessage>([
      [threadID, { id: threadID, text: "root", ownEmoji: [], ...(provider === "slack" ? { threadID } : {}) }],
      [messageID, { id: messageID, text: "original", ownEmoji: [], ...(options.boundThread ? { threadID } : {}) }],
      ...(provider === "slack" ? [["102.000001", { id: "102.000001", text: "thread reply", threadID, ownEmoji: [] }]] satisfies [string, StoredMessage][] : []),
    ])
    const requests: { method: string; path: string; query: URLSearchParams; body: typeof Body.Type; authorization: string | null }[] = []
    const submittedStates: string[] = []
    const submittingIDs: (string | null)[] = []
    const acknowledgedIDs: (string | null)[] = []
    const overwrites: { id: string; type: 0 | 1; allow: string; deny: string }[] = []
    const remotePermissions = { ownerID: "98", roles: [{ id: "1", permissions: "66560" }, { id: "2", permissions: "0" }, { id: "3", permissions: "0" }],
      memberRoles: ["2"], overwrites, threadType: 11, privateMember: true, omitOverwrites: false,
      timeoutUntil: undefined as string | undefined }
    const state = { mode: "normal", mutations: 0, wrongGuild: false, wrongChannel: false, wrongThread: false,
      readError: false, readbackError: false, malformed: false, oversized: false, redirect: false,
      textOverride: undefined as string | undefined, cursorOverride: undefined as string | undefined,
      firstPage: false, permissionRevoke: false, ambiguousMissing: false,
      cas: "none", casStage: "final", casDone: false, gatePreflight: false, emptyHistory: false,
      limitedHistory: false, limitedAfterMutation: false, slackReadMissingError: false, slackMutationMissingError: false,
      slackMutationError: "" }
    const proof: CapabilityJobs.ProducerProof = { owner: binding.owner, producer: binding.invocation, rootToolName: binding.rootToolName }
    const received = yield* Deferred.make<void>()
    const preflightEntered = yield* Deferred.make<void>()
    const releasePreflight = yield* Deferred.make<void>()
    const scope = yield* Scope.Scope
    const wire = (message: StoredMessage, routeChannel = channelID) => provider === "slack" ? {
      ts: message.id, text: state.textOverride ?? message.text, ...(message.threadID ? { thread_ts: message.threadID } : {}),
      reactions: message.ownEmoji.map((name) => ({ name, users: ["U1"] })),
      files: [{ url_private: `https://files.slack.com/private?token=${token}` }],
    } : { id: message.id, channel_id: state.wrongChannel ? "999" : routeChannel,
      ...(message.type === 21 ? {} : { content: state.textOverride ?? message.text }),
      type: message.type ?? (message.replyTo ? 19 : 0),
      ...(message.reference ? { message_reference: { type: message.reference.type ?? 0,
        ...(message.reference.messageID ? { message_id: message.reference.messageID } : {}),
        ...(message.reference.channelID ? { channel_id: message.reference.channelID } : {}),
        ...(message.reference.guildID ? { guild_id: message.reference.guildID } : {}),
      } } : message.replyTo ? { message_reference: { type: 0, message_id: message.replyTo, channel_id: routeChannel } } : {}),
      reactions: message.ownEmoji.map((name) => ({ me: true, emoji: { name, id: null } })),
      attachments: [{ url: `https://cdn.discord.com/private?token=${token}` }],
    }
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: async (request) => {
        const url = new URL(request.url)
        const raw = await request.text()
        const body = raw ? Schema.decodeUnknownSync(Schema.fromJsonString(Body))(raw) : {}
        requests.push({ method: request.method, path: url.pathname, query: url.searchParams, body,
          authorization: request.headers.get("authorization") })
        const json = (value: unknown, status = 200) => Response.json(value, { status })
        const preflightPath = provider === "slack" ? "/api/auth.test" : "/api/v10/users/@me"
        if (state.gatePreflight && url.pathname === preflightPath && requests.filter((entry) => entry.path === preflightPath).length === 1) {
          Deferred.doneUnsafe(preflightEntered, Effect.void)
          await Effect.runPromise(Deferred.await(releasePreflight))
        }
        if (provider === "slack" && url.pathname === "/api/auth.test") return json({ ok: true, team_id: state.wrongGuild ? "T9" : "T1", user_id: "U1" })
        if (provider === "slack" && url.pathname === "/api/conversations.info") return json({ ok: true, channel: { id: state.wrongChannel ? "C9" : "C1", is_member: false } })
        if (provider === "discord" && url.pathname === "/api/v10/users/@me") return json({ id: "99" })
        if (provider === "discord" && url.pathname === "/api/v10/guilds/1") return json({ id: state.wrongGuild ? "9" : "1", owner_id: remotePermissions.ownerID, roles: remotePermissions.roles })
        if (provider === "discord" && url.pathname === "/api/v10/guilds/1/members/99") return json({ user: { id: "99" }, roles: remotePermissions.memberRoles,
          communication_disabled_until: remotePermissions.timeoutUntil ?? null })
        if (provider === "discord" && url.pathname === "/api/v10/channels/10") return json({ id: "10", guild_id: state.wrongGuild ? "9" : "1", type: 0,
          ...(remotePermissions.omitOverwrites ? {} : { permission_overwrites: remotePermissions.overwrites }) })
        if (provider === "discord" && url.pathname === "/api/v10/channels/20") return json({ id: "20", guild_id: "1", parent_id: state.wrongThread ? "999" : "10", type: remotePermissions.threadType })
        if (provider === "discord" && url.pathname === "/api/v10/channels/20/thread-members/99") return remotePermissions.privateMember
          ? json({ id: "20", user_id: "99" }) : json({ code: 10007 }, 404)
        const mutation = provider === "slack" ? url.pathname.includes("/chat.") || /\/reactions\.(add|remove)/.test(url.pathname)
          : request.method !== "GET"
        if (mutation) {
          state.mutations++
          const rows = await Effect.runPromise(f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie))
          submittedStates.push(...rows.filter((row) => row.owner.sessionID === f.context.sessionID).map((row) => row.state))
          submittingIDs.push(...rows.filter((row) => row.owner.sessionID === f.context.sessionID).map((row) => row.provider_id))
          Deferred.doneUnsafe(received, Effect.void)
          if (state.mode === "timeout") return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")) } }))
          if (state.mode === "500") return json({ error: token }, 500)
          if (state.mode === "400") return json({ error: token }, 400)
          if (state.mode === "provider_unknown") return json({ ok: false, error: "internal_error" })
          if (provider === "slack" && state.slackMutationError === "no_text") return json({ ok: false, error: "no_text" })
          const send = provider === "slack" ? url.pathname.endsWith("chat.postMessage") : request.method === "POST"
          const id = send ? options.acceptedID ?? (provider === "slack" ? `${200 + state.mutations}.000001` : String(200 + state.mutations))
            : provider === "slack" ? body.ts ?? body.timestamp ?? "" : url.pathname.split("/")[6] ?? ""
          if (send) messages.set(id, { id, text: body.text ?? body.content ?? "", ownEmoji: [],
            ...(body.thread_ts ? { threadID: body.thread_ts } : {}),
            ...(body.message_reference ? { replyTo: body.message_reference.message_id } : {}) })
          if (!send) {
            const message = messages.get(id)
            if (!message) return json(provider === "slack" ? { ok: false, error: "message_not_found" } : { code: 10008 }, 404)
            const reaction = provider === "slack" ? url.pathname.includes("reactions.") : url.pathname.includes("/reactions/")
            const emoji = provider === "slack" ? body.name ?? "" : decodeURIComponent(url.pathname.split("/")[8] ?? "")
            if (reaction) message.ownEmoji = request.method === "PUT" || url.pathname.endsWith("reactions.add")
              ? [...message.ownEmoji, emoji] : message.ownEmoji.filter((name) => name !== emoji)
            if (!reaction && (request.method === "DELETE" || url.pathname.endsWith("chat.delete"))) messages.delete(id)
            if (!reaction && (request.method === "PATCH" || url.pathname.endsWith("chat.update"))) message.text = body.text ?? body.content ?? ""
          }
          if (state.permissionRevoke) await Effect.runPromise(CapabilityPolicyFixture.setRules([...rules, { action: "read", resource: "*", effect: "deny" }]).pipe(
            Effect.provideService(AgentV2.Service, agents), Effect.provideService(Scope.Scope, scope)))
          if (state.cas !== "none" && state.casStage === "ack" && !state.casDone) {
            const row = rows.find((row) => row.owner.sessionID === f.context.sessionID)
            if (!row) throw new Error("FIXTURE_JOB_MISSING_AT_ACK")
            state.casDone = true
            await Effect.runPromise(jobs.observeHost(proof, { id: row.id }, { expectedGeneration: row.generation,
              state: state.cas === "running" ? "running" : "failed", providerID: id,
              observation: state.cas === "running" ? { progress: 0.5 } : { remoteOutcome: "failed" } }))
          }
          if (provider === "slack" && state.slackMutationMissingError) return json({ ok: false })
          if (provider === "slack" && state.slackMutationError) return json({ ok: false, error: state.slackMutationError })
          return provider === "slack" ? json({ ok: true, ts: id, channel: channelID })
            : send ? json({ id }) : new Response(null, { status: 204 })
        }
        if (state.redirect) return new Response(null, { status: 302, headers: { location: "http://127.0.0.1:1/private" } })
        if (state.malformed) return new Response("{missing-json")
        if (state.oversized) return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode("x".repeat(4096))); controller.close()
        } }))
        if (state.readError || (state.readbackError && state.mutations > 0)) return json({ error: token }, 500)
        if (state.mutations > 0) {
          const rows = await Effect.runPromise(f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie))
          const row = rows.find((row) => row.owner.sessionID === f.context.sessionID)
          if (!row) throw new Error("FIXTURE_JOB_MISSING_AT_READBACK")
          acknowledgedIDs.push(row.provider_id)
          if (state.cas !== "none" && state.casStage === "final" && !state.casDone) {
            state.casDone = true
            await Effect.runPromise(jobs.observeHost(proof, { id: row.id }, { expectedGeneration: row.generation,
              state: state.cas === "running" ? "running" : "failed", providerID: row.provider_id ?? undefined,
              observation: state.cas === "running" ? { progress: 0.5 } : { remoteOutcome: "failed" } }))
          }
        }
        if (provider === "slack") {
          if (state.slackReadMissingError) return json({ ok: false })
          if (url.pathname === "/api/reactions.get") {
            const message = messages.get(url.searchParams.get("timestamp") ?? "")
            return message ? json({ ok: true, channel: channelID, message: wire(message) }) : json({ ok: false, error: "message_not_found" })
          }
          if (!["/api/conversations.history", "/api/conversations.replies"].includes(url.pathname)) return json({ ok: false, error: "unexpected_fixture_route" }, 400)
          const exact = url.searchParams.has("latest") ? url.searchParams.get("oldest") : null
          const thread = url.searchParams.get("ts")
          const candidates = (state.emptyHistory ? [] : [...messages.values()]).filter((message) =>
            (thread ? message.threadID === thread : !message.threadID || message.threadID === message.id || message.broadcast) &&
            (exact ? message.id === exact : !thread || url.searchParams.get("inclusive") !== "false" || message.id !== thread))
          const offset = Number(url.searchParams.get("cursor")?.replace("offset-", "") ?? 0)
          const limit = Number(url.searchParams.get("limit") ?? 20)
          const selectedMessages = candidates.slice(offset, offset + limit)
          const hasMore = !exact && state.firstPage && offset + selectedMessages.length < candidates.length
          if (thread && state.wrongThread) return json({ ok: true, messages: [{ ts: "999.000001", text: "foreign" }], has_more: false })
          return json({ ok: true, messages: selectedMessages.map((message) => wire(message)), has_more: hasMore,
            is_limited: state.limitedHistory || (state.limitedAfterMutation && state.mutations > 0),
            response_metadata: { next_cursor: state.cursorOverride ?? (hasMore ? `offset-${offset + limit}` : "") } })
        }
        const parts = url.pathname.split("/")
        const routeChannel = parts[4] ?? ""
        const exact = parts[6]
        if (exact) {
          const message = messages.get(exact)
          return message ? json(wire(message, routeChannel)) : json({ code: state.ambiguousMissing ? 10003 : 10008, message: "Unknown Message" }, 404)
        }
        const page = (state.emptyHistory ? [] : [...messages.values()]).filter((message) => !url.searchParams.has("before") || BigInt(message.id) < BigInt(url.searchParams.get("before") ?? "0"))
          .sort((left, right) => Number(BigInt(right.id) - BigInt(left.id))).slice(0, Number(url.searchParams.get("limit") ?? 20))
        return json(page.map((message) => wire(message, routeChannel)))
      },
    })), (server) => Effect.promise(() => server.stop(true)))
    const agents = yield* AgentV2.Service
    const makeOptions = { connections, jobs, artifacts, fixtureOrigin: `http://127.0.0.1:${server.port}`,
      timeoutMs: options.timeoutMs, maxResponseBytes: options.maxResponseBytes }
    const channels = yield* CapabilityChannels.make(makeOptions)
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => CapabilityInvocation.withContext(binding, effect)
    const call = (input: Schema.Json, name: Name = options.root ?? "channel_send") => run(Tool.settle(channels.tools[name],
      { type: "tool-call", id: f.context.toolCallID, name, input }, f.context))
    const output = (input: Schema.Json, name?: Name) => call(input, name).pipe(Effect.flatMap((output) => Schema.decodeUnknownEffect(Output)(output.structured)))
    return { ...f, binding, provider, channels, credentials, selected, connections, jobs, artifacts, connection, target, bind,
      channelID, threadID, messageID, messages, requests, state, remotePermissions, submittedStates, submittingIDs, acknowledgedIDs,
      received, preflightEntered, releasePreflight, makeOptions, run, call, output }
  })
}

export function doubleFailure(phase: "rpc" | "retention", expectedFailure = false) {
  return Effect.gen(function* () {
    const f = yield* fixture("discord", { quota: phase === "retention" && expectedFailure ? 1 : undefined })
    if (phase === "rpc" && expectedFailure) f.state.mode = "500"
    const global = yield* Global.Service
    const shared = new Error("duplicate original/observer defect")
    const markers = { original: { phase: "original" }, observer: { phase: "observer" }, shared: { phase: "shared" } }
    const annotations = (marker: object) => Context.makeUnsafe(new Map([["channel-double-failure", marker]]))
    const repeated = [Cause.makeDieReason(shared).annotate(annotations(markers.shared)),
      Cause.makeInterruptReason(765).annotate(annotations(markers.shared))]
    const originals: Cause.Cause<unknown>[] = []
    const observers: Cause.Cause<never>[] = []
    const observerWrites: (typeof CapabilityJobTable.$inferSelect)[] = []
    const mutationExits: Exit.Exit<unknown, unknown>[] = []
    const row = (tx: Transaction) => tx.select().from(CapabilityJobTable).where(
      sql`json_extract(${CapabilityJobTable.owner}, '$.sessionID') = ${f.context.sessionID}`,
    ).get().pipe(Effect.orDie)
    const sqlCause = (tx: Transaction) => Effect.gen(function* () {
      const exit = yield* tx.run("INSERT INTO missing_channel_double_failure VALUES (1)").pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isSuccess(exit)) return yield* Effect.die("DOUBLE_FAILURE_SQL_DID_NOT_FIRE")
      expect(exit.cause.reasons).toHaveLength(1)
      const reason = exit.cause.reasons[0]
      if (!Cause.isFailReason(reason) || !(reason.error instanceof EffectDrizzleQueryError) || !Cause.isCause(reason.error.cause))
        return yield* Effect.die("DOUBLE_FAILURE_SQL_DRIVER_CAUSE_MISSING")
      const reasons = reason.error.cause.reasons.filter((entry): entry is Cause.Reason<SqlError> =>
        entry._tag !== "Fail" || entry.error instanceof SqlError)
      expect(reasons).toHaveLength(reason.error.cause.reasons.length)
      if (reasons.length !== reason.error.cause.reasons.length) return yield* Effect.die("DOUBLE_FAILURE_SQL_CAUSE_UNEXPECTED")
      expect(reasons.filter(Cause.isFailReason)).toHaveLength(1)
      return Cause.fromReasons(reasons)
    })
    const failOriginal = (tx: Transaction) => Effect.gen(function* () {
      const cause = yield* sqlCause(tx)
      const original = Cause.fromReasons([...cause.reasons.map((reason) => reason.annotate(annotations(markers.original))), ...repeated])
      originals.push(original)
      return yield* Effect.failCause(original)
    })
    const originalTransaction: typeof f.database.db.transaction = (use, options) => f.database.db.transaction((tx) => Effect.gen(function* () {
      const result = yield* use(tx)
      if (originals.length) return result
      if (phase === "rpc" && (yield* row(tx))?.state === "submitting") return yield* failOriginal(tx)
      if (phase === "retention") {
        const artifacts = yield* tx.select().from(CapabilityArtifactTable).where(
          sql`json_extract(${CapabilityArtifactTable.producer}, '$.sessionID') = ${f.context.sessionID}`,
        ).all().pipe(Effect.orDie)
        if (artifacts.length) {
          expect(artifacts).toHaveLength(1)
          expect((yield* row(tx))?.state).toBe("submitted")
          return yield* failOriginal(tx)
        }
      }
      return result
    }), options)
    const originalDB = new Proxy(f.database.db, { get: (db, key) => key === "transaction"
      ? originalTransaction : Reflect.get(db, key, db) })
    const observerTransaction: typeof f.database.db.transaction = (use, options) => f.database.db.transaction((tx) => Effect.gen(function* () {
      const result = yield* use(tx)
      const current = yield* row(tx)
      if (observers.length || !current || current.state !== (phase === "rpc" ? "unknown" : "completed")) return result
      // Actual Jobs provenance, CAS and SQL update finish before the second fault rolls this writer back.
      observerWrites.push(current)
      const cause = yield* sqlCause(tx)
      const observer = Cause.fromReasons<never>([...cause.reasons.map((reason) => Cause.isFailReason(reason)
        ? Cause.makeDieReason(reason.error).annotate(annotations(markers.observer)) : reason), ...repeated])
      observers.push(observer)
      return yield* Effect.failCause(observer)
    }), options)
    const observerDB = new Proxy(f.database.db, { get: (db, key) => key === "transaction"
      ? observerTransaction : Reflect.get(db, key, db) })
    const jobs = yield* CapabilityJobs.make.pipe(Effect.provideService(Database.Service, { ...f.database, db: observerDB }))
    const connections = phase === "rpc" && !expectedFailure ? yield* CapabilityConnections.make.pipe(
      Effect.provideService(Database.Service, { ...f.database, db: originalDB })) : f.connections
    const artifacts = phase === "retention" && !expectedFailure ? yield* CapabilityArtifacts.make({ root: join(global.data, "evidence") }).pipe(
      Effect.provideService(Database.Service, { ...f.database, db: originalDB })) : f.artifacts
    const channels = yield* CapabilityChannels.make({ ...f.makeOptions, connections, jobs, artifacts })
    const tracer = Tracer.make({ span: (options) => new class extends Tracer.NativeSpan {
      override end(time: bigint, exit: Exit.Exit<unknown, unknown>) {
        super.end(time, exit)
        if (this.name === "CapabilityChannels.mutate") mutationExits.push(exit)
        if (expectedFailure && this.name === (phase === "rpc" ? "CapabilityDiscord.send" : "CapabilityArtifacts.publish") && Exit.isFailure(exit))
          originals.push(exit.cause)
      }
    }(options) })
    const input = { provider: "discord", text: "double failure" }
    const call = () => f.run(Tool.settle(channels.tools.channel_send,
      { type: "tool-call", id: f.context.toolCallID, name: "channel_send", input }, f.context))
    const exit = yield* call().pipe(Effect.withTracer(tracer), Effect.exit)
    expect(originals).toHaveLength(1)
    expect(observers).toHaveLength(1)
    expect(observerWrites).toHaveLength(1)
    expect(mutationExits).toHaveLength(1)
    const mutation = mutationExits[0]
    expect(Exit.isFailure(exit)).toBe(true)
    expect(Exit.isFailure(mutation)).toBe(true)
    if (Exit.isSuccess(exit) || Exit.isSuccess(mutation)) return yield* Effect.die("CHANNEL_DOUBLE_FAILURE_BECAME_OUTPUT")
    const expected = [...originals[0].reasons, ...observers[0].reasons]
    expect(expected).toHaveLength(expectedFailure ? 4 : 6)
    if (expectedFailure) {
      expect(originals[0].reasons).toHaveLength(1)
      const reason = originals[0].reasons[0]
      expect(Cause.isFailReason(reason)).toBe(true)
      if (Cause.isFailReason(reason)) {
        expect(reason.error).toBeInstanceOf(phase === "rpc" ? Failure : Capability.Failure)
        expect(reason.error).toMatchObject(phase === "rpc" ? { reason: "http", status: 500 } : { code: "quota_exceeded" })
      }
    }
    expect(mutation.cause.reasons.map((reason) => reason._tag)).toEqual(expected.map((reason) => reason._tag))
    mutation.cause.reasons.forEach((reason, index) => {
      const original = expected[index]
      if (Cause.isFailReason(reason) && Cause.isFailReason(original)) expect(reason.error).toBe(original.error)
      if (Cause.isDieReason(reason) && Cause.isDieReason(original)) expect(reason.defect).toBe(original.defect)
      if (Cause.isInterruptReason(reason) && Cause.isInterruptReason(original)) expect(reason.fiberId).toBe(original.fiberId)
      expect(reason.annotations.get("channel-double-failure")).toBe(original.annotations.get("channel-double-failure"))
    })
    expect(mutation.cause.reasons.filter(Cause.isDieReason).filter((reason) => reason.defect === shared)).toHaveLength(expectedFailure ? 1 : 2)
    expect(mutation.cause.reasons.filter(Cause.isInterruptReason).filter((reason) => reason.fiberId === 765)).toHaveLength(expectedFailure ? 1 : 2)
    expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(expected.map((reason) => reason._tag))
    exit.cause.reasons.forEach((reason, index) => {
      const original = expected[index]
      if (Cause.isFailReason(reason)) {
        expect(reason.error).toBeInstanceOf(Tool.Failure)
        expect(reason.error.message).toBe(expectedFailure ? phase === "rpc" ? "channel_http" : "quota_exceeded" : "artifact_storage_failed")
      }
      if (Cause.isDieReason(reason) && Cause.isDieReason(original)) expect(reason.defect).toBe(original.defect)
      if (Cause.isInterruptReason(reason) && Cause.isInterruptReason(original)) expect(reason.fiberId).toBe(original.fiberId)
      expect(reason.annotations.get("channel-double-failure")).toBe(original.annotations.get("channel-double-failure"))
    })
    const rows = (yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie))
      .filter((row) => row.owner.sessionID === f.context.sessionID)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ state: phase === "rpc" ? "submitting" : "submitted", generation: phase === "rpc" ? 1 : 2,
      provider_id: phase === "rpc" ? null : "201" })
    expect(observerWrites[0]).toMatchObject({ state: phase === "rpc" ? "unknown" : "completed", generation: phase === "rpc" ? 2 : 3 })
    if (phase === "retention") {
      expect(observerWrites[0].observation).toMatchObject({ data: { remoteOutcome: "completed", materialization: expectedFailure ? "failed" : "pending" } })
      expect(f.messages.get("201")?.text).toBe(input.text)
    }
    expect(f.state.mutations).toBe(phase === "rpc" && !expectedFailure ? 0 : 1)
    expect(yield* f.database.db.select().from(CapabilityArtifactTable).all().pipe(Effect.orDie)).toEqual([])
    const requests = f.requests.length
    const replay = yield* call().pipe(Effect.flatMap((value) => Schema.decodeUnknownEffect(Output)(value.structured)))
    expect(replay.result.status).toBe(phase === "rpc" ? "unknown" : "partial")
    if (phase === "retention") expect(replay.result).toMatchObject({ completedEffects: ["provider_acknowledged"] })
    expect(replay.jobRef?.id).toBe(rows[0].id)
    expect(f.requests).toHaveLength(requests)
    expect(f.state.mutations).toBe(phase === "rpc" && !expectedFailure ? 0 : 1)
    expect(originals).toHaveLength(1)
    expect(observers).toHaveLength(1)
  })
}
