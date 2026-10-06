export * as AuthoringStore from "./store"

import { Context, Effect } from "effect"
import type { RelayAuthoring } from "@opencode-ai/schema/relay-authoring"
import type { AuthoringGraph } from "./graph"

// Documents, versions and scopes in `authoring.sqlite3` (bun:sqlite; relay_authoring/store.py; WP8). The same tables
// and row bodies as the Python store, so a Python-made database opens unchanged. There is no executions table: runs
// are durable events.

export interface SaveInput {
  readonly body: Partial<RelayAuthoring.Document>
  readonly id?: string
  readonly createID?: string
  // Both guards answer 409 `version-conflict` on mismatch.
  readonly expectedVersion?: string
  readonly expectedChecksum?: string
}

export interface Interface {
  readonly documents: () => Effect.Effect<ReadonlyArray<RelayAuthoring.Document>>
  readonly get: (id: string) => Effect.Effect<RelayAuthoring.Document, AuthoringGraph.Refusal>
  readonly save: (input: SaveInput) => Effect.Effect<RelayAuthoring.Document, AuthoringGraph.Refusal>
  // Saves only when the ID is new.
  readonly seed: (id: string, body: Partial<RelayAuthoring.Document>) => Effect.Effect<void, AuthoringGraph.Refusal>
  readonly remove: (id: string) => Effect.Effect<void, AuthoringGraph.Refusal>
  readonly versions: (id: string) => Effect.Effect<ReadonlyArray<RelayAuthoring.Version>>
  readonly version: (id: string, versionID: string) => Effect.Effect<RelayAuthoring.Version, AuthoringGraph.Refusal>
  readonly publish: (
    id: string,
    versionID: string,
    expectedChecksum?: string,
  ) => Effect.Effect<RelayAuthoring.Document, AuthoringGraph.Refusal>
  readonly unpublish: (
    id: string,
    expectedChecksum?: string,
  ) => Effect.Effect<RelayAuthoring.Document, AuthoringGraph.Refusal>
  readonly scopes: () => Effect.Effect<ReadonlyArray<RelayAuthoring.Scope>>
  readonly saveScope: (
    body: { readonly name: string; readonly description?: string },
    id?: string,
  ) => Effect.Effect<RelayAuthoring.Scope, AuthoringGraph.Refusal>
  readonly removeScope: (id: string) => Effect.Effect<void, AuthoringGraph.Refusal>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/relay/AuthoringStore") {}

// Opens `<dataDir>/authoring.sqlite3` scoped to one workspace (WAL, foreign keys on).
export const open = (dataDir: string, workspaceID: string): Effect.Effect<Interface> => Effect.die("not implemented")

// sha256 of the document as `json.dumps(sort_keys=True, ensure_ascii=False)` encodes it.
export const checksum = (document: RelayAuthoring.Document): string => {
  throw new Error("not implemented")
}
