import { Effect, Schema } from "effect"
import { decode, Failure, type RPC } from "../capability/channel/http"

const Issue = Schema.Struct({
  id: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
  fields: Schema.Struct({ summary: Schema.String }),
})
const Page = Schema.Struct({
  issues: Schema.Array(Issue).check(Schema.isMaxLength(50)),
  isLast: Schema.Boolean,
  nextPageToken: Schema.optionalKey(Schema.NonEmptyString),
})

export const search = Effect.fn("InboxJira.search")(function* (rpc: RPC) {
  const state: { cursor?: string; issues: (typeof Issue.Type)[] } = { issues: [] }
  const seen = new Set<string>()
  // Bound a refresh, but never pass a truncated acquisition off as a complete result.
  for (let index = 0; index < 100; index++) {
    const page = yield* rpc({
      method: "GET",
      path: "/rest/api/3/search/jql",
      query: {
        jql: "assignee = currentUser() ORDER BY updated DESC",
        maxResults: 50,
        fields: "summary",
        ...(state.cursor ? { nextPageToken: state.cursor } : {}),
      },
    }).pipe(Effect.flatMap((raw) => decode(Page, raw)))
    state.issues.push(...page.issues)
    if (page.isLast) {
      if (page.nextPageToken) return yield* new Failure({ reason: "invalid_response" })
      return { issues: state.issues }
    }
    const next = page.nextPageToken
    if (!next || seen.has(next)) return yield* new Failure({ reason: "invalid_response" })
    seen.add(next)
    state.cursor = next
  }
  return yield* new Failure({ reason: "response_limit" })
})
