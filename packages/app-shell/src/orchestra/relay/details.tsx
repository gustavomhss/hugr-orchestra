import { createSignal, type JSX, onMount, Show } from "solid-js"
import { nodeGlyph, nodeTone } from "./catalog"
import type { FlowNode } from "./graph"
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
  onNav: (id: string) => void
  onClose: () => void
}) {
  const copy = useRelayCopy()
  let section!: HTMLElement
  onMount(() =>
    queueMicrotask(() =>
      (
        section.querySelector<HTMLElement>("[data-autofocus]") ??
        section.querySelector<HTMLElement>("textarea,input,select")
      )?.focus({ preventScroll: true }),
    ),
  )
  return (
    <div class="wf-scrim" onPointerDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section
        ref={section}
        class="mx-dialog wf-ndv"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wf-ndv-title"
        data-component="relay-node-details"
      >
        <header class="mx-dialog-head">
          <div class="wf-ndv-title">
            <span class={`wf-pick-tile k-${nodeTone(props.node)}`}>
              <NodeGlyph name={nodeGlyph(props.node)} />
            </span>
            <div>
              <h2 id="wf-ndv-title">{props.node.name || copy.t("orchestra.workflows.details.untitled")}</h2>
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
        <div class="wf-ndv-body">
          <div class="wf-ndv-col" role="region" aria-label={copy.t("orchestra.workflows.details.input")}>
            {props.input}
          </div>
          <div class="wf-ndv-col mid" role="region" aria-label={copy.t("orchestra.workflows.details.params")}>
            {props.params}
          </div>
          <div class="wf-ndv-col" role="region" aria-label={copy.t("orchestra.workflows.details.output")}>
            {props.output}
          </div>
        </div>
        <footer class="mx-dialog-foot">
          {props.save}
          <button type="button" class="mx-btn" onClick={props.onClose}>
            {copy.t("orchestra.workflows.details.done")}
          </button>
        </footer>
      </section>
    </div>
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
