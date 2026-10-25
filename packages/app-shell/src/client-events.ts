// The event union the app-shell speaks internally (`ServerCurrentEvent`): the session event vocabulary plus the
// transitive closure of the types it names. It holds only what the V2 server publishes (`EventManifest.ServerDefinitions`)
// or what the app derives from it: `server-event-native.ts` translates `session.next.*`, and `adaptServerEvent` maps
// `permission.v2.*` and `question.v2.*` onto `permission.*` and `question.*`.
//
// It is NOT the local `Event` union in `@/v2-wire`: that one carries the server's `session.next.*` vocabulary and
// the `properties` payload, while this union carries the tags (`session.text.delta`, `session.tool.success`, ...)
// and the `data` payload that `server-event-native.ts` produces.

type JsonValue = null | boolean | number | string | Array<JsonValue> | {
    [key: string]: JsonValue;
};

type ModelRef = {
    id: string;
    providerID: string;
    variant?: string;
};

type MoneyUSD = number;

type TokenUsageInfo = {
    input: number;
    output: number;
    reasoning: number;
    cache: {
        read: number;
        write: number;
    };
};

type LocationRef = {
    directory: string;
    workspaceID?: string;
};

type FileDiffInfo = {
    file: string;
    patch: string;
    additions: number;
    deletions: number;
    status: "added" | "deleted" | "modified";
};

type PromptBase64 = string;

type PromptFileSource = {
    type: "inline";
} | {
    type: "uri";
    uri: string;
};

type PromptMention = {
    start: number;
    end: number;
    text: string;
};

type ToolTextContent = {
    type: "text";
    text: string;
};

type ToolFileContent = {
    type: "file";
    uri: string;
    mime: string;
    name?: string;
};

type SessionStructuredError = {
    type: string;
    message: string;
};

type SessionPendingSyntheticData1 = {
    text: string;
    description?: string;
    metadata?: {
        [x: string]: any;
    };
};

type ShellInfo = {
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

type SessionMessageProviderState3 = {
    [x: string]: any;
};

type SessionMessageProviderState4 = {
    [x: string]: any;
};

type SessionMessageProviderState5 = {
    [x: string]: any;
};

type SessionMessageProviderState6 = {
    [x: string]: any;
};

type SessionMessageProviderState7 = {
    [x: string]: any;
};

type PermissionV2Source = {
    type: "tool";
    messageID: string;
    callID: string;
};

type FileDiffEventInfo = {
    file?: string;
    patch?: string;
    additions: number;
    deletions: number;
    status?: "added" | "deleted" | "modified";
};

type PermissionAction = "allow" | "deny" | "ask";

type JSONSchema = {
    [x: string]: any;
};

type ProviderAuthError = {
    name: "ProviderAuthError";
    data: {
        providerID: string;
        message: string;
    };
};

type UnknownError2 = {
    name: "UnknownError";
    data: {
        message: string;
        ref?: string | undefined;
    };
};

type MessageOutputLengthError = {
    name: "MessageOutputLengthError";
    data: {};
};

type MessageAbortedError = {
    name: "MessageAbortedError";
    data: {
        message: string;
    };
};

type StructuredOutputError = {
    name: "StructuredOutputError";
    data: {
        message: string;
        retries: number;
    };
};

type ContextOverflowError = {
    name: "ContextOverflowError";
    data: {
        message: string;
        responseBody?: string | undefined;
    };
};

type ContentFilterError = {
    name: "ContentFilterError";
    data: {
        message: string;
    };
};

type APIError = {
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

type TextPart = {
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

type SubtaskPart = {
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

type ReasoningPart = {
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

type FilePartSourceText = {
    value: string;
    start: number;
    end: number;
};

type Range = {
    start: {
        line: number;
        character: number;
    };
    end: {
        line: number;
        character: number;
    };
};

type ToolStatePending = {
    status: "pending";
    input: {
        [x: string]: any;
    };
    raw: string;
};

type ToolStateRunning = {
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

type ToolStateError = {
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

type StepStartPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "step-start";
    snapshot?: string | undefined;
};

type StepFinishPart = {
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

type SnapshotPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "snapshot";
    snapshot: string;
};

type PatchPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "patch";
    hash: string;
    files: Array<string>;
};

type AgentPart = {
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

type CompactionPart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "compaction";
    auto: boolean;
    overflow?: boolean | undefined;
    tail_start_id?: string | undefined;
};

type PermissionV2Reply = "once" | "always" | "reject";

type Pty = {
    id: string;
    title: string;
    command: string;
    args: Array<string>;
    cwd: string;
    status: "running" | "exited";
    pid: number;
    exitCode?: number;
};

type QuestionV2Option = {
    label: string;
    description: string;
};

type QuestionV2Tool = {
    messageID: string;
    callID: string;
};

type QuestionV2Answer = Array<string>;

type QuestionOption = {
    label: string;
    description: string;
};

type QuestionTool = {
    messageID: string;
    callID: string;
};

type QuestionAnswer = Array<string>;

type SessionAgentSelected = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.agent.selected";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        agent: string;
    };
};

type SessionModelSelected = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.model.selected";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        model: ModelRef;
    };
};

type SessionMoved = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.moved";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        location: LocationRef;
        projectID?: string;
        subpath?: string;
    };
};

type SessionInputPromoted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.input.promoted";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        inputID: string;
    };
};

type SessionSynthetic = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.synthetic";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        text: string;
        description?: string;
        metadata?: {
            [x: string]: any;
        };
    };
};

type SessionStepStarted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.step.started";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        agent: string;
        model: ModelRef;
        snapshot?: string;
    };
};

type SessionStepEnded = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.step.ended";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        finish: "stop" | "length" | "tool-calls" | "content-filter" | "error" | "unknown";
        cost: MoneyUSD;
        tokens: TokenUsageInfo;
        snapshot?: string;
        files?: Array<string>;
    };
};

type SessionTextStarted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.text.started";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        ordinal: number;
    };
};

type SessionTextEnded = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.text.ended";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        ordinal: number;
        text: string;
    };
};

type SessionToolInputStarted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.tool.input.started";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        callID: string;
        name: string;
    };
};

type SessionToolInputEnded = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.tool.input.ended";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        callID: string;
        text: string;
    };
};

type SessionCompactionStarted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.compaction.started";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        reason: "auto" | "manual";
        recent: string;
        inputID?: string;
    };
};

type SessionCompactionEnded = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.compaction.ended";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        reason: "auto" | "manual";
        text: string;
        recent: string;
    };
};

type SessionRevertCleared = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.revert.cleared";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
    };
};

type SessionRevertCommitted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.revert.committed";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        to: string;
    };
};

type ModelsDevRefreshed = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "models-dev.refreshed";
    location?: LocationRef;
    data: {};
};

type IntegrationUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "integration.updated";
    location?: LocationRef;
    data: {};
};

type IntegrationConnectionUpdated = {
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

type CatalogUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "catalog.updated";
    location?: LocationRef;
    data: {};
};

type MessageRemoved = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "message.removed";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        messageID: string;
    };
};

type MessagePartRemoved = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "message.part.removed";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        messageID: string;
        partID: string;
    };
};

type SessionTextDelta = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.text.delta";
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        ordinal: number;
        delta: string;
    };
};

type SessionReasoningDelta = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.reasoning.delta";
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        ordinal: number;
        delta: string;
    };
};

type SessionToolInputDelta = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.tool.input.delta";
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        callID: string;
        delta: string;
    };
};

type SessionToolProgress = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.tool.progress";
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        callID: string;
        metadata: {
            [x: string]: JsonValue;
        };
    };
};

type SessionCompactionDelta = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.compaction.delta";
    location?: LocationRef;
    data: {
        sessionID: string;
        text: string;
    };
};

type ReferenceUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "reference.updated";
    location?: LocationRef;
    data: {};
};

type PluginAdded = {
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

type ProjectDirectoriesUpdated = {
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

type PtyExited = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "pty.exited";
    location?: LocationRef;
    data: {
        id: string;
        exitCode: number;
    };
};

type PtyDeleted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "pty.deleted";
    location?: LocationRef;
    data: {
        id: string;
    };
};

type QuestionV2Rejected = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "question.v2.rejected";
    location?: LocationRef;
    data: {
        sessionID: string;
        requestID: string;
    };
};

type VcsBranchUpdated = {
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

type PermissionAsked = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "permission.asked";
    location?: LocationRef;
    data: {
        id: string;
        sessionID: string;
        permission: string;
        patterns: Array<string>;
        metadata: {
            [x: string]: any;
        };
        always: Array<string>;
        tool?: {
            messageID: string;
            callID: string;
        } | undefined;
    };
};

type PermissionReplied = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "permission.replied";
    location?: LocationRef;
    data: {
        sessionID: string;
        requestID: string;
        reply: "once" | "always" | "reject";
    };
};

type QuestionRejected = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "question.rejected";
    location?: LocationRef;
    data: {
        sessionID: string;
        requestID: string;
    };
};

type V2EventServerConnected = {
    id: string;
    metadata?: {
        [x: string]: any;
    } | undefined;
    location?: LocationRef | undefined;
    type: "server.connected";
    data: {};
};

type SessionRevert = {
    messageID: string;
    partID?: string;
    snapshot?: string;
    files?: Array<FileDiffInfo>;
};

type PromptFileAttachment = {
    data: PromptBase64;
    mime: string;
    source: PromptFileSource;
    name?: string;
    description?: string;
    mention?: PromptMention;
};

type PromptAgentAttachment = {
    name: string;
    mention?: PromptMention;
};

type LLMToolContent = ToolTextContent | ToolFileContent;

type SessionStepFailed = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.step.failed";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        error: SessionStructuredError;
        cost?: MoneyUSD;
        tokens?: TokenUsageInfo;
        snapshot?: string;
        files?: Array<string>;
    };
};

type SessionRetryScheduled = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.retry.scheduled";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        attempt: number;
        at: number;
        error: SessionStructuredError;
    };
};

type SessionPendingSyntheticMessage = {
    type: "synthetic";
    data: SessionPendingSyntheticData1;
    delivery: "steer" | "queue";
};

type SessionShellStarted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.shell.started";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        shell: ShellInfo;
    };
};

type SessionShellEnded = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.shell.ended";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        shell: ShellInfo;
        output: {
            output: string;
            cursor: number;
            size: number;
            truncated: boolean;
        };
    };
};

type SessionReasoningStarted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.reasoning.started";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        ordinal: number;
        state?: SessionMessageProviderState3;
    };
};

type SessionReasoningEnded = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.reasoning.ended";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        ordinal: number;
        text: string;
        state?: SessionMessageProviderState4;
    };
};

type SessionToolCalled = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.tool.called";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        callID: string;
        input: {
            [x: string]: any;
        };
        executed: boolean;
        state?: SessionMessageProviderState5;
    };
};

type PermissionV2Asked = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "permission.v2.asked";
    location?: LocationRef;
    data: {
        id: string;
        sessionID: string;
        action: string;
        resources: Array<string>;
        save?: Array<string>;
        metadata?: {
            [x: string]: any;
        };
        source?: PermissionV2Source;
    };
};

type PermissionRule = {
    permission: string;
    pattern: string;
    action: PermissionAction;
};

type OutputFormat = {
    type: "text";
} | {
    type: "json_schema";
    schema: JSONSchema;
    retryCount?: number | undefined | undefined;
};

type AssistantMessage = {
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

type RetryPart = {
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

type FileSource = {
    text: FilePartSourceText;
    type: "file";
    path: string;
};

type ResourceSource = {
    text: FilePartSourceText;
    type: "resource";
    clientName: string;
    uri: string;
};

type SymbolSource = {
    text: FilePartSourceText;
    type: "symbol";
    path: string;
    range: Range;
    name: string;
    kind: number;
};

type PermissionV2Replied = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "permission.v2.replied";
    location?: LocationRef;
    data: {
        sessionID: string;
        requestID: string;
        reply: PermissionV2Reply;
    };
};

type PtyCreated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "pty.created";
    location?: LocationRef;
    data: {
        info: Pty;
    };
};

type PtyUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "pty.updated";
    location?: LocationRef;
    data: {
        info: Pty;
    };
};

type QuestionV2Info = {
    question: string;
    header: string;
    options: Array<QuestionV2Option>;
    multiple?: boolean;
    custom?: boolean;
};

type QuestionV2Replied = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "question.v2.replied";
    location?: LocationRef;
    data: {
        sessionID: string;
        requestID: string;
        answers: Array<QuestionV2Answer>;
    };
};

type QuestionInfo = {
    question: string;
    header: string;
    options: Array<QuestionOption>;
    multiple?: boolean | undefined;
    custom?: boolean | undefined;
};

type QuestionReplied = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "question.replied";
    location?: LocationRef;
    data: {
        sessionID: string;
        requestID: string;
        answers: Array<QuestionAnswer>;
    };
};

type SessionRevertStaged = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.revert.staged";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        revert: SessionRevert;
    };
};

type SessionPendingUserData1 = {
    text: string;
    files?: Array<PromptFileAttachment>;
    agents?: Array<PromptAgentAttachment>;
    metadata?: {
        [x: string]: any;
    };
};

type SessionToolSuccess = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.tool.success";
    durable: {
        aggregateID: string;
        seq: number;
        version: 2;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        callID: string;
        content: [LLMToolContent, ...Array<LLMToolContent>];
        metadata?: {
            [x: string]: JsonValue;
        };
        executed: boolean;
        resultState?: SessionMessageProviderState6;
    };
};

type SessionToolFailed = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.tool.failed";
    durable: {
        aggregateID: string;
        seq: number;
        version: 2;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        assistantMessageID: string;
        callID: string;
        error: SessionStructuredError;
        content?: [LLMToolContent, ...Array<LLMToolContent>];
        metadata?: {
            [x: string]: JsonValue;
        };
        executed: boolean;
        resultState?: SessionMessageProviderState7;
    };
};

type PermissionRuleset = Array<PermissionRule>;

type UserMessage = {
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

type FilePartSource = FileSource | SymbolSource | ResourceSource;

type QuestionV2Asked = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "question.v2.asked";
    location?: LocationRef;
    data: {
        id: string;
        sessionID: string;
        questions: Array<QuestionV2Info>;
        tool?: QuestionV2Tool;
    };
};

type QuestionAsked = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "question.asked";
    location?: LocationRef;
    data: {
        id: string;
        sessionID: string;
        questions: Array<QuestionInfo>;
        tool?: QuestionTool | undefined;
    };
};

type SessionPendingUserMessage = {
    type: "user";
    data: SessionPendingUserData1;
    delivery: "steer" | "queue";
};

type SessionV1Info = {
    id: string;
    slug: string;
    projectID: string;
    workspaceID?: string;
    directory: string;
    path?: string;
    parentID?: string;
    summary?: {
        additions: number;
        deletions: number;
        files: number;
        diffs?: Array<FileDiffEventInfo>;
    };
    cost?: number;
    tokens?: {
        input: number;
        output: number;
        reasoning: number;
        cache: {
            read: number;
            write: number;
        };
    };
    share?: {
        url: string;
    };
    title: string;
    agent?: string;
    model?: {
        id: string;
        providerID: string;
        variant?: string;
    };
    version: string;
    metadata?: {
        [x: string]: any;
    };
    time: {
        created: number;
        updated: number;
        compacting?: number;
        archived?: number;
    };
    permission?: PermissionRuleset;
    revert?: {
        messageID: string;
        partID?: string;
        snapshot?: string;
        diff?: string;
    };
};

type Message = UserMessage | AssistantMessage;

type FilePart = {
    id: string;
    sessionID: string;
    messageID: string;
    type: "file";
    mime: string;
    filename?: string | undefined;
    url: string;
    source?: FilePartSource | undefined;
};

type SessionPendingMessage = SessionPendingUserMessage | SessionPendingSyntheticMessage;

type SessionCreated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.created";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        info: SessionV1Info;
    };
};

type SessionUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.updated";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        info: SessionV1Info;
    };
};

type SessionDeleted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.deleted";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        info: SessionV1Info;
    };
};

type MessageUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "message.updated";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        info: Message;
    };
};

type ToolStateCompleted = {
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

type SessionInputAdmitted = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "session.input.admitted";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        inputID: string;
        input: SessionPendingMessage;
    };
};

type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

type ToolPart = {
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

type Part = TextPart | SubtaskPart | ReasoningPart | FilePart | ToolPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | AgentPart | RetryPart | CompactionPart;

type MessagePartUpdated = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: any;
    };
    type: "message.part.updated";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        part: Part;
        time: number;
    };
};

type UnknownError = {
    readonly _tag: "UnknownError";
    readonly message: string;
    readonly ref?: string | undefined;
};
export type ClientEvent = ModelsDevRefreshed | IntegrationUpdated | IntegrationConnectionUpdated | CatalogUpdated | SessionCreated | SessionUpdated | SessionDeleted | MessageUpdated | MessageRemoved | MessagePartUpdated | MessagePartRemoved | SessionAgentSelected | SessionModelSelected | SessionMoved | SessionDeleted | SessionInputPromoted | SessionInputAdmitted | SessionSynthetic | SessionShellStarted | SessionShellEnded | SessionStepStarted | SessionStepEnded | SessionStepFailed | SessionTextStarted | SessionTextDelta | SessionTextEnded | SessionReasoningStarted | SessionReasoningDelta | SessionReasoningEnded | SessionToolInputStarted | SessionToolInputDelta | SessionToolInputEnded | SessionToolCalled | SessionToolProgress | SessionToolSuccess | SessionToolFailed | SessionRetryScheduled | SessionCompactionStarted | SessionCompactionDelta | SessionCompactionEnded | SessionRevertStaged | SessionRevertCleared | SessionRevertCommitted | ReferenceUpdated | PermissionV2Asked | PermissionV2Replied | PluginAdded | ProjectDirectoriesUpdated | PtyCreated | PtyUpdated | PtyExited | PtyDeleted | QuestionV2Asked | QuestionV2Replied | QuestionV2Rejected | VcsBranchUpdated | PermissionAsked | PermissionReplied | QuestionAsked | QuestionReplied | QuestionRejected | V2EventServerConnected;
