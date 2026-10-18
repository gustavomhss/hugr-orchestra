export * as ActionsPolicy from "./policy"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsConfigCommon } from "./config-common"

const C = ActionsConfigCommon
const Permissions = Schema.Struct({ enabled: Schema.Boolean,
  allowed_actions: Schema.optionalKey(Schema.Literals(["all", "local_only", "selected"])) })
const Selected = Schema.Struct({ github_owned_allowed: Schema.Boolean, verified_allowed: Schema.Boolean, patterns_allowed: Schema.Array(Schema.String) })
const GitLabSettings = Schema.Struct({ id: C.ID,
  keep_latest_artifact: Schema.optionalKey(Schema.Boolean), build_timeout: Schema.optionalKey(Schema.Int),
  auto_cancel_pending_pipelines: Schema.optionalKey(Schema.String),
  builds_access_level: Schema.optionalKey(Schema.String), ci_config_path: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ci_pipeline_variables_minimum_override_role: Schema.optionalKey(Schema.String),
  allow_pipeline_trigger_approve_deployment: Schema.optionalKey(Schema.Boolean),
})
const Form = Schema.Struct({ provider: C.Provider,
  retention: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3650 }))),
  policy: Schema.optionalKey(Schema.Literals(["Project default", "Restricted to approved actions"])) })

export function make(services: ActionsConfigCommon.Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsPolicy.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      yield* C.guard(binding, () => {
        const frozen = C.selection(binding, input, "policy", ["resourceID", "scope"])
        if (frozen.cursor !== undefined || frozen.limit !== undefined || (frozen.resourceID !== undefined && frozen.resourceID !== "project-settings") ||
            (frozen.scope !== undefined && frozen.scope !== (binding.provider.kind === "github" ? "Repository" : "Project")))
          throw C.fail(binding, "invalid_input", "Project settings are one native project policy snapshot")
      })
      const project = yield* C.project(services, binding)
      const scope = binding.provider.kind === "github" ? "Repository" : "Project"
      if (binding.provider.kind === "gitlab") return yield* C.guard(binding, () => {
        const native = C.decode(binding, GitLabSettings, project.response.data, true)
        return { items: [{ id: "project-settings", name: "Project settings", bindingID: binding.id, kind: "policy" as const, scope, owner: "Project",
          data: { nativeIdentity: C.identity(binding, "project-settings", scope), nativeSettings: native, resourceVersion: JSON.stringify(native),
            retention: { state: "source_unresolved", source: "Instance default and CI artifacts:expire_in", writable: false },
            policy: { state: "unavailable", reason: "GitLab has no GitHub approved-actions execution policy" },
            localPolicySource: "Actions binding policy store", inherited: { writable: false, scope: "Instance / group / CI configuration" } } }], capturedAt: Date.now() }
      })
      const response = yield* C.get(services, binding, { method: "GET", path: `${project.path}/actions/permissions` })
      const native = yield* C.guard(binding, () => C.decode(binding, Permissions, response.data, true))
      const selection = native.allowed_actions === "selected" ? yield* C.get(services, binding,
        { method: "GET", path: `${project.path}/actions/permissions/selected-actions` }) : undefined
      const selected = selection ? yield* C.guard(binding, () => C.decode(binding, Selected, selection.data, true)) : undefined
      const metadata = { ...native, ...(selected === undefined ? {} : { selectedActions: selected }) }
      return { items: [{ id: "project-settings", name: "Project settings", bindingID: binding.id, kind: "policy" as const, scope, owner: "Project",
        data: { nativeIdentity: C.identity(binding, "project-settings", scope), nativeSettings: metadata, resourceVersion: JSON.stringify(metadata),
          ...(native.allowed_actions === "all" ? { policy: "Project default" } : native.allowed_actions === "selected" ? { policy: "Restricted to approved actions" }
            : { policy: { state: "source_unresolved", reason: "Native allowed_actions is not one of the mock policy options" } }),
          retention: { state: "source_unresolved", source: "Provider artifact/log default and workflow retention-days", writable: false },
          localPolicySource: "Actions binding policy store", inherited: { writable: false, scope: "Organization / enterprise" } } }], capturedAt: Date.now() }
    }),
    perform: Effect.fn("ActionsPolicy.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* C.guard(binding, () => {
        const capture = C.capture(binding, intent, "policy")
        const input = C.decode(binding, Form, structuredClone(payload))
        if (input.provider !== binding.provider.kind || intent.target.resourceID !== "project-settings" ||
            intent.target.scope !== (binding.provider.kind === "github" ? "Repository" : "Project") || intent.kind !== "resource.update")
          throw C.fail(binding, "intent_conflict", "Project policy mutation does not match the admitted settings identity")
        if (input.retention !== undefined) throw C.fail(binding, "capability_unavailable",
          "Field 'retention' must update the Actions binding policy store; repository PATCH and GitLab project settings do not represent artifact retention days")
        if (input.policy === undefined) throw C.fail(binding, "invalid_input", "Project policy mutation has no supported field")
        if (binding.provider.kind === "gitlab") throw C.fail(binding, "capability_unavailable",
          "Field 'policy' has no GitLab approved-actions equivalent; local execution policy belongs to the Actions binding policy store")
        return { ...capture, input }
      })
      const project = yield* C.project(services, frozen.binding, true, true)
      const path = `${project.path}/actions/permissions`
      const response = yield* C.get(services, frozen.binding, { method: "GET", path })
      const native = yield* C.guard(binding, () => C.decode(binding, Permissions, response.data, true))
      const selectedResponse = native.allowed_actions === "selected" || frozen.input.policy === "Restricted to approved actions"
        ? yield* C.get(services, frozen.binding, { method: "GET", path: `${path}/selected-actions` }) : undefined
      const selected = selectedResponse ? yield* C.guard(binding, () => C.decode(binding, Selected, selectedResponse.data, true)) : undefined
      if (frozen.input.policy === "Restricted to approved actions" && !selected)
        return yield* C.fail(binding, "source_unresolved", "Native selected-actions policy did not establish the existing approved action set")
      yield* C.guard(binding, () => C.version(frozen.binding, frozen.intent.expected, response,
        { ...native, ...(native.allowed_actions === "selected" && selected ? { selectedActions: selected } : {}) }))
      yield* C.send(services, frozen.binding, { method: "PUT", path, body: { enabled: native.enabled,
        allowed_actions: frozen.input.policy === "Restricted to approved actions" ? "selected" : "all" } }, [204])
      return { acknowledgement: { resourceID: "project-settings" } }
    }),
  }
}
