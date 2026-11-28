import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { SessionSchema } from "@orchestra/core/session"
import { SessionScope } from "@orchestra/core/session/scope"
import { SessionTable } from "@orchestra/core/session/sql"
import { ReviewResultV2 } from "../../src/v2/governance/review-result"
import { ReviewEngagementStoreV2 } from "../../src/v2/tools/review-engagement-store"
import { ReviewEngagementPolicyV2 } from "../../src/v2/workflow/review-engagement-policy"
import { type Ctx } from "./lucy-engagement"
import { canonical, digest, receipt, required, type ReceiptV2 } from "./lucy-engagement-artifacts"
import { StateV3, type Examination, type Variants } from "./lucy-variant-schema"
import { nativeSearches } from "./lucy-variants"

type Delivered = Effect.Success<ReturnType<typeof receipt>>

/** Check receipt claims against real native rows and retained producer bytes, independently of new production helpers. */
export const observedVariants = (host: Ctx, input: unknown, delivered: Delivered) => Effect.gen(function* () {
  expect(delivered.value.schema).toBe("review-engagement-evidence-v2")
  if (delivered.value.schema !== "review-engagement-evidence-v2") return yield* Effect.die("new admission has no variants receipt")
  const value = delivered.value
  const variants = value.variants
  const identity = ReviewEngagementStoreV2.identity(host.parent, Schema.decodeUnknownSync(ReviewEngagementPolicyV2.Input)(input))
  expect(variants.namespace).toBe(identity.key)
  expect(variants.policy).toBe("audit-variants-v1")
  expect(variants.generations.length).toBeLessThanOrEqual(variants.limit)
  expect(variants.generations.map<number>((item) => item.ordinal)).toEqual(variants.generations.map((_, index) => index + 1))
  const rows = yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)
  const lead = rows.find((row) => row.id === value.sessionID)
  expect(lead?.parent_id).toBe(host.parent.id)
  const stored = Schema.decodeUnknownSync(StateV3)(lead?.metadata?.lucyEngagementV1, { onExcessProperty: "error" })
  expect(stored.schema).toBe("review-engagement-state-v3")
  expect(stored.state).toBe("terminal")
  if (!stored.source) return yield* Effect.die("completed variants receipt has no captured durable source")
  expect(stored.variants).toEqual({ policy: variants.policy, limit: variants.limit, phase: "closed", stop: variants.stop,
    reservations: variants.generations.map((generation) => ({
      generationID: generation.generationID, ordinal: generation.ordinal, sourceSha256: generation.sourceSha256,
      seed: generation.seed, reservedAt: generation.reservedAt, proposalKey: generation.proposalKey, status: "settled",
      settlement: { sha256: digest(canonical(generation)), decision: generation.decision,
        ...(generation.search.status === "accepted" ? { counts: generation.search.counts } : {}) },
    })),
  })

  for (const region of variants.regions) {
    expect(region.sourceSha256).toBe(value.sourceSha256)
    expect(region.textSha256).toBe(digest(region.text))
    expect(region.regionID).toBe(digest(canonical({ schema: "review-variant-region-v1", sourceSha256: region.sourceSha256,
      path: region.path, oid: region.oid, blobSha256: region.blobSha256,
      startLine: region.startLine, endLine: region.endLine, textSha256: region.textSha256 })))
    expect(region.endLine).toBeGreaterThanOrEqual(region.startLine)
    expect(region.endLine - region.startLine + 1).toBeLessThanOrEqual(400)
  }
  for (const reply of variants.replies) {
    expect(reply.sessionID).toBe("ses_lucy_engagement_" + digest(canonical({ namespace: identity.key, key: reply.childKey, role: reply.role })))
    expect(reply.promptMessageID).toBe("msg_lucy_engagement_" + digest(canonical({ key: identity.key, child: reply.sessionID, turn: reply.turnKey })))
    expect(reply.textSha256).toBe(digest(reply.text))
    expect(reply.replyID).toBe(digest(canonical({ schema: "review-variant-reply-v1", inputHash: value.inputHash,
      sessionID: reply.sessionID, promptMessageID: reply.promptMessageID, assistantMessageID: reply.assistantMessageID,
      textPartID: reply.textPartID, textSha256: reply.textSha256 })))
    const messages = yield* host.sessions.context(SessionSchema.ID.make(reply.sessionID))
    expect(messages.some((message) => message.type === "user" && message.id === reply.promptMessageID)).toBe(true)
    const assistant = messages.find((message) => message.type === "assistant" && message.id === reply.assistantMessageID)
    if (!assistant || assistant.type !== "assistant") return yield* Effect.die("receipt reply has no real native assistant")
    const part = assistant.content.filter((item) => item.type === "text").at(-1)
    expect(part?.id).toBe(reply.textPartID)
    expect(part?.text).toBe(reply.text)
    expect(assistant.time.completed).toBeDefined()
    expect(rows.find((row) => row.id === reply.sessionID)?.parent_id).toBe(SessionSchema.ID.make(value.sessionID))
  }
  for (const seed of variants.seeds) {
    expect(seed.seedID).toBe(digest(canonical({ schema: "review-variant-seed-v1", sourceSha256: value.sourceSha256,
      finding: seed.finding })))
    expect(seed.examination.verdict.state).toBe("confirmed")
    observedExamination(seed.examination, seed.finding.id, variants)
    const region = variants.regions.find((item) => item.regionID === seed.examination.regionID)
    expect(region).toMatchObject({ path: seed.finding.path, startLine: seed.finding.line,
      endLine: seed.finding.endLine ?? seed.finding.line })
    if (seed.finding.evidence.kind === "quote") {
      expect(seed.toolProofID).toBeUndefined()
      expect(variants.regions.find((item) => item.regionID === seed.examination.quoteRegionID)).toMatchObject({
        path: seed.finding.evidence.path, startLine: seed.finding.evidence.startLine, endLine: seed.finding.evidence.endLine,
      })
    }
  }
  for (const generation of variants.generations) {
    expect(generation.generationID).toBe(digest(canonical({ schema: "review-variant-generation-v1",
      namespace: identity.key, inputHash: value.inputHash, sourceSha256: value.sourceSha256,
      ordinal: generation.ordinal, seedID: generation.seed.seedID })))
    expect(generation.reservedAt).toBeGreaterThanOrEqual(value.budget.startedAt)
    expect(generation.reservedAt).toBeLessThan(value.budget.deadlineAt)
    expect(generation.proposalKey).toBe(`variant:${generation.ordinal}:proposal`)
    const expectedSession = "ses_lucy_engagement_" + digest(canonical({ namespace: identity.key, key: generation.proposalKey, role: "lens" }))
    const scope = Schema.decodeUnknownSync(SessionScope.State)(rows.find((row) => row.id === expectedSession)?.metadata?.[SessionScope.KEY])
    expect(scope.scope.skills).toEqual({ entry: "lucy-audit-variant", allow: [] })
    expect([...scope.scope.tools].sort()).toEqual(["code_locate", "code_query", "code_search", "skill"])
    expect(scope.held).toContain("lucy-audit-variant")
    const actual = yield* nativeSearches(host, expectedSession)
    expect(generation.attempts).toHaveLength(actual.length)
    for (const attempt of generation.attempts) {
      expect(attempt.sessionID).toBe(expectedSession)
      expect(attempt.sourceSha256).toBe(value.sourceSha256)
      const call = actual.find((item) => item.assistantMessageID === attempt.assistantMessageID && item.toolCallID === attempt.toolCallID)
      expect(call).toBeDefined()
      if (!call) return yield* Effect.die("receipt attempt has no actual native search call")
      expect(attempt.status).toBe(call.status)
      expect(attempt.providerExecuted).toBe(call.providerExecuted)
      expect(attempt.attemptID).toBe(digest(canonical({ schema: "review-engagement-code-operation-v1", inputHash: value.inputHash,
        sessionID: attempt.sessionID, assistantMessageID: attempt.assistantMessageID, toolCallID: attempt.toolCallID,
        name: "code_search", sourceSha256: value.sourceSha256 })))
      if (attempt.operationID) expect(attempt.operationID).toBe(attempt.attemptID)
    }
    if (generation.search.status !== "accepted") continue
    const search = generation.search
    const operation = value.operations.find((item) => item.operationID === search.operationID)
    if (!operation || operation.kind !== "code") return yield* Effect.die("accepted search has no retained CODE operation")
    expect(operation.name).toBe("code_search")
    expect(operation.sessionID).toBe(expectedSession)
    expect(operation.input).toMatchObject({ paths: ["**"], offset: 0, limit: 200, context: 0 })
    expect(operation.nativeSettlement).toEqual({ status: "completed", messageID: operation.assistantMessageID })
    const body = Schema.decodeUnknownSync(RetainedSearch)(JSON.parse(required(delivered.bodies, operation.evidence.artifactID).toString("utf8")))
    expect(body.source.commit).toBe(stored.source.commit)
    expect(body.source.scope.sha256).toBe(value.sourceSha256)
    expect(body.result.basis.coverage.complete).toBe(true)
    expect(body.result.basis.coverage.binariesSkipped).toBe(0)
    expect(body.result.basis.bounds.truncated).toBe(false)
    expect(body.result.next).toBeUndefined()
    expect(search.rawMatches).toBe(body.result.matches.length)
    const anchors = [...new Set(body.result.matches.map((item) => JSON.stringify([item.path, item.line])))].sort()
    expect(search.distinctMatches).toBe(anchors.length)
    expect([...search.excluded, ...search.matches].map((item) => JSON.stringify([item.path, item.line])).sort()).toEqual(anchors)
    expect(body.result.matches).toContainEqual(expect.objectContaining(search.control))
    for (const match of search.matches) {
      const seed = variants.seeds.find((item) => item.seedID === generation.seed.seedID)
      if (!seed) return yield* Effect.die("generation seed missing")
      expect(match.matchID).toBe(digest(canonical({ schema: "review-variant-match-v1", sourceSha256: value.sourceSha256,
        defectClass: seed.finding.class, path: match.path, line: match.line })))
      if (match.state !== "not-examined") {
        observedExamination(match.examination, `V${generation.ordinal}-${match.matchID}`, variants)
        expect(match.examination.verifierSessionID).not.toBe(expectedSession)
      }
    }
    expect(search.counts).toEqual({ matches: search.matches.length,
      confirmed: search.matches.filter((item) => item.state === "confirmed").length,
      noise: search.matches.filter((item) => item.state === "noise").length,
      questions: search.matches.filter((item) => item.state === "question").length,
      notExamined: search.matches.filter((item) => item.state === "not-examined").length })
  }
  return { value, variants, stored }
})

function observedExamination(examination: Examination, candidateID: string, variants: Variants) {
  const reply = variants.replies.find((item) => item.replyID === examination.replyID)
  expect(reply?.role).toBe("verifier")
  expect(reply?.sessionID).toBe(examination.verifierSessionID)
  const block = reply && /^```review-verify\r?\n([\s\S]*)\r?\n```$/.exec(reply.text)?.[1]
  if (!block) throw new Error("examination does not reference an actual verifier return")
  const parsed = ReviewResultV2.parseVerifier(JSON.parse(block))
  if (!parsed) throw new Error("observed verifier return did not decode")
  expect(examination.verdictIndex).toBeLessThan(examination.candidateCap)
  expect(examination.rawVerdict).toEqual(parsed.results[examination.verdictIndex])
  expect(examination.rawVerdict.candidate).toBe(candidateID)
  expect(examination.verdict.candidate).toBe(candidateID)
  expect(variants.regions.some((region) => region.regionID === examination.regionID)).toBe(true)
}

const RetainedSearch = Schema.Struct({
  source: Schema.Struct({ commit: Schema.String, scope: Schema.Struct({ sha256: Schema.String, files: Schema.Array(Schema.String) }) }),
  result: Schema.Struct({ matches: Schema.Array(Schema.Struct({ path: Schema.String, line: Schema.Number })),
    next: Schema.optional(Schema.Number), basis: Schema.Struct({
      coverage: Schema.Struct({ complete: Schema.Boolean, binariesSkipped: Schema.Number }),
      bounds: Schema.Struct({ truncated: Schema.Boolean }),
    }) }),
})

export function accepted(receipt: ReceiptV2, ordinal = 1) {
  const generation = receipt.variants.generations[ordinal - 1]
  if (!generation || generation.search.status !== "accepted") throw new Error("expected an actually accepted variant search")
  return { generation, search: generation.search }
}
