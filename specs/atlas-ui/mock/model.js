// The read model the screens use, derived from the real store in data-real.js. It mirrors what the Atlas
// computes (bands, caps, pull-reachable, dependents, drift) so every number on screen comes from the data.
;(function (A) {
  const R = A.real
  const OWN_ADVISORY_CAP = 750 // tokens (retrieval/src/own.ts)
  const EDGE_CAP = 8
  const FINER_CAP = 16
  const tokens = (text) => Math.ceil(text.length / 4) + 6

  const state = (x) => (x.retired ? "retired" : x.drift && !x.regrounded ? "drifted" : "fresh")
  const facts = R.facts.map((x) => ({ ...x, kind: "fact" }))
  const candidates = R.candidates.map((x) => ({ ...x, kind: "candidate" }))
  const byKey = Object.fromEntries([...facts, ...candidates].map((x) => [x.key, x]))
  const live = () => [...facts, ...candidates.filter((x) => x.promotedNow)].filter((x) => !x.retired)
  const governing = (x) => x.tier === "T0" || x.tier === "T1"

  // Areas: the package, doc or harness folder a file sits in (the spatial axis, one level down).
  const areaOf = (file) => {
    const parts = file.split("/")
    return ["packages", "docs", "harness"].includes(parts[0]) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts.length > 1 ? parts[0] : "(root)"
  }
  const areas = () => {
    const map = new Map()
    for (const x of live()) {
      const id = areaOf(x.file)
      const a = map.get(id) ?? { id, facts: 0, drifted: 0, governing: 0, files: new Set() }
      a.facts++
      if (state(x) === "drifted") a.drifted++
      if (governing(x)) a.governing++
      a.files.add(x.file)
      map.set(id, a)
    }
    return [...map.values()].sort((a, b) => b.facts - a.facts)
  }

  // The spatial tree: every directory and file that has knowledge or candidates under it.
  const tree = () => {
    const root = { path: "", name: "atlas", children: new Map(), facts: 0, drifted: 0, candidates: 0, file: false }
    const add = (x, field) => {
      const parts = x.file.split("/")
      let node = root
      node[field]++
      if (field === "facts" && state(x) === "drifted") node.drifted++
      parts.forEach((part, i) => {
        const path = parts.slice(0, i + 1).join("/")
        if (!node.children.has(part)) node.children.set(part, { path, name: part, children: new Map(), facts: 0, drifted: 0, candidates: 0, file: i === parts.length - 1 })
        node = node.children.get(part)
        node[field]++
        if (field === "facts" && state(x) === "drifted") node.drifted++
      })
    }
    live().forEach((x) => add(x, "facts"))
    candidates.filter((x) => !x.promotedNow && !x.discarded).forEach((x) => add(x, "candidates"))
    return root
  }
  const findNode = (path) => {
    let node = tree()
    if (!path) return node
    for (const part of path.split("/")) {
      node = node.children.get(part)
      if (!node) return null
    }
    return node
  }
  const under = (path) => (x) => !path || x.file === path || x.file.startsWith(`${path}/`)

  // The scope briefing an agent receives on entering a path (`atlas own`): bands kept apart, an advisory
  // sub-cap, what did not fit named as pull-reachable, dependents capped, finer scopes capped.
  const briefing = (path) => {
    const here = live().filter(under(path))
    const gov = here.filter(governing)
    const adv = here.filter((x) => !governing(x)).sort((a, b) => (state(a) === state(b) ? a.file.localeCompare(b.file) : state(a) === "fresh" ? -1 : 1))
    const fit = []
    const pull = []
    let used = 0
    for (const x of adv) {
      const t = tokens(x.claim)
      if (used + t <= OWN_ADVISORY_CAP) { fit.push(x); used += t } else pull.push(x)
    }
    const node = findNode(path)
    const finer = node ? [...node.children.values()].sort((a, b) => b.facts - a.facts) : []
    const deps = dependents(path)
    return { here, gov, adv: fit, pull, used, cap: OWN_ADVISORY_CAP, finer: finer.slice(0, FINER_CAP), finerTotal: finer.length, deps: deps.slice(0, EDGE_CAP), depsTotal: deps.length }
  }

  // Who depends on this scope: files outside it importing files inside it (stand-in for the SCIP axis).
  const dependents = (path) => {
    const inside = under(path)
    const out = new Set()
    Object.entries(R.dependents).forEach(([target, users]) => {
      if (!inside({ file: target })) return
      users.filter((u) => !inside({ file: u })).forEach((u) => out.add(u))
    })
    return [...out].sort()
  }

  const stats = () => {
    const l = live()
    return {
      facts: l.length,
      governing: l.filter(governing).length,
      advisory: l.filter((x) => !governing(x)).length,
      fresh: l.filter((x) => state(x) === "fresh").length,
      drifted: l.filter((x) => state(x) === "drifted").length,
      candidates: candidates.filter((x) => !x.promotedNow && !x.discarded).length,
      toRatify: 0,
      files: new Set(l.map((x) => x.file)).size,
    }
  }
  const curationCount = () => stats().candidates + stats().drifted

  // Commits since the build that touched anchored files, newest first, with the facts they drifted.
  const codeChanges = () => {
    const map = new Map()
    facts.filter((x) => x.drift).forEach((x) => x.drift.commits.forEach(([sha, subject]) => {
      const c = map.get(sha) ?? { sha, subject, facts: [] }
      c.facts.push(x)
      map.set(sha, c)
    }))
    return [...map.values()].sort((a, b) => b.facts.length - a.facts.length)
  }

  const memory = {
    backend: {
      bound: true,
      tasks: [
        { taskId: "T-LIVE-1", attempted: ["Phase 1: added decrement() to Counter in counter.ts — lowers value by 1, clamped at 0 via Math.max(0, this.value - 1), returns the new value."], failedWith: [], stoppedAt: "Phase 1 done; phase 2 (reset() setting value to 0 and returning 0) not started, deferred to the later phase per the packet.", lesson: "Stop exactly at the packet's phase boundary and record the stopping point in the checkpoint so the resume continues at the right scope; do not implement the next phase early.", ref: "counter.ts", source: "specs/backend-specialist/evidence/continuity-live-2026-10-10/attempt-A/memory.jsonl" },
      ],
      prs: [],
      rules: [],
    },
    jimmy: { bound: true, tasks: [], prs: [], rules: [] },
    archie: { bound: true, tasks: [], prs: [], rules: [] },
    maestro: { bound: false, tasks: [], prs: [], rules: [], logbook: [] },
  }
  const awareness = [
    { facet: "mission", state: "UN-SEEDED", source: "No source wired yet" },
    { facet: "constitution", state: "UN-SEEDED", source: "Built from T0 facts; there are none yet" },
    { facet: "terrain", state: "UN-SEEDED", source: "Built from territories; none declared" },
    { facet: "ontology", state: "UN-SEEDED", source: "Built from definition facts; none yet" },
    { facet: "taste", state: "seeded", source: "CONVENTIONS.md", text: "A claim carries its derivation, or it does not ship. Refusing beats guessing. A gate must be able to fail. Mutation-probe anything load-bearing. One file, one seam." },
  ]

  A.m = { R, facts, candidates, byKey, live, state, governing, areaOf, areas, tree, findNode, under, briefing, dependents, stats, curationCount, codeChanges, memory, awareness, tokens }
})(window.Atlas)
