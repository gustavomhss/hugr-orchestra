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
    <div class="at-item-meta">${opts.noFile ? "" : A.file(x.file)}${x.slot ? `<span class="at-slot">${A.esc(x.slot)}</span>` : ""}${A.tier(x.tier)}${A.origin(x)}</div></div></div>`

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
        <div class="heading-actions">${A.btn("Open knowledge", "go", { value: "#/knowledge", icon: "stack" })}${A.btn(`Curate ${A.num(M().curationCount())}`, "go", { value: "#/curation", icon: "inbox", primary: true })}</div></div>
      ${building ? `<div class="at-building"><span class="spin"></span><div><strong>Building the structural index for ${R().head}</strong><small>Hashing every unit and loading index.scip. Counts appear when it finishes; nothing is estimated.</small></div></div>` : ""}
      <div class="at-strip">${A.icon("branch")}<code>atlas</code><span class="divider"></span>Index built at <code>${R().builtAt}</code><span class="at-pill warm" data-tip="The code moved since the index was built. Facts on changed files show as drifted.">${A.icon("drift")}code now at ${R().head}</span><span class="divider"></span>
        <span data-tip="Facts and the content store live in .atlas/ and are not versioned by git; memory and the write policy are.">${A.icon("server")} Knowledge store local to this machine</span><span class="push">Generation ${R().gen} · ${A.num(R().casObjects)} objects</span></div>
      <div class="at-stats">
        <a class="at-stat" href="#/knowledge"><span class="at-stat-label">Knowledge${A.icon("arrow")}</span>${v(A.num(s.facts))}<span class="at-stat-foot"><span><b>${s.governing}</b> governing</span><span><b>${A.num(s.advisory)}</b> advisory</span><span>on <b>${A.num(s.files)}</b> files</span></span></a>
        <a class="at-stat" href="#/knowledge?state=drifted"><span class="at-stat-label">Freshness${A.icon("arrow")}</span>${v(`${pct(s.fresh, s.facts)}%<small>fresh</small>`)}${A.bar([["good", s.fresh], ["warm", s.drifted]])}<span class="at-stat-foot"><span><b>${A.num(s.fresh)}</b> fresh</span><span><b>${s.drifted}</b> drifted</span></span></a>
        <a class="at-stat ${M().curationCount() ? "attn" : ""}" href="#/curation"><span class="at-stat-label">Curation${A.icon("arrow")}</span>${v(A.num(M().curationCount()))}<span class="at-stat-foot"><span><b>${s.drifted}</b> drifted</span><span><b>${s.candidates}</b> candidates</span><span><b>${M().live().filter((x) => x.proposedTier).length}</b> to ratify</span></span></a>
        <a class="at-stat" href="#/memory/backend"><span class="at-stat-label">Memory${A.icon("arrow")}</span>${v(`${A.memoryStats("backend").tasks}<small>tasks</small>`)}<span class="at-stat-foot"><span><b>${A.memoryStats("backend").invocations}</b> invocations</span><span><b>${A.projectMemory("backend").used}</b> project-memory tokens</span></span></a>
      </div>
      ${s.governing ? "" : `<div class="at-callout">${A.icon("info")}<div><strong>The governing band is empty.</strong> Every fact in this store is advisory: an observation mined by genesis that agents receive as a hint, apart from rules. Ratify the ones that should govern how agents work here.</div>${A.btn("Choose facts to ratify", "go", { value: "#/curation?tab=ratify" })}</div>`}
      <div class="at-cols">
        <section class="at-panel"><header class="at-panel-head"><h3>Units</h3><a class="mx-link" href="#/knowledge">All units</a></header>
          <table class="at-grid-table"><thead><tr><th>Unit</th><th class="num">Facts</th><th>Freshness</th><th class="num">Depend on it</th></tr></thead><tbody>
          ${areas.slice(0, 10).map((a) => `<tr data-action="go" data-value="#/unit/${encodeURIComponent(a.id)}" tabindex="0"><td><code class="at-mono">${A.esc(a.id)}</code></td><td class="num">${a.facts}</td><td>${A.bar([["good", a.facts - a.drifted], ["warm", a.drifted]], "slim")}</td><td class="num">${M().dependents(a.id).length || "—"}</td></tr>`).join("")}
          </tbody></table>${areas.length > 10 ? `<div class="at-more"><span>${areas.length - 10} more units</span><a class="mx-link" href="#/knowledge">See all units</a></div>` : ""}</section>
        <div>
          <section class="at-panel"><header class="at-panel-head"><h3>Waiting for a decision</h3><a class="mx-link" href="#/curation">Curation</a></header>
            <div class="at-attn" data-action="go" data-value="#/curation?tab=drift" tabindex="0"><span class="at-tl-dot warm">${A.icon("drift")}</span><div><strong>${s.drifted} facts drifted</strong><small>Their files changed since ${R().builtAt}. Check whether each claim still holds.</small></div>${A.icon("arrow")}</div>
            <div class="at-attn" data-action="go" data-value="#/curation?tab=candidates" tabindex="0"><span class="at-tl-dot blue">${A.icon("sparkle")}</span><div><strong>${s.candidates} candidates in staging</strong><small>Mined, never promoted. Agents don't see them until they are.</small></div>${A.icon("arrow")}</div>
            ${(() => { const n = M().live().filter((x) => x.proposedTier).length; return `<div class="at-attn" data-action="go" data-value="#/curation?tab=ratify" tabindex="0"><span class="at-tl-dot ${n ? "warm" : ""}">${A.icon("shield")}</span><div><strong>${n ? `${n} proposed for the governing band` : "Nothing to ratify"}</strong><small>${n ? "Reviewers asked to make these rules agents follow." : "No fact has been proposed for the governing band."}</small></div>${A.icon("arrow")}</div>` })()}
          </section>
          <section class="at-panel"><header class="at-panel-head"><h3>Code changes that drifted knowledge</h3><a class="mx-link" href="#/history">History</a></header>
            ${changes.map((c) => `<div class="at-attn" data-action="go" data-value="#/curation?tab=drift&commit=${c.sha}" tabindex="0"><code class="at-sha">${A.esc(c.sha)}</code><div><strong>${A.esc(c.subject)}</strong><small>drifted ${plural(c.facts.length, "fact")}</small></div>${A.icon("arrow")}</div>`).join("")}
          </section>
        </div>
      </div></div>`,
    }
  }

  const unitHref = (path) => `#/unit/${encodeURIComponent(path)}`
  const kpi = (label, value, foot, tone = "") => `<div class="at-kpi ${tone}"><span>${label}</span><b>${value}</b><small>${foot}</small></div>`
  const acc = (id, glyph, title, purpose, summary, body, open = false) =>
    `<details class="at-acc" data-acc="${id}" ${open ? "open" : ""}><summary><span class="at-acc-ic">${A.icon(glyph)}</span><span class="at-acc-t"><strong>${title}</strong><small>${purpose}</small></span><span class="at-acc-sum">${summary}</span>${A.icon("chev", "at-acc-chev")}</summary><div class="at-acc-body">${body}</div></details>`
  const typeOf = (x) => (x.slot ? M().SLOT_GROUPS.find((g) => g[2].includes(x.slot))?.[0] : "Unclassified")

  /* ---------- Knowledge: the Own units ---------- */
  A.views.knowledge = (state) => {
    const q = state.query
    const text = (q.q ?? "").trim().toLowerCase()
    const units = M().units()
    const s = M().stats()
    const typed = M().live().filter((x) => x.slot).length
    const driftUnits = units.filter((u) => u.drifted).length
    const row = (u) => `<a class="at-unit" href="${unitHref(u.id)}"><span class="at-acc-ic">${A.icon(u.group === "code" ? "stack" : u.group === "docs" ? "fact" : u.group === "harness" ? "settings" : "folder")}</span>
      <span class="at-unit-main"><code>${A.esc(u.id)}</code><small>${u.level} · ${(() => { const t = M().territoryOf(u.id); return t ? `${A.esc(t.name)} · ${A.esc(({ backend: "Backend", archie: "Archie", jimmy: "Jimmy", lucy: "Lucy", rosie: "Rosie", billy: "Billy" })[t.owner] ?? t.owner)} · ${t.tier}` : "no territory" })()} · ${A.num(u.files.size)} ${u.files.size === 1 ? "file" : "files"}</small></span>
      <span class="at-unit-cell">${A.num(u.facts)}<small>facts</small></span>
      <span class="at-unit-cell">${u.drifted ? `<span class="at-state warm">${A.icon("drift")}${u.drifted}</span>` : `<span class="at-state good">${A.icon("checkc")}</span>`}<small>drifted</small></span>
      <span class="at-unit-cell">${M().dependents(u.id).length || "—"}<small>depend on it</small></span>${A.icon("arrow")}</a>`
    const groups = [["code", "Code", "Packages: the modules agents work inside", true], ["docs", "Docs", "Specifications, ADRs and reference pages", false], ["harness", "Harness", "CI gates and probes", false], ["root", "Repository root", "Top-level files", false]]
    const results = text ? M().live().filter((x) => `${x.claim} ${x.file}`.toLowerCase().includes(text)) : []
    return {
      crumbs: [["Atlas", "#/overview"], ["Knowledge"]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Knowledge</div><h1>Knowledge</h1><p>What agents know, unit by unit. A unit's page is exactly what an agent receives when its work enters that unit.</p></div></div>
      <div class="at-kpis">
        ${kpi("Units", units.length, M().territories().length ? `in ${M().territories().length} territories` : "no territories declared")}
        ${kpi("Facts", A.num(s.facts), `${s.governing} governing · ${A.num(s.advisory)} advisory`)}
        ${kpi("Drifted", s.drifted, `across ${driftUnits} units`, s.drifted ? "warn" : "")}
        ${kpi("Typed", `${typed}<small> / ${A.num(s.facts)}</small>`, typed ? "classified by slot" : "mined before slots existed")}</div>
      <div class="at-toolbar"><label class="at-search wide">${A.icon("search")}<input id="list-search" placeholder="Search every fact by claim or file" value="${A.esc(q.q ?? "")}" aria-label="Search facts"><kbd>/</kbd></label></div>
      ${text ? `<section class="at-panel"><header class="at-panel-head"><h3>${A.num(results.length)} facts match</h3>${A.btn("Clear", "go", { value: "#/knowledge" })}</header>${results.slice(0, 50).map((x) => factRow(x, state, { unit: true })).join("") || '<div class="at-band-empty">Nothing matches.</div>'}${results.length > 50 ? `<div class="at-more"><span>Showing 50 of ${results.length}</span><span>Narrow the search</span></div>` : ""}</section>`
        : groups.map(([g, title, purpose, open]) => {
          const list = units.filter((u) => u.group === g)
          return list.length ? acc(`units-${g}`, g === "code" ? "stack" : g === "docs" ? "fact" : g === "harness" ? "settings" : "folder", title, purpose, `${list.length} ${list.length === 1 ? "unit" : "units"} · ${A.num(list.reduce((n, u) => n + u.facts, 0))} facts`, list.map(row).join(""), open) : ""
        }).join("")}
      </div>`,
    }
  }

  /* ---------- A unit: its pack, its facts by type, its neighbours ---------- */
  A.views.unit = (state) => {
    const path = state.params[0] || "packages/knowledge"
    const q = state.query
    const node = M().findNode(path === "(root)" ? "" : path)
    const isUnit = M().units().some((u) => u.id === path)
    const unitId = M().unitOf(`${path}/x`) === path ? path : M().unitOf(path)
    const b = path === "(root)" ? { ...M().briefing(""), here: M().live().filter((x) => M().unitOf(x.file) === "(root)") } : M().briefing(path)
    const here = b.here
    const fresh = here.filter((x) => M().state(x) === "fresh").length
    const fitTokens = b.used
    const type = q.type ?? ""
    const file = q.file ?? ""
    const href = (patch) => `${unitHref(path)}?${new URLSearchParams(Object.fromEntries(Object.entries({ type, file, ...patch }).filter(([, v]) => v)))}`
    const files = [...new Set(here.map((x) => x.file))].sort()
    const scoped = here.filter((x) => !file || x.file === file)
    const groupCounts = [...M().SLOT_GROUPS.map(([g]) => [g, scoped.filter((x) => typeOf(x) === g).length]), ["Unclassified", scoped.filter((x) => !x.slot).length]]
    const shown = scoped.filter((x) => !type || typeOf(x) === type)
    const bySlot = (list) => {
      const typedGroups = M().SLOT_GROUPS.map(([g, meaning, slots]) => {
        const inGroup = list.filter((x) => slots.includes(x.slot))
        return inGroup.length ? `<div class="at-type-head"><strong>${g}</strong><small>${meaning}</small></div>${slots.map((sl) => { const xs = inGroup.filter((x) => x.slot === sl); return xs.length ? `<div class="at-slot-head"><code>${sl}</code><small>${A.esc(M().SLOT_MEANING[sl])}</small><span class="wf-count">${xs.length}</span></div>${xs.map((x) => factRow(x, state, { noFile: false })).join("")}` : "" }).join("")}` : ""
      }).join("")
      const un = list.filter((x) => !x.slot)
      return typedGroups + (un.length ? `<div class="at-type-head"><strong>Unclassified</strong><small>no slot yet · open a fact and choose Classify</small><span class="wf-count">${un.length}</span></div>${un.slice(0, Number(q.n ?? 40)).map((x) => factRow(x, state)).join("")}${un.length > Number(q.n ?? 40) ? `<div class="at-more"><span>Showing ${q.n ?? 40} of ${un.length}</span>${A.btn("Show 40 more", "go", { value: href({ n: Number(q.n ?? 40) + 40 }) })}</div>` : ""}` : "")
    }
    const typesBody = `<div class="at-acc-tools wrap"><div class="at-typechips">${[["", scoped.length], ...groupCounts].map(([g, n]) => `<button class="at-typechip ${type === g ? "on" : ""} ${n ? "" : "zero"}" data-action="go" data-value="${href({ type: g })}" ${n || g === "" ? "" : "disabled"}>${g || "All"}<span>${n}</span></button>`).join("")}</div>
        ${files.length > 1 ? `<label class="at-select">${A.icon("fact")}<select data-nav="file" aria-label="File"><option value="">All ${files.length} files</option>${files.map((f) => `<option value="${A.esc(f)}" ${file === f ? "selected" : ""}>${A.esc(f.slice(path.length + 1) || f)}</option>`).join("")}</select></label>` : ""}</div>
      ${shown.length ? bySlot(shown) : '<div class="at-band-empty">No facts of this type here.</div>'}`
    const packBody = `<p class="at-stew-intro">What <code class="at-mono">own_${A.esc(path.split("/").at(-1))}</code> hands an agent: built from the index alone, no model involved. Governing facts come first; advisory ones fill what is left; the rest is named so the agent can pull it.</p>
      <section class="at-band gov"><header class="at-band-head">${A.icon("shield")}<h3>Governing</h3><small>ratified T0–T1</small></header>${b.gov.length ? b.gov.map((x) => factRow(x, state)).join("") : `<div class="at-band-empty">No ratified facts here yet.</div>`}</section>
      <section class="at-band adv"><header class="at-band-head">${A.icon("sparkle")}<h3>Advisory</h3><small>${b.adv.length} facts · ${fitTokens} tokens</small></header>${b.adv.length ? b.adv.map((x) => factRow(x, state)).join("") : `<div class="at-band-empty">No advisory facts.</div>`}</section>
      ${b.pull.length ? `<details class="at-sub-acc" data-acc="pull-${path}"><summary>${A.icon("chev")}<span>Did not fit · named for the agent to pull</span><span class="wf-count">${b.pull.length}</span></summary>${b.pull.map((x) => factRow(x, state)).join("")}</details>` : ""}`
    const depsAll = M().dependents(path === "(root)" ? "" : path)
    const depUnits = [...new Set(depsAll.map((f) => M().unitOf(f)))]
    const depsBody = depsAll.length ? depUnits.map((u) => `<div class="at-type-head"><a class="mx-link" href="${unitHref(u)}"><strong><code>${A.esc(u)}</code></strong></a><span class="wf-count">${depsAll.filter((f) => M().unitOf(f) === u).length}</span></div>${depsAll.filter((f) => M().unitOf(f) === u).slice(0, 6).map((f) => `<a class="at-linkrow" href="${unitHref(f)}">${A.icon("code")}${A.file(f)}</a>`).join("")}`).join("") : `<div class="at-band-empty">Nothing outside imports it.</div>`
    const finer = node ? [...node.children.values()].sort((x, y) => y.facts - x.facts) : []
    const finerBody = finer.length ? finer.map((c) => `<a class="at-linkrow" href="${unitHref(c.path)}">${A.icon(c.file ? "fact" : "folder")}<code class="at-mono">${A.esc(c.name)}</code><span class="grow"></span>${c.drifted ? `<span class="at-state warm">${A.icon("drift")}${c.drifted}</span>` : ""}<small>${c.facts} facts</small></a>`).join("") : `<div class="at-band-empty">Nothing finer: this is a single file.</div>`
    const segs = path.split("/")
    const crumbs = [["Atlas", "#/overview"], ["Knowledge", "#/knowledge"], ...(isUnit ? [[path, null, true]] : [[unitId, unitHref(unitId), true], [path.slice(unitId.length + 1), null, true]])]
    return {
      crumbs,
      html: `<div class="at-page narrow">
      <div class="at-agent-head"><span class="at-avatar unit">${A.icon(node?.file ? "fact" : "stack")}</span><div><div class="mx-eyebrow">${isUnit ? `Own unit · ${M().units().find((u) => u.id === path)?.level}` : `inside <a class="mx-link" href="${unitHref(unitId)}">${A.esc(unitId)}</a>`}</div><h1 class="mono">${A.esc(isUnit ? path : segs.slice(-2).join("/"))}</h1><p>${(() => { const t = M().territoryOf(unitId); return t ? `<span class="at-terr">${A.icon("territory")}${A.esc(t.name)}</span> · owned by ${A.agent(t.owner)} · ${A.tier(t.tier)}` : "No territory · no owner · tier T2" })()}</p></div><span class="grow"></span>
        ${M().territoryOf(unitId) ? "" : A.btn("Declare territory", "territory", { value: path, icon: "territory" })}${A.btn("Mine here", "go", { value: `#/curation?tab=mine&scope=${encodeURIComponent(path)}`, icon: "sparkle" })}</div>
      <div class="at-kpis">
        ${kpi("Facts", here.length, `${b.gov.length} governing · ${here.length - b.gov.length} advisory`)}
        ${kpi("Fresh", `${here.length ? Math.round((fresh / here.length) * 100) : 0}%`, `${here.length - fresh} drifted`, here.length - fresh ? "warn" : "")}
        ${kpi("In the pack", b.gov.length + b.adv.length, `${fitTokens} tokens · ${b.pull.length} named to pull`)}
        ${kpi("Depend on it", depsAll.length, depUnits.length ? `files in ${depUnits.length} ${depUnits.length === 1 ? "unit" : "units"}` : "nothing outside")}</div>
      ${acc(`unit-pack`, "stack", "What an agent receives", "The pack served when work enters this unit", `${b.gov.length + b.adv.length} facts · ${fitTokens} tokens`, packBody, true)}
      ${acc(`unit-types`, "fact", "Facts by type", "Every fact here, grouped by the kind of claim it makes", `${here.length} facts`, typesBody, true)}
      ${acc(`unit-deps`, "relations", "Depends on this", "Files outside that import it: what to re-check when it changes", `${depsAll.length} files`, depsBody)}
      ${acc(`unit-finer`, "folder", "Inside", "Finer scopes, down to single files", `${finer.length}`, finerBody)}
      </div>`,
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
      <div class="ins-section"><h4>Type</h4>${x.slot ? `<div class="at-typeline"><code>${A.esc(x.slot)}</code><span>${A.esc(M().SLOT_MEANING[x.slot])}</span>${A.btn("Change", "classify", { value: x.key })}</div>` : `<div class="at-typeline"><span class="at-state">${A.icon("minusc")}Unclassified</span><span>Mined before genesis assigned slots.</span>${A.btn("Classify…", "classify", { value: x.key, primary: true })}</div>`}</div>
      <div class="ins-section"><h4>Unit</h4><a class="at-fileline" href="#/unit/${encodeURIComponent(M().unitOf(x.file))}">${A.icon("stack")}<code class="at-mono">${A.esc(M().unitOf(x.file))}</code><span class="grow"></span>${A.icon("arrow")}</a></div>
      <div class="ins-section"><h4>Anchor</h4><a class="at-fileline" href="#/unit/${encodeURIComponent(x.file)}">${A.icon("fact")}${A.file(x.file)}${A.icon("arrow")}</a>
        <p class="mx-note">Anchored to the <b>whole file</b> by the hash of its bytes (<code>${A.esc(x.subtree)}…</code>). Genesis ran on file-level sites; symbol-level anchors would drift only when that symbol changes.</p></div>
      ${why ? `<div class="ins-section"><h4>How it was derived<button class="mx-link" data-action="toggle-why">${full ? "Show less" : "Read all"}</button></h4>
        <div class="at-reasoning ${full ? "" : "short"}">${A.esc(full ? why : why.slice(0, 640))}${full || why.length <= 640 ? "" : "…"}</div><p class="mx-note">The miner's own reasoning, stored next to the fact and scanned for secrets. Agents never receive it.</p></div>` : ""}
      <div class="ins-section"><h4>Provenance</h4><ul class="at-timeline">
        <li><span class="at-tl-dot blue">${A.icon("sparkle")}</span><div class="at-tl-body"><strong>Mined by genesis</strong><small>advisory arm · file site · obviousness scored “${A.esc(x.obvious ?? "—")}”</small></div></li>
        ${!(x.kind === "candidate" && !x.promotedNow) ? `<li><span class="at-tl-dot good">${A.icon("check")}</span><div class="at-tl-body"><strong>Promoted by ${A.agent("seat:orchestrator")}</strong><small>through the emit door · scope <code>${A.esc(x.scope)}</code> · derived at <code>${A.esc(x.derivedAt)}</code></small></div></li>
        ${x.tier === "T0" ? `<li><span class="at-tl-dot good">${A.icon("shield")}</span><div class="at-tl-body"><strong>Ratified as T0 by ${A.agent("you")}</strong><small>security input from ${A.agent("billy")} · part of every agent's constitution</small></div></li>` : x.tier === "T1" ? `<li><span class="at-tl-dot good">${A.icon("shield")}</span><div class="at-tl-body"><strong>Ratified as T1 by ${A.agent("maestro")}</strong><small>moved to the governing band</small></div></li>` : x.proposedTier ? `<li><span class="at-tl-dot warm">${A.icon("clock")}</span><div class="at-tl-body"><strong>Proposed for ${x.proposedTier} by ${A.agent(x.proposedBy)}</strong><small>waiting in Curation › Ratify</small></div></li>` : `<li><span class="at-tl-dot">${A.icon("shield")}</span><div class="at-tl-body"><strong>Not ratified</strong><small>Stays in the advisory band until a ratifier moves it to T1 (or a person to T0).</small></div></li>`}` : `<li><span class="at-tl-dot">${A.icon("clock")}</span><div class="at-tl-body"><strong>In staging</strong><small>generation ${R().stagingGen}</small></div></li>`}
      </ul></div>
      <div class="ins-section"><h4>Depends on this file<span class="ins-count">${depCount}</span></h4>${deps.slice(0, 6).map((p) => `<a class="at-linkrow" href="#/unit/${encodeURIComponent(p)}">${A.icon("code")}${A.file(p)}</a>`).join("") || '<p class="mx-note">Nothing imports this file.</p>'}${depCount > 6 ? `<a class="mx-link" href="#/unit/${encodeURIComponent(x.file)}">All ${depCount}</a>` : ""}</div>
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
