import { For, Show } from "solid-js"
import { BOLT, nodeGlyph, nodeTone } from "./catalog"
import { type FlowNode, isEntry } from "./graph"
import { Ic, NodeGlyph } from "./ui"

export type NodeOverlay = {
  badge?: "good" | "bad" | "warm" | "run"
  sub?: string
  subTone?: "good" | "bad" | "warm" | ""
  dim?: boolean
}

const BADGE = {
  good: '<path d="m3 6.2 2 2 4-4.4"/>',
  warm: '<path d="M4.4 3.5v5M7.6 3.5v5"/>',
  bad: '<path d="m3.5 3.5 5 5m0-5-5 5"/>',
  run: "",
}

// One node tile with its ports, state badge, label and tools. Pointer gestures (select, drag, connect) are the
// canvas's, read from the node's `data-id` and its ports' `data-port`.
export function CanvasNode(props: {
  node: FlowNode
  x: number
  y: number
  // The labels of its output ports.
  outputs: string[]
  overlay?: NodeOverlay
  sub: string
  selected: boolean
  // The only selected node, which keeps its tools up.
  solo: boolean
  issue: boolean
  dragging: boolean
  connect: string
  openLabel: string
  removeLabel: string
  onSelect: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  const round = () => isEntry(props.node)
  return (
    <div
      class="wf-node"
      classList={{
        round: round(),
        sel: props.selected,
        issue: props.issue,
        dim: !!props.overlay?.dim,
        dragging: props.dragging,
        solo: props.solo,
      }}
      data-id={props.node.id}
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
    >
      <Show when={round()}>
        <span class="wf-bolt">
          <svg viewBox="0 0 14 18" aria-hidden="true" innerHTML={BOLT} />
        </span>
      </Show>
      <div
        class={`wf-tile k-${nodeTone(props.node)}`}
        role="button"
        tabindex="0"
        aria-label={props.node.name}
        aria-pressed={props.selected}
        // Keyboard focus selects the node, so Enter opens it. A mouse press keeps focus on the canvas.
        onMouseDown={(event) => event.preventDefault()}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible") && !props.selected) props.onSelect()
        }}
        onKeyDown={(event) => {
          if (event.key !== " ") return
          event.preventDefault()
          props.onOpen()
        }}
      >
        <NodeGlyph name={nodeGlyph(props.node)} />
      </div>
      <Show when={!round()}>
        <span class="wf-port in" />
      </Show>
      <For each={props.outputs}>
        {(label, port) => (
          <span
            class={`wf-port out${props.outputs.length === 2 ? ` p${port()}` : ""}`}
            data-port={port()}
            title={label || props.connect}
          />
        )}
      </For>
      <Show when={props.overlay?.badge}>
        {(badge) => (
          <span class={`wf-state-badge ${badge()}`} aria-hidden="true">
            <svg viewBox="0 0 12 12" innerHTML={BADGE[badge()]} />
          </span>
        )}
      </Show>
      <div class="wf-label">
        {props.node.name}
        <small class={props.overlay?.subTone ?? ""}>{props.sub}</small>
      </div>
      <div class="wf-node-tools">
        <button type="button" aria-label={props.openLabel} title={props.openLabel} onClick={() => props.onOpen()}>
          <Ic name="edit" />
        </button>
        <Show when={props.node.type !== "relay.startTrigger"}>
          <button
            type="button"
            aria-label={props.removeLabel}
            title={props.removeLabel}
            onClick={() => props.onDelete()}
          >
            <Ic name="trash" />
          </button>
        </Show>
      </div>
    </div>
  )
}
