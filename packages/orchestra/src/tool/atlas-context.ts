import { Effect, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { AtlasDiscovery } from "@/maestro/atlas-discovery"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import type { Anchor } from "@orchestra/schema/atlas-knowledge"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"
import { ResearchSourceCapture } from "@/research/source-capture"
import { Research } from "@orchestra/schema/research"
import { Truncate } from "./truncate"

const closed = { parseOptions: { onExcessProperty: "error" } } as const
const Parameters = Schema.Union([
  Schema.Struct({ action: Schema.Literal("catalog") }).annotate(closed),
  Schema.Struct({
    action: Schema.Literal("unit"),
    unit: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  }).annotate(closed),
  AtlasKnowledge.Invocation,
])
const jsonSchema = ToolJsonSchema.fromSchema(Parameters)

export type AtlasContextReceipt = {
  projectID: string | null
  sourceIdentity: string | null
  unit?: string
  contentHash?: string
  receiptHash?: string
  anchor?: Anchor
  coverage:
    | Effect.Success<ReturnType<typeof AtlasDiscovery.catalog>>["coverage"]
    | Effect.Success<ReturnType<typeof AtlasDiscovery.unit>>["coverage"]
    | { state: "held" | "unavailable"; reason: string }
}

export const AtlasContextTool = Tool.define("atlas_context", Effect.gen(function* () {
  const agents = yield* Agent.Service
  const sessions = yield* Session.Service
  const config = yield* Config.Service
  const git = yield* Git.Service
  const fs = yield* FileSystem.FileSystem
  const skills = yield* Skill.Service
  const truncate = yield* Truncate.Service
  const knowledge = yield* AtlasKnowledge.Service
  return {
    parameters: Parameters,
    jsonSchema: {
      ...jsonSchema,
      anyOf: jsonSchema.anyOf?.map((branch) => {
        if (typeof branch === "boolean") return branch
        const target = branch.properties?.target
        return { ...branch, additionalProperties: false,
          ...(target && typeof target !== "boolean" ? {
            properties: { ...branch.properties, target: { ...target, additionalProperties: false } },
          } : {}),
        }
      }),
    },
    description: 'Read verified Atlas Knowledge/Own context: {"action":"catalog"} returns bounded unit/territory metadata, not bodies; {"action":"unit","unit":"exact ID"} loads complete, fresh, current verified bytes. Native Archie may anchor exact selected units to proposed work: {"action":"anchor","target":{"kind":"assignment|work-package","id":"work ID"},"units":["exact ID"]}. Return reference binds verified bodies to this actual call; no approval or Knowledge promotion. No nearest-name selection or owner/root arguments. Holds block only claims dependent on missing context.',
    execute: (input: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context): Effect.Effect<Tool.ExecuteResult<{ truncated?: boolean; atlasContext: AtlasContextReceipt; researchSource?: Research.SourceReceipt }>> => Effect.gen(function* () {
      if (!ctx.agentID || !ctx.callID || !ctx.messageID) return unavailable("missing-native-call-identity")
      const agent = yield* agents.get(ctx.agentID)
      const member = AtlasMemory.owner(agent)
      if (!member || agent.id !== ctx.agentID) return unavailable("native-atlas-owner-required")
      if (input.action === "anchor" && member !== "archie") return unavailable("native-archie-required")
      yield* ctx.ask({ permission: "atlas_context", patterns: [member], always: [member], metadata: {} })
      const placement = yield* sessions.get(ctx.sessionID).pipe(Effect.result)
      if (placement._tag === "Failure") return unavailable("session-placement-unavailable")
      const session = placement.success
      const callID = ctx.callID
      const result = yield* Effect.gen(function* () {
        if (input.action === "catalog") return yield* AtlasDiscovery.catalog(session)
        if (input.action === "anchor") return yield* knowledge.anchor({
          session, assistantMessageID: ctx.messageID, callID, target: input.target, units: input.units,
        })
        return yield* AtlasDiscovery.unit(session, input.unit)
      }).pipe(
          Effect.result,
          Effect.provideService(Config.Service, config),
          Effect.provideService(Git.Service, git),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Skill.Service, skills),
        )
      if (result._tag === "Failure") return {
        title: `Atlas context held: ${result.failure.reason}`,
        output: JSON.stringify({ status: "held", reason: result.failure.reason, evidence: result.failure.evidence }),
        metadata: { atlasContext: {
          projectID: session.projectID,
          sourceIdentity: null,
          ...(input.action === "unit" && { unit: input.unit }),
          coverage: { state: "held" as const, reason: result.failure.reason },
        } },
      }
      const value = result.success
      if ("reference" in value) return {
        title: `Atlas anchor: ${value.target.kind} ${value.target.id}`,
        // Bodies stay in host metadata, which resolution reads; the model gets the binding receipt only, so the
        // generic tool output limit cannot hold a selection inside the 128KiB anchor budget.
        output: JSON.stringify({ reference: value.reference, target: value.target, units: value.units.map((unit) => ({
          unit: unit.unit, name: unit.name, sourceIdentity: unit.sourceIdentity, sourceRevision: unit.sourceRevision,
          contentHash: unit.contentHash, receiptHash: unit.receiptHash, bodyHash: unit.bodyHash,
        })) }),
        metadata: { truncated: false, atlasContext: {
          projectID: value.projectID, sourceIdentity: value.units[0].sourceIdentity, anchor: value,
          coverage: { state: "complete" as const, scope: "verified-own-unit" as const,
            graphCoverage: "COMPLETE" as const, freshness: "FRESH" as const, currentBlobsChecked: true,
            truncated: false, note: "Exact selected Atlas Own bodies bound to this native Archie call." },
        } },
      }
      const output = JSON.stringify(value)
      const capture = yield* ResearchSourceCapture.Current
      const source = capture ? yield* capture({
        origin: "unit" in value ? { kind: "atlas-own", uri: `atlas-own:${value.unit}`, revision: value.contentHash }
          : { kind: "tool-output", uri: `native:${ctx.sessionID}/${ctx.messageID}/${ctx.callID}/atlas_context` },
        representation: "structured-json", mediaType: "application/json", content: output,
        complete: value.coverage.state === "complete",
        ...("unit" in value ? { atlas: { sourceIdentity: value.sourceIdentity, unit: value.unit,
          contentHash: value.contentHash, receiptHash: value.receiptHash } } : {}),
      }) : undefined
      return {
        title: "unit" in value ? `Atlas Own: ${value.unit}` : "Atlas context catalog",
        output,
        metadata: { truncated: false, ...(source ? { researchSource: source } : {}), atlasContext: {
          projectID: value.projectID,
          sourceIdentity: value.sourceIdentity,
          ...("unit" in value && { unit: value.unit, contentHash: value.contentHash, receiptHash: value.receiptHash }),
          coverage: value.coverage,
        } },
      }
    }).pipe(Effect.flatMap((result) => truncate.limits().pipe(Effect.map((limits) => boundOutput(result, limits))))),
  }
}))

// Also applied after registry retention: its provenance footer is part of the delivered output.
export function boundRetained(id: string, result: Tool.ExecuteResult, truncate: Truncate.Interface) {
  return id === AtlasContextTool.id ? truncate.limits().pipe(Effect.map((limits) => boundOutput(result, limits)))
    : Effect.succeed(result)
}

export function boundOutput(
  result: Tool.ExecuteResult<{ truncated?: boolean; atlasContext: AtlasContextReceipt; researchSource?: Research.SourceReceipt }>,
  limits: { maxBytes: number; maxLines: number },
): typeof result
export function boundOutput(result: Tool.ExecuteResult, limits: { maxBytes: number; maxLines: number }): Tool.ExecuteResult
export function boundOutput(
  result: Tool.ExecuteResult<{ truncated?: boolean; atlasContext?: AtlasContextReceipt; researchSource?: Research.SourceReceipt }>,
  limits: { maxBytes: number; maxLines: number },
): typeof result {
  if (Buffer.byteLength(result.output, "utf8") <= limits.maxBytes && result.output.split("\n").length <= limits.maxLines)
    return { ...result, metadata: { ...result.metadata, truncated: result.metadata.truncated ?? false } }
  const context = result.metadata.atlasContext
  const coverage = context?.coverage
  const reason = coverage && (coverage.state === "held" || coverage.state === "unavailable")
    ? coverage.reason : "context-output-budget-exceeded"
  const status = coverage?.state === "unavailable" ? "unavailable" : "held"
  const compact = JSON.stringify({ status, reason })
  const output = Buffer.byteLength(compact, "utf8") <= limits.maxBytes
    ? compact : JSON.stringify({ status: "held", reason: "context-output-budget-exceeded" })
  if (Buffer.byteLength(output, "utf8") > limits.maxBytes || limits.maxLines < 1)
    throw new Error("Atlas context output budget cannot carry an explicit hold")
  return {
    title: "Atlas context held: output budget",
    output,
    metadata: { truncated: false,
      ...(result.metadata.researchSource ? { researchSource: result.metadata.researchSource } : {}),
      atlasContext: {
        projectID: context?.projectID ?? null, sourceIdentity: null,
        ...(context?.unit ? { unit: context.unit } : {}),
        coverage: { state: output === compact ? status : "held",
          reason: output === compact ? reason : "context-output-budget-exceeded" },
      },
    },
  }
}

function unavailable(reason: string): Tool.ExecuteResult<{ atlasContext: AtlasContextReceipt }> {
  return {
    title: "Atlas context unavailable",
    output: JSON.stringify({ status: "unavailable", reason }),
    metadata: { atlasContext: { projectID: null, sourceIdentity: null, coverage: { state: "unavailable", reason } } },
  }
}
