// @atlas/genesis — src/open-questions.ts  (R11: the open ratification questions, derived from the store)
//
// `assembleInterview` (align.ts) batches and caps OPEN questions, but nothing produced them. This module derives them
// from the live store's facts, with the four kinds and the rules the Atlas screen's interview uses
// (specs/atlas-ui/mock/views-explore.js `interview()`, DECISIONS.md D17):
//   owner     — a unit nobody owns.
//   tier      — a T2 fact whose slot is invariant, contract or security-property: a candidate rule.
//   contested — two or more live facts on the same file with the same slot.
//   intent    — a unit with no `rationale` fact.
// Ranked by blast × tier weight (T0 3, T1 2, T2 1), where blast is how many files depend on a file in the code index.
// PURE: the caller supplies the facts, the owner lookup and the blast lookup; nothing here reads a store or a file.
//
// A question's `id` is the kernel content hash of its kind and subject, so the same open question carries the same id
// in every session — which is what lets an answered question drop out of the next batch.

import type { Tier } from "@atlas/contracts"
import { nodeHashOfPath } from "@atlas/index"
import { asSubtreeHash, id } from "@atlas/kernel"
import type { OpenQ } from "./types.js"

/** One live fact, as the question rules read it. */
export interface QuestionFact {
  readonly nodeKey: string
  /** The file the fact is anchored in: its primary anchor up to the first `::`. */
  readonly file: string
  readonly slot?: string
  readonly tier: Tier
  /** The fact's first claim. */
  readonly claim: string
}

/** What the rules read. */
export interface QuestionInput {
  readonly facts: readonly QuestionFact[]
  /** The unit's owner, or `""` when nobody owns it. */
  readonly ownerOf: (unit: string) => string
  /** How many files depend on `file` in the code index (0 when it knows none). */
  readonly blast: (file: string) => number
  /** Ids of questions already answered; they are not asked again. */
  readonly answered: ReadonlySet<string>
}

/** One open question, ready to serve: the frozen `OpenQ` plus what a person needs to answer it. */
export interface RankedQuestion extends OpenQ {
  readonly id: string
  /** The unit id (owner, intent), the nodeKey (tier), or `<file>|<slot>` (contested). */
  readonly subject: string
  readonly ask: string
  readonly rank: number
  /** The fact a `tier` question is about; the first fact of a `contested` group. */
  readonly nodeKey?: string
}

const TIER_WEIGHT: Readonly<Record<Tier, number>> = { T0: 3, T1: 2, T2: 1 }
const RULE_SLOTS: ReadonlySet<string> = new Set(["invariant", "contract", "security-property"])
const ROOT_UNIT = "(root)"

/** The unit a file belongs to: `<top>/<name>` under `packages`, `docs` or `harness` when the path is deeper than two
 *  segments, else the shared root unit — the grain the Atlas screen groups by (mock `model.js` `unitOf`). */
export function unitOfFile(file: string): string {
  const parts = file.split("/")
  return ["packages", "docs", "harness"].includes(parts[0] ?? "") && parts.length > 2 ? `${parts[0]}/${parts[1]}` : ROOT_UNIT
}

/** Every open question for these facts, unanswered ones only, highest rank first (ties keep the kind order
 *  owner → tier → contested → intent, then input order). */
export function deriveOpenQuestions(input: QuestionInput): readonly RankedQuestion[] {
  const units = unitsOf(input.facts)
  const unitBlast = (files: ReadonlySet<string>): number => [...files].reduce((n, f) => n + input.blast(f), 0)

  const owner = units
    .filter((u) => input.ownerOf(u.id) === "")
    .map((u) => {
      const b = unitBlast(u.files)
      return question("owner", u.id, directorySite(u.id), {
        ask: `Who owns ${u.id}?`,
        options: ["seat:orchestrator", "a person on the team", "nobody yet"],
        rank: b,
        rankReason: `${u.facts} facts, ${b} files depend on it, no owner named`,
      })
    })

  const tier = input.facts
    .filter((f) => f.tier === "T2" && f.slot !== undefined && RULE_SLOTS.has(f.slot))
    .map((f) =>
      question("tier", f.nodeKey, fileSite(f.file), {
        ask: `Make this a rule? “${f.claim.length > 200 ? `${f.claim.slice(0, 199)}…` : f.claim}”`,
        options: ["Rule · T1", "Core · T0", "Keep as a hint"],
        rank: input.blast(f.file) * TIER_WEIGHT.T0,
        rankReason: `${f.slot}, ${input.blast(f.file)} files depend on its file`,
        nodeKey: f.nodeKey,
      }),
    )

  const contested = groupsOf(input.facts)
    .filter((xs) => xs.length > 1)
    .map((xs) => {
      const first = xs[0]!
      const second = xs[1]!
      return question("contested", `${first.file}|${first.slot}`, fileSite(first.file), {
        ask: `Two ${first.slot} claims on ${first.file.split("/").pop()}: which holds?`,
        options: [`“${first.claim.slice(0, 70)}…”`, `“${second.claim.slice(0, 70)}…”`, "Both"],
        rank: input.blast(first.file) * Math.max(...xs.map((x) => TIER_WEIGHT[x.tier] ?? 1)),
        rankReason: `${xs.length} claims share one slot`,
        nodeKey: first.nodeKey,
      })
    })

  const intent = units
    .filter((u) => !u.rationale)
    .map((u) => {
      const b = unitBlast(u.files)
      return question("intent", u.id, directorySite(u.id), {
        ask: `What is ${u.id} for?`,
        rank: b,
        rankReason: `no rationale among its ${u.facts} facts`,
      })
    })

  return [...owner, ...tier, ...contested, ...intent]
    .filter((q) => !input.answered.has(q.id))
    .sort((a, b) => b.rank - a.rank)
}

interface Unit {
  readonly id: string
  readonly facts: number
  readonly files: ReadonlySet<string>
  readonly rationale: boolean
}

/** The units the facts fall in (the root unit excluded), most facts first — mock `units()`. */
function unitsOf(facts: readonly QuestionFact[]): readonly Unit[] {
  const byId = new Map<string, { facts: number; files: Set<string>; rationale: boolean }>()
  facts.forEach((f) => {
    const unit = unitOfFile(f.file)
    if (unit === ROOT_UNIT) return
    const u = byId.get(unit) ?? { facts: 0, files: new Set<string>(), rationale: false }
    u.facts += 1
    u.files.add(f.file)
    u.rationale = u.rationale || f.slot === "rationale"
    byId.set(unit, u)
  })
  return [...byId.entries()].map(([unit, u]) => ({ id: unit, ...u })).sort((a, b) => b.facts - a.facts)
}

/** Facts that carry a slot, grouped by `<file>|<slot>` in first-seen order — mock `same`. */
function groupsOf(facts: readonly QuestionFact[]): readonly (readonly QuestionFact[])[] {
  const groups = new Map<string, QuestionFact[]>()
  facts
    .filter((f) => f.slot !== undefined)
    .forEach((f) => {
      const key = `${f.file}|${f.slot}`
      groups.set(key, [...(groups.get(key) ?? []), f])
    })
  return [...groups.values()]
}

function question(
  kind: OpenQ["kind"],
  subject: string,
  site: OpenQ["site"],
  rest: {
    readonly ask: string
    readonly options?: readonly string[]
    readonly rank: number
    readonly rankReason: string
    readonly nodeKey?: string
  },
): RankedQuestion {
  return { id: String(id({ kind, subject })), kind, subject, site, ...rest }
}

function fileSite(path: string): OpenQ["site"] {
  return { kind: "file", qualifiedPath: path, subtreeHash: asSubtreeHash(nodeHashOfPath(path)) }
}

function directorySite(path: string): OpenQ["site"] {
  return { kind: "directory", qualifiedPath: path, subtreeHash: asSubtreeHash(nodeHashOfPath(path)) }
}
