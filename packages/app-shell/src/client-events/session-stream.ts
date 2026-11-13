import type {
  JsonValue,
} from "./parts"

import type {
  LocationRef,
  LLMToolContent,
} from "./misc"

import type {
  SessionStructuredError,
  SessionMessageProviderState3,
  SessionMessageProviderState4,
  SessionMessageProviderState5,
  SessionMessageProviderState6,
  SessionMessageProviderState7,
} from "./session-meta"

export type SessionTextStarted = {
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
export type SessionTextEnded = {
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
export type SessionToolInputStarted = {
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
export type SessionToolInputEnded = {
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
export type SessionCompactionStarted = {
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
export type SessionCompactionEnded = {
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
export type SessionCompactionFailed = {
    id: string;
    created: number;
    metadata?: {
        [x: string]: JsonValue;
    };
    type: "session.compaction.failed";
    durable: {
        aggregateID: string;
        seq: number;
        version: 1;
    };
    location?: LocationRef;
    data: {
        sessionID: string;
        messageID: string;
        reason: "auto" | "manual";
        error: {
            type: "unknown";
            message: string;
        };
    };
};
export type SessionTextDelta = {
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
export type SessionReasoningDelta = {
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
export type SessionToolInputDelta = {
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
export type SessionToolProgress = {
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
export type SessionCompactionDelta = {
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
export type SessionReasoningStarted = {
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
export type SessionReasoningEnded = {
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
export type SessionToolCalled = {
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
export type SessionToolSuccess = {
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
export type SessionToolFailed = {
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
