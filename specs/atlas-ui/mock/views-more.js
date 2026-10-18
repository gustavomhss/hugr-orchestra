// A07 Relations, A08 Negations, A09 Memory, A10 History, A11 Health, A12 Proposals, A13 Ratification,
// S01 Session citations, the gallery, and the honest HOLD state.
;(function (A) {
  const D = () => A.data
  const base = (p) => p.split("/").at(-1)

  /* ---------- A07 Relations / blast radius ---------- */
  A.views.blastTree = (state, compact = false) => {
    const b = D().blast
    const open = new Set((state.query.collapsed ?? "").split(",").filter(Boolean))
    return `<div class="at-tree" role="tree" aria-label="Blast radius of ${A.esc(b.unit)}">
      ${b.groups.map((g) => {
        const collapsed = open.has(String(g.distance))
        const facts = g.nodes.reduce((n, x) => n + x.facts, 0)
        const drifted = g.nodes.reduce((n, x) => n + x.drifted, 0)
        return `<div class="at-tree-group"><button class="at-tree-ghead" aria-expanded="${!collapsed}" data-action="toggle-depth" data-value="${g.distance}">${A.icon("chev", "chev")}<b>Distance ${g.distance}</b><span class="wf-count">${g.nodes.length} units</span><small>${facts} facts${drifted ? ` · <span class="at-state warm">${drifted} drifted</span>` : ""}</small></button>
        ${collapsed ? "" : g.nodes.map((n) => `<div class="at-node" role="treeitem" style="--depth:${g.distance}" data-action="go" data-value="#/relations?unit=${encodeURIComponent(n.path)}${compact ? "" : `&view=${state.query.view ?? "tree"}`}" tabindex="0"><span class="guide"></span>${A.icon("code")}<code>${A.esc(n.path)}</code><span class="at-node-facts">${n.facts ? `${n.facts} facts` : "<small>no facts filed</small>"}${n.drifted ? `<span class="at-state warm">${A.icon("drift")}${n.drifted}</span>` : ""}</span></div>`).join("")}</div>`
      }).join("")}</div>`
  }

  // Layered layout: focus on the leading edge, one column per distance. Reads as "what breaks next" and never
  // crosses edges the way a force layout does; depth is capped by the data, not by zoom.
  const graph = (state) => {
    const b = D().blast
    const cols = [[{ path: b.unit, facts: 4, drifted: 0 }], ...b.groups.map((g) => g.nodes)]
    const W = 960, rowH = 58, top = 46
    const H = Math.max(...cols.map((c) => c.length)) * rowH + top + 30
    const colX = cols.map((_, i) => 24 + i * ((W - 220) / (cols.length - 1)))
    const placed = cols.map((col, ci) => col.map((n, ri) => ({ ...n, x: colX[ci], y: top + (H - top - 30 - col.length * rowH) / 2 + ri * rowH + rowH / 2, w: 176 })))
    const parentOf = (ci, ri) => placed[ci - 1][Math.min(placed[ci - 1].length - 1, Math.floor((ri / placed[ci].length) * placed[ci - 1].length))]
    const edge = (a, c, cls = "") => { const x1 = a.x + a.w, x2 = c.x, mid = (x1 + x2) / 2; return `<path class="edge ${cls}" d="M${x1},${a.y} C${mid},${a.y} ${mid},${c.y} ${x2},${c.y}"/>` }
    const edges = placed.slice(1).flatMap((col, i) => col.map((n, ri) => edge(parentOf(i + 1, ri), n))).join("")
    const same = placed[1].length > 1 ? (() => { const a = placed[1][0], c = placed[1][1]; return `<path class="edge same" d="M${a.x + a.w},${a.y} C${a.x + a.w + 34},${a.y} ${c.x + c.w + 34},${c.y} ${c.x + c.w},${c.y}"/>` })() : ""
    const node = (n, focus) => `<g class="node ${focus ? "focus" : ""}" transform="translate(${n.x},${n.y - 19})" data-action="go" data-value="#/relations?unit=${encodeURIComponent(n.path)}&view=graph" tabindex="0" role="button" aria-label="${A.esc(n.path)}"><rect width="${n.w}" height="38" rx="7"/><text x="12" y="16">${A.esc(base(n.path))}</text><text class="sub" x="12" y="30">${n.facts ? `${n.facts} facts` : "no facts"}${n.drifted ? ` · ${n.drifted} drifted` : ""}</text>${n.drifted ? `<circle cx="${n.w - 12}" cy="19" r="3.5" fill="var(--mx-warm)"/>` : ""}</g>`
    const heads = ["Unit", ...b.groups.map((g) => `Distance ${g.distance}`)].map((label, i) => `<text class="colhead" x="${colX[i]}" y="22">${label.toUpperCase()}</text>`).join("")
    return `<div class="at-graph"><svg viewBox="0 0 ${W} ${H}" style="block-size:${H}px" role="img" aria-label="Dependents of ${A.esc(b.unit)} by distance">
      ${heads}${edges}${same}${placed.map((col, ci) => col.map((n) => node(n, ci === 0)).join("")).join("")}</svg>
      <div class="at-graph-legend"><span><i></i>depended on by</span><span><i class="same"></i>sameAs</span><span><svg width="8" height="8"><circle cx="4" cy="4" r="3.5" fill="var(--mx-warm)"/></svg> has drifted facts</span></div>
      <div class="at-graph-controls">${A.btn("", "toast", { icon: "expand", value: "Opens the graph full screen.", label: "Full screen" })}</div></div>`
  }

  A.views.relations = (state) => {
    const b = D().blast
    const view = state.query.view === "graph" ? "graph" : "tree"
    const dir = state.query.dir ?? "in"
    const unit = state.query.unit ?? b.unit
    const href = (patch) => `#/relations?${new URLSearchParams({ unit, view, dir, ...patch })}`
    return {
      crumbs: [["Atlas", "#/overview"], ["Relations"], [base(unit), null, true]],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Dependency axis</div><h1>Relations</h1><p>What depends on a unit, and which facts ride on that code. Start from one unit and expand on demand; there is no global graph to get lost in.</p></div></div>
      <div class="at-toolbar">
        <button class="at-scope-pick" data-action="palette" data-value="unit:">${A.icon("code")}Unit <code>${A.esc(unit)}</code>${A.icon("chev")}</button>
        <div class="wf-range" role="tablist" aria-label="Direction">
          <button aria-pressed="${dir === "in"}" data-action="go" data-value="${href({ dir: "in" })}">Dependents</button>
          <button aria-pressed="${dir === "out"}" data-action="go" data-value="${href({ dir: "out" })}">Dependencies</button></div>
        <div class="wf-range" role="tablist" aria-label="View">
          <button aria-pressed="${view === "tree"}" data-action="go" data-value="${href({ view: "tree" })}">${A.icon("tree")}Tree</button>
          <button aria-pressed="${view === "graph"}" data-action="go" data-value="${href({ view: "graph" })}">${A.icon("graph")}Graph</button></div></div>
      ${dir === "out"
        ? A.empty("Dependencies are not available yet", "Atlas records the reverse closure (who depends on this unit). The forward set, “what I depend on”, is a degenerate field today and always empty, so this view says so instead of showing nothing.", A.btn("Show dependents", "go", { value: href({ dir: "in" }) }))
        : view === "tree" ? A.views.blastTree(state) : graph(state)}
      <p class="mx-note">Blast radius = every unit whose facts must be re-checked when <code class="at-mono">${A.esc(base(unit))}</code> changes. Tree for direction and depth, graph only for “how is X related to Y”.</p></div>`,
    }
  }

  /* ---------- A08 Negations ---------- */
  A.views.negations = (state) => {
    const negs = D().facts.filter((x) => x.family === "negation")
    const reasons = { "scope-dynamic": "Scope loads code at runtime", "target-unresolvable": "Target cannot be resolved", "scope-open": "Scope is open-ended", "scope-empty": "Scope is empty", "target-not-global": "Target is not global", "escape-open": "An escape hatch is open" }
    return {
      crumbs: [["Atlas", "#/overview"], ["Negations"]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · What is not there</div><h1>Negations</h1><p>Proven absences: “nothing in S calls X”. When Atlas cannot decide, it abstains and says why, instead of guessing.</p></div></div>
      <section class="at-band gov"><header class="at-band-head">${A.icon("negation")}<h3>Proven absences</h3><small>${negs.length} facts</small></header>
      ${negs.map((x) => `<div class="at-row" data-action="inspect" data-value="${x.key}" tabindex="0">${A.family(x.family)}<div class="at-row-claim">${A.esc(x.claim)}<small>edge model: ${A.esc(x.edgeModel)} · ${A.esc(x.anchor.qualifiedPath)}</small></div><div class="at-row-meta">${A.tier(x.tier)}${A.freshness(x.freshness)}${A.truth(x.truth)}</div></div>`).join("")}</section>
      <section class="at-band adv"><header class="at-band-head">${A.icon("info")}<h3>Abstained</h3><small>Shown by default · an honest “could not decide”</small></header>
      ${D().abstentions.map((a) => `<div class="at-row" style="cursor:default"><span class="at-family">${A.icon("minusc")}</span><div class="at-row-claim" style="font-style:normal;color:var(--mx-strong)">Nothing in <code class="at-mono">${A.esc(a.scope)}</code> calls <code class="at-mono">${A.esc(a.target)}</code>?<small style="font-family:var(--mx-sans);font-size:10.5px">${A.esc(a.text)}</small></div><span class="at-pill warm" data-tip="${A.esc(reasons[a.reason])}">${A.esc(a.reason)}</span></div>`).join("")}</section>
      </div>`,
    }
  }

  /* ---------- A09 Memory ---------- */
  A.views.memory = (state) => {
    const d = D()
    const seat = d.memory[state.params[0]] ? state.params[0] : "backend"
    const m = d.memory[seat]
    const kind = state.query.kind ?? "all"
    const facetTone = { seeded: "good", drifted: "warm", "UN-SEEDED": "" }
    const recall = m.recall.filter((r) => kind === "all" || r.kind === kind)
    return {
      crumbs: [["Atlas", "#/overview"], ["Memory", "#/memory/backend"], [d.seats[seat].label, null, true]],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Memory per seat</div><h1>Memory</h1><p>What each agent seat carries between sessions. Memory is per seat and decays when unused; shared Knowledge is read-only from here.</p></div></div>
      <div class="at-seats" role="tablist" aria-label="Seat">
        ${Object.entries(d.seats).filter(([, s]) => s.memory).map(([id, s]) => `<a class="at-seat-tab" href="#/memory/${id}" role="tab" ${id === seat ? 'aria-current="page"' : ""}><i>${s.label[0]}</i><span><strong>${s.label}</strong><small>${s.role}</small></span></a>`).join("")}
        <span class="at-seat-none" data-tip="Only seats with atlasMemory hold Atlas memory: backend, jimmy and archie.">${A.icon("info")}${Object.values(d.seats).filter((s) => !s.memory && !s.human).map((s) => s.label).join(", ")} hold no Atlas memory</span>
      </div>
      <div class="at-cols">
        <div>
          <section class="at-panel"><header class="at-panel-head"><h3>${A.icon("memory")} Turn header</h3><small>Injected into every provider turn of ${d.seats[seat].label}</small></header><div class="at-panel-body">
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-block-end:18px">${A.meter("Awareness", m.tokens.awareness, 400, "warm")}${A.meter("Orientation", m.tokens.orientation, 250, "warm")}${A.meter("Rules", m.tokens.rules, 500, "warm")}</div>
            <div class="mx-eyebrow">Awareness</div>
            <div class="at-facets">${m.awareness.map((a) => `<div class="at-facet"><strong>${a.facet}</strong><span class="at-state ${facetTone[a.state]}">${A.icon(a.state === "seeded" ? "checkc" : a.state === "drifted" ? "drift" : "minusc")}${a.state}</span>${a.text ? `<p>${A.esc(a.text)}</p>` : `<p><i>Not seeded yet.</i></p>`}</div>`).join("")}</div>
            <div class="mx-eyebrow" style="margin-block-start:18px">Orientation</div>
            <div class="at-orient">${["goal", "last", "current", "state"].map((k) => `<div><span>${k}</span>${A.esc(m.orientation[k])}</div>`).join("")}</div>
          </div></section>
          <section class="at-panel"><header class="at-panel-head"><h3>Rules · top ${m.rules.length}</h3><small>Ranked by frecency · unused rules decay out, archived, never deleted</small></header><div class="at-panel-body">
            ${m.rules.map(([text, f, used], i) => `<div class="at-rule"><span class="rank">${i + 1}</span><div class="grow">${A.esc(text)}<small>${A.esc(used)}</small></div><span class="at-frecency" data-tip="Frecency ${Math.round(f * 100)}"><i style="inline-size:${f * 100}%"></i></span></div>`).join("")}
          </div></section>
        </div>
        <section class="at-panel"><header class="at-panel-head"><h3>Recall on demand</h3><small>Never injected automatically</small></header><div class="at-panel-body">
          <div class="wf-range" style="margin-block-end:10px">${["all", "task", "pr", "logbook"].map((k) => `<button aria-pressed="${kind === k}" data-action="go" data-value="#/memory/${seat}${k === "all" ? "" : `?kind=${k}`}">${k === "all" ? "All" : k}</button>`).join("")}</div>
          ${recall.length ? recall.map((r) => `<div class="at-recall">${A.badge(r.kind, "warm")}<div class="grow">${A.esc(r.title)}<small>${A.esc(r.detail)}</small><small><code class="at-mono">${r.at}</code></small></div></div>`).join("") : `<p class="mx-note">No ${kind} memories for this seat.</p>`}
          <p class="mx-note">Memory is plaintext in the worktree and scanned for secrets on write. It limits what is injected; it is not confidentiality.</p>
        </div></section>
      </div></div>`,
    }
  }

  /* ---------- A10 History ---------- */
  A.views.history = (state) => {
    const filter = state.query.type ?? "all"
    const groups = D().history.map((g) => ({ ...g, items: g.items.filter((e) => filter === "all" || (filter === "memory" ? e.memory : !e.memory)) })).filter((g) => g.items.length)
    return {
      crumbs: [["Atlas", "#/overview"], ["History"]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Activity</div><h1>History</h1><p>Every change to what agents believe: emitted, ratified, linked, drifted, superseded, decayed. Nothing is deleted; superseded versions stay reachable.</p></div></div>
      <div class="at-toolbar"><div class="wf-range">${[["all", "All"], ["knowledge", "Knowledge"], ["memory", "Memory"]].map(([v, l]) => `<button aria-pressed="${filter === v}" data-action="go" data-value="#/history${v === "all" ? "" : `?type=${v}`}">${l}</button>`).join("")}</div><span class="at-hint">Grouped by day · newest first</span></div>
      <section class="at-panel"><div class="at-panel-body">${A.views.timeline(groups)}</div></section></div>`,
    }
  }

  /* ---------- A11 Health ---------- */
  A.views.health = (state) => {
    const h = D().health
    return {
      crumbs: [["Atlas", "#/overview"], ["Store health"]],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Doctor</div><h1>Store health</h1><p>Is the knowledge store intact, is the index current, and do stored facts still prove? Reads only.</p></div>
      <div class="heading-actions">${A.btn("Run verify-store", "toast", { icon: "play", value: "verify-store finished: 612 re-proven, 4 broken, 37 unverifiable, 4 dangling.", primary: true })}</div></div>
      <div class="at-health">
        <section class="at-panel"><header class="at-panel-head"><h3>Content-addressed store</h3><span class="at-state good">${A.icon("checkc")}Sound</span></header><div class="at-panel-body">
          <dl class="at-kv"><dt>Objects</dt><dd>${A.num(h.cas.objects)}</dd><dt>Referenced</dt><dd>${A.num(h.cas.referenced)}</dd><dt>Orphan</dt><dd>${A.num(h.cas.orphan)} <small>· superseded history, kept on purpose</small></dd><dt>Corrupt</dt><dd>0</dd><dt>Unreadable</dt><dd>0</dd><dt>Missing</dt><dd>0</dd></dl></div></section>
        <section class="at-panel"><header class="at-panel-head"><h3>Structural index</h3><span class="at-pill good">${A.icon("check")}matches HEAD</span></header><div class="at-panel-body">
          <dl class="at-kv"><dt>Built at</dt><dd><code>${h.index.builtAt}</code></dd><dt>HEAD</dt><dd><code>${h.index.head}</code></dd><dt>Files</dt><dd>${A.num(h.index.files)}</dd><dt>Units</dt><dd>${A.num(h.index.units)}</dd><dt>Build</dt><dd>${h.index.cold} cold · drift pass ${h.index.warm} warm</dd></dl></div></section>
      </div>
      <section class="at-panel" style="margin-block-start:14px"><header class="at-panel-head"><h3>verify-store</h3><small>Last run ${h.verify.ranAt}</small></header><div class="at-panel-body">
        <div class="at-buckets">${[["reproven", "Re-proven", "good"], ["broken", "Broken", "bad"], ["unverifiable", "Unverifiable", ""], ["dangling", "Dangling", "warm"]].map(([k, l, tone]) => `<div class="at-bucket"><b class="${tone ? `at-state ${tone}` : ""}">${h.verify[k]}</b><span>${l}</span></div>`).join("")}</div></div></section>
      <section class="at-panel" style="margin-block-start:14px"><header class="at-panel-head"><h3>Hot set</h3><small>Scopes with the most recent knowledge activity</small></header>
        ${h.hotset.map(([p, n]) => `<div class="at-row" data-action="go" data-value="#/scope/${encodeURIComponent(p)}" tabindex="0">${A.icon("pin")}<div class="at-row-claim"><code class="at-mono">${A.esc(p)}</code></div><div class="at-row-meta">${A.bar([["good", n], ["dim", 45 - n]], "slim")}<small>${n}</small></div></div>`).join("")}</section>
      </div>`,
    }
  }

  /* ---------- A12 Proposals ---------- */
  A.views.proposals = (state) => ({
    crumbs: [["Atlas", "#/overview"], ["Proposals"]],
    html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Genesis staging</div><h1>Proposals <span class="at-phase">W4</span></h1><p>Candidates mined into staging. Nothing here is knowledge yet: promotion settles every row through the write gates and reports a refusal per row.</p></div>
      <div class="heading-actions">${A.lockedBtn("Promote all")}</div></div>
      <div class="attention">${A.icon("info")}<div><strong>Needs a new Atlas read</strong><small>Atlas cannot list staging without promoting it. This screen shows the design that read would unlock.</small></div></div>
      <section class="at-panel">${D().proposals.map((p) => `<div class="at-row" style="cursor:default">${A.badge(p.arm, "blue")}<div class="at-row-claim">${A.esc(p.claim)}<small>${A.esc(p.anchor)} · ${p.sites} sites</small></div><div class="at-row-meta">${p.refusal ? `<span class="at-state bad" data-tip="${A.esc(p.refusal)}">${A.icon("xc")}Would be refused</span>` : `<span class="at-state good">${A.icon("checkc")}Passes gates</span>`}</div></div>`).join("")}</section>
      <p class="mx-note">Write gates: shape, truth, authz, ratify. A refusal names the gate and the evidence, never just “failed”.</p></div>`,
  })

  /* ---------- A13 Ratification ---------- */
  A.views.ratify = (state) => ({
    crumbs: [["Atlas", "#/overview"], ["Ratification"]],
    html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Governance</div><h1>Ratification <span class="at-phase">W4</span></h1><p>Knowledge that needs a decision. T0 needs a human Steward; the UI never approves on its own. Each action goes through a governed door with your identity.</p></div></div>
      ${D().ratify.map((r, i) => `<article class="at-drift"><header class="at-drift-head">${r.kind === "link" ? `<span class="at-family">${A.icon("link")}</span>` : A.tier(r.kind)}<div><strong>${A.esc(r.claim)}</strong><small><span>proposed by ${A.esc(D().seats[r.by].label)}</span><code>${A.esc(r.anchor)}</code></small></div></header>
        <footer class="at-drift-foot"><span class="grow">${A.esc(r.why)}</span>${A.btn("Reject", "toast", { value: "Rejection needs a reason; it is recorded, never silent." })}${A.btn(r.kind === "link" ? "Review link" : "Review & ratify", "ratify", { value: String(i), primary: true })}</footer></article>`).join("")}
      </div>`,
  })

  A.views.ratifyDialog = (i) => {
    const r = D().ratify[i]
    return `<form method="dialog"><header class="mx-dialog-head"><div><h2 id="dialog-title">${r.kind === "link" ? "Link as sameAs" : `Ratify as ${r.kind}`}</h2><p>${A.esc(r.claim)}</p></div></header>
      <div class="mx-dialog-body"><dl class="at-kv"><dt>Door</dt><dd><code>${r.kind === "link" ? "atlas-link" : "atlas-emit"}</code></dd><dt>Acting as</dt><dd>${A.seatChip("gustavo", "human")} <small>Steward</small></dd><dt>Proposed by</dt><dd>${A.seatChip(r.by)}</dd><dt>Effect</dt><dd>${r.kind === "link" ? "Adds a symmetric, transitive sameAs edge. Retracting later appends; nothing is deleted." : "Moves the fact into the governing band. It will shape every agent turn in this scope."}</dd></dl>
      <label class="mx-field" style="margin-block-start:16px"><span>Note for the record</span><textarea placeholder="Why this is true"></textarea></label></div>
      <footer class="mx-dialog-foot"><span>Governed write · arrives in W4</span><button class="mx-btn" value="cancel">Cancel</button><button class="mx-btn primary" value="ok" data-action="locked" data-value="Ratify">${A.icon("lock")}Ratify</button></footer></form>`
  }

  A.views.compareDialog = (key) => {
    const x = D().byKey[key]
    return `<form method="dialog"><header class="mx-dialog-head"><div><h2 id="dialog-title">Compare versions</h2><p>${A.esc(x.claim)}</p></div></header>
      <div class="mx-dialog-body"><div class="at-diff">
        <div><div class="mx-eyebrow">v2 · b1ec52a9</div><p style="font-size:12px;line-height:1.7"><del style="background:var(--at-del);text-decoration:none">SessionV2.prompt admits one durable row and runs the provider turn.</del></p><dl class="at-kv"><dt>Anchor</dt><dd><code>session-v2/prompt.ts::SessionV2.prompt</code></dd></dl></div>
        <div><div class="mx-eyebrow">v3 · ${D().HEAD}</div><p style="font-size:12px;line-height:1.7"><ins style="background:var(--at-add);text-decoration:none">${A.esc(x.claim)}</ins></p><dl class="at-kv"><dt>Anchor</dt><dd><code>${A.esc(x.anchor.qualifiedPath)}</code></dd></dl></div></div></div>
      <footer class="mx-dialog-foot"><span>Superseded, never overwritten</span><button class="mx-btn primary" value="ok">Done</button></footer></form>`
  }

  /* ---------- S01 Session with citation chips ---------- */
  A.views.session = (state) => {
    const k = D().keyOf
    const chip = (key) => {
      const x = D().byKey[key]
      const tone = x.drift ? "drift" : ""
      return `<button class="at-chip ${tone}" data-action="inspect" data-value="${key}" aria-label="Open fact in inspector">${A.icon("fact")}${A.esc(x.anchor.path.split("/").at(-1))}<span class="st">${x.tier} · ${x.freshness ? x.freshness.toLowerCase() : "[?]"}</span></button>`
    }
    const why = state.query.why === "1"
    return {
      crumbs: [["Chat"], ["Atlas read projection"]],
      flush: true,
      html: `<div class="at-session"><div class="at-tabs-strip"><span class="at-sess-tab">${A.icon("chat")}Atlas read projection <code>atlas-ui-study</code></span><span class="at-hint">${A.icon("info")}Citation chips come from tool receipts, not model text</span></div>
      <div class="at-transcript">
        <div class="at-turn user">Wire the Atlas Own read through the server so the chapter can show scope briefings.</div>
        <div class="at-turn">
          <div class="at-turn-head">${A.seatChip("backend")}<span>Claude Opus · 2 min ago</span><span class="grow"></span>${A.btn(why ? "Hide context" : "Why did it know this?", "go", { icon: "memory", value: `#/session${why ? "" : "?why=1"}` })}</div>
          <div class="at-tool">${A.icon("atlas")}<code>atlas_context</code><span>catalog · unit packages/core/src/session-v2</span><span class="grow"></span><span class="at-state good">${A.icon("check")}READY</span></div>
          <p>Admission stays durable and separate from execution: ${chip(k.admit)} so the new read endpoint must not trigger a wake. Delivery defaults to steer ${chip(k.steer)}.</p>
          <p>One risk before I wire it: the retry rule ${chip(k.conflict)} drifted after the store split, so I will not rely on <code class="at-mono">PromptConflict</code> until it is re-grounded.</p>
          <div class="at-tool">${A.icon("memory")}<code>atlas_memory_emit</code><span>task · “Atlas read projection: keep reads in packages/orchestra”</span><span class="grow"></span><button class="at-chip memory" data-action="go" data-value="#/memory/backend?kind=task">${A.icon("memory")}memory · backend<span class="st">written</span></button></div>
          ${why ? `<div class="at-why"><h4>Why the agent knew this · turn 4</h4><div class="at-why-grid">
            <div><b>Turn header</b>Awareness 352 · Orientation 188 · Rules 431 tokens<br>terrain facet drifted</div>
            <div><b>Packs consulted</b>own_session-v2 · 1,284 / 1,500 tokens<br>4 invariants · 2 gotchas · 3 advisory</div>
            <div><b>Left out</b>2 advisory rows dropped by the cap · 2 pull-reachable facts not pulled</div></div></div>` : ""}
        </div>
      </div>
      <div class="at-composer">Ask anything, / for commands, @ for context…<div class="row">${A.icon("atlas")}<span>@atlas scope</span><span class="grow"></span><span>Build</span><span>Claude Opus</span></div></div></div>`,
    }
  }

  /* ---------- Gallery ---------- */
  A.screens = [
    ["A01", "Overview", "#/overview", "overview", "Health at a glance: counts, freshness, drift that blocks merge, territory health, activity, and what is honestly unavailable.", "W1"],
    ["A02", "Territories", "#/territories", "territory", "Ownership, tiers and freshness per territory; table or matrix; uncovered paths.", "W1"],
    ["A02b", "Territory matrix", "#/territories?view=matrix", "matrix", "Territory × freshness heatmap; each cell opens those facts.", "W1"],
    ["A03", "Scope briefing", "#/scope/packages%2Fcore%2Fsrc%2Fsession-v2", "stack", "The own-pack: governing and advisory bands kept apart, gotchas, budget, pushed-out rows.", "W1"],
    ["A04", "Facts", "#/facts", "fact", "Scoped list with family, tier and freshness filters, keyboard navigation and in-place inspection.", "W1"],
    ["A05", "Fact inspector", `#/facts?inspect=${A.data.keyOf.admit}`, "eye", "Drawer over any screen: anchor and code at sha, provenance, relations, lineage, both ids.", "W1"],
    ["A05b", "Fact as page", `#/fact/${A.data.keyOf.conflict}`, "expand", "The same inspector as a deep-linkable page, here for a semantically drifted fact.", "W1"],
    ["A06", "Drift", "#/drift", "drift", "Semantic vs mechanical drift with before/after code and the resolution each needs.", "W1"],
    ["A07", "Relations · tree", "#/relations", "tree", "Blast radius as a collapsible tree grouped by distance.", "W2"],
    ["A07b", "Relations · graph", "#/relations?view=graph", "graph", "Focused neighbourhood graph, depth ≤ 2, for path questions only.", "W2"],
    ["A08", "Negations", "#/negations", "negation", "Proven absences and honest abstentions with their reasons.", "W2"],
    ["A09", "Memory", "#/memory/backend", "memory", "Per-seat turn header (awareness, orientation, rules) and recall on demand.", "W2"],
    ["A10", "History", "#/history", "history", "Timeline of emits, ratifications, links, drift, supersession and decay.", "W3"],
    ["A11", "Store health", "#/health", "health", "CAS integrity, index currency, verify-store buckets, hot set.", "W3"],
    ["A12", "Proposals", "#/proposals", "inbox", "Genesis staging with per-row gate outcome. Needs a new Atlas read.", "W4"],
    ["A13", "Ratification", "#/ratify", "shield", "Decision queue; T0 is human-only; every action through a governed door.", "W4"],
    ["S01", "Session citations", "#/session", "chat", "Citation chips in the transcript open the inspector in place; “why did it know this”.", "W2"],
    ["S01b", "Why it knew", "#/session?why=1", "memory", "Per-turn header, packs consulted and what the budget left out.", "W2"],
  ]
  A.views.gallery = () => ({
    crumbs: [["Atlas", "#/overview"], ["All screens"]],
    html: `<div class="at-page"><div class="mx-heading"><div><div class="mx-eyebrow">Design preview</div><h1>All screens</h1><p>Every Atlas screen in this preview, with its study ID and delivery phase. Use the State menu in the top bar to see the building and not-configured states on any screen.</p></div></div>
      <div class="at-gallery">${A.screens.map(([id, title, href, glyph, text, phase]) => `<a class="at-gcard" href="${href}"><header><span class="mx-mark">${A.icon(glyph)}</span><div><code>${id}</code><br><strong>${title}</strong></div></header><p>${text}</p><footer><span class="at-phase">${phase}</span></footer></a>`).join("")}
      <a class="at-gcard" href="#" data-action="palette"><header><span class="mx-mark">${A.icon("search")}</span><div><code>X01</code><br><strong>Command palette</strong></div></header><p>⌘K: jump to any screen, scope, fact or seat; run Atlas actions.</p><footer><span class="at-phase">W1</span></footer></a>
      <a class="at-gcard" href="#" data-action="shortcuts"><header><span class="mx-mark">${A.icon("keyboard")}</span><div><code>X02</code><br><strong>Shortcuts</strong></div></header><p>Keyboard map: g-chords between screens, j/k in lists, Esc closes.</p><footer><span class="at-phase">W1</span></footer></a>
      <a class="at-gcard" href="#" data-action="ratify" data-value="0"><header><span class="mx-mark">${A.icon("lock")}</span><div><code>X03</code><br><strong>Ratify dialog</strong></div></header><p>A governed write: door, acting identity, effect, note for the record.</p><footer><span class="at-phase">W4</span></footer></a>
      <a class="at-gcard" href="#" data-action="state" data-value="held"><header><span class="mx-mark">${A.icon("warning")}</span><div><code>X04</code><br><strong>Not configured</strong></div></header><p>The HOLD state with its reason code, evidence and next step.</p><footer><span class="at-phase">W1</span></footer></a>
      </div></div>`,
  })

  /* ---------- HOLD: Atlas not configured for this profile ---------- */
  A.views.held = () => ({
    crumbs: [["Atlas"]],
    html: `<div class="at-page narrow"><div class="at-held"><span class="mx-mark">${A.icon("atlas")}</span><h2>Atlas is not configured for this project</h2>
      <span class="at-held-reason at-pill warm">${A.icon("warning")}HOLD · config-missing</span>
      <p>Orchestra found no <code class="at-mono">maestro.atlas</code> binding in this project's config, so there is nothing grounded to show. Nothing below is estimated or left at zero.</p>
      ${A.code(".orchestra/orchestra.jsonc", 1, ["{", "  \"maestro\": {", "    \"atlas\": { \"projectID\": \"hugr-orchestra\", \"directory\": \".atlas\" }", "  }", "}"], { highlight: [3] })}
      <div style="display:flex;gap:8px;justify-content:center">${A.btn("Copy snippet", "copy", { icon: "copy", value: '"maestro": { "atlas": { "projectID": "hugr-orchestra", "directory": ".atlas" } }' })}${A.btn("Back to ready state", "state", { value: "ready", primary: true })}</div></div></div>`,
  })
})(window.Atlas)
