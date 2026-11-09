import { and, eq, isNull } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { Credential } from "../credential"
import { Database } from "../database/database"
import { Location } from "../location"
import { CapabilityConnectionTable, CapabilityTargetTable } from "../capability/sql"
import { request, type RPC } from "../capability/channel/http"
import { CapabilityDiscord } from "../capability/providers/discord"
import { CapabilitySlack } from "../capability/providers/slack"
import { fromDiscord } from "./source/discord"
import { fromSlack } from "./source/slack"
import type { Pulled, SourceKind } from "./types"

const limit = 20
const transport = { timeoutMs: 10_000, maxResponseBytes: 256 * 1024 }

export function fromChannel(
  provider: "slack" | "discord",
  channelID: string,
  message: { readonly id: string; readonly text: string; readonly actor?: string; readonly threadID?: string },
): Pulled | undefined {
  if (!message.actor || !message.text) return undefined
  const threadId = message.threadID && message.threadID !== channelID ? `${channelID}:${message.threadID}` : channelID
  const raw = { kind: "message", id: message.id, actor: message.actor, text: message.text, threadId }
  return provider === "slack" ? fromSlack(raw) : fromDiscord(raw)
}

export function splitThread(threadId: string) {
  const index = threadId.indexOf(":")
  if (index === -1) return { channelID: threadId }
  return { channelID: threadId.slice(0, index), threadID: threadId.slice(index + 1) }
}

export const pull = Effect.fn("InboxChannel.pull")(function* (
  db: Database.Interface["db"],
  location: Location.Interface,
  credentials: Credential.Interface,
) {
  const targets = yield* bound(db, location)
  // Discord acquisition now uses explicit, connection-bound Inbox selection and durable sync receipts.
  const pages = yield* Effect.forEach(
    targets.filter((target) => target.provider !== "discord"),
    (target) => page(credentials, target).pipe(Effect.catch(() => Effect.succeed([]))),
  )
  return pages.flat()
})

export const release = Effect.fn("InboxChannel.release")(function* (
  db: Database.Interface["db"],
  location: Location.Interface,
  credentials: Credential.Interface,
  source: SourceKind,
  threadId: string,
  text: string,
) {
  if (source !== "slack" && source !== "discord") return yield* Effect.fail("unavailable" as const)
  const wanted = splitThread(threadId)
  const targets = (yield* bound(db, location)).filter(
    (target) => target.provider === source && target.channelID === wanted.channelID,
  )
  const target = targets[0]
  if (!target || targets.length !== 1) return yield* Effect.fail("unavailable" as const)
  const adapter = yield* open(credentials, target, wanted.threadID).pipe(Effect.mapError(() => "unavailable" as const))
  yield* adapter
    .send({ provider: source, text, ...(wanted.threadID ? { threadID: wanted.threadID } : {}) })
    .pipe(Effect.mapError(() => "unavailable" as const))
})

function bound(db: Database.Interface["db"], location: Location.Interface) {
  return db
    .select({
      provider: CapabilityConnectionTable.provider,
      endpoint: CapabilityConnectionTable.endpoint,
      credentialID: CapabilityConnectionTable.credential_id,
      resource: CapabilityTargetTable.resource,
    })
    .from(CapabilityConnectionTable)
    .innerJoin(CapabilityTargetTable, eq(CapabilityTargetTable.connection_id, CapabilityConnectionTable.id))
    .where(
      and(
        eq(CapabilityConnectionTable.project_id, location.project.id),
        eq(CapabilityConnectionTable.directory, location.directory),
        location.workspaceID
          ? eq(CapabilityConnectionTable.workspace_id, location.workspaceID)
          : isNull(CapabilityConnectionTable.workspace_id),
        eq(CapabilityConnectionTable.state, "active"),
      ),
    )
    .all()
    .pipe(
      Effect.orDie,
      Effect.map((rows) => rows.flatMap(targetOf)),
    )
}

function targetOf(row: {
  provider: string
  endpoint: string
  credentialID: Credential.ID | null
  resource: Schema.Json
}): Target[] {
  if (!row.credentialID) return []
  if (row.provider === "slack" && row.endpoint === CapabilitySlack.endpoint) {
    const resource = Schema.decodeUnknownOption(CapabilitySlack.Resource)(row.resource)
    if (resource._tag === "None") return []
    return [
      {
        provider: "slack",
        endpoint: row.endpoint,
        credentialID: row.credentialID,
        resource: row.resource,
        channelID: resource.value.channelID,
      },
    ]
  }
  if (row.provider === "discord" && row.endpoint === CapabilityDiscord.endpoint) {
    const resource = Schema.decodeUnknownOption(CapabilityDiscord.Resource)(row.resource)
    if (resource._tag === "None") return []
    return [
      {
        provider: "discord",
        endpoint: row.endpoint,
        credentialID: row.credentialID,
        resource: row.resource,
        channelID: resource.value.threadID ?? resource.value.channelID,
      },
    ]
  }
  return []
}

function page(credentials: Credential.Interface, target: Target) {
  return Effect.gen(function* () {
    const adapter = yield* open(credentials, target)
    const read = yield* adapter.read({ provider: target.provider, action: "history", limit })
    return read.messages.flatMap((message) => {
      const pulled = fromChannel(target.provider, target.channelID, message)
      return pulled ? [pulled] : []
    })
  })
}

function open(credentials: Credential.Interface, target: Target, selectedThread?: string) {
  return Effect.gen(function* () {
    const saved = yield* credentials.get(target.credentialID)
    if (!saved) return yield* Effect.fail("unavailable" as const)
    const secret = saved.value.type === "key" ? saved.value.key : saved.value.access
    if (!secret || (saved.value.type === "oauth" && saved.value.expires <= Date.now()))
      return yield* Effect.fail("unavailable" as const)
    const authorization = `${target.provider === "discord" && saved.value.type === "key" ? "Bot" : "Bearer"} ${secret}`
    const rpc: RPC = (input) => request(target.endpoint, authorization, input, transport)
    return target.provider === "slack"
      ? yield* CapabilitySlack.make(rpc, target.resource, selectedThread)
      : yield* CapabilityDiscord.make(rpc, target.resource, selectedThread)
  })
}

type Target = {
  readonly provider: "slack" | "discord"
  readonly endpoint: string
  readonly credentialID: Credential.ID
  readonly resource: Schema.Json
  readonly channelID: string
}
