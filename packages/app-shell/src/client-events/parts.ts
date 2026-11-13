import type {
  ProviderAuthError,
  UnknownError2,
  MessageOutputLengthError,
  MessageAbortedError,
  StructuredOutputError,
  ContextOverflowError,
  ContentFilterError,
  APIError,
  SubtaskPart,
  StepStartPart,
  StepFinishPart,
  SnapshotPart,
  PatchPart,
  AgentPart,
  CompactionPart,
  OutputFormat,
  RetryPart,
  ResourceSource,
  SymbolSource,
} from "./misc"

export type JsonValue = null | boolean | number | string | Array<JsonValue> | {
    [key: string]: JsonValue;
};
export type FileDiffInfo = {
    file: string;
    patch: string;
    additions: number;
    deletions: number;
    status: "added" | "deleted" | "modified";
};
export type ToolTextContent = {
    type: "text";
    text: string;
};
export type ToolFileContent = {
    type: "file";
    uri: string;
    mime: string;
    name?: string;
};
export type FileDiffEventInfo = {
    file?: string;
    patch?: string;
    additions: number;
    deletions: number;
    status?: "added" | "deleted" | "modified";
};
export type TextPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "text";
    text: string;
    synthetic?: boolean | undefined;
    ignored?: boolean | undefined;
    time?: {
        start: number;
        end?: number | undefined;
    } | undefined;
    metadata?: {
        [x: string]: any;
    } | undefined;
};
export type ReasoningPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "reasoning";
    text: string;
    metadata?: {
        [x: string]: any;
    } | undefined;
    time: {
        start: number;
        end?: number | undefined;
    };
};
export type FilePartSourceText = {
    value: string;
    start: number;
    end: number;
};
export type Range = {
    start: {
        line: number;
        character: number;
    };
    end: {
        line: number;
        character: number;
    };
};
export type ToolStatePending = {
    status: "pending";
    input: {
        [x: string]: any;
    };
    raw: string;
};
export type ToolStateRunning = {
    status: "running";
    input: {
        [x: string]: any;
    };
    title?: string | undefined;
    metadata?: {
        [x: string]: any;
    } | undefined;
    time: {
        start: number;
    };
};
export type ToolStateError = {
    status: "error";
    input: {
        [x: string]: any;
    };
    error: string;
    metadata?: {
        [x: string]: any;
    } | undefined;
    time: {
        start: number;
        end: number;
    };
};
export type AssistantMessage = {
    id: string;
    sessionID: string;
    role: "assistant";
    time: {
        created: number;
        completed?: number | undefined;
    };
    error?: ProviderAuthError | UnknownError2 | MessageOutputLengthError | MessageAbortedError | StructuredOutputError | ContextOverflowError | ContentFilterError | APIError | undefined;
    parentID: string;
    modelID: string;
    providerID: string;
    mode: string;
    agent: string;
    path: {
        cwd: string;
        root: string;
    };
    summary?: boolean | undefined;
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
    structured?: any | undefined;
    variant?: string | undefined;
    finish?: string | undefined;
};
export type FileSource = {
    text: FilePartSourceText;
    type: "file";
    path: string;
};
export type UserMessage = {
    id: string;
    sessionID: string;
    role: "user";
    time: {
        created: number;
    };
    format?: OutputFormat | undefined;
    summary?: {
        title?: string | undefined;
        body?: string | undefined;
        diffs: Array<FileDiffEventInfo>;
    } | undefined;
    agent: string;
    model: {
        providerID: string;
        modelID: string;
        variant?: string | undefined;
    };
    system?: string | undefined;
    tools?: {
        [x: string]: boolean;
    } | undefined;
};
export type FilePartSource = FileSource | SymbolSource | ResourceSource;
export type Message = UserMessage | AssistantMessage;
export type FilePart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "file";
    mime: string;
    filename?: string | undefined;
    url: string;
    source?: FilePartSource | undefined;
};
export type ToolStateCompleted = {
    status: "completed";
    input: {
        [x: string]: any;
    };
    output: string;
    title: string;
    metadata: {
        [x: string]: any;
    };
    time: {
        start: number;
        end: number;
        compacted?: number | undefined;
    };
    attachments?: Array<FilePart> | undefined;
};
export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;
export type ToolPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "tool";
    callID: string;
    tool: string;
    state: ToolState;
    metadata?: {
        [x: string]: any;
    } | undefined;
};
export type Part = TextPart | SubtaskPart | ReasoningPart | FilePart | ToolPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | AgentPart | RetryPart | CompactionPart;
export type UnknownError = {
    readonly _tag: "UnknownError";
    readonly message: string;
    readonly ref?: string | undefined;
};
