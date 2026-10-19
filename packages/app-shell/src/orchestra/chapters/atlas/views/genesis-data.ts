import type { useLanguage } from "@/context/language"
import type { AtlasFact, AtlasModel } from "../atlas-model"
import type { AtlasInterviewQuestion } from "../atlas-types"
import { num } from "../kit/format"

// Genesis is the `atlas mine` command (cli/src/map.ts:133): it proposes claims into staging and never writes
// knowledge; `atlas promote` is the separate, governed step that turns staged rows into facts. This file is the pure
// port of specs/atlas-ui/mock/views-explore.js:288-372 for views/genesis.tsx. Every visible word is a copy key
// (i18n/orchestra-chapters/atlas-genesis.ts); `refs`, `env` and option values are machine text.
type CopyKey = Parameters<ReturnType<typeof useLanguage>["t"]>[0]
export type GenesisCopy = { key: CopyKey; params: Record<string, string> }
export type GenesisQuestion = {
  kind: "owner" | "tier" | "contested" | "intent"
  site: string
  // The fact the question is about (tier and contested only).
  key?: string
  ask: GenesisCopy
  why: GenesisCopy
  // The answers to pick from; null asks for one sentence instead (intent).
  options: GenesisCopy[] | null
  rank: number
}

// genesis/src/align.ts: at most 20 questions are served per session; the tail waits for the next one.
export const INTERVIEW_CAP = 20
// `atlas answer` opens a ratification proposal only for the exact answers T1 and T0 (cli/src/interview-cli.ts:64).
// The engine's tier options read "Rule · T1", "Core · T0" and "Keep as a hint", so the first two are sent as the
// tier itself; every other pick is sent as its own text.
const TIER_ANSWERS = ["T1", "T0"]
export function interviewAnswer(question: Pick<AtlasInterviewQuestion, "kind" | "options">, index: number) {
  if (question.kind === "tier" && index < TIER_ANSWERS.length) return TIER_ANSWERS[index]
  return question.options?.[index] ?? ""
}
export const PROMOTE_COMMAND = "ATLAS_RATIFY_TOKEN=… atlas promote"

// Who does a stage's work: code, the model, or you. [copy key, tone].
export const HOW = {
  det: ["orchestra.atlas.genesis.how.det", "good"],
  llm: ["orchestra.atlas.genesis.how.llm", "blue"],
  you: ["orchestra.atlas.genesis.how.you", "warm"],
} as const

// The six stages of a run, in the order the code runs them, with this store's number for each. `ceiling` means
// `n` is an upper bound ("≤ 200").
export function stages(model: AtlasModel) {
  const files = model.health().index.configured.reduce((n, c) => n + c.files, 0)
  const total = model.facts.length + model.candidates.length
  const proven = [...model.facts, ...model.candidates].filter((x) => x.seal === "proven").length
  return [
    {
      id: "scan",
      icon: "code",
      how: "det",
      n: files,
      ceiling: false,
      title: "orchestra.atlas.genesis.stage.scan",
      unit: "orchestra.atlas.genesis.stage.scan.unit",
      params: {},
      what: "orchestra.atlas.genesis.stage.scan.what",
      facts: ["orchestra.atlas.genesis.stage.scan.fact.1", "orchestra.atlas.genesis.stage.scan.fact.2"],
      refs: "index/src/types.ts:114 · adapter-io/src/skeleton-source.ts:129",
    },
    {
      id: "rank",
      icon: "graph",
      how: "det",
      n: 200,
      ceiling: true,
      title: "orchestra.atlas.genesis.stage.rank",
      unit: "orchestra.atlas.genesis.stage.rank.unit",
      params: {},
      what: "orchestra.atlas.genesis.stage.rank.what",
      facts: [
        "orchestra.atlas.genesis.stage.rank.fact.1",
        "orchestra.atlas.genesis.stage.rank.fact.2",
        "orchestra.atlas.genesis.stage.rank.fact.3",
      ],
      refs: "adapter-io/src/git-history.ts:206 · genesis/src/rank.ts:291,342,396 · run-controller.ts:95",
    },
    {
      id: "propose",
      icon: "sparkle",
      how: "llm",
      n: total,
      ceiling: false,
      title: "orchestra.atlas.genesis.stage.propose",
      unit: "orchestra.atlas.genesis.stage.propose.unit",
      params: {},
      what: "orchestra.atlas.genesis.stage.propose.what",
      facts: [
        "orchestra.atlas.genesis.stage.propose.fact.1",
        "orchestra.atlas.genesis.stage.propose.fact.2",
        "orchestra.atlas.genesis.stage.propose.fact.3",
      ],
      refs: "adapter-io/src/llm.ts:345 · genesis/src/drive.ts:32 · cli/src/mine.ts:444",
    },
    {
      id: "check",
      icon: "shield",
      how: "det",
      n: proven,
      ceiling: false,
      title: "orchestra.atlas.genesis.stage.check",
      unit: "orchestra.atlas.genesis.stage.check.unit",
      params: {},
      what: "orchestra.atlas.genesis.stage.check.what",
      facts: [
        "orchestra.atlas.genesis.stage.check.fact.1",
        "orchestra.atlas.genesis.stage.check.fact.2",
        "orchestra.atlas.genesis.stage.check.fact.3",
      ],
      refs: "adapter-io/src/llm.ts:456 · genesis/src/admit-harness.ts:330-403,505 · cli/src/mine-gate.ts:181",
    },
    {
      id: "stage",
      icon: "inbox",
      how: "det",
      n: total,
      ceiling: false,
      title: "orchestra.atlas.genesis.stage.stage",
      unit: "orchestra.atlas.genesis.stage.stage.unit",
      params: {},
      what: "orchestra.atlas.genesis.stage.stage.what",
      facts: ["orchestra.atlas.genesis.stage.stage.fact.1", "orchestra.atlas.genesis.stage.stage.fact.2"],
      refs: "cli/src/mine-decide.ts:107-268 · genesis/src/coverage.ts:166",
    },
    {
      id: "accept",
      icon: "check",
      how: "you",
      n: model.facts.length,
      ceiling: false,
      title: "orchestra.atlas.genesis.stage.accept",
      unit: "orchestra.atlas.genesis.stage.accept.unit",
      params: { waiting: num(model.candidates.length) },
      what: "orchestra.atlas.genesis.stage.accept.what",
      facts: [
        "orchestra.atlas.genesis.stage.accept.fact.1",
        "orchestra.atlas.genesis.stage.accept.fact.2",
        "orchestra.atlas.genesis.stage.accept.fact.3",
      ],
      refs: "adapter-io/src/governed-promote.ts:121-170 · knowledge/src/bands.ts:41",
    },
  ] as const
}

// The five kinds (arms). The default three run one after another (mine-proposer.ts:140).
export const KINDS = [
  {
    id: "advisory",
    on: true,
    name: "orchestra.atlas.genesis.kind.advisory",
    model: "orchestra.atlas.genesis.kind.advisory.model",
    check: "orchestra.atlas.genesis.kind.advisory.check",
    lands: "orchestra.atlas.genesis.lands.hint",
  },
  {
    id: "dependency",
    on: true,
    name: "orchestra.atlas.genesis.kind.dependency",
    model: "orchestra.atlas.genesis.kind.dependency.model",
    check: "orchestra.atlas.genesis.kind.dependency.check",
    lands: "orchestra.atlas.genesis.lands.proven",
  },
  {
    id: "count",
    on: true,
    name: "orchestra.atlas.genesis.kind.count",
    model: "orchestra.atlas.genesis.kind.count.model",
    check: "orchestra.atlas.genesis.kind.count.check",
    lands: "orchestra.atlas.genesis.lands.proven",
  },
  {
    id: "definition",
    on: false,
    name: "orchestra.atlas.genesis.kind.definition",
    model: "orchestra.atlas.genesis.kind.definition.model",
    check: "orchestra.atlas.genesis.kind.definition.check",
    lands: "orchestra.atlas.genesis.lands.proven",
  },
  {
    id: "semantic",
    on: false,
    name: "orchestra.atlas.genesis.kind.semantic",
    model: "orchestra.atlas.genesis.kind.semantic.model",
    check: "orchestra.atlas.genesis.kind.semantic.check",
    lands: "orchestra.atlas.genesis.lands.justified",
  },
] as const

// The environment variables `atlas mine` reads. `options` are [label key, value]; null is a free value (budget,
// model). The query holds each chosen value as k-<id>.
export const KNOBS = [
  {
    id: "kinds",
    label: "orchestra.atlas.genesis.knob.kinds",
    help: "orchestra.atlas.genesis.knob.kinds.help",
    env: "ATLAS_MINE_SLOT",
    options: [
      ["orchestra.atlas.genesis.knob.kinds.default", ""],
      ["orchestra.atlas.genesis.kind.advisory", "advisory"],
      ["orchestra.atlas.genesis.kind.dependency", "dependency"],
      ["orchestra.atlas.genesis.kind.count", "count"],
      ["orchestra.atlas.genesis.kind.definition", "definition"],
      ["orchestra.atlas.genesis.kind.semantic", "semantic"],
    ],
  },
  {
    id: "budget",
    label: "orchestra.atlas.genesis.knob.budget",
    help: "orchestra.atlas.genesis.knob.budget.help",
    env: "ATLAS_MINE_BUDGET",
    options: null,
  },
  {
    id: "enrich",
    label: "orchestra.atlas.genesis.knob.enrich",
    help: "orchestra.atlas.genesis.knob.enrich.help",
    env: "ATLAS_ENRICH",
    options: [
      ["orchestra.atlas.genesis.knob.enrich.off", ""],
      ["orchestra.atlas.genesis.knob.enrich.on", "1"],
    ],
  },
  {
    id: "proposals",
    label: "orchestra.atlas.genesis.knob.proposals",
    help: "orchestra.atlas.genesis.knob.proposals.help",
    env: "ATLAS_TASK_PROPOSALS",
    options: [
      ["orchestra.atlas.genesis.knob.proposals.model", ""],
      ["orchestra.atlas.genesis.knob.proposals.file", "proposals.json"],
    ],
  },
  {
    id: "frontier",
    label: "orchestra.atlas.genesis.knob.frontier",
    help: "orchestra.atlas.genesis.knob.frontier.help",
    env: "ATLAS_FRONTIER",
    options: [
      ["orchestra.atlas.genesis.knob.frontier.files", ""],
      ["orchestra.atlas.genesis.knob.frontier.symbols", "symbol"],
    ],
  },
  {
    id: "model",
    label: "orchestra.atlas.genesis.knob.model",
    help: "orchestra.atlas.genesis.knob.model.help",
    env: "ATLAS_MODEL_CONFIG",
    options: null,
  },
] as const
export type GenesisConf = Record<(typeof KNOBS)[number]["id"], string>

// The knob values the query holds (k-<id>), "" when unset.
export function genesisConf(query: Record<string, string>) {
  return Object.fromEntries(KNOBS.map((knob) => [knob.id, query[`k-${knob.id}`] ?? ""])) as GenesisConf
}

// The query of a Genesis link: every knob plus the patch, as the mock's qs(). atlasHref drops the empty values.
export function genesisQuery(conf: GenesisConf, patch: Record<string, string>) {
  return { ...Object.fromEntries(KNOBS.map((knob) => [`k-${knob.id}`, conf[knob.id]])), ...patch }
}

// `atlas mine .` behind the chosen knobs as environment variables, in knob order.
export function mineCommand(conf: Partial<GenesisConf>) {
  return [...KNOBS.filter((knob) => conf[knob.id]).map((knob) => `${knob.env}=${conf[knob.id]}`), "atlas mine ."].join(" ")
}

// The numbers the stage panels and the kinds note show.
export function storeCounts(model: AtlasModel) {
  const all = [...model.facts, ...model.candidates]
  return {
    all: all.length,
    proven: all.filter((x) => x.seal === "proven").length,
    justified: all.filter((x) => x.seal === "justified").length,
    folders: Object.keys(model.R.children).length,
    // The mock printed the dependentCount map itself; the number of links is the sum of its counts.
    links: Object.values(model.R.dependentCount).reduce((n, count) => n + count, 0),
  }
}

// The propose stage's sample: the first live fact that kept the model's answer. Reasoning is not in the snapshot
// (D3), so the mock's "first answer that mentions a refutation" would need every answer; the first one is used.
export const sampleFact = (model: AtlasModel) => model.live().find((x) => x.why)

// The first 900 characters of a model answer, split around its first refutation mention so the view can mark it
// without innerHTML. `more` says the answer was cut.
export function markRefutation(text: string) {
  const head = text.slice(0, 900)
  const match = /(Refutation pass:?|refut\w*)/i.exec(head)
  const at = match?.index ?? head.length
  const mark = match?.[0] ?? ""
  return { before: head.slice(0, at), mark, after: head.slice(at + mark.length), more: text.length > 900 }
}

const WEIGHT: Record<string, number> = { T0: 3, T1: 2, T2: 1 }
const RULE_SLOTS = ["invariant", "contract", "security-property"]
const copy = (key: CopyKey, params: Record<string, string> = {}): GenesisCopy => ({ key, params })

// The ratification interview (genesis/src/align.ts, atlas-genesis S3): open questions of four kinds, ranked by
// blast × tier weight, where blast is how many files depend on the site. The top INTERVIEW_CAP form this session's
// batch; the rest are deferred. Nothing serves assembleInterview yet (R11), so the questions are drafted from the store.
export function openQuestions(model: AtlasModel) {
  const blast = (file: string) => (model.R.dependents[file] ?? []).length
  const unitBlast = (files: Set<string>) => [...files].reduce((n, file) => n + blast(file), 0)
  const live = model.live()
  const units = model.units().filter((u) => u.id !== "(root)")
  const owner = units
    .filter((u) => !model.territoryOf(u.id)?.owner)
    .map(
      (u): GenesisQuestion => ({
        kind: "owner",
        site: u.id,
        ask: copy("orchestra.atlas.genesis.iv.owner.ask", { unit: u.id }),
        why: copy("orchestra.atlas.genesis.iv.owner.why", { facts: num(u.facts), blast: num(unitBlast(u.files)) }),
        options: [
          copy("orchestra.atlas.genesis.iv.owner.option.seat", { seat: model.actor }),
          copy("orchestra.atlas.genesis.iv.owner.option.person"),
          copy("orchestra.atlas.genesis.iv.owner.option.nobody"),
        ],
        rank: unitBlast(u.files),
      }),
    )
  const tier = live
    .filter((x) => x.tier === "T2" && RULE_SLOTS.includes(x.slot ?? ""))
    .map(
      (x): GenesisQuestion => ({
        kind: "tier",
        site: x.file,
        key: x.key,
        ask: copy("orchestra.atlas.genesis.iv.tier.ask", { claim: x.claim.length > 200 ? `${x.claim.slice(0, 199)}…` : x.claim }),
        why: copy("orchestra.atlas.genesis.iv.tier.why", { slot: x.slot ?? "", blast: num(blast(x.file)) }),
        options: [
          copy("orchestra.atlas.genesis.iv.tier.option.rule"),
          copy("orchestra.atlas.genesis.iv.tier.option.core"),
          copy("orchestra.atlas.genesis.iv.tier.option.hint"),
        ],
        rank: blast(x.file) * WEIGHT.T0,
      }),
    )
  // Live facts on one file in one slot, in first-seen order.
  const groups = live.reduce(
    (map, x) => map.set(`${x.file}|${x.slot}`, [...(map.get(`${x.file}|${x.slot}`) ?? []), x]),
    new Map<string, AtlasFact[]>(),
  )
  const contested = [...groups.values()]
    .filter((xs) => xs.length > 1 && xs[0].slot)
    .map(
      (xs): GenesisQuestion => ({
        kind: "contested",
        site: xs[0].file,
        key: xs[0].key,
        ask: copy("orchestra.atlas.genesis.iv.contested.ask", { slot: xs[0].slot ?? "", file: xs[0].file.split("/").at(-1) ?? "" }),
        why: copy("orchestra.atlas.genesis.iv.contested.why", { n: num(xs.length) }),
        options: [
          copy("orchestra.atlas.genesis.iv.contested.option", { claim: xs[0].claim.slice(0, 70) }),
          copy("orchestra.atlas.genesis.iv.contested.option", { claim: xs[1].claim.slice(0, 70) }),
          copy("orchestra.atlas.genesis.iv.contested.option.both"),
        ],
        rank: blast(xs[0].file) * Math.max(...xs.map((x) => WEIGHT[x.tier] ?? 1)),
      }),
    )
  const intent = units
    .filter((u) => !live.some((x) => model.unitOf(x.file) === u.id && x.slot === "rationale"))
    .map(
      (u): GenesisQuestion => ({
        kind: "intent",
        site: u.id,
        ask: copy("orchestra.atlas.genesis.iv.intent.ask", { unit: u.id }),
        why: copy("orchestra.atlas.genesis.iv.intent.why", { facts: num(u.facts) }),
        options: null,
        rank: unitBlast(u.files),
      }),
    )
  // Array sort is stable: equal ranks keep the order owner, tier, contested, intent.
  const open = [...owner, ...tier, ...contested, ...intent].sort((a, b) => b.rank - a.rank)
  return {
    batch: open.slice(0, INTERVIEW_CAP),
    deferred: open.slice(INTERVIEW_CAP),
    counts: { owner: owner.length, tier: tier.length, contested: contested.length, intent: intent.length },
  }
}
