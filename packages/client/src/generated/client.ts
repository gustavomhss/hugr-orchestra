import type { RequestDescriptor } from "./request"
import type {
  HealthGetOutput,
  LocationGetInput,
  LocationGetOutput,
  LocationPathsOutput,
  AgentsListInput,
  AgentsListOutput,
  AgentsGetFileInput,
  AgentsGetFileOutput,
  AgentsUpdateFileInput,
  AgentsUpdateFileOutput,
  SessionsListInput,
  SessionsListOutput,
  SessionsCreateInput,
  SessionsCreateOutput,
  SessionsActiveOutput,
  SessionsGetInput,
  SessionsGetOutput,
  SessionsArchiveInput,
  SessionsArchiveOutput,
  SessionsRenameInput,
  SessionsRenameOutput,
  SessionsRemoveInput,
  SessionsRemoveOutput,
  SessionsGetSubagentModelsInput,
  SessionsGetSubagentModelsOutput,
  SessionsSetSubagentModelsInput,
  SessionsSetSubagentModelsOutput,
  SessionsGetPermissionInput,
  SessionsGetPermissionOutput,
  SessionsSetPermissionInput,
  SessionsSetPermissionOutput,
  SessionsSwitchAgentInput,
  SessionsSwitchAgentOutput,
  SessionsSwitchModelInput,
  SessionsSwitchModelOutput,
  SessionsPromptInput,
  SessionsPromptOutput,
  SessionsCommandInput,
  SessionsCommandOutput,
  SessionsCompactInput,
  SessionsCompactOutput,
  SessionsForkInput,
  SessionsForkOutput,
  SessionsMoveInput,
  SessionsMoveOutput,
  SessionsShellInput,
  SessionsShellOutput,
  SessionsSkillInput,
  SessionsSkillOutput,
  SessionsSyntheticInput,
  SessionsSyntheticOutput,
  SessionsGenerateInput,
  SessionsGenerateOutput,
  SessionsTodoInput,
  SessionsTodoOutput,
  SessionsWaitInput,
  SessionsWaitOutput,
  SessionsDiffInput,
  SessionsDiffOutput,
  SessionsStageInput,
  SessionsStageOutput,
  SessionsClearInput,
  SessionsClearOutput,
  SessionsCommitInput,
  SessionsCommitOutput,
  SessionsContextInput,
  SessionsContextOutput,
  SessionsHistoryInput,
  SessionsHistoryOutput,
  SessionsEventsInput,
  SessionsEventsOutput,
  SessionsInterruptInput,
  SessionsInterruptOutput,
  SessionsMessageInput,
  SessionsMessageOutput,
  SessionsProcessesInput,
  SessionsProcessesOutput,
  SessionsProcessStopInput,
  SessionsProcessStopOutput,
  MessagesListInput,
  MessagesListOutput,
  ModelsListInput,
  ModelsListOutput,
  ModelsDefaultInput,
  ModelsDefaultOutput,
  ProvidersListInput,
  ProvidersListOutput,
  ProvidersGetInput,
  ProvidersGetOutput,
  IntegrationsListInput,
  IntegrationsListOutput,
  IntegrationsGetInput,
  IntegrationsGetOutput,
  IntegrationsConnectKeyInput,
  IntegrationsConnectKeyOutput,
  IntegrationsConnectOauthInput,
  IntegrationsConnectOauthOutput,
  IntegrationsOauthStatusInput,
  IntegrationsOauthStatusOutput,
  IntegrationsOauthCompleteInput,
  IntegrationsOauthCompleteOutput,
  IntegrationsOauthCancelInput,
  IntegrationsOauthCancelOutput,
  IntegrationsAttemptStatusInput,
  IntegrationsAttemptStatusOutput,
  IntegrationsAttemptCompleteInput,
  IntegrationsAttemptCompleteOutput,
  IntegrationsAttemptCancelInput,
  IntegrationsAttemptCancelOutput,
  CredentialsUpdateInput,
  CredentialsUpdateOutput,
  CredentialsRemoveInput,
  CredentialsRemoveOutput,
  PermissionsListRequestsInput,
  PermissionsListRequestsOutput,
  PermissionsListSavedInput,
  PermissionsListSavedOutput,
  PermissionsRemoveSavedInput,
  PermissionsRemoveSavedOutput,
  PermissionsCreateInput,
  PermissionsCreateOutput,
  PermissionsListInput,
  PermissionsListOutput,
  PermissionsGetInput,
  PermissionsGetOutput,
  PermissionsReplyInput,
  PermissionsReplyOutput,
  FilesReadInput,
  FilesReadOutput,
  FilesListInput,
  FilesListOutput,
  FilesFindInput,
  FilesFindOutput,
  VcsGetInput,
  VcsGetOutput,
  VcsStatusInput,
  VcsStatusOutput,
  VcsDiffInput,
  VcsDiffOutput,
  VcsActivityInput,
  VcsActivityOutput,
  VcsSessionActivityInput,
  VcsSessionActivityOutput,
  CommandsListInput,
  CommandsListOutput,
  McpListInput,
  McpListOutput,
  McpResourcesInput,
  McpResourcesOutput,
  McpConfigInput,
  McpConfigOutput,
  McpEntriesInput,
  McpEntriesOutput,
  McpToolsInput,
  McpToolsOutput,
  McpAddInput,
  McpAddOutput,
  McpRemoveInput,
  McpRemoveOutput,
  McpConnectInput,
  McpConnectOutput,
  McpDisconnectInput,
  McpDisconnectOutput,
  McpAuthStartInput,
  McpAuthStartOutput,
  McpAuthCallbackInput,
  McpAuthCallbackOutput,
  McpAuthRemoveInput,
  McpAuthRemoveOutput,
  ServerLspStatusInput,
  ServerLspStatusOutput,
  SkillsListInput,
  SkillsListOutput,
  SkillsSaveInput,
  SkillsSaveOutput,
  SkillsRemoveInput,
  SkillsRemoveOutput,
  BehaviorsSetInput,
  BehaviorsSetOutput,
  EventsSubscribeOutput,
  PtysListInput,
  PtysListOutput,
  PtysCreateInput,
  PtysCreateOutput,
  PtysGetInput,
  PtysGetOutput,
  PtysUpdateInput,
  PtysUpdateOutput,
  PtysRemoveInput,
  PtysRemoveOutput,
  QuestionsListRequestsInput,
  QuestionsListRequestsOutput,
  QuestionsListInput,
  QuestionsListOutput,
  QuestionsReplyInput,
  QuestionsReplyOutput,
  QuestionsRejectInput,
  QuestionsRejectOutput,
  ReferencesListInput,
  ReferencesListOutput,
  ProjectCopiesCreateInput,
  ProjectCopiesCreateOutput,
  ProjectCopiesRemoveInput,
  ProjectCopiesRemoveOutput,
  ProjectCopiesRefreshInput,
  ProjectCopiesRefreshOutput,
  ProjectsListOutput,
  ProjectsDirectoriesInput,
  ProjectsDirectoriesOutput,
  ProjectsUpdateInput,
  ProjectsUpdateOutput,
  ProjectsInitGitInput,
  ProjectsInitGitOutput,
  LeanGetInput,
  LeanGetOutput,
  LeanUpdateInput,
  LeanUpdateOutput,
  LeanHistoryInput,
  LeanHistoryOutput,
  AtlasSnapshotInput,
  AtlasSnapshotOutput,
  AtlasReasoningInput,
  AtlasReasoningOutput,
  AtlasOwnInput,
  AtlasOwnOutput,
  AtlasHealthInput,
  AtlasHealthOutput,
  AtlasPromoteInput,
  AtlasPromoteOutput,
  AtlasDraftInput,
  AtlasDraftOutput,
  AtlasEmitInput,
  AtlasEmitOutput,
  AtlasLinkInput,
  AtlasLinkOutput,
  AtlasVerifyInput,
  AtlasVerifyOutput,
  AtlasReviewInput,
  AtlasReviewOutput,
  AtlasHoldInput,
  AtlasHoldOutput,
  AtlasReleaseInput,
  AtlasReleaseOutput,
  AtlasProposeInput,
  AtlasProposeOutput,
  AtlasDecideInput,
  AtlasDecideOutput,
  AtlasAnswerInput,
  AtlasAnswerOutput,
  AtlasMemoryDecideInput,
  AtlasMemoryDecideOutput,
  AtlasTerritoryInput,
  AtlasTerritoryOutput,
  AtlasDelegateInput,
  AtlasDelegateOutput,
  AtlasInstallInput,
  AtlasInstallOutput,
  AtlasIndexInput,
  AtlasIndexOutput,
  AtlasMineInput,
  AtlasMineOutput,
  ConfigGetOutput,
  ConfigUpdateInput,
  ConfigUpdateOutput,
  ConfigShellsOutput,
  ServerBoardListOutput,
  ServerBoardGetInput,
  ServerBoardGetOutput,
  ServerBoardIssueInput,
  ServerBoardIssueOutput,
  ServerBoardActivityInput,
  ServerBoardActivityOutput,
  ServerBoardAnswerInput,
  ServerBoardAnswerOutput,
  ServerBoardNoteInput,
  ServerBoardNoteOutput,
  ServerBoardAttachInput,
  ServerBoardAttachOutput,
  ServerBoardUndoInput,
  ServerBoardUndoOutput,
  ServerBoardPauseInput,
  ServerBoardPauseOutput,
  ServerBoardResumeInput,
  ServerBoardResumeOutput,
  ServerBoardGithubSyncInput,
  ServerBoardGithubSyncOutput,
  ServerBoardPauseIssueInput,
  ServerBoardPauseIssueOutput,
  ServerBoardResumeIssueInput,
  ServerBoardResumeIssueOutput,
  ServerBoardHoldInput,
  ServerBoardHoldOutput,
  ServerBoardAcceptInput,
  ServerBoardAcceptOutput,
  ServerBoardDeclineInput,
  ServerBoardDeclineOutput,
  ClaudeCodeAccountOutput,
  ClaudeCodeLoginOutput,
  ClaudeCodeLoginCodeInput,
  ClaudeCodeLoginCodeOutput,
  RelayDocumentsListInput,
  RelayDocumentsListOutput,
  RelayDocumentsCreateInput,
  RelayDocumentsCreateOutput,
  RelayDocumentsGetInput,
  RelayDocumentsGetOutput,
  RelayDocumentsUpdateInput,
  RelayDocumentsUpdateOutput,
  RelayDocumentsRemoveInput,
  RelayDocumentsRemoveOutput,
  RelayDocumentsVersionsInput,
  RelayDocumentsVersionsOutput,
  RelayDocumentsVersionInput,
  RelayDocumentsVersionOutput,
  RelayDocumentsSprintInput,
  RelayDocumentsSprintOutput,
  RelayDocumentsDefinitionInput,
  RelayDocumentsDefinitionOutput,
  RelayDocumentsCheckInput,
  RelayDocumentsCheckOutput,
  RelayDocumentsNodeTypesInput,
  RelayDocumentsNodeTypesOutput,
  RelayDocumentsListScopesInput,
  RelayDocumentsListScopesOutput,
  RelayDocumentsCreateScopeInput,
  RelayDocumentsCreateScopeOutput,
  RelayDocumentsUpdateScopeInput,
  RelayDocumentsUpdateScopeOutput,
  RelayDocumentsRemoveScopeInput,
  RelayDocumentsRemoveScopeOutput,
  RelayPublishPublishInput,
  RelayPublishPublishOutput,
  RelayPublishUnpublishInput,
  RelayPublishUnpublishOutput,
  RelayHooksListInput,
  RelayHooksListOutput,
  RelayHooksInstallInput,
  RelayHooksInstallOutput,
  RelayHooksUpdateInput,
  RelayHooksUpdateOutput,
  RelayHooksEnableInput,
  RelayHooksEnableOutput,
  RelayHooksDisableInput,
  RelayHooksDisableOutput,
  RelayHooksOrderInput,
  RelayHooksOrderOutput,
  RelayHooksUninstallInput,
  RelayHooksUninstallOutput,
  RelayHooksDecisionsInput,
  RelayHooksDecisionsOutput,
  RelayHooksRepairInput,
  RelayHooksRepairOutput,
  PullRequestsListInput,
  PullRequestsListOutput,
  PullRequestsCreateInput,
  PullRequestsCreateOutput,
  RelayRunsListInput,
  RelayRunsListOutput,
  RelayRunsGetInput,
  RelayRunsGetOutput,
  RelayRunsAuditInput,
  RelayRunsAuditOutput,
  RelayRunsLedgerInput,
  RelayRunsLedgerOutput,
  GuardrailRulesInput,
  GuardrailRulesOutput,
  GuardrailRunInput,
  GuardrailRunOutput,
  MeetingStartInput,
  MeetingStartOutput,
  MeetingAppendInput,
  MeetingAppendOutput,
  MeetingStopInput,
  MeetingStopOutput,
  MeetingReadInput,
  MeetingReadOutput,
  OperatorInspectInput,
  OperatorInspectOutput,
  ConnectionsConnectInput,
  ConnectionsConnectOutput,
  ConnectionsGetTargetInput,
  ConnectionsGetTargetOutput,
  ConnectionsBindingsInput,
  ConnectionsBindingsOutput,
  ConnectionsListInput,
  ConnectionsListOutput,
  ConnectionsGetInput,
  ConnectionsGetOutput,
  ConnectionsTargetsInput,
  ConnectionsTargetsOutput,
  ConnectionsDisconnectInput,
  ConnectionsDisconnectOutput,
  ConnectionsCreateTargetInput,
  ConnectionsCreateTargetOutput,
  ConnectionsRetargetTargetInput,
  ConnectionsRetargetTargetOutput,
  ConnectionsRemoveTargetInput,
  ConnectionsRemoveTargetOutput,
  ConnectionsBindInput,
  ConnectionsBindOutput,
  ConnectionsUnbindInput,
  ConnectionsUnbindOutput,
  ArtifactsListInput,
  ArtifactsListOutput,
  ArtifactsGetInput,
  ArtifactsGetOutput,
  ArtifactsContentTicketInput,
  ArtifactsContentTicketOutput,
  ArtifactsShareInput,
  ArtifactsShareOutput,
  ArtifactsPinInput,
  ArtifactsPinOutput,
  ArtifactsRemoveReferenceInput,
  ArtifactsRemoveReferenceOutput,
  CapabilitySchedulesListInput,
  CapabilitySchedulesListOutput,
  CapabilitySchedulesPauseInput,
  CapabilitySchedulesPauseOutput,
  CapabilitySchedulesResumeInput,
  CapabilitySchedulesResumeOutput,
  CapabilitySchedulesRunInput,
  CapabilitySchedulesRunOutput,
  CapabilitySchedulesRemoveInput,
  CapabilitySchedulesRemoveOutput,
} from "./types"
import { ClientError } from "./client-error"
import { makeResearch } from "./research"
import { makeSchedules } from "./schedules"
import { makeActionsBindings } from "./actionsBindings"
import { makeActionsOperations } from "./actionsOperations"
import { makeActionsWorkflows } from "./actionsWorkflows"
import { makeActionsRuns } from "./actionsRuns"
import { makeActionsJobs } from "./actionsJobs"
import { makeActionsPipelines } from "./actionsPipelines"
import { makeActionsResources } from "./actionsResources"
import { makeActionsSource } from "./actionsSource"
import { makeActionsTransfers } from "./actionsTransfers"

export interface ClientOptions {
  readonly baseUrl: string
  readonly fetch?: typeof globalThis.fetch
  readonly headers?: HeadersInit
}

export interface RequestOptions {
  readonly signal?: AbortSignal
  readonly headers?: HeadersInit
}

export function make(options: ClientOptions) {
  const fetch = options.fetch ?? globalThis.fetch

  const prepare = (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    const url = new URL(descriptor.path, options.baseUrl)
    for (const [key, value] of Object.entries(descriptor.query ?? {})) appendQuery(url.searchParams, key, value)
    const headers = new Headers(options.headers)
    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {
      if (value !== undefined && value !== null) headers.set(key, String(value))
    }
    for (const [key, value] of new Headers(requestOptions?.headers)) headers.set(key, value)
    if (descriptor.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")
    return {
      url,
      init: {
        method: descriptor.method,
        signal: requestOptions?.signal,
        headers,
        body: descriptor.body === undefined ? undefined : JSON.stringify(descriptor.body),
      } satisfies RequestInit,
    }
  }

  const execute = async (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    try {
      const prepared = prepare(descriptor, requestOptions)
      return await fetch(prepared.url, prepared.init)
    } catch (cause) {
      throw new ClientError("Transport", { cause })
    }
  }

  const responseError = async (response: Response, descriptor: RequestDescriptor): Promise<never> => {
    if (descriptor.declaredStatuses.includes(response.status)) throw await json(response)
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnexpectedStatus", { cause: { status: response.status } })
  }

  const request = async <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): Promise<A> => {
    const response = await execute(descriptor, requestOptions)
    if (response.status !== descriptor.successStatus) return responseError(response, descriptor)
    if (descriptor.empty) {
      try {
        await response.body?.cancel()
      } catch {}
      return undefined as A
    }
    if (descriptor.binary) {
      return new Uint8Array(await response.arrayBuffer()) as A
    }
    return (await json(response)) as A
  }

  const sse = <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): AsyncIterable<A> => ({
    async *[Symbol.asyncIterator]() {
      const response = await execute(descriptor, requestOptions)
      if (response.status !== descriptor.successStatus) await responseError(response, descriptor)
      if (!isContentType(response, "text/event-stream")) {
        try {
          await response.body?.cancel()
        } catch {}
        throw new ClientError("UnsupportedContentType")
      }
      if (response.body === null) throw new ClientError("MalformedResponse")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      try {
        while (true) {
          let next
          try {
            next = await reader.read()
          } catch (cause) {
            throw new ClientError("Transport", { cause })
          }
          buffer += decoder.decode(next.value, { stream: !next.done })
          if (buffer.length > 1_048_576) throw new ClientError("MalformedResponse")
          const trailingCarriageReturn = !next.done && buffer.endsWith("\r")
          if (trailingCarriageReturn) buffer = buffer.slice(0, -1)
          buffer = buffer.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
          if (trailingCarriageReturn) buffer += "\r"
          if (next.done && buffer !== "") buffer += "\n\n"
          let boundary = buffer.indexOf("\n\n")
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const data = block
              .split("\n")
              .flatMap((line) => (line.startsWith("data:") ? [line.slice(5).trimStart()] : []))
              .join("\n")
            if (data !== "") {
              try {
                yield JSON.parse(data) as A
              } catch (cause) {
                throw new ClientError("MalformedResponse", { cause })
              }
            }
            boundary = buffer.indexOf("\n\n")
          }
          if (next.done) return
        }
      } finally {
        try {
          await reader.cancel()
        } catch {}
        reader.releaseLock()
      }
    },
  })

  return {
    health: {
      get: (requestOptions?: RequestOptions) =>
        request<HealthGetOutput>(
          { method: "GET", path: `/api/health`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
          requestOptions,
        ),
    },
    location: {
      get: (input?: LocationGetInput, requestOptions?: RequestOptions) =>
        request<LocationGetOutput>(
          {
            method: "GET",
            path: `/api/location`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      paths: (requestOptions?: RequestOptions) =>
        request<LocationPathsOutput>(
          {
            method: "GET",
            path: `/api/location/paths`,
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    agents: {
      list: (input?: AgentsListInput, requestOptions?: RequestOptions) =>
        request<AgentsListOutput>(
          {
            method: "GET",
            path: `/api/agent`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      getFile: (input: AgentsGetFileInput, requestOptions?: RequestOptions) =>
        request<AgentsGetFileOutput>(
          {
            method: "GET",
            path: `/api/agent/${encodeURIComponent(input.agentID)}/file`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      updateFile: (input: AgentsUpdateFileInput, requestOptions?: RequestOptions) =>
        request<AgentsUpdateFileOutput>(
          {
            method: "PUT",
            path: `/api/agent/${encodeURIComponent(input.agentID)}/file`,
            query: { location: input["location"] },
            body: {
              description: input["description"],
              mode: input["mode"],
              model: input["model"],
              steps: input["steps"],
              system: input["system"],
              permission: input["permission"],
              disable: input["disable"],
              revision: input["revision"],
            },
            successStatus: 200,
            declaredStatuses: [400, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    sessions: {
      list: (input?: SessionsListInput, requestOptions?: RequestOptions) =>
        request<SessionsListOutput>(
          {
            method: "GET",
            path: `/api/session`,
            query: {
              workspace: input?.["workspace"],
              limit: input?.["limit"],
              order: input?.["order"],
              search: input?.["search"],
              includeArchived: input?.["includeArchived"],
              directory: input?.["directory"],
              project: input?.["project"],
              subpath: input?.["subpath"],
              cursor: input?.["cursor"],
            },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      create: (input?: SessionsCreateInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsCreateOutput }>(
          {
            method: "POST",
            path: `/api/session`,
            body: {
              id: input?.["id"],
              agent: input?.["agent"],
              model: input?.["model"],
              location: input?.["location"],
            },
            successStatus: 200,
            declaredStatuses: [404, 401, 400],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      active: (requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsActiveOutput }>(
          {
            method: "GET",
            path: `/api/session/active`,
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      get: (input: SessionsGetInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsGetOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      archive: (input: SessionsArchiveInput, requestOptions?: RequestOptions) =>
        request<SessionsArchiveOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/archive`,
            body: { archived: input["archived"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      rename: (input: SessionsRenameInput, requestOptions?: RequestOptions) =>
        request<SessionsRenameOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/rename`,
            body: { title: input["title"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      remove: (input: SessionsRemoveInput, requestOptions?: RequestOptions) =>
        request<SessionsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/session/${encodeURIComponent(input.sessionID)}`,
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      getSubagentModels: (input: SessionsGetSubagentModelsInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsGetSubagentModelsOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/subagent-models`,
            successStatus: 200,
            declaredStatuses: [404, 503, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      setSubagentModels: (input: SessionsSetSubagentModelsInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsSetSubagentModelsOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/subagent-models`,
            body: { policy: input["policy"] },
            successStatus: 200,
            declaredStatuses: [404, 503, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      getPermission: (input: SessionsGetPermissionInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsGetPermissionOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/permission-rules`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      setPermission: (input: SessionsSetPermissionInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsSetPermissionOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/permission-rules`,
            body: { permission: input["permission"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      switchAgent: (input: SessionsSwitchAgentInput, requestOptions?: RequestOptions) =>
        request<SessionsSwitchAgentOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/agent`,
            body: { agent: input["agent"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      switchModel: (input: SessionsSwitchModelInput, requestOptions?: RequestOptions) =>
        request<SessionsSwitchModelOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/model`,
            body: { model: input["model"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      prompt: (input: SessionsPromptInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsPromptOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/prompt`,
            body: { id: input["id"], prompt: input["prompt"], delivery: input["delivery"], resume: input["resume"] },
            successStatus: 200,
            declaredStatuses: [409, 404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      command: (input: SessionsCommandInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsCommandOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/command`,
            body: {
              id: input["id"],
              command: input["command"],
              arguments: input["arguments"],
              files: input["files"],
              agents: input["agents"],
              delivery: input["delivery"],
              resume: input["resume"],
            },
            successStatus: 200,
            declaredStatuses: [409, 404, 400, 500, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      compact: (input: SessionsCompactInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsCompactOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/compact`,
            successStatus: 200,
            declaredStatuses: [404, 409, 500, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      fork: (input: SessionsForkInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsForkOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/fork`,
            body: { messageID: input["messageID"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      move: (input: SessionsMoveInput, requestOptions?: RequestOptions) =>
        request<SessionsMoveOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/move`,
            body: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [404, 409, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      shell: (input: SessionsShellInput, requestOptions?: RequestOptions) =>
        request<SessionsShellOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/shell`,
            body: { id: input["id"], command: input["command"] },
            successStatus: 204,
            declaredStatuses: [404, 409, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      skill: (input: SessionsSkillInput, requestOptions?: RequestOptions) =>
        request<SessionsSkillOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/skill`,
            body: { skill: input["skill"], resume: input["resume"] },
            successStatus: 204,
            declaredStatuses: [404, 409, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      synthetic: (input: SessionsSyntheticInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsSyntheticOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/synthetic`,
            body: { id: input["id"], text: input["text"], resume: input["resume"] },
            successStatus: 200,
            declaredStatuses: [404, 409, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      generate: (input: SessionsGenerateInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsGenerateOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/generate`,
            body: { prompt: input["prompt"] },
            successStatus: 200,
            declaredStatuses: [404, 500, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      todo: (input: SessionsTodoInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsTodoOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/todo`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      wait: (input: SessionsWaitInput, requestOptions?: RequestOptions) =>
        request<SessionsWaitOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/wait`,
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      diff: (input: SessionsDiffInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsDiffOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/message/${encodeURIComponent(input.messageID)}/diff`,
            successStatus: 200,
            declaredStatuses: [404, 500, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      stage: (input: SessionsStageInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsStageOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/revert/stage`,
            body: { messageID: input["messageID"], files: input["files"] },
            successStatus: 200,
            declaredStatuses: [404, 500, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      clear: (input: SessionsClearInput, requestOptions?: RequestOptions) =>
        request<SessionsClearOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/revert/clear`,
            successStatus: 204,
            declaredStatuses: [404, 500, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      commit: (input: SessionsCommitInput, requestOptions?: RequestOptions) =>
        request<SessionsCommitOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/revert/commit`,
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      context: (input: SessionsContextInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsContextOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/context`,
            successStatus: 200,
            declaredStatuses: [404, 500, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      history: (input: SessionsHistoryInput, requestOptions?: RequestOptions) =>
        request<SessionsHistoryOutput>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/history`,
            query: { limit: input["limit"], after: input["after"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      events: (input: SessionsEventsInput, requestOptions?: RequestOptions): AsyncIterable<SessionsEventsOutput> =>
        sse<SessionsEventsOutput>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/event`,
            query: { after: input["after"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      interrupt: (input: SessionsInterruptInput, requestOptions?: RequestOptions) =>
        request<SessionsInterruptOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/interrupt`,
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      message: (input: SessionsMessageInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsMessageOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/message/${encodeURIComponent(input.messageID)}`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      processes: (input: SessionsProcessesInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsProcessesOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/processes`,
            query: { tail: input["tail"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      processStop: (input: SessionsProcessStopInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: SessionsProcessStopOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/processes/${encodeURIComponent(input.processID)}/stop`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
    },
    research: makeResearch(request, sse),
    messages: {
      list: (input: MessagesListInput, requestOptions?: RequestOptions) =>
        request<MessagesListOutput>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/message`,
            query: { limit: input["limit"], order: input["order"], cursor: input["cursor"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    models: {
      list: (input?: ModelsListInput, requestOptions?: RequestOptions) =>
        request<ModelsListOutput>(
          {
            method: "GET",
            path: `/api/model`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      default: (input?: ModelsDefaultInput, requestOptions?: RequestOptions) =>
        request<ModelsDefaultOutput>(
          {
            method: "GET",
            path: `/api/model/default`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    providers: {
      list: (input?: ProvidersListInput, requestOptions?: RequestOptions) =>
        request<ProvidersListOutput>(
          {
            method: "GET",
            path: `/api/provider`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: ProvidersGetInput, requestOptions?: RequestOptions) =>
        request<ProvidersGetOutput>(
          {
            method: "GET",
            path: `/api/provider/${encodeURIComponent(input.providerID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [404, 503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    integrations: {
      list: (input?: IntegrationsListInput, requestOptions?: RequestOptions) =>
        request<IntegrationsListOutput>(
          {
            method: "GET",
            path: `/api/integration`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: IntegrationsGetInput, requestOptions?: RequestOptions) =>
        request<IntegrationsGetOutput>(
          {
            method: "GET",
            path: `/api/integration/${encodeURIComponent(input.integrationID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      connectKey: (input: IntegrationsConnectKeyInput, requestOptions?: RequestOptions) =>
        request<IntegrationsConnectKeyOutput>(
          {
            method: "POST",
            path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/key`,
            query: { location: input["location"] },
            body: { key: input["key"], label: input["label"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      connectOauth: (input: IntegrationsConnectOauthInput, requestOptions?: RequestOptions) =>
        request<IntegrationsConnectOauthOutput>(
          {
            method: "POST",
            path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth`,
            query: { location: input["location"] },
            body: { methodID: input["methodID"], inputs: input["inputs"], label: input["label"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      oauthStatus: (input: IntegrationsOauthStatusInput, requestOptions?: RequestOptions) =>
        request<IntegrationsOauthStatusOutput>(
          {
            method: "GET",
            path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      oauthComplete: (input: IntegrationsOauthCompleteInput, requestOptions?: RequestOptions) =>
        request<IntegrationsOauthCompleteOutput>(
          {
            method: "POST",
            path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}/complete`,
            query: { location: input["location"] },
            body: { code: input["code"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      oauthCancel: (input: IntegrationsOauthCancelInput, requestOptions?: RequestOptions) =>
        request<IntegrationsOauthCancelOutput>(
          {
            method: "DELETE",
            path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      attemptStatus: (input: IntegrationsAttemptStatusInput, requestOptions?: RequestOptions) =>
        request<IntegrationsAttemptStatusOutput>(
          {
            method: "GET",
            path: `/api/integration/attempt/${encodeURIComponent(input.attemptID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      attemptComplete: (input: IntegrationsAttemptCompleteInput, requestOptions?: RequestOptions) =>
        request<IntegrationsAttemptCompleteOutput>(
          {
            method: "POST",
            path: `/api/integration/attempt/${encodeURIComponent(input.attemptID)}/complete`,
            query: { location: input["location"] },
            body: { code: input["code"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      attemptCancel: (input: IntegrationsAttemptCancelInput, requestOptions?: RequestOptions) =>
        request<IntegrationsAttemptCancelOutput>(
          {
            method: "DELETE",
            path: `/api/integration/attempt/${encodeURIComponent(input.attemptID)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    credentials: {
      update: (input: CredentialsUpdateInput, requestOptions?: RequestOptions) =>
        request<CredentialsUpdateOutput>(
          {
            method: "PATCH",
            path: `/api/credential/${encodeURIComponent(input.credentialID)}`,
            query: { location: input["location"] },
            body: { label: input["label"] },
            successStatus: 204,
            declaredStatuses: [409, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      remove: (input: CredentialsRemoveInput, requestOptions?: RequestOptions) =>
        request<CredentialsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/credential/${encodeURIComponent(input.credentialID)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [409, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    permissions: {
      listRequests: (input?: PermissionsListRequestsInput, requestOptions?: RequestOptions) =>
        request<PermissionsListRequestsOutput>(
          {
            method: "GET",
            path: `/api/permission/request`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      listSaved: (input?: PermissionsListSavedInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: PermissionsListSavedOutput }>(
          {
            method: "GET",
            path: `/api/permission/saved`,
            query: { projectID: input?.["projectID"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      removeSaved: (input: PermissionsRemoveSavedInput, requestOptions?: RequestOptions) =>
        request<PermissionsRemoveSavedOutput>(
          {
            method: "DELETE",
            path: `/api/permission/saved/${encodeURIComponent(input.id)}`,
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      create: (input: PermissionsCreateInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: PermissionsCreateOutput }>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/permission`,
            body: {
              id: input["id"],
              action: input["action"],
              resources: input["resources"],
              save: input["save"],
              metadata: input["metadata"],
              source: input["source"],
              agent: input["agent"],
            },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      list: (input: PermissionsListInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: PermissionsListOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/permission`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      get: (input: PermissionsGetInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: PermissionsGetOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      reply: (input: PermissionsReplyInput, requestOptions?: RequestOptions) =>
        request<PermissionsReplyOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}/reply`,
            body: { reply: input["reply"], message: input["message"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    files: {
      read: (input: FilesReadInput, requestOptions?: RequestOptions) =>
        request<FilesReadOutput>(
          {
            method: "GET",
            path: `/api/fs/read`,
            query: { location: input["location"], path: input["path"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
            binary: true,
          },
          requestOptions,
        ),
      list: (input?: FilesListInput, requestOptions?: RequestOptions) =>
        request<FilesListOutput>(
          {
            method: "GET",
            path: `/api/fs/list`,
            query: { location: input?.["location"], path: input?.["path"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      find: (input: FilesFindInput, requestOptions?: RequestOptions) =>
        request<FilesFindOutput>(
          {
            method: "GET",
            path: `/api/fs/find`,
            query: { location: input["location"], query: input["query"], type: input["type"], limit: input["limit"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    vcs: {
      get: (input?: VcsGetInput, requestOptions?: RequestOptions) =>
        request<VcsGetOutput>(
          {
            method: "GET",
            path: `/api/vcs`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      status: (input?: VcsStatusInput, requestOptions?: RequestOptions) =>
        request<VcsStatusOutput>(
          {
            method: "GET",
            path: `/api/vcs/status`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      diff: (input: VcsDiffInput, requestOptions?: RequestOptions) =>
        request<VcsDiffOutput>(
          {
            method: "GET",
            path: `/api/vcs/diff`,
            query: { location: input["location"], mode: input["mode"], context: input["context"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      activity: (input: VcsActivityInput, requestOptions?: RequestOptions) =>
        request<VcsActivityOutput>(
          {
            method: "GET",
            path: `/api/vcs/activity`,
            query: { location: input["location"], since: input["since"], until: input["until"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      sessionActivity: (input: VcsSessionActivityInput, requestOptions?: RequestOptions) =>
        request<VcsSessionActivityOutput>(
          {
            method: "GET",
            path: `/api/activity/session`,
            query: { location: input["location"], period: input["period"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    commands: {
      list: (input?: CommandsListInput, requestOptions?: RequestOptions) =>
        request<CommandsListOutput>(
          {
            method: "GET",
            path: `/api/command`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    mcp: {
      list: (input?: McpListInput, requestOptions?: RequestOptions) =>
        request<McpListOutput>(
          {
            method: "GET",
            path: `/api/mcp`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      resources: (input?: McpResourcesInput, requestOptions?: RequestOptions) =>
        request<McpResourcesOutput>(
          {
            method: "GET",
            path: `/api/mcp/resource`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      config: (input?: McpConfigInput, requestOptions?: RequestOptions) =>
        request<McpConfigOutput>(
          {
            method: "GET",
            path: `/api/mcp/config`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      entries: (input?: McpEntriesInput, requestOptions?: RequestOptions) =>
        request<McpEntriesOutput>(
          {
            method: "GET",
            path: `/api/mcp/entries`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      tools: (input?: McpToolsInput, requestOptions?: RequestOptions) =>
        request<McpToolsOutput>(
          {
            method: "GET",
            path: `/api/mcp/tools`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      add: (input: McpAddInput, requestOptions?: RequestOptions) =>
        request<McpAddOutput>(
          {
            method: "PUT",
            path: `/api/mcp/${encodeURIComponent(input.server)}`,
            query: { location: input["location"] },
            body: { config: input["config"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      remove: (input: McpRemoveInput, requestOptions?: RequestOptions) =>
        request<McpRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/mcp/${encodeURIComponent(input.server)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      connect: (input: McpConnectInput, requestOptions?: RequestOptions) =>
        request<McpConnectOutput>(
          {
            method: "POST",
            path: `/api/mcp/${encodeURIComponent(input.server)}/connect`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      disconnect: (input: McpDisconnectInput, requestOptions?: RequestOptions) =>
        request<McpDisconnectOutput>(
          {
            method: "POST",
            path: `/api/mcp/${encodeURIComponent(input.server)}/disconnect`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      authStart: (input: McpAuthStartInput, requestOptions?: RequestOptions) =>
        request<McpAuthStartOutput>(
          {
            method: "POST",
            path: `/api/mcp/${encodeURIComponent(input.server)}/auth`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      authCallback: (input: McpAuthCallbackInput, requestOptions?: RequestOptions) =>
        request<McpAuthCallbackOutput>(
          {
            method: "POST",
            path: `/api/mcp/${encodeURIComponent(input.server)}/auth/callback`,
            query: { location: input["location"] },
            body: { code: input["code"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      authRemove: (input: McpAuthRemoveInput, requestOptions?: RequestOptions) =>
        request<McpAuthRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/mcp/${encodeURIComponent(input.server)}/auth`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    "server.lsp": {
      status: (input?: ServerLspStatusInput, requestOptions?: RequestOptions) =>
        request<ServerLspStatusOutput>(
          {
            method: "GET",
            path: `/api/lsp`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    skills: {
      list: (input?: SkillsListInput, requestOptions?: RequestOptions) =>
        request<SkillsListOutput>(
          {
            method: "GET",
            path: `/api/skill`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      save: (input: SkillsSaveInput, requestOptions?: RequestOptions) =>
        request<SkillsSaveOutput>(
          {
            method: "PUT",
            path: `/api/skill`,
            query: { location: input["location"] },
            body: {
              name: input["name"],
              description: input["description"],
              content: input["content"],
              path: input["path"],
              mtime: input["mtime"],
            },
            successStatus: 200,
            declaredStatuses: [400, 409, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: SkillsRemoveInput, requestOptions?: RequestOptions) =>
        request<SkillsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/skill`,
            query: { location: input["location"], path: input["path"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    behaviors: {
      set: (input: BehaviorsSetInput, requestOptions?: RequestOptions) =>
        request<BehaviorsSetOutput>(
          {
            method: "PUT",
            path: `/api/behavior`,
            query: { location: input["location"] },
            body: { behaviors: input["behaviors"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    events: {
      subscribe: (requestOptions?: RequestOptions): AsyncIterable<EventsSubscribeOutput> =>
        sse<EventsSubscribeOutput>(
          { method: "GET", path: `/api/event`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
          requestOptions,
        ),
    },
    ptys: {
      list: (input?: PtysListInput, requestOptions?: RequestOptions) =>
        request<PtysListOutput>(
          {
            method: "GET",
            path: `/api/pty`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      create: (input?: PtysCreateInput, requestOptions?: RequestOptions) =>
        request<PtysCreateOutput>(
          {
            method: "POST",
            path: `/api/pty`,
            query: { location: input?.["location"] },
            body: {
              command: input?.["command"],
              args: input?.["args"],
              cwd: input?.["cwd"],
              title: input?.["title"],
              env: input?.["env"],
              cols: input?.["cols"],
              rows: input?.["rows"],
            },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: PtysGetInput, requestOptions?: RequestOptions) =>
        request<PtysGetOutput>(
          {
            method: "GET",
            path: `/api/pty/${encodeURIComponent(input.ptyID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: PtysUpdateInput, requestOptions?: RequestOptions) =>
        request<PtysUpdateOutput>(
          {
            method: "PUT",
            path: `/api/pty/${encodeURIComponent(input.ptyID)}`,
            query: { location: input["location"] },
            body: { title: input["title"], size: input["size"] },
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: PtysRemoveInput, requestOptions?: RequestOptions) =>
        request<PtysRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/pty/${encodeURIComponent(input.ptyID)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    questions: {
      listRequests: (input?: QuestionsListRequestsInput, requestOptions?: RequestOptions) =>
        request<QuestionsListRequestsOutput>(
          {
            method: "GET",
            path: `/api/question/request`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      list: (input: QuestionsListInput, requestOptions?: RequestOptions) =>
        request<{ readonly data: QuestionsListOutput }>(
          {
            method: "GET",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/question`,
            successStatus: 200,
            declaredStatuses: [404, 400, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      reply: (input: QuestionsReplyInput, requestOptions?: RequestOptions) =>
        request<QuestionsReplyOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/question/${encodeURIComponent(input.requestID)}/reply`,
            body: { answers: input["answers"] },
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
      reject: (input: QuestionsRejectInput, requestOptions?: RequestOptions) =>
        request<QuestionsRejectOutput>(
          {
            method: "POST",
            path: `/api/session/${encodeURIComponent(input.sessionID)}/question/${encodeURIComponent(input.requestID)}/reject`,
            successStatus: 204,
            declaredStatuses: [404, 400, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    references: {
      list: (input?: ReferencesListInput, requestOptions?: RequestOptions) =>
        request<ReferencesListOutput>(
          {
            method: "GET",
            path: `/api/reference`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    projectCopies: {
      create: (input: ProjectCopiesCreateInput, requestOptions?: RequestOptions) =>
        request<ProjectCopiesCreateOutput>(
          {
            method: "POST",
            path: `/experimental/project/${encodeURIComponent(input.projectID)}/copy`,
            query: { location: input["location"] },
            body: { strategy: input["strategy"], directory: input["directory"], name: input["name"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: ProjectCopiesRemoveInput, requestOptions?: RequestOptions) =>
        request<ProjectCopiesRemoveOutput>(
          {
            method: "DELETE",
            path: `/experimental/project/${encodeURIComponent(input.projectID)}/copy`,
            query: { location: input["location"] },
            body: { directory: input["directory"], force: input["force"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      refresh: (input: ProjectCopiesRefreshInput, requestOptions?: RequestOptions) =>
        request<ProjectCopiesRefreshOutput>(
          {
            method: "POST",
            path: `/experimental/project/${encodeURIComponent(input.projectID)}/copy/refresh`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    projects: {
      list: (requestOptions?: RequestOptions) =>
        request<ProjectsListOutput>(
          { method: "GET", path: `/api/project`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
          requestOptions,
        ),
      directories: (input: ProjectsDirectoriesInput, requestOptions?: RequestOptions) =>
        request<ProjectsDirectoriesOutput>(
          {
            method: "GET",
            path: `/api/project/${encodeURIComponent(input.projectID)}/directories`,
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: ProjectsUpdateInput, requestOptions?: RequestOptions) =>
        request<ProjectsUpdateOutput>(
          {
            method: "PATCH",
            path: `/api/project/${encodeURIComponent(input.projectID)}`,
            body: { name: input["name"], icon: input["icon"], commands: input["commands"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      initGit: (input?: ProjectsInitGitInput, requestOptions?: RequestOptions) =>
        request<ProjectsInitGitOutput>(
          {
            method: "POST",
            path: `/api/project/git`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    lean: {
      get: (input?: LeanGetInput, requestOptions?: RequestOptions) =>
        request<LeanGetOutput>(
          {
            method: "GET",
            path: `/api/lean`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: LeanUpdateInput, requestOptions?: RequestOptions) =>
        request<LeanUpdateOutput>(
          {
            method: "PATCH",
            path: `/api/lean`,
            query: { location: input["location"] },
            body: { itemID: input["itemID"], enabled: input["enabled"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      history: (input: LeanHistoryInput, requestOptions?: RequestOptions) =>
        request<LeanHistoryOutput>(
          {
            method: "GET",
            path: `/api/lean/history/${encodeURIComponent(input.itemID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    atlas: {
      snapshot: (input?: AtlasSnapshotInput, requestOptions?: RequestOptions) =>
        request<AtlasSnapshotOutput>(
          {
            method: "GET",
            path: `/api/atlas/snapshot`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      reasoning: (input: AtlasReasoningInput, requestOptions?: RequestOptions) =>
        request<AtlasReasoningOutput>(
          {
            method: "GET",
            path: `/api/atlas/reasoning/${encodeURIComponent(input.id)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      own: (input: AtlasOwnInput, requestOptions?: RequestOptions) =>
        request<AtlasOwnOutput>(
          {
            method: "GET",
            path: `/api/atlas/own`,
            query: { location: input["location"], scope: input["scope"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      health: (input?: AtlasHealthInput, requestOptions?: RequestOptions) =>
        request<AtlasHealthOutput>(
          {
            method: "GET",
            path: `/api/atlas/health`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      promote: (input?: AtlasPromoteInput, requestOptions?: RequestOptions) =>
        request<AtlasPromoteOutput>(
          {
            method: "POST",
            path: `/api/atlas/promote`,
            query: { location: input?.["location"] },
            body: { token: input?.["token"], nodeKeys: input?.["nodeKeys"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      draft: (input: AtlasDraftInput, requestOptions?: RequestOptions) =>
        request<AtlasDraftOutput>(
          {
            method: "POST",
            path: `/api/atlas/draft`,
            query: { location: input["location"] },
            body: {
              anchor: input["anchor"],
              slot: input["slot"],
              claim: input["claim"],
              supersede: input["supersede"],
              token: input["token"],
            },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      emit: (input: AtlasEmitInput, requestOptions?: RequestOptions) =>
        request<AtlasEmitOutput>(
          {
            method: "POST",
            path: `/api/atlas/emit`,
            query: { location: input["location"] },
            body: { fact: input["fact"], at: input["at"], token: input["token"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      link: (input: AtlasLinkInput, requestOptions?: RequestOptions) =>
        request<AtlasLinkOutput>(
          {
            method: "POST",
            path: `/api/atlas/link`,
            query: { location: input["location"] },
            body: { a: input["a"], b: input["b"], retract: input["retract"], token: input["token"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      verify: (input: AtlasVerifyInput, requestOptions?: RequestOptions) =>
        request<AtlasVerifyOutput>(
          {
            method: "POST",
            path: `/api/atlas/verify`,
            query: { location: input["location"] },
            body: {
              kind: input["kind"],
              target: input["target"],
              scope: input["scope"],
              world: input["world"],
              min: input["min"],
              exact: input["exact"],
            },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      review: (input?: AtlasReviewInput, requestOptions?: RequestOptions) =>
        request<AtlasReviewOutput>(
          {
            method: "GET",
            path: `/api/atlas/review`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      hold: (input: AtlasHoldInput, requestOptions?: RequestOptions) =>
        request<AtlasHoldOutput>(
          {
            method: "POST",
            path: `/api/atlas/hold`,
            query: { location: input["location"] },
            body: { nodeKey: input["nodeKey"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      release: (input: AtlasReleaseInput, requestOptions?: RequestOptions) =>
        request<AtlasReleaseOutput>(
          {
            method: "POST",
            path: `/api/atlas/release`,
            query: { location: input["location"] },
            body: { nodeKey: input["nodeKey"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      propose: (input: AtlasProposeInput, requestOptions?: RequestOptions) =>
        request<AtlasProposeOutput>(
          {
            method: "POST",
            path: `/api/atlas/propose`,
            query: { location: input["location"] },
            body: { nodeKey: input["nodeKey"], toTier: input["toTier"], reason: input["reason"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      decide: (input: AtlasDecideInput, requestOptions?: RequestOptions) =>
        request<AtlasDecideOutput>(
          {
            method: "POST",
            path: `/api/atlas/decide`,
            query: { location: input["location"] },
            body: {
              proposalId: input["proposalId"],
              verdict: input["verdict"],
              reason: input["reason"],
              token: input["token"],
            },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      answer: (input: AtlasAnswerInput, requestOptions?: RequestOptions) =>
        request<AtlasAnswerOutput>(
          {
            method: "POST",
            path: `/api/atlas/answer`,
            query: { location: input["location"] },
            body: { questionId: input["questionId"], answer: input["answer"], drafted: input["drafted"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      memoryDecide: (input: AtlasMemoryDecideInput, requestOptions?: RequestOptions) =>
        request<AtlasMemoryDecideOutput>(
          {
            method: "POST",
            path: `/api/atlas/memory-decide`,
            query: { location: input["location"] },
            body: {
              proposalId: input["proposalId"],
              verdict: input["verdict"],
              rule: input["rule"],
              scope: input["scope"],
            },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      territory: (input: AtlasTerritoryInput, requestOptions?: RequestOptions) =>
        request<AtlasTerritoryOutput>(
          {
            method: "POST",
            path: `/api/atlas/territory`,
            query: { location: input["location"] },
            body: {
              name: input["name"],
              owner: input["owner"],
              tier: input["tier"],
              globs: input["globs"],
              token: input["token"],
            },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      delegate: (input: AtlasDelegateInput, requestOptions?: RequestOptions) =>
        request<AtlasDelegateOutput>(
          {
            method: "POST",
            path: `/api/atlas/delegate`,
            query: { location: input["location"] },
            body: { questionIds: input["questionIds"], providerID: input["providerID"], modelID: input["modelID"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      install: (input?: AtlasInstallInput, requestOptions?: RequestOptions) =>
        request<AtlasInstallOutput>(
          {
            method: "POST",
            path: `/api/atlas/install`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      index: (input?: AtlasIndexInput, requestOptions?: RequestOptions) =>
        request<AtlasIndexOutput>(
          {
            method: "POST",
            path: `/api/atlas/index`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
      mine: (input: AtlasMineInput, requestOptions?: RequestOptions) =>
        request<AtlasMineOutput>(
          {
            method: "POST",
            path: `/api/atlas/mine`,
            query: { location: input["location"] },
            body: { providerID: input["providerID"], modelID: input["modelID"], ceiling: input["ceiling"] },
            successStatus: 200,
            declaredStatuses: [503, 400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    config: {
      get: (requestOptions?: RequestOptions) =>
        request<ConfigGetOutput>(
          { method: "GET", path: `/api/config`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
          requestOptions,
        ),
      update: (input?: ConfigUpdateInput, requestOptions?: RequestOptions) =>
        request<ConfigUpdateOutput>(
          {
            method: "PATCH",
            path: `/api/config`,
            body: {
              model: input?.["model"],
              shell: input?.["shell"],
              agents: input?.["agents"],
              disabledProviders: input?.["disabledProviders"],
              providers: input?.["providers"],
              permissions: input?.["permissions"],
            },
            successStatus: 204,
            declaredStatuses: [401, 400],
            empty: true,
          },
          requestOptions,
        ),
      shells: (requestOptions?: RequestOptions) =>
        request<ConfigShellsOutput>(
          { method: "GET", path: `/api/config/shells`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
          requestOptions,
        ),
    },
    "server.board": {
      list: (requestOptions?: RequestOptions) =>
        request<ServerBoardListOutput>(
          { method: "GET", path: `/api/board`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
          requestOptions,
        ),
      get: (input: ServerBoardGetInput, requestOptions?: RequestOptions) =>
        request<ServerBoardGetOutput>(
          {
            method: "GET",
            path: `/api/board/${encodeURIComponent(input.key)}`,
            successStatus: 200,
            declaredStatuses: [404, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      issue: (input: ServerBoardIssueInput, requestOptions?: RequestOptions) =>
        request<ServerBoardIssueOutput>(
          {
            method: "GET",
            path: `/api/board/${encodeURIComponent(input.key)}/issue/${encodeURIComponent(input.number)}`,
            successStatus: 200,
            declaredStatuses: [404, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      activity: (input: ServerBoardActivityInput, requestOptions?: RequestOptions) =>
        request<ServerBoardActivityOutput>(
          {
            method: "GET",
            path: `/api/board/${encodeURIComponent(input.key)}/activity`,
            query: { since: input["since"] },
            successStatus: 200,
            declaredStatuses: [404, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      answer: (input: ServerBoardAnswerInput, requestOptions?: RequestOptions) =>
        request<ServerBoardAnswerOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/question/${encodeURIComponent(input.id)}/answer`,
            body: { option: input["option"], text: input["text"] },
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      note: (input: ServerBoardNoteInput, requestOptions?: RequestOptions) =>
        request<ServerBoardNoteOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/issue/${encodeURIComponent(input.number)}/note`,
            body: { body: input["body"] },
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      attach: (input: ServerBoardAttachInput, requestOptions?: RequestOptions) =>
        request<ServerBoardAttachOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/issue/${encodeURIComponent(input.number)}/attachment`,
            body: {
              kind: input["kind"],
              name: input["name"],
              mime: input["mime"],
              data: input["data"],
              value: input["value"],
            },
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      undo: (input: ServerBoardUndoInput, requestOptions?: RequestOptions) =>
        request<ServerBoardUndoOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/activity/${encodeURIComponent(input.id)}/undo`,
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      pause: (input: ServerBoardPauseInput, requestOptions?: RequestOptions) =>
        request<ServerBoardPauseOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/pause`,
            body: { reason: input["reason"] },
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      resume: (input: ServerBoardResumeInput, requestOptions?: RequestOptions) =>
        request<ServerBoardResumeOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/resume`,
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      githubSync: (input: ServerBoardGithubSyncInput, requestOptions?: RequestOptions) =>
        request<ServerBoardGithubSyncOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/github/sync`,
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      pauseIssue: (input: ServerBoardPauseIssueInput, requestOptions?: RequestOptions) =>
        request<ServerBoardPauseIssueOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/issue/${encodeURIComponent(input.number)}/pause`,
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      resumeIssue: (input: ServerBoardResumeIssueInput, requestOptions?: RequestOptions) =>
        request<ServerBoardResumeIssueOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/issue/${encodeURIComponent(input.number)}/resume`,
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      hold: (input: ServerBoardHoldInput, requestOptions?: RequestOptions) =>
        request<ServerBoardHoldOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/issue/${encodeURIComponent(input.number)}/hold`,
            body: { hold: input["hold"] },
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      accept: (input: ServerBoardAcceptInput, requestOptions?: RequestOptions) =>
        request<ServerBoardAcceptOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/intake/${encodeURIComponent(input.number)}/accept`,
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
      decline: (input: ServerBoardDeclineInput, requestOptions?: RequestOptions) =>
        request<ServerBoardDeclineOutput>(
          {
            method: "POST",
            path: `/api/board/${encodeURIComponent(input.key)}/intake/${encodeURIComponent(input.number)}/decline`,
            successStatus: 200,
            declaredStatuses: [404, 409, 401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    claudeCode: {
      account: (requestOptions?: RequestOptions) =>
        request<ClaudeCodeAccountOutput>(
          {
            method: "GET",
            path: `/api/claude-code/account`,
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
      login: (requestOptions?: RequestOptions) =>
        request<ClaudeCodeLoginOutput>(
          {
            method: "POST",
            path: `/api/claude-code/login`,
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      loginCode: (input: ClaudeCodeLoginCodeInput, requestOptions?: RequestOptions) =>
        request<ClaudeCodeLoginCodeOutput>(
          {
            method: "POST",
            path: `/api/claude-code/login/code`,
            body: { code: input["code"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
            empty: false,
          },
          requestOptions,
        ),
    },
    relayDocuments: {
      list: (input?: RelayDocumentsListInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsListOutput>(
          {
            method: "GET",
            path: `/api/relay/document`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      create: (input?: RelayDocumentsCreateInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsCreateOutput>(
          {
            method: "POST",
            path: `/api/relay/document`,
            query: { location: input?.["location"] },
            body: {
              name: input?.["name"],
              description: input?.["description"],
              nodes: input?.["nodes"],
              connections: input?.["connections"],
              nodeGroups: input?.["nodeGroups"],
              tags: input?.["tags"],
              meta: input?.["meta"],
              isArchived: input?.["isArchived"],
            },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: RelayDocumentsGetInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsGetOutput>(
          {
            method: "GET",
            path: `/api/relay/document/${encodeURIComponent(input.documentID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: RelayDocumentsUpdateInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsUpdateOutput>(
          {
            method: "PATCH",
            path: `/api/relay/document/${encodeURIComponent(input.documentID)}`,
            query: { location: input["location"] },
            body: {
              name: input["name"],
              description: input["description"],
              nodes: input["nodes"],
              connections: input["connections"],
              nodeGroups: input["nodeGroups"],
              tags: input["tags"],
              meta: input["meta"],
              isArchived: input["isArchived"],
              versionId: input["versionId"],
              expectedChecksum: input["expectedChecksum"],
              force: input["force"],
            },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: RelayDocumentsRemoveInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/relay/document/${encodeURIComponent(input.documentID)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: true,
          },
          requestOptions,
        ),
      versions: (input: RelayDocumentsVersionsInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsVersionsOutput>(
          {
            method: "GET",
            path: `/api/relay/document/${encodeURIComponent(input.documentID)}/version`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      version: (input: RelayDocumentsVersionInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsVersionOutput>(
          {
            method: "GET",
            path: `/api/relay/document/${encodeURIComponent(input.documentID)}/version/${encodeURIComponent(input.versionID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      sprint: (input: RelayDocumentsSprintInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsSprintOutput>(
          {
            method: "GET",
            path: `/api/relay/document/${encodeURIComponent(input.documentID)}/sprint`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      definition: (input: RelayDocumentsDefinitionInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsDefinitionOutput>(
          {
            method: "GET",
            path: `/api/relay/document/${encodeURIComponent(input.documentID)}/export`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      check: (input: RelayDocumentsCheckInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsCheckOutput>(
          {
            method: "POST",
            path: `/api/relay/document/${encodeURIComponent(input.documentID)}/check`,
            query: { location: input["location"] },
            body: {
              position: input["position"],
              counter: input["counter"],
              baseRef: input["baseRef"],
              params: input["params"],
            },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 403, 401],
            empty: false,
          },
          requestOptions,
        ),
      nodeTypes: (input?: RelayDocumentsNodeTypesInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsNodeTypesOutput>(
          {
            method: "GET",
            path: `/api/relay/node-types`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      listScopes: (input?: RelayDocumentsListScopesInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsListScopesOutput>(
          {
            method: "GET",
            path: `/api/relay/scope`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      createScope: (input: RelayDocumentsCreateScopeInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsCreateScopeOutput>(
          {
            method: "POST",
            path: `/api/relay/scope`,
            query: { location: input["location"] },
            body: { name: input["name"], description: input["description"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      updateScope: (input: RelayDocumentsUpdateScopeInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsUpdateScopeOutput>(
          {
            method: "PATCH",
            path: `/api/relay/scope/${encodeURIComponent(input.scopeID)}`,
            query: { location: input["location"] },
            body: { name: input["name"], description: input["description"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      removeScope: (input: RelayDocumentsRemoveScopeInput, requestOptions?: RequestOptions) =>
        request<RelayDocumentsRemoveScopeOutput>(
          {
            method: "DELETE",
            path: `/api/relay/scope/${encodeURIComponent(input.scopeID)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: true,
          },
          requestOptions,
        ),
    },
    relayPublish: {
      publish: (input: RelayPublishPublishInput, requestOptions?: RequestOptions) =>
        request<RelayPublishPublishOutput>(
          {
            method: "POST",
            path: `/api/relay/document/${encodeURIComponent(input.documentID)}/publish`,
            query: { location: input["location"] },
            body: { versionId: input["versionId"], expectedChecksum: input["expectedChecksum"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      unpublish: (input: RelayPublishUnpublishInput, requestOptions?: RequestOptions) =>
        request<RelayPublishUnpublishOutput>(
          {
            method: "POST",
            path: `/api/relay/document/${encodeURIComponent(input.documentID)}/unpublish`,
            query: { location: input["location"] },
            body: { expectedChecksum: input["expectedChecksum"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    relayHooks: {
      list: (input?: RelayHooksListInput, requestOptions?: RequestOptions) =>
        request<RelayHooksListOutput>(
          {
            method: "GET",
            path: `/api/relay/hook`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      install: (input: RelayHooksInstallInput, requestOptions?: RequestOptions) =>
        request<RelayHooksInstallOutput>(
          {
            method: "POST",
            path: `/api/relay/hook`,
            query: { location: input["location"] },
            body: { document: input["document"], version: input["version"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: RelayHooksUpdateInput, requestOptions?: RequestOptions) =>
        request<RelayHooksUpdateOutput>(
          {
            method: "POST",
            path: `/api/relay/hook/${encodeURIComponent(input.installID)}/update`,
            query: { location: input["location"] },
            body: { version: input["version"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      enable: (input: RelayHooksEnableInput, requestOptions?: RequestOptions) =>
        request<RelayHooksEnableOutput>(
          {
            method: "POST",
            path: `/api/relay/hook/${encodeURIComponent(input.installID)}/enable`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      disable: (input: RelayHooksDisableInput, requestOptions?: RequestOptions) =>
        request<RelayHooksDisableOutput>(
          {
            method: "POST",
            path: `/api/relay/hook/${encodeURIComponent(input.installID)}/disable`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      order: (input: RelayHooksOrderInput, requestOptions?: RequestOptions) =>
        request<RelayHooksOrderOutput>(
          {
            method: "PATCH",
            path: `/api/relay/hook/order`,
            query: { location: input["location"] },
            body: { installIDs: input["installIDs"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      uninstall: (input: RelayHooksUninstallInput, requestOptions?: RequestOptions) =>
        request<RelayHooksUninstallOutput>(
          {
            method: "DELETE",
            path: `/api/relay/hook/${encodeURIComponent(input.installID)}`,
            query: { location: input["location"] },
            successStatus: 204,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: true,
          },
          requestOptions,
        ),
      decisions: (input: RelayHooksDecisionsInput, requestOptions?: RequestOptions) =>
        request<RelayHooksDecisionsOutput>(
          {
            method: "GET",
            path: `/api/relay/hook/${encodeURIComponent(input.installID)}/decisions`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      repair: (input: RelayHooksRepairInput, requestOptions?: RequestOptions) =>
        request<RelayHooksRepairOutput>(
          {
            method: "POST",
            path: `/api/relay/hook/repair`,
            query: { location: input["location"] },
            body: { confirm: input["confirm"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    pullRequests: {
      list: (input?: PullRequestsListInput, requestOptions?: RequestOptions) =>
        request<PullRequestsListOutput>(
          {
            method: "GET",
            path: `/api/pull-request`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      create: (input: PullRequestsCreateInput, requestOptions?: RequestOptions) =>
        request<PullRequestsCreateOutput>(
          {
            method: "POST",
            path: `/api/pull-request`,
            query: { location: input["location"] },
            body: { title: input["title"], body: input["body"], base: input["base"], head: input["head"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    schedules: makeSchedules(request, sse),
    actionsBindings: makeActionsBindings(request, sse),
    actionsOperations: makeActionsOperations(request, sse),
    actionsWorkflows: makeActionsWorkflows(request, sse),
    actionsRuns: makeActionsRuns(request, sse),
    actionsJobs: makeActionsJobs(request, sse),
    actionsPipelines: makeActionsPipelines(request, sse),
    actionsResources: makeActionsResources(request, sse),
    actionsSource: makeActionsSource(request, sse),
    actionsTransfers: makeActionsTransfers(request, sse),
    relayRuns: {
      list: (input?: RelayRunsListInput, requestOptions?: RequestOptions) =>
        request<RelayRunsListOutput>(
          {
            method: "GET",
            path: `/api/relay/run`,
            query: { location: input?.["location"], document: input?.["document"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: RelayRunsGetInput, requestOptions?: RequestOptions) =>
        request<RelayRunsGetOutput>(
          {
            method: "GET",
            path: `/api/relay/run/${encodeURIComponent(input.runID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      audit: (input: RelayRunsAuditInput, requestOptions?: RequestOptions) =>
        request<RelayRunsAuditOutput>(
          {
            method: "GET",
            path: `/api/relay/run/${encodeURIComponent(input.runID)}/audit`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
      ledger: (input: RelayRunsLedgerInput, requestOptions?: RequestOptions) =>
        request<RelayRunsLedgerOutput>(
          {
            method: "GET",
            path: `/api/relay/run/${encodeURIComponent(input.runID)}/ledger`,
            query: { location: input["location"], after: input["after"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 409, 503, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    guardrail: {
      rules: (input?: GuardrailRulesInput, requestOptions?: RequestOptions) =>
        request<GuardrailRulesOutput>(
          {
            method: "GET",
            path: `/api/guardrail/rules`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      run: (input?: GuardrailRunInput, requestOptions?: RequestOptions) =>
        request<GuardrailRunOutput>(
          {
            method: "POST",
            path: `/api/guardrail/run`,
            query: { location: input?.["location"] },
            body: { base: input?.["base"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    meeting: {
      start: (input: MeetingStartInput, requestOptions?: RequestOptions) =>
        request<MeetingStartOutput>(
          {
            method: "POST",
            path: `/api/meeting/start`,
            query: { location: input["location"] },
            body: { sessionID: input["sessionID"], title: input["title"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      append: (input: MeetingAppendInput, requestOptions?: RequestOptions) =>
        request<MeetingAppendOutput>(
          {
            method: "POST",
            path: `/api/meeting/segments`,
            query: { location: input["location"] },
            body: { meetingID: input["meetingID"], segments: input["segments"] },
            successStatus: 204,
            declaredStatuses: [400, 401],
            empty: true,
          },
          requestOptions,
        ),
      stop: (input: MeetingStopInput, requestOptions?: RequestOptions) =>
        request<MeetingStopOutput>(
          {
            method: "POST",
            path: `/api/meeting/stop`,
            query: { location: input["location"] },
            body: { meetingID: input["meetingID"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      read: (input: MeetingReadInput, requestOptions?: RequestOptions) =>
        request<MeetingReadOutput>(
          {
            method: "GET",
            path: `/api/meeting`,
            query: { location: input["location"], meetingID: input["meetingID"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    operator: {
      inspect: (input?: OperatorInspectInput, requestOptions?: RequestOptions) =>
        request<OperatorInspectOutput>(
          {
            method: "GET",
            path: `/api/capability/operator`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
    },
    connections: {
      connect: (input: ConnectionsConnectInput, requestOptions?: RequestOptions) =>
        request<ConnectionsConnectOutput>(
          {
            method: "POST",
            path: `/api/capability/connections/connect`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            body: { provider: input["provider"], key: input["key"], label: input["label"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      getTarget: (input: ConnectionsGetTargetInput, requestOptions?: RequestOptions) =>
        request<ConnectionsGetTargetOutput>(
          {
            method: "GET",
            path: `/api/capability/targets/${encodeURIComponent(input.targetID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      bindings: (input: ConnectionsBindingsInput, requestOptions?: RequestOptions) =>
        request<ConnectionsBindingsOutput>(
          {
            method: "GET",
            path: `/api/capability/targets/${encodeURIComponent(input.targetID)}/bindings`,
            query: { location: input["location"], after: input["after"], limit: input["limit"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      list: (input?: ConnectionsListInput, requestOptions?: RequestOptions) =>
        request<ConnectionsListOutput>(
          {
            method: "GET",
            path: `/api/capability/connections`,
            query: { location: input?.["location"], after: input?.["after"], limit: input?.["limit"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: ConnectionsGetInput, requestOptions?: RequestOptions) =>
        request<ConnectionsGetOutput>(
          {
            method: "GET",
            path: `/api/capability/connections/${encodeURIComponent(input.connectionID)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      targets: (input: ConnectionsTargetsInput, requestOptions?: RequestOptions) =>
        request<ConnectionsTargetsOutput>(
          {
            method: "GET",
            path: `/api/capability/connections/${encodeURIComponent(input.connectionID)}/targets`,
            query: { location: input["location"], after: input["after"], limit: input["limit"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      disconnect: (input: ConnectionsDisconnectInput, requestOptions?: RequestOptions) =>
        request<ConnectionsDisconnectOutput>(
          {
            method: "POST",
            path: `/api/capability/connections/disconnect`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            body: { connection: input["connection"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      createTarget: (input: ConnectionsCreateTargetInput, requestOptions?: RequestOptions) =>
        request<ConnectionsCreateTargetOutput>(
          {
            method: "POST",
            path: `/api/capability/targets`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            body: { connection: input["connection"], input: input["input"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      retargetTarget: (input: ConnectionsRetargetTargetInput, requestOptions?: RequestOptions) =>
        request<ConnectionsRetargetTargetOutput>(
          {
            method: "POST",
            path: `/api/capability/targets/retarget`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            body: { target: input["target"], input: input["input"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      removeTarget: (input: ConnectionsRemoveTargetInput, requestOptions?: RequestOptions) =>
        request<ConnectionsRemoveTargetOutput>(
          {
            method: "POST",
            path: `/api/capability/targets/remove`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            body: { target: input["target"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      bind: (input: ConnectionsBindInput, requestOptions?: RequestOptions) =>
        request<ConnectionsBindOutput>(
          {
            method: "POST",
            path: `/api/capability/bindings`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            body: { target: input["target"], input: input["input"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      unbind: (input: ConnectionsUnbindInput, requestOptions?: RequestOptions) =>
        request<ConnectionsUnbindOutput>(
          {
            method: "POST",
            path: `/api/capability/bindings/remove`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            body: { target: input["target"], sessionID: input["sessionID"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
    },
    artifacts: {
      list: (input: ArtifactsListInput, requestOptions?: RequestOptions) =>
        request<ArtifactsListOutput>(
          {
            method: "GET",
            path: `/api/capability/sessions/${encodeURIComponent(input.sessionID)}/artifacts`,
            query: { location: input["location"], after: input["after"], limit: input["limit"] },
            successStatus: 200,
            declaredStatuses: [400, 409, 500, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: ArtifactsGetInput, requestOptions?: RequestOptions) =>
        request<ArtifactsGetOutput>(
          {
            method: "GET",
            path: `/api/capability/sessions/${encodeURIComponent(input.sessionID)}/artifacts/${encodeURIComponent(input.artifactID)}/${encodeURIComponent(input.revision)}`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 409, 500, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      contentTicket: (input: ArtifactsContentTicketInput, requestOptions?: RequestOptions) =>
        request<ArtifactsContentTicketOutput>(
          {
            method: "POST",
            path: `/api/capability/sessions/${encodeURIComponent(input.sessionID)}/artifacts/${encodeURIComponent(input.artifactID)}/${encodeURIComponent(input.revision)}/content-ticket`,
            query: { location: input["location"] },
            successStatus: 200,
            declaredStatuses: [400, 409, 500, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      share: (input: ArtifactsShareInput, requestOptions?: RequestOptions) =>
        request<ArtifactsShareOutput>(
          {
            method: "POST",
            path: `/api/capability/sessions/${encodeURIComponent(input.sessionID)}/artifacts/${encodeURIComponent(input.artifactID)}/${encodeURIComponent(input.revision)}/share`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            body: { targetSessionID: input["targetSessionID"] },
            successStatus: 200,
            declaredStatuses: [400, 409, 500, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      pin: (input: ArtifactsPinInput, requestOptions?: RequestOptions) =>
        request<ArtifactsPinOutput>(
          {
            method: "PUT",
            path: `/api/capability/sessions/${encodeURIComponent(input.sessionID)}/artifacts/${encodeURIComponent(input.artifactID)}/${encodeURIComponent(input.revision)}/pin`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            body: { pinned: input["pinned"] },
            successStatus: 200,
            declaredStatuses: [400, 409, 500, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      removeReference: (input: ArtifactsRemoveReferenceInput, requestOptions?: RequestOptions) =>
        request<ArtifactsRemoveReferenceOutput>(
          {
            method: "DELETE",
            path: `/api/capability/sessions/${encodeURIComponent(input.sessionID)}/artifacts/${encodeURIComponent(input.artifactID)}/${encodeURIComponent(input.revision)}`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            successStatus: 200,
            declaredStatuses: [400, 409, 500, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
    },
    capabilitySchedules: {
      list: (input?: CapabilitySchedulesListInput, requestOptions?: RequestOptions) =>
        request<CapabilitySchedulesListOutput>(
          {
            method: "GET",
            path: `/api/capability/schedules`,
            query: { location: input?.["location"] },
            successStatus: 200,
            declaredStatuses: [409, 500, 400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      pause: (input: CapabilitySchedulesPauseInput, requestOptions?: RequestOptions) =>
        request<CapabilitySchedulesPauseOutput>(
          {
            method: "POST",
            path: `/api/capability/schedules/${encodeURIComponent(input.scheduleID)}/pause`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            successStatus: 200,
            declaredStatuses: [409, 500, 400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      resume: (input: CapabilitySchedulesResumeInput, requestOptions?: RequestOptions) =>
        request<CapabilitySchedulesResumeOutput>(
          {
            method: "POST",
            path: `/api/capability/schedules/${encodeURIComponent(input.scheduleID)}/resume`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            successStatus: 200,
            declaredStatuses: [409, 500, 400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      run: (input: CapabilitySchedulesRunInput, requestOptions?: RequestOptions) =>
        request<CapabilitySchedulesRunOutput>(
          {
            method: "POST",
            path: `/api/capability/schedules/${encodeURIComponent(input.scheduleID)}/run`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            successStatus: 200,
            declaredStatuses: [409, 500, 400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: CapabilitySchedulesRemoveInput, requestOptions?: RequestOptions) =>
        request<CapabilitySchedulesRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/capability/schedules/${encodeURIComponent(input.scheduleID)}`,
            query: { location: input["location"] },
            headers: { "idempotency-key": input["idempotency-key"] },
            successStatus: 200,
            declaredStatuses: [409, 500, 400, 401, 403],
            empty: false,
          },
          requestOptions,
        ),
    },
  }
}

function appendQuery(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    for (const item of value) appendQuery(params, key, item)
    return
  }
  if (typeof value === "object") {
    for (const [child, item] of Object.entries(value)) appendQuery(params, `${key}[${child}]`, item)
    return
  }
  params.append(key, String(value))
}

async function json(response: Response): Promise<unknown> {
  if (!isContentType(response, "application/json") && !response.headers.get("content-type")?.includes("+json")) {
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnsupportedContentType")
  }
  let text: string
  try {
    text = await response.text()
  } catch (cause) {
    throw new ClientError("Transport", { cause })
  }
  if (text === "") throw new ClientError("MalformedResponse")
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new ClientError("MalformedResponse", { cause })
  }
}

function isContentType(response: Response, expected: string) {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === expected
}
