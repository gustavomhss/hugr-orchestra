import { Effect, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { AtlasDiscovery } from "@/maestro/atlas-discovery"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"
import { ResearchSourceCapture } from "@/research/source-capture"
import { Research } from "@orchestra/schema/research"

const closed = { parseOptions: { onExcessProperty: "error" } } as const
const Parameters = Schema.Union([
  Schema.Struct({ action: Schema.Literal("catalog") }).annotate(closed),
  Schema.Struct({
    action: Schema.Literal("unit"),
    unit: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  }).annotate(closed),
])
const jsonSchema = ToolJsonSchema.fromSchema(Parameters)

export type AtlasContextReceipt = {
  projectID: string | null
  sourceIdentity: string | null
  unit?: string
  contentHash?: string
  receiptHash?: string
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
  return {
    parameters: Parameters,
    jsonSchema: {
      ...jsonSchema,
      anyOf: jsonSchema.anyOf?.map((branch) => typeof branch === "boolean" ? branch : { ...branch, additionalProperties: false }),
    },
    description: 'Read verified Atlas Knowledge/Own context: {"action":"catalog"} returns bounded unit/territory metadata, not bodies; {"action":"unit","unit":"exact ID"} loads complete, fresh, current verified bytes. No nearest-name selection, owner/root arguments, approval or Knowledge promotion. Holds block only claims dependent on missing context.',
    execute: (input: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context): Effect.Effect<Tool.ExecuteResult<{ atlasContext: AtlasContextReceipt; researchSource?: Research.SourceReceipt }>> => Effect.gen(function* () {
      if (!ctx.agentID || !ctx.callID || !ctx.messageID) return unavailable("missing-native-call-identity")
      const agent = yield* agents.get(ctx.agentID)
      if (!(ctx.agentID === "jimmy" && AtlasMemory.owner(agent) === "jimmy") &&
        !(ctx.agentID === "archie" && agent?.native === true && agent.id === "archie"))
        return unavailable("native-context-reader-required")
      yield* ctx.ask({ permission: "atlas_context", patterns: [ctx.agentID], always: [ctx.agentID], metadata: {} })
      const placement = yield* sessions.get(ctx.sessionID).pipe(Effect.result)
      if (placement._tag === "Failure") return unavailable("session-placement-unavailable")
      const session = placement.success
      const result = yield* Effect.gen(function* () {
        if (input.action === "catalog") return yield* AtlasDiscovery.catalog(session)
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
      const capture = yield* ResearchSourceCapture.Current
      const source = capture ? yield* capture({
        origin: "unit" in value ? { kind: "atlas-own", uri: `atlas-own:${value.unit}`, revision: value.contentHash }
          : { kind: "tool-output", uri: `native:${ctx.sessionID}/${ctx.messageID}/${ctx.callID}/atlas_context` },
        representation: "structured-json", mediaType: "application/json", content: JSON.stringify(value),
        complete: value.coverage.state === "complete",
        ...("unit" in value ? { atlas: { sourceIdentity: value.sourceIdentity, unit: value.unit,
          contentHash: value.contentHash, receiptHash: value.receiptHash } } : {}),
      }) : undefined
      return {
        title: "unit" in value ? `Atlas Own: ${value.unit}` : "Atlas context catalog",
        output: JSON.stringify(value),
        metadata: { ...(source ? { researchSource: source } : {}), atlasContext: {
          projectID: value.projectID,
          sourceIdentity: value.sourceIdentity,
          ...("unit" in value && { unit: value.unit, contentHash: value.contentHash, receiptHash: value.receiptHash }),
          coverage: value.coverage,
        } },
      }
    }),
  }
}))

function unavailable(reason: string): Tool.ExecuteResult<{ atlasContext: AtlasContextReceipt }> {
  return {
    title: "Atlas context unavailable",
    output: JSON.stringify({ status: "unavailable", reason }),
    metadata: { atlasContext: { projectID: null, sourceIdentity: null, coverage: { state: "unavailable", reason } } },
  }
}
