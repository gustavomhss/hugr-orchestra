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

  const head = (member, name, role, bound) => {
    const s = A.memoryStats(member)
    return `<div class="at-agent-head"><span class="at-avatar">${name[0]}</span><div><div class="mx-eyebrow">Atlas · Memory</div><h1>${name}</h1><p>${role}${bound ? "" : " · memory not bound in Orchestra"}</p></div>
      ${bound ? `<div class="at-head-stats"><span><b>${s.tasks}</b> tasks</span><span><b>${s.invocations}</b> invocations</span><span><b>${s.checkpoints}</b> checkpoints${s.refused ? ` · ${s.refused} refused` : ""}</span><span><b>0</b>/12 stewardship rules</span></div>` : ""}</div>`
  }

  /* ---------- Member page ---------- */
  const memberPage = (state, member) => {
    const [name, role] = members[member]
    const bound = M().memory[member].bound
    const ts = tasksOf(member)
    const showHeader = state.query.header === "1"
    const raw = `<atlas-header member="${member}" rules="0">\nAwareness:\n${M().awareness.map((a) => `  ${a.facet}: ${a.state === "seeded" ? a.text : "UN-SEEDED"}`).join("\n")}\nOrientation:\n  (empty)\nProject rules:\n  (none)\n</atlas-header>`
    if (!bound) return {
      crumbs: [["Atlas", "#/overview"], ["Memory", "#/memory/backend"], [name]],
      html: `<div class="at-page narrow">${head(member, name, role, false)}<div class="at-clear">${A.icon("memory")}<strong>Maestro's memory is defined but not bound</strong><p>Atlas gives the orchestrator its own stewardship rules, task memory and a logbook (one entry per PR: what shipped, decisions and why, trade-offs, risks, open threads). Orchestra binds memory only for Backend, Jimmy and Archie today.</p></div></div>`,
    }
    const ls = lessons(member)
    return {
      crumbs: [["Atlas", "#/overview"], ["Memory", "#/memory/backend"], [name]],
      html: `<div class="at-page narrow">${head(member, name, role, true)}
      <section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("shield")}Stewardship</h3><small>Project memory: short, scoped know-how ${name} carries into every turn — what someone who has worked on this code for years just knows. At most 12 rules, about 500 words; rules it stops using fade out and are archived.</small></div>${A.meter("Words", 0, 500, "warm")}</header>
        <div class="at-band-empty left" style="padding:14px 15px">No stewardship rules yet. ${name} starts every turn with only the shared header.</div>
        ${ls.length ? `<div class="at-subhead">From ${name}'s own task lessons · could become stewardship</div>${ls.map((l) => `<div class="at-lesson"><div class="grow">${A.esc(l.lesson)}<small>lesson from <a class="mx-link" href="#/memory/${member}/task/${encodeURIComponent(l.unit)}">${A.esc(l.unit)}</a></small></div>${A.btn("Make it a rule…", "promote-rule", { value: l.lesson })}</div>`).join("")}` : ""}
        <footer class="at-card-foot"><span class="grow">The turn header also carries Awareness and Orientation, which are shared by every member.</span>${A.btn(showHeader ? "Hide header" : "What it carries every turn", "go", { value: `#/memory/${member}${showHeader ? "" : "?header=1"}` })}</footer>
        ${showHeader ? `<div class="at-panel-body"><pre class="at-raw">${A.esc(raw)}</pre></div>` : ""}</section>
      <section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("check")}Tasks</h3><small>One memory per dispatched task. Each keeps ${name}'s session (respawnable), every invocation of it, and the checkpoints ${name} wrote: what it tried, what failed, where it stopped, the lesson. Resuming the task hands the latest checkpoint back.</small></div><span class="wf-count">${ts.length}</span></header>
        ${ts.length ? `<table class="at-grid-table"><thead><tr><th>Task</th><th>Status</th><th>Where it stopped</th><th class="num">Invocations</th><th class="num">Checkpoints</th><th>When</th></tr></thead><tbody>
        ${[...ts].reverse().map((t) => { const [tone, glyph, label] = status(t); const c = latest(t); const inv = t.steps.filter((s) => s.kind !== "compact").length; const refused = t.checkpoints.filter((x) => x.outcome !== "admitted").length
          return `<tr data-action="go" data-value="#/memory/${member}/task/${encodeURIComponent(t.unit)}" tabindex="0"><td><code class="at-mono">${A.esc(t.unit)}</code><small class="at-sub">${A.esc((t.title ?? t.steps[0]?.packet.split("\n").find((l) => /Phase 1/.test(l)) ?? "").replace(/^- Phase 1 \(now\): /, "").replace(/ \(@backend-label subagent\)/, "").slice(0, 70))}</small></td><td><span class="at-state ${tone}">${A.icon(glyph)}${label}</span></td><td class="at-cell-text">${A.esc(c?.entry.stoppedAt ?? "—")}</td><td class="num">${inv}</td><td class="num">${t.checkpoints.length - refused}${refused ? `<small class="at-sub bad">${refused} refused</small>` : ""}</td><td>${day(t.steps[0].start)} ${time(t.steps[0].start)}</td></tr>` }).join("")}
        </tbody></table>` : `<div class="at-band-empty left" style="padding:16px 15px">No tasks yet. The first time ${name} is dispatched with a task unit, its session and checkpoints appear here.</div>`}</section>
      <section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("branch")}Pull requests</h3><small>One memory per PR: decisions, review outcomes and the knowledge it changed. Read only when ${name} asks for it.</small></div><span class="wf-count">0</span></header><div class="at-band-empty left" style="padding:14px 15px">No PR memory yet.</div></section>
      <p class="mx-note">Stored in <code>.atlas/memory.jsonl</code> in the worktree, append-only and versioned with the repository; every write is scanned for secrets first. Only ${name} reads it.</p></div>`,
    }
  }

  /* ---------- Task page ---------- */
  const taskPage = (state, member, unit) => {
    const t = tasksOf(member).find((x) => x.unit === unit)
    const [name] = members[member]
    if (!t) return { crumbs: [["Atlas", "#/overview"], ["Memory", `#/memory/${member}`], [unit]], html: `<div class="at-page narrow">${A.empty("No such task", "It may belong to another member.", A.btn("Back", "go", { value: `#/memory/${member}` }))}</div>` }
    const [tone, glyph, label] = status(t)
    const c = latest(t)
    const at = (ms) => new Date(ms).toISOString()
    const inStep = (s, ms) => { const x = at(ms); return x >= s.start && (!s.end || x <= s.end) }
    const total = secs(t.steps[0].start, t.steps.at(-1).end)
    const fold = (e) => `<dl class="at-kv wide"><dt>Tried</dt><dd>${(e.attempted ?? []).map(A.esc).join("<br>") || "—"}</dd><dt>Failed with</dt><dd>${(e.failedWith ?? []).length ? e.failedWith.map(A.esc).join("<br>") : "<small>nothing</small>"}</dd><dt>Stopped at</dt><dd>${A.esc(e.stoppedAt ?? "—")}</dd><dt>Lesson</dt><dd class="at-lesson-text">${A.esc(e.lesson ?? "—")}</dd></dl>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Memory", `#/memory/${member}`], [name, `#/memory/${member}`], [unit, null, true]],
      html: `<div class="at-page narrow">
      <div class="mx-heading"><div><div class="mx-eyebrow">${name} · task memory</div><h1 class="mono">${A.esc(unit)}</h1>
        <div class="at-scope-facts"><span class="at-state ${tone}">${A.icon(glyph)}${label}</span><span>${plural(t.steps.filter((s) => s.kind !== "compact").length, "invocation")} · ${dur(total)}</span><span>${A.num(tokens(t))} tokens</span><span>dispatched by ${A.agent("maestro")}</span></div></div>
        <div class="heading-actions">${A.btn("Open transcript", "go", { value: `#/memory/${member}/task/${encodeURIComponent(unit)}/transcript`, icon: "chat" })}${A.btn("Respawn with this memory", "respawn", { value: `${member}|${unit}`, icon: "play", primary: true })}</div></div>
      <section class="at-panel at-stopped"><header class="at-panel-head"><div><h3>${A.icon("memory")}Latest checkpoint</h3><small>This is what ${name} gets back when the task is resumed${c?.ref ? ` · record <code>${A.esc(c.ref.slice(0, 12))}…</code>` : ""}</small></div></header><div class="at-panel-body">${c ? fold(c.entry) : '<div class="at-band-empty left">No admitted checkpoint, so a resume would be refused.</div>'}</div></section>
      <section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("history")}Invocations</h3><small>Every time Maestro called ${name} on this task, in order. The seat session stays the same; each call adds to it.</small></div></header><ol class="at-steps">
        ${t.steps.map((s, i) => {
          const made = t.checkpoints.filter((x) => inStep(s, x.at))
          const given = t.admissions.filter((x) => inStep(s, x.at))
          return `<li class="at-step ${s.kind}"><span class="at-step-dot">${A.icon(stepGlyph[s.kind] ?? "dot")}</span><div class="at-step-body">
            <div class="at-step-head"><strong>${stepName[s.kind] ?? s.kind}</strong><small>${day(s.start)} ${time(s.start)} · ${dur(secs(s.start, s.end))}${s.model ? ` · ${A.esc(s.model.split("/").at(-1))}` : ""}</small></div>
            ${given.map((g) => `<div class="at-given">${A.icon("memory")}Atlas handed back checkpoint <code>${A.esc((g.ref?.eventId ?? "").slice(0, 12))}…</code> · ${A.esc(g.residency)}</div>`).join("")}
            ${s.kind === "compact" ? `<p class="at-step-text">The seat session was compacted. ${A.esc(s.result || "No change.")}</p>` : `<details class="at-why-details"><summary>${A.icon("chev")}Packet from Maestro</summary><div class="at-reasoning">${A.esc(s.packet)}</div></details>
            <p class="at-step-text">${A.esc((s.result.split("TEXT:")[1] ?? s.result).replace(/\*\*/g, "").trim().slice(0, 420))}${s.result.length > 420 ? "…" : ""}</p>`}
            ${made.map((x) => `<div class="at-made ${x.outcome}">${A.icon(x.outcome === "admitted" ? "checkc" : "xc")}${x.outcome === "admitted" ? `Checkpoint saved <code>${A.esc((x.ref ?? "").slice(0, 12))}…</code>` : `Checkpoint refused · <code>${A.esc(x.refusal)}</code>`}<span class="grow"></span><small>${A.esc(x.entry.stoppedAt ? x.entry.stoppedAt.slice(0, 70) : x.reason.slice(0, 70))}</small></div>`).join("")}
          </div></li>` }).join("")}</ol></section>
      <section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("stack")}All checkpoints</h3><small>Append-only. Refused writes never replace the latest one; the newest admitted checkpoint is what a resume hands back.</small></div><span class="wf-count">${t.checkpoints.length}</span></header>
        ${t.checkpoints.map((x, i) => `<details class="at-ckpt ${x.outcome}" ${x === c ? "open" : ""}><summary><span class="at-state ${x.outcome === "admitted" ? "good" : "bad"}">${A.icon(x.outcome === "admitted" ? "checkc" : "xc")}${x.outcome}</span><span class="grow">${A.esc(x.entry.stoppedAt ?? x.reason)}</span>${x === c ? '<span class="at-pill warm">latest</span>' : ""}<small>${time(at(x.at))}</small></summary><div class="at-panel-body">${x.outcome === "admitted" ? fold(x.entry) : `<p class="at-step-text"><code>${A.esc(x.refusal)}</code> — ${A.esc(x.reason)}</p>`}</div></details>`).join("")}</section>
      ${t.diff ? `<section class="at-panel"><header class="at-panel-head"><h3>${A.icon("code")}Files changed</h3></header><div class="at-panel-body"><pre class="at-raw">${A.esc(t.diff)}</pre></div></section>` : ""}
      <p class="mx-note">Seat session <code>${A.esc(t.seatSession)}</code> · task <code>${A.esc(t.taskRef)}</code> · dispatched from <code>${A.esc(t.maestroSession)}</code>. From the live continuity run ${A.esc(t.run)} (Oct 11).</p></div>`,
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
