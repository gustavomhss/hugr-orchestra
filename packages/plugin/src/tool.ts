import { z } from "zod"

/** Host-owned invocation identity. Labels, model arguments and plugin metadata cannot grant authority. */
export type InvocationBinding = Readonly<{
  projectId: string
  directory: string
  worktree: string
  workspaceID?: string
  memberId: string
  executionSessionId: string
  authoritySessionId: string
  assistantMessageID: string
  callID: string
  taskId?: string
  resumeRef?: string
}>

export type ToolContext = {
  sessionID: string
  messageID: string
  /** Optional for legacy/non-V1 hosts; native V1 backend calls always carry both fields. */
  readonly callID?: string
  readonly binding?: InvocationBinding
  /** Display label of the executing agent. Users can rename it, so never route or authorize on it. */
  agent: string
  /** Stable id of the executing agent: the identity that routes, owns memory and holds permissions. */
  agentID: string
  /**
   * Current project directory for this session.
   * Prefer this over process.cwd() when resolving relative paths.
   */
  directory: string
  /**
   * Project worktree root for this session.
   * Useful for generating stable relative paths (e.g. path.relative(worktree, absPath)).
   */
  worktree: string
  abort: AbortSignal
  metadata(input: { title?: string; metadata?: { [key: string]: any } }): Promise<void> | void
  ask(input: AskInput): Promise<void>
}

type AskInput = {
  permission: string
  patterns: string[]
  always: string[]
  metadata: { [key: string]: any }
}

export type ToolAttachment = {
  type: "file"
  mime: string
  url: string
  filename?: string
}

export type ToolResult =
  | string
  | {
      title?: string
      output: string
      metadata?: { [key: string]: any }
      attachments?: ToolAttachment[]
    }

export function tool<Args extends z.ZodRawShape>(input: {
  description: string
  args: Args
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<ToolResult>
}) {
  return input
}
tool.schema = z

export type ToolDefinition = ReturnType<typeof tool>
