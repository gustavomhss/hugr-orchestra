export * as MaestroContext from "./maestro-context"

import { Schema } from "effect"
import { NonNegativeInt } from "./schema"

const Hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const GitHash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/))
const Names = Schema.Array(Schema.NonEmptyString)

export const Grounding = Schema.Struct({
  catalogVersion: Schema.NonEmptyString,
  snapshot: Schema.NonEmptyString,
  sourceRevision: GitHash,
  sourceIdentityHash: Hash,
  units: Names.check(Schema.isMinLength(1)),
}).annotate({ identifier: "Maestro.Grounding" })

export const ToolPlan = Schema.Struct({
  version: Schema.Literal("context-tool-plan-v1"),
  actor: Schema.Struct({
    projectId: Schema.NonEmptyString,
    sessionId: Schema.NonEmptyString,
    memberId: Schema.NonEmptyString,
  }),
  actorBytes: Schema.NonEmptyString,
  planRevision: Schema.Struct({ id: Schema.NonEmptyString, hash: Hash }),
  catalogVersion: Schema.NonEmptyString,
  headSnapshot: Schema.NonEmptyString,
  sourceRevision: GitHash,
  territories: Names.check(Schema.isMinLength(1)),
  actions: Schema.Array(
    Schema.Struct({
      unit: Schema.NonEmptyString,
      skillName: Schema.NonEmptyString,
      operation: Schema.Literal("load-skill"),
      path: Schema.NonEmptyString,
      contentHash: Schema.NonEmptyString,
      receiptHash: Hash,
    }),
  ).check(Schema.isMinLength(1)),
  pointers: Schema.Array(
    Schema.Struct({
      unit: Schema.NonEmptyString,
      drillUnits: Names,
      manifest: Schema.Array(
        Schema.Struct({
          kind: Schema.Literals(["pack", "memory", "knowledge", "drill"]),
          name: Schema.NonEmptyString,
          digest: Schema.NonEmptyString,
          pull: Schema.NonEmptyString,
          hits: NonNegativeInt,
        }),
      ),
      pullReachable: Names,
    }),
  ),
  hash: Hash,
}).annotate({ identifier: "Maestro.ContextToolPlan" })

export const LoadedSkill = Schema.Struct({
  unit: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  content: Schema.NonEmptyString,
  contentHash: Schema.NonEmptyString,
  receiptHash: Hash,
}).annotate({ identifier: "Maestro.LoadedOwnSkill" })
