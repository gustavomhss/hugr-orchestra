import type {
  LlmProviderMetadata,
  LlmToolContent,
  LocationRef,
} from "./misc"

import type {
  ModelRef,
} from "./provider"

import type {
  Prompt,
  PromptContextInfo,
} from "./permission"

import type {
  RevertState,
} from "./relay"

import type {
  SessionErrorUnknown,
  SessionNextRetryError,
  SessionStepTokens,
  SessionSubagentModelsPolicy,
} from "./session-core"

export type EventSessionNextCreated = {
  id: string
  type: "session.next.created"
  properties: {
    timestamp: number
    sessionID: string
    projectID: string
    parentID?: string
    location: {
      directory: string
      workspaceID?: string
    }
    subdirectory?: string
    title: string
    agent?: string
    model?: ModelRef
  }
}
export type EventSessionNextDeleted = {
  id: string
  type: "session.next.deleted"
  properties: {
    timestamp: number
    sessionID: string
  }
}
export type EventSessionNextRenamed = {
  id: string
  type: "session.next.renamed"
  properties: {
    timestamp: number
    sessionID: string
    title: string
  }
}
export type EventSessionNextAgentSwitched = {
  id: string
  type: "session.next.agent.switched"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    agent: string
  }
}
export type EventSessionNextArchiveChanged = {
  id: string
  type: "session.next.archive.changed"
  properties: {
    timestamp: number
    sessionID: string
    archived: number
  }
}
export type EventSessionNextCompactionDelta = {
  id: string
  type: "session.next.compaction.delta"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    text: string
  }
}
export type EventSessionNextCompactionEnded = {
  id: string
  type: "session.next.compaction.ended"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    reason: "auto" | "manual"
    text: string
    recent: string
  }
}
export type EventSessionNextCompactionFailed = {
  id: string
  type: "session.next.compaction.failed"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    reason: "auto" | "manual"
    error: {
      type: "unknown"
      message: string
    }
  }
}
export type EventSessionNextCompactionStarted = {
  id: string
  type: "session.next.compaction.started"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    reason: "auto" | "manual"
  }
}
export type EventSessionNextContextUpdated = {
  id: string
  type: "session.next.context.updated"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    text: string
  }
}
export type EventSessionNextModelSwitched = {
  id: string
  type: "session.next.model.switched"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    model: ModelRef
  }
}
export type EventSessionNextMoved = {
  id: string
  type: "session.next.moved"
  properties: {
    timestamp: number
    sessionID: string
    location: LocationRef
    subdirectory?: string
  }
}
export type EventSessionNextPromptAdmitted = {
  id: string
  type: "session.next.prompt.admitted"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    prompt: Prompt
    promptContext?: PromptContextInfo
    delivery: "steer" | "queue"
  }
}
export type EventSessionNextPrompted = {
  id: string
  type: "session.next.prompted"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    prompt: Prompt
    promptContext?: PromptContextInfo
    delivery: "steer" | "queue"
  }
}
export type EventSessionNextReasoningDelta = {
  id: string
  type: "session.next.reasoning.delta"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    reasoningID: string
    delta: string
  }
}
export type EventSessionNextReasoningEnded = {
  id: string
  type: "session.next.reasoning.ended"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    reasoningID: string
    text: string
    providerMetadata?: LlmProviderMetadata
  }
}
export type EventSessionNextReasoningStarted = {
  id: string
  type: "session.next.reasoning.started"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    reasoningID: string
    providerMetadata?: LlmProviderMetadata
  }
}
export type EventSessionNextRetried = {
  id: string
  type: "session.next.retried"
  properties: {
    timestamp: number
    sessionID: string
    attempt: number
    error: SessionNextRetryError
  }
}
export type EventSessionNextRevertCleared = {
  id: string
  type: "session.next.revert.cleared"
  properties: {
    timestamp: number
    sessionID: string
  }
}
export type EventSessionNextRevertCommitted = {
  id: string
  type: "session.next.revert.committed"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
  }
}
export type EventSessionNextRevertStaged = {
  id: string
  type: "session.next.revert.staged"
  properties: {
    timestamp: number
    sessionID: string
    revert: RevertState
  }
}
export type EventSessionNextShellEnded = {
  id: string
  type: "session.next.shell.ended"
  properties: {
    timestamp: number
    sessionID: string
    callID: string
    output: string
  }
}
export type EventSessionNextShellStarted = {
  id: string
  type: "session.next.shell.started"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    callID: string
    command: string
  }
}
export type EventSessionNextStepEnded = {
  id: string
  type: "session.next.step.ended"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    finish: string
    cost: number
    usageKnown?: boolean
    tokens: SessionStepTokens
    snapshot?: string
    files?: Array<string>
  }
}
export type EventSessionNextStepFailed = {
  id: string
  type: "session.next.step.failed"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    error: SessionErrorUnknown
  }
}
export type EventSessionNextStepStarted = {
  id: string
  type: "session.next.step.started"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    agent: string
    model: ModelRef
    snapshot?: string
  }
}
export type EventSessionNextSubagentModelsChanged = {
  id: string
  type: "session.next.subagent.models.changed"
  properties: {
    timestamp: number
    sessionID: string
    policy: SessionSubagentModelsPolicy
  }
}
export type EventSessionNextSynthetic = {
  id: string
  type: "session.next.synthetic"
  properties: {
    timestamp: number
    sessionID: string
    messageID: string
    text: string
  }
}
export type EventSessionNextTextDelta = {
  id: string
  type: "session.next.text.delta"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    textID: string
    delta: string
  }
}
export type EventSessionNextTextEnded = {
  id: string
  type: "session.next.text.ended"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    textID: string
    text: string
  }
}
export type EventSessionNextTextStarted = {
  id: string
  type: "session.next.text.started"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    textID: string
  }
}
export type EventSessionNextToolCalled = {
  id: string
  type: "session.next.tool.called"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    callID: string
    tool: string
    input: {
      [key: string]: unknown
    }
    provider: {
      executed: boolean
      metadata?: LlmProviderMetadata
    }
  }
}
export type EventSessionNextToolFailed = {
  id: string
  type: "session.next.tool.failed"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    callID: string
    error: SessionErrorUnknown
    result?: unknown
    provider: {
      executed: boolean
      metadata?: LlmProviderMetadata
    }
  }
}
export type EventSessionNextToolInputDelta = {
  id: string
  type: "session.next.tool.input.delta"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    callID: string
    delta: string
  }
}
export type EventSessionNextToolInputEnded = {
  id: string
  type: "session.next.tool.input.ended"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    callID: string
    text: string
  }
}
export type EventSessionNextToolInputStarted = {
  id: string
  type: "session.next.tool.input.started"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    callID: string
    name: string
  }
}
export type EventSessionNextToolProgress = {
  id: string
  type: "session.next.tool.progress"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    callID: string
    structured: {
      [key: string]: unknown
    }
    content: Array<LlmToolContent>
  }
}
export type EventSessionNextToolSuccess = {
  id: string
  type: "session.next.tool.success"
  properties: {
    timestamp: number
    sessionID: string
    assistantMessageID: string
    callID: string
    structured: {
      [key: string]: unknown
    }
    content: Array<LlmToolContent>
    outputPaths?: Array<string>
    result?: unknown
    provider: {
      executed: boolean
      metadata?: LlmProviderMetadata
    }
  }
}
