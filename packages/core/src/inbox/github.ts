import { Effect, Option, Schema } from "effect"
import { decode, Failure, request, type Options, type Request } from "../capability/channel/http"
import type { Pulled } from "./types"

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

const transport = { timeoutMs: 10_000, maxResponseBytes: 256 * 1024 }
export const githubHost = "https://api.github.com"
const githubAgent = { "user-agent": "orchestra" }
const pullPattern = /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/
const suitePattern = /^\/repos\/[^/]+\/[^/]+\/check-suites\/\d+$/
const commitPattern = /^\/repos\/[^/]+\/[^/]+\/commits\/[0-9a-f]{7,64}$/i
export type CiKind = "pull" | "suite" | "commit"
export type CiTarget = { id: string; path: string; kind: CiKind }
export type CiEvidence = {
  pulls: Readonly<Record<string, unknown>>
  suites: Readonly<Record<string, unknown>>
  commits: Readonly<Record<string, unknown>>
}

export function ciItem(item: GithubNote, login: string, ownCi: ReadonlyMap<string, string>): Pulled[] {
  const thread = login ? pullApi(ownCi.get(item.id)) : undefined
  if (!thread || !item.subject.title) return []
  return [
    {
      source: "github",
      externalId: item.id,
      actor: item.repository.full_name,
      ...(item.updated_at ? { revision: `${item.updated_at}:${item.reason}` } : {}),
      snippet: item.subject.title,
      threadId: thread,
      reply: true,
      deepLink: thread.replace("api.github.com/repos", "github.com").replace("/pulls/", "/pull/"),
    },
  ]
}

export function ciCandidates(raw: unknown): CiTarget[] {
  const page = Schema.decodeUnknownOption(Schema.Array(GithubNote))(raw)
  if (Option.isNone(page)) return []
  return page.value.flatMap(ciTarget)
}

export function ciTarget(item: GithubNote): CiTarget[] {
  if (item.reason !== "ci_activity") return []
  const path = apiPath(item.subject.url) ?? apiPath(item.subject.latest_comment_url)
  if (!path) return []
  if (pullPattern.test(path)) return [{ id: item.id, path, kind: "pull" }]
  if (suitePattern.test(path)) return [{ id: item.id, path, kind: "suite" }]
  if (commitPattern.test(path)) return [{ id: item.id, path, kind: "commit" }]
  return []
}

export function ownPull(raw: unknown, login: string) {
  if (!login) return
  const pull = Schema.decodeUnknownOption(
    Schema.Struct({
      url: Schema.optional(Schema.String),
      user: Schema.optional(Schema.Struct({ login: Schema.optional(Schema.String) })),
    }),
  )(raw)
  if (Option.isNone(pull) || pull.value.user?.login !== login) return
  return pullApi(pull.value.url)
}

export function suitePulls(raw: unknown) {
  const suite = Schema.decodeUnknownOption(
    Schema.Struct({
      pull_requests: Schema.optional(Schema.Array(Schema.Struct({ url: Schema.optional(Schema.String) }))),
    }),
  )(raw)
  if (Option.isNone(suite)) return []
  return (suite.value.pull_requests ?? []).flatMap((item) => {
    const path = pullPath(item.url)
    return path ? [path] : []
  })
}

export function listedPulls(raw: unknown) {
  const page = Schema.decodeUnknownOption(Schema.Array(Schema.Struct({ url: Schema.optional(Schema.String) })))(raw)
  if (Option.isNone(page)) return []
  return page.value.flatMap((item) => {
    const path = pullPath(item.url)
    return path ? [path] : []
  })
}

export function ownedUrl(item: CiTarget, login: string, evidence: CiEvidence) {
  const related = relatedPulls(item, evidence)
  if (related.length === 0) return
  const owned = related.flatMap((path) => {
    const url = ownPull(evidence.pulls[path], login)
    return url === `${githubHost}${path}` ? [url] : []
  })
  if (owned.length !== related.length) return
  return owned[0]
}

export function relatedPulls(item: CiTarget, evidence: CiEvidence) {
  if (item.kind === "pull") return [item.path]
  if (item.kind === "suite") return suitePulls(evidence.suites[item.path])
  return listedPulls(evidence.commits[item.path])
}

export function loadCi(targets: readonly CiTarget[], token: string, options: Options) {
  return Effect.gen(function* () {
    const pulls: Record<string, unknown> = {}
    const suites: Record<string, unknown> = {}
    const commits: Record<string, unknown> = {}
    yield* Effect.forEach(targets, (item) =>
      Effect.gen(function* () {
        if (item.kind === "pull") {
          const body = yield* githubGet(item.path, token, options)
          if (body) pulls[item.path] = body
          return
        }
        if (item.kind === "suite") {
          const body = yield* githubGet(item.path, token, options)
          if (body) suites[item.path] = body
          yield* rememberPulls(body ? suitePulls(body) : [], pulls, token, options)
          return
        }
        const body = yield* githubGet(`${item.path}/pulls`, token, options)
        if (body) commits[item.path] = body
        yield* rememberPulls(body ? listedPulls(body) : [], pulls, token, options)
      }),
    )
    return { pulls, suites, commits }
  })
}

export function rememberPulls(paths: readonly string[], pulls: Record<string, unknown>, token: string, options: Options) {
  return Effect.forEach(paths, (path) =>
    Effect.gen(function* () {
      if (pulls[path]) return
      const body = yield* githubGet(path, token, options)
      if (body) pulls[path] = body
    }),
  )
}

export function apiPath(url: string | null | undefined) {
  if (!url || !URL.canParse(url)) return
  const parsed = new URL(url)
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "api.github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    return
  if (!parsed.pathname.startsWith("/repos/")) return
  return parsed.pathname
}

export function pullPath(url: string | null | undefined) {
  const path = apiPath(url)
  if (!path || !pullPattern.test(path)) return
  return path
}

export function pullApi(url: string | null | undefined) {
  const path = pullPath(url)
  return path ? `${githubHost}${path}` : undefined
}

export function githubGet(path: string, token: string, options: Options = transport) {
  return request(githubHost, `Bearer ${token}`, { method: "GET", path, headers: githubAgent }, options)
}

export function githubPost(path: string, token: string, body: Schema.Json) {
  return request(githubHost, `Bearer ${token}`, { method: "POST", path, body, headers: githubAgent }, transport)
}
