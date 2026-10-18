import { Index, Show } from "solid-js"
import { NODE, portY } from "./geometry"
import type { FlowEdge, FlowNode } from "./graph"
import { Ic } from "./ui"

export const edgeKey = (edge: FlowEdge) => `${edge.from}>${edge.to}:${edge.port}`

export type Wire = {
  edge: FlowEdge
  // The path, and the point halfway along it where the wire's tools sit.
  d: string
  mx: number
  my: number
  // A wire that has to go back to an earlier row, drawn with an arrow of its own.
  back: boolean
  on: boolean
  ok: boolean
  dim: boolean
  from: { node: FlowNode; x: number; y: number }
}

// Every wire as one SVG: the visible paths, a wider invisible path to hit each one, the output labels of nodes with
// two outputs, and the dashed wire being dragged out of a port.
export function Wires(props: {
  marker: string
  wires: Wire[]
  // The key of the selected wire.
  selected?: string
  // The labels of a node's output ports.
  outputs: (node: FlowNode) => string[]
  temp?: string
  onPress: (edge: FlowEdge) => void
  onHover: (edge: FlowEdge | undefined) => void
}) {
  return (
    <svg class="wf-wires" width="1" height="1" aria-hidden="true">
      <defs>
        <marker id={props.marker} viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0.8 7.4 4 0 7.2z" class="wf-arrow" />
        </marker>
      </defs>
      <Index each={props.wires}>
        {(wire) => {
          const labels = () => props.outputs(wire().from.node)
          return (
            <>
              <path
                class="wf-wire"
                classList={{
                  on: wire().on,
                  ok: wire().ok,
                  dim: wire().dim,
                  sel: edgeKey(wire().edge) === props.selected,
                }}
                d={wire().d}
                marker-end={`url(#${props.marker})`}
              />
              <Show when={wire().back}>
                <path
                  class="wf-arrow"
                  d={`M${wire().mx + 4} ${wire().my - 4} L${wire().mx - 3} ${wire().my} L${wire().mx + 4} ${wire().my + 4}z`}
                />
              </Show>
              <Show when={labels().length === 2 && labels()[wire().edge.port]}>
                <text
                  class="wf-port-label"
                  x={wire().from.x + NODE + 9}
                  y={portY(wire().from, wire().edge.port, 2) - 5}
                >
                  {labels()[wire().edge.port]}
                </text>
              </Show>
            </>
          )
        }}
      </Index>
      <Index each={props.wires}>
        {(wire) => (
          <path
            class="wf-wire-hit"
            d={wire().d}
            onPointerDown={() => props.onPress(wire().edge)}
            onPointerEnter={() => props.onHover(wire().edge)}
            onPointerLeave={() => props.onHover(undefined)}
          />
        )}
      </Index>
      <Show when={props.temp}>{(d) => <path class="wf-wire-temp" d={d()} />}</Show>
    </svg>
  )
}

// The insert and remove buttons on the middle of a wire.
export function EdgeTools(props: {
  wire: Wire
  insert: string
  unlink: string
  onHover: (edge: FlowEdge | undefined) => void
  onInsert: () => void
  onUnlink: () => void
}) {
  return (
    <div
      class="wf-edge-tools"
      style={{ left: `${props.wire.mx}px`, top: `${props.wire.my}px` }}
      onPointerEnter={() => props.onHover(props.wire.edge)}
      onPointerLeave={() => props.onHover(undefined)}
    >
      <button type="button" aria-label={props.insert} title={props.insert} onClick={() => props.onInsert()}>
        <Ic name="plus" />
      </button>
      <button type="button" aria-label={props.unlink} title={props.unlink} onClick={() => props.onUnlink()}>
        <Ic name="trash" />
      </button>
    </div>
  )
}
