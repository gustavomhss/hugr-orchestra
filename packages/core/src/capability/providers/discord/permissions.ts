export * as CapabilityDiscordPermissions from "./permissions"

import { Capability } from "@orchestra/schema/capability"
import { Effect, Schema } from "effect"
import { decode, type RPC } from "../../channel/http"

const ID = Schema.String.check(Schema.isPattern(/^[0-9]{1,20}(?![\s\S])/))
const Bits = Schema.String.check(Schema.isPattern(/^[0-9]{1,32}(?![\s\S])/))
const Role = Schema.Struct({ id: ID, permissions: Bits })
const Overwrite = Schema.Struct({ id: ID, type: Schema.Literals([0, 1]), allow: Bits, deny: Bits })
const Guild = Schema.Struct({ id: ID, owner_id: ID, roles: Schema.Array(Role).check(Schema.isMaxLength(512)) })
const Member = Schema.Struct({ user: Schema.Struct({ id: ID }), roles: Schema.Array(ID).check(Schema.isMaxLength(512)),
  communication_disabled_until: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMaxLength(64)))),
})
const Channel = Schema.Struct({ id: ID, guild_id: ID, type: Schema.Int,
  parent_id: Schema.optionalKey(Schema.NullOr(ID)),
  permission_overwrites: Schema.optionalKey(Schema.Array(Overwrite).check(Schema.isMaxLength(512))),
})
const history = (1n << 10n) | (1n << 16n)
const administrator = 1n << 3n
const manageThreads = 1n << 34n

/** Discord permissions hierarchy and thread access follow pinned send.permissions.ts and official permissions/threads docs. */
export const requireHistory = Effect.fn("CapabilityDiscordPermissions.requireHistory")(function* (
  rpc: RPC, target: { guildID: string; channelID: string; threadID?: string },
) {
  const actor = yield* rpc({ method: "GET", path: "/users/@me" }).pipe(Effect.flatMap((value) => decode(Schema.Struct({ id: ID }), value)))
  const guild = yield* rpc({ method: "GET", path: `/guilds/${target.guildID}` }).pipe(Effect.flatMap((value) => decode(Guild, value)))
  if (guild.id !== target.guildID) return yield* failure("target_denied")
  const member = yield* rpc({ method: "GET", path: `/guilds/${target.guildID}/members/${actor.id}` })
    .pipe(Effect.flatMap((value) => decode(Member, value)))
  if (member.user.id !== actor.id) return yield* failure("target_denied")
  const parent = yield* rpc({ method: "GET", path: `/channels/${target.channelID}` }).pipe(Effect.flatMap((value) => decode(Channel, value)))
  if (parent.id !== target.channelID || parent.guild_id !== target.guildID || ![0, 5].includes(parent.type))
    return yield* failure("target_denied")
  const permissions = effectivePermissions(actor.id, guild, member, parent)
  if (permissions === undefined) return yield* failure("acquisition_failed")
  // A successful messages request can return [] without READ_MESSAGE_HISTORY; it is not an acquisition proof.
  if ((permissions & history) !== history) return yield* failure("target_denied")
  if (!target.threadID) return
  const thread = yield* rpc({ method: "GET", path: `/channels/${target.threadID}` }).pipe(Effect.flatMap((value) => decode(Channel, value)))
  if (thread.id !== target.threadID || thread.guild_id !== target.guildID || thread.parent_id !== target.channelID ||
    ![10, 11, 12].includes(thread.type)) return yield* failure("target_denied")
  // Threads inherit parent overwrites. Private threads additionally require membership or MANAGE_THREADS.
  if (thread.type !== 12 || (permissions & manageThreads) === manageThreads) return
  const membership = yield* rpc({ method: "GET", path: `/channels/${target.threadID}/thread-members/${actor.id}` })
    .pipe(Effect.flatMap((value) => decode(Schema.Struct({ id: ID, user_id: ID }), value)))
  if (membership.id !== target.threadID || membership.user_id !== actor.id) return yield* failure("target_denied")
}, (effect) => effect.pipe(Effect.catchTag("CapabilityChannel.TransportFailure", (error) => Effect.fail(failure(
  error.reason === "http" && error.status === 401 ? "authentication_required"
    : error.reason === "http" && (error.status === 403 || error.status === 404) ? "target_denied" : "acquisition_failed",
)))))

function effectivePermissions(actorID: string, guild: typeof Guild.Type, member: typeof Member.Type, channel: typeof Channel.Type) {
  if (!guild.roles.some((role) => role.id === guild.id) || new Set(guild.roles.map((role) => role.id)).size !== guild.roles.length ||
    member.roles.some((id) => !guild.roles.some((role) => role.id === id))) return undefined
  const base = guild.roles.filter((role) => role.id === guild.id || member.roles.includes(role.id))
    .reduce((permissions, role) => permissions | BigInt(role.permissions), 0n)
  if (guild.owner_id === actorID || (base & administrator) === administrator) return -1n
  if (!channel.permission_overwrites || new Set(channel.permission_overwrites.map((item) => `${item.type}:${item.id}`)).size !== channel.permission_overwrites.length)
    return undefined
  const everyone = channel.permission_overwrites.find((item) => item.type === 0 && item.id === guild.id)
  const roles = channel.permission_overwrites.filter((item) => item.type === 0 && item.id !== guild.id && member.roles.includes(item.id))
    .reduce((bits, item) => ({ allow: bits.allow | BigInt(item.allow), deny: bits.deny | BigInt(item.deny) }), { allow: 0n, deny: 0n })
  const specific = channel.permission_overwrites.find((item) => item.type === 1 && item.id === actorID)
  const general = (base & ~BigInt(everyone?.deny ?? "0")) | BigInt(everyone?.allow ?? "0")
  const aggregated = (general & ~roles.deny) | roles.allow
  const effective = (aggregated & ~BigInt(specific?.deny ?? "0")) | BigInt(specific?.allow ?? "0")
  if (!member.communication_disabled_until) return effective
  const until = Date.parse(member.communication_disabled_until)
  if (!Number.isFinite(until)) return undefined
  // Timeout preserves history/view but removes MANAGE_THREADS; owners and administrators returned above.
  return until > Date.now() ? effective & history : effective
}

function failure(code: "target_denied" | "acquisition_failed" | "authentication_required") {
  return new Capability.Failure({ code, message: "Discord history access is not established" })
}
