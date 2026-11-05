export * as FabricRecordsContract from "./record-contract"

import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import type { Database } from "@orchestra/core/database/database"
import type { CredentialCipher } from "@orchestra/core/credential"
import type { Project } from "@orchestra/core/project"
import type { Capability } from "@orchestra/schema/capability"
import type { FabricContext } from "@orchestra/schema/fabric-context"
import type { FabricRecord } from "@orchestra/schema/fabric-record"
import type { AbsolutePath } from "@orchestra/schema/schema"
import type { Effect } from "effect"

export type Error = FabricRecord.Failure | FabricContext.Failure | Capability.Failure
export type Selection = Readonly<{ context: FabricContext.Ref; record: FabricRecord.Ref }>
export type Write = Readonly<{
  context: FabricContext.Ref
  id: FabricRecord.ID
  kind: FabricRecord.Kind
  expected: number | null
  payload: string
  metadata?: string
}>
export type Limits = Readonly<{ payloadBytes: number; contextBytes: number; storeBytes: number; records: number }>
export type Options = Readonly<{
  operators: CapabilityOperatorContract.Interface
  root: AbsolutePath
  limits?: Partial<Limits>
}>
export type Interface = Readonly<{
  list: (input: FabricRecord.Query) => Effect.Effect<FabricRecord.Page, Error>
  get: (
    input: Selection,
  ) => Effect.Effect<Readonly<{ record: FabricRecord.Ref; payload: string; metadata?: string }>, Error>
  put: (input: Write) => Effect.Effect<FabricRecord.Ref, Error>
  remove: (input: Selection) => Effect.Effect<FabricRecord.Ref, Error>
}>
export type Factory = (
  options: Options,
) => Effect.Effect<Interface, Error, Database.Service | Project.Service | CredentialCipher.Service>
