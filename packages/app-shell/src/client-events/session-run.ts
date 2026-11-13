import type {
  FileDiffInfo,
} from "./parts"

import type {
  ModelRef,
  MoneyUSD,
  TokenUsageInfo,
  LocationRef,
  ShellInfo,
  PromptFileAttachment,
  PromptAgentAttachment,
} from "./misc"

import type {
  SessionStructuredError,
} from "./session-meta"

export type SessionPendingSyntheticData1 = {
    text: string;
    description?: string;
    metadata?: {
        [x: string]: any;
    };
};
export type SessionInputPromoted = {
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
export type SessionSynthetic = {
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
export type SessionStepStarted = {
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
export type SessionStepEnded = {
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
export type SessionRevertCleared = {
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
export type SessionRevertCommitted = {
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
export type SessionRevert = {
    messageID: string;
    partID?: string;
    snapshot?: string;
    files?: Array<FileDiffInfo>;
};
export type SessionStepFailed = {
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
export type SessionRetryScheduled = {
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
export type SessionPendingSyntheticMessage = {
    type: "synthetic";
    data: SessionPendingSyntheticData1;
    delivery: "steer" | "queue";
};
export type SessionShellStarted = {
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
export type SessionShellEnded = {
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
export type SessionRevertStaged = {
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
export type SessionPendingUserData1 = {
    text: string;
    files?: Array<PromptFileAttachment>;
    agents?: Array<PromptAgentAttachment>;
    metadata?: {
        [x: string]: any;
    };
};
export type SessionPendingUserMessage = {
    type: "user";
    data: SessionPendingUserData1;
    delivery: "steer" | "queue";
};
export type SessionPendingMessage = SessionPendingUserMessage | SessionPendingSyntheticMessage;
export type SessionInputAdmitted = {
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
