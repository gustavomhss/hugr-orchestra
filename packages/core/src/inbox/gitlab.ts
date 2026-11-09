import { Effect, Schema } from "effect"
import { decode, Failure, type Request } from "../capability/channel/http"
import type { Pulled } from "./types"

const Todo = Schema.Struct({
  id: Schema.Int,
  state: Schema.String,
  action_name: Schema.String,
  body: Schema.String,
  updated_at: Schema.NonEmptyString,
  author: Schema.Struct({ username: Schema.String }),
  project: Schema.Struct({ id: Schema.Int }),
  target_url: Schema.String,
})
type RPC = (input: Request) => Effect.Effect<{ body: Schema.Json; link?: string }, Failure>

export const gitlabTodos = Effect.fn("InboxGitlab.todos")(function* (
  rpc: RPC,
  origin: string,
  projects: readonly string[],
) {
  yield* decode(
    Schema.Struct({ id: Schema.Int }),
    yield* rpc({ method: "GET", path: "/api/v4/user" }).pipe(Effect.map((response) => response.body)),
  )
  const found = new Map<string, Pulled>()
  for (const index of Array.from({ length: 100 }, (_, index) => index + 1)) {
    const response = yield* rpc({
      method: "GET",
      path: "/api/v4/todos",
      query: { state: "pending", per_page: 100, page: index },
    })
    const raw = yield* decode(Schema.Array(Schema.Json), response.body)
    const todos = yield* Effect.forEach(raw, (item) =>
      Effect.gen(function* () {
        const action = yield* decode(Schema.Struct({ action_name: Schema.String }), item)
        if (
          ![
            "assigned",
            "mentioned",
            "directly_addressed",
            "review_requested",
            "approval_required",
            "added_approver",
          ].includes(action.action_name)
        )
          return
        return yield* decode(Todo, item)
      }),
    )
    todos
      .filter((todo) => todo !== undefined)
      .filter((todo) => todo.state === "pending" && (!projects.length || projects.includes(String(todo.project.id))))
      .forEach((todo) => {
        const url = URL.canParse(todo.target_url) ? new URL(todo.target_url) : undefined
        const safe = url && url.origin === origin && !url.username && !url.password
        found.set(String(todo.id), {
          source: "gitlab",
          externalId: String(todo.id),
          actor: todo.author.username,
          snippet: todo.body,
          threadId: `gitlab-todo:${todo.id}`,
          reply: false,
          revision: `${todo.updated_at}:${todo.action_name}`,
          ...(safe ? { deepLink: url.href } : {}),
        })
      })
    if (!response.link) return [...found.values()]
    const links = response.link
      .split(/,\s*(?=<)/)
      .map((part) => part.match(/^\s*<([^>]+)>\s*;\s*rel="(next|prev|first|last)"\s*$/))
    if (links.some((link) => !link)) return yield* new Failure({ reason: "invalid_response" })
    const next = links.filter((link) => link?.[2] === "next")
    if (!next.length) return [...found.values()]
    if (next.length !== 1 || !URL.canParse(next[0]![1]!)) return yield* new Failure({ reason: "invalid_response" })
    const url = new URL(next[0]![1]!)
    if (
      url.origin !== origin ||
      url.pathname !== "/api/v4/todos" ||
      url.username ||
      url.password ||
      url.hash ||
      url.searchParams.get("page") !== String(index + 1) ||
      [...url.searchParams.keys()].some(
        (key) => !["page", "per_page", "state"].includes(key) || url.searchParams.getAll(key).length !== 1,
      ) ||
      (url.searchParams.has("per_page") && url.searchParams.get("per_page") !== "100") ||
      (url.searchParams.has("state") && url.searchParams.get("state") !== "pending")
    )
      return yield* new Failure({ reason: "invalid_response" })
  }
  return yield* new Failure({ reason: "response_limit" })
})
