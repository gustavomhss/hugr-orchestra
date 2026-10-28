import { createEffect, createMemo, For, type JSX, on, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { RelayNodeType } from "./client"
import { nodeGlyph, nodeTone, WORKFLOW_ENTRIES, workflowKey } from "./catalog"
import { Params, PhaseNameField, type Skills } from "./details-workflow"
import { STEP_TONE } from "./format"
import {
  chain,
  contextOf,
  type Flow,
  type FlowNode,
  type Issue,
  INJECT,
  issueNode,
  layoutWorkflow,
  listedSteps,
  nodeOf,
  phaseOf,
  readChecklist,
  removeNodes,
  retryBudget,
  setPhase,
  START,
  updatePhase,
} from "./graph"
import { addNode, freePhaseName, groupSelection, moveStep, ungroup } from "./insert"
import { duplicateSteps } from "./clipboard"
import { useCommand } from "@/context/command"
import { modalActive } from "@/utils/modal-active"
import { injectFile, Inspector, Outline, useDroppedPath, useStudio } from "./studio"
import { issueText } from "./parts"
import type { RelayRun } from "./runs"
import { Ic, NodeGlyph, useRelayCopy } from "./ui"

type Props = {
  flow: Flow
  frozen: Flow | undefined
  run: RelayRun | undefined
  readOnly?: boolean
  issues: Issue[]
  skills: Skills
  // The MCP servers the project configures, for a step to choose from; undefined until loaded.
  servers: string[] | undefined
  directory?: string
  types: RelayNodeType[] | undefined
  description: string
  // The step whose card is open, from the URL; the add flag opens the kind picker at the end of the list.
  open: string | undefined
  adding: boolean
  banner: JSX.Element
  save: JSX.Element
  edit: (flow: Flow) => void
  describe: (description: string) => void
  onOpen: (id: string | undefined) => void
  onAdded: () => void
  onReview: (run: RelayRun) => void
}

// A stretch of the sequence: one phase, or the steps between phases.
// Keyed by id, never by node object: every edit makes new node objects, and a card keyed by one would redraw and drop
// the focus of the field being typed in.
type Segment = { key: string; phase: string | undefined; ids: string[] }

// What the "+" offers. Context is not a step of its own: it is attached inside the step that receives it.
const STEP_ENTRIES = WORKFLOW_ENTRIES.filter((entry) => entry.key !== "phase" && entry.key !== "inject")

// The workflow as the ordered list it is: the start card, then every step in sequence, grouped by phase. Each card
// opens in place, and a "+" between two cards inserts a step exactly there. Every structural change tidies the canvas
// layout, so switching to the canvas shows the same order.
export function PlanView(props: Props) {
  const copy = useRelayCopy()
  const [state, setState] = createStore({
    picker: undefined as string | undefined,
    protocol: undefined as string | undefined,
  })
  const order = createMemo(() => listedSteps(props.flow))
  const start = () => props.flow.nodes.find((node) => node.type === START)
  const segments = createMemo(() =>
    order().reduce<Segment[]>((acc, node) => {
      const phase = phaseOf(props.flow, node.id)?.id
      const last = acc.at(-1)
      if (last && last.phase === phase) return [...acc.slice(0, -1), { ...last, ids: [...last.ids, node.id] }]
      return [...acc, { key: phase ?? `steps:${node.id}`, phase, ids: [node.id] }]
    }, []),
  )
  const placed = createMemo(() => new Set(chain(props.flow).map((node) => node.id)))
  const outside = () => props.flow.nodes.filter((node) => !placed().has(node.id))
  const flagged = createMemo(() => new Set(props.issues.flatMap((issue) => issueNode(issue) ?? [])))
  // A problem in a step's context shows on the step, where the context is edited.
  const flaggedStep = (id: string) =>
    flagged().has(id) || contextOf(props.flow, id).some((node) => flagged().has(node.id))
  const change = (flow: Flow) => props.edit(layoutWorkflow(flow))
  const end = () => order().at(-1)?.id ?? start()?.id

  // Opening the add panel's URL in this view opens the picker after the last step.
  createEffect(
    on(
      () => props.adding,
      (adding) => {
        if (!adding || props.readOnly) return
        setState("picker", end())
        props.onAdded()
      },
    ),
  )

  const add = (key: string, after: string, phase: string | undefined) => {
    const entry = STEP_ENTRIES.find((item) => item.key === key)
    if (!entry) return
    const added = addNode(
      props.flow,
      { key, type: entry.type, name: copy.t(`orchestra.workflows.newName.${key}`), anchor: { id: after, port: 0 } },
      props.types,
    )
    // A step added at the end of a phase stays in it, as its "+" sits inside the phase.
    const joined =
      phase && phaseOf(added.flow, added.id)?.id !== phase ? setPhase(added.flow, added.id, phase) : added.flow
    setState("picker", undefined)
    change(joined)
    props.onOpen(added.id)
  }
  const remove = (id: string) => {
    if (props.open === id) props.onOpen(undefined)
    change(removeNodes(props.flow, [...contextOf(props.flow, id).map((node) => node.id), id]))
  }
  const group = (id: string) => {
    const grouped = groupSelection(
      props.flow,
      [id],
      freePhaseName(props.flow, (n) => copy.t("orchestra.workflows.canvas.newPhase", { n })),
    )
    if (grouped) change(grouped.flow)
  }

  // The step a new one goes after: the open step, or the last one.
  const anchor = () => (props.open && order().some((node) => node.id === props.open) ? props.open : end())
  const studio = useStudio()
  const dropped = useDroppedPath(() => props.directory)
  const dropFile = (event: DragEvent) => {
    if (props.readOnly || !event.dataTransfer?.types.includes("Files")) return
    event.preventDefault()
    const path = dropped(event)
    if (!path) return
    // The file goes to the open step, or the last one.
    const step = props.open && order().some((node) => node.id === props.open) ? props.open : order().at(-1)?.id
    const placed = injectFile(props.flow, path, copy.t("orchestra.workflows.newName.inject"), step)
    if (!placed) return
    change(placed.flow)
    props.onOpen(step ?? placed.id)
  }

  // N adds a step, Alt+arrows move the open step and Cmd+D duplicates it, whenever no text field has focus.
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || props.readOnly || modalActive()) return
    const target = event.target instanceof HTMLElement ? event.target : undefined
    if (target?.closest("input,textarea,select,[contenteditable],.wf-canvas")) return
    const mod = event.metaKey || event.ctrlKey
    const open = props.open && order().some((node) => node.id === props.open) ? props.open : undefined
    if (!mod && !event.altKey && event.key.toLowerCase() === "n") {
      event.preventDefault()
      return setState("picker", anchor())
    }
    if (open && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault()
      return change(moveStep(props.flow, open, event.key === "ArrowUp" ? -1 : 1))
    }
    if (open && mod && !event.altKey && event.key.toLowerCase() === "d") {
      event.preventDefault()
      const copied = duplicateSteps(props.flow, [...contextOf(props.flow, open).map((node) => node.id), open])
      if (!copied) return
      change(copied.flow)
      props.onOpen(copied.ids.at(-1))
    }
  }
  onMount(() => window.addEventListener("keydown", keydown))
  onCleanup(() => window.removeEventListener("keydown", keydown))

  // The palette finds any step by name and adds a step of any kind after the open one.
  const command = useCommand()
  command.register("relay.plan", () => {
    const category = copy.t("orchestra.palette.relay")
    return [
      ...order().map((node) => ({
        id: `relay.plan.go.${node.id}`,
        title: copy.t("orchestra.workflows.studio.goTo", { name: node.name }),
        category,
        onSelect: () => props.onOpen(node.id),
      })),
      ...(props.readOnly
        ? []
        : STEP_ENTRIES.map((entry) => ({
            id: `relay.plan.add.${entry.key}`,
            title: copy.t("orchestra.workflows.studio.addKind", {
              kind: copy.t(`orchestra.workflows.type.${entry.key}`),
            }),
            category,
            onSelect: () => {
              const after = anchor()
              if (after) add(entry.key, after, undefined)
            },
          }))),
    ]
  })

  const inserter = (after: string | undefined, phase: string | undefined, last?: boolean) => (
    <Show when={after && !props.readOnly}>
      <Show
        when={state.picker === after}
        fallback={
          <div class="wf-plan-gap" classList={{ last }}>
            <button
              type="button"
              class="wf-plan-plus"
              aria-label={copy.t(last ? "orchestra.workflows.plan.add" : "orchestra.workflows.plan.addHere")}
              title={copy.t(last ? "orchestra.workflows.plan.add" : "orchestra.workflows.plan.addHere")}
              onClick={() => setState("picker", after)}
            >
              <Ic name="plus" />
              <Show when={last}>
                <span>{copy.t("orchestra.workflows.plan.add")}</span>
              </Show>
            </button>
          </div>
        }
      >
        <div class="wf-plan-picker" role="group" aria-label={copy.t("orchestra.workflows.plan.pick")}>
          <div class="wf-plan-picker-head">
            <span>{copy.t("orchestra.workflows.plan.pick")}</span>
            <button type="button" class="mx-btn" onClick={() => setState("picker", undefined)}>
              {copy.t("orchestra.workflows.plan.cancel")}
            </button>
          </div>
          <div class="wf-plan-kinds">
            <For each={STEP_ENTRIES}>
              {(entry, index) => (
                <button
                  type="button"
                  class="wf-pick"
                  ref={(element) => index() === 0 && queueMicrotask(() => element.focus())}
                  onClick={() => add(entry.key, after!, phase)}
                  onKeyDown={(event) =>
                    event.key === "Escape" && (event.stopPropagation(), setState("picker", undefined))
                  }
                >
                  <span class={`wf-pick-tile k-${entry.tone}`}>
                    <NodeGlyph name={entry.glyph} />
                  </span>
                  <span>
                    <strong>{copy.t(`orchestra.workflows.type.${entry.key}`)}</strong>
                    <small>{copy.t(`orchestra.workflows.typeDesc.${entry.key}`)}</small>
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </Show>
  )

  const card = (id: string, numbered: boolean) => (
    <Show when={nodeOf(props.flow, id)}>
      {(node) => {
        const opened = () => props.open === node().id
        const result = () => props.run?.steps.find((item) => item.wp === node().id)
        const key = () => workflowKey(node().type)
        // Context with no step after it is summed up by what it hands over, the file or the first line of its text.
        const instructions = () =>
          String(
            (node().type === INJECT && (node().parameters.file || node().parameters.text)) ||
              node().parameters.instructions ||
              "",
          )
            .trim()
            .split("\n")[0]
        const checks = () => readChecklist(node()).controls.length
        const context = () => contextOf(props.flow, node().id).length
        const skill = () => String(node().parameters.skill ?? "")
        const at = () => order().findIndex((item) => item.id === node().id)
        const number = () => (numbered ? at() + 1 : undefined)
        return (
          <article
            class="wf-step"
            classList={{ open: opened(), issue: flaggedStep(node().id) }}
            data-step={node().id}
          >
            <div class="wf-step-head">
              <button
                type="button"
                class="wf-step-main"
                aria-expanded={opened()}
                onClick={() => props.onOpen(opened() ? undefined : node().id)}
              >
                <Show when={number()}>
                  <span class="wf-step-n">{number()}</span>
                </Show>
                <span class={`wf-pick-tile k-${nodeTone(node())}`}>
                  <NodeGlyph name={nodeGlyph(node())} />
                </span>
                <span class="wf-step-text">
                  <strong>{node().name}</strong>
                  <small>
                    {[
                      key() ? copy.t(`orchestra.workflows.type.${key()}`) : node().type,
                      checks()
                        ? copy.count(
                            checks(),
                            "orchestra.workflows.count.check.one",
                            "orchestra.workflows.count.check.other",
                          )
                        : undefined,
                      context()
                        ? copy.count(
                            context(),
                            "orchestra.workflows.count.context.one",
                            "orchestra.workflows.count.context.other",
                          )
                        : undefined,
                      skill() || undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  <Show when={!opened()}>
                    <em classList={{ empty: !instructions() }}>
                      {instructions() || copy.t("orchestra.workflows.plan.noInstructions")}
                    </em>
                  </Show>
                </span>
                <Show when={flaggedStep(node().id)}>
                  <span
                    class="wf-step-warn"
                    title={copy.t("orchestra.workflows.canvas.hasIssue", { name: node().name })}
                  >
                    <Ic name="warn" />
                  </span>
                </Show>
                <Show when={result()}>{(step) => <span class={`wf-dot ${STEP_TONE[step().status]}`} />}</Show>
                <Ic name="chevron" class="wf-ic wf-step-chev" />
              </button>
              <Show when={!props.readOnly && numbered}>
                <div class="wf-step-tools">
                  <button
                    type="button"
                    class="mx-btn icon"
                    aria-label={copy.t("orchestra.workflows.plan.moveUp", { name: node().name })}
                    title={copy.t("orchestra.workflows.plan.moveUp", { name: node().name })}
                    disabled={at() <= 0 && !phaseOf(props.flow, node().id)}
                    onClick={() => change(moveStep(props.flow, node().id, -1))}
                  >
                    <Ic name="up" />
                  </button>
                  <button
                    type="button"
                    class="mx-btn icon"
                    aria-label={copy.t("orchestra.workflows.plan.moveDown", { name: node().name })}
                    title={copy.t("orchestra.workflows.plan.moveDown", { name: node().name })}
                    disabled={at() >= order().length - 1 && !phaseOf(props.flow, node().id)}
                    onClick={() => change(moveStep(props.flow, node().id, 1))}
                  >
                    <Ic name="down" />
                  </button>
                  <Show when={!phaseOf(props.flow, node().id)}>
                    <button
                      type="button"
                      class="mx-btn icon"
                      aria-label={copy.t("orchestra.workflows.plan.phaseHere", { name: node().name })}
                      title={copy.t("orchestra.workflows.plan.phaseHere", { name: node().name })}
                      onClick={() => group(node().id)}
                    >
                      <Ic name="group" />
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="mx-btn icon"
                    aria-label={copy.t("orchestra.workflows.canvas.remove", { name: node().name })}
                    title={copy.t("orchestra.workflows.canvas.remove", { name: node().name })}
                    onClick={() => remove(node().id)}
                  >
                    <Ic name="trash" />
                  </button>
                </div>
              </Show>
            </div>
            <Show when={opened()}>
              <div class="wf-step-body">{details(node)}</div>
            </Show>
          </article>
        )
      }}
    </Show>
  )
  const details = (node: () => FlowNode) => (
    <Params
      inline
      flow={props.flow}
      node={node()}
      run={props.run}
      frozen={props.frozen}
      readOnly={props.readOnly}
      issues={props.issues.map((issue) => issueText(copy, props.flow, issue))}
      skills={props.skills}
      servers={props.servers}
      directory={props.directory}
      description={props.description}
      save={props.save}
      onChange={props.edit}
      onDescribe={props.describe}
      onNav={(id) => props.onOpen(id)}
      onClose={() => props.onOpen(undefined)}
      onReview={props.onReview}
    />
  )
  const goal = () =>
    String(start()?.parameters.relayBrief ?? "")
      .trim()
      .split("\n")[0]

  return (
    <div
      class="wf-plan"
      classList={{ "wf-studio": !!studio }}
      data-component="relay-plan"
      onDragOver={(event) => !props.readOnly && event.dataTransfer?.types.includes("Files") && event.preventDefault()}
      onDrop={dropFile}
    >
      <Show when={props.banner}>
        <div class="wf-plan-banner">{props.banner}</div>
      </Show>
      <div class="wf-studio-grid">
      <Outline
        flow={props.flow}
        open={props.open}
        issues={props.issues}
        readOnly={props.readOnly}
        onOpen={props.onOpen}
        edit={change}
      />
      <div class="wf-plan-list">
        <Show when={start()}>
          {(node) => (
            // The goal and the settings every step shares, above the steps and not one of them.
            <article
              class="wf-step wf-goal"
              classList={{ open: props.open === node().id, issue: flagged().has(node().id) }}
              data-step={node().id}
            >
              <div class="wf-step-head">
                <button
                  type="button"
                  class="wf-step-main"
                  aria-expanded={props.open === node().id}
                  onClick={() => props.onOpen(props.open === node().id ? undefined : node().id)}
                >
                  <span class="wf-step-text">
                    <strong>{copy.t("orchestra.workflows.plan.goalTitle")}</strong>
                    <small>
                      {[
                        copy.t("orchestra.workflows.details.budget"),
                        copy.t("orchestra.workflows.details.budgetValue", { count: retryBudget(props.flow) }),
                      ].join(" · ")}
                    </small>
                    <Show when={props.open !== node().id}>
                      <em classList={{ empty: !goal() }}>{goal() || copy.t("orchestra.workflows.plan.noGoal")}</em>
                    </Show>
                  </span>
                  <Show when={flagged().has(node().id)}>
                    <span class="wf-step-warn">
                      <Ic name="warn" />
                    </span>
                  </Show>
                  <Ic name="chevron" class="wf-ic wf-step-chev" />
                </button>
              </div>
              <Show when={props.open === node().id}>
                <div class="wf-step-body">{details(node)}</div>
              </Show>
            </article>
          )}
        </Show>
        <Show when={!order().length && !props.readOnly}>
          <div class="wf-plan-empty">
            <strong>{copy.t("orchestra.workflows.canvas.emptyTitle")}</strong>
            <span>{copy.t("orchestra.workflows.canvas.emptyBody")}</span>
          </div>
        </Show>
        {inserter(start()?.id, undefined, !order().length)}
        <For each={segments().map((item) => item.key)}>
          {(key) => {
            const ids = () => segments().find((item) => item.key === key)?.ids ?? []
            return (
              <Show
                when={phaseOf(props.flow, ids()[0] ?? "")}
                fallback={
                  <For each={ids()}>
                    {(id) => (
                      <>
                        {card(id, true)}
                        {inserter(id, undefined, id === end())}
                      </>
                    )}
                  </For>
                }
              >
                {(phase) => (
                  <section class="wf-plan-phase" data-phase={phase().id}>
                    <header class="wf-plan-phase-head">
                      <span class="wf-plan-phase-kicker">
                        <Ic name="group" />
                        {copy.t("orchestra.workflows.plan.phaseKicker")}
                      </span>
                      <Show when={!props.readOnly} fallback={<b>{phase().name}</b>}>
                        <PhaseNameField flow={props.flow} phase={phase()} onChange={props.edit} />
                      </Show>
                      <span class="mx-meta">
                        {copy.count(
                          ids().length,
                          "orchestra.workflows.count.step.one",
                          "orchestra.workflows.count.step.other",
                        )}
                      </span>
                      <button
                        type="button"
                        class="mx-btn"
                        aria-expanded={state.protocol === phase().id}
                        onClick={() => setState("protocol", state.protocol === phase().id ? undefined : phase().id)}
                      >
                        {copy.t("orchestra.workflows.canvas.protocol")}
                        <Show when={!phase().description}>
                          <small>{copy.t("orchestra.workflows.details.protocolEmpty")}</small>
                        </Show>
                      </button>
                      <Show when={!props.readOnly}>
                        <button
                          type="button"
                          class="mx-btn icon"
                          aria-label={copy.t("orchestra.workflows.canvas.removePhase", { name: phase().name })}
                          title={copy.t("orchestra.workflows.canvas.removePhase", { name: phase().name })}
                          onClick={() => change(ungroup(props.flow, phase().id))}
                        >
                          <Ic name="close" />
                        </button>
                      </Show>
                    </header>
                    <Show when={state.protocol !== phase().id}>
                      <button
                        type="button"
                        class="wf-plan-phase-brief"
                        classList={{ empty: !phase().description.trim() }}
                        onClick={() => setState("protocol", phase().id)}
                      >
                        {phase().description.trim().split("\n")[0] ||
                          copy.t("orchestra.workflows.plan.phaseBriefEmpty")}
                      </button>
                    </Show>
                    <Show when={state.protocol === phase().id}>
                      <label class="mx-field wf-plan-protocol">
                        <span>{copy.t("orchestra.workflows.details.protocolLabel", { phase: phase().name })}</span>
                        <textarea
                          value={phase().description}
                          readOnly={props.readOnly}
                          onInput={(event) =>
                            props.edit(updatePhase(props.flow, phase().id, { description: event.currentTarget.value }))
                          }
                        />
                        <span class="mx-hint">{copy.t("orchestra.workflows.plan.protocolHint")}</span>
                      </label>
                    </Show>
                    <For each={ids()}>
                      {(id, index) => (
                        <>
                          {card(id, true)}
                          {inserter(id, index() === ids().length - 1 ? phase().id : undefined, id === end())}
                        </>
                      )}
                    </For>
                  </section>
                )}
              </Show>
            )
          }}
        </For>
        <Show when={outside().length}>
          <section class="wf-plan-loose">
            <header>
              <strong>{copy.t("orchestra.workflows.plan.looseTitle")}</strong>
              <span>{copy.t("orchestra.workflows.plan.looseHint")}</span>
            </header>
            <For each={outside().map((node) => node.id)}>{(id) => card(id, false)}</For>
          </section>
        </Show>
      </div>
      <Show when={studio}>
        <Inspector
          flow={props.flow}
          open={props.open}
          issues={props.issues}
          readOnly={props.readOnly}
          onOpen={props.onOpen}
          edit={props.edit}
        />
      </Show>
      </div>
      {/* The Studio header already shows the save state. */}
      <Show when={!studio}>
        <footer class="wf-plan-foot">{props.save}</footer>
      </Show>
    </div>
  )
}
