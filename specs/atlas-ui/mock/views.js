// Overview, Knowledge, a unit and a fact. Layers follow specs/atlas-ui/DESIGN.md: the first viewport answers the
// screen's one job, one tap opens the rest, and hashes and Atlas codes live only in Technical details.
;(function (A) {
  const M = () => A.m
  const R = () => A.m.R
  const plural = (n, one, many = `${one}s`) => `${A.num(n)} ${n === 1 ? one : many}`
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
  A.views = {}
  A.plural = plural
  const unitHref = (path) => `#/unit/${encodeURIComponent(path)}`
  const kpi = (label, value, foot, tone = "") => `<div class="at-kpi ${tone}"><span>${label}</span><b>${value}</b><small>${foot}</small></div>`
  const acc = (id, glyph, title, purpose, summary, body, open = false) =>
    `<details class="at-acc" data-acc="${id}" ${open ? "open" : ""}><summary><span class="at-acc-ic">${A.icon(glyph)}</span><span class="at-acc-t"><strong>${title}</strong><small>${purpose}</small></span><span class="at-acc-sum">${summary}</span>${A.icon("chev", "at-acc-chev")}</summary><div class="at-acc-body">${body}</div></details>`
  A.acc = acc
  A.kpi = kpi
  // Seven rows, then "Show N more" (DESIGN.md layout rules).
  A.seven = (rows, id, render, first = 7) => {
    const n = Number(A.state.query[`n-${id}`] ?? first)
    const more = rows.length > n ? `<div class="at-more"><span>${A.num(rows.length - n)} more</span>${A.btn(`Show ${Math.min(25, rows.length - n)} more`, "more", { value: `${id}|${n + 25}` })}</div>` : ""
    return rows.slice(0, n).map(render).join("") + more
  }
  const dot = (u) => `<span class="at-sdot ${u.drifted ? "warm" : "good"}" data-tip="${u.drifted ? `${u.drifted} changed` : "All up to date"}"></span>`

  // A fact row: the sentence on one line, the file as text, at most two chips (state, then tier / family / example).
  const factRow = (x, state, opts = {}) => `<div class="at-item ${state.query.fact === x.key ? "selected" : ""}" data-action="open" data-value="${x.key}" tabindex="0" role="button">
    ${A.chip((x.kind === "candidate" && !x.promotedNow) ? "pending" : M().state(x))}
    <div class="at-item-main"><div class="at-item-text clamp">${A.esc(x.claim)}</div>
    <div class="at-item-meta">${opts.noFile ? "" : `<span class="at-meta-file">${A.esc(opts.short ? x.file.split("/").at(-1) : x.file)}</span>`}${x.slot ? `<span>${A.esc(x.slot)}</span>` : ""}${opts.extra ?? ""}</div></div>${A.second(x)}</div>`
  A.factRow = factRow

  /* ---------- Overview: is Atlas fine, and what needs me? ---------- */
  A.views.overview = (state) => {
    const s = M().stats()
    const building = state.preview === "building"
    const need = M().curationCount()
    const toRatify = M().live().filter((x) => x.proposedTier).length
    const events = M().activity()
    const reads = events.filter((e) => e.kind === "read")
    const sentence = M().provenance() !== "trusted" ? "Read-only: this store is in git, so Atlas sends agents nothing from it." : need ? `${plural(need, "thing")} wait for you.` : "Nothing waits for you."
    const tile = (href, label, value, foot, tone = "") => `<a class="at-tile ${tone}" href="${href}"><span class="at-tile-label">${label}${A.icon("arrow")}</span><b>${building ? '<span class="at-skel" style="block-size:26px;inline-size:50%"></span>' : value}</b><small>${foot}</small></a>`
    return {
      crumbs: [["Atlas"]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · project atlas</div><h1>Overview</h1><p>${sentence}</p></div></div>
      ${building ? `<div class="at-building"><span class="spin"></span><div><strong>Building the code index</strong><small>Counts appear when it finishes; nothing is estimated.</small></div></div>` : ""}
      <div class="at-tiles">
        ${tile("#/review", "Needs you", A.num(need), `${s.drifted} changed · ${s.candidates} mined · ${toRatify} to ratify`, need ? "attn" : "")}
        ${tile("#/knowledge", "Knowledge", `${A.num(s.facts)}<small> facts</small>`, `${pct(s.fresh, s.facts)}% up to date · ${s.governing} ratified`)}
        ${tile("#/activity", "Agents", `${M().snapshot.units.length}<small> ${M().snapshot.units.length === 1 ? "unit" : "units"} published</small>`, reads.length ? `last read: ${A.esc(reads[0].text)}` : "No reads recorded yet")}
      </div>
      <div class="at-cols">
        <section class="at-panel"><header class="at-panel-head"><h3>Busiest units</h3><a class="mx-link" href="#/knowledge">All units</a></header>
          ${M().units().slice(0, 5).map((u) => `<a class="at-linkrow" href="${unitHref(u.id)}">${dot(u)}<code class="at-mono">${A.esc(u.id)}</code><span class="grow"></span><small>${plural(u.facts, "fact")}</small></a>`).join("")}</section>
        <section class="at-panel"><header class="at-panel-head"><h3>Recent activity</h3><a class="mx-link" href="#/activity">Activity</a></header>
          ${events.slice(0, 5).map((e) => A.eventRow(e, true)).join("") || '<div class="at-band-empty">Nothing recorded yet.</div>'}</section>
      </div></div>`,
    }
  }

  /* ---------- Knowledge: find a unit ---------- */
  A.views.knowledge = (state) => {
    const q = state.query
    const text = (q.q ?? "").trim().toLowerCase()
    const units = M().units()
    const s = M().stats()
    const names = { backend: "Backend", archie: "Archie", jimmy: "Jimmy", lucy: "Lucy", rosie: "Rosie" }
    const owner = (u) => { const t = M().territoryOf(u.id); return t ? `${A.esc(t.name)} · ${A.esc(names[t.owner] ?? t.owner)}` : "No territory" }
    const row = (u) => `<a class="at-unit" href="${unitHref(u.id)}">${dot(u)}<span class="at-unit-main"><code>${A.esc(u.id)}</code><small>${owner(u)}</small></span><span class="at-unit-cell">${A.num(u.facts)}<small>facts</small></span>${A.icon("arrow")}</a>`
    const groups = [["code", "Code", "Packages agents work inside", true], ["docs", "Docs", "Specifications, ADRs and reference pages", false], ["harness", "Harness", "CI gates and probes", false], ["root", "Repository root", "Top-level files", false]]
    const results = text ? M().live().filter((x) => `${x.claim} ${x.file}`.toLowerCase().includes(text)) : []
    return {
      crumbs: [["Atlas", "#/overview"], ["Knowledge"]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas</div><h1>Knowledge</h1><p>${plural(units.length, "unit")} · ${plural(s.facts, "fact")}</p></div></div>
      <div class="at-toolbar"><label class="at-search wide">${A.icon("search")}<input id="list-search" placeholder="Search every fact by sentence or file" value="${A.esc(q.q ?? "")}" aria-label="Search facts"><kbd>/</kbd></label></div>
      ${text ? `<section class="at-panel"><header class="at-panel-head"><h3>${plural(results.length, "fact")} match</h3>${A.btn("Clear", "go", { value: "#/knowledge" })}</header>${A.seven(results, "search", (x) => factRow(x, state), 25) || '<div class="at-band-empty">Nothing matches.</div>'}</section>`
        : groups.map(([g, title, purpose, open]) => {
          const list = units.filter((u) => u.group === g)
          return list.length ? acc(`units-${g}`, g === "code" ? "stack" : g === "docs" ? "fact" : g === "harness" ? "settings" : "folder", title, purpose, plural(list.length, "unit"), list.map(row).join(""), open) : ""
        }).join("")}
      </div>`,
    }
  }

  /* ---------- A unit: what an agent learns here, and whether it still holds ---------- */
  A.views.unit = (state) => {
    const path = state.params[0] || "packages/knowledge"
    const q = state.query
    const node = M().findNode(path === "(root)" ? "" : path)
    const isUnit = M().units().some((u) => u.id === path)
    const unitId = M().unitOf(`${path}/x`) === path ? path : M().unitOf(path)
    const b = path === "(root)" ? { ...M().briefing(""), here: M().live().filter((x) => M().unitOf(x.file) === "(root)") } : M().briefing(path)
    const here = b.here
    const fresh = here.filter((x) => M().state(x) === "fresh").length
    const terr = M().territoryOf(unitId)
    const strict = here.some((x) => x.tier === "T0") ? "T0" : here.some((x) => x.tier === "T1") ? "T1" : "T2"
    const published = M().snapshot.units.includes(path)
    const snap = M().snapshot.packs[path]
    const sent = b.inv.length + b.gotchas.length + b.adv.length
    const leaf = path.split("/").at(-1)

    // Briefing: the bands in the order `atlas own` pays them.
    const band = (cls, title, tip, list, empty) => `<section class="at-band ${cls}"><header class="at-band-head"><h3>${title}</h3>${A.help(tip)}<span class="wf-count">${list.length}</span></header>${list.length ? list.map((x) => factRow(x, state, { short: true })).join("") : `<div class="at-band-empty">${empty}</div>`}</section>`
    const publishLine = published
      ? `<div class="at-snapline good">${A.icon("checkc")}<span>Agents get the published version${snap ? ` (${plural(snap.invariants.length, "ratified fact")}, ${snap.advisory} hints)` : ""}, not the live one below.</span>${A.help(`Own snapshot, revision ${M().snapshot.revision}. Served only while its source files are byte-identical; otherwise reads hold as artifacts-invalid.`)}${A.btn("Republish", "republish", { value: path, cap: "R7" })}</div>`
      : `<div class="at-snapline">${A.icon("info")}<span>Not published: agents get nothing for this unit yet.</span>${A.btn("Publish", "republish", { value: path, cap: "R7" })}</div>`
    const briefing = `${publishLine}
      ${band("gov", "Ratified", "Governing band (T0, T1), paid first out of 1,500 characters.", b.inv, "Nothing ratified here yet.")}
      ${b.gotchas.length ? band("gotcha", "Watch out", "Gotcha band: ratified gotcha and rationale facts.", b.gotchas, "") : ""}
      ${b.pointers.length ? `<section class="at-band"><header class="at-band-head"><h3>Go deeper</h3>${A.help("Manifest pointers own_<leaf>, at most 12: names only; the agent pulls them.")}<span class="wf-count">${b.pointers.length}</span></header>${b.pointers.map((p) => `<a class="at-linkrow" href="${unitHref(p.path)}">${A.icon("folder")}<code class="at-mono">${A.esc(p.path.slice(path.length + 1) || p.name)}</code></a>`).join("")}</section>` : ""}
      ${band("adv", "Hints", "Advisory band (T2): at most 750 characters, paid last, stops at the first fact that does not fit.", b.adv, "No hints.")}
      ${b.pull.length ? `<details class="at-sub-acc" data-acc="pull-${path}"><summary>${A.icon("chev")}<span>Left out for space</span><span class="wf-count">${b.pull.length}</span></summary>${A.seven(b.pull, "pull", (x) => factRow(x, state, { short: true }))}</details>` : ""}`

    // Facts by kind (slot).
    const typeOf = (x) => (x.slot ? M().SLOT_GROUPS.find((g) => g[2].includes(x.slot))?.[0] : "Not sorted yet")
    const type = q.type ?? ""
    const kinds = [...M().SLOT_GROUPS.map(([g]) => g), "Not sorted yet"].map((g) => [g, here.filter((x) => typeOf(x) === g).length]).filter(([, n]) => n)
    const shown = here.filter((x) => !type || typeOf(x) === type)
    const href = (patch) => `${unitHref(path)}?${new URLSearchParams(Object.fromEntries(Object.entries({ type, conn: q.conn, ...patch }).filter(([, v]) => v)))}`
    const kindsBody = `<div class="at-acc-tools"><div class="at-typechips">${[["", here.length], ...kinds].map(([g, n]) => `<button class="at-typechip ${type === g ? "on" : ""}" data-action="go" data-value="${href({ type: g })}">${g || "All"}<span>${n}</span></button>`).join("")}</div>${A.help("Kinds are Atlas slots: Contract, Property, Guidance, Structure. Sorting a fact writes a new fact at (anchor, slot).")}</div>
      ${A.seven(shown, `kind${type}`, (x) => factRow(x, state, { short: true }))}`

    // Proven structure: the other fact families, each from its own read command.
    const structure = [["Links", "atlas relations · depends-on and calls edges proven from the code index"], ["Never calls", "atlas negations · nothing in the scope calls a target, plus what Atlas couldn't decide"], ["Code changes", "atlas transitions · what changed between two commits"], ["Hollow tests", "atlas test-vacuities · tests that cannot fail"]]
    const structureBody = structure.map(([label, tip]) => `<div class="at-linkrow static">${A.icon("relations")}<span>${label}</span>${A.help(tip)}<span class="grow"></span><small>none yet</small></div>`).join("") + `<p class="at-stew-intro">This store holds stated facts only. Links come from <b>Derive links</b> in Review.</p>`

    // Connections: used by (own sends 8 dependent facts) and uses (dependencies).
    const dir = q.conn === "uses" ? "uses" : "used"
    const usesFiles = M().uses(path)
    const usedFacts = M().live().filter((x) => b.depFiles.includes(x.file)).sort((a, z) => a.key.localeCompare(z.key))
    const connBody = `<div class="at-acc-tools"><div class="wf-range"><button aria-pressed="${dir === "used"}" data-action="go" data-value="${href({ conn: "" })}">Used by<span class="wf-count">${usedFacts.length}</span></button><button aria-pressed="${dir === "uses"}" data-action="go" data-value="${href({ conn: "uses" })}">Uses<span class="wf-count">${usesFiles.length}</span></button></div>${A.help("Here from import statements; Atlas reads index.scip. The briefing sends the first 8 dependent facts.")}</div>
      ${dir === "used" ? (usedFacts.length ? A.seven(usedFacts, "used", (x) => factRow(x, state)) : '<div class="at-band-empty">Nothing outside depends on it.</div>')
        : (usesFiles.length ? A.seven(usesFiles, "uses", (f) => `<a class="at-linkrow" href="${unitHref(f)}">${A.icon("code")}<code class="at-mono">${A.esc(f)}</code></a>`) : '<div class="at-band-empty">It imports nothing outside itself.</div>')}`

    const finer = node ? [...node.children.values()].sort((x, y) => x.path.localeCompare(y.path)) : []
    const finerBody = finer.length ? A.seven(finer, "finer", (c) => `<a class="at-linkrow" href="${unitHref(c.path)}">${A.icon(c.file ? "fact" : "folder")}<code class="at-mono">${A.esc(c.name)}</code><span class="grow"></span>${c.drifted ? `<span class="at-sdot warm"></span>` : ""}<small>${plural(c.facts, "fact")}</small></a>`) : `<div class="at-band-empty">Nothing finer: this is a single file.</div>`
    const pins = (A.illustrations?.pinned ?? []).filter((p) => p.units.includes(path))
    const pinsBody = pins.map((p) => `<a class="at-linkrow" href="#/memory/${p.member}/task/${encodeURIComponent(p.plan)}">${A.icon("lock")}<span>${A.esc(p.plan)} · revision ${p.revision}</span><span class="grow"></span><span class="at-pill">example</span></a>`).join("") + `<p class="at-stew-intro">If this unit changes, these plan steps hold until the plan is re-anchored.</p>`

    const owner = M().packOwner(path === "(root)" ? "" : unitId)
    const tech = A.tech([
      ["Atlas command", `<code>atlas own ${A.esc(path)}</code> · tool <code>own_${A.esc(leaf)}</code>`],
      ["Grounding source", "tree"],
      ["Pack owner", owner.length ? owner.map(A.esc).join(", ") : "none: no write-policy scope covers this path"],
      ["Strictest tier", strict],
      ["tokenEstimate", `${A.num(b.used)} characters of ${A.num(b.cap)}`],
      ["advisoryDropped", b.pull.filter((x) => !M().governing(x)).length],
      ["Pointers", b.pointers.length ? `${b.pointers.length} of ${b.pointerTotal} · pull <code>atlas own &lt;child&gt;</code> · hits 0` : "none"],
      ["refresh · complement", `<code>poke:own_${A.esc(leaf)}</code> · <code>relate:${A.esc(path)}</code>`],
      ["Query pack", `<code>atlas query ${A.esc(path)}</code> · the same rows in two bands, stale false`],
      ["Anchors", `<code>atlas anchors ${A.esc(path)}</code> · file units at ${A.esc(R().head)}`],
    ])

    const segs = path.split("/")
    const crumbs = [["Atlas", "#/overview"], ["Knowledge", "#/knowledge"], ...(isUnit ? [[path, null, true]] : [[unitId, unitHref(unitId), true], [path.slice(unitId.length + 1), null, true]])]
    return {
      crumbs,
      html: `<div class="at-page narrow">
      <div class="at-agent-head"><span class="at-avatar unit">${A.icon(node?.file ? "fact" : "stack")}</span><div><div class="mx-eyebrow">${isUnit ? "Unit" : `inside <a class="mx-link" href="${unitHref(unitId)}">${A.esc(unitId)}</a>`}</div><h1 class="mono">${A.esc(isUnit ? path : segs.slice(-2).join("/"))}</h1>
        <p>${terr ? `${A.esc(terr.name)} · ${A.agent(terr.owner)}` : "No territory"}</p></div><span class="grow"></span>
        ${terr ? "" : A.btn("Declare territory", "territory", { value: path, cap: "R4" })}</div>
      <div class="at-kpis">
        ${kpi("Facts", here.length, `${here.filter((x) => M().governing(x)).length} ratified`)}
        ${kpi("Up to date", `${pct(fresh, here.length)}%`, here.length - fresh ? `${here.length - fresh} changed` : "nothing changed", here.length - fresh ? "warn" : "")}
        ${kpi("In the briefing", sent, `${A.num(b.used)} of 1,500 characters`)}
        ${kpi("Depends on it", b.depFactsTotal, b.depFactsTotal ? "facts elsewhere" : "nothing outside")}</div>
      ${acc("unit-brief", "stack", "Briefing", "What an agent gets for this unit", plural(sent, "fact"), briefing, true)}
      ${acc("unit-kinds", "fact", "Facts by kind", "Every fact here, by the kind of claim it makes", `${here.length}`, kindsBody)}
      ${acc("unit-structure", "relations", "Proven structure", "Links, calls that never happen, code changes, hollow tests", "none yet", structureBody)}
      ${acc("unit-conn", "graph", "Connections", "What depends on it, and what it uses", `${usedFacts.length} · ${usesFiles.length}`, connBody)}
      ${acc("unit-finer", "folder", "Inside", "Folders and files in this unit", `${finer.length}`, finerBody)}
      ${pins.length ? acc("unit-pins", "lock", "Pinned by plans", "Plans that froze this unit", `${pins.length}`, pinsBody) : ""}
      ${tech}
      </div>`,
    }
  }

  /* ---------- A fact: can I trust this sentence, and where did it come from? ---------- */
  A.views.detail = (key, state, page = false) => {
    const x = M().byKey[key]
    if (!x) return ""
    const staged = x.kind === "candidate" && !x.promotedNow
    const st = staged ? "pending" : M().state(x)
    const why = x.why && R().reasoning[x.why]
    const same = M().live().filter((y) => y.file === x.file && y.key !== x.key)
    const importers = R().dependents[x.file] ?? []
    const full = state.query.why === "all"
    const order = state.list ?? []
    const index = order.indexOf(key)
    const sec = (id, title, body, open = false) => `<details class="ins-acc" data-acc="fact-${id}" ${open ? "open" : ""}><summary>${A.icon("chev")}<span>${title}</span></summary><div class="ins-acc-body">${body}</div></details>`
    const hunk = (h) => `<div class="at-code"><div class="at-code-head"><span>@@ ${A.esc(h.at)} @@</span></div><pre>${h.lines.map((l) => `<div class="ln ${l[0] === "+" ? "add" : l[0] === "-" ? "del" : ""}"><span></span><span>${A.esc(l.slice(1))}</span></div>`).join("")}</pre></div>`
    const changed = x.drift && !x.regrounded ? sec("changed", `What changed <span class="at-state warm" data-tip="doctor why: semantic. The old content exists nowhere at HEAD.">Content gone</span>`, `<p class="ins-sub">The file changed in ${plural(x.drift.commits.length, "commit")} (${A.esc(x.drift.stat)}). Atlas suggests: <b>${staged ? "leave it" : "Retire"}</b>, or rewrite the sentence for the current code.</p>
      ${x.drift.commits.map(([sha, subj]) => `<div class="at-commit"><code class="at-sha">${A.esc(sha)}</code><span>${A.esc(subj)}</span></div>`).join("")}${x.drift.hunks.slice(0, 1).map(hunk).join("")}`, true) : ""
    const history = `<ul class="at-timeline">
      <li><span class="at-tl-dot blue">${A.icon("sparkle")}</span><div class="at-tl-body"><strong>Mined</strong><small>by genesis, from the whole file</small></div></li>
      ${staged ? `<li><span class="at-tl-dot">${A.icon("clock")}</span><div class="at-tl-body"><strong>Waiting in Mined</strong><small>not accepted yet</small></div></li>`
        : `<li><span class="at-tl-dot good">${A.icon("check")}</span><div class="at-tl-body"><strong>Accepted</strong><small>at commit <code class="at-sha">${A.esc(x.derivedAt)}</code></small></div></li>`}
      ${x.tier !== "T2" ? `<li><span class="at-tl-dot good">${A.icon("shield")}</span><div class="at-tl-body"><strong>${x.tier === "T0" ? "Made core" : "Ratified"}</strong><small>who approved is not recorded</small></div></li>` : x.proposedTier ? `<li><span class="at-tl-dot warm">${A.icon("clock")}</span><div class="at-tl-body"><strong>Proposed for ${x.proposedTier === "T0" ? "Core" : "Ratified"}</strong><small>by ${A.esc(x.proposedBy)} · example</small></div></li>` : ""}
      <li><span class="at-tl-dot">${A.icon("minusc")}</span><div class="at-tl-body"><strong>No proof</strong><small>a stated sentence; nothing machine-checks it</small></div></li>
      ${x.retired ? `<li><span class="at-tl-dot">${A.icon("minusc")}</span><div class="at-tl-body"><strong>Replaced</strong><small>still sent to agents (R6)</small></div></li>` : ""}
    </ul>`
    const related = `${same.length ? `<h5>On the same file</h5>${same.slice(0, 4).map((y) => `<div class="ins-rel" data-action="open" data-value="${y.key}" tabindex="0">${A.chip(M().state(y))}<span class="ins-rel-claim">${A.esc(y.claim)}</span></div>`).join("")}` : ""}
      <h5>Same as</h5><div class="at-linkrow static"><span>No equivalent linked</span><span class="grow"></span>${staged ? "" : A.btn("Link…", "link-fact", { value: x.key })}</div>
      <h5>Files that import it</h5>${importers.slice(0, 5).map((f) => `<a class="at-linkrow" href="#/unit/${encodeURIComponent(f)}">${A.icon("code")}<code class="at-mono">${A.esc(f)}</code></a>`).join("") || '<p class="mx-note">None found in the imports.</p>'}`
    const writers = R().policy[x.scope] ?? []
    const tech = A.tech([
      ["kind · family", `${A.esc(x.kind ?? "advisory")} · ${A.esc(x.family)}`], ["id (anchor)", `<code>${A.esc(x.anchor?.qualifiedPath ?? x.file)}</code> · ${A.esc(x.anchor?.kind ?? "file")}`],
      ["nodeKey", A.hashv(x.key)], ["contentHash", A.hashv(x.hash)], ["subtreeHash", A.hashv(x.subtree)],
      ["tier · authoring", `${A.esc(x.tier)} · ${A.esc(x.retired ? "SUPERSEDED" : x.authoring ?? "ADVISORY")}`], ["Stored freshness", A.esc(x.storedFreshness ?? "FRESH")],
      ["Scope", `<code>${A.esc(x.scope)}</code> · written by ${writers.map(A.esc).join(", ") || "nobody"}`], ["Slot", A.esc(x.slot ?? "none")],
      ["Obviousness", `${A.esc(x.obvious ?? "—")} · by ${A.esc(x.obviousBy ?? "harness-predicate")} · the check is pinned to false, so every mined fact is “obvious”`],
      ["Seal · witness", "none · none"], ["supersededBy · sameAs", "none · none"],
      ["Generation", staged ? `staging ${R().stagingGen}` : `projection ${R().gen}`], x.why ? ["answerRef", A.hashv(x.why)] : null,
      ["Re-check proof", `${A.btn("Re-check", "verify-fact", { value: x.key })}`],
    ])
    const body = `
      <p class="ins-claim">${A.esc(x.claim)}</p>
      <div class="ins-states">${A.chip(st)}${A.second(x)}<span class="ins-meta">${A.origin(x)} · ${A.esc(x.file.split("/").at(-1))}</span></div>
      ${M().provenance() !== "trusted" && !staged ? `<div class="ins-note">${A.icon("lock")}<span>Not sent to agents: this store is in git and the fact has no proof.</span></div>` : ""}
      ${changed}
      ${sec("code", "Code it's about", `<a class="at-fileline" href="#/unit/${encodeURIComponent(x.file)}">${A.icon("fact")}${A.file(x.file)}${A.icon("arrow")}</a><p class="mx-note">The whole file: any change to it changes this fact. Unit <a class="mx-link" href="#/unit/${encodeURIComponent(M().unitOf(x.file))}">${A.esc(M().unitOf(x.file))}</a>.</p>`)}
      ${why ? sec("why", "How it was derived", `<div class="at-reasoning ${full ? "" : "short"}">${A.esc(full ? why : why.slice(0, 520))}${full || why.length <= 520 ? "" : "…"}</div>${why.length > 520 ? `<button class="mx-link" data-action="toggle-why">${full ? "Show less" : "Read all"}</button>` : ""}<p class="mx-note">The miner's reasoning. Agents never receive it.</p>`) : ""}
      ${sec("history", "History", history)}
      ${sec("related", "Related", related)}
      ${tech}`
    if (page) return body
    const actions = staged
      ? `${A.btn("Keep for later", "discard", { value: x.key, write: true, cap: "R2" })}${A.btn("Accept", "promote", { value: x.key, write: true, primary: true, cap: "R2" })}`
      : st === "drifted" ? `${A.btn("Retire", "retire", { value: x.key, write: true })}${A.btn("Rewrite", "edit", { value: x.key, write: true, primary: true, cap: "R8" })}`
      : st === "retired" ? `<span class="at-hint">Replaced · still sent (R6)</span>`
      : `${A.btn("Edit", "edit", { value: x.key, write: true })}${x.slot ? "" : A.btn("Classify", "classify", { value: x.key, write: true })}${A.btn("Retire", "retire", { value: x.key, write: true })}${M().governing(x) ? "" : A.btn("Ratify…", "ratify", { value: x.key, write: true, primary: true })}`
    return `<header class="ins-head"><span class="ins-kind">${A.icon("fact")}<span>${A.esc(M().unitOf(x.file))}</span></span>
      ${A.btn("", "step", { icon: "up", value: "-1", label: "Previous (k)", tip: "Previous (k)", disabled: index <= 0 })}${A.btn("", "step", { icon: "down", value: "1", label: "Next (j)", tip: "Next (j)", disabled: index < 0 || index >= order.length - 1 })}
      ${A.btn("", "go", { icon: "expand", value: `#/fact/${x.key}`, label: "Open as page", tip: "Open as page" })}${A.btn("", "close", { icon: "close", label: "Close (Esc)", tip: "Close (Esc)" })}</header>
      <div class="ins-body">${body}</div><footer class="ins-foot">${A.btn("", "copy-link", { icon: "link", value: x.key, label: "Copy link", tip: "Copy link" })}<span class="grow"></span>${actions}</footer>`
  }

  A.views.fact = (state) => {
    const x = M().byKey[state.params[0]]
    if (!x) return { crumbs: [["Atlas", "#/overview"], ["Fact"]], html: `<div class="at-page narrow">${A.empty("No fact with this key", "It may never have been accepted.", A.btn("Back to knowledge", "go", { value: "#/knowledge" }))}</div>` }
    return {
      crumbs: [["Atlas", "#/overview"], ["Knowledge", "#/knowledge"], [x.file.split("/").at(-1), null, true]],
      html: `<div class="at-page narrow"><div class="mx-heading"><div><div class="mx-eyebrow">${A.esc(M().unitOf(x.file))}</div></div><div class="heading-actions">${A.btn("Back", "back", { icon: "back" })}${A.btn("Copy link", "copy-link", { icon: "link", value: x.key })}</div></div><div class="at-pagecard">${A.views.detail(x.key, state, true)}</div></div>`,
    }
  }
})(window.Atlas)
