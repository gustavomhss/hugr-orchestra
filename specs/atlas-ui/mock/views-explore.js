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
          <p class="at-hero-git">${A.icon("shield")} Versioned with the code and guarded by CI: a stale Atlas does not merge. <a class="mx-link" href="#/overview" onclick="event.preventDefault();document.getElementById('travel').scrollIntoView({behavior:'smooth'})">How it travels</a> · <a class="mx-link" href="#/overview" onclick="event.preventDefault();document.getElementById('keep').scrollIntoView({behavior:'smooth'})">How it stays in sync</a></p>
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
      ${A.keepSection()}
      ${health.html}
      </div>`,
    }
  }
  // How Atlas travels (modules/atlas/.gitignore): the reviewed config and the append-only logs are committed with the
  // code, the owners live in .orchestra/skills/own, and the store bytes are local state any clone rebuilds.
  A.travelSection = () => `<section class="at-panel at-arch-block at-travel" id="travel"><header class="at-panel-head"><div><h3>${A.icon("branch")}It travels with your repo</h3><small>Atlas lives in git next to the code. A pull request changes it, a merge brings it along, and any machine that clones the repository gets it back.</small></div></header>
    <div class="at-travel-flow">
      <div class="at-travel-col"><div class="at-travel-k good">${A.icon("branch")}Committed, pushed to the remote</div>
        ${[["memory.jsonl", "What every agent saved. Append-only, one line per memory: two branches merge as a union, and duplicates fold by content id."], ["orientation.jsonl", "Where the project stands, identical for every member."], ["policy.json", "Who may write what. Reviewed in pull requests like code."], [".orchestra/skills/own/", "The ownership skills, one SKILL.md per scope, with their coverage list."]].map(([f, d]) => `<div class="at-travel-row"><code>${f}</code><p>${d}</p></div>`).join("")}</div>
      <div class="at-travel-mid"><div class="at-travel-node">${A.icon("branch")}<b>origin</b><small>branch · PR · merge</small></div><div class="at-travel-arrow">${A.icon("arrow")}</div><div class="at-travel-node">${A.icon("download")}<b>any clone</b><small>a teammate, CI, a new laptop</small></div></div>
      <div class="at-travel-col"><div class="at-travel-k">${A.icon("refresh")}Rebuilt on each machine</div>
        ${[["cas/ · projection", "The facts and their versions. Content-addressed, so the same claim gets the same name on every machine."], ["index.scip", "The code index, regenerated from the code at that commit."], ["staging", "Suggestions waiting for review. Genesis mines them again; they are never committed, so nothing half-reviewed leaks into history."]].map(([f, d]) => `<div class="at-travel-row"><code>${f}</code><p>${d}</p></div>`).join("")}</div>
    </div>
    <div class="at-travel-steps">${[["Open a PR", "Memories, policy and ownership skills change in the same diff as the code they describe."], ["Merge", "Logs union line by line; ownership skills whose code changed hold until refreshed."], ["Clone anywhere", "Run Genesis: the index and store come back from the code; memory and ownership skills are already there."]].map(([t, d], i) => `<div><span>${i + 1}</span><b>${t}</b><p>${d}</p></div>`).join("")}</div>
    <p class="mx-note">To move a whole store in one piece, <code>atlas export</code> writes an <code>atlas-okf.json</code> bundle that imports into an empty store, all or nothing. ${A.help("modules/atlas/.gitignore: .atlas/* is ignored except memory.jsonl, orientation.jsonl and policy.json; staging is denied at any depth.")}</p></section>`

  // How Atlas stays free of drift across pull requests. Every fact and every ownership skill is bound to the exact bytes of its
  // code, so a change either refreshes them in the same PR (and CI proves it), or lands and is held until rebuilt.
  A.keepSection = () => {
    const st = { R: ["Runs", "good"], B: ["Built", "blue"], D: ["Designed", ""] }
    const pill = (k) => `<span class="at-own-badge ${st[k][1]}">${st[k][0]}</span>`
    const step = (icon, t, d, k, tone = "") => `<div class="at-keep-step ${tone}"><div class="at-keep-k">${A.icon(icon)}<b>${t}</b>${pill(k)}</div><p>${d}</p></div>`
    const arrow = `<span class="at-keep-arrow">${A.icon("arrow")}</span>`
    return `<section class="at-panel at-arch-block at-travel" id="keep"><header class="at-panel-head"><div><h3>${A.icon("shield")}How Atlas stays free of drift</h3><small>Every fact and every ownership skill is bound to the exact bytes of the code it describes. When that code changes, Atlas is either refreshed in the same pull request, or it stops being served until it is.</small></div></header>
    <div class="at-keep-pin">${A.icon("hash")}<span><b>The anchor.</b> A fact carries the hash of the code under it (<code>path@subtreeHash</code>); an ownership skill carries the git blob of every file it covers. Change one byte and the hash no longer matches. That mismatch is what every step below looks for.</span></div>
    <div class="at-keep-track"><div class="at-keep-label good">${A.icon("checkc")}Refreshed in the pull request</div>
      <div class="at-keep-row">${step("code", "Code changes", "A pull request edits <code>packages/billing</code>.", "R")}${arrow}${step("drift", "Atlas sees it", "Facts on the changed files show as changed in Review › Changed, with the commit that moved them.", "R")}${arrow}${step("fact", "Refresh", "Rewrite or confirm those facts and re-materialize the ownership skill, in the same PR as the code.", "R")}${arrow}${step("shield", "CI proves it", "<code>own-snapshot-guard</code> re-renders every ownership skill and re-hashes its files. Equal bytes: green.", "R", "good")}</div></div>
    <div class="at-keep-track"><div class="at-keep-label warm">${A.icon("drift")}Merged without refreshing</div>
      <div class="at-keep-row">${step("code", "Code merges", "Atlas was not touched, or CI did not run on that PR.", "R")}${arrow}${step("lock", "Held, not served", "Stale facts travel marked stale. The ownership skill no longer matches its files, so Maestro holds instead of handing it to an agent.", "R", "warm")}${arrow}${step("list", "Worklist", "A deterministic list of the skills whose files changed, computed from hashes, no model.", "B")}${arrow}${step("agents", "Rebuild", "A repair pull request refreshes exactly those skills, then the same CI check must pass. New capability · R9.", "D")}</div></div>
    <div class="at-keep-foot">
      <div><b>${A.icon("shield")}CI</b><p>The atlas job in <code>test.yml</code> runs 13 Atlas guards, <code>own-snapshot-guard</code> among them, on epic pull requests and on demand; there, a failing guard blocks the merge. Running it on every pull request is new capability · R10.</p></div>
      <div><b>${A.icon("agents")}Rosie, the maintainer</b>${pill("B")}<p>The team's maintenance seat: documentation freshness, stale claims, orphaned files. Built today for documentation changes; curating Atlas and repo hygiene is her designed scope.</p></div>
    </div>
    <p class="mx-note">Sources: harness/gates/own-snapshot-guard.mjs, .github/workflows/test.yml (Run Atlas guards), specs/hugr-maestro/own-protocol.md (CI freshness path), docs/CONVENTIONS.md, maestro/seats/rosie.ts.</p></section>`
  }

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
    const href = (patch) => `#/explore?${new URLSearchParams(Object.fromEntries(Object.entries({ view, group, sort: q.sort ?? "", ...patch }).filter(([, v]) => v)))}`
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
    const sort = q.sort ?? "facts"
    const sorted = [...units].sort(sort === "changed" ? (a, b) => b.drifted - a.drifted || b.facts - a.facts : sort === "share" ? (a, b) => b.drifted / b.facts - a.drifted / a.facts || b.facts - a.facts : sort === "name" ? (a, b) => short(a.id).localeCompare(short(b.id)) : (a, b) => b.facts - a.facts)
    const sortBar = `<div class="at-sortbar"><span>Sort</span><div class="wf-range">${[["facts", "Most facts"], ["changed", "Most changed"], ["share", "Most drift (%)"], ["name", "Name"]].map(([k, l]) => `<button aria-pressed="${sort === k}" data-action="go" data-value="${href({ sort: k === "facts" ? "" : k })}">${l}</button>`).join("")}</div></div>`
    const body = view === "map" ? `<div class="at-pack" id="explore-pack"></div><div class="at-tm-scale"><span>Area: how much Atlas knows</span><span class="grow"></span><span>a third changed</span><i></i><span>all hold</span></div>` : view === "list" ? sortBar + cards(sorted) : `<div class="at-explore-graph"><div class="at-graph-host tall" id="explore-graph"></div>
        <div class="at-graph-zoom">${A.btn("", "graph-zoom", { icon: "plus", value: "1.25", label: "Zoom in" })}${A.btn("", "graph-zoom", { icon: "minus", value: "0.8", label: "Zoom out" })}${A.btn("", "graph-fit", { icon: "expand", label: "Fit" })}</div>
        <div class="at-graph-legend floating"><span><i class="lg good"></i>holds</span><span><i class="lg warm"></i>code moved</span><span><i class="lg edge"></i>depends on</span><span><i class="lg hot"></i>depends on the selection</span></div>
        <aside class="at-graph-side" id="explore-pick">${q.unit ? pick(q.unit) : pickEmpty}</aside></div>`
    return {
      crumbs: [["Atlas", "#/overview"], ["Explore"]],
      after: () => {
        const pack = document.querySelector("#explore-pack")
        if (pack) return mountPack(pack, units)
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

  // The map: a zoomable circle pack (d3-hierarchy). Units hold folders hold files; area = facts, colour = share still
  // holding. Click a circle to zoom into it, the background to step back out.
  const holdHue = (facts, drifted) => Math.round(32 + Math.max(0, Math.min(1, ((facts - drifted) / facts - 0.66) / 0.34)) * 110)
  const packTree = (units) => {
    const ids = new Set(units.map((u) => u.id))
    const root = { name: "atlas", path: "", children: [] }
    const unitNodes = new Map(units.map((u) => { const n = { name: u.id === "(root)" ? "top-level" : short(u.id), path: u.id, unit: u.id, children: [] }; root.children.push(n); return [u.id, n] }))
    M().live().forEach((x) => {
      const unit = M().unitOf(x.file)
      if (!ids.has(unit)) return
      const rest = unit === "(root)" ? x.file.split("/") : x.file.slice(unit.length + 1).split("/")
      let node = unitNodes.get(unit)
      rest.forEach((part, i) => {
        const path = unit === "(root)" ? rest.slice(0, i + 1).join("/") : `${unit}/${rest.slice(0, i + 1).join("/")}`
        let next = node.children.find((c) => c.name === part)
        if (!next) { next = { name: part, path, children: [], facts: 0, drifted: 0 }; node.children.push(next) }
        node = next
      })
      node.leaf = true
      node.facts++
      if (M().state(x) === "drifted") node.drifted++
    })
    return root
  }
  const mountPack = (host, units) => {
    if (!window.d3?.hierarchy) { host.innerHTML = '<div class="at-band-empty">The map library did not load (offline?).</div>'; return }
    const size = 1000
    const root = window.d3.pack().size([size, size]).padding((d) => (d.depth === 0 ? 14 : d.depth === 1 ? 8 : 3))(
      window.d3.hierarchy(packTree(units)).sum((d) => (d.leaf ? d.facts : 0)).sort((a, b) => b.value - a.value))
    root.each((d) => {
      d.facts = d.leaf ? d.data.facts : d.value
      d.drifted = d.leaf ? d.data.drifted : d.leaves().reduce((n, l) => n + (l.data.drifted ?? 0), 0)
    })
    const nodes = root.descendants().filter((d) => d.depth > 0)
    const fill = (d) => {
      const hue = holdHue(d.facts, d.drifted)
      if (d.data.leaf) return `hsl(${hue} 55% 52%)`
      return d.depth === 1 ? `hsl(${hue} 45% 45% / .16)` : `hsl(${hue} 30% 60% / .08)`
    }
    host.innerHTML = `<svg class="at-pack-svg" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of what Atlas knows">
      <rect class="at-pack-bg" width="${size}" height="${size}" fill="transparent"></rect>
      ${nodes.map((d, i) => `<circle data-i="${i}" class="${d.data.leaf ? "leaf" : `dir d${Math.min(d.depth, 3)}`}" fill="${fill(d)}"><title>${A.esc(d.data.path)} · ${A.num(d.facts)} ${d.facts === 1 ? "fact" : "facts"}${d.drifted ? ` · ${A.num(d.drifted)} changed` : ""}</title></circle>`).join("")}
      ${nodes.map((d, i) => `<text data-i="${i}" class="at-pack-label ${d.data.leaf ? "leaf" : ""}">${A.esc(d.data.name)}</text>`).join("")}
    </svg><aside class="at-pack-side" id="pack-side"></aside>`
    const svg = host.querySelector("svg")
    const circles = [...svg.querySelectorAll("circle")]
    const labels = [...svg.querySelectorAll("text")]
    const side = host.querySelector("#pack-side")
    let focus = root
    let view = [root.x, root.y, root.r * 2]
    const place = (v) => {
      const k = size / v[2]
      nodes.forEach((d, i) => {
        const x = (d.x - v[0]) * k + size / 2, y = (d.y - v[1]) * k + size / 2
        circles[i].setAttribute("cx", x); circles[i].setAttribute("cy", y); circles[i].setAttribute("r", d.r * k)
        labels[i].setAttribute("x", x); labels[i].setAttribute("y", y)
      })
    }
    const showLabels = () => {
      // Children of the focus are named, sized in screen pixels; circles too small on screen stay unnamed.
      const sc = (svg.getBoundingClientRect().width || size) / size
      nodes.forEach((d, i) => {
        const px = d.r * (size / view[2]) * sc
        const on = (d.parent === focus || (focus === root && d.depth === 1)) && px > 16
        labels[i].style.display = on ? "" : "none"
        labels[i].style.fontSize = `${Math.max(10.5, Math.min(18, px / 3.2)) / sc}px`
        labels[i].style.strokeWidth = `${3 / sc}px`
      })
    }
    const crumbs = (d) => d.ancestors().reverse().slice(1)
    const info = (d) => {
      const hold = d.facts ? Math.round(((d.facts - d.drifted) / d.facts) * 100) : 100
      side.innerHTML = `<div class="at-pack-crumbs"><button data-pack="root">All</button>${crumbs(d).map((c) => `<span>/</span><button data-pack="${nodes.indexOf(c)}">${A.esc(c.data.name)}</button>`).join("")}</div>
        <strong>${A.esc(d === root ? "Everything Atlas knows" : d.data.path)}</strong>
        <div class="at-pack-stats"><div><b>${A.num(d.facts)}</b><small>facts</small></div><div><b class="${d.drifted ? "warm" : ""}">${A.num(d.drifted)}</b><small>changed</small></div><div><b>${hold}%</b><small>still hold</small></div></div>
        ${d === root ? '<p class="mx-note">Each circle is a unit; inside are its folders and files. Bigger means Atlas knows more there; amber means the code moved under it. Click to zoom in.</p>' : A.btn(d.data.leaf ? "Open this file" : "Open", "go", { value: unitHref(d.data.path), primary: true })}`
      side.querySelectorAll("[data-pack]").forEach((b) => b.addEventListener("click", () => zoom(b.dataset.pack === "root" ? root : nodes[+b.dataset.pack])))
    }
    const zoom = (d) => {
      focus = d
      const from = view, to = [d.x, d.y, d.r * 2 + (d === root ? 0 : d.r * 0.25)]
      const t0 = performance.now()
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 650), e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
        view = from.map((v, i) => v + (to[i] - v) * e)
        place(view)
        if (t < 1) requestAnimationFrame(step)
        else showLabels()
      }
      labels.forEach((l) => (l.style.display = "none"))
      requestAnimationFrame(step)
      circles.forEach((c, i) => c.classList.toggle("in", nodes[i] === d || nodes[i].ancestors().includes(d)))
      info(d)
    }
    svg.addEventListener("click", (ev) => {
      const i = ev.target.closest("circle")?.dataset.i
      if (i === undefined) return zoom(focus.parent ?? root)
      const d = nodes[+i]
      // A leaf opens its file only once you are already looking at its folder.
      if (d.data.leaf && focus === d.parent) return A.go(unitHref(d.data.path))
      zoom(d.data.leaf ? d.parent : d)
    })
    place(view); showLabels(); info(root)
  }
  const cards = (units) => {
    const owner = (u) => { const t = M().territoryOf(u.id); return t ? `${A.esc(t.name)} · ${A.esc(names[t.owner] ?? t.owner)}` : "No territory" }
    return `<div class="at-ucards">${units.map((u) => `<a class="at-ucard" href="${unitHref(u.id)}"><span class="at-ucard-top"><strong>${A.esc(u.id === "(root)" ? "Top-level files" : short(u.id))}</strong><span class="at-sdot ${u.drifted ? "warm" : "good"}"></span></span>
      <span class="at-ucard-num"><b>${A.num(u.facts)}</b> ${u.facts === 1 ? "fact" : "facts"}${u.drifted ? ` · <span class="warm">${u.drifted} changed</span>` : ""}</span><small>${owner(u)}</small></a>`).join("")}</div>`
  }
  A.views.knowledge = (state) => A.views.explore({ ...state, query: { ...state.query, view: state.query.view ?? "list" } })

  /* ---------- Genesis: how Atlas learns a repository ---------- */
  // Genesis is the `atlas mine` command (cli/src/map.ts:133): it proposes claims into staging and never writes knowledge;
  // `atlas promote` is the separate, governed step that turns staged rows into facts. Stages follow the code in order.
  const stages = () => {
    const files = M().health().index.configured.reduce((n, c) => n + c.files, 0)
    const total = M().facts.length + R().candidates.length
    return [
      { id: "scan", icon: "code", title: "Read the repository", n: A.num(files), unit: "files in the index", how: "det",
        what: "Genesis walks the tree and loads <code>.atlas/index.scip</code>, the code index an outside indexer (scip-typescript) produced. From them it builds three axes: where things are, which territory they sit in, and what depends on what.",
        facts: ["No index means no dependency edges: the dependency and count kinds then have nothing to prove against.", "Deterministic: the same commit gives the same skeleton."],
        refs: "index/src/types.ts:114 · adapter-io/src/skeleton-source.ts:129" },
      { id: "rank", icon: "graph", title: "Choose the sites", n: "≤ 200", unit: "sites per kind", how: "det",
        what: "Sites come from git first: files changed at least twice, or changed together at least twice. PageRank over the dependency graph then puts them in order, and for the provable kinds the sites an oracle can check go first.",
        facts: ["Thin history (under two commits, a shallow clone) falls back to the most-connected code instead.", "No model call yet: choosing costs nothing.", "Each kind stops at its ceiling: 200 sites, or ATLAS_MINE_BUDGET."],
        refs: "adapter-io/src/git-history.ts:206 · genesis/src/rank.ts:291,342,396 · run-controller.ts:95" },
      { id: "propose", icon: "sparkle", title: "Ask the model", n: A.num(total), unit: "claims proposed", how: "llm",
        what: "One model call per site, no retry. What the model is asked depends on the kind: a free sentence for hints, a name picked from a list the index built for dependencies, counts and definitions, a slot for the semantic pass.",
        facts: ["Eight calls in flight when the model comes from model.json; otherwise one at a time.", "With no model configured every site abstains and nothing is proposed.", "The model's whole answer is kept with the claim it produced."],
        refs: "adapter-io/src/llm.ts:345 · genesis/src/drive.ts:32 · cli/src/mine.ts:444" },
      { id: "check", icon: "shield", title: "Check without the model", n: A.num([...M().facts, ...R().candidates].filter((x) => x.seal === "proven").length), unit: "proven by an oracle", how: "det",
        what: "Every answer is checked by code: valid text in the expected shape, a name that really exists, and a claim that still re-derives against today's code. For dependencies, counts and definitions an oracle then tries to prove it from the index.",
        facts: ["Proven: the claim is sealed with its witness, and its sentence is written from the witness, not by the model.", "The oracle can't prove it: the claim still goes on, unsealed, as a hint.", "An answer that fails a check is dropped, with the reason named in the run."],
        refs: "adapter-io/src/llm.ts:456 · genesis/src/admit-harness.ts:330-403,505 · cli/src/mine-gate.ts:181" },
      { id: "stage", icon: "inbox", title: "Stage as suggestions", n: A.num(total), unit: "staged as T2 hints", how: "det",
        what: "Survivors are written to <code>.atlas/staging.N.json</code>, secrets scrubbed, the model's answer stored next to them. Every row is a T2 hint in the <code>atlas:mined</code> group. Agents see none of it.",
        facts: ["A re-run never rewrites a row already staged: the first writer wins.", "The run accounts for every planned site in its ledger."],
        refs: "cli/src/mine-decide.ts:107-268 · genesis/src/coverage.ts:166" },
      { id: "accept", icon: "check", title: "Promote", n: A.num(M().facts.length), unit: `promoted · ${A.num(R().candidates.length)} waiting`, how: "you",
        what: "<code>atlas promote</code> takes the whole staging at once and sends every row through the same write door as any edit: still true against today's code, you are a writer of <code>atlas:mined</code> in policy.json, no conflict with what is stored, and a ratify token.",
        facts: ["Promoted facts stay T2: agents get them in the hints band. Rules (T1, T0) come only from ratifying later.", "Rows whose code moved since mining are refused.", "Staging is not emptied afterwards."],
        refs: "adapter-io/src/governed-promote.ts:121-170 · knowledge/src/bands.ts:41" },
    ]
  }
  // The five kinds (arms). Defaults run hints, dependencies, counts one after another (mine-proposer.ts:140).
  const KINDS = [
    { id: "advisory", name: "Hints", on: true, model: "Writes one free sentence about the site.", check: "Must re-derive against the code.", lands: "Hint (T2)" },
    { id: "dependency", name: "Dependencies", on: true, model: "Picks which symbol the site depends on, from a list.", check: "An oracle proves the edge from the index.", lands: "Proven, or a hint if unproven" },
    { id: "count", name: "Counts", on: true, model: "Picks what to count. The number comes from the index.", check: "An oracle recounts it.", lands: "Proven, or a hint if unproven" },
    { id: "definition", name: "Definitions", on: false, model: "Picks the symbol a name defines.", check: "An oracle finds the definition.", lands: "Proven, or a hint if unproven" },
    { id: "semantic", name: "Semantic", on: false, model: "Files the claim under one of eight slots (invariant, contract, gotcha…).", check: "Must re-derive; keeps its derivation.", lands: "Justified hint (T2)" },
  ]
  const knobs = {
    kinds: ["Kinds", "One kind, or the default three run one after another.", "ATLAS_MINE_SLOT", [["Default three", ""], ["Hints", "advisory"], ["Dependencies", "dependency"], ["Counts", "count"], ["Definitions", "definition"], ["Semantic", "semantic"]]],
    budget: ["Sites per kind", "The ceiling for each kind. Default: up to 200.", "ATLAS_MINE_BUDGET", null],
    enrich: ["Show nearby code", "Also show the model the other code in the same file. Hints only.", "ATLAS_ENRICH", [["Off", ""], ["On", "1"]]],
    proposals: ["Proposals from", "Use claims an agent already wrote, a JSON file of site → claim, instead of calling the model. Runs hints only, one at a time, Kinds ignored; Genesis still checks every claim.", "ATLAS_TASK_PROPOSALS", [["The model", ""], ["An agent's file", "proposals.json"]]],
    frontier: ["Symbols in the fallback", "Only matters when git history is too thin: the structural fallback then looks at symbols, not only files. With a normal history it changes nothing.", "ATLAS_FRONTIER", [["Files", ""], ["Symbols", "symbol"]]],
    model: ["Model", "The command run for each site (<code>roles.propose</code>, 60 s timeout). Read from <code>~/.config/atlas/model.json</code> or <code>$XDG_CONFIG_HOME</code>; <code>ATLAS_MODEL_CONFIG</code> points elsewhere. A file inside the repository is refused.", "ATLAS_MODEL_CONFIG", null],
  }

  A.views.genesis = (state) => {
    const st = stages()
    const at = st.find((x) => x.id === state.query.stage) ?? st[2]
    const conf = Object.fromEntries(Object.keys(knobs).map((k) => [k, state.query[`k-${k}`] ?? ""]))
    const env = Object.entries(knobs).filter(([k]) => conf[k]).map(([k, [, , v]]) => `${v}=${conf[k]}`).join(" ")
    const sample = M().live().find((x) => x.why && R().reasoning[x.why] && /refut/i.test(R().reasoning[x.why])) ?? M().live().find((x) => x.why)
    const reason = sample ? R().reasoning[sample.why] : ""
    const refuted = Object.values(R().reasoning).filter((t) => /refut/i.test(t)).length
    const all = [...M().facts, ...R().candidates]
    const proven = all.filter((x) => x.seal === "proven").length
    const justified = all.filter((x) => x.seal === "justified").length
    const qs = (patch) => `#/genesis?${new URLSearchParams(Object.fromEntries(Object.entries({ stage: at.id, ...Object.fromEntries(Object.entries(conf).map(([k, v]) => [`k-${k}`, v])), ...patch }).filter(([, v]) => v)))}`
    const how = { det: ["Code, no model", "good"], llm: ["Model", "blue"], you: ["You", "warm"] }
    const cmd = `${env ? `${env} ` : ""}atlas mine .`
    return {
      crumbs: [["Atlas", "#/overview"], ["Genesis"]],
      html: `<div class="at-page wide">
      <section class="at-gen-hero"><div><div class="mx-eyebrow">Engine</div><h1>Genesis</h1><p>How Atlas learns a repository. <code>atlas mine</code> picks the places worth knowing, asks a model about each one, checks every answer with code, and stages what survives as suggestions. It never writes knowledge: <code>atlas promote</code> is the step that does, through the same door as any edit.</p></div>
        <div class="heading-actions">${A.btn("Run atlas mine…", "mine", { primary: true, icon: "play", write: true })}</div></section>

      <ol class="at-pipe">${st.map((x, i) => `<li><a class="at-pipe-step ${x.id === at.id ? "on" : ""} ${x.how}" href="${qs({ stage: x.id })}"><span class="at-pipe-ic">${A.icon(x.icon)}</span><span class="at-pipe-n">${x.n}</span><span class="at-pipe-u">${x.unit}</span><strong>${i + 1}. ${x.title}</strong><span class="at-pipe-how ${how[x.how][1]}">${how[x.how][0]}</span></a></li>`).join("")}</ol>
      <div class="at-gen-split"><span><code>atlas mine</code> proposes</span><span><code>atlas promote</code> writes</span></div>

      <section class="at-gen-detail">
        <div><h2>${A.icon(at.icon)}${at.title}</h2><p class="at-lead">${at.what}</p><ul class="at-gen-facts">${at.facts.map((f) => `<li>${A.icon("checkc")}${A.esc(f)}</li>`).join("")}</ul>
          ${A.tech([["Code", `<code>${A.esc(at.refs)}</code>`]])}</div>
        ${at.id === "propose" ? `<div class="at-gen-sample"><div class="at-gen-sample-k">${A.icon("fact")}A real claim, and the model's answer behind it</div><p class="at-gen-claim">“${A.esc(sample?.claim ?? "")}”</p><code class="at-mono">${A.esc(sample?.file ?? "")}</code>
          <div class="at-reasoning short at-gen-reason">${A.esc(reason.slice(0, 900)).replace(/(Refutation pass:?|refut\w*)/i, "<mark>$1</mark>")}${reason.length > 900 ? "…" : ""}</div>
          <p class="mx-note">The prompt asks the model to argue against its own claim; ${A.num(refuted)} of ${A.num(Object.keys(R().reasoning).length)} stored answers show it did. Code doesn't check this: the checks in step 4 do the real filtering.</p>${sample ? A.btn("Open this fact", "open-fact-page", { value: sample.key }) : ""}</div>`
        : at.id === "rank" ? `<div class="at-gen-sample"><div class="at-gen-sample-k">${A.icon("graph")}How a site is chosen</div><ol class="at-gen-choose">
            <li><b>Git history healthy?</b><span>Yes: start from files that changed twice or more, or changed together.</span><span class="muted">No: start from the most-connected code (and its symbols, with ATLAS_FRONTIER=symbol).</span></li>
            <li><b>Order them</b><span>PageRank over the dependency graph, damping 0.85, 64 iterations.</span></li>
            <li><b>Provable first</b><span>For dependencies, counts and definitions, sites an oracle can check move up.</span></li>
            <li><b>Stop at the ceiling</b><span>200 sites per kind, or ATLAS_MINE_BUDGET.</span></li></ol></div>`
        : at.id === "check" ? `<div class="at-gen-sample"><div class="at-gen-sample-k">${A.icon("shield")}Three outcomes</div><div class="at-gen-outcomes">
            <div class="good"><b>Proven</b><p>An oracle derived it from the index. Sealed with its witness; the sentence is written from the witness.</p><small>${A.num(proven)} in this store</small></div>
            <div><b>Hint</b><p>Re-derives against the code, but nothing proves it. Staged unsealed.</p><small>${A.num(all.length - proven)} in this store</small></div>
            <div class="warm"><b>Dropped</b><p>Bad shape, a name that doesn't exist, or a claim that no longer matches. Named in the run report.</p><small>not kept</small></div></div></div>`
        : at.id === "accept" ? `<div class="at-gen-sample"><div class="at-gen-sample-k">${A.icon("check")}From suggestion to fact</div>${A.bar([["good", M().facts.length], ["blue", R().candidates.length]])}<div class="at-coverage-legend"><span>Promoted <b>${A.num(M().facts.length)}</b></span><span>Waiting <b>${A.num(R().candidates.length)}</b></span></div><p class="mx-note">Promote runs on everything staged; picking rows one by one is new capability · R2.</p>${A.btn("Review the waiting ones", "go", { value: "#/review?tab=mined" })}</div>`
        : `<div class="at-gen-sample"><div class="at-gen-sample-k">${A.icon("info")}In this store</div><p class="mx-note">${at.id === "scan" ? `${A.num(Object.keys(R().children ?? {}).length)} folders, ${A.num(R().dependentCount ?? 0)} dependency links from the index.` : `${A.num(all.length)} rows staged by past runs; ${A.num(R().candidates.length)} still waiting to be promoted.`}</p></div>`}
      </section>

      <section class="at-panel at-arch-block"><header class="at-panel-head"><div><h3>${A.icon("stack")}Five kinds of claim</h3><small>Each kind is its own pass over the sites. The model's job shrinks as the kind gets more provable.</small></div></header>
        <div class="at-kinds"><div class="at-kinds-row head"><span>Kind</span><span>The model</span><span>Code checks</span><span>Lands as</span></div>
        ${KINDS.map((k) => `<div class="at-kinds-row"><span><b>${k.name}</b> ${k.on ? '<span class="at-own-badge good">default</span>' : '<span class="at-own-badge">opt-in</span>'}<code>${k.id}</code></span><span>${k.model}</span><span>${k.check}</span><span>${k.lands}</span></div>`).join("")}</div>
        <p class="mx-note">In this store: ${A.num(all.length)} claims staged, ${A.num(proven)} proven by an oracle, ${A.num(justified)} from the semantic pass, the rest hints. Claims about relations, negations and transitions exist in the write door, but mining can't produce them yet.</p></section>

      <section class="at-panel at-gen-config"><header class="at-panel-head"><div><h3>${A.icon("settings")}Configure the next run</h3><small>Environment variables for <code>atlas mine</code>. Atlas saves none of this.</small></div></header>
        <div class="at-knobs">${Object.entries(knobs).map(([k, [label, help, v, opts]]) => `<div class="at-knob" id="knob-${k}"><div><strong>${label}</strong><small>${help}</small><code class="at-knob-var">${v}</code></div>
          ${opts ? `<div class="wf-range">${opts.map(([l, val]) => `<button aria-pressed="${conf[k] === val}" data-action="go" data-value="${qs({ [`k-${k}`]: val })}">${l}</button>`).join("")}</div>` : k === "budget" ? `<input class="at-knob-input" type="number" min="1" placeholder="200" value="${A.esc(conf.budget)}" data-knob="budget">` : `<code class="at-mono">model.json · roles.propose</code>`}</div>`).join("")}</div>
        <div class="at-cmd"><span>Mine</span><code>${A.esc(cmd)}</code>${A.btn("", "copy", { icon: "copy", value: cmd, label: "Copy command" })}</div>
        <div class="at-cmd"><span>Promote</span><code>ATLAS_RATIFY_TOKEN=… atlas promote</code>${A.btn("", "copy", { icon: "copy", value: "ATLAS_RATIFY_TOKEN=… atlas promote", label: "Copy command" })}</div>
        ${A.tech([["Path", "<code>atlas mine</code> always mines the current directory at HEAD; the path argument is required but ignored"], ["Prints", "<code>genesis: seeded N</code> · <code>cost: llmCalls · budgetSpent</code> · <code>coverage CLOSES — …</code> · one <code>site:</code> line per site"], ["Cost cap", "accepted in model.json, not enforced"], ["Ratify token", "any non-empty string commits a hint or rule; <code>billy</code> is needed for core"]])}</section>

      <section class="at-panel at-arch-block"><header class="at-panel-head"><div><h3>${A.icon("info")}Built but not reachable from the command</h3><small>Code exists in the library; no command or flag gets to it today.</small></div></header>
        <div class="at-gen-gaps">${[["Mine one folder", "the scope option is ignored"], ["Resume a stopped run", "kept in memory only"], ["Mine only what changed", "always reports no change"], ["Deepen a productive site", "loops are switched off"], ["Synthesized checks and type oracles", "placeholders that always decline"], ["Relation, negation, transition claims", "parsers never emit them"]].map(([t, d]) => `<div><b>${t}</b><small>${d}</small></div>`).join("")}</div></section>
      </div>`,
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
