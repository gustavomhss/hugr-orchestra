import type {
  ToolTextContent,
  ToolFileContent,
  FilePartSourceText,
  Range,
  UnknownError,
} from "./parts"

export type ModelRef = {
    id: string;
    providerID: string;
    variant?: string;
};
export type MoneyUSD = number;
export type TokenUsageInfo = {
    input: number;
    output: number;
    reasoning: number;
    cache: {
        read: number;
        write: number;
    };
};
export type LocationRef = {
    directory: string;
    workspaceID?: string;
};
export type PromptBase64 = string;
export type PromptFileSource = {
    type: "inline";
} | {
    type: "uri";
    uri: string;
};
export type PromptMention = {
    start: number;
    end: number;
    text: string;
};
export type ShellInfo = {
    id: string;
    status: "running" | "exited" | "timeout" | "killed";
    command: string;
    cwd: string;
    shell: string;
    file: string;
    pid?: number;
    exit?: number;
    metadata: {
        [x: string]: any;
    };
    time: {
        started: number;
        completed?: number;
    };
};
export type JSONSchema = {
    [x: string]: any;
};
export type ProviderAuthError = {
    name: "ProviderAuthError";
    data: {
        providerID: string;
        message: string;
    };
};
export type UnknownError2 = {
    name: "UnknownError";
    data: {
        message: string;
        ref?: string | undefined;
    };
};
export type MessageOutputLengthError = {
    name: "MessageOutputLengthError";
    data: {};
};
export type MessageAbortedError = {
    name: "MessageAbortedError";
    data: {
        message: string;
    };
};
export type StructuredOutputError = {
    name: "StructuredOutputError";
    data: {
        message: string;
        retries: number;
    };
};
export type ContextOverflowError = {
    name: "ContextOverflowError";
    data: {
        message: string;
        responseBody?: string | undefined;
    };
};
export type ContentFilterError = {
    name: "ContentFilterError";
    data: {
        message: string;
    };
};
export type APIError = {
    name: "APIError";
    data: {
        message: string;
        statusCode?: number | undefined;
        isRetryable: boolean;
        responseHeaders?: {
            [x: string]: string;
        } | undefined;
        responseBody?: string | undefined;
        metadata?: {
            [x: string]: string;
        } | undefined;
    };
};
export type SubtaskPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "subtask";
    prompt: string;
    description: string;
    agent: string;
    model?: {
        providerID: string;
        modelID: string;
    } | undefined;
    command?: string | undefined;
};
export type StepStartPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "step-start";
    snapshot?: string | undefined;
};
export type StepFinishPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "step-finish";
    reason: string;
    snapshot?: string | undefined;
    cost: number;
    tokens: {
        total?: number | undefined;
        input: number;
        output: number;
        reasoning: number;
        cache: {
            read: number;
            write: number;
        };
    };
};
export type SnapshotPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "snapshot";
    snapshot: string;
};
export type PatchPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "patch";
    hash: string;
    files: Array<string>;
};
export type AgentPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "agent";
    name: string;
    source?: {
        value: string;
        start: number;
        end: number;
    } | undefined;
};
export type CompactionPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "compaction";
    auto: boolean;
    overflow?: boolean | undefined;
    tail_start_id?: string | undefined;
};
export type ModelsDevRefreshed = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "models-dev.refreshed";
    location?: LocationRef;
    data: {};
};
export type IntegrationUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "integration.updated";
    location?: LocationRef;
    data: {};
};
export type IntegrationConnectionUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "integration.connection.updated";
    location?: LocationRef;
    data: {
        integrationID: string;
    };
};
export type CatalogUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "catalog.updated";
    location?: LocationRef;
    data: {};
};
export type ReferenceUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "reference.updated";
    location?: LocationRef;
    data: {};
};
export type PluginAdded = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "plugin.added";
    location?: LocationRef;
    data: {
        id: string;
    };
};
export type ProjectDirectoriesUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "project.directories.updated";
    location?: LocationRef;
    data: {
        projectID: string;
    };
};
export type VcsBranchUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "vcs.branch.updated";
    location?: LocationRef;
    data: {
        branch?: string;
    };
};
export type V2EventServerConnected = {
    id: string;
    metadata?: {
        [x: string]: any;
    } | undefined;
    location?: LocationRef | undefined;
    type: "server.connected";
    data: {};
};
export type PromptFileAttachment = {
    data: PromptBase64;
    mime: string;
    source: PromptFileSource;
    name?: string;
    description?: string;
    mention?: PromptMention;
};
export type PromptAgentAttachment = {
    name: string;
    mention?: PromptMention;
};
export type LLMToolContent = ToolTextContent | ToolFileContent;
export type OutputFormat = {
    type: "text";
} | {
    type: "json_schema";
    schema: JSONSchema;
    retryCount?: number | undefined | undefined;
};
export type RetryPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "retry";
    attempt: number;
    error: APIError;
    time: {
        created: number;
    };
};
export type ResourceSource = {
    text: FilePartSourceText;
    type: "resource";
    clientName: string;
    uri: string;
};
export type SymbolSource = {
    text: FilePartSourceText;
    type: "symbol";
    path: string;
    range: Range;
    name: string;
    kind: number;
};
