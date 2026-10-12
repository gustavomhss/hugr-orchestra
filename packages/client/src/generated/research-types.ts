export type ResearchArtifactInput = {
  readonly sessionID: { readonly sessionID: string; readonly artifactID: string }["sessionID"]
  readonly artifactID: { readonly sessionID: string; readonly artifactID: string }["artifactID"]
  readonly revision: { readonly revision: number; readonly cursor?: string | undefined }["revision"]
  readonly cursor?: { readonly revision: number; readonly cursor?: string | undefined }["cursor"]
}

export type ResearchArtifactOutput = {
  readonly ref: { readonly id: string; readonly revision: number }
  readonly representation: "received" | "text" | "markdown" | "html" | "structured-json"
  readonly text: string
  readonly receipt:
    | {
        readonly binding: {
          readonly projectID: string
          readonly memberID: "jimmy"
          readonly taskId: string
          readonly executionSessionID: string
          readonly authoritySessionID: string
          readonly directory: string
          readonly worktree: string
        }
        readonly ref: {
          readonly artifact: { readonly id: string; readonly revision: number }
          readonly representation: "received" | "text" | "markdown" | "html" | "structured-json"
          readonly digest: string
        }
        readonly origin: {
          readonly kind: "file" | "url" | "tool-output" | "atlas-own"
          readonly uri: string
          readonly revision?: string
        }
        readonly capturedAt: number
        readonly mediaType: string
        readonly bytes: number
        readonly complete: boolean
        readonly derivedFrom?: {
          readonly artifact: { readonly id: string; readonly revision: number }
          readonly representation: "received" | "text" | "markdown" | "html" | "structured-json"
          readonly digest: string
        }
        readonly transformation?: string
        readonly observed?: { readonly byteStart: number; readonly lineStart?: number; readonly lineEnd?: number }
        readonly atlas?: {
          readonly sourceIdentity: string
          readonly unit: string
          readonly contentHash: string
          readonly receiptHash: string
        }
      }
    | {
        readonly binding: {
          readonly projectID: string
          readonly memberID: "jimmy"
          readonly taskId: string
          readonly executionSessionID: string
          readonly authoritySessionID: string
          readonly directory: string
          readonly worktree: string
        }
        readonly ref: { readonly id: string; readonly revision: number }
        readonly artifact: { readonly id: string; readonly revision: number }
        readonly digest: string
        readonly title: string
        readonly genre: "answer" | "map" | "explanation" | "comparison" | "evidence-review" | "opportunity"
        readonly bytes: number
        readonly publishedAt: number
        readonly findingRefs: ReadonlyArray<{ readonly id: string | string | string; readonly revision: number }>
        readonly citations: {
          readonly [x: string]: {
            readonly source: {
              readonly artifact: { readonly id: string; readonly revision: number }
              readonly representation: "received" | "text" | "markdown" | "html" | "structured-json"
              readonly digest: string
            }
            readonly locator:
              | { readonly kind: "lines"; readonly start: number; readonly end: number }
              | { readonly kind: "quote"; readonly exact: string; readonly prefix?: string; readonly suffix?: string }
              | { readonly kind: "json"; readonly pointer: string }
          }
        }
      }
  readonly complete: boolean
  readonly cursor?: string
}
