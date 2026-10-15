import type { ContextItem, Prompt } from "@/context/prompt"
import type { DirectorySDK } from "@/context/sdk"
import type { ServerSync } from "@/context/server-sync"
import type { DirectorySync } from "@/context/sync"
import type { ServerScope } from "@/utils/server-scope"
import type { buildRequestParts } from "./build-request-parts"
import type { QueuedPromptSource, QueuedPromptRuntime } from "./queued-prompt"
import type { createSubmissionPolicy } from "./submission-policy"

/** One durable action retains its exact prepared payload across an ambiguous HTTP retry. */
export type AdmissionRequest = {
  key: string
  id: string
  admitted: boolean
  revision?: number
  preparation?: ReturnType<typeof buildRequestParts> & { system?: string }
  command?: Parameters<DirectorySDK["api"]["session"]["command"]>[0]
  shell?: Parameters<DirectorySDK["api"]["session"]["shell"]>[0]
}

export type PromptDispatch = (send: (request: AdmissionRequest) => Promise<unknown>) => Promise<boolean>

export type FollowupDraft = {
  sessionID: string
  sessionDirectory: string
  prompt: Prompt
  context: (ContextItem & { key: string })[]
  agent: string
  model: { providerID: string; modelID: string }
  variant?: string
  // Resolved at send time, never when queued.
  system?: string
  delivery?: "steer" | "queue"
  source?: QueuedPromptSource
}

export type FollowupSendInput = {
  api: DirectorySDK["api"]["session"]
  serverSync: ServerSync
  sync: DirectorySync
  draft: FollowupDraft
  messageID?: string
  optimisticBusy?: boolean
  pending?: boolean
  signal?: AbortSignal
  before?: () => Promise<boolean> | boolean
  runtime?: QueuedPromptRuntime
  deliberate?: boolean
  request?: AdmissionRequest
  dispatch?: PromptDispatch
  currentSource?: {
    serverScopeKey: ServerScope
    directory: string
    sessionID: string | undefined
    protocol: Parameters<typeof createSubmissionPolicy>[0]["protocol"]
    management: Parameters<typeof createSubmissionPolicy>[0]["management"]
    current: () => boolean
  }
}
