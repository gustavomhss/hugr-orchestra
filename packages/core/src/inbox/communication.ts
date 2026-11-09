import { Effect, Schema } from "effect"
import { decode, Failure, type Request, type RPC } from "../capability/channel/http"
import type { Pulled } from "./types"

const excludedLabels = new Set(["SPAM", "TRASH", "DRAFT", "SENT"])
const GmailMessage = Schema.Struct({
  id: Schema.NonEmptyString,
  threadId: Schema.NonEmptyString,
  labelIds: Schema.Array(Schema.String),
  snippet: Schema.String,
  payload: Schema.Struct({ headers: Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String })) }),
})

export const gmailSnapshot = Effect.fn("InboxCommunication.gmailSnapshot")(function* (
  rpc: RPC,
  labels: readonly string[],
  unreadOnly: boolean,
) {
  const found = new Set<string>()
  yield* Effect.forEach([...new Set(labels)], (label) =>
    Effect.gen(function* () {
      if (excludedLabels.has(label)) return yield* new Failure({ reason: "invalid_response" })
      const progress: { token?: string; seen: Set<string> } = { seen: new Set() }
      for (const _ of Array.from({ length: 100 })) {
        const page = yield* decode(
          Schema.Struct({
            messages: Schema.optionalKey(Schema.Array(Schema.Struct({ id: Schema.NonEmptyString }))),
            nextPageToken: Schema.optionalKey(Schema.NonEmptyString),
          }),
          yield* rpc({
            method: "GET",
            path: "/gmail/v1/users/me/messages",
            query: {
              maxResults: 100,
              labelIds: label,
              includeSpamTrash: false,
              q: `-in:spam -in:trash -in:drafts -in:sent${unreadOnly ? " is:unread" : ""}`,
              pageToken: progress.token,
            },
          }),
        )
        page.messages?.forEach((message) => found.add(message.id))
        if (found.size > 10_000) return yield* new Failure({ reason: "response_limit" })
        if (!page.nextPageToken) return
        if (progress.seen.has(page.nextPageToken)) return yield* new Failure({ reason: "invalid_response" })
        progress.seen.add(page.nextPageToken)
        progress.token = page.nextPageToken
      }
      return yield* new Failure({ reason: "response_limit" })
    }),
  )
  const messages = yield* Effect.forEach([...found], (id) =>
    Effect.gen(function* () {
      const message = yield* decode(
        GmailMessage,
        yield* rpc({
          method: "GET",
          path: `/gmail/v1/users/me/messages/${encodeURIComponent(id)}`,
          query: { format: "metadata", metadataHeaders: "From" },
        }),
      )
      if (message.id !== id) return yield* new Failure({ reason: "invalid_response" })
      return message
    }),
  )
  return messages.filter(
    (message) =>
      !message.labelIds.some((label) => excludedLabels.has(label)) &&
      labels.some((label) => message.labelIds.includes(label)) &&
      (!unreadOnly || message.labelIds.includes("UNREAD")),
  )
})

/** Follow Graph's opaque cursor only on the original resource and with the original scope intact. */
export const graphPages = Effect.fn("InboxCommunication.graphPages")(function* (rpc: RPC, input: Request) {
  const initial = new URL(`https://graph.microsoft.com${input.path}`)
  Object.entries(input.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) initial.searchParams.set(key, String(value))
  })
  const progress = { url: initial, seen: new Set<string>() }
  const items: Schema.Json[] = []
  for (const _ of Array.from({ length: 100 })) {
    if (progress.seen.has(progress.url.href)) return yield* new Failure({ reason: "invalid_response" })
    progress.seen.add(progress.url.href)
    const page = yield* decode(
      Schema.Struct({ value: Schema.Array(Schema.Json), "@odata.nextLink": Schema.optionalKey(Schema.NonEmptyString) }),
      yield* rpc({ ...input, path: progress.url.pathname + progress.url.search, query: undefined }),
    )
    items.push(...page.value)
    if (items.length > 10_000) return yield* new Failure({ reason: "response_limit" })
    const next = page["@odata.nextLink"]
    if (!next) return items
    if (!URL.canParse(next)) return yield* new Failure({ reason: "invalid_response" })
    const url = new URL(next)
    const path = yield* Effect.try({
      try: () => JSON.stringify(url.pathname.split("/").map(decodeURIComponent)),
      catch: () => new Failure({ reason: "invalid_response" }),
    })
    const originalPath = yield* Effect.try({
      try: () => JSON.stringify(initial.pathname.split("/").map(decodeURIComponent)),
      catch: () => new Failure({ reason: "invalid_response" }),
    })
    if (
      url.origin !== initial.origin ||
      url.username ||
      url.password ||
      url.hash ||
      path !== originalPath ||
      [...url.searchParams.keys()].some(
        (key) =>
          url.searchParams.getAll(key).length !== 1 ||
          (!initial.searchParams.has(key) && !["$skip", "$skiptoken"].includes(key)),
      ) ||
      [...initial.searchParams].some(([key, value]) => url.searchParams.has(key) && url.searchParams.get(key) !== value)
    )
      return yield* new Failure({ reason: "invalid_response" })
    initial.searchParams.forEach((value, key) => url.searchParams.set(key, value))
    progress.url = url
  }
  return yield* new Failure({ reason: "response_limit" })
})

export const communicationChoices = Effect.fn("InboxCommunication.choices")(function* (
  rpc: RPC,
  provider: "gmail" | "outlook" | "teams",
) {
  if (provider === "gmail") {
    const page = yield* decode(
      Schema.Struct({
        labels: Schema.Array(
          Schema.Struct({
            id: Schema.NonEmptyString,
            name: Schema.NonEmptyString,
          }),
        ),
      }),
      yield* rpc({ method: "GET", path: "/gmail/v1/users/me/labels" }),
    )
    if (page.labels.length > 10_000) return yield* new Failure({ reason: "response_limit" })
    return page.labels.filter((label) => !excludedLabels.has(label.id))
  }
  if (provider === "teams") {
    const chats = yield* decode(
      Schema.Array(
        Schema.Struct({
          id: Schema.NonEmptyString,
          topic: Schema.optionalKey(Schema.NullOr(Schema.String)),
          chatType: Schema.String,
        }),
      ),
      yield* graphPages(rpc, { method: "GET", path: "/v1.0/me/chats", query: { $top: 50 } }),
    )
    return chats.map((chat) => ({ id: chat.id, name: chat.topic || `${chat.chatType} · ${chat.id}` }))
  }
  const known = yield* Effect.forEach(["inbox", "deleteditems", "junkemail", "drafts", "sentitems"], (folder) =>
    Effect.gen(function* () {
      return yield* decode(
        Schema.Struct({ id: Schema.NonEmptyString }),
        yield* rpc({ method: "GET", path: `/v1.0/me/mailFolders/${folder}`, query: { $select: "id" } }),
      )
    }),
  )
  const excluded = new Set(known.slice(1).map((folder) => folder.id))
  const folders = new Map<string, { id: string; name: string }>()
  const pending = ["/v1.0/me/mailFolders"]
  const visited = new Set<string>()
  for (const _ of Array.from({ length: 1000 })) {
    const path = pending.shift()
    if (!path) return [...folders.values()]
    if (visited.has(path)) return yield* new Failure({ reason: "invalid_response" })
    visited.add(path)
    const page = yield* decode(
      Schema.Array(
        Schema.Struct({ id: Schema.NonEmptyString, displayName: Schema.NonEmptyString, childFolderCount: Schema.Int }),
      ),
      yield* graphPages(rpc, { method: "GET", path, query: { $top: 100, $select: "id,displayName,childFolderCount" } }),
    )
    page.forEach((folder) => {
      if (excluded.has(folder.id)) return
      folders.set(folder.id, { id: folder.id === known[0]!.id ? "inbox" : folder.id, name: folder.displayName })
      if (folder.childFolderCount > 0)
        pending.push(`/v1.0/me/mailFolders/${encodeURIComponent(folder.id)}/childFolders`)
    })
    if (folders.size > 10_000) return yield* new Failure({ reason: "response_limit" })
  }
  return yield* new Failure({ reason: "response_limit" })
})

export const outlookSnapshot = Effect.fn("InboxCommunication.outlookSnapshot")(function* (
  rpc: RPC,
  folders: readonly string[],
  unreadOnly: boolean,
) {
  const pages = yield* Effect.forEach([...new Set(folders)], (folder) =>
    Effect.gen(function* () {
      const messages = yield* graphPages(rpc, {
        method: "GET",
        path: `/v1.0/me/mailFolders/${encodeURIComponent(folder)}/messages`,
        headers: { Prefer: 'IdType="ImmutableId"' },
        query: {
          $top: 100,
          $select: "id,conversationId,bodyPreview,webLink,from,isDraft,isRead,parentFolderId",
          $filter: `isDraft eq false${unreadOnly ? " and isRead eq false" : ""}`,
        },
      })
      return yield* decode(
        Schema.Array(
          Schema.Struct({
            id: Schema.NonEmptyString,
            conversationId: Schema.String,
            bodyPreview: Schema.String,
            webLink: Schema.String,
            isDraft: Schema.Boolean,
            isRead: Schema.Boolean,
            from: Schema.optionalKey(
              Schema.NullOr(Schema.Struct({ emailAddress: Schema.Struct({ address: Schema.String }) })),
            ),
          }),
        ),
        messages,
      )
    }),
  )
  return [
    ...new Map(
      pages
        .flat()
        .filter((message) => !message.isDraft && (!unreadOnly || !message.isRead))
        .map((message) => [message.id, message]),
    ).values(),
  ]
})

export const teamsSnapshot = Effect.fn("InboxCommunication.teamsSnapshot")(function* (
  rpc: RPC,
  chats: readonly string[],
  since: string,
) {
  const items = yield* Effect.forEach([...new Set(chats)], (chat) =>
    Effect.gen(function* () {
      const messages = yield* decode(
        Schema.Array(
          Schema.Struct({
            id: Schema.NonEmptyString,
            messageType: Schema.String,
            chatId: Schema.optionalKey(Schema.String),
            lastModifiedDateTime: Schema.String,
            deletedDateTime: Schema.optionalKey(Schema.NullOr(Schema.String)),
            body: Schema.Struct({ contentType: Schema.String, content: Schema.String }),
            from: Schema.NullOr(
              Schema.Struct({ user: Schema.optionalKey(Schema.NullOr(Schema.Struct({ id: Schema.NonEmptyString }))) }),
            ),
          }),
        ),
        yield* graphPages(rpc, {
          method: "GET",
          path: `/v1.0/chats/${encodeURIComponent(chat)}/messages`,
          query: {
            $top: 50,
            $orderby: "lastModifiedDateTime desc",
            $filter: `lastModifiedDateTime gt ${since}`,
          },
        }),
      )
      if (
        messages.some(
          (message) =>
            (message.chatId !== undefined && message.chatId !== chat) ||
            !Number.isFinite(Date.parse(message.lastModifiedDateTime)),
        )
      )
        return yield* new Failure({ reason: "invalid_response" })
      return messages.flatMap((message): Pulled[] => {
        if (
          message.messageType !== "message" ||
          message.deletedDateTime ||
          !message.from?.user ||
          Date.parse(message.lastModifiedDateTime) <= Date.parse(since)
        )
          return []
        // Rendered as text by Inbox. No provider HTML, attachment contents or hosted resources are loaded.
        const text =
          message.body.contentType === "html"
            ? message.body.content.replace(/<[^>]*>/g, " ").trim()
            : message.body.content
        if (!text) return []
        return [
          {
            source: "teams",
            externalId: JSON.stringify([chat, message.id]),
            actor: message.from.user.id,
            snippet: text,
            threadId: chat,
            reply: false,
            // Graph also advances lastModifiedDateTime for reactions; only visible message changes reopen attention.
            revision: JSON.stringify([message.from.user.id, text]),
          },
        ]
      })
    }),
  )
  return [...new Map(items.flat().map((item) => [item.externalId, item])).values()]
})
