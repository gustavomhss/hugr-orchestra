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
  const stripped = answer.trim().replace(/^[\s`'"*.[\](){}]+|[\s`'"*.[\](){}]+$/g, "")
  return stripped.toUpperCase() === ABSTAIN_SENTINEL
}

/** The bounded spend envelope for the one call — a hard cost cap + a wall-clock timeout (ADAPT-LLM-1). */
export interface LlmBudget {
  readonly costCap: number
  readonly timeoutMs: number
}

/**
 * The raw model verdict at a site: a claim, or `null` when the model ABSTAINED here (GEN-12).
 *
 * [#195 leg (c)] The claim is only produced AFTER the admission sanity gate (`admitModelAnswer`) passes on
 * the raw stdout bytes. Two provenance carriers ride alongside it so W-MINE can trace a fact back to what
 * produced it, and W-MINE can build a grounded abstention when it cannot:
 *   - `rawAnswer` — the VALIDATED answer text (the exact bytes that passed the gate, decoded as a string),
 *     present ONLY when `claim !== null`. Downstream (W-MINE) scrubs this and puts it to CAS; this seam
 *     does not scrub and never touches CAS. It is the untrimmed answer — `claim` is its trimmed projection.
 *   - `abstainReason` — on a MALFORMED-answer abstention, the sub-reason a grounded `WhyNot('answer-malformed')`
 *     is built from (`'answer-malformed:not-utf8'` | `'answer-malformed:multi-response'`). The plain GEN-12
 *     model-abstained case (empty / whitespace-only stdout) stays UNTAGGED (`undefined`): an empty answer is
 *     the model declining to answer, not a corruption of one.
 */
export interface CompletionResult {
  readonly claim: string | null //          null ⇒ the model abstained at this site
  readonly rawAnswer?: string //             the validated answer bytes as a string; present iff claim !== null
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
  const blocks = factBlocks(rawAnswer)
  if (blocks.length !== 1) return undefined // exactly one block reached admission; ≠1 ⇒ not a well-formed fact
  let parsed: unknown
  try {
    parsed = JSON.parse(blocks[0]!)
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
 * validated `claim`; this parser lifts the `slot` and `derivation` from the raw envelope and shapes a typed
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
export const semanticClaimParser: ClaimParser = (claim, cand, rawAnswer) => {
  const fields = rawAnswer === undefined ? undefined : semanticBlockFields(rawAnswer)
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
      if (r.claim === null) {
        // [#195c] Split the abstention so the MALFORMED case is OBSERVABLE. A tagged `abstainReason` (the
        // sanity gate's `answer-malformed:*`) returns a DISTINCT `{ abstain }` the driver builds a greppable
        // grounded WhyNot from; an UNTAGGED null (empty / model-declined) stays the plain GEN-12 abstention.
        return r.abstainReason !== undefined ? { abstain: r.abstainReason } : null
      }
      // [ADR-0017] The arm's parser shapes the typed seed (advisory by default; dependency when injected). It
      // forwards the VALIDATED answer bytes on `SeedProposal.rawAnswer` (#195c) so W-MINE scrubs-and-puts them
      // to CAS as the fact's `answerRef`; this seam does not scrub and never touches CAS. A parser may itself
      // abstain (e.g. a dependency answer that does not match the grammar) — routed like any GEN-12 abstention.
      return parseClaim(r.claim, cand, r.rawAnswer)
    },
  }
}

// ── the one concrete ModelClient: an operator-supplied command (ADR-0011 Decision 1) ───────────────────

/** Why a model invocation FAILED — never conflated with an abstention (ADR-0011 D1). `not-found` is split
 *  out because a mistyped/absent command is the most common misconfiguration, and reporting it as a generic
 *  failure is what makes a broken setup read like a repo with nothing to say. */
export type ModelFailure = "not-found" | "timeout" | "nonzero-exit"

/** A model invocation that FAILED. Thrown, never returned: `CompletionResult.claim === null` means the model
 *  ABSTAINED (a valid GEN-12 outcome), so a failure must not be expressible as one. */
export class ModelCommandError extends Error {
  constructor(
    readonly reason: ModelFailure,
    message: string,
  ) {
    super(message)
    this.name = "ModelCommandError"
  }
}

/** The operator-supplied model command (ADR-0011 D1). `args` is an ARRAY so nothing is ever shell-split:
 *  there is no shell, and no argument is interpolated into one. Sourced from the operator-scoped config,
 *  NEVER from the repo — a command read out of a committed file would make `atlas mine` on a cloned
 *  repository an arbitrary-code-execution path. */
export interface ModelCommand {
  readonly cmd: string
  readonly args: readonly string[]
}

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
 * On success the VALIDATED (untrimmed) text rides back as `rawAnswer`; `claim` is its trimmed projection.
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

/** [ADR-0020] The `'block'` admission: the model REASONS FREELY (scratch, discarded here) and emits exactly ONE
 *  fenced ```atlas-fact block carrying `{"claim": "..."}`. The free reasoning is NEVER persisted (GEN-12): only
 *  the block's `claim` survives. Zero blocks ⇒ the model reasoned then declined (untagged abstain, like empty);
 *  ≥2 blocks ⇒ the splice class (structural replacement for the line-count heuristic, which cannot apply to a
 *  deliberately multi-line answer); an unparseable/oversized block ⇒ tagged malformed. Fail-closed throughout. */
function admitFactBlock(text: string): CompletionResult {
  const blocks = factBlocks(text)
  if (blocks.length === 0) return { claim: null } //             reasoned-then-declined / botched format ⇒ untagged abstain
  if (blocks.length > 1) return { claim: null, abstainReason: "answer-malformed:multi-response" } // ≥2 = splice
  const body = blocks[0]!
  if (Buffer.byteLength(body, "utf8") > MAX_FACT_BLOCK_BYTES)
    return { claim: null, abstainReason: "answer-malformed:unparseable" }
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { claim: null, abstainReason: "answer-malformed:unparseable" }
  }
  const field = (parsed as { claim?: unknown } | null)?.claim
  if (typeof field !== "string" || field.trim() === "")
    return { claim: null, abstainReason: "answer-malformed:unparseable" }
  return { claim: field.trim(), rawAnswer: text } //             rawAnswer = the whole validated envelope
}

/** Every fenced ```atlas-fact block body in the raw stdout (the reason-freely envelope, ADR-0020). */
function factBlocks(text: string): string[] {
  const fence = /```atlas-fact[^\n]*\n([\s\S]*?)\n```/g
  const bodies: string[] = []
  for (const m of text.matchAll(fence)) bodies.push(m[1]!)
  return bodies
}

const MAX_FACT_BLOCK_BYTES = 8 * 1024

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
 *  contract of the advisory/semantic slots, where free reasoning is scratch and only the block's `claim` survives. */
export type AnswerFormat = "line" | "block"

/**
 * A child that FINISHED CLEANLY but stopped reading stdin before we finished writing the prompt (`EPIPE`
 * with `status === 0`). `execFileSync` throws on the failed *write*, yet the run succeeded and the real
 * stdout is carried on the thrown error — measured: `{ code:'EPIPE', status:0, stdout:'OUT' }`.
 *
 * THE TRADEOFF, STATED. Prompts here are whole source subtrees, so the write is long and the window is
 * wide: any model command that reads a prefix and exits — or that any wrapper truncates — would otherwise
 * be reported as a hard failure on a run that actually produced a claim. This was found as a load-dependent
 * flake in the full suite (an idle-box probe of 300 runs did NOT reproduce it). But salvaging is NOT free
 * and must not be sold as pure correctness: A CLAIM MAY THEREFORE BE PRODUCED FROM A PARTIALLY DELIVERED
 * PROMPT. The child provably did not read all of it — this suite's own green case salvages a claim from a
 * command that read ZERO bytes of an 8 MiB prompt — so the claim may rest on source the model never saw.
 * That is admissible here for ONE reason, and it is the backstop the whole design leans on: what a proposer
 * returns is a PROPOSAL, and the admission gate re-derives it mechanically against the anchored bytes
 * (GEN-4/12). A claim built on an unread prefix fails that gate exactly as any other unfounded claim does.
 * This is a third adapter rule alongside "empty ⇒ abstention" and "non-zero ⇒ error", and it is written
 * into ADR-0011 Decision 1 rather than living only here.
 *
 * `null` ⇒ not salvageable, let the caller throw. `status` must be EXACTLY `0`: `null` means the child was
 * killed by a signal, and a non-zero status is a genuine failure — neither may be salvaged. Returns the raw
 * stdout BUFFER (stdout is captured with no `encoding`, so the thrown error carries it as a Buffer) — the
 * salvaged bytes pass through the same #195c sanity gate as the happy path.
 */
function salvageEarlyExit(e: unknown): Buffer | null {
  const err = e as { code?: unknown; status?: unknown; stdout?: unknown } | null
  if (err?.code !== "EPIPE" || err.status !== 0) return null
  return Buffer.isBuffer(err.stdout) ? err.stdout : Buffer.alloc(0)
}

/** Classify a thrown `execFileSync` error. `ENOENT` is the absent command; `ETIMEDOUT`/`SIGTERM` is the
 *  budget's wall-clock; anything else reaching here is a non-zero exit. */
function classifyModelFailure(e: unknown): ModelFailure {
  const code = (e as { code?: unknown } | null)?.code
  if (code === "ENOENT") return "not-found"
  if (code === "ETIMEDOUT" || (e as { signal?: unknown } | null)?.signal === "SIGTERM") return "timeout"
  return "nonzero-exit"
}

/** An actionable message: name the command that was actually run, and carry the child's captured stderr —
 *  without it a failure is only diagnosable by re-running by hand. */
function describeModelFailure(command: ModelCommand, e: unknown): string {
  const shown = [command.cmd, ...command.args].join(" ")
  const stderr = (e as { stderr?: unknown } | null)?.stderr
  const detail = typeof stderr === "string" && stderr.trim() !== "" ? stderr.trim() : String((e as Error)?.message ?? e)
  return `the configured model command failed — \`${shown}\`: ${detail}`
}
