// App-shell-owned legacy compatibility contract.
//
// A few shapes the app still carries have no counterpart in the current schema (`@/v2-types`) or in the current
// wire declarations (`@/v2-wire`), and the legacy client packages that used to own them are gone. This module
// owns them locally.

import type { SessionInfo, WireSessionMessageInfo } from "@/v2-types"

import type { Event, Message, Part, Session, Todo } from "@/v2-wire"


export type { OpenCodeEvent } from "./v2-legacy-events"

/** The bundled client's file diff. Its path field is `file`, not the current schema's `path`. */
export type FileDiffInfo = {
  file: string
  patch: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}

/**
 * The bundled client's assistant and user messages: the members of the session-message union, not the schema's
 * own message shapes (the bundled client's content parts carry no id).
 */
export type SessionMessageAssistant = Extract<WireSessionMessageInfo, { type: "assistant" }>
export type SessionMessageUser = Extract<WireSessionMessageInfo, { type: "user" }>

/** The bundled client's skill message: the one member the local contract's union does not carry. */
export type SessionMessageSkill = {
  id: string
  metadata?: { [x: string]: JsonValue }
  time: { created: number }
  type: "skill"
  skill: string
  name: string
  text: string
}

/** The session-message union, with the skill message the local contract's union omits. */
export type SessionMessageInfo = WireSessionMessageInfo | SessionMessageSkill

/** The bundled client's pending session message: the legacy shape the store's inbox carries. */
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

/** The global event envelope: one directory's event stream, with the event itself as the payload. */
export type GlobalEvent = {
  directory: string
  project?: string
  workspace?: string
  payload: Event
}

/**
 * The legacy session client the app-shell keeps for its V1 compatibility reads: the bundled client's session
 * routes and their `{ data }` envelopes. The current server serves the V2 routes instead, so this contract
 * survives only for the compatibility path.
 */
export type LegacySessionClient = {
  session: {
    get: (input: { sessionID: string }) => Promise<{ data?: SessionInfo }>
    messages: (input: { sessionID: string; limit?: number; before?: string }) => Promise<{
      data?: Array<{ info: Message; parts: Part[] }>
      response: { headers: Headers }
    }>
    message: (input: { sessionID: string; messageID: string }) => Promise<{ data?: { info: Message; parts: Part[] } }>
    todo: (input: { sessionID: string }) => Promise<{ data?: Todo[] }>
    list: (input: { directory?: string; roots?: boolean; limit?: number }) => Promise<{ data: Session[] }>
    update: (input: { sessionID: string; directory?: string; time?: { archived?: number } }) => Promise<unknown>
  }
}
