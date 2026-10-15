export * as PullRequest from "./pull-request"

import { Schema } from "effect"
import { optional } from "./schema"

// Pull requests on the repository's GitHub or GitLab remote, read and opened through the host CLI
// (gh or glab) that the user already signed in to on the server.
export const Host = Schema.Literals(["github", "gitlab"]).annotate({ identifier: "PullRequest.Host" })
export type Host = typeof Host.Type

export const Info = Schema.Struct({
  number: Schema.Int,
  title: Schema.String,
  url: Schema.String,
  // The host's own state word: GitHub says "OPEN", GitLab says "opened".
  state: Schema.String,
  author: Schema.NullOr(Schema.String),
}).annotate({ identifier: "PullRequest.Info" })
export interface Info extends Schema.Schema.Type<typeof Info> {}

export const List = Schema.Struct({
  host: Host,
  repository: Schema.String,
  // `count` is the host's total of open pull requests; `items` holds the newest of them, and `truncated`
  // says it holds fewer than `count`.
  count: Schema.Int,
  truncated: Schema.Boolean,
  items: Schema.Array(Info),
}).annotate({ identifier: "PullRequest.List" })
export interface List extends Schema.Schema.Type<typeof List> {}

export const CreateInput = Schema.Struct({
  title: Schema.Trim.pipe(Schema.check(Schema.isNonEmpty())),
  body: Schema.String,
  base: Schema.Trim.pipe(Schema.check(Schema.isNonEmpty())),
  // Defaults to the branch checked out in the repository.
  head: optional(Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()))),
}).annotate({ identifier: "PullRequest.CreateInput" })
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const Created = Schema.Struct({
  host: Host,
  repository: Schema.String,
  number: Schema.Int,
  url: Schema.String,
}).annotate({ identifier: "PullRequest.Created" })
export interface Created extends Schema.Schema.Type<typeof Created> {}

export const ErrorKind = Schema.Literals([
  "not_installed",
  "not_authenticated",
  "no_remote",
  "branch_not_pushed",
  "cli_failed",
]).annotate({ identifier: "PullRequest.ErrorKind" })
export type ErrorKind = typeof ErrorKind.Type
