// The graph, drawn with force-graph (vasturiano/force-graph, MIT): canvas rendering over d3-force, with particles
// flowing along each "depends on" edge. A.graph keeps one small API for every screen that draws a graph:
// A.graph(host, {nodes:[{id,label,short,r,tone,ring,pin,tip}], edges:[{source,target,w}], onSelect, selected, ...}).
;(function (A) {
  const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  const probe = document.createElement("canvas").getContext("2d")
  const rgba = (color, a) => {
    probe.fillStyle = "#000"
    probe.fillStyle = color
    const c = probe.fillStyle
    if (c.startsWith("#")) { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` }
    return c.replace(/rgba?\(([^)]+)\)/, (_, v) => `rgba(${v.split(",").slice(0, 3).join(",")},${a})`)
  }

  A.graph = (host, opts) => {
    host.innerHTML = ""
    if (!window.ForceGraph) { host.innerHTML = '<div class="at-band-empty">The graph library did not load (offline?).</div>'; return { fit() {}, zoom() {}, highlight() {}, select() {} } }
    const palette = { good: css("--mx-good", "#5fbf7f"), warm: css("--mx-warm", "#e3a447"), blue: css("--mx-blue", "#5b8cff"), dim: css("--mx-dim", "#8a8f98"), strong: css("--mx-strong", "#e8e8ea"), bg: css("--mx-raised", "#16181c") }
    const colorOf = (tone = "") => (tone.includes("warm") ? palette.warm : tone.includes("ext") ? palette.dim : palette.good)
    const nodes = opts.nodes.map((n) => ({ ...n, r: Math.max(3, n.r * 0.62), color: colorOf(n.tone), soft: /g-(docs|harness|root)/.test(n.tone ?? "") }))
    const byId = new Map(nodes.map((n) => [n.id, n]))
    // Fold repeated pairs into one weighted link.
    const pairs = new Map()
    opts.edges.forEach((e) => { if (!byId.has(e.source) || !byId.has(e.target) || e.source === e.target) return; const k = `${e.source}\u0000${e.target}`; const p = pairs.get(k); p ? (p.w += e.w ?? 1) : pairs.set(k, { source: e.source, target: e.target, w: e.w ?? 1 }) })
    const links = [...pairs.values()]
    const into = new Map(nodes.map((n) => [n.id, []]))
    const out = new Map(nodes.map((n) => [n.id, []]))
    links.forEach((l) => { into.get(l.target).push(l.source); out.get(l.source).push(l.target) })
    const closure = (id) => { const seen = new Set([id]); const q = [id]; while (q.length) for (const u of into.get(q.shift()) ?? []) if (!seen.has(u)) { seen.add(u); q.push(u) } return seen }
    const idOf = (end) => (typeof end === "object" ? end.id : end)

    let selected = opts.selected && byId.has(opts.selected) ? opts.selected : null
    let blast = selected ? closure(selected) : null
    let hover = null
    const near = () => (hover ? new Set([hover.id, ...(into.get(hover.id) ?? []), ...(out.get(hover.id) ?? [])]) : null)
    const lit = (id) => { const h = near(); if (h) return h.has(id); if (blast) return blast.has(id); return true }
    const linkLit = (l) => { const s = idOf(l.source), t = idOf(l.target); if (hover) return s === hover.id || t === hover.id; if (blast) return blast.has(s) && blast.has(t); return true }

    const maxW = Math.max(1, ...links.map((l) => l.w))
    const g = window.ForceGraph()(host)
      .width(host.clientWidth || 800).height(host.clientHeight || 420)
      .backgroundColor("rgba(0,0,0,0)")
      .graphData({ nodes, links })
      .nodeId("id")
      .nodeVal((n) => (n.r * n.r) / 6)
      .nodeRelSize(1)
      .nodeLabel((n) => `<div class="at-fg-tip">${n.tip ?? A.esc(n.label)}</div>`)
      .linkColor((l) => (blast && !hover && linkLit(l) ? rgba(palette.blue, 0.75) : linkLit(l) ? rgba(palette.dim, hover ? 0.7 : 0.22) : rgba(palette.dim, 0.04)))
      .linkWidth((l) => (linkLit(l) && (hover || blast) ? 1.6 : 0.6 + (l.w / maxW) * 1.4))
      .linkCurvature(0.12)
      .linkDirectionalArrowLength(3.5).linkDirectionalArrowRelPos(1)
      .linkDirectionalArrowColor((l) => (linkLit(l) ? rgba(palette.dim, 0.6) : "rgba(0,0,0,0)"))
      .linkDirectionalParticles((l) => (linkLit(l) ? Math.min(3, 1 + Math.round((l.w / maxW) * 2)) : 0))
      .linkDirectionalParticleWidth((l) => (blast && linkLit(l) ? 2.6 : 1.8))
      .linkDirectionalParticleSpeed(0.006)
      .linkDirectionalParticleColor(() => palette.blue)
      .nodeCanvasObject((n, ctx, scale) => {
        if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return
        const on = lit(n.id)
        const r = n.r
        ctx.globalAlpha = on ? (n.soft ? 0.75 : 1) : 0.12
        // Glow, the disc, then the share of facts that changed as a warm arc.
        ctx.shadowColor = n.id === selected ? palette.strong : n.color
        ctx.shadowBlur = on ? (n.id === selected ? 26 : 14) : 0
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
        const base = blast && blast.has(n.id) && n.id !== selected && !hover ? palette.blue : n.color
        const grad = ctx.createRadialGradient(n.x - r * 0.35, n.y - r * 0.35, r * 0.1, n.x, n.y, r)
        grad.addColorStop(0, rgba(base, 1)); grad.addColorStop(1, rgba(base, 0.62))
        ctx.fillStyle = grad; ctx.fill()
        ctx.shadowBlur = 0
        if (n.ring > 0) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 2.2, -Math.PI / 2, -Math.PI / 2 + n.ring * 2 * Math.PI); ctx.strokeStyle = palette.warm; ctx.lineWidth = 1.6; ctx.stroke() }
        if (n.id === selected) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 4.5, 0, 2 * Math.PI); ctx.strokeStyle = palette.strong; ctx.lineWidth = 1.2; ctx.stroke() }
        // Labels: big nodes always, the rest once zoomed in, and anything hovered or in the highlight.
        const show = n.pin || r * scale > (opts.labelMin ?? 9) * 1.4 || (hover && near().has(n.id)) || (blast && blast.has(n.id))
        if (show && on) {
          const size = 11.5 / scale
          ctx.font = `${n.id === selected ? 600 : 500} ${size}px Inter, system-ui, sans-serif`
          ctx.textAlign = "center"; ctx.textBaseline = "top"
          ctx.lineWidth = 3 / scale; ctx.strokeStyle = rgba(palette.bg, 0.9); ctx.strokeText(n.short ?? n.label, n.x, n.y + r + 3 / scale)
          ctx.fillStyle = palette.strong; ctx.fillText(n.short ?? n.label, n.x, n.y + r + 3 / scale)
        }
        ctx.globalAlpha = 1
      })
      .nodePointerAreaPaint((n, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3, 0, 2 * Math.PI); ctx.fill() })
      .onNodeHover((n) => { hover = n ?? null; host.style.cursor = n ? "pointer" : "grab" })
      .onNodeClick((n) => select(n.id))
      .onBackgroundClick(() => select(null))
      .onNodeDragEnd((n) => { n.fx = n.x; n.fy = n.y })
      .warmupTicks(140)
      .cooldownTicks(60)
      .d3VelocityDecay(0.32)
    g.d3Force("charge").strength(-(opts.repel ?? 2600) / 11).distanceMax(320)
    g.d3Force("link").distance((l) => (opts.length ?? 120) * (1 - Math.min(0.5, l.w / maxW / 2))).strength(0.25)
    // Gentle gravity so units with no links stay in view instead of drifting off.
    const lonely = new Set(nodes.filter((n) => !into.get(n.id).length && !out.get(n.id).length).map((n) => n.id))
    g.d3Force("gravity", (alpha) => nodes.forEach((n) => { const k = (lonely.has(n.id) ? 0.12 : 0.05) * alpha; n.vx -= n.x * k; n.vy -= n.y * k }))
    // Frame the whole graph until the viewer takes over (wheel or drag).
    let touched = false
    host.addEventListener("wheel", () => (touched = true), { passive: true })
    host.addEventListener("pointerdown", () => (touched = true))
    const fit = () => { if (!touched && host.isConnected) g.zoomToFit(400, 40) }
    g.onEngineStop(fit)
    ;[60, 700, 1600].forEach((ms) => setTimeout(fit, ms))

    const select = (id) => {
      selected = id
      blast = id ? closure(id) : null
      const n = id && byId.get(id)
      if (n) g.centerAt(n.x, n.y, 600)
      opts.onSelect?.(id, blast)
    }
    host.__fg = g
    // Keep the canvas sized to its box.
    const ro = new ResizeObserver(() => { if (!host.isConnected) return ro.disconnect(); g.width(host.clientWidth).height(host.clientHeight) })
    ro.observe(host)
    return {
      highlight: (id) => { selected = id; blast = id ? closure(id) : null },
      select,
      fit: () => g.zoomToFit(400, 36),
      zoom: (f) => g.zoom(g.zoom() * f, 300),
      closure,
      byId,
    }
  }
})(window.Atlas)
