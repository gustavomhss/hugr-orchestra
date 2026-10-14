/// <reference path="./config-sodium.d.ts" />
export * as ActionsVariables from "./variables"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsError } from "../error"
import { ActionsConfigCommon } from "./config-common"
import { ActionsVariableGitHubPage } from "./config-variable-github-page"

const C = ActionsConfigCommon
const Type = Schema.Literals(["Secret", "Variable"])
const Identity = { provider: C.Provider, name: C.Text, type: Type, scope: C.Text }
const Delete = Schema.Struct(Identity)
const Form = Schema.Struct({ ...Identity, value: C.Value,
  protected: Schema.optionalKey(Schema.Boolean), masked: Schema.optionalKey(Schema.Boolean), hidden: Schema.optionalKey(Schema.Boolean) })
// https://docs.gitlab.com/api/project_level_variables/ returns sensitive values.
// Project them away before metadata reaches Resource or any version fingerprint.
const GitLabVariable = Schema.Struct({ key: C.Text, environment_scope: C.Text, protected: Schema.Boolean, masked: Schema.Boolean,
  hidden: Schema.optionalKey(Schema.Boolean), variable_type: Schema.Literals(["env_var", "file"]), raw: Schema.optionalKey(Schema.Boolean) })
const PublicKey = Schema.Struct({ key_id: C.Text, key: Schema.String })

export function make(services: ActionsConfigCommon.Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsVariables.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* C.guard(binding, () => C.selection(binding, input, "variables", ["scope", "resourceID", "query"]))
      const project = yield* C.project(services, binding)
      if (binding.provider.kind === "gitlab") {
        const selected = yield* C.guard(binding, () => C.page(binding, frozen))
        const response = yield* C.get(services, binding, { method: "GET", path: `${project.path}/variables`, query: { page: selected.number, per_page: selected.limit } })
        return yield* C.guard(binding, () => {
          const native = C.decode(binding, Schema.Array(GitLabVariable), response.data, true)
          const raw = C.decode(binding, Schema.Array(Schema.Json), response.data, true)
          const items = native.map((item, index) => gitlabResource(binding, item, raw[index]))
            .filter((item) => (frozen.scope === undefined || item.scope === frozen.scope) && (frozen.resourceID === undefined || item.name === frozen.resourceID) &&
              (frozen.query === undefined || item.name.includes(frozen.query)))
          return { items, ...C.pagination(binding, selected, response, native.length, ActionsCursor.total(response.headers)) }
        })
      }
      const scope = frozen.scope ?? "Repository"
      const path = yield* githubScope(services, binding, project.path, scope)
      const page = yield* ActionsVariableGitHubPage.list(services, binding, { ...frozen, scope }, path)
      return yield* C.guard(binding, () => {
        return { items: page.rows.map((item) => githubResource(binding, item, scope)).filter((item) =>
          (frozen.resourceID === undefined || item.name === frozen.resourceID) && (frozen.query === undefined || item.name.includes(frozen.query))),
          ...(page.next === undefined ? {} : { next: page.next }), capturedAt: page.capturedAt }
      })
    }),
    perform: Effect.fn("ActionsVariables.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* C.guard(binding, () => {
        const capture = C.capture(binding, intent, "variables")
        const input = C.decode(binding, intent.kind === "resource.delete" ? Delete : Form, structuredClone(payload))
        if (input.provider !== binding.provider.kind) throw C.fail(binding, "intent_conflict", "Variable provider changed after operation admission")
        const renamed = input.name !== intent.target.resourceID
        const moved = input.scope !== intent.target.scope
        if ((renamed || moved) && intent.kind !== "resource.update")
          throw C.fail(binding, "intent_conflict", "Variable create/delete identity differs from admission")
        if (renamed && (input.provider !== "github" || input.type !== "Variable"))
          throw C.fail(binding, "capability_unavailable", "Field 'name' cannot rename this native variable or secret in one operation")
        if (moved && input.provider !== "gitlab")
          throw C.fail(binding, "capability_unavailable", "Field 'scope' requires separate GitHub create/delete operations")
        if ((renamed || moved) && intent.expected?.resourceVersion === undefined)
          throw C.fail(binding, "source_conflict", "Changing variable key or scope requires an admitted native resource version")
        if (!/^[A-Za-z0-9_]{1,255}$/.test(input.name) || (input.provider === "github" && (!/^[A-Za-z_]/.test(input.name) || /^GITHUB_/i.test(input.name))))
          throw C.fail(binding, "invalid_input", "Variable name is not a native configuration key")
        if (input.provider === "github" && ["protected", "masked", "hidden"].some((key) => key in input))
          throw C.fail(binding, "invalid_input", "GitHub has no GitLab variable flag fields")
        return { ...capture, input }
      })
      const project = yield* C.project(services, frozen.binding, true)
      if (frozen.binding.provider.kind === "github") return yield* githubWrite(services, frozen.binding, frozen.intent, frozen.input, project.path)
      return yield* gitlabWrite(services, frozen.binding, frozen.intent, frozen.input, project.path)
    }),
  }
}

function githubResource(binding: Actions.Binding, item: typeof ActionsVariableGitHubPage.Secret.Type | typeof ActionsVariableGitHubPage.Variable.Type, scope: string): Actions.Resource {
  const type = "value" in item ? "Variable" : "Secret"
  const metadata = { name: item.name, scope, type, created_at: item.created_at, updated_at: item.updated_at }
  return { id: JSON.stringify([item.name, scope, type]), bindingID: binding.id, kind: "variables", name: item.name, scope,
    sensitive: type === "Secret", owner: "Project", data: { ...metadata, nativeIdentity: C.identity(binding, item.name, scope),
      resourceVersion: JSON.stringify(metadata), ...(type === "Secret" ? { redacted: true } : "value" in item ? { value: item.value } : {}) } }
}

function gitlabResource(binding: Actions.Binding, item: typeof GitLabVariable.Type, raw: ActionsContract.Json): Actions.Resource {
  const sensitive = item.masked || item.hidden !== false
  const type = sensitive ? "Secret" : "Variable"
  const value = sensitive ? undefined : C.decode(binding, Schema.Struct({ value: Schema.String }), raw, true).value
  const metadata = { name: item.key, scope: item.environment_scope, type, protected: item.protected, masked: item.masked,
    ...(item.hidden === undefined ? {} : { hidden: item.hidden }), variable_type: item.variable_type, ...(item.raw === undefined ? {} : { raw: item.raw }) }
  return { id: JSON.stringify([item.key, item.environment_scope, type]), bindingID: binding.id, kind: "variables", name: item.key,
    scope: item.environment_scope, owner: "Project", sensitive, data: { ...metadata,
      nativeIdentity: C.identity(binding, item.key, item.environment_scope), resourceVersion: JSON.stringify(metadata), redacted: sensitive,
      flags: [item.protected ? "Protected" : "", item.masked ? "Masked" : "", item.hidden ? "Hidden" : ""].filter(Boolean),
      ...(item.hidden === undefined ? { sourceUnresolved: "Native hidden flag was not observed; value stays redacted" } : {}),
      ...(value === undefined ? {} : { value }) } }
}

const githubScope = Effect.fn("ActionsVariables.githubScope")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, scope: string) {
  if (scope === "Repository") return `${root}/actions`
  yield* C.guard(binding, () => C.decode(binding, C.Text, scope))
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/environments/${encodeURIComponent(scope)}` })
  const native = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ id: C.ID, name: C.Text }), response.data, true))
  if (native.name !== scope) return yield* C.fail(binding, "source_conflict", "Native environment scope changed")
  return `${root}/environments/${encodeURIComponent(scope)}`
})

const githubWrite = Effect.fn("ActionsVariables.githubWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof Delete.Type | typeof Form.Type, root: string) {
  const name = yield* C.guard(binding, () => C.decode(binding, C.Text, intent.target.resourceID))
  const scope = yield* C.guard(binding, () => C.decode(binding, C.Text, intent.target.scope))
  const path = yield* githubScope(services, binding, root, scope)
  const collection = `${path}/${input.type === "Secret" ? "secrets" : "variables"}`
  const response = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(name)}` }, true)
  if (intent.kind === "resource.create" && response.status !== 404) return yield* C.fail(binding, "source_conflict", "Variable already exists at the admitted key and scope")
  if (intent.kind !== "resource.create" && response.status === 404) return yield* C.fail(binding, "source_conflict", "Variable disappeared from the admitted key and scope")
  if (response.status === 200) yield* C.guard(binding, () => {
    const native = input.type === "Secret" ? C.decode(binding, ActionsVariableGitHubPage.Secret, response.data, true)
      : C.decode(binding, ActionsVariableGitHubPage.Variable, response.data, true)
    if (native.name !== name) throw C.fail(binding, "source_conflict", "Native variable key changed")
    C.version(binding, intent.expected, response, { name: native.name, scope, type: input.type,
      created_at: native.created_at, updated_at: native.updated_at })
  })
  if (name !== input.name) {
    const destination = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(input.name)}` }, true)
    if (destination.status !== 404) return yield* C.fail(binding, "source_conflict", "Variable rename destination already exists")
  }
  if (intent.kind === "resource.create" && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new variable has no existing resource version")
  if (intent.kind === "resource.delete") {
    yield* C.send(services, binding, { method: "DELETE", path: `${collection}/${encodeURIComponent(input.name)}` }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("value" in input)) return yield* C.fail(binding, "invalid_input", "Variable mutation requires a replacement value")
  if (input.type === "Secret") {
    const response = yield* C.get(services, binding, { method: "GET", path: `${collection}/public-key` })
    const key = yield* C.guard(binding, () => C.decode(binding, PublicKey, response.data, true))
    const { default: sodium } = yield* Effect.tryPromise({ try: () => import("libsodium-wrappers"),
      catch: () => C.fail(binding, "capability_unavailable", "Secret encryption requires libsodium-wrappers@0.7.15") })
    yield* Effect.tryPromise({ try: () => sodium.ready,
      catch: () => C.fail(binding, "capability_unavailable", "Native libsodium secret encryption could not initialize") })
    const encrypted = yield* Effect.try({ try: () => {
      const publicKey = sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL)
      if (publicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) throw C.fail(binding, "transport_failed", "Provider public key has invalid length")
      const bytes = new TextEncoder().encode(input.value)
      // Standard libsodium sealed box, not a hand-built crypto approximation.
      try { return sodium.to_base64(sodium.crypto_box_seal(bytes, publicKey), sodium.base64_variants.ORIGINAL) }
      finally { sodium.memzero(bytes) }
    }, catch: (cause) => C.fail(binding, cause instanceof ActionsError ? cause.kind : "transport_failed", "Native secret public key could not be encrypted") })
    yield* C.send(services, binding, { method: "PUT", path: `${collection}/${encodeURIComponent(input.name)}`, body: { encrypted_value: encrypted, key_id: key.key_id } }, [201, 204])
    return { acknowledgement: { resourceID: input.name } }
  }
  yield* C.send(services, binding, { method: intent.kind === "resource.create" ? "POST" : "PATCH",
    path: intent.kind === "resource.create" ? collection : `${collection}/${encodeURIComponent(name)}`, body: { name: input.name, value: input.value } }, [201, 204])
  return { acknowledgement: { resourceID: input.name } }
})

const gitlabWrite = Effect.fn("ActionsVariables.gitlabWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof Delete.Type | typeof Form.Type, root: string) {
  // GitLab's project-wide scope is natively '*'; never replace a scope filter with display label 'Repository'.
  if (input.scope === "Repository") return yield* C.fail(binding, "invalid_input", "GitLab project scope must use native environment_scope '*'")
  const scope = yield* C.guard(binding, () => C.decode(binding, C.Text, intent.target.scope))
  const collection = `${root}/variables`
  const query = { "filter[environment_scope]": scope }
  const response = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(input.name)}`, query }, true)
  if ((intent.kind === "resource.create") !== (response.status === 404)) return yield* C.fail(binding, "source_conflict", "Variable existence changed at the admitted key and scope")
  const existing = response.status === 200 ? yield* C.guard(binding, () => {
    const native = C.decode(binding, GitLabVariable, response.data, true)
    if (native.key !== input.name || native.environment_scope !== scope) throw C.fail(binding, "source_conflict", "Native variable key or scope changed")
    const resource = gitlabResource(binding, native, response.data)
    if (intent.kind === "resource.delete" && resource.sensitive !== (input.type === "Secret"))
      throw C.fail(binding, "source_conflict", "Native variable sensitivity changed after admission")
    const metadata = C.decode(binding, Schema.Struct({ resourceVersion: Schema.String }), resource.data, true)
    if (intent.expected?.resourceVersion !== undefined && intent.expected.resourceVersion !== metadata.resourceVersion)
      throw C.fail(binding, "source_conflict", "Native variable controls or scope changed after admission")
    return native
  }) : undefined
  if (scope !== input.scope) {
    const destination = yield* C.get(services, binding, { method: "GET", path: `${collection}/${encodeURIComponent(input.name)}`,
      query: { "filter[environment_scope]": input.scope } }, true)
    if (destination.status !== 404) return yield* C.fail(binding, "source_conflict", "Variable destination scope already contains this native key")
  }
  if (intent.kind === "resource.create" && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new variable has no existing resource version")
  if (intent.kind === "resource.delete") {
    yield* C.send(services, binding, { method: "DELETE", path: `${collection}/${encodeURIComponent(input.name)}`, query }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("value" in input)) return yield* C.fail(binding, "invalid_input", "Variable mutation requires a replacement value")
  if (existing && input.hidden !== undefined && input.hidden !== existing.hidden)
    return yield* C.fail(binding, "capability_unavailable", "GitLab hidden is create-only; existing hiding state must be retained")
  const masked = input.masked ?? (input.type === "Secret")
  if (input.type === "Secret" && !masked && !input.hidden) return yield* C.fail(binding, "invalid_input", "GitLab has no independent Secret type; Secret requires masked or hidden controls")
  if (input.hidden && !masked) return yield* C.fail(binding, "invalid_input", "GitLab hidden creation requires masked_and_hidden")
  if (!existing && input.hidden) {
    const response = yield* C.get(services, binding, { method: "GET", path: "metadata" })
    const native = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ version: C.Text }), response.data, true))
    const version = /^(\d+)\.(\d+)\.(\d+)(?:-(?:ee|ce))?$/.exec(native.version)
    if (!version || Number(version[1]) < 17 || (Number(version[1]) === 17 && Number(version[2]) < 4))
      return yield* C.fail(binding, "capability_unavailable", "Hidden variable creation requires observed GitLab 17.4 or newer")
  }
  yield* C.send(services, binding, { method: existing ? "PUT" : "POST", path: existing ? `${collection}/${encodeURIComponent(input.name)}` : collection,
    ...(existing ? { query } : {}), body: { ...(existing ? {} : { key: input.name }), value: input.value, environment_scope: input.scope,
      protected: input.protected ?? existing?.protected ?? false, masked,
      ...(input.hidden && !existing ? { masked_and_hidden: true } : {}),
      variable_type: existing?.variable_type ?? "env_var", ...(existing?.raw === undefined ? {} : { raw: existing.raw }) } }, [200, 201])
  // GitLab echoes values after writes. Only admitted native identity may leave this callback.
  return { acknowledgement: { resourceID: input.name } }
})
