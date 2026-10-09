export * as CapabilityDiscord from "./index"

import { Capability } from "@orchestra/schema/capability"
import { Effect, Schema } from "effect"
import { Failure, decode, type RPC } from "../../channel/http"
import type { Acquisition, Message, Read, Send, Update } from "../../channel/schema"

export const endpoint = "https://discord.com/api/v10"
const Snowflake = Schema.String.check(Schema.isPattern(/^[0-9]{1,20}(?![\s\S])/))
export const Resource = Schema.Struct({ channelID: Snowflake, guildID: Snowflake,
  threadID: Schema.optionalKey(Snowflake),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
const Channel = Schema.Struct({ id: Snowflake, guild_id: Snowflake, type: Schema.Int,
  parent_id: Schema.optionalKey(Schema.NullOr(Snowflake)),
})
const RemoteMessage = Schema.Struct({ id: Snowflake, channel_id: Snowflake, content: Schema.String, type: Schema.Int,
  message_reference: Schema.optionalKey(Schema.Struct({ type: Schema.optionalKey(Schema.Int), message_id: Schema.optionalKey(Snowflake),
    channel_id: Schema.optionalKey(Snowflake), guild_id: Schema.optionalKey(Snowflake) })),
  reactions: Schema.optionalKey(Schema.Array(Schema.Struct({ me: Schema.Boolean,
    emoji: Schema.Struct({ name: Schema.NullOr(Schema.String), id: Schema.NullOr(Snowflake) }) }))),
})

/** Fixed REST routes; Discord thread channels must prove guild and parent ownership before effects. */
export const make = Effect.fn("CapabilityDiscord.make")(function* (rpc: RPC, resource: Schema.Json, selectedThread?: string) {
  const target = yield* decode(Resource, resource).pipe(Effect.mapError(() => denied()))
  if (target.threadID && selectedThread && selectedThread !== target.threadID) return yield* denied()
  const threadID = selectedThread ?? target.threadID
  if (threadID) yield* decode(Snowflake, threadID).pipe(Effect.mapError(() => denied()))
  const guild = yield* rpc({ method: "GET", path: `/guilds/${target.guildID}` })
    .pipe(Effect.flatMap((value) => decode(Schema.Struct({ id: Snowflake }), value)))
  if (guild.id !== target.guildID) return yield* denied()
  const base = yield* rpc({ method: "GET", path: `/channels/${target.channelID}` })
    .pipe(Effect.flatMap((value) => decode(Channel, value)))
  if (base.id !== target.channelID || base.guild_id !== target.guildID || ![0, 5].includes(base.type)) return yield* denied()
  if (threadID) {
    const thread = yield* rpc({ method: "GET", path: `/channels/${threadID}` })
      .pipe(Effect.flatMap((value) => decode(Channel, value)))
    if (thread.id !== threadID || thread.guild_id !== target.guildID || thread.parent_id !== target.channelID ||
      ![10, 11, 12].includes(thread.type)) return yield* denied()
  }
  const channelID = threadID ?? target.channelID
  const project = Effect.fn("CapabilityDiscord.project")(function* (value: unknown) {
    const message = yield* decode(RemoteMessage, value)
    if (message.channel_id !== channelID) return yield* denied()
    // Discord references also attribute forwards, crossposts and thread starters; never follow them remotely.
    const reply = message.type === 19 && (message.message_reference?.type ?? 0) === 0
    if (reply && (!message.message_reference?.message_id || !message.message_reference.channel_id))
      return yield* new Failure({ reason: "invalid_response" })
    if (reply && (message.message_reference?.channel_id !== channelID ||
      (message.message_reference.guild_id && message.message_reference.guild_id !== target.guildID))) return yield* denied()
    return { id: message.id, text: message.content, ...(threadID ? { threadID } : {}),
      ...(reply && message.message_reference?.message_id ? { replyTo: message.message_reference.message_id } : {}),
      reactions: (message.reactions ?? []).map((reaction) => ({
        emoji: reaction.emoji.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji.name ?? "",
        own: reaction.me,
      })),
    } satisfies Message
  })
  const get = Effect.fn("CapabilityDiscord.get")(function* (messageID: string) {
    yield* decode(Snowflake, messageID).pipe(Effect.mapError(() => denied()))
    return yield* rpc({ method: "GET", path: `/channels/${channelID}/messages/${messageID}` }).pipe(
      Effect.flatMap(project), Effect.flatMap((message) => message.id === messageID ? Effect.succeed(message) : Effect.fail(denied())),
      Effect.catchTag("CapabilityChannel.TransportFailure", (error) =>
        error.reason === "http" && error.status === 404 && error.missing ? Effect.succeed(undefined) : Effect.fail(error)),
    )
  })
  return {
    channelID, get, observe: (input: Update) => get(input.messageID),
    read: Effect.fn("CapabilityDiscord.read")(function* (input: Read) {
      if (input.action === "message") {
        const message = yield* get(input.messageID)
        return { channelID, messages: message ? [message] : [], hasMore: false } satisfies Acquisition
      }
      if (input.cursor) yield* decode(Snowflake, input.cursor).pipe(Effect.mapError(() => denied()))
      const limit = input.limit ?? 20
      const values = yield* rpc({ method: "GET", path: `/channels/${channelID}/messages`, query: { limit, before: input.cursor } })
        .pipe(Effect.flatMap((value) => decode(Schema.Array(RemoteMessage), value)))
      if (values.length > limit) return yield* new Failure({ reason: "invalid_response" })
      const messages = yield* Effect.forEach(values, project)
      const cursor = messages.length === limit ? messages.at(-1)?.id : undefined
      if (cursor === input.cursor && cursor) return yield* new Failure({ reason: "invalid_response" })
      return { channelID, messages, hasMore: !!cursor, ...(cursor ? { cursor } : {}) } satisfies Acquisition
    }),
    send: Effect.fn("CapabilityDiscord.send")(function* (input: Send) {
      const sent = yield* rpc({ effect: true, method: "POST", path: `/channels/${channelID}/messages`, body: {
        content: input.text, allowed_mentions: { parse: [], replied_user: false },
        ...(input.replyTo ? { message_reference: { message_id: input.replyTo, channel_id: channelID, fail_if_not_exists: true } } : {}),
      } }).pipe(Effect.flatMap((value) => decode(Schema.Struct({ id: Snowflake }), value)))
      return sent.id
    }),
    update: Effect.fn("CapabilityDiscord.update")(function* (input: Update) {
      const path = `/channels/${channelID}/messages/${input.messageID}`
      yield* rpc(input.action === "edit" ? { effect: true, method: "PATCH", path, body: { content: input.text, allowed_mentions: { parse: [] } } }
        : input.action === "delete" ? { effect: true, method: "DELETE", path }
        : { effect: true, method: input.action === "reaction_add" ? "PUT" : "DELETE", path: `${path}/reactions/${encodeURIComponent(input.emoji)}/@me` })
      return input.messageID
    }),
  }
})

function denied() {
  return new Capability.Failure({ code: "target_denied", message: "Channel target does not match its binding" })
}
