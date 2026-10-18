// A small force-directed graph for the preview: SVG, pan and zoom, drag, hover and a highlight set.
// No library: the data is a few hundred nodes at most, so a plain O(n²) repulsion settles in well under a second.
;(function (A) {
  const NS = "http://www.w3.org/2000/svg"
  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag)
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v))
    return n
  }

  // mount(host, {nodes:[{id,label,r,tone,group}], edges:[{source,target,w}], onSelect, selected, labels})
  A.graph = (host, opts) => {
    const width = host.clientWidth || 800
    const height = host.clientHeight || 520
    const nodes = opts.nodes.map((n, i) => ({ ...n, x: width / 2 + Math.cos(i * 2.4) * (60 + i * 3), y: height / 2 + Math.sin(i * 2.4) * (60 + i * 3), vx: 0, vy: 0 }))
    const byId = new Map(nodes.map((n) => [n.id, n]))
    // Fold repeated pairs into one weighted edge, so a busy pair can't pull harder than the layout can absorb.
    const pairs = new Map()
    opts.edges.forEach((e) => { const k = `${e.source}\u0000${e.target}`; const p = pairs.get(k); p ? (p.w += e.w ?? 1) : pairs.set(k, { ...e, w: e.w ?? 1 }) })
    const edges = [...pairs.values()].map((e) => ({ ...e, s: byId.get(e.source), t: byId.get(e.target) })).filter((e) => e.s && e.t && e.s !== e.t)
    const degree = new Map(nodes.map((n) => [n.id, 0]))
    edges.forEach((e) => { degree.set(e.s.id, degree.get(e.s.id) + 1); degree.set(e.t.id, degree.get(e.t.id) + 1) })
    const out = new Map(nodes.map((n) => [n.id, []]))
    const into = new Map(nodes.map((n) => [n.id, []]))
    edges.forEach((e) => { out.get(e.s.id).push(e.t.id); into.get(e.t.id).push(e.s.id) })

    host.innerHTML = ""
    const svg = el("svg", { class: "at-graph-svg", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": opts.label ?? "Graph" })
    const defs = el("defs")
    const marker = el("marker", { id: `arrow-${opts.id ?? "g"}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" })
    marker.append(el("path", { d: "M0 0L10 5L0 10z", class: "at-graph-arrow" }))
    defs.append(marker)
    svg.append(defs)
    const view = el("g")
    svg.append(view)
    const edgeLayer = el("g", { class: "at-graph-edges" })
    const nodeLayer = el("g", { class: "at-graph-nodes" })
    view.append(edgeLayer, nodeLayer)
    host.append(svg)
    const tip = document.createElement("div")
    tip.className = "at-graph-tip"
    tip.hidden = true
    host.append(tip)

    edges.forEach((e) => {
      e.line = el("line", { class: "at-graph-edge", "stroke-width": Math.min(3, 0.6 + Math.log2(1 + (e.w ?? 1)) * 0.5), "marker-end": `url(#arrow-${opts.id ?? "g"})` })
      edgeLayer.append(e.line)
    })
    nodes.forEach((n) => {
      n.g = el("g", { class: `at-graph-node ${n.tone ?? ""}`, tabindex: 0, role: "button", "aria-label": n.label })
      n.g.append(el("circle", { r: n.r }))
      if (n.ring) n.g.append(el("circle", { r: n.r + 3, class: "at-graph-ring", "stroke-dasharray": `${n.ring * 2 * Math.PI * (n.r + 3)} 999` }))
      if (opts.labels !== false && (n.r >= (opts.labelMin ?? 9) || n.pin)) {
        const t = el("text", { y: n.r + 12, "text-anchor": "middle" })
        t.textContent = n.short ?? n.label
        n.g.append(t)
      }
      nodeLayer.append(n.g)
    })

    // Layout: repulsion, springs along edges, gentle gravity to the centre (or to a group's anchor).
    const tick = (alpha) => {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          let dx = a.x - b.x, dy = a.y - b.y
          let d2 = dx * dx + dy * dy || 0.01
          const min = (a.r + b.r + 14) ** 2
          const f = (alpha * (opts.repel ?? 900)) / d2 + (d2 < min ? alpha * 0.4 : 0)
          const d = Math.sqrt(d2)
          dx /= d; dy /= d
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f
        }
      }
      edges.forEach((e) => {
        const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const k = (alpha * 0.06 * (d - (opts.length ?? 110))) / Math.max(degree.get(e.s.id), degree.get(e.t.id), 1)
        e.s.vx += (dx / d) * k; e.s.vy += (dy / d) * k; e.t.vx -= (dx / d) * k; e.t.vy -= (dy / d) * k
      })
      nodes.forEach((n) => {
        const cx = n.cx ?? width / 2, cy = n.cy ?? height / 2
        n.vx += (cx - n.x) * alpha * (opts.gravity ?? 0.012) * (n.gw ?? 1)
        n.vy += (cy - n.y) * alpha * (opts.gravity ?? 0.012) * (n.gw ?? 1)
        if (n.fixed) { n.vx = 0; n.vy = 0; return }
        const v = Math.hypot(n.vx, n.vy)
        if (v > 24) { n.vx *= 24 / v; n.vy *= 24 / v }
        n.x += n.vx; n.y += n.vy
        n.vx *= 0.55; n.vy *= 0.55
      })
    }
    const draw = () => {
      edges.forEach((e) => {
        const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        e.line.setAttribute("x1", e.s.x + (dx / d) * e.s.r)
        e.line.setAttribute("y1", e.s.y + (dy / d) * e.s.r)
        e.line.setAttribute("x2", e.t.x - (dx / d) * (e.t.r + 3))
        e.line.setAttribute("y2", e.t.y - (dy / d) * (e.t.r + 3))
      })
      nodes.forEach((n) => n.g.setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`))
    }
    for (let i = 0; i < 260; i++) tick(1 - i / 300)
    draw()
    let alive = 0
    const reheat = (frames = 40) => {
      const run = !alive
      alive = Math.max(alive, frames)
      if (!run) return
      const loop = () => { if (!alive) return; tick(0.25); draw(); alive--; requestAnimationFrame(loop) }
      requestAnimationFrame(loop)
    }

    // Highlight: the selected node, everything that depends on it (reverse closure) and what it points at.
    const closure = (id) => {
      const seen = new Set([id])
      const queue = [id]
      while (queue.length) for (const u of into.get(queue.shift()) ?? []) if (!seen.has(u)) { seen.add(u); queue.push(u) }
      return seen
    }
    const highlight = (id) => {
      svg.classList.toggle("focus", !!id)
      if (!id) { nodes.forEach((n) => n.g.classList.remove("hot", "near", "sel")); edges.forEach((e) => e.line.classList.remove("hot")); return }
      const blast = closure(id)
      nodes.forEach((n) => {
        n.g.classList.toggle("sel", n.id === id)
        n.g.classList.toggle("hot", blast.has(n.id) && n.id !== id)
        n.g.classList.toggle("near", (out.get(id) ?? []).includes(n.id))
      })
      edges.forEach((e) => e.line.classList.toggle("hot", (blast.has(e.s.id) && blast.has(e.t.id)) || e.s.id === id))
      return blast
    }

    // Pan and zoom.
    let k = 1, tx = 0, ty = 0
    const apply = () => view.setAttribute("transform", `translate(${tx},${ty}) scale(${k})`)
    const point = (ev) => { const r = svg.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * width, ((ev.clientY - r.top) / r.height) * height] }
    svg.addEventListener("wheel", (ev) => {
      ev.preventDefault()
      const [px, py] = point(ev)
      const f = Math.exp(-ev.deltaY * 0.0015)
      const nk = Math.min(4, Math.max(0.35, k * f))
      tx = px - ((px - tx) * nk) / k; ty = py - ((py - ty) * nk) / k; k = nk
      apply()
    }, { passive: false })
    let drag = null
    svg.addEventListener("pointerdown", (ev) => {
      const g = ev.target.closest(".at-graph-node")
      const [px, py] = point(ev)
      drag = g ? { node: nodes.find((n) => n.g === g), moved: false } : { pan: true, px, py, tx, ty, moved: false }
      svg.setPointerCapture(ev.pointerId)
    })
    svg.addEventListener("pointermove", (ev) => {
      const [px, py] = point(ev)
      if (drag?.pan) { tx = drag.tx + px - drag.px; ty = drag.ty + py - drag.py; drag.moved = true; apply(); return }
      if (drag?.node) { drag.node.x = (px - tx) / k; drag.node.y = (py - ty) / k; drag.node.fixed = true; drag.moved = true; draw(); return }
      const g = ev.target.closest(".at-graph-node")
      const n = g && nodes.find((x) => x.g === g)
      if (!n) { tip.hidden = true; return }
      tip.innerHTML = n.tip ?? A.esc(n.label)
      tip.hidden = false
      const r = host.getBoundingClientRect()
      tip.style.left = `${ev.clientX - r.left + 12}px`
      tip.style.top = `${ev.clientY - r.top + 12}px`
    })
    svg.addEventListener("pointerleave", () => (tip.hidden = true))
    svg.addEventListener("pointerup", () => {
      if (drag?.node) { drag.node.fixed = false; if (!drag.moved) select(drag.node.id); else reheat(30) }
      else if (drag?.pan && !drag.moved) select(null)
      drag = null
    })
    svg.addEventListener("keydown", (ev) => {
      const g = ev.target.closest?.(".at-graph-node")
      if (g && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); select(nodes.find((n) => n.g === g).id) }
    })
    const select = (id) => { const blast = highlight(id); opts.onSelect?.(id, blast) }
    if (opts.selected && byId.has(opts.selected)) highlight(opts.selected)

    const fit = () => {
      const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y)
      const [x0, x1, y0, y1] = [Math.min(...xs) - 40, Math.max(...xs) + 40, Math.min(...ys) - 40, Math.max(...ys) + 50]
      k = Math.min(2, width / (x1 - x0), height / (y1 - y0))
      tx = (width - (x0 + x1) * k) / 2; ty = (height - (y0 + y1) * k) / 2
      apply()
    }
    fit()
    return { highlight, fit, select, zoom: (f) => { k = Math.min(4, Math.max(0.35, k * f)); tx = width / 2 - ((width / 2 - tx) * f); ty = height / 2 - ((height / 2 - ty) * f); apply() }, nodes, byId, closure }
  }
})(window.Atlas)
