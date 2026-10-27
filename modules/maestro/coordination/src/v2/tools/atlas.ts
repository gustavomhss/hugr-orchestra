export * as MaestroAtlasToolV2 from "./atlas"

import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
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
// Native upstream seat only: anchors exact verified units to proposed work (see `anchor`).
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

/** The host receipt of one call, the earlier runtime's `metadata.atlasContext`: here the structured tool output. */
export type Receipt = {
  readonly projectID: string | null
  readonly sourceIdentity: string | null
  readonly unit?: string
  readonly contentHash?: string
  readonly receiptHash?: string
  readonly anchor?: AtlasKnowledge.Anchor
  readonly coverage: Coverage
}

export type Result = { readonly title: string; readonly output: string; readonly atlasContext: Receipt }

export const Output = Schema.Struct({ title: Schema.String, output: Schema.String, atlasContext: Schema.Unknown })

export const description =
  'Read verified Atlas Knowledge/Own context: {"action":"catalog"} returns bounded unit/territory metadata, not bodies; {"action":"unit","unit":"exact ID"} loads complete, fresh, current verified bytes. The upstream seat may anchor exact selected units to proposed work: {"action":"anchor","target":{"kind":"assignment|work-package","id":"work ID"},"units":["exact ID"]}. Return reference binds verified bodies to this actual call; no approval or Knowledge promotion. No nearest-name selection or owner/root arguments. Holds block only claims dependent on missing context.'

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
              const placement = { projectID: session.projectID, directory: session.location.directory }
              const result =
                input.action === "anchor"
                  ? yield* Effect.result(
                      anchor(services, placement, {
                        projectID: session.projectID,
                        authorSessionID: context.sessionID,
                        assistantMessageID: context.assistantMessageID,
                        callID: context.toolCallID,
                        target: input.target,
                        units: input.units,
                      }),
                    )
                  : input.action === "catalog"
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
              if ("reference" in value)
                return {
                  title: `Atlas anchor: ${value.target.kind} ${value.target.id}`,
                  // Bodies stay in the structured receipt a resolver reads; the model gets the binding only, so the
                  // generic tool output limit cannot hold a selection inside the 128KiB anchor budget.
                  output: JSON.stringify({
                    reference: value.reference,
                    target: value.target,
                    units: value.units.map((unit) => ({
                      unit: unit.unit,
                      name: unit.name,
                      sourceIdentity: unit.sourceIdentity,
                      sourceRevision: unit.sourceRevision,
                      contentHash: unit.contentHash,
                      receiptHash: unit.receiptHash,
                      bodyHash: unit.bodyHash,
                    })),
                  }),
                  atlasContext: {
                    projectID: value.projectID,
                    sourceIdentity: value.units[0].sourceIdentity,
                    anchor: value,
                    coverage: {
                      state: "complete" as const,
                      scope: "verified-own-unit" as const,
                      graphCoverage: "COMPLETE" as const,
                      freshness: "FRESH" as const,
                      currentBlobsChecked: true,
                      truncated: false,
                      note: "Exact selected Atlas Own bodies bound to this native upstream-seat call.",
                    },
                  },
                } satisfies Result
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

/**
 * The earlier runtime's `AtlasKnowledge.anchor` on V2: the upstream seat's exact selection of verified Own units, bound to this native call by a
 * reference over the canonical payload. The call identity is the runner's, so no history lookup is needed.
 */
const anchor = Effect.fn("MaestroAtlasToolV2.anchor")(function* (
  services: MaestroAtlasSourceV2.Services,
  placement: MaestroAtlasSourceV2.Placement,
  input: {
    readonly projectID: AtlasKnowledge.Anchor["projectID"]
    readonly authorSessionID: AtlasKnowledge.Anchor["authorSessionID"]
    readonly assistantMessageID: AtlasKnowledge.Anchor["assistantMessageID"]
    readonly callID: string
    readonly target: AtlasKnowledge.Target
    readonly units: readonly string[]
  },
) {
  const payload = {
    projectID: input.projectID,
    authorSessionID: input.authorSessionID,
    assistantMessageID: input.assistantMessageID,
    callID: input.callID,
    memberID: "archie" as const,
    target: input.target,
    units: yield* acquire(services, placement, input.units),
  }
  return { reference: digest(AtlasKnowledge.canonical(payload)), ...payload } satisfies AtlasKnowledge.Anchor
})

/**
 * The exact verified Own units an anchor binds, as the earlier runtime's `AtlasKnowledge.acquire` loads them for both anchoring and
 * resolving: every unit from one unchanged source, complete and fresh, inside the Knowledge body budget; anything else
 * is a hold.
 */
export const acquire = Effect.fn("MaestroAtlasToolV2.acquire")(function* (
  services: MaestroAtlasSourceV2.Services,
  placement: MaestroAtlasSourceV2.Placement,
  ids: readonly string[],
) {
  const before = yield* MaestroAtlasSourceV2.read(services, placement)
  const units = yield* Effect.forEach(
    ids,
    Effect.fnUntraced(function* (id) {
      const unit = yield* MaestroAtlasSourceV2.unit(services, placement, id)
      if (
        unit.projectID !== placement.projectID ||
        unit.unit !== id ||
        unit.sourceIdentity !== before.identityHash ||
        unit.sourceRevision !== before.context.sourceRevision ||
        unit.receipt.sourceRevision !== unit.sourceRevision ||
        unit.coverage.state !== "complete" ||
        unit.coverage.freshness !== "FRESH" ||
        unit.coverage.truncated !== false
      )
        return yield* held("unit-acquisition-mismatch", [id])
      return {
        unit: unit.unit,
        name: unit.name,
        sourceIdentity: unit.sourceIdentity,
        sourceRevision: unit.receipt.sourceRevision,
        contentHash: unit.contentHash,
        receiptHash: unit.receiptHash,
        bodyHash: digest(unit.content),
        content: unit.content,
      } satisfies AtlasKnowledge.Unit
    }),
  )
  if (units.reduce((bytes, unit) => bytes + Buffer.byteLength(unit.content, "utf8"), 0) > AtlasKnowledge.MAX_BYTES)
    return yield* held("knowledge-body-budget-exceeded", ids)
  const after = yield* MaestroAtlasSourceV2.read(services, placement)
  if (after.identityHash !== before.identityHash || after.directory !== before.directory)
    return yield* held("source-changed-during-anchor", [before.identityHash, after.identityHash])
  return units
})

function held(reason: string, evidence: readonly string[]) {
  return Effect.fail(new MaestroAtlasSourceV2.Held({ reason, evidence }))
}

export function digest(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex")
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
