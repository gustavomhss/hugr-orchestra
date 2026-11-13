import type {
  PermissionV2Reply,
  PermissionV2Source,
  Pty,
  QuestionV2Answer,
  QuestionV2Info,
  QuestionV2Tool,
} from "./permission"

export type EventPermissionV2Asked = {
  id: string
  type: "permission.v2.asked"
  properties: {
    id: string
    sessionID: string
    action: string
    resources: Array<string>
    save?: Array<string>
    metadata?: {
      [key: string]: unknown
    }
    source?: PermissionV2Source
  }
}
export type EventPermissionV2Replied = {
  id: string
  type: "permission.v2.replied"
  properties: {
    sessionID: string
    requestID: string
    reply: PermissionV2Reply
  }
}
export type EventPtyCreated = {
  id: string
  type: "pty.created"
  properties: {
    info: Pty
  }
}
export type EventPtyDeleted = {
  id: string
  type: "pty.deleted"
  properties: {
    id: string
  }
}
export type EventPtyExited = {
  id: string
  type: "pty.exited"
  properties: {
    id: string
    exitCode: number
  }
}
export type EventPtyUpdated = {
  id: string
  type: "pty.updated"
  properties: {
    info: Pty
  }
}
export type EventQuestionV2Asked = {
  id: string
  type: "question.v2.asked"
  properties: {
    id: string
    sessionID: string
    /**
     * Questions to ask
     */
    questions: Array<QuestionV2Info>
    tool?: QuestionV2Tool
  }
}
export type EventQuestionV2Rejected = {
  id: string
  type: "question.v2.rejected"
  properties: {
    sessionID: string
    requestID: string
  }
}
export type EventQuestionV2Replied = {
  id: string
  type: "question.v2.replied"
  properties: {
    sessionID: string
    requestID: string
    answers: Array<QuestionV2Answer>
  }
}
