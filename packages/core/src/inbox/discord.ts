import { Effect, Schema } from "effect"
import { decode, Failure, type RPC } from "../capability/channel/http"
import type { Pulled } from "./types"

const Snowflake = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,19}$/))
const Permissions = Schema.String.check(Schema.isPattern(/^[0-9]{1,30}$/))
const Bot = Schema.Struct({ id: Snowflake, bot: Schema.Literal(true) })
const Channel = Schema.Struct({
  id: Snowflake,
  guild_id: Snowflake,
  name: Schema.String,
  type: Schema.Int,
  permission_overwrites: Schema.Array(
    Schema.Struct({ id: Snowflake, type: Schema.Int, allow: Permissions, deny: Permissions }),
  ),
})

export const discordChoices = Effect.fn("InboxDiscord.choices")(function* (rpc: RPC) {
  const bot = yield* decode(Bot, yield* rpc({ method: "GET", path: "/api/v10/users/@me" }))
  const found = new Map<string, { id: string; name: string }>()
  const progress: { after?: string } = {}
  for (const _ of Array.from({ length: 100 })) {
    const guilds = yield* decode(
      Schema.Array(Schema.Struct({ id: Snowflake, name: Schema.String })),
      yield* rpc({ method: "GET", path: "/api/v10/users/@me/guilds", query: { limit: 200, after: progress.after } }),
    )
    if (
      guilds.length > 200 ||
      guilds.some((guild, index) => BigInt(guild.id) <= BigInt(index ? guilds[index - 1]!.id : (progress.after ?? "0")))
    )
      return yield* new Failure({ reason: "invalid_response" })
    yield* Effect.forEach(guilds, (guild) =>
      Effect.gen(function* () {
        const roles = yield* decode(
          Schema.Array(Schema.Struct({ id: Snowflake, permissions: Permissions })),
          yield* rpc({ method: "GET", path: `/api/v10/guilds/${guild.id}/roles` }),
        )
        const member = yield* decode(
          Schema.Struct({ roles: Schema.Array(Snowflake) }),
          yield* rpc({ method: "GET", path: `/api/v10/guilds/${guild.id}/members/${bot.id}` }),
        )
        const channels = yield* decode(
          Schema.Array(Channel),
          yield* rpc({ method: "GET", path: `/api/v10/guilds/${guild.id}/channels` }),
        )
        if (channels.some((channel) => channel.guild_id !== guild.id))
          return yield* new Failure({ reason: "invalid_response" })
        if (
          !roles.some((role) => role.id === guild.id) ||
          member.roles.some((id) => !roles.some((role) => role.id === id))
        )
          return yield* new Failure({ reason: "invalid_response" })
        const base = roles
          .filter((role) => role.id === guild.id || member.roles.includes(role.id))
          .reduce((mask, role) => mask | BigInt(role.permissions), 0n)
        channels
          .filter(
            (channel) =>
              [0, 5].includes(channel.type) &&
              canRead(base, guild.id, bot.id, member.roles, channel.permission_overwrites),
          )
          .forEach((channel) => found.set(channel.id, { id: channel.id, name: `${guild.name} · #${channel.name}` }))
        if (found.size > 10_000) return yield* new Failure({ reason: "response_limit" })
      }),
    )
    if (guilds.length < 200) return [...found.values()]
    progress.after = guilds.at(-1)!.id
  }
  return yield* new Failure({ reason: "response_limit" })
})

function canRead(
  base: bigint,
  guild: string,
  bot: string,
  roles: readonly string[],
  overwrites: typeof Channel.Type.permission_overwrites,
) {
  if ((base & 8n) !== 0n) return true
  const everyone = overwrites.find((entry) => entry.type === 0 && entry.id === guild)
  const initial = (base & ~BigInt(everyone?.deny ?? "0")) | BigInt(everyone?.allow ?? "0")
  const matched = overwrites.filter((entry) => entry.type === 0 && entry.id !== guild && roles.includes(entry.id))
  const combined =
    (initial & ~matched.reduce((mask, entry) => mask | BigInt(entry.deny), 0n)) |
    matched.reduce((mask, entry) => mask | BigInt(entry.allow), 0n)
  const user = overwrites.find((entry) => entry.type === 1 && entry.id === bot)
  const permissions = (combined & ~BigInt(user?.deny ?? "0")) | BigInt(user?.allow ?? "0")
  return (permissions & 66560n) === 66560n // VIEW_CHANNEL and READ_MESSAGE_HISTORY, not just a successful empty read.
}

export const discordSnapshot = Effect.fn("InboxDiscord.snapshot")(function* (
  rpc: RPC,
  channels: readonly string[],
  since: number,
) {
  if (!channels.length) return []
  // A user token/selfbot is never accepted, and lack of broad content access must not look like an empty inbox.
  yield* decode(Bot, yield* rpc({ method: "GET", path: "/api/v10/users/@me" }))
  const app = yield* decode(
    Schema.Struct({ flags: Schema.Int }),
    yield* rpc({ method: "GET", path: "/api/v10/oauth2/applications/@me" }),
  )
  if (!(app.flags & ((1 << 18) | (1 << 19)))) return yield* new Failure({ reason: "provider", missing: true })
  const found = new Map<string, Pulled>()
  yield* Effect.forEach([...new Set(channels)], (channel) =>
    Effect.gen(function* () {
      yield* decode(Snowflake, channel)
      const progress: { before?: string } = {}
      for (const _ of Array.from({ length: 100 })) {
        const messages = yield* decode(
          Schema.Array(
            Schema.Struct({
              id: Snowflake,
              channel_id: Snowflake,
              author: Schema.Struct({ id: Snowflake }),
              content: Schema.String,
              type: Schema.Int,
              timestamp: Schema.String,
              edited_timestamp: Schema.NullOr(Schema.String),
              attachments: Schema.optionalKey(Schema.Array(Schema.Json)),
              embeds: Schema.optionalKey(Schema.Array(Schema.Json)),
              components: Schema.optionalKey(Schema.Array(Schema.Json)),
            }),
          ),
          yield* rpc({
            method: "GET",
            path: `/api/v10/channels/${channel}/messages`,
            query: { limit: 100, before: progress.before },
          }),
        )
        if (
          messages.length > 100 ||
          messages.some(
            (message, index) =>
              message.channel_id !== channel ||
              !Number.isFinite(Date.parse(message.timestamp)) ||
              (message.edited_timestamp !== null && !Number.isFinite(Date.parse(message.edited_timestamp))) ||
              BigInt(message.id) >=
                BigInt(index ? messages[index - 1]!.id : (progress.before ?? "18446744073709551616")),
          )
        )
          return yield* new Failure({ reason: "invalid_response" })
        if (
          messages.some(
            (message) =>
              [0, 19].includes(message.type) &&
              !message.content &&
              !(message.attachments?.length || message.embeds?.length || message.components?.length),
          )
        )
          return yield* new Failure({ reason: "provider", missing: true })
        messages
          .filter(
            (message) => Date.parse(message.timestamp) >= since && [0, 19].includes(message.type) && message.content,
          )
          .forEach((message) =>
            found.set(message.id, {
              source: "discord",
              externalId: message.id,
              actor: message.author.id,
              snippet: message.content,
              threadId: channel,
              reply: false,
              revision: message.edited_timestamp ?? message.timestamp,
            }),
          )
        if (found.size > 10_000) return yield* new Failure({ reason: "response_limit" })
        if (messages.length < 100 || messages.some((message) => Date.parse(message.timestamp) < since)) return
        progress.before = messages.at(-1)!.id
      }
      return yield* new Failure({ reason: "response_limit" })
    }),
  )
  return [...found.values()]
})
