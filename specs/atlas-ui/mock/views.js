// Screens, one per part of the Atlas: Overview, Map (spatial index + scope briefing), Knowledge (facts),
// Curation (the write lifecycle), Memory (per member), History (versions), Settings (governance + storage).
;(function (A) {
  const M = () => A.m
  const R = () => A.m.R
  const plural = (n, one, many = `${one}s`) => `${A.num(n)} ${n === 1 ? one : many}`
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
  const qs = (q) => (Object.keys(q).length ? `?${new URLSearchParams(q)}` : "")
  const clean = (q) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== ""))
  A.views = {}

  const factRow = (x, state, opts = {}) => `<div class="at-item ${M().governing(x) ? "" : "suggestion"} ${state.query.fact === x.key ? "selected" : ""}" data-action="open" data-value="${x.key}" tabindex="0" role="button">
    ${A.chip((x.kind === "candidate" && !x.promotedNow) ? "pending" : M().state(x))}
    <div class="at-item-main"><div class="at-item-text clamp">${A.esc(x.claim)}</div>
    <div class="at-item-meta">${opts.noFile ? "" : A.file(x.file)}${A.tier(x.tier)}${A.origin(x)}</div></div></div>`

  const more = (total, shown, href) => (total > shown ? `<div class="at-more"><span>Showing ${A.num(shown)} of ${A.num(total)}</span>${A.btn(`Show ${Math.min(50, total - shown)} more`, "go", { value: href })}</div>` : "")

  /* ---------- Overview ---------- */
  A.views.overview = (state) => {
    const s = M().stats()
    const areas = M().areas()
    const changes = M().codeChanges().slice(0, 4)
    const building = state.preview === "building"
    const v = (n) => (building ? '<span class="at-skel" style="block-size:26px;inline-size:45%"></span>' : `<span class="at-stat-value">${n}</span>`)
    return {
      crumbs: [["Atlas"]],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · project atlas</div><h1>Knowledge &amp; memory</h1><p>What agents in this project know, where each piece came from, and what is waiting for a steward's decision.</p></div>
        <div class="heading-actions">${A.btn("Open map", "go", { value: "#/map", icon: "territory" })}${A.btn(`Curate ${A.num(M().curationCount())}`, "go", { value: "#/curation", icon: "inbox", primary: true })}</div></div>
      ${building ? `<div class="at-building"><span class="spin"></span><div><strong>Building the structural index for ${R().head}</strong><small>Hashing every unit and loading index.scip. Counts appear when it finishes; nothing is estimated.</small></div></div>` : ""}
      <div class="at-strip">${A.icon("branch")}<code>atlas</code><span class="divider"></span>Index built at <code>${R().builtAt}</code><span class="at-pill warm" data-tip="The code moved since the index was built. Facts on changed files show as drifted.">${A.icon("drift")}code now at ${R().head}</span><span class="divider"></span>
        <span data-tip="Facts and the content store live in .atlas/ and are not versioned by git; memory and the write policy are.">${A.icon("server")} Knowledge store local to this machine</span><span class="push">Generation ${R().gen} · ${A.num(R().casObjects)} objects</span></div>
      <div class="at-stats">
        <a class="at-stat" href="#/knowledge"><span class="at-stat-label">Knowledge${A.icon("arrow")}</span>${v(A.num(s.facts))}<span class="at-stat-foot"><span><b>${s.governing}</b> governing</span><span><b>${A.num(s.advisory)}</b> advisory</span><span>on <b>${A.num(s.files)}</b> files</span></span></a>
        <a class="at-stat" href="#/knowledge?state=drifted"><span class="at-stat-label">Freshness${A.icon("arrow")}</span>${v(`${pct(s.fresh, s.facts)}%<small>fresh</small>`)}${A.bar([["good", s.fresh], ["warm", s.drifted]])}<span class="at-stat-foot"><span><b>${A.num(s.fresh)}</b> fresh</span><span><b>${s.drifted}</b> drifted</span></span></a>
        <a class="at-stat ${M().curationCount() ? "attn" : ""}" href="#/curation"><span class="at-stat-label">Curation${A.icon("arrow")}</span>${v(A.num(M().curationCount()))}<span class="at-stat-foot"><span><b>${s.drifted}</b> drifted</span><span><b>${s.candidates}</b> candidates</span><span><b>0</b> to ratify</span></span></a>
        <a class="at-stat" href="#/memory/backend"><span class="at-stat-label">Memory${A.icon("arrow")}</span>${v("3<small>members</small>")}<span class="at-stat-foot"><span><b>1</b> task record</span><span><b>0</b> project rules</span></span></a>
      </div>
      <div class="at-callout">${A.icon("info")}<div><strong>The governing band is empty.</strong> Every fact in this store is advisory: an observation mined by genesis that agents receive as a hint, apart from rules. Ratify the ones that should govern how agents work here.</div>${A.btn("Choose facts to ratify", "go", { value: "#/curation?tab=ratify" })}</div>
      <div class="at-cols">
        <section class="at-panel"><header class="at-panel-head"><h3>Where knowledge lives</h3><a class="mx-link" href="#/map">Open map</a></header>
          <table class="at-grid-table"><thead><tr><th>Area</th><th class="num">Facts</th><th>Freshness</th><th class="num">Depend on it</th></tr></thead><tbody>
          ${areas.slice(0, 10).map((a) => `<tr data-action="go" data-value="#/map?path=${encodeURIComponent(a.id)}" tabindex="0"><td><code class="at-mono">${A.esc(a.id)}</code></td><td class="num">${a.facts}</td><td>${A.bar([["good", a.facts - a.drifted], ["warm", a.drifted]], "slim")}</td><td class="num">${M().dependents(a.id).length || "—"}</td></tr>`).join("")}
          </tbody></table>${areas.length > 10 ? `<div class="at-more"><span>${areas.length - 10} more areas</span><a class="mx-link" href="#/map">See all on the map</a></div>` : ""}</section>
        <div>
          <section class="at-panel"><header class="at-panel-head"><h3>Waiting for a decision</h3><a class="mx-link" href="#/curation">Curation</a></header>
            <div class="at-attn" data-action="go" data-value="#/curation?tab=drift" tabindex="0"><span class="at-tl-dot warm">${A.icon("drift")}</span><div><strong>${s.drifted} facts drifted</strong><small>Their files changed since ${R().builtAt}. Check whether each claim still holds.</small></div>${A.icon("arrow")}</div>
            <div class="at-attn" data-action="go" data-value="#/curation?tab=candidates" tabindex="0"><span class="at-tl-dot blue">${A.icon("sparkle")}</span><div><strong>${s.candidates} candidates in staging</strong><small>Mined, never promoted. Agents don't see them until they are.</small></div>${A.icon("arrow")}</div>
            <div class="at-attn" data-action="go" data-value="#/curation?tab=ratify" tabindex="0"><span class="at-tl-dot">${A.icon("shield")}</span><div><strong>Nothing to ratify</strong><small>No fact has been proposed for the governing band.</small></div>${A.icon("arrow")}</div>
          </section>
          <section class="at-panel"><header class="at-panel-head"><h3>Code changes that drifted knowledge</h3><a class="mx-link" href="#/history">History</a></header>
            ${changes.map((c) => `<div class="at-attn" data-action="go" data-value="#/curation?tab=drift&commit=${c.sha}" tabindex="0"><code class="at-sha">${A.esc(c.sha)}</code><div><strong>${A.esc(c.subject)}</strong><small>drifted ${plural(c.facts.length, "fact")}</small></div>${A.icon("arrow")}</div>`).join("")}
          </section>
        </div>
      </div></div>`,
    }
  }

  /* ---------- Map: the spatial index with the scope briefing ---------- */
  A.views.map = (state) => {
    const path = state.query.path ?? ""
    const node = M().findNode(path) ?? M().tree()
    const open = new Set(path.split("/").map((_, i, a) => a.slice(0, i + 1).join("/")))
    const treeRows = (n, depth) => [...n.children.values()].sort((a, b) => Number(a.file) - Number(b.file) || b.facts - a.facts || a.name.localeCompare(b.name)).map((c) => {
      const expanded = !c.file && open.has(c.path)
      return `<a class="at-tree-row ${c.path === path ? "selected" : ""}" style="--d:${depth}" href="#/map?path=${encodeURIComponent(c.path)}" ${c.path === path ? 'aria-current="page"' : ""}>
        <span class="tw">${c.file ? "" : A.icon("chev", expanded ? "" : "closed")}</span>${A.icon(c.file ? "fact" : "folder")}<span class="nm">${A.esc(c.name)}</span>
        ${c.drifted ? `<span class="wf-dot warm" title="${c.drifted} drifted"></span>` : ""}${c.candidates && !c.facts ? `<span class="cnt cand" title="candidates in staging">${c.candidates}</span>` : `<span class="cnt">${c.facts || ""}</span>`}</a>${expanded ? treeRows(c, depth + 1) : ""}`
    }).join("")
    const b = M().briefing(path)
    const tab = state.query.tab ?? "briefing"
    const n = Number(state.query.n ?? 50)
    const tabs = [["briefing", "Briefing", "stack"], ["facts", "Facts", "fact", b.here.length], ["deps", "Depends on this", "relations", b.depsTotal], ["inside", "Inside", "pin", b.finerTotal]]
    const href = (q) => `#/map${qs(clean({ path, ...q }))}`
    const body = {
      briefing: `<p class="at-lead">This is what an agent receives when its work enters <code class="at-mono">${A.esc(path || "atlas")}</code>: the <code class="at-mono">own</code> briefing, built from the index alone, no model involved.</p>
        <section class="at-band gov"><header class="at-band-head">${A.icon("shield")}<h3>Governing</h3><small>Ratified T0–T1 · drives behaviour</small></header>${b.gov.length ? b.gov.map((x) => factRow(x, state)).join("") : `<div class="at-band-empty">No ratified facts here. Agents get only the advisory band below.</div>`}</section>
        <section class="at-band adv"><header class="at-band-head">${A.icon("sparkle")}<h3>Advisory</h3><span class="grow"></span>${A.meter("Budget", b.used, b.cap)}</header>${b.adv.length ? b.adv.map((x) => factRow(x, state)).join("") : `<div class="at-band-empty">No advisory facts under this path.</div>`}</section>
        ${b.pull.length ? `<section class="at-band pull"><header class="at-band-head">${A.icon("download")}<h3>Did not fit</h3><small>${plural(b.pull.length, "fact")} named but not sent · an agent can pull them</small></header>${b.pull.slice(0, 5).map((x) => factRow(x, state)).join("")}${b.pull.length > 5 ? `<div class="at-more"><span>${b.pull.length - 5} more</span><a class="mx-link" href="${href({ tab: "facts" })}">See all facts here</a></div>` : ""}</section>` : ""}
        <div class="at-two">
          <section class="at-panel"><header class="at-panel-head"><h3>Depends on this</h3><small>${b.depsTotal ? `${b.deps.length} of ${b.depsTotal} sent` : "nothing outside imports it"}</small></header>${b.deps.map((p) => `<a class="at-linkrow" href="#/map?path=${encodeURIComponent(p)}">${A.icon("code")}${A.file(p)}</a>`).join("") || '<div class="at-band-empty">Empty — no import from outside this path.</div>'}</section>
          <section class="at-panel"><header class="at-panel-head"><h3>Go deeper</h3><small>${b.finerTotal ? `${b.finer.length} of ${b.finerTotal} sent` : "nothing below"}</small></header>${b.finer.map((c) => `<a class="at-linkrow" href="#/map?path=${encodeURIComponent(c.path)}">${A.icon(c.file ? "fact" : "folder")}<code class="at-mono">${A.esc(c.name)}</code><span class="grow"></span><small>${c.facts}</small></a>`).join("") || '<div class="at-band-empty">This is a file; there is nothing finer in the index.</div>'}</section>
        </div>`,
      facts: `<section class="at-panel">${b.here.slice(0, n).map((x) => factRow(x, state, { noFile: node.file })).join("") || '<div class="at-band-empty">No facts here.</div>'}${more(b.here.length, Math.min(n, b.here.length), href({ tab: "facts", n: n + 50 }))}</section>`,
      deps: `<section class="at-panel">${M().dependents(path).map((p) => `<a class="at-linkrow" href="#/map?path=${encodeURIComponent(p)}">${A.icon("code")}${A.file(p)}<span class="grow"></span><small>${M().live().filter((x) => x.file === p).length || ""}</small></a>`).join("") || '<div class="at-band-empty">Nothing outside this path imports it.</div>'}</section>`,
      inside: `<section class="at-panel">${[...node.children.values()].sort((a, b) => b.facts - a.facts).map((c) => `<a class="at-linkrow" href="#/map?path=${encodeURIComponent(c.path)}">${A.icon(c.file ? "fact" : "folder")}<code class="at-mono">${A.esc(c.name)}</code><span class="grow"></span>${c.drifted ? `<span class="at-state warm">${A.icon("drift")}${c.drifted}</span>` : ""}<small>${c.facts} facts</small></a>`).join("") || '<div class="at-band-empty">Nothing inside a file.</div>'}</section>`,
    }[tab]
    const segs = path ? path.split("/") : []
    return {
      crumbs: [["Atlas", "#/overview"], ["Map", path ? "#/map" : null], ...segs.map((s, i) => [s, i < segs.length - 1 ? `#/map?path=${encodeURIComponent(segs.slice(0, i + 1).join("/"))}` : null, true])],
      flush: true,
      html: `<div class="at-map"><nav class="at-tree-pane" aria-label="Code map"><div class="at-tree-head"><a href="#/map" class="${path ? "" : "selected"}">${A.icon("territory")}<strong>atlas</strong><small>${A.num(M().stats().facts)}</small></a></div>${treeRows(M().tree(), 0)}</nav>
      <div class="at-map-main"><div class="at-page">
        <div class="at-scope-top"><div><div class="mx-eyebrow">${node.file ? "File" : path ? "Folder" : "Repository"} · no territory declared</div><h1 class="mono">${A.esc(path || "atlas")}</h1>
          <div class="at-scope-facts"><span>${plural(b.here.length, "fact")}</span><span>${node.drifted ? `<span class="at-state warm">${A.icon("drift")}${node.drifted} drifted</span>` : `<span class="at-state good">${A.icon("checkc")}all fresh</span>`}</span>${node.candidates ? `<span><span class="at-state blue">${A.icon("clock")}${node.candidates} in staging</span></span>` : ""}<span>Owner <b data-tip="No territory covers this path, so nobody owns it yet.">—</b></span></div></div>
          <div class="heading-actions">${A.btn("Mine here", "go", { value: `#/curation?tab=mine&scope=${encodeURIComponent(path)}`, icon: "sparkle" })}${A.btn("Declare territory", "territory", { value: path, icon: "territory" })}</div></div>
        <div class="wf-tabs" role="tablist">${tabs.map(([id, label, glyph, count]) => `<button class="wf-tab" role="tab" aria-selected="${tab === id}" data-action="go" data-value="${href({ tab: id === "briefing" ? "" : id })}">${A.icon(glyph)}${label}${count !== undefined ? `<span class="wf-count">${A.num(count)}</span>` : ""}</button>`).join("")}</div>
        ${body}</div></div></div>`,
    }
  }

  /* ---------- Knowledge ---------- */
  A.views.knowledge = (state) => {
    const q = state.query
    const text = (q.q ?? "").toLowerCase()
    const n = Number(q.n ?? 50)
    const list = M().live()
      .filter((x) => !q.band || (q.band === "governing") === M().governing(x))
      .filter((x) => !q.state || M().state(x) === q.state)
      .filter((x) => !q.area || M().areaOf(x.file) === q.area)
      .filter((x) => !text || `${x.claim} ${x.file}`.toLowerCase().includes(text))
    const href = (patch) => `#/knowledge${qs(clean({ ...q, fact: undefined, n: undefined, ...patch }))}`
    const s = M().stats()
    const seg = (label, key, opts) => `<div class="wf-range" role="group" aria-label="${label}">${opts.map(([v, l, c]) => `<button aria-pressed="${(q[key] ?? "") === v}" data-action="go" data-value="${href({ [key]: v })}">${l}${c !== undefined ? `<span class="wf-count">${A.num(c)}</span>` : ""}</button>`).join("")}</div>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Knowledge"]],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Knowledge</div><h1>Facts</h1><p>Every fact in the store: a short claim anchored to code. Open one to see the code it points at, how it was derived, and what depends on it.</p></div></div>
      <div class="at-toolbar"><label class="at-search">${A.icon("search")}<input id="list-search" placeholder="Search claims and files" value="${A.esc(q.q ?? "")}" aria-label="Search facts"><kbd>/</kbd></label>
        ${seg("Band", "band", [["", "All bands"], ["governing", "Governing", s.governing], ["advisory", "Advisory", s.advisory]])}
        ${seg("State", "state", [["", "Any state"], ["fresh", "Fresh", s.fresh], ["drifted", "Drifted", s.drifted]])}
        <label class="at-select">${A.icon("territory")}<select aria-label="Area" data-nav="area">${[["", "All areas"], ...M().areas().map((a) => [a.id, `${a.id} (${a.facts})`])].map(([v, l]) => `<option value="${A.esc(v)}" ${(q.area ?? "") === v ? "selected" : ""}>${A.esc(l)}</option>`).join("")}</select></label></div>
      <div class="at-resultline"><span>${plural(list.length, "fact")}</span><span>All facts are advisory and mined today; families, tiers and origins appear on each row as they diversify.</span></div>
      <section class="at-panel">${list.slice(0, n).map((x) => factRow(x, state)).join("") || A.empty("No facts match", "Clear a filter or search for something else.", A.btn("Clear filters", "go", { value: "#/knowledge" }))}${more(list.length, Math.min(n, list.length), href({ n: n + 50 }))}</section></div>`,
    }
  }

  /* ---------- Fact details (panel and page) ---------- */
  A.views.detail = (key, state, page = false) => {
    const x = M().byKey[key]
    if (!x) return ""
    const st = (x.kind === "candidate" && !x.promotedNow) ? "pending" : M().state(x)
    const why = x.why && R().reasoning[x.why]
    const same = M().live().filter((y) => y.file === x.file && y.key !== x.key)
    const deps = R().dependents[x.file] ?? []
    const depCount = R().dependentCount[x.file] ?? 0
    const full = state.query.why === "all"
    const order = state.list ?? []
    const index = order.indexOf(key)
    const hunk = (h) => `<div class="at-code"><div class="at-code-head"><span>${A.esc(x.file)} · @@ ${A.esc(h.at)} @@</span></div><pre>${h.lines.map((l) => `<div class="ln ${l[0] === "+" ? "add" : l[0] === "-" ? "del" : ""}"><span></span><span>${A.esc(l.slice(1))}</span></div>`).join("")}</pre></div>`
    const body = `
      <div class="ins-states">${(x.kind === "candidate" && !x.promotedNow) ? `<span class="at-kind dash">${A.icon("clock")}Candidate</span>` : A.band(x)}${A.chip(st)}${A.tier(x.tier)}${A.family(x.family)}${A.origin(x)}</div>
      <p class="ins-claim">${A.esc(x.claim)}</p>
      ${st === "drifted" ? `<div class="ins-note warm"><b>The file changed in ${plural(x.drift.commits.length, "commit")} since ${x.derivedAt}</b> (${A.esc(x.drift.stat)}). The anchor is the whole file, so any edit drifts this fact; the claim may well still hold. Read the change, then decide.</div>
        <div class="ins-section"><h4>What changed</h4>${x.drift.commits.map(([sha, subj]) => `<div class="at-commit"><code class="at-sha">${A.esc(sha)}</code><span>${A.esc(subj)}</span></div>`).join("")}<div style="block-size:8px"></div>${x.drift.hunks.map(hunk).join("")}</div>` : ""}
      ${st === "pending" ? `<div class="ins-note blue">Mined by genesis and waiting in staging. Agents never see it until it is promoted, which runs it through the same gates as any write.</div>` : ""}
      <div class="ins-section"><h4>Anchor</h4><a class="at-fileline" href="#/map?path=${encodeURIComponent(x.file)}">${A.icon("fact")}${A.file(x.file)}${A.icon("arrow")}</a>
        <p class="mx-note">Anchored to the <b>whole file</b> by the hash of its bytes (<code>${A.esc(x.subtree)}…</code>). Genesis ran on file-level sites; symbol-level anchors would drift only when that symbol changes.</p></div>
      ${why ? `<div class="ins-section"><h4>How it was derived<button class="mx-link" data-action="toggle-why">${full ? "Show less" : "Read all"}</button></h4>
        <div class="at-reasoning ${full ? "" : "short"}">${A.esc(full ? why : why.slice(0, 640))}${full || why.length <= 640 ? "" : "…"}</div><p class="mx-note">The miner's own reasoning, stored next to the fact and scanned for secrets. Agents never receive it.</p></div>` : ""}
      <div class="ins-section"><h4>Provenance</h4><ul class="at-timeline">
        <li><span class="at-tl-dot blue">${A.icon("sparkle")}</span><div class="at-tl-body"><strong>Mined by genesis</strong><small>advisory arm · file site · obviousness scored “${A.esc(x.obvious ?? "—")}”</small></div></li>
        ${!(x.kind === "candidate" && !x.promotedNow) ? `<li><span class="at-tl-dot good">${A.icon("check")}</span><div class="at-tl-body"><strong>Promoted by ${A.agent("seat:orchestrator")}</strong><small>through the emit door · scope <code>${A.esc(x.scope)}</code> · derived at <code>${A.esc(x.derivedAt)}</code></small></div></li>
        <li><span class="at-tl-dot">${A.icon("shield")}</span><div class="at-tl-body"><strong>Not ratified</strong><small>Stays in the advisory band until a ratifier moves it to T1 (or a person to T0).</small></div></li>` : `<li><span class="at-tl-dot">${A.icon("clock")}</span><div class="at-tl-body"><strong>In staging</strong><small>generation ${R().stagingGen}</small></div></li>`}
      </ul></div>
      <div class="ins-section"><h4>Depends on this file<span class="ins-count">${depCount}</span></h4>${deps.slice(0, 6).map((p) => `<a class="at-linkrow" href="#/map?path=${encodeURIComponent(p)}">${A.icon("code")}${A.file(p)}</a>`).join("") || '<p class="mx-note">Nothing imports this file.</p>'}${depCount > 6 ? `<a class="mx-link" href="#/map?path=${encodeURIComponent(x.file)}&tab=deps">All ${depCount}</a>` : ""}</div>
      ${same.length ? `<div class="ins-section"><h4>Other facts on this file<span class="ins-count">${same.length}</span></h4>${same.slice(0, 4).map((y) => `<div class="ins-rel" data-action="open" data-value="${y.key}" tabindex="0">${A.chip(M().state(y))}<span class="ins-rel-claim">${A.esc(y.claim)}</span></div>`).join("")}</div>` : ""}
      <div class="ins-section"><h4>Same fact elsewhere</h4><p class="mx-note">No equivalent linked. Linking two facts as the same keeps both and answers them as one; retracting later appends, it never deletes.</p>${A.btn("Link as same fact…", "toast", { value: "Pick the other fact; the link goes through atlas-link with your identity.", icon: "link" })}</div>
      <details class="ins-tech"><summary>${A.icon("chev")}Technical details</summary><dl class="at-kv">
        <dt>nodeKey</dt><dd><code>${A.esc(x.key)}</code></dd><dt>contentHash</dt><dd><code>${A.esc(x.hash)}</code></dd>
        <dt>Anchor hash</dt><dd><code>${A.esc(x.subtree)}…</code></dd><dt>Scope string</dt><dd><code>${A.esc(x.scope)}</code> — writable by ${R().policy[x.scope].map(A.esc).join(", ")}</dd>
        <dt>Generation</dt><dd>${!(x.kind === "candidate" && !x.promotedNow) ? `projection ${R().gen}` : `staging ${R().stagingGen}`}</dd>${x.why ? `<dt>Reasoning</dt><dd><code>answerRef ${A.esc(x.why)}…</code></dd>` : ""}</dl></details>`
    if (page) return body
    const actions = (x.kind === "candidate" && !x.promotedNow)
      ? `${A.btn("Leave in staging", "close")}${A.btn("Promote", "promote", { value: x.key, primary: true })}`
      : st === "drifted" ? `${A.btn("Retire", "retire", { value: x.key })}${A.btn("Edit claim", "edit", { value: x.key })}${A.btn("Still holds", "reground", { value: x.key, primary: true })}`
      : `${A.btn("Retire", "retire", { value: x.key })}${A.btn("Ratify as T1", "ratify", { value: x.key, primary: true })}`
    return `<header class="ins-head"><span class="ins-kind">${A.icon("fact")}<span>${A.esc(M().areaOf(x.file))}</span></span>
      ${A.btn("", "step", { icon: "up", value: "-1", label: "Previous (k)", tip: "Previous (k)", disabled: index <= 0 })}${A.btn("", "step", { icon: "down", value: "1", label: "Next (j)", tip: "Next (j)", disabled: index < 0 || index >= order.length - 1 })}
      ${A.btn("", "go", { icon: "expand", value: `#/fact/${x.key}`, label: "Open as page", tip: "Open as page" })}${A.btn("", "close", { icon: "close", label: "Close (Esc)", tip: "Close (Esc)" })}</header>
      <div class="ins-body">${body}</div><footer class="ins-foot">${A.btn("", "copy-link", { icon: "link", value: x.key, label: "Copy link", tip: "Copy link" })}<span class="grow"></span>${actions}</footer>`
  }

  A.views.fact = (state) => {
    const x = M().byKey[state.params[0]]
    if (!x) return { crumbs: [["Atlas", "#/overview"], ["Fact"]], html: `<div class="at-page narrow">${A.empty("No fact with this key", "It may have been retired or never promoted.", A.btn("Back to facts", "go", { value: "#/knowledge" }))}</div>` }
    return {
      crumbs: [["Atlas", "#/overview"], ["Knowledge", "#/knowledge"], [x.file.split("/").at(-1), null, true]],
      html: `<div class="at-page narrow"><div class="mx-heading"><div><div class="mx-eyebrow">${A.esc(M().areaOf(x.file))}</div></div><div class="heading-actions">${A.btn("Back", "back", { icon: "back" })}${A.btn("Copy link", "copy-link", { icon: "link", value: x.key })}</div></div><div class="at-pagecard">${A.views.detail(x.key, state, true)}</div></div>`,
    }
  }
})(window.Atlas)
