// Router, rail, fact panel, curation actions (Undo only where Atlas could take it back), search, keyboard and the gallery for the preview.
// Every view is a URL (hash route), so back/forward, reload and shared links land on the same screen.
;(function (A) {
  const $ = (s) => document.querySelector(s)
  const main = $("#main")
  const panel = $("#inspector")
  const M = () => A.m
  A.state = { preview: "ready", list: [] }

  const appNav = [
    ["home", "Home", "home"], ["chat", "Chat", "chat", "#/chat"], ["agents", "Agents", "agents", "#/agents/backend"], ["maestro", "Maestro", "maestro"],
    ["workflows", "Workflows", "workflow"], ["atlas", "Atlas", "atlas", "#/overview"], ["sep"], ["mcp", "MCP", "code"], ["skills", "Skills", "sparkle"],
    ["plugins", "Plugins", "code"], ["hooks", "Hooks", "hooks"], ["actions", "Actions", "bolt"], ["schedule", "Schedule", "clock"],
    ["env", ".env", "lock"], ["dock", "Dock", "dock"], ["workspaces", "Workspaces", "server"],
  ]
  const atlasRoutes = ["overview", "explore", "knowledge", "unit", "fact", "review", "activity", "genesis", "architecture", "own", "how", "memory", "settings", "gallery"]
  const routes = [...atlasRoutes, "agents", "chat"]

  /* ---------- Routing ---------- */
  const parse = () => {
    const raw = location.hash.replace(/^#\/?/, "") || "overview"
    const [path, search = ""] = raw.split("?")
    const [route, ...rest] = path.split("/")
    // The old file map now lives on unit pages.
    if (route === "map") return { route: "unit", params: [new URLSearchParams(search).get("path") || "packages/knowledge"], query: {}, raw }
    // Health is a section of Overview now.
    if (route === "health") { location.replace("#/overview?show=health"); return { route: "overview", params: [], query: { show: "health" }, raw: "overview?show=health" } }
    // Old names: Curation is Review, History is Activity.
    if (route === "curation" || route === "history") { location.replace(`#/${route === "curation" ? "review" : "activity"}`); return { route: route === "curation" ? "review" : "activity", params: [], query: {}, raw } }
    return { route: routes.includes(route) ? route : "overview", params: rest.length ? [decodeURIComponent(rest.join("/"))] : [], query: Object.fromEntries(new URLSearchParams(search)), raw }
  }
  const withQuery = (patch) => {
    const s = parse()
    const q = { ...s.query, ...patch }
    Object.keys(q).forEach((k) => (q[k] === undefined || q[k] === null || q[k] === "") && delete q[k])
    return `#/${s.raw.split("?")[0]}${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ""}`
  }
  A.go = (href) => (location.hash = href.replace(/^#/, ""))

  /* ---------- Render ---------- */
  let lastPage = ""
  const render = (force = false) => {
    const s = parse()
    Object.assign(A.state, s)
    const page = `${s.raw.split("?")[0]}?${new URLSearchParams(Object.entries(s.query).filter(([k]) => k !== "fact" && k !== "why"))}|${A.state.preview}`
    const samePage = page === lastPage && !force
    lastPage = page
    const atlas = atlasRoutes.includes(s.route)
    const view = atlas && A.state.preview === "held" ? A.views.held() : atlas && A.state.preview === "building" && s.route !== "overview" ? building() : A.views[s.route](A.state)
    renderSidebar(s)
    renderRail(s)
    $("#breadcrumbs").innerHTML = `Orchestra${view.crumbs.map(([label, href, mono], i) => `<span class="sep">/</span>${href && i < view.crumbs.length - 1 ? `<a href="${href}">${mono ? `<code>${A.esc(label)}</code>` : A.esc(label)}</a>` : `<span class="crumb-current">${mono ? `<code>${A.esc(label)}</code>` : A.esc(label)}</span>`}`).join("")}`
    if (!samePage) {
      const focused = document.activeElement?.id === "list-search"
      const scroller = () => main.querySelector(".at-map-main") ?? main
      const keep = force ? scroller().scrollTop : 0
      const treeKeep = main.querySelector(".at-tree-pane")?.scrollTop ?? 0
      // Illustrated mode adds example data on top of the real store; say so on every Atlas screen.
      const dismissed = (() => { try { return sessionStorage.getItem("atlas-banner") === "0" } catch { return false } })()
      const storeBanner = atlas && A.state.preview === "ready" && M().provenance() !== "trusted" && !dismissed ? `<div class="at-banner warm">${A.icon("lock")}<span>This store is in git, so Atlas sends agents only machine-proven facts: 0 of ${A.num(M().facts.length)} today. Changes are read-only.</span><a class="mx-link" href="#/overview?show=health">Why</a><button class="mx-btn icon" data-action="dismiss-banner" aria-label="Dismiss">${A.icon("close")}</button></div>` : ""
      const illus = atlas && M().R.illustrated && !view.flush ? `<div class="at-illus">${A.icon("info")}<span><b>Illustrated.</b> Items marked example are invented.</span><button class="mx-link" data-action="data" data-value="real">Real store only</button></div>` : ""
      const banner = storeBanner + illus
      main.innerHTML = banner + view.html
      view.after?.()
      main.classList.toggle("flush", !!view.flush)
      // Remember which sections the viewer opened or closed (per section id, this browser only).
      main.querySelectorAll("details[data-acc]").forEach((d) => {
        const key = `atlas-acc:${d.dataset.acc}`
        try { const v = localStorage.getItem(key); if (v !== null) d.open = v === "1" } catch {}
        d.addEventListener("toggle", () => { try { localStorage.setItem(key, d.open ? "1" : "0") } catch {} })
      })
      const tree = main.querySelector(".at-tree-pane")
      if (tree) {
        tree.scrollTop = treeKeep
        tree.querySelector(".selected")?.scrollIntoView({ block: "nearest" })
      }
      if (s.query.show === "health") setTimeout(() => main.querySelector("#health")?.scrollIntoView({ block: "start" }), 0)
      if (focused) {
        const input = $("#list-search")
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
      } else {
        scroller().scrollTop = keep
        if (!force) main.focus({ preventScroll: true })
      }
    }
    A.state.list = [...new Set([...main.querySelectorAll('[data-action="open"][data-value]')].map((el) => el.dataset.value))]
    main.querySelectorAll(".at-item[data-value]").forEach((el) => el.classList.toggle("selected", el.dataset.value === s.query.fact))
    renderPanel(s)
  }

  const building = () => ({
    crumbs: [["Atlas", "#/overview"], ["Building the index"]],
    html: `<div class="at-page"><div class="at-building"><span class="spin"></span><div><strong>Building the structural index for ${M().R.head}</strong><small>Hashing every unit and loading index.scip. The view fills in when it finishes; nothing is estimated.</small></div></div>
      <section class="at-panel"><div class="at-panel-body">${Array.from({ length: 7 }, (_, i) => `<div style="display:flex;gap:14px;align-items:center;padding:11px 0"><span class="at-skel" style="inline-size:64px;block-size:18px"></span><span class="at-skel" style="flex:1;block-size:12px;max-inline-size:${72 - i * 6}%"></span></div>`).join("")}</div></section></div>`,
  })

  const renderSidebar = (s) => {
    const active = s.route === "chat" ? "chat" : s.route === "agents" ? "agents" : "atlas"
    const need = M().curationCount()
    $("#sidebar-nav").innerHTML = appNav.map(([id, label, glyph, href]) => (id === "sep" ? '<span class="nav-sep"></span>' : `<a class="nav-item ${id === active ? "active" : ""}" href="${href ?? "#"}" ${href ? "" : `data-action="toast" data-value="${label} is outside this preview."`} ${id === active ? 'aria-current="page"' : ""}>${A.icon(glyph)}<span>${label}</span>${id === "atlas" && need && A.state.preview === "ready" ? `<span class="wf-count warm">${need}</span>` : ""}</a>`)).join("")
  }

  const link = (href, label, glyph, selected, extra = "", cls = "") =>
    `<a class="context-item ${selected ? "selected" : ""} ${cls}" href="${href}" ${selected ? 'aria-current="page"' : ""}>${A.icon(glyph)}<span>${A.esc(label)}</span>${extra}</a>`

  const renderRail = (s) => {
    const host = $("#atlas-context")
    if (s.route === "chat") return (host.innerHTML = "")
    if (s.route === "agents") {
      const current = s.params[0] ?? "backend"
      host.innerHTML = `<aside class="atlas-context" aria-label="Agents"><div class="context-group" style="margin:0"><div class="context-label">AGENTS</div>
        ${[["maestro", "Maestro"], ["backend", "Backend"], ["jimmy", "Jimmy"], ["archie", "Archie"], ["patty", "Patty"], ["billy", "Billy"]].map(([id, n]) => link(`#/agents/${id}`, n, "agents", id === current)).join("")}</div></aside>`
      return
    }
    const held = A.state.preview === "held"
    const st = M().stats()
    const count = (n, tone = "") => (held ? "" : `<span class="wf-count ${tone}">${A.num(n)}</span>`)
    const member = s.route === "memory" ? (s.params[0] ?? "backend").split("/")[0] : null
    const healthOk = M().health().cas.sound && M().provenance() === "trusted"
    host.innerHTML = `<aside class="atlas-context" aria-label="Atlas"><header class="context-head"><span class="mx-mark">${A.icon("atlas")}</span><div><strong>Atlas</strong><small>project atlas</small></div></header>
      <div class="context-group">
        ${link("#/overview", "Home", "home", s.route === "overview", healthOk || held ? "" : '<span class="at-sdot warm" data-tip="A health check needs attention"></span>')}
        ${link("#/explore", "Explore", "graph", ["explore", "knowledge", "unit", "fact"].includes(s.route))}
        ${link("#/review", "Review", "inbox", s.route === "review", count(M().curationCount(), "warm"))}
        ${link("#/activity", "Activity", "history", s.route === "activity")}
      </div>
      <div class="context-group"><div class="context-label">Engine</div>
        ${link("#/genesis", "Genesis", "sparkle", s.route === "genesis")}
        ${link("#/architecture", "Architecture", "stack", s.route === "architecture")}
        ${link("#/own", "Ownership", "territory", s.route === "own")}
        ${link("#/how", "Follow one fact", "fact", s.route === "how")}
      </div>
      <div class="context-group"><div class="context-label">MEMORY</div>
        ${[["backend", "Backend"], ["jimmy", "Jimmy"], ["archie", "Archie"], ["maestro", "Maestro"]].map(([id, n]) => link(`#/memory/${id}`, n, "memory", member === id, M().memory[id].bound ? "" : '<span class="context-hint">off</span>')).join("")}
      </div>
      <div class="context-group">${link("#/settings", "Settings", "settings", s.route === "settings")}</div>
      <footer class="context-footer">${held ? "<span>Not connected</span>" : M().provenance() === "trusted" ? `<span>${A.icon("server")} Local store</span>` : `<a class="warm" href="#/overview?show=health">${A.icon("lock")} Store in git · ${M().provenance() === "tracked-staging" ? "locked" : "read-only"}</a>`}<a href="#/gallery">${A.icon("eye")}All screens</a></footer></aside>`
  }

  const renderPanel = (s) => {
    const key = s.query.fact
    if (!key || !M().byKey[key] || s.route === "fact") {
      panel.hidden = true
      panel.innerHTML = ""
      return
    }
    const scroll = panel.querySelector(".ins-body")?.scrollTop ?? 0
    const same = panel.dataset.key === key
    panel.innerHTML = A.views.detail(key, A.state)
    panel.dataset.key = key
    panel.hidden = false
    if (same) panel.querySelector(".ins-body").scrollTop = scroll
    main.querySelector(`[data-value="${key}"][data-action="open"]`)?.scrollIntoView({ block: "nearest" })
  }

  /* ---------- Writes (simulated, reversible) ---------- */
  let undo = null
  const undoLink = '<button class="mx-link" data-action="undo">Undo</button>'
  // Atlas has no delete path and no tier downgrade, so a write gets no Undo; only interface-only choices do.
  const change = (keys, patch, message, glyph = "check", reversible = false) => {
    const items = [].concat(keys).map((k) => M().byKey[k])
    const before = items.map((x) => Object.fromEntries(Object.keys(patch).map((k) => [k, x[k]])))
    items.forEach((x) => Object.assign(x, patch))
    undo = () => items.forEach((x, i) => Object.assign(x, before[i]))
    if (items.some((x) => x.key === A.state.query.fact) && (patch.retired || patch.promotedNow || patch.discarded)) history.replaceState(null, "", withQuery({ fact: null }))
    if (!reversible) undo = null
    A.toast(reversible ? `${message} ${undoLink}` : message, glyph)
    render(true)
  }
  // Every write is refused at commit while the store is tracked by git (untrusted-store).
  const locked = () => (M().writable() ? false : (A.toast(A.refusal("untrusted-store"), "lock"), true))

  /* ---------- Sheets: what will happen (Checks), then what happened (per row) ---------- */
  const head = (title, text = "") => `<header class="mx-dialog-head"><div><h2 id="dialog-title">${title}</h2>${text ? `<p>${text}</p>` : ""}</div></header>`
  const foot = (note, action, label, value = "", disabled = false) => `<footer class="mx-dialog-foot"><span class="at-foot-note">${note}</span><button class="mx-btn" value="cancel">Cancel</button><button class="mx-btn primary" type="button" data-action="${action}" data-value="${A.esc(value)}" ${disabled ? "disabled" : ""}>${label}</button></footer>`
  const gateWord = { shape: "Well-formed", truth: "Matches code", authz: "Allowed", ratify: "Approved" }
  // The Checks strip: `atlas check` in four words, refreshed as the approval key is typed.
  const checksStrip = (c) => `<div class="at-checks-strip" id="checks">${c.gates.map((g) => `<span class="at-check ${g.reached ? (g.pass ? "good" : "bad") : "idle"}" data-tip="${g.gate}${g.pass ? "" : ` · ${A.esc(g.reason)} · ${A.esc(g.remedy)}`}">${A.icon(g.reached ? (g.pass ? "checkc" : "xc") : "minusc")}${gateWord[g.gate]}</span>`).join("")}</div>`
  const writingAs = (tier = "T1") => `<div class="mx-fields"><label class="mx-field"><span>Writing as</span><input value="${A.esc(M().actor)}" disabled></label><label class="mx-field"><span>${tier === "T0" ? "Ratifier name" : "Approval key"}</span><input id="token" type="password" placeholder="${tier === "T0" ? "the person who ratifies core facts" : "any key your team uses"}" autocomplete="off"></label></div>`
  const lockedNote = () => (M().writable() ? "" : `<div class="ins-note">${A.icon("lock")}<span>${A.refusal("untrusted-store")}: this would be refused when saved.</span></div>`)
  const sheet = {
    ratify: (x) => `<form method="dialog">${head("Ratify", A.esc(x.claim))}<div class="mx-dialog-body">
      <div class="at-radio"><label><input type="radio" name="tier" value="T1" checked><span><b>Ratified</b><small>Joins the unit's ratified facts, sent before hints.</small></span></label>
      <label><input type="radio" name="tier" value="T0"><span><b>Core</b><small>Must be right. Needs the ratifier name; Atlas doesn't verify who typed it.</small></span></label></div>
      ${writingAs()}${checksStrip(M().checks(x, { tier: "T1" }))}<p class="mx-note">Ratifying keeps only this sentence. Who approved is not recorded.</p>${lockedNote()}</div>${foot("", "ratify-confirm", "Ratify", x.key)}</form>`,
    edit: (x) => {
      const drifted = M().state(x) === "drifted"
      return `<form method="dialog">${head(drifted ? "Rewrite" : "Edit", drifted ? "Write the sentence as it holds for the current code." : "Write the sentence as it should read.")}<div class="mx-dialog-body">
      <label class="mx-field"><span>Sentence</span><textarea id="edit-text" rows="4">${A.esc(x.claim)}</textarea></label>
      ${writingAs()}${checksStrip(M().checks(x, { regrounds: true, draft: true }))}<p class="mx-note">At the same tier the new sentence is added beside the old one, and both are sent.</p>${lockedNote()}</div>${foot(A.newcap("R8"), "save", "Save", x.key)}</form>`
    },
    classify: (x) => `<form method="dialog">${head("Classify", A.esc(x.claim))}<div class="mx-dialog-body at-slotpick">${M().SLOT_GROUPS.map(([g, meaning, slots]) => `<div class="at-slotgroup"><strong>${g}</strong><small>${meaning}</small>${slots.map((sl) => `<label><input type="radio" name="slot" value="${sl}"><code>${sl}</code><span>${A.esc(M().SLOT_MEANING[sl])}</span></label>`).join("")}</div>`).join("")}
      ${writingAs()}${checksStrip(M().checks(x, { regrounds: true, draft: true }))}<p class="mx-note">The kind is part of a fact's identity, so this writes a new hint; the unsorted one stays sent.</p>${lockedNote()}</div>${foot("", "classify-confirm", "Classify", x.key)}</form>`,
    promoteAll: () => {
      const n = M().candidates.filter((x) => !x.promotedNow).length
      return `<form method="dialog">${head("Accept all", `${A.num(n)} suggestions (kept ones too: Atlas can't skip them), plus every fact already accepted, are re-checked one by one.`)}<div class="mx-dialog-body">
        ${writingAs()}${lockedNote()}<p class="mx-note">Each row passes the four checks again. Rows whose code changed since mining are refused.</p></div>${foot("", "promote-all-confirm", "Accept all")}</form>`
    },
    promoteResult: (run) => {
      if (!run.read) return `<form method="dialog">${head("Nothing was accepted", `${A.refusal("untrusted")}.`)}<div class="mx-dialog-body">${A.tech([["Command output", "<code>status: rejected</code><br><code>next: promote read nothing — the staging sidecar refused (untrusted)</code><br>exit 2"]])}</div><footer class="mx-dialog-foot"><span class="grow"></span><button class="mx-btn primary" value="ok">Done</button></footer></form>`
      const groups = Object.entries(run.rows.filter((r) => !r.settled).reduce((g, r) => ({ ...g, [r.rejected]: [...(g[r.rejected] ?? []), r] }), {}))
      const fresh = run.rows.filter((r) => r.settled && r.x.kind === "candidate").length
      const again = run.rows.filter((r) => r.settled && r.x.kind !== "candidate").length
      const refusedNew = run.rows.filter((r) => !r.settled && r.x.kind === "candidate").length
      return `<form method="dialog">${head(fresh ? `${A.num(fresh)} new ${fresh === 1 ? "fact" : "facts"} accepted` : "No new facts accepted", refusedNew ? `${A.num(refusedNew)} ${refusedNew === 1 ? "suggestion was" : "suggestions were"} refused.` : "")}<div class="mx-dialog-body">
        <div class="at-result-row good">${A.icon("checkc")}<span>New facts</span><span class="grow"></span><b>${A.num(fresh)}</b></div>
        <div class="at-result-row">${A.icon("refresh")}<span>Already accepted, re-checked</span><span class="grow"></span><b>${A.num(again)}</b></div>
        ${groups.map(([code, rows]) => `<details class="at-result-group"><summary>${A.icon("xc")}<span>${A.esc(A.refusal(code))}</span><span class="grow"></span><b>${A.num(rows.length)}</b>${A.icon("chev")}</summary>${rows.slice(0, 7).map((r) => `<div class="ins-rel" data-action="open-close" data-value="${r.nodeKey}" tabindex="0"><span class="ins-rel-claim">${A.esc(r.x.claim)}</span></div>`).join("")}${rows.length > 7 ? `<p class="mx-note">and ${A.num(rows.length - 7)} more</p>` : ""}</details>`).join("")}
        ${A.tech([["Command output", `<code>promote: ${run.promoted} of ${run.candidates} staged candidate(s) promoted; ${run.refused} refused</code><br>exit ${run.refused ? 2 : 0}`]])}</div><footer class="mx-dialog-foot"><span class="grow"></span><button class="mx-btn primary" value="ok">Done</button></footer></form>`
    },
    reconcile: () => {
      const r = M().reconcile()
      return `<form method="dialog">${head("Merge check", "Would a merge from this base be blocked by changed facts?")}<div class="mx-dialog-body">
        <label class="mx-field"><span>Base</span><select><option>${A.esc(r.base)} · when the facts were published</option></select></label>
        ${r.blind ? `<div class="at-result-row">${A.icon("minusc")}<span>Says nothing here: on a store in git Atlas reads no facts, so it always reports clear</span></div>` : `<div class="at-result-row ${r.exitCode ? "bad" : "good"}">${A.icon(r.exitCode ? "lock" : "checkc")}<span>${r.exitCode ? `Would block the merge: ${plural(r.semantic.length, "fact")} lost their code` : "Clear"}</span></div>`}
        <div class="at-result-row">${A.icon("refresh")}<span>Can be re-anchored automatically</span><span class="grow"></span><b>${r.mechanical.length}</b></div>
        ${A.tech([["Command", `<code>atlas reconcile ${A.esc(r.base)}</code> · exit ${r.exitCode} · reauthorCount ${r.reauthorCount} · regroundedCount ${r.regroundedCount}`], ["Re-anchor", "<code>--accept-reground</code> only counts; each re-anchor is written through emit from the <code>doctor reground</code> plan"]])}</div>
        <footer class="mx-dialog-foot"><span class="grow"></span>${r.exitCode ? `<a class="mx-btn" href="#/review?tab=changed">Review them</a>` : ""}<button class="mx-btn primary" value="ok">Done</button></footer></form>`
    },
    mine: () => `<form method="dialog">${head("Run atlas mine", "Genesis picks sites, asks the model about each one and checks every answer. What survives waits in Mined until promoted.")}<div class="mx-dialog-body">
      <div class="mx-field"><span>Kinds</span><div class="wf-range" id="mine-kinds"><button type="button" aria-pressed="true">Default three</button><button type="button" aria-pressed="false">Hints</button><button type="button" aria-pressed="false">Dependencies</button><button type="button" aria-pressed="false">Counts</button></div></div>
      <div class="mx-fields">
      <label class="mx-field"><span>Sites per kind</span><input type="number" value="200" min="1"></label></div>
      ${M().writable() ? "" : `<div class="ins-note">${A.icon("lock")}<span>${A.refusal("untrusted-store")}: suggestions could not be saved.</span></div>`}
      ${A.tech([["Command", "<code>atlas mine .</code> · always the current directory at HEAD"], ["Knobs", "<code>ATLAS_MINE_SLOT</code> (one kind) · <code>ATLAS_MINE_BUDGET</code> · <code>ATLAS_ENRICH</code> (hints only) · <code>ATLAS_FRONTIER=symbol</code> (thin history only)"], ["Model", "<code>$ATLAS_MODEL_CONFIG</code>, outside the repository"]])}</div>${foot("", "mine-run", "Start", "", !M().writable())}</form>`,
    mineResult: () => `<form method="dialog">${head("Genesis finished", "A sample result: this preview does not run a model.")}<div class="mx-dialog-body">
      <div class="at-result-row">${A.icon("sparkle")}<span>Suggested</span><span class="grow"></span><b>41</b></div>
      <div class="at-coverage">${[["good", 41, "Suggested"], ["", 12, "Declined"], ["warm", 3, "No record"], ["", 0, "Stopped"], ["muted", 144, "Not reached"]].map(([t, n, l]) => `<span class="${t}" style="flex:${Math.max(n, 1)}" data-tip="${l}: ${n}"></span>`).join("")}</div>
      <div class="at-coverage-legend">${[["Suggested", 41], ["Declined", 12], ["No record", 3], ["Not reached", 144]].map(([l, n]) => `<span>${l} <b>${n}</b></span>`).join("")}</div>
      <p class="mx-note">Atlas doesn't keep this report; copy it if you need it later.</p>
      ${A.tech([["Command output", "<code>genesis: seeded 41 candidate fact(s); ratified 0</code><br><code>cost: llmCalls 56 · budgetSpent 56</code><br><code>coverage CLOSES — all 200 planned site(s) accounted for: …</code>"]])}</div>
      <footer class="mx-dialog-foot"><span class="at-pill">example</span><span class="grow"></span><button class="mx-btn" value="ok">Close</button><a class="mx-btn primary" href="#/review?tab=mined">Review suggestions</a></footer></form>`,
    producers: () => `<form method="dialog">${head("More ways to find facts", "Each reads the code index and writes proven facts.")}<div class="mx-dialog-body">
      ${[["derive", "Derive links", "Depends-on edges proven from the code index."], ["transition", "Record a code change", "What changed in one unit between two commits."], ["vacuity", "Find hollow tests", "Tests that cannot fail."]].map(([id, title, text]) => `<div class="at-linkrow static">${A.icon("relations")}<span><b>${title}</b><br><small>${text}</small></span><span class="grow"></span>${A.btn("Run", "produce", { value: id, disabled: !M().writable() })}</div>`).join("")}
      ${M().writable() ? "" : `<p class="mx-note">${A.refusal("untrusted-store")}.</p>`}
      ${A.tech([["Commands", "<code>atlas derive-relations</code> · <code>atlas transition &lt;unit&gt; &lt;before&gt; &lt;after&gt;</code> · <code>atlas test-vacuity .</code>"], ["Measured on this store", "derive-relations resolved 6,193 edges and every one was refused for its write group (commit 2211f3046)"]])}</div>
      <footer class="mx-dialog-foot"><span class="grow"></span><button class="mx-btn primary" value="ok">Done</button></footer></form>`,
    respawn: (member, unit) => {
      const t = (A.spawns ?? []).find((x) => x.unit === unit)
      const saved = (t?.checkpoints ?? []).filter((c) => c.outcome === "admitted")
      const name = member[0].toUpperCase() + member.slice(1)
      return `<form method="dialog">${head(`Resume ${name}`, `Atlas hands back one saved checkpoint, once, in the same message as the packet.`)}<div class="mx-dialog-body">
      <div class="mx-field"><span>Checkpoint</span>${saved.length ? `<div class="at-linkrow static">${A.icon("memory")}<span>${A.esc(saved.at(-1).entry.stoppedAt)}</span></div><p class="mx-note">Orchestra sends the latest checkpoint this session saved, and Atlas checks it. ${name} is told work may have continued after it.</p>` : `<div class="ins-note">${A.icon("xc")}<span>Would be refused: ${A.refusal("no-own-fold")}. ${name} is told to return a packet blocker if the work depends on it.</span></div>`}</div>
      <label class="mx-field"><span>Packet</span><textarea rows="3">Continue with the next phase your checkpoint names. Save a new checkpoint when you stop.</textarea></label>
      ${A.tech([["Call", `Maestro: <code>task</code> with <code>task_id</code> and <code>memoryUnit {"kind":"task","id":"${A.esc(unit)}"}</code>`], ["Choice", "Maestro passes no ref: Orchestra takes the session's latest admitted receipt; with none, Atlas uses the only record or refuses as ambiguous"], ["After compaction", "the host restores the same checkpoint once (residency restored)"]])}</div>${foot(A.newcap("R5"), "respawn-confirm", "Resume", unit)}</form>`
    },
    rule: (member = "backend", lesson = "", unit = "") => `<form method="dialog">${head("Index a rule", "One imperative line, an always or a never, with where it applies.")}<div class="mx-dialog-body">
      <label class="mx-field"><span>Rule</span><textarea id="rule-text" rows="3">${A.esc(lesson)}</textarea></label><label class="mx-field"><span>Applies to</span><input id="rule-scope" placeholder="a path, a tool or a phase · * for everywhere" value="${lesson ? "tasks with phased packets" : ""}"></label>
      <p class="mx-note">Scanned for secrets, then saved for good: memory is append-only, so a rule can't be removed later. Where it applies is shown to ${member === "backend" ? "Backend" : member[0].toUpperCase() + member.slice(1)}; it doesn't filter.</p></div>${foot(A.newcap("R1"), "rule-confirm", "Index", `${member}|${lesson}|${unit}`)}</form>`,
    territory: (path) => `<form method="dialog">${head("Declare territory", "Gives a group of units an owner and a tier.")}<div class="mx-dialog-body"><div class="mx-fields"><label class="mx-field"><span>Name</span><input value="${A.esc(path.split("/").at(-1) || "")}"></label><label class="mx-field"><span>Owner</span><select><option>Backend</option><option>Archie</option><option>Patty</option><option>Billy</option></select></label></div>
      <label class="mx-field"><span>Covers</span><input value="${A.esc(path ? `${path}/**` : "")}"></label><label class="mx-field"><span>Tier</span><select><option>Hint · default</option><option>Ratified</option><option>Core · a person ratifies</option></select></label>
      ${A.tech([["File", "TERRITORY-CATALOG.json, committed and edited by hand today"]])}</div>${foot(A.newcap("R4"), "territory-confirm", "Declare")}</form>`,
    link: (x) => `<form method="dialog">${head("Link as the same fact", A.esc(x.claim))}<div class="mx-dialog-body"><label class="mx-field"><span>The other fact</span><input placeholder="Search by sentence or file"></label>
      <p class="mx-note">Both facts stay; reads show them as the same. A link you undo can never be made again.</p>${writingAs()}${lockedNote()}${A.tech([["Command", "<code>atlas link &lt;a&gt; &lt;b&gt;</code> · <code>--retract</code> to undo"], ["Needs", "write access to every group in the linked set, an approval key always, and the ratifier name if any is core"]])}</div>${foot("", "toast", "Link", "Pick the other fact first.")}</form>`,
    // A new fact from scratch: anchors → slot → claim → draft → check → emit (tools/src/draft.ts, check.ts).
    addFact: (path) => {
      const files = [...new Set(M().live().filter((x) => x.file === path || x.file.startsWith(`${path}/`)).map((x) => x.file))].sort()
      const draft = { file: files[0] ?? path, tier: "T2" }
      return `<form method="dialog">${head("Add a fact", "One sentence that is true about this code today.")}<div class="mx-dialog-body">
      <div class="mx-fields"><label class="mx-field"><span>About</span><select id="fact-anchor">${files.map((f) => `<option value="${A.esc(f)}">${A.esc(f.slice(path.length + 1) || f)}</option>`).join("")}</select></label>
      <label class="mx-field"><span>Kind</span><select id="fact-slot">${M().SLOT_GROUPS.map(([g, , slots]) => `<optgroup label="${g}">${slots.map((sl) => `<option value="${sl}">${A.esc(M().SLOT_MEANING[sl])}</option>`).join("")}</optgroup>`).join("")}</select></label></div>
      <label class="mx-field"><span>Sentence</span><textarea id="fact-text" rows="3" placeholder="e.g. Every write goes through the four checks before it is stored."></textarea></label>
      <div class="at-result-row">${A.icon("fact")}<span>Creates a new fact · needs an approval key</span>${A.help("atlas draft previews CREATE or UPDATE. A draft is marked untrusted, so even a hint takes the full approval route.")}</div>
      ${writingAs()}${checksStrip(M().checks(draft, { regrounds: true, draft: true }))}${lockedNote()}
      ${A.tech([["Commands", "<code>atlas anchors &lt;path&gt;</code> · <code>atlas slots</code> · <code>atlas draft &lt;anchor&gt; &lt;slot&gt; &lt;claim&gt;</code> · <code>atlas check</code> · <code>atlas emit --at &lt;rev&gt;</code>"], ["Write group", `<code>${A.esc(path.split("/")[0])}</code>, defaulted from the path; policy must grant it`], ["Anchors", "files with no grammar can be anchored only as whole files"]])}</div>${foot("", "add-fact-confirm", "Add", path)}</form>`
    },
    // `atlas verify-fact <kind> <target> --scope` — proven, refuted (negation only) or couldn't decide.
    verify: (scope = "") => `<form method="dialog">${head("Check a claim", "Ask the code index whether a claim is provable. Nothing is saved.")}<div class="mx-dialog-body">
      <label class="mx-field"><span>Claim</span><select id="vf-kind"><option value="dependency">Something in the scope uses the target</option><option value="count">The target has at least N callers in the scope</option><option value="definition">The target is defined in the scope</option><option value="negation">Nothing in the scope calls the target</option></select></label>
      <div class="mx-fields"><label class="mx-field"><span>Target</span><input id="vf-target" placeholder="a code-index symbol, e.g. createOwn"></label><label class="mx-field"><span>Scope</span><input id="vf-scope" value="${A.esc(scope.split("/").slice(0, 2).join("/"))}"></label></div>
      <div id="vf-result"></div>
      ${A.tech([["Command", "<code>atlas verify-fact &lt;kind&gt; &lt;target&gt; --scope &lt;s&gt; [--world] [--min] [--exact]</code>"], ["Answers", "proven · refuted (only for “nothing calls”) · abstain with a reason; all exit 0"]])}</div>
      <footer class="mx-dialog-foot"><span class="grow"></span><button class="mx-btn" value="cancel">Close</button><button class="mx-btn primary" type="button" data-action="verify-run">Check</button></footer></form>`,
    // Republishing: scripts/materialize-own-snapshot.mjs checks, in this order, before it writes anything.
    publish: () => {
      const ok = !!R().illustrated
      const pre = [["Not read from .atlas", true, "inputs and anchors under .atlas are refused"], ["Built from a commit in this branch", ok, "sourceRevision must be an ancestor of HEAD"], ["Every anchor is a plain file", true, "anchors must be regular files"], ["Source files unchanged since then", ok, "anchor blobs must match at the revision and now"]]
      return `<form method="dialog">${head("Republish briefings", "Agents read a reviewed, published copy, not the live store.")}<div class="mx-dialog-body">
      <div class="at-checks-strip">${pre.map(([l, pass, code]) => `<span class="at-check ${pass ? "good" : "bad"}" data-tip="${code}">${A.icon(pass ? "checkc" : "xc")}${l}</span>`).join("")}</div>
      <div class="ins-note">${A.icon("info")}<span>Atlas has no command that writes the reviewed snapshot from the live store, so a maintainer prepares it by hand today.</span></div>
      ${A.tech([["Script", "<code>node scripts/materialize-own-snapshot.mjs &lt;reviewed-snapshot.json&gt;</code>"], ["Writes", "OWN-SNAPSHOT.json and .orchestra/skills/own/** (coverage included), replaced whole"], ["Refuses", "inputs under .atlas · a revision not in HEAD's history · an anchor blob that differs at the revision or now"], ["Producer", "nothing builds the reviewed snapshot JSON from the live store"], ["When agents read", "Orchestra re-checks the revision, the source files and the briefing files byte for byte"]])}</div>${foot(A.newcap("R7"), "toast", "Republish", "Republishing from the app is a new capability (R7).")}</form>`
    },
    // `atlas init <path>` → {territories, blastRadius, t0Candidates}: a suggestion, never written.
    // `atlas init <path>` → {territories, blastRadius, t0Candidates}: one blast radius for the whole path, never written.
    suggest: () => {
      const kw = R().t0Keywords ?? []
      const rows = M().units().filter((u) => u.group === "code").map((u) => ({ u, core: kw.some((k) => u.id.includes(k)) }))
      const blast = new Set(Object.values(R().dependents).flat()).size
      return `<form method="dialog">${head("Suggest territories", "One per package. Nothing goes into the store; init adds two .gitignore lines.")}<div class="mx-dialog-body">
      <div class="at-result-row">${A.icon("graph")}<span>${A.num(blast)} files depend on something in this repository</span>${A.help("blastRadius: what depends on the path, from the code index.")}</div>
      ${rows.map((r) => `<div class="at-linkrow static">${A.icon("territory")}<code class="at-mono">${A.esc(r.u.id)}</code><span class="grow"></span>${r.core ? '<span class="at-tier-chip" data-tip="Its name has a core keyword; the tier is never set for you">Core?</span>' : ""}</div>`).join("")}
      ${A.tech([["Command", "<code>atlas init &lt;path&gt;</code> → territories · blastRadius · t0Candidates (from <code>t0Heuristic.keywords</code>)"], ["Side effect", "adds <code>.atlas/*</code> and <code>!.atlas/policy.json</code> to .gitignore"]])}</div>
      <footer class="mx-dialog-foot"><span class="grow"></span><button class="mx-btn primary" value="ok">Done</button></footer></form>`
    },
    importStore: () => `<form method="dialog">${head("Import a store", "Load another repository's export into a folder with no Atlas store.")}<div class="mx-dialog-body">
      <label class="mx-field"><span>Bundle</span><input placeholder="atlas-okf.json"></label><label class="mx-field"><span>Into</span><input placeholder="an empty folder"></label>
      <p class="mx-note">The target must have no <code>.atlas/</code>. Imported facts are stored but not served until they are written again through the checks.</p>
      ${A.tech([["Command", "<code>atlas import &lt;bundle&gt; &lt;target&gt;</code>"]])}</div>${foot("", "toast", "Import", "Not run in this preview.")}</form>`,
    hotset: () => `<form method="dialog">${head("Hot set budget", "Does the store serve more facts than you want agents to carry?")}<div class="mx-dialog-body">
      <label class="mx-field"><span>Budget</span><input id="hot-budget" type="number" value="500" min="1"></label><div id="hot-result"></div>
      ${A.tech([["Command", "<code>atlas doctor hotset &lt;budget&gt;</code> → size · budget · over"]])}</div>
      <footer class="mx-dialog-foot"><span class="grow"></span><button class="mx-btn" value="cancel">Close</button><button class="mx-btn primary" type="button" data-action="hotset-run">Compare</button></footer></form>`,
  }
  A.sheet = sheet
  const plural = A.plural
  const R = () => A.m.R

  const actions = {
    go: (v) => A.go(v),
    back: () => history.back(),
    open: (v) => A.go(A.state.route === "fact" ? `#/fact/${v}` : withQuery({ fact: v, why: null })),
    "open-close": (v) => { $("#dialog").close(); actions.open(v) },
    close: () => {
      const key = A.state.query.fact
      A.go(withQuery({ fact: null, why: null }))
      setTimeout(() => main.querySelector(`[data-value="${key}"][data-action="open"]`)?.focus({ preventScroll: true }), 0)
    },
    more: (v) => { const [id, n] = v.split("|"); history.replaceState(null, "", withQuery({ [`n-${id}`]: n })); render(true) },
    step: (v) => step(Number(v)),
    "ax-box": (v) => A.archBox(v),
    "ax-play": (v) => A.archPlay(v),
    "ax-edit": () => { const t = document.querySelector("#ax-tree"); if (t) t.innerHTML = A.archTree(!t.querySelector(".hot")) },
    "graph-zoom": (v) => A.exploreGraph?.zoom(Number(v)),
    "graph-fit": () => A.exploreGraph?.fit(),
    "open-fact-page": (v) => A.go(`#/fact/${v}`),
    "rebuild-brief": (v) => { const [path, focus] = v.split("|"); const host = document.querySelector("#how-brief, #unit-brief-build"); if (host) A.buildBriefing(host, path, focus || undefined) },
    "toggle-why": () => A.go(withQuery({ why: A.state.query.why === "all" ? null : "all" })),
    "copy-link": (v) => copy(`${location.href.split("#")[0]}#/fact/${v}`, "Link copied"),
    copy: (v) => copy(v, "Copied"),
    toast: (v) => A.toast(A.esc(v), "info"),
    undo: () => { undo?.(); undo = null; A.toast("Undone", "back"); render(true) },
    event: (v) => dialog(A.eventSheet(v)),
    retire: (v) => {
      if (locked()) return
      const x = M().byKey[v]
      if (M().state(x) === "drifted") return A.toast(`Refused: ${A.refusal("ungrounded")}. Rewrite it instead.`, "xc")
      // A SUPERSEDED write at T1/T0 is a full-ratify write: it needs a key (billy for T0), which this button can't take.
      if (M().governing(x)) return A.toast(`Refused: retiring a ${x.tier === "T0" ? "core" : "ratified"} fact needs ${x.tier === "T0" ? "the ratifier name" : "an approval key"}.`, "xc")
      change(v, { retired: true }, "Retired. Still sent to agents (R6).", "minusc")
    },
    promote: (v) => {
      if (locked()) return
      const c = M().checks(M().byKey[v], { token: "key" })
      if (!c.wouldEmit) return A.toast(`Refused: ${A.refusal(c.gates.find((g) => !g.pass).reason)}.`, "xc")
      change(v, { promotedNow: true }, "Accepted.")
    },
    discard: (v) => change(v, { discarded: true }, "Kept for later.", "minusc", true),
    "promote-all": () => dialog(sheet.promoteAll()),
    "promote-all-confirm": () => {
      const token = $("#token")?.value ?? ""
      $("#dialog").close()
      const run = M().promoteRun(token)
      A.state.promote = run
      run.rows.filter((r) => r.settled && r.x.kind === "candidate").forEach((r) => (r.x.promotedNow = true))
      render(true)
      dialog(sheet.promoteResult(run))
    },
    "promote-result": () => A.state.promote && dialog(sheet.promoteResult(A.state.promote)),
    reconcile: () => dialog(sheet.reconcile()),
    mine: () => dialog(sheet.mine()),
    "mine-run": () => { $("#dialog").close(); dialog(sheet.mineResult()) },
    producers: () => dialog(sheet.producers()),
    produce: (v) => A.toast(v === "derive" ? "Resolved 6,193 edges; none could be saved in this write group." : "Not run in this preview.", "info"),
    republish: () => dialog(sheet.publish()),
    "add-fact": (v) => dialog(sheet.addFact(v)),
    "add-fact-confirm": (v) => {
      const claim = $("#fact-text").value.trim()
      if (!claim) return A.toast("Write the sentence first.", "info")
      if (locked()) return
      const c = M().checks({ file: $("#fact-anchor").value, tier: "T2" }, { regrounds: true, draft: true, token: $("#token")?.value ?? "" })
      if (!c.wouldEmit) return A.toast(`Refused: ${A.refusal(c.gates.find((g) => !g.pass).reason)}.`, "xc")
      $("#dialog").close()
      A.toast("Added as a hint.", "fact")
    },
    verify: (v) => dialog(sheet.verify(v ?? "")),
    "verify-run": () => {
      const target = $("#vf-target").value.trim()
      const scope = $("#vf-scope").value.trim()
      const kind = $("#vf-kind").value
      if (!target || !scope) return A.toast("Fill in the target and the scope.", "info")
      // The preview has no code index to ask; it shows what each answer would say.
      const [tone, glyph, text] = ["", "minusc", `Not run in this preview. Atlas answers proven, couldn't decide${kind === "negation" ? ", or refuted" : ""}.`]
      $("#vf-result").innerHTML = `<div class="at-result-row ${tone}">${A.icon(glyph)}<span>${A.esc(text)}</span></div>`
    },
    suggest: () => dialog(sheet.suggest()),
    import: () => dialog(sheet.importStore()),
    hotset: () => dialog(sheet.hotset()),
    "hotset-run": () => {
      const budget = Number($("#hot-budget").value)
      const size = M().health().hotSet
      if (M().provenance() !== "trusted") return ($("#hot-result").innerHTML = `<div class="at-result-row">${A.icon("lock")}<span>Refused: Atlas won't count a store in git.</span></div>`)
      $("#hot-result").innerHTML = `<div class="at-result-row ${size > budget ? "bad" : "good"}">${A.icon(size > budget ? "warning" : "checkc")}<span>${A.num(size)} facts served · ${size > budget ? "over budget" : "within budget"}</span></div>`
    },
    "link-fact": (v) => dialog(sheet.link(M().byKey[v])),
    ratify: (v) => dialog(sheet.ratify(M().byKey[v])),
    classify: (v) => dialog(sheet.classify(M().byKey[v])),
    "reject-ratify": (v) => change(v, { proposedTier: undefined }, "Rejected (R3).", "minusc", true),
    data: (v) => { try { localStorage.setItem("atlas-data", v) } catch {} ; location.reload() },
    "classify-confirm": (v) => {
      const slot = $('input[name="slot"]:checked')?.value
      if (!slot) return A.toast("Pick a kind first.", "info")
      $("#dialog").close()
      if (locked()) return
      const x = M().byKey[v]
      const cc = M().checks(x, { regrounds: true, draft: true, token: $("#token")?.value ?? "" })
      if (!cc.wouldEmit) return A.toast(`Refused: ${A.refusal(cc.gates.find((g) => !g.pass).reason)}.`, "xc")
      // nodeKey = hash(anchor ‖ slot): a new identity, drafted at T2. The key here is a marked placeholder.
      const copyFact = { ...x, key: `new-${slot}-${x.key.slice(0, 12)}`, slot, tier: "T2", proposedTier: undefined, example: true }
      M().facts.push(copyFact)
      M().byKey[copyFact.key] = copyFact
      undo = null
      A.toast(`Saved as a new ${A.esc(slot)} hint.`, "fact")
      render(true)
    },
    "ratify-confirm": (v) => {
      const tier = $('input[name="tier"]:checked')?.value ?? "T1"
      const token = $("#token")?.value ?? ""
      if (locked()) return
      const c = M().checks(M().byKey[v], { tier, token })
      if (!c.wouldEmit) return A.toast(`Refused: ${A.refusal(c.gates.find((g) => !g.pass).reason)}.`, "xc")
      $("#dialog").close()
      change(v, { tier, proposedTier: undefined }, tier === "T0" ? "Now core." : "Ratified.", "shield")
    },
    edit: (v) => dialog(sheet.edit(M().byKey[v])),
    save: (v) => {
      const claim = $("#edit-text").value.trim()
      const token = $("#token")?.value ?? ""
      const x = M().byKey[v]
      if (locked()) return
      if (claim === x.claim) return A.toast("Nothing changed.", "info")
      const ec = M().checks(x, { regrounds: true, draft: true, token })
      if (!ec.wouldEmit) return A.toast(`Refused: ${A.refusal(ec.gates.find((g) => !g.pass).reason)}.`, "xc")
      $("#dialog").close()
      // Same tier ⇒ the claim set is a union (knowledge/src/write/upsert.ts): the old sentence stays and is sent.
      change(v, { claim: `${x.claim}; ${claim}`, regrounded: true }, "Saved. Both sentences are sent (R8).")
    },
    respawn: (v) => dialog(sheet.respawn(...v.split("|"))),
    "respawn-confirm": () => { $("#dialog").close(); A.toast("Resuming is a new capability (R5).", "info") },
    "promote-rule": (v) => dialog(sheet.rule(...(v ?? "backend||").split("|"))),
    "dismiss-proposal": (v) => {
      const [member, lesson] = v.split("|")
      const m = M().memory[member]
      m.dismissed.add(lesson)
      undo = () => m.dismissed.delete(lesson)
      A.toast(`Dismissed. ${undoLink}`, "minusc")
      render(true)
    },
    "rule-confirm": (v) => {
      const [member, lesson] = v.split("|")
      const rule = $("#rule-text").value.trim()
      const scope = $("#rule-scope").value.trim() || "*"
      const pm = A.projectMemory(member)
      const count = rule.split(/\s+/).filter(Boolean).length
      const m = M().memory[member]
      $("#dialog").close()
      // An identical rule is reconciled, not rewritten, and gets no younger (tool/atlas-memory.ts).
      if (m.rules.some((r) => r.rule === rule && r.scope === scope && !r.grounding)) return A.toast("Already saved; nothing new was written.", "info")
      // The 500-word cap counts every rule this member ever wrote (adapter-io/src/memory-emit.ts); shown only when hit.
      if (pm.lifetime + count > 500) return A.toast(`Not saved: ${A.refusal("over-cap")}.`, "xc")
      M().appendRecord()
      m.rules.push({ rule, scope, from: lesson, age: 0 })
      A.toast(`Indexed · ${count} tokens.`, "shield")
      history.replaceState(null, "", withQuery({ pm: "indexed" }))
      render(true)
    },
    territory: (v) => dialog(sheet.territory(v ?? "")),
    "territory-confirm": () => { $("#dialog").close(); A.toast("Declaring is a new capability (R4).", "territory") },
    "dismiss-banner": () => { try { sessionStorage.setItem("atlas-banner", "0") } catch {} ; render(true) },
    palette: (v) => openPalette(v ?? ""),
    shortcuts: () => dialog(shortcuts(), true),
    state: (v) => setPreview(v),
    theme: () => {
      const root = document.documentElement
      const light = root.dataset.colorScheme !== "light"
      root.dataset.colorScheme = light ? "light" : "dark"
      $(".brand").src = `../../../packages/app-shell/public/orchestra/hugr-horizontal-compact-${light ? "primary" : "inverse"}.svg`
    },
    direction: () => (document.documentElement.dir = document.documentElement.dir === "rtl" ? "ltr" : "rtl"),
  }

  const setPreview = (v) => {
    $("#preview-state").value = v
    A.state.preview = v
    render(true)
  }
  // Picking Core renames the key field and re-runs the checks at that tier.
  document.addEventListener("change", (event) => {
    if (event.target.name !== "tier") return
    const form = event.target.closest("form")
    const x = M().byKey[form?.querySelector("[data-value]")?.dataset.value]
    const label = form.querySelector("#token")?.closest("label")?.querySelector("span")
    if (label) label.textContent = event.target.value === "T0" ? "Ratifier name" : "Approval key"
    if (x && $("#checks")) $("#checks").outerHTML = checksStrip(M().checks(x, { tier: event.target.value, token: $("#token")?.value ?? "" }))
  })
  // The Checks strip re-reads the approval key as it is typed.
  document.addEventListener("input", (event) => {
    if (event.target.id !== "token") return
    const form = event.target.closest("form")
    const key = form?.querySelector("[data-value]")?.dataset.value
    const x = key && M().byKey[key]
    if (!x || !$("#checks")) return
    const tier = form.querySelector('input[name="tier"]:checked')?.value ?? "T1"
    const drafted = !!form.querySelector("#edit-text, .at-slotpick")
    $("#checks").outerHTML = checksStrip(M().checks(x, { tier, token: event.target.value, regrounds: drafted, draft: drafted }))
  })

  const step = (delta) => {
    const list = A.state.list
    if (!list.length) return
    const at = list.indexOf(A.state.query.fact)
    actions.open(list[Math.max(0, Math.min(list.length - 1, at < 0 ? 0 : at + delta))])
  }
  const copy = (text, message) => {
    const done = () => A.toast(message, "copy")
    navigator.clipboard?.writeText(text).then(done, done) ?? done()
  }
  const dialog = (html, wide = false) => {
    const el = $("#dialog")
    el.innerHTML = html
    el.classList.toggle("wide", wide)
    el.showModal()
    el.querySelector("textarea, input")?.focus()
  }

  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]")
    if (!el || !actions[el.dataset.action]) return
    event.preventDefault()
    event.stopPropagation()
    actions[el.dataset.action](el.dataset.value)
  })
  document.addEventListener("change", (event) => {
    if (event.target.id === "preview-state") return setPreview(event.target.value)
    if (event.target.id === "preview-data") return actions.data(event.target.value)
    const nav = event.target.dataset.nav
    if (nav) A.go(withQuery({ [nav]: event.target.value || null, n: null, fact: null }))
  })
  document.addEventListener("input", (event) => {
    if (event.target.id !== "list-search") return
    clearTimeout(A.searchTimer)
    A.searchTimer = setTimeout(() => { history.replaceState(null, "", withQuery({ q: event.target.value, fact: null, n: null })); render() }, 140)
  })

  /* ---------- Keyboard ---------- */
  let chord = false
  const chords = { o: "#/overview", e: "#/explore", n: "#/genesis", w: "#/how", k: "#/explore", r: "#/review", a: "#/activity", h: "#/overview?show=health", y: "#/memory/backend", s: "#/settings", c: "#/chat" }
  document.addEventListener("keydown", (event) => {
    const typing = event.target.matches("input, textarea, select")
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      return $(".at-palette") ? closePalette() : openPalette()
    }
    if ($(".at-palette")) return paletteKey(event)
    if ($("#dialog").open) return
    if (event.key === "Escape") {
      if (typing) return event.target.blur()
      if (A.state.query.fact) return actions.close()
    }
    if (typing) return
    if (chord) {
      chord = false
      if (chords[event.key]) { event.preventDefault(); return A.go(chords[event.key]) }
    }
    if (event.key === "g") return (chord = true)
    if (event.key === "/") { event.preventDefault(); return $("#list-search") ? $("#list-search").focus() : openPalette() }
    if (event.key === "?") return actions.shortcuts()
    if (event.key === "j" || event.key === "k") {
      event.preventDefault()
      if (A.state.query.fact) return step(event.key === "j" ? 1 : -1)
      const rows = [...main.querySelectorAll("[data-action][tabindex]")]
      return rows[Math.max(0, Math.min(rows.length - 1, rows.indexOf(document.activeElement) + (event.key === "j" ? 1 : -1)))]?.focus()
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-action][tabindex]")) {
      event.preventDefault()
      event.target.click()
    }
  })

  /* ---------- Search (⌘K) ---------- */
  let found = []
  let index = 0
  const everything = (words) => {
    const pages = [["Home", "#/overview", "home"], ["Explore · graph", "#/explore", "graph"], ["Explore · map", "#/explore?view=map", "stack"], ["Explore · list", "#/explore?view=list", "list"], ["Genesis", "#/genesis", "sparkle"], ["Architecture", "#/architecture", "stack"], ["Ownership", "#/own", "territory"], ["Follow one fact", "#/how", "fact"], ["Review · changed code", "#/review?tab=changed", "drift"], ["Review · mined", "#/review?tab=mined", "sparkle"], ["Review · to ratify", "#/review?tab=ratify", "shield"], ["Activity", "#/activity", "history"], ["Health", "#/overview?show=health", "health"], ["Settings · connection", "#/settings", "server"], ["Settings · territories", "#/settings?tab=territories", "territory"], ["Settings · permissions", "#/settings?tab=permissions", "lock"]]
      .map(([label, href, glyph]) => ({ group: "Go to", label, hint: "", glyph, run: () => A.go(href) }))
    const areas = M().units().map((u) => ({ group: "Units", label: u.id, hint: `${u.facts} facts`, glyph: "stack", run: () => A.go(`#/unit/${encodeURIComponent(u.id)}`) }))
    const files = [...new Set(M().live().map((x) => x.file))].map((f) => ({ group: "Files", label: f, hint: "", glyph: "code", run: () => A.go(`#/unit/${encodeURIComponent(f)}`) }))
    const facts = M().live().map((x) => ({ group: "Facts", label: x.claim, hint: x.file.split("/").at(-1), glyph: "fact", run: () => (["knowledge", "unit", "review"].includes(A.state.route) ? actions.open(x.key) : A.go(`#/unit/${encodeURIComponent(M().unitOf(x.file))}?fact=${x.key}`)) }))
    const memory = [["backend", "Backend"], ["jimmy", "Jimmy"], ["archie", "Archie"], ["maestro", "Maestro"]].map(([id, n]) => ({ group: "Memory", label: `${n}'s memory`, hint: "", glyph: "memory", run: () => A.go(`#/memory/${id}`) }))
    const acts = [["Switch light / dark", "eye", actions.theme], ["Keyboard shortcuts", "keyboard", actions.shortcuts]].map(([label, glyph, run]) => ({ group: "Actions", label, hint: "", glyph, run }))
    const match = (x) => words.every((w) => `${x.label} ${x.hint} ${x.group}`.toLowerCase().includes(w))
    return [...pages, ...areas, ...memory, ...acts].filter(match).concat(words.length ? files.filter(match).slice(0, 8) : [], words.length ? facts.filter(match).slice(0, 12) : [])
  }
  const openPalette = (prefix = "") => {
    $("#palette-root").innerHTML = `<div class="at-palette-backdrop" data-close="1"><div class="at-palette" role="dialog" aria-label="Search"><div class="at-palette-input">${A.icon("search")}<input id="palette-input" placeholder="Search facts, files, areas, memory and pages" aria-label="Search" autocomplete="off" value="${A.esc(prefix)}"><kbd>esc</kbd></div><div class="at-palette-list" id="palette-list" role="listbox"></div><div class="at-palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div></div></div>`
    const input = $("#palette-input")
    input.addEventListener("input", () => fill(input.value))
    $(".at-palette-backdrop").addEventListener("mousedown", (e) => e.target.dataset.close && closePalette())
    fill(prefix)
    input.focus()
  }
  const closePalette = () => ($("#palette-root").innerHTML = "")
  const fill = (raw) => {
    found = everything(raw.toLowerCase().split(/\s+/).filter(Boolean)).slice(0, 40)
    index = 0
    const groups = [...new Set(found.map((x) => x.group))]
    $("#palette-list").innerHTML = found.length
      ? groups.map((g) => `<div class="at-palette-group">${g}</div>${found.map((x, i) => (x.group === g ? `<button class="at-palette-item" role="option" data-i="${i}" aria-selected="${i === 0}">${A.icon(x.glyph)}<span class="grow">${A.esc(x.label)}</span><code>${A.esc(x.hint)}</code></button>` : "")).join("")}`).join("")
      : `<div class="at-palette-empty">Nothing matches “${A.esc(raw)}”.</div>`
    $("#palette-list").querySelectorAll(".at-palette-item").forEach((el) => {
      el.addEventListener("mousemove", () => select(Number(el.dataset.i)))
      el.addEventListener("click", () => run(Number(el.dataset.i)))
    })
  }
  const select = (i) => {
    index = i
    $("#palette-list").querySelectorAll(".at-palette-item").forEach((el) => el.setAttribute("aria-selected", Number(el.dataset.i) === i))
    $(`.at-palette-item[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" })
  }
  const run = (i) => { const item = found[i]; closePalette(); item?.run() }
  const paletteKey = (event) => {
    if (event.key === "Escape") return closePalette()
    if (event.key === "ArrowDown") { event.preventDefault(); return select(Math.min(found.length - 1, index + 1)) }
    if (event.key === "ArrowUp") { event.preventDefault(); return select(Math.max(0, index - 1)) }
    if (event.key === "Enter") { event.preventDefault(); return run(index) }
  }

  const shortcuts = () => `<form method="dialog">${head("Keyboard shortcuts", "")}
    <div class="mx-dialog-body"><div class="at-keys">
      <h5>Anywhere</h5><div>Search<span><kbd>⌘</kbd><kbd>K</kbd></span></div><div>Search this list<span><kbd>/</kbd></span></div><div>Shortcuts<span><kbd>?</kbd></span></div><div>Close the fact panel<span><kbd>esc</kbd></span></div>
      <h5>Lists</h5><div>Next<span><kbd>j</kbd></span></div><div>Previous<span><kbd>k</kbd></span></div><div>Open<span><kbd>↵</kbd></span></div><div></div>
      <h5>Go to</h5>${Object.entries({ o: "Overview", k: "Knowledge", r: "Review", a: "Activity", h: "Health", y: "Memory", s: "Settings", c: "Chat" }).map(([k, l]) => `<div>${l}<span><kbd>g</kbd><kbd>${k}</kbd></span></div>`).join("")}
    </div></div><footer class="mx-dialog-foot"><button class="mx-btn primary" value="ok">Done</button></footer></form>`

  /* ---------- Gallery ---------- */
  A.views.gallery = () => {
    const first = M().live()[0].key
    const drifted = M().live().find((x) => x.drift).key
    const screens = [
      ["Home", "#/overview", "home", "What Atlas knows, the live unit graph, and what it learned, caught and delivered."],
      ["Explore · graph", "#/explore", "graph", "The units as a graph: click one to see everything that depends on it."],
      ["Explore · map", "#/explore?view=map", "stack", "The units as a map: area is knowledge, colour is how much still holds."],
      ["Genesis", "#/genesis", "sparkle", "How Atlas learns a repository: the pipeline, a real claim with its reasoning, the configuration."],
      ["Architecture", "#/architecture", "stack", "Open knowledge (OKF): the layers, a write and a read step by step, the files on disk, identity, the portable bundle."],
      ["Ownership", "#/own", "territory", "One owner per module: what it knows, how it stays true, and how one changed byte holds the work."],
      ["Follow one fact", "#/how", "fact", "One real fact from mining to an agent, through the store."],
      ["A unit", "#/unit/packages%2Fknowledge", "stack", "The briefing an agent gets, watched being built, the file map, facts by kind."],
      ["A fact", `#/unit/packages%2Fcontracts?fact=${first}`, "eye", "Can I trust this sentence, and where did it come from."],
      ["A changed fact", `#/review?tab=changed&fact=${drifted}`, "drift", "The diff first, then what Atlas suggests."],
      ["Review · changed code", "#/review?tab=changed", "drift", "Facts whose code changed, with the merge check."],
      ["Review · mined", "#/review?tab=mined", "sparkle", "Suggestions from genesis; accept all with a result per row."],
      ["Review · to ratify", "#/review?tab=ratify", "shield", "Proposals to govern, and suggested core areas."],
      ["Activity", "#/activity", "history", "What agents read, saved and were held on, event by event."],
      ["Overview · health", "#/overview?show=health", "health", "Six checks on Overview; maintainer diagnostics in Settings › Store."],
      ["Settings", "#/settings", "settings", "Connection, territories, permissions, store."],
      ["Memory · Backend", "#/memory/backend", "memory", "Project memory and the memory log."],
      ["Task", "#/memory/backend/task/T-LIVE-2", "check", "Where it stopped and how to resume."],
      ["Transcript", "#/memory/backend/task/T-LIVE-2/transcript", "chat", "The seat session, with the checkpoint Atlas handed back."],
      ["Memory · Maestro", "#/memory/maestro", "memory", "Defined by Atlas, not bound in Orchestra today."],
      ["Agents › Backend", "#/agents/backend", "agents", "The profile links to memory in Atlas."],
      ["Chat", "#/chat", "chat", "One chip per turn opens what the agent got."],
    ]
    return {
      crumbs: [["Atlas", "#/overview"], ["All screens"]],
      html: `<div class="at-page"><div class="mx-heading"><div><div class="mx-eyebrow">Design preview</div><h1>All screens</h1><p>Facts, suggestions, reasoning and drift come from the standalone Atlas repository's store; dependents come from imports. Illustrated mode adds marked examples. Actions are simulated and can be undone.</p></div></div>
      <div class="at-gallery">${screens.map(([title, href, glyph, text]) => `<a class="at-gcard" href="${href}"><header><span class="mx-mark">${A.icon(glyph)}</span><strong>${title}</strong></header><p>${text}</p></a>`).join("")}
      <a class="at-gcard" href="#" data-action="palette"><header><span class="mx-mark">${A.icon("search")}</span><strong>Search</strong></header><p>⌘K across facts, files, areas, memory and pages.</p></a>
      <a class="at-gcard" href="#" data-action="state" data-value="held"><header><span class="mx-mark">${A.icon("warning")}</span><strong>Not connected</strong></header><p>The HOLD an Orchestra project without Atlas config gets.</p></a></div></div>`,
    }
  }

  $("#preview-data").value = A.illustrated ? "illustrated" : "real"
  window.addEventListener("hashchange", () => render())
  render()
})(window.Atlas)
