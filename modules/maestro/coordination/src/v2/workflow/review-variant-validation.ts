export * as ReviewVariantValidationV2 from "./review-variant-validation"

import { Option, Schema } from "effect"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { Tool } from "@orchestra/core/tool/tool"
import type { ReviewResultV2 } from "../governance/review-result"
import { ReviewEvidenceSchemaV2 } from "./review-engagement-artifact-schema"
import { ReviewEvidenceValidationV2 } from "./review-engagement-artifact-validation"
import type { ReviewEngagementEvidenceV2 } from "./review-engagement-evidence"
import type { ReviewEngagementPolicyV2 } from "./review-engagement-policy"
import { ReviewEngagementReportV2 } from "./review-engagement-report"
import { ReviewVariantExaminationV2 } from "./review-variant-examination"
import { ReviewVariantSchemaV2 } from "./review-variant-schema"
import { ReviewVariantSearchV2 } from "./review-variant-search"

export type Authority = {
  readonly namespace: string
  readonly leadID: string
  readonly children: readonly ReviewVariantExaminationV2.Child[]
  readonly input: ReviewEngagementPolicyV2.Input
  readonly budget: ReviewEngagementReportV2.Budget
  readonly source: ReviewEngagementEvidenceV2.Prepared
  readonly journal: ReviewVariantSchemaV2.VariantJournal
}
type Used = { readonly seeds: Set<string>; readonly regions: Set<string>; readonly replies: Set<string> }
type Context = ReviewVariantExaminationV2.Context & {
  readonly receipt: ReviewEvidenceSchemaV2.ReceiptV2
  readonly report: ReviewEngagementReportV2.Stored
  readonly authority: Authority
  readonly bodies: ReviewEvidenceSchemaV2.Bodies
  readonly used: Used
}

/** All arguments are durable bytes/facts; this boundary never asks Session, Git, config or a provider to run. */
export function validate(receipt: ReviewEvidenceSchemaV2.ReceiptV2, report: ReviewEngagementReportV2.Stored,
  bodies: ReviewEvidenceSchemaV2.Bodies, authority: Authority): void {
  try { validateSection(receipt, report, bodies, authority) }
  catch (error) {
    // A bad live seed keeps report-invalid at the pre-child barrier. The same stored inconsistency is corruption.
    if (error instanceof Tool.Failure && error.metadata?.reason === "engagement-report-invalid")
      throw ReviewEvidenceSchemaV2.failure("corrupt", error.message)
    throw error
  }
}

function validateSection(receipt: ReviewEvidenceSchemaV2.ReceiptV2, report: ReviewEngagementReportV2.Stored,
  bodies: ReviewEvidenceSchemaV2.Bodies, authority: Authority) {
  const variants = Option.getOrUndefined(Schema.decodeUnknownOption(ReviewVariantSchemaV2.Variants)(receipt.variants, ReviewVariantSchemaV2.strict))
  const card = report.value.report
  ReviewEvidenceSchemaV2.require(variants && card && report.value.status === "completed" && report.value.source &&
    receipt.schema === "review-engagement-evidence-v2" && receipt.inputHash === ReviewEngagementReportV2.digest(authority.input) &&
    report.value.inputHash === receipt.inputHash && report.value.sessionID === authority.leadID && receipt.sessionID === authority.leadID &&
    authority.leadID === `ses_lucy_engagement_${ReviewEngagementReportV2.digest({ key: authority.namespace, role: "lead" })}` &&
    variants.namespace === authority.namespace && receipt.sourceSha256 === authority.source.sha256 &&
    ReviewVariantSchemaV2.same(report.value.source, authority.source) && ReviewVariantSchemaV2.same(receipt.budget, authority.budget) &&
    ReviewVariantSchemaV2.same(report.value.budget, authority.budget) && card.profile === authority.input.profile,
  "variant receipt differs from its admitted source, input or lead")
  ReviewEngagementReportV2.validateSource(authority.source)
  ReviewEvidenceSchemaV2.require(authority.journal.phase === "closed" &&
    ReviewVariantSchemaV2.same(authority.journal, ReviewVariantSchemaV2.projectJournal(variants)), "variant journal differs from the complete receipt")
  const analysis = ReviewEvidenceValidationV2.analysisContext({ ...receipt, source: authority.source }, bodies)
  const requested = analysis.final.catalog.route.tiers.find((tier) => tier.id === ReviewRouting.tier(card.routing))
  const tier = requested?.built ? requested : analysis.final.catalog.route.tiers.find((tier) => tier.id === requested?.runs && tier.built)
  ReviewEvidenceSchemaV2.require(tier && card.routing.profile.id === authority.input.profile, "variant receipt has no pinned execution tier")
  const context: Context = { namespace: authority.namespace, inputHash: receipt.inputHash, source: authority.source,
    children: authority.children, catalog: analysis.final.catalog, routing: card.routing, tier, analysis,
    regions: variants.regions, replies: variants.replies, receipt, report, authority, bodies,
    used: { seeds: new Set(), regions: new Set(), replies: new Set() } }
  tables(context, variants)
  const limit = authority.input.profile === "audit" ? 3 : 0
  ReviewEvidenceSchemaV2.require(variants.limit === limit && variants.generations.length <= limit, "variant limit differs from its profile")
  // A final blocked card can still contain independent findings (for example a required analyzer was unavailable).
  // Quick has no child hunt in either entry path. Its original host decision is bound by journal+receipt; the
  // retained entry blocker corroborates the exceptional no-seed branch, without claiming to retain the lead reply.
  // EntryRecord supplies only kind/reason; ReviewChecks adds ref to every blocker derived from an actual check.
  const quickStop = variants.stop === "no-confirmed-seed" ? "no-confirmed-seed" : "independent-verification-unavailable"
  if (limit !== 0 && tier.id === "quick" && quickStop === "no-confirmed-seed")
    ReviewEvidenceSchemaV2.require(card.outcome === "blocked" && card.blockers.some((blocker) => blocker.ref === undefined && blocker.code === undefined),
      "Quick seedless entry has no retained host entry blocker")
  const eligibility = limit === 0 ? "not-applicable" : tier.id === "quick" ? quickStop : undefined
  if (eligibility) {
    ReviewEvidenceSchemaV2.require(variants.stop === eligibility && !variants.generations.length && !variants.initialSeedIDs.length &&
      !variants.unexpandedInitialSeedIDs.length && !variants.seeds.length && !variants.regions.length && !variants.replies.length,
    "ineligible profile or tier contains variant work")
    ReviewEvidenceSchemaV2.require(!authority.children.some((child) => child.key.startsWith("variant:")), "ineligible engagement admitted variant children")
    coverage(context, variants)
    return
  }
  const initial = variants.initialSeedIDs.map((id) => seed(context, variants, id)).sort(ReviewVariantSearchV2.rankSeed)
  ReviewEvidenceSchemaV2.require(new Set(variants.initialSeedIDs).size === initial.length &&
    ReviewVariantSchemaV2.same(variants.initialSeedIDs, initial.map((seed) => seed.seedID)), "initial seed ranking differs")
  for (const value of initial) {
    const reply = context.replies.find((reply) => reply.replyID === value.examination.replyID)
    ReviewEvidenceSchemaV2.require(reply?.childKey === `verify:${value.finding.class}` && reply.turnKey === "verify", "initial seed came from a variant or foreign verifier")
  }
  ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(variants.unexpandedInitialSeedIDs,
    initial.filter((seed) => seed.seedID !== variants.generations[0]?.seed.seedID).map((seed) => seed.seedID)), "unexpanded initial seeds differ")
  if (!initial.length) {
    ReviewEvidenceSchemaV2.require(variants.stop === "no-confirmed-seed" && !variants.generations.length && !variants.seeds.length &&
      !variants.regions.length && !variants.replies.length && !card.findings.length &&
      !authority.children.some((child) => child.key.startsWith("variant:")), "seedless audit contains variant work")
    coverage(context, variants)
    return
  }
  ReviewEvidenceSchemaV2.require(variants.generations.length > 0, "eligible audit omitted its known-instance generation")
  const confirmed = [...initial]
  const processed = new Set<string>()
  const priorVerifiers = new Set(initial.map((seed) => seed.examination.verifierSessionID))
  const expectedChildren = new Set<string>()
  let selected = initial[0]
  for (const [index, generation] of variants.generations.entries()) {
    ReviewEvidenceSchemaV2.require(generation.ordinal === index + 1 && generation.seed.seedID === selected.seedID &&
      generation.seed.findingID === selected.finding.id && generation.sourceSha256 === authority.source.sha256 &&
      generation.generationID === ReviewVariantSchemaV2.generationID({ namespace: authority.namespace, inputHash: receipt.inputHash,
        sourceSha256: authority.source.sha256, ordinal: generation.ordinal, seedID: selected.seedID }) &&
      generation.proposalKey === `variant:${generation.ordinal}:proposal` && generation.reservedAt >= authority.budget.startedAt &&
      generation.reservedAt < authority.budget.deadlineAt && (index === 0 || generation.reservedAt >= variants.generations[index - 1].reservedAt),
    "variant reservation or immediate seed lineage differs")
    const proposalID = ReviewVariantSchemaV2.childID(authority.namespace, generation.proposalKey, "lens")
    requireChild(context, generation.proposalKey, "lens", proposalID)
    expectedChildren.add(proposalID)
    const reply = generation.proposalReplyID ? useReply(context, generation.proposalReplyID) : undefined
    ReviewEvidenceSchemaV2.require(reply === undefined || reply.sessionID === proposalID && reply.role === "lens" &&
      reply.childKey === generation.proposalKey && reply.turnKey === generation.proposalKey, "proposal reply came from another stage")
    const captures = capturesFor(context, generation, proposalID)
    const witness = ReviewVariantSearchV2.witness({ namespace: authority.namespace, inputHash: receipt.inputHash, source: authority.source,
      ordinal: generation.ordinal, seed: selected.finding, attempts: generation.attempts, captures })
    if (witness.status === "rejected") {
      ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(generation.search, witness) && generation.proposal === undefined &&
        ReviewVariantSchemaV2.same(generation.decision, { type: "stop", reason: witness.reason, ...(witness.detail ? { detail: witness.detail } : {}) }),
      "rejected variant witness changed its ordered decision")
      ReviewEvidenceSchemaV2.require(index === variants.generations.length - 1 && variants.stop === witness.reason, "rejected generation did not close variants")
      continue
    }
    const accounting = ReviewVariantSearchV2.account({ source: authority.source, defectClass: selected.finding.class,
      seed: selected.finding, confirmed: confirmed.map((seed) => seed.finding), processed, search: witness.search })
    const search = generation.search
    ReviewEvidenceSchemaV2.require(search.status === "accepted" && search.operationID === witness.operation.operationID &&
      ReviewVariantSchemaV2.same(search.control, { path: selected.finding.path, line: selected.finding.line }) &&
      search.rawMatches === accounting.rawMatches && search.distinctMatches === accounting.distinctMatches &&
      ReviewVariantSchemaV2.same(search.excluded, accounting.excluded) && ReviewVariantSchemaV2.same(search.matches.map(matchBase), accounting.matches),
    "accepted variant denominator or visited subtraction differs")
    const proposed = ReviewVariantSearchV2.parseProposal(reply?.text, selected.finding, accounting.matches)
    ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(generation.proposal ?? null, proposed.proposal ?? null), "proposal differs from its actual reply")
    const newSeeds = proposed.detail || !proposed.proposal
      ? invalidProposal(search, proposed.detail ?? "proposal-return", generation)
      : dispositions(context, variants, generation, search, proposed.proposal, selected, priorVerifiers, expectedChildren)
    const counts = ReviewVariantSchemaV2.countMatches(search.matches)
    ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(search.counts, counts), "variant disposition counts differ")
    const decision = proposed.detail || !proposed.proposal ? { type: "stop", reason: "stage-invalid", detail: proposed.detail ?? "proposal-return" }
      : ReviewVariantSearchV2.decision(counts, generation.ordinal, newSeeds)
    ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(generation.decision, decision), "variant stop precedence differs")
    confirmed.push(...newSeeds)
    for (const match of search.matches) processed.add(match.matchID)
    if (generation.decision.type === "stop") ReviewEvidenceSchemaV2.require(index === variants.generations.length - 1 &&
      variants.stop === generation.decision.reason, "variant work continued after a stop")
    else {
      const nextSeed = generation.decision.nextSeed
      const next = newSeeds.find((seed) => seed.seedID === nextSeed.seedID && seed.finding.id === nextSeed.findingID)
      ReviewEvidenceSchemaV2.require(next && index < variants.generations.length - 1, "continuing generation has no reserved immediate successor")
      selected = next
    }
  }
  ReviewEvidenceSchemaV2.require(authority.children.filter((child) => child.key.startsWith("variant:")).every((child) => expectedChildren.has(child.id)),
    "variant children exceed the recorded stages")
  ReviewEvidenceSchemaV2.require(context.used.seeds.size === variants.seeds.length && context.used.regions.size === variants.regions.length &&
    context.used.replies.size === variants.replies.length, "variant receipt has unused seed, region or reply records")
  findings(context, confirmed, variants)
  coverage(context, variants)
}

function tables(context: Context, variants: ReviewVariantSchemaV2.Variants) {
  for (const ids of [variants.seeds.map((seed) => seed.seedID), variants.regions.map((region) => region.regionID), variants.replies.map((reply) => reply.replyID)])
    ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(ids, [...new Set(ids)].sort()), "variant records are not unique and sorted")
  ReviewEvidenceSchemaV2.require(new Set(context.children.map((child) => child.id)).size === context.children.length &&
    new Set(context.children.map((child) => child.key)).size === context.children.length &&
    context.children.filter((child) => child.role === "lead").length === 1 &&
    context.children.some((child) => child.role === "lead" && child.key === "lead" && child.id === context.authority.leadID), "admitted child identities differ")
  for (const child of context.children) if (child.role !== "lead") requireChild(context, child.key, child.role, child.id)
  const turns = new Set<string>()
  for (const reply of variants.replies) {
    ReviewVariantExaminationV2.validateReply(context, reply)
    const tuple = JSON.stringify([reply.sessionID, reply.promptMessageID])
    ReviewEvidenceSchemaV2.require(!turns.has(tuple), "one native turn has several final replies")
    turns.add(tuple)
  }
  const hashes = new Map<string, string>()
  for (const region of variants.regions) {
    ReviewVariantExaminationV2.validateRegion(context, region)
    const previous = hashes.get(region.path)
    ReviewEvidenceSchemaV2.require(previous === undefined || previous === region.blobSha256, "one captured blob has different observed hashes")
    hashes.set(region.path, region.blobSha256)
  }
  for (const proof of context.analysis.proofs) {
    const bytes = context.bodies.get(proof.inputsArtifactID)
    ReviewEvidenceSchemaV2.require(bytes, "qualified native input body is absent")
    const inputs = Option.getOrUndefined(Schema.decodeUnknownOption(ReviewEvidenceSchemaV2.Inputs)(ReviewEvidenceSchemaV2.json(bytes), ReviewVariantSchemaV2.strict))
    ReviewEvidenceSchemaV2.require(inputs, "qualified native input body does not decode")
    for (const file of inputs.files) ReviewEvidenceSchemaV2.require(!hashes.has(file.path) || hashes.get(file.path) === file.sha256,
      "captured region and qualified native input disagree on their full blob")
  }
  for (const left of variants.regions) for (const right of variants.regions) {
    if (left.path !== right.path || left.regionID >= right.regionID) continue
    const start = Math.max(left.startLine, right.startLine)
    const end = Math.min(left.endLine, right.endLine)
    if (start <= end) ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(
      left.text.split("\n").slice(start - left.startLine, end - left.startLine + 1),
      right.text.split("\n").slice(start - right.startLine, end - right.startLine + 1)), "overlapping captured regions disagree")
  }
}

function seed(context: Context, variants: ReviewVariantSchemaV2.Variants, id: string) {
  const value = variants.seeds.find((seed) => seed.seedID === id)
  ReviewEvidenceSchemaV2.require(value, "referenced seed is absent")
  const actual = ReviewVariantExaminationV2.qualifySeed(context, value.finding, value.examination)
  ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(value, actual), "seed identity or qualified proof differs")
  context.used.seeds.add(id)
  useExamination(context, value.examination)
  return value
}

function useReply(context: Context, id: string) {
  const reply = context.replies.find((reply) => reply.replyID === id)
  ReviewEvidenceSchemaV2.require(reply, "referenced native reply is absent")
  context.used.replies.add(id)
  return reply
}

function useRegion(context: Context, id: string) {
  const region = context.regions.find((region) => region.regionID === id)
  ReviewEvidenceSchemaV2.require(region, "referenced captured region is absent")
  context.used.regions.add(id)
  return region
}

function useExamination(context: Context, examination: ReviewVariantSchemaV2.Examination) {
  useReply(context, examination.replyID)
  useRegion(context, examination.regionID)
  if (examination.quoteRegionID) useRegion(context, examination.quoteRegionID)
}

function requireChild(context: Context, key: string, role: "lens" | "verifier", id: string) {
  ReviewEvidenceSchemaV2.require(id === ReviewVariantSchemaV2.childID(context.namespace, key, role) &&
    context.children.some((child) => child.id === id && child.key === key && child.role === role), "native variant child is not admitted")
}

function capturesFor(context: Context, generation: ReviewVariantSchemaV2.GenerationRecord, proposalID: string): ReviewVariantSearchV2.Capture[] {
  const operations = context.receipt.operations.filter((operation): operation is ReviewEvidenceSchemaV2.CodeOperation => operation.kind === "code")
  const searchOperations = operations.filter((operation) => operation.name === "code_search" && operation.sessionID === proposalID)
  for (const operation of searchOperations) ReviewEvidenceSchemaV2.require(generation.attempts.some((attempt) =>
    attempt.attemptID === operation.operationID && attempt.operationID === operation.operationID), "native proposal omitted an observed search capture")
  const ids = [...new Set([...searchOperations.map((operation) => operation.operationID),
    ...generation.attempts.flatMap((attempt) => attempt.operationID ? [attempt.operationID] : [])])]
  return ids.map((id) => {
    const operation = operations.find((operation) => operation.operationID === id)
    ReviewEvidenceSchemaV2.require(operation && operation.name === "code_search", "native search refers to another operation kind")
    const body = context.bodies.get(operation.evidence.artifactID)
    ReviewEvidenceSchemaV2.require(body, "native search body is missing")
    return { operation, body }
  })
}

function matchBase(match: ReviewVariantSchemaV2.MatchRecord): ReviewVariantSchemaV2.MatchBase {
  return { matchID: match.matchID, path: match.path, oid: match.oid, line: match.line }
}

function invalidProposal(search: ReviewVariantSchemaV2.AcceptedSearch, detail: ReviewVariantSchemaV2.StageInvalidDetail,
  generation: ReviewVariantSchemaV2.GenerationRecord): ReviewVariantSchemaV2.Seed[] {
  ReviewEvidenceSchemaV2.require(search.matches.every((match) => ReviewVariantSchemaV2.same(match,
    { ...matchBase(match), state: "not-examined", reason: "stage-invalid" })) &&
    ReviewVariantSchemaV2.same(generation.decision, { type: "stop", reason: "stage-invalid", detail }), "invalid proposal discarded or classified a real match")
  return []
}

function dispositions(context: Context, variants: ReviewVariantSchemaV2.Variants, generation: ReviewVariantSchemaV2.GenerationRecord,
  search: ReviewVariantSchemaV2.AcceptedSearch, proposal: ReviewVariantSchemaV2.Proposal, selectedSeed: ReviewVariantSchemaV2.Seed,
  priorVerifiers: Set<string>, expectedChildren: Set<string>): ReviewVariantSchemaV2.Seed[] {
  const present = search.matches.flatMap((match) => {
    const candidate = proposal.candidates.find((candidate) => candidate.path === match.path && candidate.line === match.line)
    ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(match.candidate ?? null, candidate ?? null), "match candidate differs from its proposal")
    if (candidate) return [{ match, candidate, matchID: match.matchID }]
    requireBare(match, "candidate-missing")
    return []
  }).sort(ReviewVariantSearchV2.rankCandidate)
  const cap = context.tier.budget.verifiers > 0 ? Math.min(4, context.tier.budget.candidatesPerVerifier) : 0
  for (const item of present.slice(cap)) requireBare(item.match, "verification-budget")
  const ready = present.slice(0, cap).flatMap((item) => {
    const id = item.match.state === "not-examined" ? item.match.regionID : item.match.examination.regionID
    if (!id) {
      requireBare(item.match, "region-unavailable")
      return []
    }
    const region = useRegion(context, id)
    ReviewEvidenceSchemaV2.require(region.path === item.match.path && region.startLine === item.match.line &&
      region.endLine === (item.candidate.endLine ?? item.candidate.line), "selected candidate has another captured range")
    return [{ ...item, region, id: ReviewVariantSchemaV2.findingID(generation.ordinal, item.match.matchID) }]
  })
  if (!ready.length) return []
  const key = `variant:${generation.ordinal}:verify:${selectedSeed.finding.class}`
  const childID = ReviewVariantSchemaV2.childID(context.namespace, key, "verifier")
  requireChild(context, key, "verifier", childID)
  ReviewEvidenceSchemaV2.require(!priorVerifiers.has(childID) && childID !== ReviewVariantSchemaV2.childID(context.namespace, generation.proposalKey, "lens"),
    "variant verifier was reused")
  priorVerifiers.add(childID)
  expectedChildren.add(childID)
  const reply = variants.replies.find((reply) => reply.sessionID === childID && reply.turnKey === `variant:${generation.ordinal}:verify`)
  if (reply) useReply(context, reply.replyID)
  const candidates = ready.map((item) => ({ id: item.id, offered: ReviewVariantExaminationV2.offered(context,
    { class: selectedSeed.finding.class, severity: item.candidate.severity }) }))
  const verified = reply ? ReviewVariantExaminationV2.parseVerifier(reply.text, selectedSeed.finding.class, candidates).results : []
  const found: ReviewVariantSchemaV2.Seed[] = []
  for (const item of ready) {
    const actual = verified.find((entry) => entry.value.candidate === item.id)
    const match = item.match
    if (!actual || !reply || actual.value.state === "dropped" && !actual.value.refutation.trim()) {
      requireUnexamined(context, match, "verifier-return-invalid", item.region.regionID, childID, reply?.replyID)
      continue
    }
    if (match.state === "not-examined") {
      ReviewEvidenceSchemaV2.require(actual.value.state === "confirmed" && actual.value.evidence.kind === "quote", "examined candidate was hidden as a region refusal")
      requireUnexamined(context, match, "region-unavailable", item.region.regionID, childID, reply.replyID)
      continue
    }
    const candidate: ReviewVariantExaminationV2.Candidate = { id: item.id, path: item.candidate.path, line: item.candidate.line,
      ...(item.candidate.endLine === undefined ? {} : { endLine: item.candidate.endLine }),
      class: selectedSeed.finding.class, severity: item.candidate.severity }
    const examination = match.examination
    ReviewEvidenceSchemaV2.require(examination.verifierSessionID === childID && examination.replyID === reply.replyID &&
      examination.candidateCap === ready.length && examination.verdictIndex === actual.index &&
      ReviewVariantSchemaV2.same(examination.rawVerdict, actual.raw) && ReviewVariantSchemaV2.same(examination.verdict, actual.value),
    "variant examination differs from its complete native batch")
    const verdict = ReviewVariantExaminationV2.validateExamination(context, candidate, examination)
    useExamination(context, examination)
    if (verdict.state === "dropped") {
      ReviewEvidenceSchemaV2.require(match.state === "noise" && match.refutation === verdict.refutation, "variant noise has no independent refutation")
      continue
    }
    if (verdict.state === "question") {
      ReviewEvidenceSchemaV2.require(match.state === "question" && match.reason === verdict.reason, "variant question differs from its independent verdict")
      continue
    }
    ReviewEvidenceSchemaV2.require(match.state === "confirmed" && match.findingID === item.id, "variant confirmation changed its host identity")
    const value = seed(context, variants, match.seedID)
    const finding: ReviewVariantSchemaV2.SeedFinding = { ...candidate, node: selectedSeed.finding.node, lens: selectedSeed.finding.lens,
      rule: verdict.evidence.kind === "tool" ? verdict.evidence.rule : selectedSeed.finding.class,
      trigger: item.candidate.trigger, rung: verdict.rung, rungs: verdict.history.map((rung) => rung.option),
      history: verdict.history, evidence: verdict.evidence }
    ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(value.finding, finding) && ReviewVariantSchemaV2.same(value.examination, examination),
      "confirmed variant changed its lineage, proposal or evidence")
    found.push(value)
  }
  return found
}

function requireBare(match: ReviewVariantSchemaV2.MatchRecord, reason: ReviewVariantSchemaV2.NotExaminedReason) {
  ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(match, { ...matchBase(match),
    ...(match.candidate ? { candidate: match.candidate } : {}), state: "not-examined", reason }), "unexamined candidate has an incorrect reason or invented examination")
}

function requireUnexamined(context: Context, match: ReviewVariantSchemaV2.MatchRecord, reason: ReviewVariantSchemaV2.NotExaminedReason,
  regionID: string, verifierSessionID: string, replyID?: string) {
  ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(match, { ...matchBase(match), ...(match.candidate ? { candidate: match.candidate } : {}),
    state: "not-examined", reason, regionID, verifierSessionID, ...(replyID ? { replyID } : {}) }), "unusable verifier result was misclassified")
  useRegion(context, regionID)
  if (replyID) useReply(context, replyID)
}

function findings(context: Context, seeds: readonly ReviewVariantSchemaV2.Seed[], variants: ReviewVariantSchemaV2.Variants) {
  const card = context.report.value.report
  ReviewEvidenceSchemaV2.require(card && card.findings.length === seeds.length && new Set(seeds.map((seed) => seed.finding.id)).size === seeds.length,
    "final report changed confirmed finding identities")
  for (const seed of seeds) {
    const finding = card.findings.find((finding) => finding.id === seed.finding.id)
    const { rung, history, ...expected } = seed.finding
    void rung
    void history
    ReviewEvidenceSchemaV2.require(finding && finding.status === "open" && ReviewVariantSchemaV2.same({ id: finding.id,
      path: finding.path, line: finding.line, ...(finding.endLine === undefined ? {} : { endLine: finding.endLine }), severity: finding.severity,
      class: finding.class, node: finding.node, lens: finding.lens, rule: finding.rule, trigger: finding.trigger,
      rungs: finding.rungs, evidence: finding.evidence }, expected), "final report altered an independently confirmed finding")
    for (const id of [seed.examination.regionID, ...(seed.examination.quoteRegionID ? [seed.examination.quoteRegionID] : [])]) {
      const region = useRegion(context, id)
      ReviewEvidenceSchemaV2.require(context.report.value.citations.some((citation) => citation.path === region.path && citation.oid === region.oid &&
        citation.startLine === region.startLine && citation.endLine === region.endLine && citation.text === region.text && citation.sha256 === region.textSha256),
      "final citation differs from the independently examined region")
    }
  }
  const questions: ReviewResultV2.Question[] = []
  for (const generation of variants.generations) {
    if (generation.search.status !== "accepted") continue
    const parent = variants.seeds.find((seed) => seed.seedID === generation.seed.seedID)
    ReviewEvidenceSchemaV2.require(parent, "question generation has no lineage")
    for (const match of generation.search.matches) {
      if (match.state !== "question") continue
      const candidate = match.candidate
      ReviewEvidenceSchemaV2.require(candidate, "question has no proposed candidate")
      questions.push({ id: ReviewVariantSchemaV2.findingID(generation.ordinal, match.matchID), path: candidate.path, line: candidate.line,
        ...(candidate.endLine === undefined ? {} : { endLine: candidate.endLine }), lens: parent.finding.lens,
        class: parent.finding.class, severity: candidate.severity, question: candidate.trigger, reason: match.reason })
    }
  }
  const reported = card.questions.filter((question) => question.id !== undefined && /^V[123]-[0-9a-f]{64}$/.test(question.id))
  const order = (left: ReviewResultV2.Question, right: ReviewResultV2.Question) =>
    (left.id ?? "") < (right.id ?? "") ? -1 : (left.id ?? "") > (right.id ?? "") ? 1 : 0
  ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same([...reported].sort(order), questions.sort(order)), "final report changed variant questions")
}

function coverage(context: Context, variants: ReviewVariantSchemaV2.Variants) {
  const expected = context.authority.input.profile !== "audit" ? [] : [{ item: "audit:variants", reason: variants.stop },
    ...variants.unexpandedInitialSeedIDs.map((id) => {
      const seed = variants.seeds.find((seed) => seed.seedID === id)
      ReviewEvidenceSchemaV2.require(seed, "unexpanded coverage has no initial seed")
      return { item: `audit:variants:seed:${seed.finding.id}`, reason: "not-selected" }
    }), ...variants.generations.flatMap((generation) => generation.search.status === "accepted" ? generation.search.matches.flatMap((match) =>
      match.state === "not-examined" ? [{ item: `audit:variants:match:${match.matchID}`, reason: match.reason }] : []) : [])]
  const reserved = (item: { readonly item: string }) => item.item === "audit:variants" || item.item.startsWith("audit:variants:")
  ReviewEvidenceSchemaV2.require(ReviewVariantSchemaV2.same(context.report.value.notExamined.filter(reserved), expected) &&
    ReviewVariantSchemaV2.same(context.report.value.report?.coverage.notExamined.filter(reserved), expected) &&
    ReviewVariantSchemaV2.same(context.receipt.notExamined, context.report.value.notExamined), "host variant coverage differs from its actual ledger")
}
