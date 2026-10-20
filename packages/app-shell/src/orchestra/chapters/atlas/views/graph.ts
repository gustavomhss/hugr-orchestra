import { esc } from "../kit/format"
import { closureOf, foldLinks, type GraphEdge } from "./graph-data"

// The graph every Atlas screen draws (specs/atlas-ui/mock/graph.js), with force-graph (vasturiano/force-graph, MIT):
// canvas rendering over d3-force, with particles flowing along each "depends on" edge. force-graph loads only when a
// graph mounts (D11).
export type AtlasGraphNode = {
  id: string
  label: string
  short?: string
  r: number
  // good / warm / ext, plus g-<group>; docs, harness and root units draw softer.
  tone?: string
  // The share of facts that changed, drawn as an amber arc.
  ring?: number
  // Always labelled.
  pin?: boolean
  // HTML for the hover card, built with esc().
  tip?: string
}
export type AtlasGraphOptions = {
  nodes: readonly AtlasGraphNode[]
  edges: readonly GraphEdge[]
  // Shown in place of the graph when force-graph cannot load.
  offline: string
  length?: number
  repel?: number
  labelMin?: number
  selected?: string
  onSelect?: (id: string | undefined) => void
}
export type AtlasGraphHandle = {
  select: (id: string | undefined) => void
  fit: () => void
  zoom: (factor: number) => void
  dispose: () => void
}
type DrawNode = AtlasGraphNode & { color: string; soft: boolean; x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number }
type DrawEnd = string | number | { id?: string | number } | undefined
type DrawLink = { source?: DrawEnd; target?: DrawEnd; w?: number }

const IDLE: AtlasGraphHandle = { select: () => undefined, fit: () => undefined, zoom: () => undefined, dispose: () => undefined }

export async function mountGraph(host: HTMLElement, opts: AtlasGraphOptions): Promise<AtlasGraphHandle> {
  host.replaceChildren()
  const forceGraph = await import("force-graph").catch(() => undefined)
  if (!forceGraph) {
    const note = document.createElement("div")
    note.className = "at-band-empty"
    note.textContent = opts.offline
    host.replaceChildren(note)
    return IDLE
  }
  const css = getComputedStyle(host)
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  const palette = {
    good: token("--mx-good", "#5fbf7f"),
    warm: token("--mx-warm", "#e3a447"),
    blue: token("--mx-blue", "#5b8cff"),
    dim: token("--mx-dim", "#8a8f98"),
    strong: token("--mx-strong", "#e8e8ea"),
    bg: token("--mx-raised", "#16181c"),
  }
  const probe = document.createElement("canvas").getContext("2d")
  // Any CSS colour as rgba() with the given alpha, through the canvas colour parser.
  const rgba = (color: string, alpha: number) => {
    if (!probe) return color
    probe.fillStyle = "#000"
    probe.fillStyle = color
    const value = String(probe.fillStyle)
    if (value.startsWith("#")) {
      const n = Number.parseInt(value.slice(1), 16)
      return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`
    }
    return value.replace(/rgba?\(([^)]+)\)/, (_match, inner: string) => `rgba(${inner.split(",").slice(0, 3).join(",")},${alpha})`)
  }
  const colorOf = (tone = "") => (tone.includes("warm") ? palette.warm : tone.includes("ext") ? palette.dim : palette.good)
  const nodes: DrawNode[] = opts.nodes.map((n) => ({
    ...n,
    r: Math.max(3, n.r * 0.62),
    color: colorOf(n.tone),
    soft: /g-(docs|harness|root)/.test(n.tone ?? ""),
  }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // Kept aside: force-graph rewrites the ends of the links it is given.
  const links = foldLinks(new Set(byId.keys()), opts.edges)
  const into = new Map(nodes.map((n) => [n.id, links.filter((l) => l.target === n.id).map((l) => l.source)]))
  const out = new Map(nodes.map((n) => [n.id, links.filter((l) => l.source === n.id).map((l) => l.target)]))
  const idOf = (end: DrawEnd) => String(typeof end === "object" ? end.id : end)
  const state = {
    selected: opts.selected && byId.has(opts.selected) ? opts.selected : undefined,
    blast: undefined as Set<string> | undefined,
    hover: undefined as DrawNode | undefined,
    touched: false,
    timers: [] as ReturnType<typeof setTimeout>[],
  }
  state.blast = state.selected ? closureOf(links, state.selected) : undefined
  const near = () =>
    state.hover ? new Set([state.hover.id, ...(into.get(state.hover.id) ?? []), ...(out.get(state.hover.id) ?? [])]) : undefined
  const lit = (id: string) => {
    const hovered = near()
    if (hovered) return hovered.has(id)
    if (state.blast) return state.blast.has(id)
    return true
  }
  const linkLit = (link: DrawLink) => {
    const source = idOf(link.source)
    const target = idOf(link.target)
    if (state.hover) return source === state.hover.id || target === state.hover.id
    if (state.blast) return state.blast.has(source) && state.blast.has(target)
    return true
  }
  const maxW = Math.max(1, ...links.map((l) => l.w))
  const weight = (link: DrawLink) => link.w ?? 1

  const draw = (n: DrawNode, ctx: CanvasRenderingContext2D, scale: number) => {
    if (n.x === undefined || n.y === undefined || !Number.isFinite(n.x) || !Number.isFinite(n.y)) return
    const on = lit(n.id)
    const r = n.r
    ctx.globalAlpha = on ? (n.soft ? 0.75 : 1) : 0.12
    // Glow, the disc, then the share of facts that changed as a warm arc.
    ctx.shadowColor = n.id === state.selected ? palette.strong : n.color
    ctx.shadowBlur = on ? (n.id === state.selected ? 26 : 14) : 0
    ctx.beginPath()
    ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
    const base = state.blast && state.blast.has(n.id) && n.id !== state.selected && !state.hover ? palette.blue : n.color
    const grad = ctx.createRadialGradient(n.x - r * 0.35, n.y - r * 0.35, r * 0.1, n.x, n.y, r)
    grad.addColorStop(0, rgba(base, 1))
    grad.addColorStop(1, rgba(base, 0.62))
    ctx.fillStyle = grad
    ctx.fill()
    ctx.shadowBlur = 0
    if ((n.ring ?? 0) > 0) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, r + 2.2, -Math.PI / 2, -Math.PI / 2 + (n.ring ?? 0) * 2 * Math.PI)
      ctx.strokeStyle = palette.warm
      ctx.lineWidth = 1.6
      ctx.stroke()
    }
    if (n.id === state.selected) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, r + 4.5, 0, 2 * Math.PI)
      ctx.strokeStyle = palette.strong
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
    // Labels: big nodes always, the rest once zoomed in, and anything hovered or in the highlight.
    const show =
      n.pin || r * scale > (opts.labelMin ?? 9) * 1.4 || !!near()?.has(n.id) || !!state.blast?.has(n.id)
    if (show && on) {
      const size = 11.5 / scale
      const text = n.short ?? n.label
      ctx.font = `${n.id === state.selected ? 600 : 500} ${size}px Inter, system-ui, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "top"
      ctx.lineWidth = 3 / scale
      ctx.strokeStyle = rgba(palette.bg, 0.9)
      ctx.strokeText(text, n.x, n.y + r + 3 / scale)
      ctx.fillStyle = palette.strong
      ctx.fillText(text, n.x, n.y + r + 3 / scale)
    }
    ctx.globalAlpha = 1
  }

  const graph = forceGraph
    .default()(host)
    .width(host.clientWidth || 800)
    .height(host.clientHeight || 420)
    .backgroundColor("rgba(0,0,0,0)")
    .graphData({ nodes, links: links.map((l) => ({ ...l })) })
    .nodeId("id")
    .nodeVal((n) => ((n as DrawNode).r * (n as DrawNode).r) / 6)
    .nodeRelSize(1)
    // A graph of one or two units would otherwise zoom to fit until a single circle fills the canvas.
    .maxZoom(3)
    .nodeLabel((n) => `<div class="at-fg-tip">${(n as DrawNode).tip ?? esc((n as DrawNode).label)}</div>`)
    .linkColor((l) =>
      state.blast && !state.hover && linkLit(l)
        ? rgba(palette.blue, 0.75)
        : linkLit(l)
          ? rgba(palette.dim, state.hover ? 0.7 : 0.22)
          : rgba(palette.dim, 0.04),
    )
    .linkWidth((l) => (linkLit(l) && (state.hover || state.blast) ? 1.6 : 0.6 + (weight(l) / maxW) * 1.4))
    .linkCurvature(0.12)
    .linkDirectionalArrowLength(3.5)
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalArrowColor((l) => (linkLit(l) ? rgba(palette.dim, 0.6) : "rgba(0,0,0,0)"))
    .linkDirectionalParticles((l) => (linkLit(l) ? Math.min(3, 1 + Math.round((weight(l) / maxW) * 2)) : 0))
    .linkDirectionalParticleWidth((l) => (state.blast && linkLit(l) ? 2.6 : 1.8))
    .linkDirectionalParticleSpeed(0.006)
    .linkDirectionalParticleColor(() => palette.blue)
    .nodeCanvasObject((n, ctx, scale) => draw(n as DrawNode, ctx, scale))
    .nodePointerAreaPaint((n, color, ctx) => {
      const node = n as DrawNode
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, node.r + 3, 0, 2 * Math.PI)
      ctx.fill()
    })
    .onNodeHover((n) => {
      state.hover = n ? (n as DrawNode) : undefined
      host.style.cursor = n ? "pointer" : "grab"
    })
    .onNodeClick((n) => select((n as DrawNode).id))
    .onBackgroundClick(() => select(undefined))
    .onNodeDragEnd((n) => {
      const node = n as DrawNode
      node.fx = node.x
      node.fy = node.y
    })
    .warmupTicks(140)
    .cooldownTicks(60)
    .d3VelocityDecay(0.32)
  graph.d3Force("charge")?.strength(-(opts.repel ?? 2600) / 11).distanceMax(320)
  graph
    .d3Force("link")
    ?.distance((link: DrawLink) => (opts.length ?? 120) * (1 - Math.min(0.5, weight(link) / maxW / 2)))
    .strength(0.25)
  // Gentle gravity so units with no links stay in view instead of drifting off.
  const lonely = new Set(nodes.filter((n) => !into.get(n.id)?.length && !out.get(n.id)?.length).map((n) => n.id))
  graph.d3Force("gravity", (alpha: number) =>
    nodes.forEach((n) => {
      const k = (lonely.has(n.id) ? 0.12 : 0.05) * alpha
      n.vx = (n.vx ?? 0) - (n.x ?? 0) * k
      n.vy = (n.vy ?? 0) - (n.y ?? 0) * k
    }),
  )
  // Frame the whole graph until the viewer takes over (wheel or drag).
  const touch = () => {
    state.touched = true
  }
  host.addEventListener("wheel", touch, { passive: true })
  host.addEventListener("pointerdown", touch)
  const fit = () => {
    if (!state.touched && host.isConnected) graph.zoomToFit(400, 40)
  }
  graph.onEngineStop(fit)
  state.timers = [60, 700, 1600].map((ms) => setTimeout(fit, ms))
  const select = (id: string | undefined) => {
    state.selected = id
    state.blast = id ? closureOf(links, id) : undefined
    const node = id ? byId.get(id) : undefined
    if (node?.x !== undefined && node.y !== undefined) graph.centerAt(node.x, node.y, 600)
    opts.onSelect?.(id)
  }
  // Keep the canvas sized to its box.
  const observer = new ResizeObserver(() => {
    if (!host.isConnected) return observer.disconnect()
    graph.width(host.clientWidth).height(host.clientHeight)
  })
  observer.observe(host)
  return {
    select,
    fit: () => graph.zoomToFit(400, 36),
    zoom: (factor) => graph.zoom(graph.zoom() * factor, 300),
    dispose: () => {
      observer.disconnect()
      state.timers.forEach((id) => clearTimeout(id))
      host.removeEventListener("wheel", touch)
      host.removeEventListener("pointerdown", touch)
      graph._destructor()
      host.replaceChildren()
    },
  }
}
