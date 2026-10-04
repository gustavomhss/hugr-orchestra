export * as Archive from "./archive"

import { Context, Effect, Layer, Schema } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { SessionID } from "@/session/schema"
import type { ArchiveChunk, ArchiveReference } from "./memory-types"

export class ArchiveError extends Schema.TaggedErrorClass<ArchiveError>()("ContinuityArchiveError", {
  reason: Schema.String,
}) {}

export interface Interface {
  readonly publish: (input: { sessionID: SessionID; messages: SessionV1.WithParts[] }) => Effect.Effect<ArchiveChunk[], ArchiveError>
  readonly list: (sessionID: SessionID) => Effect.Effect<ArchiveReference[], ArchiveError>
  readonly read: (input: { sessionID: SessionID; id: string }) => Effect.Effect<ArchiveChunk | undefined, ArchiveError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ContinuityArchive") {}

export const layer = Layer.succeed(Service, Service.of({
  publish: () => Effect.fail(new ArchiveError({ reason: "archive-not-implemented" })),
  list: () => Effect.fail(new ArchiveError({ reason: "archive-not-implemented" })),
  read: () => Effect.fail(new ArchiveError({ reason: "archive-not-implemented" })),
}))

export const node = LayerNode.make({ service: Service, layer, deps: [FSUtil.node] })
