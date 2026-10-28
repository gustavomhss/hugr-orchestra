// View-model types the app renders. Every request goes through the V2 `/api` client; adapters shape its
// results into these models. Edit by hand.

import type {
  AgentPart,
  ApiError,
  AssistantMessage,
  CompactionPart,
  ContentFilterError,
  ContextOverflowError,
  FilePart,
  FilePartSource,
  FilePartSourceText,
  FileSource,
  Message,
  MessageAbortedError,
  MessageOutputLengthError,
  OutputFormat,
  OutputFormatJsonSchema,
  OutputFormatText,
  Part,
  PatchPart,
  ProviderAuthError,
  Range,
  ReasoningPart,
  ResourceSource,
  RetryPart,
  Session,
  SnapshotFileDiff,
  SnapshotPart,
  StepFinishPart,
  StepStartPart,
  StructuredOutputError,
  SubtaskPart,
  SymbolSource,
  TextPart,
  ToolPart,
  ToolState,
  ToolStateCompleted,
  ToolStateError,
  ToolStatePending,
  ToolStateRunning,
  UnknownError,
  UserMessage,
} from "@orchestra/session-ui/transcript-model"

export type {
  AgentPart,
  ApiError,
  AssistantMessage,
  CompactionPart,
  ContentFilterError,
  ContextOverflowError,
  FilePart,
  FilePartSource,
  FilePartSourceText,
  FileSource,
  Message,
  MessageAbortedError,
  MessageOutputLengthError,
  OutputFormat,
  OutputFormatJsonSchema,
  OutputFormatText,
  Part,
  PatchPart,
  ProviderAuthError,
  Range,
  ReasoningPart,
  ResourceSource,
  RetryPart,
  Session,
  SnapshotFileDiff,
  SnapshotPart,
  StepFinishPart,
  StepStartPart,
  StructuredOutputError,
  SubtaskPart,
  SymbolSource,
  TextPart,
  ToolPart,
  ToolState,
  ToolStateCompleted,
  ToolStateError,
  ToolStatePending,
  ToolStateRunning,
  UnknownError,
  UserMessage,
}

export type Agent = {
  id?: string
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  native?: boolean
  hidden?: boolean
  topP?: number
  temperature?: number
  color?: string
  avatar?: string
  permission: PermissionRuleset
  model?: {
    modelID: string
    providerID: string
  }
  variant?: string
  prompt?: string
  options: {
    [key: string]: unknown
  }
  steps?: number
  engine?: "orchestra" | "claude-code"
  /** Skills packaged with the agent itself, outside the project's skill catalog. */
  skills?: readonly {
    name: string
    description?: string
    references?: readonly { kind?: string; family?: string; title: string }[]
  }[]
  toolkit?: "backend" | "research"
}

export type AgentColor = string
export type AgentConfig = {
  model?: string
  variant?: string
  temperature?: number
  top_p?: number
  prompt?: string
  tools?: {
    [key: string]: boolean
  }
  disable?: boolean
  description?: string
  mode?: "subagent" | "primary" | "all"
  hidden?: boolean
  options?: {
    [key: string]: unknown
  }
  /**
   * Hex color code (e.g., #FF5733) or theme color (e.g., primary)
   */
  color?: string | "primary" | "secondary" | "accent" | "success" | "warning" | "error" | "info"
  steps?: number
  maxSteps?: number
  permission?: PermissionConfig
  engine?: "orchestra" | "claude-code"
  [key: string]:
    | unknown
    | string
    | number
    | {
        [key: string]: boolean
      }
    | boolean
    | "subagent"
    | "primary"
    | "all"
    | {
        [key: string]: unknown
      }
    | string
    | "primary"
    | "secondary"
    | "accent"
    | "success"
    | "warning"
    | "error"
    | "info"
    | number
    | PermissionConfig
    | "orchestra"
    | "claude-code"
    | undefined
}

export type AgentInfo = {
  id: string
  name: string
  model?: ModelRef
  request: ProviderRequest
  system?: string
  description?: string
  mode: "subagent" | "primary" | "all"
  hidden: boolean
  color?: AgentColor
  avatar?: string
  steps?: number
  permissions: PermissionV2Ruleset
}
export type AgentListInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type AgentListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<AgentInfo>
}
export type AtlasKnowledgeAnchor = {
  reference: AtlasKnowledgeReference
  projectID: string
  authorSessionID: unknown
  assistantMessageID: unknown
  callID: unknown
  memberID: "archie"
  target: AtlasKnowledgeTarget
  units: unknown & unknown
}

export type AtlasKnowledgeReference = unknown & unknown & unknown

export type AtlasKnowledgeTarget = {
  kind: "assignment" | "work-package"
  id: AtlasKnowledgeUnitId
}

export type AtlasKnowledgeUnitId = unknown & unknown & unknown

export type AttachmentConfig = {
  image?: ImageAttachmentConfig
}

export type Command = {
  name: string
  description?: string
  agent?: string
  model?: string
  source?: "command" | "mcp" | "skill"
  template: string
  subtask?: boolean
  hints: Array<string>
}

export type CommandInfo = {
  name: string
  template: string
  description?: string
  agent?: string
  model?: ModelRef
  subtask?: boolean
}
export type CommandListInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type CommandListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<CommandInfo>
}
export type Config = {
  $schema?: string
  shell?: string
  logLevel?: LogLevel
  server?: ServerConfig
  command?: {
    [key: string]: {
      template: string
      description?: string
      agent?: string
      model?: string
      variant?: string
      subtask?: boolean
    }
  }
  skills?: {
    paths?: Array<string>
    urls?: Array<string>
  }
  maestro?: ConfigMaestro
  references?: {
    [key: string]: string | ConfigV2ReferenceGit | ConfigV2ReferenceLocal
  }
  reference?: {
    [key: string]: string | ConfigV2ReferenceGit | ConfigV2ReferenceLocal
  }
  watcher?: {
    ignore?: Array<string>
  }
  snapshot?: boolean
  plugin?: Array<
    | string
    | [
        string,
        {
          [key: string]: unknown
        },
      ]
  >
  /**
   * Automatically update to the latest version. Set to true to auto-update, false to disable, or 'notify' to show update notifications
   */
  autoupdate?: boolean | "notify"
  disabled_providers?: Array<string>
  enabled_providers?: Array<string>
  model?: string
  small_model?: string
  default_agent?: string
  subagent_depth?: number
  username?: string
  mode?: {
    [key: string]: AgentConfig
  }
  agent?: {
    maestro?: AgentConfig
    general?: AgentConfig
    explore?: AgentConfig
    title?: AgentConfig
    summary?: AgentConfig
    compaction?: AgentConfig
    [key: string]: AgentConfig | undefined
  }
  provider?: {
    [key: string]: ProviderConfig
  }
  mcp?: {
    [key: string]:
      | McpLocalConfig
      | McpRemoteConfig
      | {
          enabled: boolean
        }
  }
  /**
   * Enable or configure formatters. Omit or set to false to disable, true to enable built-ins, or an object to enable built-ins with overrides.
   */
  formatter?:
    | boolean
    | {
        [key: string]: {
          disabled?: boolean
          command?: Array<string>
          environment?: {
            [key: string]: string
          }
          extensions?: Array<string>
        }
      }
  /**
   * Enable or configure LSP servers. Omit or set to false to disable, true to enable built-ins, or an object to enable built-ins with overrides.
   */
  lsp?:
    | boolean
    | {
        [key: string]:
          | {
              disabled: true
            }
          | {
              command: Array<string>
              extensions?: Array<string>
              disabled?: boolean
              env?: {
                [key: string]: string
              }
              initialization?: {
                [key: string]: unknown
              }
            }
      }
  instructions?: Array<string>
  layout?: LayoutConfig
  permission?: PermissionConfig
  tools?: {
    [key: string]: boolean
  }
  attachment?: AttachmentConfig
  tool_output?: {
    max_lines?: number
    max_bytes?: number
    lean?: {
      enabled?: boolean
    }
  }
  research?: {
    limits?: {
      indexer_bytes?: number
      probe_bytes?: number
      scratch_bytes?: number
      index_bytes?: number
    }
  }
  compaction?: {
    auto?: boolean
    prune?: boolean
    tail_turns?: number
    preserve_recent_tokens?: number
    reserved?: number
  }
  continuity?: {
    enabled?: boolean
    trigger?: number
  }
  relay?: ConfigV2Relay
  experimental?: {
    disable_paste_summary?: boolean
    batch_tool?: boolean
    openTelemetry?: boolean
    primary_tools?: Array<string>
    continue_loop_on_deny?: boolean
    mcp_timeout?: number
    policies?: Array<ConfigV2ExperimentalPolicy>
  }
}

export type ConfigMaestro = {
  atlas?: {
    projectID: string
    directory: string
    sourceDirectory?: string
  }
}

export type ConfigV2ExperimentalPolicy = {
  action: "provider.use"
  effect: PolicyEffect
  resource: string
}

export type ConfigV2ReferenceGit = {
  repository: string
  branch?: string
  description?: string
  hidden?: boolean
}

export type ConfigV2ReferenceLocal = {
  path: string
  description?: string
  hidden?: boolean
}

export type ConfigV2Relay = {
  judge?: ConfigV2RelayJudge
}

export type ConfigV2RelayJudge = {
  backend?: "stub" | "api"
  model?: string
  baseURL?: string
  apiKey?: string
  votes?: number
  maxContext?: number
  maxTokens?: number
}

export type Event =
  | EventModelsDevRefreshed
  | EventIntegrationUpdated
  | EventIntegrationConnectionUpdated
  | EventCatalogUpdated
  | EventSessionNextCreated
  | EventSessionNextRenamed
  | EventSessionNextDeleted
  | EventSessionNextAgentSwitched
  | EventSessionNextModelSwitched
  | EventSessionNextSubagentModelsChanged
  | EventSessionNextArchiveChanged
  | EventSessionNextMoved
  | EventSessionNextPrompted
  | EventSessionNextPromptAdmitted
  | EventSessionNextContextUpdated
  | EventSessionNextSynthetic
  | EventSessionNextShellStarted
  | EventSessionNextShellEnded
  | EventSessionNextStepStarted
  | EventSessionNextStepEnded
  | EventSessionNextStepFailed
  | EventSessionNextTextStarted
  | EventSessionNextTextDelta
  | EventSessionNextTextEnded
  | EventSessionNextReasoningStarted
  | EventSessionNextReasoningDelta
  | EventSessionNextReasoningEnded
  | EventSessionNextToolInputStarted
  | EventSessionNextToolInputDelta
  | EventSessionNextToolInputEnded
  | EventSessionNextToolCalled
  | EventSessionNextToolProgress
  | EventSessionNextToolSuccess
  | EventSessionNextToolFailed
  | EventSessionNextRetried
  | EventSessionNextCompactionStarted
  | EventSessionNextCompactionDelta
  | EventSessionNextCompactionEnded
  | EventSessionNextRevertStaged
  | EventSessionNextRevertCleared
  | EventSessionNextRevertCommitted
  | EventMaestroApprovalPresented
  | EventMaestroApprovalDecided
  | EventMaestroApprovalConsumed
  | EventMaestroApprovalReserved
  | EventMaestroAdmissionDecided
  | EventMaestroPlanRevisionRecorded
  | EventMaestroContextRecorded
  | EventMaestroClarificationDecided
  | EventMaestroScopeDecided
  | EventMaestroHeldEntered
  | EventMaestroValidationRecorded
  | EventMaestroReviewReceived
  | EventMaestroAuthorizationGranted
  | EventMaestroDispatchReserved
  | EventMaestroTaskBound
  | EventMaestroTaskWorkflowBound
  | EventMaestroWorkResultDecided
  | EventFileEdited
  | EventReferenceUpdated
  | EventPermissionV2Asked
  | EventPermissionV2Replied
  | EventPluginAdded
  | EventProjectDirectoriesUpdated
  | EventFileWatcherUpdated
  | EventPtyCreated
  | EventPtyUpdated
  | EventPtyExited
  | EventPtyDeleted
  | EventQuestionV2Asked
  | EventQuestionV2Replied
  | EventQuestionV2Rejected
  | EventRelayHookDecided
  | EventTodoUpdated
  | EventVcsBranchUpdated
  | EventServerConnected

export type EventCatalogUpdated = {
  id: string
  type: "catalog.updated"
  properties: {
    [key: string]: unknown
  }
}

export type EventFileEdited = {
  id: string
  type: "file.edited"
  properties: {
    file: string
  }
}

export type EventFileWatcherUpdated = {
  id: string
  type: "file.watcher.updated"
  properties: {
    file: string
    event: "add" | "change" | "unlink"
  }
}

export type EventIntegrationConnectionUpdated = {
  id: string
  type: "integration.connection.updated"
  properties: {
    integrationID: string
  }
}

export type EventIntegrationUpdated = {
  id: string
  type: "integration.updated"
  properties: {
    [key: string]: unknown
  }
}

export type EventMaestroAdmissionDecided = {
  id: string
  type: "maestro.admission.decided"
  properties: {
    sessionID: string
    messageID: string
    methodVersion: string
    outcome: "ORIENT" | "CLARIFY" | "READY_TO_DRAFT"
    reason?: "invalid-assessment" | "missing-usable-goal" | "material-blocker" | "active-work-conflict"
    assessment?: {
      kind: "orient" | "work"
      goal?: string
      known: Array<{
        text: string
        source: "stakeholder" | "orientation"
      }>
      proposals: Array<{
        text: string
        source: "maestro"
      }>
      unknowns: Array<string>
      uncertainty: string
      activeWorkEffect: "none" | "new-scope-or-revision"
      reason: string
    }
  }
}

export type EventMaestroApprovalConsumed = {
  id: string
  type: "maestro.approval.consumed"
  properties: {
    sessionID: string
    presentationID: string
    approvalMessageID: string
    taskHash: string
    callID: string
    childSessionID: string
  }
}

export type EventMaestroApprovalDecided = {
  id: string
  type: "maestro.approval.decided"
  properties: {
    sessionID: string
    projectID: string
    memberID: string
    presentationID: string
    presentationMessageID: string
    approvalMessageID: string
    planRevisionID: string
    validationRecordID: string
    revisionHash: string
    validationHash: string
    contextHash: string
    policyHash: string
    taskHash: string
    methodVersion: string
    outcome: "APPROVED" | "DECLINED"
    decisionTime: number
  }
}

export type EventMaestroApprovalPresented = {
  id: string
  type: "maestro.approval.presented"
  properties: {
    id: string
    sessionID: string
    assistantMessageID: string
    callID: string
    planRevisionID: string
    validationRecordID: string
    projectID: string
    memberID: string
    revisionHash: string
    validationHash: string
    contextHash: string
    policyHash: string
    taskHash: string
    intent: {
      subagentType: string
      prompt: string
      model?: string
      taskID?: string
    }
    methodVersion: string
    plan: string
    provenance: string
    assumptions: Array<string>
    validationLedger: string
    contextState: "CURRENT"
  }
}

export type EventMaestroApprovalReserved = {
  id: string
  type: "maestro.approval.reserved"
  properties: {
    sessionID: string
    presentationID: string
    approvalMessageID: string
    projectID: string
    memberID: string
    planRevisionID: string
    validationRecordID: string
    revisionHash: string
    validationHash: string
    contextHash: string
    policyHash: string
    taskHash: string
    callID: string
    childSessionID: string
    parentSessionID: string
    agent: string
    permission: Array<{
      permission: string
      pattern: string
      action: "allow" | "deny" | "ask"
    }>
  }
}

export type EventMaestroAuthorizationGranted = {
  id: string
  type: "maestro.authorization.granted"
  properties: {
    sessionID: string
    projectID: string
    approvalMessageID: string
    validationRecordID: string
    workCardHash: string
    routedMemberID: string
    rosterHash: string
    grantHash: string
    reviewPolicyHash: string
    actor: {
      version: "rfc8785-v1"
      bytes: string
      sha256: string
    }
    reviewerID: "lucy"
    taskIntentHash: string
    methodVersion: string
  }
}

export type EventMaestroClarificationDecided = {
  id: string
  type: "maestro.clarification.decided"
  properties: {
    sessionID: string
    projectID: string
    mode: "maestro"
    predecessorID: string
    methodVersion: string
    decision: string
    question: string
  }
}

export type EventMaestroContextRecorded = {
  id: string
  type: "maestro.context.recorded"
  properties: {
    id: string
    sessionID: string
    planRevisionID: string
    projectID: string
    directory: string
    mode: "GROUNDED"
    branch: string
    headSHA: string
    changedPaths: Array<string>
    currentEvidenceIdentityHash: string
    contextHash: string
    status: "CURRENT"
    createdAt: number
    planRevisionHash: string
    sourceIdentityHash: string
    toolPlan: MaestroContextToolPlan
    skills: Array<MaestroLoadedOwnSkill>
  }
}

export type EventMaestroDispatchReserved = {
  id: string
  type: "maestro.dispatch.reserved"
  properties: {
    sessionID: string
    authorizationID: string
    childSessionID: string
    projectID: string
    routedMemberID: string
    taskIntentHash: string
    permission: Array<{
      permission: string
      pattern: string
      action: "allow" | "deny" | "ask"
    }>
  }
}

export type EventMaestroHeldEntered = {
  id: string
  type: "maestro.held.entered"
  properties: {
    sessionID: string
    projectID: string
    mode: "maestro"
    predecessorID: string
    reason: string
  }
}

export type EventMaestroPlanRevisionRecorded = {
  id: string
  type: "maestro.plan_revision.recorded"
  properties: {
    id: string
    sessionID: string
    admissionMessageID: string
    methodVersion: string
    revision: "v3"
    goal: {
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }
    acceptance: Array<{
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }>
    scope: Array<{
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }>
    constraints: Array<{
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }>
    reviewRequirement: {
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }
    contextRequirement: "PENDING"
    assumptions: Array<{
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }>
    risks: Array<{
      value: string
      source: "stakeholder" | "maestro" | "orientation" | "upstream"
    }>
    status: "PROPOSED"
    revisionHash: string
    createdAt: number
    workflowBinding?: RelayArmWorkflowDefinition
    upstreamAttribution?: MaestroUpstreamAttributionV1 | MaestroUpstreamAttributionV2
    grounding?: MaestroGrounding
  }
}

export type EventMaestroReviewReceived = {
  id: string
  type: "maestro.review.received"
  properties: {
    sessionID: string
    projectID: string
    validationRecordID: string
    workCardHash: string
    routedMemberID: string
    rosterHash: string
    grantHash: string
    reviewPolicyHash: string
    actor: {
      version: "rfc8785-v1"
      bytes: string
      sha256: string
    }
    reviewerID: "lucy"
    reviewMethodVersion: string
    artifact: {
      workCardHash: string
      sha256: string
      baseSHA: string
      headSHA: string
      worktree: string
      changedPaths: Array<string>
    }
    verdict: "APPROVE" | "FIX_FIRST" | "REJECT"
    findings: Array<{
      path: string
      line: number
      message: string
    }>
    stage?: "plan" | "code"
  }
}

export type EventMaestroScopeDecided = {
  id: string
  type: "maestro.scope.decided"
  properties: {
    sessionID: string
    projectID: string
    mode: "maestro"
    predecessorID: string
    methodVersion: string
    scopeID: string
  }
}

export type EventMaestroTaskBound = {
  id: string
  type: "maestro.task.bound"
  properties: {
    taskId: string
    projectID: string
    memberID: string
    executionSessionID: string
    authoritySessionID: string
    source: "host" | "user" | "dispatch" | "governed"
  }
}

export type EventMaestroTaskWorkflowBound = {
  id: string
  type: "maestro.task.workflow_bound"
  properties: {
    executionSessionID: string
    authorityMessageID: string
    authorityCallID: string
    token: string
    binding: RelayArmWorkflowBinding
  }
}

export type EventMaestroValidationRecorded = {
  id: string
  type: "maestro.validation.recorded"
  properties: {
    sessionID: string
    planRevisionID: string
    contextRecordID: string
    contextHash: string
    reviewBaseSHA: string
    projectID: string
    workCardID: string
    workCard: string
    workCardHash: string
    routedMemberID: string
    rosterHash: string
    grantHash: string
    reviewPolicyHash: string
    actor: {
      version: "rfc8785-v1"
      bytes: string
      sha256: string
    }
    validatorID: "maestro"
    validatorVersion: string
    checks: Array<{
      id: string
      status: "PASS" | "FAIL" | "HOLD"
      detail: string
    }>
    outcome: "VALID" | "INVALID" | "HOLD"
  }
}

export type EventMaestroWorkResultDecided = {
  id: string
  type: "maestro.work_result.decided"
  properties: {
    projectID: string
    memberID: "backend"
    taskId: string
    authoritySessionID: string
    executionSessionID: string
    resultRef: {
      parentSessionID: string
      messageID: string
      partID: string
      callID: string
    }
    workResultHash: string
    decision: "accepted" | "rejected"
    verificationState: "not-host-verified" | "host-verified" | "host-failed" | "host-incomplete"
    terminalReason: "ended" | "blocked" | "failed" | "interrupted"
    reason?: string
  }
}

export type EventModelsDevRefreshed = {
  id: string
  type: "models-dev.refreshed"
  properties: {
    [key: string]: unknown
  }
}

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

export type EventPluginAdded = {
  id: string
  type: "plugin.added"
  properties: {
    id: string
  }
}

export type EventProjectDirectoriesUpdated = {
  id: string
  type: "project.directories.updated"
  properties: {
    projectID: string
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

export type EventReferenceUpdated = {
  id: string
  type: "reference.updated"
  properties: {
    [key: string]: unknown
  }
}

export type EventRelayHookDecided = {
  id: string
  type: "relay.hook.decided"
  properties: {
    decisionID: string
    installID: string
    version: string
    sha256: string
    nodeID: string
    action: "remind" | "block" | "approve" | "verify" | "repair" | "record" | "allow"
    trigger: string
    tool?: string
    sessionID: string
    callID?: string
    assistantMessageID?: string
    messageID?: string
    agent?: string
    subject: string
    outcome:
      | "blocked"
      | "approved"
      | "rejected"
      | "cancelled"
      | "passed"
      | "failed"
      | "unavailable"
      | "repair-required"
      | "reminded"
      | "recorded"
      | "allowed"
    replier?: string
    durationMs: number
  }
}

export type EventServerConnected = {
  id: string
  type: "server.connected"
  properties: {
    [key: string]: unknown
  }
}

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

export type EventTodoUpdated = {
  id: string
  type: "todo.updated"
  properties: {
    sessionID: string
    todos: Array<Todo>
  }
}

export type EventVcsBranchUpdated = {
  id: string
  type: "vcs.branch.updated"
  properties: {
    branch?: string
  }
}

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
export type MaestroContextToolPlan = {
  version: "context-tool-plan-v1"
  actor: {
    projectId: string
    sessionId: string
    memberId: string
  }
  actorBytes: string
  planRevision: {
    id: string
    hash: string
  }
  catalogVersion: string
  headSnapshot: string
  sourceRevision: string
  territories: Array<string>
  actions: Array<{
    unit: string
    skillName: string
    operation: "load-skill"
    path: string
    contentHash: string
    receiptHash: string
  }>
  pointers: Array<{
    unit: string
    drillUnits: Array<string>
    manifest: Array<{
      kind: "pack" | "memory" | "knowledge" | "drill"
      name: string
      digest: string
      pull: string
      hits: number
    }>
    pullReachable: Array<string>
  }>
  hash: string
}

export type MaestroGrounding = {
  catalogVersion: string
  snapshot: string
  sourceRevision: string
  sourceIdentityHash: string
  units: Array<string>
}

export type MaestroLoadedOwnSkill = {
  unit: string
  name: string
  content: string
  contentHash: string
  receiptHash: string
}

export type MaestroUpstreamAttributionClaudeCodeAgentDispatch = {
  kind: "claude-code-agent"
  tool: "Agent" | "Task"
  subagentType: "orchestra:archie"
  executor: "claude-code-host"
  agentID: string
  grantID: string
}

export type MaestroUpstreamAttributionOrchestraTaskDispatch = {
  kind: "orchestra-task"
}

export type MaestroUpstreamAttributionV1 = {
  schema: "maestro-upstream-attribution-v1"
  projectID: string
  memberID: string
  profile: "upstream"
  authorSessionID: string
  authorMessageID: string
  parentSessionID: string
  parentMessageID: string
  parentCallID: string
  logicalTaskID: string
}

export type MaestroUpstreamAttributionV2 = {
  schema: "maestro-upstream-attribution-v2"
  projectID: string
  memberID: string
  profile: "upstream"
  authorSessionID: string
  authorMessageID: string
  parentSessionID: string
  parentMessageID: string
  parentCallID: string
  logicalTaskID: string
  dispatch: MaestroUpstreamAttributionOrchestraTaskDispatch | MaestroUpstreamAttributionClaudeCodeAgentDispatch
}

export type McpListInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type McpListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<McpServer>
}
export type McpLocalConfig = {
  /**
   * Type of MCP server connection
   */
  type: "local"
  /**
   * Command and arguments to run the MCP server
   */
  command: Array<string>
  cwd?: string
  environment?: {
    [key: string]: string
  }
  enabled?: boolean
  timeout?: number
}

export type McpOAuthConfig = {
  clientId?: string
  clientSecret?: string
  scope?: string
  callbackPort?: number
  redirectUri?: string
}

export type McpRemoteConfig = {
  /**
   * Type of MCP server connection
   */
  type: "remote"
  /**
   * URL of the remote MCP server
   */
  url: string
  enabled?: boolean
  headers?: {
    [key: string]: string
  }
  /**
   * OAuth authentication configuration for the MCP server. Set to false to disable OAuth auto-detection.
   */
  oauth?: McpOAuthConfig | false
  timeout?: number
}

/**
 * @deprecated Always uses stretch layout.
 */
export type McpResource = {
  server: string
  name: string
  uri: string
  description?: string
  mimeType?: string
}
export type McpResourceCatalog = {
  resources: Array<McpResource>
  templates: Array<McpResourceTemplate>
}
export type McpResourceCatalogInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type McpResourceCatalogOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: McpResourceCatalog
}
export type McpResourceTemplate = {
  server: string
  name: string
  uriTemplate: string
  description?: string
  mimeType?: string
}
export type McpServer = {
  name: string
  status:
    | McpStatusConnected
    | McpStatusPending
    | McpStatusDisabled
    | McpStatusFailed
    | McpStatusNeedsAuth
    | McpStatusNeedsClientRegistration
  integrationID?: string
}
export type McpStatusConnected = {
  status: "connected"
}
export type McpStatusDisabled = {
  status: "disabled"
}
export type McpStatusFailed = {
  status: "failed"
  error: string
}
export type McpStatusNeedsAuth = {
  status: "needs_auth"
}
export type McpStatusNeedsClientRegistration = {
  status: "needs_client_registration"
  error: string
}
export type McpStatusPending = {
  status: "pending"
}
export type Model = {
  id: string
  providerID: string
  api: {
    id: string
    url: string
    npm: string
  }
  name: string
  family?: string
  capabilities: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
    input: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    output: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    interleaved:
      | boolean
      | {
          field: "reasoning" | "reasoning_content" | "reasoning_text" | string
        }
  }
  cost: {
    input: number
    output: number
    cache: {
      read: number
      write: number
    }
    tiers?: Array<{
      input: number
      output: number
      cache: {
        read: number
        write: number
      }
      tier: {
        type: "context"
        size: number
      }
    }>
    experimentalOver200K?: {
      input: number
      output: number
      cache: {
        read: number
        write: number
      }
    }
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  status: "alpha" | "beta" | "deprecated" | "active"
  options: {
    [key: string]: unknown
  }
  headers: {
    [key: string]: string
  }
  release_date: string
  variants?: {
    [key: string]: {
      [key: string]: unknown
    }
  }
}

export type ModelCapabilities = {
  tools: boolean
  input: Array<string>
  output: Array<string>
}
export type ModelCompatibility = {
  reasoningField?: ModelReasoningField
}
export type ModelCost = {
  tier?: {
    type: "context"
    size: number
  }
  input: MoneyUSDPerMillionTokens
  output: MoneyUSDPerMillionTokens
  cache: {
    read: MoneyUSDPerMillionTokens
    write: MoneyUSDPerMillionTokens
  }
}
export type ModelDefaultOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: ModelInfo | null
}
export type ModelInfo = {
  id: string
  modelID: string
  providerID: string
  family?: string
  name: string
  compatibility?: ModelCompatibility
  package?: string
  settings?: {
    [x: string]: JsonValue
  }
  headers?: {
    [x: string]: string
  }
  body?: {
    [x: string]: JsonValue
  }
  capabilities: ModelCapabilities
  variants: Array<ModelVariant>
  time: {
    released: number
  }
  cost: Array<ModelCost>
  status: "alpha" | "beta" | "deprecated" | "active"
  enabled: boolean
  limit: {
    context: number
    input?: number
    output: number
  }
}
export type ModelListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<ModelInfo>
}
export type ModelReasoningField = "reasoning" | "reasoning_content" | "reasoning_text" | (string & {})
export type ModelRef = {
  id: string
  providerID: string
  variant?: string
}

export type ModelVariant = {
  id: string
  settings?: {
    [x: string]: JsonValue
  }
  headers?: {
    [x: string]: string
  }
  body?: {
    [x: string]: JsonValue
  }
}
export type MoneyUSDPerMillionTokens = number
export type OAuth = {
  type: "oauth"
  refresh: string
  access: string
  expires: number
  accountId?: string
  enterpriseUrl?: string
}

export type Path = {
  home: string
  state: string
  config: string
  worktree: string
  directory: string
}

export type PermissionAction = "allow" | "deny" | "ask"

export type PermissionActionConfig = "ask" | "allow" | "deny"

export type PermissionConfig =
  | PermissionActionConfig
  | {
      read?: PermissionRuleConfig
      edit?: PermissionRuleConfig
      glob?: PermissionRuleConfig
      grep?: PermissionRuleConfig
      list?: PermissionRuleConfig
      bash?: PermissionRuleConfig
      task?: PermissionRuleConfig
      external_directory?: PermissionRuleConfig
      todowrite?: PermissionActionConfig
      question?: PermissionActionConfig
      webfetch?: PermissionActionConfig
      websearch?: PermissionActionConfig
      lsp?: PermissionRuleConfig
      doom_loop?: PermissionActionConfig
      skill?: PermissionRuleConfig
      [key: string]: PermissionRuleConfig | PermissionActionConfig | undefined
    }

export type PermissionObjectConfig = {
  [key: string]: PermissionActionConfig
}

export type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}

export type PermissionRuleConfig = PermissionActionConfig | PermissionObjectConfig

export type PermissionRuleset = Array<PermissionRule>

export type PermissionV2Effect = "allow" | "deny" | "ask"
export type PermissionV2Reply = "once" | "always" | "reject"

export type PermissionV2Rule = {
  action: string
  resource: string
  effect: PermissionV2Effect
}
export type PermissionV2Ruleset = Array<PermissionV2Rule>
export type PermissionV2Source = {
  type: "tool"
  messageID: string
  callID: string
}

export type PolicyEffect = "allow" | "deny"

export type ProjectCurrent = {
  id: string
  directory: string
}
export type ProjectCurrentInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type ProjectCurrentOutput = ProjectCurrent

export type Prompt = {
  text: string
  files?: Array<PromptFileAttachment>
  agents?: Array<PromptAgentAttachment>
}

export type PromptAgentAttachment = {
  name: string
  source?: PromptSource
}

export type PromptContextInfo = {
  reminders: Array<string>
}

export type PromptFileAttachment = {
  uri: string
  mime: string
  name?: string
  description?: string
  source?: PromptSource
}

export type PromptSource = {
  start: number
  end: number
  text: string
}

export type Provider = {
  id: string
  name: string
  source: "env" | "config" | "custom" | "api"
  env: Array<string>
  key?: string
  options: {
    [key: string]: unknown
  }
  models: {
    [key: string]: Model
  }
}

export type ProviderAuthMethod = {
  type: "oauth" | "api"
  label: string
  prompts?: Array<
    | {
        type: "text"
        key: string
        message: string
        placeholder?: string
        when?: {
          key: string
          op: "eq" | "neq"
          value: string
        }
      }
    | {
        type: "select"
        key: string
        message: string
        options: Array<{
          label: string
          value: string
          hint?: string
        }>
        when?: {
          key: string
          op: "eq" | "neq"
          value: string
        }
      }
  >
}

export type ProviderAuthResponse = ProviderAuthResponses[keyof ProviderAuthResponses]

export type ProviderAuthResponses = {
  /**
   * Provider auth methods
   */
  200: {
    [key: string]: Array<ProviderAuthMethod>
  }
}

export type ProviderConfig = {
  api?: string
  name?: string
  env?: Array<string>
  id?: string
  npm?: string
  whitelist?: Array<string>
  blacklist?: Array<string>
  options?: {
    apiKey?: string
    baseURL?: string
    enterpriseUrl?: string
    setCacheKey?: boolean
    /**
     * Timeout in milliseconds for full requests to this provider. Set to false to disable timeout.
     */
    timeout?: number | false
    /**
     * Timeout in milliseconds to wait for response headers (default: 300000). Set to false to disable timeout.
     */
    headerTimeout?: number | false
    /**
     * Timeout in milliseconds between streamed SSE chunks for this provider (default: 300000). If no chunk arrives within this window, the request is aborted. Set to false to disable timeout.
     */
    chunkTimeout?: number | false
    [key: string]: unknown | string | boolean | number | false | number | false | number | false | undefined
  }
  models?: {
    [key: string]: {
      id?: string
      name?: string
      family?: string
      release_date?: string
      attachment?: boolean
      reasoning?: boolean
      temperature?: boolean
      tool_call?: boolean
      interleaved?:
        | boolean
        | "reasoning"
        | "reasoning_content"
        | "reasoning_text"
        | string
        | {
            field: "reasoning" | "reasoning_content" | "reasoning_text" | string
          }
      cost?: {
        input: number
        output: number
        cache_read?: number
        cache_write?: number
        context_over_200k?: {
          input: number
          output: number
          cache_read?: number
          cache_write?: number
        }
      }
      limit?: {
        context: number
        input?: number
        output: number
      }
      modalities?: {
        input?: Array<"text" | "audio" | "image" | "video" | "pdf">
        output?: Array<"text" | "audio" | "image" | "video" | "pdf">
      }
      experimental?: boolean
      status?: "alpha" | "beta" | "deprecated" | "active"
      provider?: {
        npm?: string
        api?: string
      }
      options?: {
        [key: string]: unknown
      }
      headers?: {
        [key: string]: string
      }
      /**
       * Variant-specific configuration
       */
      variants?: {
        [key: string]: {
          disabled?: boolean
          [key: string]: unknown | boolean | undefined
        }
      }
    }
  }
}

export type ProviderListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<ProviderV2Info>
}
export type ProviderListResponse = ProviderListResponses[keyof ProviderListResponses]

export type ProviderListResponses = {
  /**
   * List of providers
   */
  200: {
    all: Array<Provider>
    default: {
      [key: string]: string
    }
    connected: Array<string>
  }
}

export type ProviderRequest = {
  settings: ProviderSettings
  headers: {
    [x: string]: string
  }
  body: {
    [x: string]: JsonValue
  }
}
export type ProviderSettings = {
  [x: string]: JsonValue
}
export type ProviderV2Info = {
  id: string
  integrationID?: string
  name: string
  disabled?: boolean
  package: string
  settings?: {
    [x: string]: JsonValue
  }
  headers?: {
    [x: string]: string
  }
  body?: {
    [x: string]: JsonValue
  }
}
export type Pty = {
  id: string
  title: string
  command: string
  args: Array<string>
  cwd: string
  status: "running" | "exited"
  pid: number
  exitCode?: number
}

export type QuestionOption = {
  /**
   * Display text (1-5 words, concise)
   */
  label: string
  /**
   * Explanation of choice
   */
  description: string
}

export type QuestionV2Answer = Array<string>

export type QuestionV2Info = {
  /**
   * Complete question
   */
  question: string
  /**
   * Very short label (max 30 chars)
   */
  header: string
  /**
   * Available choices
   */
  options: Array<QuestionV2Option>
  multiple?: boolean
  custom?: boolean
}

export type QuestionV2Option = {
  /**
   * Display text (1-5 words, concise)
   */
  label: string
  /**
   * Explanation of choice
   */
  description: string
}

export type QuestionV2Tool = {
  messageID: string
  callID: string
}

export type ReferenceGitSource = {
  type: "git"
  repository: string
  branch?: string
  description?: string
  hidden?: boolean
}
export type ReferenceInfo = {
  name: string
  path: string
  description?: string
  hidden?: boolean
  source: ReferenceSource
}
export type ReferenceListInput = {
  readonly location?: {
    readonly location?:
      | {
          readonly directory?: string | undefined
          readonly workspace?: string | undefined
        }
      | undefined
  }["location"]
}
export type ReferenceListOutput = {
  location: {
    directory: string
    workspaceID?: string
    project: {
      id: string
      directory: string
    }
  }
  data: Array<ReferenceInfo>
}
export type ReferenceLocalSource = {
  type: "local"
  path: string
  description?: string
  hidden?: boolean
}
export type ReferenceSource = ReferenceLocalSource | ReferenceGitSource
export type RelayArmMaterialization = {
  schemaIdentifier: "RelaySprint.Sprint"
  digest: string
  byteLength: number
}

export type RelayArmPublication = {
  projectID: string
  documentID: string
  activeVersionID: string
  immutableVersionBodyChecksum: string
  livePublicationChecksum: string
}

export type RelayArmWorkflowBinding = {
  definition: RelayArmWorkflowDefinition
  planRevisionID: string
  executionSessionID: string
  authoritySessionID: string
  logicalTaskID: string
}

export type RelayArmWorkflowDefinition = {
  publication: RelayArmPublication
  materialization: RelayArmMaterialization
  resolvedSkills: Array<RelayAuthoringSkillBinding>
  parameters: {
    [key: string]: string
  }
  writePaths: Array<string>
  knowledge?: Array<AtlasKnowledgeAnchor>
}

export type RelayAuthoringSkillBinding = {
  wp: string
  skill: string
  sha256: string
  mode: "combine" | "replace"
  content: string
}

export type RevertState = {
  messageID: string
  partID?: string
  snapshot?: string
  diff?: string
  files?: Array<FileDiff>
}

/**
 * Server configuration for orchestra serve and web commands
 */
export type ServerConfig = {
  port?: number
  hostname?: string
  mdns?: boolean
  mdnsDomain?: string
  cors?: Array<string>
}

export type SessionActive = {
  type: "running"
}
export type SessionActiveOutput = {
  data: {
    [x: string]: SessionActive
  }
}["data"]
export type SessionCommandInput = {
  readonly sessionID: {
    readonly sessionID: string
  }["sessionID"]
  readonly id?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["id"]
  readonly command: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["command"]
  readonly arguments?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["arguments"]
  readonly agent?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["agent"]
  readonly model?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["model"]
  readonly files?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["files"]
  readonly agents?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["agents"]
  readonly delivery?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["delivery"]
  readonly resume?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["resume"]
}
export type SessionCommandOutput = {
  data: SessionPendingUser
}["data"]
export type SessionCompactInput = {
  readonly sessionID: {
    readonly sessionID: string
  }["sessionID"]
  readonly id?: {
    readonly id?: string | undefined
  }["id"]
}
export type SessionCompactOutput = {
  data: SessionPendingCompaction
}["data"]
export type SessionErrorUnknown = {
  type: "unknown"
  message: string
}

export type SessionListInput = {
  readonly workspace?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["workspace"]
  readonly limit?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["limit"]
  readonly order?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["order"]
  readonly search?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["search"]
  readonly parentID?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["parentID"]
  readonly directory?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["directory"]
  readonly project?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["project"]
  readonly subpath?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["subpath"]
  readonly cursor?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["cursor"]
}
export type SessionMessageAssistantTool = {
  type: "tool"
  id: string
  name: string
  executed?: boolean
  providerState?: SessionMessageProviderState
  providerResultState?: SessionMessageProviderState
  state:
    | SessionMessageToolStateStreaming
    | SessionMessageToolStateRunning
    | SessionMessageToolStateCompleted
    | SessionMessageToolStateError
  time: {
    created: number
    ran?: number
    completed?: number
  }
}
export type SessionMessageProviderState = {
  [x: string]: JsonValue
}
export type SessionMessageShell = {
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
    completed?: number
  }
  type: "shell"
  shellID: string
  command: string
  status: "running" | "exited" | "timeout" | "killed"
  exit?: number | "Infinity" | "-Infinity" | "NaN"
  output?: {
    output: string
    cursor: number
    size: number
    truncated: boolean
  }
}
export type SessionMessageToolStateCompleted = {
  status: "completed"
  input: {
    [x: string]: JsonValue
  }
  content: [LLMToolContent, ...Array<LLMToolContent>]
  metadata?: {
    [x: string]: JsonValue
  }
}
export type SessionMessageToolStateError = {
  status: "error"
  input: {
    [x: string]: JsonValue
  }
  error: SessionStructuredError
  content?: [LLMToolContent, ...Array<LLMToolContent>]
  metadata?: {
    [x: string]: JsonValue
  }
}
export type SessionMessageToolStateRunning = {
  status: "running"
  input: {
    [x: string]: JsonValue
  }
  metadata: {
    [x: string]: JsonValue
  }
}
export type SessionMessageToolStateStreaming = {
  status: "streaming"
  input: string
}
export type SessionNextRetryError = {
  message: string
  statusCode?: number
  isRetryable: boolean
  responseHeaders?: {
    [key: string]: string
  }
  responseBody?: string
  metadata?: {
    [key: string]: string
  }
}

export type SessionNotFoundError = {
  readonly _tag: "SessionNotFoundError"
  readonly sessionID: string
  readonly message: string
}
export type SessionPendingCompaction = {
  admittedSeq: number
  id: string
  sessionID: string
  timeCreated: number
  type: "compaction"
}
export type SessionPendingMessage = SessionPendingUserMessage | SessionPendingSyntheticMessage
export type SessionPendingSyntheticData1 = {
  text: string
  description?: string
  metadata?: {
    [x: string]: any
  }
}
export type SessionPendingSyntheticMessage = {
  type: "synthetic"
  data: SessionPendingSyntheticData1
  delivery: "steer" | "queue"
}
export type SessionPendingUser = {
  admittedSeq: number
  id: string
  sessionID: string
  timeCreated: number
  type: "user"
  data: SessionPendingUserData
  delivery: "steer" | "queue"
}
export type SessionPendingUserData = {
  text: string
  files?: Array<PromptFileAttachment>
  agents?: Array<PromptAgentAttachment>
  metadata?: {
    [x: string]: JsonValue
  }
}
export type SessionPendingUserData1 = {
  text: string
  files?: Array<PromptFileAttachment>
  agents?: Array<PromptAgentAttachment>
  metadata?: {
    [x: string]: any
  }
}
export type SessionPendingUserMessage = {
  type: "user"
  data: SessionPendingUserData1
  delivery: "steer" | "queue"
}
export type SessionProcess = {
  id: string
  pid: number
  title: string
  started: number
  processes: Array<SessionProcessNode>
  output: string
  written: number
}

export type SessionProcessNode = {
  pid: number
  parentPid?: number
  name?: string
}

export type SessionPromptInput = {
  readonly sessionID: {
    readonly sessionID: string
  }["sessionID"]
  readonly id?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["id"]
  readonly text: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["text"]
  readonly files?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["files"]
  readonly agents?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["agents"]
  readonly metadata?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["metadata"]
  readonly delivery?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["delivery"]
  readonly resume?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["resume"]
}
export type SessionPromptOutput = {
  data: SessionPendingUser
}["data"]
export type SessionShellInput = {
  readonly sessionID: {
    readonly sessionID: string
  }["sessionID"]
  readonly id?: {
    readonly id?: string | undefined
    readonly command: string
  }["id"]
  readonly command: {
    readonly id?: string | undefined
    readonly command: string
  }["command"]
}
export type SessionShellOutput = void
export type SessionStatus =
  | {
      type: "idle"
    }
  | {
      type: "retry"
      attempt: number
      message: string
      action?: {
        reason: string
        provider: string
        title: string
        message: string
        label: string
        link?: string
      }
      next: number
    }
  | {
      type: "busy"
    }

export type SessionStepTokens = {
  input: number
  output: number
  reasoning: number
  cache: {
    read: number
    write: number
  }
}

export type SessionStructuredError = {
  type: string
  message: string
}
export type SessionSubagentModelsPolicy =
  | {
      mode: "inherit"
    }
  | {
      mode: "allowlist"
      models: Array<ModelRef>
    }

export type SessionV2Info = {
  id: string
  parentID?: string
  projectID: string
  agent?: string
  model?: ModelRef
  subagentModels?: SessionSubagentModelsPolicy
  cost: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  time: {
    created: number
    updated: number
    archived?: number
  }
  title: string
  location: LocationRef
  subpath?: string
  revert?: RevertState
}

export type SessionsResponse = {
  data: Array<SessionV2Info>
  cursor: {
    previous?: string
    next?: string
  }
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
