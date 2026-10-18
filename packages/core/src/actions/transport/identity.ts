export * as ActionsIdentity from "./identity"

import { Option, Schema } from "effect"
import { Actions } from "@orchestra/schema/actions"

const nativeID = Schema.Union([
  Schema.String.check(Schema.isPattern(/^0*[1-9]\d*$/)),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
const githubProject = Schema.decodeUnknownOption(Schema.Struct({ id: nativeID, full_name: Schema.NonEmptyString }))
const gitlabProject = Schema.decodeUnknownOption(Schema.Struct({ id: nativeID, path_with_namespace: Schema.NonEmptyString }))
const githubAccount = Schema.decodeUnknownOption(Schema.Struct({ login: Schema.String.check(Schema.isPattern(/^(?=.{1,39}$)[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(?:\[bot\])?$/)) }))
const gitlabAccount = Schema.decodeUnknownOption(Schema.Struct({ username: Schema.String.check(Schema.isPattern(/^(?=.{2,255}$)(?!.*\.\.)(?!.*\.(?:git|atom)$)[a-zA-Z0-9_][a-zA-Z0-9_.-]*[a-zA-Z0-9_-]$/i)) }))

export function project(provider: Actions.Provider, data: unknown) {
  return provider.kind === "github"
    ? githubProject(data).pipe(Option.map((data) => ({ projectID: String(data.id), projectPath: data.full_name })))
    : gitlabProject(data).pipe(Option.map((data) => ({ projectID: String(data.id), projectPath: data.path_with_namespace })))
}

export function account(provider: Actions.Provider, data: unknown) {
  return provider.kind === "github" ? githubAccount(data).pipe(Option.map((data) => data.login))
    : gitlabAccount(data).pipe(Option.map((data) => data.username))
}
