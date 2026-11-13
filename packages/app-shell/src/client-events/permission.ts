import type {
  LocationRef,
} from "./misc"

export type PermissionV2Source = {
    type: "tool";
    messageID: string;
    callID: string;
};
export type PermissionAction = "allow" | "deny" | "ask";
export type PermissionV2Reply = "once" | "always" | "reject";
export type Pty = {
    id: string;
    title: string;
    command: string;
    args: Array<string>;
    cwd: string;
    status: "running" | "exited";
    pid: number;
    exitCode?: number;
};
export type QuestionV2Option = {
    label: string;
    description: string;
};
export type QuestionV2Tool = {
    messageID: string;
    callID: string;
};
export type QuestionV2Answer = Array<string>;
export type PtyExited = {
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
export type PtyDeleted = {
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
export type QuestionV2Rejected = {
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
export type PermissionV2Asked = {
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
export type PermissionRule = {
    permission: string;
    pattern: string;
    action: PermissionAction;
};
export type PermissionV2Replied = {
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
export type PtyCreated = {
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
export type PtyUpdated = {
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
export type QuestionV2Info = {
    question: string;
    header: string;
    options: Array<QuestionV2Option>;
    multiple?: boolean;
    custom?: boolean;
};
export type QuestionV2Replied = {
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
export type PermissionRuleset = Array<PermissionRule>;
export type QuestionV2Asked = {
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
