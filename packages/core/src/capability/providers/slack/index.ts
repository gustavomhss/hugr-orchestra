export * as CapabilitySlack from "./index"

import { Capability } from "@orchestra/schema/capability"
import { Effect, Schema } from "effect"
import { Failure, decode, type RPC } from "../../channel/http"
import type { Acquisition, Message, Read, Send, Update } from "../../channel/schema"

export const endpoint = "https://slack.com/api"
const ChannelID = Schema.String.check(Schema.isPattern(/^[CGD][A-Z0-9]{1,63}(?![\s\S])/))
const Timestamp = Schema.String.check(Schema.isPattern(/^[0-9]{1,20}\.[0-9]{1,10}(?![\s\S])/))
export const Resource = Schema.Struct({ channelID: ChannelID,
  teamID: Schema.String.check(Schema.isPattern(/^T[A-Z0-9]{1,63}(?![\s\S])/)),
  threadID: Schema.optionalKey(Timestamp),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
const RemoteMessage = Schema.Struct({ ts: Timestamp, text: Schema.String,
  thread_ts: Schema.optionalKey(Timestamp),
  reactions: Schema.optionalKey(Schema.Array(Schema.Struct({ name: Schema.String, users: Schema.Array(Schema.String) }))),
})
const Page = Schema.Struct({ messages: Schema.Array(RemoteMessage), has_more: Schema.optionalKey(Schema.Boolean),
  response_metadata: Schema.optionalKey(Schema.Struct({ next_cursor: Schema.optionalKey(Schema.String) })),
})

/** REST subset follows pinned actions.ts: exact timestamp bounds, replies, chat and own reactions. */
export const make = Effect.fn("CapabilitySlack.make")(function* (rpc: RPC, resource: Schema.Json, selectedThread?: string) {
  const target = yield* decode(Resource, resource).pipe(Effect.mapError(() => denied()))
  if (target.threadID && selectedThread && selectedThread !== target.threadID) return yield* denied()
  const threadID = selectedThread ?? target.threadID
  if (threadID) yield* decode(Timestamp, threadID).pipe(Effect.mapError(() => denied()))
  const call: RPC = (input) => rpc(input).pipe(Effect.flatMap((value) => Effect.gen(function* () {
    const envelope = yield* decode(Schema.Struct({ ok: Schema.Boolean, error: Schema.optionalKey(Schema.String) }), value)
    if (!envelope.ok) {
      if (["invalid_auth", "token_revoked", "token_expired", "not_authed"].includes(envelope.error ?? ""))
        return yield* new Capability.Failure({ code: "authentication_required", message: "Channel authentication is required" })
      return yield* new Failure({ reason: "provider", missing: envelope.error === "message_not_found" })
    }
    return value
  })))
  const auth = yield* call({ method: "POST", path: "/auth.test", body: {} }).pipe(Effect.flatMap((value) =>
    decode(Schema.Struct({ team_id: Schema.String, user_id: Schema.String }), value)))
  if (auth.team_id !== target.teamID) return yield* denied()
  const info = yield* call({ method: "GET", path: "/conversations.info", query: { channel: target.channelID } })
    .pipe(Effect.flatMap((value) => decode(Schema.Struct({ channel: Schema.Struct({ id: Schema.String }) }), value)))
  if (info.channel.id !== target.channelID) return yield* denied()
  if (threadID) {
    const root = yield* call({ method: "GET", path: "/conversations.replies",
      query: { channel: target.channelID, ts: threadID, limit: 1, inclusive: true } })
      .pipe(Effect.flatMap((value) => decode(Page, value)))
    if (root.messages[0]?.ts !== threadID || (root.messages[0].thread_ts && root.messages[0].thread_ts !== threadID))
      return yield* denied()
  }
  const project = (message: typeof RemoteMessage.Type): Message => ({ id: message.ts, text: message.text,
    ...(message.thread_ts ? { threadID: message.thread_ts } : {}),
    reactions: (message.reactions ?? []).map((reaction) => ({ emoji: reaction.name, own: reaction.users.includes(auth.user_id) })),
  })
  const page = Effect.fn("CapabilitySlack.page")(function* (limit: number, cursor?: string, messageID?: string) {
    if (messageID) yield* decode(Timestamp, messageID).pipe(Effect.mapError(() => denied()))
    const value = yield* call({ method: "GET", path: threadID ? "/conversations.replies" : "/conversations.history",
      query: { channel: target.channelID, ...(threadID ? { ts: threadID } : {}), limit, cursor,
        ...(messageID ? { oldest: messageID, latest: messageID, inclusive: true } : {}) },
    }).pipe(Effect.flatMap((value) => decode(Page, value)))
    if (value.messages.length > limit || value.messages.some((message) =>
      (messageID && message.ts !== messageID) || (threadID && message.ts !== threadID && message.thread_ts !== threadID)))
      return yield* new Failure({ reason: "invalid_response" })
    const next = value.response_metadata?.next_cursor || undefined
    if (next && !/^[0-9A-Za-z_+=\/-]{1,512}(?![\s\S])/.test(next)) return yield* new Failure({ reason: "invalid_response" })
    if (value.has_more && !next && !messageID) return yield* new Failure({ reason: "invalid_response" })
    return { channelID: target.channelID, messages: value.messages.map(project),
      hasMore: !!value.has_more || !!next, ...(next ? { cursor: next } : {}),
    } satisfies Acquisition
  })
  const get = Effect.fn("CapabilitySlack.get")(function* (messageID: string) {
    const found = yield* page(1, undefined, messageID)
    if (found.hasMore) return yield* new Failure({ reason: "invalid_response" })
    return found.messages[0]
  })
  return {
    channelID: target.channelID,
    read: (input: Read) => input.action === "message" ? page(1, undefined, input.messageID) : page(input.limit ?? 20, input.cursor),
    get,
    send: Effect.fn("CapabilitySlack.send")(function* (input: Send) {
      if (input.replyTo) return yield* new Capability.Failure({ code: "unsupported_operation", message: "Slack replies use threadID" })
      const sent = yield* call({ effect: true, method: "POST", path: "/chat.postMessage", body: {
        channel: target.channelID, text: input.text, ...(threadID ? { thread_ts: threadID } : {}),
        unfurl_links: false, unfurl_media: false,
      } }).pipe(Effect.flatMap((value) => decode(Schema.Struct({ ts: Timestamp }), value)))
      return sent.ts
    }),
    update: Effect.fn("CapabilitySlack.update")(function* (input: Update) {
      const method = input.action === "edit" ? "chat.update" : input.action === "delete" ? "chat.delete"
        : input.action === "reaction_add" ? "reactions.add" : "reactions.remove"
      if ("emoji" in input && !/^[a-z0-9_+-]{1,80}(?![\s\S])/.test(input.emoji))
        return yield* new Capability.Failure({ code: "unsupported_schema", message: "Slack reactions require emoji shortcodes" })
      yield* call({ effect: true, method: "POST", path: "/" + method, body: { channel: target.channelID,
        ...("emoji" in input ? { timestamp: input.messageID, name: input.emoji } : { ts: input.messageID }),
        ...("text" in input ? { text: input.text } : {}),
      } })
      return input.messageID
    }),
  }
})

function denied() {
  return new Capability.Failure({ code: "target_denied", message: "Channel target does not match its binding" })
}
