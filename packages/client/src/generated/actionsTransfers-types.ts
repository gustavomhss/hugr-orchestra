export type ActionsTransfersInfoInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind: "jobLog" | "runLog" | "artifact" | "secureFile"
    readonly id: string
    readonly runID?: string | undefined
    readonly attempt?: number | undefined
    readonly path?: string | undefined
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind: "jobLog" | "runLog" | "artifact" | "secureFile"
    readonly id: string
    readonly runID?: string | undefined
    readonly attempt?: number | undefined
    readonly path?: string | undefined
  }["revision"]
  readonly kind: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind: "jobLog" | "runLog" | "artifact" | "secureFile"
    readonly id: string
    readonly runID?: string | undefined
    readonly attempt?: number | undefined
    readonly path?: string | undefined
  }["kind"]
  readonly id: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind: "jobLog" | "runLog" | "artifact" | "secureFile"
    readonly id: string
    readonly runID?: string | undefined
    readonly attempt?: number | undefined
    readonly path?: string | undefined
  }["id"]
  readonly runID?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind: "jobLog" | "runLog" | "artifact" | "secureFile"
    readonly id: string
    readonly runID?: string | undefined
    readonly attempt?: number | undefined
    readonly path?: string | undefined
  }["runID"]
  readonly attempt?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind: "jobLog" | "runLog" | "artifact" | "secureFile"
    readonly id: string
    readonly runID?: string | undefined
    readonly attempt?: number | undefined
    readonly path?: string | undefined
  }["attempt"]
  readonly path?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind: "jobLog" | "runLog" | "artifact" | "secureFile"
    readonly id: string
    readonly runID?: string | undefined
    readonly attempt?: number | undefined
    readonly path?: string | undefined
  }["path"]
}

export type ActionsTransfersInfoOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly filename: string
    readonly contentType: string
    readonly size?: number | "Infinity" | "-Infinity" | "NaN"
    readonly digest?: string
  }
}
