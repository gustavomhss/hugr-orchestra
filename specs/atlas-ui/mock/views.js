// Screens. Atlas has three places: Overview, Knowledge and Review. Item details open beside any list.
// Agent memory lives in Agents; citations live in Chat.
;(function (A) {
  const D = () => A.data
  const live = () => D().items.filter((x) => !x.removed)
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  A.views = {}

  const itemRow = (x, state) => `<div class="at-item ${x.kind} ${state.query.item === x.id ? "selected" : ""}" data-action="open" data-value="${x.id}" tabindex="0" role="button">
    ${A.kind(x)}<div class="at-item-main"><div class="at-item-text">${A.esc(x.text)}</div>
    <div class="at-item-meta">${A.where(x)}<span>${x.confirmedBy ? `${A.esc(D().agents[x.by].name)} · confirmed by ${A.esc(D().agents[x.confirmedBy].name)}` : `suggested by ${A.esc(D().agents[x.by].name)}`}</span><span>${A.esc(x.when)}</span></div></div>
    ${A.status(x.status)}</div>`

  /* ---------- Overview ---------- */
  A.views.overview = (state) => {
    const s = D().stats(live())
    const r = D().review()
    const need = D().reviewCount()
    const building = state.preview === "building"
    const attention = [
      ...r.broken.map((x) => ({ tone: "bad", glyph: "xc", title: x.text, sub: x.why, href: `#/review?tab=broken&focus=${x.id}`, cta: "Review" })),
      r.confirm.length && { tone: "warm", glyph: "lock", title: `${plural(r.confirm.length, "critical rule")} ${r.confirm.length === 1 ? "needs" : "need"} your confirmation`, sub: "Only a person can confirm critical rules.", href: "#/review?tab=confirm", cta: "Review" },
      r.suggestions.length && { tone: "blue", glyph: "sparkle", title: `${plural(r.suggestions.length, "suggestion")} from your agents`, sub: "Confirm the ones that are right so agents can rely on them.", href: "#/review?tab=suggestions", cta: "Review" },
      r.moved.length && { tone: "warm", glyph: "drift", title: `${plural(r.moved.length, "reference")} to update`, sub: "Still true; the code they point to moved. One click updates them.", href: "#/review?tab=moved", cta: "Update" },
    ].filter(Boolean)
    const areaCard = (a) => {
      const list = live().filter((x) => D().areaOf(x)?.id === a.id)
      const st = D().stats(list)
      return `<a class="at-area" href="#/knowledge?area=${a.id}"><header><strong>${A.esc(a.name)}</strong>${A.agent(a.owner)}</header><code>${A.esc(a.path)}</code><p>${A.esc(a.about)}</p>
        <footer>${A.bar([["good", st.ok], ["warm", st.moved], ["bad", st.broken], ["stale", st.unchecked]], "slim")}<span>${plural(st.total, "item")}</span>${st.broken ? `<span class="at-state bad">${A.icon("xc")}${st.broken}</span>` : ""}${st.moved ? `<span class="at-state warm">${A.icon("drift")}${st.moved}</span>` : ""}</footer></a>`
    }
    return {
      crumbs: [["Atlas"]],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas</div><h1>What your agents know</h1><p>The rules and cautions your agents follow in hugr-orchestra, checked against the code at commit <code class="at-mono">${D().HEAD}</code>.</p></div>
        <div class="heading-actions">${A.btn("Browse knowledge", "go", { value: "#/knowledge", icon: "fact" })}${need ? A.btn(`Review ${need}`, "go", { value: "#/review", icon: "inbox", primary: true }) : ""}</div></div>
      ${building ? `<div class="at-building"><span class="spin"></span><div><strong>Reading the code at ${D().HEAD}</strong><small>About 5 seconds the first time you open a project. Numbers appear when it's done.</small></div></div>` : ""}
      <div class="at-stats three">
        <a class="at-stat" href="#/knowledge"><span class="at-stat-label">Known${A.icon("arrow")}</span>${building ? '<span class="at-skel" style="block-size:26px;inline-size:40%"></span>' : `<span class="at-stat-value">${s.total}</span>`}<span class="at-stat-foot"><span><b>${s.rules}</b> rules</span><span><b>${s.cautions}</b> cautions</span><span><b>${s.suggestions}</b> suggestions</span></span></a>
        <a class="at-stat" href="#/knowledge?status=attention"><span class="at-stat-label">Up to date${A.icon("arrow")}</span>${building ? '<span class="at-skel" style="block-size:26px;inline-size:40%"></span>' : `<span class="at-stat-value">${pct(s.ok, s.total)}%</span>`}${A.bar([["good", s.ok], ["warm", s.moved], ["bad", s.broken], ["stale", s.unchecked]])}<span class="at-stat-foot"><span><b>${s.broken}</b> no longer true</span><span><b>${s.moved}</b> code moved</span><span><b>${s.unchecked}</b> not checked</span></span></a>
        <a class="at-stat ${need ? "attn" : ""}" href="#/review"><span class="at-stat-label">Needs you${A.icon("arrow")}</span><span class="at-stat-value">${need}</span><span class="at-stat-foot">${need ? "Decisions only you can make" : "Nothing to review"}</span></a>
      </div>
      <div class="at-cols">
        <div>
          ${attention.length ? `<section class="at-panel"><header class="at-panel-head"><h3>Needs your attention</h3><a class="mx-link" href="#/review">Open review</a></header>
          ${attention.map((a) => `<div class="at-attn" data-action="go" data-value="${a.href}" tabindex="0"><span class="at-tl-dot ${a.tone}">${A.icon(a.glyph)}</span><div><strong>${A.esc(a.title)}</strong><small>${A.esc(a.sub)}</small></div>${A.btn(a.cta, "go", { value: a.href })}</div>`).join("")}</section>` : ""}
          <div class="at-section-title"><h3>Areas of the code</h3><a class="mx-link" href="#/knowledge">All knowledge</a></div>
          <div class="at-areas">${D().areas.map(areaCard).join("")}</div>
        </div>
        <section class="at-panel"><header class="at-panel-head"><h3>Recent changes</h3></header><div class="at-panel-body"><ul class="at-timeline">
          ${D().activity.map((e) => `<li><span class="at-tl-dot ${e.tone}">${A.icon(e.glyph)}</span><div class="at-tl-body">${e.item ? `<a href="#" class="at-tl-link" data-action="open" data-value="${e.item}">${A.esc(e.text)}</a>` : `<a class="at-tl-link" href="${e.link}">${A.esc(e.text)}</a>`}<small>${e.when}</small></div></li>`).join("")}
        </ul></div></section>
      </div></div>`,
    }
  }

  /* ---------- Knowledge ---------- */
  A.views.knowledge = (state) => {
    const q = state.query
    const area = D().areas.find((a) => a.id === q.area)
    const folder = q.folder
    const folderArea = folder && D().areas.find((a) => a.folders.some((f) => f.path === folder))
    const scope = live().filter((x) => (folder ? x.folder === folder : area ? D().areaOf(x)?.id === area.id : true))
    const text = (q.q ?? "").toLowerCase()
    const kind = q.kind ?? ""
    const list = scope
      .filter((x) => !kind || x.kind === kind)
      .filter((x) => q.status !== "attention" || x.status !== "ok")
      .filter((x) => !text || `${x.text} ${x.file}`.toLowerCase().includes(text))
    const st = D().stats(scope)
    const href = (patch) => {
      const next = { ...q, ...patch }
      delete next.item
      Object.keys(next).forEach((k) => !next[k] && delete next[k])
      return `#/knowledge${Object.keys(next).length ? `?${new URLSearchParams(next)}` : ""}`
    }
    const folders = [...new Set(list.map((x) => x.folder))]
    const folderInfo = (p) => D().areas.flatMap((a) => a.folders).find((f) => f.path === p)
    const title = folder ? `<h1 class="mono">${A.esc(folder)}</h1>` : `<h1>${area ? A.esc(area.name) : "All knowledge"}</h1>`
    const about = folder ? folderInfo(folder)?.about : area ? area.about : "Everything your agents know about this project, by area of the code."
    const owner = folderArea ?? area
    return {
      crumbs: [["Atlas", "#/overview"], ["Knowledge", folder || area ? "#/knowledge" : null], ...(folderArea ? [[folderArea.name, `#/knowledge?area=${folderArea.id}`], [folder.split("/").at(-1), null, true]] : area ? [[area.name]] : [])],
      html: `<div class="at-page">
      <div class="mx-heading"><div><div class="mx-eyebrow">Knowledge${owner ? ` · looked after by ${A.esc(D().agents[owner.owner].name)}` : ""}</div>${title}<p>${A.esc(about)}</p></div></div>
      <div class="at-toolbar">
        <label class="at-search">${A.icon("search")}<input id="list-search" placeholder="Search what agents know" value="${A.esc(q.q ?? "")}" aria-label="Search knowledge"><kbd>/</kbd></label>
        <div class="wf-range" role="group" aria-label="Kind">${[["", "All", st.total], ["rule", "Rules", st.rules], ["caution", "Cautions", st.cautions], ["suggestion", "Suggestions", st.suggestions]].map(([v, l, n]) => `<button aria-pressed="${kind === v}" data-action="go" data-value="${href({ kind: v })}">${l}<span class="wf-count">${n}</span></button>`).join("")}</div>
        <div class="wf-range" role="group" aria-label="Status">${[["", "Any status"], ["attention", "Needs attention"]].map(([v, l]) => `<button aria-pressed="${(q.status ?? "") === v}" data-action="go" data-value="${href({ status: v })}">${l}</button>`).join("")}</div>
      </div>
      ${list.length ? folders.map((p) => {
        const rows = list.filter((x) => x.folder === p)
        return `<section class="at-group"><header class="at-group-head">${folder ? "" : `<a href="${href({ folder: p, area: "" })}" class="at-group-path">${A.icon("pin")}<code>${A.esc(p)}</code></a><span>${A.esc(folderInfo(p)?.about ?? "")}</span>`}<small>${plural(rows.length, "item")}</small></header>
        ${rows.sort((a, b) => ["rule", "caution", "suggestion"].indexOf(a.kind) - ["rule", "caution", "suggestion"].indexOf(b.kind)).map((x) => itemRow(x, state)).join("")}</section>`
      }).join("") : A.empty("Nothing matches", "Try another word or clear the filters.", A.btn("Clear filters", "go", { value: href({ kind: "", status: "", q: "" }) }))}
      </div>`,
    }
  }

  /* ---------- Review ---------- */
  A.views.review = (state) => {
    const r = D().review()
    const tabs = [["broken", "No longer true", "xc", r.broken], ["confirm", "Needs your confirmation", "lock", r.confirm], ["suggestions", "Suggestions", "sparkle", r.suggestions], ["moved", "Code moved", "drift", r.moved]]
    const tab = state.query.tab ?? tabs.find((t) => t[3].length)?.[0] ?? "broken"
    const items = tabs.find((t) => t[0] === tab)[3]
    const who = (x) => D().agents[x.by].name
    const diff = (x) => `<div class="at-diff">${A.code(`Before · ${x.file}`, x.before.start, x.before.lines, { kinds: Object.fromEntries(x.before.lines.map((_, i) => [x.before.start + i, "del"])) })}${A.code(`Now · ${x.file}`, x.after.start, x.after.lines, { sha: D().HEAD, kinds: Object.fromEntries(x.after.lines.map((_, i) => [x.after.start + i, "add"])) })}</div>`
    const card = {
      broken: (x) => `<article class="at-card bad ${state.query.focus === x.id ? "focus" : ""}"><header>${A.kind(x)}${A.status(x.status, true)}<span class="grow"></span>${A.btn("Details", "open", { value: x.id })}</header>
        <h3>${A.esc(x.text)}</h3><p class="at-why">${A.icon("info")}${A.esc(x.why)}</p>${diff(x)}
        <footer><span class="grow">Is the rule out of date, or is the code wrong?</span>${A.btn("Fix the code instead", "fix-code", { value: x.id })}${A.btn("Remove rule", "remove", { value: x.id })}${A.btn("Update rule", "edit", { value: x.id, primary: true })}</footer></article>`,
      confirm: (x) => `<article class="at-card warm"><header>${A.kind(x)}<span class="grow"></span>${A.btn("Details", "open", { value: x.id })}</header>
        <h3>${A.esc(x.text)}</h3><p class="at-why">${A.icon("info")}${A.esc(who(x))} proposed this ${A.esc(x.when)}. ${A.esc(x.evidence)} Critical rules are hard limits for every agent, so only a person can confirm them.</p>
        <footer><span class="grow">${A.where(x)}</span>${A.btn("Reject", "dismiss", { value: x.id })}${A.btn("Confirm critical rule", "confirm", { value: x.id, primary: true, icon: "lock" })}</footer></article>`,
      suggestions: (x) => `<article class="at-card"><header>${A.agent(x.by)}<span class="at-muted">suggests · ${A.esc(x.when)}</span><span class="grow"></span>${A.status(x.status)}</header>
        <h3>${A.esc(x.text)}</h3><p class="at-why">${A.icon("eye")}${A.esc(x.evidence)}${x.doubt ? ` <b>${A.esc(who(x))} isn't sure about this one.</b>` : ""}</p>
        <footer><span class="grow">${A.where(x)}</span>${A.btn("Dismiss", "dismiss", { value: x.id })}${A.btn("Edit", "edit", { value: x.id })}${A.btn("Confirm", "confirm", { value: x.id, primary: true })}</footer></article>`,
    }
    const moved = `<section class="at-panel"><header class="at-panel-head"><div><h3>Still true, the code moved</h3><small>Atlas found the same code in a new place. Updating the reference keeps the rule pointing at the right lines.</small></div>${A.btn(`Update all ${items.length}`, "update-all", { primary: true })}</header>
      ${items.map((x) => `<div class="at-item" data-action="open" data-value="${x.id}" tabindex="0">${A.kind(x)}<div class="at-item-main"><div class="at-item-text">${A.esc(x.text)}</div><div class="at-item-meta">${A.where(x)}<span>${A.esc(x.why)}</span></div></div>${A.btn("Update", "update", { value: x.id })}</div>`).join("")}</section>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Review"]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas</div><h1>Review</h1><p>Decisions only you can make. Until you decide, agents treat these as unsure and won't rely on them.</p></div></div>
      <div class="wf-tabs" role="tablist">${tabs.map(([id, label, glyph, list]) => `<button class="wf-tab" role="tab" aria-selected="${tab === id}" data-action="go" data-value="#/review?tab=${id}">${A.icon(glyph)}${label}<span class="wf-count ${id === "broken" && list.length ? "bad" : ""}">${list.length}</span></button>`).join("")}</div>
      ${items.length ? (tab === "moved" ? moved : items.map(card[tab]).join("")) : `<div class="at-clear">${A.icon("checkc")}<strong>All clear</strong><p>Nothing here needs you right now.</p>${A.btn("Back to overview", "go", { value: "#/overview" })}</div>`}
      </div>`,
    }
  }

  /* ---------- Item details ---------- */
  A.views.detail = (id, state, page = false) => {
    const x = D().byId[id]
    if (!x) return ""
    const ag = D().agents
    const statusLine = {
      ok: [x.kind === "suggestion" ? "blue" : "good", x.kind === "suggestion" ? `Suggested by ${ag[x.by].name}. Agents treat it as a hint until someone confirms it.` : `Checked against the code at ${D().HEAD}, 12 minutes ago.`],
      moved: ["warm", x.why],
      broken: ["bad", x.why],
      unchecked: ["", "Atlas couldn't check this against the current code. Agents treat it as unsure."],
    }[x.status]
    const order = state.list ?? []
    const index = order.indexOf(id)
    const body = `
      <div class="ins-states">${A.kind(x)}${A.status(x.status)}</div>
      <p class="ins-claim">${A.esc(x.text)}</p>
      <div class="ins-note ${statusLine[0]}">${A.esc(statusLine[1])}${["broken", "moved"].includes(x.status) ? ` <a href="#/review?tab=${x.status}&focus=${x.id}">Review</a>` : ""}${x.critical ? " Only a person can change this rule." : ""}</div>
      <div class="ins-section"><h4>Where it applies</h4>
        ${x.code ? A.code(`${x.folder.endsWith(x.file) ? x.folder : `${x.folder}/${x.file}`}`, x.code.start, x.code.lines, { highlight: Array.from({ length: x.code.focus[1] - x.code.focus[0] + 1 }, (_, i) => x.code.focus[0] + i), head: '<a href="#" data-action="toast" data-value="Opens the file in the editor at this line.">Open</a>' })
          : x.before ? A.code(`${x.folder}/${x.file}`, x.after.start, x.after.lines, { sha: D().HEAD })
          : `<a class="at-fileline" href="#" data-action="toast" data-value="Opens the file in the editor at this line.">${A.icon("code")}<code>${A.esc(x.folder.endsWith(x.file) ? x.folder : `${x.folder}/${x.file}`)}:${x.line}</code>${A.icon("external")}</a>`}
      </div>
      <div class="ins-section"><h4>Who said it</h4><ul class="at-timeline">
        <li><span class="at-tl-dot blue">${A.icon("sparkle")}</span><div class="at-tl-body"><strong>${x.kind === "suggestion" || !x.confirmedBy ? "Suggested" : "Learned"} by ${A.esc(ag[x.by].name)}</strong><small>${A.esc(x.when)}${x.evidence ? ` · ${A.esc(x.evidence)}` : ""}</small></div></li>
        ${x.confirmedBy ? `<li><span class="at-tl-dot good">${A.icon("check")}</span><div class="at-tl-body"><strong>Confirmed by ${A.esc(ag[x.confirmedBy].name)}</strong><small>${ag[x.confirmedBy].human ? "A person confirmed it" : "Confirmed during review"}</small></div></li>` : ""}
        ${(x.history ?? []).map(([t, by, when]) => `<li><span class="at-tl-dot">${A.icon("history")}</span><div class="at-tl-body"><strong>${A.esc(t)}</strong><small>${A.esc(ag[by].name)} · ${A.esc(when)}</small></div></li>`).join("")}
      </ul></div>
      ${x.impact ? `<div class="ins-section"><h4>If this code changes, also check</h4>${x.impact.map((p) => `<div class="at-impact">${A.icon("code")}<code>${A.esc(p)}</code></div>`).join("")}</div>` : ""}
      ${x.related ? `<div class="ins-section"><h4>Related</h4>${x.related.map((r) => D().byId[r]).filter(Boolean).map((y) => `<div class="ins-rel" data-action="open" data-value="${y.id}" tabindex="0">${A.kind(y)}<span class="ins-rel-claim">${A.esc(y.text)}</span></div>`).join("")}</div>` : ""}
      <details class="ins-tech"><summary>${A.icon("chev")}Technical details</summary><dl class="at-kv">
        <dt>Atlas id</dt><dd><code>${A.hash(x.id)}</code></dd>
        <dt>Stored as</dt><dd>${x.kind === "suggestion" ? "advisory fact · tier T2" : x.critical ? "predicate · tier T0" : "predicate · tier T1"}</dd>
        <dt>Checked by</dt><dd>${x.kind === "suggestion" ? "not checked; a claim" : "structural check on the code it points to"}</dd>
        <dt>Commit</dt><dd><code>${D().HEAD}</code></dd></dl></details>`
    if (page) return body
    const suggestion = x.kind === "suggestion" || D().pending.includes(x)
    return `<header class="ins-head"><span class="ins-kind">${A.icon("fact")}<span>${A.esc(D().areaOf(x)?.name ?? "Pending")}</span></span>
      ${A.btn("", "step", { icon: "up", value: "-1", label: "Previous (k)", tip: "Previous (k)", disabled: index <= 0 })}${A.btn("", "step", { icon: "down", value: "1", label: "Next (j)", tip: "Next (j)", disabled: index < 0 || index >= order.length - 1 })}
      ${A.btn("", "go", { icon: "expand", value: `#/item/${x.id}`, label: "Open as page", tip: "Open as page" })}${A.btn("", "close", { icon: "close", label: "Close (Esc)", tip: "Close (Esc)" })}</header>
      <div class="ins-body">${body}</div>
      <footer class="ins-foot">${A.btn("Copy link", "copy-link", { icon: "link", value: x.id })}<span class="grow"></span>${suggestion ? `${A.btn("Dismiss", "dismiss", { value: x.id })}${A.btn("Confirm", "confirm", { value: x.id, primary: true })}` : `${A.btn("Remove", "remove", { value: x.id })}${A.btn("Edit", "edit", { value: x.id, primary: true })}`}</footer>`
  }

  A.views.item = (state) => {
    const x = D().byId[state.params[0]]
    if (!x) return { crumbs: [["Atlas", "#/overview"], ["Not found"]], html: `<div class="at-page narrow">${A.empty("This item no longer exists", "It may have been removed. Removed items stay in the project history.", A.btn("Browse knowledge", "go", { value: "#/knowledge" }))}</div>` }
    const area = D().areaOf(x)
    return {
      crumbs: [["Atlas", "#/overview"], ["Knowledge", "#/knowledge"], ...(area ? [[area.name, `#/knowledge?area=${area.id}`]] : []), [x.file, null, true]],
      html: `<div class="at-page narrow"><div class="mx-heading"><div><div class="mx-eyebrow">${A.esc(area?.name ?? "Knowledge")}</div></div><div class="heading-actions">${A.btn("Back", "back", { icon: "back" })}${A.btn("Copy link", "copy-link", { icon: "link", value: x.id })}${A.btn("Edit", "edit", { value: x.id, primary: true })}</div></div><div class="at-pagecard">${A.views.detail(x.id, state, true)}</div></div>`,
    }
  }

  /* ---------- Agents › Memory ---------- */
  A.views.agents = (state) => {
    const ag = D().agents
    const id = ag[state.params[0]] && !ag[state.params[0]].human ? state.params[0] : "backend"
    const a = ag[id]
    const m = D().memory[id]
    const lesson = (l) => `<div class="at-lesson"><div class="grow">${A.esc(l.text)}<small>${A.esc(l.from)} · used ${A.esc(l.used)}</small></div><span class="at-fade ${l.fades ? "" : "kept"}" data-tip="${l.fades ? "Unused memories fade so agents don't carry stale lessons. Using it again keeps it." : "Used recently, so it stays."}">${l.fades ? `${A.icon("clock")}fades ${A.esc(l.fades)}` : `${A.icon("check")}kept`}</span>${A.btn("Forget", "forget", { value: l.text })}</div>`
    return {
      crumbs: [["Agents", "#/agents"], [a.name], ["Memory"]],
      html: `<div class="at-page narrow">
      <div class="at-agent-head"><span class="at-avatar">${a.name[0]}</span><div><h1>${A.esc(a.name)}</h1><p>${A.esc(a.role)}</p></div></div>
      <div class="wf-tabs" role="tablist"><button class="wf-tab" role="tab" aria-selected="false" data-action="toast" data-value="The agent's profile tab already exists in the Agents chapter.">${A.icon("agents")}Profile</button><button class="wf-tab" role="tab" aria-selected="true">${A.icon("memory")}Memory</button></div>
      ${m ? `<p class="at-lead">What ${A.esc(a.name)} remembers between sessions. Only ${A.esc(a.name)} reads it; memories it stops using fade on their own. Project knowledge every agent shares lives in <a class="mx-link" href="#/overview">Atlas</a>.</p>
      <section class="at-panel"><header class="at-panel-head"><h3>${A.icon("play")}Working on now</h3><span class="at-pill">${A.esc(m.now.progress)}</span></header><div class="at-panel-body"><div class="at-now"><strong>${A.esc(m.now.goal)}</strong><span>${A.esc(m.now.step)}</span></div></div></section>
      <section class="at-panel"><header class="at-panel-head"><h3>${A.icon("memory")}Lessons learned</h3><small>Carried into every turn · about ${A.num(m.tokens)} tokens</small></header>${m.lessons.map(lesson).join("")}</section>
      ${m.prs.length ? `<section class="at-panel"><header class="at-panel-head"><h3>${A.icon("branch")}Notes from past pull requests</h3><small>Read only when relevant</small></header>${m.prs.map((p) => `<div class="at-lesson"><div class="grow">${A.esc(p.title)}<small>${A.esc(p.note)}</small></div></div>`).join("")}</section>` : ""}`
        : `<div class="at-clear">${A.icon("memory")}<strong>${A.esc(a.name)} doesn't keep memory between sessions</strong><p>It starts each session from the project's shared knowledge in Atlas.</p>${A.btn("Open Atlas", "go", { value: "#/overview" })}</div>`}
      </div>`,
    }
  }

  /* ---------- Chat: citations ---------- */
  A.views.chat = (state) => {
    const chip = (id) => {
      const x = D().byId[id]
      const label = x.critical ? "critical rule" : x.kind
      return `<button class="at-chip ${x.status === "broken" ? "bad" : ""}" data-action="open" data-value="${id}">${A.icon(x.kind === "caution" ? "warning" : "shield")}${label} · ${A.esc(x.file)}${x.status === "broken" ? `<span class="st">no longer true</span>` : ""}</button>`
    }
    const open = state.query.used === "1"
    return {
      flush: true,
      crumbs: [["Chat"], ["Show Atlas in the app"]],
      html: `<div class="at-session"><div class="at-tabs-strip"><span class="at-sess-tab">${A.icon("chat")}Show Atlas in the app <code>atlas-ui-study</code></span></div>
      <div class="at-transcript">
        <div class="at-turn user">Add a server endpoint so the app can show what agents know about each folder.</div>
        <div class="at-turn">
          <div class="at-turn-head">${A.agent("backend")}<span>2 min ago</span></div>
          <p>Reading stays separate from running sessions: ${chip("admit")} so the new endpoint must never wake a session. ${chip("wake")}</p>
          <p>I won't rely on one rule yet: ${chip("conflict")} The code changed and Atlas flagged it, so I've asked you to review it.</p>
          <p>The endpoint goes in the server and only the generated client calls it: ${chip("client-deps")}</p>
          <div class="at-saved">${A.icon("memory")}<span>Saved to Backend's memory: “Atlas reads stay in the orchestra package.”</span><a class="mx-link" href="#/agents/backend">View</a></div>
          <button class="at-used" data-action="go" data-value="#/chat${open ? "" : "?used=1"}" aria-expanded="${open}">${A.icon("atlas")}<span>Used 4 things from Atlas</span>${A.icon("chev", open ? "flip" : "")}</button>
          ${open ? `<div class="at-used-body"><div>${["admit", "wake", "conflict", "client-deps"].map((id) => { const x = D().byId[id]; return `<div class="ins-rel" data-action="open" data-value="${id}" tabindex="0">${A.kind(x)}<span class="ins-rel-claim">${A.esc(x.text)}</span>${A.status(x.status, true)}</div>` }).join("")}</div>
          <p>Left out: 2 unconfirmed suggestions about this folder. Agents only rely on confirmed knowledge.</p></div>` : ""}
        </div>
      </div>
      <div class="at-composer">Ask anything, / for commands, @ for context…<div class="row">${A.icon("atlas")}<span>@atlas to add knowledge to the context</span><span class="grow"></span><span>Claude Opus</span></div></div></div>`,
    }
  }

  /* ---------- Not configured ---------- */
  A.views.held = () => ({
    crumbs: [["Atlas"]],
    html: `<div class="at-page narrow"><div class="at-held"><span class="mx-mark">${A.icon("atlas")}</span><h2>Turn on Atlas for this project</h2>
      <p>Atlas reads your code and keeps track of what your agents learn about it, so every agent starts from the same checked knowledge instead of guessing.</p>
      <div style="display:flex;gap:8px;justify-content:center">${A.btn("Learn more", "toast", { value: "Opens the Atlas guide." })}${A.btn("Turn on Atlas", "enable", { primary: true, icon: "play" })}</div>
      <p class="mx-note">Turning it on adds an <code class="at-mono">atlas</code> entry to this project's settings. Nothing leaves your machine.</p></div></div>`,
  })
})(window.Atlas)
