// @atlas/genesis — src/align.ts  (WP-8.29.GEN · GEN-5 — candidate-only writes + one batched ratification pass)
//
// Genesis MAY write only CANDIDATES; a `T0` / contested fact reaches `ratified` ONLY through S3's batched,
// ranked human interview — NEVER auto-promoted, NEVER one question at a time (atlas-genesis §S3, INV-GEN-5).
// This facet models the ratify-router as an ENUMERABLE edge set whose sole `candidate→ratified` edge passes
// through `interview`, writes every produced seed as a `candidate` (whatever its confidence), and assembles
// the OPEN questions into ONE batched interview capped at the top-20/session — the tail deferred. Co-locates
// the frozen `AlignApi`. It FEEDS the batch to the injected human `Ratifier`; ratification routing is not
// defined here.

import type { Fact, OpenQ, Ratified } from "./types.js"

export interface AlignApi {
  /** S3 batched, ranked ratification (GEN-5). Consumes the OPEN questions (ranked by blast×tier) and
   *  returns the human-RATIFIED facts (KNOW-8). The ONLY edge candidate→ratified for a `T0` / contested
   *  fact passes THROUGH here — no auto-promote path exists; the batch is served together (size > 1),
   *  never one question at a time. Capped at the top 20 Q/session; the tail defers or defaults to
   *  `T0-strict deny`. */
  interview(open: readonly OpenQ[]): readonly Ratified[]
}

/**
 * The genesis-domain write status (GEN-5). A genesis write is ALWAYS a `candidate`; `ratified` is reachable
 * ONLY through the human interview edge (never auto-promoted). NOT the @atlas/contracts invariant `Status`.
 */
export type Candidacy = "candidate" | "ratified"

/** A written genesis object — the seeded fact plus its candidacy. Genesis writes only `candidate` (GEN-5a). */
export interface Written {
  readonly status: Candidacy
  readonly fact: Fact
}

/** The top-`20`-questions-per-session cap on the ratification interview (GEN-5, atlas-genesis §S3). */
export const INTERVIEW_CAP = 20 as const

/**
 * One batched, ranked ratification interview (GEN-5). Carries the questions TOGETHER (size > 1 when there is
 * more than one open question) — never a single-question drip. `questions` preserve the caller's blast×tier
 * rank order; the batch is capped at `cap` per session.
 */
export interface InterviewBatch {
  readonly questions: readonly OpenQ[]
  readonly cap: number
}

/** The assembled interview: the capped batch plus the deferred tail (next session / `T0`-strict deny). */
export interface AssembledInterview {
  readonly batch: InterviewBatch
  readonly deferred: readonly OpenQ[]
}

/**
 * The human ratifier seam (KNOW-8, GEN-5). The batch is FED to it; it returns the human-ratified facts.
 * Ratification routing / tiers are NOT defined here (card exclusions) — this WP only assembles + feeds.
 */
export interface Ratifier {
  ratify(batch: InterviewBatch): readonly Ratified[]
}

/** The injected seams this facet calls. Nothing here is authored by this WP — it feeds the batch. */
export interface AlignDeps {
  readonly ratifier: Ratifier
}

/** A ratify-router state (GEN-5c). A produced seed is `proposed`, written to `candidate`, ratified only via the interview. */
export type RatifyState = "proposed" | "candidate" | "ratified"

/** One router edge (GEN-5c). `via` is CLOSED to `write | interview` — no auto-promote transition is expressible. */
export interface RouterEdge {
  readonly from: RatifyState
  readonly to: RatifyState
  readonly via: "write" | "interview"
}

/**
 * The ratify-router edge set (GEN-5c). Genesis writes candidates (`proposed→candidate`, via `write`); the
 * ONLY `candidate→ratified` transition passes through the human `interview`. There is NO `auto_promote`
 * edge — a `T0` / contested candidate cannot reach `ratified` without the interview.
 */
export const ROUTER_EDGES: readonly RouterEdge[] = [
  { from: "proposed", to: "candidate", via: "write" },
  { from: "candidate", to: "ratified", via: "interview" },
]

/**
 * GEN-5a — write every produced seed as a `candidate`. A high-confidence seed is STILL a candidate: no
 * self-declaration promotes a write to `ratified` (the only promotion edge is the human interview, GEN-5c).
 */
export function writeCandidates(facts: readonly Fact[]): readonly Written[] {
  return facts.map((fact) => ({ status: "candidate" as const, fact }))
}

/**
 * GEN-5b/5d — assemble the OPEN questions into ONE batched, ranked interview: the top `INTERVIEW_CAP`
 * questions (rank order preserved) served together; the remainder deferred to the next session. Never emits
 * a one-question-at-a-time drip — the batch is a single object.
 */
export function assembleInterview(open: readonly OpenQ[]): AssembledInterview {
  const questions = open.slice(0, INTERVIEW_CAP)
  const deferred = open.slice(INTERVIEW_CAP)
  return { batch: { questions, cap: INTERVIEW_CAP }, deferred }
}

/** GEN-5c — the router edges that reach `ratified`. Exactly one, and it is `via:'interview'`. */
export function edgesToRatified(): readonly RouterEdge[] {
  return ROUTER_EDGES.filter((e) => e.to === "ratified")
}

/** GEN-5c — no auto-promote path exists: a candidate never reaches `ratified` without the human interview. */
export function canAutoPromote(): boolean {
  return false
}

/**
 * Bind the batched ratification to the frozen `AlignApi` (above) — `interview(open): Ratified[]`.
 * Assembles ONE batch and feeds the injected human `Ratifier` EXACTLY ONCE (never one question at a time),
 * returning the human-ratified facts (KNOW-8). The deferred tail is dropped from this session's result
 * (it re-surfaces next session / defaults to `T0`-strict deny — the uncovered-path rule).
 */
export function makeAlign(deps: AlignDeps): AlignApi {
  return {
    interview: (open: readonly OpenQ[]): readonly Ratified[] => {
      const { batch } = assembleInterview(open)
      return deps.ratifier.ratify(batch) // fed as ONE batch — never a per-question drip (GEN-5d)
    },
  }
}

// differential-vs-oracle (compile-time): `makeAlign` conforms to the frozen AlignApi surface.
const _align: (deps: AlignDeps) => AlignApi = makeAlign
void _align
