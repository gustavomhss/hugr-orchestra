export * as ActionsRunners from "./runners"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "../github/native"
import { ActionsGitLabNative } from "../gitlab/native"
import { GitLabCommandNative } from "../gitlab/commands/native"
import { ActionsResourceNative } from "./native"
import { ActionsResourceGraphQL } from "./gitlab-graphql"

const Platform = Schema.Literals(["Linux x64", "Linux ARM64", "macOS ARM64", "macOS x64", "Windows x64"])
const Config = Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString,
  labels: Schema.Union([Schema.NonEmptyString, Schema.Array(Schema.NonEmptyString)]), platform: Platform,
  runnerGroupID: Schema.optionalKey(GitHubNative.Positive) })
const Token = Schema.Struct({ provider: Schema.Literal("github"), enrollment: Schema.Literal("token") })
const GitHubLabel = Schema.Struct({ name: Schema.NonEmptyString, type: Schema.Literals(["read-only", "custom"]) })
const GitHubRunner = Schema.Struct({ id: GitHubNative.ID, name: Schema.NonEmptyString, os: Schema.String,
  status: Schema.NonEmptyString, busy: Schema.Boolean, labels: Schema.Array(GitHubLabel) })
const GitHubList = Schema.Struct({ total_count: GitHubNative.Count, runners: Schema.Array(GitHubRunner) })
const GitLabRunner = Schema.Struct({ id: ActionsGitLabNative.ID, description: Schema.NullOr(Schema.String),
  runner_type: Schema.Literals(["project_type", "group_type", "instance_type"]), status: Schema.NonEmptyString,
  paused: Schema.Boolean, job_execution_status: Schema.optionalKey(Schema.NullOr(Schema.String)),
  tag_list: Schema.optionalKey(Schema.Array(Schema.String)), locked: Schema.optionalKey(Schema.Boolean),
  projects: Schema.optionalKey(Schema.Array(Schema.Struct({ id: ActionsGitLabNative.ID }))) })
const Owner = Schema.Struct({ data: Schema.Struct({ runner: Schema.NullOr(Schema.Struct({ id: Schema.NonEmptyString,
  runnerType: Schema.Literals(["PROJECT_TYPE", "GROUP_TYPE", "INSTANCE_TYPE"]),
  ownerProject: Schema.NullOr(Schema.Struct({ id: Schema.NonEmptyString })), tagList: Schema.NullOr(Schema.Array(Schema.String)) })) }),
  errors: Schema.optionalKey(Schema.Array(Schema.Json)) })
const platforms = {
  "Linux x64": ["linux", "x64"], "Linux ARM64": ["linux", "ARM64"],
  "macOS ARM64": ["macOS", "ARM64"], "macOS x64": ["macOS", "x64"], "Windows x64": ["windows", "x64"],
} as const
type Services = ActionsResourceNative.Services & { readonly graphql?: ActionsResourceGraphQL.Request }

export function make(services: Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsRunners.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.selection(binding, input, "runners", ["resourceID", "query", "cursor", "limit"]))
      const current = frozen.binding
      const selected = yield* ActionsResourceNative.checked(current, () => {
        if (current.provider.kind === "gitlab" && frozen.input.query !== undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "GitLab project runner API has no native name-search filter")
        if (frozen.input.resourceID !== undefined) ActionsResourceNative.id(current, frozen.input.resourceID)
        return GitHubNative.selection(current, `${current.provider.kind}.runners`,
          { ...(frozen.input.query === undefined ? {} : { name: frozen.input.query }) }, frozen.input.cursor, frozen.input.limit)
      })
      if (current.provider.kind === "github") {
        const repo = yield* GitHubNative.repository(services.transport, current)
        const root = `${repo.path}/actions/runners`
        if (frozen.input.resourceID !== undefined) {
          const response = yield* ActionsResourceNative.get(services, current, `${root}/${frozen.input.resourceID}`)
          const runner = yield* ActionsResourceNative.checked(current, () => github(current, ActionsResourceNative.decode(current, GitHubRunner, response.data), frozen.input.resourceID, repo.native.permissions?.admin !== false))
          return { items: [runner], capturedAt: Date.now(), total: 1 }
        }
        const request = { method: "GET", path: root, query: { page: selected.page, per_page: selected.per_page,
          ...(frozen.input.query === undefined ? {} : { name: frozen.input.query }) } } as const
        const response = yield* ActionsResourceNative.get(services, current, root, request.query)
        return yield* ActionsResourceNative.checked(current, () => {
          const native = ActionsResourceNative.decode(current, GitHubList, response.data)
          return { items: native.runners.map((runner) => github(current, runner, undefined, repo.native.permissions?.admin !== false)),
            ...GitHubNative.pagination(current, response, request, selected, native.runners.length, native.total_count) }
        })
      }
      yield* ActionsGitLabNative.make(services.transport).project(current)
      const response = yield* ActionsResourceNative.get(services, current, `projects/${current.projectID}/runners`, { page: selected.page, per_page: selected.per_page })
      const runners = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, Schema.Array(GitLabRunner), response.data))
      // Only project-visible IDs may enter detail/ownership reads. Never enumerate /runners or /runners/all.
      const items = yield* Effect.forEach(runners.filter((runner) => frozen.input.resourceID === undefined || String(runner.id) === frozen.input.resourceID),
        (runner) => gitlab(services, current, runner), { concurrency: 4 })
      if (frozen.input.resourceID !== undefined && items.length === 0)
        return yield* ActionsResourceNative.error(current, "not_found", "Runner was not present in the selected native project page; select its exact project cursor")
      return { items, capturedAt: Date.now(), ...yield* ActionsResourceNative.checked(current, () =>
        ActionsResourceNative.pagination(current, response, selected, runners.length)) }
    }),
    perform: Effect.fn("ActionsRunners.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.capture(binding, intent, payload, "runners",
        ["resource.create", "resource.update", "resource.delete", "runner.register", "runner.assign", "runner.remove"]))
      const current = frozen.binding
      const admitted = frozen.intent
      const create = admitted.kind === "resource.create" || admitted.kind === "runner.register"
      const config = yield* ActionsResourceNative.checked(current, () => {
        const value = admitted.kind === "runner.register" && Schema.is(Token)(frozen.payload)
          ? ActionsResourceNative.input(current, Token, frozen.payload)
          : create || admitted.kind === "resource.update" ? ActionsResourceNative.input(current, Config, frozen.payload)
            : ActionsResourceNative.input(current, ActionsResourceNative.ProviderOnly, frozen.payload)
        if (value.provider !== current.provider.kind) throw ActionsResourceNative.error(current, "invalid_input", "Runner payload belongs to another provider")
        if (!create && admitted.target.resourceID === undefined) throw ActionsResourceNative.error(current, "invalid_input", "Runner mutation requires an admitted native runner ID")
        if (create && (admitted.target.resourceID !== undefined || admitted.expected?.resourceVersion !== undefined))
          throw ActionsResourceNative.error(current, "invalid_input", "New runner enrollment has no existing runner ID or resource version")
        if (Schema.is(Config)(value) && current.provider.kind === "gitlab" && value.runnerGroupID !== undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "GitLab project runners do not accept a GitHub runner group")
        return value
      })
      const authority = yield* ActionsResourceNative.authority(services, current)
      if (current.provider.kind === "github") yield* ActionsResourceNative.checked(current, () => {
        if (authority.runnerAdmin === false)
          throw ActionsResourceNative.error(current, "permission_denied", "Observed repository role denies runner administration")
        const scopes = authority.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
        if (scopes?.length && !scopes.includes("repo"))
          throw ActionsResourceNative.error(current, "permission_denied", "Observed classic OAuth token lacks repo scope required for runner administration")
      })
      yield* ActionsResourceNative.source(services, current, admitted)
      if (create) {
        if (Schema.is(Token)(config)) {
          const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${authority.root}/actions/runners/registration-token` }, [201])
          return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
            const native = ActionsResourceNative.decode(current, Schema.Struct({ token: Schema.NonEmptyString, expires_at: GitHubNative.Time }), response.data, true)
            return { acknowledgement: { unattributed: true }, output: Actions.CommandOutput.make({ kind: "runnerToken", token: native.token, expiresAt: native.expires_at }) }
          }))
        }
        if (!Schema.is(Config)(config)) return yield* ActionsResourceNative.error(current, "invalid_input", "Runner enrollment requires name, labels and platform")
        const labels = yield* ActionsResourceNative.checked(current, () => routing(current, config.labels, config.platform))
        if (current.provider.kind === "github") {
          if (config.runnerGroupID === undefined) return yield* ActionsResourceNative.error(current, "invalid_input", "GitHub JIT enrollment requires an explicit native runnerGroupID; no group ID is guessed")
          const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${authority.root}/actions/runners/generate-jitconfig`,
            body: { name: config.name, runner_group_id: config.runnerGroupID, labels } }, [201])
          return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
            const native = ActionsResourceNative.decode(current, Schema.Struct({ runner: Schema.Struct({ id: GitHubNative.ID, name: Schema.NonEmptyString,
              labels: Schema.Array(GitHubLabel), runner_group_id: Schema.optionalKey(GitHubNative.Positive) }), encoded_jit_config: Schema.NonEmptyString }), response.data, true)
            if (native.runner.name !== config.name || native.runner.runner_group_id !== undefined && native.runner.runner_group_id !== config.runnerGroupID ||
              labels.some((label) => !native.runner.labels.some((item) => item.name.toLowerCase() === label.toLowerCase())))
              throw ActionsResourceNative.error(current, "outcome_unknown", "JIT configuration did not acknowledge the requested runner identity", "unknown")
            return { acknowledgement: { resourceID: String(native.runner.id) }, output: Actions.CommandOutput.make({ kind: "runnerJit",
              runnerID: String(native.runner.id), encodedConfiguration: native.encoded_jit_config }) }
          }))
        }
        const observation = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).metadata(current))
        yield* ActionsResourceNative.checked(current, () => ActionsGitLabNative.requireVersion(current, observation, [16, 0], "user-linked runner enrollment"))
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: "user/runners",
          body: { runner_type: "project_type", project_id: current.projectID, description: config.name, tag_list: labels, locked: true, run_untagged: false } }, [201])
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const native = ActionsResourceNative.decode(current, Schema.Struct({ id: ActionsGitLabNative.ID, token: Schema.NonEmptyString,
            token_expires_at: Schema.optionalKey(Schema.NullOr(Schema.String)) }), response.data, true)
          return { acknowledgement: { resourceID: String(native.id) }, output: Actions.CommandOutput.make({ kind: "runnerToken", runnerID: String(native.id),
            token: native.token, ...(native.token_expires_at ? { expiresAt: native.token_expires_at } : {}) }) }
        }))
      }
      const runnerID = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.id(current, admitted.target.resourceID ?? ""))
      if (current.provider.kind === "github") {
        if (admitted.kind === "runner.assign") return yield* ActionsResourceNative.error(current, "capability_unavailable", "GitHub has no repository runner-assignment operation; enroll a repository runner")
        const response = yield* ActionsResourceNative.get(services, current, `${authority.root}/actions/runners/${runnerID}`)
        const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, GitHubRunner, response.data))
        yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.requireVersion(current, admitted, versionGithub(native)))
        if (String(native.id) !== runnerID) return yield* ActionsResourceNative.error(current, "binding_stale", "Native repository runner ID differs from admission")
        if (admitted.kind !== "resource.update") {
          yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `${authority.root}/actions/runners/${runnerID}` }, [204])
          return { acknowledgement: { resourceID: runnerID } }
        }
        if (!Schema.is(Config)(config)) return yield* ActionsResourceNative.error(current, "invalid_input", "Runner label editing requires name, labels and platform")
        const labels = yield* ActionsResourceNative.checked(current, () => {
          if (config.name !== native.name || config.runnerGroupID !== undefined)
            throw ActionsResourceNative.error(current, "capability_unavailable", "GitHub repository API edits labels only; runner renaming/group changes require native re-enrollment")
          const requested = routing(current, config.labels, config.platform)
          const readonly = native.labels.filter((label) => label.type === "read-only").map((label) => label.name.toLowerCase())
          const observed = platform(native.labels.map((label) => label.name))
          if (observed !== config.platform || readonly.some((label) => !requested.some((item) => item.toLowerCase() === label)))
            throw ActionsResourceNative.error(current, "capability_unavailable", "Platform/read-only labels describe the installed runner and cannot be changed by label editing")
          return requested.filter((label) => !readonly.includes(label.toLowerCase()))
        })
        const written = yield* ActionsResourceNative.send(services, current, { method: "PUT", path: `${authority.root}/actions/runners/${runnerID}/labels`, body: { labels } }, [200])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schema.Struct({ labels: Schema.Array(GitHubLabel) }), written.data, true)
          const custom = data.labels.filter((label) => label.type === "custom").map((label) => label.name.toLowerCase()).sort()
          if (JSON.stringify(custom) !== JSON.stringify(labels.map((label) => label.toLowerCase()).sort()))
            throw ActionsResourceNative.error(current, "outcome_unknown", "Native runner labels did not acknowledge the requested routing", "unknown")
        }))
        return { acknowledgement: { resourceID: runnerID } }
      }
      const response = yield* ActionsResourceNative.get(services, current, `runners/${runnerID}`)
      const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, GitLabRunner, response.data))
      const owner = yield* ownership(services, current, native)
      yield* ActionsResourceNative.checked(current, () => {
        if (String(native.id) !== runnerID || native.runner_type !== "project_type" || !owner.projectID ||
          admitted.kind !== "runner.assign" && owner.projectID !== current.projectID)
          throw ActionsResourceNative.error(current, "permission_denied", "Inherited or externally owned runners are read-only in this project")
        ActionsResourceNative.requireVersion(current, admitted, versionGitlab(native, owner))
      })
      if (admitted.kind === "runner.assign") {
        const owned = yield* ActionsResourceNative.get(services, current, `projects/${owner.projectID}`)
        yield* ActionsResourceNative.checked(current, () => {
          const project = ActionsResourceNative.decode(current, GitLabCommandNative.Project, owned.data)
          if (String(project.id) !== owner.projectID) throw ActionsResourceNative.error(current, "binding_stale", "Runner owner project identity changed during assignment preflight")
          GitLabCommandNative.role(current, project, 40)
          if (native.locked === true && owner.projectID !== current.projectID)
            throw ActionsResourceNative.error(current, "permission_denied", "Locked runner cannot be assigned outside its owning project")
        })
        const written = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${authority.root}/runners`, body: { runner_id: runnerID } }, [201])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          if (String(ActionsResourceNative.decode(current, GitLabRunner, written.data, true).id) !== runnerID)
            throw ActionsResourceNative.error(current, "outcome_unknown", "Runner assignment response did not prove its exact native ID", "unknown")
        }))
        return { acknowledgement: { resourceID: runnerID } }
      }
      if (!native.projects?.some((project) => String(project.id) === current.projectID))
        return yield* ActionsResourceNative.error(current, "binding_stale", "Runner is not currently assigned to the bound native project")
      if (admitted.kind !== "resource.update") {
        if (native.projects.length !== 1) return yield* ActionsResourceNative.error(current, "permission_denied", "Deleting this runner would affect other projects; remove their assignments in the owning native scope first")
        yield* ActionsResourceNative.send(services, current, { method: "DELETE", path: `runners/${runnerID}` }, [204])
        return { acknowledgement: { resourceID: runnerID } }
      }
      if (!Schema.is(Config)(config)) return yield* ActionsResourceNative.error(current, "invalid_input", "Runner configuration requires name, labels and platform")
      const labels = yield* ActionsResourceNative.checked(current, () => routing(current, config.labels, config.platform))
      const written = yield* ActionsResourceNative.send(services, current, { method: "PUT", path: `runners/${runnerID}`, body: { description: config.name, tag_list: labels } }, [200])
      yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
        const data = ActionsResourceNative.decode(current, GitLabRunner, written.data, true)
        if (String(data.id) !== runnerID || data.description !== config.name || JSON.stringify(data.tag_list?.slice().sort()) !== JSON.stringify(labels.slice().sort()))
          throw ActionsResourceNative.error(current, "outcome_unknown", "Native runner configuration did not acknowledge requested fields", "unknown")
      }))
      return { acknowledgement: { resourceID: runnerID } }
    }),
  }
}

function routing(binding: Actions.Binding, labels: string | readonly string[], selected: typeof Platform.Type) {
  const supplied = typeof labels === "string" ? labels.split(",").map((item) => item.trim()) : labels.slice()
  if (supplied.some((label) => !label || label.length > 255 || /[\x00-\x1f\x7f]/.test(label)) || supplied.length > 100)
    throw ActionsResourceNative.error(binding, "invalid_input", "Runner routing requires bounded nonempty labels/tags")
  const reserved = ["linux", "macos", "windows", "x64", "arm64", "self-hosted"]
  const result = [...(binding.provider.kind === "github" ? ["self-hosted"] : []), ...platforms[selected],
    ...supplied.filter((label) => !reserved.includes(label.toLowerCase()))]
  const unique = Array.from(new Map(result.map((label) => [label.toLowerCase(), label])).values())
  if (unique.length > 100) throw ActionsResourceNative.error(binding, "invalid_input", "Runner routing exceeds native label/tag limit")
  return unique
}

function platform(labels: readonly string[]) {
  const normalized = labels.map((label) => label.toLowerCase())
  return Object.entries(platforms).find((entry) => entry[1].every((label) => normalized.includes(label.toLowerCase())))?.[0]
}

function versionGithub(runner: typeof GitHubRunner.Type) {
  return ActionsResourceNative.version({ id: String(runner.id), name: runner.name, os: runner.os,
    status: runner.status, busy: runner.busy,
    labels: runner.labels.map((label) => ({ name: label.name, type: label.type })).sort((left, right) => left.name.localeCompare(right.name)) })
}

function github(binding: Actions.Binding, runner: typeof GitHubRunner.Type, requested?: string, writable = true): Actions.Resource {
  if (requested !== undefined && String(runner.id) !== requested) throw ActionsResourceNative.error(binding, "binding_stale", "Repository runner identity changed")
  // Native repository-scoped runner endpoint proves registration ownership. Label names prove no ownership.
  return { id: String(runner.id), bindingID: binding.id, kind: "runners", name: runner.name, scope: ActionsResourceNative.scope(binding),
    status: runner.busy ? "Busy" : runner.status === "online" ? "Online" : runner.status,
    data: { nativeID: String(runner.id), labels: runner.labels.map((label) => label.name), os: runner.os,
      state: runner.busy ? "Busy" : runner.status === "online" ? "Online" : runner.status,
      ...(platform(runner.labels.map((label) => label.name)) ? { platform: platform(runner.labels.map((label) => label.name)) ?? "" } : {}),
      origin: "Project runner", inherited: false, editable: writable, removable: writable, platformKind: "routing", resourceVersion: versionGithub(runner) } }
}

const ownership = Effect.fn("ActionsRunners.gitlabOwnership")(function* (services: Services, binding: Actions.Binding, runner: typeof GitLabRunner.Type) {
  if (runner.runner_type !== "project_type") return { projectID: undefined, labels: runner.tag_list ?? [] }
  if (!services.graphql) return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitLab runner ownership requires the bound /api/graphql seam; REST assignments do not prove owner project")
  const response = yield* ActionsResourceNative.before(binding, services.graphql(binding, { kind: "runner", id: String(runner.id) }))
  return yield* ActionsResourceNative.checked(binding, () => {
    const native = ActionsResourceNative.decode(binding, Owner, response.data)
    if (response.status !== 200 || native.errors?.length || !native.data.runner || native.data.runner.id !== `gid://gitlab/Ci::Runner/${runner.id}` || native.data.runner.runnerType !== "PROJECT_TYPE")
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitLab did not prove this project runner's native ownership")
    const owner = native.data.runner.ownerProject?.id
    if (!owner || !/^gid:\/\/gitlab\/Project\/[1-9]\d*$/.test(owner))
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitLab runner owner project is not visible to the current actor")
    return { projectID: owner.split("/").at(-1), labels: native.data.runner.tagList ?? [] }
  })
})

function versionGitlab(runner: typeof GitLabRunner.Type, owner: { projectID?: string; labels: readonly string[] }) {
  return ActionsResourceNative.version({ id: String(runner.id), name: runner.description, type: runner.runner_type,
    status: runner.status, paused: runner.paused, jobExecutionStatus: runner.job_execution_status ?? null,
    ownerProjectID: owner.projectID ?? null, labels: owner.labels.slice().sort(), locked: runner.locked ?? null,
    projects: runner.projects?.map((project) => String(project.id)).sort() ?? [] })
}

const gitlab = Effect.fn("ActionsRunners.gitlabResource")(function* (services: Services, binding: Actions.Binding, runner: typeof GitLabRunner.Type): Effect.fn.Return<Actions.Resource, import("../error").ActionsError> {
  const response = yield* ActionsResourceNative.get(services, binding, `runners/${runner.id}`)
  const detail = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, GitLabRunner, response.data))
  if (String(detail.id) !== String(runner.id) || detail.runner_type !== runner.runner_type)
    return yield* ActionsResourceNative.error(binding, "binding_stale", "Native project runner detail changed identity/type")
  const owner = yield* ownership(services, binding, detail)
  const inherited = detail.runner_type !== "project_type" || owner.projectID !== binding.projectID
  return { id: String(detail.id), bindingID: binding.id, kind: "runners", name: detail.description ?? "", scope: ActionsResourceNative.scope(binding),
    status: detail.paused ? "Paused" : detail.job_execution_status === "active" ? "Busy" : detail.status === "online" ? "Online" : detail.status,
    data: { nativeID: String(detail.id), labels: owner.labels, runnerType: detail.runner_type, paused: detail.paused,
      state: detail.paused ? "Paused" : detail.job_execution_status === "active" ? "Busy" : detail.status === "online" ? "Online" : detail.status,
      ...(platform(owner.labels) ? { platform: platform(owner.labels) ?? "" } : {}),
      origin: detail.runner_type === "instance_type" ? "Inherited instance runner" : detail.runner_type === "group_type" ? "Inherited group runner"
        : inherited ? "Inherited project runner" : "Project runner", inherited, editable: !inherited, removable: !inherited,
      ownerProjectID: owner.projectID ?? null, platformKind: "routing", resourceVersion: versionGitlab(detail, owner) } }
})
