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

  // What `atlas own <path>` composes (retrieval/src/own.ts createOwn), in its paid order: governing rows and
  // gotchas greedy-fill the 1,500-character budget (a row that does not fit is named, later smaller rows can
  // still fit); then one pointer per finer scope (`own_<leaf>`, at most 12, cost = name length, name order);
  // the advisory band last, under its 750 sub-cap, stopping at the first row that does not fit. Drifted facts
  // are not filtered out: they travel with their freshness.
  const MANIFEST_CAP = 12
  const briefing = (path) => {
    const here = live().filter(under(path))
    const byKey = (a, b) => (a.tier === b.tier ? a.key.localeCompare(b.key) : a.tier.localeCompare(b.tier))
    const inv = here.filter((x) => governing(x) && !isGotcha(x)).sort(byKey)
    const gotchas = here.filter((x) => governing(x) && isGotcha(x)).sort(byKey)
    const sent = []
    const pull = []
    let used = 0
    for (const x of [...inv, ...gotchas]) {
      if (used + x.claim.length <= OWN_CAP) { sent.push(x); used += x.claim.length } else pull.push(x)
    }
    const node = findNode(path)
    // Pointers name every child in the spatial index (tracked files), not only folders that hold facts.
    const finer = (R.children?.[path || "."] ?? (node ? [...node.children.values()].map((c) => c.name) : [])).map((name) => ({ name, path: path ? `${path}/${name}` : name }))
    const pointers = []
    for (const c of finer) {
      const name = `own_${c.name}`
      if (pointers.length < MANIFEST_CAP && used + name.length <= OWN_CAP) { pointers.push({ name, path: c.path }); used += name.length }
    }
    const advBudget = Math.min(OWN_ADVISORY_CAP, OWN_CAP - used)
    const adv = []
    let advUsed = 0
    let stopped = false
    for (const x of here.filter((y) => !governing(y)).sort(byKey)) {
      if (!stopped && advUsed + x.claim.length <= advBudget) { adv.push(x); advUsed += x.claim.length } else { stopped = true; pull.push(x) }
    }
    const depFiles = dependents(path)
    // own `dependent` rows: facts anchored outside the scope, in nodeKey order only, first 8.
    const depFacts = live().filter((x) => depFiles.includes(x.file)).sort((a, b) => a.key.localeCompare(b.key))
    return { here, inv: inv.filter((x) => sent.includes(x)), gotchas: gotchas.filter((x) => sent.includes(x)), gov: inv.concat(gotchas).filter((x) => sent.includes(x)), adv, pull, pointers, pointerTotal: finer.length, used: used + advUsed, advUsed, cap: OWN_CAP, advCap: OWN_ADVISORY_CAP,
      finer: finer.slice(0, FINER_CAP), finerTotal: finer.length, depFiles, depFacts: depFacts.slice(0, EDGE_CAP), depFactsTotal: depFacts.length, deps: depFiles.slice(0, EDGE_CAP), depsTotal: depFiles.length }
  }

  // The reverse dependency closure, transitive (adapter-io/src/own-source.ts relationSetFor): every file outside
  // the scope that reaches the anchor of a fact inside it. Atlas walks index.scip; here imports stand in for it.
  const dependents = (path) => {
    const inside = under(path)
    const out = new Set()
    const queue = [...new Set(live().filter(inside).map((x) => x.file))]
    const seen = new Set(queue)
    while (queue.length) {
      for (const u of R.dependents[queue.shift()] ?? []) {
        if (seen.has(u)) continue
        seen.add(u)
        queue.push(u)
        if (!inside({ file: u })) out.add(u)
      }
    }
    return [...out].sort()
  }

  // What Orchestra actually serves: the committed Own snapshot (OWN-SNAPSHOT.json), not the live store.
  // Its one unit is a curated fixture, not exported from this store: owner atlas-foundation, one T1 invariant.
  const snapshot = { revision: "1a235323", units: ["packages/genesis", ...(R.snapshotUnits ?? [])], catalog: !!R.catalogPresent, packs: { "packages/genesis": { summary: "Genesis owns deterministic bootstrap and governed fact seeding.", owner: "atlas-foundation", tier: "T1", invariants: [{ nodeId: "genesis:deterministic-bootstrap", tier: "T1", claim: "Genesis builds deterministic structural state before governed fact seeding.", freshness: "FRESH" }], advisory: 0, dependents: 0, tokenEstimate: 42, sourceFiles: 3 } } }
  // own-source.ts terrainOwner: the actors of the most specific policy scope that covers the unit path; "" when none does.
  const underScope = (path, scope) => scope === "" || path === scope || path.startsWith(`${scope}/`)
  const packOwner = (unitId) => {
    const key = Object.keys(R.policy).filter((k) => underScope(unitId, k)).sort((a, b) => b.length - a.length)[0]
    return key === undefined ? [] : [...R.policy[key]].sort()
  }
  const dependentFacts = (path) => { const files = dependents(path); return live().filter((x) => files.includes(x.file)).length }

  // adapter-io/src/store-provenance.ts + read-access.ts: a store whose projection or CAS is tracked by git is
  // `tracked-provable` (reads serve only sealed facts that re-prove; writes refuse); tracked staging refuses all.
  const provenance = () => (R.tracked?.staging ? "tracked-staging" : R.tracked?.projection || R.tracked?.cas ? "tracked-provable" : "trusted")
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

  // Commits since the build that touched anchored files, most facts first (up to three commits kept per fact).
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
    memory[id].rules = (ill.rules?.[id] ?? []).map((r) => ({ ...r, from: r.rule }))
    memory[id].prs = ill.prs?.[id] ?? []
  })
  // adapter-io/src/memory-read.ts: effective frecency = 1 × 0.5^age, age counted in records of the WHOLE log;
  // a rule below 0.10 leaves the header even with free slots, and at most 12 ride (memory/src/rules.ts).
  const frecency = (r) => Math.pow(0.5, r.age)
  const header = (member) => {
    const ranked = [...memory[member].rules].sort((a, b) => frecency(b) - frecency(a) || a.rule.localeCompare(b.rule))
    const injected = ranked.filter((r) => frecency(r) >= 0.1).slice(0, 12)
    return { injected, evicted: ranked.filter((r) => !injected.includes(r)) }
  }
  // A new record (rule or checkpoint, any member) ages every rule in the repository by one.
  const appendRecord = () => Object.values(memory).forEach((m) => m.rules.forEach((r) => r.age++))
  // In Orchestra the header reads the execution worktree's root, which has no CONVENTIONS.md and no .atlas
  // projection, so all five facets render `unseeded` (maestro/atlas-header.ts, adapter-io/src/awareness-store.ts).
  const awareness = R.awareness ?? [
    { facet: "mission", state: "UN-SEEDED", source: "no source wired in Atlas" },
    { facet: "constitution", state: "UN-SEEDED", source: "no T0 fact in a projection at the worktree root" },
    { facet: "terrain", state: "UN-SEEDED", source: "no source wired in Atlas" },
    { facet: "ontology", state: "UN-SEEDED", source: "no source wired in Atlas" },
    { facet: "taste", state: "UN-SEEDED", source: "no CONVENTIONS.md at the worktree root" },
  ]
  // The exact header block Orchestra adds to every provider request for a bound member (maestro/atlas-header.ts).
  const words = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0)
  const headerText = (member) => {
    const rules = header(member).injected
    return [
      `<atlas-header member="${member}" rules="${rules.length}" rule-words="${rules.reduce((n, r) => n + words(r.rule), 0)}">`,
      "Awareness:",
      ...awareness.map((f) => (f.state === "UN-SEEDED" ? `- ${f.facet}: unseeded` : `- ${f.facet} (${f.state}): ${f.text}`)),
      "Orientation: none recorded",
      rules.length ? "Project rules:" : "Project rules: none recorded",
      ...rules.map((r) => `- [${r.scope}] ${r.rule}`),
      "</atlas-header>",
    ].join("\n")
  }

  /* ---------- Write path, as the code answers it ---------- */
  // Writing as: ATLAS_ACTOR, else the git e-mail (adapter-io/src/compose.ts:170). The mock writes as the policy's curator.
  const actor = "seat:orchestrator"
  const writable = () => provenance() === "trusted"
  // `atlas check` (tools/src/check.ts): shape → truth → authz → ratify, each with its reason and remedy.
  // `regrounds` = the write is drafted against the current file, so the truth gate re-derives it at HEAD.
  const checks = (x, opts = {}) => {
    const tier = opts.tier ?? "T2"
    const truth = opts.regrounds || !x.drift
    // A write through `atlas draft` declares the path's first segment as its group (tools/src/draft.ts scopeOf) and
    // is always T2, so drafting over a ratified fact is a downgrade.
    const scope = opts.draft ? x.file.split("/")[0] : x.scope
    // A T2 write over a stricter incumbent is a downgrade (draft and promote both write T2); the actor-in-scope check runs first.
    const downgrade = (opts.draft || opts.promote) && (x.tier ?? "T2") !== "T2" && tier === "T2"
    const inScope = (R.policy[scope] ?? []).includes(actor)
    const authz = inScope && !downgrade
    const token = opts.token ?? ""
    const ratify = tier === "T0" ? token === "billy" : token !== ""
    const gates = [
      { gate: "shape", pass: true },
      { gate: "truth", pass: truth, reason: "ungrounded", remedy: "re-derive against the current tree" },
      { gate: "authz", pass: authz, reason: inScope ? "governance-downgrade" : "unauthorized", remedy: inScope ? "raise the tier, or edit through ratify" : `grant ${scope} in .atlas/policy.json` },
      { gate: "ratify", pass: ratify, reason: "unratified", remedy: tier === "T0" ? "ATLAS_RATIFY_TOKEN=billy" : "set ATLAS_RATIFY_TOKEN" },
    ]
    // The gate chain stops at the first refusal; later gates are not reached.
    const first = gates.findIndex((g) => !g.pass)
    return { wouldEmit: first < 0, gates: gates.map((g, i) => ({ ...g, reached: first < 0 || i <= first })) }
  }
  // `atlas promote` (adapter-io/src/governed-promote.ts): every staging row is re-presented through emit.
  const promoteRun = (token) => {
    if (!writable()) return { read: false, refusal: "untrusted", candidates: 0, promoted: 0, refused: 0, rows: [] }
    // Staging has no delete: rows kept for later are still re-presented (R2), each as the T2 bytes it was mined as.
    const staged = [...facts, ...candidates]
    const rows = staged.map((x) => {
      const c = checks(x, { token, promote: true })
      const failed = c.gates.find((g) => !g.pass)
      return { x, nodeKey: x.key, settled: !failed, rejected: failed?.reason }
    })
    const refused = rows.filter((r) => !r.settled).length
    return { read: true, candidates: rows.length, promoted: rows.length - refused, refused, rows }
  }
  // `atlas reconcile <mergeBase>`: facts whose anchor changed between the base and HEAD, classed by `doctor why`.
  const reconcile = () => {
    // On a store in git the write-gated projection blanks, so reconcile reads no facts and exits 0 (compose.ts:557).
    if (provenance() !== "trusted") return { base: R.builtAt, drift: [], mechanical: [], semantic: [], regroundedCount: 0, reauthorCount: 0, exitCode: 0, blind: true }
    const drift = facts.filter((x) => state(x) === "drifted").map((x) => ({ fact: x, class: "semantic" }))
    return { base: R.builtAt, drift, mechanical: [], semantic: drift, regroundedCount: 0, reauthorCount: drift.length, exitCode: drift.length ? 2 : 0 }
  }
  // `doctor why` / `doctor reground`: a whole-file anchor whose old bytes exist nowhere at HEAD is semantic ⇒ retire.
  const why = (x) => (x.drift ? { class: "semantic", plan: "retire" } : undefined)

  /* ---------- Health, from the store's own files ---------- */
  const health = () => {
    const configured = { ts: ["scip-typescript", "0.4.0"], py: ["scip-python", "0.6.6"] }
    // adapter-io/src/indexer-report.ts EXT_LANG: extensions fold into languages; unknown ones are never a hole.
    const EXT = { ts: "ts", tsx: "ts", mts: "ts", cts: "ts", js: "ts", jsx: "ts", mjs: "ts", cjs: "ts", py: "py", pyi: "py", go: "go", java: "java", rs: "rust", rb: "rb" }
    const langs = Object.entries(R.langs ?? {}).reduce((o, [ext, n]) => (EXT[ext] ? { ...o, [EXT[ext]]: (o[EXT[ext]] ?? 0) + n } : o), {})
    return {
      provenance: provenance(),
      cas: { ...R.casAudit, corrupt: 0, unreadable: 0, sound: (R.casAudit?.missing ?? 0) === 0 },
      proofs: { sealedProven: R.sealed ?? 0, reProven: 0, broken: 0, unverifiable: 0, dangling: 0 },
      index: { scip: !!R.scip, configured: Object.entries(langs).filter(([l]) => configured[l]).map(([l, n]) => ({ lang: l, tool: configured[l][0], version: configured[l][1], files: n })), holes: Object.entries(langs).filter(([l]) => !configured[l]).map(([l, n]) => ({ lang: l, files: n })) },
      generations: R.generations ?? [],
      hotSet: facts.length,
    }
  }

  /* ---------- Activity: what agents read and wrote, from the session receipts ---------- */
  const activity = () => {
    const names = { backend: "Backend", jimmy: "Jimmy", archie: "Archie" }
    const events = []
    ;(A.spawns ?? []).forEach((t) => {
      t.checkpoints.forEach((c) => events.push({ at: c.at, who: t.member, kind: "memory", ok: c.outcome === "admitted", outcome: c.outcome, unit: t.unit, text: c.outcome === "admitted" ? `${names[t.member]} saved a checkpoint` : `${names[t.member]}'s checkpoint was not saved`, refusal: c.refusal, reason: c.reason, ref: c.ref, example: t.example, task: t }))
      ;(t.admissions ?? []).forEach((a) => events.push({ at: a.at, who: t.member, kind: "resume", ok: a.ok !== false, refusal: a.refusal, unit: t.unit, text: a.ok === false ? `${names[t.member]}'s resume found no checkpoint` : `${names[t.member]} was resumed with its checkpoint`, residency: a.residency, ref: a.ref, example: t.example, task: t }))
      t.transcript.forEach((m) => m.parts.filter((p) => p.type === "tool" && p.tool === "atlas_memory_recall").forEach(() => events.push({ at: m.at, who: t.member, kind: "memory", ok: true, outcome: "read", recall: true, unit: t.unit, text: `${names[t.member]} recalled its task memory`, example: t.example, task: t })))
      t.transcript.forEach((m) => m.parts.filter((p) => p.type === "tool" && p.tool === "atlas_context").forEach((p) => {
        const input = (() => { try { return JSON.parse(p.input) } catch { return {} } })()
        // A unit outside the published catalog is held, not read; the hold event below covers it.
        if (input.action === "unit" && !snapshot.units.includes(input.unit)) return
        if (input.action === "anchor") return events.push({ at: m.at, who: t.member, kind: "read", ok: true, unit: t.unit, action: "anchor", target: input.target.id, units: input.units, text: `${names[t.member]} froze ${input.units.length} units for ${input.target.id}`, example: t.example, task: t })
        events.push({ at: m.at, who: t.member, kind: "read", ok: true, unit: t.unit, action: input.action, target: input.unit, text: input.action === "catalog" ? `${names[t.member]} read the unit catalog` : `${names[t.member]} read the briefing for ${input.unit}`, research: t.member === "jimmy", example: t.example, task: t })
      }))
      t.checkpoints.filter((c) => (c.entry.failedWith ?? []).some((f) => /AtlasContextHeld/.test(f))).forEach((c) => {
        const reason = (c.entry.failedWith.find((f) => /AtlasContextHeld/.test(f)).match(/AtlasContextHeld: ([a-z-]+)/) ?? [])[1]
        events.push({ at: c.at - 1, who: t.member, kind: "hold", ok: false, unit: t.unit, reason, text: `${names[t.member]} was held`, example: t.example, task: t })
      })
    })
    return events.sort((a, b) => b.at - a.at)
  }

  // The unit graph: one node per unit, an edge when files in one unit import files in another (importer → target,
  // "depends on"). Atlas walks index.scip for the same edges; imports stand in for it in the preview.
  const unitGraph = () => {
    const us = units()
    const ids = new Set(us.map((u) => u.id))
    const w = new Map()
    Object.entries(R.dependents).forEach(([target, users]) => users.forEach((user) => {
      const a = unitOf(user), b = unitOf(target)
      if (a === b || !ids.has(a) || !ids.has(b)) return
      w.set(`${a}|${b}`, (w.get(`${a}|${b}`) ?? 0) + 1)
    }))
    return { units: us, edges: [...w].map(([k, n]) => { const [source, target] = k.split("|"); return { source, target, w: n } }) }
  }
  // The file graph of one unit: its files, plus the outside files that import them, folded into their units.
  const fileGraph = (unitId) => {
    const files = [...new Set(live().filter((x) => unitOf(x.file) === unitId).map((x) => x.file))]
    const inside = new Set(files)
    const edges = []
    const outside = new Map()
    Object.entries(R.dependents).forEach(([target, users]) => {
      if (!inside.has(target)) return
      users.forEach((user) => {
        if (inside.has(user)) return edges.push({ source: user, target, w: 1 })
        const u = unitOf(user)
        if (u === unitId) return
        outside.set(u, (outside.get(u) ?? 0) + 1)
        edges.push({ source: `unit:${u}`, target, w: 1 })
      })
    })
    return { files, outside: [...outside], edges }
  }

  A.m = { unitGraph, fileGraph, actor, writable, checks, promoteRun, reconcile, why, health, activity, provenance, snapshot, packOwner, dependentFacts, frecency, header, headerText, appendRecord, words, isGotcha, OWN_CAP, territories, territoryOf, R, facts, candidates, byKey, live, state, governing, areaOf, areas, unitOf, units, unitGroup, SLOT_GROUPS, SLOT_MEANING, tree, findNode, under, briefing, dependents, stats, curationCount, codeChanges, memory, awareness, tokens }
})(window.Atlas)
