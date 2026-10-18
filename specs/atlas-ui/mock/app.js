// Router, rail, fact panel, curation actions (with Undo), search, keyboard and the gallery for the preview.
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
  const atlasRoutes = ["overview", "knowledge", "unit", "fact", "curation", "memory", "history", "settings", "gallery"]
  const routes = [...atlasRoutes, "agents", "chat"]

  /* ---------- Routing ---------- */
  const parse = () => {
    const raw = location.hash.replace(/^#\/?/, "") || "overview"
    const [path, search = ""] = raw.split("?")
    const [route, ...rest] = path.split("/")
    // The old file map now lives on unit pages.
    if (route === "map") return { route: "unit", params: [new URLSearchParams(search).get("path") || "packages/knowledge"], query: {}, raw }
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
      const banner = atlas && M().R.illustrated && !view.flush ? `<div class="at-illus">${A.icon("info")}<span><b>Illustrated.</b> Items marked <span class="at-pill">example</span> are invented to show a store after some stewardship: slots, ratifications, territories, Awareness, rules, and Archie's and Jimmy's tasks.</span><button class="mx-link" data-action="data" data-value="real">Show the real store only</button></div>` : ""
      main.innerHTML = banner + view.html
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
    host.innerHTML = `<aside class="atlas-context" aria-label="Atlas"><header class="context-head"><span class="mx-mark">${A.icon("atlas")}</span><div><strong>Atlas</strong><small>project atlas</small></div></header>
      <div class="context-group">
        ${link("#/overview", "Overview", "overview", s.route === "overview")}
        ${link("#/knowledge", "Knowledge", "stack", ["knowledge", "unit", "fact"].includes(s.route), count(M().units().length))}
        ${link("#/curation", "Curation", "inbox", s.route === "curation", count(M().curationCount(), "warm"))}
      </div>
      <div class="context-group"><div class="context-label">MEMORY</div>
        ${[["backend", "Backend"], ["jimmy", "Jimmy"], ["archie", "Archie"], ["maestro", "Maestro"]].map(([id, n]) => link(`#/memory/${id}`, n, "memory", member === id, M().memory[id].bound ? "" : '<span class="context-hint">off</span>')).join("")}
      </div>
      <div class="context-group">${link("#/history", "History", "history", s.route === "history")}${link("#/settings", "Settings", "settings", s.route === "settings")}</div>
      <footer class="context-footer">${held ? "<span>Not connected</span>" : `<span data-tip="Knowledge lives in .atlas/ on this machine and is not versioned by git.">${A.icon("server")} Local store · gen ${M().R.gen}</span><a href="#/gallery">${A.icon("eye")}All screens</a>`}</footer></aside>`
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
  const change = (keys, patch, message, glyph = "check") => {
    const items = [].concat(keys).map((k) => M().byKey[k])
    const before = items.map((x) => Object.fromEntries(Object.keys(patch).map((k) => [k, x[k]])))
    items.forEach((x) => Object.assign(x, patch))
    undo = () => items.forEach((x, i) => Object.assign(x, before[i]))
    if (items.some((x) => x.key === A.state.query.fact) && (patch.retired || patch.promotedNow || patch.discarded)) history.replaceState(null, "", withQuery({ fact: null }))
    A.toast(`${message}${undoLink}`, glyph)
    render(true)
  }

  const actions = {
    go: (v) => A.go(v),
    back: () => history.back(),
    open: (v) => A.go(A.state.route === "fact" ? `#/fact/${v}` : withQuery({ fact: v, why: null })),
    close: () => {
      const key = A.state.query.fact
      A.go(withQuery({ fact: null, why: null }))
      setTimeout(() => main.querySelector(`[data-value="${key}"][data-action="open"]`)?.focus({ preventScroll: true }), 0)
    },
    step: (v) => step(Number(v)),
    "toggle-why": () => A.go(withQuery({ why: A.state.query.why === "all" ? null : "all" })),
    "copy-link": (v) => copy(`${location.href.split("#")[0]}#/fact/${v}`, "Link copied"),
    copy: (v) => copy(v, "Copied"),
    toast: (v) => A.toast(A.esc(v), "info"),
    undo: () => { undo?.(); undo = null; A.toast("Undone", "back"); render(true) },
    retire: (v) => M().provenance() !== "trusted" ? A.toast("Refused: this store is tracked by git, so every write is refused.", "xc") : change(v, { retired: true }, "Drafted a superseding fact against the current file and emitted it (authoring SUPERSEDED). Reads do not filter it yet, so agents still receive it (R6).", "minusc"),
    promote: (v) => M().provenance() !== "trusted" ? A.toast("Refused: this store is tracked by git, so every write is refused.", "xc") : change(v, { promotedNow: true }, "Promoted through the emit door, if its file is unchanged since mining (R2: single-row promote is a new capability). Orchestra's agents read the reviewed Own snapshot, not this store."),
    discard: (v) => change(v, { discarded: true }, "Left in staging. It is hidden here and stays in the staging file.", "minusc"),
    "promote-all": () => dialog(promoteAll()),
    "promote-all-confirm": () => {
      $("#dialog").close()
      if (M().provenance() !== "trusted") return A.toast("Refused: this store is tracked by git, so promote refuses every row.", "xc")
      const keys = M().candidates.filter((x) => !x.promotedNow && !x.discarded).map((x) => x.key)
      const stale = M().facts.filter((x) => M().state(x) === "drifted").length
      change(keys, { promotedNow: true }, `Promote re-presented every staging row: ${keys.length} new facts emitted, ${A.num(M().facts.length - stale)} already-promoted rows deduplicated, ${stale} refused <code>ungrounded</code> because their files changed. Rows are refused one by one; the batch is not atomic.`)
    },
    ratify: (v) => dialog(ratifyDialog(M().byKey[v])),
    classify: (v) => dialog(classifyDialog(M().byKey[v])),
    "reject-ratify": (v) => change(v, { proposedTier: undefined }, "Rejected (R3). The fact stays advisory; Atlas has no proposal state to record the decision in today.", "minusc"),
    data: (v) => { try { localStorage.setItem("atlas-data", v) } catch {} ; location.reload() },
    "classify-confirm": (v) => {
      const slot = $('input[name="slot"]:checked')?.value
      if (!slot) return A.toast("Pick a type first.", "info")
      $("#dialog").close()
      const x = M().byKey[v]
      if (M().state(x) === "drifted") return A.toast("Refused by the truth gate: the anchor is not FRESH. Rewrite the claim first.", "xc")
      // nodeKey = hash(anchor ‖ slot): a new identity. Shown as a marked placeholder, not a computed hash.
      const copy = { ...x, key: `new-${slot}-${x.key.slice(0, 12)}`, slot, tier: "T2", proposedTier: undefined, example: true }
      M().facts.push(copy)
      M().byKey[copy.key] = copy
      undo = () => { M().facts.splice(M().facts.indexOf(copy), 1); delete M().byKey[copy.key] }
      A.toast(`Wrote a new T2 fact at (anchor, <code>${slot}</code>); a draft always starts at T2, so ratify it again if it should govern. The unclassified fact stays served, and retiring it does not withdraw it yet (R6).${undoLink}`, "fact")
      render(true)
    },
    "ratify-confirm": (v) => {
      const tier = $('input[name="tier"]:checked')?.value ?? "T1"
      $("#dialog").close()
      change(v, { tier, proposedTier: undefined }, tier === "T0" ? "Re-emitted as T0 with the ratifier token billy. Its claims were replaced by the ratified one, and the constitution line in each bound member's header now counts it." : "Re-emitted as T1. It moved to the governing band; its claims were replaced by the ratified one.", "shield")
    },
    edit: (v) => dialog(editDialog(M().byKey[v])),
    save: (v) => {
      const claim = $("#edit-text").value.trim()
      $("#dialog").close()
      const x = M().byKey[v]
      if (claim === x.claim) return A.toast("Unchanged claim: re-emitting it is deduplicated and leaves the fact as it is.", "info")
      // Same tier ⇒ the claim set is a union (knowledge/src/write/upsert.ts): the old claim stays and is still served.
      change(v, { claim: `${x.claim}; ${claim}`, regrounded: true }, M().state(x) === "drifted" ? "Emitted with a grounding at HEAD, so the fact is fresh again, but at the same tier the new claim joins the old one and both are served (R8)." : "Emitted. At the same tier the new claim joins the fact's claim set; the old one stays (R8).")
    },
    mine: () => {
      const scope = $("#mine-scope")?.value || "the whole repository"
      A.toast(`In the app this runs genesis on <code>${A.esc(scope)}</code>. Proposals land in Candidates.`, "sparkle")
    },
    "promote-rule": (v) => dialog(ruleDialog(...(v ?? "backend||").split("|"))),
    "dismiss-proposal": (v) => {
      const [member, lesson] = v.split("|")
      const m = M().memory[member]
      m.dismissed.add(lesson)
      undo = () => m.dismissed.delete(lesson)
      A.toast(`Dismissed. The lesson stays in its task checkpoint.${undoLink}`, "minusc")
      render(true)
    },
    "rule-confirm": (v) => {
      const [member, lesson, unit] = v.split("|")
      const rule = $("#rule-text").value.trim()
      const scope = $("#rule-scope").value.trim() || "*"
      const pm = A.projectMemory(member)
      const count = rule.split(/\s+/).filter(Boolean).length
      $("#dialog").close()
      const m = M().memory[member]
      const entry = { rule, scope, from: lesson, age: 0 }
      const all = Object.values(M().memory).flatMap((x) => x.rules)
      const ages = all.map((r) => r.age)
      M().appendRecord()
      m.rules.push(entry)
      undo = () => { m.rules.splice(m.rules.indexOf(entry), 1); all.forEach((r, i) => (r.age = ages[i])) }
      if (pm.lifetime + count > (member === "maestro" ? 800 : 500)) return A.toast(`Refused: over-cap. ${A.esc(member)} has written ${pm.lifetime} tokens of rules in its lifetime; this one would pass ${member === "maestro" ? 800 : 500}.`, "xc"), undo()
      A.toast(`Indexed · ${count} tokens. It rides in every request from the next one; every other rule in the repository just aged one record.${undoLink}`, "shield")
      history.replaceState(null, "", withQuery({ pm: "indexed" }))
      render(true)
    },
    territory: (v) => dialog(territoryDialog(v ?? "")),
    "territory-confirm": () => { $("#dialog").close(); A.toast("Declared (R4). The catalog is committed JSON; Maestro re-reads it on the next verified read.", "territory") },
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

  /* ---------- Dialogs ---------- */
  const head = (title, text) => `<header class="mx-dialog-head"><div><h2 id="dialog-title">${title}</h2><p>${text}</p></div></header>`
  const foot = (note, action, label, value = "") => `<footer class="mx-dialog-foot"><span>${note}</span><button class="mx-btn" value="cancel">Cancel</button><button class="mx-btn primary" type="button" data-action="${action}" data-value="${A.esc(value)}">${label}</button></footer>`
  const promoteAll = () => {
    const n = M().candidates.filter((x) => !x.promotedNow && !x.discarded).length
    return `<form method="dialog">${head("Promote all staged rows", "atlas promote takes no arguments. It re-presents every staging row through the emit door, already-promoted rows included, and each must pass the gates again. The batch is not atomic.")}
      <div class="mx-dialog-body"><div class="at-gates">${[["Staging rows", 660, ""], ["Not yet promoted", n, "blue"], ["Need a ratify token", 660, "warm"]].map(([l, v, t]) => `<div class="at-gate"><b class="at-state ${t}">${A.num(v)}</b><small>${l}</small></div>`).join("")}</div>
      <p class="mx-note">A row whose file changed since mining is refused by the truth gate. Rows stay in staging after promotion; staging has no marker or delete.</p></div>${foot("Actor seat:orchestrator · scope atlas:mined", "promote-all-confirm", "Promote all")}</form>`
  }
  const ratifyDialog = (x) => `<form method="dialog">${head("Ratify", A.esc(x.claim))}<div class="mx-dialog-body">
      <div class="at-radio"><label><input type="radio" name="tier" value="T1" checked><span><b>T1 · load-bearing</b><small>Moves to the governing band. Needs a ratify token.</small></span></label>
      <label><input type="radio" name="tier" value="T0"><span><b>T0 · must be right</b><small>Counted in the constitution line of each bound member's header. Needs the ratifier token <code>billy</code>.</small></span></label></div>
      <p class="ins-note warm">Raising the tier replaces the fact's claim set with this one claim. The store does not record who ratified.</p></div>${foot("Re-emitted through atlas-emit", "ratify-confirm", "Ratify", x.key)}</form>`
  const classifyDialog = (x) => `<form method="dialog">${head("Classify", `${A.esc(x.claim)}`)}
    <div class="mx-dialog-body at-slotpick">${M().SLOT_GROUPS.map(([g, meaning, slots]) => `<div class="at-slotgroup"><strong>${g}</strong><small>${meaning}</small>${slots.map((sl) => `<label><input type="radio" name="slot" value="${sl}" ${x.slot === sl ? "checked" : ""}><code>${sl}</code><span>${A.esc(M().SLOT_MEANING[sl])}</span></label>`).join("")}</div>`).join("")}</div>
    ${foot("The slot is part of the nodeKey: this writes a new T2 fact (draft, then emit); the old one stays served", "classify-confirm", "Classify", x.key)}</form>`
  const editDialog = (x) => `<form method="dialog">${head(M().state(x) === "drifted" ? "Rewrite claim" : "Edit claim", M().state(x) === "drifted" ? `The file changed. Write the claim as it holds now: it is drafted against the current <code>${A.esc(x.file)}</code> and emitted with a new grounding. At the same tier it joins the old claim, which stays served (R8).` : `At the same tier the new claim joins the fact's claim set. If it cites other symbols, the anchor moves and it becomes a new fact.`)}
    <div class="mx-dialog-body"><label class="mx-field"><span>Claim</span><textarea id="edit-text" rows="4">${A.esc(x.claim)}</textarea></label><p class="mx-note">One sentence, checkable against the file. The truth gate re-derives the anchor before it is saved.</p></div>${foot("Through atlas-emit", "save", "Save", x.key)}</form>`
  const respawnDialog = (member, unit) => {
    const t = (A.spawns ?? []).find((x) => x.unit === unit)
    const c = t && [...t.checkpoints].reverse().find((x) => x.outcome === "admitted")
    const name = member[0].toUpperCase() + member.slice(1)
    return `<form method="dialog">${head(`Resume ${name} on ${A.esc(unit)}`, `Maestro resumes ${name}'s session on this task. Atlas adds the latest admitted checkpoint once, before ${name} reads the packet.`)}
    <div class="mx-dialog-body"><div class="at-given" style="margin:0 0 14px">${A.icon("memory")}<span>Checkpoint handed back: <b>${A.esc(c?.entry.stoppedAt ?? "none — the resume would be refused")}</b></span></div>
    <label class="mx-field"><span>Packet</span><textarea rows="4">Continue this unit with the next phase your checkpoint names. When done, record an updated checkpoint.</textarea></label>
    <div class="mx-fields"><label class="mx-field"><span>Write paths</span><input value="${A.esc(t?.writePaths?.join(", ") ?? "")}" placeholder="as in the last dispatch"></label><label class="mx-field"><span>Model</span><select><option>Same as last run</option><option>Claude Opus</option><option>Claude Sonnet</option></select></label></div>
    <p class="mx-note">Maestro calls <code>task</code> with <code>task_id</code>${t?.taskRef ? ` <code>${A.esc(t.taskRef)}</code>` : " (the seat session)"} and <code>memoryUnit {"kind":"task","id":"${A.esc(unit)}"}</code>. In a fresh session with no receipt, Atlas hands back the unit's single checkpoint or refuses as <code>ambiguous</code> when there are several.</p>${A.newcap("R5")}</div>${foot("Through Maestro", "respawn-confirm", "Ask Maestro to resume", unit)}</form>`
  }
  const ruleDialog = (member = "backend", lesson = "", unit = "") => `<form method="dialog">${head("Index a project-memory rule", "Rules ride in every turn, so write one imperative line: an always or a never, with where it applies.")}
    <div class="mx-dialog-body"><label class="mx-field"><span>Rule</span><textarea id="rule-text" rows="3">${A.esc(lesson)}</textarea></label><label class="mx-field"><span>Applies to</span><input id="rule-scope" placeholder="a path glob, a tool or a phase — * for everywhere" value="${lesson ? "tasks with phased packets" : ""}"></label>
    <p class="mx-note">A rule enters with frecency 1. Every later record in memory.jsonl, by any member and checkpoints included, halves it; after four more records it falls below 0.10 and leaves the header. Re-sending it unchanged is deduplicated; writing it again with a new scope renews it.</p>${A.newcap("R1")}</div>${foot("Written as the member through atlas_memory_emit · secret-scanned", "rule-confirm", "Index", `${member}|${lesson}|${unit}`)}</form>`
  const territoryDialog = (path) => `<form method="dialog">${head("Declare territory", "A territory gives units an owner and a tier; the tier is ratified by a person. Today the catalog is TERRITORY-CATALOG.json, committed and edited by hand.")}
    <div class="mx-dialog-body"><div class="mx-fields"><label class="mx-field"><span>Name</span><input value="${A.esc(path.split("/").at(-1) || "")}"></label><label class="mx-field"><span>Owner</span><select><option>Backend</option><option>Archie</option><option>Patty</option><option>Billy</option></select></label></div>
    <label class="mx-field"><span>Globs</span><input value="${A.esc(path ? `${path}/**` : "")}"></label><label class="mx-field"><span>Tier</span><select><option>T2 · default</option><option>T1 · load-bearing</option><option>T0 · must be right (a person ratifies)</option></select></label></div>${A.newcap("R4")}${foot("Written to TERRITORY-CATALOG.json", "territory-confirm", "Declare")}</form>`

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
  const chords = { o: "#/overview", k: "#/knowledge", u: "#/curation", y: "#/memory/backend", h: "#/history", s: "#/settings", c: "#/chat" }
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
    const pages = [["Overview", "#/overview", "overview"], ["Knowledge", "#/knowledge", "stack"], ["Curation · drifted", "#/curation?tab=drift", "drift"], ["Curation · candidates", "#/curation?tab=candidates", "sparkle"], ["Curation · ratify", "#/curation?tab=ratify", "shield"], ["Curation · mine", "#/curation?tab=mine", "play"], ["History", "#/history", "history"], ["Settings · territories", "#/settings", "territory"], ["Settings · write policy", "#/settings?tab=policy", "lock"]]
      .map(([label, href, glyph]) => ({ group: "Go to", label, hint: "", glyph, run: () => A.go(href) }))
    const areas = M().units().map((u) => ({ group: "Units", label: u.id, hint: `${u.facts} facts`, glyph: "stack", run: () => A.go(`#/unit/${encodeURIComponent(u.id)}`) }))
    const files = [...new Set(M().live().map((x) => x.file))].map((f) => ({ group: "Files", label: f, hint: "", glyph: "code", run: () => A.go(`#/unit/${encodeURIComponent(f)}`) }))
    const facts = M().live().map((x) => ({ group: "Facts", label: x.claim, hint: x.file.split("/").at(-1), glyph: "fact", run: () => (["knowledge", "unit", "curation"].includes(A.state.route) ? actions.open(x.key) : A.go(`#/unit/${encodeURIComponent(M().unitOf(x.file))}?fact=${x.key}`)) }))
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
      <h5>Go to</h5>${Object.entries({ o: "Overview", k: "Knowledge", u: "Curation", y: "Memory", h: "History", s: "Settings", c: "Chat" }).map(([k, l]) => `<div>${l}<span><kbd>g</kbd><kbd>${k}</kbd></span></div>`).join("")}
    </div></div><footer class="mx-dialog-foot"><button class="mx-btn primary" value="ok">Done</button></footer></form>`

  /* ---------- Gallery ---------- */
  A.views.gallery = () => {
    const first = M().live()[0].key
    const drifted = M().live().find((x) => x.drift).key
    const screens = [
      ["Overview", "#/overview", "overview", "Counts, freshness, what waits for a decision, where knowledge lives, code changes that drifted it."],
      ["Knowledge · units", "#/knowledge", "stack", "Every Own unit with its facts, drift and dependents; search across all facts."],
      ["A unit", "#/unit/packages%2Fknowledge", "stack", "The pack an agent receives, facts grouped by type (slot), dependents and finer scopes."],
      ["A file inside a unit", "#/unit/packages%2Fknowledge%2Fsrc%2Ftypes.ts", "fact", "The same view scoped down to one file."],
      ["Fact panel", `#/unit/packages%2Fcontracts?fact=${first}`, "eye", "Anchor, how genesis derived it, provenance, dependents, other facts on the file."],
      ["Drifted fact", `#/fact/${drifted}`, "drift", "A real drift: the commits and the diff since the fact was derived."],
      ["Curation · drifted", "#/curation", "drift", "63 real drifts to check against their change, filterable by commit and area."],
      ["Curation · candidates", "#/curation?tab=candidates", "sparkle", "64 mined candidates in staging with genesis' reasoning, and the four gates."],
      ["Curation · ratify", "#/curation?tab=ratify", "shield", "Nothing waiting; facts flagged by the policy's T0 keywords."],
      ["Curation · mine", "#/curation?tab=mine", "play", "Run genesis on a scope: arms, sites, budget and cost."],
      ["Memory · Backend", "#/memory/backend", "memory", "Project memory (proposals and indexed rules with their token total) and the memory log of every task."],
      ["Task memory", "#/memory/backend/task/T-LIVE-2", "check", "One real task: latest checkpoint, every invocation, all checkpoints (refused too), files changed."],
      ["Task transcript", "#/memory/backend/task/T-LIVE-2/transcript", "chat", "The respawnable seat session, with the checkpoint Atlas handed back and every memory write."],
      ["Memory · Maestro", "#/memory/maestro", "memory", "Defined by Atlas, not bound in Orchestra today."],
      ["History", "#/history", "history", "Code changes that drifted knowledge, store generations, memory writes."],
      ["Settings", "#/settings", "settings", "Territories, write policy, index and store."],
      ["Agents › Backend", "#/agents/backend", "agents", "How the agent profile links to its memory in Atlas."],
      ["Chat", "#/chat?used=1", "chat", "What the agent read and wrote in Atlas during a turn."],
    ]
    return {
      crumbs: [["Atlas", "#/overview"], ["All screens"]],
      html: `<div class="at-page"><div class="mx-heading"><div><div class="mx-eyebrow">Design preview</div><h1>All screens</h1><p>Facts, candidates, reasoning and drift come from the standalone Atlas repository's store over its own code; dependents are approximated from imports. Illustrated mode adds marked examples on top. Use State at the top for “building” and “not connected”. Curation actions are simulated and can be undone.</p></div></div>
      <div class="at-gallery">${screens.map(([title, href, glyph, text]) => `<a class="at-gcard" href="${href}"><header><span class="mx-mark">${A.icon(glyph)}</span><strong>${title}</strong></header><p>${text}</p></a>`).join("")}
      <a class="at-gcard" href="#" data-action="palette"><header><span class="mx-mark">${A.icon("search")}</span><strong>Search</strong></header><p>⌘K across facts, files, areas, memory and pages.</p></a>
      <a class="at-gcard" href="#" data-action="state" data-value="held"><header><span class="mx-mark">${A.icon("warning")}</span><strong>Not connected</strong></header><p>The HOLD an Orchestra project without Atlas config gets.</p></a></div></div>`,
    }
  }

  $("#preview-data").value = A.illustrated ? "illustrated" : "real"
  window.addEventListener("hashchange", () => render())
  render()
})(window.Atlas)
