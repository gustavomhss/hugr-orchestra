import { skipToken, useQuery } from "@tanstack/solid-query"
import { createMemo, createSignal, Show } from "solid-js"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { type PanelEntry, AddPanel } from "./add-panel"
import { Canvas, type CanvasApi, type NodeOverlay } from "./canvas"
import { hookEntries, WORKFLOW_ENTRIES } from "./catalog"
import type { RelayDecision, RelayDocument, RelayInstall, RelayKind, RelayRun } from "./client"
import { HookDetails, hookOperations, triggerName } from "./details-hook"
import { WorkflowDetails } from "./details-workflow"
import type { SaveState } from "./editor-head"
import type { EditorProps } from "./editor"
import { runHandle, RUN_TONE } from "./format"
import {
  CONDITION,
  type Flow,
  type FlowEdge,
  flowFromDocument,
  type Issue,
  issueNode,
  nodeOf,
  type Outputs,
  readChecklist,
  removeEdge,
  removeNodes,
  START,
  TRIGGER,
} from "./graph"
import { addNode, defaultAnchor, groupSelection } from "./insert"
import { issueText, stateLabel } from "./parts"
import { layerBase, relayPath } from "./route"
import { Ic, useRelayCopy } from "./ui"

type Props = EditorProps & {
  kind: RelayKind
  document: RelayDocument
  flow: Flow
  outputs: Outputs
  issues: Issue[]
  selected: string[]
  run: RelayRun | undefined
  runs: RelayRun[]
  decision: RelayDecision | undefined
  installed: RelayInstall | undefined
  test: { path: string[]; result: string; label: string } | undefined
  save: SaveState
  edit: (flow: Flow) => void
  select: (ids: string[]) => void
  api: (api: CanvasApi) => void
  keys: (handler: (event: KeyboardEvent) => void) => void
  onKeys: () => void
  onTest: () => void
  onClearTest: () => void
}

// The Editor tab: the canvas with its banner, the add panel and node details, each layer on its own URL.
export function CanvasTab(props: Props) {
  const copy = useRelayCopy()
  const serverSDK = useServerSDK()
  const [anchor, setAnchor] = createSignal<{ id: string; port: number }>()
  const [focusPhase, setFocusPhase] = createSignal<string>()
  let api: CanvasApi | undefined
  const workflow = () => props.kind === "workflow"
  const types = () => props.source.nodeTypes.data?.[props.kind]
  const issueNodes = createMemo(() => new Set(props.issues.flatMap((issue) => issueNode(issue) ?? [])))
  const base = () => layerBase(props.route)
  const step = (id: string) => props.run?.steps.find((item) => item.wp === id)

  const overlay = (node: import("./graph").FlowNode): NodeOverlay | undefined => {
    if (props.test) return props.test.path.includes(node.id) ? undefined : { dim: true }
    if (!workflow() || !props.run || node.type === START) return
    const result = step(node.id)
    if (!result) return
    const passed = result.checks.filter((check) => check.verdict === "pass").length
    if (result.status === "passed")
      return {
        badge: "good",
        subTone: "good",
        sub: [
          result.checks.length
            ? copy.t("orchestra.workflows.canvas.checks", { passed, total: result.checks.length })
            : copy.t("orchestra.workflows.canvas.passed"),
          result.attempts > 1 ? copy.t("orchestra.workflows.canvas.tries", { count: result.attempts }) : undefined,
        ]
          .filter(Boolean)
          .join(" · "),
      }
    if (result.status === "escalated")
      return {
        badge: "warm",
        subTone: "warm",
        sub: copy.t("orchestra.workflows.canvas.waiting", { attempt: result.attempts }),
      }
    if (result.status === "failed")
      return { badge: "bad", subTone: "bad", sub: copy.t("orchestra.workflows.canvas.failed") }
    if (result.status === "running") return { badge: "run", sub: copy.t("orchestra.workflows.canvas.running") }
  }
  const sub = (node: import("./graph").FlowNode) => {
    if (node.type === START)
      return copy.t("orchestra.workflows.canvas.budget", { count: Number(node.parameters.relayRetryBudget ?? 3) })
    if (node.type === TRIGGER)
      return copy.t(
        node.parameters.timing === "after" ? "orchestra.hooks.canvas.after" : "orchestra.hooks.canvas.before",
      )
    if (node.type === CONDITION) return String(node.parameters.pattern || copy.t("orchestra.hooks.canvas.noPattern"))
    if (node.type === "relay.hookVerify")
      return String(node.parameters.check || copy.t("orchestra.hooks.canvas.noCommand"))
    if (!workflow()) return ""
    const count = copy.count(
      readChecklist(node).controls.length,
      "orchestra.workflows.count.check.one",
      "orchestra.workflows.count.check.other",
    )
    return node.type === "relay.review" ? `${copy.t("orchestra.workflows.canvas.review")} · ${count}` : count
  }

  const entries = (): PanelEntry[] => {
    if (workflow())
      return WORKFLOW_ENTRIES.map((entry) => ({
        key: entry.key,
        group: copy.t(`orchestra.workflows.group.${entry.group}`),
        glyph: entry.glyph,
        tone: entry.tone,
        label: copy.t(`orchestra.workflows.type.${entry.key}`),
        description: copy.t(`orchestra.workflows.typeDesc.${entry.key}`),
        disabled: entry.key === "phase" && !props.selected.some((id) => nodeOf(props.flow, id)?.type !== START),
      }))
    const hasTrigger = props.flow.nodes.some((node) => node.type === TRIGGER)
    const operations = hookOperations(types())
    return hookEntries(types()).flatMap((entry): PanelEntry[] => {
      if (entry.group !== "trigger")
        return [
          {
            key: entry.key,
            group: copy.t(`orchestra.hooks.group.${entry.group}`),
            glyph: entry.glyph,
            tone: entry.tone,
            label: copy.t(`orchestra.hooks.type.${entry.key}`),
            description: copy.t(`orchestra.hooks.typeDesc.${entry.key}`),
          },
        ]
      return operations
        .filter((item) => item.operation === entry.operation)
        .map((item) => ({
          key: `trigger:${item.operation}:${item.timing}`,
          group: copy.t("orchestra.hooks.group.trigger"),
          glyph: entry.glyph,
          tone: entry.tone,
          label: triggerName(copy, item.operation, item.timing, types()),
          description: copy.t(
            item.timing === "after" ? "orchestra.hooks.typeDesc.after" : "orchestra.hooks.typeDesc.before",
          ),
          disabled: hasTrigger,
        }))
    })
  }
  const panelAnchor = () => anchor() ?? defaultAnchor(props.flow, props.selected)
  const pick = (key: string, at?: { x: number; y: number }) => {
    if (key === "phase") {
      const grouped = groupSelection(props.flow, props.selected, copy.t("orchestra.workflows.canvas.newPhase"))
      if (!grouped) return
      props.edit(grouped.flow)
      setFocusPhase(grouped.id)
      const start = props.flow.nodes.find((node) => node.type === START)
      return props.go(start ? relayPath.node(props.kind, props.document.id, start.id) : base(), true)
    }
    const [prefix, operation, timing] = key.split(":")
    const trigger = prefix === "trigger"
    const step = WORKFLOW_ENTRIES.find((item) => item.key === key)
    const action = hookEntries(types()).find((item) => item.key === key && item.group !== "trigger")
    const type = trigger ? TRIGGER : (step ?? action)?.type
    if (!type) return
    const name = trigger
      ? triggerName(copy, operation, timing, types())
      : step
        ? copy.t(`orchestra.workflows.newName.${step.key}`)
        : action && action.group !== "trigger"
          ? copy.t(`orchestra.hooks.type.${action.key}`)
          : type
    const added = addNode(
      props.flow,
      { key, type, name, operation, timing, anchor: at ? undefined : panelAnchor(), at },
      types(),
    )
    setAnchor(undefined)
    props.edit(added.flow)
    props.select([added.id])
    props.go(relayPath.node(props.kind, props.document.id, added.id), true)
  }
  const remove = (ids: string[]) => {
    if (ids.some((id) => nodeOf(props.flow, id)?.type === START))
      showToast({ title: copy.t("orchestra.workflows.canvas.startStays") })
    const next = removeNodes(props.flow, ids)
    if (next.nodes.length === props.flow.nodes.length) return
    props.edit(next)
    props.select([])
  }
  const onEdge = (edge: FlowEdge, action: "insert" | "remove") => {
    if (action === "remove") return props.edit(removeEdge(props.flow, edge))
    setAnchor({ id: edge.from, port: edge.port })
    props.select([edge.from])
    props.go(relayPath.add(props.kind, props.document.id))
  }
  const open = (id: string) => props.go(relayPath.node(props.kind, props.document.id, id, props.route.view))
  props.keys((event) => {
    const target = event.target instanceof HTMLElement ? event.target : undefined
    if (target && target !== document.body && !target.closest(".wf-canvas")) return
    const last = props.selected.at(-1)
    if ((event.key === "Enter" || event.key === "F2") && last) return (event.preventDefault(), open(last))
    if ((event.key === "Delete" || event.key === "Backspace") && props.selected.length)
      return (event.preventDefault(), remove(props.selected))
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown"
    if (!forward && event.key !== "ArrowLeft" && event.key !== "ArrowUp") return
    event.preventDefault()
    if (!last) return props.flow.nodes[0] && props.select([props.flow.nodes[0].id])
    const edge = props.flow.edges.find((item) => (forward ? item.from === last : item.to === last))
    const next = edge && (forward ? edge.to : edge.from)
    if (!next) return
    props.select([next])
    api?.center(next)
  })

  // Node details read the run's own version for "Instructions sent".
  const frozen = useQuery(
    () => ({
      queryKey: props.source.key("version", props.document.id, String(props.run?.version ?? "")),
      queryFn:
        props.route.node && props.run?.version !== undefined
          ? () => props.source.client.version(props.document.id, String(props.run!.version))
          : skipToken,
      retry: false,
      staleTime: Infinity,
    }),
    props.source.queryClient,
  )
  const skills = useQuery(
    () => ({
      queryKey: props.source.key("skills"),
      queryFn:
        props.route.node && workflow()
          ? () =>
              serverSDK()
                .currentApi.skill.list({ location: { directory: props.directory } })
                .then(
                  (result) => result.data.map((skill) => skill.name),
                  () => [],
                )
          : skipToken,
      retry: false,
      staleTime: 60_000,
    }),
    props.source.queryClient,
  )
  const detail = () => nodeOf(props.flow, props.route.node)
  const banner = () => {
    if (props.test)
      return (
        <div class="wf-banner">
          <Ic name="test" />
          <span>{copy.t("orchestra.hooks.canvas.test", { label: props.test.label, result: props.test.result })}</span>
          <small>{copy.t("orchestra.hooks.canvas.graphOnly")}</small>
          <button type="button" class="mx-btn" onClick={props.onClearTest}>
            {copy.t("orchestra.hooks.canvas.clear")}
          </button>
        </div>
      )
    if (workflow() && props.run) {
      const run = props.run
      const at = nodeOf(props.flow, run.position)?.name ?? run.position ?? ""
      const viewing = !!props.route.view
      const id = runHandle(run.runID)
      const text = viewing
        ? copy.t(
            run.position && run.status !== "completed"
              ? "orchestra.workflows.banner.viewingAt"
              : "orchestra.workflows.banner.viewing",
            { id, state: stateLabel(copy, run), step: at },
          )
        : run.status === "parked"
          ? copy.t("orchestra.workflows.banner.waiting", { id, step: at })
          : run.status === "running"
            ? copy.t("orchestra.workflows.banner.running", { id, step: at })
            : copy.t("orchestra.workflows.banner.last", {
                id,
                state: stateLabel(copy, run),
                when: copy.when(run.startedAt),
              })
      return (
        <div class="wf-banner" classList={{ warm: run.status === "parked" }}>
          <span class={`wf-dot ${RUN_TONE[run.status]}`} />
          <span>{text}</span>
          <Show when={!viewing && run.version !== undefined && run.version !== props.document.versionCounter}>
            <small>v{run.version}</small>
          </Show>
          <button
            type="button"
            class={run.status === "parked" && !viewing ? "mx-btn primary" : "mx-btn"}
            onClick={() =>
              viewing
                ? props.close(relayPath.history("workflow", props.document.id, run.runID))
                : props.go(relayPath.history("workflow", props.document.id, run.runID))
            }
          >
            {copy.t(
              viewing
                ? "orchestra.workflows.banner.back"
                : run.status === "parked"
                  ? "orchestra.workflows.live.review"
                  : "orchestra.workflows.banner.view",
            )}
          </button>
        </div>
      )
    }
    if (!workflow() && props.installed)
      return (
        <div class="wf-banner">
          <span class="wf-dot good" />
          <span>
            {[
              copy.t("orchestra.hooks.canvas.installed", {
                profile: props.profile,
                version: props.installed.version ?? props.document.publishedCounter ?? "",
              }),
              props.decision
                ? `${props.decision.outcome} ${copy.when(props.decision.at)}`
                : copy.t("orchestra.hooks.canvas.notFired"),
            ].join(" · ")}
          </span>
          <button type="button" class="mx-btn" onClick={() => props.go(relayPath.history("hook", props.document.id))}>
            {copy.t("orchestra.hooks.tab.activity")}
          </button>
        </div>
      )
  }
  const save = () => (
    <span class="wf-save">
      <Ic name="check" />
      {props.save.dirty || props.save.state === "saving"
        ? copy.t("orchestra.workflows.editor.saving")
        : copy.t("orchestra.workflows.details.autosave", { version: props.document.versionCounter })}
    </span>
  )

  return (
    <Canvas
      flow={props.flow}
      outputs={props.outputs}
      issues={issueNodes()}
      selected={props.selected}
      overlay={overlay}
      sub={sub}
      path={props.test?.path}
      drawer={props.route.add}
      banner={banner()}
      text={{
        label: copy.t("orchestra.workflows.canvas.label", { name: props.document.name }),
        add: copy.t(workflow() ? "orchestra.workflows.canvas.add" : "orchestra.hooks.canvas.add"),
        fit: copy.t("orchestra.workflows.canvas.fit"),
        zoomIn: copy.t("orchestra.workflows.canvas.zoomIn"),
        zoomOut: copy.t("orchestra.workflows.canvas.zoomOut"),
        keys: copy.t("orchestra.workflows.canvas.keys"),
        minimap: copy.t("orchestra.workflows.canvas.minimap"),
        open: (name) => copy.t("orchestra.workflows.canvas.open", { name }),
        remove: (name) => copy.t("orchestra.workflows.canvas.remove", { name }),
        addAfter: (name) => copy.t("orchestra.workflows.canvas.addAfter", { name }),
        insert: copy.t("orchestra.workflows.canvas.insert"),
        unlink: copy.t("orchestra.workflows.canvas.unlink"),
        connect: copy.t("orchestra.workflows.canvas.connect"),
        protocol: copy.t("orchestra.workflows.canvas.protocol"),
        steps: (count) =>
          copy.count(count, "orchestra.workflows.count.step.one", "orchestra.workflows.count.step.other"),
      }}
      empty={
        props.flow.nodes.length < 2 ? (
          <div class="mx-empty wf-empty wf-empty-canvas">
            <strong>
              {copy.t(workflow() ? "orchestra.workflows.canvas.emptyTitle" : "orchestra.hooks.canvas.emptyTitle")}
            </strong>
            {copy.t(workflow() ? "orchestra.workflows.canvas.emptyBody" : "orchestra.hooks.canvas.emptyBody")}
            <br />
            <button
              type="button"
              class="mx-btn primary"
              onClick={() => props.go(relayPath.add(props.kind, props.document.id))}
            >
              <Ic name="plus" />
              {copy.t(workflow() ? "orchestra.workflows.canvas.addStep" : "orchestra.hooks.canvas.addNode")}
            </button>
          </div>
        ) : undefined
      }
      onSelect={props.select}
      onChange={props.edit}
      onReject={() => showToast({ title: copy.t("orchestra.workflows.canvas.entryNoInput") })}
      onOpen={open}
      onAdd={(next) => {
        setAnchor(next)
        if (next) props.select([next.id])
        props.go(relayPath.add(props.kind, props.document.id))
      }}
      onDelete={remove}
      onEdge={onEdge}
      onProtocol={
        workflow()
          ? (phase) => {
              setFocusPhase(phase)
              const start = props.flow.nodes.find((node) => node.type === START)
              if (start) open(start.id)
            }
          : undefined
      }
      onKeys={props.onKeys}
      onDrop={(key, at) => {
        pick(key, at)
      }}
      api={(value) => {
        api = value
        props.api(value)
      }}
    >
      <Show when={props.route.add}>
        <AddPanel
          title={copy.t(workflow() ? "orchestra.workflows.add.title" : "orchestra.hooks.add.title")}
          subtitle={(() => {
            const target = nodeOf(props.flow, panelAnchor()?.id)
            if (target) return copy.t("orchestra.workflows.add.after", { name: target.name })
            return copy.t(workflow() ? "orchestra.workflows.add.end" : "orchestra.hooks.add.loose")
          })()}
          search={copy.t("orchestra.workflows.add.search")}
          close={copy.t("orchestra.workflows.add.close")}
          foot={copy.t(
            workflow()
              ? "orchestra.workflows.add.foot"
              : props.flow.nodes.some((node) => node.type === TRIGGER)
                ? "orchestra.hooks.add.footTrigger"
                : "orchestra.hooks.add.foot",
          )}
          empty={(query) => copy.t("orchestra.workflows.add.empty", { query })}
          entries={entries()}
          onPick={(key) => pick(key)}
          onClose={() => props.close(base())}
        />
      </Show>
      <Show when={detail()}>
        {(node) => (
          <Show
            when={workflow()}
            fallback={
              <HookDetails
                flow={props.flow}
                node={node()}
                outputs={props.outputs}
                types={types()}
                decision={props.decision}
                issues={props.issues
                  .filter((issue) => issueNode(issue) === node().id)
                  .map((issue) => issueText(copy, props.flow, issue))}
                save={save()}
                onChange={props.edit}
                onNav={(id) => props.go(relayPath.node("hook", props.document.id, id), true)}
                onClose={() => props.close(base())}
                onTest={props.onTest}
              />
            }
          >
            <WorkflowDetails
              flow={props.flow}
              node={node()}
              run={props.run}
              frozen={frozen.data ? flowFromDocument(frozen.data, "workflow") : undefined}
              issues={props.issues.map((issue) => issueText(copy, props.flow, issue))}
              skills={skills.data ?? []}
              focusPhase={focusPhase()}
              save={save()}
              onChange={props.edit}
              onNav={(id) => props.go(relayPath.node("workflow", props.document.id, id, props.route.view), true)}
              onClose={() => {
                setFocusPhase(undefined)
                props.close(base())
              }}
              onReview={(run) => props.go(relayPath.history("workflow", props.document.id, run.runID))}
            />
          </Show>
        )}
      </Show>
    </Canvas>
  )
}
