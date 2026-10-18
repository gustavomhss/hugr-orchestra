export * as ActionsSourceBase from "./base"

import { Actions } from "@orchestra/schema/actions"
import { createHash } from "node:crypto"
import { Effect, Schema } from "effect"
import { ActionsGitLabNative } from "../gitlab/native"
import { GitHubNative } from "../github/native"
import type { ActionsError } from "../error"
import { ActionsAuthoring } from "./index"
import { branch, bytes, decode, error, native } from "./input"
import type { Services } from "./input"
import { get, guard } from "./remote"

const GitHubRef = Schema.Struct({ ref: Schema.NonEmptyString,
  object: Schema.Struct({ type: Schema.Literal("commit"), sha: GitHubNative.SHA }) })
const GitLabRef = Schema.Struct({ name: Schema.NonEmptyString, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }) })

export const read = Effect.fn("ActionsSourceBase.read")(function* (
  services: Services, binding: Actions.Binding, ref?: string,
): Effect.fn.Return<Actions.SourceBase, ActionsError> {
  const frozen = yield* guard(binding, () => {
    decode(binding, Schema.toType(Actions.Binding), binding)
    if (ref !== undefined) branch(binding, ref)
    return { binding: { ...binding, provider: { ...binding.provider } }, ref }
  })
  if (frozen.binding.provider.kind === "github") {
    const repository = yield* GitHubNative.repository(services.transport, frozen.binding)
    const selected = frozen.ref ?? repository.native.default_branch
    if (!selected) return yield* error(frozen.binding, "source_unresolved", "GitHub repository has no observed default branch")
    const name = yield* guard(frozen.binding, () => branch(frozen.binding, selected))
    const response = yield* GitHubNative.get(services.transport, frozen.binding,
      { method: "GET", path: `${repository.path}/git/ref/heads/${name.split("/").map(encodeURIComponent).join("/")}` })
    const value = yield* guard(frozen.binding, () => native(frozen.binding, GitHubRef, response.data))
    if (value.ref !== `refs/heads/${name}`) return yield* error(frozen.binding, "source_conflict", "GitHub branch identity differs from the requested branch")
    return { bindingID: frozen.binding.id, ref: name, commit: value.object.sha }
  }
  const project = yield* ActionsGitLabNative.make(services.transport).project(frozen.binding)
  const selected = frozen.ref ?? project.default_branch
  if (!selected) return yield* error(frozen.binding, "source_unresolved", "GitLab project has no observed default branch")
  const name = yield* guard(frozen.binding, () => branch(frozen.binding, selected))
  const root = yield* guard(frozen.binding, () => ActionsGitLabNative.projectPath(frozen.binding))
  const response = yield* get(services, frozen.binding, `${root}/repository/branches/${encodeURIComponent(name)}`)
  const value = yield* guard(frozen.binding, () => native(frozen.binding, GitLabRef, response.data))
  if (value.name !== name) return yield* error(frozen.binding, "source_conflict", "GitLab branch identity differs from the requested branch")
  return { bindingID: frozen.binding.id, ref: name, commit: value.commit.id }
})

export const validate = Effect.fn("ActionsSourceBase.validate")(function* (
  services: Services, binding: Actions.Binding, base: Actions.SourceBase, path: string, draft: string,
): Effect.fn.Return<Actions.Graph, ActionsError> {
  const frozen = yield* guard(binding, () => {
    decode(binding, Schema.toType(Actions.Binding), binding)
    const admitted = decode(binding, Schema.toType(Actions.SourceBase), base)
    if (admitted.bindingID !== binding.id) throw error(binding, "source_unresolved", "Source base belongs to another binding")
    branch(binding, admitted.ref)
    const draftBytes = bytes(draft)
    GitHubNative.path(binding, path)
    if (binding.provider.kind === "github" && (!path.startsWith(".github/workflows/") || path.split("/").length !== 3 || !/\.ya?ml$/i.test(path)))
      throw error(binding, "invalid_input", "GitHub draft path must be a workflow YAML file")
    if (binding.provider.kind === "gitlab" && !ActionsGitLabNative.localPath(path))
      throw error(binding, "invalid_input", "GitLab draft path must be a local repository path")
    // A draft digest identifies local text, never a native optimistic mutation version.
    const source: Actions.Source = { bindingID: admitted.bindingID, path, ref: admitted.ref, commit: admitted.commit,
      version: `draft:sha256:${createHash("sha256").update(draftBytes).digest("hex")}`, text: draft, editable: false }
    decode(binding, Schema.toType(Actions.Source), source)
    return { binding: { ...binding, provider: { ...binding.provider } }, base: { ...admitted }, source }
  })
  const current = yield* read(services, frozen.binding, frozen.base.ref)
  if (current.commit.toLowerCase() !== frozen.base.commit.toLowerCase())
    return yield* error(frozen.binding, "source_conflict", "Source branch moved after base admission")
  return yield* ActionsAuthoring.make(services).validate(frozen.binding, frozen.source)
})
