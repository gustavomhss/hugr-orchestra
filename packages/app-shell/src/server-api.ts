// The app-shell's own API contract: the groups the app calls, in the shapes the app stores and reads.
//
// The adapter in `@/utils/server` builds this surface from the current API client. The shapes here are the
// app's contract, not the current API's generated ones: the app keeps its own field names and envelopes
// (the `data` envelope, the mutable payloads) that its state and reducers work with.
//
// Every input is the input the generated client sends: `ClientInput` reads it off the client, so the contract
// cannot drift from the wire. `server-api-parity.ts` holds this contract and the adapter to the same shape.

import type { Orchestra, SessionsEventsOutput } from "@orchestra/client"

import type { AgentFileInfo, IntegrationMethod, Message, PermissionRequest, ProjectListOutput, QuestionRequest, SessionInfo, Todo, ToolPart } from "@/v2-types"
import type { SessionMessageInfo } from "@/session-types"

import type {
  AgentListOutput,
  CommandListOutput,
  Config,
  IntegrationOauthConnectOutput,
  McpListOutput,
  McpResourceCatalogOutput,
  ModelDefaultOutput,
  ModelListOutput,
  ProjectCurrentOutput,
  ProviderListOutput,
  Pty,
  ReferenceListOutput,
  SessionActiveOutput,
  SessionCommandOutput,
  SessionCompactOutput,
  SessionProcess,
  SessionPromptOutput,
  SessionShellOutput,
} from "@/v2-wire"
import type { FileDiffInfo, ClientEvent } from "@/session-types"

/** The generated client: the wire the adapter speaks. */
type Client = ReturnType<typeof Orchestra.make>

type ClientMethod<G extends keyof Client, M extends keyof Client[G]> = Client[G][M] extends (...args: never[]) => unknown
  ? Client[G][M]
  : never

/** The input the client sends for a group method. */
export type ClientInput<G extends keyof Client, M extends keyof Client[G]> = ClientMethod<G, M> extends (first: infer First, ...rest: never[]) => unknown
  ? First
  : never

/** The output the client returns for a group method. */
export type ClientOutput<G extends keyof Client, M extends keyof Client[G]> = ClientMethod<G, M> extends (...args: never[]) => infer Result
  ? Awaited<Result>
  : never

export type RequestOptions = { signal?: AbortSignal; headers?: HeadersInit }

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

/** The prompt the app sends: the flat shape the adapter translates into the client's prompt. */
export type SessionPromptInput = {
  sessionID: string
  id?: string
  text: string
  files?: ReadonlyArray<{ uri: string; name?: string; description?: string; mention?: { text: string; start: number; end: number } }>
  agents?: ReadonlyArray<{ name: string; mention?: { text: string; start: number; end: number } }>
  delivery?: "steer" | "queue"
  resume?: boolean
  agent?: string
  model?: { providerID: string; modelID: string }
  variant?: string
}

/** The command the app sends: the flat shape the adapter translates into the client's command. */
export type SessionCommandInput = {
  sessionID: string
  id?: string
  command: string
  arguments?: string
  files?: ReadonlyArray<{ uri: string; name?: string; description?: string; mention?: { text: string; start: number; end: number } }>
  agents?: ReadonlyArray<{ name: string; mention?: { text: string; start: number; end: number } }>
  delivery?: "steer" | "queue"
  resume?: boolean
  agent?: string
  model?: { providerID: string; id?: string; modelID?: string; variant?: string }
  variant?: string
}

/** The compaction the app sends: the flat shape the adapter translates into the client's compaction. */
export type SessionCompactInput = {
  sessionID: string
  id?: string
  agent?: string
  model?: { providerID: string; modelID: string }
  variant?: string
}

/** The staged revert the app sends: the flat shape the adapter translates into the client's stage. */
export type SessionStageInput = { sessionID: string; messageID: string }

/**
 * The app's view of the current API. Every group the adapter exposes, with the envelopes and
 * field names the app's state and reducers work with.
 */
export type ServerApi = {
  health: { get: (requestOptions?: RequestOptions) => Promise<{ healthy: boolean; pid?: number }> }
  location: {
    get: (input?: ClientInput<"location", "get">, requestOptions?: RequestOptions) => Promise<{ project: ProjectCurrentOutput }>
    paths: (requestOptions?: RequestOptions) => Promise<{ home: string }>
  }
  agent: {
    list: (input?: ClientInput<"agents", "list">, requestOptions?: RequestOptions) => Promise<AgentListOutput>
    getFile: (input: ClientInput<"agents", "getFile">, requestOptions?: RequestOptions) => Promise<AgentFileInfo>
    updateFile: (input: ClientInput<"agents", "updateFile">, requestOptions?: RequestOptions) => Promise<AgentFileInfo>
  }
  session: {
    list: (input?: ClientInput<"sessions", "list">, requestOptions?: RequestOptions) => Promise<SessionListOutput>
    create: (input: ClientInput<"sessions", "create">, requestOptions?: RequestOptions) => Promise<SessionInfo>
    active: (requestOptions?: RequestOptions) => Promise<SessionActiveOutput>
    get: (input: ClientInput<"sessions", "get">, requestOptions?: RequestOptions) => Promise<SessionInfo>
    remove: (input: ClientInput<"sessions", "remove">, requestOptions?: RequestOptions) => Promise<void>
    fork: (input: ClientInput<"sessions", "fork">, requestOptions?: RequestOptions) => Promise<SessionInfo>
    switchAgent: (input: ClientInput<"sessions", "switchAgent">, requestOptions?: RequestOptions) => Promise<void>
    switchModel: (input: ClientInput<"sessions", "switchModel">, requestOptions?: RequestOptions) => Promise<void>
    rename: (input: ClientInput<"sessions", "rename">, requestOptions?: RequestOptions) => Promise<void>
    move: (input: ClientInput<"sessions", "move">, requestOptions?: RequestOptions) => Promise<void>
    prompt: (input: SessionPromptInput, requestOptions?: RequestOptions) => Promise<SessionPromptOutput>
    command: (input: SessionCommandInput, requestOptions?: RequestOptions) => Promise<SessionCommandOutput>
    shell: (input: ClientInput<"sessions", "shell">, requestOptions?: RequestOptions) => Promise<SessionShellOutput>
    compact: (input: SessionCompactInput, requestOptions?: RequestOptions) => Promise<SessionCompactOutput>
    archive: (input: ClientInput<"sessions", "archive">, requestOptions?: RequestOptions) => Promise<void>
    todo: (input: ClientInput<"sessions", "todo">, requestOptions?: RequestOptions) => Promise<Todo[]>
    message: (input: ClientInput<"sessions", "message">, requestOptions?: RequestOptions) => Promise<SessionMessageInfo>
    context: (input: ClientInput<"sessions", "context">, requestOptions?: RequestOptions) => Promise<SessionMessageInfo[]>
    history: (input: ClientInput<"sessions", "history">, requestOptions?: RequestOptions) => Promise<{ data: Message[]; parts: Record<string, ToolPart[]> }>
    events: (input: ClientInput<"sessions", "events">, requestOptions?: RequestOptions) => AsyncIterable<SessionsEventsOutput>
    interrupt: (input: ClientInput<"sessions", "interrupt">, requestOptions?: RequestOptions) => Promise<void>
    processes: (input: ClientInput<"sessions", "processes">, requestOptions?: RequestOptions) => Promise<SessionProcess[]>
    getPermission: (input: ClientInput<"sessions", "getPermission">, requestOptions?: RequestOptions) => Promise<PermissionRequest[]>
    getSubagentModels: (input: ClientInput<"sessions", "getSubagentModels">, requestOptions?: RequestOptions) => Promise<unknown>
    setSubagentModels: (input: ClientInput<"sessions", "setSubagentModels">, requestOptions?: RequestOptions) => Promise<unknown>
    revert: {
      stage: (input: SessionStageInput, requestOptions?: RequestOptions) => Promise<{ messageID: string }>
      clear: (input: ClientInput<"sessions", "clear">, requestOptions?: RequestOptions) => Promise<void>
      commit: (input: ClientInput<"sessions", "commit">, requestOptions?: RequestOptions) => Promise<void>
    }
  }
  message: {
    list: (input: ClientInput<"messages", "list">, requestOptions?: RequestOptions) => Promise<MessageListOutput>
  }
  model: {
    list: (input?: ClientInput<"models", "list">, requestOptions?: RequestOptions) => Promise<ModelListOutput>
    default: (input?: ClientInput<"models", "default">, requestOptions?: RequestOptions) => Promise<ModelDefaultOutput>
  }
  provider: {
    list: (input?: ClientInput<"providers", "list">, requestOptions?: RequestOptions) => Promise<ProviderListOutput>
    get: (input: ClientInput<"providers", "get">, requestOptions?: RequestOptions) => Promise<unknown>
  }
  integration: {
    list: (input?: ClientInput<"integrations", "list">, requestOptions?: RequestOptions) => Promise<ClientOutput<"integrations", "list">>
    get: (
      input: ClientInput<"integrations", "get">,
      requestOptions?: RequestOptions,
    ) => Promise<{ data: { name?: string; methods: IntegrationMethod[] } }>
    connect: {
      key: (
        input: ClientInput<"integrations", "connectKey">,
        requestOptions?: RequestOptions,
      ) => Promise<unknown>
    }
    oauth: {
      connect: (
        input: ClientInput<"integrations", "connectOauth">,
        requestOptions?: RequestOptions,
      ) => Promise<IntegrationOauthConnectOutput>
      status: (
        input: ClientInput<"integrations", "oauthStatus">,
        requestOptions?: RequestOptions,
      ) => Promise<{ data: { attemptID: string; status?: string; message?: string; method?: IntegrationMethod } }>
      complete: (
        input: ClientInput<"integrations", "oauthComplete">,
        requestOptions?: RequestOptions,
      ) => Promise<unknown>
      cancel: (
        input: ClientInput<"integrations", "oauthCancel">,
        requestOptions?: RequestOptions,
      ) => Promise<unknown>
    }
  }
  mcp: {
    list: (input?: ClientInput<"mcp", "list">, requestOptions?: RequestOptions) => Promise<McpListOutput>
    add: (input: ClientInput<"mcp", "add">, requestOptions?: RequestOptions) => Promise<unknown>
    remove: (input: ClientInput<"mcp", "remove">, requestOptions?: RequestOptions) => Promise<unknown>
    connect: (input: ClientInput<"mcp", "connect">, requestOptions?: RequestOptions) => Promise<unknown>
    disconnect: (input: ClientInput<"mcp", "disconnect">, requestOptions?: RequestOptions) => Promise<unknown>
    config: (input?: ClientInput<"mcp", "config">, requestOptions?: RequestOptions) => Promise<ClientOutput<"mcp", "config">>
    entries: (input?: ClientInput<"mcp", "entries">, requestOptions?: RequestOptions) => Promise<ClientOutput<"mcp", "entries">>
    tools: (input?: ClientInput<"mcp", "tools">, requestOptions?: RequestOptions) => Promise<ClientOutput<"mcp", "tools">>
    resource: {
      catalog: (input?: ClientInput<"mcp", "resources">, requestOptions?: RequestOptions) => Promise<McpResourceCatalogOutput>
    }
  }
  credential: {
    update: (input: ClientInput<"credentials", "update">, requestOptions?: RequestOptions) => Promise<unknown>
    remove: (input: ClientInput<"credentials", "remove">, requestOptions?: RequestOptions) => Promise<unknown>
  }
  project: {
    list: (requestOptions?: RequestOptions) => Promise<ProjectListOutput>
    current: (input?: ClientInput<"location", "get">, requestOptions?: RequestOptions) => Promise<ProjectCurrentOutput>
    directories: (input: ClientInput<"projects", "directories">, requestOptions?: RequestOptions) => Promise<ClientOutput<"projects", "directories">>
    update: (input: ClientInput<"projects", "update">, requestOptions?: RequestOptions) => Promise<unknown>
    initGit: (input?: ClientInput<"projects", "initGit">, requestOptions?: RequestOptions) => Promise<unknown>
  }
  permission: {
    request: {
      list: (input?: ClientInput<"permissions", "listRequests">, requestOptions?: RequestOptions) => Promise<{ data: PermissionRequest[] }>
    }
    saved: {
      list: (input?: ClientInput<"permissions", "listSaved">, requestOptions?: RequestOptions) => Promise<{ data: Array<{ id: string; name: string }> }>
      remove: (input: ClientInput<"permissions", "removeSaved">, requestOptions?: RequestOptions) => Promise<unknown>
    }
    create: (input: ClientInput<"permissions", "create">, requestOptions?: RequestOptions) => Promise<unknown>
    list: (input: ClientInput<"permissions", "list">, requestOptions?: RequestOptions) => Promise<{ data: PermissionRequest[] }>
    get: (input: ClientInput<"permissions", "get">, requestOptions?: RequestOptions) => Promise<unknown>
    reply: (input: ClientInput<"permissions", "reply">, requestOptions?: RequestOptions) => Promise<unknown>
  }
  file: {
    read: (input: ClientInput<"files", "read">, requestOptions?: RequestOptions) => Promise<Uint8Array>
    list: (input?: ClientInput<"files", "list">, requestOptions?: RequestOptions) => Promise<{ data: FileEntry[] }>
    find: (input: ClientInput<"files", "find">, requestOptions?: RequestOptions) => Promise<{ data: FileEntry[] }>
  }
  command: {
    list: (input?: ClientInput<"commands", "list">, requestOptions?: RequestOptions) => Promise<CommandListOutput>
  }
  skill: {
    list: (input?: ClientInput<"skills", "list">, requestOptions?: RequestOptions) => Promise<{ data: Array<{ name: string; location?: string; description?: string }> }>
  }
  event: {
    subscribe: (requestOptions?: RequestOptions) => AsyncIterable<ClientEvent & { location?: { directory?: string } }>
  }
  pty: {
    create: (input: ClientInput<"ptys", "create">, requestOptions?: RequestOptions) => Promise<{ data: Pty }>
    get: (input: ClientInput<"ptys", "get">, requestOptions?: RequestOptions) => Promise<{ data: Pty }>
    update: (input: ClientInput<"ptys", "update">, requestOptions?: RequestOptions) => Promise<{ data: Pty }>
    remove: (input: ClientInput<"ptys", "remove">, requestOptions?: RequestOptions) => Promise<void>
  }
  question: {
    request: {
      list: (input?: ClientInput<"questions", "listRequests">, requestOptions?: RequestOptions) => Promise<{ data: QuestionRequest[] }>
    }
    list: (input: ClientInput<"questions", "list">, requestOptions?: RequestOptions) => Promise<{ data: QuestionRequest[] }>
    reply: (input: ClientInput<"questions", "reply">, requestOptions?: RequestOptions) => Promise<unknown>
    reject: (input: ClientInput<"questions", "reject">, requestOptions?: RequestOptions) => Promise<unknown>
  }
  reference: {
    list: (input?: ClientInput<"references", "list">, requestOptions?: RequestOptions) => Promise<ReferenceListOutput>
  }
  projectCopy: {
    create: (input: ClientInput<"projectCopies", "create">, requestOptions?: RequestOptions) => Promise<{ name: string; directory?: string }>
    remove: (input: ClientInput<"projectCopies", "remove">, requestOptions?: RequestOptions) => Promise<unknown>
    refresh: (input: ClientInput<"projectCopies", "refresh">, requestOptions?: RequestOptions) => Promise<unknown>
  }
  vcs: {
    get: (input?: ClientInput<"vcs", "get">, requestOptions?: RequestOptions) => Promise<{ data: { branch?: string; defaultBranch?: string } }>
    diff: (input: ClientInput<"vcs", "diff">, requestOptions?: RequestOptions) => Promise<{ data: FileDiffInfo[] }>
  }
  config: {
    get: (requestOptions?: RequestOptions) => Promise<{ data?: Config }>
    update: (input: ClientInput<"config", "update">, requestOptions?: RequestOptions) => Promise<unknown>
  }
}
