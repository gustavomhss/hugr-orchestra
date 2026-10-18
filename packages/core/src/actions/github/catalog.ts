export * as GitHubCatalog from "./catalog"

import { Actions } from "@orchestra/schema/actions"
import { createHash } from "node:crypto"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "./native"

const Workflow = Schema.Struct({ id: GitHubNative.ID, name: Schema.NullOr(Schema.String), path: Schema.NonEmptyString,
  state: Schema.NonEmptyString, updated_at: Schema.optionalKey(GitHubNative.Time) })
const Workflows = Schema.Struct({ total_count: Schema.optionalKey(GitHubNative.Count), workflows: Schema.Array(Workflow) })
const Commit = Schema.Struct({ sha: GitHubNative.SHA })
const Content = Schema.Struct({ type: Schema.String, path: Schema.String, sha: GitHubNative.SHA,
  size: GitHubNative.Count, encoding: Schema.optionalKey(Schema.String), content: Schema.optionalKey(Schema.String),
  target: Schema.optionalKey(Schema.String), submodule_git_url: Schema.optionalKey(Schema.String) })

// https://docs.github.com/en/rest/actions/workflows#list-repository-workflows
export const workflows = Effect.fn("ActionsGitHubRead.workflows")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: Actions.ListInput) {
  const selected = yield* GitHubNative.checked(binding, () => {
    if (input.query !== undefined || input.state !== undefined)
      throw GitHubNative.error(binding, "invalid_input", "GitHub workflow listing does not support server-side query or state filters")
    return GitHubNative.selection(binding, "github.workflows", {}, input.cursor, input.limit)
  })
  const repo = yield* GitHubNative.repository(transport, binding)
  const request = { method: "GET", path: `${repo.path}/actions/workflows`, query: { page: selected.page, per_page: selected.per_page } } as const
  const response = yield* GitHubNative.get(transport, binding, request)
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Workflows, response.data, "workflow list")
    return { items: data.workflows.map((item): Actions.Workflow => ({
      id: String(item.id), bindingID: binding.id, name: item.name, path: item.path, state: item.state,
      ...(repo.native.default_branch ? { defaultRef: repo.native.default_branch } : {}),
      dispatchable: false, dispatchState: "unknown", ...(item.updated_at === undefined ? {} : { updatedAt: item.updated_at }),
    })), ...GitHubNative.pagination(binding, response, request, selected, data.workflows.length, data.total_count) }
  })
})

// Resolve mutable ref once; contents always uses the resulting immutable commit.
// https://docs.github.com/en/rest/commits/commits#get-a-commit
// https://docs.github.com/en/rest/repos/contents#get-repository-content
export const source = Effect.fn("ActionsGitHubRead.source")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: { path: string; ref: string }) {
  const target = yield* GitHubNative.checked(binding, () => ({ path: GitHubNative.path(binding, input.path), ref: GitHubNative.ref(binding, input.ref) }))
  const repo = yield* GitHubNative.repository(transport, binding)
  const commitResponse = yield* GitHubNative.get(transport, binding, { method: "GET", path: `${repo.path}/commits/${encodeURIComponent(target.ref)}` })
  const commit = yield* GitHubNative.checked(binding, () => {
    const native = GitHubNative.decode(binding, Commit, commitResponse.data, "commit")
    if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(target.ref) && target.ref.toLowerCase() !== native.sha.toLowerCase())
      throw GitHubNative.error(binding, "source_conflict", "GitHub resolved commit does not match the requested immutable ref")
    return native
  })
  const response = yield* GitHubNative.get(transport, binding, { method: "GET", path: `${repo.path}/contents/${target.path}`, query: { ref: commit.sha } })
  const content = yield* GitHubNative.checked(binding, () => {
    const content = GitHubNative.decode(binding, Content, response.data, "source content")
    if (content.path !== input.path) throw GitHubNative.error(binding, "source_unresolved", "GitHub source path does not match the requested file")
    if (content.type !== "file" || content.target !== undefined || content.submodule_git_url !== undefined || content.encoding !== "base64" || content.content === undefined)
      throw GitHubNative.error(binding, "source_unresolved", "GitHub did not return authoritative full file content")
    if (content.size > 1024 * 1024 || content.content.length > 1500 * 1024)
      throw GitHubNative.error(binding, "metadata_truncated", "GitHub source exceeds the bounded content limit")
    const encoded = content.content.replace(/[\r\n]/g, "")
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source is not canonical Base64")
    const bytes = Buffer.from(encoded, "base64")
    if (bytes.toString("base64") !== encoded || bytes.length !== content.size)
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source content is incomplete")
    // GitHub supports both repository object algorithms; preserve either full ID.
    // https://docs.github.com/en/rest/repos/repos#get-the-hash-algorithm-for-a-repository
    if (createHash(content.sha.length === 40 ? "sha1" : "sha256").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== content.sha.toLowerCase())
      throw GitHubNative.error(binding, "source_unresolved", "GitHub source bytes do not match the authoritative blob ID")
    return { native: content, bytes }
  })
  const text = yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content.bytes),
    catch: () => GitHubNative.error(binding, "source_unresolved", "GitHub source is not valid UTF-8") })
  return { bindingID: binding.id, path: content.native.path, ref: input.ref, commit: commit.sha, version: content.native.sha, text, editable: false }
})

export const capabilities = Effect.fn("ActionsGitHubRead.capabilities")(function* (transport: ActionsContract.Transport, binding: Actions.Binding) {
  const repo = yield* GitHubNative.repository(transport, binding)
  // Prove this Actions endpoint, not only repository visibility or a repo role.
  yield* workflows(transport, binding, { limit: 1 })
  const observedAt = Date.now()
  const scopes = repo.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  const evidence = [scopes === undefined ? undefined : `Observed classic OAuth scopes: ${scopes.join(", ") || "none"}`,
    repo.native.permissions === undefined ? undefined : `Observed repository permissions: ${Object.entries(repo.native.permissions).map(([key, value]) => `${key}=${value}`).join(", ")}`]
    .filter((value) => value !== undefined).join("; ")
  return [Actions.Capability.make({ operation: "workflows.list", state: "available", scope: `repository:${binding.projectID}`,
    reason: "Native workflows GET succeeded", observedAt }),
    ...["source.read", "runs.list", "runs.read", "jobs.list", "workflow.dispatch", "workflow.enable", "workflow.disable", "source.write", "run.retry", "run.cancel", "run.delete"].map((operation) =>
      Actions.Capability.make({ operation, state: "unknown", scope: `repository:${binding.projectID}`,
        reason: `Endpoint or target eligibility has not been proved${evidence ? `; ${evidence}` : ""}`, observedAt }))]
})
