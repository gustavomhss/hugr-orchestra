import { describe, expect } from "bun:test"
import { join } from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { CapabilityChannels } from "@orchestra/core/capability/channel/index"
import { Output } from "@orchestra/core/capability/channel/schema"
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
import { Cause, Deferred, Effect, Fiber, Layer, Schema, Scope } from "effect"
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
type StoredMessage = { id: string; text: string; threadID?: string; replyTo?: string; ownEmoji: string[] }
const Body = Schema.Struct({ text: Schema.optionalKey(Schema.String), content: Schema.optionalKey(Schema.String),
  channel: Schema.optionalKey(Schema.String), ts: Schema.optionalKey(Schema.String), timestamp: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String), thread_ts: Schema.optionalKey(Schema.String),
  message_reference: Schema.optionalKey(Schema.Struct({ message_id: Schema.String, channel_id: Schema.String, fail_if_not_exists: Schema.Boolean })),
})

function fixture(provider: "slack" | "discord", options: {
  root?: Name; boundThread?: boolean; credential?: Credential.Value; endpoint?: string; quota?: number; timeoutMs?: number; maxResponseBytes?: number
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
    const state = { mode: "normal", mutations: 0, wrongGuild: false, wrongChannel: false, wrongThread: false,
      readError: false, readbackError: false, malformed: false, oversized: false, redirect: false,
      textOverride: undefined as string | undefined, cursorOverride: undefined as string | undefined,
      firstPage: false, permissionRevoke: false, ambiguousMissing: false }
    const received = yield* Deferred.make<void>()
    const scope = yield* Scope.Scope
    const wire = (message: StoredMessage, routeChannel = channelID) => provider === "slack" ? {
      ts: message.id, text: state.textOverride ?? message.text, ...(message.threadID ? { thread_ts: message.threadID } : {}),
      reactions: message.ownEmoji.map((name) => ({ name, users: ["U1"] })),
      files: [{ url_private: `https://files.slack.com/private?token=${token}` }],
    } : { id: message.id, channel_id: state.wrongChannel ? "999" : routeChannel, content: state.textOverride ?? message.text,
      ...(message.replyTo ? { message_reference: { message_id: message.replyTo, channel_id: routeChannel } } : {}),
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
        if (provider === "slack" && url.pathname === "/api/auth.test") return json({ ok: true, team_id: state.wrongGuild ? "T9" : "T1", user_id: "U1" })
        if (provider === "slack" && url.pathname === "/api/conversations.info") return json({ ok: true, channel: { id: state.wrongChannel ? "C9" : "C1" } })
        if (provider === "discord" && url.pathname === "/api/v10/guilds/1") return json({ id: state.wrongGuild ? "9" : "1" })
        if (provider === "discord" && url.pathname === "/api/v10/channels/10") return json({ id: "10", guild_id: state.wrongGuild ? "9" : "1", type: 0 })
        if (provider === "discord" && url.pathname === "/api/v10/channels/20") return json({ id: "20", guild_id: "1", parent_id: state.wrongThread ? "999" : "10", type: 11 })
        const mutation = provider === "slack" ? url.pathname.includes("/chat.") || /\/reactions\.(add|remove)/.test(url.pathname)
          : request.method !== "GET"
        if (mutation) {
          state.mutations++
          const rows = await Effect.runPromise(f.database.db.select().from(CapabilityJobTable).all().pipe(Effect.orDie))
          submittedStates.push(...rows.filter((row) => row.owner.sessionID === f.context.sessionID).map((row) => row.state))
          Deferred.doneUnsafe(received, Effect.void)
          if (state.mode === "timeout") return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")) } }))
          if (state.mode === "500") return json({ error: token }, 500)
          if (state.mode === "400") return json({ error: token }, 400)
          if (state.mode === "provider_unknown") return json({ ok: false, error: "internal_error" })
          const send = provider === "slack" ? url.pathname.endsWith("chat.postMessage") : request.method === "POST"
          const id = send ? provider === "slack" ? `${200 + state.mutations}.000001` : String(200 + state.mutations)
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
          return provider === "slack" ? json({ ok: true, ts: id, channel: channelID })
            : send ? json({ id }) : new Response(null, { status: 204 })
        }
        if (state.redirect) return new Response(null, { status: 302, headers: { location: "http://127.0.0.1:1/private" } })
        if (state.malformed) return new Response("{missing-json")
        if (state.oversized) return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode("x".repeat(4096))); controller.close()
        } }))
        if (state.readError || (state.readbackError && state.mutations > 0)) return json({ error: token }, 500)
        if (provider === "slack") {
          if (url.pathname === "/api/reactions.get") {
            const message = messages.get(url.searchParams.get("timestamp") ?? "")
            return message ? json({ ok: true, channel: channelID, message: wire(message) }) : json({ ok: false, error: "message_not_found" })
          }
          if (!["/api/conversations.history", "/api/conversations.replies"].includes(url.pathname)) return json({ ok: false, error: "unexpected_fixture_route" }, 400)
          const exact = url.searchParams.has("latest") ? url.searchParams.get("oldest") : null
          const thread = url.searchParams.get("ts")
          const candidates = exact ? [...messages.values()].filter((message) => message.id === exact)
            : [...messages.values()].filter((message) => (!thread || message.threadID === thread) &&
              (!thread || url.searchParams.get("inclusive") !== "false" || message.id !== thread))
          const offset = Number(url.searchParams.get("cursor")?.replace("offset-", "") ?? 0)
          const limit = Number(url.searchParams.get("limit") ?? 20)
          const selectedMessages = candidates.slice(offset, offset + limit)
          const hasMore = !exact && state.firstPage && offset + selectedMessages.length < candidates.length
          if (thread && state.wrongThread) return json({ ok: true, messages: [{ ts: "999.000001", text: "foreign" }], has_more: false })
          return json({ ok: true, messages: selectedMessages.map((message) => wire(message)), has_more: hasMore,
            response_metadata: { next_cursor: state.cursorOverride ?? (hasMore ? `offset-${offset + limit}` : "") } })
        }
        const parts = url.pathname.split("/")
        const routeChannel = parts[4] ?? ""
        const exact = parts[6]
        if (exact) {
          const message = messages.get(exact)
          return message ? json(wire(message, routeChannel)) : json({ code: state.ambiguousMissing ? 10003 : 10008, message: "Unknown Message" }, 404)
        }
        const page = [...messages.values()].filter((message) => !url.searchParams.has("before") || BigInt(message.id) < BigInt(url.searchParams.get("before") ?? "0"))
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
      channelID, threadID, messageID, messages, requests, state, submittedStates, received, makeOptions, run, call, output }
  })
}

describe("CapabilityChannels real REST leaves", () => {
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
    expect(f.requests.slice(0, 3).map((request) => request.path)).toEqual(["/api/v10/guilds/1", "/api/v10/channels/10", "/api/v10/channels/20"])
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
    f.state.textOverride = `${token} https://private.test/file?token=${token}`
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
})
