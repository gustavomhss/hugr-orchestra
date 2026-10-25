export type UnauthorizedError = { readonly _tag: "UnauthorizedError"; readonly message: string }

export const isUnauthorizedError = (value: unknown): value is UnauthorizedError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "UnauthorizedError"

export type InvalidRequestError = {
  readonly _tag: "InvalidRequestError"
  readonly message: string
  readonly kind?: string | undefined
  readonly field?: string | undefined
}

export const isInvalidRequestError = (value: unknown): value is InvalidRequestError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "InvalidRequestError"

export type UnknownError = {
  readonly _tag: "UnknownError"
  readonly message: string
  readonly ref?: string | undefined
}

export const isUnknownError = (value: unknown): value is UnknownError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "UnknownError"

export type ConflictError = {
  readonly _tag: "ConflictError"
  readonly message: string
  readonly resource?: string | undefined
}

export const isConflictError = (value: unknown): value is ConflictError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ConflictError"

export type InvalidCursorError = { readonly _tag: "InvalidCursorError"; readonly message: string }

export const isInvalidCursorError = (value: unknown): value is InvalidCursorError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "InvalidCursorError"

export type SessionNotFoundError = {
  readonly _tag: "SessionNotFoundError"
  readonly sessionID: string
  readonly message: string
}

export const isSessionNotFoundError = (value: unknown): value is SessionNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "SessionNotFoundError"

export type ServiceUnavailableError = {
  readonly _tag: "ServiceUnavailableError"
  readonly message: string
  readonly service?: string | undefined
}

export const isServiceUnavailableError = (value: unknown): value is ServiceUnavailableError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ServiceUnavailableError"

export type MessageNotFoundError = {
  readonly _tag: "MessageNotFoundError"
  readonly sessionID: string
  readonly messageID: string
  readonly message: string
}

export const isMessageNotFoundError = (value: unknown): value is MessageNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "MessageNotFoundError"

export type ResearchArtifactNotFoundError = { readonly _tag: "ResearchArtifactNotFoundError"; readonly message: string }

export const isResearchArtifactNotFoundError = (value: unknown): value is ResearchArtifactNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ResearchArtifactNotFoundError"

export type ProviderNotFoundError = {
  readonly _tag: "ProviderNotFoundError"
  readonly providerID: string
  readonly message: string
}

export const isProviderNotFoundError = (value: unknown): value is ProviderNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ProviderNotFoundError"

export type PermissionNotFoundError = {
  readonly _tag: "PermissionNotFoundError"
  readonly requestID: string
  readonly message: string
}

export const isPermissionNotFoundError = (value: unknown): value is PermissionNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "PermissionNotFoundError"

export type McpServerNotFoundError = {
  readonly _tag: "McpServerNotFoundError"
  readonly server: string
  readonly message: string
}

export const isMcpServerNotFoundError = (value: unknown): value is McpServerNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "McpServerNotFoundError"

export type PtyNotFoundError = { readonly _tag: "PtyNotFoundError"; readonly ptyID: string; readonly message: string }

export const isPtyNotFoundError = (value: unknown): value is PtyNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "PtyNotFoundError"

export type QuestionNotFoundError = {
  readonly _tag: "QuestionNotFoundError"
  readonly requestID: string
  readonly message: string
}

export const isQuestionNotFoundError = (value: unknown): value is QuestionNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "QuestionNotFoundError"

export type ProjectCopyError = {
  readonly name: "ProjectCopyError"
  readonly data: { readonly message: string; readonly forceRequired?: boolean | undefined }
}

export const isProjectCopyError = (value: unknown): value is ProjectCopyError =>
  typeof value === "object" && value !== null && "name" in value && value["name"] === "ProjectCopyError"

export type ClaudeCodeLoginError = { readonly _tag: "ClaudeCodeLoginError"; readonly message: string }

export const isClaudeCodeLoginError = (value: unknown): value is ClaudeCodeLoginError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ClaudeCodeLoginError"

export type RelayInvalidError = { readonly _tag: "RelayInvalidError"; readonly code: string; readonly message: string }

export const isRelayInvalidError = (value: unknown): value is RelayInvalidError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "RelayInvalidError"

export type RelayNotFoundError = {
  readonly _tag: "RelayNotFoundError"
  readonly code: string
  readonly message: string
}

export const isRelayNotFoundError = (value: unknown): value is RelayNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "RelayNotFoundError"

export type RelayConflictError = {
  readonly _tag: "RelayConflictError"
  readonly code: string
  readonly message: string
}

export const isRelayConflictError = (value: unknown): value is RelayConflictError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "RelayConflictError"

export type RelayUnavailableError = {
  readonly _tag: "RelayUnavailableError"
  readonly code: string
  readonly message: string
}

export const isRelayUnavailableError = (value: unknown): value is RelayUnavailableError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "RelayUnavailableError"

export type RelayForbiddenError = {
  readonly _tag: "RelayForbiddenError"
  readonly code: string
  readonly message: string
}

export const isRelayForbiddenError = (value: unknown): value is RelayForbiddenError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "RelayForbiddenError"

export type PullRequestError = {
  readonly name: "PullRequestError"
  readonly data: {
    readonly kind: "not_installed" | "not_authenticated" | "no_remote" | "branch_not_pushed" | "cli_failed"
    readonly message: string
    readonly host?: "github" | "gitlab"
    readonly branch?: string
    readonly remote?: string
  }
}

export const isPullRequestError = (value: unknown): value is PullRequestError =>
  typeof value === "object" && value !== null && "name" in value && value["name"] === "PullRequestError"

export type ScheduleNotFoundError = {
  readonly _tag: "ScheduleNotFoundError"
  readonly scheduleID: string
  readonly message: string
}

export const isScheduleNotFoundError = (value: unknown): value is ScheduleNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ScheduleNotFoundError"

export type ScheduleRunError = { readonly _tag: "ScheduleRunError"; readonly message: string }

export const isScheduleRunError = (value: unknown): value is ScheduleRunError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ScheduleRunError"

export type ActionsError = {
  readonly _tag: "ActionsError"
  readonly kind:
    | "binding_missing"
    | "binding_stale"
    | "host_mismatch"
    | "cli_missing"
    | "not_authenticated"
    | "permission_denied"
    | "capability_unavailable"
    | "not_found"
    | "invalid_input"
    | "source_conflict"
    | "source_unresolved"
    | "rate_limited"
    | "metadata_truncated"
    | "transport_failed"
    | "transfer_failed"
    | "outcome_unknown"
    | "operation_missing"
    | "operation_expired"
    | "operation_reused"
    | "intent_conflict"
    | "maintenance_required"
  readonly message: string
  readonly bindingID?: string
  readonly provider?: "github" | "gitlab"
  readonly resourceID?: string
  readonly retryAfter?: number
  readonly operationID?: string
  readonly disposition?: "definitely_unsent" | "definitely_rejected" | "unknown"
}

export const isActionsError = (value: unknown): value is ActionsError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ActionsError"

export type GuardrailError = {
  readonly name: "GuardrailError"
  readonly data: { readonly kind: "no-engine" | "no-bun" | "failed" | "unreadable"; readonly message: string }
}

export const isGuardrailError = (value: unknown): value is GuardrailError =>
  typeof value === "object" && value !== null && "name" in value && value["name"] === "GuardrailError"

export type ForbiddenError = { readonly _tag: "ForbiddenError"; readonly message: string }

export const isForbiddenError = (value: unknown): value is ForbiddenError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ForbiddenError"
