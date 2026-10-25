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
  is_limited: Schema.optionalKey(Schema.Boolean),
  response_metadata: Schema.optionalKey(Schema.Struct({ next_cursor: Schema.optionalKey(Schema.String) })),
})
// Closed documented rejection vocabulary for this REST subset. New/unknown errors stay ambiguous.
const definitive = new Set([
  "invalid_arguments", "invalid_arg_name", "invalid_array_arg", "invalid_charset", "invalid_form_data", "invalid_post_type",
  "missing_post_type", "invalid_cursor", "invalid_ts_latest", "invalid_ts_oldest", "is_archived", "no_text", "msg_too_long",
  "message_not_found", "thread_not_found", "cant_update_message", "cant_delete_message", "edit_window_closed",
  "cannot_reply_to_message", "already_reacted", "no_reaction", "invalid_name", "bad_timestamp", "ratelimited", "rate_limited",
])
const deniedErrors = new Set([
  "access_denied", "accesslimited", "channel_not_found", "channel_is_limited_access", "not_in_channel", "missing_scope",
  "no_permission", "restricted_action", "restricted_action_non_threadable_channel", "restricted_action_read_only_channel",
  "restricted_action_thread_locked", "restricted_action_thread_only_channel", "ekm_access_denied",
])

/** REST subset follows pinned actions.ts: exact timestamp bounds, replies, chat and own reactions. */
export const make = Effect.fn("CapabilitySlack.make")(function* (rpc: RPC, resource: Schema.Json, selectedThread?: string) {
  const target = yield* decode(Resource, resource).pipe(Effect.mapError(() => denied()))
  if (target.threadID && selectedThread && selectedThread !== target.threadID) return yield* denied()
  const threadID = selectedThread ?? target.threadID
  if (threadID) yield* decode(Timestamp, threadID).pipe(Effect.mapError(() => denied()))
  const call: RPC = (input) => rpc(input).pipe(Effect.flatMap((value) => Effect.gen(function* () {
    const envelope = yield* decode(Schema.Union([
      Schema.Struct({ ok: Schema.Literal(true) }), Schema.Struct({ ok: Schema.Literal(false), error: Schema.NonEmptyString }),
    ]), value)
    if (!envelope.ok) {
      if (["invalid_auth", "token_revoked", "token_expired", "not_authed", "account_inactive"].includes(envelope.error))
        return yield* new Capability.Failure({ code: "authentication_required", message: "Channel authentication is required" })
      if (deniedErrors.has(envelope.error)) return yield* denied()
      return yield* new Failure({ reason: "provider", missing: envelope.error === "message_not_found",
        ambiguous: !definitive.has(envelope.error) })
    }
    return value
  })))
  const auth = yield* call({ method: "POST", path: "/auth.test", body: {} }).pipe(Effect.flatMap((value) =>
    decode(Schema.Struct({ team_id: Schema.String, user_id: Schema.String }), value)))
  if (auth.team_id !== target.teamID) return yield* denied()
  const info = yield* call({ method: "GET", path: "/conversations.info", query: { channel: target.channelID } })
    .pipe(Effect.flatMap((value) => decode(Schema.Struct({ channel: Schema.Struct({ id: Schema.String }) }), value)))
  if (info.channel.id !== target.channelID) return yield* denied()
  // Canonical API access is the authority: user tokens may read public channels without is_member, unlike bot tokens.
  if (threadID) {
    const root = yield* call({ method: "GET", path: "/conversations.replies",
      query: { channel: target.channelID, ts: threadID, limit: 1, inclusive: true } })
      .pipe(Effect.flatMap((value) => decode(Page, value)))
    if (root.is_limited) return yield* acquisitionFailed()
    if (root.messages[0]?.ts !== threadID || (root.messages[0].thread_ts && root.messages[0].thread_ts !== threadID))
      return yield* denied()
  }
  const project = (message: typeof RemoteMessage.Type): Message => ({ id: message.ts, text: message.text,
    ...(message.thread_ts ? { threadID: message.thread_ts } : {}),
    reactions: (message.reactions ?? []).map((reaction) => ({ emoji: reaction.name, own: reaction.users.includes(auth.user_id) })),
  })
  const knownRoots = new Set<string>()
  const page = Effect.fn("CapabilitySlack.page")(function* (limit: number, cursor?: string, messageID?: string) {
    if (messageID) yield* decode(Timestamp, messageID).pipe(Effect.mapError(() => denied()))
    const value = yield* call({ method: "GET", path: threadID ? "/conversations.replies" : "/conversations.history",
      query: { channel: target.channelID, ...(threadID ? { ts: threadID } : {}), limit, cursor,
        ...(threadID && !messageID ? { oldest: threadID, inclusive: false } : {}),
        ...(messageID ? { oldest: messageID, latest: messageID, inclusive: true } : {}) },
    }).pipe(Effect.flatMap((value) => decode(Page, value)))
    if (value.is_limited) return yield* acquisitionFailed()
    if (value.messages.length > limit || value.messages.some((message) =>
      (messageID && message.ts !== messageID) || (threadID && message.ts !== threadID && message.thread_ts !== threadID)))
      return yield* new Failure({ reason: "invalid_response" })
    const next = value.response_metadata?.next_cursor || undefined
    if (next && !/^[0-9A-Za-z_+=\/-]{1,512}(?![\s\S])/.test(next)) return yield* new Failure({ reason: "invalid_response" })
    if (value.has_more && !next && !messageID) return yield* new Failure({ reason: "invalid_response" })
    if (next && next === cursor) return yield* new Failure({ reason: "invalid_response" })
    return { channelID: target.channelID, messages: value.messages.filter((message) =>
      messageID || !threadID || message.ts !== threadID).map(project),
      hasMore: !!value.has_more || !!next, ...(next ? { cursor: next } : {}),
    } satisfies Acquisition
  })
  const get = Effect.fn("CapabilitySlack.get")(function* (messageID: string) {
    const found = yield* page(1, undefined, messageID)
    if (found.hasMore) return yield* new Failure({ reason: "invalid_response" })
    if (found.messages[0] && (!found.messages[0].threadID || found.messages[0].threadID === messageID)) knownRoots.add(messageID)
    // conversations.history omits non-broadcast replies. Empty exact history cannot locate an unknown reply's thread.
    if (!found.messages[0] && !threadID && !knownRoots.has(messageID)) return yield* new Capability.Failure({
      code: "unsupported_operation", message: "Slack exact reply lookup requires a thread target or an observed channel root",
    })
    return found.messages[0]
  })
  return {
    channelID: target.channelID,
    read: Effect.fn("CapabilitySlack.read")(function* (input: Read) {
      if (input.action !== "message") return yield* page(input.limit ?? 20, input.cursor)
      const message = yield* get(input.messageID)
      return { channelID: target.channelID, messages: message ? [message] : [], hasMore: false } satisfies Acquisition
    }),
    get,
    observe: Effect.fn("CapabilitySlack.observe")(function* (input: Update) {
      if (!("emoji" in input)) return yield* get(input.messageID)
      const result = yield* call({ method: "GET", path: "/reactions.get",
        query: { channel: target.channelID, timestamp: input.messageID, full: true } }).pipe(Effect.flatMap((value) =>
        decode(Schema.Struct({ channel: ChannelID, message: RemoteMessage }), value)))
      if (result.channel !== target.channelID || result.message.ts !== input.messageID ||
        (threadID && result.message.ts !== threadID && result.message.thread_ts !== threadID)) return yield* denied()
      return project(result.message)
    }),
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

function acquisitionFailed() {
  return new Capability.Failure({ code: "acquisition_failed", message: "Slack history acquisition is limited" })
}
