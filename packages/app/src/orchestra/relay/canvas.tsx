import { createEffect, createMemo, createSignal, Index, type JSX, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { modalActive } from "@/utils/modal-active"
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
import { CanvasControls } from "./canvas-controls"
import { type NodeMenuItem, NodeMenu } from "./canvas-menu"
import { CanvasNode, type NodeOverlay } from "./canvas-node"
import { PhaseHead } from "./canvas-phase"
import { connect, type Flow, type FlowEdge, type FlowNode, moveNodes, type Outputs, outputsOf } from "./graph"
import { Minimap } from "./minimap"
import { Ic } from "./ui"

export type CanvasApi = {
  fit: (animate?: boolean) => void
  // `drawer` says whether the add panel will still be open; the node is centred in what is left of the canvas.
  center: (id: string, drawer?: boolean) => void
  zoomBy: (factor: number) => void
  zoomTo: (k: number) => void
  // Puts a phase header into rename mode.
  rename: (phase: string) => void
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
  menu: string
  renamePhase: (name: string) => string
  removePhase: (name: string) => string
  steps: (count: number) => string
}

const OVERLAYS = [
  ".wf-rail",
  ".wf-controls",
  ".wf-banner",
  ".wf-drawer",
  ".wf-node-tools",
  ".wf-stub",
  ".wf-edge-tools",
  ".wf-empty-canvas",
  ".wf-minimap",
  ".wf-ctx",
  ".wf-group-tools",
  ".wf-group-name",
  "[data-protocol]",
].join(",")
// Ctrl-click toggles the selection everywhere but on a Mac, where it opens the context menu.
const IS_MAC = typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform)
let instances = 0

export const sameEdge = (a: FlowEdge, b: FlowEdge) => a.from === b.from && a.to === b.to && a.port === b.port
const edgeKey = (edge: FlowEdge) => `${edge.from}>${edge.to}:${edge.port}`

type Drag =
  | { mode: "pan"; view: View; sx: number; sy: number; moved: boolean; pointer: number; edge?: FlowEdge }
  | { mode: "node"; ids: string[]; start: Map<string, Point>; sx: number; sy: number; moved: boolean; pointer: number }
  | { mode: "connect"; from: string; port: number; pointer: number; at?: Point; moved: boolean; sx: number; sy: number }
  | { mode: "rubber"; origin: Point; box?: Rect; pointer: number; moved: boolean; sx: number; sy: number }

// The node canvas: pan, zoom, drag, connect, box-select, a minimap and the "+" affordances. Edits leave
// through onChange as whole flows; the editor owns persistence.
export function Canvas(props: {
  flow: Flow
  readOnly?: boolean
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
  onRenamePhase?: (phase: string, name: string) => void
  onUngroup?: (phase: string) => void
  // The right-click menu of a node; `ids` is the selection it acts on.
  menu?: (ids: string[], node: FlowNode) => NodeMenuItem[]
  // A connection replaced others: the edges before and after, and the two steps joined.
  onRewire?: (before: FlowEdge[], after: FlowEdge[], from: string, to: string) => void
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
  // `edge` is the selected wire (its tools stay up); `menu` is an open right-click menu.
  const [ui, setUI] = createStore<{
    renaming?: string
    edge?: string
    menu?: { x: number; y: number; id: string; ids: string[] }
  }>({})
  let pressed: FlowEdge | undefined
  const selected = () => new Set(props.selected)
  const position = (node: FlowNode): Point => moving()?.get(node.id) ?? { x: node.x, y: node.y }
  const nodes = createMemo(() => props.flow.nodes.map((node) => ({ node, ...position(node) })))
  const byID = createMemo(() => new Map(nodes().map((item) => [item.node.id, item])))
  const at = (id: string) => byID().get(id)
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
  const center = (id: string, drawer = props.drawer) => {
    const item = at(id)
    if (!item) return
    setAnimate(true)
    setView(centerOn(view(), item, { w: size().w - (drawer ? 340 : 0), h: size().h }))
  }
  props.api?.({
    fit,
    center,
    zoomBy,
    zoomTo: (k) => zoomBy(k / view().k),
    rename: (phase) => setUI("renaming", phase),
  })

  // A selected node and a selected wire are never both the target of Delete.
  createEffect(() => {
    if (props.selected.length) setUI("edge", undefined)
  })

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
    const wire = pressed
    pressed = undefined
    if (event.button !== 0) return
    const target = event.target instanceof Element ? event.target : undefined
    if (!target || target.closest(OVERLAYS)) return
    host.focus({ preventScroll: true })
    setEdgeTools(undefined)
    setUI("edge", undefined)
    const port = target.closest<HTMLElement>(".wf-port.out")
    const nodeElement = target.closest<HTMLElement>(".wf-node")
    const grip = target.closest<HTMLElement>("[data-grip]")
    const base = { sx: event.clientX, sy: event.clientY, pointer: event.pointerId, moved: false }
    if (!props.readOnly && port && nodeElement?.dataset.id)
      return setDrag({ mode: "connect", from: nodeElement.dataset.id, port: Number(port.dataset.port ?? 0), ...base })
    if (nodeElement?.dataset.id) {
      const id = nodeElement.dataset.id
      const toggle = event.shiftKey || event.metaKey || (event.ctrlKey && !IS_MAC)
      const next = toggle
        ? selected().has(id)
          ? props.selected.filter((item) => item !== id)
          : [...props.selected, id]
        : selected().has(id)
          ? props.selected
          : [id]
      props.onSelect(next)
      if (props.readOnly) return
      return setDrag({
        mode: "node",
        ids: next,
        start: new Map(next.flatMap((item) => (at(item) ? [[item, { x: at(item)!.x, y: at(item)!.y }]] : []))),
        ...base,
      })
    }
    if (grip?.dataset.grip) {
      if (props.readOnly) return
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
    setDrag({ mode: "pan", view: view(), edge: wire, ...base })
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
    if (current.mode === "pan") {
      if (current.moved) return
      // A plain click on a wire selects it, which keeps its insert and remove tools up.
      if (current.edge) setUI("edge", edgeKey(current.edge))
      return props.onSelect([])
    }
    if (current.mode === "node") {
      const positions = moving()
      setMoving(undefined)
      if (current.moved && positions)
        return props.onChange(
          moveNodes(props.flow, new Map([...positions].map(([id, point]) => [id, [point.x, point.y]]))),
        )
      if (!event.shiftKey && !event.metaKey && !(event.ctrlKey && !IS_MAC) && current.ids.length > 1) {
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
      const before = [...props.flow.edges]
      props.onChange(next)
      props.onRewire?.(before, next.edges, current.from, id)
      return
    }
    const box = current.box
    if (box) props.onSelect(props.flow.nodes.filter((node) => intersects(position(node), box)).map((node) => node.id))
  }

  const wheel = (event: WheelEvent) => {
    if (event.defaultPrevented || modalActive()) return
    if (event.target instanceof Element && event.target.closest(".wf-drawer,[role=dialog],dialog,input,textarea,select")) return
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
  const toolsAt = () => {
    const hovered = edgeTools()
    const key = hovered ? edgeKey(hovered) : ui.edge
    return key ? wires().find((wire) => edgeKey(wire.edge) === key) : undefined
  }

  const menuItems = () => {
    const open = ui.menu
    const node = open && at(open.id)?.node
    return open && node ? (props.menu?.(open.ids, node) ?? []) : []
  }
  // Blur and Enter both end the edit; the second one finds nothing left to finish.
  const renamePhase = (phase: { id: string; name: string }, value: string) => {
    if (ui.renaming !== phase.id) return
    setUI("renaming", undefined)
    const name = value.trim()
    if (name && name !== phase.name) props.onRenamePhase?.(phase.id, name)
  }

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
      data-readonly={props.readOnly}
      style={{
        "background-size": `${20 * view().k}px ${20 * view().k}px`,
        "background-position": `${view().x}px ${view().y}px`,
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => (setDrag(undefined), setMoving(undefined))}
      onKeyDown={(event) => {
        if ((event.key !== "Delete" && event.key !== "Backspace") || !ui.edge || props.readOnly) return
        const target = event.target instanceof Element ? event.target : undefined
        if (target !== host && !target?.closest(".wf-world")) return
        const wire = wires().find((item) => edgeKey(item.edge) === ui.edge)
        if (!wire) return
        event.preventDefault()
        setUI("edge", undefined)
        props.onEdge(wire.edge, "remove")
      }}
      onContextMenu={(event) => {
        const id =
          event.target instanceof Element ? event.target.closest<HTMLElement>(".wf-node")?.dataset.id : undefined
        if (!id || props.readOnly || !props.menu) return
        event.preventDefault()
        const ids = selected().has(id) ? props.selected : [id]
        if (!selected().has(id)) props.onSelect(ids)
        const point = local(event)
        setUI("menu", { x: point.x, y: point.y, id, ids })
      }}
      onDblClick={(event) => {
        const id =
          event.target instanceof Element ? event.target.closest<HTMLElement>(".wf-node")?.dataset.id : undefined
        if (id && !(event.target instanceof Element && event.target.closest(".wf-node-tools"))) props.onOpen(id)
      }}
      onDragOver={(event) => event.dataTransfer?.types.includes("text/relay-kind") && event.preventDefault()}
      onDrop={(event) => {
        if (props.readOnly) return
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
        <Index each={groups()}>
          {(group) => (
            <div
              class="wf-group"
              data-phase={group().phase.id}
              style={{
                left: `${group().rect.x}px`,
                top: `${group().rect.y}px`,
                width: `${group().rect.w}px`,
                height: `${group().rect.h}px`,
              }}
            >
              <PhaseHead
                id={group().phase.id}
                name={group().phase.name}
                steps={props.text.steps(group().phase.nodeIds.length)}
                editing={ui.renaming === group().phase.id}
                editable={!props.readOnly && !!props.onRenamePhase}
                renameLabel={props.text.renamePhase(group().phase.name)}
                removeLabel={props.text.removePhase(group().phase.name)}
                protocol={props.onProtocol ? props.text.protocol : undefined}
                onEdit={() => setUI("renaming", group().phase.id)}
                onCommit={(name) => renamePhase(group().phase, name)}
                onCancel={() => {
                  setUI("renaming", undefined)
                  host.focus({ preventScroll: true })
                }}
                onUngroup={() => props.onUngroup?.(group().phase.id)}
                onProtocol={() => props.onProtocol?.(group().phase.id)}
              />
            </div>
          )}
        </Index>
        <svg class="wf-wires" width="1" height="1" aria-hidden="true">
          <defs>
            <marker id={marker} viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0.8 7.4 4 0 7.2z" class="wf-arrow" />
            </marker>
          </defs>
          <Index each={wires()}>
            {(wire) => (
              <>
                <path
                  class="wf-wire"
                  classList={{ on: wire().on, ok: wire().ok, dim: wire().dim, sel: edgeKey(wire().edge) === ui.edge }}
                  d={wire().d}
                  marker-end={`url(#${marker})`}
                />
                <Show when={wire().back}>
                  <path
                    class="wf-arrow"
                    d={`M${wire().mx + 4} ${wire().my - 4} L${wire().mx - 3} ${wire().my} L${wire().mx + 4} ${wire().my + 4}z`}
                  />
                </Show>
                <Show when={outs(wire().from.node).length === 2 && outs(wire().from.node)[wire().edge.port]}>
                  <text
                    class="wf-port-label"
                    x={wire().from.x + NODE + 9}
                    y={portY(wire().from, wire().edge.port, 2) - 5}
                  >
                    {outs(wire().from.node)[wire().edge.port]}
                  </text>
                </Show>
              </>
            )}
          </Index>
          <Index each={wires()}>
            {(wire) => (
              <path
                class="wf-wire-hit"
                d={wire().d}
                onPointerDown={() => (pressed = wire().edge)}
                onPointerEnter={() => tools(wire().edge)}
                onPointerLeave={() => tools(undefined)}
              />
            )}
          </Index>
          <Show when={temp()}>{(d) => <path class="wf-wire-temp" d={d()} />}</Show>
        </svg>
        <Index each={props.flow.nodes}>
          {(node) => {
            const overlay = () => props.overlay?.(node())
            return (
              <CanvasNode
                node={node()}
                x={position(node()).x}
                y={position(node()).y}
                outputs={outs(node())}
                overlay={overlay()}
                sub={overlay()?.sub ?? props.sub(node())}
                selected={selected().has(node().id)}
                solo={props.selected.length === 1 && selected().has(node().id)}
                issue={props.issues.has(node().id)}
                dragging={!!moving()?.has(node().id)}
                connect={props.text.connect}
                openLabel={props.text.open(node().name)}
                removeLabel={props.text.remove(node().name)}
                onSelect={() => props.onSelect([node().id])}
                onOpen={() => props.onOpen(node().id)}
                onDelete={() => props.onDelete([node().id])}
              />
            )
          }}
        </Index>
        <Index each={stubs()}>
          {(stub) => (
            <div
              class="wf-stub"
              style={{
                left: `${stub().item.x + NODE + 4}px`,
                top: `${portY(stub().item, stub().port, outs(stub().item.node).length) - 11}px`,
              }}
            >
              <i />
              <button
                type="button"
                aria-label={props.text.addAfter(stub().item.node.name)}
                title={props.text.addAfter(stub().item.node.name)}
                onClick={() => props.onAdd({ id: stub().item.node.id, port: stub().port })}
              >
                <Ic name="plus" />
              </button>
            </div>
          )}
        </Index>
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
                onClick={() => {
                  setEdgeTools(undefined)
                  setUI("edge", undefined)
                  props.onEdge(wire().edge, "remove")
                }}
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
      <Show when={ui.menu}>
        {(menu) => (
          <NodeMenu
            label={props.text.menu}
            x={menu().x}
            y={menu().y}
            area={size()}
            items={menuItems()}
            onClose={(focus) => {
              setUI("menu", undefined)
              if (focus) host.focus({ preventScroll: true })
            }}
          />
        )}
      </Show>
      <Show when={props.banner}>{props.banner}</Show>
      <CanvasControls
        add={props.text.add}
        fit={props.text.fit}
        zoomIn={props.text.zoomIn}
        zoomOut={props.text.zoomOut}
        keys={props.text.keys}
        zoom={view().k}
        onAdd={() => props.onAdd()}
        onFit={() => fit(true)}
        onZoom={zoomBy}
        onKeys={props.onKeys}
      />
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
