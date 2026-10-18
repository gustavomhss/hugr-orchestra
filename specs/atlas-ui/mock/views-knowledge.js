// Knowledge screens: A01 Overview, A02 Territories, A03 Scope, A04 Facts, A05 Inspector, A06 Drift.
;(function (A) {
  const D = () => A.data
  const fact = (key) => D().byKey[key]
  const territory = (id) => D().territories.find((t) => t.id === id)
  const total = (t) => t.fresh + t.drifted + t.stale + t.unknown
  const sum = (field) => D().territories.reduce((n, t) => n + t[field], 0)
  const drifts = () => D().facts.filter((x) => x.drift)
  A.views = A.views || {}

  // Rows open the inspector in place; Enter/Space and j/k work on every row (app.js).
  const rowAttrs = (key, state) => `data-action="inspect" data-value="${key}" tabindex="0" role="row" ${state.query.inspect === key ? 'aria-selected="true"' : ""}`

  /* ---------- A01 Overview ---------- */
  A.views.overview = (state) => {
    const d = D()
    const facts = sum("fresh") + sum("drifted") + sum("stale") + sum("unknown")
    const semantic = d.semanticTotal
    const building = state.preview === "building"
    const tile = (label, value, foot, href, extra = "") =>
      `<a class="at-stat" href="${href}"><span class="at-stat-label">${label}${A.icon("arrow")}</span>${building ? '<span class="at-skel" style="block-size:26px;inline-size:60%"></span>' : `<span class="at-stat-value">${value}</span>`}${extra}<span class="at-stat-foot">${foot}</span></a>`
    return {
      crumbs: [["Atlas"]],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Orchestra · Knowledge layer</div><h1>Atlas</h1><p>What is true about this code, who said so, and whether it is still true at <code class="at-mono">${d.HEAD}</code>.</p></div>
        <div class="heading-actions">${A.btn("Refresh", "refresh", { icon: "refresh" })}${A.btn("Search Atlas", "palette", { icon: "search", primary: true })}</div></div>
      ${building ? `<div class="at-building"><span class="spin"></span><div><strong>Building the structural index for ${d.HEAD}</strong><small>First open of a worktree takes about 5 seconds. Counts appear when the index is ready; nothing is estimated.</small></div></div>` : ""}
      <div class="at-strip">${A.icon("branch")}<code>hugr-orchestra</code><span class="divider"></span>Indexed at <code>${d.HEAD}</code><span class="at-pill good">${A.icon("check")}matches HEAD</span><span class="divider"></span>${A.icon("shield")}Store <span class="at-state good">${A.icon("checkc")}sound</span>
        <span class="push">${A.icon("clock")}Verified 12 min ago</span></div>
      ${semantic ? `<div class="attention bad">${A.icon("warning")}<div><strong>${semantic} facts drifted semantically since ${d.BASE}</strong><small>Their predicates no longer hold. They block a merge until someone re-grounds or retires them.</small></div>${A.btn("Review drift", "go", { value: "#/drift?class=semantic" })}</div>` : ""}
      <div class="at-stats">
        ${tile("Facts", A.num(facts), `<span><b>12</b> T0</span><span><b>214</b> T1</span><span><b>431</b> T2 advisory</span>`, "#/facts")}
        ${tile("Freshness", `${A.num(sum("fresh"))}<small>fresh</small>`, `<span class="at-state warm">${A.icon("drift")}<b>${sum("drifted")}</b>&nbsp;drifted</span><span class="at-state stale">${A.icon("clock")}<b>${sum("stale")}</b>&nbsp;stale</span><span class="at-state unknown"><b>${sum("unknown")}</b>&nbsp;[?]</span>`, "#/drift", A.bar([["good", sum("fresh")], ["warm", sum("drifted")], ["stale", sum("stale")], ["dim", sum("unknown")]]))}
        ${tile("Predicates", "188<small>hold</small>", `<span class="at-state bad">${A.icon("xc")}<b>4</b>&nbsp;broken</span><span class="at-state">${A.icon("minusc")}<b>9</b>&nbsp;n/a</span>`, "#/facts?family=predicate")}
        ${tile("Territories", `${d.territories.length}`, `<span class="at-state warm">${A.icon("warning")}<b>${d.uncovered.length}</b>&nbsp;uncovered paths</span>`, "#/territories")}
      </div>
      <div class="at-cols">
        <div>
          <section class="at-panel"><header class="at-panel-head"><h3>Territory health</h3><a class="mx-link" href="#/territories">All territories</a></header>
          <table class="at-table"><thead><tr><th>Territory</th><th>Owner</th><th>Tier</th><th>Freshness</th><th class="num">Facts</th></tr></thead><tbody>
          ${d.territories.slice(0, 6).map((t) => `<tr data-action="go" data-value="#/territories?t=${t.id}" tabindex="0"><td><div class="claim">${A.esc(t.name)}<small>${A.esc(t.globs[0])}</small></div></td><td>${A.seatChip(t.owner)}</td><td>${A.tier(t.tier)}</td><td>${A.bar([["good", t.fresh], ["warm", t.drifted], ["stale", t.stale], ["dim", t.unknown]], "slim")}</td><td class="num">${total(t)}</td></tr>`).join("")}
          </tbody></table></section>
          <section class="at-panel"><header class="at-panel-head"><h3>Not available yet</h3><small>Shown as unavailable, never as zero</small></header><div class="at-panel-body">
            <dl class="at-kv"><dt>Trigger retrieval</dt><dd><span class="at-unavailable">${A.icon("info")}No trigger producer exists yet; the mode returns nothing.</span></dd>
            <dt>Cited hits</dt><dd><span class="at-unavailable">${A.icon("info")}Not measured. Hit, PPR and dependency counts are degenerate today.</span></dd>
            <dt>Version diff</dt><dd><span class="at-unavailable">${A.icon("info")}atlas-diff is not wired.</span></dd></dl></div></section>
        </div>
        <section class="at-panel"><header class="at-panel-head"><h3>Recent activity</h3><a class="mx-link" href="#/history">History</a></header><div class="at-panel-body">${A.views.timeline(d.history.slice(0, 2), 5)}</div></section>
      </div></div>`,
    }
  }

  /* ---------- A02 Territories ---------- */
  A.views.territories = (state) => {
    const d = D()
    const view = state.query.view === "matrix" ? "matrix" : "table"
    const pick = state.query.t
    const cell = (value, tone, t, filter) => `<button class="mc ${value ? "" : "zero"}" style="${value ? `background:color-mix(in srgb, var(--mx-${tone}) ${Math.min(55, 8 + value / 3)}%, transparent)` : ""}" data-action="go" data-value="#/facts?territory=${t.id}&fresh=${filter}" aria-label="${t.name} ${filter} ${value}">${value}</button>`
    const table = `<table class="at-table"><thead><tr><th>Territory</th><th>Globs</th><th>Owner</th><th>Tier</th><th>Freshness</th><th class="num">Drifted</th><th class="num">Facts</th></tr></thead><tbody>
      ${d.territories.map((t) => `<tr data-action="go" data-value="#/scope/${encodeURIComponent(t.id === "core" ? "packages/core/src/session-v2" : t.globs[0].replace("/**", ""))}" tabindex="0" ${pick === t.id ? 'class="selected"' : ""}><td><div class="claim">${A.esc(t.name)}</div></td><td><code>${t.globs.map(A.esc).join("<br>")}</code></td><td>${A.seatChip(t.owner)}</td><td>${A.tier(t.tier)}</td><td>${A.bar([["good", t.fresh], ["warm", t.drifted], ["stale", t.stale], ["dim", t.unknown]], "slim")}</td><td class="num">${t.drifted ? `<span class="at-state warm">${t.drifted}</span>` : "—"}</td><td class="num">${total(t)}</td></tr>`).join("")}
      </tbody></table>`
    const matrix = `<div class="at-panel-body"><div class="at-matrix" style="grid-template-columns: minmax(150px, 1.4fr) repeat(4, minmax(60px, 1fr))">
      <span></span><span class="mh">Fresh</span><span class="mh">Drifted</span><span class="mh">Stale</span><span class="mh">[?]</span>
      ${d.territories.map((t) => `<span class="mr">${A.esc(t.name)}</span>${cell(t.fresh, "good", t, "FRESH")}${cell(t.drifted, "warm", t, "DRIFTED")}${cell(t.stale, "dim", t, "STALE")}${cell(t.unknown, "dim", t, "unknown")}`).join("")}
      </div><p class="mx-note">Matrix reads faster than a graph above ~20 nodes. Click a cell to open those facts.</p></div>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Territories"]],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Ownership</div><h1>Territories</h1><p>Who owns which code, at which governance tier, and how fresh its knowledge is. Overlaps resolve deterministically; tiers are ratified by a human.</p></div>
      <div class="heading-actions">${A.lockedBtn("Declare territory")}</div></div>
      <div class="at-toolbar"><div class="wf-range" role="tablist" aria-label="View">
        <button role="tab" aria-selected="${view === "table"}" data-action="go" data-value="#/territories">${A.icon("table")}Table</button>
        <button role="tab" aria-selected="${view === "matrix"}" data-action="go" data-value="#/territories?view=matrix">${A.icon("matrix")}Matrix</button></div>
        <span class="at-hint">${d.territories.length} territories · ${A.num(d.territories.reduce((n, t) => n + total(t), 0))} facts</span></div>
      <section class="at-panel">${view === "table" ? table : matrix}</section>
      <section class="at-panel"><header class="at-panel-head"><h3>${A.icon("warning")} Uncovered paths</h3><small>No territory glob covers these. Their facts have no owner to ratify them.</small></header>
      ${d.uncovered.map((p) => `<div class="at-row" style="cursor:default"><div class="at-row-claim"><code class="at-mono">${A.esc(p)}</code></div>${A.lockedBtn("Assign")}</div>`).join("")}</section>
      </div>`,
    }
  }

  /* ---------- A03 Scope (OwnPack) ---------- */
  A.views.scope = (state) => {
    const path = state.params[0] || "packages/core/src/session-v2"
    const s = D().scopes[path] ?? D().scopes["packages/core/src/session-v2"]
    const t = territory(s.territory)
    const tab = state.query.tab ?? "briefing"
    const band = (cls, title, sub, keys, opts = {}) =>
      `<section class="at-band ${cls}"><header class="at-band-head">${opts.icon ? A.icon(opts.icon) : ""}<h3>${title}</h3><small>${sub}</small></header>
      ${keys.map((k) => fact(k)).map((x) => `<div class="at-row ${state.query.inspect === x.key ? "selected" : ""}" ${rowAttrs(x.key, state)}>${A.family(x.family)}<div class="at-row-claim">${A.esc(x.claim)}<small>${A.esc(x.anchor.qualifiedPath)}</small></div><div class="at-row-meta">${A.tier(x.tier)}${A.freshness(x.freshness)}${x.family === "predicate" ? A.truth(x.truth) : ""}</div></div>`).join("")}</section>`
    const segments = path.split("/")
    const tabs = [["briefing", "Briefing", "stack"], ["finer", "Subscopes", "tree", s.finer.length], ["blast", "Blast radius", "relations", s.dependent], ["files", "Contains", "code", s.contains.length]]
    const body = {
      briefing: `${band("gov", "Governing invariants", "Ratified · tier T0–T1 · drives agent behaviour", s.inv, { icon: "shield" })}
        ${band("gotcha", "Gotchas & rationale", "Ratified · read before editing", s.gotcha, { icon: "warning" })}
        ${band("adv", "Advisory · unratified", `Machine proposals (T2) under their own cap · ${s.advisoryDropped} dropped by the cap`, s.advisory, { icon: "sparkle" })}
        <section class="at-band pull"><header class="at-band-head">${A.icon("download")}<h3>Pushed out by the budget</h3><small>Named, never silently dropped · pull on demand</small></header>
        ${s.pull.map((p) => `<div class="at-row" style="cursor:default"><div class="at-row-claim">${A.esc(p.claim)}<small>key ${A.short(p.key)}…</small></div>${A.btn("Pull", "toast", { value: "Pulled into this view. The pack itself is unchanged." })}</div>`).join("")}</section>`,
      finer: `<section class="at-panel">${s.finer.map((p) => `<div class="at-row" data-action="go" data-value="#/scope/${encodeURIComponent(p)}" tabindex="0">${A.icon("code")}<div class="at-row-claim"><code class="at-mono">${A.esc(p)}</code></div><div class="at-row-meta"><small>${2 + (p.length % 4)} facts</small>${A.icon("arrow")}</div></div>`).join("")}</section>`,
      blast: A.views.blastTree(state, true),
      files: `<section class="at-panel">${s.contains.map((p) => `<div class="at-row" style="cursor:default">${A.icon("fact")}<div class="at-row-claim"><code class="at-mono">${A.esc(path)}/${A.esc(p)}</code></div><a class="mx-link" href="#/relations?unit=${encodeURIComponent(`${path}/${p}`)}">Relations</a></div>`).join("")}</section>`,
    }[tab]
    return {
      crumbs: [["Atlas", "#/overview"], ["Territories", "#/territories"], [t.name, `#/territories?t=${t.id}`], [segments.slice(-2).join("/"), null, true]],
      html: `<div class="at-page">
      <div class="at-scope-head"><div><div class="mx-eyebrow">Scope briefing · own_${A.esc(segments.at(-1))}</div><h1 style="margin:0;font:500 20px var(--mx-mono);letter-spacing:-.02em">${A.esc(path)}</h1>
        <p>${A.esc(s.role)}</p>
        <div class="at-scope-meta"><span>Owner ${A.seatChip(s.owner)}</span><span>Tier ${A.tier(s.tier)}</span><span>Territory <b>${A.esc(t.name)}</b></span><span style="white-space:nowrap">${A.icon("branch").replace('class="wf-ic ', 'style="display:inline;vertical-align:-3px;inline-size:12px" class="wf-ic ')} <code class="at-mono">${D().HEAD}</code></span></div></div>
        <div style="display:flex;flex-direction:column;gap:12px;min-inline-size:220px">${A.meter("Briefing budget (tokens)", s.tokenEstimate, s.cap)}
        <div style="display:flex;gap:8px;justify-content:flex-end">${A.btn("Facts", "go", { value: `#/facts?scope=${encodeURIComponent(path)}`, icon: "fact" })}${A.btn("Relations", "go", { value: `#/relations?unit=${encodeURIComponent(path + "/prompt.ts")}`, icon: "relations" })}</div></div></div>
      <div class="wf-tabs" role="tablist">${tabs.map(([id, label, glyph, count]) => `<button class="wf-tab" role="tab" aria-selected="${tab === id}" data-action="go" data-value="#/scope/${encodeURIComponent(path)}?tab=${id}">${A.icon(glyph)}${label}${count ? `<span class="wf-count">${count}</span>` : ""}</button>`).join("")}</div>
      ${body}
      <p class="mx-note">The briefing is composed by index reads alone: no LLM, no free prose, byte-identical for equal input. The two bands are separate fields and never share a line form.</p>
      </div>`,
    }
  }

  /* ---------- A04 Facts ---------- */
  A.views.facts = (state) => {
    const q = state.query
    const scope = q.scope ?? (q.territory ? null : "packages/core/src/session-v2")
    const terr = q.territory ? territory(q.territory) : null
    const families = ["all", "predicate", "advisory", "relation", "negation", "transition", "test-vacuity"]
    const fam = q.family ?? "all"
    const text = (q.q ?? "").toLowerCase()
    const list = D().facts.filter((x) => (terr ? x.territory === terr.id : x.anchor.path.startsWith(scope)))
      .filter((x) => fam === "all" || x.family === fam)
      .filter((x) => !q.tier || x.tier === q.tier)
      .filter((x) => !q.fresh || (q.fresh === "unknown" ? !x.freshness : x.freshness === q.fresh))
      .filter((x) => !text || `${x.claim} ${x.anchor.qualifiedPath}`.toLowerCase().includes(text))
    const link = (patch) => {
      const next = { ...q, ...patch }
      delete next.inspect
      Object.keys(next).forEach((k) => (next[k] === undefined || next[k] === "" || next[k] === "all") && delete next[k])
      return `#/facts${Object.keys(next).length ? `?${new URLSearchParams(next)}` : ""}`
    }
    const seg = (label, key, values) => `<span>${label}</span><div class="wf-range">${values.map(([v, l]) => `<button aria-pressed="${(q[key] ?? "") === v}" data-action="go" data-value="${link({ [key]: v })}">${l}</button>`).join("")}</div>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Facts"]],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Knowledge</div><h1>Facts</h1><p>Grounded claims about the code, read one scope at a time. Select a row to inspect its anchor, provenance and relations without leaving the list.</p></div></div>
      <div class="at-toolbar">
        <button class="at-scope-pick" data-action="palette" data-value="scope:">${A.icon(terr ? "territory" : "pin")}${terr ? `Territory <code>${A.esc(terr.name)}</code>` : `Scope <code>${A.esc(scope)}</code>`}${A.icon("chev")}</button>
        <label class="at-search">${A.icon("search")}<input id="fact-search" placeholder="Filter claims and anchors" value="${A.esc(q.q ?? "")}" aria-label="Filter facts"><kbd>/</kbd></label>
        <span class="at-hint">${A.icon("keyboard")}<kbd>j</kbd><kbd>k</kbd> move · <kbd>↵</kbd> inspect</span>
      </div>
      <div class="at-filterline">${seg("Family", "family", families.map((x) => [x === "all" ? "" : x, x === "all" ? "All" : x]))}</div>
      <div class="at-filterline">${seg("Tier", "tier", [["", "All"], ["T0", "T0"], ["T1", "T1"], ["T2", "T2"]])}${seg("Freshness", "fresh", [["", "All"], ["FRESH", "Fresh"], ["DRIFTED", "Drifted"], ["STALE", "Stale"], ["unknown", "[?]"]])}</div>
      <div class="at-resultline"><span>${list.length} of ${D().facts.length} facts in this scope</span><span>Atlas has no “list every fact” read yet, so the list is always scoped.</span></div>
      <section class="at-panel">${list.length ? `<table class="at-table" role="grid" aria-label="Facts"><thead><tr><th>Claim</th><th>Tier</th><th>Freshness</th><th>Truth</th><th class="hide-sm">Seal</th><th class="hide-sm">Verified</th></tr></thead><tbody>
        ${list.map((x) => `<tr ${rowAttrs(x.key, state)}><td><div class="at-claimcell">${A.family(x.family)}<div class="claim">${A.esc(x.claim)}<small>${A.esc(x.anchor.qualifiedPath)}</small></div></div></td><td>${A.tier(x.tier)}</td><td>${A.freshness(x.freshness)}</td><td>${["predicate", "negation", "relation", "transition"].includes(x.family) ? A.truth(x.truth) : A.truth("advisory")}</td><td class="hide-sm">${A.seal(x.seal) || '<small>—</small>'}</td><td class="hide-sm"><code>${A.esc(x.emitted.at)}</code></td></tr>`).join("")}
        </tbody></table>` : A.empty("No facts match these filters", "Widen the scope or clear a filter. Nothing here means nothing is filed, not that the code is unknown.", A.btn("Clear filters", "go", { value: "#/facts" }))}</section>
      </div>`,
    }
  }

  /* ---------- A05 Inspector (drawer and full page) ---------- */
  A.views.inspector = (key, state, page = false) => {
    const x = fact(key)
    if (!x) return ""
    const d = D()
    const order = state.list ?? []
    const index = order.indexOf(key)
    const relation = (r) => {
      const y = fact(r.key)
      return y ? `<div class="ins-rel" data-action="inspect" data-value="${y.key}" tabindex="0"><span class="ins-rel-kind">${A.esc(r.kind)}</span><span class="ins-rel-claim">${A.esc(y.claim)}</span>${A.freshness(y.freshness)}</div>` : ""
    }
    const drift = x.drift
      ? `<div class="ins-section"><h4>Drift · ${x.drift === "semantic" ? "semantic, blocks merge" : "mechanical, re-groundable"}</h4>
         <div class="at-anchor-move"><del>${A.short(x.anchor.hash, 10)}</del>${A.icon("arrow")}<ins>${A.short(x.anchorNow.hash, 10)}</ins><span>lines ${x.anchor.lines?.join("–")} → ${x.anchorNow.lines?.join("–")}</span></div>
         ${A.code(x.anchor.path, x.before.start, x.before.lines, { sha: d.BASE, kinds: Object.fromEntries(x.before.lines.map((_, i) => [x.before.start + i, "del"])) })}
         <div style="block-size:8px"></div>${A.code(x.anchor.path, x.after.start, x.after.lines, { sha: d.HEAD, kinds: Object.fromEntries(x.after.lines.map((_, i) => [x.after.start + i, "add"])) })}</div>`
      : ""
    const content = `
      <p class="ins-claim">${A.esc(x.claim)}</p>
      <div class="ins-states">${A.tier(x.tier)}<span class="at-pill">${A.icon("fact")}${A.esc(x.family)}</span>${x.seal ? `<span class="at-pill ${x.seal === "proven" ? "good" : ""}">${A.icon("shield")}${x.seal}</span>` : ""}<span class="at-pill">${A.freshness(x.freshness)}</span>${x.family !== "advisory" ? `<span class="at-pill">${A.truth(x.truth)}</span>` : ""}</div>
      ${x.drift === "semantic" ? `<div class="ins-guidance" style="border-color:rgba(217,154,148,.3);background:var(--at-bad-bg)">${A.icon("warning")}<div><b>This predicate no longer holds at ${d.HEAD}.</b><br>Re-ground it if the rule changed on purpose, or retire it. Until then it blocks a merge.</div></div>` : ""}
      ${x.freshness ? "" : `<div class="ins-guidance">${A.icon("info")}<div>Freshness was not reported for this row, so it shows <code>[?]</code>. Run <code>doctor why</code> to check the anchor.</div></div>`}
      <div class="ins-section"><h4>Grounding<a class="mx-link" href="#/relations?unit=${encodeURIComponent(x.anchor.path)}">Blast radius</a></h4>
        <dl class="at-kv"><dt>Anchor</dt><dd><code>${A.esc(x.anchor.qualifiedPath)}</code></dd><dt>Kind</dt><dd>${A.esc(x.anchor.kind)}</dd><dt>File</dt><dd><code>${A.esc(x.anchor.path)}${x.anchor.lines ? `:${x.anchor.lines.join("-")}` : ""}</code><br><small>Line numbers are a display hint; the subtree hash is the truth.</small></dd><dt>Subtree hash</dt><dd><code>${A.short(x.anchor.hash, 16)}…</code></dd></dl>
        ${x.code && !x.drift ? `<div style="block-size:12px"></div>${A.code(x.anchor.path, x.code.start, x.code.lines, { sha: x.emitted.at, highlight: x.code.highlight, head: '<a href="#" data-action="toast" data-value="Opens the file at this sha in the session file viewer.">Open file</a>' })}` : ""}
      </div>
      ${drift}
      <div class="ins-section"><h4>Provenance</h4>
        <ul class="at-timeline">
          <li><span class="at-tl-dot blue">${A.icon("sparkle")}</span><div class="at-tl-body"><strong>Emitted</strong> by ${A.seatChip(x.emitted.by)} through <code>${x.emitted.door}</code><small>${x.emitted.when} · at <code>${x.emitted.at}</code>${x.origin ? ` · ${A.esc(x.origin)}` : ""}</small></div></li>
          ${x.ratified ? `<li><span class="at-tl-dot good">${A.icon("check")}</span><div class="at-tl-body"><strong>Ratified</strong> by ${A.seatChip(x.ratified.by, d.seats[x.ratified.by]?.human ? "human" : "")}<small>${x.ratified.when}${x.tier === "T0" ? " · T0 requires a human Steward" : ""}</small></div></li>` : `<li><span class="at-tl-dot">${A.icon("clock")}</span><div class="at-tl-body"><strong>Not ratified</strong><small>Advisory band only. It never appears among governing invariants.</small></div></li>`}
        </ul></div>
      ${x.relations.length ? `<div class="ins-section"><h4>Related · depth 1<button class="mx-link" data-action="go" data-value="#/relations?unit=${encodeURIComponent(x.anchor.path)}&view=graph&focus=${x.key}">Neighbourhood graph</button></h4>${x.relations.map(relation).join("")}</div>` : ""}
      ${x.lineage ? `<div class="ins-section"><h4>Lineage · superseded, never overwritten<button class="mx-link" data-action="compare" data-value="${x.key}">Compare v2 → v3</button></h4><ul class="at-timeline">${x.lineage.map((v, i) => `<li><span class="at-tl-dot ${i ? "" : "blue"}">${A.icon(i ? "history" : "dot")}</span><div class="at-tl-body"><strong>v${v.v}</strong> ${A.esc(v.note)}<small>${A.seatChip(v.by)} · <code>${v.at}</code></small></div></li>`).join("")}</ul></div>` : ""}
      <div class="ins-section"><h4>Identity</h4><div class="ins-ids">
        <div class="ins-id"><span>nodeKey</span><code>${x.key}</code><button data-action="copy" data-value="${x.key}">Copy</button></div>
        <div class="ins-id"><span>Content address</span><code>${x.addr}</code><button data-action="copy" data-value="${x.addr}">Copy</button></div></div>
        <p class="mx-note">Two ids, not interchangeable: links and <code>doctor why</code> take the nodeKey; <code>atlas node</code> takes the content address.</p></div>
      <div class="ins-section"><h4>Next step</h4><div class="ins-guidance">${A.icon("arrow")}<div>${x.drift === "semantic" ? "Re-ground with <code>atlas doctor reground</code> or retire through a governed door." : x.tier === "T2" ? "Ratify to promote it into the governing band, or let it decay." : "A node is reached as a drill-down within its pack."}</div></div></div>`
    if (page) return content
    return `<header class="ins-head"><div class="ins-kind">${A.family(x.family)}<span>${A.esc(x.family)} · key <code class="at-mono">${A.short(x.key)}</code></span></div>
      ${A.btn("", "inspect-step", { icon: "up", value: "-1", label: "Previous fact (k)", tip: "Previous (k)", disabled: index <= 0 })}${A.btn("", "inspect-step", { icon: "down", value: "1", label: "Next fact (j)", tip: "Next (j)", disabled: index < 0 || index >= order.length - 1 })}
      ${A.btn("", "go", { icon: "expand", value: `#/fact/${x.key}`, label: "Open as page", tip: "Open as page" })}${A.btn("", "close-inspector", { icon: "close", label: "Close inspector (Esc)", tip: "Close (Esc)" })}</header>
      <div class="ins-body">${content}</div>
      <footer class="ins-foot">${A.btn("Copy link", "copy-link", { icon: "link", value: x.key })}${x.drift ? A.lockedBtn("Accept re-ground") : x.tier === "T2" ? A.lockedBtn("Ratify") : A.lockedBtn("Supersede")}</footer>`
  }

  A.views.fact = (state) => {
    const x = fact(state.params[0])
    if (!x) return { crumbs: [["Atlas", "#/overview"], ["Fact"]], html: `<div class="at-page narrow">${A.empty("No fact with this nodeKey", "The id may be a content address. Content addresses open with atlas node; links and inspectors take nodeKeys.", A.btn("Back to facts", "go", { value: "#/facts" }))}</div>` }
    const t = territory(x.territory)
    return {
      crumbs: [["Atlas", "#/overview"], ["Facts", "#/facts"], [`${x.family} · ${A.short(x.key)}`, null, true]],
      html: `<div class="at-page narrow"><div class="mx-heading"><div><div class="mx-eyebrow">${A.esc(t.name)} · ${A.esc(x.family)} fact</div></div><div class="heading-actions">${A.btn("Back to list", "back", { icon: "back" })}${A.btn("Copy link", "copy-link", { icon: "link", value: x.key })}</div></div>${A.views.inspector(x.key, state, true)}</div>`,
    }
  }

  /* ---------- A06 Drift ---------- */
  A.views.drift = (state) => {
    const d = D()
    const cls = state.query.class ?? "semantic"
    const items = drifts().filter((x) => x.drift === cls)
    const counts = { semantic: d.semanticTotal, mechanical: d.mechanicalTotal }
    const card = (x) => `<article class="at-drift ${x.drift}">
      <header class="at-drift-head">${A.family(x.family)}<div><strong>${A.esc(x.claim)}</strong><small><span>${A.tier(x.tier)}</span>${A.truth(x.truth)}<code>${A.esc(x.anchor.qualifiedPath)}</code><span>emitted ${A.esc(x.emitted.when)} by ${A.esc(d.seats[x.emitted.by].label)}</span></small></div>
      ${A.btn("Inspect", "inspect", { value: x.key, icon: "eye" })}</header>
      <div class="at-drift-body"><div class="at-anchor-move">${A.icon("hash")}<del>${A.short(x.anchor.hash, 12)}</del>${A.icon("arrow")}<ins>${A.short(x.anchorNow.hash, 12)}</ins><span>${A.esc(x.anchor.path)} · lines ${x.anchor.lines.join("–")} → ${x.anchorNow.lines.join("–")}</span></div>
      <div class="at-diff">${A.code("Grounded", x.before.start, x.before.lines, { sha: d.BASE, kinds: Object.fromEntries(x.before.lines.map((_, i) => [x.before.start + i, "del"])) })}${A.code("Now", x.after.start, x.after.lines, { sha: d.HEAD, kinds: Object.fromEntries(x.after.lines.map((_, i) => [x.after.start + i, "add"])) })}</div></div>
      <footer class="at-drift-foot"><span class="grow">${x.drift === "semantic" ? "The predicate no longer holds. Decide whether the code or the fact is wrong." : "Content moved but the claim still holds. Safe to re-ground."}</span>
      ${A.btn("Open code", "toast", { value: "Opens the file at HEAD in the session file viewer.", icon: "code" })}${x.drift === "semantic" ? A.lockedBtn("Retire") : ""}${A.lockedBtn(x.drift === "semantic" ? "Re-ground" : "Accept re-ground")}</footer></article>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Drift"]],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Freshness</div><h1>Drift</h1><p>Facts whose anchored code changed. Mechanical drift moved content but the claim still holds; semantic drift means the claim is now false and blocks a merge.</p></div>
      <div class="heading-actions">${A.btn("Re-check now", "refresh", { icon: "refresh" })}</div></div>
      <div class="at-toolbar"><div class="wf-range" role="tablist">
        <button role="tab" aria-selected="${cls === "semantic"}" data-action="go" data-value="#/drift?class=semantic">${A.icon("xc")}Semantic<span class="wf-count">${counts.semantic}</span></button>
        <button role="tab" aria-selected="${cls === "mechanical"}" data-action="go" data-value="#/drift?class=mechanical">${A.icon("drift")}Mechanical<span class="wf-count">${counts.mechanical}</span></button></div>
        <button class="at-scope-pick" data-action="toast" data-value="Pick a merge-base, a PR or a session to scope drift.">${A.icon("branch")}Since merge-base <code>${d.BASE}</code>${A.icon("chev")}</button>
        <span class="at-hint">Reconcile is read-only: it reports and never writes.</span></div>
      ${items.map(card).join("")}
      ${cls === "semantic" ? `<p class="mx-note">2 more semantic items sit in territories outside this preview's sample data.</p>` : `<p class="mx-note">Showing 1 of 37. Mechanical items can be accepted in bulk once governed writes ship.</p>`}
      </div>`,
    }
  }

  A.views.timeline = (groups, limit = 99) => {
    let n = 0
    return groups.map((g) => `<div class="at-tl-day">${g.day}</div><ul class="at-timeline">${g.items.filter(() => n++ < limit).map((e) => `<li><span class="at-tl-dot ${e.tone}">${A.icon(e.glyph)}</span><div class="at-tl-body">${e.key ? `<a class="mx-link" style="color:var(--mx-strong);font-size:11px" href="#" data-action="inspect" data-value="${A.data.keyOf[e.key]}">${A.esc(e.title)}</a>` : `<strong>${A.esc(e.title)}</strong>`}<small>${A.esc(e.detail)}</small><small>${e.by ? `${A.seatChip(e.by, e.memory ? "memory" : A.data.seats[e.by]?.human ? "human" : "")} · ` : ""}<code>${e.at}</code> · ${e.when}</small></div></li>`).join("")}</ul>`).join("")
  }
})(window.Atlas)
