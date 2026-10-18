// Rendering helpers shared by every Atlas preview screen. Icons follow the 16-unit, 1.4-stroke set of the
// approved Actions preview (actions-mock/ui.js), extended with the glyphs Atlas needs.
window.Atlas = window.Atlas || {}
;(function (A) {
  const paths = {
    atlas: '<circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c2 2 2.6 4 2.6 6.2S10 12.2 8 14.2M8 1.8C6 3.8 5.4 5.8 5.4 8S6 12.2 8 14.2"/>',
    home: '<path d="m1 7 7-6 7 6M3 6v8h10V6M6 14v-4h4v4"/>',
    chat: '<path d="M2 2h12v9H7l-4 3v-3H2ZM5 5h6M5 8h4"/>',
    agents: '<circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c0-2.8 2-4.5 4.5-4.5s4.5 1.7 4.5 4.5M11 2.8a2.3 2.3 0 0 1 0 4.4M12.5 9.8c1.3.6 2 1.9 2 4.2"/>',
    maestro: '<path d="M3 13 13 3M10 3h3v3"/><circle cx="4" cy="12" r="2"/>',
    workflow: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/><path d="M7 4.5h4.5V9M4.5 7v4.5H9"/>',
    code: '<path d="m5 4-4 4 4 4m6-8 4 4-4 4M9 2 7 14"/>',
    hooks: '<path d="M8 2v8a3 3 0 1 1-6 0V8M6 2h4"/>',
    bolt: '<path d="M9 1 3 9h5l-1 6 6-9H8Z"/>',
    clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>',
    lock: '<rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>',
    server: '<rect x="2" y="2" width="12" height="5" rx="1"/><rect x="2" y="9" width="12" height="5" rx="1"/><path d="M4 4.5h1M4 11.5h1"/>',
    dock: '<rect x="1.5" y="2.5" width="13" height="10" rx="1.5"/><path d="M1.5 5.5h13M5 14.5h6"/>',
    overview: '<rect x="2" y="2" width="5" height="6" rx="1"/><rect x="9" y="2" width="5" height="3" rx="1"/><rect x="9" y="7" width="5" height="7" rx="1"/><rect x="2" y="10" width="5" height="4" rx="1"/>',
    territory: '<path d="M1.5 4 5.5 2l5 2 4-2v10l-4 2-5-2-4 2Z"/><path d="M5.5 2v10M10.5 4v10"/>',
    fact: '<path d="M4 1.5h5.5L13 5v9.5H4Z"/><path d="M9.5 1.5V5H13M6.5 8.5h4M6.5 11h3"/>',
    drift: '<path d="M1 6c2-2 3 2 5 0s3-2 5 0 3 2 4 1M1 11c2-2 3 2 5 0s3-2 5 0 3 2 4 1"/>',
    relations: '<circle cx="3.5" cy="8" r="2"/><circle cx="12.5" cy="3.5" r="2"/><circle cx="12.5" cy="12.5" r="2"/><path d="m5.3 7 5.4-2.6M5.3 9l5.4 2.6"/>',
    negation: '<circle cx="8" cy="8" r="6"/><path d="m3.8 12.2 8.4-8.4"/>',
    memory: '<path d="M5.5 2.5A2.5 2.5 0 0 0 3 5v.3A2.5 2.5 0 0 0 2 9.5a2.5 2.5 0 0 0 2 3.8 2.3 2.3 0 0 0 4 .4V3.8a2.3 2.3 0 0 0-2.5-1.3ZM10.5 2.5A2.5 2.5 0 0 1 13 5v.3a2.5 2.5 0 0 1 1 4.2 2.5 2.5 0 0 1-2 3.8 2.3 2.3 0 0 1-4 .4"/>',
    history: '<path d="M2 8a6 6 0 1 0 2-4.5M2 2v3h3M8 5v3.5l2.5 1.5"/>',
    health: '<path d="M1 8h3l2-4 3 8 2-4h4"/>',
    inbox: '<path d="M1.5 9.5 4 3h8l2.5 6.5V13h-13ZM1.5 9.5H5l1 2h4l1-2h3.5"/>',
    shield: '<path d="M8 1.5 2.8 3.5v4c0 3.2 2.2 5.7 5.2 7 3-1.3 5.2-3.8 5.2-7v-4Z"/><path d="m5.8 8 1.6 1.6 3-3.2"/>',
    link: '<path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.2-2.2a3 3 0 0 0-4.2-4.2l-.8.8M9.5 6.5a3 3 0 0 0-4.2 0L3.1 8.7a3 3 0 0 0 4.2 4.2l.8-.8"/>',
    tree: '<path d="M3 2v11h3M3 7h3"/><rect x="7" y="5" width="7" height="4" rx="1"/><rect x="7" y="11" width="7" height="4" rx="1"/><rect x="2" y="1" width="2" height="1"/>',
    graph: '<circle cx="8" cy="8" r="2"/><circle cx="2.5" cy="3" r="1.3"/><circle cx="13.5" cy="3" r="1.3"/><circle cx="2.5" cy="13" r="1.3"/><circle cx="13.5" cy="13" r="1.3"/><path d="m6.5 6.6-3-2.6M9.5 6.6l3-2.6M6.5 9.4l-3 2.6M9.5 9.4l3 2.6"/>',
    matrix: '<rect x="2" y="2" width="5" height="5" rx=".8"/><rect x="9" y="2" width="5" height="5" rx=".8"/><rect x="2" y="9" width="5" height="5" rx=".8"/><rect x="9" y="9" width="5" height="5" rx=".8"/>',
    table: '<rect x="2" y="2.5" width="12" height="11" rx="1.2"/><path d="M2 6h12M2 9.5h12M6 6v7.5"/>',
    search: '<circle cx="6.5" cy="6.5" r="4.5"/><path d="m10 10 4 4"/>',
    check: '<path d="m3 8 3 3 7-7"/>',
    checkc: '<circle cx="8" cy="8" r="6"/><path d="m5.3 8.2 1.9 1.9 3.6-3.8"/>',
    xc: '<circle cx="8" cy="8" r="6"/><path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4"/>',
    minusc: '<circle cx="8" cy="8" r="6"/><path d="M5.5 8h5"/>',
    warning: '<path d="m8 1.5 6.5 12H1.5ZM8 6v3.5M8 11.5v.5"/>',
    info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.5v4M8 5v.5"/>',
    close: '<path d="m4 4 8 8M12 4l-8 8"/>',
    back: '<path d="m9 3-5 5 5 5M4 8h10"/>',
    arrow: '<path d="M2 8h11M9 4l4 4-4 4"/>',
    up: '<path d="m4 10 4-4 4 4"/>',
    down: '<path d="m4 6 4 4 4-4"/>',
    chev: '<path d="m4 6 4 4 4-4"/>',
    copy: '<rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/>',
    expand: '<path d="M9.5 2H14v4.5M6.5 14H2V9.5M14 2 9 7M2 14l5-5"/>',
    external: '<path d="M9 2h5v5M14 2 7.5 8.5M12 9.5V14H2V4h4.5"/>',
    commit: '<circle cx="8" cy="8" r="2.6"/><path d="M1 8h4.4M10.6 8H15"/>',
    branch: '<circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="4" r="1.5"/><path d="M4 4.5v7M12 5.5C12 9 4 7 4 10"/>',
    refresh: '<path d="M13 5a5.5 5.5 0 1 0 0 6M13 1v4H9"/>',
    filter: '<path d="M2 3h12l-4.5 5.5V13l-3 1.5v-6Z"/>',
    keyboard: '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.5h.5M7 6.5h.5M10 6.5h.5M4.5 9.5h7"/>',
    eye: '<path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5Z"/><circle cx="8" cy="8" r="2"/>',
    sparkle: '<path d="M8 1.5 9.4 6.6 14.5 8l-5.1 1.4L8 14.5l-1.4-5.1L1.5 8l5.1-1.4Z"/>',
    stack: '<path d="m8 1.5 6.5 3.5L8 8.5 1.5 5Z"/><path d="m1.5 8 6.5 3.5L14.5 8M1.5 11l6.5 3.5 6.5-3.5"/>',
    pin: '<path d="M8 14.5s5-4.6 5-8.5a5 5 0 0 0-10 0c0 3.9 5 8.5 5 8.5Z"/><circle cx="8" cy="6" r="1.8"/>',
    scale: '<path d="M8 2v12M3 14h10M8 4 3 5.5l-2 4.5h4Zm0 0 5 1.5 2 4.5h-4ZM1 10a2 2 0 0 0 4 0M11 10a2 2 0 0 0 4 0"/>',
    play: '<path d="m5 3 8 5-8 5Z"/>',
    download: '<path d="M8 1v10m-4-4 4 4 4-4M2 10v4h12v-4"/>',
    settings: '<circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13"/>',
    dot: '<circle cx="8" cy="8" r="2.5"/>',
    folder: '<path d="M1.5 4.5V12a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3.5h-4a1 1 0 0 0-1 1Z"/>',
    hash: '<path d="M3 6h11M2 10h11M6.5 2 5 14M11 2 9.5 14"/>',
  }

  A.icon = (name, cls = "") => `<svg class="wf-ic ${cls}" viewBox="0 0 16 16" aria-hidden="true">${paths[name] ?? paths.dot}</svg>`
  A.esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
  A.short = (hex, n = 8) => (hex ? `${hex.slice(0, n)}` : "")
  A.hash = (seed) => {
    let h = 2166136261
    return Array.from({ length: 2 }, (_, i) => { for (const c of `${seed}:${i}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h.toString(16).padStart(8, "0") }).join("")
  }
  A.num = (n) => Number(n).toLocaleString("en-US")

  // Atlas vocabulary, shown as glyph + word with a one-line explanation on hover.
  const states = {
    fresh: ["good", "checkc", "Fresh", "The anchored code still hashes the same as when the fact was derived."],
    drifted: ["warm", "drift", "Drifted", "The anchored file changed since the fact was derived and its old content exists nowhere at HEAD (semantic). reconcile exits 2 for a merge that changes it."],
    retired: ["", "minusc", "Superseded", "Retired through emit (authoring SUPERSEDED). Reads do not filter it yet, so agents still receive it (R6)."],
    pending: ["blue", "clock", "In staging", "Mined, not promoted yet. Agents never see staging."],
  }
  A.chip = (value) => {
    const [tone, glyph, label, tip] = states[value] ?? states.fresh
    return `<span class="at-state ${tone}" data-tip="${tip}">${A.icon(glyph)}${label}</span>`
  }
  A.band = (x) => (x.tier === "T0" || x.tier === "T1"
    ? `<span class="at-kind blue" data-tip="Governing band: ratified, drives agent behaviour.">${A.icon("shield")}Governing</span>`
    : `<span class="at-kind dash" data-tip="Advisory band: proposals nobody ratified. Agents receive them as hints, apart from the rules.">${A.icon("sparkle")}Advisory</span>`)
  A.tier = (t) => `<span class="at-tier-chip" data-tip="${{ T0: "T0 · must be right; only a person ratifies", T1: "T1 · load-bearing; ratified", T2: "T2 · default; advisory" }[t] ?? t}">${A.esc(t)}</span>`
  A.origin = (x) => (x.scope === "atlas:mined"
    ? `<span class="at-origin" data-tip="Mined by genesis and promoted through the emit door.">${A.icon("sparkle")}Mined</span>`
    : `<span class="at-origin" data-tip="Emitted directly by an agent or a person.">${A.icon("fact")}Emitted</span>`)
  A.family = (f) => `<span class="at-origin" data-tip="${{ advisory: "Advisory: a grounded claim with no executable check.", predicate: "Predicate: carries a check with a HOLDS / BROKEN / NA verdict.", relation: "Relation: a proven edge between two units.", negation: "Negation: nothing in a scope calls a target.", transition: "Transition: what changed between two commits.", "test-vacuity": "Test vacuity: a test that cannot fail." }[f] ?? f}">${A.esc(f)}</span>`
  A.agent = (id) => {
    const names = { backend: "Backend", jimmy: "Jimmy", archie: "Archie", maestro: "Maestro", "seat:orchestrator": "seat:orchestrator", you: "You" }
    const name = names[id] ?? id
    return `<span class="at-seat"><i>${A.esc(name[0])}</i>${A.esc(name)}</span>`
  }
  A.file = (path) => {
    const i = path.lastIndexOf("/")
    return `<code class="at-path">${i < 0 ? "" : `<span>${A.esc(path.slice(0, i + 1))}</span>`}${A.esc(path.slice(i + 1))}</code>`
  }

  // Actions the design keeps although Atlas/Orchestra cannot do them yet. Each points at specs/atlas-ui/REQUIREMENTS.md.
  A.REQS = {
    R1: "Steward-approved project memory: proposals from a member's lessons, indexed by a person. Today the member writes its own rule and it is admitted at once.",
    R2: "Promote or keep a single staged candidate. Today atlas promote settles every staging row at once and staging has no marker.",
    R3: "Ratification proposals: a reviewer proposes a fact for T1/T0 and a person ratifies or rejects with a reason. Atlas has no proposal state.",
    R4: "Declare a territory from the app. Today the catalog is a committed JSON edited by hand.",
    R5: "Resume a task from the app. Today only Maestro can call task with task_id and memoryUnit; transcript replay is not wired.",
    R6: "Retiring withdraws a fact from what agents read. Today it is tagged SUPERSEDED but still served.",
    R7: "Rebuild the Own snapshot from the app, so live changes reach agents. Today a maintainer re-materializes it from a reviewed snapshot JSON, never from the live store.",
    R8: "Replace a fact's claim. Today a same-tier rewrite adds the new claim to the set and the old one stays served; only a tier raise replaces claims.",
  }
  A.newcap = (id) => `<span class="at-newcap" data-tip="Requires a new capability · ${id}: ${A.esc(A.REQS[id])}">${A.icon("sparkle")}New capability · ${id}</span>`

  A.badge = (label, tone = "") => `<span class="mx-badge ${tone}">${A.esc(label)}</span>`
  A.btn = (label, action, opts = {}) =>
    `<button type="button" class="mx-btn ${opts.primary ? "primary" : ""} ${opts.icon && !label ? "icon" : ""}" data-action="${action}" ${opts.value !== undefined ? `data-value="${A.esc(opts.value)}"` : ""} ${opts.disabled ? "disabled" : ""} ${opts.tip ? `data-tip="${A.esc(opts.tip)}"` : ""} ${opts.label ? `aria-label="${A.esc(opts.label)}"` : ""}>${opts.icon ? A.icon(opts.icon) : ""}${A.esc(label)}</button>`
  A.bar = (parts, cls = "") =>
    `<span class="at-bar ${cls}">${parts.filter((p) => p[1] > 0).map(([tone, value]) => `<i class="${tone}" style="flex:${value}"></i>`).join("")}</span>`

  A.meter = (label, value, cap, tone = "") =>
    `<div class="at-meter ${tone}"><div class="at-meter-top"><span>${A.esc(label)}</span><span><b>${A.num(value)}</b> / ${A.num(cap)}</span></div><div class="at-meter-track"><i style="inline-size:${Math.min(100, (value / cap) * 100)}%"></i></div></div>`

  A.empty = (title, body, action = "") => `<div class="mx-empty"><strong>${A.esc(title)}</strong><p>${body}</p>${action}</div>`

  A.toast = (text, glyph = "check") => {
    const el = document.querySelector("#toast")
    el.innerHTML = `${A.icon(glyph)}<span>${text}</span>`
    el.hidden = false
    clearTimeout(A.toast.timer)
    A.toast.timer = setTimeout(() => (el.hidden = true), 3200)
  }

  // Tiny TypeScript-ish highlighter for code previews (keywords, strings, comments, types).
  A.highlight = (line) =>
    A.esc(line)
      .replace(/(\/\/.*)$/, '<span class="tk-c">$1</span>')
      .replace(/(&quot;.*?&quot;|`.*?`)/g, '<span class="tk-s">$1</span>')
      .replace(/\b(export|const|function|return|if|yield|import|from|type|await|async|new|throw|readonly)\b/g, '<span class="tk-k">$1</span>')
      .replace(/\b([A-Z][A-Za-z0-9]+)\b/g, '<span class="tk-t">$1</span>')

  A.code = (file, start, lines, opts = {}) => {
    const hl = new Set(opts.highlight ?? [])
    const kinds = opts.kinds ?? {}
    const body = lines.map((text, i) => `<div class="ln ${hl.has(start + i) ? "hl" : ""} ${kinds[start + i] ?? ""}"><span>${start + i}</span><span>${A.highlight(text)}</span></div>`).join("")
    return `<div class="at-code"><div class="at-code-head"><span>${A.esc(file)}${opts.sha ? ` @ ${A.esc(opts.sha)}` : ""}</span>${opts.head ?? ""}</div><pre>${body}</pre></div>`
  }
})(window.Atlas)
