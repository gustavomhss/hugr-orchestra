import { describe, expect } from "bun:test"
import { CapabilityChannels } from "@orchestra/core/capability/channel/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityArtifactTable, CapabilityJobTable } from "@orchestra/core/capability/sql"
import { Credential } from "@orchestra/core/credential"
import { Tool } from "@orchestra/core/tool/tool"
import { IntegrationMethodID } from "@orchestra/schema/integration-id"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Schema } from "effect"
import { it, token, newerToken, fixture } from "./fixture/capability-channel"

describe("CapabilityChannels real REST leaves", () => {
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

})
