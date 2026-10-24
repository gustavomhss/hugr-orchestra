export * as MaestroAtlasToolV2 from "./atlas"

import { Buffer } from "node:buffer"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionStore } from "@orchestra/core/session"
import { SkillV2 } from "@orchestra/core/skill"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Tools } from "@orchestra/core/tool/tools"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { AtlasKnowledge } from "@orchestra/schema/atlas-knowledge"
import { Effect, Layer, Schema } from "effect"
import { MaestroAtlasSourceV2 } from "../atlas-source"
import { MaestroSeats } from "../seats-service"

export const name = "atlas_context"

const closed = { parseOptions: { onExcessProperty: "error" } } as const
const Catalog = Schema.Struct({ action: Schema.Literal("catalog") }).annotate(closed)
const Unit = Schema.Struct({
  action: Schema.Literal("unit"),
  unit: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
}).annotate(closed)
// Accepted so a seat other than Archie is refused by name; V2 does not bind anchors yet (see `anchorUnavailable`).
const Anchor = Schema.Struct({
  action: Schema.Literal("anchor"),
  target: AtlasKnowledge.Target,
  units: Schema.Array(AtlasKnowledge.UnitID).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(AtlasKnowledge.MAX_UNITS),
    Schema.isUnique(),
  ),
}).annotate(closed)
export const Input = Schema.Union([Catalog, Unit, Anchor])

export type Coverage =
  | Effect.Success<ReturnType<typeof MaestroAtlasSourceV2.catalog>>["coverage"]
  | Effect.Success<ReturnType<typeof MaestroAtlasSourceV2.unit>>["coverage"]
  | { readonly state: "held" | "unavailable"; readonly reason: string }

/** The host receipt of one call, V1's `metadata.atlasContext`: here the structured tool output. */
export type Receipt = {
  readonly projectID: string | null
  readonly sourceIdentity: string | null
  readonly unit?: string
  readonly contentHash?: string
  readonly receiptHash?: string
  readonly coverage: Coverage
}

export type Result = { readonly title: string; readonly output: string; readonly atlasContext: Receipt }

export const Output = Schema.Struct({ title: Schema.String, output: Schema.String, atlasContext: Schema.Unknown })

export const description =
  'Read verified Atlas Knowledge/Own context: {"action":"catalog"} returns bounded unit/territory metadata, not bodies; {"action":"unit","unit":"exact ID"} loads complete, fresh, current verified bytes. Return reference binds verified bodies to this actual call; no approval or Knowledge promotion. No nearest-name selection or owner/root arguments. Holds block only claims dependent on missing context.'

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const agents = yield* AgentV2.Service
    const seats = yield* MaestroSeats.Service
    const permission = yield* PermissionV2.Service
    const sessions = yield* SessionStore.Service
    const outputs = yield* ToolOutputStore.Service
    const services = {
      config: yield* Config.Service,
      git: yield* GitCli.Service,
      fs: yield* FSUtil.Service,
      skills: yield* SkillV2.Service,
    }
    yield* tools
      .register({
        [name]: Tool.make({
          description,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
          execute: (input, context) =>
            Effect.gen(function* () {
              if (!context.agent || !context.toolCallID || !context.assistantMessageID)
                return unavailable("missing-native-call-identity")
              const agent = yield* agents.get(context.agent)
              const member = MaestroAtlasSourceV2.reader(context.agent, seats)
              if (!member || agent?.id !== context.agent) return unavailable("native-atlas-owner-required")
              if (input.action === "anchor" && member !== "archie") return unavailable("native-archie-required")
              yield* permission
                .assert({
                  action: name,
                  resources: [member],
                  save: [member],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
                })
                .pipe(Effect.mapError((error) => new Tool.Failure({ message: "Atlas context was not permitted", error })))
              const session = yield* sessions.get(context.sessionID)
              if (!session) return unavailable("session-placement-unavailable")
              if (input.action === "anchor") return anchorUnavailable(session.projectID)
              const placement = { projectID: session.projectID, directory: session.location.directory }
              const result =
                input.action === "catalog"
                  ? yield* Effect.result(MaestroAtlasSourceV2.catalog(services, placement))
                  : yield* Effect.result(MaestroAtlasSourceV2.unit(services, placement, input.unit))
              if (result._tag === "Failure")
                return {
                  title: `Atlas context held: ${result.failure.reason}`,
                  output: JSON.stringify({
                    status: "held",
                    reason: result.failure.reason,
                    evidence: result.failure.evidence,
                  }),
                  atlasContext: {
                    projectID: session.projectID,
                    sourceIdentity: null,
                    ...(input.action === "unit" && { unit: input.unit }),
                    coverage: { state: "held" as const, reason: result.failure.reason },
                  },
                } satisfies Result
              const value = result.success
              return {
                title: "unit" in value ? `Atlas Own: ${value.unit}` : "Atlas context catalog",
                output: JSON.stringify(value),
                atlasContext: {
                  projectID: value.projectID,
                  sourceIdentity: value.sourceIdentity,
                  ...("unit" in value && {
                    unit: value.unit,
                    contentHash: value.contentHash,
                    receiptHash: value.receiptHash,
                  }),
                  coverage: value.coverage,
                },
              } satisfies Result
            }).pipe(Effect.flatMap((result) => outputs.limits().pipe(Effect.map((limits) => bound(result, limits))))),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

/**
 * Keeps the output inside the generic tool output limits by replacing it with an explicit hold, never a truncated body:
 * a partial unit or catalog must not read as complete context.
 */
export function bound(result: Result, limits: { readonly maxBytes: number; readonly maxLines: number }): Result {
  if (Buffer.byteLength(result.output, "utf8") <= limits.maxBytes && result.output.split("\n").length <= limits.maxLines)
    return result
  const coverage = result.atlasContext.coverage
  const reason =
    coverage.state === "held" || coverage.state === "unavailable" ? coverage.reason : "context-output-budget-exceeded"
  const status = coverage.state === "unavailable" ? "unavailable" : "held"
  const compact = JSON.stringify({ status, reason })
  const output =
    Buffer.byteLength(compact, "utf8") <= limits.maxBytes
      ? compact
      : JSON.stringify({ status: "held", reason: "context-output-budget-exceeded" })
  if (Buffer.byteLength(output, "utf8") > limits.maxBytes || limits.maxLines < 1)
    throw new Error("Atlas context output budget cannot carry an explicit hold")
  return {
    title: "Atlas context held: output budget",
    output,
    atlasContext: {
      projectID: result.atlasContext.projectID,
      sourceIdentity: null,
      ...(result.atlasContext.unit ? { unit: result.atlasContext.unit } : {}),
      coverage: {
        state: output === compact ? status : "held",
        reason: output === compact ? reason : "context-output-budget-exceeded",
      },
    },
  }
}

function unavailable(reason: string): Result {
  return {
    title: "Atlas context unavailable",
    output: JSON.stringify({ status: "unavailable", reason }),
    atlasContext: { projectID: null, sourceIdentity: null, coverage: { state: "unavailable", reason } },
  }
}

// V1 binds an anchor to Archie's native call through Atlas Knowledge, which grounded dispatch later resolves. V2 has no
// such resolver yet, so an anchor is an explicit hold rather than an unbound receipt.
function anchorUnavailable(projectID: string): Result {
  const reason = "anchor-unavailable-on-v2"
  return {
    title: `Atlas context held: ${reason}`,
    output: JSON.stringify({ status: "held", reason, evidence: [] }),
    atlasContext: { projectID, sourceIdentity: null, coverage: { state: "held", reason } },
  }
}

export const node = makeLocationNode({
  name: "maestro/atlas-context",
  layer,
  deps: [
    ToolRegistry.node,
    AgentV2.node,
    MaestroSeats.node,
    PermissionV2.node,
    SessionStore.node,
    ToolOutputStore.node,
    Config.node,
    GitCli.node,
    FSUtil.node,
    SkillV2.node,
  ],
})
