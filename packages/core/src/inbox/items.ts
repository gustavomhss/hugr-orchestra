import { Option, Schema } from "effect"
import type { Pulled } from "./types"

export function mailItems(account: "gmail" | "outlook", raw: unknown): Pulled[] {
  if (account === "gmail") {
    const page = Schema.decodeUnknownOption(
      Schema.Struct({
        messages: Schema.optional(
          Schema.Array(
            Schema.Struct({
              id: Schema.String,
              threadId: Schema.String,
              snippet: Schema.optional(Schema.String),
              payload: Schema.optional(
                Schema.Struct({
                  headers: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String }))),
                }),
              ),
            }),
          ),
        ),
      }),
    )(raw)
    if (Option.isNone(page)) return []
    return (page.value.messages ?? []).flatMap((item) => {
      const from = item.payload?.headers?.find((header) => header.name.toLowerCase() === "from")?.value
      if (!from || !item.snippet) return []
      return [
        {
          source: "mail" as const,
          externalId: item.id,
          actor: from,
          snippet: item.snippet,
          threadId: item.threadId,
          reply: true,
        },
      ]
    })
  }
  const page = Schema.decodeUnknownOption(
    Schema.Struct({
      value: Schema.optional(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            conversationId: Schema.optional(Schema.String),
            bodyPreview: Schema.optional(Schema.String),
            webLink: Schema.optional(Schema.String),
            from: Schema.optional(
              Schema.Struct({
                emailAddress: Schema.optional(Schema.Struct({ address: Schema.optional(Schema.String) })),
              }),
            ),
          }),
        ),
      ),
    }),
  )(raw)
  if (Option.isNone(page)) return []
  return (page.value.value ?? []).flatMap((item) => {
    const actor = item.from?.emailAddress?.address
    if (!actor || !item.bodyPreview) return []
    return [
      {
        source: "mail" as const,
        externalId: item.id,
        actor,
        snippet: item.bodyPreview,
        threadId: item.conversationId ?? item.id,
        reply: true,
        ...(item.webLink ? { deepLink: item.webLink } : {}),
      },
    ]
  })
}

export function teamsItems(raw: unknown): Pulled[] {
  const page = Schema.decodeUnknownOption(
    Schema.Struct({
      value: Schema.optional(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            messageType: Schema.optional(Schema.String),
            chatId: Schema.optional(Schema.String),
            body: Schema.optional(Schema.Struct({ content: Schema.optional(Schema.String) })),
            from: Schema.optional(
              Schema.Struct({ user: Schema.optional(Schema.Struct({ id: Schema.optional(Schema.String) })) }),
            ),
          }),
        ),
      ),
    }),
  )(raw)
  if (Option.isNone(page)) return []
  return (page.value.value ?? []).flatMap((item) => {
    if (item.messageType && item.messageType !== "message") return []
    const actor = item.from?.user?.id
    const text = item.body?.content
    if (!actor || !text || !item.chatId) return []
    return [{ source: "teams" as const, externalId: item.id, actor, snippet: text, threadId: item.chatId, reply: true }]
  })
}

export function workItems(source: "linear" | "jira", raw: unknown): Pulled[] {
  if (source === "linear") {
    const page = Schema.decodeUnknownOption(
      Schema.Struct({
        data: Schema.optional(
          Schema.Struct({
            issues: Schema.optional(
              Schema.Struct({
                nodes: Schema.optional(
                  Schema.Array(
                    Schema.Struct({
                      id: Schema.String,
                      identifier: Schema.String,
                      title: Schema.String,
                      url: Schema.optional(Schema.String),
                      revision: Schema.optional(Schema.String),
                      state: Schema.optional(Schema.Struct({ name: Schema.String })),
                    }),
                  ),
                ),
              }),
            ),
          }),
        ),
      }),
    )(raw)
    if (Option.isNone(page)) return []
    return (page.value.data?.issues?.nodes ?? []).map((item) => ({
      source: "linear" as const,
      externalId: item.id,
      actor: item.identifier,
      snippet: item.state ? `${item.title}\n${item.state.name}` : item.title,
      ...(item.revision ? { revision: item.revision } : {}),
      threadId: item.id,
      reply: true,
      ...(item.url ? { deepLink: item.url } : {}),
    }))
  }
  const page = Schema.decodeUnknownOption(
    Schema.Struct({
      issues: Schema.optional(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            key: Schema.String,
            fields: Schema.optional(Schema.Struct({ summary: Schema.optional(Schema.String) })),
          }),
        ),
      ),
    }),
  )(raw)
  if (Option.isNone(page)) return []
  return (page.value.issues ?? []).flatMap((item) => {
    if (!item.fields?.summary) return []
    return [
      {
        source: "jira" as const,
        externalId: item.id,
        actor: item.key,
        snippet: item.fields.summary,
        threadId: item.key,
        reply: true,
      },
    ]
  })
}
