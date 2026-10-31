// Draws connectors between diagram boxes. Theme comes from the URL hash (#light or #dark).
if (location.hash === "#light") document.documentElement.classList.add("light")

const side = (rect, base, s) => {
  const x = rect.left - base.left
  const y = rect.top - base.top
  if (s === "t") return [x + rect.width / 2, y]
  if (s === "b") return [x + rect.width / 2, y + rect.height]
  if (s === "l") return [x, y + rect.height / 2]
  return [x + rect.width, y + rect.height / 2]
}

// spec: [from, fromSide, to, toSide, options]; options: { cls, label, at (0..1), dx, dy, bend }
window.wire = (specs) => {
  const canvas = document.querySelector(".canvas")
  const base = canvas.getBoundingClientRect()
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("class", "wires")
  svg.innerHTML = `<defs>${["", "bad", "ok"].map((k) => `<marker id="arrow${k}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.5 L8.5 5 L1 8.5" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="stroke:${k === "bad" ? "color-mix(in srgb, var(--danger) 70%, transparent)" : k === "ok" ? "color-mix(in srgb, var(--success) 75%, transparent)" : "var(--wire)"}"/></marker>`).join("")}</defs>`
  canvas.prepend(svg)
  specs.forEach(([from, fs, to, ts, o = {}]) => {
    const a = side(document.getElementById(from).getBoundingClientRect(), base, fs)
    const b = side(document.getElementById(to).getBoundingClientRect(), base, ts)
    const bend = o.bend ?? 0.5
    const vertical = (s) => s === "t" || s === "b"
    const c1 = vertical(fs) ? [a[0], a[1] + (b[1] - a[1]) * bend] : [a[0] + (b[0] - a[0]) * bend, a[1]]
    const c2 = vertical(ts) ? [b[0], b[1] - (b[1] - a[1]) * bend] : [b[0] - (b[0] - a[0]) * bend, b[1]]
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    path.setAttribute("d", `M${a} C${c1} ${c2} ${b}`)
    if (o.cls) path.setAttribute("class", o.cls)
    const kind = o.cls?.includes("bad") ? "bad" : o.cls?.includes("ok") ? "ok" : ""
    path.setAttribute("marker-end", `url(#arrow${kind})`)
    if (o.both) path.setAttribute("marker-start", `url(#arrow${kind})`)
    svg.appendChild(path)
    if (!o.label) return
    const point = path.getPointAtLength(path.getTotalLength() * (o.at ?? 0.5))
    const label = document.createElement("div")
    label.className = "wire-label"
    label.textContent = o.label
    label.style.left = `${point.x + (o.dx ?? 0)}px`
    label.style.top = `${point.y + (o.dy ?? 0)}px`
    canvas.appendChild(label)
  })
  // render.sh reads the canvas height from the title to size the screenshot exactly.
  document.title = String(Math.ceil(canvas.getBoundingClientRect().height))
}
