export * as PullRequest from "./pull-request"

import { Context, Effect, Layer, Option, Predicate, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { PullRequest } from "@opencode-ai/schema/pull-request"
import { makeLocationNode } from "./effect/app-node"
import { Location } from "./location"
import { AppProcess } from "./process"
import { Repository } from "./repository"
import { which } from "./util/which"

export const Host = PullRequest.Host
export type Host = typeof Host.Type
export const List = PullRequest.List
export type List = typeof List.Type
export const CreateInput = PullRequest.CreateInput
export type CreateInput = typeof CreateInput.Type
export const Created = PullRequest.Created
export type Created = typeof Created.Type

export class HostError extends Schema.TaggedErrorClass<HostError>()("PullRequest.HostError", {
  kind: PullRequest.ErrorKind,
  message: Schema.String,
  host: Schema.optional(Host),
  branch: Schema.optional(Schema.String),
  remote: Schema.optional(Schema.String),
}) {}

export interface Interface {
  readonly list: () => Effect.Effect<List, HostError>
  readonly create: (input: CreateInput) => Effect.Effect<Created, HostError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/PullRequest") {}

// Remotes match by exact host name, so a repository's remote URL can never point the CLI's sign-in at
// another server. Self-hosted GitHub Enterprise and GitLab instances are not matched.
const HOSTS: Record<string, { host: Host; hostname: string }> = {
  "github.com": { host: "github", hostname: "github.com" },
  "ssh.github.com": { host: "github", hostname: "github.com" },
  "gitlab.com": { host: "gitlab", hostname: "gitlab.com" },
  "altssh.gitlab.com": { host: "gitlab", hostname: "gitlab.com" },
}
const CLI = { github: "gh", gitlab: "glab" } as const
const PAGE = 100
const LIST_SECONDS = 30
const CREATE_SECONDS = 60
// The CLIs bring their own sign-in. These only stop prompts, color and update checks.
const CLI_ENV = { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1", GLAB_CHECK_UPDATE: "false" }

// GraphQL returns the exact open total and only the fields shown, where REST pages carry every body.
const GITHUB_QUERY =
  "query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { pullRequests(states: OPEN, first: " +
  PAGE +
  ", orderBy: {field: CREATED_AT, direction: DESC}) { totalCount nodes { number title url state author { login } } } } }"
const GITLAB_QUERY =
  "query($path: ID!) { project(fullPath: $path) { mergeRequests(state: opened, first: " +
  PAGE +
  ", sort: CREATED_DESC) { count nodes { iid title webUrl state author { username } } } } }"
const decodeGitHubList = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      data: Schema.Struct({
        repository: Schema.Struct({
          pullRequests: Schema.Struct({
            totalCount: Schema.Int,
            nodes: Schema.Array(
              Schema.Struct({
                number: Schema.Int,
                title: Schema.String,
                url: Schema.String,
                state: Schema.String,
                author: Schema.NullOr(Schema.Struct({ login: Schema.String })),
              }),
            ),
          }),
        }),
      }),
    }),
  ),
)
const decodeGitLabList = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      data: Schema.Struct({
        project: Schema.Struct({
          mergeRequests: Schema.Struct({
            count: Schema.Int,
            nodes: Schema.Array(
              Schema.Struct({
                // GitLab's GraphQL sends the merge request number as a string.
                iid: Schema.NumberFromString.pipe(Schema.decodeTo(Schema.Int)),
                title: Schema.String,
                webUrl: Schema.String,
                state: Schema.String,
                author: Schema.NullOr(Schema.Struct({ username: Schema.String })),
              }),
            ),
          }),
        }),
      }),
    }),
  ),
)
// A created pull request needs only its number and address.
const decodeGitHubCreated = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ number: Schema.Int, html_url: Schema.String })),
)
const decodeGitLabCreated = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ iid: Schema.Int, web_url: Schema.String })),
)
const decodeApiError = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      message: Schema.optional(Schema.Unknown),
      error: Schema.optional(Schema.Unknown),
      errors: Schema.optional(Schema.Unknown),
    }),
  ),
)

type Target = { name: string; host: Host; hostname: string; path: string; segments: string[]; executable: string }

// Every call is an argument array without a shell. Titles, bodies and branch names reach the host CLI
// only as JSON on stdin; git sees branch names only behind a refs/ prefix, so none can read as an option.
export const make = Effect.fn("PullRequest.make")(function* (input: { directory: string; env?: NodeJS.ProcessEnv }) {
  const proc = yield* AppProcess.Service

  const git = (args: string[]) =>
    proc
      .run(
        ChildProcess.make("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
          cwd: input.directory,
          extendEnv: true,
          stdin: "ignore",
        }),
        { maxOutputBytes: 64 * 1024, maxErrorBytes: 4 * 1024, timeout: "10 seconds" },
      )
      .pipe(
        Effect.map((result) => ({
          ok: result.exitCode === 0 && !result.stdoutTruncated,
          text: result.stdout.toString("utf8").trim(),
        })),
        Effect.catch(() => Effect.succeed({ ok: false, text: "" })),
      )

  const target = Effect.fn("PullRequest.target")(function* () {
    const listed = yield* git(["remote", "-v"])
    const remotes = listed.text.split(/\r?\n/).flatMap((line) => {
      const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line.trim())
      const repository = match ? hostRepository(match[2]!) : undefined
      return match && repository ? [{ name: match[1]!, ...repository }] : []
    })
    const chosen = remotes.find((remote) => remote.name === "origin") ?? remotes[0]
    if (!chosen)
      return yield* new HostError({
        kind: "no_remote",
        message: listed.ok
          ? "This repository has no github.com or gitlab.com remote"
          : "This directory is not a git repository",
      })
    const executable = which(CLI[chosen.host], input.env ?? process.env)
    if (!executable)
      return yield* new HostError({
        kind: "not_installed",
        host: chosen.host,
        remote: chosen.name,
        message: `${CLI[chosen.host]} is not installed on this server`,
      })
    return { ...chosen, executable } satisfies Target
  })

  const cli = Effect.fn("PullRequest.cli")(function* (
    remote: Target,
    args: string[],
    options: { seconds: number; stdin?: string },
  ) {
    const name = CLI[remote.host]
    const result = yield* proc
      .run(
        ChildProcess.make(remote.executable, args, {
          cwd: input.directory,
          env: CLI_ENV,
          extendEnv: true,
          stdin: "ignore",
        }),
        {
          maxOutputBytes: 1024 * 1024,
          maxErrorBytes: 16 * 1024,
          timeout: `${options.seconds} seconds`,
          stdin: options.stdin,
        },
      )
      .pipe(
        Effect.mapError(
          (error) =>
            new HostError({
              kind: "cli_failed",
              host: remote.host,
              remote: remote.name,
              message:
                error.cause instanceof Error && error.cause.message === "Timed out"
                  ? `${name} did not answer within ${options.seconds} seconds`
                  : `${name} could not run: ${error.cause instanceof Error ? error.cause.message : error.message}`,
            }),
        ),
      )
    if (result.exitCode !== 0) return yield* failure(remote, result)
    if (result.stdoutTruncated)
      return yield* new HostError({
        kind: "cli_failed",
        host: remote.host,
        remote: remote.name,
        message: `${name} returned more output than Orchestra reads`,
      })
    return result.stdout.toString("utf8")
  })

  const pushed = Effect.fn("PullRequest.pushed")(function* (remote: Target, head: string) {
    const fail = (message: string) =>
      new HostError({ kind: "branch_not_pushed", host: remote.host, remote: remote.name, branch: head, message })
    if (!head) return yield* fail("HEAD is not on a branch")
    const tracking = `refs/remotes/${remote.name}/${head}`
    if (!(yield* git(["rev-parse", "--verify", "--quiet", `${tracking}^{commit}`])).ok)
      return yield* fail(`${head} is not pushed to ${remote.name}`)
    // A branch that exists only on the remote has nothing local left to push.
    const ahead = yield* git(["rev-list", "--count", `${tracking}..refs/heads/${head}`, "--"])
    if (ahead.ok && Number(ahead.text) > 0)
      return yield* fail(`${head} has commits that are not pushed to ${remote.name}`)
  })

  const list = Effect.fn("PullRequest.list")(function* () {
    const remote = yield* target()
    const text = yield* cli(
      remote,
      remote.host === "github"
        ? [
            "api",
            "graphql",
            "--hostname",
            remote.hostname,
            "-f",
            `query=${GITHUB_QUERY}`,
            "-f",
            `owner=${remote.segments[0]}`,
            "-f",
            `name=${remote.segments[1]}`,
          ]
        : ["api", "graphql", "--hostname", remote.hostname, "-f", `query=${GITLAB_QUERY}`, "-f", `path=${remote.path}`],
      { seconds: LIST_SECONDS },
    )
    const open = Option.getOrUndefined(
      remote.host === "github"
        ? decodeGitHubList(text).pipe(
            Option.map((body) => ({
              count: body.data.repository.pullRequests.totalCount,
              items: body.data.repository.pullRequests.nodes.map((node) => ({
                number: node.number,
                title: node.title,
                url: node.url,
                state: node.state,
                author: node.author?.login ?? null,
              })),
            })),
          )
        : decodeGitLabList(text).pipe(
            Option.map((body) => ({
              count: body.data.project.mergeRequests.count,
              items: body.data.project.mergeRequests.nodes.map((node) => ({
                number: node.iid,
                title: node.title,
                url: node.webUrl,
                state: node.state,
                author: node.author?.username ?? null,
              })),
            })),
          ),
    )
    if (!open) return yield* unreadable(remote, "a pull request list")
    return {
      host: remote.host,
      repository: remote.path,
      count: open.count,
      truncated: open.items.length < open.count,
      items: open.items,
    }
  })

  const create = Effect.fn("PullRequest.create")(function* (request: CreateInput) {
    const remote = yield* target()
    const head = request.head ?? (yield* git(["symbolic-ref", "--quiet", "--short", "HEAD"])).text
    yield* pushed(remote, head)
    const text = yield* cli(
      remote,
      [
        "api",
        "--hostname",
        remote.hostname,
        "--method",
        "POST",
        remote.host === "github"
          ? `repos/${remote.path}/pulls`
          : `projects/${encodeURIComponent(remote.path)}/merge_requests`,
        "--header",
        "Content-Type: application/json",
        "--input",
        "-",
      ],
      {
        seconds: CREATE_SECONDS,
        stdin: JSON.stringify(
          remote.host === "github"
            ? { title: request.title, body: request.body, head, base: request.base }
            : {
                title: request.title,
                description: request.body,
                source_branch: head,
                target_branch: request.base,
              },
        ),
      },
    )
    const created = Option.getOrUndefined(
      remote.host === "github"
        ? decodeGitHubCreated(text).pipe(Option.map((pull) => ({ number: pull.number, url: pull.html_url })))
        : decodeGitLabCreated(text).pipe(Option.map((merge) => ({ number: merge.iid, url: merge.web_url }))),
    )
    // Success is only ever the address the host returned.
    if (!created || !/^https:\/\/\S+$/.test(created.url)) return yield* unreadable(remote, "the pull request's address")
    return { host: remote.host, repository: remote.path, number: created.number, url: created.url }
  })

  return Service.of({ list, create })
})

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    return yield* make({ directory: location.directory })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Location.node, AppProcess.node] })

function hostRepository(url: string) {
  const reference = Repository.parse(url)
  const known = reference && HOSTS[reference.host.split(":")[0]!]
  if (!reference || !known) return
  // GitHub repositories are always owner/name; GitLab nests groups.
  if (known.host === "github" && reference.segments.length !== 2) return
  return { ...known, path: reference.path, segments: reference.segments }
}

function failure(remote: Target, result: AppProcess.RunResult) {
  const name = CLI[remote.host]
  const stderr = result.stderr.toString("utf8").trim()
  const detail =
    apiMessage(result.stdout.toString("utf8")) ??
    stderr.split(/\r?\n/).find((line) => line.trim()) ??
    `exit code ${result.exitCode}`
  // gh exits with 4 when it has no sign-in; a rejected one is an HTTP 401 or, from GitLab GraphQL, an invalid token.
  const signedOut =
    (remote.host === "github" && result.exitCode === 4) ||
    /auth login|not logged in|not authenticated|HTTP 401|401 Unauthorized|Bad credentials|Invalid token/i.test(stderr)
  return new HostError({
    kind: signedOut ? "not_authenticated" : "cli_failed",
    host: remote.host,
    remote: remote.name,
    message: `${signedOut ? `${name} is not signed in on this server` : `${name} failed`}: ${detail.slice(0, 300)}`,
  })
}

function unreadable(remote: Target, what: string) {
  return new HostError({
    kind: "cli_failed",
    host: remote.host,
    remote: remote.name,
    message: `${CLI[remote.host]} did not return ${what}`,
  })
}

// GitHub puts details in `errors`; GitLab sends a string, a list or a map of fields.
function apiMessage(text: string) {
  const body = Option.getOrUndefined(decodeApiError(text.trim()))
  if (!body) return
  const summary = [...words(body.message), ...words(body.error)].join("; ")
  const details = words(body.errors).join("; ")
  return [summary, details].filter(Boolean).join(": ") || undefined
}

function words(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(words)
  if (!Predicate.isObject(value)) return []
  if ("message" in value) return words(value.message)
  if (typeof value.field === "string" && typeof value.code === "string") return [`${value.field} ${value.code}`]
  return Object.entries(value).flatMap(([key, item]) => words(item).map((text) => `${key} ${text}`))
}
