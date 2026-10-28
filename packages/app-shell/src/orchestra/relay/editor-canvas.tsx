import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { modalActive } from "@/utils/modal-active"
import { showToast } from "@/utils/toast"
import { type PanelEntry, AddPanel } from "./add-panel"
import { Canvas, type CanvasApi, sameEdge } from "./canvas"
import type { NodeMenuItem } from "./canvas-menu"
import type { NodeOverlay } from "./canvas-node"
import { copySteps, duplicateSteps, pasteSteps, watchClipboard } from "./clipboard"
import { RemoveNodesDialog } from "./dialogs"
import { hookEntries, WORKFLOW_ENTRIES } from "./catalog"
import { decisionTime, type RelayDecision, type RelayDocument, type RelayInstall, type RelayKind } from "./client"
import type { RelayRun } from "./runs"
import { HookDetails, hookOperations, triggerName } from "./details-hook"
import type { HookQueryState } from "./hook-status"
import { type Skills, WorkflowDetails } from "./details-workflow"
import { SaveStatus, type SaveState } from "./editor-head"
import type { EditorProps } from "./editor"
import { runHandle, RUN_TONE } from "./format"
import { type Direction, neighbour } from "./geometry"
import {
  CONDITION,
  connect,
  type Flow,
  type FlowEdge,
  type FlowNode,
  type Issue,
  isEntry,
  issueNode,
  nodeOf,
  type Outputs,
  outputsOf,
  readChecklist,
  removeEdge,
  removeNodes,
  START,
  TRIGGER,
  updatePhase,
} from "./graph"
import { addAlternative, addNode, defaultAnchor, freePhaseName, groupBlock, groupSelection, ungroup } from "./insert"
import { issueText, stateLabel } from "./parts"
import { PlanView } from "./plan"
import { layerBase, relayPath } from "./route"
import { RuleView } from "./rule-view"
import { Ic, useRelayCopy } from "./ui"

const ARROWS = new Map<string, Direction>([
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"],
  ["ArrowUp", "up"],
  ["ArrowDown", "down"],
])

type Props = EditorProps & {
  kind: RelayKind
  document: RelayDocument
  flow: Flow
  frozen?: Flow
  description: string
  readOnly?: boolean
  outputs: Outputs
  issues: Issue[]
  selected: string[]
  run: RelayRun | undefined
  runs: RelayRun[]
  skills: Skills
  // The MCP servers the project configures, for a step to choose from; undefined until loaded.
  servers: string[] | undefined
  decision: RelayDecision | undefined
  decisionKnown?: boolean
  decisionStatus?: HookQueryState
  installExists?: boolean
  installed: RelayInstall | undefined
  test: { path: string[]; result: string; label: string } | undefined
  save: SaveState
  edit: (flow: Flow) => void
  describe: (description: string) => void
  select: (ids: string[]) => void
  api: (api: CanvasApi) => void
  keys: (handler: (event: KeyboardEvent) => void) => void
  onKeys: () => void
  onTest: () => void
  onClearTest: () => void
  onUpdateInstall: (installID: string) => void
  onRetry: () => void
  onReload: () => void
}

// The Editor tab: the canvas with its banner, the add panel and node details, each layer on its own URL.
export function CanvasTab(props: Props) {
  const copy = useRelayCopy()
  const [anchor, setAnchor] = createSignal<{ id: string; port: number }>()
  const [focusPhase, setFocusPhase] = createSignal<string>()
  const [confirming, setConfirming] = createSignal<{ ids: string[]; count: number }>()
  // The list is where a document is written; the canvas shows the same graph drawn, for wiring a hook by hand.
  const [view, setView] = createStore({ mode: "list" as "list" | "canvas" })
  let api: CanvasApi | undefined
  const workflow = () => props.kind === "workflow"
  const types = () => (props.source.nodeTypes.isSuccess ? props.source.nodeTypes.data[props.kind] : undefined)
  const issueNodes = createMemo(() => new Set(props.issues.flatMap((issue) => issueNode(issue) ?? [])))
  const base = () => layerBase(props.route)
  const step = (id: string) => props.run?.steps.find((item) => item.wp === id)

  const overlay = (node: FlowNode): NodeOverlay | undefined => {
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
  const sub = (node: FlowNode) => {
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

  // An insert point only lives as long as the add panel that was opened for it.
  createEffect(
    on(
      () => props.route.add,
      (open) => {
        if (!open) setAnchor(undefined)
      },
      { defer: true },
    ),
  )

  const entries = (): PanelEntry[] => {
    if (workflow()) {
      const block = groupBlock(props.flow, props.selected)
      return WORKFLOW_ENTRIES.map((entry) => {
        const reason = entry.key === "phase" && block ? copy.t(`orchestra.workflows.add.phase.${block}`) : undefined
        return {
          key: entry.key,
          group: copy.t(`orchestra.workflows.group.${entry.group}`),
          glyph: entry.glyph,
          tone: entry.tone,
          label: copy.t(`orchestra.workflows.type.${entry.key}`),
          description: copy.t(`orchestra.workflows.typeDesc.${entry.key}`),
          disabled: !!reason,
          reason,
        }
      })
    }
    const hasTrigger = props.flow.nodes.some((node) => node.type === TRIGGER)
    const operations = hookOperations(types())
    return hookEntries(types(), props.flow).flatMap((entry): PanelEntry[] => {
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
  const panelAnchor = () => anchor() ?? defaultAnchor(props.flow, props.selected, props.outputs)
  // The new phase gets a free name and its header opens for renaming, right on the canvas.
  const group = (ids: string[]) => {
    const name = freePhaseName(props.flow, (n) => copy.t("orchestra.workflows.canvas.newPhase", { n }))
    const grouped = groupSelection(props.flow, ids, name)
    if (!grouped) return
    props.edit(grouped.flow)
    if (props.route.add) props.close(base())
    queueMicrotask(() => api?.rename(grouped.id))
  }
  const pick = (key: string, at?: { x: number; y: number }) => {
    if (props.readOnly) return
    if (key === "phase") return group(props.selected)
    const [prefix, operation, timing] = key.split(":")
    const trigger = prefix === "trigger"
    const step = WORKFLOW_ENTRIES.find((item) => item.key === key)
    const action = hookEntries(types(), props.flow).find((item) => item.key === key && item.group !== "trigger")
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
    // A dropped node is already where the user put it; an inserted one may be off screen.
    if (!at) queueMicrotask(() => api?.center(added.id, false))
  }
  const remove = (ids: string[]) => {
    if (props.readOnly) return
    if (ids.some((id) => nodeOf(props.flow, id)?.type === START))
      showToast({ title: copy.t("orchestra.workflows.canvas.startStays") })
    const next = removeNodes(props.flow, ids)
    if (next.nodes.length === props.flow.nodes.length) return
    props.edit(next)
    props.select([])
  }
  // Removing several nodes with one key is the step that wipes a graph, so it asks first. One node is undoable.
  const removeSelected = (ids: string[]) => {
    const count = ids.filter((id) => {
      const node = nodeOf(props.flow, id)
      return node && node.type !== START
    }).length
    if (count > 1 && !props.readOnly) return setConfirming({ ids, count })
    remove(ids)
  }
  const startAdd = (next?: { id: string; port: number }) => {
    if (props.readOnly) return
    setAnchor(next)
    if (next) props.select([next.id])
    props.go(relayPath.add(props.kind, props.document.id))
  }
  const onEdge = (edge: FlowEdge, action: "insert" | "remove") => {
    if (props.readOnly) return
    if (action === "remove") return props.edit(removeEdge(props.flow, edge))
    startAdd({ id: edge.from, port: edge.port })
  }
  const open = (id: string) => props.go(relayPath.node(props.kind, props.document.id, id, props.route.view))
  const menu = (ids: string[], node: FlowNode): NodeMenuItem[] => {
    const block = workflow() ? groupBlock(props.flow, ids) : undefined
    return [
      { label: copy.t("orchestra.workflows.canvas.menuOpen"), run: () => open(node.id) },
      ...(outputsOf(props.flow, node, props.outputs).length
        ? [
            {
              label: copy.t("orchestra.workflows.canvas.menuInsert"),
              run: () => startAdd({ id: node.id, port: 0 }),
            },
          ]
        : []),
      ...(workflow()
        ? [
            {
              label: copy.t("orchestra.workflows.canvas.menuGroup"),
              title: block ? copy.t(`orchestra.workflows.add.phase.${block}`) : undefined,
              disabled: !!block,
              run: () => group(ids),
            },
          ]
        : []),
      ...(workflow() && ids.some((id) => nodeOf(props.flow, id)?.type !== START)
        ? [{ label: copy.t("orchestra.workflows.canvas.menuDuplicate"), run: () => duplicate(ids) }]
        : []),
      ...connections(ids),
      ...(ids.some((id) => nodeOf(props.flow, id)?.type !== START)
        ? [
            {
              label: copy.t("orchestra.workflows.canvas.menuDelete"),
              danger: true,
              run: () => removeSelected(ids),
            },
          ]
        : []),
    ]
  }
  // With two steps selected, the first can be wired to the second from the menu: the way to connect without a pointer.
  const connections = (ids: string[]): NodeMenuItem[] => {
    const from = ids.length === 2 ? nodeOf(props.flow, ids[0]) : undefined
    const to = ids.length === 2 ? nodeOf(props.flow, ids[1]) : undefined
    if (!from || !to || isEntry(to)) return []
    return outputsOf(props.flow, from, props.outputs).flatMap((label, port): NodeMenuItem[] => {
      if (props.flow.edges.some((edge) => edge.from === from.id && edge.to === to.id && edge.port === port)) return []
      const key = label ? "orchestra.workflows.canvas.menuConnectPort" : "orchestra.workflows.canvas.menuConnect"
      return [
        {
          label: copy.t(key, { from: from.name, to: to.name, port: label }),
          run: () => {
            const next = connect(props.flow, from.id, to.id, port)
            if (!next) return showToast({ title: copy.t("orchestra.workflows.canvas.entryNoInput") })
            const before = [...props.flow.edges]
            props.edit(next)
            rewired(before, next.edges, from.id, to.id)
          },
        },
      ]
    })
  }
  // A connection that replaced others says so and offers to put them back, if nothing else changed the wires since.
  const rewired = (before: FlowEdge[], after: FlowEdge[], from: string, to: string) => {
    const replaced = before.filter((edge) => !after.some((item) => sameEdge(item, edge)))
    if (!replaced.length) return
    const name = (id: string) => nodeOf(props.flow, id)?.name ?? id
    showToast({
      title: copy.t("orchestra.workflows.canvas.rewired", { from: name(from), to: name(to) }),
      description: copy.t("orchestra.workflows.canvas.rewiredBody", {
        list: replaced.map((edge) => `${name(edge.from)} → ${name(edge.to)}`).join(", "),
      }),
      actions: [
        {
          label: copy.t("orchestra.workflows.menu.undo"),
          onClick: () => {
            const now = props.flow.edges
            const unchanged =
              now.length === after.length && now.every((edge) => after.some((item) => sameEdge(item, edge)))
            if (unchanged) props.edit({ ...props.flow, edges: before })
          },
        },
      ],
    })
  }
  props.keys((event) => {
    if (view.mode === "list") return
    const target = event.target instanceof HTMLElement ? event.target : undefined
    if (target && target !== document.body && !target.closest(".wf-canvas")) return
    // A focused button (a node's tools, a "+" stub) keeps Enter and the arrows for itself.
    if (target?.closest("button,input,textarea,select,[contenteditable]")) return
    const last = props.selected.at(-1)
    if ((event.key === "Enter" || event.key === "F2") && last) return (event.preventDefault(), open(last))
    if ((event.key === "Delete" || event.key === "Backspace") && props.selected.length)
      return (event.preventDefault(), removeSelected(props.selected))
    const direction = ARROWS.get(event.key)
    if (!direction) return
    event.preventDefault()
    if (!last) return props.flow.nodes[0] && reach(props.flow.nodes[0].id, false)
    const next = neighbour(props.flow.nodes, props.flow.edges, last, direction)
    if (next) reach(next, event.shiftKey)
  })
  // An arrow key moves the selection and focus together, so a screen reader announces the step it lands on. Shift adds
  // that step to the selection instead of replacing it.
  const reach = (id: string, extend: boolean) => {
    props.select(extend ? [...props.selected.filter((item) => item !== id), id] : [id])
    api?.center(id)
    api?.focus(id)
  }

  // Copy and paste act on steps only while focus is on the canvas itself, never in a field or behind a dialog.
  const canvasFocus = (event: Event) => {
    const target = event.target instanceof HTMLElement ? event.target : undefined
    if (view.mode === "list" || !workflow() || props.readOnly || props.route.node || modalActive()) return false
    if (target?.closest("input,textarea,select,[contenteditable],.wf-drawer")) return false
    return target === document.body || !!target?.closest(".wf-canvas")
  }
  const landed = (pasted: { flow: Flow; ids: string[] }) => {
    props.edit(pasted.flow)
    props.select(pasted.ids)
    const last = pasted.ids.at(-1)
    if (last) queueMicrotask(() => api?.center(last))
  }
  const duplicate = (ids: string[]) => {
    const copied = props.readOnly ? undefined : duplicateSteps(props.flow, ids)
    if (copied) landed(copied)
  }
  onMount(() =>
    onCleanup(
      watchClipboard({
        active: canvasFocus,
        copy: () => copySteps(props.flow, props.selected),
        paste: (text) => {
          const pasted = pasteSteps(props.flow, text, defaultAnchor(props.flow, props.selected, props.outputs))
          if (pasted) landed(pasted)
          return !!pasted
        },
      }),
    ),
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
    if (!workflow() && props.installed) {
      const installed = props.installed
      // The install pins a versionId; a later publish leaves it on the earlier one until it is updated.
      const current = installed.version === props.document.activeVersionId
      return (
        <div class="wf-banner" classList={{ warm: !current }}>
          <span class={`wf-dot ${current ? "good" : "warm"}`} />
          <span>
            {[
              installed.unpublished
                ? copy.t("orchestra.hooks.canvas.installedUnpublished", { profile: props.profile })
                : current
                  ? copy.t("orchestra.hooks.canvas.installed", {
                      profile: props.profile,
                      version: props.document.publishedCounter ?? "",
                    })
                  : copy.t("orchestra.hooks.canvas.installedEarlier", { profile: props.profile }),
              props.decision
                ? `${copy.t(`orchestra.hooks.outcome.${props.decision.outcome}`)} ${copy.when(decisionTime(props.decision))}`
                : props.decisionKnown !== false
                  ? copy.t("orchestra.hooks.canvas.notFired")
                  : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <Show when={!current && props.document.activeVersionId}>
            <button type="button" class="mx-btn primary" onClick={() => props.onUpdateInstall(installed.installID)}>
              {copy.t("orchestra.hooks.canvas.update")}
            </button>
          </Show>
          <button type="button" class="mx-btn" onClick={() => props.go(relayPath.history("hook", props.document.id))}>
            {copy.t("orchestra.hooks.tab.activity")}
          </button>
        </div>
      )
    }
  }
  const save = () => (
    <Show
      when={!props.route.view}
      fallback={<span class="wf-save">{copy.t("orchestra.workflows.history.readOnly")}</span>}
    >
      <SaveStatus
        save={props.save}
        saved={copy.t("orchestra.workflows.details.autosave", { version: props.document.versionCounter })}
        onRetry={props.onRetry}
        onReload={props.onReload}
      />
    </Show>
  )

  const canvas = () => (
    <Canvas
      readOnly={props.readOnly}
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
        hasIssue: (name) => copy.t("orchestra.workflows.canvas.hasIssue", { name }),
        remove: (name) => copy.t("orchestra.workflows.canvas.remove", { name }),
        addAfter: (name) => copy.t("orchestra.workflows.canvas.addAfter", { name }),
        insert: copy.t("orchestra.workflows.canvas.insert"),
        unlink: copy.t("orchestra.workflows.canvas.unlink"),
        connect: copy.t("orchestra.workflows.canvas.connect"),
        protocol: copy.t("orchestra.workflows.canvas.protocol"),
        menu: copy.t("orchestra.workflows.canvas.menu"),
        renamePhase: (name) => copy.t("orchestra.workflows.canvas.renamePhase", { name }),
        removePhase: (name) => copy.t("orchestra.workflows.canvas.removePhase", { name }),
        steps: (count) =>
          copy.count(count, "orchestra.workflows.count.step.one", "orchestra.workflows.count.step.other"),
      }}
      empty={
        !props.readOnly && props.flow.nodes.length < 2 ? (
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
      onReject={(reason, detail) => {
        if (reason === "phase")
          return showToast({
            title: copy.t("orchestra.workflows.canvas.phaseBlocked", { phase: detail ?? "" }),
            description: copy.t("orchestra.workflows.canvas.phaseBlockedBody"),
          })
        if (reason === "empty") return showToast({ title: copy.t("orchestra.workflows.canvas.wireEmpty") })
        if (reason === "self") return showToast({ title: copy.t("orchestra.workflows.canvas.wireSelf") })
        showToast({ title: copy.t("orchestra.workflows.canvas.entryNoInput") })
      }}
      onOpen={open}
      onAdd={startAdd}
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
      onRenamePhase={workflow() ? (phase, name) => props.edit(updatePhase(props.flow, phase, { name })) : undefined}
      onUngroup={workflow() ? (phase) => props.edit(ungroup(props.flow, phase)) : undefined}
      menu={menu}
      onRewire={rewired}
      onKeys={props.onKeys}
      onDrop={(key, at) => {
        pick(key, at)
      }}
      api={(value) => {
        api = value
        props.api(value)
      }}
    >
      <Show when={confirming()}>
        {(pending) => (
          <RemoveNodesDialog
            count={pending().count}
            onConfirm={() => remove(pending().ids)}
            onClose={() => setConfirming(undefined)}
          />
        )}
      </Show>
      <Show when={props.route.add && !props.readOnly}>
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
                decisionStatus={props.decisionStatus}
                installed={props.installExists}
                testResult={
                  props.test
                    ? copy.t("orchestra.hooks.canvas.test", { label: props.test.label, result: props.test.result })
                    : undefined
                }
                issues={props.issues
                  .filter((issue) => issueNode(issue) === node().id)
                  .map((issue) => issueText(copy, props.flow, issue))}
                save={save()}
                // A conflicting save is settled in the footer first; edits made meanwhile would be lost or overwrite.
                readOnly={props.readOnly || props.save.state === "conflict"}
                onChange={props.edit}
                onNav={(id) => props.go(relayPath.node("hook", props.document.id, id), true)}
                onClose={() => props.close(base())}
                onTest={props.onTest}
                onAddCondition={(id) => {
                  const added = addAlternative(props.flow, id)
                  if (!added) return
                  props.edit(added.flow)
                  props.select([added.id])
                  props.go(relayPath.node("hook", props.document.id, added.id), true)
                }}
              />
            }
          >
            <WorkflowDetails
              flow={props.flow}
              node={node()}
              run={props.run}
              frozen={props.frozen}
              readOnly={props.readOnly}
              issues={props.issues.map((issue) => issueText(copy, props.flow, issue))}
              skills={props.skills}
              servers={props.servers}
              directory={props.directory}
              focusPhase={focusPhase()}
              description={props.description}
              save={save()}
              onChange={props.edit}
              onDescribe={props.describe}
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

  const editing = () => props.readOnly || props.save.state === "conflict"
  const toggle = (
    <div class="wf-viewbar" role="group" aria-label={copy.t("orchestra.workflows.view.label")}>
      <button type="button" aria-pressed={view.mode === "list"} onClick={() => setView("mode", "list")}>
        <Ic name="list" />
        {copy.t("orchestra.workflows.view.list")}
      </button>
      <button type="button" aria-pressed={view.mode === "canvas"} onClick={() => setView("mode", "canvas")}>
        <Ic name="workflows" />
        {copy.t("orchestra.workflows.view.canvas")}
      </button>
    </div>
  )

  return (
    <div class="wf-mode">
      {toggle}
      <Show when={view.mode === "list"} fallback={canvas()}>
        <Show
          when={workflow()}
          fallback={
            <RuleView
              flow={props.flow}
              outputs={props.outputs}
              types={types()}
              issues={props.issues}
              readOnly={editing()}
              open={props.route.node}
              adding={!!props.route.add}
              banner={banner()}
              save={save()}
              edit={props.edit}
              onAdded={() => props.close(base())}
              onCanvas={() => setView("mode", "canvas")}
              onTest={props.onTest}
            />
          }
        >
          <PlanView
            flow={props.flow}
            frozen={props.frozen}
            run={props.run}
            readOnly={editing()}
            issues={props.issues}
            skills={props.skills}
            servers={props.servers}
            directory={props.directory}
            types={types()}
            description={props.description}
            open={props.route.node}
            adding={!!props.route.add}
            banner={banner()}
            save={save()}
            edit={props.edit}
            describe={props.describe}
            onOpen={(id) =>
              id
                ? props.go(relayPath.node("workflow", props.document.id, id, props.route.view), true)
                : props.close(base())
            }
            onAdded={() => props.close(base())}
            onReview={(run) => props.go(relayPath.history("workflow", props.document.id, run.runID))}
          />
        </Show>
      </Show>
    </div>
  )
}
