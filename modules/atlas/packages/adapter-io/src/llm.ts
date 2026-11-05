// @atlas/adapter-io — src/llm.ts  (ADAPT-LLM-1: the single bounded S2 site proposer)
//
// The raw llm adapter: the one bounded LLM entry — the S2 `SiteProposer` (@atlas/genesis), invoked once
// per visited site (the driver calls `propose` EXACTLY ONCE per site; extract.ts:105-113). This module is
// the SOLE model seam: the `ModelClient` port lives ONLY here, which is what makes golden 11a's "a model is
// invoked only via SiteProposer.propose" a mechanical module-graph audit. The prompt and the budget stay
// INJECTED — this file hardcodes no prompt and names no vendor.
//
// [ADR-0011 / D5] The ONE concrete `ModelClient` also lives here, and it must: golden 11a asserts that
// `ModelClient` is referenced by exactly ONE src module, so a sibling adapter file would turn that audit
// red. `createCommandClient` runs an OPERATOR-SUPPLIED command (`execFileSync`, NO shell, argv never
// interpolated — the `run-git.ts:25` seam's shape). Consequently this module DOES now reach a process
// primitive; it still reaches no network and no clock of its own, and it still names no model.

import { execFileSync } from "node:child_process"

import { isSemanticSlot } from "@atlas/knowledge"
import type { StructRef } from "@atlas/contracts"
import type { Candidate, SeedProposal, SiteProposer } from "@atlas/genesis"
import { ModelCommandError, salvageEarlyExit, classifyModelFailure, describeModelFailure } from "./llm-command-failure.js"
import type { ModelCommand } from "./llm-command-failure.js"

export { ModelCommandError } from "./llm-command-failure.js"
export type { ModelCommand, ModelFailure } from "./llm-command-failure.js"

/**
 * [#201/#202] The explicit abstention token. Measured: with a real model, "output NOTHING to abstain"
 * NEVER fired — 0 abstentions in 300 calls across two prompts (#202), because a model resists producing
 * empty output and instead emits a one-line PROSE refusal ("No fact qualifies", "Nothing non-obvious here"),
 * which the sanity gate below then admits as a fabricated CLAIM (#201). An empty answer is not a channel a
 * responsive model will use. So the prompt gives it a POSITIVE abstention ACTION — emit this token — and the
 * gate maps that token back to the same GEN-12 model-abstained outcome as empty stdout. This is the I-CALM
 * lever the prompt already cites (explicitly rewarding "no answer" improves selective behaviour): the token
 * IS the reward.
 *
 * MATCHING — `isAbstainToken` below. Compared case-INSENSITIVELY, and only after stripping surrounding
 * FORMATTING/PUNCTUATION from the ends (backticks, quotes, asterisks, brackets, trailing period). That end-
 * strip is not cosmetic: it was MEASURED (#201/#202 sentinel probe, 2026-08-11) — Sonnet 4.6 abstained on
 * 5/6 trivial units with a bare `NO-FACT` and on the 6th emitted the same token wrapped in markdown
 * backticks (`` `NO-FACT` ``), which a whole-answer equality check would have miscounted as a fabricated
 * fact. The strip touches only the ENDS, so an answer with any real WORDS beyond the token (e.g. "NO-FACT is
 * returned when the cache is cold") keeps a non-empty remainder and stays a CLAIM — there is no substring
 * path that could swallow a genuine fact.
 *
 * COUPLING: both shipped prompt templates MUST instruct this exact token; `llm.test.ts` and `prompt.test.ts`
 * pin that (the prompt says the word, the gate reads the word — change one, a test goes red).
 */
export const ABSTAIN_SENTINEL = "NO-FACT"

/** True iff the whole answer is the abstain sentinel, ignoring case and surrounding formatting/punctuation
 *  (see `ABSTAIN_SENTINEL`). Interior words survive the end-strip, so only a bare (optionally wrapped) token
 *  abstains — never an answer that merely mentions it. */
export function isAbstainToken(answer: string): boolean {
  const trimmed = answer.trim()
  const wrapper = /[\s`'"*.[\](){}]/
  // Index scans instead of an end-anchored regex: `[...]+$` retries from every wrapper run in the answer (quadratic).
  let start = 0
  let end = trimmed.length
  while (start < end && wrapper.test(trimmed[start]!)) start++
  while (end > start && wrapper.test(trimmed[end - 1]!)) end--
  return trimmed.slice(start, end).toUpperCase() === ABSTAIN_SENTINEL
}

/** The bounded spend envelope for the one call — a hard cost cap + a wall-clock timeout (ADAPT-LLM-1). */
export interface LlmBudget {
  readonly costCap: number
  readonly timeoutMs: number
}

/**
 * The raw model verdict at a site: bounded claims, or `null` when the model ABSTAINED here (GEN-12).
 *
 * [#195 leg (c)] The claim is only produced AFTER the admission sanity gate (`admitModelAnswer`) passes on
 * the raw stdout bytes. Two provenance carriers ride alongside it so W-MINE can trace a fact back to what
 * produced it, and W-MINE can build a grounded abstention when it cannot:
 *   - `rawAnswer` — the canonical accepted proposal envelope for block-format completions, or the exact
 *     validated line-format bytes. Present ONLY when `claim !== null`. Downstream (W-MINE) scrubs this and
 *     puts it to CAS; this seam never touches CAS. Surrounding scratch and unknown block fields are discarded.
 *   - `abstainReason` — on a MALFORMED-answer abstention, the sub-reason a grounded `WhyNot('answer-malformed')`
 *     is built from (`'answer-malformed:not-utf8'` | `'answer-malformed:multi-response'`). The plain GEN-12
 *     model-abstained case (empty / whitespace-only stdout) stays UNTAGGED (`undefined`): an empty answer is
 *     the model declining to answer, not a corruption of one.
 */
export interface CompletionResult {
  readonly claim: string | null //          null ⇒ the model abstained at this site
  readonly claims?: readonly {
    readonly claim: string
    readonly slot?: unknown
    readonly derivation?: unknown
  }[] //                                   collection envelope; claim keeps its first item for legacy callers
  readonly rawAnswer?: string //             accepted envelope / validated line; present iff claim !== null
  readonly abstainReason?: string //         a malformed-answer sub-reason; undefined for a plain GEN-12 abstain
}

/** The single, synchronous model seam — one bounded completion per prompt (matches the frozen sync
 *  `SiteProposer.propose`; the concrete async binding is D5/wire's concern). Referenced by ONE src module
 *  (this one) — the sole model entry point in the whole system (ADAPT-LLM-1, golden 11a). */
export interface ModelClient {
  complete(prompt: string, budget: LlmBudget): CompletionResult
}

/**
 * The outcome of turning a model's raw CLAIM line into a typed `SeedProposal` — or a grounded ABSTENTION
 * when the claim does not match the arm's expected grammar. A `ClaimParser` is the seam that makes ONE
 * proposer binary serve every fact family (ADR-0017): the advisory arm parses every claim as an advisory
 * seed; the dependency arm parses the closed `DEPENDS-ON:` grammar into a typed dependency `PredicateSeed`
 * and abstains on anything else. The parser NEVER admits — admission is the gate's alone (GEN-4/12).
 */
export type ClaimParser = (
  claim: string,
  cand: Candidate,
  rawAnswer?: string,
  fields?: { readonly slot: unknown; readonly derivation: unknown },
) => SeedProposal | { readonly abstain: string }

/** The DEFAULT arm: every non-abstaining claim is an ADVISORY seed (the ORIGINAL, byte-identical shape). The
 *  `rawAnswer` provenance rides through unchanged (#195c). This is what `createSiteProposer` uses when no
 *  parser is injected, so the shipped advisory mine is unaffected by the dependency arm's existence. */
export const advisoryClaimParser: ClaimParser = (claim, cand, rawAnswer) => ({
  cand,
  claim,
  ...(rawAnswer !== undefined ? { rawAnswer } : {}),
})

/**
 * The DEPENDENCY grammar (ADR-0017 dependency slot, #196a candidate-grounded). One line: `DEPENDS-ON: <name>`
 * — a single symbol NAME the model SELECTED from the closed candidate list the prompt showed it. The `scope`
 * is NOT asked of the model (a guessed directory was pure error): it is DERIVED from the mined unit's own path.
 * COUPLED to `prompts/propose-dependency.md`, which writes exactly this grammar; `llm-dependency-parser.test.ts`
 * pins the pair.
 */
const DEPENDS_ON_RE = /^DEPENDS-ON:\s*(\S+)\s*$/i

/** The reason a dependency-arm answer that is not the abstain token AND does not match the `DEPENDS-ON:`
 *  grammar abstains under — a MALFORMED proposal, fail-closed to a grounded abstention rather than a
 *  fabricated advisory (a prose line in a dependency mine is the model failing to follow the grammar, not a
 *  fact about a different family). Greppable, mirroring `llm.ts`'s `answer-malformed:*` reasons. */
export const DEP_UNPARSEABLE_REASON = "dependency-answer-unparseable"

/** The DIRECTORY of a mined unit — the scope its dependency witness ranges over. The unit's `qualifiedPath` is
 *  `<file>` or `<file>::<symbol>` (struct.ts); take the file, then its parent directory (forward-slash paths,
 *  repo-relative). A top-level file (no `/`) yields `''`, which the scope predicate matches NOTHING against
 *  (`underScope` splits `''` to `['']`, never length 0) — so a rootless unit's dependency ALWAYS abstains. That
 *  is fail-closed, not a hole: an over-wide "whole repo" scope is exactly what we must not grant. */
export function unitScopeOf(qualifiedPath: string): string {
  const at = qualifiedPath.indexOf("::")
  const file = at === -1 ? qualifiedPath : qualifiedPath.slice(0, at)
  const slash = file.lastIndexOf("/")
  return slash === -1 ? "" : file.slice(0, slash)
}

/** Resolve a picked dependency NAME to THIS unit's OWN cross-unit dependency symbol — or `null` when the name
 *  is not a real cross-unit dependency of the unit (an off-candidate-list guess / builtin / typo). Injected
 *  because the name→symbol binding is the INDEX's business (`UnitDepsApi.resolveDepFor`) and must be per-unit:
 *  an index-wide name lookup let an off-list name ride an unrelated file's same-named symbol (lucy BLOCKER). */
export type DepResolver = (name: string, site: StructRef) => string | null

/**
 * The DEPENDENCY arm parser FACTORY (ADR-0017, #196a candidate-grounded). A claim matching `DEPENDS-ON: <name>`
 * whose `<name>` RESOLVES (via the injected `resolveDep`) to THIS unit's own cross-unit dependency symbol
 * becomes a typed `PredicateSeed{ slot:'dependency', target: <the resolved SYMBOL>, scope: <unit dir> }` — the
 * target is the REAL symbol (so the fact is bound to the unit's specific dependency, not a bare name), and the
 * sound oracle re-proves it. A name that does NOT resolve (off the candidate list, a builtin, a typo) ABSTAINS
 * with `DEP_UNPARSEABLE_REASON` — closing the lucy BLOCKER where an off-list name was admitted via a sibling's
 * same-named symbol. `claim` keeps the raw human line; `rawAnswer` rides through (#195c). Never an advisory seed.
 */
export function makeDependencyClaimParser(resolveDep: DepResolver): ClaimParser {
  return (claim, cand, rawAnswer) => {
    const m = DEPENDS_ON_RE.exec(claim.trim())
    if (m === null) return { abstain: DEP_UNPARSEABLE_REASON }
    const name = (m[1] ?? "").trim()
    if (name === "") return { abstain: DEP_UNPARSEABLE_REASON }
    const symbol = resolveDep(name, cand.site)
    if (symbol === null) return { abstain: DEP_UNPARSEABLE_REASON } // not a cross-unit dep of THIS unit
    return {
      kind: "predicate",
      slot: "dependency",
      target: symbol, // the RESOLVED symbol — the fact's identity is bound to the unit's specific dependency
      scope: unitScopeOf(cand.site.qualifiedPath),
      cand,
      claim,
      ...(rawAnswer !== undefined ? { rawAnswer } : {}),
    }
  }
}

/**
 * The DEFINITION grammar (#196d candidate-grounded — the DEFINITION class of the PROVEN family). One line:
 * `DEFINES: <name>` — a single symbol NAME the model SELECTED from the closed candidate list of THIS unit's own
 * definitions. The `scope` is NOT asked of the model (a guessed directory was pure error): it is DERIVED from
 * the mined unit's own path, exactly as the dependency arm derives it. COUPLED to `prompts/propose-definition.md`,
 * which writes exactly this grammar; `llm-definition-parser.test.ts` pins the pair.
 */
const DEFINES_RE = /^DEFINES:\s*(\S+)\s*$/i

/** The reason a definition-arm answer that is not the abstain token AND does not match the `DEFINES:` grammar
 *  abstains under — a MALFORMED proposal, fail-closed to a grounded abstention rather than a fabricated advisory,
 *  exactly as `DEP_UNPARSEABLE_REASON`. */
export const DEF_UNPARSEABLE_REASON = "definition-answer-unparseable"

/**
 * The DEFINITION arm parser FACTORY (#196d candidate-grounded). A claim matching `DEFINES: <name>` whose
 * `<name>` RESOLVES (via the injected `resolveDef`) to THIS unit's own defined symbol becomes a typed
 * `PredicateSeed{ slot:'definition', target: <the resolved SYMBOL>, scope: <unit dir> }` — the target is the
 * REAL symbol (so the fact is bound to the unit's specific definition, not a bare name), and the sound
 * `verifyDefinition` oracle re-proves the def-occurrence lies under `scope`. A name that does NOT resolve (off
 * the candidate list, a reference-only name, a typo) ABSTAINS with `DEF_UNPARSEABLE_REASON` — the SAME lucy
 * BLOCKER discipline as the dependency arm. Reuses `DepResolver` (an identical `(name, site) => symbol | null`
 * signature). `claim` keeps the raw human line; `rawAnswer` rides through (#195c). Never an advisory seed.
 */
export function makeDefinitionClaimParser(resolveDef: DepResolver): ClaimParser {
  return (claim, cand, rawAnswer) => {
    const m = DEFINES_RE.exec(claim.trim())
    if (m === null) return { abstain: DEF_UNPARSEABLE_REASON }
    const name = (m[1] ?? "").trim()
    if (name === "") return { abstain: DEF_UNPARSEABLE_REASON }
    const symbol = resolveDef(name, cand.site)
    if (symbol === null) return { abstain: DEF_UNPARSEABLE_REASON } // not a symbol defined in THIS unit
    return {
      kind: "predicate",
      slot: "definition",
      target: symbol, // the RESOLVED symbol — the fact's identity is bound to the unit's specific definition
      scope: unitScopeOf(cand.site.qualifiedPath),
      cand,
      claim,
      ...(rawAnswer !== undefined ? { rawAnswer } : {}),
    }
  }
}

/**
 * The COUNT grammar (#196c candidate-grounded — the CARDINALITY dual of the dependency arm). One line:
 * `COUNT: <name>` — a single exported symbol NAME the model SELECTED from the closed candidate list of THIS
 * unit's externally-called exports. The model NEVER emits the number: a stray digit or `@` breaks the `\S+`-
 * then-end match and abstains. COUPLED to `prompts/propose-count.md`; `llm-count-parser.test.ts` pins the pair.
 */
const COUNT_RE = /^COUNT:\s*(\S+)\s*$/i

/** The reason a count-arm answer that is neither the abstain token nor a `COUNT: <name>` line abstains under —
 *  fail-closed to a grounded abstention rather than a fabricated advisory, exactly as `DEP_UNPARSEABLE_REASON`. */
export const COUNT_UNPARSEABLE_REASON = "count-answer-unparseable"

/** Resolve a picked count NAME to THIS unit's OWN externally-called export — the SYMBOL plus the harness-derived
 *  witnessed lower bound (`atLeast`, distinct caller units) and the `scope` that bound ranges over — or `null`
 *  when the name is not such an export of the unit (off-candidate-list guess / own-vocab / uncalled / typo). The
 *  MODEL NEVER SUPPLIES THE NUMBER: `atLeast` is computed by the index (`UnitExportsApi.resolveExportFor`), so a
 *  hallucinated count has no slot to enter. Injected + per-unit for the SAME reason as `DepResolver` (the #196a
 *  lucy BLOCKER: an index-wide name lookup let an off-list name ride an unrelated file's same-named symbol). */
export type CountResolver = (
  name: string,
  site: StructRef,
) => { readonly symbol: string; readonly atLeast: number; readonly scope: string } | null

/**
 * The COUNT arm parser FACTORY (#196c candidate-grounded). A claim matching `COUNT: <name>` whose `<name>`
 * RESOLVES (via the injected `resolveCount`) to THIS unit's own externally-called export becomes a typed
 * `PredicateSeed{ slot:'count', target: <the resolved SYMBOL>, scope, atLeast }` — `target` is the REAL symbol
 * (the fact is bound to the unit's specific export, not a bare name), and `atLeast`/`scope` are the HARNESS'S,
 * derived from the live index so `verifyCount` re-proves `witnessed >= atLeast` by construction (a sound lower
 * bound). A name that does NOT resolve (off the candidate list, own-vocab, uncalled, a typo) ABSTAINS with
 * `COUNT_UNPARSEABLE_REASON` — the lucy BLOCKER discipline, verbatim from the dependency arm. `claim` keeps the
 * raw human line; `rawAnswer` rides through (#195c). Never an advisory seed, never a model-supplied number.
 */
export function makeCountClaimParser(resolveCount: CountResolver): ClaimParser {
  return (claim, cand, rawAnswer) => {
    const m = COUNT_RE.exec(claim.trim())
    if (m === null) return { abstain: COUNT_UNPARSEABLE_REASON }
    const name = (m[1] ?? "").trim()
    if (name === "") return { abstain: COUNT_UNPARSEABLE_REASON }
    const r = resolveCount(name, cand.site)
    if (r === null) return { abstain: COUNT_UNPARSEABLE_REASON } // not an externally-called export of THIS unit
    return {
      kind: "predicate",
      slot: "count",
      target: r.symbol, // the RESOLVED symbol — the fact's identity is bound to the unit's specific export
      scope: r.scope, //  the callers' common segment-prefix the witnessed bound ranges over (harness-derived)
      atLeast: r.atLeast, // the WITNESSED distinct caller-unit count — the sound lower bound, NEVER the model's
      cand,
      claim,
      ...(rawAnswer !== undefined ? { rawAnswer } : {}),
    }
  }
}

/** The reason a semantic-arm answer whose one `atlas-fact` block carries no non-empty `derivation` abstains
 *  under — fail-closed to a grounded abstention rather than a fabricated advisory, exactly as the sound arms'
 *  `*-unparseable` reasons. A `justified` fact whose grounds do not travel is malformed: the derivation IS
 *  the seal's witness-analog (196b), persisted onto `node.derivation`, so its absence is not a fact about a
 *  different family — it is a botched semantic fact, and admitting it as a bare advisory would drop the grounds. */
export const SEMANTIC_NO_DERIVATION_REASON = "semantic-answer-no-derivation"

/** The reason a semantic-arm answer whose block declares a `slot` OUTSIDE the eight-member `SemanticSlot`
 *  vocabulary (196c) abstains under — the SAME fail-closed discipline as the missing-derivation abstain. The
 *  model CLASSIFIES the fact into one of the eight justified-eligible slots; a slot the harness cannot honestly
 *  seal `justified` (an oracle/structural slot like `dependency`/`count`/`definition`, or free text) is a
 *  grounded refusal, never a fact minted at a slot outside the justified vocabulary. */
export const SEMANTIC_SLOT_UNKNOWN_REASON = "semantic-answer-slot-not-in-vocabulary"

/** Lift the `slot` and `derivation` fields from the single `atlas-fact` block in a validated `'block'`-format
 *  envelope (`rawAnswer`). The block gate (`admitFactBlock`) already parsed the block and validated its `claim`;
 *  the SLOT + DERIVATION ride in the SAME JSON object and are read here — never re-derived, never the model's
 *  scratch. Returns the RAW field values (untyped, untrimmed), or `undefined` when the envelope has no single
 *  block or no parseable JSON — the parser turns each malformed shape into a grounded abstention with the right
 *  reason (missing derivation vs slot-out-of-vocabulary). */
function semanticBlockFields(rawAnswer: string): { slot: unknown; derivation: unknown } | undefined {
  const block = factBlock(rawAnswer)
  if (block === null || "abstain" in block) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(block.body)
  } catch {
    return undefined
  }
  const obj = parsed as { slot?: unknown; derivation?: unknown } | null
  if (obj === null) return undefined
  return { slot: obj.slot, derivation: obj.derivation }
}

/**
 * The SEMANTIC arm parser (196c — the ONE general justified arm, anti-7-heads). UNLIKE the sound arms, a
 * semantic slot has no oracle, no candidate list, no injected resolver — so it is a plain `ClaimParser` const
 * like the advisory default. The reason-freely `atlas-fact` block carries THREE fields for this arm:
 * `{slot, claim, derivation}` — the model CLASSIFIES the fact into one of the eight `SemanticSlot`s, states the
 * claim, and supplies its contestable grounds. The adapter's block gate (`admitFactBlock`) already lifted+
 * validated `claim`; this parser takes each item's `slot` and `derivation` (or the legacy single envelope) and shapes a typed
 * `PredicateSeed{ slot:<validated>, claim, derivation }`. That derivation is the `justified` seal's
 * witness-analog: PERSISTED onto `node.derivation` (ADR-0017 CORRECTION 5), unlike the discarded scratch
 * reasoning (GEN-12). Two fail-closed abstentions, never a fabricated advisory: a block with no non-empty
 * `derivation` ABSTAINS (`SEMANTIC_NO_DERIVATION_REASON`) because a justified fact whose grounds do not travel
 * is malformed; a block whose `slot` is OUTSIDE the eight (`isSemanticSlot` — an oracle/structural slot or free
 * text) ABSTAINS (`SEMANTIC_SLOT_UNKNOWN_REASON`) because the harness cannot honestly seal it `justified`.
 * `gotcha` is now just ONE of the eight the model may pick (the 196b special case), not its own arm. `claim`
 * keeps the extracted human sentence; `rawAnswer` rides through (#195c). COUPLED to `prompts/propose-semantic.md`;
 * `llm-semantic-parser.test.ts` pins the pair. NOT sound-by-default — opt-in via `ATLAS_MINE_SLOT=semantic`
 * (the admission door is grounding, the seal reflects proof-strength: every semantic slot lands `justified`,
 * never `proven`).
 */
export const semanticClaimParser: ClaimParser = (claim, cand, rawAnswer, itemFields) => {
  const fields = itemFields ?? (rawAnswer === undefined ? undefined : semanticBlockFields(rawAnswer))
  if (!safeRetainedField(fields?.slot) || !safeRetainedField(fields?.derivation))
    return { abstain: "answer-malformed:unparseable" }
  const rawDeriv = fields?.derivation
  const derivation = typeof rawDeriv === "string" && rawDeriv.trim() !== "" ? rawDeriv.trim() : undefined
  if (derivation === undefined) return { abstain: SEMANTIC_NO_DERIVATION_REASON }
  const slot = fields?.slot
  if (!isSemanticSlot(slot)) return { abstain: SEMANTIC_SLOT_UNKNOWN_REASON } // classified outside the eight ⇒ grounded refusal
  return {
    kind: "predicate",
    slot, // the model's classification, VALIDATED against the eight-member justified vocabulary
    derivation, // the persisted, contestable grounds — the justified seal's witness-analog (never the scratch)
    cand,
    claim,
    ...(rawAnswer !== undefined ? { rawAnswer } : {}),
  }
}

/** Shared by command and host-answer entry paths: every collection item keeps its own parser fields and
 *  the same accepted receipt. Singular injected/legacy completions keep their original return shape. */
export function completionProposal(
  result: CompletionResult,
  cand: Candidate,
  parseClaim: ClaimParser = advisoryClaimParser,
): ReturnType<SiteProposer["propose"]> {
  if (result.claim === null) return result.abstainReason === undefined ? null : { abstain: result.abstainReason }
  if (result.claims === undefined) return parseClaim(result.claim, cand, result.rawAnswer)
  if (result.claims.length === 0 || result.claims.length > MAX_FACTS)
    return { abstain: "answer-malformed:unparseable" }
  // Injected completions must not give a valid sibling a shared receipt containing corrupt metadata.
  if (result.claims.some((fact) => !safeRetainedField(fact.slot) || !safeRetainedField(fact.derivation)))
    return { abstain: "answer-malformed:unparseable" }
  return {
    proposals: result.claims.map((fact) =>
      parseClaim(fact.claim, cand, result.rawAnswer, { slot: fact.slot, derivation: fact.derivation }),
    ),
  }
}

/** Construct the S2 `SiteProposer` — ONE bounded model call per site, abstention allowed (ADAPT-LLM-1).
 *  The `SiteProposer` return type is frozen; the model client, budget, and prompt-builder are INJECTED so
 *  this seam hardcodes no model and no prompt (D5). `propose` makes exactly one `client.complete` call —
 *  no retry, no loop — and returns a candidate proposal the driver GATES (never auto-trusted, never written
 *  to a store — GEN-4/12, golden 11c). Self-declaration fields are never read or emitted (GEN-4d).
 *  `parseClaim` (ADR-0017) turns the raw claim into the arm's typed seed — DEFAULT `advisoryClaimParser`,
 *  so the shipped advisory mine is byte-identical; the dependency arm injects `dependencyClaimParser`. */
export function createSiteProposer(deps: {
  client: ModelClient
  budget: LlmBudget
  buildPrompt: (cand: Candidate) => string
  parseClaim?: ClaimParser
}): SiteProposer {
  const parseClaim = deps.parseClaim ?? advisoryClaimParser
  return {
    propose(cand: Candidate) {
      const prompt = deps.buildPrompt(cand)
      const r = deps.client.complete(prompt, deps.budget) // EXACTLY ONE bounded call — no retry/loop
      return completionProposal(r, cand, parseClaim)
    },
  }
}

// ── the one concrete ModelClient: an operator-supplied command (ADR-0011 Decision 1) ───────────────────

/**
 * The ONE concrete `ModelClient` (ADR-0011 D1): run an operator-supplied command, prompt on stdin, claim on
 * stdout. No shell, no SDK, no network primitive here, and NO VENDOR NAMED — any provider-agnostic CLI, a
 * local runtime, or a `curl` wrapper satisfies it equally, so substitution is a config edit.
 *
 * The two verdict rules are what keep the result unambiguous:
 *   - **EMPTY stdout (or the `ABSTAIN_SENTINEL` token) ⇒ abstention** (`claim: null`). No JSON, no parser,
 *     hence no parse-failure mode. Abstention is a valid, unpressured outcome (GEN-12); the sentinel is the
 *     explicit-action form of it (#201/#202), mapped identically by `admitModelAnswer`.
 *   - **Non-zero exit / timeout / missing command ⇒ THROW.** A broken configuration MUST NOT be able to
 *     present itself as "this repo has no facts" — that fail-silent shape is the one failure that would
 *     invalidate a whole genesis run invisibly.
 *
 * `budget.timeoutMs` is enforced (`execFileSync`'s own timeout). `budget.costCap` is NOT enforceable here
 * and is deliberately not pretended: a subprocess reports no price. Spend is bounded upstream by the GEN-2
 * site ceiling and the marginal-value stop, which is where the real budget lives.
 */
export function createCommandClient(command: ModelCommand, format: AnswerFormat = "line"): ModelClient {
  return {
    complete(prompt: string, budget: LlmBudget): CompletionResult {
      let out: Buffer
      try {
        out = execFileSync(command.cmd, command.args as string[], {
          input: prompt, // the prompt is piped, never placed on the command line
          // NO `encoding`: stdout is read as a RAW Buffer. With `encoding:'utf8'` Node silently maps invalid
          // bytes to U+FFFD, masking exactly the corruption the #195c sanity gate exists to reject.
          timeout: budget.timeoutMs,
          stdio: ["pipe", "pipe", "pipe"], // stderr CAPTURED — never inherited (the fleet-wide F7 property)
        })
      } catch (e) {
        const completed = salvageEarlyExit(e) // the child finished; only OUR stdin write lost the race
        if (completed === null) throw new ModelCommandError(classifyModelFailure(e), describeModelFailure(command, e))
        out = completed
      }
      return admitModelAnswer(out, format) // #195c: the admission sanity gate — fail-closed to a tagged abstention
    },
  }
}

/** [D39] The same gate over a reply the caller already holds as text: the Orchestra host asks the model itself and
 *  hands each reply in. Block format, the advisory arm's `atlas-fact` contract (prompts/propose.md). */
export function admitAnswerText(text: string): CompletionResult {
  return admitModelAnswer(Buffer.from(text, "utf8"), "block")
}

/**
 * [#195 leg (c)] The admission SANITY GATE on the model's raw stdout bytes, BEFORE they can become a claim.
 * Three fail-closed checks; any failure returns a grounded ABSTENTION, never a fabricated claim:
 *   1. VALID UTF-8 — round-trip the raw bytes (`Buffer.from(text).equals(buf)`). Reading stdout as a Buffer
 *      is what makes this observable: `encoding:'utf8'` would already have replaced bad bytes with U+FFFD.
 *      Fail ⇒ `answer-malformed:not-utf8`.
 *   2. NON-EMPTY — an empty / whitespace-only answer is the model DECLINING to answer (GEN-12), not a
 *      corruption. It stays `{ claim: null }` UNTAGGED, preserving the existing abstention semantics.
 *   2b. NOT THE ABSTAIN SENTINEL — [#201/#202] an answer that IS `ABSTAIN_SENTINEL` (via `isAbstainToken`:
 *      case-insensitive, surrounding formatting/punctuation stripped) is the model taking the explicit
 *      abstention ACTION the prompt offers. It is the SAME GEN-12 model-abstained outcome as empty —
 *      `{ claim: null }` UNTAGGED — not a malformed answer. Checked before the splice test so the token is
 *      never mistaken for content.
 *   3. SINGLE-RESPONSE — reject the splice/interleave class the 2026-08-04 contamination produced
 *      (byte-overlapping concatenation of multiple concurrent answers). See `isSplicedAnswer`.
 *      Fail ⇒ `answer-malformed:multi-response`.
 * Successful line answers retain their untrimmed bytes; block answers retain only the canonical accepted envelope.
 */
function admitModelAnswer(buf: Buffer, format: AnswerFormat): CompletionResult {
  const text = buf.toString("utf8")
  if (!Buffer.from(text, "utf8").equals(buf)) return { claim: null, abstainReason: "answer-malformed:not-utf8" }
  const whole = text.trim()
  if (whole === "") return { claim: null } //                    empty ⇒ GEN-12 model-abstained, untagged
  if (isAbstainToken(whole)) return { claim: null } //           [#201/#202] explicit abstain token ⇒ GEN-12, untagged
  // The C0-control interleave seam is corruption in EITHER format — a spliced pipe injects stray control bytes
  // regardless of whether the answer is a line or a fenced block. Checked first, before the format-specific leg.
  if (hasControlByteSplice(text)) return { claim: null, abstainReason: "answer-malformed:multi-response" }
  if (format === "block") return admitFactBlock(text)
  //                          [ADR-0020] the SOUND-GATED slots (dependency/count/negation) keep the ONE-LINE
  // contract: their prompts forbid reasoning, so a well-formed answer is a single content line and >1 non-empty
  // line is the splice class. The advisory/semantic reason-freely slots use `'block'` instead (multi-line by
  // construction), where the line-count heuristic would reject every conforming answer — see `admitFactBlock`.
  if (isSplicedAnswer(text)) return { claim: null, abstainReason: "answer-malformed:multi-response" }
  return { claim: whole, rawAnswer: text } //                    rawAnswer = the exact validated answer bytes
}

/** Exactly one block carries a legacy object or 1–4 facts. Validate the whole collection before returning
 *  any claim; retain only its accepted fields, never scratch. Semantic validity remains the parser's job. */
function admitFactBlock(text: string): CompletionResult {
  const block = factBlock(text)
  if (block === null) return { claim: null } // reasoned then declined, without a block
  if ("abstain" in block) return { claim: null, abstainReason: block.abstain }
  if (Buffer.byteLength(block.body, "utf8") > MAX_FACT_BLOCK_BYTES)
    return { claim: null, abstainReason: "answer-malformed:unparseable" }
  let parsed: unknown
  try {
    parsed = JSON.parse(block.body)
  } catch {
    return { claim: null, abstainReason: "answer-malformed:unparseable" }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return { claim: null, abstainReason: "answer-malformed:unparseable" }
  const collection = "facts" in parsed
  if (collection && ("claim" in parsed || "slot" in parsed || "derivation" in parsed))
    return { claim: null, abstainReason: "answer-malformed:unparseable" }
  const items = "facts" in parsed ? parsed.facts : [parsed]
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_FACTS)
    return { claim: null, abstainReason: "answer-malformed:unparseable" }
  const claims = items.map(acceptedFact).filter((fact) => fact !== undefined)
  if (claims.length !== items.length || new Set(claims.map((fact) => fact.claim.normalize("NFC"))).size !== claims.length)
    return { claim: null, abstainReason: "answer-malformed:unparseable" }
  return {
    claim: claims[0]!.claim,
    ...(collection ? { claims } : {}),
    rawAnswer: `\`\`\`atlas-fact\n${JSON.stringify(collection ? { facts: claims } : claims[0]!)}\n\`\`\``,
  }
}

function acceptedFact(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("claim" in value)) return undefined
  if (typeof value.claim !== "string" || value.claim.trim() === "" || hasControlByteSplice(value.claim)) return undefined
  if ("slot" in value && !safeRetainedField(value.slot)) return undefined
  if ("derivation" in value && !safeRetainedField(value.derivation)) return undefined
  return {
    claim: value.claim.trim(),
    ...("slot" in value ? { slot: value.slot } : {}),
    ...("derivation" in value ? { derivation: value.derivation } : {}),
  }
}

/** Walk only metadata that the receipt retains, not discarded scratch. JSON bodies are already byte-bounded;
 *  an iterative node budget also bounds direct parser inputs without recursion or cyclic-input hangs. */
function safeRetainedField(value: unknown): boolean {
  const pending: unknown[] = [value]
  let remaining = MAX_FACT_BLOCK_BYTES
  while (pending.length > 0) {
    if (remaining-- === 0) return false
    const current = pending.pop()
    if (typeof current === "string" && hasControlByteSplice(current)) return false
    if (typeof current !== "object" || current === null) continue
    Object.entries(current).forEach(([key, child]: [string, unknown]) => pending.push(key, child))
  }
  return true
}

/** Count openers before extracting a body: even an unclosed extra opener is a second response, not scratch.
 *  Index scans keep malformed inputs linear rather than repeatedly rescanning their suffixes. */
function factBlock(text: string): { readonly body: string } | { readonly abstain: string } | null {
  const open = text.indexOf("```atlas-fact")
  if (open < 0) return null
  if (text.indexOf("```atlas-fact", open + "```atlas-fact".length) >= 0)
    return { abstain: "answer-malformed:multi-response" }
  const header = text.indexOf("\n", open)
  const close = header < 0 ? -1 : text.indexOf("\n```", header + 1)
  if (header < 0 || close < 0 || text.slice(open, header).trimEnd() !== "```atlas-fact")
    return { abstain: "answer-malformed:unparseable" }
  const end = text.indexOf("\n", close + 1)
  if (text.slice(close + 1, end < 0 ? undefined : end).trimEnd() !== "```")
    return { abstain: "answer-malformed:unparseable" }
  return { body: text.slice(header + 1, close) }
}

const MAX_FACT_BLOCK_BYTES = 8 * 1024
const MAX_FACTS = 4

/**
 * The SINGLE-RESPONSE predicate (#195 §4 — specified at build time from the 2026-08-04 incident, not perfect
 * by contract, only required to REJECT a spliced fixture and ADMIT a normal single answer). The answer
 * channel is "one line of prose or an abstention" (`prompt.ts:134`), so a well-formed answer is a single
 * content block of ordinary text. Two orthogonal fingerprints of the incident's byte-overlapping
 * concatenation of concurrent answers:
 *   (a) INTERLEAVE — a C0 control byte a single prose answer never carries (anything below U+0020 except
 *       TAB/LF/CR). Concurrent writers racing one pipe inject stray control/NUL bytes at the splice seam.
 *   (b) MULTI-ENVELOPE — more than one non-empty line after trimming: a concatenation of ≥2 top-level
 *       answers, where a conforming single answer is one line of prose.
 */
function isSplicedAnswer(text: string): boolean {
  if (hasControlByteSplice(text)) return true //                          (a) C0 control byte = interleave seam
  return text.split("\n").filter((line) => line.trim() !== "").length > 1 // (b) >1 response envelope (LINE mode only)
}

/** (a) The INTERLEAVE fingerprint alone — a C0 control byte a single answer never carries (below U+0020 except
 *  TAB/LF/CR). Concurrent writers racing one pipe inject stray control/NUL bytes at the splice seam. Applies in
 *  BOTH answer formats; the line-count leg (b) is LINE-mode-only (see admitModelAnswer). */
function hasControlByteSplice(text: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)
}

/** The model-output admission contract for a proposer (ADR-0020). `line` = the one-line prose/abstain contract
 *  of the SOUND-GATED slots (dependency/count/negation). `block` = the reason-freely fenced-`atlas-fact` block
 *  contract of the advisory/semantic slots, where free reasoning is scratch and only the accepted envelope survives. */
export type AnswerFormat = "line" | "block"
