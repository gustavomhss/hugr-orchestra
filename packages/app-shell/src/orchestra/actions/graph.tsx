import type { Actions } from "@orchestra/schema/actions"
import { For, Match, Show, Switch, createEffect, createMemo, createUniqueId, onCleanup, onMount } from "solid-js"
import { createStore, type SetStoreFunction } from "solid-js/store"
import { Empty, Icon, Status } from "./components"
import { layout, type Box, type Layout, type Position } from "./layout"
import { aggregate, join, label, notes, placement } from "./matrix"
import type { Model, Translate, ViewProps } from "./contract"
const NODE_LIMIT = 240
const EDGE_LIMIT = 480
const WINDOW_LIMIT = 120
type View = { selectedID: string; zoom: number; expanded: boolean }
type Wire = { from: Position; to: Position; d: string; left: number; right: number; top: number; bottom: number }
type Snapshot = { key: string; owner: string; graph: Actions.Graph; definitions: ReadonlyMap<string, Actions.GraphJob> }
type Scene = { key: string; snapshot: Snapshot; layout: Layout; outgoing: ReadonlySet<string>; wires: Wire[] }
export function Graph(props: ViewProps) {
  const [view, setView] = createStore<View>({ selectedID: "", zoom: 1, expanded: false })
  const display = createMemo(() => readyGraph(props.model))
  const topology = createMemo<Snapshot | undefined>((previous) => {
    const graph = display()
    const source = props.model.state.source
    const owner = ownerKey(props.model, graph?.source ?? (source.status === "ready" ? source.value : undefined), previous?.owner)
    if (!graph) {
      if (source.status === "loading" || props.model.state.graph.status === "loading") {
        return previous?.owner === owner ? previous : undefined
      }
      return undefined
    }
    const key = sourceKey(graph)
    if (previous?.key === key && previous.owner === owner) {
      return { ...previous, graph }
    }
    return makeSnapshot(graph, key, owner)
  })
  const current = createMemo(() => {
    const graph = display()
    const value = topology()
    return graph && value?.key === sourceKey(graph) ? value : undefined
  })
  const joins = createMemo(() => joinExecutions(props.model, current()?.graph, current()?.definitions))
  // Matrix executions mode sizes each matrix box by its joined execution count.
  const scene = createMemo<Scene | undefined>((previous) => {
    const snapshot = current()
    if (!snapshot) return undefined
    const expand = new Map(view.expanded ? [...joins()].flatMap(([id, jobs]) => jobs.length > 1 ? [[id, jobs.length] as const] : []) : [])
    const key = `${snapshot.key}\0${JSON.stringify([...expand])}`
    if (previous?.key === key) return previous.snapshot === snapshot ? previous : { ...previous, snapshot }
    return makeScene(snapshot, key, expand)
  })
  createEffect((previous?: { key?: string; jobID?: string; resolved: boolean }) => {
    const key = topology()?.key
    const jobID = props.model.state.route.jobID
    const selected = routeDefinition(jobID, joins())
    const changed = key !== previous?.key || jobID !== previous?.jobID
    if (changed || (!previous?.resolved && selected)) setView("selectedID", selected)
    return { key, jobID, resolved: Boolean(selected) || (!changed && Boolean(previous?.resolved)) }
  })
  return (
    <section class="actions-detail actions-graph" aria-label={props.t("orchestra.actions.graph")}>
      <GraphState model={props.model} t={props.t} graph={display()} />
      <Show when={scene()}>
        {(entry) => (
          <Show
            when={entry().snapshot.graph.jobs.length}
            fallback={
              <Empty
                title={
                  props.model.state.filters.query
                    ? props.t("orchestra.actions.noMatches")
                    : props.t("orchestra.actions.emptyJobs")
                }
              />
            }
          >
            <Canvas
              snapshot={entry().snapshot}
              scene={entry()}
              joins={joins()}
              view={view}
              setView={setView}
              model={props.model}
              t={props.t}
            />
          </Show>
        )}
      </Show>
      <Jobs model={props.model} t={props.t} />
    </section>
  )
}
function readyGraph(model: Model) {
  const source = model.state.source
  const graph = model.state.graph
  const binding = model.state.binding
  const route = model.state.route
  if (model.state.unsupported || source.status !== "ready" || graph.status !== "ready") return undefined
  if (!source.value || !graph.value) return undefined
  const value = graph.value
  if (binding && value.source.bindingID !== binding.id) return undefined
  if (route.path && route.path !== value.source.path) return undefined
  if (route.ref && route.ref !== value.source.ref) return undefined
  if (value.source.bindingID !== source.value.bindingID) return undefined
  if (value.source.path !== source.value.path || value.source.ref !== source.value.ref) return undefined
  if (value.source.version !== source.value.version) return undefined
  return value
}
function sourceKey(graph: Actions.Graph) {
  return `${graph.source.bindingID}\0${graph.source.path}\0${graph.source.ref}\0${graph.source.version}`
}
function ownerKey(model: Model, source: Actions.Source | undefined, previous?: string) {
  const route = model.state.route
  const binding = model.state.binding?.id ?? source?.bindingID ?? previous?.split("\0")[0] ?? ""
  const path = route.path ?? source?.path ?? previous?.split("\0")[3] ?? ""
  const ref = route.ref ?? source?.ref ?? previous?.split("\0")[4] ?? ""
  return `${binding}\0${route.workflowID ?? ""}\0${route.runID ?? ""}\0${path}\0${ref}`
}
function makeSnapshot(graph: Actions.Graph, key: string, owner: string): Snapshot {
  const definitions = new Map<string, Actions.GraphJob>()
  for (const job of graph.jobs) if (!definitions.has(job.id)) definitions.set(job.id, job)
  return { key, owner, graph, definitions }
}
function makeScene(snapshot: Snapshot, key: string, expand: ReadonlyMap<string, number>): Scene {
  const graphLayout = layout(snapshot.graph, expand)
  const positions = new Map(graphLayout.nodes.map((node) => [node.id, node]))
  const outgoing = new Set(graphLayout.edges.map((edge) => edge.from))
  const wires = graphLayout.edges.flatMap((edge) => {
    const from = positions.get(edge.from)
    const to = positions.get(edge.to)
    if (!from || !to) return []
    const start = port(from, "out")
    const end = port(to, "in")
    const curve = Math.max(30, (end.x - start.x) / 2)
    return [{
      from,
      to,
      d: `M${start.x} ${start.y} C${start.x + curve} ${start.y},${end.x - curve} ${end.y},${end.x} ${end.y}`,
      left: Math.min(start.x, end.x, start.x + curve, end.x - curve),
      right: Math.max(start.x, end.x, start.x + curve, end.x - curve),
      top: Math.min(start.y, end.y),
      bottom: Math.max(start.y, end.y),
    }]
  })
  return { key, snapshot, layout: graphLayout, outgoing, wires }
}
function port(position: Position, side: "in" | "out") {
  const box = position.group
  if (box) return { x: side === "out" ? box.x + box.width : box.x, y: box.y + box.height / 2 }
  return { x: side === "out" ? position.x + 56 : position.x, y: position.y + 28 }
}
function GraphState(props: { model: Model; t: Translate; graph: Actions.Graph | undefined }) {
  const state = createMemo(() => ({ graph: props.model.state.graph, source: props.model.state.source, unsupported: props.model.state.unsupported }))
  const diagnostics = createMemo(() =>
    props.graph ? notes([...(props.graph.source.diagnostics ?? []), ...props.graph.diagnostics]) : [],
  )
  return (
    <Switch fallback={<Empty title={props.t("orchestra.actions.noSource")} />}>
      <Match when={state().unsupported}>
        <Empty title={props.t("orchestra.actions.unavailable")} />
      </Match>
      <Match when={state().graph.status === "loading" || state().source.status === "loading"}>
        <Empty title={props.t("orchestra.actions.loading")} />
      </Match>
      <Match when={state().graph.status === "error" || state().source.status === "error"}>
        <Empty title={props.t("orchestra.actions.unavailable")} error={props.t(state().graph.error?.message ?? state().source.error?.message ?? "orchestra.actions.unavailable")} />
      </Match>
      <Match when={props.graph}>
        <Show when={props.graph?.state !== "complete"}>
          <p class="provider-note" data-state={props.graph?.state}>{props.t("orchestra.actions.partialGraph")}</p>
        </Show>
        <Show when={diagnostics().length}>
          <ul class="provider-note actions-graph-notes">
            <For each={diagnostics()}>{(note) => <li>{props.t(note.key)}<For each={note.jobs}>{(job) => <code dir="ltr"><bdi>{job}</bdi></code>}</For></li>}</For>
          </ul>
        </Show>
      </Match>
    </Switch>
  )
}
function Canvas(props: {
  snapshot: Snapshot
  scene: Scene
  joins: ReadonlyMap<string, Actions.Job[]>
  view: View
  setView: SetStoreFunction<View>
  model: Model
  t: Translate
}) {
  let viewport: HTMLDivElement | undefined
  let frame = 0
  let pending = false
  const [measure, setMeasure] = createStore({ left: 0, top: 0, width: 0, height: 0 })
  const update = () => {
    if (pending) return
    pending = true
    frame = requestAnimationFrame(() => {
      pending = false
      setMeasure({
        left: viewport?.scrollLeft ?? 0,
        top: viewport?.scrollTop ?? 0,
        width: viewport?.clientWidth ?? 0,
        height: viewport?.clientHeight ?? 0,
      })
    })
  }
  const fit = () => {
    const zoom = viewport
      ? Math.max(.35, Math.min(1, Math.min(viewport.clientWidth / props.scene.layout.width, viewport.clientHeight / props.scene.layout.height)))
      : props.view.zoom
    props.setView("zoom", zoom)
    viewport?.scrollTo({ left: 0, top: 0 })
    update()
  }
  const matching = createMemo(() => {
    const query = props.model.state.filters.query.toLowerCase()
    const result = new Set<string>()
    for (const [id, job] of props.snapshot.definitions) {
      if (!query || id.toLowerCase().includes(query) || job.name.toLowerCase().includes(query) || job.stage?.toLowerCase().includes(query)) result.add(id)
    }
    return result
  })
  const visible = createMemo(() => {
    const left = measure.left / props.view.zoom - 132
    const top = measure.top / props.view.zoom - 56
    const right = left + measure.width / props.view.zoom + 264
    const bottom = top + measure.height / props.view.zoom + 160
    const nodes = props.scene.layout.nodes.filter((node) => {
      const box = node.group ?? { x: node.x, y: node.y, width: 132, height: 104 }
      return matching().has(node.id) && box.x < right && box.x + box.width > left && box.y < bottom && box.y + box.height > top
    })
    const edges = props.scene.wires.filter((wire) => wire.right >= left && wire.left <= right && wire.bottom >= top && wire.top <= bottom)
    return {
      nodes: nodes.slice(0, NODE_LIMIT),
      edges: matching().size ? edges.slice(0, EDGE_LIMIT) : [],
      dense: nodes.length > NODE_LIMIT || edges.length > EDGE_LIMIT,
    }
  })
  onMount(() => {
    if (!viewport) return
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    viewport.addEventListener("scroll", update, { passive: true })
    update()
    onCleanup(() => {
      observer.disconnect()
      viewport?.removeEventListener("scroll", update)
      cancelAnimationFrame(frame)
    })
  })
  const handleOwnerKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); props.setView("selectedID", "") }
  }
  const handleViewportKey = (event: KeyboardEvent) => {
    if (event.target !== viewport) return
    if (event.key === "+") {
      event.preventDefault()
      props.setView("zoom", Math.min(2, props.view.zoom + .1))
      update()
    }
    if (event.key === "-") {
      event.preventDefault()
      props.setView("zoom", Math.max(.35, props.view.zoom - .1))
      update()
    }
    if (event.key === "f") { event.preventDefault(); fit() }
    if (event.key.startsWith("Arrow")) {
      event.preventDefault()
      viewport?.scrollBy({ left: event.key === "ArrowLeft" ? -80 : event.key === "ArrowRight" ? 80 : 0, top: event.key === "ArrowUp" ? -80 : event.key === "ArrowDown" ? 80 : 0 })
    }
  }
  const matrices = createMemo(() => [...props.joins.values()].some((jobs) => jobs.length > 1))
  return (
    <div class="graph-area" onKeyDown={handleOwnerKey}>
      <div class="graph-caption">
        <span><Icon name="workflow" /><strong>{props.t(props.model.state.route.runID ? "orchestra.actions.graph.execution" : "orchestra.actions.graph.configuration")}</strong><small>{props.t("orchestra.actions.graph.declaredNeeds")}</small></span>
        <Show when={matrices()}>
          <div class="wf-range" role="group" aria-label={props.t("orchestra.actions.graph.matrixDisplay")}>
            <button type="button" aria-pressed={!props.view.expanded} onClick={() => props.setView("expanded", false)}>{props.t("orchestra.actions.graph.grouped")}</button>
            <button type="button" aria-pressed={props.view.expanded} onClick={() => props.setView("expanded", true)}>{props.t("orchestra.actions.graph.expanded")}</button>
          </div>
        </Show>
      </div>
      <div class="graph-layout" classList={{ "with-inspector": Boolean(props.view.selectedID) }}>
        <div ref={viewport} class="wf-canvas actions-canvas" dir="ltr" tabindex="0" onKeyDown={handleViewportKey}>
          <div class="graph-scene" style={{ width: `${props.scene.layout.width * props.view.zoom}px`, height: `${props.scene.layout.height * props.view.zoom}px` }}>
            <div class="graph-world" style={{ width: `${props.scene.layout.width}px`, height: `${props.scene.layout.height}px`, position: "relative", "transform-origin": "top left", transform: `scale(${props.view.zoom})` }}>
              <svg class="wf-wires" width={props.scene.layout.width} height={props.scene.layout.height} aria-hidden="true">
                <For each={visible().edges}>{(wire) => <path class="wf-wire" classList={{ on: props.view.selectedID === wire.from.id || props.view.selectedID === wire.to.id }} d={wire.d} />}</For>
              </svg>
              <For each={visible().nodes}>{(node) => <Show when={node.group} fallback={<Node
                node={node}
                job={props.snapshot.definitions.get(node.id)}
                outgoing={props.scene.outgoing.has(node.id)}
                executions={props.joins.get(node.id) ?? []} executionView={Boolean(props.model.state.route.runID)}
                selected={props.view.selectedID === node.id}
                t={props.t}
                select={(id) => props.setView("selectedID", id)}
                expand={() => props.setView("expanded", true)}
              />}>{(box) => <Group
                node={node}
                box={box()}
                job={props.snapshot.definitions.get(node.id)}
                outgoing={props.scene.outgoing.has(node.id)}
                executions={props.joins.get(node.id) ?? []}
                selected={props.view.selectedID === node.id}
                t={props.t}
                select={(id) => props.setView("selectedID", id)}
              />}</Show>}</For>
            </div>
          </div>
        </div>
        <Show when={props.view.selectedID ? props.snapshot.definitions.get(props.view.selectedID) : undefined}>{(job) => <Inspector job={job()} executions={props.joins.get(job().id) ?? []} snapshot={props.snapshot} model={props.model} t={props.t} close={() => props.setView("selectedID", "")} />}</Show>
      </div>
      <div class="canvas-controls">
        <button class="mx-btn" type="button" aria-label={props.t("orchestra.actions.zoomOut")} onClick={() => { props.setView("zoom", Math.max(.35, props.view.zoom - .1)); update() }}>-</button>
        <span class="mx-badge">{Math.round(props.view.zoom * 100)}%</span>
        <button class="mx-btn" type="button" aria-label={props.t("orchestra.actions.zoomIn")} onClick={() => { props.setView("zoom", Math.min(2, props.view.zoom + .1)); update() }}>+</button>
        <button class="mx-btn" type="button" aria-label={props.t("orchestra.actions.fit")} onClick={fit}>{props.t("orchestra.actions.fit")}</button>
      </div>
      <Show when={matching().size > 0 && visible().dense}><p class="provider-note">{props.t("orchestra.actions.unavailable")}</p></Show>
      <Show when={matching().size === 0 && props.model.state.filters.query}><Empty title={props.t("orchestra.actions.noMatches")} /></Show>
    </div>
  )
}
function statusIcon(status: string | null | undefined, conclusion: string | null | undefined) {
  const value = (conclusion ?? status ?? "").toLowerCase()
  if (["success", "successful", "passed", "pass"].includes(value)) return "check"
  if (["failure", "failed", "error"].includes(value)) return "close"
  return "warning"
}
function statusTone(status: string | null | undefined, conclusion: string | null | undefined) {
  const value = (conclusion ?? status ?? "").toLowerCase()
  if (["success", "successful", "passed", "pass"].includes(value)) return "good"
  if (["failure", "failed", "error"].includes(value)) return "bad"
  if (["running", "in_progress"].includes(value)) return "run"
  if (["waiting", "queued"].includes(value)) return "warm"
  return ""
}
function Glyph() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 9.5 3 2.5-3 2.5M12.5 15.5H17"/></svg>
}
function StateBadge(props: { status?: string | null; conclusion?: string | null }) {
  return <span class={`wf-state-badge ${statusTone(props.status, props.conclusion)}`} style={{ width: "17px", height: "17px" }}><Icon name={statusIcon(props.status, props.conclusion)} /></span>
}
function Node(props: { node: Position; job?: Actions.GraphJob; outgoing: boolean; executions: Actions.Job[]; executionView: boolean; selected: boolean; t: Translate; select: (id: string) => void; expand: () => void }) {
  const labelID = createUniqueId()
  const state = createMemo(() => aggregate(props.executions))
  const name = () => props.job ? label(props.job) : props.node.id
  return (
    <div class="wf-node" classList={{ sel: props.selected, "actions-matrix-node": props.executions.length > 1 }} style={{ left: `${props.node.x}px`, top: `${props.node.y}px` }}>
      <button class="wf-tile k-execute" type="button" aria-pressed={props.selected} aria-labelledby={labelID} title={props.t("orchestra.actions.definition")} style={{ width: "56px", height: "56px", "border-radius": "8px" }} onClick={() => props.select(props.node.id)}>
        <Glyph />
      </button>
      <Show when={props.job?.needs.length}><span class="wf-port in" /></Show>
      <Show when={props.outgoing}><span class="wf-port out" /></Show>
      <Show when={props.executions.length}><StateBadge status={state().status} conclusion={state().conclusion} /></Show>
      <Show when={props.executions.length > 1}><button class="actions-matrix-count" type="button" aria-label={props.t("orchestra.actions.graph.expand", { name: name() })} onClick={props.expand}>×{props.executions.length}</button></Show>
      <span id={labelID} class="wf-label"><bdi>{name()}</bdi><Show when={!props.executionView || props.executions.length < 2}><small><bdi>{(props.job ? placement(props.job) : undefined) ?? props.t(props.job?.matrix === undefined ? "orchestra.actions.unknown" : "orchestra.actions.graph.matrixRunner")}</bdi></small></Show><Show when={props.executionView}><span class="actions-node-result"><Show when={props.executions.length > 1}><small>{props.t("orchestra.actions.graph.runs", { count: props.executions.length })}</small></Show><Status status={state().status} conclusion={state().conclusion} t={props.t} /></span></Show></span>
    </div>
  )
}
function Group(props: { node: Position; box: Box; job?: Actions.GraphJob; outgoing: boolean; executions: Actions.Job[]; selected: boolean; t: Translate; select: (id: string) => void }) {
  const state = createMemo(() => aggregate(props.executions))
  const name = () => props.job ? label(props.job) : props.node.id
  return (
    <section class="wf-group actions-matrix-group" classList={{ selected: props.selected }} aria-label={name()} style={{ left: `${props.box.x}px`, top: `${props.box.y}px`, width: `${props.box.width}px`, height: `${props.box.height}px` }}>
      <div class="wf-group-head">
        <button type="button" aria-pressed={props.selected} onClick={() => props.select(props.node.id)}><b><bdi>{name()}</bdi></b></button>
        <small>{props.t("orchestra.actions.graph.runs", { count: props.executions.length })}</small>
        <span class={`wf-dot ${statusTone(state().status, state().conclusion)}`} aria-hidden="true" />
      </div>
      <Show when={props.job?.needs.length}><span class="wf-port in" /></Show>
      <Show when={props.outgoing}><span class="wf-port out" /></Show>
      <For each={props.executions}>{(execution, index) => (
        <div class="wf-node" classList={{ sel: props.selected }} style={{ left: `${props.node.x - props.box.x}px`, top: `${58 + index() * 112}px` }}>
          <button class="wf-tile k-execute" type="button" aria-label={execution.name} title={execution.name} style={{ width: "56px", height: "56px", "border-radius": "8px" }} onClick={() => props.select(props.node.id)}>
            <Glyph />
          </button>
          <StateBadge status={execution.status} conclusion={execution.conclusion} />
          <span class="wf-label"><bdi>{execution.name}</bdi><Status status={execution.status} conclusion={execution.conclusion ?? undefined} t={props.t} /></span>
        </div>
      )}</For>
    </section>
  )
}
function Inspector(props: { job: Actions.GraphJob; executions: Actions.Job[]; snapshot: Snapshot; model: Model; t: Translate; close: () => void }) {
  const [page, setPage] = createStore({ start: 0 })
  const source = createMemo(() => props.snapshot.graph.source)
  const configuration = createMemo(() => props.job.configuration ?? { runner: props.job.runner, matrix: props.job.matrix, reusable: props.job.reusable, condition: props.job.condition, steps: props.job.steps })
  const entries = createMemo(() => props.executions.slice(page.start, page.start + WINDOW_LIMIT))
  const sourceKey = createMemo(() => `${source().bindingID}\0${source().path}\0${source().ref}\0${source().version}\0${props.job.id}`)
  createEffect((previous?: string) => { const key = sourceKey(); const maximum = Math.max(0, Math.floor((props.executions.length - 1) / WINDOW_LIMIT) * WINDOW_LIMIT); if (key !== previous) setPage("start", 0); if (page.start > maximum) setPage("start", maximum); return key })
  return (
    <aside class="job-inspector wf-drawer" aria-label={props.t("orchestra.actions.definition")}>
      <header class="wf-drawer-head"><div><h2><bdi>{label(props.job)}</bdi></h2><p>{props.t("orchestra.actions.definition")}</p></div><button class="mx-btn" type="button" aria-label={props.t("orchestra.actions.close")} onClick={props.close}><Icon name="close" /></button></header>
      <div class="wf-drawer-list">
        <dl class="wf-kv"><dt>{props.t("orchestra.actions.source")}</dt><dd><code dir="ltr">{source().path}</code></dd><dt>{props.t("orchestra.actions.ref")}</dt><dd><code dir="ltr">{source().ref}</code></dd><dt>{props.t("orchestra.actions.commit")}</dt><dd><code dir="ltr">{source().commit ?? props.t("orchestra.actions.unknown")}</code></dd><dt>{props.t("orchestra.actions.source")}</dt><dd><code dir="ltr">{source().version}</code></dd></dl>
        <pre><code dir="ltr">{JSON.stringify({ needs: props.job.needs, configuration: configuration() }, null, 2)}</code></pre>
        <Status status={aggregate(props.executions).status ?? "unknown"} conclusion={aggregate(props.executions).conclusion ?? undefined} t={props.t} />
        <Show when={props.executions.length} fallback={<p class="provider-note">{props.t("orchestra.actions.unjoined")}</p>}>
          <h3>{props.t("orchestra.actions.executions")}</h3>
          <For each={entries()}>{(job) => <button class="mx-btn" type="button" onClick={() => props.model.navigate({ ...props.model.state.route, view: "job", jobID: job.id, runID: job.runID, attempt: job.attempt })}><bdi>{job.id}</bdi><Status status={job.status ?? "unknown"} conclusion={job.conclusion ?? undefined} t={props.t} /></button>}</For>
          <Show when={page.start > 0}><button class="mx-btn" type="button" onClick={() => setPage("start", Math.max(0, page.start - WINDOW_LIMIT))}>{props.t("orchestra.actions.previous")}</button></Show>
          <Show when={page.start + WINDOW_LIMIT < props.executions.length}><button class="mx-btn" type="button" onClick={() => setPage("start", page.start + WINDOW_LIMIT)}>{props.t("orchestra.actions.more")}</button></Show>
        </Show>
        <button class="mx-btn" type="button" onClick={() => props.model.navigate({ ...props.model.state.route, tab: "source" })}>{props.t("orchestra.actions.source")}</button>
      </div>
    </aside>
  )
}
function Jobs(props: { model: Model; t: Translate }) {
  const scoped = createMemo(() => scopedJobs(props.model))
  const filtered = createMemo(() => { const query = props.model.state.filters.query.toLowerCase(); return scoped().filter((job) => !query || job.id.toLowerCase().includes(query) || job.name.toLowerCase().includes(query)) })
  return <Show when={props.model.state.jobs.status === "ready"}><Show when={filtered().length} fallback={<Empty title={props.model.state.filters.query ? props.t("orchestra.actions.noMatches") : props.t("orchestra.actions.emptyJobs")} />}><JobWindow jobs={filtered()} model={props.model} t={props.t} /></Show></Show>
}
function JobWindow(props: { jobs: Actions.Job[]; model: Model; t: Translate }) {
  const [window, setWindow] = createStore({ start: 0 })
  let list: HTMLDivElement | undefined
  const identity = createMemo(() => props.jobs.map((job) => job.id).join("\0"))
  const reset = () => { setWindow("start", 0); list?.scrollTo({ top: 0 }) }
  createEffect((previous?: string) => { const key = identity(); if (key !== previous) reset(); return key })
  const onScroll = () => setWindow("start", Math.min(Math.max(0, props.jobs.length - WINDOW_LIMIT), Math.floor((list?.scrollTop ?? 0) / 42)))
  return (
    <div class="job-window" ref={list} onScroll={onScroll} style={{ "max-height": "420px", overflow: "auto" }}>
      <h2>{props.t("orchestra.actions.jobs")}</h2>
      <div style={{ height: `${props.jobs.length * 42}px`, position: "relative" }}>
        <For each={props.jobs.slice(window.start, window.start + WINDOW_LIMIT)}>{(job, index) => (
          <button class="mx-btn" type="button" style={{ position: "absolute", top: `${(window.start + index()) * 42}px`, height: "42px", "inline-size": "100%" }} onClick={() => props.model.navigate({ ...props.model.state.route, view: "job", jobID: job.id, runID: job.runID, attempt: job.attempt })}>
            <bdi>{job.name}</bdi><code dir="ltr">{job.id}</code>
            <Status status={job.status ?? "unknown"} conclusion={job.conclusion ?? undefined} t={props.t} />
          </button>
        )}</For>
      </div>
    </div>
  )
}
function scopedJobs(model: Model) {
  const data = model.state.jobs
  const run = model.state.run
  const route = model.state.route
  if (data.status !== "ready" || !data.value || run.status !== "ready" || !run.value) return []
  const attempt = route.attempt ?? run.value.attempt
  return data.value.items.filter((job) => {
    return job.bindingID === run.value?.bindingID &&
      (!model.state.binding || model.state.binding.id === job.bindingID) &&
      job.runID === run.value?.id &&
      (!route.runID || route.runID === run.value?.id) &&
      (!route.workflowID || route.workflowID === run.value?.workflowID) &&
      (attempt === undefined || job.attempt === attempt)
  })
}
function joinExecutions(model: Model, graph: Actions.Graph | undefined, definitions: ReadonlyMap<string, Actions.GraphJob> | undefined) {
  const result = new Map<string, Actions.Job[]>()
  const run = model.state.run
  const jobs = model.state.jobs
  const source = model.state.source
  const route = model.state.route
  if (!graph || !definitions || run.status !== "ready" || !run.value || jobs.status !== "ready" || !jobs.value) return result
  if (source.status !== "ready" || !source.value || !source.value.commit) return result
  if (run.value.commit !== source.value.commit || graph.source.commit !== source.value.commit) return result
  if (route.runID && route.runID !== run.value.id) return result
  if (route.workflowID && route.workflowID !== run.value.workflowID) return result
  if (model.state.binding && model.state.binding.id !== run.value.bindingID) return result
  const value = run.value
  const attempt = route.attempt ?? value.attempt
  return join(definitions, jobs.value.items.filter((job) => job.bindingID === value.bindingID && job.bindingID === graph.source.bindingID && job.runID === value.id && (attempt === undefined || job.attempt === attempt)))
}
function routeDefinition(jobID: string | undefined, joins: ReadonlyMap<string, Actions.Job[]>) { if (!jobID) return ""; for (const [definitionID, jobs] of joins) if (jobs.some((job) => job.id === jobID)) return definitionID; return "" }
