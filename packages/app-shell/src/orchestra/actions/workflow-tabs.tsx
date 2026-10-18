import { For } from "solid-js"
import type { ViewProps } from "./contract"
import { tabKeydown } from "./entry-routing"

const tabs = [
  ["graph", "orchestra.actions.jobGraph", "workflow"],
  ["runs", "orchestra.actions.workflowRuns", "runs"],
  ["source", "orchestra.actions.source", "source"],
] as const

export function WorkflowTabs(props: ViewProps) {
  const selected = () => props.model.state.route.view === "runs" ? "runs"
    : props.model.state.route.view === "source" || props.model.state.route.tab === "source" ? "source" : "graph"
  return <nav class="wf-tabs" role="tablist" aria-label={props.t("orchestra.actions.workflow")} onKeyDown={tabKeydown}>
    <For each={tabs}>{(tab) => <button type="button" class="wf-tab" role="tab" aria-selected={selected() === tab[0]}
      tabindex={selected() === tab[0] ? 0 : -1} onClick={() => {
        const route = props.model.state.route
        props.model.navigate({ view: tab[2], workflowID: route.workflowID, path: route.path, ref: route.ref,
          tab: tab[0] === "runs" ? undefined : tab[0] })
      }}>{props.t(tab[1])}</button>}</For>
  </nav>
}
