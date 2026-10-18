export * as GitHubRuns from "./runs"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "./native"

const Run = Schema.Struct({
  id: GitHubNative.ID, workflow_id: GitHubNative.ID, repository: GitHubNative.Repository,
  name: Schema.NullOr(Schema.String), display_title: Schema.optionalKey(Schema.String), run_number: Schema.optionalKey(GitHubNative.Positive), head_branch: Schema.NullOr(Schema.String), head_sha: GitHubNative.SHA,
  event: Schema.NonEmptyString, status: Schema.NullOr(Schema.String), conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)),
  run_attempt: Schema.optionalKey(GitHubNative.Positive), actor: Schema.optionalKey(Schema.NullOr(Schema.Struct({ login: Schema.NonEmptyString }))),
  triggering_actor: Schema.optionalKey(Schema.NullOr(Schema.Struct({ login: Schema.NonEmptyString }))),
  created_at: GitHubNative.Time, updated_at: Schema.optionalKey(GitHubNative.Time), run_started_at: Schema.optionalKey(GitHubNative.Time), html_url: Schema.String,
})
const Runs = Schema.Struct({ total_count: Schema.optionalKey(GitHubNative.Count), workflow_runs: Schema.Array(Run) })
const statuses = new Set(["completed", "action_required", "cancelled", "failure", "neutral", "skipped", "stale", "success", "timed_out", "in_progress", "queued", "requested", "waiting", "pending"])

// https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
export const list = Effect.fn("ActionsGitHubRead.runs")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: Actions.RunListInput) {
  const query = yield* GitHubNative.checked(binding, () => {
    if (input.workflowID !== undefined) GitHubNative.id(binding, input.workflowID)
    if (input.ref !== undefined) GitHubNative.ref(binding, input.ref)
    if (input.commit !== undefined && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.commit)) throw GitHubNative.error(binding, "invalid_input", "GitHub run commit filter requires a full SHA")
    if (input.event !== undefined && !/^[a-z][a-z0-9_]{0,127}$/.test(input.event)) throw GitHubNative.error(binding, "invalid_input", "GitHub event filter is invalid")
    if (input.actor !== undefined && !/^[A-Za-z0-9-]+(?:\[bot\])?$/.test(input.actor)) throw GitHubNative.error(binding, "invalid_input", "GitHub actor filter is invalid")
    if (input.status !== undefined && !statuses.has(input.status)) throw GitHubNative.error(binding, "invalid_input", "GitHub run status filter is invalid")
    return Object.fromEntries(Object.entries({ branch: input.ref, event: input.event, status: input.status,
      head_sha: input.commit, actor: input.actor, created: created(binding, input) }).filter((entry): entry is [string, string] => entry[1] !== undefined))
  })
  const selected = yield* GitHubNative.checked(binding, () => GitHubNative.selection(binding, "github.runs", { ...query, workflowID: input.workflowID }, input.cursor, input.limit))
  const repo = yield* GitHubNative.repository(transport, binding)
  const request = { method: "GET", path: input.workflowID === undefined ? `${repo.path}/actions/runs` : `${repo.path}/actions/workflows/${input.workflowID}/runs`,
    query: { ...query, page: selected.page, per_page: selected.per_page } } as const
  const response = yield* GitHubNative.get(transport, binding, request)
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Runs, response.data, "run list")
    return { items: data.workflow_runs.map((item) => {
      if (input.workflowID !== undefined && String(item.workflow_id) !== input.workflowID)
        throw GitHubNative.error(binding, "transport_failed", "GitHub returned a run from another workflow")
      return project(binding, item)
    }), ...GitHubNative.pagination(binding, response, request, selected, data.workflow_runs.length, data.total_count) }
  })
})

// https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run
export const read = Effect.fn("ActionsGitHubRead.run")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, target: string) {
  yield* GitHubNative.checked(binding, () => GitHubNative.id(binding, target))
  const repo = yield* GitHubNative.repository(transport, binding)
  return yield* at(transport, binding, repo.path, target)
})

export const at = Effect.fn("ActionsGitHubRead.runAt")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, repo: string, target: string) {
  const response = yield* GitHubNative.get(transport, binding, { method: "GET", path: `${repo}/actions/runs/${target}` })
  return yield* GitHubNative.checked(binding, () => {
    const data = GitHubNative.decode(binding, Run, response.data, "run")
    if (String(data.id) !== target) throw GitHubNative.error(binding, "transport_failed", "GitHub returned another run ID")
    return project(binding, data)
  })
})

function project(binding: Actions.Binding, data: typeof Run.Type): Actions.Run {
  if (String(data.repository.id) !== binding.projectID)
    throw GitHubNative.error(binding, "binding_stale", "GitHub run repository ID does not match the binding")
  // Native updated_at is not an authoritative completion time, so it never becomes finishedAt; once a run is
  // completed it is the last native stamp, which is what the GitHub UI and CLI use for run duration.
  const duration = data.status === "completed" && data.updated_at !== undefined && data.run_started_at !== undefined
    ? Math.round((Date.parse(data.updated_at) - Date.parse(data.run_started_at)) / 1000) : undefined
  return { id: String(data.id), bindingID: binding.id, workflowID: String(data.workflow_id), name: data.name,
    ref: data.head_branch, commit: data.head_sha, event: data.event, status: data.status,
    repositoryID: String(data.repository.id), createdAt: data.created_at, url: data.html_url,
    ...(data.actor == null ? {} : { actor: data.actor.login }),
    ...(data.triggering_actor == null ? {} : { triggeringActor: data.triggering_actor.login }),
    ...(data.updated_at === undefined ? {} : { updatedAt: data.updated_at }),
    ...(data.conclusion === undefined ? {} : { conclusion: data.conclusion }),
    ...(data.run_attempt === undefined ? {} : { attempt: data.run_attempt }),
    ...(data.display_title === undefined ? {} : { title: data.display_title }),
    ...(data.run_number === undefined ? {} : { number: data.run_number }),
    ...(duration === undefined || !Number.isFinite(duration) || duration < 0 ? {} : { duration }),
    ...(data.run_started_at === undefined ? {} : { startedAt: data.run_started_at }) }
}

// GitHub created uses inclusive native range/comparison syntax, not updated filters.
// https://docs.github.com/en/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax#query-for-dates
function created(binding: Actions.Binding, input: Actions.RunListInput) {
  if (input.updatedAfter !== undefined || input.updatedBefore !== undefined)
    throw GitHubNative.error(binding, "capability_unavailable", "GitHub workflow runs do not support native updated-time filters")
  if (input.created !== undefined && (input.createdAfter !== undefined || input.createdBefore !== undefined))
    throw GitHubNative.error(binding, "invalid_input", "GitHub created cannot be combined with explicit created-time bounds")
  if (input.created !== undefined) {
    const range = input.created.split("..")
    if (range.length === 1) {
      date(binding, input.created.replace(/^[<>]=?/, ""))
      return input.created
    }
    if (range.length !== 2 || range.every((bound) => bound === "*"))
      throw GitHubNative.error(binding, "invalid_input", "GitHub created filter requires a native date comparison or range")
    const after = range[0] === "*" ? undefined : date(binding, range[0])
    const before = range[1] === "*" ? undefined : date(binding, range[1])
    if (after !== undefined && before !== undefined && after > before)
      throw GitHubNative.error(binding, "invalid_input", "GitHub created-time range is reversed")
    return input.created
  }
  const after = input.createdAfter === undefined ? undefined : date(binding, input.createdAfter)
  const before = input.createdBefore === undefined ? undefined : date(binding, input.createdBefore)
  if (after !== undefined && before !== undefined && after > before)
    throw GitHubNative.error(binding, "invalid_input", "GitHub created-time range is reversed")
  if (input.createdAfter !== undefined && input.createdBefore !== undefined) return `${input.createdAfter}..${input.createdBefore}`
  if (input.createdAfter !== undefined) return `>=${input.createdAfter}`
  if (input.createdBefore !== undefined) return `<=${input.createdBefore}`
}

function date(binding: Actions.Binding, value: string) {
  const instant = Date.parse(value)
  const local = value.length === 10 ? `${value}T00:00:00` : value.slice(0, 19)
  if (!/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d))?$/.test(value) || !Number.isFinite(instant) ||
      new Date(`${local}Z`).toISOString().slice(0, 19) !== local)
    throw GitHubNative.error(binding, "invalid_input", "GitHub created-time bound requires a valid ISO date or second-resolution timestamp with timezone")
  return instant
}
