import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { decode, Failure, type RPC } from "../capability/channel/http"

const Issue = Schema.Struct({
  id: Schema.NonEmptyString,
  identifier: Schema.NonEmptyString,
  title: Schema.String,
  url: Schema.String,
  updatedAt: Schema.NonEmptyString,
  state: Schema.Struct({ id: Schema.NonEmptyString, name: Schema.String }),
  priority: Schema.Int,
  dueDate: Schema.NullOr(Schema.String),
})
const Page = Schema.Struct({
  errors: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  data: Schema.Struct({
    viewer: Schema.Struct({ id: Schema.NonEmptyString }),
    issues: Schema.Struct({
      nodes: Schema.Array(Issue),
      pageInfo: Schema.Struct({
        hasNextPage: Schema.Boolean,
        endCursor: Schema.NullOr(Schema.String),
      }),
    }),
  }),
})

export const assignedIssues = Effect.fn("InboxLinear.assignedIssues")(function* (rpc: RPC) {
  const progress: { after?: string; viewer?: string; seen: Set<string> } = { seen: new Set() }
  const issues = new Map<string, typeof Issue.Type>()
  for (const _ of Array.from({ length: 100 })) {
    const raw = yield* rpc({
      method: "POST",
      path: "/graphql",
      body: {
        query: `query InboxAssignedIssues($after: String) {
        viewer { id }
        issues(first: 100, after: $after, filter: { assignee: { isMe: { eq: true } } }) {
          nodes { id identifier title url updatedAt state { id name } priority dueDate }
          pageInfo { hasNextPage endCursor }
        }
      }`,
        variables: { after: progress.after ?? null },
      },
    })
    const page = yield* decode(Page, raw)
    if (page.errors?.length || (progress.viewer && progress.viewer !== page.data.viewer.id))
      return yield* new Failure({ reason: "invalid_response" })
    progress.viewer = page.data.viewer.id
    page.data.issues.nodes.forEach((issue) => issues.set(issue.id, issue))
    if (!page.data.issues.pageInfo.hasNextPage)
      return {
        data: {
          issues: {
            nodes: [...issues.values()].map((issue) => ({
              ...issue,
              revision: createHash("sha256")
                .update(JSON.stringify([issue.title, issue.state.id, issue.priority, issue.dueDate]))
                .digest("hex"),
            })),
          },
        },
      }
    const next = page.data.issues.pageInfo.endCursor
    if (!next || progress.seen.has(next)) return yield* new Failure({ reason: "invalid_response" })
    progress.seen.add(next)
    progress.after = next
  }
  return yield* new Failure({ reason: "response_limit" })
})
