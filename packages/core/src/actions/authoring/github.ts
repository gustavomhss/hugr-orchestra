import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubCommandCommon } from "../github/commands/common"
import { GitHubNative } from "../github/native"
import { Branch, Write, Review, branch, bytes, decode, error, native } from "./input"
import type { Services } from "./input"
import { blob, current, get, guard, reviewURL, written } from "./remote"
import type { Plan } from "./remote"

const Ref = Schema.Struct({ ref: Schema.NonEmptyString, object: Schema.Struct({ type: Schema.Literal("commit"), sha: GitHubNative.SHA }) })
const Content = Schema.Struct({
  content: Schema.Struct({ path: Schema.NonEmptyString, type: Schema.Literal("file"), sha: GitHubNative.SHA }),
  commit: Schema.Struct({ sha: GitHubNative.SHA }),
})
const Pull = Schema.Struct({
  id: GitHubNative.ID, number: GitHubNative.ID, html_url: Schema.NonEmptyString, title: Schema.NonEmptyString,
  body: Schema.NullOr(Schema.String), state: Schema.Literal("open"),
  head: Schema.Struct({ ref: Schema.NonEmptyString, sha: GitHubNative.SHA, repo: Schema.Struct({ id: GitHubNative.ID }) }),
  base: Schema.Struct({ ref: Schema.NonEmptyString, repo: Schema.Struct({ id: GitHubNative.ID }) }),
})

export const plan = Effect.fn("ActionsAuthoring.github")(function* (
  services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json,
): Effect.fn.Return<Plan, import("../error").ActionsError> {
  const command = yield* guard(binding, () => {
    const value = intent.kind === "source.branch" ? decode(binding, Branch, payload)
      : intent.kind === "source.write" ? decode(binding, Write, payload) : decode(binding, Review, payload)
    if (value.provider !== "github") throw error(binding, "invalid_input", "Source command provider differs from the bound repository")
    if ("text" in value) bytes(value.text)
    return value
  })
  const repo = yield* GitHubCommandCommon.authority(services, binding)
  const ref = yield* head(services, binding, repo.root, intent.target.ref ?? "")
  if (ref.toLowerCase() !== intent.expected?.commit?.toLowerCase())
    return yield* error(binding, "source_conflict", "Source branch moved after admission")
  if (intent.kind !== "source.write" && intent.expected?.sourceVersion !== undefined) yield* current(services, binding, intent)

  if ("branch" in command) {
    if (command.branch !== intent.target.resourceID)
      return yield* error(binding, "invalid_input", "New source branch differs from admission")
    return {
      request: { method: "POST", path: `${repo.root}/git/refs`, body: { ref: `refs/heads/${command.branch}`, sha: ref } }, status: 201,
      acknowledge: (response) => guard(binding, () => {
        const value = decode(binding, Ref, response.data, true)
        if (value.ref !== `refs/heads/${command.branch}` || value.object.sha.toLowerCase() !== ref.toLowerCase())
          throw error(binding, "outcome_unknown", "GitHub did not prove the exact new branch and base commit", "unknown")
        return { acknowledgement: { resourceID: command.branch } }
      }),
    }
  }
  if ("mode" in command) {
    const path = intent.target.path ?? ""
    if (!path.startsWith(".github/workflows/") || path.split("/").length !== 3 || !/\.ya?ml$/i.test(path))
      return yield* error(binding, "source_unresolved", "GitHub workflow writes require a native workflow YAML path")
    if (command.mode === "update" && !intent.expected?.sourceVersion || command.mode === "create" && intent.expected?.sourceVersion !== undefined)
      return yield* error(binding, "invalid_input", "Source create/update mode conflicts with its blob precondition")
    const previous = command.mode === "update" ? yield* current(services, binding, intent) : undefined
    if (previous?.text === command.text)
      return yield* error(binding, "invalid_input", "Source content is unchanged; no write was sent")
    // Contents create has native absence semantics; update supplies the authoritative blob SHA.
    return {
      request: { method: "PUT", path: `${repo.root}/contents/${GitHubNative.path(binding, path)}`, body: {
        message: command.message, content: Buffer.from(bytes(command.text)).toString("base64"), branch: intent.target.ref ?? "",
        ...(previous ? { sha: previous.version } : {}),
      } }, status: command.mode === "create" ? 201 : 200,
      acknowledge: (response) => Effect.gen(function* () {
        const value = yield* guard(binding, () => decode(binding, Content, response.data, true))
        if (value.content.path !== path || value.content.sha.toLowerCase() !== blob(command.text, value.content.sha))
          return yield* error(binding, "outcome_unknown", "GitHub did not prove the written path and blob", "unknown")
        return yield* written(services, binding, intent, command.text, value.commit.sha, value.content.sha)
      }),
    }
  }
  const base = yield* guard(binding, () => branch(binding, intent.target.resourceID ?? repo.native.default_branch ?? ""))
  if (base === intent.target.ref) return yield* error(binding, "invalid_input", "Review head and base must differ")
  yield* head(services, binding, repo.root, base)
  return {
    request: { method: "POST", path: `${repo.root}/pulls`, body: { head: intent.target.ref ?? "", base, title: command.title, body: command.text } }, status: 201,
    acknowledge: (response) => guard(binding, () => {
      const value = decode(binding, Pull, response.data, true)
      if (String(value.head.repo.id) !== binding.projectID || String(value.base.repo.id) !== binding.projectID ||
        value.head.ref !== intent.target.ref || value.head.sha.toLowerCase() !== ref.toLowerCase() || value.base.ref !== base ||
        value.title !== command.title || (value.body ?? "") !== command.text)
        throw error(binding, "outcome_unknown", "GitHub did not prove the exact same-repository review request", "unknown")
      const id = String(value.number)
      return { acknowledgement: { resourceID: id }, output: { kind: "sourceReview" as const, id,
        url: reviewURL(binding, value.html_url, `/${repo.native.full_name}/pull/${id}`) } }
    }),
  }
})

const head = Effect.fn("ActionsAuthoring.githubHead")(function* (services: Services, binding: Actions.Binding, root: string, name: string) {
  yield* guard(binding, () => branch(binding, name))
  const response = yield* get(services, binding, `${root}/git/ref/heads/${name.split("/").map(encodeURIComponent).join("/")}`)
  const value = yield* guard(binding, () => native(binding, Ref, response.data))
  if (value.ref !== `refs/heads/${name}`) return yield* error(binding, "source_conflict", "GitHub branch identity differs from admission")
  return value.object.sha
})
