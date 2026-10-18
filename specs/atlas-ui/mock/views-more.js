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
    const pendingRatify = M().live().filter((x) => x.proposedTier)
    const tabs = [["drift", "Drifted", "drift", s.drifted], ["candidates", "Candidates", "sparkle", s.candidates], ["ratify", "Ratify", "shield", pendingRatify.length], ["mine", "Mine", "play"]]
    const hunk = (x, h) => `<div class="at-code"><div class="at-code-head"><span>@@ ${A.esc(h.at)} @@</span></div><pre>${h.lines.map((l) => `<div class="ln ${l[0] === "+" ? "add" : l[0] === "-" ? "del" : ""}"><span></span><span>${A.esc(l.slice(1))}</span></div>`).join("")}</pre></div>`
    const drift = () => {
      const commit = q.commit
      const area = q.area
      const list = M().live().filter((x) => M().state(x) === "drifted").filter((x) => !commit || x.drift.commits.some(([sha]) => sha === commit)).filter((x) => !area || M().areaOf(x.file) === area)
      const areas = [...new Set(M().live().filter((x) => M().state(x) === "drifted").map((x) => M().areaOf(x.file)))].sort()
      return `<p class="at-lead">These facts are anchored to whole files that changed since they were derived. The old content exists nowhere at HEAD, so <code>doctor reground</code> classes all of them <b>semantic</b>, and <code>reconcile</code> exits 2 for any merge whose diff changes one. Read the claim against the change: <b>Rewrite</b> drafts it against the current file and emits it, which adds the new claim beside the old one (R8 would replace it); <b>Retire</b> drafts a superseding fact against the current file. Re-emitting it unchanged does not clear the drift.</p>
        <div class="at-toolbar"><label class="at-select">${A.icon("territory")}<select data-nav="area" aria-label="Unit"><option value="">All units</option>${areas.map((a) => `<option ${area === a ? "selected" : ""}>${A.esc(a)}</option>`).join("")}</select></label>
          <label class="at-select">${A.icon("commit")}<select data-nav="commit" aria-label="Commit"><option value="">Any commit</option>${M().codeChanges().map((c) => `<option value="${c.sha}" ${commit === c.sha ? "selected" : ""}>${A.esc(c.sha)} · ${A.esc(c.subject.slice(0, 48))} (${c.facts.length})</option>`).join("")}</select></label>
          <span class="at-hint">${plural(list.length, "fact")} to check</span></div>
        ${list.slice(0, n).map((x) => `<article class="at-card warm"><header>${A.chip("drifted")}${A.file(x.file)}<span class="grow"></span>${A.btn("Details", "open", { value: x.key })}</header>
          <h3>${A.esc(x.claim)}</h3>
          <div class="at-commits">${x.drift.commits.map(([sha, subj]) => `<div class="at-commit"><code class="at-sha">${A.esc(sha)}</code><span>${A.esc(subj)}</span></div>`).join("")}<small>${A.esc(x.drift.stat)}</small></div>
          ${x.drift.hunks.slice(0, 1).map((h) => hunk(x, h)).join("")}
          <footer><span class="grow"><span class="at-state bad" data-tip="reconcile against a merge base exits 2 when the PR changes this file">${A.icon("lock")}Semantic</span></span>${A.btn("Retire", "retire", { value: x.key })}${A.newcap("R8")}${A.btn("Rewrite claim", "edit", { value: x.key, primary: true })}</footer></article>`).join("") || `<div class="at-clear">${A.icon("checkc")}<strong>Nothing drifted</strong><p>Every fact matches the current code.</p></div>`}
        ${more(list.length, Math.min(n, list.length), href({ n: n + 10 }))}`
    }
    const candidates = () => {
      const list = M().candidates.filter((x) => !x.promotedNow && !x.discarded)
      return `<p class="at-lead">Mined by genesis and parked in staging. Agents never see staging. <code>atlas promote</code> takes no arguments: it re-presents <b>every</b> staging row through the emit door, already-promoted ones included, and each must pass the gates again. The batch is not atomic.</p>
        <div class="at-gates">${[["Shape", "Tier, scope, family and grounding well formed", "good"], ["Truth", "Anchor re-derived FRESH at HEAD; a file changed since mining is refused", "good"], ["Authorization", "The actor must hold atlas:mined (seat:orchestrator); no scope move or tier downgrade", "good"], ["Ratification", "Promoted rows always need a ratify token", "warm"]].map(([g, d, t]) => `<div class="at-gate"><span class="at-state ${t}">${A.icon(t === "good" ? "checkc" : "lock")}${g}</span><small>${d}</small></div>`).join("")}</div>
        <div class="at-toolbar"><span class="at-hint">${plural(list.length, "candidate")} not yet promoted · 660 staging rows in total</span><span class="grow"></span>${list.length ? A.btn("Promote all staged rows", "promote-all", { primary: true }) : ""}</div>
        ${list.slice(0, n).map((x) => {
          const why = R().reasoning[x.why] ?? ""
          return `<article class="at-card"><header>${A.chip("pending")}${A.file(x.file)}<span class="grow"></span>${A.btn("Details", "open", { value: x.key })}</header>
          <h3>${A.esc(x.claim)}</h3>
          <details class="at-why-details"><summary>${A.icon("chev")}How genesis reached this</summary><div class="at-reasoning">${A.esc(why)}</div></details>
          <footer><span class="grow">${A.tier(x.tier)}${A.family(x.family)}</span>${A.newcap("R2")}${A.btn("Leave in staging", "discard", { value: x.key })}${A.btn("Promote this one", "promote", { value: x.key })}</footer></article>`
        }).join("") || `<div class="at-clear">${A.icon("checkc")}<strong>Staging is clear</strong><p>Every mined candidate has been decided.</p>${A.btn("Mine more", "go", { value: "#/curation?tab=mine" })}</div>`}
        ${more(list.length, Math.min(n, list.length), href({ n: n + 10 }))}`
    }
    const ratify = () => {
      const names = { archie: "Archie", lucy: "Lucy", backend: "Backend", jimmy: "Jimmy" }
      const kw = R().t0Keywords ?? []
      const t0 = M().territories().filter((t) => kw.some((k) => t.name.includes(k)))
      const waiting = pendingRatify.map((x) => `<article class="at-card"><header>${A.chip(M().state(x))}${A.file(x.file)}<span class="grow"></span>${A.btn("Details", "open", { value: x.key })}</header><h3>${A.esc(x.claim)}</h3>
        <p class="at-why">${A.icon("info")}${names[x.proposedBy] ?? x.proposedBy} proposes this as ${x.proposedTier}${x.slot ? ` · type <code>${A.esc(x.slot)}</code>` : ""}. Ratifying re-emits it at the higher tier: it enters the governing band of <code>${A.esc(M().unitOf(x.file))}</code>, and the raise replaces its claims with the ratified one.</p>
        <footer><span class="grow">${A.tier(x.tier)} → ${A.tier(x.proposedTier)}</span>${A.btn("Reject", "reject-ratify", { value: x.key })}${A.btn("Ratify…", "ratify", { value: x.key, primary: true })}</footer></article>`).join("")
      const intro = `<p class="at-lead">Ratifying re-emits a fact at a higher tier through <code>atlas-emit</code>. <b>T1</b> needs a ratify token; <b>T0</b> needs the ratifier token <code>billy</code>, and the constitution line of each bound member's header counts it. The store does not record who ratified.</p>`
      const queue = waiting ? `<div class="at-section-title"><h3>Proposed by reviewers</h3>${A.newcap("R3")}</div>${waiting}` : `<div class="at-clear">${A.icon("shield")}<strong>Nothing proposed</strong><p>Open any advisory fact and choose Ratify.</p>${A.btn("Browse knowledge", "go", { value: "#/knowledge" })}</div>`
      return `${intro}${queue}
        <section class="at-panel" style="margin-block-start:16px"><header class="at-panel-head"><div><h3>T0 candidates</h3><small><code>atlas init</code> flags a territory whose name contains a keyword from <code>policy.json</code> <code>t0Heuristic.keywords</code>: here ${kw.map((k) => `<code>${A.esc(k)}</code>`).join(", ") || "none"}. A flag never assigns the tier.</small></div><span class="wf-count">${t0.length}</span></header>
        ${t0.map((t) => `<div class="at-item" style="cursor:default">${A.icon("territory")}<div class="at-item-main"><div class="at-item-text">${A.esc(t.name)}</div></div>${A.tier(t.tier)}</div>`).join("") || '<div class="at-band-empty">No territory name contains one of these keywords.</div>'}</section>`
    }
    const mine = () => `<p class="at-lead">${M().provenance() === "trusted" ? "" : "<b>Mining and promoting are refused on this store</b>: its projection and content store are committed to git. "}Genesis reads the structural index, ranks sites, and asks a model to propose one claim per site. Proposals land in staging, never directly in knowledge. The advisory arm is not truth-checked at mining time; the truth gate runs when the row is promoted.</p>
      <section class="at-panel"><div class="at-panel-body at-form">
        <div class="mx-field"><span>Scope</span><div class="at-fileline" style="cursor:default">${A.icon("territory")}<code>whole repository</code><span class="grow"></span><small>atlas mine ignores its path argument</small></div></div>
        <div class="mx-field"><span>Arms</span><div class="wf-range"><button aria-pressed="true">All three</button><button aria-pressed="false">advisory</button><button aria-pressed="false">dependency</button><button aria-pressed="false">count</button><button aria-pressed="false">definition</button><button aria-pressed="false">semantic</button></div><small>The default runs advisory, dependency and count together; <code>ATLAS_MINE_SLOT</code> runs exactly one. Definition and semantic exist only that way.</small></div>
        <div class="mx-field"><span>Sites</span><div class="wf-range"><button aria-pressed="true">Files</button><button aria-pressed="false">Files + symbols</button></div><small>Symbol and block units are added to the file sites, not substituted.</small></div>
        <label class="mx-field"><span>Budget per arm (sites)</span><input type="number" value="200" min="1"><small>Default: up to 200 sites per arm, so up to 600 in a default run. Needs <code>.atlas/index.scip</code>; without it there are no sites.</small></label>
        <div class="mx-field"><span>Model</span><div class="at-fileline" style="cursor:default">${A.icon("settings")}<code>$ATLAS_MODEL_CONFIG · $XDG_CONFIG_HOME/atlas/model.json · ~/.config/atlas/model.json</code></div><small>Must live outside the repository.</small></div>
      </div><footer class="at-card-foot"><span class="grow">Results arrive in Candidates.</span>${A.btn("Start mining", "mine", { primary: true, icon: "play" })}</footer></section>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Curation"], [tabs.find((t) => t[0] === tab)[1]]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · Curation</div><h1>Curation</h1><p>The governed write path: decide what drifted, promote what was mined, ratify what should govern, and mine. Every write goes through an Atlas door under the declared actor and nothing is deleted. Orchestra's agents never read this store: they read a reviewed Own snapshot (R7).</p></div></div>
      <div class="wf-tabs" role="tablist">${tabs.map(([id, label, glyph, c]) => `<button class="wf-tab" role="tab" aria-selected="${tab === id}" data-action="go" data-value="#/curation?tab=${id}">${A.icon(glyph)}${label}${c !== undefined ? `<span class="wf-count">${A.num(c)}</span>` : ""}</button>`).join("")}</div>
      ${{ drift, candidates, ratify, mine }[tab]()}</div>`,
    }
  }

  /* ---------- History ---------- */
  A.views.history = () => {
    const changes = M().codeChanges()
    return {
      crumbs: [["Atlas", "#/overview"], ["History"]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">Atlas · History</div><h1>History</h1><p>How what agents know got here: the store's generations, the code changes that drifted knowledge, and memory writes.</p></div></div>
      <section class="at-panel"><header class="at-panel-head"><div><h3>Code changes since the build</h3><small>Commits since each fact was derived that changed its file</small></div><span class="wf-count">${changes.length}</span></header>
        ${changes.map((c) => `<div class="at-attn" data-action="go" data-value="#/curation?tab=drift&commit=${c.sha}" tabindex="0"><code class="at-sha">${A.esc(c.sha)}</code><div><strong>${A.esc(c.subject)}</strong><small>${plural(c.facts.length, "fact")} drifted · ${[...new Set(c.facts.map((x) => M().areaOf(x.file)))].slice(0, 3).map(A.esc).join(", ")}</small></div>${A.icon("arrow")}</div>`).join("")}</section>
      <section class="at-panel"><header class="at-panel-head"><div><h3>Store generations</h3><small>Every write publishes a new generation. This store keeps one past knowledge generation file and four staging ones; the content store keeps every version</small></div></header><div class="at-panel-body"><ul class="at-timeline">
        <li><span class="at-tl-dot good">${A.icon("check")}</span><div class="at-tl-body"><strong>Knowledge · generation ${R().gen} (current)</strong><small>${A.num(M().stats().facts)} facts · built at <code>${R().builtAt}</code> · date from the file, not recorded by Atlas</small></div></li>
        <li><span class="at-tl-dot blue">${A.icon("sparkle")}</span><div class="at-tl-body"><strong>596 of the staged facts are current knowledge</strong><small>promoted through the emit door by actor <code>seat:orchestrator</code> · scope <code>atlas:mined</code> · Atlas keeps no promotion event; this is inferred from the store</small></div></li>
        <li><span class="at-tl-dot">${A.icon("history")}</span><div class="at-tl-body"><strong>Staging · generations 2626–${R().stagingGen}</strong><small>660 staging rows · the last four generations are kept</small></div></li>
      </ul></div></section>
      <section class="at-panel"><header class="at-panel-head"><div><h3>Memory writes</h3></div></header><div class="at-panel-body"><ul class="at-timeline">
        <li><span class="at-tl-dot">${A.icon("memory")}</span><div class="at-tl-body"><a class="at-tl-link" href="#/memory/backend">Backend wrote checkpoints for T-LIVE-1…5</a><small>live continuity runs · Oct 11 UTC · refused writes are only in the session receipts</small></div></li></ul></div></section>
      <p class="mx-note">${M().provenance() === "trusted" ? "Knowledge history lives in this machine's store; it is not in git." : "This repository commits the projection and the content store, so knowledge history also travels in git."} Memory travels with the repository only if the project tracks <code>.atlas/memory.jsonl</code>; Orchestra does not commit it.</p></div>`,
    }
  }

  /* ---------- Settings ---------- */
  A.views.settings = (state) => {
    const tab = state.query.tab ?? "territories"
    const tabs = [["territories", "Territories", "territory"], ["policy", "Write policy", "lock"], ["index", "Index", "tree"], ["store", "Store", "server"]]
    const body = {
      territories: M().territories().length ? `<section class="at-panel"><header class="at-panel-head"><div><h3>Declared territories</h3><small>From TERRITORY-CATALOG.json, committed and edited by hand. Each gives units an owner and a tier; overlaps resolve deterministically.</small></div>${A.newcap("R4")}${A.btn("Declare territory", "territory", { icon: "plus" })}</header>
        ${M().territories().map((t) => { const us = M().units().filter((u) => M().territoryOf(u.id) === t); return `<div class="at-item" style="cursor:default">${A.icon("territory")}<div class="at-item-main"><div class="at-item-text">${A.esc(t.name)}</div><div class="at-item-meta"><code>${t.globs.map(A.esc).join(" · ")}</code><span>${us.length} units · ${us.reduce((n, u) => n + u.facts, 0)} facts</span></div></div>${A.agent(t.owner)}${A.tier(t.tier)}</div>` }).join("")}</section>
        ${(() => { const loose = M().units().filter((u) => !M().territoryOf(u.id)); return loose.length ? `<section class="at-panel"><header class="at-panel-head"><div><h3>Units with no territory</h3><small>Nobody owns these yet.</small></div></header>${loose.map((u) => `<div class="at-item" style="cursor:default">${A.icon("stack")}<div class="at-item-main"><div class="at-item-text"><code class="at-mono">${A.esc(u.id)}</code></div><div class="at-item-meta">${u.facts} facts</div></div>${A.btn("Declare…", "territory", { value: u.id })}</div>`).join("")}</section>` : "" })()}` : `<div class="at-callout">${A.icon("info")}<div><strong>No territories declared.</strong> Every path is uncovered, so no fact has an owner and the Awareness <code>terrain</code> facet stays empty. A territory gives a region an owner and a tier.</div>${A.btn("Declare territory", "territory", { primary: true })}</div>
        <section class="at-panel"><header class="at-panel-head"><div><h3>Suggested from the units</h3><small>Units with the most facts. Declaring a territory gives one or more units an owner and a tier.</small></div></header>
        ${M().areas().slice(0, 8).map((a) => `<div class="at-item" style="cursor:default">${A.icon("territory")}<div class="at-item-main"><div class="at-item-text"><code class="at-mono">${A.esc(a.id)}/**</code></div><div class="at-item-meta">${a.facts} facts · ${a.drifted} drifted · ${M().dependents(a.id).length} files outside depend on it</div></div>${A.btn("Declare…", "territory", { value: a.id })}</div>`).join("")}</section>`,
      policy: `<section class="at-panel"><header class="at-panel-head"><div><h3>Who may write each scope</h3><small>From <code>.atlas/policy.json</code>, versioned with the repository. An unlisted scope is closed to everyone.</small></div></header>
        ${Object.entries(R().policy).map(([scope, actors]) => `<div class="at-item" style="cursor:default">${A.icon("lock")}<div class="at-item-main"><div class="at-item-text"><code class="at-mono">${A.esc(scope)}</code></div><div class="at-item-meta">${scope === "atlas:mined" ? "Where genesis files mined facts; holding it lets the promote door write" : "Knowledge scope"}</div></div>${actors.map((a) => A.agent(a)).join("")}</div>`).join("")}</section>
        <p class="mx-note">This policy governs knowledge writes only; memory writes never consult it. A missing or malformed file closes every scope. The writer's identity is whatever the environment declares (<code>ATLAS_ACTOR</code> or the git e-mail), not authenticated; truth is protected by the grounding gate, not by this list. It also carries <code>t0Heuristic.keywords</code> (${(R().t0Keywords ?? []).map((k) => `<code>${A.esc(k)}</code>`).join(", ")}), which <code>atlas init</code> matches against territory names, and no <code>authz.anchors</code> map, so no scope is bound to an anchor prefix.</p>`,
      index: `<section class="at-panel"><div class="at-panel-body"><dl class="at-kv wide">
        <dt>Built at</dt><dd><code>${R().builtAt}</code> <span class="at-pill warm">${A.icon("drift")}code is at ${R().head}</span></dd>
        <dt>Spatial axis</dt><dd>repository → package → module → file${" "}<small>· anchors are file-level in this store</small></dd>
        <dt>Dependency axis</dt><dd>${R().scip ? `<span class="at-state good">${A.icon("checkc")}on</span> from <code>.atlas/index.scip</code>` : '<span class="at-state">off — no index.scip</span>'}</dd>
        <dt>Territory axis</dt><dd>${M().territories().length ? `${M().territories().length} territories <span class="at-pill">example</span>` : `<span class="at-state">${A.icon("minusc")}empty</span> no territories declared`}</dd>
        <dt>Rebuild</dt><dd><code>scip-typescript index --output .atlas/index.scip</code><br><small>Atlas does not run the indexer itself; it reads the file it produces.</small></dd></dl></div></section>`,
      store: `<section class="at-panel"><div class="at-panel-body"><dl class="at-kv wide">
        <dt>Location</dt><dd><code>.atlas/</code> in the project root. This one is the standalone Atlas repository at <code>${R().head}</code>; Orchestra's own worktree has no <code>.atlas/</code></dd>
        <dt>In git</dt><dd>${(() => { const t = R().tracked ?? {}; return [t.policy ? "the write policy" : "", t.projection ? "the projection" : "", t.cas ? `${A.num(t.cas)} content objects` : "", t.memory ? "memory.jsonl" : ""].filter(Boolean).join(", ") || "nothing" })()}${R().tracked?.example ? ' <span class="at-pill">example</span>' : ""}</dd>
        <dt>Provenance</dt><dd>${{ trusted: `<span class="at-state good">${A.icon("checkc")}trusted</span> nothing durable is tracked by git, so reads and writes run normally`, "tracked-provable": `<span class="at-state warm">${A.icon("warning")}tracked</span> the projection or the content store is tracked by git: reads serve only sealed facts that re-prove (${R().sealed} sealed here) and every write is refused. Untrack <code>.atlas/projection*.json</code> and <code>.atlas/cas/</code> to curate.`, "tracked-staging": `<span class="at-state bad">${A.icon("xc")}refused</span> staging is tracked by git: every read and write refuses as <code>untrusted-store</code>.` }[M().provenance()]}</dd>
        <dt>Knowledge</dt><dd>generation ${R().gen} · ${A.num(M().stats().facts)} facts · ${A.num(R().casObjects)} stored objects</dd>
        <dt>Staging</dt><dd>generation ${R().stagingGen} · 660 rows (${M().stats().candidates} not promoted)</dd>
        <dt>Bytes</dt><dd><code>doctor cas</code>: every object re-hashes to its name; it also counts orphans</dd>
        <dt>Proofs</dt><dd><code>verify-store</code>: ${R().sealed} facts sealed <code>proven</code>, nothing to re-prove</dd>
        <dt>Export</dt><dd>${A.btn("Export content store", "toast", { value: "Writes atlas-okf.json with the content store only (no memory.jsonl). Import works only into an empty target and does not rebuild current knowledge.", icon: "download" })}</dd></dl></div></section>`,
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
        ${mem?.bound ? `<div class="at-panel-body"><div class="at-two"><div><div class="mx-eyebrow">Records</div><strong>${mem.tasks.length + mem.prs.length}</strong></div><div><div class="mx-eyebrow">Project rules in its header</div><strong>${M().header(id).injected.length} of 12</strong></div></div></div>` : ""}</section></div>`,
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
        <div class="at-turn"><div class="at-turn-head">${A.agent("backend")}<span>example turn</span><span class="grow"></span><span class="at-pill" data-tip="The live runs never called atlas_context; this turn shows the receipt shapes the app would render.">example</span></div>
          <div class="at-tool">${A.icon("atlas")}<code>atlas_context</code><span>unit</span><a class="at-chip" href="#/unit/packages%2Fgenesis">${A.icon("stack")}own · packages/genesis<span class="st">complete · FRESH</span></a></div>
          <p>Phase 1 is done: <code class="at-mono">decrement()</code> lowers the value by one and never goes below zero. I stopped at the phase boundary as the packet asked.</p>
          <div class="at-tool">${A.icon("memory")}<code>atlas_memory_emit</code><span>task T-LIVE-1</span><a class="at-chip memory" href="#/memory/backend">${A.icon("memory")}memory · admitted<span class="st">task T-LIVE-1</span></a></div>
          <button class="at-used" data-action="go" data-value="#/chat${open ? "" : "?used=1"}" aria-expanded="${open}">${A.icon("atlas")}<span>Atlas in this turn</span>${A.icon("chev", open ? "flip" : "")}</button>
          ${open ? `<div class="at-used-body"><dl class="at-kv wide"><dt>Header</dt><dd>added to every model request: Awareness, Orientation and Backend's rules</dd><dt>Read</dt><dd><code>atlasContext</code> receipt · unit <a class="mx-link" href="#/unit/packages%2Fgenesis">packages/genesis</a> · coverage complete, graph coverage, FRESH · content and receipt hashes</dd><dt>Wrote</dt><dd><code>atlasMemory</code> receipt · op emit · outcome admitted · ref eventId (admitted implies the secret scan passed)</dd></dl></div>` : ""}
        </div></div>
      <div class="at-composer">Ask anything, / for commands, @ for context…<div class="row"><span class="grow"></span><span>Claude Opus</span></div></div></div>`,
    }
  }

  /* ---------- HOLD: Atlas not connected to this project ---------- */
  A.views.held = () => ({
    crumbs: [["Atlas"]],
    html: `<div class="at-page narrow"><div class="at-held"><span class="mx-mark">${A.icon("atlas")}</span><h2>Atlas isn't connected to this project</h2>
      <span class="at-pill warm">${A.icon("warning")}provider-unconfigured</span>
      <p>Atlas is not configured for this project (<code class="at-mono">maestro.atlas</code>), so governed work cannot proceed here; the owner decides.</p>
      ${A.code(".orchestra/orchestra.jsonc", 1, ["{", "  \"maestro\": {", "    \"atlas\": { \"projectID\": \"<this project's id>\", \"directory\": \"modules/atlas\" }", "  }", "}"], { highlight: [3] })}
      <p class="mx-note">The directory holds the committed <code>OWN-SNAPSHOT.json</code> and <code>TERRITORY-CATALOG.json</code>. The catalog does not exist yet, so a connected project would still hold until one is committed. Other holds you may meet: <code>artifacts-invalid</code> (snapshot source files changed), <code>anchor-source-drift</code> (a plan's pinned unit changed), <code>plan-grounding-stale</code>, <code>context-empty</code>.</p>
      <div style="display:flex;gap:8px;justify-content:center">${A.btn("Copy", "copy", { icon: "copy", value: '"maestro": { "atlas": { "projectID": "<this project id>", "directory": "modules/atlas" } }' })}${A.btn("Connect", "state", { value: "ready", primary: true })}</div></div></div>`,
  })
})(window.Atlas)
