import { For } from "solid-js"
import { minimapBox, minimapPoint, NODE, type Point, type Rect, type View } from "./geometry"

// Overview in the bottom corner: phase boxes, nodes and the visible area. A click moves the view there.
export function Minimap(props: {
  title: string
  content: Rect
  groups: Rect[]
  nodes: (Point & { id: string; tone: "sel" | "bad" | "warm" | "" })[]
  view: View
  size: { w: number; h: number }
  onJump: (point: Point) => void
}) {
  const box = () => minimapBox(props.content)
  return (
    <div
      class="wf-minimap"
      title={props.title}
      aria-hidden="true"
      onPointerDown={(event) => {
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        props.onJump(
          minimapPoint(
            box(),
            { w: rect.width, h: rect.height },
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
          ),
        )
      }}
    >
      <svg viewBox={`${box().x} ${box().y} ${box().w} ${box().h}`} preserveAspectRatio="xMidYMid meet">
        <For each={props.groups}>
          {(group) => <rect class="mm-group" x={group.x} y={group.y} width={group.w} height={group.h} rx="6" />}
        </For>
        <For each={props.nodes}>
          {(node) => <rect class={`mm-node ${node.tone}`} x={node.x} y={node.y} width={NODE} height={NODE} rx="8" />}
        </For>
        <rect
          class="mm-view"
          x={-props.view.x / props.view.k}
          y={-props.view.y / props.view.k}
          width={props.size.w / props.view.k}
          height={props.size.h / props.view.k}
          rx="4"
        />
      </svg>
    </div>
  )
}
