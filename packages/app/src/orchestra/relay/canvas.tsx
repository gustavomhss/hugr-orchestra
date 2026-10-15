import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from "solid-js"
import { BOLT, nodeGlyph, nodeTone } from "./catalog"
import {
  bounds,
  centerOn,
  edgePath,
  fitView,
  groupRect,
  intersects,
  NODE,
  type Point,
  portY,
  type Rect,
  snap,
  toWorld,
  type View,
  zoomAt,
} from "./geometry"
import { connect, type Flow, type FlowEdge, type FlowNode, isEntry, moveNodes, type Outputs, outputsOf } from "./graph"
import { Minimap } from "./minimap"
import { Ic, NodeGlyph } from "./ui"

export type NodeOverlay = {
  badge?: "good" | "bad" | "warm" | "run"
  sub?: string
  subTone?: "good" | "bad" | "warm" | ""
  dim?: boolean
}
export type CanvasApi = {
  fit: (animate?: boolean) => void
  center: (id: string) => void
  zoomBy: (factor: number) => void
  zoomTo: (k: number) => void
}
export type CanvasText = {
  label: string
  add: string
  fit: string
  zoomIn: string
  zoomOut: string
  keys: string
  minimap: string
  open: (name: string) => string
  remove: (name: string) => string
  addAfter: (name: string) => string
  insert: string
  unlink: string
  connect: string
  protocol: string
  steps: (count: number) => string
}

const BADGE = {
  good: '<path d="m3 6.2 2 2 4-4.4"/>',
  warm: '<path d="M4.4 3.5v5M7.6 3.5v5"/>',
  bad: '<path d="m3.5 3.5 5 5m0-5-5 5"/>',
  run: "",
}
const OVERLAYS =
  ".wf-rail,.wf-controls,.wf-banner,.wf-drawer,.wf-node-tools,.wf-stub,.wf-edge-tools,.wf-empty-canvas,.wf-minimap,[data-protocol]"
let instances = 0

type Drag =
  | { mode: "pan"; view: View; sx: number; sy: number; moved: boolean; pointer: number }
  | { mode: "node"; ids: string[]; start: Map<string, Point>; sx: number; sy: number; moved: boolean; pointer: number }
  | { mode: "connect"; from: string; port: number; pointer: number; at?: Point; moved: boolean; sx: number; sy: number }
  | { mode: "rubber"; origin: Point; box?: Rect; pointer: number; moved: boolean; sx: number; sy: number }

// The node canvas: pan, zoom, drag, connect, box-select, a minimap and the "+" affordances. Edits leave
// through onChange as whole flows; the editor owns persistence.
export function Canvas(props: {
  flow: Flow
  outputs: Outputs
  issues: Set<string>
  selected: string[]
  text: CanvasText
  overlay?: (node: FlowNode) => NodeOverlay | undefined
  sub: (node: FlowNode) => string
  path?: string[]
  drawer: boolean
  banner?: JSX.Element
  empty?: JSX.Element
  children?: JSX.Element
  onSelect: (ids: string[]) => void
  onChange: (flow: Flow) => void
  onReject: (reason: "entry") => void
  onOpen: (id: string) => void
  onAdd: (anchor?: { id: string; port: number }) => void
  onDelete: (ids: string[]) => void
  onEdge: (edge: FlowEdge, action: "insert" | "remove") => void
  onProtocol?: (phase: string) => void
  onKeys: () => void
  onDrop?: (key: string, at: Point) => void
  api?: (api: CanvasApi) => void
}) {
  let host!: HTMLDivElement
  const marker = `wf-arrow-${++instances}`
  const [view, setView] = createSignal<View>({ k: 1, x: 0, y: 0 })
  const [size, setSize] = createSignal({ w: 0, h: 0 })
  const [animate, setAnimate] = createSignal(false)
  const [moving, setMoving] = createSignal<Map<string, Point>>()
  const [drag, setDrag] = createSignal<Drag>()
  const [edgeTools, setEdgeTools] = createSignal<FlowEdge>()
  const selected = () => new Set(props.selected)
  const position = (node: FlowNode): Point => moving()?.get(node.id) ?? { x: node.x, y: node.y }
  const nodes = createMemo(() => props.flow.nodes.map((node) => ({ node, ...position(node) })))
  const at = (id: string) => nodes().find((item) => item.node.id === id)
  const groups = createMemo(() =>
    props.flow.phases.flatMap((phase) => {
      const rect = groupRect(phase.nodeIds.flatMap((id) => at(id) ?? []))
      return rect ? [{ phase, rect }] : []
    }),
  )
  const groupOf = (id: string) => groups().find((item) => item.phase.nodeIds.includes(id))?.rect
  const outs = (node: FlowNode) => outputsOf(props.flow, node, props.outputs)
  const wires = createMemo(() =>
    props.flow.edges.flatMap((edge) => {
      const from = at(edge.from)
      const to = at(edge.to)
      if (!from || !to) return []
      const path = edgePath({
        from,
        to,
        port: edge.port,
        outputs: outs(from.node).length,
        fromGroup: groupOf(edge.from),
        toGroup: groupOf(edge.to),
      })
      const on = selected().has(edge.from) || selected().has(edge.to)
      const ok = !!props.path && props.path.includes(edge.from) && props.path.includes(edge.to)
      return [{ edge, ...path, on, ok, dim: !!props.path && !ok, from }]
    }),
  )
  const content = createMemo(() => bounds(nodes()))
  const inset = () => ({ left: 30, top: 64, right: 30 + (props.drawer ? 340 : 0), bottom: 126 })

  const fit = (smooth = false) => {
    if (!size().w) return
    setAnimate(smooth)
    setView(fitView(content(), size(), inset()))
  }
  const zoomBy = (factor: number) => {
    setAnimate(false)
    setView(zoomAt(view(), factor, size().w / 2, size().h / 2))
  }
  const center = (id: string) => {
    const item = at(id)
    if (!item) return
    setAnimate(true)
    setView(centerOn(view(), item, { w: size().w - (props.drawer ? 340 : 0), h: size().h }))
  }
  props.api?.({ fit, center, zoomBy, zoomTo: (k) => zoomBy(k / view().k) })

  onMount(() => {
    const observer = new ResizeObserver(() => {
      const first = !size().w
      setSize({ w: host.clientWidth, h: host.clientHeight })
      if (first) fit()
    })
    observer.observe(host)
    onCleanup(() => observer.disconnect())
  })

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = host.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const world = (event: { clientX: number; clientY: number }) => {
    const point = local(event)
    return toWorld(view(), point.x, point.y)
  }

  const down = (event: PointerEvent) => {
    if (event.button !== 0) return
    const target = event.target instanceof Element ? event.target : undefined
    if (!target || target.closest(OVERLAYS)) return
    host.focus({ preventScroll: true })
    setEdgeTools(undefined)
    const port = target.closest<HTMLElement>(".wf-port.out")
    const nodeElement = target.closest<HTMLElement>(".wf-node")
    const grip = target.closest<HTMLElement>("[data-grip]")
    const base = { sx: event.clientX, sy: event.clientY, pointer: event.pointerId, moved: false }
    if (port && nodeElement?.dataset.id)
      return setDrag({ mode: "connect", from: nodeElement.dataset.id, port: Number(port.dataset.port ?? 0), ...base })
    if (nodeElement?.dataset.id) {
      const id = nodeElement.dataset.id
      const toggle = event.shiftKey || event.metaKey
      const next = toggle
        ? selected().has(id)
          ? props.selected.filter((item) => item !== id)
          : [...props.selected, id]
        : selected().has(id)
          ? props.selected
          : [id]
      props.onSelect(next)
      return setDrag({
        mode: "node",
        ids: next,
        start: new Map(next.flatMap((item) => (at(item) ? [[item, { x: at(item)!.x, y: at(item)!.y }]] : []))),
        ...base,
      })
    }
    if (grip?.dataset.grip) {
      const ids = props.flow.phases.find((phase) => phase.id === grip.dataset.grip)?.nodeIds ?? []
      props.onSelect(ids)
      return setDrag({
        mode: "node",
        ids,
        start: new Map(ids.flatMap((item) => (at(item) ? [[item, { x: at(item)!.x, y: at(item)!.y }]] : []))),
        ...base,
      })
    }
    if (event.shiftKey) return setDrag({ mode: "rubber", origin: world(event), ...base })
    setDrag({ mode: "pan", view: view(), ...base })
  }

  const move = (event: PointerEvent) => {
    const previous = drag()
    if (!previous) return
    const dx = event.clientX - previous.sx
    const dy = event.clientY - previous.sy
    // Capture only once it is a real drag, so plain clicks and double-clicks keep their targets.
    if (!previous.moved && Math.abs(dx) + Math.abs(dy) <= 3) return
    const current = previous.moved ? previous : { ...previous, moved: true }
    if (!previous.moved) {
      setDrag(current)
      host.setPointerCapture?.(current.pointer)
    }
    setAnimate(false)
    if (current.mode === "pan") return setView({ k: current.view.k, x: current.view.x + dx, y: current.view.y + dy })
    if (current.mode === "node") {
      const k = view().k
      return setMoving(
        new Map(
          current.ids.flatMap((id) => {
            const start = current.start.get(id)
            return start ? [[id, { x: snap(start.x + dx / k), y: snap(start.y + dy / k) }]] : []
          }),
        ),
      )
    }
    if (current.mode === "connect") return setDrag({ ...current, at: world(event) })
    const point = world(event)
    const box = {
      x: Math.min(point.x, current.origin.x),
      y: Math.min(point.y, current.origin.y),
      w: Math.abs(point.x - current.origin.x),
      h: Math.abs(point.y - current.origin.y),
    }
    setDrag({ ...current, box })
  }

  const up = (event: PointerEvent) => {
    const current = drag()
    if (!current) return
    setDrag(undefined)
    if (current.mode === "pan") return current.moved ? undefined : props.onSelect([])
    if (current.mode === "node") {
      const positions = moving()
      setMoving(undefined)
      if (current.moved && positions)
        return props.onChange(
          moveNodes(props.flow, new Map([...positions].map(([id, point]) => [id, [point.x, point.y]]))),
        )
      if (!event.shiftKey && !event.metaKey && current.ids.length > 1) {
        const id = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".wf-node")?.dataset.id
        if (id) props.onSelect([id])
      }
      return
    }
    if (current.mode === "connect") {
      const id = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".wf-node")?.dataset.id
      if (!id || id === current.from) return
      const next = connect(props.flow, current.from, id, current.port)
      if (!next) return props.onReject("entry")
      return props.onChange(next)
    }
    const box = current.box
    if (box) props.onSelect(props.flow.nodes.filter((node) => intersects(position(node), box)).map((node) => node.id))
  }

  const wheel = (event: WheelEvent) => {
    if (event.target instanceof Element && event.target.closest(".wf-drawer")) return
    event.preventDefault()
    setAnimate(false)
    if (event.ctrlKey || event.metaKey) {
      const point = local(event)
      return setView(zoomAt(view(), Math.exp(-event.deltaY * 0.01), point.x, point.y))
    }
    setView({ ...view(), x: view().x - event.deltaX, y: view().y - event.deltaY })
  }
  onMount(() => {
    host.addEventListener("wheel", wheel, { passive: false })
    onCleanup(() => host.removeEventListener("wheel", wheel))
  })

  let hideTools: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(hideTools))
  const tools = (edge: FlowEdge | undefined) => {
    clearTimeout(hideTools)
    if (edge) return setEdgeTools(edge)
    hideTools = setTimeout(() => setEdgeTools(undefined), 260)
  }
  const toolsAt = () => wires().find((wire) => wire.edge === edgeTools())

  const stubs = createMemo(() =>
    nodes().flatMap((item) =>
      outs(item.node).flatMap((_, port) =>
        props.flow.edges.some((edge) => edge.from === item.node.id && edge.port === port) ? [] : [{ item, port }],
      ),
    ),
  )
  const temp = () => {
    const current = drag()
    if (current?.mode !== "connect" || !current.at) return
    const from = at(current.from)
    if (!from) return
    const sx = from.x + NODE
    const sy = portY(from, current.port, outs(from.node).length)
    return `M${sx} ${sy} C${sx + 60} ${sy} ${current.at.x - 60} ${current.at.y} ${current.at.x} ${current.at.y}`
  }

  return (
    <div
      ref={host}
      class="wf-canvas"
      classList={{ panning: drag()?.mode === "pan" && drag()?.moved }}
      tabindex="0"
      role="application"
      aria-label={props.text.label}
      data-component="relay-canvas"
      style={{
        "background-size": `${20 * view().k}px ${20 * view().k}px`,
        "background-position": `${view().x}px ${view().y}px`,
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => (setDrag(undefined), setMoving(undefined))}
      onDblClick={(event) => {
        const id =
          event.target instanceof Element ? event.target.closest<HTMLElement>(".wf-node")?.dataset.id : undefined
        if (id && !(event.target instanceof Element && event.target.closest(".wf-node-tools"))) props.onOpen(id)
      }}
      onDragOver={(event) => event.dataTransfer?.types.includes("text/relay-kind") && event.preventDefault()}
      onDrop={(event) => {
        const key = event.dataTransfer?.getData("text/relay-kind")
        if (!key || !props.onDrop) return
        event.preventDefault()
        const point = world(event)
        props.onDrop(key, { x: snap(point.x - NODE / 2), y: snap(point.y - NODE / 2) })
      }}
    >
      <div
        class="wf-world"
        classList={{ animate: animate() }}
        style={{ transform: `translate(${view().x}px, ${view().y}px) scale(${view().k})` }}
      >
        <For each={groups()}>
          {(group) => (
            <div
              class="wf-group"
              data-phase={group.phase.id}
              style={{
                left: `${group.rect.x}px`,
                top: `${group.rect.y}px`,
                width: `${group.rect.w}px`,
                height: `${group.rect.h}px`,
              }}
            >
              <div class="wf-group-head" data-grip={group.phase.id}>
                <b>{group.phase.name}</b>
                <small>{props.text.steps(group.phase.nodeIds.length)}</small>
                <Show when={props.onProtocol}>
                  <button
                    type="button"
                    class="mx-link"
                    data-protocol={group.phase.id}
                    onClick={() => props.onProtocol?.(group.phase.id)}
                  >
                    {props.text.protocol}
                  </button>
                </Show>
              </div>
            </div>
          )}
        </For>
        <svg class="wf-wires" width="1" height="1" aria-hidden="true">
          <defs>
            <marker id={marker} viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0.8 7.4 4 0 7.2z" class="wf-arrow" />
            </marker>
          </defs>
          <For each={wires()}>
            {(wire) => (
              <>
                <path
                  class="wf-wire"
                  classList={{ on: wire.on, ok: wire.ok, dim: wire.dim }}
                  d={wire.d}
                  marker-end={`url(#${marker})`}
                />
                <Show when={wire.back}>
                  <path
                    class="wf-arrow"
                    d={`M${wire.mx + 4} ${wire.my - 4} L${wire.mx - 3} ${wire.my} L${wire.mx + 4} ${wire.my + 4}z`}
                  />
                </Show>
                <Show when={outs(wire.from.node).length === 2 && outs(wire.from.node)[wire.edge.port]}>
                  <text class="wf-port-label" x={wire.from.x + NODE + 9} y={portY(wire.from, wire.edge.port, 2) - 5}>
                    {outs(wire.from.node)[wire.edge.port]}
                  </text>
                </Show>
              </>
            )}
          </For>
          <For each={wires()}>
            {(wire) => (
              <path
                class="wf-wire-hit"
                d={wire.d}
                onPointerEnter={() => tools(wire.edge)}
                onPointerLeave={() => tools(undefined)}
              />
            )}
          </For>
          <Show when={temp()}>{(d) => <path class="wf-wire-temp" d={d()} />}</Show>
        </svg>
        <For each={props.flow.nodes}>
          {(node) => {
            const item = {
              node,
              get x() {
                return position(node).x
              },
              get y() {
                return position(node).y
              },
            }
            const overlay = () => props.overlay?.(item.node)
            const round = () => isEntry(item.node)
            const count = () => outs(item.node).length
            return (
              <div
                class="wf-node"
                classList={{
                  round: round(),
                  sel: selected().has(item.node.id),
                  issue: props.issues.has(item.node.id),
                  dim: !!overlay()?.dim,
                  dragging: !!moving()?.has(item.node.id),
                }}
                data-id={item.node.id}
                style={{ left: `${item.x}px`, top: `${item.y}px` }}
              >
                <Show when={round()}>
                  <span class="wf-bolt">
                    <svg viewBox="0 0 14 18" aria-hidden="true" innerHTML={BOLT} />
                  </span>
                </Show>
                <div
                  class={`wf-tile k-${nodeTone(item.node)}`}
                  role="button"
                  aria-label={item.node.name}
                  aria-pressed={selected().has(item.node.id)}
                >
                  <NodeGlyph name={nodeGlyph(item.node)} />
                </div>
                <Show when={!round()}>
                  <span class="wf-port in" />
                </Show>
                <For each={outs(item.node)}>
                  {(label, port) => (
                    <span
                      class={`wf-port out${count() === 2 ? ` p${port()}` : ""}`}
                      data-port={port()}
                      title={label || props.text.connect}
                    />
                  )}
                </For>
                <Show when={overlay()?.badge}>
                  {(badge) => (
                    <span class={`wf-state-badge ${badge()}`} aria-hidden="true">
                      <svg viewBox="0 0 12 12" innerHTML={BADGE[badge()]} />
                    </span>
                  )}
                </Show>
                <div class="wf-label">
                  {item.node.name}
                  <small class={overlay()?.subTone ?? ""}>{overlay()?.sub ?? props.sub(item.node)}</small>
                </div>
                <div class="wf-node-tools">
                  <button
                    type="button"
                    aria-label={props.text.open(item.node.name)}
                    title={props.text.open(item.node.name)}
                    onClick={() => props.onOpen(item.node.id)}
                  >
                    <Ic name="edit" />
                  </button>
                  <Show when={item.node.type !== "relay.startTrigger"}>
                    <button
                      type="button"
                      aria-label={props.text.remove(item.node.name)}
                      title={props.text.remove(item.node.name)}
                      onClick={() => props.onDelete([item.node.id])}
                    >
                      <Ic name="trash" />
                    </button>
                  </Show>
                </div>
              </div>
            )
          }}
        </For>
        <For each={stubs()}>
          {(stub) => (
            <div
              class="wf-stub"
              style={{
                left: `${stub.item.x + NODE + 4}px`,
                top: `${portY(stub.item, stub.port, outs(stub.item.node).length) - 11}px`,
              }}
            >
              <i />
              <button
                type="button"
                aria-label={props.text.addAfter(stub.item.node.name)}
                title={props.text.addAfter(stub.item.node.name)}
                onClick={() => props.onAdd({ id: stub.item.node.id, port: stub.port })}
              >
                <Ic name="plus" />
              </button>
            </div>
          )}
        </For>
        <Show when={toolsAt()}>
          {(wire) => (
            <div
              class="wf-edge-tools"
              style={{ left: `${wire().mx}px`, top: `${wire().my}px` }}
              onPointerEnter={() => tools(wire().edge)}
              onPointerLeave={() => tools(undefined)}
            >
              <button
                type="button"
                aria-label={props.text.insert}
                title={props.text.insert}
                onClick={() => props.onEdge(wire().edge, "insert")}
              >
                <Ic name="plus" />
              </button>
              <button
                type="button"
                aria-label={props.text.unlink}
                title={props.text.unlink}
                onClick={() => (setEdgeTools(undefined), props.onEdge(wire().edge, "remove"))}
              >
                <Ic name="trash" />
              </button>
            </div>
          )}
        </Show>
        <Show
          when={(() => {
            const current = drag()
            return current?.mode === "rubber" ? current.box : undefined
          })()}
        >
          {(box) => (
            <div
              class="wf-rubber"
              style={{ left: `${box().x}px`, top: `${box().y}px`, width: `${box().w}px`, height: `${box().h}px` }}
            />
          )}
        </Show>
      </div>
      <Show when={props.banner}>{props.banner}</Show>
      <div class="wf-rail">
        <button
          type="button"
          class="mx-btn icon"
          aria-label={props.text.add}
          title={props.text.add}
          onClick={() => props.onAdd()}
        >
          <Ic name="plus" />
        </button>
      </div>
      <div class="wf-controls">
        <button
          type="button"
          class="mx-btn icon"
          aria-label={props.text.fit}
          title={props.text.fit}
          onClick={() => fit(true)}
        >
          <Ic name="fit" />
        </button>
        <button
          type="button"
          class="mx-btn icon"
          aria-label={props.text.zoomIn}
          title={props.text.zoomIn}
          onClick={() => zoomBy(1.2)}
        >
          <Ic name="zoomIn" />
        </button>
        <button
          type="button"
          class="mx-btn icon"
          aria-label={props.text.zoomOut}
          title={props.text.zoomOut}
          onClick={() => zoomBy(1 / 1.2)}
        >
          <Ic name="zoomOut" />
        </button>
        <span class="mx-btn wf-zoom" aria-live="polite">
          {Math.round(view().k * 100)}%
        </span>
        <button
          type="button"
          class="mx-btn icon"
          aria-label={props.text.keys}
          title={props.text.keys}
          onClick={props.onKeys}
        >
          <Ic name="keys" />
        </button>
      </div>
      <Minimap
        title={props.text.minimap}
        content={content()}
        groups={groups().map((group) => group.rect)}
        nodes={nodes().map((item) => {
          const badge = props.overlay?.(item.node)?.badge
          return {
            id: item.node.id,
            x: item.x,
            y: item.y,
            tone: selected().has(item.node.id) ? "sel" : badge === "bad" ? "bad" : badge === "warm" ? "warm" : "",
          }
        })}
        view={view()}
        size={size()}
        onJump={(point) =>
          setView({ ...view(), x: size().w / 2 - point.x * view().k, y: size().h / 2 - point.y * view().k })
        }
      />
      <Show when={props.empty}>{props.empty}</Show>
      {props.children}
    </div>
  )
}
