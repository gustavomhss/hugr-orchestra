import type { AtlasSnapshot, AtlasSnapshotFact } from "./atlas-types"
import { ownPacks, prOf, taskOf, tierOf } from "./atlas-wire"

// The read model every Atlas view uses: a pure port of specs/atlas-ui/mock/model.js over one snapshot. It mirrors
// what Atlas computes (bands, caps, pull-reachable, dependents, drift) so every number on screen comes from the data.

export type AtlasFactState = "fresh" | "drifted" | "retired"
export type AtlasFact = Omit<AtlasSnapshotFact, "kind"> & {
  kind: "fact" | "candidate"
  // The CAS fact's own kind (the snapshot's `kind`), kept because `kind` now says fact or candidate as in the mock.
  factKind: AtlasSnapshotFact["kind"]
  // D19: retired means the CAS fact's authoring is SUPERSEDED.
  retired: boolean
  // The mock set these by simulated actions; the real screen refetches after each write, so they stay false.
  regrounded: boolean
  promotedNow: boolean
  discarded: boolean
  proposedTier?: "T1" | "T0"
}
export type AtlasUnitGroup = "code" | "docs" | "harness" | "root"
export type AtlasUnit = {
  id: string
  group: AtlasUnitGroup
  level: "module"
  facts: number
  drifted: number
  governing: number
  unclassified: number
  files: Set<string>
}
export type AtlasTreeNode = {
  path: string
  name: string
  children: Map<string, AtlasTreeNode>
  facts: number
  drifted: number
  candidates: number
  file: boolean
}
export type AtlasTerritory = { name: string; owner: string; tier: "T0" | "T1" | "T2"; globs: string[] }
export type AtlasPointer = { name: string; path: string }
export type AtlasBriefing = {
  here: AtlasFact[]
  inv: AtlasFact[]
  gotchas: AtlasFact[]
  gov: AtlasFact[]
  adv: AtlasFact[]
  pull: AtlasFact[]
  pointers: AtlasPointer[]
  pointerTotal: number
  used: number
  advUsed: number
  cap: number
  advCap: number
  finer: AtlasPointer[]
  finerTotal: number
  depFiles: string[]
  depFacts: AtlasFact[]
  depFactsTotal: number
  deps: string[]
  depsTotal: number
}
export type AtlasOwnPack = {
  summary: string
  owner: string
  tier: "T0" | "T1" | "T2"
  invariants: { nodeId: string; tier: "T0" | "T1" | "T2"; claim: string; freshness: string }[]
  advisory: number
  dependents: number
  tokenEstimate: number
  sourceFiles: number
}
export type AtlasOwnSnapshot = { revision: string; units: string[]; catalog: boolean; packs: Record<string, AtlasOwnPack> }
export type AtlasProvenance = "trusted" | "tracked-provable" | "tracked-staging"
export type AtlasStats = {
  facts: number
  governing: number
  advisory: number
  fresh: number
  drifted: number
  candidates: number
  toRatify: number
  files: number
}
export type AtlasCodeChange = { sha: string; subject: string; facts: AtlasFact[] }
export type AtlasMemberId = "backend" | "jimmy" | "archie" | "maestro"
export type AtlasMemoryRule = { rule: string; scope: string; age: number; grounding?: string; from: string }
export type AtlasMemoryTask = {
  taskId: string
  attempted: string[]
  failedWith: string[]
  stoppedAt: string
  lesson: string
  ref: string
  source: string
}
export type AtlasMemoryPr = {
  prId: string
  title: string
  decisions: string[]
  reviewOutcomes: string[]
  knowledgeDelta: { change: string; unit: string; facts: number }[]
}
export type AtlasMember = {
  bound: boolean
  tasks: AtlasMemoryTask[]
  prs: AtlasMemoryPr[]
  rules: AtlasMemoryRule[]
  logbook?: string[]
}
export type AtlasAwareness = {
  facet: "mission" | "constitution" | "terrain" | "ontology" | "taste"
  state: string
  source: AtlasAwarenessSource
  text?: string
}
export type AtlasAwarenessSource =
  | "orchestra.atlas.kit.awareness.noSource"
  | "orchestra.atlas.kit.awareness.noT0"
  | "orchestra.atlas.kit.awareness.noConventions"
export type AtlasGateName = "shape" | "truth" | "authz" | "ratify"
export type AtlasRemedy = "reground" | "raise-tier" | "grant-scope" | "token-billy" | "token"
export type AtlasGate = {
  gate: AtlasGateName
  pass: boolean
  reason?: string
  remedy?: AtlasRemedy
  // The write group the remedy names (grant-scope only).
  scope?: string
  reached: boolean
}
export type AtlasChecks = { wouldEmit: boolean; gates: AtlasGate[] }
export type AtlasCheckOptions = { tier?: "T0" | "T1" | "T2"; regrounds?: boolean; draft?: boolean; promote?: boolean; token?: string }
export type AtlasPromoteRow = { x: AtlasFact; nodeKey: string; settled: boolean; rejected?: string }
export type AtlasPromoteRun = {
  read: boolean
  refusal?: "untrusted"
  candidates: number
  promoted: number
  refused: number
  rows: AtlasPromoteRow[]
}
export type AtlasReconcile = {
  base: string
  drift: { fact: AtlasFact; class: "semantic" }[]
  mechanical: { fact: AtlasFact; class: "mechanical" }[]
  semantic: { fact: AtlasFact; class: "semantic" }[]
  regroundedCount: number
  reauthorCount: number
  exitCode: number
  blind?: boolean
}
export type AtlasHealth = {
  provenance: AtlasProvenance
  cas: AtlasSnapshot["casAudit"] & { corrupt: number; unreadable: number; sound: boolean }
  proofs: { sealedProven: number; reProven: number; broken: number; unverifiable: number; dangling: number }
  index: {
    scip: boolean
    configured: { lang: string; tool: string; version: string; files: number }[]
    holes: { lang: string; files: number }[]
  }
  generations: readonly string[]
  hotSet: number
}
export type AtlasEvent = {
  at: number
  who: AtlasMemberId
  kind: "memory" | "resume" | "read" | "hold"
  ok: boolean
  unit: string
  outcome?: string
  refusal?: string
  reason?: string
  ref?: string
  recall?: boolean
  residency?: string
  action?: string
  target?: string
  units?: string[]
  research?: boolean
}
export type AtlasGraphEdge = { source: string; target: string; w: number }
export type AtlasUnitGraph = { units: AtlasUnit[]; edges: AtlasGraphEdge[] }
export type AtlasFileGraph = { files: string[]; outside: [string, number][]; edges: AtlasGraphEdge[] }
export type AtlasModel = ReturnType<typeof createAtlasModel>

// retrieval/src/own.ts: the whole briefing is capped at 1500 CHARACTERS of claim text; the advisory band gets at
// most half of it and is paid last; dependents are capped at 8 facts, finer scopes at 16.
const OWN_CAP = 1500
const OWN_ADVISORY_CAP = OWN_CAP / 2
const EDGE_CAP = 8
const FINER_CAP = 16
const MANIFEST_CAP = 12

// The closed predicate-slot vocabulary (knowledge/src/types.ts, 13 members), grouped for reading. Each group is
// [title copy key, meaning copy key, slots]; the copy lives in i18n/orchestra-chapters/atlas-kit.ts.
const SLOT_GROUPS = [
  [
    "orchestra.atlas.kit.slotGroup.contract",
    "orchestra.atlas.kit.slotGroup.contract.meaning",
    ["contract", "precondition", "postcondition", "sideeffect", "ownership"],
  ],
  [
    "orchestra.atlas.kit.slotGroup.property",
    "orchestra.atlas.kit.slotGroup.property.meaning",
    ["invariant", "perf-bound", "security-property", "count"],
  ],
  [
    "orchestra.atlas.kit.slotGroup.guidance",
    "orchestra.atlas.kit.slotGroup.guidance.meaning",
    ["gotcha", "rationale"],
  ],
  [
    "orchestra.atlas.kit.slotGroup.structure",
    "orchestra.atlas.kit.slotGroup.structure.meaning",
    ["dependency", "definition"],
  ],
] as const
const SLOT_MEANING = {
  invariant: "orchestra.atlas.kit.slot.invariant",
  contract: "orchestra.atlas.kit.slot.contract",
  precondition: "orchestra.atlas.kit.slot.precondition",
  postcondition: "orchestra.atlas.kit.slot.postcondition",
  sideeffect: "orchestra.atlas.kit.slot.sideeffect",
  ownership: "orchestra.atlas.kit.slot.ownership",
  "perf-bound": "orchestra.atlas.kit.slot.perf-bound",
  "security-property": "orchestra.atlas.kit.slot.security-property",
  gotcha: "orchestra.atlas.kit.slot.gotcha",
  rationale: "orchestra.atlas.kit.slot.rationale",
  dependency: "orchestra.atlas.kit.slot.dependency",
  count: "orchestra.atlas.kit.slot.count",
  definition: "orchestra.atlas.kit.slot.definition",
} as const

export function createAtlasModel(snapshot: AtlasSnapshot) {
  const R = snapshot
  const tokens = (text: string) => text.length
  const state = (x: AtlasFact): AtlasFactState => (x.retired ? "retired" : x.drift && !x.regrounded ? "drifted" : "fresh")
  const isGotcha = (x: AtlasFact) => x.slot === "gotcha" || x.slot === "rationale"
  const toFact = (x: AtlasSnapshotFact, kind: AtlasFact["kind"]): AtlasFact => ({
    ...x,
    kind,
    factKind: x.kind,
    retired: x.authoring === "SUPERSEDED",
    regrounded: false,
    promotedNow: false,
    discarded: false,
  })
  const facts = R.facts.map((x) => toFact(x, "fact"))
  const candidates = R.candidates.map((x) => toFact(x, "candidate"))
  const byKey: Record<string, AtlasFact> = Object.fromEntries([...facts, ...candidates].map((x) => [x.key, x]))
  // Retire tags a fact SUPERSEDED through emit, but no read path filters on it, so it stays served (REVIEW A5).
  const live = () => [...facts, ...candidates.filter((x) => x.promotedNow)]
  const governing = (x: { tier: string }) => x.tier === "T0" || x.tier === "T1"

  // Own units: the grain Atlas serves knowledge at. A unit is a package; docs and harness folders carry mined facts
  // too, so they are units of their own, and top-level files share one root unit.
  const unitOf = (file: string) => {
    const parts = file.split("/")
    return ["packages", "docs", "harness"].includes(parts[0]) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : "(root)"
  }
  const unitGroup = (id: string): AtlasUnitGroup => {
    if (id.startsWith("packages/")) return "code"
    if (id.startsWith("docs/")) return "docs"
    if (id.startsWith("harness/")) return "harness"
    return "root"
  }
  const units = () => {
    const map = new Map<string, AtlasUnit>()
    for (const x of live()) {
      const id = unitOf(x.file)
      const u = map.get(id) ?? {
        id,
        group: unitGroup(id),
        level: "module" as const,
        facts: 0,
        drifted: 0,
        governing: 0,
        unclassified: 0,
        files: new Set<string>(),
      }
      u.facts++
      if (state(x) === "drifted") u.drifted++
      if (governing(x)) u.governing++
      if (!x.slot) u.unclassified++
      u.files.add(x.file)
      map.set(id, u)
    }
    return [...map.values()].sort((a, b) => b.facts - a.facts)
  }
  // Territories (contracts/src/territory.ts) come from TERRITORY-CATALOG.json (D3b); a tier Atlas does not know reads as T2.
  const territories = (): AtlasTerritory[] =>
    R.territories.map((t) => ({ name: t.name, owner: t.owner, tier: tierOf(t.tier), globs: [...t.globs] }))
  const territoryOf = (unitId: string) =>
    territories().find((t) =>
      t.globs.some((g) => g === `${unitId}/**` || (g.endsWith("/**") && unitId.startsWith(g.slice(0, -3)))),
    )
  const areaOf = unitOf
  const areas = units

  // The spatial tree: every directory and file that has knowledge or candidates under it.
  const tree = () => {
    const root: AtlasTreeNode = {
      path: "",
      name: R.project,
      children: new Map(),
      facts: 0,
      drifted: 0,
      candidates: 0,
      file: false,
    }
    const add = (x: AtlasFact, field: "facts" | "candidates") => {
      const parts = x.file.split("/")
      const drifted = field === "facts" && state(x) === "drifted"
      root[field]++
      if (drifted) root.drifted++
      parts.reduce((node, part, i) => {
        const path = parts.slice(0, i + 1).join("/")
        const child = node.children.get(part) ?? {
          path,
          name: part,
          children: new Map(),
          facts: 0,
          drifted: 0,
          candidates: 0,
          file: i === parts.length - 1,
        }
        node.children.set(part, child)
        child[field]++
        if (drifted) child.drifted++
        return child
      }, root)
    }
    live().forEach((x) => add(x, "facts"))
    candidates.filter((x) => !x.promotedNow && !x.discarded).forEach((x) => add(x, "candidates"))
    return root
  }
  const findNode = (path: string) => {
    const root = tree()
    if (!path) return root
    return path
      .split("/")
      .reduce<AtlasTreeNode | undefined>((node, part) => node?.children.get(part), root)
  }
  const under = (path: string) => (x: { file: string }) => !path || x.file === path || x.file.startsWith(`${path}/`)

  // What `atlas own <path>` composes (retrieval/src/own.ts createOwn), in its paid order: governing rows and
  // gotchas greedy-fill the 1,500-character budget (a row that does not fit is named, later smaller rows can
  // still fit); then one pointer per finer scope (`own_<leaf>`, at most 12, cost = name length, name order);
  // the advisory band last, under its 750 sub-cap, stopping at the first row that does not fit. Drifted facts
  // are not filtered out: they travel with their freshness.
  const briefing = (path: string): AtlasBriefing => {
    const here = live().filter(under(path))
    const order = (a: AtlasFact, b: AtlasFact) => (a.tier === b.tier ? a.key.localeCompare(b.key) : a.tier.localeCompare(b.tier))
    const inv = here.filter((x) => governing(x) && !isGotcha(x)).sort(order)
    const gotchas = here.filter((x) => governing(x) && isGotcha(x)).sort(order)
    const sent: AtlasFact[] = []
    const pull: AtlasFact[] = []
    let used = 0
    for (const x of [...inv, ...gotchas]) {
      if (used + x.claim.length <= OWN_CAP) {
        sent.push(x)
        used += x.claim.length
        continue
      }
      pull.push(x)
    }
    const node = findNode(path)
    // Pointers name every child in the spatial index (tracked files), not only folders that hold facts.
    const names = R.children[path || "."] ?? (node ? [...node.children.values()].map((c) => c.name) : [])
    const finer = names.map((name) => ({ name, path: path ? `${path}/${name}` : name }))
    const pointers: AtlasPointer[] = []
    for (const c of finer) {
      const name = `own_${c.name}`
      if (pointers.length < MANIFEST_CAP && used + name.length <= OWN_CAP) {
        pointers.push({ name, path: c.path })
        used += name.length
      }
    }
    const advBudget = Math.min(OWN_ADVISORY_CAP, OWN_CAP - used)
    const adv: AtlasFact[] = []
    let advUsed = 0
    let stopped = false
    for (const x of here.filter((y) => !governing(y)).sort(order)) {
      if (!stopped && advUsed + x.claim.length <= advBudget) {
        adv.push(x)
        advUsed += x.claim.length
        continue
      }
      stopped = true
      pull.push(x)
    }
    const depFiles = dependents(path)
    // own `dependent` rows: facts anchored outside the scope, in nodeKey order only, first 8.
    const depFacts = live()
      .filter((x) => depFiles.includes(x.file))
      .sort((a, b) => a.key.localeCompare(b.key))
    return {
      here,
      inv: inv.filter((x) => sent.includes(x)),
      gotchas: gotchas.filter((x) => sent.includes(x)),
      gov: inv.concat(gotchas).filter((x) => sent.includes(x)),
      adv,
      pull,
      pointers,
      pointerTotal: finer.length,
      used: used + advUsed,
      advUsed,
      cap: OWN_CAP,
      advCap: OWN_ADVISORY_CAP,
      finer: finer.slice(0, FINER_CAP),
      finerTotal: finer.length,
      depFiles,
      depFacts: depFacts.slice(0, EDGE_CAP),
      depFactsTotal: depFacts.length,
      deps: depFiles.slice(0, EDGE_CAP),
      depsTotal: depFiles.length,
    }
  }

  // The reverse dependency closure, transitive (adapter-io/src/own-source.ts relationSetFor): every file outside
  // the scope that reaches the anchor of a fact inside it.
  const dependents = (path: string) => {
    const inside = under(path)
    const out = new Set<string>()
    const queue = [...new Set(live().filter(inside).map((x) => x.file))]
    const seen = new Set(queue)
    while (queue.length) {
      for (const u of R.dependents[queue.shift() ?? ""] ?? []) {
        if (seen.has(u)) continue
        seen.add(u)
        queue.push(u)
        if (!inside({ file: u })) out.add(u)
      }
    }
    return [...out].sort()
  }

  // What Orchestra serves is the committed Own snapshot (OWN-SNAPSHOT.json, D3b). A snapshot that does not parse
  // (HOLD) serves no unit, so the model shows none.
  const packs = R.own?.status === "READY" ? ownPacks(R.own.units) : {}
  const ownSnapshot: AtlasOwnSnapshot = {
    revision: (R.own?.sourceRevision ?? "").slice(0, 8),
    units: Object.keys(packs),
    catalog: R.territories.length > 0,
    packs,
  }
  // own-source.ts terrainOwner: the actors of the most specific policy scope that covers the unit path; [] when none does.
  const underScope = (path: string, scope: string) => scope === "" || path === scope || path.startsWith(`${scope}/`)
  const packOwner = (unitId: string) => {
    const key = Object.keys(R.policy)
      .filter((k) => underScope(unitId, k))
      .sort((a, b) => b.length - a.length)[0]
    return key === undefined ? [] : [...R.policy[key]].sort()
  }
  const dependentFacts = (path: string) => {
    const files = dependents(path)
    return live().filter((x) => files.includes(x.file)).length
  }

  // adapter-io/src/store-provenance.ts + read-access.ts: a store whose projection or CAS is tracked by git is
  // `tracked-provable` (reads serve only sealed facts that re-prove; writes refuse); tracked staging refuses all.
  const provenance = (): AtlasProvenance => {
    if (R.tracked.staging) return "tracked-staging"
    if (R.tracked.projection || R.tracked.cas) return "tracked-provable"
    return "trusted"
  }
  const stats = (): AtlasStats => {
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
    const map = new Map<string, AtlasCodeChange>()
    facts.forEach((x) =>
      (x.drift?.commits ?? []).forEach((commit) => {
        const c = map.get(commit[0]) ?? { sha: commit[0], subject: commit[1], facts: [] }
        c.facts.push(x)
        map.set(commit[0], c)
      }),
    )
    return [...map.values()].sort((a, b) => b.facts.length - a.facts.length)
  }

  // .atlas/memory.jsonl by member (D3b). A rule's age counts the records written after it in the WHOLE log, every
  // member included, which is what the header's decay counts. The logbook belongs to the orchestrator actor `orch`.
  const records = Object.values(R.memory).flat()
  const ageOf = (seq: number) => records.filter((r) => r.seq > seq).length
  const recordsOf = (member: string, kind: string) => (R.memory[member] ?? []).filter((r) => r.kind === kind)
  const memberOf = (id: AtlasMemberId): AtlasMember => ({
    bound: id !== "maestro",
    tasks: recordsOf(id, "task").map(taskOf),
    prs: recordsOf(id, "pr").map(prOf),
    rules: recordsOf(id, "project").map((r) => ({
      rule: r.text,
      scope: r.scope ?? "*",
      age: ageOf(r.seq),
      grounding: r.refs[0],
      from: r.text,
    })),
  })
  const memory: Record<AtlasMemberId, AtlasMember> = {
    backend: memberOf("backend"),
    jimmy: memberOf("jimmy"),
    archie: memberOf("archie"),
    maestro: { ...memberOf("maestro"), logbook: recordsOf("orch", "logbook").map((r) => r.text) },
  }
  const frecency = (r: AtlasMemoryRule) => Math.pow(0.5, r.age)
  const header = (member: AtlasMemberId) => {
    const ranked = [...memory[member].rules].sort((a, b) => frecency(b) - frecency(a) || a.rule.localeCompare(b.rule))
    const injected = ranked.filter((r) => frecency(r) >= 0.1).slice(0, 12)
    return { injected, evicted: ranked.filter((r) => !injected.includes(r)) }
  }
  const appendRecord = () => Object.values(memory).forEach((m) => m.rules.forEach((r) => r.age++))
  const awareness: AtlasAwareness[] = [
    { facet: "mission", state: "UN-SEEDED", source: "orchestra.atlas.kit.awareness.noSource" },
    { facet: "constitution", state: "UN-SEEDED", source: "orchestra.atlas.kit.awareness.noT0" },
    { facet: "terrain", state: "UN-SEEDED", source: "orchestra.atlas.kit.awareness.noSource" },
    { facet: "ontology", state: "UN-SEEDED", source: "orchestra.atlas.kit.awareness.noSource" },
    { facet: "taste", state: "UN-SEEDED", source: "orchestra.atlas.kit.awareness.noConventions" },
  ]
  const words = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0)
  const headerText = (member: AtlasMemberId) => {
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

  const actor = "seat:orchestrator"
  const writable = () => provenance() === "trusted"
  const checks = (x: AtlasFact, opts: AtlasCheckOptions = {}): AtlasChecks => {
    const tier = opts.tier ?? "T2"
    const truth = opts.regrounds || !x.drift
    const scope = opts.draft ? x.file.split("/")[0] : x.scope
    const downgrade = (opts.draft || opts.promote) && (x.tier ?? "T2") !== "T2" && tier === "T2"
    const inScope = (R.policy[scope] ?? []).includes(actor)
    const authz = inScope && !downgrade
    const token = opts.token ?? ""
    const ratify = tier === "T0" ? token === "billy" : token !== ""
    const gates: Omit<AtlasGate, "reached">[] = [
      { gate: "shape", pass: true },
      { gate: "truth", pass: !!truth, reason: "ungrounded", remedy: "reground" },
      inScope
        ? { gate: "authz", pass: authz, reason: "governance-downgrade", remedy: "raise-tier" }
        : { gate: "authz", pass: authz, reason: "unauthorized", remedy: "grant-scope", scope },
      { gate: "ratify", pass: ratify, reason: "unratified", remedy: tier === "T0" ? "token-billy" : "token" },
    ]
    const first = gates.findIndex((g) => !g.pass)
    return { wouldEmit: first < 0, gates: gates.map((g, i) => ({ ...g, reached: first < 0 || i <= first })) }
  }
  const promoteRun = (token: string): AtlasPromoteRun => {
    if (!writable()) return { read: false, refusal: "untrusted", candidates: 0, promoted: 0, refused: 0, rows: [] }
    const rows = [...facts, ...candidates].map((x) => {
      const failed = checks(x, { token, promote: true }).gates.find((g) => !g.pass)
      return { x, nodeKey: x.key, settled: !failed, rejected: failed?.reason }
    })
    const refused = rows.filter((r) => !r.settled).length
    return { read: true, candidates: rows.length, promoted: rows.length - refused, refused, rows }
  }
  const reconcile = (): AtlasReconcile => {
    if (provenance() !== "trusted")
      return { base: R.builtAt, drift: [], mechanical: [], semantic: [], regroundedCount: 0, reauthorCount: 0, exitCode: 0, blind: true }
    const drift = facts.filter((x) => state(x) === "drifted").map((x) => ({ fact: x, class: "semantic" as const }))
    return {
      base: R.builtAt,
      drift,
      mechanical: [],
      semantic: drift,
      regroundedCount: 0,
      reauthorCount: drift.length,
      exitCode: drift.length ? 2 : 0,
    }
  }
  const why = (x: AtlasFact) => (x.drift ? { class: "semantic" as const, plan: "retire" as const } : undefined)

  const health = (): AtlasHealth => {
    const configured: Record<string, [string, string]> = { ts: ["scip-typescript", "0.4.0"], py: ["scip-python", "0.6.6"] }
    const EXT: Record<string, string> = { ts: "ts", tsx: "ts", mts: "ts", cts: "ts", js: "ts", jsx: "ts", mjs: "ts", cjs: "ts", py: "py", pyi: "py", go: "go", java: "java", rs: "rust", rb: "rb" }
    const langs = Object.entries(R.langs).reduce<Record<string, number>>(
      (o, entry) => (EXT[entry[0]] ? { ...o, [EXT[entry[0]]]: (o[EXT[entry[0]]] ?? 0) + entry[1] } : o),
      {},
    )
    return {
      provenance: provenance(),
      cas: { ...R.casAudit, corrupt: 0, unreadable: 0, sound: R.casAudit.missing === 0 },
      proofs: { sealedProven: R.sealed, reProven: 0, broken: 0, unverifiable: 0, dangling: 0 },
      index: {
        scip: R.scip,
        configured: Object.entries(langs)
          .filter((entry) => configured[entry[0]])
          .map((entry) => ({ lang: entry[0], tool: configured[entry[0]][0], version: configured[entry[0]][1], files: entry[1] })),
        holes: Object.entries(langs)
          .filter((entry) => !configured[entry[0]])
          .map((entry) => ({ lang: entry[0], files: entry[1] })),
      },
      generations: R.generations,
      hotSet: facts.length,
    }
  }

  const activity = (): AtlasEvent[] => []

  const unitGraph = (): AtlasUnitGraph => {
    const us = units()
    const ids = new Set(us.map((u) => u.id))
    const w = new Map<string, number>()
    Object.entries(R.dependents).forEach((entry) =>
      entry[1].forEach((user) => {
        const a = unitOf(user)
        const b = unitOf(entry[0])
        if (a === b || !ids.has(a) || !ids.has(b)) return
        w.set(`${a}|${b}`, (w.get(`${a}|${b}`) ?? 0) + 1)
      }),
    )
    return {
      units: us,
      edges: [...w].map((entry) => {
        const ends = entry[0].split("|")
        return { source: ends[0], target: ends[1], w: entry[1] }
      }),
    }
  }
  const fileGraph = (unitId: string): AtlasFileGraph => {
    const files = [...new Set(live().filter((x) => unitOf(x.file) === unitId).map((x) => x.file))]
    const inside = new Set(files)
    const edges: AtlasGraphEdge[] = []
    const outside = new Map<string, number>()
    Object.entries(R.dependents).forEach((entry) => {
      const target = entry[0]
      if (!inside.has(target)) return
      entry[1].forEach((user) => {
        if (inside.has(user)) return edges.push({ source: user, target, w: 1 })
        const u = unitOf(user)
        if (u === unitId) return
        outside.set(u, (outside.get(u) ?? 0) + 1)
        edges.push({ source: `unit:${u}`, target, w: 1 })
      })
    })
    return { files, outside: [...outside], edges }
  }

  return {
    R,
    OWN_CAP,
    SLOT_GROUPS,
    SLOT_MEANING,
    tokens,
    state,
    isGotcha,
    facts,
    candidates,
    byKey,
    live,
    governing,
    unitOf,
    unitGroup,
    units,
    areaOf,
    areas,
    territories,
    territoryOf,
    tree,
    findNode,
    under,
    briefing,
    dependents,
    snapshot: ownSnapshot,
    packOwner,
    dependentFacts,
    provenance,
    stats,
    curationCount,
    codeChanges,
    memory,
    frecency,
    header,
    appendRecord,
    awareness,
    words,
    headerText,
    actor,
    writable,
    checks,
    promoteRun,
    reconcile,
    why,
    health,
    activity,
    unitGraph,
  fileGraph,
  }
}
