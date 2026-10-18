// Review (everything that waits on a person), Activity (what agents got and gave), Health (is the store sound),
// Settings (connection, territories, permissions, store), Agents, Chat and the HOLD state.
;(function (A) {
  const M = () => A.m
  const R = () => A.m.R
  const plural = (n, one, many = `${one}s`) => `${A.num(n)} ${n === 1 ? one : many}`
  const qs = (q) => (Object.keys(q).length ? `?${new URLSearchParams(q)}` : "")
  const clean = (q) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== ""))
  const names = { backend: "Backend", jimmy: "Jimmy", archie: "Archie", maestro: "Maestro" }
  const time = (ms) => (ms ? `${new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · ${new Date(ms).toISOString().slice(11, 16)} UTC` : "")
  const tabs = (base, list, current) => `<div class="wf-tabs" role="tablist">${list.map(([id, label, glyph, c]) => `<button class="wf-tab" role="tab" aria-selected="${current === id}" data-action="go" data-value="${base}${id}">${A.icon(glyph)}${label}${c !== undefined ? `<span class="wf-count">${A.num(c)}</span>` : ""}</button>`).join("")}</div>`
  const heading = (eyebrow, title, line, actions = "") => `<div class="mx-heading"><div><div class="mx-eyebrow">${eyebrow}</div><h1>${title}</h1><p>${line}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`

  /* ---------- Review: decide everything that waits on a person ---------- */
  A.views.review = (state) => {
    const q = state.query
    const s = M().stats()
    const tab = q.tab ?? "changed"
    const proposals = M().live().filter((x) => x.proposedTier)
    const href = (patch) => `#/review${qs(clean({ ...q, fact: undefined, ...patch }))}`
    const outcome = (x) => {
      const r = A.state.promote?.rows.find((row) => row.nodeKey === x.key)
      return r ? `<span class="at-outcome ${r.settled ? "good" : "bad"}">${r.settled ? "Accepted" : A.esc(A.refusal(r.rejected))}</span>` : ""
    }
    const changed = () => {
      const list = M().live().filter((x) => M().state(x) === "drifted").filter((x) => !q.commit || x.drift.commits.some(([sha]) => sha === q.commit)).filter((x) => !q.unit || M().unitOf(x.file) === q.unit)
      const units = [...new Set(M().live().filter((x) => M().state(x) === "drifted").map((x) => M().unitOf(x.file)))].sort()
      return `<div class="at-toolbar"><span class="at-subline">The code under these facts changed. Read each against its diff.</span><span class="grow"></span>${A.btn("Merge check…", "reconcile", { icon: "branch" })}</div>
        <div class="at-toolbar"><label class="at-select">${A.icon("stack")}<select data-nav="unit" aria-label="Unit"><option value="">All units</option>${units.map((u) => `<option ${q.unit === u ? "selected" : ""}>${A.esc(u)}</option>`).join("")}</select></label>
          <label class="at-select">${A.icon("commit")}<select data-nav="commit" aria-label="Commit"><option value="">Any commit</option>${M().codeChanges().map((c) => `<option value="${c.sha}" ${q.commit === c.sha ? "selected" : ""}>${A.esc(c.sha)} · ${A.esc(c.subject.slice(0, 44))}</option>`).join("")}</select></label></div>
        <section class="at-panel">${A.seven(list, "changed", (x) => A.factRow(x, state, { short: false, extra: `<span>${plural(x.drift.commits.length, "commit")}</span>` }), 25) || `<div class="at-clear">${A.icon("checkc")}<strong>Nothing changed</strong><p>Every fact matches its code.</p></div>`}</section>`
    }
    const mined = () => {
      const list = M().candidates.filter((x) => !x.promotedNow && !x.discarded)
      return `<div class="at-toolbar"><span class="at-subline">Suggested by genesis. Agents see none of it until you accept.</span><span class="grow"></span>${list.length ? A.btn("Accept all…", "promote-all", { primary: true, write: true }) : ""}</div>
        ${A.state.promote ? `<div class="at-resultline">${A.icon(A.state.promote.refused ? "warning" : "checkc")}<span>Last run: ${A.state.promote.read ? `${A.num(A.state.promote.rows.filter((r) => r.settled && r.x.kind === "candidate").length)} new · ${A.num(A.state.promote.rows.filter((r) => !r.settled && r.x.kind === "candidate").length)} suggestions refused` : "refused: this store is in git"}</span>${A.btn("Details", "promote-result")}</div>` : ""}
        <section class="at-panel">${A.seven(list, "mined", (x) => A.factRow(x, state, { extra: outcome(x) }), 25) || `<div class="at-clear">${A.icon("checkc")}<strong>Nothing waiting</strong><p>Every suggestion has been decided.</p>${A.btn("Find new facts…", "mine")}</div>`}</section>`
    }
    const ratify = () => {
      const kw = R().t0Keywords ?? []
      const t0 = M().territories().filter((t) => kw.some((k) => t.name.includes(k)))
      return `<div class="at-toolbar"><span class="at-subline">Facts proposed to govern how agents work. Open one to ratify it.</span></div>
        ${proposals.length ? `<section class="at-panel">${proposals.map((x) => A.factRow(x, state, { extra: `<span>proposed by ${A.esc(names[x.proposedBy] ?? x.proposedBy)}</span>` })).join("")}</section>`
          : `<div class="at-clear">${A.icon("shield")}<strong>Nothing proposed</strong><p>Open any hint and choose Ratify.</p></div>`}
        <details class="at-acc" data-acc="review-core"><summary><span class="at-acc-ic">${A.icon("territory")}</span><span class="at-acc-t"><strong>Suggested core areas</strong><small>Territories whose name contains a core keyword</small></span><span class="at-acc-sum">${t0.length}</span>${A.icon("chev", "at-acc-chev")}</summary><div class="at-acc-body">
          ${t0.map((t) => `<div class="at-linkrow static">${A.icon("territory")}<span>${A.esc(t.name)}</span><span class="grow"></span>${A.tier(t.tier)}</div>`).join("") || `<div class="at-band-empty">No territory name contains ${kw.map((k) => `“${A.esc(k)}”`).join(" or ")}.</div>`}
          ${A.tech([["Atlas", `<code>atlas init</code> flags a territory whose name contains a keyword from <code>policy.json</code> <code>t0Heuristic.keywords</code>. A flag never sets the tier.`]])}</div></details>`
    }
    return {
      crumbs: [["Atlas", "#/overview"], ["Review"]],
      html: `<div class="at-page narrow">
      ${heading("Atlas", "Review", M().curationCount() ? `${plural(M().curationCount(), "thing")} wait for a decision.` : "Nothing waits for a decision.", `${A.btn("Find new facts…", "mine", { icon: "sparkle", write: true })}${A.btn("", "producers", { icon: "relations", label: "More producers", tip: "Derive links · Record code changes · Find hollow tests" })}`)}
      ${tabs("#/review?tab=", [["changed", "Changed code", "drift", s.drifted], ["mined", "Mined", "sparkle", s.candidates], ["ratify", "To ratify", "shield", proposals.length]], tab)}
      ${{ changed, mined, ratify }[tab]()}</div>`,
    }
  }

  /* ---------- Activity: what Atlas gave agents and took from them ---------- */
  A.eventRow = (e, compact = false) => {
    const glyph = { read: "atlas", memory: "memory", resume: "refresh", hold: "lock", code: "commit" }[e.kind]
    const tail = e.kind === "memory" && !e.ok ? `<span class="at-outcome bad">${A.esc(A.refusal(e.refusal))}</span>` : e.kind === "hold" ? `<span class="at-outcome">On hold</span>` : ""
    return `<div class="at-event" data-action="event" data-value="${A.esc(e.id)}" tabindex="0" role="button"><span class="at-avatar sm">${e.who ? names[e.who][0] : A.icon(glyph)}</span>
      <div class="at-event-main"><span>${A.esc(e.text)}${e.unit && e.kind !== "read" ? ` <small>· ${A.esc(e.unit)}</small>` : ""}</span>${compact ? "" : `<small>${time(e.at)}${e.example ? ' · <span class="at-pill">example</span>' : ""}</small>`}</div>${tail}</div>`
  }
  A.events = () => {
    const list = M().activity().map((e, i) => ({ ...e, id: `e${i}` }))
    const code = M().codeChanges().map((c, i) => ({ id: `c${i}`, kind: "code", ok: true, sha: c.sha, text: `Commit ${c.sha} changed ${plural(c.facts.length, "fact")}`, unit: c.subject }))
    return [...list, ...code]
  }
  A.views.activity = (state) => {
    const show = state.query.show ?? "all"
    const all = A.events()
    const kinds = { reads: ["read"], memory: ["memory", "resume"], holds: ["hold"], code: ["code"] }
    const list = show === "all" ? all.filter((e) => e.kind !== "code") : all.filter((e) => kinds[show].includes(e.kind))
    const count = (k) => all.filter((e) => kinds[k].includes(e.kind)).length
    return {
      crumbs: [["Atlas", "#/overview"], ["Activity"]],
      html: `<div class="at-page narrow">
      ${heading("Atlas", "Activity", "What agents read from Atlas, what they saved, and when they were held.")}
      <div class="at-toolbar"><div class="wf-range">${[["all", "All"], ["reads", "Reads"], ["memory", "Memory"], ["holds", "Holds"], ["code", "Code"]].map(([id, l]) => `<button aria-pressed="${show === id}" data-action="go" data-value="#/activity?show=${id}">${l}${id === "all" ? "" : `<span class="wf-count">${count(id)}</span>`}</button>`).join("")}</div>${A.help("From the receipts Orchestra keeps on each tool call (atlasContext, atlasMemory, atlasResume). Atlas itself keeps no write log.")}</div>
      <section class="at-panel">${A.seven(list, `act${show}`, (e) => (e.kind === "code" ? `<a class="at-event" href="#/review?tab=changed&commit=${e.sha}"><span class="at-avatar sm">${A.icon("commit")}</span><div class="at-event-main"><span>${A.esc(e.text)}</span><small>${A.esc(e.unit)}</small></div>${A.icon("arrow")}</a>` : A.eventRow(e)), 25) || '<div class="at-band-empty">Nothing recorded yet.</div>'}</section></div>`,
    }
  }
  // The event sheet: one receipt, as sentences, with the plumbing in Technical details.
  const nextSteps = {
    "provider-unconfigured": "Atlas is not configured for this project (maestro.atlas), so governed work cannot proceed here; the owner decides.",
    "artifacts-invalid": "Own artifacts are stale against the current source or their snapshot and must be re-materialized by the owner or a maintainer before governed work can proceed.",
    "plan-grounding-stale": "The Atlas source changed after this plan revision; call maestro_catalog_context again and record a new plan revision.",
    "unit-unavailable": "Use exact unit IDs from maestro_catalog_context.",
  }
  A.eventSheet = (id) => {
    const e = A.events().find((x) => x.id === id)
    if (!e) return ""
    const who = names[e.who]
    const c = e.task?.checkpoints.find((k) => k.at === e.at)
    const body = {
      read: () => {
        const snap = M().snapshot.packs[e.target]
        return `<p class="at-lead">${e.action === "catalog" ? `${who} got the list of published units and territories.` : `${who} got the published briefing for <a class="mx-link" href="#/unit/${encodeURIComponent(e.target)}">${A.esc(e.target)}</a>: complete and up to date.`}</p>
          ${snap ? snap.invariants.map((i) => `<div class="at-linkrow static">${A.tier(i.tier)}<span>${A.esc(i.claim)}</span></div>`).join("") : ""}
          ${e.research ? `<p class="mx-note">${A.icon("sparkle")} Kept as a research source for ${who}'s findings.</p>` : ""}`
      },
      memory: () => (e.ok ? `<p class="at-lead">${who} saved where it stopped on <b>${A.esc(e.unit)}</b>.</p><div class="at-linkrow static"><span>${A.esc(c?.entry.stoppedAt ?? "")}</span></div>` : `<p class="at-lead">Not saved: ${A.esc(A.refusal(e.refusal))}.</p><p class="mx-note">${A.esc(e.reason ?? "")}</p>`),
      resume: () => `<p class="at-lead">When ${who} was resumed on <b>${A.esc(e.unit)}</b>, Atlas handed back its latest saved checkpoint, once.</p>`,
      hold: () => `<p class="at-lead">${who} was held: ${A.esc(A.refusal(e.reason))}.</p><dl class="at-kv"><dt>Next step</dt><dd>${A.esc(nextSteps[e.reason] ?? "Atlas suggests no step for this hold; the evidence below says what it saw.")}</dd><dt>Evidence</dt><dd>${A.esc((e.task?.checkpoints.find((k) => (k.entry.failedWith ?? []).length)?.entry.failedWith ?? [])[0] ?? "")}</dd></dl>`,
    }[e.kind]()
    const tech = A.tech([
      ["Receipt", { read: "atlasContext", memory: "atlasMemory", resume: "atlasResume", hold: "atlasContext (held)" }[e.kind]],
      e.kind === "memory" ? ["outcome · refusal", `${e.ok ? "admitted" : "refused"}${e.refusal ? ` · ${A.esc(e.refusal)}` : ""}`] : null,
      e.kind === "hold" ? ["reason", `<code>${A.esc(e.reason)}</code>`] : null,
      e.kind === "resume" ? ["residency", A.esc(e.residency ?? "admitted")] : null,
      e.ref ? ["ref", A.hashv(typeof e.ref === "string" ? e.ref : e.ref.eventId)] : null,
      ["binding", `member ${A.esc(e.who)} · session ${A.esc(e.task?.seatSession ?? "—")}`],
    ])
    return `<form method="dialog"><header class="mx-dialog-head"><div><h2>${A.esc(e.text)}</h2><p>${time(e.at)}${e.example ? " · example" : ""}</p></div></header><div class="mx-dialog-body">${body}${tech}</div>
      <footer class="mx-dialog-foot">${e.task ? `<a class="mx-btn" href="#/memory/${e.who}/task/${encodeURIComponent(e.unit)}">Open task</a>` : ""}<span class="grow"></span><button class="mx-btn primary" value="ok">Done</button></footer></form>`
  }

  /* ---------- Health: is the store sound? ---------- */
  A.views.health = () => {
    const h = M().health()
    const prov = { trusted: ["good", "Local: reads and writes work"], "tracked-provable": ["warm", "In git, read-only: Atlas serves only machine-proven facts"], "tracked-staging": ["bad", "In git, locked: Atlas refuses everything"] }[h.provenance]
    const row = (id, tone, title, line, body) => `<details class="at-acc" data-acc="health-${id}"><summary><span class="at-sdot ${tone}"></span><span class="at-acc-t"><strong>${title}</strong><small>${line}</small></span>${A.icon("chev", "at-acc-chev")}</summary><div class="at-acc-body">${body}</div></details>`
    const kv = (rows) => `<dl class="at-kv wide">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`
    const healthy = h.provenance === "trusted" && h.cas.sound
    return {
      crumbs: [["Atlas", "#/overview"], ["Health"]],
      html: `<div class="at-page narrow">
      ${heading("Atlas", "Health", healthy ? "The store is sound." : h.cas.sound ? "The files are sound, but this store is in git, so Atlas only reads it." : "Some stored objects are missing.")}
      ${row("access", prov[0], "Store access", prov[1], `${kv([["Tracked by git", [R().tracked?.projection ? "projection" : "", R().tracked?.cas ? `${A.num(R().tracked.cas)} stored objects` : "", R().tracked?.policy ? "write policy" : ""].filter(Boolean).join(", ") || "nothing durable"], ["Machine-proven facts", `${h.proofs.sealedProven} of ${A.num(M().facts.length)}`]])}
        ${h.provenance === "trusted" ? "" : `<p class="mx-note">To curate here, stop tracking <code>.atlas/projection*.json</code> and <code>.atlas/cas/</code>. Atlas's own diagnostics refuse to read this store; the numbers on this page come straight from its files.</p>`}`)}
      ${row("cas", h.cas.sound ? "good" : "bad", "Stored objects", `${h.cas.sound ? "Sound" : "Not sound"} · ${A.num(h.cas.objects)} objects`, kv([["Used by current facts", A.num(h.cas.referenced)], ["Missing", h.cas.missing], ["Corrupt · unreadable", `${h.cas.corrupt} · ${h.cas.unreadable}`], ["Unused", `${A.num(h.cas.orphan)} ${A.help("Staging rows and the miner's reasoning. Objects are never deleted, so unused is harmless.")}`]]) + A.tech([["Command", "<code>atlas doctor cas</code>"]]))}
      ${row("proofs", "good", "Proofs", h.proofs.sealedProven ? `${h.proofs.reProven} of ${h.proofs.sealedProven} re-proven` : "No machine-proven facts, nothing to re-check", kv([["Machine-proven", h.proofs.sealedProven], ["Re-proven · broken · unverifiable · dangling", `${h.proofs.reProven} · ${h.proofs.broken} · ${h.proofs.unverifiable} · ${h.proofs.dangling}`]]) + A.tech([["Command", "<code>atlas verify-store</code> · exits 2 when any proof does not replay"]]))}
      ${row("index", h.index.scip ? "good" : "", "Code index", h.index.scip ? `Present · ${h.index.configured.map((c) => `${A.num(c.files)} .${c.lang}`).join(", ")}` : "Not built", `${h.index.configured.map((c) => `<div class="at-linkrow static">${A.icon("checkc")}<span>.${c.lang} · ${A.num(c.files)} files</span><span class="grow"></span><small>${c.tool} ${c.version}</small></div>`).join("")}
        ${h.index.holes.map((c) => `<div class="at-linkrow static">${A.icon("minusc")}<span>.${c.lang} · ${A.num(c.files)} files</span><span class="grow"></span><small>not indexable</small></div>`).join("")}${A.tech([["Command", "<code>atlas doctor index</code>"], ["Rebuild", "<code>scip-typescript index --output .atlas/index.scip</code> · Atlas reads the file, it does not run the indexer"]])}`)}
      <div class="at-section-gap"></div>
      ${A.acc("health-versions", "history", "Versions", "Each write publishes a version; the last four are kept", `${h.generations.length} files`, h.generations.map((g) => `<div class="at-linkrow static">${A.icon("fact")}<code class="at-mono">${A.esc(g)}</code></div>`).join("") + `<p class="at-stew-intro">Atlas keeps no write log: no author, no time. Each fact keeps the commit it was accepted at.</p>`)}
      ${A.acc("health-archive", "stack", "Archive", "Every version of every fact stays addressable", A.num(M().facts.length), `<p class="at-stew-intro">${A.num(M().facts.length)} current facts, none replaced by a newer version.</p>${A.tech([["Command", "<code>atlas doctor archive [scope]</code> · then <code>atlas node &lt;address&gt;</code>"]])}`)}
      ${A.acc("health-hot", "bolt", "Hot set", "How many facts the store serves", A.num(h.hotSet), `<p class="at-stew-intro">${A.num(h.hotSet)} current facts. Compare against a budget with <code>atlas doctor hotset &lt;budget&gt;</code>.</p>`)}
      ${A.acc("health-cal", "scale", "Calibration", "What agents actually used", "Not recorded", `<p class="at-stew-intro">Nothing in Atlas records which facts agents used yet, so injection budgets and off-Atlas reads show zero. ${A.help("atlas budget · atlas territories (threshold 0.3)")}</p>`)}
      </div>`,
    }
  }

  /* ---------- Settings: who is connected, who owns what, who may write ---------- */
  A.views.settings = (state) => {
    const tab = state.query.tab ?? "connection"
    const illus = !!R().illustrated
    const snap = M().snapshot
    const connection = `<section class="at-panel"><div class="at-panel-body"><dl class="at-kv wide">
        <dt>Orchestra</dt><dd>${illus ? `Connected to <code>modules/atlas</code> <span class="at-pill">example</span>` : `<span class="at-state">${A.icon("minusc")}Not configured</span> agents' Atlas reads hold until <code>maestro.atlas</code> is set`}</dd>
        <dt>Members with memory</dt><dd>${["backend", "jimmy", "archie"].map(A.agent).join("")} <small>Maestro: defined, not bound</small></dd>
        <dt>Unit catalog</dt><dd>${snap.catalog ? `Present <span class="at-pill">example</span>` : `<span class="at-state warm">${A.icon("warning")}Missing</span> reads would hold until <code>TERRITORY-CATALOG.json</code> is committed`}</dd></dl></div></section>
      <section class="at-panel"><header class="at-panel-head"><div><h3>Published to agents</h3><small>Agents read these versions, not the live store</small></div>${A.btn("Republish", "republish", { cap: "R7" })}</header>
        ${snap.units.map((u) => `<a class="at-linkrow" href="#/unit/${encodeURIComponent(u)}">${A.icon("stack")}<code class="at-mono">${A.esc(u)}</code><span class="grow"></span>${snap.packs[u] ? `<small>${snap.packs[u].tokenEstimate} characters · complete</small>` : '<span class="at-pill">example</span>'}</a>`).join("")}
        ${A.tech([["Snapshot", `genesis-own-v1 · revision ${snap.revision} · OWN-SNAPSHOT.json`], ["Config", `<code>"maestro": { "atlas": { "projectID": "&lt;project id&gt;", "directory": "modules/atlas" } }</code>`], ["Served while", "the snapshot's source files are byte-identical and its revision is an ancestor of HEAD"]])}</section>`
    const territories = M().territories().length
      ? `<section class="at-panel"><header class="at-panel-head"><div><h3>Territories</h3><small>Each gives units an owner and a tier</small></div>${A.btn("Declare", "territory", { icon: "plus", cap: "R4" })}</header>
        ${M().territories().map((t) => { const us = M().units().filter((u) => M().territoryOf(u.id) === t); return `<div class="at-linkrow static">${A.icon("territory")}<span>${A.esc(t.name)}</span><small>${plural(us.length, "unit")}</small><span class="grow"></span>${A.agent(t.owner)}${A.tier(t.tier)}</div>` }).join("")}
        ${A.tech([["Globs", M().territories().map((t) => `${A.esc(t.name)}: <code>${t.globs.map(A.esc).join(" ")}</code>`).join("<br>")], ["File", "TERRITORY-CATALOG.json, committed and edited by hand"]])}</section>
        ${(() => { const loose = M().units().filter((u) => !M().territoryOf(u.id)); return loose.length ? A.acc("set-loose", "stack", "Units with no territory", "Nobody owns these yet", `${loose.length}`, A.seven(loose, "loose", (u) => `<div class="at-linkrow static">${A.icon("stack")}<code class="at-mono">${A.esc(u.id)}</code><span class="grow"></span>${A.btn("Declare…", "territory", { value: u.id })}</div>`)) : "" })()}`
      : `<div class="at-clear">${A.icon("territory")}<strong>No territories yet</strong><p>A territory gives a group of units an owner and a tier.</p>${A.btn("Declare territory", "territory", { primary: true, cap: "R4" })}</div>`
    const permissions = `<section class="at-panel"><header class="at-panel-head"><div><h3>Who may write</h3><small>A group nobody holds is closed</small></div></header>
        ${Object.entries(R().policy).map(([scope, actors]) => `<div class="at-linkrow static">${A.icon("lock")}<code class="at-mono">${A.esc(scope)}</code><small>${scope === "atlas:mined" ? "mined facts" : ""}</small><span class="grow"></span>${actors.map(A.agent).join("")}</div>`).join("")}
        ${A.tech([["File", "<code>.atlas/policy.json</code>, edited by hand; a missing or broken file closes every group"], ["Writing as", `<code>ATLAS_ACTOR</code>, else the git e-mail; not authenticated`], ["Core keywords", (R().t0Keywords ?? []).map((k) => `<code>${A.esc(k)}</code>`).join(", ")], ["Anchor binding", "none: no write group is bound to an anchor prefix (authz.anchors)"]])}</section>`
    const store = `<section class="at-panel"><div class="at-panel-body"><dl class="at-kv wide">
        <dt>Location</dt><dd><code>.atlas/</code> of the standalone Atlas repository</dd>
        <dt>Access</dt><dd>${M().provenance() === "trusted" ? "Local: reads and writes work" : `<a class="mx-link" href="#/health">In git, read-only</a>`}</dd>
        <dt>Facts · mined</dt><dd>${A.num(M().facts.length)} · ${A.num(R().candidates.length)} waiting</dd></dl>
        ${A.tech([["Move store", `${A.btn("Export", "toast", { value: "Writes atlas-okf.json with the stored objects only, not memory or the current version.", icon: "download" })} · import works only into an empty folder`], ["Versions", `projection ${R().gen} · staging ${R().stagingGen}`]])}</div></section>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Settings"]],
      html: `<div class="at-page narrow">${heading("Atlas", "Settings", "Who is connected, who owns what, and who may write.")}
      ${tabs("#/settings?tab=", [["connection", "Connection", "server"], ["territories", "Territories", "territory"], ["permissions", "Permissions", "lock"], ["store", "Store", "stack"]], tab)}
      ${{ connection, territories, permissions, store }[tab]}</div>`,
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
        <section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("memory")}Memory</h3><small>${mem?.bound ? "Lives in Atlas" : "No Atlas memory in Orchestra"}</small></div>${mem?.bound ? A.btn("Open in Atlas", "go", { value: `#/memory/${id}`, primary: true, icon: "arrow" }) : ""}</header>
        ${mem?.bound ? `<div class="at-panel-body"><div class="at-two"><div><div class="mx-eyebrow">Tasks remembered</div><strong>${(A.spawns ?? []).filter((t) => t.member === id).length}</strong></div><div><div class="mx-eyebrow">Rules it carries</div><strong>${M().header(id).injected.length}</strong></div></div></div>` : ""}</section></div>`,
    }
  }

  /* ---------- Chat: one chip per turn opens what the agent got ---------- */
  A.views.chat = () => ({
    flush: true,
    crumbs: [["Chat"], ["Counter decrement"]],
    html: `<div class="at-session"><div class="at-tabs-strip"><span class="at-sess-tab">${A.icon("chat")}Counter decrement <code>main</code></span></div>
      <div class="at-transcript">
        <div class="at-turn user">Add decrement() to Counter, clamped at zero. Stop after phase 1.</div>
        <div class="at-turn"><div class="at-turn-head">${A.agent("backend")}<span class="grow"></span><a class="at-chip" href="#/activity?show=memory">${A.icon("atlas")}Used Atlas · 1</a></div>
          <p>Phase 1 is done: <code class="at-mono">decrement()</code> lowers the value by one and never goes below zero. I stopped at the phase boundary as the packet asked.</p></div></div>
      <div class="at-composer">Ask anything, / for commands, @ for context…<div class="row"><span class="grow"></span><span>Claude Opus</span></div></div></div>`,
  })

  /* ---------- HOLD: Atlas not connected to this project ---------- */
  A.views.held = () => ({
    crumbs: [["Atlas"]],
    html: `<div class="at-page narrow"><div class="at-held"><span class="mx-mark">${A.icon("atlas")}</span><h2>Atlas isn't connected to this project</h2>
      <p>${A.esc(nextSteps["provider-unconfigured"])}</p>
      ${A.code(".orchestra/orchestra.jsonc", 1, ["{", "  \"maestro\": {", "    \"atlas\": { \"projectID\": \"<this project's id>\", \"directory\": \"modules/atlas\" }", "  }", "}"], { highlight: [3] })}
      <p class="mx-note">The folder holds the published briefings and the unit catalog.</p>
      <div style="display:flex;gap:8px;justify-content:center">${A.btn("Copy", "copy", { icon: "copy", value: '"maestro": { "atlas": { "projectID": "<this project id>", "directory": "modules/atlas" } }' })}${A.btn("Connect", "state", { value: "ready", primary: true })}</div></div></div>`,
  })
})(window.Atlas)
