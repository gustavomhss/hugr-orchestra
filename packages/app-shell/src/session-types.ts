// Session shapes the app-shell owns locally: they have no counterpart in the schema (`@/v2-types`) or in the wire
// declarations (`@/v2-wire`).

import type { WireSessionMessageInfo } from "@/v2-types"

export type { ClientEvent } from "./client-events"

/** The file diff. Its path field is `file`, not the current schema's `path`. */
export type FileDiffInfo = {
  file: string
  patch: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}

/**
 * The assistant and user members of the session-message union, not the schema's own message shapes (their
 * content parts carry no id).
 */
export type SessionMessageAssistant = Extract<WireSessionMessageInfo, { type: "assistant" }>
export type SessionMessageUser = Extract<WireSessionMessageInfo, { type: "user" }>

/** The skill message: the one member the wire union does not carry. */
export type SessionMessageSkill = {
  id: string
  metadata?: { [x: string]: JsonValue }
  time: { created: number }
  type: "skill"
  skill: string
  name: string
  text: string
}

/** The session-message union, with the skill message the wire union omits. */
export type SessionMessageInfo = WireSessionMessageInfo | SessionMessageSkill

/** The pending session message the store's inbox carries. */
export type SessionPendingMessage = SessionPendingUserMessage | SessionPendingSyntheticMessage;

type SessionPendingUserMessage = {
    type: "user";
    data: SessionPendingUserData1;
    delivery: "steer" | "queue";
};

type SessionPendingSyntheticMessage = {
    type: "synthetic";
    data: SessionPendingSyntheticData1;
    delivery: "steer" | "queue";
};

type SessionPendingUserData1 = {
    text: string;
    files?: Array<PromptFileAttachment>;
    agents?: Array<PromptAgentAttachment>;
    metadata?: {
        [x: string]: any;
    };
};

type SessionPendingSyntheticData1 = {
    text: string;
    description?: string;
    metadata?: {
        [x: string]: any;
    };
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

type JsonValue = null | boolean | number | string | Array<JsonValue> | {
    [key: string]: JsonValue;
};
