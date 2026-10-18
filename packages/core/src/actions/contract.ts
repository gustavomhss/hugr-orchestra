export * as ActionsContract from "./contract"

import { Actions } from "@orchestra/schema/actions"
import type { Effect, Scope, Stream } from "effect"
import type { ActionsError } from "./error"

export type Json = typeof import("effect").Schema.Json.Type
export type Request = {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  readonly path: string
  readonly query?: Readonly<Record<string, string | number | boolean>>
  readonly body?: Json
}
export type Response = { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly data: Json }
export type BindingIdentity = { readonly projectID: string; readonly projectPath: string; readonly account: string }
export type BindingResolver = (provider: Actions.Provider, projectPath: string) => Effect.Effect<BindingIdentity, ActionsError>
export type CommandResult = { readonly acknowledgement: Actions.OperationAcknowledgement; readonly output?: Actions.CommandOutput }
export type RawResponse = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: Stream.Stream<Uint8Array, ActionsError>
  readonly close: Effect.Effect<void>
}
export type BoundRequest = Request & { readonly method: "GET"; readonly body?: never }

export interface Transport {
  readonly resolve: BindingResolver
  readonly request: (binding: Actions.Binding, input: Request) => Effect.Effect<Response, ActionsError>
  readonly bytes: (binding: Actions.Binding, input: Request) => Stream.Stream<Uint8Array, ActionsError>
  readonly open?: (binding: Actions.Binding, input: BoundRequest) => Effect.Effect<RawResponse, ActionsError, Scope.Scope>
  readonly upload: (
    binding: Actions.Binding,
    input: Request,
    file: { readonly filename: string; readonly bytes: Stream.Stream<Uint8Array, ActionsError> },
  ) => Effect.Effect<Response, ActionsError>
}

export interface Bindings {
  readonly list: () => Effect.Effect<Actions.Binding[], ActionsError>
  readonly create: (input: Actions.BindingInput) => Effect.Effect<Actions.Binding, ActionsError>
  readonly update: (id: Actions.BindingID, input: Actions.BindingInput) => Effect.Effect<Actions.Binding, ActionsError>
  readonly remove: (input: Actions.BindingRef) => Effect.Effect<void, ActionsError>
  readonly get: (input: Actions.BindingRef) => Effect.Effect<Actions.Binding, ActionsError>
  readonly policy: (input: Actions.BindingRef) => Effect.Effect<Actions.PolicyState, ActionsError>
  readonly updatePolicy: (input: Actions.BindingRef, policy: Actions.Policy) => Effect.Effect<Actions.PolicyState, ActionsError>
}

export interface Adapter {
  readonly capabilities: (binding: Actions.Binding) => Effect.Effect<Actions.Capability[], ActionsError>
  readonly workflows: (binding: Actions.Binding, input: Actions.ListInput) => Effect.Effect<Actions.WorkflowPage, ActionsError>
  readonly source: (binding: Actions.Binding, input: { readonly path: string; readonly ref: string }) => Effect.Effect<Actions.Source, ActionsError>
  readonly runs: (binding: Actions.Binding, input: Actions.RunListInput) => Effect.Effect<Actions.RunPage, ActionsError>
  readonly run: (binding: Actions.Binding, id: string) => Effect.Effect<Actions.Run, ActionsError>
  readonly jobs: (binding: Actions.Binding, input: { readonly runID: string; readonly attempt?: number; readonly cursor?: string }) => Effect.Effect<Actions.JobPage, ActionsError>
  readonly resources: (binding: Actions.Binding, input: Actions.ResourceListInput) => Effect.Effect<Actions.ResourcePage, ActionsError>
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, input: Json) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError>
  readonly reconcile: (
    binding: Actions.Binding,
    intent: Actions.OperationIntent,
    acknowledgement?: Actions.OperationAcknowledgement,
  ) => Effect.Effect<Actions.OperationObservation, ActionsError>
  readonly transfer: (binding: Actions.Binding, input: Actions.TransferInput) => Stream.Stream<Uint8Array, ActionsError>
}

export interface Operations {
  readonly prepare: (binding: Actions.Binding, input: Actions.OperationIntent) => Effect.Effect<Actions.Operation, ActionsError>
  readonly execute: (
    binding: Actions.Binding,
    input: Actions.ExecuteInput,
    perform: (intent: Actions.OperationIntent, payload: Json) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError>,
  ) => Effect.Effect<Actions.Operation, ActionsError>
  readonly get: (binding: Actions.Binding, id: Actions.OperationID) => Effect.Effect<Actions.Operation, ActionsError>
  readonly reconcile: (
    binding: Actions.Binding,
    id: Actions.OperationID,
    observe: (intent: Actions.OperationIntent, acknowledgement?: Actions.OperationAcknowledgement) => Effect.Effect<Actions.OperationObservation, ActionsError>,
  ) => Effect.Effect<Actions.Operation, ActionsError>
}

export type ReadAdapter = Pick<Adapter, "capabilities" | "workflows" | "source" | "runs" | "run" | "jobs">
export interface Commands {
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, payload: Json) => Effect.Effect<CommandResult, ActionsError>
}

export interface ResourceDomain {
  readonly list: (binding: Actions.Binding, input: Actions.ResourceListInput) => Effect.Effect<Actions.ResourcePage, ActionsError>
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, payload: Json) => Effect.Effect<CommandResult, ActionsError>
}
