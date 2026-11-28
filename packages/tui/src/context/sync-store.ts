import type {
  Agent,
  Provider,
  Session,
  Config,
  Todo,
  Command,
  PermissionV2Request,
  QuestionV2Request,
  LspStatus,
  McpStatus,
  McpResource,
  FormatterStatus,
  SessionStatus,
  ProviderListResponse,
  VcsInfo,
  SnapshotFileDiff,
  SessionMessage,
} from "../types"
import { createStore } from "solid-js/store"

export function createSyncStore() {
  return createStore<{
    status: "loading" | "partial" | "complete"
    catalogRevision: number
    provider: Provider[]
    provider_default: Record<string, string>
    provider_next: ProviderListResponse
    capabilities: {
      experimentalBackgroundSubagents: boolean
    }
    agent: Agent[]
    command: Command[]
    permission: {
      [sessionID: string]: PermissionV2Request[]
    }
    question: {
      [sessionID: string]: QuestionV2Request[]
    }
    config: Config
    session: Session[]
    session_status: {
      [sessionID: string]: SessionStatus
    }
    session_diff: {
      [sessionID: string]: SnapshotFileDiff[]
    }
    todo: {
      [sessionID: string]: Todo[]
    }
    // V2 messages per Session, oldest first, at most the latest 100.
    message: {
      [sessionID: string]: SessionMessage[]
    }
    lsp: LspStatus[]
    mcp: {
      [key: string]: McpStatus
    }
    mcp_resource: {
      [key: string]: McpResource
    }
    formatter: FormatterStatus[]
    vcs: VcsInfo | undefined
  }>({
    provider_next: {
      all: [],
      default: {},
      connected: [],
    },
    capabilities: {
      experimentalBackgroundSubagents: false,
    },
    config: {},
    status: "loading",
    catalogRevision: 0,
    agent: [],
    permission: {},
    question: {},
    command: [],
    provider: [],
    provider_default: {},
    session: [],
    session_status: {},
    session_diff: {},
    todo: {},
    message: {},
    lsp: [],
    mcp: {},
    mcp_resource: {},
    formatter: [],
    vcs: undefined,
  })
}
