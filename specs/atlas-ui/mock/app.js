// Router, chapter navigation, inspector, command palette and keyboard model for the Atlas preview.
// Every screen is a URL (hash route), so back/forward, reload and shared links land on the same view.
;(function (A) {
  const $ = (s) => document.querySelector(s)
  const main = $("#main")
  const inspector = $("#inspector")
  A.state = { preview: "ready", list: [] }

  const appNav = [
    ["home", "Home", "home"], ["chat", "Chat", "chat"], ["agents", "Agents", "agents"], ["maestro", "Maestro", "maestro"],
    ["workflows", "Workflows", "workflow"], ["atlas", "Atlas", "atlas"], ["sep"], ["mcp", "MCP", "code"], ["skills", "Skills", "sparkle"],
    ["plugins", "Plugins", "code"], ["hooks", "Hooks", "hooks"], ["actions", "Actions", "bolt"], ["schedule", "Schedule", "clock"],
    ["env", ".env", "lock"], ["dock", "Dock", "dock"], ["workspaces", "Workspaces", "server"],
  ]

  const contextNav = () => {
    const drift = A.data.semanticTotal
    return [
      ["KNOWLEDGE", [["overview", "Overview", "overview", "#/overview"], ["territories", "Territories", "territory", "#/territories"], ["facts", "Facts", "fact", "#/facts", "fact"], ["drift", "Drift", "drift", "#/drift", null, `<span class="wf-count bad">${drift}</span>`], ["relations", "Relations", "relations", "#/relations"], ["negations", "Negations", "negation", "#/negations"]]],
      ["MEMORY", ["backend", "jimmy", "archie"].map((s) => [`memory/${s}`, A.data.seats[s].label, "memory", `#/memory/${s}`])],
      ["GOVERNANCE", [["history", "History", "history", "#/history"], ["proposals", "Proposals", "inbox", "#/proposals", null, '<span class="context-phase">W4</span>'], ["ratify", "Ratification", "shield", "#/ratify", null, '<span class="wf-count">3</span>']]],
      ["STORE", [["health", "Store health", "health", "#/health"]]],
    ]
  }

  /* ---------- Routing ---------- */
  const parse = () => {
    const raw = location.hash.replace(/^#\/?/, "") || "overview"
    const [path, search = ""] = raw.split("?")
    const [route, ...rest] = path.split("/")
    const query = Object.fromEntries(new URLSearchParams(search))
    return { route: A.views[route] && !["inspector", "timeline", "blastTree", "ratifyDialog", "compareDialog", "held"].includes(route) ? route : "overview", params: rest.map(decodeURIComponent).filter(Boolean).length ? [rest.map(decodeURIComponent).join("/")] : [], query, raw }
  }
  const withQuery = (patch) => {
    const s = parse()
    const q = { ...s.query, ...patch }
    Object.keys(q).forEach((k) => (q[k] === undefined || q[k] === null || q[k] === "") && delete q[k])
    const path = s.raw.split("?")[0]
    return `#/${path}${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ""}`
  }
  A.go = (href) => (location.hash = href.replace(/^#/, ""))

  /* ---------- Render ---------- */
  let lastPage = ""
  const render = () => {
    const s = parse()
    Object.assign(A.state, s)
    const page = `${s.raw.split("?")[0]}?${new URLSearchParams(Object.entries(s.query).filter(([k]) => k !== "inspect"))}|${A.state.preview}`
    const samePage = page === lastPage
    lastPage = page
    const view = A.state.preview === "held" && s.route !== "gallery" && s.route !== "session" ? A.views.held(A.state) : A.state.preview === "building" && !["overview", "gallery", "session"].includes(s.route) ? building(s) : A.views[s.route](A.state)
    renderSidebar(s)
    renderContext(s)
    renderCrumbs(view.crumbs, s)
    if (!samePage) {
      const searchFocused = document.activeElement?.id === "fact-search"
      main.innerHTML = view.html
      main.classList.toggle("flush", !!view.flush)
      if (searchFocused) {
        const input = $("#fact-search")
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
      } else {
        main.scrollTop = 0
        main.focus({ preventScroll: true })
      }
    }
    // Inspectable rows in document order drive j/k and the inspector's previous/next.
    A.state.list = [...new Set([...main.querySelectorAll('[data-action="inspect"][data-value]')].map((el) => el.dataset.value))]
    main.querySelectorAll('[data-action="inspect"]').forEach((el) => {
      const on = el.dataset.value === s.query.inspect
      el.classList.toggle("selected", on && el.matches(".at-row"))
      if (el.matches("tr")) el.setAttribute("aria-selected", on)
    })
    renderInspector(s)
  }

  const building = (s) => ({
    crumbs: [["Atlas", "#/overview"], [s.route[0].toUpperCase() + s.route.slice(1)]],
    html: `<div class="at-page"><div class="mx-heading"><div><div class="mx-eyebrow">Atlas</div><h1>${s.route[0].toUpperCase() + s.route.slice(1)}</h1></div></div>
      <div class="at-building"><span class="spin"></span><div><strong>Building the structural index for ${A.data.HEAD}</strong><small>About 5 seconds on first open. The list fills in when the index is ready; no placeholder numbers.</small></div></div>
      <section class="at-panel"><div class="at-panel-body">${Array.from({ length: 7 }, (_, i) => `<div style="display:flex;gap:14px;align-items:center;padding:10px 0"><span class="at-skel" style="inline-size:22px;block-size:22px"></span><span class="at-skel" style="flex:1;block-size:12px;max-inline-size:${70 - i * 6}%"></span><span class="at-skel" style="inline-size:52px;block-size:12px"></span></div>`).join("")}</div></section></div>`,
  })

  const renderSidebar = (s) => {
    const active = s.route === "session" ? "chat" : "atlas"
    $("#sidebar-nav").innerHTML = appNav.map(([id, label, glyph]) => (id === "sep" ? '<span class="nav-sep"></span>' : `<a class="nav-item ${id === active ? "active" : ""}" href="${id === "atlas" ? "#/overview" : id === "chat" ? "#/session" : "#"}" ${id === "atlas" || id === "chat" ? "" : `data-action="toast" data-value="${label} is outside this preview."`} ${id === active ? 'aria-current="page"' : ""}>${A.icon(glyph)}<span>${label}</span>${id === "atlas" ? '<span class="nav-new">NEW</span>' : ""}</a>`)).join("")
  }

  const renderContext = (s) => {
    const host = $("#atlas-context")
    if (s.route === "session") return (host.innerHTML = "")
    const current = s.route === "memory" ? `memory/${s.params[0] ?? "backend"}` : s.route === "scope" ? "territories" : s.route === "fact" ? "facts" : s.route
    const t = A.data.territories
    host.innerHTML = `<aside class="atlas-context" aria-label="Atlas navigation"><header class="context-head"><span class="mx-mark">${A.icon("atlas")}</span><div><strong>Atlas</strong><small>hugr-orchestra · ${A.state.preview === "held" ? "not configured" : A.data.HEAD}</small></div></header>
      ${contextNav().map(([label, items]) => `<div class="context-group"><div class="context-label">${label}</div>${items.map(([id, text, glyph, href, , extra]) => `<a class="context-item ${current === id ? "selected" : ""}" href="${href}" ${current === id ? 'aria-current="page"' : ""}>${A.icon(glyph)}<span>${text}</span>${A.state.preview === "held" ? "" : extra ?? ""}</a>`).join("")}</div>`).join("")}
      <footer class="context-footer"><a href="#/gallery">${A.icon("eye")}All screens</a><span>${t.length} territories · sample data</span></footer></aside>`
  }

  const renderCrumbs = (crumbs, s) => {
    const root = s.route === "session" ? "" : ""
    $("#breadcrumbs").innerHTML = `Orchestra${root}${crumbs.map(([label, href, mono], i) => `<span class="sep">/</span>${href && i < crumbs.length - 1 ? `<a href="${href}">${A.esc(label)}</a>` : `<span class="crumb-current">${mono ? `<code>${A.esc(label)}</code>` : A.esc(label)}</span>`}`).join("")}`
  }

  const renderInspector = (s) => {
    const key = s.query.inspect
    if (!key || !A.data.byKey[key] || s.route === "fact") {
      inspector.hidden = true
      inspector.innerHTML = ""
      return
    }
    const wasOpen = !inspector.hidden && inspector.dataset.key
    inspector.innerHTML = A.views.inspector(key, A.state)
    inspector.dataset.key = key
    inspector.hidden = false
    if (!wasOpen) inspector.style.animation = ""
    main.querySelector(`[data-value="${key}"][data-action="inspect"]`)?.scrollIntoView({ block: "nearest" })
  }

  /* ---------- Actions ---------- */
  const actions = {
    go: (v) => A.go(v),
    back: () => history.back(),
    inspect: (v) => A.go(withQuery({ inspect: v })),
    "close-inspector": () => {
      const key = A.state.query.inspect
      A.go(withQuery({ inspect: null }))
      setTimeout(() => main.querySelector(`[data-value="${key}"][data-action="inspect"]`)?.focus({ preventScroll: true }), 0)
    },
    "inspect-step": (v) => step(Number(v)),
    copy: (v) => copy(v, v.length === 64 ? "Id copied" : "Copied"),
    "copy-link": (v) => copy(`${location.href.split("#")[0]}#/fact/${v}`, "Link to this fact copied"),
    toast: (v) => A.toast(v, "info"),
    locked: (v) => A.toast(`<b>${A.esc(v)}</b> is a governed write. It arrives in W4 through an Atlas door, with your identity on the record.`, "lock"),
    refresh: () => A.toast(`Re-checked against <code>${A.data.HEAD}</code>. No new drift.`, "refresh"),
    palette: (v) => openPalette(v ?? ""),
    shortcuts: () => dialog(shortcuts(), true),
    ratify: (v) => dialog(A.views.ratifyDialog(Number(v))),
    compare: (v) => dialog(A.views.compareDialog(v)),
    state: (v) => { $("#preview-state").value = v; A.state.preview = v; lastPage = ""; render() },
    "toggle-depth": (v) => {
      const set = new Set((A.state.query.collapsed ?? "").split(",").filter(Boolean))
      set.has(v) ? set.delete(v) : set.add(v)
      A.go(withQuery({ collapsed: [...set].join(",") }))
    },
    theme: () => {
      const root = document.documentElement
      const light = root.dataset.colorScheme !== "light"
      root.dataset.colorScheme = light ? "light" : "dark"
      $(".brand").src = `../../../packages/app-shell/public/orchestra/hugr-horizontal-compact-${light ? "primary" : "inverse"}.svg`
    },
    direction: () => (document.documentElement.dir = document.documentElement.dir === "rtl" ? "ltr" : "rtl"),
  }

  const step = (delta) => {
    const list = A.state.list
    if (!list.length) return
    const index = list.indexOf(A.state.query.inspect)
    const next = list[Math.max(0, Math.min(list.length - 1, index < 0 ? 0 : index + delta))]
    A.go(withQuery({ inspect: next }))
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
  }

  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]")
    if (!el || !actions[el.dataset.action]) return
    if (el.closest("#dialog") && el.dataset.action === "locked") event.preventDefault()
    if (el.tagName === "A" || el.tagName === "BUTTON" || el.matches("tr, .at-row, .at-node, .ins-rel, g")) event.preventDefault()
    actions[el.dataset.action](el.dataset.value)
  })

  $("#preview-state").addEventListener("change", (e) => actions.state(e.target.value))

  document.addEventListener("input", (event) => {
    if (event.target.id !== "fact-search") return
    clearTimeout(A.searchTimer)
    A.searchTimer = setTimeout(() => history.replaceState(null, "", withQuery({ q: event.target.value, inspect: null })) || render(), 120)
  })

  /* ---------- Keyboard ---------- */
  let chord = null
  const chords = { o: "#/overview", t: "#/territories", f: "#/facts", d: "#/drift", r: "#/relations", n: "#/negations", m: "#/memory/backend", h: "#/history", s: "#/health", c: "#/session", a: "#/gallery" }
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
      if (A.state.query.inspect) return actions["close-inspector"]()
    }
    if (typing) return
    if (chord) {
      const href = chords[event.key]
      chord = null
      if (href) { event.preventDefault(); return A.go(href) }
    }
    if (event.key === "g") return (chord = setTimeout(() => (chord = null), 900))
    if (event.key === "/") {
      event.preventDefault()
      return $("#fact-search") ? $("#fact-search").focus() : openPalette()
    }
    if (event.key === "?") return actions.shortcuts()
    if (event.key === "j" || event.key === "k") {
      event.preventDefault()
      if (A.state.query.inspect) return step(event.key === "j" ? 1 : -1)
      const rows = [...main.querySelectorAll('[data-action="inspect"][tabindex], [data-action="go"][tabindex]')]
      const i = rows.indexOf(document.activeElement)
      return rows[Math.max(0, Math.min(rows.length - 1, i + (event.key === "j" ? 1 : -1)))]?.focus()
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-action][tabindex]")) {
      event.preventDefault()
      event.target.click()
    }
  })

  /* ---------- Command palette ---------- */
  let paletteItems = []
  let paletteIndex = 0
  const allItems = () => {
    const d = A.data
    return [
      ...A.screens.map(([id, title, href, glyph]) => ({ group: "Go to", label: title, hint: id, glyph, run: () => A.go(href) })),
      ...d.territories.map((t) => ({ group: "Scopes", label: t.name, hint: t.globs[0], glyph: "territory", kind: "scope", run: () => A.go(`#/facts?territory=${t.id}`) })),
      ...Object.keys(d.scopes).concat(d.scopes["packages/core/src/session-v2"].finer).map((p) => ({ group: "Scopes", label: p, hint: "scope briefing", glyph: "pin", kind: "scope", run: () => A.go(`#/scope/${encodeURIComponent(p)}`) })),
      ...d.blast.groups.flatMap((g) => g.nodes).concat([{ path: d.blast.unit }]).map((n) => ({ group: "Units", label: n.path, hint: "relations", glyph: "code", kind: "unit", run: () => A.go(`#/relations?unit=${encodeURIComponent(n.path)}`) })),
      ...d.facts.map((x) => ({ group: "Facts", label: x.claim, hint: `${x.tier} · ${A.short(x.key)}`, glyph: "fact", run: () => A.go(A.state.route === "fact" ? `#/fact/${x.key}` : withQuery({ inspect: x.key })) })),
      ...["backend", "jimmy", "archie"].map((s) => ({ group: "Seats", label: `${d.seats[s].label} memory`, hint: d.seats[s].role, glyph: "memory", run: () => A.go(`#/memory/${s}`) })),
      { group: "Actions", label: "Re-check drift now", hint: "reconcile", glyph: "refresh", run: actions.refresh },
      { group: "Actions", label: "Toggle light / dark", hint: "", glyph: "eye", run: actions.theme },
      { group: "Actions", label: "Keyboard shortcuts", hint: "?", glyph: "keyboard", run: actions.shortcuts },
    ]
  }
  const openPalette = (prefix = "") => {
    $("#palette-root").innerHTML = `<div class="at-palette-backdrop" data-close="1"><div class="at-palette" role="dialog" aria-label="Command palette"><div class="at-palette-input">${A.icon("search")}<input id="palette-input" placeholder="Search screens, scopes, facts, seats and actions" aria-label="Search" autocomplete="off" value="${A.esc(prefix)}"><kbd>esc</kbd></div><div class="at-palette-list" id="palette-list" role="listbox"></div><div class="at-palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>scope:</kbd> <kbd>unit:</kbd> narrow</span></div></div></div>`
    const input = $("#palette-input")
    input.addEventListener("input", () => fillPalette(input.value))
    $(".at-palette-backdrop").addEventListener("mousedown", (e) => e.target.dataset.close && closePalette())
    fillPalette(prefix)
    input.focus()
  }
  const closePalette = () => ($("#palette-root").innerHTML = "")
  const fillPalette = (raw) => {
    const [, kind, rest] = raw.match(/^(scope|unit):\s*(.*)$/) ?? [null, null, raw]
    const words = rest.toLowerCase().split(/\s+/).filter(Boolean)
    paletteItems = allItems().filter((x) => (!kind || x.kind === kind) && words.every((w) => `${x.label} ${x.hint} ${x.group}`.toLowerCase().includes(w))).slice(0, 40)
    paletteIndex = 0
    const groups = [...new Set(paletteItems.map((x) => x.group))]
    $("#palette-list").innerHTML = paletteItems.length
      ? groups.map((g) => `<div class="at-palette-group">${g}</div>${paletteItems.map((x, i) => (x.group === g ? `<button class="at-palette-item" role="option" data-i="${i}" aria-selected="${i === 0}">${A.icon(x.glyph)}<span class="grow">${A.esc(x.label)}</span><code>${A.esc(x.hint)}</code></button>` : "")).join("")}`).join("")
      : `<div class="at-palette-empty">Nothing matches “${A.esc(rest)}”.<br><small>Atlas searches claims, anchors, scopes and seats.</small></div>`
    $("#palette-list").querySelectorAll(".at-palette-item").forEach((el) => {
      el.addEventListener("mousemove", () => select(Number(el.dataset.i)))
      el.addEventListener("click", () => runPalette(Number(el.dataset.i)))
    })
  }
  const select = (i) => {
    paletteIndex = i
    $("#palette-list").querySelectorAll(".at-palette-item").forEach((el) => el.setAttribute("aria-selected", Number(el.dataset.i) === i))
    $(`.at-palette-item[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" })
  }
  const runPalette = (i) => {
    const item = paletteItems[i]
    closePalette()
    item?.run()
  }
  const paletteKey = (event) => {
    if (event.key === "Escape") return closePalette()
    if (event.key === "ArrowDown") { event.preventDefault(); return select(Math.min(paletteItems.length - 1, paletteIndex + 1)) }
    if (event.key === "ArrowUp") { event.preventDefault(); return select(Math.max(0, paletteIndex - 1)) }
    if (event.key === "Enter") { event.preventDefault(); return runPalette(paletteIndex) }
  }

  const shortcuts = () => `<form method="dialog"><header class="mx-dialog-head"><div><h2 id="dialog-title">Keyboard shortcuts</h2><p>Everything in Atlas is reachable from the keyboard. Shortcuts are user-editable in Settings › Shortcuts.</p></div></header>
    <div class="mx-dialog-body"><div class="at-keys">
      <h5>Anywhere</h5>
      <div>Command palette<span><kbd>⌘</kbd><kbd>K</kbd></span></div><div>Search this list<span><kbd>/</kbd></span></div>
      <div>Shortcuts<span><kbd>?</kbd></span></div><div>Close inspector or dialog<span><kbd>esc</kbd></span></div>
      <h5>Lists and inspector</h5>
      <div>Next row / fact<span><kbd>j</kbd></span></div><div>Previous row / fact<span><kbd>k</kbd></span></div>
      <div>Inspect row<span><kbd>↵</kbd></span></div><div>Open fact as page<span>inspector ${A.icon("expand")}</span></div>
      <h5>Go to</h5>
      ${Object.entries({ o: "Overview", t: "Territories", f: "Facts", d: "Drift", r: "Relations", n: "Negations", m: "Memory", h: "History", s: "Store health", c: "Session citations", a: "All screens" }).map(([k, l]) => `<div>${l}<span><kbd>g</kbd><kbd>${k}</kbd></span></div>`).join("")}
    </div></div><footer class="mx-dialog-foot"><button class="mx-btn primary" value="ok">Done</button></footer></form>`

  window.addEventListener("hashchange", render)
  render()
})(window.Atlas)
