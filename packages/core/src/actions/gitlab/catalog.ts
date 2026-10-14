export * as ActionsGitLabCatalog from "./catalog"

import { Actions } from "@orchestra/schema/actions"
import { createHash } from "node:crypto"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsGitLabNative } from "./native"

export function make(transport: ActionsContract.Transport) {
  const native = ActionsGitLabNative.make(transport)
  const workflows = Effect.fn("ActionsGitLabRead.workflows")(function* (binding: Actions.Binding, input: Actions.ListInput) {
    yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["cursor", "limit", "query", "state"], Actions.ListInput)
      const page = ActionsCursor.page(binding, "gitlab.workflows", { ...input, limit: ActionsCursor.limit(input.limit) }, input.cursor)
      if (page !== 1) throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab project pipeline catalog has only one entry")
    })
    const project = yield* native.project(binding)
    const workflow = toWorkflow(binding, project)
    const items = (!input.query || workflow.name?.includes(input.query) || workflow.path.includes(input.query)) &&
      (input.state === undefined || workflow.state === input.state) ? [workflow] : []
    return { items, total: items.length, capturedAt: Date.now() }
  })
  const source = Effect.fn("ActionsGitLabRead.source")(function* (binding: Actions.Binding, input: { readonly path: string; readonly ref: string }) {
    yield* ActionsGitLabNative.checked(binding, () => {
      ActionsGitLabNative.selection(binding, input, ["path", "ref"], Schema.Struct({ path: Schema.NonEmptyString, ref: Schema.NonEmptyString }))
      if (!ActionsGitLabNative.localPath(input.path)) throw ActionsGitLabNative.error(binding, "source_unresolved",
        "GitLab external, project-qualified or dynamic CI source requires separate resolution; no local configuration fallback")
      if (!input.ref || /[\x00-\x1f\x7f\\]/.test(input.ref) || input.ref.split("/").some((part) => !part || part === "." || part === ".."))
        throw ActionsGitLabNative.error(binding, "invalid_input", "GitLab source ref must name an exact commit, branch or tag")
    })
    const project = yield* native.project(binding)
    const configured = ActionsGitLabNative.configPath(project)
    // Current settings cannot deny a historical file or local include addressed
    // by its immutable commit. That read does not prove a run-definition join.
    if (input.path === ".gitlab-ci.yml" && configured !== input.path && Option.isNone(Schema.decodeUnknownOption(ActionsGitLabNative.SHA)(input.ref)))
      return yield* ActionsGitLabNative.error(binding, "source_unresolved", "GitLab native CI configuration is custom, external or unobserved; default file is not a substitute")
    const commitResponse = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/commits/${encodeURIComponent(input.ref)}`)
    const commit = yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.decode(binding, ActionsGitLabNative.Commit, commitResponse.data, "commit"))
    // Resolve branch BEFORE content, then request that exact immutable commit.
    // https://docs.gitlab.com/api/commits/#retrieve-a-commit
    const response = yield* native.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/files/${encodeURIComponent(input.path)}`, { ref: commit.id })
    return yield* ActionsGitLabNative.checked(binding, () => {
      const file = ActionsGitLabNative.decode(binding, ActionsGitLabNative.File, response.data, "repository file")
      if (file.file_path !== input.path || file.commit_id !== commit.id)
        throw ActionsGitLabNative.error(binding, "source_conflict", "GitLab source identity differs from the requested file and resolved commit")
      const bytes = Buffer.from(file.content, "base64")
      const text = bytes.toString("utf8")
      if (bytes.toString("base64") !== file.content || !Buffer.from(text, "utf8").equals(bytes))
        throw ActionsGitLabNative.error(binding, "source_unresolved", "GitLab source content is not exact base64-encoded UTF-8 text")
      // File API may transcode text. Prove fidelity to the identified raw blob,
      // not merely to the API's decoded view: H("blob <byte-length>\0" + bytes).
      // https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
      // https://git-scm.com/docs/hash-function-transition (blob payload unchanged)
      if (createHash(file.blob_id.length === 40 ? "sha1" : "sha256").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== file.blob_id.toLowerCase())
        throw ActionsGitLabNative.error(binding, "source_unresolved", "GitLab decoded source bytes do not match the identified raw Git blob")
      return Actions.Source.make({ bindingID: binding.id, path: input.path, ref: input.ref, commit: commit.id,
        version: JSON.stringify({ blob_id: file.blob_id, last_commit_id: file.last_commit_id }), text,
        // Read permission, roles and branch protection cannot prove write eligibility.
        editable: false, diagnostics: ["Write permission and ref protection are not observed; source is read-only"] })
    })
  })
  const capabilities = Effect.fn("ActionsGitLabRead.capabilities")(function* (binding: Actions.Binding) {
    const project = yield* native.project(binding)
    const observedAt = Date.now()
    const scope = `projects/${binding.projectID}`
    const permissions = [project.permissions?.project_access?.access_level, project.permissions?.group_access?.access_level]
      .filter((value) => value !== undefined)
    const context = `Native project read succeeded; access levels ${permissions.length ? permissions.join(",") : "unobserved"}; advisory client version ${binding.provider.version ?? "unset"}; native version unobserved by this inspection`
    return [Actions.Capability.make({ operation: "workflows.read", state: "available", reason: context, scope, observedAt }),
      ...["source.read", "runs.read", "jobs.read"].map((operation) => Actions.Capability.make({ operation, state: "unknown", scope, observedAt,
        reason: `${context}; endpoint-specific read permission not observed` })),
      ...Actions.OperationKind.literals.map((operation) => Actions.Capability.make({ operation, state: "unknown", scope, observedAt,
        reason: `${context}; token scope, native operation eligibility and protected-ref permissions not observed` })),
    ]
  })
  return { workflows, source, capabilities }
}

function toWorkflow(binding: Actions.Binding, project: typeof ActionsGitLabNative.Project.Type) {
  const path = ActionsGitLabNative.configPath(project)
  const disabled = project.jobs_enabled === false || project.builds_access_level === "disabled" || project.archived === true
  const state = path === undefined || !ActionsGitLabNative.localPath(path) ? "source_unresolved" : disabled ? "disabled" : "configured"
  return Actions.Workflow.make({ id: ActionsGitLabNative.workflowID(binding), bindingID: binding.id, name: project.name,
    ...(project.default_branch ? { defaultRef: project.default_branch } : {}),
    path: path ?? "", state, dispatchable: false, dispatchState: disabled ? "unavailable" : "unknown" })
}
