import type {
  ProjectCurrent,
} from "./relay"

import type {
  SessionsResponse,
} from "./session-core"

export type FileContent = {
  type: "text" | "binary"
  content: string
  diff?: string
  patch?: {
    oldFileName: string
    newFileName: string
    oldHeader?: string
    newHeader?: string
    hunks: Array<{
      oldStart: number
      oldLines: number
      newStart: number
      newLines: number
      lines: Array<string>
    }>
    index?: string
  }
  encoding?: "base64"
  mimeType?: string
}
export type FileDiff = {
  path: string
  status: "added" | "modified" | "deleted"
  additions: number
  deletions: number
  patch: string
}
export type FileNode = {
  name: string
  path: string
  absolute: string
  type: "file" | "directory"
  ignored: boolean
}
export type ImageAttachmentConfig = {
  auto_resize?: boolean
  max_width?: number
  max_height?: number
  max_base64_bytes?: number
}
export type IntegrationOauthConnectOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: {
    attemptID: string
    url: string
    instructions: string
    mode: "auto" | "code"
    time: {
      created: number | "Infinity" | "-Infinity" | "NaN"
      expires: number | "Infinity" | "-Infinity" | "NaN"
    }
  }
}
export type JsonSchema = {
  [key: string]: unknown
}
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | Array<JsonValue>
  | {
      [key: string]: JsonValue
    }
export type LLMToolContent = ToolTextContent | ToolFileContent
/**
 * @deprecated Always uses stretch layout.
 */
export type LayoutConfig = "auto" | "stretch"
export type LlmProviderMetadata = {
  [key: string]: {
    [key: string]: unknown
  }
}
export type LlmToolContent = ToolTextContent | ToolFileContent
export type LocationRef = {
  directory: string
  workspaceID?: string
}

/**
 * Log level
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

/**
 * Server configuration for orchestra serve and web commands
 */
export type Path = {
  home: string
  state: string
  config: string
  worktree: string
  directory: string
}
export type Todo = {
  /**
   * Brief description of the task
   */
  content: string
  /**
   * Current status of the task: pending, in_progress, completed, cancelled
   */
  status: string
  /**
   * Priority level of the task: high, medium, low
   */
  priority: string
}
export type ToolFileContent = {
  type: "file"
  uri: string
  mime: string
  name?: string
}
export type ToolTextContent = {
  type: "text"
  text: string
}
export type V2SessionListResponse = V2SessionListResponses[keyof V2SessionListResponses]
export type V2SessionListResponses = {
  /**
   * SessionsResponse
   */
  200: SessionsResponse
}
export type CurrentProject = ProjectCurrent
