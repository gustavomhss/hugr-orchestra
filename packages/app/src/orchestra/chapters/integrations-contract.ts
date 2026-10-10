import type { Capability } from "@orchestra/schema/capability"
import type { CapabilityManagement } from "@orchestra/schema/capability-management"
import type { CapabilitySetup } from "@orchestra/schema/capability-setup"
import type { SessionID } from "@orchestra/schema/session-id"
import type { Schema } from "effect"

export type Connection = typeof CapabilityManagement.Connection.Type
export type Target = typeof CapabilityManagement.Target.Type
export type Binding = typeof CapabilityManagement.Binding.Type
export type Receipt = typeof CapabilityManagement.Receipt.Type
export type Options = Readonly<{ signal?: AbortSignal }>
export type Api = Readonly<{
  list: (after?: Capability.ConnectionID, options?: Options) => Promise<typeof CapabilityManagement.ConnectionPage.Type>
  targets: (connectionID: Capability.ConnectionID, after?: string, options?: Options) => Promise<typeof CapabilityManagement.TargetPage.Type>
  bindings: (targetID: Capability.TargetID, after?: SessionID, options?: Options) => Promise<typeof CapabilityManagement.BindingPage.Type>
  connect: (input: CapabilitySetup.Input, key: string, options?: Options) => Promise<Receipt>
  createTarget: (connection: Capability.ConnectionRef, input: Readonly<{ environment: string; resource: Schema.Json }>, key: string, options?: Options) => Promise<Receipt>
  retargetTarget: (target: Capability.TargetRef, input: Readonly<{ environment: string; resource: Schema.Json }>, key: string, options?: Options) => Promise<Receipt>
  removeTarget: (target: Capability.TargetRef, key: string, options?: Options) => Promise<Receipt>
  disconnect: (connection: Capability.ConnectionRef, key: string, options?: Options) => Promise<Receipt>
  bind: (target: Capability.TargetRef, input: Readonly<{ sessionID: SessionID; actions: readonly string[] }>, key: string, options?: Options) => Promise<Receipt>
  unbind: (target: Capability.TargetRef, sessionID: SessionID, key: string, options?: Options) => Promise<Receipt>
}>
export type Failure = "authorization" | "unsupported" | "invalid" | "request" | "unknown"
export type State = Readonly<{
  status: "loading" | "ready" | "error"
  connections: readonly Connection[]
  targets: readonly Target[]
  bindings: readonly Binding[]
  connectionID?: Capability.ConnectionID
  targetID?: Capability.TargetID
  after?: Capability.ConnectionID
  targetsAfter?: string
  bindingsAfter?: SessionID
  busy: boolean
  failure?: Failure
  receipt?: Receipt
}>
export type Model = Readonly<{
  state: State
  load: (more?: boolean) => Promise<void>
  select: (connection: Connection) => Promise<void>
  selectTarget: (target: Target) => Promise<void>
  moreTargets: () => Promise<void>
  moreBindings: () => Promise<void>
  connect: (input: CapabilitySetup.Input) => Promise<void>
  createTarget: (input: Readonly<{ environment: string; resource: Schema.Json }>) => Promise<void>
  retargetTarget: (input: Readonly<{ environment: string; resource: Schema.Json }>) => Promise<void>
  removeTarget: () => Promise<void>
  disconnect: () => Promise<void>
  bind: (input: Readonly<{ sessionID: SessionID; actions: readonly string[] }>) => Promise<void>
  unbind: (sessionID: SessionID) => Promise<void>
  retry: () => Promise<void>
  cancel: () => void
  dispose: () => void
}>
