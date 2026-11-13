import type {
  ModelRef,
  LocationRef,
} from "./misc"

export type SessionStructuredError = {
    type: string;
    message: string;
};
export type SessionMessageProviderState3 = {
    [x: string]: any;
};
export type SessionMessageProviderState4 = {
    [x: string]: any;
};
export type SessionMessageProviderState5 = {
    [x: string]: any;
};
export type SessionMessageProviderState6 = {
    [x: string]: any;
};
export type SessionMessageProviderState7 = {
    [x: string]: any;
};
export type SessionAgentSelected = {
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
export type SessionModelSelected = {
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
export type SessionMoved = {
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
