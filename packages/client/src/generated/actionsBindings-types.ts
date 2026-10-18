export type ActionsBindingsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ActionsBindingsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly revision: number
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectID: string
    readonly projectPath: string
    readonly account?: string
    readonly directory: string
    readonly workspaceID?: string
  }>
}

export type ActionsBindingsCreateInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly remote: {
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectPath: string
    readonly expectedRevision?: number
  }["remote"]
  readonly provider: {
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectPath: string
    readonly expectedRevision?: number
  }["provider"]
  readonly projectPath: {
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectPath: string
    readonly expectedRevision?: number
  }["projectPath"]
  readonly expectedRevision?: {
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectPath: string
    readonly expectedRevision?: number
  }["expectedRevision"]
}

export type ActionsBindingsCreateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly revision: number
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectID: string
    readonly projectPath: string
    readonly account?: string
    readonly directory: string
    readonly workspaceID?: string
  }
}

export type ActionsBindingsGetInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["revision"]
}

export type ActionsBindingsGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly revision: number
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectID: string
    readonly projectPath: string
    readonly account?: string
    readonly directory: string
    readonly workspaceID?: string
  }
}

export type ActionsBindingsUpdateInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["revision"]
  readonly remote: {
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectPath: string
    readonly expectedRevision?: number
  }["remote"]
  readonly provider: {
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectPath: string
    readonly expectedRevision?: number
  }["provider"]
  readonly projectPath: {
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectPath: string
    readonly expectedRevision?: number
  }["projectPath"]
  readonly expectedRevision?: {
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectPath: string
    readonly expectedRevision?: number
  }["expectedRevision"]
}

export type ActionsBindingsUpdateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly revision: number
    readonly remote: string
    readonly provider: {
      readonly kind: "github" | "gitlab"
      readonly hostname: string
      readonly apiOrigin: string
      readonly version?: string
    }
    readonly projectID: string
    readonly projectPath: string
    readonly account?: string
    readonly directory: string
    readonly workspaceID?: string
  }
}

export type ActionsBindingsRemoveInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["revision"]
}

export type ActionsBindingsRemoveOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: null
}

export type ActionsBindingsCapabilitiesInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["revision"]
}

export type ActionsBindingsCapabilitiesOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly operation: string
    readonly state: "available" | "unavailable" | "unknown"
    readonly reason?: string
    readonly scope?: string
    readonly observedAt: number | "Infinity" | "-Infinity" | "NaN"
  }>
}

export type ActionsBindingsPolicyInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["revision"]
}

export type ActionsBindingsPolicyOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly binding: { readonly id: string; readonly revision: number }
    readonly policy: { readonly retentionDays?: number; readonly execution?: string }
  }
}

export type ActionsBindingsUpdatePolicyInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["revision"]
  readonly retentionDays?: { readonly retentionDays?: number; readonly execution?: string }["retentionDays"]
  readonly execution?: { readonly retentionDays?: number; readonly execution?: string }["execution"]
}

export type ActionsBindingsUpdatePolicyOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly binding: { readonly id: string; readonly revision: number }
    readonly policy: { readonly retentionDays?: number; readonly execution?: string }
  }
}
