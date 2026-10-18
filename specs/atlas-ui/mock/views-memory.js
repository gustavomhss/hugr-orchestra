// Memory, per member, the way Atlas defines it: stewardship (project memory, short, scoped, carried in every turn)
// and task memory (one per dispatched unit: the seat session, its invocations, its checkpoints, respawnable).
;(function (A) {
  const M = () => A.m
  const plural = (n, one, many = `${one}s`) => `${A.num(n)} ${n === 1 ? one : many}`
  const time = (iso) => `${new Date(iso).toISOString().slice(11, 16)} UTC`
  const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  const secs = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 1000) : 0)
  const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`)
  const members = { backend: ["Backend", "Builds server and core"], jimmy: ["Jimmy", "Explores the codebase"], archie: ["Archie", "Plans the work"], maestro: ["Maestro", "Coordinates the team"] }
  const stepName = { dispatch: "Dispatched", resume: "Resumed with memory", interim: "Resumed", compact: "Compacted", continue: "Continued" }
  const stepGlyph = { dispatch: "play", resume: "memory", interim: "refresh", compact: "stack", continue: "arrow" }

  // A task's status comes from its latest admitted checkpoint.
  const latest = (t) => [...t.checkpoints].reverse().find((c) => c.outcome === "admitted")
  const status = (t) => {
    const c = latest(t)
    if (!c) return ["", "minusc", "No checkpoint"]
    if ((c.entry.failedWith ?? []).length) return ["bad", "xc", "Blocked"]
    if (/both phases complete|phase 2 (done|complete)/i.test(c.entry.stoppedAt ?? "")) return ["good", "checkc", "Done"]
    return ["warm", "clock", "Paused"]
  }
  const tokens = (t) => t.transcript.reduce((n, m) => n + m.tokens.in + m.tokens.out + m.tokens.cache, 0)
  const tasksOf = (member) => (A.spawns ?? []).filter((t) => t.member === member)
  const lessons = (member) => [...new Map(tasksOf(member).flatMap((t) => t.checkpoints.filter((c) => c.outcome === "admitted" && c.entry.lesson).map((c) => [c.entry.lesson, { lesson: c.entry.lesson, unit: t.unit }]))).values()]
  A.memoryStats = (member) => {
    const ts = tasksOf(member)
    return { tasks: ts.length, invocations: ts.reduce((n, t) => n + t.steps.filter((s) => s.kind !== "compact").length, 0), checkpoints: ts.reduce((n, t) => n + t.checkpoints.length, 0), refused: ts.reduce((n, t) => n + t.checkpoints.filter((c) => c.outcome !== "admitted").length, 0) }
  }

  // A collapsible section: title, one-line purpose, a summary that stays visible when closed.
  const acc = (id, glyph, title, purpose, summary, body, open = false) =>
    `<details class="at-acc" data-acc="${id}" ${open ? "open" : ""}><summary><span class="at-acc-ic">${A.icon(glyph)}</span><span class="at-acc-t"><strong>${title}</strong><small>${purpose}</small></span><span class="at-acc-sum">${summary}</span>${A.icon("chev", "at-acc-chev")}</summary><div class="at-acc-body">${body}</div></details>`
  const kpi = (label, value, foot, tone = "") => `<div class="at-kpi ${tone}"><span>${label}</span><b>${value}</b><small>${foot}</small></div>`
  const dot = (tone, n, label) => (n ? `<span class="at-kdot ${tone}"><i></i>${n} ${label}</span>` : "")

  const head = (name, role, bound, actions = "") => `<div class="at-agent-head"><span class="at-avatar">${name[0]}</span><div><div class="mx-eyebrow">Atlas · Memory</div><h1>${name}</h1><p>${role}</p></div>
    <span class="grow"></span>${bound ? `<span class="at-pill good">${A.icon("checkc")}Memory on</span>` : `<span class="at-pill">${A.icon("minusc")}Memory not bound</span>`}${actions}</div>`

  /* ---------- Member page ---------- */
  const memberPage = (state, member) => {
    const [name, role] = members[member]
    const bound = M().memory[member].bound
    const crumbs = [["Atlas", "#/overview"], ["Memory", "#/memory/backend"], [name]]
    if (!bound) return { crumbs, html: `<div class="at-page narrow">${head(name, role, false)}<div class="at-clear">${A.icon("memory")}<strong>Maestro's memory is defined but not bound</strong><p>Atlas gives the orchestrator its own stewardship rules, task memory and a logbook: one entry per PR with what shipped, the decisions and why, trade-offs, risks and open threads. Orchestra binds memory only for Backend, Jimmy and Archie today.</p></div></div>` }
    const ts = tasksOf(member)
    const st = A.memoryStats(member)
    const by = (label) => ts.filter((t) => status(t)[2] === label).length
    const ls = lessons(member)
    const filter = state.query.status ?? ""
    const shown = [...ts].reverse().filter((t) => !filter || status(t)[2] === filter)
    const last = ts.length ? ts.at(-1).steps.at(-1).end ?? ts.at(-1).steps.at(-1).start : null
    const saved = st.checkpoints - st.refused
    const raw = `<atlas-header member="${member}" rules="0">\nAwareness:\n${M().awareness.map((a) => `  ${a.facet}: ${a.state === "seeded" ? a.text : "UN-SEEDED"}`).join("\n")}\nOrientation:\n  (empty)\nProject rules:\n  (none)\n</atlas-header>`

    const kpis = `<div class="at-kpis three">
      ${kpi("Tasks", st.tasks, ts.length ? `${dot("good", by("Done"), "done")}${dot("warm", by("Paused"), "paused")}${dot("bad", by("Blocked"), "blocked")}` : "none yet")}
      ${kpi("Checkpoints", saved, st.checkpoints ? `${st.refused} refused · ${st.invocations} calls` : "—", st.refused ? "warn" : "")}
      ${kpi("Stewardship", "0<small> / 12</small>", ls.length ? `${ls.length} suggestions waiting` : "no rules yet")}</div>`

    const taskRows = shown.map((t) => {
      const [tone, glyph, label] = status(t)
      const c = latest(t)
      const inv = t.steps.filter((s) => s.kind !== "compact").length
      const refused = t.checkpoints.filter((x) => x.outcome !== "admitted").length
      const title = (t.title ?? t.steps[0]?.packet.split("\n").find((l) => /Phase 1/.test(l)) ?? "").replace(/^- Phase 1 \(now\): /, "").replace(/ \(@backend-label subagent\)/, "")
      return `<a class="at-task" href="#/memory/${member}/task/${encodeURIComponent(t.unit)}"><span class="at-state ${tone}">${A.icon(glyph)}${label}</span>
        <span class="at-task-main"><span class="at-task-title"><code>${A.esc(t.unit)}</code>${A.esc(title.replace(/`/g, "").slice(0, 80))}</span><small class="clamp1">${A.esc(c?.entry.stoppedAt ?? "No checkpoint")}</small></span>
        <span class="at-task-meta"><span>${inv} calls</span><span>${day(t.steps[0].start)}</span></span>${A.icon("arrow")}</a>`
    }).join("")
    const tasks = ts.length
      ? `<div class="at-acc-tools"><div class="wf-range">${[["", "All", ts.length], ["Done", "Done", by("Done")], ["Paused", "Paused", by("Paused")], ["Blocked", "Blocked", by("Blocked")]].map(([v, l, n]) => `<button aria-pressed="${filter === v}" data-action="go" data-value="#/memory/${member}${v ? `?status=${v}` : ""}">${l}<span class="wf-count">${n}</span></button>`).join("")}</div></div>${taskRows || '<div class="at-band-empty">No tasks with this status.</div>'}`
      : `<div class="at-band-empty">No tasks yet. The first time ${name} is dispatched with a task unit, it shows up here.</div>`

    const header = `<div class="at-slabs">
        <div class="at-slab"><span>Awareness <em>shared</em></span><b>1 of 5 facets</b><small>taste from CONVENTIONS.md; mission, constitution, terrain, ontology not seeded</small></div>
        <div class="at-slab"><span>Orientation <em>shared</em></span><b>Empty</b><small>nothing writes the orientation log yet</small></div>
        <div class="at-slab"><span>Rules <em>${name}'s</em></span><b>0 of 12</b><small>stewardship above</small></div></div>
      <details class="at-sub-acc"><summary>${A.icon("chev")}<span>Exact text injected</span></summary><pre class="at-raw">${A.esc(raw)}</pre></details>`
    const stewardship = `<p class="at-stew-intro">Carried into every turn. One line each, up to 12.</p>
      <div class="at-stew-rules"><div class="at-stew-empty"><strong>No rules yet</strong></div>${A.btn("Add rule", "promote-rule", { icon: "plus" })}</div>
      ${ls.length ? `<details class="at-sub-acc" data-acc="${member}-lessons"><summary>${A.icon("chev")}<span>Suggested from its lessons</span><span class="wf-count">${ls.length}</span></summary>
        ${ls.map((l) => `<div class="at-lesson"><div class="grow">${A.esc(l.lesson)}<small>from <a class="mx-link" href="#/memory/${member}/task/${encodeURIComponent(l.unit)}">${A.esc(l.unit)}</a></small></div>${A.btn("Make it a rule", "promote-rule", { value: l.lesson })}</div>`).join("")}</details>` : ""}
      <details class="at-sub-acc" data-acc="${member}-turn"><summary>${A.icon("chev")}<span>What rides in every turn</span></summary>${header}</details>`

    return {
      crumbs,
      html: `<div class="at-page narrow">${head(name, role, true)}${kpis}
        ${acc(`${member}-tasks`, "check", "Tasks", "Every time it was called on a piece of work", `last ${ts.length ? day(last) : "—"}`, tasks, true)}
        ${acc(`${member}-stew`, "shield", "Stewardship", "What it always knows about this project", ls.length ? `0 rules · ${ls.length} suggestions` : "0 rules", stewardship)}</div>`,
    }
  }

  /* ---------- Task page ---------- */
  const taskPage = (state, member, unit) => {
    const t = tasksOf(member).find((x) => x.unit === unit)
    const [name, role] = members[member]
    const crumbs = [["Atlas", "#/overview"], ["Memory", `#/memory/${member}`], [name, `#/memory/${member}`], [unit, null, true]]
    if (!t) return { crumbs, html: `<div class="at-page narrow">${A.empty("No such task", "It may belong to another member.", A.btn("Back", "go", { value: `#/memory/${member}` }))}</div>` }
    const [tone, glyph, label] = status(t)
    const c = latest(t)
    const at = (ms) => new Date(ms).toISOString()
    const inStep = (s, ms) => { const x = at(ms); return x >= s.start && (!s.end || x <= s.end) }
    const total = secs(t.steps[0].start, t.steps.at(-1).end)
    const inv = t.steps.filter((s) => s.kind !== "compact").length
    const refused = t.checkpoints.filter((x) => x.outcome !== "admitted").length
    const fold = (e) => `<dl class="at-kv wide"><dt>Tried</dt><dd>${(e.attempted ?? []).map(A.esc).join("<br>") || "—"}</dd><dt>Failed with</dt><dd>${(e.failedWith ?? []).length ? e.failedWith.map(A.esc).join("<br>") : "<small>nothing</small>"}</dd><dt>Stopped at</dt><dd>${A.esc(e.stoppedAt ?? "—")}</dd><dt>Lesson</dt><dd class="at-lesson-text">${A.esc(e.lesson ?? "—")}</dd></dl>`
    const steps = `<ol class="at-steps">${t.steps.map((s) => {
      const made = t.checkpoints.filter((x) => inStep(s, x.at))
      const given = t.admissions.filter((x) => inStep(s, x.at))
      return `<li class="at-step ${s.kind}"><span class="at-step-dot">${A.icon(stepGlyph[s.kind] ?? "dot")}</span><div class="at-step-body">
        <div class="at-step-head"><strong>${stepName[s.kind] ?? s.kind}</strong><small>${day(s.start)} ${time(s.start)} · ${dur(secs(s.start, s.end))}${s.model ? ` · ${A.esc(s.model.split("/").at(-1))}` : ""}</small></div>
        ${given.map((g) => `<div class="at-given">${A.icon("memory")}Atlas handed back checkpoint <code>${A.esc((g.ref?.eventId ?? "").slice(0, 12))}…</code></div>`).join("")}
        ${s.kind === "compact" ? `<p class="at-step-text">The session was compacted; nothing changed.</p>` : `<p class="at-step-text clamp2">${A.esc((s.result.split("TEXT:")[1] ?? s.result).replace(/\*\*/g, "").trim())}</p>
        <details class="at-sub-acc inline"><summary>${A.icon("chev")}<span>Packet from Maestro</span></summary><div class="at-reasoning">${A.esc(s.packet)}</div></details>`}
        ${made.map((x) => `<div class="at-made ${x.outcome}">${A.icon(x.outcome === "admitted" ? "checkc" : "xc")}${x.outcome === "admitted" ? "Checkpoint saved" : `Checkpoint refused · <code>${A.esc(x.refusal)}</code>`}</div>`).join("")}
      </div></li>` }).join("")}</ol>`
    const all = t.checkpoints.map((x) => `<details class="at-ckpt ${x.outcome}"><summary><span class="at-state ${x.outcome === "admitted" ? "good" : "bad"}">${A.icon(x.outcome === "admitted" ? "checkc" : "xc")}${x.outcome === "admitted" ? "saved" : "refused"}</span><span class="grow">${A.esc(x.entry.stoppedAt ?? x.reason)}</span>${x === c ? '<span class="at-pill warm">latest</span>' : ""}<small>${time(at(x.at))}</small></summary><div class="at-panel-body">${x.outcome === "admitted" ? fold(x.entry) : `<p class="at-step-text"><code>${A.esc(x.refusal)}</code> — ${A.esc(x.reason)}</p>`}</div></details>`).join("")
    return {
      crumbs,
      html: `<div class="at-page narrow">
      <div class="at-agent-head"><span class="at-avatar">${name[0]}</span><div><div class="mx-eyebrow">${name} · task memory</div><h1 class="mono">${A.esc(unit)}</h1><p>${A.esc((t.title ?? t.steps[0]?.packet.split("\n").find((l) => /Phase 1/.test(l)) ?? role).replace(/^- Phase 1 \(now\): /, "").replace(/ \(@backend-label subagent\)/, "").replace(/`/g, ""))}</p></div><span class="grow"></span>
        ${A.btn("Transcript", "go", { value: `#/memory/${member}/task/${encodeURIComponent(unit)}/transcript`, icon: "chat" })}${A.btn("Respawn with this memory", "respawn", { value: `${member}|${unit}`, icon: "play", primary: true })}</div>
      <div class="at-kpis">
        ${kpi("Status", `<span class="at-state ${tone}">${A.icon(glyph)}${label}</span>`, c ? "from its latest checkpoint" : "no checkpoint")}
        ${kpi("Calls", inv, `${(tokens(t) / 1000).toFixed(0)}k tokens`)}
        ${kpi("Time", dur(total), `${day(t.steps[0].start)} · ${t.steps[0].model ? A.esc(t.steps[0].model.split("/").at(-1)) : ""}`)}
        ${kpi("Checkpoints", t.checkpoints.length - refused, refused ? `${refused} refused` : "none refused", refused ? "warn" : "")}</div>
      ${acc(`task-latest`, "memory", "Where it stopped", `What it gets back on respawn`, c ? A.esc((c.entry.stoppedAt ?? "").slice(0, 60)) + "…" : "no checkpoint", c ? fold(c.entry) : '<div class="at-band-empty">No saved checkpoint, so a resume would be refused.</div>', true)}
      ${acc(`task-calls`, "history", "Calls", "Each time Maestro called it", `${inv} calls · ${dur(total)}`, steps, true)}
      ${acc(`task-ckpts`, "stack", "Checkpoint history", "Every write, refused ones too", `${t.checkpoints.length - refused} saved${refused ? ` · ${refused} refused` : ""}`, all)}
      ${t.diff ? acc(`task-diff`, "code", "Files changed", "What it changed in the repository", "counter.ts", `<pre class="at-raw">${A.esc(t.diff)}</pre>`) : ""}
      <p class="at-foot-id">session <code>${A.esc(t.seatSession)}</code></p></div>`,
    }
  }

  /* ---------- Transcript ---------- */
  const transcriptPage = (state, member, unit) => {
    const t = tasksOf(member).find((x) => x.unit === unit)
    const [name] = members[member]
    const part = (p) => {
      if (p.type === "admission") return `<div class="at-tx-admission">${A.icon("memory")}<div><strong>Atlas handed back the latest checkpoint</strong><p>${A.esc(p.text)}</p></div></div>`
      if (p.type === "text") return `<p class="at-tx-text">${A.esc(p.text.replace(/\*\*/g, ""))}</p>`
      if (p.type === "reasoning") return `<details class="at-tx-reason"><summary>${A.icon("chev")}Thinking</summary><p>${A.esc(p.text)}</p></details>`
      const r = p.receipt
      return `<div class="at-tx-tool ${p.status} ${p.held ? "held" : ""}">${A.icon(p.tool?.startsWith("atlas") ? "atlas" : "code")}<code>${A.esc(p.tool)}</code><span class="at-tx-in">${A.esc(p.input)}</span>
        ${r ? `<span class="at-state ${r.outcome === "admitted" || r.outcome === "read" ? "good" : "bad"}">${A.icon(r.outcome === "admitted" || r.outcome === "read" ? "checkc" : "xc")}${A.esc(r.outcome)}${r.refusal ? ` · ${A.esc(r.refusal)}` : ""}</span>` : p.held ? `<span class="at-state bad">${A.icon("lock")}held</span>` : p.status === "error" ? `<span class="at-state bad">${A.icon("xc")}error</span>` : ""}</div>`
    }
    return {
      crumbs: [["Atlas", "#/overview"], ["Memory", `#/memory/${member}`], [name, `#/memory/${member}`], [unit, `#/memory/${member}/task/${encodeURIComponent(unit)}`, true], ["Transcript"]],
      flush: true,
      html: `<div class="at-session"><div class="at-tabs-strip"><span class="at-sess-tab">${A.icon("chat")}${A.esc(t.title ?? `${name} · ${unit}`)} <code>${A.esc(t.seatSession.slice(0, 16))}…</code></span><span class="grow"></span>${A.btn("Back to task", "go", { value: `#/memory/${member}/task/${encodeURIComponent(unit)}`, icon: "back" })}${A.btn("Respawn with this memory", "respawn", { value: `${member}|${unit}`, icon: "play", primary: true })}</div>
      <div class="at-transcript">${t.transcript.map((m) => `<div class="at-turn ${m.role === "user" ? "user" : ""}">${m.role === "assistant" ? `<div class="at-turn-head">${A.agent(member)}<span>${A.esc(m.model ?? "")}</span><span class="grow"></span><small>${A.num(m.tokens.in + m.tokens.out)} tokens${m.tokens.cache ? ` · ${A.num(m.tokens.cache)} cached` : ""}</small></div>` : `<div class="at-turn-head"><span>${A.agent("maestro")}</span><span>packet</span></div>`}${m.parts.map(part).join("")}</div>`).join("")}</div></div>`,
    }
  }

  A.views.memory = (state) => {
    const [member = "backend", sub, unit, tail] = (state.params[0] ?? "backend").split("/")
    const m = members[member] ? member : "backend"
    if (sub === "task" && unit && tail === "transcript") return transcriptPage(state, m, decodeURIComponent(unit))
    if (sub === "task" && unit) return taskPage(state, m, decodeURIComponent(unit))
    return memberPage(state, m)
  }
})(window.Atlas)
