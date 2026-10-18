import type { Actions } from "@orchestra/schema/actions"
import type { State } from "./contract"
import { join } from "./matrix"

// The selected run's jobs for the selected attempt, bounded like every run list. Tabs, counts and the context
// rail all read this one list so they cannot disagree.
export function runJobs(state: State, runID: string) {
  const attempt = state.route.attempt ?? (state.run.value?.id === runID ? state.run.value.attempt : undefined)
  return state.jobs.value?.items.filter((item) => item.runID === runID && item.bindingID === state.binding?.id
    && (attempt === undefined || item.attempt === undefined || item.attempt === attempt)).slice(0, 100) ?? []
}

// Definition per job id for the selected run. The graph must be this workflow file at the run's exact commit; a
// partial graph (run-time matrix values) still declares every job key and its needs. Names join only on GitHub:
// on GitLab the same name does not prove a definition (gitlab/jobs.ts).
export function runJoins(state: State) {
  const graph = state.graph.status === "ready" ? state.graph.value : undefined
  const run = state.run.status === "ready" ? state.run.value : undefined
  const binding = state.binding
  const workflow = state.workflows.value?.items.find((item) => item.id === run?.workflowID && item.bindingID === binding?.id)
  if (!graph || graph.state === "unresolved" || !run || !binding || !workflow || run.id !== state.route.runID || run.bindingID !== binding.id
    || graph.source.bindingID !== binding.id || graph.source.path !== workflow.path || !graph.source.commit
    || graph.source.commit !== run.commit || graph.source.ref !== run.commit) return { graph: undefined, jobs: new Map<string, Actions.GraphJob>() }
  const definitions = new Map(graph.jobs.map((job) => [job.id, job] as const))
  const joined = join(definitions, runJobs(state, run.id), binding.provider.kind === "github")
  return { graph, jobs: new Map([...joined].flatMap(([id, jobs]) => jobs.map((job) => [job.id, definitions.get(id)] as const))
    .filter((entry): entry is readonly [string, Actions.GraphJob] => entry[1] !== undefined)) }
}
