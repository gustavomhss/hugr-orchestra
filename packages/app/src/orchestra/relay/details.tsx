import { createEffect, createSignal, createUniqueId, For, type JSX, on, Show } from "solid-js"
import { Dialog } from "@kobalte/core/dialog"
import { createStore } from "solid-js/store"
import { nodeGlyph, nodeTone } from "./catalog"
import { type Flow, type FlowNode, updateNode } from "./graph"
import { Ic, NodeGlyph, useRelayCopy } from "./ui"

// Node details: a three-column layer over the canvas (input, parameters, output) with previous and next.
// The editor owns its URL; Escape and the close buttons return to the canvas.
export function NodeDetails(props: {
  node: FlowNode
  kind: string
  previous?: FlowNode
  next?: FlowNode
  input: JSX.Element
  params: JSX.Element
  output: JSX.Element
  save: JSX.Element
  actions?: JSX.Element
  readOnly?: boolean
  onNav: (id: string) => void
  onClose: () => void
}) {
  const copy = useRelayCopy()
  const title = createUniqueId()
  const [view, setView] = createStore({ pane: "params" })
  const previous = document.activeElement
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
    <Dialog.Portal>
      <div class="wf-scope">
      <div class="wf-modal-layer">
      <Dialog.Overlay class="wf-modal-backdrop" />
      <Dialog.Content
        class="mx-dialog wf-ndv"
        aria-labelledby={title}
        data-component="relay-node-details"
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          props.onClose()
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const dialog = event.currentTarget as HTMLElement
          ;(dialog.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)") ?? dialog.querySelector<HTMLElement>("button:not(:disabled)"))?.focus({ preventScroll: true })
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
        }}
      >
        <header class="mx-dialog-head">
          <div class="wf-ndv-title">
            <span class={`wf-pick-tile k-${nodeTone(props.node)}`}>
              <NodeGlyph name={nodeGlyph(props.node)} />
            </span>
            <div>
              <Dialog.Title as="h2" id={title}>{props.node.name || copy.t("orchestra.workflows.details.untitled")}</Dialog.Title>
              <p>{props.kind}</p>
            </div>
          </div>
          <div class="wf-ndv-nav">
            <button
              type="button"
              class="mx-btn icon"
              disabled={!props.previous}
              aria-label={copy.t("orchestra.workflows.details.previous", { name: props.previous?.name ?? "" })}
              title={
                props.previous
                  ? copy.t("orchestra.workflows.details.previous", { name: props.previous.name })
                  : copy.t("orchestra.workflows.details.first")
              }
              onClick={() => props.previous && props.onNav(props.previous.id)}
            >
              <Ic name="back" />
            </button>
            <button
              type="button"
              class="mx-btn icon"
              disabled={!props.next}
              aria-label={copy.t("orchestra.workflows.details.next", { name: props.next?.name ?? "" })}
              title={
                props.next
                  ? copy.t("orchestra.workflows.details.next", { name: props.next.name })
                  : copy.t("orchestra.workflows.details.last")
              }
              onClick={() => props.next && props.onNav(props.next.id)}
            >
              <Ic name="next" />
            </button>
            {props.actions}
            <button
              type="button"
              class="mx-btn icon"
              aria-label={copy.t("orchestra.workflows.details.close")}
              title={copy.t("orchestra.workflows.details.close")}
              onClick={props.onClose}
            >
              <Ic name="close" />
            </button>
          </div>
        </header>
        <div class="wf-ndv-switcher wf-range" role="group" aria-label={copy.t("orchestra.workflows.details.view")}>
          <For each={["params", "input", "output"] as const}>{(pane) => (
            <button type="button" aria-pressed={view.pane === pane} onClick={() => setView("pane", pane)}>
              {copy.t(`orchestra.workflows.details.${pane}`)}
            </button>
          )}</For>
        </div>
        <div class="wf-ndv-body">
          <div class="wf-ndv-col" data-active={view.pane === "input"} role="region" aria-label={copy.t("orchestra.workflows.details.input")}>
            {props.input}
          </div>
          <div class="wf-ndv-col mid" data-active={view.pane === "params"} role="region" aria-label={copy.t("orchestra.workflows.details.params")}>
            <fieldset class="wf-params" disabled={props.readOnly}>{props.params}</fieldset>
          </div>
          <div class="wf-ndv-col" data-active={view.pane === "output"} role="region" aria-label={copy.t("orchestra.workflows.details.output")}>
            {props.output}
          </div>
        </div>
        <footer class="mx-dialog-foot">
          {props.save}
          <button type="button" class="mx-btn" data-relay-done onClick={props.onClose}>
            {copy.t("orchestra.workflows.details.done")}
          </button>
        </footer>
      </Dialog.Content>
      </div>
      </div>
    </Dialog.Portal>
    </Dialog>
  )
}

// A column head with an optional Summary / JSON switch.
export function ColumnHead(props: {
  title: string
  view?: "summary" | "json"
  onView?: (view: "summary" | "json") => void
}) {
  const copy = useRelayCopy()
  return (
    <div class="wf-col-head">
      <h3>{props.title}</h3>
      <Show when={props.onView}>
        <div class="wf-mini-seg" role="group" aria-label={copy.t("orchestra.workflows.details.view")}>
          <button type="button" aria-pressed={props.view === "summary"} onClick={() => props.onView?.("summary")}>
            {copy.t("orchestra.workflows.details.summary")}
          </button>
          <button type="button" aria-pressed={props.view === "json"} onClick={() => props.onView?.("json")}>
            JSON
          </button>
        </div>
      </Show>
    </div>
  )
}

export function Rows(props: { rows: [string, string | undefined][] }) {
  return (
    <dl class="wf-kv">
      {props.rows
        .filter((row) => row[1] !== undefined && row[1] !== "")
        .map(([key, value]) => (
          <>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </>
        ))}
    </dl>
  )
}

// One column body that switches between a summary and the raw JSON it summarises.
export function Switchable(props: { title: string; json: unknown; children: JSX.Element }) {
  const [view, setView] = createSignal<"summary" | "json">("summary")
  return (
    <>
      <ColumnHead title={props.title} view={view()} onView={setView} />
      <Show when={view() === "summary"} fallback={<pre class="mx-log">{JSON.stringify(props.json, null, 2)}</pre>}>
        {props.children}
      </Show>
    </>
  )
}

export function Empty(props: { children: JSX.Element }) {
  return <div class="wf-col-empty">{props.children}</div>
}

export function NodeNameField(props: { flow: Flow; node: FlowNode; onChange: (flow: Flow) => void }) {
  const copy = useRelayCopy()
  const id = createUniqueId()
  const [draft, setDraft] = createStore({ name: props.node.name, error: "" as "" | "required" | "taken" })
  createEffect(on(() => [props.node.id, props.node.name], (next, previous) => {
    if (next[0] === previous?.[0] && next[1] === draft.name.trim()) return
    setDraft({ name: props.node.name, error: "" })
  }, { defer: true }))
  return (
    <label class="mx-field" classList={{ invalid: !!draft.error }}>
      <span id={`${id}-label`}>{copy.t("orchestra.workflows.details.name")}</span>
      <input
        value={draft.name}
        data-autofocus=""
        aria-labelledby={`${id}-label`}
        aria-invalid={!!draft.error}
        aria-describedby={draft.error ? id : undefined}
        onInput={(event) => {
          const value = event.currentTarget.value
          const name = value.trim()
          const taken = props.flow.nodes.some((node) => node.id !== props.node.id && node.name === name)
          setDraft({ name: value, error: !name ? "required" : taken ? "taken" : "" })
          if (!name || taken || name === props.node.name) return
          props.onChange(updateNode(props.flow, props.node.id, { name }))
        }}
        onBlur={() => !draft.error && setDraft("name", props.node.name)}
        on:keydown={(event) => {
          if (event.key === "Enter" && !draft.error) event.currentTarget.blur()
          if (event.key !== "Escape" || !draft.error) return
          event.preventDefault()
          event.stopPropagation()
          setDraft({ name: props.node.name, error: "" })
        }}
      />
      <Show when={draft.error}>
        <span id={id} class="mx-hint" role="alert" style={{ color: "var(--mx-bad)" }}>
          {copy.t(draft.error === "required" ? "orchestra.workflows.details.nameRequired" : "orchestra.workflows.details.nameTaken")}
        </span>
      </Show>
    </label>
  )
}
