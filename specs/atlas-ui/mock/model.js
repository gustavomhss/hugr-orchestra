// The read model the screens use, derived from the real store in data-real.js. It mirrors what the Atlas
// computes (bands, caps, pull-reachable, dependents, drift) so every number on screen comes from the data.
;(function (A) {
  const R = A.real
  // retrieval/src/own.ts: the whole briefing is capped at 1500 CHARACTERS of claim text; the advisory band gets at
  // most half of it and is paid last; dependents are capped at 8 facts, finer scopes at 16.
  const OWN_CAP = 1500
  const OWN_ADVISORY_CAP = OWN_CAP / 2
  const EDGE_CAP = 8
  const FINER_CAP = 16
  const tokens = (text) => text.length

  const state = (x) => (x.retired ? "retired" : x.drift && !x.regrounded ? "drifted" : "fresh")
  const isGotcha = (x) => x.slot === "gotcha" || x.slot === "rationale"
  const facts = R.facts.map((x) => ({ ...x, kind: "fact" }))
  const candidates = R.candidates.map((x) => ({ ...x, kind: "candidate" }))
  const byKey = Object.fromEntries([...facts, ...candidates].map((x) => [x.key, x]))
  // Retire tags a fact SUPERSEDED through emit, but no read path filters on it, so it stays served (REVIEW A5).
  const live = () => [...facts, ...candidates.filter((x) => x.promotedNow)]
  const governing = (x) => x.tier === "T0" || x.tier === "T1"

  // Own units: the grain Atlas serves knowledge at (`own_<unit>`, level crate | module | service | feature,
  // retrieval/src/own-snapshot.ts). In this TypeScript repo a unit is a package; docs and harness folders
  // carry mined facts too, so they are units of their own, and top-level files share one root unit.
  const unitOf = (file) => {
    const parts = file.split("/")
    return ["packages", "docs", "harness"].includes(parts[0]) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : "(root)"
  }
  const unitGroup = (id) => (id.startsWith("packages/") ? "code" : id.startsWith("docs/") ? "docs" : id.startsWith("harness/") ? "harness" : "root")
  // The closed predicate-slot vocabulary (knowledge/src/types.ts, 13 members), grouped for reading.
  const SLOT_GROUPS = [
    ["Contract", "the interface and what it promises", ["contract", "precondition", "postcondition", "sideeffect", "ownership"]],
    ["Property", "what must always hold", ["invariant", "perf-bound", "security-property", "count"]],
    ["Guidance", "what to know before touching it", ["gotcha", "rationale"]],
    ["Structure", "how it relates and what words mean", ["dependency", "definition"]],
  ]
  const SLOT_MEANING = { invariant: "a property that must always hold", contract: "the interface / signature agreement", precondition: "what must hold on entry", postcondition: "what is guaranteed on exit", sideeffect: "observable effects (IO / mutation)", ownership: "owner / lifetime / concurrency ownership", "perf-bound": "complexity / latency / allocation bound", "security-property": "authz / crypto / taint property", gotcha: "a non-obvious pitfall / footgun", rationale: "why it is built this way", dependency: "a required relationship / ordering", count: "a witnessed lower-bound count over a structural set", definition: "a term / ontology definition" }
  const units = () => {
    const map = new Map()
    for (const x of live()) {
      const id = unitOf(x.file)
      const u = map.get(id) ?? { id, group: unitGroup(id), level: "module", facts: 0, drifted: 0, governing: 0, unclassified: 0, files: new Set() }
      u.facts++
      if (state(x) === "drifted") u.drifted++
      if (governing(x)) u.governing++
      if (!x.slot) u.unclassified++
      u.files.add(x.file)
      map.set(id, u)
    }
    return [...map.values()].sort((a, b) => b.facts - a.facts)
  }
  // Territories (contracts/src/territory.ts): name, owner, tier, globs. A unit belongs to the first whose glob covers it.
  const territories = () => R.territories ?? []
  const territoryOf = (unitId) => territories().find((t) => t.globs.some((g) => g === `${unitId}/**` || (g.endsWith("/**") && unitId.startsWith(g.slice(0, -3)))))
  const areaOf = unitOf
  const areas = units

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
    const byKey = (a, b) => (a.tier === b.tier ? a.key.localeCompare(b.key) : a.tier.localeCompare(b.tier))
    const inv = here.filter((x) => governing(x) && !isGotcha(x)).sort(byKey)
    const gotchas = here.filter((x) => governing(x) && isGotcha(x)).sort(byKey)
    const sent = []
    const pull = []
    let used = 0
    // Governing rows and gotchas are paid first; whatever does not fit is named, never dropped silently.
    for (const x of [...inv, ...gotchas]) {
      if (used + x.claim.length <= OWN_CAP) { sent.push(x); used += x.claim.length } else pull.push(x)
    }
    // The advisory band is paid last, under its own sub-cap, and stops at the first row that does not fit.
    const advBudget = Math.min(OWN_ADVISORY_CAP, OWN_CAP - used)
    const adv = []
    let advUsed = 0
    let stopped = false
    for (const x of here.filter((y) => !governing(y)).sort(byKey)) {
      if (!stopped && advUsed + x.claim.length <= advBudget) { adv.push(x); advUsed += x.claim.length } else { stopped = true; pull.push(x) }
    }
    const node = findNode(path)
    const finer = node ? [...node.children.values()].sort((a, b) => b.facts - a.facts) : []
    const depFiles = dependents(path)
    const depFacts = live().filter((x) => depFiles.includes(x.file)).sort(byKey)
    return { here, inv: inv.filter((x) => sent.includes(x)), gotchas: gotchas.filter((x) => sent.includes(x)), gov: inv.concat(gotchas).filter((x) => sent.includes(x)), adv, pull, used: used + advUsed, advUsed, cap: OWN_CAP, advCap: OWN_ADVISORY_CAP,
      finer: finer.slice(0, FINER_CAP), finerTotal: finer.length, depFiles, depFacts: depFacts.slice(0, EDGE_CAP), depFactsTotal: depFacts.length, deps: depFiles.slice(0, EDGE_CAP), depsTotal: depFiles.length }
  }

  // Files outside the scope that import files inside it: the stand-in for the SCIP reverse closure. Atlas
  // reports the FACTS anchored on those files (own `dependent` rows), capped at 8.
  const dependents = (path) => {
    const inside = under(path)
    const out = new Set()
    Object.entries(R.dependents).forEach(([target, users]) => {
      if (!inside({ file: target })) return
      users.filter((u) => !inside({ file: u })).forEach((u) => out.add(u))
    })
    return [...out].sort()
  }

  // What Orchestra actually serves: the committed Own snapshot (OWN-SNAPSHOT.json), not the live store.
  const snapshot = { revision: "1a235323", units: ["packages/genesis"], catalog: false }

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
  const curationCount = () => stats().candidates + stats().drifted + live().filter((x) => x.proposedTier).length

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
  const ill = A.illustrations ?? {}
  Object.keys(memory).forEach((id) => {
    memory[id].indexed = (ill.indexed?.[id] ?? []).map((r) => ({ ...r, from: r.rule }))
    memory[id].archived = [...(ill.archived?.[id] ?? [])]
    memory[id].prs = ill.prs?.[id] ?? []
  })
  const awareness = R.awareness ?? [
    { facet: "mission", state: "UN-SEEDED", source: "No source wired yet" },
    { facet: "constitution", state: "UN-SEEDED", source: "From T0 facts; there are none" },
    { facet: "terrain", state: "UN-SEEDED", source: "No source wired in Atlas" },
    { facet: "ontology", state: "UN-SEEDED", source: "No source wired in Atlas" },
    { facet: "taste", state: "seeded", source: "CONVENTIONS.md", text: "A claim carries its derivation, or it does not ship. Refusing beats guessing. A gate must be able to fail. Mutation-probe anything load-bearing. One file, one seam." },
  ]

  A.m = { snapshot, isGotcha, OWN_CAP, territories, territoryOf, R, facts, candidates, byKey, live, state, governing, areaOf, areas, unitOf, units, unitGroup, SLOT_GROUPS, SLOT_MEANING, tree, findNode, under, briefing, dependents, stats, curationCount, codeChanges, memory, awareness, tokens }
})(window.Atlas)
