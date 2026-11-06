export * as FabricDocumentsContract from "./document-contract"

import type { FabricContext } from "@orchestra/schema/fabric-context"
import type { FabricRecord } from "@orchestra/schema/fabric-record"
import type { Effect } from "effect"
import type { FabricRecordsContract } from "./record-contract"

export type Kind = Extract<FabricRecord.Kind, "draft" | "composition" | "evidence">
export type Query = Readonly<{ context: FabricContext.Ref; kind: Kind; after?: FabricRecord.ID; limit?: number }>
export type Metadata = Readonly<{
  record: FabricRecord.Ref
  createdAt: number
  updatedAt: number
  expiresAt: number | null
  expired: boolean
}>
export type Write = Readonly<{
  context: FabricContext.Ref
  id: FabricRecord.ID
  kind: Kind
  expected: number | null
  payload: string
  consent?: boolean
}>
export type SweepItem =
  | Readonly<{ record: FabricRecord.Ref; status: "removed" | "retained" }>
  | Readonly<{ record: FabricRecord.Ref; status: "failed"; problem: FabricRecordsContract.Error }>
export type Options = FabricRecordsContract.Options & Readonly<{ now?: () => number }>
export type Interface = Readonly<{
  put: (input: Write) => Effect.Effect<FabricRecord.Ref, FabricRecordsContract.Error>
  get: (
    input: FabricRecordsContract.Selection,
  ) => Effect.Effect<Metadata & Readonly<{ payload: string }>, FabricRecordsContract.Error>
  inspect: (
    input: Query,
  ) => Effect.Effect<Readonly<{ items: readonly Metadata[]; after?: FabricRecord.ID }>, FabricRecordsContract.Error>
  remove: (
    input: FabricRecordsContract.Selection & Readonly<{ confirm: boolean }>,
  ) => Effect.Effect<FabricRecord.Ref, FabricRecordsContract.Error>
  sweep: (input: Query & Readonly<{ confirm: boolean }>) => Effect.Effect<
    Readonly<{
      items: readonly SweepItem[]
      complete: boolean
      after?: FabricRecord.ID
    }>,
    FabricRecordsContract.Error
  >
}>
export type Factory = (
  options: Options,
) => Effect.Effect<
  Interface,
  Effect.Error<ReturnType<FabricRecordsContract.Factory>>,
  Effect.Services<ReturnType<FabricRecordsContract.Factory>>
>
