import { Context } from "effect"
import { HttpApi, HttpApiGroup, HttpApiMiddleware, OpenApi } from "effect/unstable/httpapi"
import { SchemaErrorMiddleware } from "./middleware/schema-error"
import { MessageGroup } from "./groups/message"
import { ModelGroup } from "./groups/model"
import { ProviderGroup } from "./groups/provider"
import { makeSessionGroup } from "./groups/session"
import { makePermissionGroup } from "./groups/permission"
import { makeFileSystemGroup } from "./groups/fs"
import { VcsGroup } from "./groups/vcs"
import { CommandGroup } from "./groups/command"
import { McpGroup } from "./groups/mcp"
import { LspGroup } from "./groups/lsp"
import { FormatterGroup } from "./groups/formatter"
import { SkillGroup } from "./groups/skill"
import { BehaviorGroup } from "./groups/behavior"
import { EventGroup, makeEventGroup } from "./groups/event"
import type { Definition } from "@orchestra/schema/event"
import { AgentGroup } from "./groups/agent"
import { HealthGroup } from "./groups/health"
import { InstallationGroup } from "./groups/installation"
import { PtyGroup } from "./groups/pty"
import { makeQuestionGroup } from "./groups/question"
import { ReferenceGroup } from "./groups/reference"
import { Authorization } from "./middleware/authorization"
import { LocationGroup } from "./groups/location"
import { IntegrationGroup } from "./groups/integration"
import { CredentialGroup } from "./groups/credential"
import { ProjectCopyGroup } from "./groups/project-copy"
import { ProjectGroup } from "./groups/project"
import { LeanGroup } from "./groups/lean"
import { AtlasGroup } from "./groups/atlas"
import { ConfigGroup } from "./groups/config"
import { TrustGroup } from "./groups/trust"
import { BoardGroup } from "./groups/board"
import { RelayDocumentGroup, RelayPublishGroup } from "./groups/relay-document"
import { RelayHookGroup } from "./groups/relay-hook"
import { RelayRunGroup } from "./groups/relay-run"
import { GuardrailGroup } from "./groups/guardrail"
import { MeetingGroup } from "./groups/meeting"
import { PullRequestGroup } from "./groups/pull-request"
import { ScheduleGroup } from "./groups/schedule"
import { makeResearchArtifactGroup } from "./groups/research-artifact"
import { ActionsBindingGroup } from "./groups/actions-binding"
import { ActionsOperationGroup } from "./groups/actions-operation"
import { ActionsWorkflowGroup } from "./groups/actions-workflow"
import { ActionsRunGroup } from "./groups/actions-run"
import { ActionsJobGroup } from "./groups/actions-job"
import { ActionsPipelineGroup } from "./groups/actions-pipeline"
import { ActionsResourceGroup } from "./groups/actions-resource"
import { ActionsSourceGroup } from "./groups/actions-source"
import { ActionsTransferGroup } from "./groups/actions-transfer"
import { makeCapabilityOperatorGroup } from "./groups/capability-operator"
import { makeCapabilityConnectionsGroup } from "./groups/capability-connections"
import { CapabilityContentGroup, makeCapabilityArtifactsGroup } from "./groups/capability-artifacts"
import { makeCapabilitySchedulesGroup } from "./groups/capability-schedules"

// Protocol owns middleware placement, while Server injects concrete keys so Core service identities stay downstream.
const makeApiFromGroup = <
  const Group extends HttpApiGroup.Any,
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
>(
  eventGroup: Group,
  locationMiddleware: Context.Key<LocationId, LocationService>,
  sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>,
) =>
  HttpApi.make("server")
    .add(HealthGroup)
    .add(LocationGroup.middleware(locationMiddleware))
    .add(AgentGroup.middleware(locationMiddleware))
    .add(makeSessionGroup(sessionLocationMiddleware))
    .add(makeResearchArtifactGroup(sessionLocationMiddleware))
    .add(MessageGroup.middleware(sessionLocationMiddleware))
    .add(ModelGroup.middleware(locationMiddleware))
    .add(ProviderGroup.middleware(locationMiddleware))
    .add(IntegrationGroup.middleware(locationMiddleware))
    .add(CredentialGroup.middleware(locationMiddleware))
    .add(makePermissionGroup(locationMiddleware, sessionLocationMiddleware))
    .add(makeFileSystemGroup(locationMiddleware))
    .add(VcsGroup.middleware(locationMiddleware))
    .add(CommandGroup.middleware(locationMiddleware))
    .add(McpGroup.middleware(locationMiddleware))
    .add(LspGroup.middleware(locationMiddleware))
    .add(FormatterGroup.middleware(locationMiddleware))
    .add(SkillGroup.middleware(locationMiddleware))
    .add(BehaviorGroup.middleware(locationMiddleware))
    .add(eventGroup)
    .add(PtyGroup.middleware(locationMiddleware))
    .add(makeQuestionGroup(locationMiddleware, sessionLocationMiddleware))
    .add(ReferenceGroup.middleware(locationMiddleware))
    .add(ProjectCopyGroup.middleware(locationMiddleware))
    .add(ProjectGroup)
    .add(LeanGroup.middleware(locationMiddleware))
    .add(AtlasGroup.middleware(locationMiddleware))
    .add(ConfigGroup)
    .add(TrustGroup)
    .add(BoardGroup)
    .add(RelayDocumentGroup.middleware(locationMiddleware))
    .add(RelayPublishGroup.middleware(locationMiddleware))
    .add(RelayHookGroup.middleware(locationMiddleware))
    .add(PullRequestGroup.middleware(locationMiddleware))
    .add(ScheduleGroup.middleware(locationMiddleware))
    .add(ActionsBindingGroup.middleware(locationMiddleware))
    .add(ActionsOperationGroup.middleware(locationMiddleware))
    .add(ActionsWorkflowGroup.middleware(locationMiddleware))
    .add(ActionsRunGroup.middleware(locationMiddleware))
    .add(ActionsJobGroup.middleware(locationMiddleware))
    .add(ActionsPipelineGroup.middleware(locationMiddleware))
    .add(ActionsResourceGroup.middleware(locationMiddleware))
    .add(ActionsSourceGroup.middleware(locationMiddleware))
    .add(ActionsTransferGroup.middleware(locationMiddleware))
    .add(RelayRunGroup.middleware(locationMiddleware))
    .add(InstallationGroup)
    .add(GuardrailGroup.middleware(locationMiddleware))
    .add(MeetingGroup.middleware(locationMiddleware))
    // Last-applied middleware runs first: authenticate before caller-selected Location construction.
    .add(makeCapabilityOperatorGroup(locationMiddleware))
    .add(makeCapabilityConnectionsGroup(locationMiddleware))
    .add(makeCapabilityArtifactsGroup(locationMiddleware))
    .add(makeCapabilitySchedulesGroup(locationMiddleware))
    .add(CapabilityContentGroup)
    .annotateMerge(
      OpenApi.annotations({
        title: "orchestra HttpApi",
        version: "0.0.1",
        description: "Experimental HttpApi surface for selected instance routes.",
      }),
    )
    .middleware(Authorization)
    .middleware(SchemaErrorMiddleware)

export const makeApi = <
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
>(options: {
  readonly definitions: ReadonlyArray<Definition>
  readonly locationMiddleware: Context.Key<LocationId, LocationService>
  readonly sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>
}) =>
  makeApiFromGroup(makeEventGroup(options.definitions), options.locationMiddleware, options.sessionLocationMiddleware)

export const makeDefaultApi = <
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
>(options: {
  readonly locationMiddleware: Context.Key<LocationId, LocationService>
  readonly sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>
}) => makeApiFromGroup(EventGroup, options.locationMiddleware, options.sessionLocationMiddleware)
