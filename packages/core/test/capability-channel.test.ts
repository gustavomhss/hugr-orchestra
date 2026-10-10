import { describe, expect } from "bun:test"
import { join } from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { CapabilityChannels } from "@orchestra/core/capability/channel/index"
import { Evidence, Output } from "@orchestra/core/capability/channel/schema"
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
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionStore } from "@orchestra/core/session/store"
import { Tool } from "@orchestra/core/tool/tool"
import { Integration } from "@orchestra/schema/integration"
import { IntegrationMethodID } from "@orchestra/schema/integration-id"
import { Capability } from "@orchestra/schema/capability"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Schema, Scope, Tracer } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { sql } from "drizzle-orm"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.unwrap(Effect.gen(function* () {
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
const rules: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]
const token = "fixture-selected-secret"
const newerToken = "fixture-newer-secret"
type Name = "channel_read" | "channel_send" | "channel_update"
type StoredMessage = { id: string; text: string; threadID?: string; replyTo?: string; ownEmoji: string[]; broadcast?: boolean;
  type?: number; reference?: { type?: number; messageID?: string; channelID?: string; guildID?: string } }
const Body = Schema.Struct({ text: Schema.optionalKey(Schema.String), content: Schema.optionalKey(Schema.String),
  channel: Schema.optionalKey(Schema.String), ts: Schema.optionalKey(Schema.String), timestamp: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String), thread_ts: Schema.optionalKey(Schema.String),
  message_reference: Schema.optionalKey(Schema.Struct({ message_id: Schema.String, channel_id: Schema.String, fail_if_not_exists: Schema.Boolean })),
})

function fixture(provider: "slack" | "discord", options: {
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

describe("CapabilityChannels real REST leaves", () => {
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

  it.live("Discord send to verified child thread with explicit reply; fixed route and suppressed ambient mentions", () => Effect.gen(function* () {
    const f = yield* fixture("discord")
    const output = yield* f.output({ provider: "discord", text: "reply", threadID: f.threadID, replyTo: f.messageID })
    expect(output.result).toMatchObject({ status: "completed", verification: "verified" })
    expect(f.submittedStates).toEqual(["submitting"])
    const send = f.requests.find((request) => request.method === "POST")
    expect(send?.path).toBe("/api/v10/channels/20/messages")
    expect(send?.body.message_reference).toEqual({ message_id: f.messageID, channel_id: "20", fail_if_not_exists: true })
    expect(f.requests.slice(0, 3).map((request) => request.path)).toEqual(["/api/v10/users/@me", "/api/v10/guilds/1", "/api/v10/guilds/1/members/99"])
    expect(f.requests.some((request) => request.path === "/api/v10/channels/10")).toBe(true)
    expect(f.requests.some((request) => request.path === "/api/v10/channels/20")).toBe(true)
    expect(f.requests.every((request) => request.authorization === `Bot ${token}`)).toBe(true)
  }))

  it.live("Both providers acquire bounded history, exact messages and thread pages with real pagination", () => Effect.gen(function* () {
    yield* Effect.forEach(["slack", "discord"] as const, (provider) => Effect.gen(function* () {
      const f = yield* fixture(provider, { root: "channel_read" })
      f.state.firstPage = true
      const first = yield* f.output({ provider, action: "history", limit: 1 })
      expect(first.result).toMatchObject({ status: "completed", verification: "observed" })
      expect(first.acquisition?.messages).toHaveLength(1)
      expect(first.acquisition?.hasMore).toBe(true)
      const next = yield* f.output({ provider, action: "history", limit: 1, cursor: first.acquisition?.cursor ?? "missing" })
      expect(next.acquisition?.cursor).not.toBe(first.acquisition?.cursor)
      expect(next.acquisition?.messages[0]?.id).not.toBe(first.acquisition?.messages[0]?.id)
      const exact = yield* f.output({ provider, action: "message", messageID: f.messageID })
      expect(exact.acquisition?.messages.map((message) => message.id)).toEqual([f.messageID])
      const thread = yield* f.output({ provider, action: "thread", threadID: f.threadID })
      expect(thread.acquisition?.messages.length).toBeGreaterThan(0)
      expect(f.requests.some((request) => provider === "slack" ? request.query.has("cursor") : request.query.has("before"))).toBe(true)
    }))
  }))

  it.live("Both providers edit, delete and own reactions verify actual postconditions, not acknowledgment", () => Effect.gen(function* () {
    yield* Effect.forEach(["slack", "discord"] as const, (provider) => Effect.gen(function* () {
      yield* Effect.forEach(["edit", "delete", "reaction_add", "reaction_remove"] as const, (action) => Effect.gen(function* () {
        const f = yield* fixture(provider, { root: "channel_update" })
        const emoji = provider === "slack" ? "thumbsup" : "👍"
        if (action === "reaction_remove") {
          const message = f.messages.get(f.messageID)
          if (!message) return yield* Effect.die("FIXTURE_MESSAGE_MISSING")
          message.ownEmoji = [emoji]
        }
        const output = yield* f.output({ provider, action, messageID: f.messageID,
          ...(action === "edit" ? { text: "edited" } : action.startsWith("reaction") ? { emoji } : {}) })
        expect(output.result).toMatchObject({ status: "completed", verification: "verified" })
        expect(f.submittedStates).toEqual(["submitting"])
        expect(f.submittingIDs).toEqual([f.messageID])
        if (action === "edit") expect(f.messages.get(f.messageID)?.text).toBe("edited")
        if (action === "delete") expect(f.messages.has(f.messageID)).toBe(false)
        if (action === "reaction_add") expect(f.messages.get(f.messageID)?.ownEmoji).toEqual([emoji])
        if (action === "reaction_remove") expect(f.messages.get(f.messageID)?.ownEmoji).toEqual([])
        if (provider === "slack" && action.startsWith("reaction")) expect(f.requests.some((request) =>
          request.path === "/api/reactions.get" && request.query.get("full") === "true")).toBe(true)
      }))
    }))
  }), 30000)

  it.live("Metadata wrong team/guild/channel/thread and message membership fail before mutation", () => Effect.gen(function* () {
    yield* Effect.forEach(["slack", "discord"] as const, (provider) => Effect.gen(function* () {
      yield* Effect.forEach(["wrongGuild", "wrongThread"] as const, (flag) => Effect.gen(function* () {
        const f = yield* fixture(provider)
        f.state[flag] = true
        expect((yield* f.call({ provider, text: "forbidden", threadID: f.threadID }).pipe(Effect.flip)).message).toBe("target_denied")
        expect(f.state.mutations).toBe(0)
      }))
      const f = yield* fixture(provider, { root: "channel_update", boundThread: true })
      expect((yield* f.call({ provider, action: "delete", messageID: provider === "slack" ? "999.000001" : "999" }).pipe(Effect.flip)).message).toBe("target_denied")
      expect(f.state.mutations).toBe(0)
      expect((yield* f.call({ provider, action: "delete", messageID: f.messageID, threadID: provider === "slack" ? "999.000001" : "999" }).pipe(Effect.flip)).message).toBe("target_denied")
      expect(f.state.mutations).toBe(0)
    }))
    const discord = yield* fixture("discord", { root: "channel_update" })
    discord.state.wrongChannel = true
    expect((yield* discord.call({ provider: "discord", action: "edit", messageID: discord.messageID, text: "forbidden" }).pipe(Effect.flip)).message).toBe("target_denied")
    expect(discord.state.mutations).toBe(0)
  }))

  it.live("Unknown 5xx/timeout send persists unknown and exact replay never sends again", () => Effect.gen(function* () {
    yield* Effect.forEach(["slack", "discord"] as const, (provider) => Effect.gen(function* () {
      yield* Effect.forEach(provider === "slack" ? ["500", "timeout", "provider_unknown"] : ["500", "timeout"], (mode) => Effect.gen(function* () {
        const f = yield* fixture(provider, { timeoutMs: 1000 })
        f.state.mode = mode
        const first = yield* f.output({ provider, text: "one attempt" })
        expect(first.result.status).toBe("unknown")
        expect(f.submittedStates).toEqual(["submitting"])
        const second = yield* f.output({ provider, text: "one attempt" })
        expect(second.result.status).toBe("unknown")
        expect(second.jobRef).toEqual(first.jobRef)
        expect(f.state.mutations).toBe(1)
        const rows = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
        expect(rows.filter((row) => row.owner.sessionID === f.context.sessionID)).toMatchObject([{ state: "unknown", provider_id: null }])
      }))
    }))
  }), 30000)

  it.live("Known acceptance survives readback/retention/current read-deny failures as partial, retaining provider ID", () => Effect.gen(function* () {
    yield* Effect.forEach(["readback", "retention", "deny", "mismatch"] as const, (mode) => Effect.gen(function* () {
      const f = yield* fixture("discord", { quota: mode === "retention" ? 1 : undefined })
      f.state.readbackError = mode === "readback"
      f.state.permissionRevoke = mode === "deny"
      f.state.textOverride = mode === "mismatch" ? "different text" : undefined
      const output = yield* f.output({ provider: "discord", text: "accepted" })
      expect({ mode, status: output.result.status }).toEqual({ mode, status: "partial" })
      expect(output.messageID).toBe("201")
      const rows = yield* f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie)
      expect(rows.filter((row) => row.owner.sessionID === f.context.sessionID)).toMatchObject([
        { provider_id: "201", state: mode === "retention" ? "completed" : "submitted" },
      ])
      expect(f.messages.get("201")?.text).toBe("accepted")
      expect(f.state.mutations).toBe(1)
    }))
  }))

  it.live("Read failure, malformed body, real streamed byte overflow and redirect cannot become completed empty acquisition", () => Effect.gen(function* () {
    yield* Effect.forEach(["readError", "malformed", "oversized", "redirect"] as const, (mode) => Effect.gen(function* () {
      const f = yield* fixture("slack", { root: "channel_read", maxResponseBytes: 512 })
      f.state[mode] = true
      const error = yield* f.call({ provider: "slack", action: "history" }).pipe(Effect.flip)
      expect(error.message).toBe(`channel_${mode === "readError" ? "http" : mode === "malformed" ? "invalid_response" : mode === "oversized" ? "response_limit" : "redirect"}`)
      expect(JSON.stringify(error)).not.toContain(token)
      expect(yield* f.database.db.select().from(CapabilityArtifactTable).all().pipe(Effect.orDie)).toEqual([])
    }))
  }))

  it.live("Provider payload/token URLs are redacted in normal output and retained evidence; credential selection is exact", () => Effect.gen(function* () {
    const f = yield* fixture("slack", { root: "channel_read" })
    f.state.textOverride = `${token} HTTPS://private.test/file?token=${token}`
    const output = yield* f.output({ provider: "slack", action: "history" })
    expect(output.acquisition?.messages[0]?.text).toBe("[redacted] [url]")
    expect(JSON.stringify(output)).not.toContain(token)
    expect(JSON.stringify(output)).not.toContain(newerToken)
    if (output.result.status !== "completed") return yield* Effect.die("EXPECTED_COMPLETED")
    const retained = yield* f.run(f.artifacts.read(f.context, output.result.artifactRefs[0]))
    expect(new TextDecoder().decode(retained.data)).not.toContain(token)
    expect(new TextDecoder().decode(retained.data)).not.toContain("private.test")
    expect(JSON.stringify(yield* f.credentials.all())).toContain(token)
    expect(f.requests.every((request) => request.authorization === `Bearer ${token}`)).toBe(true)
    f.state.textOverride = undefined
    f.state.cursorOverride = token
    expect((yield* f.call({ provider: "slack", action: "history" }).pipe(Effect.flip)).message).toBe("acquisition_failed")
  }))

  it.live("Exact OAuth credential works until expiry; expired token and endpoint mismatch fail without RPC", () => Effect.gen(function* () {
    const oauth: Credential.Value = { type: "oauth", methodID: IntegrationMethodID.make("fixture-oauth"), access: token,
      refresh: "fixture-refresh-secret", expires: Date.now() + 60000 }
    const valid = yield* fixture("discord", { credential: oauth })
    expect((yield* valid.output({ provider: "discord", text: "oauth" })).result.status).toBe("completed")
    expect(valid.requests.every((request) => request.authorization === `Bearer ${token}`)).toBe(true)
    const expired = yield* fixture("slack", { credential: { ...oauth, expires: 0 } })
    expect((yield* expired.call({ provider: "slack", text: "expired" }).pipe(Effect.flip)).message).toBe("authentication_required")
    expect(expired.requests).toHaveLength(0)
    const mismatch = yield* fixture("slack", { endpoint: "https://elsewhere.test/api" })
    expect((yield* mismatch.call({ provider: "slack", text: "wrong host" }).pipe(Effect.flip)).message).toBe("target_denied")
    expect(mismatch.requests).toHaveLength(0)
  }))

  it.live("Real root binding, captured deny floor, unknown target and ambiguity cannot be bypassed through canonical settle", () => Effect.gen(function* () {
    const f = yield* fixture("slack")
    expect((yield* Tool.settle(f.channels.tools.channel_send,
      { type: "tool-call", id: f.context.toolCallID, name: "channel_send", input: { provider: "slack", text: "missing binding" } }, f.context).pipe(Effect.flip)).message).toBe("invocation_binding_missing")
    const denied = { ...f.binding, nativeDenyFloor: [{ action: "channel.send", resource: "*", effect: "deny" as const }] }
    expect((yield* CapabilityInvocation.withContext(denied, Tool.settle(f.channels.tools.channel_send,
      { type: "tool-call", id: f.context.toolCallID, name: "channel_send", input: { provider: "slack", text: "denied" } }, f.context)).pipe(Effect.flip)).message).toBe("target_denied")
    expect((yield* f.call({ provider: "slack", text: "hidden", targetID: Capability.TargetID.create() }).pipe(Effect.flip)).message).toBe("connection_unavailable")
    const other = yield* f.connections.createTarget(f.connection, { environment: "fixture", resource: { channelID: "C2", teamID: "T1" } })
    yield* f.connections.bind({ ...f.bind, target: other })
    expect((yield* f.call({ provider: "slack", text: "ambiguous" }).pipe(Effect.flip)).message).toBe("ambiguous_target")
    expect(f.requests).toHaveLength(0)
    expect((yield* f.output({ provider: "slack", text: "explicit", targetID: f.target.id })).result.status).toBe("completed")
  }))

  it.live("Unsupported actions, arbitrary URL fields, out-of-bound cursor and mismatched root are rejected", () => Effect.gen(function* () {
    const f = yield* fixture("discord", { root: "channel_read" })
    const invalid: Schema.Json[] = [
      { provider: "discord", action: "search" }, { provider: "discord", action: "history", url: "https://evil.test" },
      { provider: "discord", action: "history", cursor: "x".repeat(513) }, { provider: "discord", action: "history", limit: 101 },
    ]
    yield* Effect.forEach(invalid, (input) => f.call(input).pipe(Effect.flip,
      Effect.tap((error) => Effect.sync(() => expect(error.message).toStartWith("Invalid tool input:")))))
    expect(f.requests).toHaveLength(0)
    expect((yield* f.call({ provider: "discord", text: "wrong root" }, "channel_send").pipe(Effect.flip)).message).toBe("invocation_binding_mismatch")
    expect(f.requests).toHaveLength(0)
    const definition = Tool.definition("channel_read", f.channels.tools.channel_read)
    expect(JSON.stringify(definition.inputSchema)).toContain("threadID")
    expect(JSON.stringify(definition.outputSchema)).toContain("Capability.Result")
    const remote = yield* CapabilityChannels.make({ ...f.makeOptions, fixtureOrigin: "http://evil.test" }).pipe(Effect.flip)
    expect(remote.code).toBe("unsupported_schema")
  }))

  it.live("Definitive rejection persists failed; ambiguous missing-channel readback cannot verify deletion", () => Effect.gen(function* () {
    const rejected = yield* fixture("discord")
    rejected.state.mode = "400"
    expect((yield* rejected.call({ provider: "discord", text: "rejected" }).pipe(Effect.flip)).message).toBe("channel_http")
    expect(rejected.state.mutations).toBe(1)
    expect((yield* rejected.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie))[0]).toMatchObject({ state: "failed", provider_id: null })
    const deleted = yield* fixture("discord", { root: "channel_update" })
    deleted.state.ambiguousMissing = true
    const output = yield* deleted.output({ provider: "discord", action: "delete", messageID: deleted.messageID })
    expect(output.result).toMatchObject({ status: "partial", unresolvedEffects: ["postcondition_readback"] })
    expect(deleted.messages.has(deleted.messageID)).toBe(false)
    expect(deleted.state.mutations).toBe(1)
  }))

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
