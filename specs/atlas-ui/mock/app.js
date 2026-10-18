// Router, navigation, details panel, review actions, command palette and keyboard for the Atlas preview.
// Every view is a URL (hash route), so back/forward, reload and shared links land on the same screen.
;(function (A) {
  const $ = (s) => document.querySelector(s)
  const main = $("#main")
  const panel = $("#inspector")
  A.state = { preview: "ready", list: [] }

  const appNav = [
    ["home", "Home", "home"], ["chat", "Chat", "chat", "#/chat"], ["agents", "Agents", "agents", "#/agents/backend"], ["maestro", "Maestro", "maestro"],
    ["workflows", "Workflows", "workflow"], ["atlas", "Atlas", "atlas", "#/overview"], ["sep"], ["mcp", "MCP", "code"], ["skills", "Skills", "sparkle"],
    ["plugins", "Plugins", "code"], ["hooks", "Hooks", "hooks"], ["actions", "Actions", "bolt"], ["schedule", "Schedule", "clock"],
    ["env", ".env", "lock"], ["dock", "Dock", "dock"], ["workspaces", "Workspaces", "server"],
  ]
  const atlasRoutes = ["overview", "knowledge", "review", "item", "gallery"]
  const views = ["overview", "knowledge", "review", "item", "agents", "chat", "gallery"]

  /* ---------- Routing ---------- */
  const parse = () => {
    const raw = location.hash.replace(/^#\/?/, "") || "overview"
    const [path, search = ""] = raw.split("?")
    const [route, ...rest] = path.split("/")
    return { route: views.includes(route) ? route : "overview", params: rest.length ? [decodeURIComponent(rest.join("/"))] : [], query: Object.fromEntries(new URLSearchParams(search)), raw }
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
    const page = `${s.raw.split("?")[0]}?${new URLSearchParams(Object.entries(s.query).filter(([k]) => k !== "item"))}|${A.state.preview}`
    const samePage = page === lastPage && !force
    lastPage = page
    const atlas = atlasRoutes.includes(s.route)
    const view = atlas && A.state.preview === "held" ? A.views.held() : atlas && A.state.preview === "building" && s.route !== "overview" ? building() : A.views[s.route](A.state)
    renderSidebar(s)
    renderRail(s)
    $("#breadcrumbs").innerHTML = `Orchestra${view.crumbs.map(([label, href, mono], i) => `<span class="sep">/</span>${href && i < view.crumbs.length - 1 ? `<a href="${href}">${A.esc(label)}</a>` : `<span class="crumb-current">${mono ? `<code>${A.esc(label)}</code>` : A.esc(label)}</span>`}`).join("")}`
    if (!samePage) {
      const focused = document.activeElement?.id === "list-search"
      const keep = force ? main.scrollTop : 0
      main.innerHTML = view.html
      main.classList.toggle("flush", !!view.flush)
      if (focused) {
        const input = $("#list-search")
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
      } else {
        main.scrollTop = keep
        if (!force) main.focus({ preventScroll: true })
      }
      if (!force) main.querySelector(".at-card.focus")?.scrollIntoView({ block: "start" })
    }
    // Openable rows in document order drive j/k and the panel's previous/next.
    A.state.list = [...new Set([...main.querySelectorAll('[data-action="open"][data-value]')].map((el) => el.dataset.value))]
    main.querySelectorAll(".at-item[data-value]").forEach((el) => el.classList.toggle("selected", el.dataset.value === s.query.item))
    renderPanel(s)
  }

  const building = () => ({
    crumbs: [["Atlas", "#/overview"], ["Reading the code"]],
    html: `<div class="at-page"><div class="at-building"><span class="spin"></span><div><strong>Reading the code at ${A.data.HEAD}</strong><small>About 5 seconds the first time. The list fills in when it's done.</small></div></div>
      <section class="at-panel"><div class="at-panel-body">${Array.from({ length: 7 }, (_, i) => `<div style="display:flex;gap:14px;align-items:center;padding:11px 0"><span class="at-skel" style="inline-size:64px;block-size:18px"></span><span class="at-skel" style="flex:1;block-size:12px;max-inline-size:${72 - i * 6}%"></span><span class="at-skel" style="inline-size:80px;block-size:12px"></span></div>`).join("")}</div></section></div>`,
  })

  const renderSidebar = (s) => {
    const active = s.route === "chat" ? "chat" : s.route === "agents" ? "agents" : "atlas"
    const need = A.data.reviewCount()
    $("#sidebar-nav").innerHTML = appNav.map(([id, label, glyph, href]) => (id === "sep" ? '<span class="nav-sep"></span>' : `<a class="nav-item ${id === active ? "active" : ""}" href="${href ?? "#"}" ${href ? "" : `data-action="toast" data-value="${label} is outside this preview."`} ${id === active ? 'aria-current="page"' : ""}>${A.icon(glyph)}<span>${label}</span>${id === "atlas" && need && A.state.preview === "ready" ? `<span class="wf-count warm">${need}</span>` : ""}</a>`)).join("")
  }

  const link = (href, label, glyph, selected, extra = "", depth = 0) =>
    `<a class="context-item ${selected ? "selected" : ""} ${depth ? "nested" : ""}" href="${href}" ${selected ? 'aria-current="page"' : ""}>${A.icon(glyph)}<span>${A.esc(label)}</span>${extra}</a>`

  const renderRail = (s) => {
    const host = $("#atlas-context")
    if (s.route === "chat") return (host.innerHTML = "")
    if (s.route === "agents") {
      const current = s.params[0] ?? "backend"
      host.innerHTML = `<aside class="atlas-context" aria-label="Agents"><div class="context-group" style="margin:0"><div class="context-label">AGENTS</div>
        ${Object.entries(A.data.agents).filter(([, a]) => !a.human).map(([id, a]) => link(`#/agents/${id}`, a.name, a.memory ? "memory" : "agents", id === current)).join("")}</div></aside>`
      return
    }
    const held = A.state.preview === "held"
    const need = A.data.reviewCount()
    const item = s.route === "item" ? A.data.byId[s.params[0]] : s.query.item && A.data.byId[s.query.item]
    const folder = s.query.folder ?? (s.route === "item" && item ? item.folder : null)
    const areaId = s.query.area ?? (folder && A.data.areas.find((a) => a.folders.some((f) => f.path === folder))?.id)
    const health = (a) => {
      const st = A.data.stats(A.data.items.filter((x) => !x.removed && A.data.areaOf(x)?.id === a.id))
      return st.broken ? '<span class="wf-dot bad" title="Something here is no longer true"></span>' : st.moved ? '<span class="wf-dot warm" title="Some references need updating"></span>' : '<span class="wf-dot good" title="Up to date"></span>'
    }
    host.innerHTML = `<aside class="atlas-context" aria-label="Atlas"><header class="context-head"><span class="mx-mark">${A.icon("atlas")}</span><div><strong>Atlas</strong><small>hugr-orchestra</small></div></header>
      <div class="context-group">
        ${link("#/overview", "Overview", "overview", s.route === "overview")}
        ${link("#/knowledge", "Knowledge", "fact", s.route === "knowledge" && !areaId && !folder)}
        ${link("#/review", "Review", "inbox", s.route === "review", need && !held ? `<span class="wf-count warm">${need}</span>` : "")}
      </div>
      ${held ? "" : `<div class="context-group"><div class="context-label">AREAS</div>
        ${A.data.areas.map((a) => `${link(`#/knowledge?area=${a.id}`, a.name, "territory", (s.route === "knowledge" || s.route === "item") && areaId === a.id && !folder, health(a))}${areaId === a.id ? a.folders.map((f) => link(`#/knowledge?folder=${encodeURIComponent(f.path)}`, f.path.split("/").at(-1), "pin", folder === f.path, "", 1)).join("") : ""}`).join("")}</div>`}
      <footer class="context-footer">${held ? "<span>Atlas is off for this project</span>" : `<span>Checked 12 min ago</span><a href="#" data-action="recheck">${A.icon("refresh")}Check again</a><a href="#/gallery">${A.icon("eye")}All screens</a>`}</footer></aside>`
  }

  const renderPanel = (s) => {
    const id = s.query.item
    if (!id || !A.data.byId[id] || s.route === "item") {
      panel.hidden = true
      panel.innerHTML = ""
      return
    }
    panel.innerHTML = A.views.detail(id, A.state)
    panel.hidden = false
    main.querySelector(`[data-value="${id}"][data-action="open"]`)?.scrollIntoView({ block: "nearest" })
  }

  /* ---------- Changes (reversible, with Undo) ---------- */
  let undo = null
  const undoLink = '<button class="mx-link" data-action="undo">Undo</button>'
  const change = (id, patch, message) => {
    const x = A.data.byId[id]
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, x[k]]))
    Object.assign(x, patch)
    undo = () => Object.assign(x, before)
    if (patch.removed && A.state.query.item === id) history.replaceState(null, "", withQuery({ item: null }))
    A.toast(`${message}${undoLink}`, "check")
    render(true)
  }

  const actions = {
    go: (v) => A.go(v),
    back: () => history.back(),
    open: (v) => A.go(A.state.route === "item" ? `#/item/${v}` : withQuery({ item: v })),
    close: () => {
      const id = A.state.query.item
      A.go(withQuery({ item: null }))
      setTimeout(() => main.querySelector(`[data-value="${id}"][data-action="open"]`)?.focus({ preventScroll: true }), 0)
    },
    step: (v) => step(Number(v)),
    "copy-link": (v) => copy(`${location.href.split("#")[0]}#/item/${v}`, "Link copied"),
    toast: (v) => A.toast(A.esc(v), "info"),
    recheck: () => A.toast(`Checked again against <code>${A.data.HEAD}</code>. Nothing new.`, "refresh"),
    undo: () => { undo?.(); undo = null; A.toast("Undone", "back"); render(true) },
    confirm: (v) => {
      const x = A.data.byId[v]
      if (A.data.pending.includes(x)) {
        A.data.pending.splice(A.data.pending.indexOf(x), 1)
        A.data.items.push(Object.assign(x, { confirmedBy: "you", when: "just now" }))
        undo = () => { A.data.items.splice(A.data.items.indexOf(x), 1); A.data.pending.push(Object.assign(x, { confirmedBy: undefined })) }
        A.toast(`Confirmed. Every agent now treats it as a hard limit.${undoLink}`, "lock")
        return render(true)
      }
      change(v, { kind: "rule", confirmedBy: "you", when: "just now" }, "Confirmed. Agents can now rely on it.")
    },
    dismiss: (v) => {
      const x = A.data.byId[v]
      if (A.data.pending.includes(x)) return change(v, { done: true }, `Rejected. ${A.data.agents[x.by].name} will see your decision.`)
      change(v, { removed: true }, "Dismissed. It stays in the history.")
    },
    remove: (v) => change(v, { removed: true }, "Removed. Agents stop using it from their next turn; it stays in the history."),
    update: (v) => change(v, { status: "ok" }, "Reference updated."),
    "update-all": () => {
      const moved = A.data.review().moved
      moved.forEach((x) => (x.status = "ok"))
      undo = () => moved.forEach((x) => (x.status = "moved"))
      A.toast(`${moved.length} references updated.${undoLink}`, "check")
      render(true)
    },
    "fix-code": () => A.toast(`Started a session asking Backend to make the code follow this rule again. <a class="mx-link" href="#/chat">Open chat</a>`, "chat"),
    forget: () => A.toast("Forgotten. The agent won't carry this lesson any more.", "check"),
    edit: (v) => dialog(editDialog(A.data.byId[v])),
    save: (v) => {
      const text = $("#edit-text").value.trim()
      $("#dialog").close()
      const x = A.data.byId[v]
      change(v, { text, status: x.status === "broken" ? "ok" : x.status, kind: x.kind === "suggestion" ? "rule" : x.kind, confirmedBy: x.confirmedBy ?? "you", when: "just now" }, "Saved. Agents use the new wording from their next turn.")
    },
    enable: () => { setPreview("building"); setTimeout(() => setPreview("ready"), 1800) },
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

  const editDialog = (x) => `<form method="dialog"><header class="mx-dialog-head"><div><h2 id="dialog-title">${x.kind === "suggestion" ? "Edit and confirm" : x.status === "broken" ? "Update the rule" : "Edit"}</h2><p>${x.status === "broken" ? A.esc(x.why) : "Agents use the new wording from their next turn. The old wording stays in the history."}</p></div></header>
    <div class="mx-dialog-body"><label class="mx-field"><span>What should agents know?</span><textarea id="edit-text" rows="3">${A.esc(x.text)}</textarea></label>
    <p class="mx-note">Applies to ${A.where(x)} in ${A.esc(A.data.areaOf(x)?.name ?? "this project")}</p></div>
    <footer class="mx-dialog-foot"><button class="mx-btn" value="cancel">Cancel</button><button class="mx-btn primary" type="button" data-action="save" data-value="${x.id}">${x.kind === "suggestion" ? "Save and confirm" : "Save"}</button></footer></form>`

  const step = (delta) => {
    const list = A.state.list
    if (!list.length) return
    const at = list.indexOf(A.state.query.item)
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
    el.querySelector("textarea")?.focus()
  }

  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]")
    if (!el || !actions[el.dataset.action]) return
    event.preventDefault()
    event.stopPropagation()
    actions[el.dataset.action](el.dataset.value)
  })
  $("#preview-state").addEventListener("change", (e) => setPreview(e.target.value))
  document.addEventListener("input", (event) => {
    if (event.target.id !== "list-search") return
    clearTimeout(A.searchTimer)
    A.searchTimer = setTimeout(() => { history.replaceState(null, "", withQuery({ q: event.target.value, item: null })); render() }, 120)
  })

  /* ---------- Keyboard ---------- */
  let chord = false
  const chords = { o: "#/overview", k: "#/knowledge", r: "#/review", a: "#/agents/backend", c: "#/chat" }
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
      if (A.state.query.item) return actions.close()
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
      if (A.state.query.item) return step(event.key === "j" ? 1 : -1)
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
  const everything = () => {
    const d = A.data
    return [
      { group: "Go to", label: "Overview", hint: "Atlas", glyph: "overview", run: () => A.go("#/overview") },
      { group: "Go to", label: "Review", hint: `${d.reviewCount()} waiting`, glyph: "inbox", run: () => A.go("#/review") },
      { group: "Go to", label: "All knowledge", hint: "Atlas", glyph: "fact", run: () => A.go("#/knowledge") },
      ...d.areas.map((a) => ({ group: "Areas", label: a.name, hint: a.path, glyph: "territory", run: () => A.go(`#/knowledge?area=${a.id}`) })),
      ...d.areas.flatMap((a) => a.folders).map((f) => ({ group: "Folders", label: f.path, hint: "folder", glyph: "pin", run: () => A.go(`#/knowledge?folder=${encodeURIComponent(f.path)}`) })),
      ...d.items.filter((x) => !x.removed).map((x) => ({ group: "Knowledge", label: x.text, hint: x.file, glyph: x.kind === "caution" ? "warning" : x.kind === "suggestion" ? "sparkle" : "shield", run: () => (atlasRoutes.includes(A.state.route) && A.state.route !== "item" ? actions.open(x.id) : A.go(`#/knowledge?item=${x.id}`)) })),
      ...Object.entries(d.agents).filter(([, a]) => a.memory).map(([id, a]) => ({ group: "Agent memory", label: `${a.name}'s memory`, hint: a.role, glyph: "memory", run: () => A.go(`#/agents/${id}`) })),
      { group: "Actions", label: "Check the code again", hint: "", glyph: "refresh", run: actions.recheck },
      { group: "Actions", label: "Switch light / dark", hint: "", glyph: "eye", run: actions.theme },
      { group: "Actions", label: "Keyboard shortcuts", hint: "?", glyph: "keyboard", run: actions.shortcuts },
    ]
  }
  const openPalette = (prefix = "") => {
    $("#palette-root").innerHTML = `<div class="at-palette-backdrop" data-close="1"><div class="at-palette" role="dialog" aria-label="Search"><div class="at-palette-input">${A.icon("search")}<input id="palette-input" placeholder="Search knowledge, areas, folders and agents" aria-label="Search" autocomplete="off" value="${A.esc(prefix)}"><kbd>esc</kbd></div><div class="at-palette-list" id="palette-list" role="listbox"></div><div class="at-palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div></div></div>`
    const input = $("#palette-input")
    input.addEventListener("input", () => fill(input.value))
    $(".at-palette-backdrop").addEventListener("mousedown", (e) => e.target.dataset.close && closePalette())
    fill(prefix)
    input.focus()
  }
  const closePalette = () => ($("#palette-root").innerHTML = "")
  const fill = (raw) => {
    const words = raw.toLowerCase().split(/\s+/).filter(Boolean)
    found = everything().filter((x) => words.every((w) => `${x.label} ${x.hint} ${x.group}`.toLowerCase().includes(w))).slice(0, 40)
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

  const shortcuts = () => `<form method="dialog"><header class="mx-dialog-head"><div><h2 id="dialog-title">Keyboard shortcuts</h2><p>You can change these in Settings › Shortcuts.</p></div></header>
    <div class="mx-dialog-body"><div class="at-keys">
      <h5>Anywhere</h5><div>Search<span><kbd>⌘</kbd><kbd>K</kbd></span></div><div>Search this list<span><kbd>/</kbd></span></div><div>Shortcuts<span><kbd>?</kbd></span></div><div>Close details<span><kbd>esc</kbd></span></div>
      <h5>Lists</h5><div>Next<span><kbd>j</kbd></span></div><div>Previous<span><kbd>k</kbd></span></div><div>Open details<span><kbd>↵</kbd></span></div><div></div>
      <h5>Go to</h5><div>Overview<span><kbd>g</kbd><kbd>o</kbd></span></div><div>Knowledge<span><kbd>g</kbd><kbd>k</kbd></span></div><div>Review<span><kbd>g</kbd><kbd>r</kbd></span></div><div>Agent memory<span><kbd>g</kbd><kbd>a</kbd></span></div><div>Chat<span><kbd>g</kbd><kbd>c</kbd></span></div>
    </div></div><footer class="mx-dialog-foot"><button class="mx-btn primary" value="ok">Done</button></footer></form>`

  /* ---------- Gallery of every screen, for review ---------- */
  A.views.gallery = () => {
    const screens = [
      ["Overview", "#/overview", "overview", "What agents know, how much is up to date, what needs you, areas and recent changes."],
      ["All knowledge", "#/knowledge", "fact", "Everything, grouped by folder, with kind and status filters."],
      ["An area", "#/knowledge?area=core", "territory", "One area of the code; the side list shows its folders."],
      ["A folder", `#/knowledge?folder=${encodeURIComponent("packages/core/src/session-v2")}`, "pin", "One folder with its rules, cautions and suggestions."],
      ["Details panel", "#/knowledge?area=core&item=admit", "eye", "Opens beside the list: where it applies, who said it, what else to check."],
      ["Details page", "#/item/conflict", "expand", "The same details as a page you can link to."],
      ["Review · no longer true", "#/review?tab=broken", "xc", "The code changed: update the rule, remove it, or fix the code."],
      ["Review · confirmation", "#/review?tab=confirm", "lock", "A critical rule only a person can confirm."],
      ["Review · suggestions", "#/review?tab=suggestions", "sparkle", "What agents proposed: confirm, edit or dismiss."],
      ["Review · code moved", "#/review?tab=moved", "drift", "Still true: update references one by one or all at once."],
      ["Agents › Memory", "#/agents/backend", "memory", "What one agent remembers: current work, lessons, notes from PRs."],
      ["Agent without memory", "#/agents/patty", "agents", "What you see for an agent that keeps no memory."],
      ["Chat citations", "#/chat?used=1", "chat", "Knowledge the agent used, inline; opens the details panel."],
    ]
    return {
      crumbs: [["Atlas", "#/overview"], ["All screens"]],
      html: `<div class="at-page"><div class="mx-heading"><div><div class="mx-eyebrow">Design preview</div><h1>All screens</h1><p>Use the State menu at the top to see “reading the code” and “Atlas is off”. Review actions work and can be undone.</p></div></div>
      <div class="at-gallery">${screens.map(([title, href, glyph, text]) => `<a class="at-gcard" href="${href}"><header><span class="mx-mark">${A.icon(glyph)}</span><strong>${title}</strong></header><p>${text}</p></a>`).join("")}
      <a class="at-gcard" href="#" data-action="palette"><header><span class="mx-mark">${A.icon("search")}</span><strong>Search</strong></header><p>⌘K finds knowledge, areas, folders and agents.</p></a>
      <a class="at-gcard" href="#" data-action="edit" data-value="conflict"><header><span class="mx-mark">${A.icon("fact")}</span><strong>Update a rule</strong></header><p>The edit dialog for a rule that no longer holds.</p></a>
      <a class="at-gcard" href="#" data-action="state" data-value="held"><header><span class="mx-mark">${A.icon("atlas")}</span><strong>Atlas is off</strong></header><p>What a project without Atlas sees.</p></a></div></div>`,
    }
  }

  window.addEventListener("hashchange", () => render())
  render()
})(window.Atlas)
