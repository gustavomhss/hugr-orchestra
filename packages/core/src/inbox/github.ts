import { Effect, Schema } from "effect"
import { decode, Failure, type Request } from "../capability/channel/http"

export const GithubNote = Schema.Struct({
  id: Schema.NonEmptyString,
  reason: Schema.String,
  updated_at: Schema.optionalKey(Schema.String),
  subject: Schema.Struct({
    title: Schema.String,
    type: Schema.String,
    url: Schema.optionalKey(Schema.NullOr(Schema.String)),
    latest_comment_url: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
  repository: Schema.Struct({ full_name: Schema.NonEmptyString }),
})
export type GithubNote = typeof GithubNote.Type
export type GithubRPC = (input: Request) => Effect.Effect<{ body: Schema.Json; link?: string }, Failure>

export const notifications = Effect.fn("InboxGithub.notifications")(function* (rpc: GithubRPC) {
  const found = new Map<string, GithubNote>()
  for (const index of Array.from({ length: 100 }, (_, index) => index + 1)) {
    const response = yield* rpc({
      method: "GET",
      path: "/notifications",
      query: {
        all: false,
        participating: false,
        per_page: 100,
        page: index,
      },
      headers: { "user-agent": "orchestra", "X-GitHub-Api-Version": "2026-03-10" },
    })
    const notes = yield* decode(
      Schema.Array(Schema.Struct({ ...GithubNote.fields, updated_at: Schema.NonEmptyString })),
      response.body,
    )
    notes.forEach((note) => found.set(note.id, note))
    const next = yield* nextPage(response.link, index)
    if (!next) return [...found.values()]
  }
  return yield* new Failure({ reason: "response_limit" })
})

function nextPage(header: string | undefined, current: number) {
  if (!header) return Effect.succeed(false)
  const links = header.split(/,\s*(?=<)/)
  const parsed = links.map((part) => part.match(/^\s*<([^>]+)>\s*;\s*rel="(next|prev|first|last)"\s*$/))
  if (parsed.some((link) => !link)) return Effect.fail(new Failure({ reason: "invalid_response" }))
  const next = parsed.filter((link) => link?.[2] === "next")
  if (!next.length) return Effect.succeed(false)
  if (next.length !== 1 || !URL.canParse(next[0]![1]!)) return Effect.fail(new Failure({ reason: "invalid_response" }))
  const url = new URL(next[0]![1]!)
  const allowed = ["page", "per_page", "all", "participating"]
  const valid =
    url.origin === "https://api.github.com" &&
    url.pathname === "/notifications" &&
    !url.username &&
    !url.password &&
    !url.hash &&
    [...url.searchParams.keys()].every((key) => allowed.includes(key) && url.searchParams.getAll(key).length === 1) &&
    url.searchParams.get("page") === String(current + 1) &&
    (!url.searchParams.has("per_page") || url.searchParams.get("per_page") === "100") &&
    (!url.searchParams.has("all") || url.searchParams.get("all") === "false") &&
    (!url.searchParams.has("participating") || url.searchParams.get("participating") === "false")
  return valid ? Effect.succeed(true) : Effect.fail(new Failure({ reason: "invalid_response" }))
}
