// Curation (drift, candidates, ratify, mine), Memory, History, Settings, Agents, Chat and the HOLD state.
;(function (A) {
  const M = () => A.m
  const R = () => A.m.R
  const plural = (n, one, many = `${one}s`) => `${A.num(n)} ${n === 1 ? one : many}`
  const qs = (q) => (Object.keys(q).length ? `?${new URLSearchParams(q)}` : "")
  const clean = (q) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== ""))
  const more = (total, shown, href) => (total > shown ? `<div class="at-more"><span>Showing ${shown} of ${total}</span>${A.btn(`Show ${Math.min(10, total - shown)} more`, "go", { value: href })}</div>` : "")

  /* ---------- Curation ---------- */
  A.views.curation = (state) => {
    const q = state.query
    const s = M().stats()
    const tab = q.tab ?? "drift"
    const n = Number(q.n ?? 10)
    const href = (patch) => `#/curation${qs(clean({ ...q, fact: undefined, n: undefined, ...patch }))}`
    const tabs = [["drift", "Drifted", "drift", s.drifted], ["candidates", "Candidates", "sparkle", s.candidates], ["ratify", "Ratify", "shield", 0], ["mine", "Mine", "play"]]
    const hunk = (x, h) => `<div class="at-code"><div class="at-code-head"><span>@@ ${A.esc(h.at)} @@</span></div><pre>${h.lines.map((l) => `<div class="ln ${l[0] === "+" ? "add" : l[0] === "-" ? "del" : ""}"><span></span><span>${A.esc(l.slice(1))}</span></div>`).join("")}</pre></div>`
    const drift = () => {
      const commit = q.commit
      const area = q.area
      const list = M().live().filter((x) => M().state(x) === "drifted").filter((x) => !commit || x.drift.commits.some(([sha]) => sha === commit)).filter((x) => !area || M().areaOf(x.file) === area)
      const areas = [...new Set(M().live().filter((x) => M().state(x) === "drifted").map((x) => M().areaOf(x.file)))].sort()
      return `<p class="at-lead">These facts are anchored to whole files, and those files changed since the index was built at <code class="at-mono">${R().builtAt}</code>. A changed file does not mean a wrong fact: read the claim against the change. <b>Still holds</b> re-anchors it to the current code; <b>Retire</b> marks it superseded (it stays in the store).</p>
        <div class="at-toolbar"><label class="at-select">${A.icon("territory")}<select data-nav="area" aria-label="Area"><option value="">All areas</option>${areas.map((a) => `<option ${area === a ? "selected" : ""}>${A.esc(a)}</option>`).join("")}</select></label>
          <label class="at-select">${A.icon("commit")}<select data-nav="commit" aria-label="Commit"><option value="">Any commit</option>${M().codeChanges().map((c) => `<option value="${c.sha}" ${commit === c.sha ? "selected" : ""}>${A.esc(c.sha)} · ${A.esc(c.subject.slice(0, 48))} (${c.facts.length})</option>`).join("")}</select></label>
          <span class="at-hint">${plural(list.length, "fact")} to check</span></div>
        ${list.slice(0, n).map((x) => `<article class="at-card warm"><header>${A.chip("drifted")}${A.file(x.file)}<span class="grow"></span>${A.btn("Details", "open", { value: x.key })}</header>
          <h3>${A.esc(x.claim)}</h3>
          <div class="at-commits">${x.drift.commits.map(([sha, subj]) => `<div class="at-commit"><code class="at-sha">${A.esc(sha)}</code><span>${A.esc(subj)}</span></div>`).join("")}<small>${A.esc(x.drift.stat)}</small></div>
          ${x.drift.hunks.slice(0, 1).map((h) => hunk(x, h)).join("")}
          <footer><span class="grow">Does the claim still hold after this change?</span>${A.btn("Retire", "retire", { value: x.key })}${A.btn("Edit claim", "edit", { value: x.key })}${A.btn("Still holds", "reground", { value: x.key, primary: true })}</footer></article>`).join("") || `<div class="at-clear">${A.icon("checkc")}<strong>Nothing drifted</strong><p>Every fact matches the current code.</p></div>`}
        ${more(list.length, Math.min(n, list.length), href({ n: n + 10 }))}`
    }
    const candidates = () => {
      const list = M().candidates.filter((x) => !x.promotedNow && !x.discarded)
      return `<p class="at-lead">Mined by genesis and parked in staging. Agents never see staging. Promoting sends a candidate through the same four gates as any write — shape, truth (re-checked against the code now), authorization and ratification — so a promoted fact is never a shortcut.</p>
        <div class="at-gates">${[["Shape", "Template and size", "good"], ["Truth", "Anchor re-checked at HEAD on promote", "good"], ["Authorization", "Maestro holds atlas:mined", "good"], ["Ratification", "Promoted facts always need a ratify token", "warm"]].map(([g, d, t]) => `<div class="at-gate"><span class="at-state ${t}">${A.icon(t === "good" ? "checkc" : "lock")}${g}</span><small>${d}</small></div>`).join("")}</div>
        <div class="at-toolbar"><span class="at-hint">${plural(list.length, "candidate")} · 596 already promoted from the same run</span><span class="grow"></span>${list.length ? A.btn(`Promote all ${list.length}`, "promote-all", { primary: true }) : ""}</div>
        ${list.slice(0, n).map((x) => {
          const why = R().reasoning[x.why] ?? ""
          return `<article class="at-card"><header>${A.chip("pending")}${A.file(x.file)}<span class="grow"></span>${A.btn("Details", "open", { value: x.key })}</header>
          <h3>${A.esc(x.claim)}</h3>
          <details class="at-why-details"><summary>${A.icon("chev")}How genesis reached this</summary><div class="at-reasoning">${A.esc(why)}</div></details>
          <footer><span class="grow">${A.tier(x.tier)}${A.family(x.family)}</span>${A.btn("Leave in staging", "discard", { value: x.key })}${A.btn("Promote", "promote", { value: x.key, primary: true })}</footer></article>`
        }).join("") || `<div class="at-clear">${A.icon("checkc")}<strong>Staging is clear</strong><p>Every mined candidate has been decided.</p>${A.btn("Mine more", "go", { value: "#/curation?tab=mine" })}</div>`}
        ${more(list.length, Math.min(n, list.length), href({ n: n + 10 }))}`
    }
    const ratify = () => {
      const words = R().t0Keywords
      const flagged = M().live().filter((x) => !M().governing(x) && words.some((w) => x.claim.toLowerCase().includes(w)))
      return `<div class="at-clear">${A.icon("shield")}<strong>Nothing is waiting for ratification</strong><p>Ratifying moves an advisory fact into the governing band. <b>T1</b> needs a ratify token; <b>T0</b> must be right, so only a person ratifies it, with Billy supplying the security input.</p>${A.btn("Browse advisory facts", "go", { value: "#/knowledge?band=advisory" })}</div>
        <section class="at-panel" style="margin-block-start:16px"><header class="at-panel-head"><div><h3>Flagged by the write policy</h3><small>Advisory facts whose claim mentions ${words.map((w) => `<code>${A.esc(w)}</code>`).join(" or ")} — the policy's T0 keywords. A flag never promotes anything.</small></div><span class="wf-count">${flagged.length}</span></header>
        ${flagged.slice(0, 12).map((x) => `<div class="at-item" data-action="open" data-value="${x.key}" tabindex="0">${A.chip(M().state(x))}<div class="at-item-main"><div class="at-item-text clamp">${A.esc(x.claim)}</div><div class="at-item-meta">${A.file(x.file)}</div></div>${A.btn("Ratify…", "ratify", { value: x.key })}</div>`).join("") || '<div class="at-band-empty">No advisory fact mentions those keywords.</div>'}</section>`
    }
    const mine = () => `<p class="at-lead">Genesis reads the structural index, ranks the most important sites, and asks a model to propose one grounded claim per site. Every proposal is checked against the code; what passes lands in staging, never directly in knowledge.</p>
      <section class="at-panel"><div class="at-panel-body at-form">
        <label class="mx-field"><span>Scope</span><input id="mine-scope" value="${A.esc(q.scope ?? "")}" placeholder="packages/knowledge (empty = whole repository)"></label>
        <div class="mx-field"><span>Arms</span><div class="at-checks">${[["advisory", "Observations", true], ["dependency", "Dependencies (needs index.scip)", true], ["count", "Counts", true], ["definition", "Definitions (feeds ontology)", false]].map(([id, l, on]) => `<label><input type="checkbox" ${on ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
        <div class="mx-field"><span>Sites</span><div class="wf-range"><button aria-pressed="true">Files</button><button aria-pressed="false">Symbols</button></div><small>Symbol sites anchor to a function or block, so they drift only when that unit changes.</small></div>
        <label class="mx-field"><span>Budget (sites)</span><input type="number" value="200" min="1" max="200"><small>Default: up to 200 sites. Measured cost is about $0.10 per site, so this run is about $20.</small></label>
        <div class="mx-field"><span>Model</span><div class="at-fileline" style="cursor:default">${A.icon("settings")}<code>~/.config/atlas/model.json</code><span class="grow"></span><small>configured on this machine</small></div></div>
      </div><footer class="at-card-foot"><span class="grow">Results arrive in Candidates. Nothing reaches agents until it is promoted.</span>${A.btn("Start mining", "mine", { primary: true, icon: "play" })}</footer></section>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Curation"], [tabs.find((t) => t[0] === tab)[1]]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Curation</div><h1>Curation</h1><p>The governed write path: decide what drifted, promote what was mined, ratify what should govern, and mine new areas. Every action goes through an Atlas door with your identity, and nothing is deleted.</p></div></div>
      <div class="wf-tabs" role="tablist">${tabs.map(([id, label, glyph, c]) => `<button class="wf-tab" role="tab" aria-selected="${tab === id}" data-action="go" data-value="#/curation?tab=${id}">${A.icon(glyph)}${label}${c !== undefined ? `<span class="wf-count">${A.num(c)}</span>` : ""}</button>`).join("")}</div>
      ${{ drift, candidates, ratify, mine }[tab]()}</div>`,
    }
  }

  /* ---------- Memory ---------- */
  A.views.memory = (state) => {
    const member = ["backend", "jimmy", "archie", "maestro"].includes(state.params[0]) ? state.params[0] : "backend"
    const m = M().memory[member]
    const name = { backend: "Backend", jimmy: "Jimmy", archie: "Archie", maestro: "Maestro" }[member]
    const tab = state.query.tab ?? "tasks"
    const raw = state.query.raw === "1"
    const header = `<atlas-header member="${member}" rules="0">\nAwareness:\n${M().awareness.map((a) => `  ${a.facet}: ${a.state === "seeded" ? a.text : "UN-SEEDED"}`).join("\n")}\nOrientation:\n  (empty)\nProject rules:\n  (none)\n</atlas-header>`
    const tabs = [["tasks", "Tasks", "check", m.tasks.length], ["prs", "Pull requests", "branch", m.prs.length], ["rules", "Project rules", "shield", m.rules.length], ...(member === "maestro" ? [["logbook", "Logbook", "history", 0]] : [])]
    const taskCard = (t) => `<article class="at-card"><header><span class="at-kind blue">${A.icon("check")}Task</span><code class="at-mono">${A.esc(t.taskId)}</code><span class="grow"></span><span class="at-state good" data-tip="Scanned for secrets with gitleaks before it was saved.">${A.icon("shield")}Scanned</span></header>
      <dl class="at-kv wide"><dt>Tried</dt><dd>${t.attempted.map(A.esc).join("<br>")}</dd><dt>Failed with</dt><dd>${t.failedWith.length ? t.failedWith.map(A.esc).join("<br>") : "<small>nothing</small>"}</dd><dt>Stopped at</dt><dd>${A.esc(t.stoppedAt)}</dd><dt>Lesson</dt><dd class="at-lesson-text">${A.esc(t.lesson)}</dd><dt>Ref</dt><dd><code>${A.esc(t.ref)}</code></dd></dl>
      <footer><span class="grow"><code class="at-mono">${A.esc(t.source)}</code></span>${A.btn("Promote lesson to rule…", "promote-rule", { value: t.taskId })}</footer></article>`
    const empty = (what, why) => `<div class="at-clear">${A.icon("memory")}<strong>${what}</strong><p>${why}</p></div>`
    const body = !m.bound
      ? empty("Maestro's memory is not bound in Orchestra", "Atlas defines memory and a logbook for the orchestrator, but Orchestra binds memory only for Backend, Jimmy and Archie today.")
      : { tasks: () => (m.tasks.length ? m.tasks.map(taskCard).join("") : empty("No task memory yet", `${name} records one when it stops or finishes a task: what it tried, what failed, where it stopped and the lesson.`)),
          prs: () => empty("No pull request memory yet", "One entry per PR: decisions, review outcomes and the knowledge it changed."),
          rules: () => empty("No project rules yet", `Rules are the only memory injected into every turn: one imperative line each, at most 12, ordered by how often they are used. Promote a task lesson to create one.`),
          logbook: () => empty("No logbook entries", "One entry per PR: what shipped, decisions and why, trade-offs, risks, open threads.") }[tab]()
    return {
      crumbs: [["Atlas", "#/overview"], ["Memory", "#/memory/backend"], [name]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Memory</div><h1>Memory</h1><p>Each member's own experience of doing the work. Private to the member, never mixed into shared knowledge, and nothing is deleted — unused rules leave the turn header and are archived.</p></div></div>
      <div class="at-seats-row">${["backend", "jimmy", "archie", "maestro"].map((id) => { const mm = M().memory[id]; const nm = { backend: "Backend", jimmy: "Jimmy", archie: "Archie", maestro: "Maestro" }[id]; return `<a class="at-member ${id === member ? "on" : ""} ${mm.bound ? "" : "off"}" href="#/memory/${id}"><i>${nm[0]}</i><span><strong>${nm}</strong><small>${mm.bound ? `${mm.tasks.length + mm.prs.length + mm.rules.length} records` : "not bound in Orchestra"}</small></span></a>` }).join("")}</div>
      ${m.bound ? `<section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("memory")}Turn header</h3><small>Added to every turn ${name} runs · Awareness and Orientation are shared by all members; rules are ${name}'s own</small></div>${A.btn(raw ? "Show structured" : "Show as injected", "go", { value: `#/memory/${member}${qs(clean({ tab: state.query.tab, raw: raw ? "" : "1" }))}` })}</header><div class="at-panel-body">
        ${raw ? `<pre class="at-raw">${A.esc(header)}</pre>` : `<div class="mx-eyebrow">Awareness · shared</div>
        <div class="at-facets5">${M().awareness.map((a) => `<div class="at-facet ${a.state === "seeded" ? "" : "unseeded"}"><strong>${a.facet}</strong><span class="at-state ${a.state === "seeded" ? "good" : ""}">${A.icon(a.state === "seeded" ? "checkc" : "minusc")}${a.state === "seeded" ? "seeded" : "not seeded"}</span><p>${a.text ? A.esc(a.text) : ""}</p><small>${A.esc(a.source)}</small></div>`).join("")}</div>
        <div class="at-two" style="margin-block-start:14px"><div><div class="mx-eyebrow">Orientation · shared</div><div class="at-band-empty left">Empty. Orientation is a fold over the event log, and nothing writes that log yet.</div></div>
        <div><div class="mx-eyebrow">Project rules · ${name} · 0 of 12</div><div class="at-band-empty left">No rules yet.</div></div></div>`}
      </div></section>` : ""}
      <div class="wf-tabs" role="tablist">${tabs.map(([id, label, glyph, c]) => `<button class="wf-tab" role="tab" aria-selected="${tab === id}" data-action="go" data-value="#/memory/${member}${id === "tasks" ? "" : `?tab=${id}`}">${A.icon(glyph)}${label}<span class="wf-count">${c}</span></button>`).join("")}</div>
      ${body}
      <p class="mx-note">Stored in <code>.atlas/memory.jsonl</code> in the worktree, append-only and versioned with the repository. Tasks and PRs are read only when the member asks for them; they are never injected.</p></div>`,
    }
  }

  /* ---------- History ---------- */
  A.views.history = () => {
    const changes = M().codeChanges()
    return {
      crumbs: [["Atlas", "#/overview"], ["History"]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · History</div><h1>History</h1><p>How what agents know got here: the store's generations, the code changes that drifted knowledge, and memory writes.</p></div></div>
      <section class="at-panel"><header class="at-panel-head"><div><h3>Code changes since the build</h3><small>Commits after ${R().builtAt} that touched files with knowledge</small></div><span class="wf-count">${changes.length}</span></header>
        ${changes.map((c) => `<div class="at-attn" data-action="go" data-value="#/curation?tab=drift&commit=${c.sha}" tabindex="0"><code class="at-sha">${A.esc(c.sha)}</code><div><strong>${A.esc(c.subject)}</strong><small>${plural(c.facts.length, "fact")} drifted · ${[...new Set(c.facts.map((x) => M().areaOf(x.file)))].slice(0, 3).map(A.esc).join(", ")}</small></div>${A.icon("arrow")}</div>`).join("")}</section>
      <section class="at-panel"><header class="at-panel-head"><div><h3>Store generations</h3><small>Every write publishes a new generation; the last four are kept, and the content store keeps every version</small></div></header><div class="at-panel-body"><ul class="at-timeline">
        <li><span class="at-tl-dot good">${A.icon("check")}</span><div class="at-tl-body"><strong>Knowledge · generation ${R().gen} (current)</strong><small>${A.num(M().stats().facts)} facts · built at <code>${R().builtAt}</code> · Sep 8</small></div></li>
        <li><span class="at-tl-dot blue">${A.icon("sparkle")}</span><div class="at-tl-body"><strong>Promoted 596 facts from staging</strong><small>through the emit door as Maestro · scope <code>atlas:mined</code> · Sep 2</small></div></li>
        <li><span class="at-tl-dot">${A.icon("history")}</span><div class="at-tl-body"><strong>Staging · generations 2626–${R().stagingGen}</strong><small>660 candidates mined across four passes · Aug 25</small></div></li>
      </ul></div></section>
      <section class="at-panel"><header class="at-panel-head"><div><h3>Memory writes</h3></div></header><div class="at-panel-body"><ul class="at-timeline">
        <li><span class="at-tl-dot">${A.icon("memory")}</span><div class="at-tl-body"><a class="at-tl-link" href="#/memory/backend">Backend recorded task T-LIVE-1</a><small>admitted after secret scan · Oct 10</small></div></li></ul></div></section>
      <p class="mx-note">Knowledge history lives in this machine's store; it is not in git. Memory history travels with the repository.</p></div>`,
    }
  }

  /* ---------- Settings ---------- */
  A.views.settings = (state) => {
    const tab = state.query.tab ?? "territories"
    const tabs = [["territories", "Territories", "territory"], ["policy", "Write policy", "lock"], ["index", "Index", "tree"], ["store", "Store", "server"]]
    const body = {
      territories: `<div class="at-callout">${A.icon("info")}<div><strong>No territories declared.</strong> Every path is uncovered, so no fact has an owner and the Awareness <code>terrain</code> facet stays empty. A territory gives a region an owner and a tier.</div>${A.btn("Declare territory", "territory", { primary: true })}</div>
        <section class="at-panel"><header class="at-panel-head"><div><h3>Suggested from where knowledge lives</h3><small>Areas with the most facts. Declaring one writes it to the territory catalog.</small></div></header>
        ${M().areas().slice(0, 8).map((a) => `<div class="at-item" style="cursor:default">${A.icon("territory")}<div class="at-item-main"><div class="at-item-text"><code class="at-mono">${A.esc(a.id)}/**</code></div><div class="at-item-meta">${a.facts} facts · ${a.drifted} drifted · ${M().dependents(a.id).length} files outside depend on it</div></div>${A.btn("Declare…", "territory", { value: a.id })}</div>`).join("")}</section>`,
      policy: `<section class="at-panel"><header class="at-panel-head"><div><h3>Who may write each scope</h3><small>From <code>.atlas/policy.json</code>, versioned with the repository. An unlisted scope is closed to everyone.</small></div></header>
        ${Object.entries(R().policy).map(([scope, actors]) => `<div class="at-item" style="cursor:default">${A.icon("lock")}<div class="at-item-main"><div class="at-item-text"><code class="at-mono">${A.esc(scope)}</code></div><div class="at-item-meta">Mined facts land here; holding it lets the promote door write</div></div>${actors.map((a) => A.agent(a)).join("")}</div>`).join("")}</section>
        <section class="at-panel"><header class="at-panel-head"><div><h3>T0 keywords</h3><small>A territory or fact mentioning these is flagged for human ratification. A flag never promotes.</small></div></header><div class="at-panel-body">${R().t0Keywords.map((k) => `<span class="mx-badge">${A.esc(k)}</span>`).join(" ")}</div></section>
        <p class="mx-note">The writer's identity is whatever the environment declares (<code>ATLAS_ACTOR</code> or the git e-mail); it is not authenticated. Truth is protected by the grounding gate, not by this list.</p>`,
      index: `<section class="at-panel"><div class="at-panel-body"><dl class="at-kv wide">
        <dt>Built at</dt><dd><code>${R().builtAt}</code> <span class="at-pill warm">${A.icon("drift")}code is at ${R().head}</span></dd>
        <dt>Spatial axis</dt><dd>repository → package → module → file${" "}<small>· anchors are file-level in this store</small></dd>
        <dt>Dependency axis</dt><dd>${R().scip ? `<span class="at-state good">${A.icon("checkc")}on</span> from <code>.atlas/index.scip</code>` : '<span class="at-state">off — no index.scip</span>'}</dd>
        <dt>Territory axis</dt><dd><span class="at-state">${A.icon("minusc")}empty</span> no territories declared</dd>
        <dt>Rebuild</dt><dd><code>scip-typescript index --output .atlas/index.scip</code><br><small>Atlas does not run the indexer itself; it reads the file it produces.</small></dd></dl></div></section>`,
      store: `<section class="at-panel"><div class="at-panel-body"><dl class="at-kv wide">
        <dt>Location</dt><dd><code>.atlas/</code> in the project root</dd>
        <dt>In git</dt><dd>Memory (<code>memory.jsonl</code>) and the write policy are versioned. <b>Knowledge is not</b>: the projection and the content store stay on this machine.</dd>
        <dt>Knowledge</dt><dd>generation ${R().gen} · ${A.num(M().stats().facts)} facts · ${A.num(R().casObjects)} stored objects</dd>
        <dt>Staging</dt><dd>generation ${R().stagingGen} · 660 rows (${M().stats().candidates} not promoted)</dd>
        <dt>Integrity</dt><dd><span class="at-state good">${A.icon("checkc")}sound</span> every object re-hashes to its name</dd>
        <dt>Export</dt><dd>${A.btn("Export content store", "toast", { value: "Writes atlas-okf.json with every stored object. Import rebuilds objects, not the current-knowledge index.", icon: "download" })}</dd></dl></div></section>`,
    }[tab]
    return {
      crumbs: [["Atlas", "#/overview"], ["Settings"], [tabs.find((t) => t[0] === tab)[1]]],
      html: `<div class="at-page narrow"><div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Settings</div><h1>Settings</h1><p>Who owns what, who may write, and where the index and the store stand.</p></div></div>
      <div class="wf-tabs" role="tablist">${tabs.map(([id, label, glyph]) => `<button class="wf-tab" role="tab" aria-selected="${tab === id}" data-action="go" data-value="#/settings?tab=${id}">${A.icon(glyph)}${label}</button>`).join("")}</div>${body}</div>`,
    }
  }

  /* ---------- Agents (link to memory) ---------- */
  A.views.agents = (state) => {
    const id = ["backend", "jimmy", "archie", "maestro", "patty", "billy"].includes(state.params[0]) ? state.params[0] : "backend"
    const name = { backend: "Backend", jimmy: "Jimmy", archie: "Archie", maestro: "Maestro", patty: "Patty", billy: "Billy" }[id]
    const mem = M().memory[id]
    return {
      crumbs: [["Agents", "#/agents/backend"], [name]],
      html: `<div class="at-page narrow"><div class="at-agent-head"><span class="at-avatar">${name[0]}</span><div><h1>${name}</h1><p>Agent profile (existing Agents chapter)</p></div></div>
        <section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("memory")}Memory</h3><small>${mem?.bound ? "Lives in Atlas, with the rest of what agents know" : "This agent keeps no Atlas memory in Orchestra"}</small></div>${mem?.bound ? A.btn("Open in Atlas", "go", { value: `#/memory/${id}`, primary: true, icon: "arrow" }) : ""}</header>
        ${mem?.bound ? `<div class="at-panel-body"><div class="at-two"><div><div class="mx-eyebrow">Records</div><strong>${mem.tasks.length + mem.prs.length}</strong></div><div><div class="mx-eyebrow">Project rules in its header</div><strong>${mem.rules.length} of 12</strong></div></div></div>` : ""}</section></div>`,
    }
  }

  /* ---------- Chat: what the agent used from Atlas ---------- */
  A.views.chat = (state) => {
    const open = state.query.used === "1"
    return {
      flush: true,
      crumbs: [["Chat"], ["Counter decrement"]],
      html: `<div class="at-session"><div class="at-tabs-strip"><span class="at-sess-tab">${A.icon("chat")}Counter decrement <code>main</code></span></div>
      <div class="at-transcript">
        <div class="at-turn user">Add decrement() to Counter, clamped at zero. Stop after phase 1.</div>
        <div class="at-turn"><div class="at-turn-head">${A.agent("backend")}<span>Oct 10</span></div>
          <div class="at-tool">${A.icon("atlas")}<code>atlas_context</code><span>unit</span><a class="at-chip" href="#/map?path=packages%2Fgenesis">${A.icon("stack")}own · packages/genesis<span class="st">complete · fresh</span></a></div>
          <p>Phase 1 is done: <code class="at-mono">decrement()</code> lowers the value by one and never goes below zero. I stopped at the phase boundary as the packet asked.</p>
          <div class="at-tool">${A.icon("memory")}<code>atlas_memory_emit</code><span>task T-LIVE-1</span><a class="at-chip memory" href="#/memory/backend">${A.icon("memory")}memory · admitted<span class="st">scanned</span></a></div>
          <button class="at-used" data-action="go" data-value="#/chat${open ? "" : "?used=1"}" aria-expanded="${open}">${A.icon("atlas")}<span>Atlas in this turn</span>${A.icon("chev", open ? "flip" : "")}</button>
          ${open ? `<div class="at-used-body"><dl class="at-kv wide"><dt>Header</dt><dd>Awareness (1 of 5 facets seeded) · Orientation empty · 0 project rules</dd><dt>Read</dt><dd>own briefing of <a class="mx-link" href="#/map?path=packages%2Fgenesis">packages/genesis</a> · complete, fresh, 42 tokens</dd><dt>Wrote</dt><dd>task memory T-LIVE-1 · admitted after the secret scan</dd></dl></div>` : ""}
        </div></div>
      <div class="at-composer">Ask anything, / for commands, @ for context…<div class="row">${A.icon("atlas")}<span>@atlas to add a scope briefing to the context</span><span class="grow"></span><span>Claude Opus</span></div></div></div>`,
    }
  }

  /* ---------- HOLD: Atlas not connected to this project ---------- */
  A.views.held = () => ({
    crumbs: [["Atlas"]],
    html: `<div class="at-page narrow"><div class="at-held"><span class="mx-mark">${A.icon("atlas")}</span><h2>Atlas isn't connected to this project</h2>
      <span class="at-pill warm">${A.icon("warning")}provider-unconfigured</span>
      <p>Atlas is not configured for this project (<code class="at-mono">maestro.atlas</code>), so governed work cannot proceed here; the owner decides.</p>
      ${A.code(".orchestra/orchestra.jsonc", 1, ["{", "  \"maestro\": {", "    \"atlas\": { \"projectID\": \"atlas\", \"directory\": \".atlas\" }", "  }", "}"], { highlight: [3] })}
      <div style="display:flex;gap:8px;justify-content:center">${A.btn("Copy", "copy", { icon: "copy", value: '"maestro": { "atlas": { "projectID": "atlas", "directory": ".atlas" } }' })}${A.btn("Connect", "state", { value: "ready", primary: true })}</div></div></div>`,
  })
})(window.Atlas)
