import { makeDefaultApi } from "@orchestra/protocol/api"
import { InvalidRequestError, SessionNotFoundError } from "@orchestra/protocol/errors"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

class LocationMiddleware extends HttpApiMiddleware.Service<LocationMiddleware>()(
  "@orchestra/client/LocationMiddleware",
) {}

class SessionLocationMiddleware extends HttpApiMiddleware.Service<SessionLocationMiddleware>()(
  "@orchestra/client/SessionLocationMiddleware",
  { error: [InvalidRequestError, SessionNotFoundError] },
) {}

export const ClientApi = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})

export const groupNames = {
  "server.health": "health",
  "server.location": "location",
  "server.agent": "agents",
  "server.session": "sessions",
  "server.research": "research",
  "server.message": "messages",
  "server.model": "models",
  "server.provider": "providers",
  "server.integration": "integrations",
  "server.credential": "credentials",
  "server.permission": "permissions",
  "server.fs": "files",
  "server.vcs": "vcs",
  "server.command": "commands",
  "server.mcp": "mcp",
  "server.skill": "skills",
  "server.behavior": "behaviors",
  "server.event": "events",
  "server.pty": "ptys",
  "server.question": "questions",
  "server.reference": "references",
  "server.projectCopy": "projectCopies",
  "server.project": "projects",
  "server.lean": "lean",
  "server.atlas": "atlas",
  "server.config": "config",
  "server.relay.document": "relayDocuments",
  "server.relay.publish": "relayPublish",
  "server.relay.hook": "relayHooks",
  "server.relay.run": "relayRuns",
  "server.pullRequest": "pullRequests",
  "server.schedule": "schedules",
  "server.actionsBinding": "actionsBindings",
  "server.actionsOperation": "actionsOperations",
  "server.actionsWorkflow": "actionsWorkflows",
  "server.actionsRun": "actionsRuns",
  "server.actionsJob": "actionsJobs",
  "server.actionsPipeline": "actionsPipelines",
  "server.actionsResource": "actionsResources",
  "server.actionsTransfer": "actionsTransfers",
  "server.actionsSource": "actionsSource",
} as const

export const endpointNames = {
  "agent.file.get": "getFile",
  "agent.file.update": "updateFile",
  "session.messages": "list",
  "integration.connect.key": "connectKey",
  "integration.connect.oauth": "connectOauth",
  "integration.oauth.status": "oauthStatus",
  "integration.oauth.complete": "oauthComplete",
  "integration.oauth.cancel": "oauthCancel",
  "integration.attempt.status": "attemptStatus",
  "integration.attempt.complete": "attemptComplete",
  "integration.attempt.cancel": "attemptCancel",
  "mcp.resource.catalog": "resources",
  "mcp.auth.start": "authStart",
  "mcp.auth.callback": "authCallback",
  "mcp.auth.remove": "authRemove",
  "permission.request.list": "listRequests",
  "permission.saved.list": "listSaved",
  "permission.saved.remove": "removeSaved",
  "question.request.list": "listRequests",
  "relay.document.export": "definition",
  "relay.scope.list": "listScopes",
  "relay.scope.create": "createScope",
  "relay.scope.update": "updateScope",
  "relay.scope.remove": "removeScope",
} as const

// Raw transfers use the handwritten streaming adapter; JSON metadata/admission stay generated.
export const omitEndpoints = new Set(["fs.read", "pty.connect", "pty.connectToken", "actions.transfer.read", "actions.transfer.upload"])
