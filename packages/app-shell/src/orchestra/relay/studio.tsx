import { useQuery } from "@tanstack/solid-query"
import { createContext, createEffect, createMemo, createSignal, For, type JSX, on, onCleanup, Show, useContext } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { showToast } from "@/utils/toast"
import type { RelayDocumentFields, RelayPreview, RelayProjectCommands, RelayTrial } from "./client"
import { nodeGlyph, nodeTone } from "./catalog"
import {
  chain,
  type Flow,
  INJECT,
  issueNode,
  type Issue,
  nodeOf,
  phaseOf,
  readChecklist,
  setPhase,
  START,
  updateNode,
  writeChecklist,
} from "./graph"
import { addNode, moveStep } from "./insert"
import type { RelaySource } from "./source"
import { Ic, NodeGlyph, useRelayCopy } from "./ui"

// The workflow editor's live view of what it is building: the compiled preview with its lint findings, the check
// commands the project declares, and a way to try one. Only the workflow editor provides it.
type Studio = {
  preview: () => RelayPreview | undefined
  commands: () => RelayProjectCommands | undefined
  trial: (command: string) => Promise<RelayTrial>
}

const StudioContext = createContext<Studio>()

export const useStudio = () => useContext(StudioContext)

// The preview compiles the draft on the server, so it waits for typing to pause before asking again.
const SETTLE_MS = 400

// Off for hooks and for a past version, which have nothing to preview; the children then see no studio.
export function StudioScope(props: {
  source: RelaySource
  id: string
  enabled: boolean
  fields: () => RelayDocumentFields
  children: JSX.Element
}) {
  const [settled, setSettled] = createSignal({ fields: props.fields(), at: 0 })
  createEffect(
    on(
      props.fields,
      (fields) => {
        const timer = setTimeout(() => setSettled((last) => ({ fields, at: last.at + 1 })), SETTLE_MS)
        onCleanup(() => clearTimeout(timer))
      },
      { defer: true },
    ),
  )
  const preview = useQuery(
    () => ({
      queryKey: props.source.key("preview", props.id, String(settled().at)),
      queryFn: () => props.source.client.preview(settled().fields),
      placeholderData: (previous: RelayPreview | undefined) => previous,
      enabled: props.enabled,
      retry: false,
    }),
    props.source.queryClient,
  )
  const commands = useQuery(
    () => ({
      queryKey: props.source.key("commands"),
      queryFn: () => props.source.client.commands(),
      enabled: props.enabled,
      retry: false,
      staleTime: 60_000,
    }),
    props.source.queryClient,
  )
  return (
    <StudioContext.Provider
      value={
        props.enabled
          ? {
              // Read only on success: reading the data of a pending query suspends the shell and drops the focus.
              preview: () => (preview.isSuccess ? preview.data : undefined),
              commands: () => (commands.isSuccess ? commands.data : undefined),
              trial: (command: string) => props.source.client.trial(command),
            }
          : undefined
      }
    >
      {props.children}
    </StudioContext.Provider>
  )
}

// A Provide context step that hands over `path`, placed right before `before`, or at the end without it.
export function injectFile(flow: Flow, path: string, name: string, before: string | undefined) {
  const order = chain(flow)
  const at = before ? order.findIndex((node) => node.id === before) : -1
  const anchor = at > 0 ? order[at - 1] : order.at(-1)
  if (!anchor) return
  const added = addNode(flow, { key: "inject", type: INJECT, name, anchor: { id: anchor.id, port: 0 } }, undefined)
  const filled = updateNode(added.flow, added.id, {
    parameters: { ...nodeOf(added.flow, added.id)?.parameters, file: path },
  })
  const phase = before ? phaseOf(flow, before)?.id : undefined
  return { flow: phase && phaseOf(filled, added.id)?.id !== phase ? setPhase(filled, added.id, phase) : filled, id: added.id }
}

// A file dropped from Finder, as a path relative to the project; a file outside it cannot be read by the run.
export function useDroppedPath(directory: () => string | undefined) {
  const platform = usePlatform()
  const copy = useRelayCopy()
  return (event: DragEvent) => {
    const file = event.dataTransfer?.files[0]
    if (!file || !platform.getPathForFile) return
    const root = (directory() ?? "").replace(/\\/g, "/").replace(/\/$/, "")
    const path = platform.getPathForFile(file).replace(/\\/g, "/")
    if (!root || !path.startsWith(`${root}/`)) {
      showToast({ variant: "error", title: copy.t("orchestra.workflows.details.fileOutside") })
      return
    }
    return path.slice(root.length + 1)
  }
}

const STEP_DRAG = "application/x-relay-step"

// Moves a step to the place of another by repeated single moves, so phases stay unbroken the way the arrows keep them.
export function moveTo(flow: Flow, id: string, target: string) {
  const index = (current: Flow, of: string) => chain(current).findIndex((node) => node.id === of)
  const goal = index(flow, target)
  const direction = goal < index(flow, id) ? -1 : 1
  // Each move either crosses a phase edge or swaps one place, so twice the length bounds it.
  return Array.from({ length: chain(flow).length * 2 }).reduce<Flow>(
    (current) => (index(current, id) === goal ? current : moveStep(current, id, direction)),
    flow,
  )
}

// The left column: every step in order with phases as rails, to jump to a step, see where the problems are and drag
// a step to a new place.
export function Outline(props: {
  flow: Flow
  open: string | undefined
  issues: Issue[]
  readOnly?: boolean
  onOpen: (id: string | undefined) => void
  edit: (flow: Flow) => void
}) {
  const copy = useRelayCopy()
  const studio = useStudio()
  const [drag, setDrag] = createStore({ id: undefined as string | undefined, over: undefined as string | undefined })
  const order = createMemo(() => chain(props.flow))
  const flagged = createMemo(
    () =>
      new Set([
        ...props.issues.flatMap((issue) => issueNode(issue) ?? []),
        ...(studio?.preview()?.findings ?? []).flatMap((finding) => finding.wp ?? []),
      ]),
  )
  const rows = createMemo(() =>
    order().map((node, index) => ({
      id: node.id,
      phase: phaseOf(props.flow, node.id),
      // A phase rail starts at its first step.
      first: phaseOf(props.flow, node.id)?.id !== phaseOf(props.flow, order()[index - 1]?.id ?? "")?.id,
    })),
  )
  const drop = (target: string) => {
    const id = drag.id
    setDrag({ id: undefined, over: undefined })
    if (!id || id === target || nodeOf(props.flow, target)?.type === START) return
    props.edit(moveTo(props.flow, id, target))
  }
  return (
    <nav class="wf-outline" aria-label={copy.t("orchestra.workflows.studio.outline")}>
      <header class="wf-col-kicker">{copy.t("orchestra.workflows.studio.outline")}</header>
      <ol>
        <For each={rows().map((row) => row.id)}>
          {(id) => {
            const node = () => nodeOf(props.flow, id)
            const row = () => rows().find((item) => item.id === id)
            const checks = () => {
              const found = node()
              return found ? readChecklist(found).controls.length : 0
            }
            const movable = () => !props.readOnly && node()?.type !== START
            return (
              <Show when={node()}>
                {(found) => (
                  <>
                    <Show when={row()?.first && row()?.phase}>
                      {(phase) => <li class="wf-outline-phase">{phase().name}</li>}
                    </Show>
                    <li
                      classList={{
                        "wf-outline-row": true,
                        rail: !!row()?.phase,
                        open: props.open === id,
                        over: drag.over === id && drag.id !== id,
                        dragging: drag.id === id,
                      }}
                      draggable={movable()}
                      onDragStart={(event) => {
                        event.dataTransfer?.setData(STEP_DRAG, id)
                        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"
                        setDrag("id", id)
                      }}
                      onDragEnd={() => setDrag({ id: undefined, over: undefined })}
                      onDragOver={(event) => {
                        if (!drag.id || found().type === START) return
                        event.preventDefault()
                        setDrag("over", id)
                      }}
                      onDrop={(event) => {
                        if (!drag.id) return
                        event.preventDefault()
                        event.stopPropagation()
                        drop(id)
                      }}
                    >
                      <button
                        type="button"
                        aria-current={props.open === id ? "step" : undefined}
                        onClick={() => props.onOpen(props.open === id ? undefined : id)}
                      >
                        <span class={`wf-outline-tile k-${nodeTone(found())}`}>
                          <NodeGlyph name={nodeGlyph(found())} />
                        </span>
                        <span class="wf-outline-name">{found().name}</span>
                        <Show when={checks()}>
                          <span class="wf-outline-count" title={copy.count(checks(), "orchestra.workflows.count.check.one", "orchestra.workflows.count.check.other")}>
                            {checks()}
                          </span>
                        </Show>
                        <Show when={flagged().has(id)}>
                          <span class="wf-outline-warn" title={copy.t("orchestra.workflows.canvas.hasIssue", { name: found().name })}>
                            <Ic name="warn" />
                          </span>
                        </Show>
                      </button>
                    </li>
                  </>
                )}
              </Show>
            )
          }}
        </For>
      </ol>
      <Show when={!props.readOnly}>
        <p class="wf-outline-hint">{copy.t("orchestra.workflows.studio.dropHint")}</p>
      </Show>
    </nav>
  )
}

const FIXABLE = new Set(["advisory-only"])
// The lint categories with a title of their own in the copy; a new one shows its detail under a generic title.
const LINT = [
  "unknown-kind",
  "inject-without-file",
  "undeclared-macro",
  "duplicate-control-id",
  "trivial-control",
  "advisory-only",
  "ungated",
  "self-check-restates-control",
  "chain-exceeds-default-cap",
] as const

// The right column: what the agent receives at the open step, and what stands between the draft and publishing.
export function Inspector(props: {
  flow: Flow
  open: string | undefined
  issues: Issue[]
  readOnly?: boolean
  onOpen: (id: string | undefined) => void
  edit: (flow: Flow) => void
}) {
  const copy = useRelayCopy()
  const studio = useStudio()
  const [state, setState] = createStore({ tab: "receives" as "receives" | "publish" })
  const preview = () => studio?.preview()
  const sprint = () => preview()?.sprint ?? undefined
  const packages = () => sprint()?.work_packages ?? []
  const wp = () => packages().find((item) => item.id === props.open)
  const macro = () => {
    const id = wp()?.macro
    return id ? sprint()?.macros?.find((item) => item.id === id) : undefined
  }
  // The Provide context steps right before this one hand their file or text over with it.
  const context = () => {
    const at = packages().findIndex((item) => item.id === props.open)
    const before = packages().slice(0, Math.max(0, at)).reverse()
    const stop = before.findIndex((item) => item.kind !== "inject")
    return before.slice(0, stop < 0 ? before.length : stop).reverse()
  }
  const binding = () => preview()?.skillBindings.find((item) => item.wp === props.open)
  const findings = () => preview()?.findings ?? []
  const errors = () => findings().filter((finding) => finding.severity === "error").length + props.issues.length
  const steps = () => chain(props.flow).filter((node) => node.type !== START)
  const aiChecks = () => steps().some((node) => readChecklist(node).controls.some((control) => !!control.judge))
  const ready = () => [
    { key: "compiles", done: !!sprint() },
    { key: "noErrors", done: !errors() },
    {
      key: "checked",
      done: steps()
        .filter((node) => node.type === "relay.execute" || node.type === "relay.review")
        .every((node) => readChecklist(node).controls.length > 0),
    },
    ...(aiChecks() ? [{ key: "judge", done: preview()?.judge === "api" }] : []),
  ]
  const title = (finding: RelayPreview["findings"][number]) => {
    const known = LINT.find((item) => item === finding.category)
    return known ? copy.t(`orchestra.workflows.lint.${known}`) : finding.detail
  }
  // An advisory-only finding is fixed by making the step's AI checks block; any other finding opens its step.
  const fix = (finding: RelayPreview["findings"][number]) => {
    const node = finding.wp ? nodeOf(props.flow, finding.wp) : undefined
    if (!node) return
    if (finding.category !== "advisory-only") return props.onOpen(node.id)
    const controls = readChecklist(node).controls.map((control) => (control.judge ? { ...control, blocking: true } : control))
    props.edit(updateNode(props.flow, node.id, { parameters: { ...node.parameters, checklist: writeChecklist(controls) } }))
  }
  return (
    <aside class="wf-inspector" aria-label={copy.t("orchestra.workflows.studio.inspector")}>
      <div class="wf-seg wf-inspector-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={state.tab === "receives"} onClick={() => setState("tab", "receives")}>
          {copy.t("orchestra.workflows.studio.receives")}
        </button>
        <button type="button" role="tab" aria-selected={state.tab === "publish"} onClick={() => setState("tab", "publish")}>
          {copy.t("orchestra.workflows.studio.publish")}
          <Show when={findings().length + props.issues.length}>
            <span class="wf-outline-count">{findings().length + props.issues.length}</span>
          </Show>
        </button>
      </div>
      <Show when={state.tab === "receives"}>
        <div class="wf-inspector-body" role="tabpanel">
          <Show when={preview()} fallback={<p class="mx-meta">{copy.t("orchestra.workflows.studio.compiling")}</p>}>
            <Show
              when={sprint()}
              fallback={
                <p class="wf-note" role="status">
                  {copy.t("orchestra.workflows.studio.refused", { reason: preview()?.refusal?.message ?? "" })}
                </p>
              }
            >
              <Show
                when={wp()}
                fallback={
                  <>
                    <p class="mx-hint">{copy.t("orchestra.workflows.studio.pickStep")}</p>
                    <section class="wf-recv">
                      <h4>{copy.t("orchestra.workflows.studio.brief")}</h4>
                      <pre classList={{ empty: !sprint()?.brief }}>{sprint()?.brief || copy.t("orchestra.workflows.studio.noBrief")}</pre>
                    </section>
                  </>
                }
              >
                {(item) => (
                  <>
                    <p class="mx-hint">{copy.t("orchestra.workflows.studio.receivesHint")}</p>
                    <Show when={macro()?.instructions}>
                      <section class="wf-recv">
                        <h4>{copy.t("orchestra.workflows.studio.phase", { name: macro()?.title ?? macro()?.id ?? "" })}</h4>
                        <pre>{macro()?.instructions}</pre>
                      </section>
                    </Show>
                    <Show when={context().length}>
                      <section class="wf-recv">
                        <h4>{copy.t("orchestra.workflows.studio.context")}</h4>
                        <ul>
                          <For each={context()}>
                            {(inject) => (
                              <li>
                                <Show when={inject.file} fallback={<pre>{inject.text}</pre>}>
                                  <code>{inject.file}</code>
                                </Show>
                              </li>
                            )}
                          </For>
                        </ul>
                      </section>
                    </Show>
                    <Show when={item().kind !== "inject"}>
                      <section class="wf-recv">
                        <h4>
                          {copy.t("orchestra.workflows.studio.instructions")}
                          <Show when={binding()}>
                            {(bound) => (
                              <small>
                                {copy.t(
                                  bound().mode === "replace"
                                    ? "orchestra.workflows.studio.skillReplace"
                                    : "orchestra.workflows.studio.skillCombine",
                                  { skill: bound().skill },
                                )}
                              </small>
                            )}
                          </Show>
                        </h4>
                        <pre classList={{ empty: !item().instructions }}>
                          {item().instructions || copy.t("orchestra.workflows.plan.noInstructions")}
                        </pre>
                      </section>
                    </Show>
                    <Show when={item().self_check?.length}>
                      <section class="wf-recv">
                        <h4>{copy.t("orchestra.workflows.studio.selfCheck")}</h4>
                        <ul>
                          <For each={item().self_check}>{(line) => <li>{line}</li>}</For>
                        </ul>
                      </section>
                    </Show>
                    <Show when={item().checklist?.length}>
                      <section class="wf-recv">
                        <h4>{copy.t("orchestra.workflows.studio.checks")}</h4>
                        <ul>
                          <For each={item().checklist ?? []}>
                            {(control) => (
                              <li>
                                <Show
                                  when={control.cmd}
                                  fallback={
                                    <span>
                                      {control.judge}{" "}
                                      <em>
                                        {copy.t(
                                          control.blocking
                                            ? "orchestra.workflows.studio.aiBlocking"
                                            : "orchestra.workflows.studio.aiAdvisory",
                                        )}
                                      </em>
                                    </span>
                                  }
                                >
                                  <code>{control.cmd}</code>
                                </Show>
                              </li>
                            )}
                          </For>
                        </ul>
                      </section>
                    </Show>
                  </>
                )}
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
      <Show when={state.tab === "publish"}>
        <div class="wf-inspector-body" role="tabpanel">
          <ul class="wf-ready">
            <For each={ready()}>
              {(item) => (
                <li classList={{ done: item.done }}>
                  <Ic name={item.done ? "check" : "warn"} />
                  {copy.t(`orchestra.workflows.studio.ready.${item.key}`)}
                </li>
              )}
            </For>
          </ul>
          <Show when={findings().length} fallback={<p class="mx-hint">{copy.t("orchestra.workflows.studio.clean")}</p>}>
            <ul class="wf-findings">
              <For each={findings()}>
                {(finding) => (
                  <li classList={{ error: finding.severity === "error" }}>
                    <div>
                      <strong title={finding.detail}>
                        {title(finding)}
                      </strong>
                      <small>{finding.wp ? (nodeOf(props.flow, finding.wp)?.name ?? finding.wp) : copy.t("orchestra.workflows.studio.wholePlan")}</small>
                    </div>
                    <Show when={finding.wp && !props.readOnly}>
                      <button type="button" class="mx-btn" onClick={() => fix(finding)}>
                        {copy.t(FIXABLE.has(finding.category) ? "orchestra.workflows.studio.fix" : "orchestra.workflows.studio.show")}
                      </button>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </Show>
    </aside>
  )
}
