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
      main.innerHTML = view.html
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
    reground: (v) => change(v, { regrounded: true }, "Re-anchored to the current code. The claim stays the same; the anchor now matches HEAD."),
    retire: (v) => change(v, { retired: true }, "Retired. Agents stop receiving it; it stays in the store.", "minusc"),
    promote: (v) => change(v, { promotedNow: true }, "Promoted through the emit door. It now reaches agents in the advisory band."),
    discard: (v) => change(v, { discarded: true }, "Left in staging. It is hidden here and stays in the staging file.", "minusc"),
    "promote-all": () => dialog(promoteAll()),
    "promote-all-confirm": () => {
      $("#dialog").close()
      const keys = M().candidates.filter((x) => !x.promotedNow && !x.discarded).map((x) => x.key)
      change(keys, { promotedNow: true }, `${keys.length} candidates promoted. 596 already-promoted rows were re-checked and left unchanged.`)
    },
    ratify: (v) => dialog(ratifyDialog(M().byKey[v])),
    classify: (v) => dialog(classifyDialog(M().byKey[v])),
    "reject-ratify": (v) => change(v, { proposedTier: undefined }, "Rejected. The fact stays advisory; the proposer sees your decision.", "minusc"),
    data: (v) => { try { localStorage.setItem("atlas-data", v) } catch {} ; location.reload() },
    "classify-confirm": (v) => {
      const slot = $('input[name="slot"]:checked')?.value
      if (!slot) return A.toast("Pick a type first.", "info")
      $("#dialog").close()
      change(v, { slot }, `Classified as <code>${slot}</code> through the draft and emit doors. The fact moves under its type.`, "fact")
    },
    "ratify-confirm": (v) => {
      const tier = $('input[name="tier"]:checked')?.value ?? "T1"
      $("#dialog").close()
      change(v, { tier, proposedTier: undefined, ratifiedBy: tier === "T0" ? "you" : "maestro" }, tier === "T0" ? "Ratified as T0. It now governs every agent in this scope." : "Ratified as T1. It moved to the governing band.", "shield")
    },
    edit: (v) => dialog(editDialog(M().byKey[v])),
    save: (v) => {
      const claim = $("#edit-text").value.trim()
      $("#dialog").close()
      change(v, { claim, regrounded: true }, "Saved through the emit door. The edited claim replaces the old one; git keeps the prior bytes.")
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
    "archive-rule": (v) => {
      const [member, i] = v.split("|")
      const m = M().memory[member]
      const [r] = m.indexed.splice(Number(i), 1)
      m.archived.push(r)
      undo = () => { m.archived.splice(m.archived.indexOf(r), 1); m.indexed.splice(Number(i), 0, r) }
      A.toast(`Archived. It no longer rides in every turn; it stays in memory.jsonl.${undoLink}`, "download")
      render(true)
    },
    "restore-rule": (v) => {
      const [member, text] = v.split("|")
      const m = M().memory[member]
      const r = m.archived.find((x) => x.rule === text)
      m.archived.splice(m.archived.indexOf(r), 1)
      m.indexed.push({ ...r, frecency: 1 })
      A.toast("Restored to the indexed set.", "check")
      render(true)
    },
    respawn: (v) => dialog(respawnDialog(...v.split("|"))),
    "respawn-confirm": (v) => { $("#dialog").close(); A.toast(`Respawned on <code>${A.esc(v)}</code> with its latest checkpoint. The new invocation appears in the task timeline.`, "play") },
    "rule-confirm": (v) => {
      const [member, lesson, unit] = v.split("|")
      const rule = $("#rule-text").value.trim()
      const scope = $("#rule-scope").value.trim() || "*"
      const pm = A.projectMemory(member)
      const count = rule.split(/\s+/).filter(Boolean).length
      $("#dialog").close()
      const m = M().memory[member]
      const entry = { rule, scope, from: lesson, unit: unit || "manual", frecency: 1 }
      m.indexed.push(entry)
      undo = () => m.indexed.splice(m.indexed.indexOf(entry), 1)
      A.toast(`Indexed · ${count} tokens. It rides in every turn from the next one; secret-scanned before it was saved.${undoLink}`, "shield")
      history.replaceState(null, "", withQuery({ pm: "indexed" }))
      render(true)
    },
    territory: (v) => dialog(territoryDialog(v ?? "")),
    "territory-confirm": () => { $("#dialog").close(); A.toast("Territory declared in the catalog. Facts under it now have an owner and a tier.", "territory") },
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
    return `<form method="dialog">${head(`Promote ${n} candidates`, "Promote reads every staging row and sends it through the emit door. Rows already promoted are recognised by their content and left unchanged.")}
      <div class="mx-dialog-body"><div class="at-gates">${[["New", n, "blue"], ["Unchanged", 596, ""], ["Need ratify token", n, "warm"]].map(([l, v, t]) => `<div class="at-gate"><b class="at-state ${t}">${A.num(v)}</b><small>${l}</small></div>`).join("")}</div>
      <p class="mx-note">Each one is re-checked against the code now; a candidate whose file changed since mining is refused by the truth gate and stays in staging.</p></div>${foot("Acting as Maestro · scope atlas:mined", "promote-all-confirm", `Promote ${n}`)}</form>`
  }
  const ratifyDialog = (x) => `<form method="dialog">${head("Ratify", A.esc(x.claim))}<div class="mx-dialog-body">
      <div class="at-radio"><label><input type="radio" name="tier" value="T1" checked><span><b>T1 · load-bearing</b><small>Moves to the governing band. Needs a ratify token.</small></span></label>
      <label><input type="radio" name="tier" value="T0"><span><b>T0 · must be right</b><small>Becomes part of the constitution every agent reads. Only a person ratifies; Billy supplies the security input.</small></span></label></div>
      <label class="mx-field"><span>Note for the record</span><textarea placeholder="Why this should govern"></textarea></label></div>${foot("Through atlas-emit with your identity", "ratify-confirm", "Ratify", x.key)}</form>`
  const classifyDialog = (x) => `<form method="dialog">${head("Classify", `${A.esc(x.claim)}`)}
    <div class="mx-dialog-body at-slotpick">${M().SLOT_GROUPS.map(([g, meaning, slots]) => `<div class="at-slotgroup"><strong>${g}</strong><small>${meaning}</small>${slots.map((sl) => `<label><input type="radio" name="slot" value="${sl}" ${x.slot === sl ? "checked" : ""}><code>${sl}</code><span>${A.esc(M().SLOT_MEANING[sl])}</span></label>`).join("")}</div>`).join("")}</div>
    ${foot("A slot is part of the fact's identity: Atlas re-emits it through atlas-draft and atlas-emit", "classify-confirm", "Classify", x.key)}</form>`
  const editDialog = (x) => `<form method="dialog">${head("Edit claim", `Anchored to <code>${A.esc(x.file)}</code>. Advisory facts are edited in place; the old bytes stay in the store and in git.`)}
    <div class="mx-dialog-body"><label class="mx-field"><span>Claim</span><textarea id="edit-text" rows="4">${A.esc(x.claim)}</textarea></label><p class="mx-note">One sentence, checkable against the file. The truth gate re-derives the anchor before it is saved.</p></div>${foot("Through atlas-emit", "save", "Save", x.key)}</form>`
  const respawnDialog = (member, unit) => {
    const t = (A.spawns ?? []).find((x) => x.unit === unit)
    const c = t && [...t.checkpoints].reverse().find((x) => x.outcome === "admitted")
    const name = member[0].toUpperCase() + member.slice(1)
    return `<form method="dialog">${head(`Respawn ${name} on ${A.esc(unit)}`, `Maestro calls ${name} again on the same task. Atlas hands back the latest checkpoint once, before ${name} reads your packet.`)}
    <div class="mx-dialog-body"><div class="at-given" style="margin:0 0 14px">${A.icon("memory")}<span>Checkpoint handed back: <b>${A.esc(c?.entry.stoppedAt ?? "none — the resume would be refused")}</b></span></div>
    <label class="mx-field"><span>Packet</span><textarea rows="4">Continue this unit with the next phase your checkpoint names. When done, record an updated checkpoint.</textarea></label>
    <div class="mx-fields"><label class="mx-field"><span>Write paths</span><input value="counter.ts"></label><label class="mx-field"><span>Model</span><select><option>Same as last run</option><option>Claude Opus</option><option>Claude Sonnet</option></select></label></div>
    <p class="mx-note">Sent as <code>task</code> with <code>memoryUnit {"kind":"task","id":"${A.esc(unit)}"}</code>${t ? ` and task <code>${A.esc(t.taskRef)}</code>` : ""}.</p></div>${foot("Through Maestro", "respawn-confirm", "Respawn", unit)}</form>`
  }
  const ruleDialog = (member = "backend", lesson = "", unit = "") => `<form method="dialog">${head("Index a project-memory rule", "Rules ride in every turn, so write one imperative line: an always or a never, with where it applies.")}
    <div class="mx-dialog-body"><label class="mx-field"><span>Rule</span><textarea id="rule-text" rows="3">${A.esc(lesson)}</textarea></label><label class="mx-field"><span>Applies to</span><input id="rule-scope" placeholder="a path glob, a tool or a phase — * for everywhere" value="${lesson ? "tasks with phased packets" : ""}"></label>
    <p class="mx-note">It starts with frecency 1, halves every wave it goes unused, and is archived below 0.10.</p></div>${foot("Through atlas_memory_emit · secret-scanned", "rule-confirm", "Index", `${member}|${lesson}|${unit}`)}</form>`
  const territoryDialog = (path) => `<form method="dialog">${head("Declare territory", "A territory gives a region of the code an owner and a tier. Overlaps resolve deterministically.")}
    <div class="mx-dialog-body"><div class="mx-fields"><label class="mx-field"><span>Name</span><input value="${A.esc(path.split("/").at(-1) || "")}"></label><label class="mx-field"><span>Owner</span><select><option>Backend</option><option>Archie</option><option>Patty</option><option>Billy</option></select></label></div>
    <label class="mx-field"><span>Globs</span><input value="${A.esc(path ? `${path}/**` : "")}"></label><label class="mx-field"><span>Tier</span><select><option>T2 · default</option><option>T1 · load-bearing</option><option>T0 · must be right (a person ratifies)</option></select></label></div>${foot("Written to the territory catalog", "territory-confirm", "Declare")}</form>`

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

  const shortcuts = () => `<form method="dialog">${head("Keyboard shortcuts", "You can change these in Settings › Shortcuts.")}
    <div class="mx-dialog-body"><div class="at-keys">
      <h5>Anywhere</h5><div>Search<span><kbd>⌘</kbd><kbd>K</kbd></span></div><div>Search this list<span><kbd>/</kbd></span></div><div>Shortcuts<span><kbd>?</kbd></span></div><div>Close the fact panel<span><kbd>esc</kbd></span></div>
      <h5>Lists</h5><div>Next<span><kbd>j</kbd></span></div><div>Previous<span><kbd>k</kbd></span></div><div>Open<span><kbd>↵</kbd></span></div><div></div>
      <h5>Go to</h5>${Object.entries({ o: "Overview", m: "Map", k: "Knowledge", u: "Curation", y: "Memory", h: "History", s: "Settings", c: "Chat" }).map(([k, l]) => `<div>${l}<span><kbd>g</kbd><kbd>${k}</kbd></span></div>`).join("")}
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
      html: `<div class="at-page"><div class="mx-heading"><div><div class="mx-eyebrow">Design preview · real store</div><h1>All screens</h1><p>Every fact, candidate, reasoning, drift and dependent here comes from the real Atlas store over its own code. Use State at the top for “building” and “not connected”. Curation actions work and can be undone.</p></div></div>
      <div class="at-gallery">${screens.map(([title, href, glyph, text]) => `<a class="at-gcard" href="${href}"><header><span class="mx-mark">${A.icon(glyph)}</span><strong>${title}</strong></header><p>${text}</p></a>`).join("")}
      <a class="at-gcard" href="#" data-action="palette"><header><span class="mx-mark">${A.icon("search")}</span><strong>Search</strong></header><p>⌘K across facts, files, areas, memory and pages.</p></a>
      <a class="at-gcard" href="#" data-action="state" data-value="held"><header><span class="mx-mark">${A.icon("warning")}</span><strong>Not connected</strong></header><p>The HOLD an Orchestra project without Atlas config gets.</p></a></div></div>`,
    }
  }

  $("#preview-data").value = A.illustrated ? "illustrated" : "real"
  window.addEventListener("hashchange", () => render())
  render()
})(window.Atlas)
