// Canvas geometry in world units (CSS pixels at 100%). Node tiles are 56px squares; ports sit on the
// vertical centre, or at 18/38 when a node has two outputs.

export const NODE = 56
export const MIN_ZOOM = 0.3
export const MAX_ZOOM = 2
export const GRID = 8

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }
export type View = { k: number; x: number; y: number }

export const snap = (value: number) => Math.round(value / GRID) * GRID

export function portY(node: Point, port: number, outputs: number) {
  if (outputs === 2) return node.y + (port ? 38 : 18)
  return node.y + NODE / 2
}

// A phase box: room for the 44px header above the tiles and the two label lines below them.
export function groupRect(members: Point[]): Rect | undefined {
  if (!members.length) return
  const xs = members.map((node) => node.x)
  const ys = members.map((node) => node.y)
  const x = Math.min(...xs) - 40
  const y = Math.min(...ys) - 72
  return { x, y, w: Math.max(...xs) - Math.min(...xs) + NODE + 80, h: Math.max(...ys) - Math.min(...ys) + NODE + 118 }
}

// Forward wires are a horizontal S-curve. A wire that has to go back (the next phase row) leaves to the right,
// runs along the gap between the two boxes, and enters its target from the left, with rounded corners.
export function edgePath(input: {
  from: Point
  to: Point
  port: number
  outputs: number
  fromGroup?: Rect
  toGroup?: Rect
}) {
  const sx = input.from.x + NODE
  const sy = portY(input.from, input.port, input.outputs)
  const tx = input.to.x
  const ty = input.to.y + NODE / 2
  if (tx - sx >= 36) {
    const c = Math.max(36, (tx - sx) / 2)
    return {
      d: `M${sx} ${sy} C${sx + c} ${sy} ${tx - c} ${ty} ${tx} ${ty}`,
      mx: (sx + tx) / 2,
      my: (sy + ty) / 2,
      back: false,
    }
  }
  const down = ty >= sy
  const midY = down
    ? ((input.fromGroup ? input.fromGroup.y + input.fromGroup.h : sy + 60) +
        (input.toGroup ? input.toGroup.y : ty - 60)) /
      2
    : Math.min(sy, ty) - 70
  const right = Math.max(sx + 22, input.fromGroup ? input.fromGroup.x + input.fromGroup.w + 12 : sx + 22)
  const left = Math.min(tx - 22, input.toGroup ? input.toGroup.x - 12 : tx - 22)
  const points: [number, number][] = [
    [sx, sy],
    [right, sy],
    [right, midY],
    [left, midY],
    [left, ty],
    [tx, ty],
  ]
  return { d: rounded(points, 10), mx: (right + left) / 2, my: midY, back: true }
}

export function rounded(points: [number, number][], radius: number) {
  const first = points[0]
  const last = points[points.length - 1]
  const corners = points.slice(1, -1).map((point, index) => {
    const [px, py] = points[index]
    const [x, y] = point
    const [nx, ny] = points[index + 2]
    const r = Math.min(radius, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2)
    const ax = x - Math.sign(x - px) * r
    const ay = y - Math.sign(y - py) * r
    const bx = x + Math.sign(nx - x) * r
    const by = y + Math.sign(ny - y) * r
    return ` L${ax} ${ay} Q${x} ${y} ${bx} ${by}`
  })
  return `M${first[0]} ${first[1]}${corners.join("")} L${last[0]} ${last[1]}`
}

// Room around the nodes for labels below and phase headers above.
export function bounds(nodes: Point[]): Rect {
  if (!nodes.length) return { x: 0, y: 0, w: 400, h: 300 }
  const xs = nodes.flatMap((node) => [node.x - 30, node.x + NODE + 40])
  const ys = nodes.flatMap((node) => [node.y - 80, node.y + NODE + 50])
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  }
}

export const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))

// Fits the content inside the area the overlays leave free, never above 100%.
export function fitView(
  content: Rect,
  viewport: { w: number; h: number },
  inset: { left: number; top: number; right: number; bottom: number },
): View {
  const w = Math.max(1, viewport.w - inset.left - inset.right)
  const h = Math.max(1, viewport.h - inset.top - inset.bottom)
  const k = Math.min(1, clampZoom(Math.min(w / content.w, h / content.h)))
  return {
    k,
    x: inset.left + (w - content.w * k) / 2 - content.x * k,
    y: inset.top + (h - content.h * k) / 2 - content.y * k,
  }
}

// Zooms around a screen point so the world point under it stays put.
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const k = clampZoom(view.k * factor)
  const wx = (px - view.x) / view.k
  const wy = (py - view.y) / view.k
  return { k, x: px - wx * k, y: py - wy * k }
}

export function centerOn(view: View, point: Point, viewport: { w: number; h: number }): View {
  return {
    k: view.k,
    x: viewport.w / 2 - (point.x + NODE / 2) * view.k,
    y: viewport.h / 2 - (point.y + NODE / 2) * view.k,
  }
}

export const toWorld = (view: View, sx: number, sy: number): Point => ({
  x: (sx - view.x) / view.k,
  y: (sy - view.y) / view.k,
})

export function minimapBox(content: Rect, pad = 40): Rect {
  return { x: content.x - pad, y: content.y - pad, w: content.w + pad * 2, h: content.h + pad * 2 }
}

// The world point under a click on the minimap, for an SVG laid out with xMidYMid meet.
export function minimapPoint(box: Rect, size: { w: number; h: number }, click: Point): Point {
  const scale = Math.min(size.w / box.w, size.h / box.h)
  const ox = (size.w - box.w * scale) / 2
  const oy = (size.h - box.h * scale) / 2
  return { x: box.x + (click.x - ox) / scale, y: box.y + (click.y - oy) / scale }
}

export function intersects(node: Point, box: Rect) {
  return node.x + NODE > box.x && node.x < box.x + box.w && node.y + NODE > box.y && node.y < box.y + box.h
}
