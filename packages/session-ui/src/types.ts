// UI-local wire shapes that have no schema equivalent yet. Inputs come from the
// legacy server and the vendored `/api` client, so these mirror the wire fields the
// components read rather than the V2 decoded structs.

export type FileContent = {
  type: "text" | "binary"
  content: string
  diff?: string
  patch?: {
    oldFileName: string
    newFileName: string
    oldHeader?: string
    newHeader?: string
    hunks: Array<{
      oldStart: number
      oldLines: number
      newStart: number
      newLines: number
      lines: Array<string>
    }>
    index?: string
  }
  encoding?: "base64"
  mimeType?: string
}

// The `/api` diff feed always sends these fields; the legacy snapshot shape allows
// `file`/`patch`/`status` to be absent.
export type FileDiffInfo = {
  file: string
  patch: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}

export type ProviderModel = {
  id: string
  providerID: string
  api: {
    id: string
    url: string
    npm: string
  }
  name: string
  family?: string
  capabilities: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
    input: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    output: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    interleaved:
      | boolean
      | {
          field: "reasoning" | "reasoning_content" | "reasoning_text" | string
        }
  }
  cost: {
    input: number
    output: number
    cache: {
      read: number
      write: number
    }
    tiers?: Array<{
      input: number
      output: number
      cache: {
        read: number
        write: number
      }
      tier: {
        type: "context"
        size: number
      }
    }>
    experimentalOver200K?: {
      input: number
      output: number
      cache: {
        read: number
        write: number
      }
    }
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  status: "alpha" | "beta" | "deprecated" | "active"
  options: {
    [key: string]: unknown
  }
  headers: {
    [key: string]: string
  }
  release_date: string
  variants?: {
    [key: string]: {
      [key: string]: unknown
    }
  }
}

export type Provider = {
  id: string
  name: string
  source: "env" | "config" | "custom" | "api"
  env: Array<string>
  key?: string
  options: {
    [key: string]: unknown
  }
  models: {
    [key: string]: ProviderModel
  }
}
