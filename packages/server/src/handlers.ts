import { Layer } from "effect"
import { MessageHandler } from "./handlers/message"
import { ModelHandler } from "./handlers/model"
import { ProviderHandler } from "./handlers/provider"
import { SessionHandler } from "./handlers/session"
import { PermissionHandler } from "./handlers/permission"
import { FileSystemHandler } from "./handlers/fs"
import { VcsHandler } from "./handlers/vcs"
import { CommandHandler } from "./handlers/command"
import { McpHandler } from "./handlers/mcp"
import { LspHandler } from "./handlers/lsp"
import { FormatterHandler } from "./handlers/formatter"
import { SkillHandler } from "./handlers/skill"
import { BehaviorHandler } from "./handlers/behavior"
import { EventHandler } from "./handlers/event"
import { AgentHandler } from "./handlers/agent"
import { HealthHandler } from "./handlers/health"
import { InstallationHandler } from "./handlers/installation"
import { PtyHandler } from "./handlers/pty"
import { QuestionHandler } from "./handlers/question"
import { ReferenceHandler } from "./handlers/reference"
import { LocationHandler } from "./handlers/location"
import { IntegrationHandler } from "./handlers/integration"
import { CredentialHandler } from "./handlers/credential"
import { ProjectCopyHandler } from "./handlers/project-copy"
import { ProjectHandler } from "./handlers/project"
import { LeanHandler } from "./handlers/lean"
import { AtlasHandler } from "./handlers/atlas"
import { ConfigHandler } from "./handlers/config"
import { RelayDocumentHandler, RelayPublishHandler } from "./handlers/relay-document"
import { RelayHookHandler } from "./handlers/relay-hook"
import { RelayRunHandler } from "./handlers/relay-run"
import { GuardrailHandler } from "./handlers/guardrail"
import { MeetingHandler } from "./handlers/meeting"
import { PullRequestHandler } from "./handlers/pull-request"
import { ScheduleHandler } from "./handlers/schedule"
import { ResearchArtifactHandler } from "./handlers/research-artifact"
import { ActionsBindingHandler } from "./handlers/actions-binding"
import { ActionsOperationHandler } from "./handlers/actions-operation"
import { ActionsWorkflowHandler } from "./handlers/actions-workflow"
import { ActionsRunHandler } from "./handlers/actions-run"
import { ActionsJobHandler } from "./handlers/actions-job"
import { ActionsPipelineHandler } from "./handlers/actions-pipeline"
import { ActionsResourceHandler } from "./handlers/actions-resource"
import { ActionsSourceHandler } from "./handlers/actions-source"
import { ActionsTransferHandler } from "./handlers/actions-transfer"
import { CapabilityOperatorHandler } from "./handlers/capability-operator"
import { CapabilityConnectionsHandler } from "./handlers/capability-connections"
import { CapabilityArtifactsHandler, CapabilityContentHandler } from "./handlers/capability-artifacts"
import { CapabilitySchedulesHandler } from "./handlers/capability-schedules"

export const handlers = Layer.mergeAll(
  HealthHandler,
  InstallationHandler,
  LocationHandler,
  AgentHandler,
  SessionHandler,
  MessageHandler,
  ModelHandler,
  ProviderHandler,
  IntegrationHandler,
  CredentialHandler,
  PermissionHandler,
  FileSystemHandler,
  VcsHandler,
  CommandHandler,
  McpHandler,
  LspHandler,
  FormatterHandler,
  SkillHandler,
  BehaviorHandler,
  EventHandler,
  PtyHandler,
  QuestionHandler,
  ReferenceHandler,
  ProjectCopyHandler,
  ProjectHandler,
  LeanHandler,
  AtlasHandler,
  ConfigHandler,
  RelayDocumentHandler,
  RelayPublishHandler,
  RelayHookHandler,
  RelayRunHandler,
  PullRequestHandler,
  GuardrailHandler,
  MeetingHandler,
  ScheduleHandler,
  ResearchArtifactHandler,
  ActionsBindingHandler,
  ActionsOperationHandler,
  ActionsWorkflowHandler,
  ActionsRunHandler,
  ActionsJobHandler,
  ActionsPipelineHandler,
  ActionsResourceHandler,
  ActionsSourceHandler,
  ActionsTransferHandler,
  CapabilityOperatorHandler,
  CapabilityConnectionsHandler,
  CapabilityArtifactsHandler,
  CapabilitySchedulesHandler,
  CapabilityContentHandler,
)
