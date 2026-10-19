// The product surface: Home (what Atlas knows), Explore (the graph as navigation), Genesis (how Atlas learns a
// repository) and How it works (one real fact followed from mining to an agent, through the OKF store).
// Every number comes from the store (data-real.js) or is marked example; see INVENTORY.md for the sources.
;(function (A) {
  const M = () => A.m
  const R = () => A.m.R
  const plural = (n, one, many = `${one}s`) => `${A.num(n)} ${n === 1 ? one : many}`
  const short = (id) => (id === "(root)" ? "top-level" : id.split("/").slice(1).join("/") || id)
  const unitHref = (id) => `#/unit/${encodeURIComponent(id)}`
  const toneOf = (u) => (u.drifted / u.facts > 0.25 ? "warm" : u.drifted ? "mixed" : "good")
  const groupWord = { code: "Code", docs: "Docs", harness: "Harness", root: "Root" }
  const names = { backend: "Backend", jimmy: "Jimmy", archie: "Archie" }

  // The unit graph, mounted after render. Node size = facts, colour = how much still holds, ring = share changed.
  const mountUnitGraph = (host, opts = {}) => {
    const g = M().unitGraph()
    const max = Math.max(...g.units.map((u) => u.facts))
    const blastOf = (id) => M().dependentFacts(id)
    return A.graph(host, {
      id: opts.id ?? "units",
      label: "Units and what depends on them",
      nodes: g.units.filter((u) => !opts.group || u.group === opts.group).map((u) => ({
        id: u.id, label: u.id, short: short(u.id), r: 5 + Math.sqrt(u.facts / max) * (opts.big ?? 22), tone: `${toneOf(u)} g-${u.group}`,
        ring: u.drifted / u.facts, pin: u.facts > max * 0.25,
        tip: `<b>${A.esc(short(u.id))}</b><span>${A.esc(groupWord[u.group])} · ${plural(u.facts, "fact")}${u.drifted ? ` · ${u.drifted} changed` : ""}</span><span>${A.num(blastOf(u.id))} facts elsewhere depend on it</span>`,
      })),
      edges: g.edges,
      length: opts.length ?? 150,
      repel: opts.repel ?? 2600,
      selected: opts.selected,
      onSelect: opts.onSelect,
    })
  }
  A.mountUnitGraph = mountUnitGraph

  /* ---------- Home: what Atlas knows, what it caught, what it gave agents ---------- */
  A.views.overview = (state) => {
    const s = M().stats()
    const need = M().curationCount()
    const events = M().activity()
    const trusted = M().provenance() === "trusted"
    const changes = M().codeChanges()
    const agents = ["backend", "jimmy", "archie"].map((id) => {
      const mine = events.filter((e) => e.who === id)
      return { id, reads: mine.filter((e) => e.kind === "read").length, saves: mine.filter((e) => e.kind === "memory" && e.ok && !e.recall).length, resumes: mine.filter((e) => e.kind === "resume" && e.ok).length, holds: mine.filter((e) => e.kind === "hold").length, example: mine.some((e) => e.example) }
    })
    const health = A.healthSection(state.query.show === "health")
    const staged = R().candidates.length + M().facts.length
    return {
      crumbs: [["Atlas"]],
      html: `<div class="at-page wide at-home">
      <section class="at-hero solo">
        <div class="at-hero-text">
          <div class="mx-eyebrow">Atlas · project atlas ${need ? `<a class="at-needs" href="#/review">${A.num(need)} need you</a>` : ""}</div>
          <h1>Atlas knows <em>${A.num(s.facts)} things</em> about this code.</h1>
          <p>Each one is pinned to the exact code it describes and re-checked whenever that code moves. <b>${A.num(s.fresh)}</b> still hold. <b class="warm">${A.num(s.drifted)}</b> stopped matching their code, and Atlas noticed.</p>
          <p class="at-hero-git">${A.icon("branch")} Versioned in git with the code: it changes in pull requests and comes back on any clone. <a class="mx-link" href="#/overview" onclick="event.preventDefault();document.getElementById('travel').scrollIntoView({behavior:'smooth'})">How</a></p>
          ${trusted ? "" : `<p class="at-hero-warn">${A.icon("lock")} This store is in git, so agents get none of it yet. <a class="mx-link" href="#/overview?show=health">Why</a></p>`}
          <div class="at-hero-actions">${A.btn("Explore the map", "go", { value: "#/explore", primary: true, icon: "graph" })}${A.btn("How Atlas learns", "go", { value: "#/genesis", icon: "sparkle" })}${A.btn("Follow one fact", "go", { value: "#/how", icon: "fact" })}</div>
        </div>
      </section>
      <section class="at-stories">
        <a class="at-story" href="#/genesis">
          <span class="at-story-k">${A.icon("sparkle")}Learned</span>
          <b>${A.num(staged)} claims</b>
          <p>Genesis read ${A.num(M().health().index.configured.reduce((n, c) => n + c.files, 0))} files and proposed a sentence for each place worth knowing. Every claim keeps the reasoning that produced it.</p>
          <span class="at-story-foot">${A.num(M().facts.length)} accepted · ${A.num(R().candidates.length)} waiting ${A.icon("arrow")}</span>
        </a>
        <a class="at-story warm" href="#/review?tab=changed">
          <span class="at-story-k">${A.icon("drift")}Caught</span>
          <b>${plural(s.drifted, "fact")} went stale</b>
          ${changes.slice(0, 3).map((c) => `<div class="at-story-row"><code class="at-sha">${A.esc(c.sha)}</code><span>${A.esc(c.subject.slice(0, 46))}</span><small>${c.facts.length}</small></div>`).join("") || "<p>Every fact still matches its code.</p>"}
          <span class="at-story-foot">Review what changed ${A.icon("arrow")}</span>
        </a>
        <a class="at-story" href="#/activity">
          <span class="at-story-k">${A.icon("agents")}Delivered</span>
          <b>${events.filter((e) => e.kind === "read").length ? `${plural(events.filter((e) => e.kind === "read").length, "briefing")} read` : "No reads yet"}</b>
          ${agents.map((a) => `<div class="at-story-row"><span class="at-avatar sm">${names[a.id][0]}</span><span>${names[a.id]}</span><small>${[a.reads ? `${a.reads} read` : "", a.saves ? `${a.saves} saved` : "", a.resumes ? `${a.resumes} resumed` : "", a.holds ? `${a.holds} held` : ""].filter(Boolean).join(" · ") || "nothing yet"}</small></div>`).join("")}
          <span class="at-story-foot">${agents.some((a) => a.example) ? '<span class="at-pill">example</span>' : ""} Activity ${A.icon("arrow")}</span>
        </a>
      </section>
      ${A.travelSection()}
      ${health.html}
      </div>`,
    }
  }
  // How Atlas travels (modules/atlas/.gitignore): the reviewed config and the append-only logs are committed with the
  // code, the owners live in .orchestra/skills/own, and the store bytes are local state any clone rebuilds.
  A.travelSection = () => `<section class="at-panel at-arch-block at-travel" id="travel"><header class="at-panel-head"><div><h3>${A.icon("branch")}It travels with your repo</h3><small>Atlas lives in git next to the code. A pull request changes it, a merge brings it along, and any machine that clones the repository gets it back.</small></div></header>
    <div class="at-travel-flow">
      <div class="at-travel-col"><div class="at-travel-k good">${A.icon("branch")}Committed, pushed to the remote</div>
        ${[["memory.jsonl", "What every agent saved. Append-only, one line per memory: two branches merge as a union, and duplicates fold by content id."], ["orientation.jsonl", "Where the project stands, identical for every member."], ["policy.json", "Who may write what. Reviewed in pull requests like code."], [".orchestra/skills/own/", "The owners, one skill per module, with their coverage list."]].map(([f, d]) => `<div class="at-travel-row"><code>${f}</code><p>${d}</p></div>`).join("")}</div>
      <div class="at-travel-mid"><div class="at-travel-node">${A.icon("branch")}<b>origin</b><small>branch · PR · merge</small></div><div class="at-travel-arrow">${A.icon("arrow")}</div><div class="at-travel-node">${A.icon("download")}<b>any clone</b><small>a teammate, CI, a new laptop</small></div></div>
      <div class="at-travel-col"><div class="at-travel-k">${A.icon("refresh")}Rebuilt on each machine</div>
        ${[["cas/ · projection", "The facts and their versions. Content-addressed, so the same claim gets the same name on every machine."], ["index.scip", "The code index, regenerated from the code at that commit."], ["staging", "Suggestions waiting for review. Genesis mines them again; they are never committed, so nothing half-reviewed leaks into history."]].map(([f, d]) => `<div class="at-travel-row"><code>${f}</code><p>${d}</p></div>`).join("")}</div>
    </div>
    <div class="at-travel-steps">${[["Open a PR", "Memories, policy and owners change in the same diff as the code they describe."], ["Merge", "Logs union line by line; owners whose code changed hold until refreshed."], ["Clone anywhere", "Run Genesis: the index and store come back from the code; memory and owners are already there."]].map(([t, d], i) => `<div><span>${i + 1}</span><b>${t}</b><p>${d}</p></div>`).join("")}</div>
    <p class="mx-note">To move a whole store in one piece, <code>atlas export</code> writes an <code>atlas-okf.json</code> bundle that imports into an empty store, all or nothing. ${A.help("modules/atlas/.gitignore: .atlas/* is ignored except memory.jsonl, orientation.jsonl and policy.json; staging is denied at any depth.")}</p></section>`

  const pickEmpty = `<div class="at-pick-empty">${A.icon("graph")}<span>Each circle is a unit Atlas serves knowledge for. Arrows point to what it depends on.</span></div>`
  const pick = (id) => {
    const u = M().units().find((x) => x.id === id)
    if (!u) return pickEmpty
    const b = M().briefing(id)
    const blast = M().dependentFacts(id)
    const pct = Math.round(((u.facts - u.drifted) / u.facts) * 100)
    return `<div class="at-pick"><div class="at-pick-head"><span class="at-sdot ${u.drifted ? "warm" : "good"}"></span><strong>${A.esc(short(id))}</strong><small>${A.esc(groupWord[u.group])}</small><span class="grow"></span>${A.btn("Open", "go", { value: unitHref(id), primary: true })}</div>
      <div class="at-pick-stats"><div><b>${A.num(u.facts)}</b><small>facts</small></div><div><b>${pct}%</b><small>still hold</small></div><div><b>${A.num(blast)}</b><small>depend on it</small></div><div><b>${A.num(b.used)}</b><small>of 1,500 chars briefed</small></div></div>
      ${b.adv.concat(b.inv).slice(0, 2).map((x) => `<p class="at-pick-fact" data-action="open-fact-page" data-value="${x.key}">“${A.esc(x.claim.slice(0, 150))}${x.claim.length > 150 ? "…" : ""}”</p>`).join("")}</div>`
  }

  /* ---------- Explore: the graph is the way in ---------- */
  A.views.explore = (state) => {
    const q = state.query
    const view = q.view ?? "graph"
    const group = q.group ?? ""
    const units = M().units().filter((u) => !group || u.group === group)
    const s = M().stats()
    const href = (patch) => `#/explore?${new URLSearchParams(Object.fromEntries(Object.entries({ view, group, ...patch }).filter(([, v]) => v)))}`
    const toolbar = `<div class="at-explore-bar">
      <div class="wf-range">${[["graph", "Graph", "graph"], ["map", "Map", "stack"], ["list", "List", "list"]].map(([id, l, ic]) => `<button aria-pressed="${view === id}" data-action="go" data-value="${href({ view: id })}">${A.icon(ic)}${l}</button>`).join("")}</div>
      <div class="at-typechips">${[["", "All"], ["code", "Code"], ["docs", "Docs"], ["harness", "Harness"], ["root", "Root"]].map(([g, l]) => `<button class="at-typechip ${group === g ? "on" : ""}" data-action="go" data-value="${href({ group: g })}">${l}<span>${M().units().filter((u) => !g || u.group === g).length}</span></button>`).join("")}</div>
      <span class="grow"></span>
      <label class="at-search">${A.icon("search")}<input id="list-search" placeholder="Search facts" value="${A.esc(q.q ?? "")}" aria-label="Search facts"><kbd>/</kbd></label></div>`
    const text = (q.q ?? "").trim().toLowerCase()
    if (text) {
      const results = M().live().filter((x) => `${x.claim} ${x.file}`.toLowerCase().includes(text))
      return { crumbs: [["Atlas", "#/overview"], ["Explore"]], html: `<div class="at-page wide">${head(s)}${toolbar}<section class="at-panel"><header class="at-panel-head"><h3>${plural(results.length, "fact")} match</h3>${A.btn("Clear", "go", { value: href({ q: "" }) })}</header>${A.seven(results, "search", (x) => A.factRow(x, state), 25) || '<div class="at-band-empty">Nothing matches.</div>'}</section></div>` }
    }
    const body = view === "map" ? treemap(units) : view === "list" ? cards(units) : `<div class="at-explore-graph"><div class="at-graph-host tall" id="explore-graph"></div>
        <div class="at-graph-zoom">${A.btn("", "graph-zoom", { icon: "plus", value: "1.25", label: "Zoom in" })}${A.btn("", "graph-zoom", { icon: "minus", value: "0.8", label: "Zoom out" })}${A.btn("", "graph-fit", { icon: "expand", label: "Fit" })}</div>
        <div class="at-graph-legend floating"><span><i class="lg good"></i>holds</span><span><i class="lg warm"></i>code moved</span><span><i class="lg edge"></i>depends on</span><span><i class="lg hot"></i>depends on the selection</span></div>
        <aside class="at-graph-side" id="explore-pick">${q.unit ? pick(q.unit) : pickEmpty}</aside></div>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Explore"]],
      after: () => {
        const host = document.querySelector("#explore-graph")
        if (!host) return
        A.exploreGraph = mountUnitGraph(host, { id: "explore", group, selected: q.unit, big: 26, onSelect: (id) => {
          document.querySelector("#explore-pick").innerHTML = id ? pick(id) : pickEmpty
          history.replaceState(null, "", href({ unit: id ?? "" }))
        } })
      },
      html: `<div class="at-page wide">${head(s)}${toolbar}${body}</div>`,
    }
  }
  const head = (s) => `<div class="mx-heading"><div><div class="mx-eyebrow">Atlas</div><h1>Explore</h1><p>${plural(M().units().length, "unit")} · ${plural(s.facts, "fact")} · ${A.num(M().unitGraph().edges.length)} dependency links</p></div><div class="heading-actions">${A.btn("Check a claim…", "verify", { icon: "shield" })}</div></div>`

  // A squarified treemap: area = facts, colour = share still holding.
  const treemap = (units) => {
    const W = 1000, H = 560
    const total = units.reduce((n, u) => n + u.facts, 0)
    const items = units.map((u) => ({ u, a: (u.facts / total) * W * H })).sort((a, b) => b.a - a.a)
    const rects = []
    const worst = (row, w) => { const s = row.reduce((n, r) => n + r.a, 0); const mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a)); return Math.max((w * w * mx) / (s * s), (s * s) / (w * w * mn)) }
    let x = 0, y = 0, w = W, h = H, row = []
    const layout = (row) => {
      const s = row.reduce((n, r) => n + r.a, 0)
      if (w >= h) { const cw = s / h; let cy = y; row.forEach((r) => { const rh = r.a / cw; rects.push({ ...r, x, y: cy, w: cw, h: rh }); cy += rh }); x += cw; w -= cw }
      else { const ch = s / w; let cx = x; row.forEach((r) => { const rw = r.a / ch; rects.push({ ...r, x: cx, y, w: rw, h: ch }); cx += rw }); y += ch; h -= ch }
    }
    items.forEach((it) => {
      const side = Math.min(w, h)
      if (!row.length || worst([...row, it], side) <= worst(row, side)) row.push(it)
      else { layout(row); row = [it] }
    })
    if (row.length) layout(row)
    return `<div class="at-treemap">${rects.map((r) => {
      const hold = (r.u.facts - r.u.drifted) / r.u.facts
      // Amber when a third or more changed, green when everything holds; most units sit near the top, so stretch it.
      const hue = Math.round(32 + Math.max(0, Math.min(1, (hold - 0.66) / 0.34)) * 110)
      return `<a class="at-tm ${toneOf(r.u)}" href="${unitHref(r.u.id)}" style="left:${(r.x / W) * 100}%;top:${(r.y / H) * 100}%;width:${(r.w / W) * 100}%;height:${(r.h / H) * 100}%;--hue:${hue}" data-tip="${A.esc(short(r.u.id))} · ${r.u.facts} facts${r.u.drifted ? ` · ${r.u.drifted} changed` : ""}">
        ${r.w > 70 && r.h > 34 ? `<strong>${A.esc(short(r.u.id))}</strong><small>${r.u.facts}${r.u.drifted ? ` · <span>${r.u.drifted} changed</span>` : ""}</small>` : ""}</a>`
    }).join("")}</div><div class="at-tm-scale"><span>Area: how much Atlas knows</span><span class="grow"></span><span>a third changed</span><i></i><span>all hold</span></div>`
  }
  const cards = (units) => {
    const owner = (u) => { const t = M().territoryOf(u.id); return t ? `${A.esc(t.name)} · ${A.esc(names[t.owner] ?? t.owner)}` : "No territory" }
    return `<div class="at-ucards">${units.map((u) => `<a class="at-ucard" href="${unitHref(u.id)}"><span class="at-ucard-top"><strong>${A.esc(u.id === "(root)" ? "Top-level files" : short(u.id))}</strong><span class="at-sdot ${u.drifted ? "warm" : "good"}"></span></span>
      <span class="at-ucard-num"><b>${A.num(u.facts)}</b> ${u.facts === 1 ? "fact" : "facts"}${u.drifted ? ` · <span class="warm">${u.drifted} changed</span>` : ""}</span><small>${owner(u)}</small></a>`).join("")}</div>`
  }
  A.views.knowledge = (state) => A.views.explore({ ...state, query: { ...state.query, view: state.query.view ?? "list" } })

  /* ---------- Genesis: how Atlas learns a repository ---------- */
  const stages = () => {
    const files = M().health().index.configured.reduce((n, c) => n + c.files, 0)
    const total = M().facts.length + R().candidates.length
    const refuted = Object.values(R().reasoning).filter((t) => /refut/i.test(t)).length
    return [
      { id: "scan", icon: "code", title: "Read the code", n: A.num(files), unit: "files indexed", how: "det", what: "Genesis walks the repository and loads the code index (index.scip). It builds three views of the same tree: where things are, who owns them, and what depends on what.", knobs: [], facts: ["No index, no sites: a repository without index.scip is mined from nothing.", "Deterministic: the same commit always gives the same skeleton."], refs: "genesis/src/rank.ts:194 · adapter-io/src/skeleton-source.ts:152" },
      { id: "rank", icon: "graph", title: "Pick where to look", n: "200", unit: "sites per kind, at most", how: "det", what: "It starts from the files that change most often or change together in git, then ranks every place with PageRank over the dependency graph. The most connected, most active code goes first.", knobs: ["frontier", "budget"], facts: ["Costs nothing: no model call until a site is visited.", "With a thin git history it falls back to the most-connected files."], refs: "adapter-io/src/git-history.ts:206 · genesis/src/rank.ts:228" },
      { id: "propose", icon: "sparkle", title: "Ask the model", n: A.num(total), unit: "claims proposed", how: "llm", what: "For each site, in rank order and eight at a time, the model reads the code and answers with one sentence worth knowing, or says there is nothing. It must argue against its own claim before keeping it.", knobs: ["kinds", "enrich", "proposals", "model"], facts: [`${A.num(refuted)} of ${A.num(Object.keys(R().reasoning).length)} stored answers show a self-refutation pass.`, "The model's full answer is kept with every claim."], refs: "adapter-io/src/llm.ts:345 · adapter-io/prompts/propose*.md" },
      { id: "check", icon: "shield", title: "Check every answer", n: "7", unit: "checks, no model", how: "det", what: "Every answer is checked without a model: format, that a named symbol really exists, that the claim still matches the code, and, for dependencies and counts, an oracle that proves it from the index. Secrets are redacted.", knobs: [], facts: ["For a count or a dependency, the model only picks a name: the number comes from the index.", "An answer that fails abstains with a named reason; nothing is dropped silently."], refs: "cli/src/mine-gate.ts:147 · genesis/src/admit-harness.ts:216" },
      { id: "stage", icon: "inbox", title: "Wait for review", n: A.num(total), unit: "staged as hints", how: "det", what: "What survives is staged as a hint in the mined group. Agents see none of it. Each site gets a ledger row, and the run proves it accounted for every planned site.", knobs: [], facts: ["A re-run never overwrites a staged claim: the first writer wins.", "Mining can't write knowledge; it can only propose."], refs: "cli/src/mine-decide.ts:107 · genesis/src/coverage.ts:119" },
      { id: "accept", icon: "check", title: "Accept", n: A.num(M().facts.length), unit: `accepted · ${A.num(R().candidates.length)} waiting`, how: "you", what: "Accepting re-checks every staged claim against today's code, through the same four checks every write passes. Claims whose code moved since mining are refused.", knobs: [], facts: ["Needs an approval key: a person signs off on mined knowledge.", "Only this step turns a suggestion into a fact."], refs: "adapter-io/src/governed-promote.ts:123" },
    ]
  }
  const knobs = {
    kinds: ["Kinds", "What to look for. By default three passes run one after another: hints (free sentences), dependencies and counts. Definitions and the eight-slot semantic pass run only when picked.", "ATLAS_MINE_SLOT", [["All three", ""], ["Hints", "advisory"], ["Dependencies", "dependency"], ["Counts", "count"], ["Definitions", "definition"], ["Semantic", "semantic"]]],
    frontier: ["Where", "Whole files, or also the symbols inside them.", "ATLAS_FRONTIER", [["Files", ""], ["Files and symbols", "symbol"]]],
    budget: ["Sites per kind", "How many sites the model visits per kind. Default: up to 200.", "ATLAS_MINE_BUDGET", null],
    enrich: ["Show neighbours", "Also show the model what is already known about the same file, so it adds something new.", "ATLAS_ENRICH", [["Off", ""], ["On", "1"]]],
    proposals: ["Proposals from", "Use claims an agent already wrote (a JSON file) instead of calling the model. Genesis still checks every one.", "ATLAS_TASK_PROPOSALS", [["The model", ""], ["An agent's file", "proposals.json"]]],
    model: ["Model", "The command Genesis runs for each site, set in ~/.config/atlas/model.json, outside the repository.", "ATLAS_MODEL_CONFIG", null],
  }
  A.views.genesis = (state) => {
    const st = stages()
    const at = st.find((x) => x.id === state.query.stage) ?? st[2]
    const conf = Object.fromEntries(Object.keys(knobs).map((k) => [k, state.query[`k-${k}`] ?? ""]))
    const env = Object.entries(knobs).filter(([k]) => conf[k]).map(([k, [, , v]]) => `${v}=${conf[k]}`).join(" ")
    const sample = M().live().find((x) => x.why && R().reasoning[x.why] && /refut/i.test(R().reasoning[x.why])) ?? M().live().find((x) => x.why)
    const reason = sample ? R().reasoning[sample.why] : ""
    const qs = (patch) => `#/genesis?${new URLSearchParams(Object.fromEntries(Object.entries({ stage: at.id, ...Object.fromEntries(Object.entries(conf).map(([k, v]) => [`k-${k}`, v])), ...patch }).filter(([, v]) => v)))}`
    const how = { det: ["Deterministic", "good"], llm: ["Model", "blue"], you: ["You", "warm"] }
    return {
      crumbs: [["Atlas", "#/overview"], ["Genesis"]],
      html: `<div class="at-page wide">
      <section class="at-gen-hero"><div><div class="mx-eyebrow">The engine</div><h1>Genesis</h1><p>How Atlas learns a repository: it reads the code, picks where to look, asks a model one place at a time, checks every answer without the model, and waits for you.</p></div>
        <div class="heading-actions">${A.btn("Run Genesis…", "mine", { primary: true, icon: "play", write: true })}</div></section>
      <ol class="at-pipe">${st.map((x, i) => `<li><a class="at-pipe-step ${x.id === at.id ? "on" : ""} ${x.how}" href="${qs({ stage: x.id })}"><span class="at-pipe-ic">${A.icon(x.icon)}</span><span class="at-pipe-n">${x.n}</span><span class="at-pipe-u">${x.unit}</span><strong>${i + 1}. ${x.title}</strong><span class="at-pipe-how ${how[x.how][1]}">${how[x.how][0]}</span></a></li>`).join("")}</ol>
      <section class="at-gen-detail">
        <div><h2>${A.icon(at.icon)}${at.title}</h2><p class="at-lead">${at.what}</p><ul class="at-gen-facts">${at.facts.map((f) => `<li>${A.icon("checkc")}${A.esc(f)}</li>`).join("")}</ul>
          ${at.knobs.length ? `<p class="mx-note">Set it with ${at.knobs.map((k) => `<a class="mx-link" href="#knob-${k}">${knobs[k][0]}</a>`).join(", ")} below.</p>` : ""}
          ${A.tech([["Code", `<code>${A.esc(at.refs)}</code>`]])}</div>
        ${at.id === "propose" || at.id === "check" ? `<div class="at-gen-sample"><div class="at-gen-sample-k">${A.icon("fact")}A real claim, and the reasoning behind it</div><p class="at-gen-claim">“${A.esc(sample?.claim ?? "")}”</p><code class="at-mono">${A.esc(sample?.file ?? "")}</code>
          <div class="at-reasoning short at-gen-reason">${A.esc(reason.slice(0, 900)).replace(/(Refutation pass:?|refut\w*)/i, "<mark>$1</mark>")}${reason.length > 900 ? "…" : ""}</div>${sample ? A.btn("Open this fact", "open-fact-page", { value: sample.key }) : ""}</div>`
        : at.id === "rank" ? `<div class="at-gen-sample"><div class="at-gen-sample-k">${A.icon("graph")}The most connected code goes first</div><div class="at-graph-host small" id="gen-graph"></div></div>`
        : at.id === "accept" ? `<div class="at-gen-sample"><div class="at-gen-sample-k">${A.icon("check")}From suggestion to fact</div>${A.bar([["good", M().facts.length], ["blue", R().candidates.length]])}<div class="at-coverage-legend"><span>Accepted <b>${A.num(M().facts.length)}</b></span><span>Waiting <b>${A.num(R().candidates.length)}</b></span></div>${A.btn("Review the waiting ones", "go", { value: "#/review?tab=mined" })}</div>`
        : `<div class="at-gen-sample"><div class="at-gen-sample-k">${A.icon("info")}What it can't do (yet)</div><p class="mx-note">Mine one folder only, resume a stopped run, stop early when sites stop paying off, or score how obvious a claim is: these exist in the library but no command reaches them.</p></div>`}
      </section>
      <section class="at-panel at-gen-config"><header class="at-panel-head"><div><h3>${A.icon("settings")}Configuration</h3><small>What the next run will do. Nothing here is saved by Atlas; it travels as environment variables.</small></div></header>
        <div class="at-knobs">${Object.entries(knobs).map(([k, [label, help, , opts]]) => `<div class="at-knob" id="knob-${k}"><div><strong>${label}</strong><small>${help}</small></div>
          ${opts ? `<div class="wf-range">${opts.map(([l, v]) => `<button aria-pressed="${conf[k] === v}" data-action="go" data-value="${qs({ [`k-${k}`]: v })}">${l}</button>`).join("")}</div>` : k === "budget" ? `<input class="at-knob-input" type="number" min="1" placeholder="200" value="${A.esc(conf.budget)}" data-knob="budget">` : `<code class="at-mono">~/.config/atlas/model.json · roles.propose</code>`}</div>`).join("")}</div>
        <div class="at-cmd"><span>Command</span><code>${A.esc(env ? `${env} ` : "")}atlas mine .</code>${A.btn("", "copy", { icon: "copy", value: `${env ? `${env} ` : ""}atlas mine .`, label: "Copy command" })}</div>
        ${A.tech([["Fixed", "8 sites in flight · PageRank damping 0.85, 64 iterations · churn and co-change ≥ 2"], ["Prints", "<code>genesis: seeded N</code> · <code>cost: llmCalls · budgetSpent</code> · <code>coverage CLOSES — …</code> · one <code>site:</code> line per site"], ["Kept", "staging.json and the model's answer per claim in the store; the run report and its resume point are not kept"], ["Cost cap", "accepted in model.json, not enforced"]])}</section>
      </div>`,
      after: () => {
        const host = document.querySelector("#gen-graph")
        if (host) mountUnitGraph(host, { id: "gen", big: 18, length: 90, repel: 900 })
      },
    }
  }

  /* ---------- How it works: follow one fact ---------- */
  A.views.how = (state) => {
    const pickFact = () => M().live().find((x) => x.drift && x.why) ?? M().live()[0]
    const x = M().byKey[state.query.fact] ?? pickFact()
    const step = Number(state.query.step ?? 0)
    const b = M().briefing(M().unitOf(x.file))
    const inBrief = b.adv.includes(x) || b.inv.includes(x)
    const blast = (R().dependents[x.file] ?? []).length
    const stops = [
      ["sparkle", "Learned", "Genesis visited this file and the model proposed one sentence about it.", `<div class="at-how-card"><p class="at-gen-claim">“${A.esc(x.claim)}”</p><div class="at-reasoning short">${A.esc((R().reasoning[x.why] ?? "No stored reasoning.").slice(0, 520))}…</div><small>The model's whole answer is stored next to the claim (answerRef).</small></div>`],
      ["shield", "Checked", "Before it could become a fact it passed four checks, in order. The chain stops at the first that fails.", `<div class="at-how-gates">${[["Well-formed", "shape", "It has a claim, a tier, a scope and a valid anchor."], ["Matches code", "truth", "The anchor's code still hashes the way the claim saw it."], ["Allowed", "authz", `The writer holds the ${x.scope} group.`], ["Approved", "ratify", "A person's approval key signs the write."]].map(([l, g, t], i) => `<div class="at-how-gate"><span>${i + 1}</span><b>${l}</b><small>${t}</small><code>${g}</code></div>`).join(A.icon("arrow"))}</div>`],
      ["stack", "Stored", "Atlas stores the fact by its content, so the same fact always has the same address, and nothing is ever overwritten.", `<div class="at-how-store">
        <div class="at-how-layer"><b>Identity</b><code>${A.esc(x.key.slice(0, 16))}…</code><small>nodeKey = hash(anchor ‖ kind). The same place and kind is the same fact, however it is worded.</small></div>
        <div class="at-how-layer"><b>Content</b><code>cas/${A.esc(x.hash.slice(0, 2))}/${A.esc(x.hash.slice(0, 14))}…</code><small>contentHash = BLAKE3 of the fact, without its grounding or freshness. Re-anchoring never changes it.</small></div>
        <div class="at-how-layer"><b>Current version</b><code>projection.${R().gen}.json</code><small>Generation ${R().gen} points the key at that content. Each write publishes a new generation; the last four stay.</small></div>
        <div class="at-how-layer"><b>Anchor</b><code>${A.esc(x.file)} · ${A.esc(x.subtree)}</code><small>The hash of the code the claim describes, at commit ${A.esc(x.derivedAt)}.</small></div></div>
        <p class="mx-note">${A.num(R().casObjects)} objects in the store: every fact plus the model answer behind it. Export copies the objects (atlas-okf.json); importing replays them through the checks.</p>`],
      ["agents", "Served", inBrief ? "When an agent asks about this unit, this sentence is part of the briefing it gets." : "This unit's briefing ran out of room before this sentence; the agent sees it named and can pull it.", `<div class="at-how-brief" id="how-brief"></div><p class="mx-note">Briefings are built the same way every time: ratified facts first, then pointers to finer units, then hints, in 1,500 characters. Nothing is dropped silently.</p>`],
      ["drift", "Watched", x.drift ? `The code moved: ${A.esc(x.drift.stat)} since it was derived. The anchor no longer hashes the same, so Atlas marks it changed and asks you to decide.` : "Its code hasn't moved since it was derived, so it still holds.", x.drift ? `<div class="at-how-card">${x.drift.commits.map(([sha, subj]) => `<div class="at-commit"><code class="at-sha">${A.esc(sha)}</code><span>${A.esc(subj)}</span></div>`).join("")}${blast ? `<small>${plural(blast, "file")} import this file, so their facts sit in its blast radius.</small>` : ""}</div>${A.btn("Review it", "go", { value: `#/review?tab=changed&fact=${x.key}`, primary: true })}` : `<div class="at-how-card"><span class="at-state good">${A.icon("checkc")}Up to date</span></div>`],
    ]
    const href = (patch) => `#/how?${new URLSearchParams({ fact: x.key, step, ...patch })}`
    const [ic, title, line, body] = stops[step]
    return {
      crumbs: [["Atlas", "#/overview"], ["How it works"]],
      html: `<div class="at-page wide">
      <section class="at-gen-hero"><div><div class="mx-eyebrow">How it works</div><h1>Follow one fact</h1><p>A real sentence from this store, from the moment Genesis proposed it to the moment its code moved.</p></div>
        <div class="heading-actions">${A.btn("Another fact", "go", { value: `#/how?fact=${M().live()[Math.floor((x.key.charCodeAt(3) * 7) % M().live().length)].key}`, icon: "refresh" })}</div></section>
      <div class="at-how-fact"><span>${A.icon("fact")}</span><p>“${A.esc(x.claim)}”</p><code class="at-mono">${A.esc(x.file)}</code></div>
      <ol class="at-how-track">${stops.map(([sic, t], i) => `<li><a class="${i === step ? "on" : i < step ? "done" : ""}" href="${href({ step: i })}"><span>${A.icon(sic)}</span><b>${t}</b></a></li>`).join("")}</ol>
      <section class="at-how-stop"><h2>${A.icon(ic)}${title}</h2><p class="at-lead">${line}</p>${body}
        <div class="at-how-nav">${step ? A.btn("Back", "go", { value: href({ step: step - 1 }), icon: "back" }) : "<span></span>"}${step < stops.length - 1 ? A.btn(`Next: ${stops[step + 1][1]}`, "go", { value: href({ step: step + 1 }), primary: true, icon: "arrow" }) : A.btn("Open the fact", "open-fact-page", { value: x.key, primary: true })}</div></section>
      </div>`,
      after: () => { const host = document.querySelector("#how-brief"); if (host) A.buildBriefing(host, M().unitOf(x.file), x.key) },
    }
  }

  /* ---------- The briefing, built in front of you (retrieval/src/own.ts order and caps) ---------- */
  A.buildBriefing = (host, path, focus) => {
    const b = M().briefing(path)
    const CAP = 1500
    const queue = [
      ...b.inv.map((x) => ({ x, band: "gov", cost: x.claim.length, ok: true })),
      ...b.gotchas.map((x) => ({ x, band: "gotcha", cost: x.claim.length, ok: true })),
      ...b.pull.filter((x) => M().governing(x)).map((x) => ({ x, band: "gov", cost: x.claim.length, ok: false })),
      ...b.pointers.map((p) => ({ p, band: "ptr", cost: p.name.length, ok: true })),
      ...b.adv.map((x) => ({ x, band: "adv", cost: x.claim.length, ok: true })),
      ...b.pull.filter((x) => !M().governing(x)).map((x) => ({ x, band: "adv", cost: x.claim.length, ok: false })),
    ]
    host.innerHTML = `<div class="at-brief"><div class="at-brief-bar"><div class="at-brief-fill"></div></div>
      <div class="at-brief-scale"><span>0</span><span id="brief-used">0 of 1,500 characters</span><span>1,500</span></div>
      <div class="at-brief-legend"><span><i class="gov"></i>Ratified</span><span><i class="gotcha"></i>Watch out</span><span><i class="ptr"></i>Go deeper</span><span><i class="adv"></i>Hints, at most 750</span><span><i class="out"></i>Left out, still named</span></div>
      <div class="at-brief-lanes"><div class="at-brief-in"><small>Sent</small></div><div class="at-brief-out"><small>Left out for space</small></div></div>
      ${A.btn("Build again", "rebuild-brief", { icon: "refresh", value: `${path}|${focus ?? ""}` })}</div>`
    const fill = host.querySelector(".at-brief-fill")
    const sent = host.querySelector(".at-brief-in")
    const out = host.querySelector(".at-brief-out")
    let used = 0
    queue.forEach((it, i) => setTimeout(() => {
      if (!host.isConnected) return
      const label = it.p ? `own_${A.esc(it.p.name.replace(/^own_/, ""))}` : A.esc(it.x.claim.slice(0, 64))
      const chip = `<span class="at-brief-chip ${it.band} ${it.x?.key === focus ? "focus" : ""}" ${it.x ? `data-action="open-fact-page" data-value="${it.x.key}"` : ""}>${label}${it.x && it.x.claim.length > 64 ? "…" : ""}<small>${it.cost}</small></span>`
      if (it.ok) {
        const seg = document.createElement("i")
        seg.className = it.band
        seg.style.width = `${(it.cost / CAP) * 100}%`
        fill.append(seg)
        used += it.cost
        host.querySelector("#brief-used").textContent = `${A.num(used)} of 1,500 characters`
        sent.insertAdjacentHTML("beforeend", chip)
      } else out.insertAdjacentHTML("beforeend", chip)
    }, 120 + i * 110))
  }
})(window.Atlas)
