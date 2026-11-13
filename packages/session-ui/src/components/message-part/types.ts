import type { Transcript } from "../../transcript-model"
import { Component } from "solid-js"

export type AgentPart = Transcript.AgentPart
export type AssistantMessage = Transcript.AssistantMessage
export type FilePart = Transcript.FilePart
type MessageType = Transcript.Message
export type PartType = Transcript.Part
export type ReasoningPart = Transcript.ReasoningPart
export type Session = Transcript.Session
export type TextPart = Transcript.TextPart
export type ToolPart = Transcript.ToolPart
export type UserMessage = Transcript.UserMessage
export type QuestionAnswer = Transcript.QuestionAnswer
export type QuestionInfo = Transcript.QuestionInfo

export interface MessageProps {
  message: MessageType
  parts: PartType[]
  actions?: UserActions
  showAssistantCopyPartID?: string | null
  showReasoningSummaries?: boolean
  useV2Actions?: boolean
  comments?: UserMessageComment[]
}

export type SessionAction = (input: { sessionID: string; messageID: string }) => Promise<void> | void

export type UserActions = {
  fork?: SessionAction
  revert?: SessionAction
  openAttachment?: (file: FilePart) => void
}

export type UserMessageComment = {
  path: string
  comment: string
  selection?: {
    startLine: number
    endLine: number
  }
}

export interface MessagePartProps {
  part: PartType
  message: MessageType
  hideDetails?: boolean
  defaultOpen?: boolean
  toolOpen?: boolean
  onToolOpenChange?: (open: boolean) => void
  deferToolContent?: boolean
  virtualizeDiff?: boolean
  onContentRendered?: () => void
  showAssistantCopyPartID?: string | null
  turnDurationMs?: number
  useV2Actions?: boolean
}

export type PartComponent = Component<MessagePartProps>
