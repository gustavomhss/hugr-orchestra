// The app-shell's own API contract: the groups the app calls, in the shapes the app stores and reads.
//
// The adapter in `@/utils/server` builds this surface from the current API client. The shapes here are the
// app's contract, not the current API's generated ones: the app keeps the legacy field names and envelopes
// (the `data` envelope, the mutable payloads) that its state and reducers work with.

import type { AgentFileInfo, AgentFileInput, IntegrationMethod, Message, PermissionRequest, Project, ProjectListOutput, QuestionRequest, Session, SessionInfo, SessionV2Info, Todo, ToolPart,  } from "@/v2-types"
import type { SessionMessageInfo } from "@/v2-legacy"

import type {
  AgentListInput,
  AgentListOutput,
  CommandListInput,
  CommandListOutput,
  Config,
  Event,
  IntegrationOauthConnectOutput,
  McpListInput,
  McpListOutput,
  McpResourceCatalogInput,
  McpResourceCatalogOutput,
  ModelDefaultOutput,
  ModelListOutput,
  ModelRef,
  ProjectCurrentInput,
  ProjectCurrentOutput,
  ProviderListOutput,
  Pty,
  ReferenceListInput,
  ReferenceListOutput,
  SessionActiveOutput,
  SessionCommandInput,
  SessionCommandOutput,
  SessionCompactInput,
  SessionCompactOutput,
  SessionListInput,
  SessionPendingMessage,
  SessionProcess,
  SessionPromptInput,
  SessionPromptOutput,
  SessionShellInput,
  SessionShellOutput,
} from "@/v2-wire"
import type { FileDiffInfo, OpenCodeEvent } from "@/v2-legacy"

export type RequestOptions = { signal?: AbortSignal; headers?: HeadersInit }

/** The location a call is scoped to. */
export type LocationInput = { directory?: string; workspaceID?: string }

/** A file or directory entry. */
export type FileEntry = { path: string; name?: string; type: "file" | "directory" }

/** The current API's session list envelope. */
export type SessionListOutput = {
  data: SessionInfo[]
  cursor: { previous?: string; next?: string }
}

/** The current API's message list envelope. */
export type MessageListOutput = {
  data: SessionMessageInfo[]
  cursor: { previous?: string; next?: string }
}

/**
 * The legacy-shaped view of the current API. Every group the adapter exposes, with the legacy envelopes and
 * field names the app's state and reducers work with.
 */
export type ServerApi = {
  health: { get: (requestOptions?: RequestOptions) => Promise<{ healthy: boolean; pid?: number }> }
  location: {
    get: (
      input?: { directory?: string; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ project: ProjectCurrentOutput }>
  }
  agent: {
    list: (input?: AgentListInput, requestOptions?: RequestOptions) => Promise<AgentListOutput>
    getFile: (input: AgentFileInput, requestOptions?: RequestOptions) => Promise<AgentFileInfo>
    updateFile: (input: AgentFileInput, requestOptions?: RequestOptions) => Promise<AgentFileInfo>
  }
  session: {
    list: (input?: SessionListInput, requestOptions?: RequestOptions) => Promise<SessionListOutput>
    create: (
      input: { id?: string; agent?: string; model?: ModelRef; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<SessionInfo>
    active: (requestOptions?: RequestOptions) => Promise<SessionActiveOutput>
    get: (input: { sessionID: string }, requestOptions?: RequestOptions) => Promise<SessionInfo>
    remove: (input: { sessionID: string }, requestOptions?: RequestOptions) => Promise<void>
    fork: (input: { sessionID: string; messageID?: string }, requestOptions?: RequestOptions) => Promise<SessionInfo>
    switchAgent: (input: { sessionID: string; agent: string }, requestOptions?: RequestOptions) => Promise<void>
    switchModel: (input: { sessionID: string; model: ModelRef }, requestOptions?: RequestOptions) => Promise<void>
    rename: (input: { sessionID: string; title: string }, requestOptions?: RequestOptions) => Promise<void>
    move: (
      input: { sessionID: string; directory: string; workspaceID?: string },
      requestOptions?: RequestOptions,
    ) => Promise<void>
    prompt: (input: SessionPromptInput, requestOptions?: RequestOptions) => Promise<SessionPromptOutput>
    command: (input: SessionCommandInput, requestOptions?: RequestOptions) => Promise<SessionCommandOutput>
    shell: (input: SessionShellInput, requestOptions?: RequestOptions) => Promise<SessionShellOutput>
    compact: (input: SessionCompactInput, requestOptions?: RequestOptions) => Promise<SessionCompactOutput>
    archive: (input: { sessionID: string; archived: boolean }, requestOptions?: RequestOptions) => Promise<void>
    todo: (input: { sessionID: string }, requestOptions?: RequestOptions) => Promise<Todo[]>
    message: (input: { sessionID: string; messageID: string }, requestOptions?: RequestOptions) => Promise<SessionMessageInfo>
    context: (input: { sessionID: string; messageID?: string; limit?: number }, requestOptions?: RequestOptions) => Promise<SessionMessageInfo[]>
    history: (
      input: { sessionID: string; limit?: number; before?: string },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: Message[]; parts: Record<string, ToolPart[]> }>
    events: (input: { sessionID: string }, requestOptions?: RequestOptions) => Promise<SessionMessageInfo[]>
    interrupt: (input: { sessionID: string }, requestOptions?: RequestOptions) => Promise<void>
    processes: (input: { sessionID: string }, requestOptions?: RequestOptions) => Promise<SessionProcess[]>
    getPermission: (input: { sessionID: string }, requestOptions?: RequestOptions) => Promise<PermissionRequest[]>
    setPermission: (
      input: { sessionID: string; permission: PermissionRequest[] },
      requestOptions?: RequestOptions,
    ) => Promise<void>
    getSubagentModels: (input: { sessionID: string }, requestOptions?: RequestOptions) => Promise<unknown>
    setSubagentModels: (input: { sessionID: string; policy: unknown }, requestOptions?: RequestOptions) => Promise<unknown>
    pending: (input: { sessionID: string }, requestOptions?: RequestOptions) => Promise<SessionPendingMessage[]>
    revert: {
      stage: (input: { sessionID: string; messageID: string }, requestOptions?: RequestOptions) => Promise<{ messageID: string }>
      clear: (input: { sessionID: string }, requestOptions?: RequestOptions) => Promise<void>
      commit: (input: { sessionID: string; messageID: string }, requestOptions?: RequestOptions) => Promise<void>
    }
  }
  message: {
    list: (
      input: { sessionID: string; limit?: number; cursor?: string; order?: "asc" | "desc" },
      requestOptions?: RequestOptions,
    ) => Promise<MessageListOutput>
  }
  model: {
    list: (input?: { location?: { directory?: string } }, requestOptions?: RequestOptions) => Promise<ModelListOutput>
    default: (input?: { location?: { directory?: string } }, requestOptions?: RequestOptions) => Promise<ModelDefaultOutput>
  }
  provider: {
    list: (input?: { location?: { directory?: string } }, requestOptions?: RequestOptions) => Promise<ProviderListOutput>
    get: (input: { id: string }, requestOptions?: RequestOptions) => Promise<unknown>
  }
  integration: {
    list: (
      input?: { location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: Array<{ id: string; name: string }> }>
    get: (
      input: { integrationID: string; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: { name?: string; methods: IntegrationMethod[] } }>
    connect: {
      key: (
        input: { integrationID: string; key: string; label?: string; location?: LocationInput },
        requestOptions?: RequestOptions,
      ) => Promise<unknown>
    }
    oauth: {
      connect: (
        input: {
          integrationID: string
          methodID?: string
          label?: string
          inputs?: unknown
          location?: LocationInput
        },
        requestOptions?: RequestOptions,
      ) => Promise<IntegrationOauthConnectOutput>
      status: (
        input: { integrationID: string; attemptID?: string; location?: LocationInput },
        requestOptions?: RequestOptions,
      ) => Promise<{ data: { attemptID: string; status?: string; message?: string; method?: IntegrationMethod } }>
      complete: (
        input: { integrationID: string; attemptID: string; code: string; location?: LocationInput; value?: unknown },
        requestOptions?: RequestOptions,
      ) => Promise<unknown>
      cancel: (
        input: { integrationID: string; attemptID?: string; location?: LocationInput; value?: unknown },
        requestOptions?: RequestOptions,
      ) => Promise<unknown>
    }
  }
  mcp: {
    list: (input?: McpListInput, requestOptions?: RequestOptions) => Promise<McpListOutput>
    add: (input: { server: string; config?: unknown; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<unknown>
    remove: (input: { server: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<unknown>
    connect: (input: { server: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<unknown>
    disconnect: (input: { server: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<unknown>
    resource: {
      catalog: (input?: McpResourceCatalogInput, requestOptions?: RequestOptions) => Promise<McpResourceCatalogOutput>
    }
  }
  credential: {
    update: (input: { credentialID: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<unknown>
    remove: (input: { credentialID: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<unknown>
  }
  project: {
    list: (requestOptions?: RequestOptions) => Promise<ProjectListOutput>
    current: (input?: { directory?: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<ProjectCurrentOutput>
    directories: (
      input: { projectID: string; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<ProjectListOutput>
    update: (input: { projectID: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<unknown>
    initGit: (input?: { directory?: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<unknown>
  }
  permission: {
    request: {
      list: (input?: { location?: { directory?: string } }, requestOptions?: RequestOptions) => Promise<{ data: PermissionRequest[] }>
    }
    saved: {
      list: (
      input?: { location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: Array<{ id: string; name: string }> }>
      remove: (input: { id: string }, requestOptions?: RequestOptions) => Promise<unknown>
    }
    create: (input: { sessionID?: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<unknown>
    list: (input?: { location?: { directory?: string } }, requestOptions?: RequestOptions) => Promise<{ data: PermissionRequest[] }>
    get: (input: { id: string }, requestOptions?: RequestOptions) => Promise<unknown>
    reply: (
      input: { requestID: string; reply: string; sessionID?: string; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<unknown>
  }
  file: {
    read: (input: { path: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<Uint8Array>
    list: (
      input?: { path?: string; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: FileEntry[] }>
    find: (
      input: { query: string; type?: string; limit?: number; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: FileEntry[] }>
  }
  command: {
    list: (input?: CommandListInput, requestOptions?: RequestOptions) => Promise<CommandListOutput>
  }
  skill: {
    list: (
      input?: { location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: Array<{ name: string; location?: string; description?: string }> }>
  }
  event: {
    subscribe: (requestOptions?: RequestOptions) => AsyncIterable<OpenCodeEvent & { location?: { directory?: string } }>
  }
  pty: {
    create: (
      input: { title: string; command?: string; args?: string[]; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: Pty }>
    get: (input: { ptyID: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<{ data: Pty }>
    update: (
      input: { ptyID: string; title?: string; size?: { cols: number; rows: number }; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: Pty }>
    remove: (input: { ptyID: string; location?: LocationInput }, requestOptions?: RequestOptions) => Promise<void>
  }
  question: {
    request: {
      list: (input?: { location?: { directory?: string } }, requestOptions?: RequestOptions) => Promise<{ data: QuestionRequest[] }>
    }
    list: (input?: { location?: { directory?: string } }, requestOptions?: RequestOptions) => Promise<{ data: QuestionRequest[] }>
    reply: (
      input: { sessionID: string; requestID: string; answers: string[][] },
      requestOptions?: RequestOptions,
    ) => Promise<unknown>
    reject: (input: { sessionID: string; requestID: string }, requestOptions?: RequestOptions) => Promise<unknown>
  }
  reference: {
    list: (input?: ReferenceListInput, requestOptions?: RequestOptions) => Promise<ReferenceListOutput>
  }
  projectCopy: {
    create: (
      input: { projectID: string; strategy: string; directory: string; name?: string; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ name: string; directory?: string }>
    remove: (
      input: { projectID: string; directory: string; force?: boolean; location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<unknown>
    refresh: (input: { projectID: string; directory: string }, requestOptions?: RequestOptions) => Promise<unknown>
  }
  vcs: {
    get: (
      input?: { location?: LocationInput },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: { branch?: string; defaultBranch?: string } }>
    diff: (
      input?: { location?: LocationInput; mode?: string; context?: unknown },
      requestOptions?: RequestOptions,
    ) => Promise<{ data: FileDiffInfo[] }>
  }
  config: {
    get: (requestOptions?: RequestOptions) => Promise<{ data?: Config }>
    update: (input: { config: Config }, requestOptions?: RequestOptions) => Promise<unknown>
  }
}
