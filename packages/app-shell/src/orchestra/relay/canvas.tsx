import { createEffect, createMemo, createSignal, Index, type JSX, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { modalActive } from "@/utils/modal-active"
import {
  bounds,
  centerOn,
  contains,
  DRAWER,
  edgePath,
  fitView,
  groupRect,
  intersects,
  NODE,
  nudge,
  type Point,
  portY,
  type Rect,
  snap,
  toWorld,
  type View,
  viewInset,
  wheelFactor,
  zoomAt,
} from "./geometry"
import { CanvasControls } from "./canvas-controls"
import { type NodeMenuItem, NodeMenu } from "./canvas-menu"
import { CanvasNode, type NodeOverlay } from "./canvas-node"
import { PhaseHead } from "./canvas-phase"
import { edgeKey, EdgeTools, Wires } from "./canvas-wires"
import {
  connect,
  type Flow,
  type FlowEdge,
  type FlowNode,
  isEntry,
  moveNodes,
  type Outputs,
  outputsOf,
  phaseChoices,
  phaseOf,
  setPhase,
} from "./graph"
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
  // Moves keyboard focus to a step's tile.
  focus: (id: string) => void
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
  hasIssue: (name: string) => string
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
  // A connection or a drop that cannot happen, with the name it concerns (the phase a step could not join).
  onReject: (reason: "entry" | "phase", detail?: string) => void
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
  // The canvas coordinate space is always left to right; the add drawer sits at the end of the reading direction.
  const rtl = () => getComputedStyle(host).direction === "rtl"
  const inset = () => viewInset(props.drawer, rtl())

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
    const reserve = drawer ? DRAWER : 0
    setView(centerOn(view(), item, { x: rtl() ? reserve : 0, w: size().w - reserve, h: size().h }))
  }
  // Focus that moves on purpose (an arrow key) has already placed the view; it must not nudge it again.
  let quiet = false
  props.api?.({
    fit,
    center,
    zoomBy,
    zoomTo: (k) => zoomBy(k / view().k),
    rename: (phase) => setUI("renaming", phase),
    focus: (id) => {
      quiet = true
      host.querySelector<HTMLElement>(`.wf-node[data-id="${CSS.escape(id)}"] .wf-tile`)?.focus({ preventScroll: true })
      quiet = false
    },
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
      if (current.moved && positions) return dropped(current.ids, positions, world(event))
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

  // A step dragged into another phase's box joins that phase when it sits next to it in the sequence; otherwise it
  // just moves, and the user is told why it did not join.
  const dropped = (ids: string[], positions: Map<string, Point>, point: Point) => {
    const moved = moveNodes(props.flow, new Map([...positions].map(([id, to]) => [id, [to.x, to.y]])))
    const node = ids.length === 1 ? props.flow.nodes.find((item) => item.id === ids[0]) : undefined
    const target =
      node && !isEntry(node)
        ? groups().find((item) => item.phase.id !== phaseOf(props.flow, node.id)?.id && contains(item.rect, point))
        : undefined
    if (!node || !target) return props.onChange(moved)
    if (!phaseChoices(moved, node.id).phases.some((phase) => phase.id === target.phase.id)) {
      props.onChange(moved)
      return props.onReject("phase", target.phase.name)
    }
    props.onChange(setPhase(moved, node.id, target.phase.id))
  }

  const wheel = (event: WheelEvent) => {
    if (event.defaultPrevented || modalActive()) return
    if (event.target instanceof Element && event.target.closest(".wf-drawer,[role=dialog],dialog,input,textarea,select")) return
    event.preventDefault()
    setAnimate(false)
    if (event.ctrlKey || event.metaKey) {
      const point = local(event)
      return setView(zoomAt(view(), wheelFactor(event.deltaY), point.x, point.y))
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
  // The overflow-hidden canvas must never scroll: a focused tile outside the view would shift every overlay and offset
  // every coordinate. Put the scroll back, then pan the view just far enough to show what took focus. A button the
  // pointer pressed stays put under it, so only focus that came from the keyboard pans.
  const reveal = (event: FocusEvent) => {
    host.scrollLeft = 0
    host.scrollTop = 0
    const target = event.target
    if (quiet || !(target instanceof Element) || !target.closest(".wf-world") || !target.matches(":focus-visible"))
      return
    const area = host.getBoundingClientRect()
    const box = target.getBoundingClientRect()
    const frame = inset()
    const dx = nudge(box.left, box.right, area.left + frame.left, area.right - frame.right)
    const dy = nudge(box.top, box.bottom, area.top + frame.top, area.bottom - frame.bottom)
    if (!dx && !dy) return
    setAnimate(true)
    setView({ ...view(), x: view().x + dx, y: view().y + dy })
  }
  // The pointer keeps its capture until the button is released; with no drag left, its moves and release do nothing.
  const cancel = () => {
    setDrag(undefined)
    setMoving(undefined)
  }
  const overlaid = (event: Event) => event.target instanceof Element && !!event.target.closest(OVERLAYS)
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
      onPointerCancel={cancel}
      onScroll={() => {
        host.scrollLeft = 0
        host.scrollTop = 0
      }}
      onFocusIn={reveal}
      onKeyDown={(event) => {
        // Escape drops a drag in progress and nothing else.
        if (event.key === "Escape" && drag()) {
          event.preventDefault()
          event.stopPropagation()
          return cancel()
        }
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
      onDragOver={(event) => {
        if (event.dataTransfer?.types.includes("text/relay-kind") && !overlaid(event)) event.preventDefault()
      }}
      onDrop={(event) => {
        // Letting go over the add drawer or another overlay cancels the drag; the step is not made underneath it.
        if (props.readOnly || overlaid(event)) return
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
        <Wires
          marker={marker}
          wires={wires()}
          selected={ui.edge}
          outputs={outs}
          temp={temp()}
          onPress={(edge) => (pressed = edge)}
          onHover={tools}
        />
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
                issueLabel={props.text.hasIssue(node().name)}
                openLabel={props.text.open(node().name)}
                removeLabel={props.text.remove(node().name)}
                onSelect={() => props.onSelect([node().id])}
                onToggle={() =>
                  props.onSelect(
                    selected().has(node().id)
                      ? props.selected.filter((id) => id !== node().id)
                      : [...props.selected, node().id],
                  )
                }
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
            <EdgeTools
              wire={wire()}
              insert={props.text.insert}
              unlink={props.text.unlink}
              onHover={tools}
              onInsert={() => props.onEdge(wire().edge, "insert")}
              onUnlink={() => {
                setEdgeTools(undefined)
                setUI("edge", undefined)
                props.onEdge(wire().edge, "remove")
              }}
            />
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
