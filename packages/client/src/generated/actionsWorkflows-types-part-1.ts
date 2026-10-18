import type { JsonValue } from "./types"

export type ActionsWorkflowsListInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly query?: string | undefined
    readonly state?: string | undefined
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly query?: string | undefined
    readonly state?: string | undefined
  }["revision"]
  readonly cursor?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly query?: string | undefined
    readonly state?: string | undefined
  }["cursor"]
  readonly limit?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly query?: string | undefined
    readonly state?: string | undefined
  }["limit"]
  readonly query?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly query?: string | undefined
    readonly state?: string | undefined
  }["query"]
  readonly state?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly query?: string | undefined
    readonly state?: string | undefined
  }["state"]
}

export type ActionsWorkflowsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly items: ReadonlyArray<{
      readonly id: string
      readonly bindingID: string
      readonly name: string | null
      readonly path: string
      readonly defaultRef?: string
      readonly state: string
      readonly dispatchable: boolean
      readonly dispatchState?: "available" | "unavailable" | "unknown"
      readonly inputs?: ReadonlyArray<{
        readonly name: string
        readonly description?: string
        readonly type: "string" | "boolean" | "number" | "choice" | "environment" | "file" | "array"
        readonly required: boolean
        readonly default?: JsonValue
        readonly options?: ReadonlyArray<string | boolean | number | "Infinity" | "-Infinity" | "NaN">
      }>
      readonly triggers?: ReadonlyArray<string>
      readonly updatedAt?: string
    }>
    readonly next?: string
    readonly total?: number | "Infinity" | "-Infinity" | "NaN"
    readonly capturedAt: number | "Infinity" | "-Infinity" | "NaN"
  }
}

export type ActionsWorkflowsSourceInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly path: string
    readonly ref: string
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly path: string
    readonly ref: string
  }["revision"]
  readonly path: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly path: string
    readonly ref: string
  }["path"]
  readonly ref: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly path: string
    readonly ref: string
  }["ref"]
}

export type ActionsWorkflowsSourceOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly bindingID: string
    readonly path: string
    readonly ref: string
    readonly commit?: string
    readonly version: string
    readonly text: string
    readonly editable: boolean
    readonly includes?: ReadonlyArray<string>
    readonly diagnostics?: ReadonlyArray<string>
  }
}

export type ActionsWorkflowsGraphInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly path: string
    readonly ref: string
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly path: string
    readonly ref: string
  }["revision"]
  readonly path: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly path: string
    readonly ref: string
  }["path"]
  readonly ref: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly path: string
    readonly ref: string
  }["ref"]
}

export type ActionsWorkflowsGraphOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly source: {
      readonly bindingID: string
      readonly path: string
      readonly ref: string
      readonly commit?: string
      readonly version: string
      readonly text: string
      readonly editable: boolean
      readonly includes?: ReadonlyArray<string>
      readonly diagnostics?: ReadonlyArray<string>
    }
    readonly state: "complete" | "partial" | "unresolved"
    readonly jobs: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly needs: ReadonlyArray<string>
      readonly stage?: string
      readonly condition?: string
      readonly runner?: JsonValue
      readonly matrix?: JsonValue
      readonly reusable?: string
      readonly configuration?: JsonValue
      readonly steps: ReadonlyArray<{
        readonly name: string
        readonly uses?: string
        readonly run?: string
        readonly condition?: string
      }>
    }>
    readonly diagnostics: ReadonlyArray<string>
    readonly triggers?: JsonValue
    readonly stages?: ReadonlyArray<string>
    readonly includes?: JsonValue
    readonly inputs?: ReadonlyArray<{
      readonly name: string
      readonly description?: string
      readonly type: "string" | "boolean" | "number" | "choice" | "environment" | "file" | "array"
      readonly required: boolean
      readonly default?: JsonValue
      readonly options?: ReadonlyArray<string | boolean | number | "Infinity" | "-Infinity" | "NaN">
    }>
    readonly header?: JsonValue
  }
}

export type ActionsWorkflowsDispatchInput = {
  readonly bindingID: { readonly bindingID: string; readonly workflowID: string }["bindingID"]
  readonly workflowID: { readonly bindingID: string; readonly workflowID: string }["workflowID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["revision"]
  readonly id: {
    readonly id: string
    readonly input:
      | {
          readonly provider: "github"
          readonly ref: string
          readonly inputs?: { readonly [x: string]: string | number | "Infinity" | "-Infinity" | "NaN" | boolean }
        }
      | {
          readonly provider: "gitlab"
          readonly ref: string
          readonly variables?: ReadonlyArray<{
            readonly key: string
            readonly value: string
            readonly variable_type?: "env_var" | "file"
          }>
          readonly inputs?: { readonly [x: string]: JsonValue }
        }
  }["id"]
  readonly input: {
    readonly id: string
    readonly input:
      | {
          readonly provider: "github"
          readonly ref: string
          readonly inputs?: { readonly [x: string]: string | number | "Infinity" | "-Infinity" | "NaN" | boolean }
        }
      | {
          readonly provider: "gitlab"
          readonly ref: string
          readonly variables?: ReadonlyArray<{
            readonly key: string
            readonly value: string
            readonly variable_type?: "env_var" | "file"
          }>
          readonly inputs?: { readonly [x: string]: JsonValue }
        }
  }["input"]
}
